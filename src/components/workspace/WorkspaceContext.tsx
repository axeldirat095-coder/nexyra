/**
 * WorkspaceContext — boots a WebContainer instance once per session and
 * exposes high-level FS / process / preview helpers to the rest of the
 * /dev2 surface (and, later, to the agent tools bridge).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WebContainer, type FileSystemTree, type WebContainerProcess } from "@webcontainer/api";
import { initialTemplate } from "./template-files";
import { registerWorkspaceHandle } from "./workspace-tools";
import {
  clearSnapshots,
  deleteCachedSnapshot,
  getCachedProject,
  getCachedSnapshot,
  hashJson,
  setCachedProject,
  setCachedSnapshot,
} from "./snapshot-cache";

type Status = "idle" | "booting" | "installing" | "starting" | "ready" | "error";

export type LogEntry = { id: string; kind: "info" | "out" | "err"; line: string };

type WorkspaceCtx = {
  status: Status;
  error: string | null;
  previewUrl: string | null;
  logs: LogEntry[];
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, contents: string) => Promise<void>;
  ls: (path: string) => Promise<string[]>;
  run: (cmd: string, args: string[]) => Promise<{ exit: number }>;
  reboot: () => Promise<void>;
  resetWorkspace: () => Promise<void>;
  exportFiles: () => Promise<Record<string, string>>;
};

const Ctx = createContext<WorkspaceCtx | null>(null);

// ---------------------------------------------------------------------------
// Module-level singleton + pre-boot.
// We start the WebContainer.boot() the moment this module is imported, so the
// ~5–10s cold start is overlapped with React rendering / chat hydration.
// ---------------------------------------------------------------------------
let singletonPromise: Promise<WebContainer> | null = null;
let currentPreviewUrl: string | null = null;
let currentDevProc: WebContainerProcess | null = null;
let currentWorkspaceBoot: Promise<void> | null = null;
let currentWorkspaceId = 0;
let projectSaveRevision = 0;
let activeUnsubscribers: Array<() => void> = [];
const ANSI_ESCAPE_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[a-zA-Z]`, "g");

const ACTIVE_PROJECT_KEY = "nexyra:dev2:active-project";
function getActiveProjectId(): string {
  if (typeof window === "undefined") return "default";
  return window.localStorage.getItem(ACTIVE_PROJECT_KEY) || "default";
}
function projectCacheKey() {
  return `elena-wc-project-v1:${getActiveProjectId()}`;
}
function chatStorageKey() {
  return `nexyra:elena-v2:chat:${getActiveProjectId()}`;
}

function bootInstance(): Promise<WebContainer> {
  if (!singletonPromise) {
    singletonPromise = WebContainer.boot({ coep: "credentialless" }).catch((e) => {
      // reset so a manual reboot can retry
      singletonPromise = null;
      throw e;
    });
  }
  return singletonPromise;
}

function resetRuntime() {
  activeUnsubscribers.forEach((unsubscribe) => unsubscribe());
  activeUnsubscribers = [];
  currentDevProc?.kill();
  currentDevProc = null;
  currentPreviewUrl = null;
  currentWorkspaceBoot = null;
  currentWorkspaceId += 1;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}

async function pathExists(wc: WebContainer, path: string): Promise<boolean> {
  try {
    const normalized = path.replace(/^\.\//, "").replace(/\/+$/, "");
    const parts = normalized.split("/").filter(Boolean);
    const name = parts.pop();
    const parent = parts.length ? parts.join("/") : ".";
    if (!name) return true;
    const entries = await wc.fs.readdir(parent);
    return entries.includes(name);
  } catch {
    return false;
  }
}

async function installDependencies(
  wc: WebContainer,
  streamProcess: (proc: WebContainerProcess, label: string) => Promise<void>,
) {
  const install = await wc.spawn("npm", [
    "install",
    "--prefer-offline",
    "--no-audit",
    "--no-fund",
    "--no-progress",
    "--loglevel=error",
  ]);
  await streamProcess(install, "npm install");
  const installExit = await install.exit;
  if (installExit !== 0) throw new Error(`npm install failed (exit ${installExit})`);
}

async function restoreNodeModulesCache(wc: WebContainer, cached: Uint8Array): Promise<boolean> {
  const probeDir = ".nexyra-node-modules-cache";
  await wc.fs.rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
  await wc.fs.rm("node_modules", { recursive: true, force: true }).catch(() => undefined);

  await withTimeout(wc.mount(cached, { mountPoint: probeDir }), 10_000, "node_modules cache");

  if (await pathExists(wc, `${probeDir}/node_modules/.bin/vite`)) {
    await wc.fs.rename(`${probeDir}/node_modules`, "node_modules");
    await wc.fs.rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
    return true;
  }

  if (await pathExists(wc, `${probeDir}/.bin/vite`)) {
    await wc.fs.rename(probeDir, "node_modules");
    return true;
  }

  await wc.fs.rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

async function writeWorkspaceFile(wc: WebContainer, path: string, contents: string) {
  const normalizedPath = path.replace(/^\.\//, "");
  if (!normalizedPath.startsWith("src/")) return false;
  const parentDir = normalizedPath.includes("/")
    ? normalizedPath.split("/").slice(0, -1).join("/")
    : "";
  if (parentDir) await wc.fs.mkdir(parentDir, { recursive: true });
  await wc.fs.writeFile(normalizedPath, contents);
  return true;
}

async function replayWorkspaceWritesFromChat(wc: WebContainer): Promise<number> {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(chatStorageKey());
  if (!raw) return 0;
  const messages = JSON.parse(raw) as unknown;
  if (!Array.isArray(messages)) return 0;
  let applied = 0;
  for (const message of messages) {
    const toolCalls = asRecord(message)?.toolCalls;
    if (!Array.isArray(toolCalls)) continue;
    for (const toolCall of toolCalls) {
      const tc = asRecord(toolCall);
      const args = asRecord(tc?.args);
      if (!tc || !args || tc.status !== "done") continue;
      const result = asRecord(tc.result);
      if (result?.ok === false) continue;
      if (
        tc.name === "write_file" &&
        typeof args.path === "string" &&
        typeof args.contents === "string"
      ) {
        if (await writeWorkspaceFile(wc, args.path, args.contents)) applied += 1;
      }
      if (
        tc.name === "edit_file" &&
        typeof args.path === "string" &&
        typeof args.search === "string" &&
        typeof args.replace === "string" &&
        args.path.replace(/^\.\//, "").startsWith("src/")
      ) {
        const current = await wc.fs.readFile(args.path, "utf-8").catch(() => "");
        const idx = current.indexOf(args.search);
        if (idx !== -1 && current.indexOf(args.search, idx + 1) === -1) {
          await writeWorkspaceFile(
            wc,
            args.path,
            current.slice(0, idx) + args.replace + current.slice(idx + args.search.length),
          );
          applied += 1;
        }
      }
    }
  }
  return applied;
}

async function persistProjectSnapshot(wc: WebContainer): Promise<boolean> {
  const revision = ++projectSaveRevision;
  const tree = await wc.export(".", { format: "json", excludes: ["node_modules", "dist"] });
  if (revision !== projectSaveRevision) return false;
  await setCachedProject(projectCacheKey(), tree);
  return true;
}
// Fire-and-forget pre-boot (only in browser, only when isolated).
if (typeof window !== "undefined" && window.crossOriginIsolated) {
  void bootInstance().catch(() => {
    /* surfaced later via boot() */
  });
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const wcRef = useRef<WebContainer | null>(null);
  const devProcRef = useRef<WebContainerProcess | null>(null);

  const pushLog = useCallback((kind: LogEntry["kind"], line: string) => {
    setLogs((prev) => {
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind,
        line,
      };
      const next = [...prev, entry];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, []);

  const urlFallbackRef = useRef<((url: string) => void) | null>(null);

  const streamProcess = useCallback(
    async (proc: WebContainerProcess, label: string) => {
      pushLog("info", `▶ ${label}`);
      proc.output.pipeTo(
        new WritableStream({
          write(chunk) {
            const text = String(chunk).replace(ANSI_ESCAPE_RE, "");
            text.split("\n").forEach((l) => {
              if (l.trim()) pushLog("out", l);
            });
            // Fallback: parse Vite "Local:" URL if port event was missed.
            const m = text.match(/https?:\/\/[a-z0-9.-]+\.webcontainer[^\s]*/i);
            if (m && urlFallbackRef.current) urlFallbackRef.current(m[0]);
          },
        }),
      );
    },
    [pushLog],
  );

  const boot = useCallback(
    async (template: FileSystemTree) => {
      try {
        if (currentPreviewUrl) {
          wcRef.current = await bootInstance();
          setPreviewUrl(currentPreviewUrl);
          setStatus("ready");
          return;
        }
        if (currentWorkspaceBoot) {
          setStatus("starting");
          pushLog("info", "↻ Workspace déjà en démarrage — reprise sans relancer Vite…");
          await currentWorkspaceBoot;
          wcRef.current = await bootInstance();
          if (currentPreviewUrl) {
            setPreviewUrl(currentPreviewUrl);
            setStatus("ready");
          }
          return;
        }

        const bootId = currentWorkspaceId;
        setStatus("booting");
        setError(null);
        setPreviewUrl(null);
        currentWorkspaceBoot = (async () => {
          pushLog("info", "🚀 Boot WebContainer…");
          const wc = await bootInstance();
          wcRef.current = wc;

          let urlSet = false;
          let resolvePreviewReady: (() => void) | null = null;
          const previewReady = new Promise<void>((resolve) => {
            resolvePreviewReady = resolve;
          });
          const setUrl = (url: string) => {
            if (urlSet || bootId !== currentWorkspaceId) return;
            urlSet = true;
            currentPreviewUrl = url;
            pushLog("info", `✅ Preview prête : ${url}`);
            setPreviewUrl(url);
            setStatus("ready");
            resolvePreviewReady?.();
          };
          urlFallbackRef.current = setUrl;
          activeUnsubscribers.push(wc.on("server-ready", (_port, url) => setUrl(url)));
          activeUnsubscribers.push(
            wc.on("port", (_port, type, url) => {
              if (type === "open" && url) setUrl(url);
            }),
          );
          activeUnsubscribers.push(
            wc.on("preview-message", (message) => {
              const m = message as { type?: string; message?: string; stack?: string };
              if (m.type?.startsWith("PREVIEW_")) {
                pushLog("err", `Preview: ${m.message ?? m.type}${m.stack ? ` — ${m.stack}` : ""}`);
              }
            }),
          );

          await wc.mount(template);
          // Restore ONLY src/ from cache. Root files (package.json, vite.config,
          // tsconfig, index.html) always come from the template to avoid
          // restoring a broken state that prevents Vite from starting.
          const savedProject = await getCachedProject(projectCacheKey());
          const savedSrc =
            savedProject && typeof savedProject === "object"
              ? (savedProject as Record<string, unknown>).src
              : null;
          if (savedSrc && typeof savedSrc === "object") {
            try {
              await wc.mount({ src: savedSrc } as FileSystemTree);
              pushLog("info", "📂 src/ restauré depuis le navigateur.");
            } catch (e) {
              pushLog(
                "err",
                `⚠️ Restore src échoué: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          } else {
            pushLog("info", "📦 Template monté.");
          }

          try {
            const replayed = await replayWorkspaceWritesFromChat(wc);
            if (replayed > 0) {
              pushLog(
                "info",
                `♻️ Projet reconstruit depuis l'historique Elena (${replayed} écriture${replayed > 1 ? "s" : ""}).`,
              );
              await persistProjectSnapshot(wc);
            }
          } catch (e) {
            pushLog(
              "err",
              `⚠️ Replay historique échoué: ${e instanceof Error ? e.message : String(e)}`,
            );
          }

          const pkgFile = template["package.json"] as
            | { file?: { contents: string | Uint8Array } }
            | undefined;
          const pkgContents = pkgFile?.file?.contents
            ? typeof pkgFile.file.contents === "string"
              ? pkgFile.file.contents
              : new TextDecoder().decode(pkgFile.file.contents)
            : "";
          const cacheKey = `wc-nm-v3-${hashJson(pkgContents)}`;
          const cached = await getCachedSnapshot(cacheKey);
          let usedNodeModulesCache = false;
          const persistNodeModulesCache = () => {
            void (async () => {
              try {
                pushLog("info", "💾 Snapshot node_modules → IndexedDB…");
                const snap = await wc.export("node_modules", { format: "binary" });
                await setCachedSnapshot(cacheKey, snap);
                pushLog(
                  "info",
                  `✅ Cache écrit (${(snap.byteLength / 1024 / 1024).toFixed(1)} MB).`,
                );
              } catch (e) {
                pushLog("err", `⚠️ Snapshot échoué: ${e instanceof Error ? e.message : String(e)}`);
              }
            })();
          };

          if (cached) {
            setStatus("installing");
            pushLog("info", "⚡ node_modules en cache — restauration…");
            try {
              if (await restoreNodeModulesCache(wc, cached)) {
                usedNodeModulesCache = true;
                pushLog("info", "✅ Cache restauré, skip npm install.");
              } else {
                pushLog("err", "⚠️ Cache incomplet (vite absent) — réparation des dépendances…");
                await deleteCachedSnapshot(cacheKey);
                await installDependencies(wc, streamProcess);
                persistNodeModulesCache();
              }
            } catch (e) {
              pushLog(
                "err",
                `⚠️ Cache node_modules inutilisable — réinstallation: ${e instanceof Error ? e.message : String(e)}`,
              );
              await deleteCachedSnapshot(cacheKey);
              await installDependencies(wc, streamProcess);
              persistNodeModulesCache();
            }
          } else {
            setStatus("installing");
            pushLog("info", "📥 npm install (premier lancement uniquement)…");
            await installDependencies(wc, streamProcess);
            persistNodeModulesCache();
          }

          setStatus("starting");
          if (!(await pathExists(wc, "node_modules/.bin/vite"))) {
            throw new Error(
              "Vite introuvable après installation. Réinitialise le cache puis réessaie.",
            );
          }
          pushLog("info", "⚡ npm run dev…");
          const dev = await wc.spawn("npm", ["run", "dev"]);
          devProcRef.current = dev;
          currentDevProc = dev;
          await streamProcess(dev, "vite dev");
          try {
            await Promise.race([
              previewReady,
              dev.exit.then((exit) => {
                if (!urlSet) throw new Error(`Vite s'est arrêté avant la preview (exit ${exit}).`);
              }),
              new Promise<void>((_, reject) =>
                window.setTimeout(
                  () =>
                    reject(
                      new Error("Démarrage Vite trop long — réparation automatique du cache."),
                    ),
                  90_000,
                ),
              ),
            ]);
          } catch (e) {
            if (!usedNodeModulesCache) throw e;
            pushLog("err", `⚠️ ${e instanceof Error ? e.message : String(e)}`);
            pushLog(
              "info",
              "🧹 Cache node_modules probablement corrompu — réinitialisation automatique…",
            );
            await deleteCachedSnapshot(cacheKey);
            dev.kill();
            currentDevProc = null;
            devProcRef.current = null;
            window.location.reload();
          }
        })();

        await currentWorkspaceBoot;
      } catch (e) {
        currentWorkspaceBoot = null;
        const msg = e instanceof Error ? e.message : String(e);
        pushLog("err", `❌ ${msg}`);
        setError(msg);
        setStatus("error");
      }
    },
    [pushLog, streamProcess],
  );

  // Initial boot (StrictMode-safe via singleton + ref guard)
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void boot(initialTemplate);
  }, [boot]);

  const readFile = useCallback(async (path: string) => {
    const wc = wcRef.current;
    if (!wc) throw new Error("Workspace not ready");
    return wc.fs.readFile(path, "utf-8");
  }, []);

  const writeFile = useCallback(
    async (path: string, contents: string) => {
      const wc = wcRef.current;
      if (!wc) throw new Error("Workspace not ready");
      const normalizedPath = path.replace(/^\.\//, "");
      const parentDir = normalizedPath.includes("/")
        ? normalizedPath.split("/").slice(0, -1).join("/")
        : "";
      if (parentDir) await wc.fs.mkdir(parentDir, { recursive: true });
      await wc.fs.writeFile(normalizedPath, contents);
      try {
        await persistProjectSnapshot(wc);
      } catch (e) {
        pushLog(
          "err",
          `⚠️ Sauvegarde projet échouée: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [pushLog],
  );

  const deleteFile = useCallback(
    async (path: string) => {
      const wc = wcRef.current;
      if (!wc) throw new Error("Workspace not ready");
      await wc.fs.rm(path.replace(/^\.\//, ""), { force: true });
      try {
        await persistProjectSnapshot(wc);
      } catch (e) {
        pushLog(
          "err",
          `⚠️ Sauvegarde projet échouée: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [pushLog],
  );

  const ls = useCallback(async (path: string) => {
    const wc = wcRef.current;
    if (!wc) throw new Error("Workspace not ready");
    return wc.fs.readdir(path);
  }, []);

  const lsDetailed = useCallback(async (path: string) => {
    const wc = wcRef.current;
    if (!wc) throw new Error("Workspace not ready");
    const entries = (await wc.fs.readdir(path, { withFileTypes: true })) as Array<{
      name: string;
      isFile: () => boolean;
      isDirectory: () => boolean;
    }>;
    return entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? ("dir" as const) : ("file" as const),
    }));
  }, []);

  const mkdir = useCallback(async (path: string) => {
    const wc = wcRef.current;
    if (!wc) throw new Error("Workspace not ready");
    await wc.fs.mkdir(path.replace(/^\.\//, ""), { recursive: true });
  }, []);

  const renameFile = useCallback(
    async (from: string, to: string) => {
      const wc = wcRef.current;
      if (!wc) throw new Error("Workspace not ready");
      const src = from.replace(/^\.\//, "");
      const dst = to.replace(/^\.\//, "");
      const contents = await wc.fs.readFile(src, "utf-8");
      const parentDir = dst.includes("/") ? dst.split("/").slice(0, -1).join("/") : "";
      if (parentDir) await wc.fs.mkdir(parentDir, { recursive: true });
      await wc.fs.writeFile(dst, contents);
      await wc.fs.rm(src, { force: true });
      try {
        await persistProjectSnapshot(wc);
      } catch (e) {
        pushLog("err", `⚠️ Sauvegarde projet échouée: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [pushLog],
  );

  const run = useCallback(
    async (cmd: string, args: string[]) => {
      const wc = wcRef.current;
      if (!wc) throw new Error("Workspace not ready");
      const proc = await wc.spawn(cmd, args);
      await streamProcess(proc, `${cmd} ${args.join(" ")}`);
      const exit = await proc.exit;
      return { exit };
    },
    [streamProcess],
  );

  const runCapture = useCallback(
    async (cmd: string, args: string[], maxBytes = 16_000) => {
      const wc = wcRef.current;
      if (!wc) throw new Error("Workspace not ready");
      const proc = await wc.spawn(cmd, args);
      let stdout = "";
      let truncated = false;
      pushLog("info", `▶ ${cmd} ${args.join(" ")}`);
      const writer = new WritableStream({
        write(chunk) {
          const text = String(chunk).replace(ANSI_ESCAPE_RE, "");
          text.split("\n").forEach((l) => {
            if (l.trim()) pushLog("out", l);
          });
          if (stdout.length < maxBytes) {
            stdout += text;
            if (stdout.length > maxBytes) {
              stdout = stdout.slice(0, maxBytes);
              truncated = true;
            }
          } else {
            truncated = true;
          }
        },
      });
      void proc.output.pipeTo(writer).catch(() => undefined);
      const exit = await proc.exit;
      return { exit, stdout, truncated };
    },
    [pushLog],
  );

  const reboot = useCallback(async () => {
    resetRuntime();
    devProcRef.current?.kill();
    devProcRef.current = null;
    setLogs([]);
    setPreviewUrl(null);
    await boot(initialTemplate);
  }, [boot]);

  const resetWorkspace = useCallback(async () => {
    pushLog("info", "🧹 Réinitialisation complète : effacement du cache…");
    await clearSnapshots();
    // Force a hard reload so the WebContainer singleton is fully recycled.
    if (typeof window !== "undefined") window.location.reload();
  }, [pushLog]);

  const exportFiles = useCallback(async (): Promise<Record<string, string>> => {
    const wc = wcRef.current;
    if (!wc) throw new Error("Workspace not ready");
    const tree = await wc.export(".", {
      format: "json",
      excludes: ["node_modules", "dist", ".cache"],
    });
    const out: Record<string, string> = {};
    const walk = (node: unknown, prefix: string) => {
      if (!node || typeof node !== "object") return;
      for (const [name, entry] of Object.entries(node as Record<string, unknown>)) {
        const path = prefix ? `${prefix}/${name}` : name;
        const e = entry as { file?: { contents?: unknown }; directory?: unknown };
        if (e.file && typeof e.file.contents === "string") {
          out[path] = e.file.contents;
        } else if (e.directory) {
          walk(e.directory, path);
        }
      }
    };
    walk(tree, "");
    return out;
  }, []);

  const logsRef = useRef<LogEntry[]>([]);
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    registerWorkspaceHandle({
      readFile,
      writeFile,
      deleteFile,
      ls,
      lsDetailed,
      mkdir,
      renameFile,
      run,
      runCapture,
      getLogs: () => logsRef.current,
    });
    return () => registerWorkspaceHandle(null);
  }, [readFile, writeFile, deleteFile, ls, lsDetailed, mkdir, renameFile, run, runCapture]);

  const value = useMemo<WorkspaceCtx>(
    () => ({
      status,
      error,
      previewUrl,
      logs,
      readFile,
      writeFile,
      ls,
      run,
      reboot,
      resetWorkspace,
      exportFiles,
    }),
    [
      status,
      error,
      previewUrl,
      logs,
      readFile,
      writeFile,
      ls,
      run,
      reboot,
      resetWorkspace,
      exportFiles,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
