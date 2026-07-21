/**
 * /dev3 — Sandbox E2B + Elena (chat agent).
 *
 * Layout 3 colonnes :
 *   [ Chat Elena ]  [ Éditeur App.tsx + logs ]  [ Preview Vite ]
 *
 * L'agent peut écrire/éditer n'importe quel fichier ; à chaque mutation on
 * recharge le panneau code (App.tsx) pour rester sync avec ce qu'Elena a fait.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Dev3Chat } from "@/components/dev3/Dev3Chat";
import { supabase } from "@/integrations/supabase/client";
import { registerPreviewFrame } from "@/components/workspace/preview-bridge";
import {
  e2bEnsure,
  e2bInstallStatus,
  e2bResetSandbox,
  e2bScaffoldVite,
  e2bStartViteDev,
  e2bWaitForPort,
  e2bWriteFile,
  e2bReadFile,
} from "@/lib/e2b.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dev3")({
  component: () => (
    <RequireAuth>
      <Dev3 />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Nexyra — Elena V3 (E2B sandbox)" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const PROJECT_ID = "dev3-poc";
const APP_TSX_PATH = "/home/user/app/src/App.tsx";
const AUTO_BOOT_RETRIES = 3;

const DEFAULT_APP_TSX = `export default function App() {
  return (
    <div style={{ fontFamily: "system-ui", padding: 40, background: "#0a0a0f", color: "#fff", minHeight: "100vh" }}>
      <h1 style={{ background: "linear-gradient(90deg,#3B82F6,#8B5CF6)", WebkitBackgroundClip: "text", color: "transparent" }}>
        Nexyra Sandbox — Vite + React
      </h1>
      <p>Demande à Elena de modifier ce projet — la preview se met à jour en HMR.</p>
    </div>
  );
}
`;

function Dev3() {
  const ensure = useServerFn(e2bEnsure);
  const scaffold = useServerFn(e2bScaffoldVite);
  const installStatus = useServerFn(e2bInstallStatus);
  const startDev = useServerFn(e2bStartViteDev);
  const waitForPort = useServerFn(e2bWaitForPort);
  const write = useServerFn(e2bWriteFile);
  const read = useServerFn(e2bReadFile);
  const resetSandbox = useServerFn(e2bResetSandbox);

  const [resetSignal, setResetSignal] = useState(0);

  const [status, setStatus] = useState<string>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string>(DEFAULT_APP_TSX);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const logsRef = useRef<HTMLPreElement>(null);

  function log(line: string) {
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`]);
  }

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    registerPreviewFrame(iframeRef.current);
    return () => registerPreviewFrame(null);
  }, [previewUrl, iframeKey]);

  const reloadAppTsx = useCallback(async () => {
    try {
      const r = await read({ data: { projectId: PROJECT_ID, path: APP_TSX_PATH } });
      if (typeof r.contents === "string") setCode(r.contents);
    } catch {
      // ignore
    }
  }, [read]);

  const bootedRef = useRef(false);

  async function waitForSessionToken() {
    for (let i = 0; i < 12; i += 1) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) return true;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    return false;
  }

  const boot = useCallback(async () => {
    setBusy(true);
    setReady(false);
    setPreviewUrl(null);
    setStatus("Création / reprise sandbox…");
    try {
      const hasSession = await waitForSessionToken();
      if (!hasSession) throw new Error("session pas encore prête");

      const ens = await ensure({ data: { projectId: PROJECT_ID } });
      log(`Sandbox prête (${ens.created ? "neuve" : "reprise"}) → ${ens.previewUrl}`);

      setStatus("Scaffold Vite + npm install (peut prendre 1-2 min au 1er boot)…");
      // Lance le scaffold ET un poll parallèle qui streame les logs d'install
      // dans le terminal pour qu'on voie ce qui se passe (au lieu d'attendre 2-5 min en aveugle).
      let lastLogLength = 0;
      let stopPolling = false;
      const pollLogs = async () => {
        while (!stopPolling) {
          await new Promise((r) => setTimeout(r, 1500));
          if (stopPolling) break;
          try {
            const st = await installStatus({ data: { projectId: PROJECT_ID } });
            if (st.logTail && st.logTail.length > lastLogLength) {
              const fresh = st.logTail.slice(lastLogLength).trim();
              if (fresh) {
                fresh.split("\n").forEach((ln) => log(`install › ${ln}`));
              }
              lastLogLength = st.logTail.length;
            }
            if (st.failed || st.done) break;
          } catch {
            // ignore polling errors
          }
        }
      };
      const pollPromise = pollLogs();

      const scaf = await scaffold({ data: { projectId: PROJECT_ID } });
      stopPolling = true;
      await pollPromise;

      if ("error" in scaf && scaf.error) {
        log(`Installation Vite interrompue : ${scaf.error}`);
        setStatus("Installation interrompue par la sandbox — relance dans quelques secondes");
        return false;
      }
      log(
        scaf.installed
          ? `npm install terminé en ${(scaf.durationMs / 1000).toFixed(1)}s`
          : `node_modules déjà présent (${(scaf.durationMs / 1000).toFixed(1)}s)`,
      );

      try {
        const r = await read({ data: { projectId: PROJECT_ID, path: APP_TSX_PATH } });
        if (r.contents) setCode(r.contents);
      } catch {
        // ignore
      }

      setStatus("Lancement vite dev…");
      await startDev({ data: { projectId: PROJECT_ID } });
      log("vite dev lancé en background");

      setStatus("Attente port 5173…");
      await waitForPort({ data: { projectId: PROJECT_ID, port: 5173 } });
      log("port 5173 ouvert — preview disponible");

      setPreviewUrl(ens.previewUrl);
      setReady(true);
      setStatus("Prêt — discute avec Elena ou édite App.tsx");
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`ERREUR : ${msg}`);
      setStatus(`Échec : ${msg}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [ensure, scaffold, installStatus, read, startDev, waitForPort]);

  // Auto-boot au montage de la page (plus besoin de cliquer), avec retry si la session arrive trop tôt.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void (async () => {
      for (let attempt = 1; attempt <= AUTO_BOOT_RETRIES; attempt += 1) {
        setStatus(
          attempt === 1
            ? "Auto-boot en cours…"
            : `Auto-boot : tentative ${attempt}/${AUTO_BOOT_RETRIES}…`,
        );
        const ok = await boot();
        if (ok) return;
        if (attempt < AUTO_BOOT_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
      setStatus("Auto-boot échoué — tu peux relancer avec Rebooter sandbox");
    })();
  }, [boot]);

  async function saveAppTsx() {
    setSaving(true);
    try {
      await write({
        data: { projectId: PROJECT_ID, path: APP_TSX_PATH, contents: code },
      });
      log("App.tsx sauvegardé → HMR");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`ERREUR save : ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  function onEditorKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      void saveAppTsx();
    }
  }

  // Quand Elena modifie un fichier : log + reload App.tsx + reload iframe (debounced).
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAgentMutation = useCallback(
    (path: string) => {
      log(`Elena → ${path}`);
      if (path.endsWith("/App.tsx") || path.endsWith("App.tsx")) {
        void reloadAppTsx();
      }
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => setIframeKey((k) => k + 1), 1500);
    },
    [reloadAppTsx],
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border p-4 flex items-center gap-4 flex-wrap">
        <h1 className="text-lg font-semibold">Elena V3 — Sandbox E2B</h1>
        <Button onClick={boot} disabled={busy} size="sm">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {busy ? "Boot en cours…" : ready ? "Rebooter sandbox" : "Boot Vite project"}
        </Button>
        <Button onClick={saveAppTsx} disabled={!ready || saving} size="sm" variant="secondary">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save (⌘S)
        </Button>
        {ready && (
          <Button
            onClick={() => setIframeKey((k) => k + 1)}
            size="sm"
            variant="ghost"
            title="Recharger la preview"
          >
            ↻ Reload preview
          </Button>
        )}
        <Button
          onClick={async () => {
            if (!confirm("Tout réinitialiser ?\n\n• Vide le chat Elena (localStorage + DB)\n• Efface tous les fichiers de la sandbox\n• Recrée un projet Vite vierge\n\nIrréversible.")) return;
            setBusy(true);
            setStatus("Reset complet en cours…");
            try {
              await resetSandbox({ data: { projectId: PROJECT_ID } });
              setResetSignal((n) => n + 1);
              setLogs([]);
              setCode(DEFAULT_APP_TSX);
              setPreviewUrl(null);
              setReady(false);
              toast.success("Sandbox + chat remis à zéro");
              await boot();
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              toast.error(`Reset échoué : ${msg}`);
              setStatus(`Reset échoué : ${msg}`);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          size="sm"
          variant="destructive"
          title="Vider le chat ET réinitialiser la sandbox"
        >
          🗑 Reset complet
        </Button>
        <span className="text-sm text-muted-foreground">{status}</span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr_1fr] gap-3 p-3 flex-1 min-h-0">
        {/* Chat Elena */}
        <section className="border border-border rounded-md bg-card min-h-[60vh] lg:min-h-0">
          <Dev3Chat projectId={PROJECT_ID} onFileMutated={onAgentMutation} resetSignal={resetSignal} />
        </section>

        {/* Éditeur + logs */}
        <section className="border border-border rounded-md bg-card flex flex-col min-h-[60vh] lg:min-h-0">
          <div className="px-3 py-2 text-xs font-medium border-b border-border text-muted-foreground flex items-center justify-between">
            <span>src/App.tsx</span>
            <span className="font-mono">{code.length} chars</span>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onEditorKey}
            disabled={!ready}
            spellCheck={false}
            className="flex-1 w-full bg-transparent text-foreground p-3 font-mono text-xs resize-none outline-none disabled:opacity-50"
          />
          <div className="border-t border-border bg-muted/30">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground">Logs</div>
            <pre
              ref={logsRef}
              className="text-xs whitespace-pre-wrap font-mono text-muted-foreground px-3 pb-3 max-h-40 overflow-auto"
            >
              {logs.length === 0 ? "(vide — clique sur Boot)" : logs.join("\n")}
            </pre>
          </div>
        </section>

        {/* Preview */}
        <section className="border border-border rounded-md bg-card flex flex-col min-h-[60vh] lg:min-h-0">
          <div className="p-2 text-xs text-muted-foreground border-b border-border truncate">
            {previewUrl ?? "(pas de preview)"}
          </div>
          {previewUrl ? (
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={previewUrl}
              title="E2B preview"
              className="flex-1 w-full bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
              Boot une sandbox pour voir la preview Vite + React
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
