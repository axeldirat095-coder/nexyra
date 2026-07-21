/**
 * E2B Sandbox Manager — Lot B (POC).
 *
 * Gère le cycle de vie d'une sandbox E2B par (owner_id, project_id) :
 *  - ensureSandbox() : connecte à une sandbox existante ou en crée une nouvelle
 *  - performWrite/Read/Run : opérations FS / process exécutées côté serveur
 *  - getPreviewUrl : URL publique du dev-server tournant DANS la sandbox
 *
 * Pourquoi côté serveur ? Pour que la "boucle agent" Elena survive à la
 * fermeture d'onglet, au refresh, et au changement d'appareil. Le client
 * appelle simplement des server functions ; toute l'exécution réelle vit ici.
 *
 * Limitation E2B Hobby : sandbox tuée après 1h d'activité. On stocke
 * `sandbox_id` en DB et on tente `Sandbox.connect(id)` ; si KO, on en
 * recrée une et on rejoue le snapshot fichiers (à venir, étape suivante).
 */
import { Sandbox, Template } from "e2b";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { NEXYRA_COPY_FILES } from "./nexyra-copy-template.server";

const SANDBOX_TEMPLATE = "base"; // template par défaut E2B (Ubuntu + node)
const LARGE_SANDBOX_TEMPLATE = process.env.E2B_LARGE_SANDBOX_TEMPLATE || "nexyra-large-node:v1";
const LARGE_TEMPLATE_KEY = "nexyra-large-node-v1";
const LARGE_SANDBOX_CPU_COUNT = Number(process.env.E2B_LARGE_SANDBOX_CPU_COUNT || "4");
const LARGE_SANDBOX_MEMORY_MB = Number(process.env.E2B_LARGE_SANDBOX_MEMORY_MB || "4096");
const LARGE_PROJECT_DEP_THRESHOLD = 70;
const LARGE_PROJECT_FILE_THRESHOLD = 300;
const DEV_PORT = 5173;
const AUTO_SNAPSHOT_LABEL = "Sauvegarde automatique";
const PUBLIC_SANDBOX_OPTS = {
  apiKey: "",
  timeoutMs: 60 * 60 * 1000,
  secure: false,
  network: { allowPublicTraffic: true },
  // Persistance entre sessions : au lieu d'être tuée au bout d'1h, la sandbox
  // est mise en PAUSE (filesystem complet + node_modules préservés). Le prochain
  // Sandbox.connect(id) la réveille en quelques secondes. Évite de re-télécharger
  // tout le projet + de re-faire `npm install` à chaque réouverture.
  lifecycle: { onTimeout: "pause" as const, autoResume: true },
} satisfies Record<string, unknown>;

type SandboxRecord = {
  sandbox_id: string;
  preview_url: string | null;
};

type SnapshotFile = { path: string; contents: string; encoding?: string };
type ImportedProjectProfile = {
  hasImportMarker: boolean;
  depsCount: number;
  fileCount: number;
  needsLargeSandbox: boolean;
};

type ProjectMetadata = { starter?: unknown } | null;

function appPath(path: string): string {
  const clean = path.trim();
  if (clean.startsWith("/")) return clean;
  return `${APP_DIR}/${clean.replace(/^\/+/, "")}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parentDir(path: string): string {
  const target = appPath(path);
  const idx = target.lastIndexOf("/");
  return idx > 0 ? target.slice(0, idx) : APP_DIR;
}

function toPreviewUrl(sbx: Sandbox, port: number): string {
  return `https://${sbx.getHost(port)}`;
}

function createSandboxOptions(apiKey: string, kind: "standard" | "large" = "standard") {
  return {
    ...PUBLIC_SANDBOX_OPTS,
    apiKey,
    metadata: { nexyra: "true", kind },
  };
}

async function getRecord(ownerId: string, projectId: string): Promise<SandboxRecord | null> {
  const { data } = await supabaseAdmin
    .from("e2b_sandboxes")
    .select("sandbox_id, preview_url")
    .eq("owner_id", ownerId)
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as SandboxRecord | null) ?? null;
}

async function upsertRecord(
  ownerId: string,
  projectId: string,
  sandboxId: string,
  previewUrl: string | null,
) {
  await (supabaseAdmin as any).from("e2b_sandboxes").upsert(
    {
      owner_id: ownerId,
      project_id: projectId,
      sandbox_id: sandboxId,
      preview_url: previewUrl,
      status: "running",
      last_active_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,project_id" },
  );
}

async function getLatestAutomaticSnapshot(
  ownerId: string,
  projectId: string,
): Promise<SnapshotFile[] | null> {
  const { data } = await (supabaseAdmin as any)
    .from("sandbox_snapshots")
    .select("files")
    .eq("owner_id", ownerId)
    .eq("project_key", projectId)
    .eq("label", AUTO_SNAPSHOT_LABEL)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const files = (data?.files ?? null) as SnapshotFile[] | null;
  return Array.isArray(files) ? files : null;
}

async function writeSnapshotFilesToSandbox(
  sandbox: Sandbox,
  files: SnapshotFile[],
): Promise<number> {
  let written = 0;
  for (const f of files) {
    const safe = f.path.replace(/^\/+/, "").replace(/\.\.+/g, "");
    if (!safe || typeof f.contents !== "string") continue;
    const dir = safe.includes("/") ? safe.split("/").slice(0, -1).join("/") : "";
    if (dir) {
      await sandbox.commands.run(`mkdir -p ${APP_DIR}/${dir}`, { timeoutMs: 10_000 });
    }
    if (f.encoding === "base64") {
      // Décode côté Worker puis écrit via l'API binaire E2B.
      // Passer du base64 sur la CLI shell casse au-delà de ~128 Ko (ARG_MAX).
      const binary = atob(f.contents);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      await sandbox.files.write(`${APP_DIR}/${safe}`, bytes as unknown as string);
    } else {
      await sandbox.files.write(
        `${APP_DIR}/${safe}`,
        safe.endsWith("/index.html") ? withPreviewBridgeHtml(f.contents) : f.contents,
      );
    }
    written++;
  }
  return written;
}

async function seedNexyraCopyIfRequested(
  sandbox: Sandbox,
  ownerId: string,
  projectId: string,
): Promise<boolean> {
  if (await sandboxFileExists(sandbox, "package.json")) return false;
  const { data } = await (supabaseAdmin as any)
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const metadata = (data?.metadata ?? null) as ProjectMetadata;
  if (metadata?.starter !== "nexyra_copy") return false;

  await sandbox.commands.run(`mkdir -p ${APP_DIR}`, { timeoutMs: 10_000 });
  for (const [rel, contents] of Object.entries(NEXYRA_COPY_FILES)) {
    const dir = rel.includes("/") ? rel.split("/").slice(0, -1).join("/") : "";
    if (dir) await sandbox.commands.run(`mkdir -p ${APP_DIR}/${dir}`, { timeoutMs: 10_000 });
    await sandbox.files.write(
      `${APP_DIR}/${rel}`,
      rel === "index.html" ? withPreviewBridgeHtml(contents) : contents,
    );
  }
  return true;
}

async function getImportedProjectProfile(sandbox: Sandbox, hasPackageJson = true): Promise<ImportedProjectProfile> {
  if (!hasPackageJson) {
    return { hasImportMarker: false, depsCount: 0, fileCount: 0, needsLargeSandbox: false };
  }
  const res = await sandbox.commands.run(
    `node - <<'NODE'
const fs = require('fs');
const path = require('path');
const app = ${JSON.stringify(APP_DIR)};
const pkgPath = path.join(app, 'package.json');
let depsCount = 0;
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  depsCount = ['dependencies','devDependencies','optionalDependencies','peerDependencies']
    .reduce((n, key) => n + Object.keys(pkg[key] || {}).length, 0);
}
const ignore = new Set(['node_modules', '.git', 'dist', '.next', '.cache']);
let fileCount = 0;
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (ignore.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else fileCount++;
  }
}
if (fs.existsSync(app)) walk(app);
const hasImportMarker = fs.existsSync(path.join(app, ${JSON.stringify(READ_ONLY_IMPORT_MARKER)}));
const needsLargeSandbox = hasImportMarker || depsCount >= ${LARGE_PROJECT_DEP_THRESHOLD} || fileCount >= ${LARGE_PROJECT_FILE_THRESHOLD};
console.log(JSON.stringify({ hasImportMarker, depsCount, fileCount, needsLargeSandbox }));
NODE`,
    { timeoutMs: 20_000 },
  );
  const raw = (res.stdout || "").trim().split("\n").pop() || "{}";
  return JSON.parse(raw) as ImportedProjectProfile;
}

async function ensureLargeSandboxTemplate(apiKey: string): Promise<boolean> {
  if (await Template.exists(LARGE_SANDBOX_TEMPLATE, { apiKey }).catch(() => false)) return true;
  const template = Template()
    .fromNodeImage("22")
    .aptInstall(["git", "curl", "zip", "unzip"])
    .runCmd("corepack enable || true")
    .runCmd("npm config set audit false && npm config set fund false && npm config set progress false")
    .makeDir(APP_DIR)
    .setWorkdir(APP_DIR)
    .setReadyCmd("node --version");
  await Template.buildInBackground(template, LARGE_SANDBOX_TEMPLATE, {
    apiKey,
    cpuCount: LARGE_SANDBOX_CPU_COUNT,
    memoryMB: LARGE_SANDBOX_MEMORY_MB,
  }).catch((err) => {
    console.warn("[e2b] large template build kickoff failed", err);
  });
  console.warn(
    `[e2b] large sandbox template not ready (${LARGE_SANDBOX_CPU_COUNT} CPU / ${LARGE_SANDBOX_MEMORY_MB} MB), building in background — using standard sandbox meanwhile`,
  );
  return false;
}

/**
 * Indicateur public exposé au front (badge "Sandbox XL prête / en construction").
 */
export async function isLargeSandboxReady(): Promise<{ ready: boolean; checkedAt: string }> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) return { ready: false, checkedAt: new Date().toISOString() };
  const ready = await Template.exists(LARGE_SANDBOX_TEMPLATE, { apiKey }).catch(() => false);
  return { ready, checkedAt: new Date().toISOString() };
}

async function createSandbox(apiKey: string, kind: "standard" | "large"): Promise<Sandbox> {
  if (kind === "large") {
    const ready = await ensureLargeSandboxTemplate(apiKey);
    if (ready) {
      return Sandbox.create(LARGE_SANDBOX_TEMPLATE, createSandboxOptions(apiKey, "large"));
    }
    // Fallback: template still building → keep the user on a standard sandbox so the preview keeps working.
    return Sandbox.create(SANDBOX_TEMPLATE, createSandboxOptions(apiKey, "standard"));
  }
  return Sandbox.create(SANDBOX_TEMPLATE, createSandboxOptions(apiKey, "standard"));
}

async function copyProjectToLargeSandbox(
  source: Sandbox,
  ownerId: string,
  projectId: string,
  apiKey: string,
): Promise<{ sandbox: Sandbox; previewUrl: string; created: boolean }> {
  const ready = await ensureLargeSandboxTemplate(apiKey);
  if (!ready) {
    // Template still building — keep the user on their current standard sandbox.
    const previewUrl = toPreviewUrl(source, DEV_PORT);
    await upsertRecord(ownerId, projectId, source.sandboxId, previewUrl);
    return { sandbox: source, previewUrl, created: false };
  }
  const archivePath = `/tmp/nexyra-large-migrate-${Date.now()}.zip`;
  await source.commands.run(
    `python3 - <<'PY'
import os, zipfile
root = ${JSON.stringify(APP_DIR)}
out = ${JSON.stringify(archivePath)}
exclude = {'node_modules', 'dist', '.next', '.cache'}
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in exclude]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            zf.write(full, os.path.relpath(full, root))
print(os.path.getsize(out))
PY`,
    { timeoutMs: 120_000 },
  );
  const bytes = (await source.files.read(archivePath, { format: "bytes" })) as Uint8Array;
  const target = await createSandbox(apiKey, "large");
  const previewUrl = toPreviewUrl(target, DEV_PORT);
  const targetArchive = `/tmp/nexyra-large-import-${Date.now()}.zip`;
  await target.commands.run(`rm -rf ${APP_DIR} && mkdir -p ${APP_DIR}`, { timeoutMs: 20_000 });
  await target.files.write(targetArchive, bytes as unknown as string);
  await target.commands.run(
    `python3 - <<'PY'
import zipfile
with zipfile.ZipFile(${JSON.stringify(targetArchive)}, 'r') as zf:
    zf.extractall(${JSON.stringify(APP_DIR)})
PY`,
    { timeoutMs: 120_000 },
  );
  await source.kill().catch(() => undefined);
  await upsertRecord(ownerId, projectId, target.sandboxId, previewUrl);
  console.log("[e2b] migrated project to large sandbox", { projectId, previewUrl, bytes: bytes.length });
  return { sandbox: target, previewUrl, created: true };
}

/** Connecte à la sandbox existante (si toujours vivante) ou en spawn une neuve. */
export async function ensureSandbox(
  ownerId: string,
  projectId: string,
): Promise<{ sandbox: Sandbox; previewUrl: string; created: boolean }> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) throw new Error("E2B_API_KEY not configured");

  const existing = await getRecord(ownerId, projectId);

  if (existing?.sandbox_id) {
    try {
      const sbx = await Sandbox.connect(existing.sandbox_id, createSandboxOptions(apiKey));
      if (sbx.trafficAccessToken) {
        console.warn("[e2b] sandbox traffic is restricted, recreating public sandbox", {
          id: existing.sandbox_id,
        });
        await sbx.kill().catch(() => undefined);
        throw new Error("restricted sandbox");
      }
      const hasPackageJson = await sandboxFileExists(sbx, "package.json").catch(() => false);
      const profile = await getImportedProjectProfile(sbx, hasPackageJson).catch(() => null);
      const info = await sbx.getInfo({ requestTimeoutMs: 10_000 }).catch(() => null);
      if (profile?.needsLargeSandbox && (info?.memoryMB ?? 0) < LARGE_SANDBOX_MEMORY_MB) {
        return copyProjectToLargeSandbox(sbx, ownerId, projectId, apiKey);
      }
      const previewUrl = toPreviewUrl(sbx, DEV_PORT);
      console.log("[e2b] reconnected", { id: existing.sandbox_id, previewUrl });
      await upsertRecord(ownerId, projectId, existing.sandbox_id, previewUrl);
      return { sandbox: sbx, previewUrl, created: false };
    } catch (err) {
      console.warn("[e2b] reconnect failed, creating new sandbox", err);
    }
  }

  const sbx = await createSandbox(apiKey, "standard");
  const previewUrl = toPreviewUrl(sbx, DEV_PORT);
  console.log("[e2b] created", { id: sbx.sandboxId, previewUrl });
  const latestSnapshot = await getLatestAutomaticSnapshot(ownerId, projectId);
  if (latestSnapshot?.length) {
    const written = await writeSnapshotFilesToSandbox(sbx, latestSnapshot);
    console.log("[e2b] restored latest automatic snapshot", { projectId, written });
  }
  await upsertRecord(ownerId, projectId, sbx.sandboxId, previewUrl);
  return { sandbox: sbx, previewUrl, created: true };
}

export async function writeFile(
  ownerId: string,
  projectId: string,
  path: string,
  contents: string,
): Promise<void> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  const target = appPath(path);
  await sandbox.commands.run(`mkdir -p ${shellQuote(parentDir(target))}`, { timeoutMs: 10_000 });
  await sandbox.files.write(
    target,
    target.endsWith("/index.html") ? withPreviewBridgeHtml(contents) : contents,
  );
}

/**
 * Écrit un fichier binaire (PNG, JPG, etc.) dans la sandbox.
 * À utiliser pour les assets générés (image_generate) — JAMAIS en base64 dans du .ts
 * (esbuild crash en EPIPE sur les gros modules).
 */
export async function writeFileBinary(
  ownerId: string,
  projectId: string,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  const target = appPath(path);
  await sandbox.commands.run(`mkdir -p ${shellQuote(parentDir(target))}`, { timeoutMs: 10_000 });
  await sandbox.files.write(target, bytes as unknown as string);
}

export async function readFile(ownerId: string, projectId: string, path: string): Promise<string> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  return sandbox.files.read(appPath(path));
}

export async function runCommand(
  ownerId: string,
  projectId: string,
  cmd: string,
  opts?: { background?: boolean; cwd?: string; timeoutMs?: number },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  if (isManualViteLifecycleCommand(cmd)) {
    return runManagedPreviewRestart(ownerId, projectId);
  }
  if (opts?.background) {
    // On attend au moins que le process soit bien créé ; sinon les erreurs de démarrage sont avalées.
    await sandbox.commands.run(cmd, { background: true, cwd: opts.cwd, timeoutMs: 30_000 });
    return { exitCode: 0, stdout: "[background started]", stderr: "" };
  }
  try {
    const res = await sandbox.commands.run(cmd, { cwd: opts?.cwd, timeoutMs: opts?.timeoutMs ?? 120_000 });
    return {
      exitCode: res.exitCode ?? 0,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
    };
  } catch (err) {
    return {
      exitCode: getCommandExitCode(err),
      stdout: getCommandStdout(err),
      stderr: getCommandStderr(err) || getCommandErrorText(err),
    };
  }
}

export async function waitForPortOpen(
  ownerId: string,
  projectId: string,
  port = DEV_PORT,
): Promise<{ ok: true; port: number; previewUrl: string }> {
  const { sandbox, previewUrl } = await ensureSandbox(ownerId, projectId);
  // 1) Port ouvert localement DANS la sandbox.
  let check: { exitCode?: number; stdout?: string; stderr?: string };
  try {
    check = await sandbox.commands.run(
      `python3 - <<'PY'
import socket, time, sys
port = ${port}
deadline = time.time() + 25
while time.time() < deadline:
    s = socket.socket()
    s.settimeout(1)
    try:
        s.connect(('127.0.0.1', port))
        s.close()
        sys.exit(0)
    except Exception:
        time.sleep(0.5)
sys.stderr.write(f'Port {port} ferme apres 25s')
sys.exit(1)
PY`,
      { timeoutMs: 30_000 },
    );
  } catch (e: any) {
    // e2b lève CommandExitError sur exit !=0 ; on convertit en message lisible
    const stderr = e?.stderr || e?.result?.stderr || "";
    const stdout = e?.stdout || e?.result?.stdout || "";
    throw new Error(
      stderr ||
        stdout ||
        `Le serveur de prévisualisation n'a pas démarré sur le port ${port} (timeout 25s). Réessaie dans quelques secondes.`,
    );
  }
  if ((check.exitCode ?? 1) !== 0) {
    throw new Error(check.stderr || check.stdout || `Port ${port} fermé`);
  }
  // 2) Passerelle publique E2B accessible depuis l'extérieur (ce qu'utilise l'iframe).
  //    Sans cette vérif, l'iframe charge avant que le proxy ait propagé et Chrome affiche
  //    "n'autorise pas la connexion".
  // Sandbox peut être en cours de réveil après pause (autoResume) → 502/503/504
  // sont attendus pendant quelques secondes. On laisse jusqu'à 60s.
  const deadline = Date.now() + 60_000;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const r = await fetch(previewUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
      // 502/503/504 = gateway E2B encore en train de propager → on retry.
      if (r.status < 500 || r.status === 501) {
        return { ok: true, port, previewUrl };
      }
      lastErr = `HTTP ${r.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((res) => setTimeout(res, 1_000));
  }
  throw new Error(
    `Passerelle E2B injoignable (${lastErr}). La sandbox met trop de temps à se réveiller — réessaie dans 10s ou redémarre la sandbox via le menu "…".`,
  );
}

export async function getPreviewUrl(ownerId: string, projectId: string): Promise<string> {
  const { previewUrl } = await ensureSandbox(ownerId, projectId);
  return previewUrl;
}

/**
 * Exporte le projet de la sandbox en archive ZIP (base64).
 * Exclut node_modules / .git / dist / .cache pour rester sous la limite raisonnable.
 */
export async function exportProjectZip(
  ownerId: string,
  projectId: string,
): Promise<{ filename: string; base64: string; bytes: number }> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  const archivePath = `/tmp/nexyra-${Date.now()}.zip`;
  const res = await sandbox.commands.run(
    `python3 - <<'PY'
import os, zipfile
root = "${APP_DIR}"
out = "${archivePath}"
EXCLUDE_DIRS = {"node_modules", ".git", "dist", ".cache", ".next"}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            arc = os.path.relpath(full, root)
            try:
                zf.write(full, arc)
            except Exception as e:
                print("skip", arc, e)
print("ok", os.path.getsize(out))
PY`,
    { timeoutMs: 120_000 },
  );
  if ((res.exitCode ?? 1) !== 0) {
    throw new Error(`export zip failed: ${res.stderr || res.stdout}`);
  }
  const bytes = (await sandbox.files.read(archivePath, { format: "bytes" })) as Uint8Array;
  await sandbox.commands.run(`rm -f ${archivePath}`, { timeoutMs: 5_000 }).catch(() => undefined);
  // Encode base64 sans dépendre de Buffer côté Worker.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const filename = `nexyra-${projectId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.zip`;
  return { filename, base64, bytes: bytes.length };
}

/**
 * Exporte un fichier ou dossier précis de la sandbox en ZIP binaire.
 * Sert à Elena pour fournir un vrai lien téléchargeable sans passer par GitHub.
 */
export async function exportSandboxPathZip(
  ownerId: string,
  projectId: string,
  sourcePath = ".",
  requestedFilename?: string,
): Promise<{ filename: string; bytes: Uint8Array; size: number; sourcePath: string }> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  const source = appPath(sourcePath || ".");
  const archivePath = `/tmp/nexyra-download-${Date.now()}.zip`;
  const res = await sandbox.commands.run(
    `python3 - <<'PY'
import os, zipfile, sys
root = ${JSON.stringify(APP_DIR)}
source = ${JSON.stringify(source)}
out = ${JSON.stringify(archivePath)}
EXCLUDE_DIRS = {"node_modules", ".git", "dist", ".cache", ".next"}
if not os.path.exists(source):
    print(f"source introuvable: {source}", file=sys.stderr)
    sys.exit(2)
if not os.path.realpath(source).startswith(os.path.realpath(root)):
    print("source hors projet refusée", file=sys.stderr)
    sys.exit(3)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    if os.path.isfile(source):
        zf.write(source, os.path.relpath(source, root))
    else:
        for dirpath, dirnames, filenames in os.walk(source):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                arc = os.path.relpath(full, root)
                try:
                    zf.write(full, arc)
                except Exception as e:
                    print("skip", arc, e)
print(os.path.getsize(out))
PY`,
    { timeoutMs: 180_000 },
  );
  if ((res.exitCode ?? 1) !== 0) {
    throw new Error(`export zip failed: ${res.stderr || res.stdout}`);
  }
  const bytes = (await sandbox.files.read(archivePath, { format: "bytes" })) as Uint8Array;
  await sandbox.commands.run(`rm -f ${archivePath}`, { timeoutMs: 5_000 }).catch(() => undefined);
  const baseName = requestedFilename?.trim() || sourcePath.split("/").filter(Boolean).pop() || "projet";
  const safeName = baseName.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "projet";
  const filename = /\.zip$/i.test(safeName) ? safeName : `${safeName}.zip`;
  return { filename, bytes, size: bytes.length, sourcePath: source };
}

async function dumpProjectFilesFromSandbox(
  sandbox: Sandbox,
): Promise<{ files: SnapshotFile[]; bytes: number }> {
  return runProjectDumpScript(sandbox);
}

async function runProjectDumpScript(
  sandbox: Sandbox,
): Promise<{ files: SnapshotFile[]; bytes: number }> {
  const dumpPath = `/tmp/nexyra-files-dump-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  try {
    const res = await sandbox.commands.run(
    `python3 - <<'PY'
import os, json, base64
root = "${APP_DIR}"
out_path = ${JSON.stringify(dumpPath)}
EXCLUDE = {"node_modules", ".git", "dist", ".cache", ".next"}
BIN_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".tiff", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".webm", ".ogg", ".pdf", ".zip", ".gz"}
out = []
total = 0
LIMIT = 12_000_000
MAX_TEXT = 500_000
MAX_BIN = 5_000_000
def write_dump(truncated=False):
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"truncated": truncated, "files": out, "bytes": total}, f, ensure_ascii=False)
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in EXCLUDE]
    for fn in filenames:
        full = os.path.join(dirpath, fn)
        try:
            sz = os.path.getsize(full)
        except OSError:
            continue
        ext = os.path.splitext(fn)[1].lower()
        if ext in BIN_EXT:
            if sz > MAX_BIN:
                continue
        else:
            if sz > MAX_TEXT:
                continue

        try:
            with open(full, "rb") as f:
                raw = f.read()
        except OSError:
            continue
        rel = os.path.relpath(full, root)
        ext = os.path.splitext(fn)[1].lower()
        is_binary = ext in BIN_EXT or raw.startswith(b"\\x89PNG") or raw.startswith(b"\\xff\\xd8") or raw.startswith(b"GIF")
        if is_binary:
            contents = base64.b64encode(raw).decode("ascii")
            enc = "base64"
        else:
            try:
                contents = raw.decode("utf-8")
                enc = "utf-8"
            except UnicodeDecodeError:
                contents = base64.b64encode(raw).decode("ascii")
                enc = "base64"
        total += len(rel) + len(contents)
        if total > LIMIT:
            write_dump(True)
            print(json.dumps({"truncated": True, "count": len(out), "bytes": total}))
            raise SystemExit(0)
        out.append({"path": rel, "contents": contents, "encoding": enc})
write_dump(False)
print(json.dumps({"truncated": False, "count": len(out), "bytes": total}))
PY`,
    { timeoutMs: 60_000 },
  );
    if ((res.exitCode ?? 1) !== 0) {
      throw new Error(`dumpProjectFiles: ${res.stderr || res.stdout || `exit ${res.exitCode}`}`);
    }
    const raw = await sandbox.files.read(dumpPath);
    const parsed = JSON.parse(raw) as { files: SnapshotFile[]; bytes: number };
    return { files: parsed.files, bytes: parsed.bytes };
  } catch (err) {
    throw new Error(`dumpProjectFiles: ${getCommandErrorText(err) || (err instanceof Error ? err.message : String(err))}`);
  } finally {
    await sandbox.commands.run(`rm -f ${shellQuote(dumpPath)}`, { timeoutMs: 5_000 }).catch(() => undefined);
  }
}

async function saveAutomaticSnapshot(sandbox: Sandbox, ownerId: string, projectId: string) {
  const { files, bytes } = await dumpProjectFilesFromSandbox(sandbox);
  if (files.length === 0) return;
  const { data: inserted, error } = await (supabaseAdmin as any)
    .from("sandbox_snapshots")
    .insert({
      owner_id: ownerId,
      project_key: projectId,
      label: AUTO_SNAPSHOT_LABEL,
      files,
      file_count: files.length,
      size_bytes: bytes,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await (supabaseAdmin as any)
    .from("sandbox_snapshots")
    .delete()
    .eq("owner_id", ownerId)
    .eq("project_key", projectId)
    .eq("label", AUTO_SNAPSHOT_LABEL)
    .neq("id", inserted.id);
}

/**
 * Lit l'intégralité du projet (fichiers texte + binaires, hors node_modules)
 * et retourne `{ path, contents, encoding? }[]`. Utilisé pour Save manuel et déploiement Vercel.
 * Écrit le gros JSON dans un fichier temporaire pour éviter les limites stdout E2B.
 */
export async function dumpProjectFiles(
  ownerId: string,
  projectId: string,
): Promise<{ files: { path: string; contents: string; encoding?: string }[]; bytes: number }> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  return runProjectDumpScript(sandbox);
}

/** Réécrit en bloc un set de fichiers dans la sandbox (utilisé pour restore). */
export async function restoreProjectFiles(
  ownerId: string,
  projectId: string,
  files: { path: string; contents: string }[],
): Promise<{ written: number }> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  let written = 0;
  for (const f of files) {
    const safe = f.path.replace(/^\/+/, "").replace(/\.\.+/g, "");
    await sandbox.files.write(`${APP_DIR}/${safe}`, f.contents);
    written++;
  }
  return { written };
}

/** Tue la sandbox courante et supprime l'enregistrement DB → la prochaine boot recrée tout from scratch. */
export async function resetSandbox(ownerId: string, projectId: string): Promise<{ ok: true }> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) throw new Error("E2B_API_KEY not configured");
  const existing = await getRecord(ownerId, projectId);
  if (existing?.sandbox_id) {
    try {
      const sbx = await Sandbox.connect(existing.sandbox_id, createSandboxOptions(apiKey));
      await sbx.kill().catch(() => undefined);
    } catch {
      /* sandbox déjà morte, on ignore */
    }
  }
  await (supabaseAdmin as any)
    .from("e2b_sandboxes")
    .delete()
    .eq("owner_id", ownerId)
    .eq("project_id", projectId);
  await (supabaseAdmin as any)
    .from("sandbox_snapshots")
    .delete()
    .eq("owner_id", ownerId)
    .eq("project_key", projectId)
    .eq("label", AUTO_SNAPSHOT_LABEL);
  return { ok: true };
}

/**
 * Liste l'arborescence de l'app (relatif à /home/user/app, sans node_modules / .git / dist).
 */
export async function listFiles(
  ownerId: string,
  projectId: string,
  subPath = "",
): Promise<{ files: string[]; root: string }> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  const root = subPath ? `${APP_DIR}/${subPath.replace(/^\/+/, "")}` : APP_DIR;
  const res = await sandbox.commands.run(
    `find ${root} -type f \\( -path '*/node_modules' -o -path '*/.git' -o -path '*/dist' -o -path '*/.next' \\) -prune -o -type f -print | grep -v '/node_modules/' | grep -v '/\\.git/' | grep -v '/dist/' | head -500`,
    { timeoutMs: 10_000 },
  );
  const files = (res.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((p) => p.replace(`${APP_DIR}/`, ""));
  return { files, root: APP_DIR };
}

/**
 * Édition chirurgicale par search-replace. `search` doit être unique dans le fichier.
 */
export async function editFile(
  ownerId: string,
  projectId: string,
  path: string,
  search: string,
  replace: string,
): Promise<{ ok: true; path: string; bytes: number }> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  const current = await sandbox.files.read(path);
  const occurrences = current.split(search).length - 1;
  if (occurrences === 0) {
    throw new Error(`edit_file: search introuvable dans ${path}`);
  }
  if (occurrences > 1) {
    throw new Error(`edit_file: search présent ${occurrences}× dans ${path} (doit être unique)`);
  }
  const next = current.replace(search, replace);
  const contents = path.endsWith("/index.html") ? withPreviewBridgeHtml(next) : next;
  await sandbox.files.write(path, contents);
  return { ok: true, path, bytes: contents.length };
}

/** Sauvegarde automatique appelée une fois en fin de tour Elena, pas après chaque fichier. */
export async function saveCurrentProjectSnapshot(
  ownerId: string,
  projectId: string,
): Promise<void> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  await saveAutomaticSnapshot(sandbox, ownerId, projectId);
}

// ---------- Vite project scaffolding ----------

const APP_DIR = "/home/user/app";
const READ_ONLY_IMPORT_MARKER = ".nexyra-readonly-import";
const VITE_FILES: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "nexyra-sandbox-app",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite --host 0.0.0.0 --port 5173",
        build: "vite build",
        preview: "vite preview --host 0.0.0.0 --port 5173",
      },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "react-router-dom": "^6.28.0",
        "lucide-react": "^0.468.0",
        clsx: "^2.1.1",
      },
      devDependencies: {
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        "@vitejs/plugin-react": "^4.3.4",
        typescript: "^5.6.3",
        vite: "^5.4.11",
        tailwindcss: "^3.4.14",
        postcss: "^8.4.49",
        autoprefixer: "^10.4.20",
      },
    },
    null,
    2,
  ),
  "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: { clientPort: 443, protocol: "wss" },
    allowedHosts: true,
  },
});
`,
  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
        baseUrl: ".",
        paths: { "@/*": ["src/*"] },
      },
      include: ["src"],
    },
    null,
    2,
  ),
  "index.html": `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nexyra Sandbox</title>
  </head>
  <body>
    <div id="root"></div>
    <script>
      // Nexyra — remplace les dialogues natifs (alert/confirm/prompt) par un
      // overlay DOM non-bloquant. Sinon ils gèlent l'iframe (postMessage KO,
      // screenshot impossible) et sortent du cadre capturable.
      (function () {
        function showDialog(message, opts) {
          return new Promise(function (resolve) {
            var wrap = document.createElement("div");
            wrap.setAttribute("data-nexyra-dialog", "");
            wrap.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);font-family:system-ui,sans-serif";
            var card = document.createElement("div");
            card.style.cssText = "max-width:420px;width:90%;background:#13131a;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.5)";
            var msg = document.createElement("div");
            msg.style.cssText = "font-size:14px;line-height:1.5;margin-bottom:16px;white-space:pre-wrap";
            msg.textContent = String(message == null ? "" : message);
            card.appendChild(msg);
            var input = null;
            if (opts.kind === "prompt") {
              input = document.createElement("input");
              input.value = opts.defaultValue || "";
              input.style.cssText = "width:100%;padding:8px 10px;background:#0a0a0f;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;margin-bottom:14px;font-size:13px";
              card.appendChild(input);
            }
            var row = document.createElement("div");
            row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
            function btn(label, primary, onClick) {
              var b = document.createElement("button");
              b.textContent = label;
              b.style.cssText = "padding:7px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.12);font-size:13px;cursor:pointer;" + (primary ? "background:linear-gradient(90deg,#3B82F6,#8B5CF6);color:#fff;border:none" : "background:transparent;color:#fff");
              b.onclick = onClick;
              return b;
            }
            function close(value) { wrap.remove(); resolve(value); }
            if (opts.kind !== "alert") {
              row.appendChild(btn("Annuler", false, function () { close(opts.kind === "confirm" ? false : null); }));
            }
            row.appendChild(btn("OK", true, function () { close(opts.kind === "prompt" ? (input ? input.value : "") : opts.kind === "confirm" ? true : undefined); }));
            card.appendChild(row);
            wrap.appendChild(card);
            document.body.appendChild(wrap);
            if (input) input.focus();
          });
        }
        window.alert = function (m) { showDialog(m, { kind: "alert" }); };
        window.confirm = function (m) { showDialog(m, { kind: "confirm" }); return true; };
        window.prompt = function (m, d) { showDialog(m, { kind: "prompt", defaultValue: d }); return ""; };
      })();
    </script>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  "src/main.tsx": `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  "src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;
  --card: 240 10% 6%;
  --card-foreground: 0 0% 98%;
  --popover: 240 10% 6%;
  --popover-foreground: 0 0% 98%;
  --primary: 217 91% 60%;
  --primary-foreground: 0 0% 100%;
  --secondary: 240 4% 16%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 4% 16%;
  --muted-foreground: 240 5% 65%;
  --accent: 263 70% 65%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 4% 20%;
  --input: 240 4% 20%;
  --ring: 217 91% 60%;
  --radius: 0.75rem;
}

html, body, #root {
  min-height: 100vh;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
`,
  "tailwind.config.js": `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        brand: {
          blue: "#3B82F6",
          violet: "#8B5CF6",
          bg: "#0a0a0f",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(90deg,#3B82F6,#8B5CF6)",
      },
    },
  },
  plugins: [],
};
`,
  "postcss.config.js": `export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
`,
  "src/App.tsx": `export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center p-10">
      <div className="max-w-2xl text-center space-y-4">
        <h1 className="text-5xl font-bold bg-gradient-brand bg-clip-text text-transparent">
          Nexyra Sandbox
        </h1>
        <p className="text-white/70">
          Vite + React + Tailwind prêts. Demande à Elena de construire ton projet — la preview se met à jour en HMR.
        </p>
      </div>
    </div>
  );
}
`,
};

const PREVIEW_CAPTURE_BRIDGE_SCRIPT = `<script id="nexyra-preview-bridge">
(function () {
  if (window.__nexyraPreviewBridgeInstalled) return;
  window.__nexyraPreviewBridgeInstalled = true;
  window.__nexyraConsoleErrors = [];
  var originalError = console.error;
  console.error = function () {
    try { window.__nexyraConsoleErrors.push(Array.from(arguments).map(String).join(' ').slice(0, 500)); } catch (_) {}
    return originalError.apply(console, arguments);
  };
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }
  function snapshot() {
    var body = document.body || document.documentElement;
    var root = document.documentElement;
    var style = getComputedStyle(body);
    var tags = ['img', 'svg', 'button', 'a', 'section', 'header', 'main', 'footer', 'input'];
    var counts = {};
    tags.forEach(function (tag) { counts[tag] = document.querySelectorAll(tag).length; });
    var outline = Array.from(document.querySelectorAll('h1,h2,h3,p,button,a,section,article,img')).slice(0, 90).map(function (el) {
      return { tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute('alt') || '').trim().slice(0, 160), className: String(el.getAttribute('class') || '').slice(0, 220), rect: rectOf(el) };
    });
    return {
      url: location.href,
      title: document.title,
      viewport: { w: innerWidth, h: innerHeight, scrollW: root.scrollWidth, scrollH: root.scrollHeight, hasOverflowX: root.scrollWidth > innerWidth + 2 },
      style: { background: style.backgroundColor, color: style.color, fontFamily: style.fontFamily },
      counts: counts,
      outline: outline,
      bodyText: (body.innerText || '').slice(0, 4000),
      consoleErrors: window.__nexyraConsoleErrors.slice(-20),
      renderedAt: Date.now()
    };
  }
  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = function () { resolve(window.html2canvas); };
      s.onerror = function () { reject(new Error('html2canvas indisponible')); };
      document.head.appendChild(s);
    });
  }
  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (d.type === 'NEXYRA_PIXEL_CAPTURE') {
      try { ev.source && ev.source.postMessage({ type: 'NEXYRA_PIXEL_RESULT', id: d.id, ok: true, snapshot: snapshot() }, '*'); }
      catch (e) { ev.source && ev.source.postMessage({ type: 'NEXYRA_PIXEL_RESULT', id: d.id, ok: false, error: String(e && e.message || e) }, '*'); }
    }
    if (d.type === 'NEXYRA_PIXEL_SCREENSHOT') {
      loadHtml2Canvas().then(function (html2canvas) {
        return html2canvas(document.body, { backgroundColor: null, useCORS: true, allowTaint: false, logging: false, windowWidth: document.documentElement.scrollWidth, windowHeight: document.documentElement.scrollHeight });
      }).then(function (canvas) {
        var maxWidth = Number(d.maxWidth || 1024);
        var out = canvas;
        if (canvas.width > maxWidth) {
          out = document.createElement('canvas');
          out.width = maxWidth;
          out.height = Math.round(canvas.height * (maxWidth / canvas.width));
          out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
        }
        ev.source && ev.source.postMessage({ type: 'NEXYRA_PIXEL_SCREENSHOT_RESULT', id: d.id, ok: true, screenshot: { dataUrl: out.toDataURL('image/jpeg', 0.82), width: out.width, height: out.height }, snapshot: snapshot() }, '*');
      }).catch(function (e) {
        ev.source && ev.source.postMessage({ type: 'NEXYRA_PIXEL_SCREENSHOT_RESULT', id: d.id, ok: false, error: String(e && e.message || e) }, '*');
      });
    }
  });
})();
</script>`;

function withPreviewBridgeHtml(html: string): string {
  if (html.includes("nexyra-preview-bridge")) return html;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${PREVIEW_CAPTURE_BRIDGE_SCRIPT}\n  </body>`);
  }
  return `${html}\n${PREVIEW_CAPTURE_BRIDGE_SCRIPT}\n`;
}

const PRESERVED_SOURCE_FILES = new Set(Object.keys(VITE_FILES));

async function hasViteBinary(sandbox: Sandbox): Promise<boolean> {
  const check = await sandbox.commands.run(
    `test -x ${APP_DIR}/node_modules/.bin/vite && echo ready || echo missing`,
    { timeoutMs: 10_000 },
  );
  return (check.stdout ?? "").includes("ready");
}

function getCommandErrorText(error: unknown): string {
  const err = error as {
    message?: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    result?: { exitCode?: number; stdout?: string; stderr?: string };
  };
  return [err?.message, err?.stderr, err?.stdout, err?.result?.stderr, err?.result?.stdout]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200);
}

function getCommandExitCode(error: unknown): number {
  const err = error as { exitCode?: number; result?: { exitCode?: number } };
  return err?.exitCode ?? err?.result?.exitCode ?? 1;
}

function getCommandStdout(error: unknown): string {
  const err = error as { stdout?: string; result?: { stdout?: string } };
  return err?.stdout ?? err?.result?.stdout ?? "";
}

function getCommandStderr(error: unknown): string {
  const err = error as { stderr?: string; result?: { stderr?: string } };
  return err?.stderr ?? err?.result?.stderr ?? "";
}

function isManualViteLifecycleCommand(cmd: string): boolean {
  const normalized = cmd.toLowerCase();
  const touchesViteProcess = /pkill\s+.*vite|kill\s+.*vite|kill\s+"?\$\(cat\s+\/tmp\/vite\.pid\)/.test(normalized);
  const startsDevServer = /(?:^|[;&|]\s*)(?:npm\s+run\s+dev|npx\s+vite|\.\/node_modules\/\.bin\/vite|vite(?:\s|$))/.test(normalized);
  return touchesViteProcess || startsDevServer;
}

async function runManagedPreviewRestart(
  ownerId: string,
  projectId: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    await startViteDev(ownerId, projectId);
    const port = await waitForPortOpen(ownerId, projectId, DEV_PORT);
    return {
      exitCode: 0,
      stdout: `Commande remplacée par le redémarrage sécurisé Nexyra. Preview prête sur ${port.previewUrl}`,
      stderr: "",
    };
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Redémarrage sécurisé de la preview échoué : ${getCommandErrorText(err)}`,
    };
  }
}

function isKilledCommand(error: unknown): boolean {
  return /signal:\s*killed|sigkill|\bkilled\b/i.test(getCommandErrorText(error));
}

const INSTALL_TIMEOUT_MS = 10 * 60_000;
const INSTALL_LOG_FILE = "/tmp/nexyra-install.log";
const INSTALL_PID_FILE = "/tmp/nexyra-install.pid";
const INSTALL_DONE_FILE = "/tmp/nexyra-install.done";
const INSTALL_FAILED_FILE = "/tmp/nexyra-install.failed";
const INSTALL_RETRY_FILE = "/tmp/nexyra-install.retry";
const INSTALL_STRATEGY_ID = "v6-throttled-large-project-install";
const INSTALL_MAX_RETRIES = 2;

/**
 * Détecte si l'échec d'install est "transitoire" (réseau, timeout, registry
 * temporairement KO) ou "dur" (conflit de peer deps, paquet inexistant).
 * Seuls les transitoires méritent un retry automatique.
 */
function isTransientInstallError(logTail: string): boolean {
  if (!logTail) return false;
  const transientPatterns = [
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ENETUNREACH/i,
    /EAI_AGAIN/i,
    /socket hang up/i,
    /premature close/i,
    /network.{0,20}(timeout|unreachable|error)/i,
    /fetch failed/i,
    /registry\.npmjs\.org.{0,40}(failed|timeout|503|502|504|429)/i,
    /HTTP.{0,5}(502|503|504|429)/i,
    /reset by peer/i,
    /TLS connection/i,
  ];
  return transientPatterns.some((rx) => rx.test(logTail));
}

async function getInstallRetryCount(sandbox: Sandbox): Promise<number> {
  const r = await sandbox.commands.run(`cat ${INSTALL_RETRY_FILE} 2>/dev/null || echo 0`, {
    timeoutMs: 5_000,
  });
  const n = parseInt((r.stdout ?? "0").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

async function incrementInstallRetry(sandbox: Sandbox): Promise<number> {
  const n = (await getInstallRetryCount(sandbox)) + 1;
  await sandbox.commands.run(`echo ${n} > ${INSTALL_RETRY_FILE}`, { timeoutMs: 5_000 });
  return n;
}

async function sandboxFileExists(sandbox: Sandbox, relPath: string): Promise<boolean> {
  const res = await sandbox.commands.run(
    `test -f ${shellQuote(`${APP_DIR}/${relPath}`)} && echo yes || echo no`,
    { timeoutMs: 10_000 },
  );
  return (res.stdout ?? "").includes("yes");
}

async function getReadOnlyImportDepsCount(sandbox: Sandbox, hasPackageJson: boolean): Promise<number | null> {
  void sandbox;
  if (!hasPackageJson) return null;
  // Ancien garde-fou : basculait les gros imports en “lecture/exploration”.
  // Nouveau chantier : on migre ces projets vers une sandbox renforcée au lieu de bloquer.
  return null;
}

async function sandboxCommandExists(sandbox: Sandbox, command: string): Promise<boolean> {
  const res = await sandbox.commands.run(`command -v ${command} >/dev/null 2>&1 && echo yes || echo no`, {
    timeoutMs: 10_000,
  });
  return (res.stdout ?? "").includes("yes");
}

async function cleanInstallArtifacts(sandbox: Sandbox): Promise<void> {
  await sandbox.commands
    .run(`rm -rf ${APP_DIR}/node_modules ${APP_DIR}/package-lock.json ${APP_DIR}/npm-shrinkwrap.json ${APP_DIR}/.npmrc`, { timeoutMs: 30_000 })
    .catch(() => undefined);
}

async function repairPackageManifest(sandbox: Sandbox): Promise<string> {
  const scriptPath = "/home/user/nexyra-repair-package.mjs";
  await sandbox.files.write(
    scriptPath,
    `import fs from "node:fs";
import path from "node:path";

const appDir = ${JSON.stringify(APP_DIR)};
const semverLike = /^(\\d+)\\.(\\d+)\\.(\\d+)(?:[-+][0-9A-Za-z-.]+)?$/;
const dependencyGroups = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const packagePath = path.join(appDir, "package.json");
const changed = [];

function validVersion(value) {
  return typeof value === "string" && semverLike.test(value.trim());
}

function repairDependencyGroup(pkg, group) {
  if (!pkg[group] || typeof pkg[group] !== "object" || Array.isArray(pkg[group])) return;
  for (const [name, value] of Object.entries(pkg[group])) {
    if (typeof value !== "string" || value.trim() === "") {
      pkg[group][name] = "*";
      changed.push(group + "." + name + " -> *");
    }
  }
}

if (!fs.existsSync(packagePath)) process.exit(0);
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (!pkg.name || typeof pkg.name !== "string") {
  pkg.name = "nexyra-imported-app";
  changed.push("name -> nexyra-imported-app");
}
if ("version" in pkg && !validVersion(pkg.version)) {
  pkg.version = "0.0.0";
  changed.push("version -> 0.0.0");
}
for (const group of dependencyGroups) repairDependencyGroup(pkg, group);
if (Object.prototype.hasOwnProperty.call(pkg, "packageManager") && (pkg.packageManager === "" || pkg.packageManager == null)) {
  delete pkg.packageManager;
  changed.push("packageManager supprimé");
}

if (changed.length) {
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\\n");
}

for (const lockName of ["package-lock.json", "npm-shrinkwrap.json"]) {
  const lockPath = path.join(appDir, lockName);
  if (!fs.existsSync(lockPath)) continue;
  fs.rmSync(lockPath, { force: true });
  changed.push(lockName + " supprimé pour installation propre");
}

console.log(changed.length ? changed.join("\\n") : "package.json OK");
`,
  );
  const res = await sandbox.commands.run(`node ${scriptPath}`, { cwd: APP_DIR, timeoutMs: 10_000 });
  return `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
}

async function getInstallState(
  sandbox: Sandbox,
): Promise<{ running: boolean; done: boolean; failed: boolean; failedStrategy: string; logTail: string }> {
  const state = await sandbox.commands.run(
    `bash -lc ${shellQuote(`status=""
test -f ${INSTALL_DONE_FILE} && status="$status done"
test -f ${INSTALL_FAILED_FILE} && status="$status failed"
if test -f ${INSTALL_PID_FILE} && kill -0 "$(cat ${INSTALL_PID_FILE})" 2>/dev/null; then status="$status running"; fi
echo "__status:$status"
echo "__failed_strategy:$(cat ${INSTALL_FAILED_FILE} 2>/dev/null || true)"
tail -n 80 ${INSTALL_LOG_FILE} 2>/dev/null || true`)}`,
    { timeoutMs: 10_000 },
  );
  const [statusLine = "", strategyLine = "", ...tail] = (state.stdout ?? "").split("\n");
  return {
    running: /running/.test(statusLine),
    done: /done/.test(statusLine),
    failed: /failed/.test(statusLine),
    failedStrategy: strategyLine.replace(/^__failed_strategy:/, "").trim(),
    logTail: tail.join("\n").trim().slice(-2000),
  };
}

async function startInstallInBackground(sandbox: Sandbox, commands: string[]): Promise<void> {
  const attempts = commands
    .map(
      (command) => `echo "$ ${command.replace(/"/g, "\\\"")}" >> ${INSTALL_LOG_FILE}
${command} >> ${INSTALL_LOG_FILE} 2>&1
code=$?
if [ "$code" -eq 0 ]; then
  touch ${INSTALL_DONE_FILE}
  echo "Installation terminée." >> ${INSTALL_LOG_FILE}
  exit 0
fi
echo "Commande échouée (code $code). Nettoyage avant nouvel essai..." >> ${INSTALL_LOG_FILE}
rm -rf node_modules .npmrc`,
    )
    .join("\n");

  const workerScript = `export npm_config_audit=false
export npm_config_fund=false
export npm_config_loglevel=error
export npm_config_update_notifier=false
export npm_config_progress=false
export npm_config_maxsockets=4
export npm_config_cache=/tmp/nexyra-npm-cache
export PNPM_HOME=/tmp/nexyra-pnpm-home
export CI=true
export NODE_OPTIONS="--max-old-space-size=512"
cd ${APP_DIR} || exit 1
rm -f ${INSTALL_DONE_FILE} ${INSTALL_FAILED_FILE}
: > ${INSTALL_LOG_FILE}
echo "Installation démarrée. Cette étape peut prendre 2 à 5 minutes." >> ${INSTALL_LOG_FILE}
${attempts}
echo ${shellQuote(INSTALL_STRATEGY_ID)} > ${INSTALL_FAILED_FILE}
echo "Toutes les méthodes d'installation ont échoué." >> ${INSTALL_LOG_FILE}
exit 1`;

  const launcher = `rm -f ${INSTALL_DONE_FILE} ${INSTALL_FAILED_FILE} ${INSTALL_PID_FILE}; nohup bash -lc ${shellQuote(workerScript)} >/dev/null 2>&1 < /dev/null & echo $! > ${INSTALL_PID_FILE}`;
  await sandbox.commands.run(`bash -lc ${shellQuote(launcher)}`, { timeoutMs: 10_000 });
}

async function getInstallCommands(sandbox: Sandbox): Promise<string[]> {
  const [hasBun, hasBunLock, hasPnpmLock, hasYarnLock] = await Promise.all([
    sandboxCommandExists(sandbox, "bun"),
    sandboxFileExists(sandbox, "bun.lock").then(async (v) => v || sandboxFileExists(sandbox, "bun.lockb")),
    sandboxFileExists(sandbox, "pnpm-lock.yaml"),
    sandboxFileExists(sandbox, "yarn.lock"),
  ]);

  const commands: string[] = [];
  if (hasBun && hasBunLock) commands.push("bun install --no-progress --ignore-scripts");
  if (hasPnpmLock) commands.push("corepack enable >/dev/null 2>&1 || true; pnpm install --no-frozen-lockfile --ignore-scripts --network-concurrency=4 --child-concurrency=2");
  if (hasYarnLock) commands.push("corepack enable >/dev/null 2>&1 || true; yarn install --network-timeout 600000 --ignore-scripts");
  commands.push("corepack enable >/dev/null 2>&1 || true; corepack prepare pnpm@9 --activate >/dev/null 2>&1 || true; pnpm install --no-frozen-lockfile --ignore-scripts --network-concurrency=4 --child-concurrency=2 || npx --yes pnpm@9 install --no-frozen-lockfile --ignore-scripts --network-concurrency=4 --child-concurrency=2");
  commands.push("npm install --no-audit --no-fund --loglevel=error --ignore-scripts --legacy-peer-deps --prefer-online --maxsockets=4");
  if (hasBun && !commands.some((cmd) => cmd.startsWith("bun install"))) commands.push("bun install --no-progress --ignore-scripts");
  return Array.from(new Set(commands));
}

async function installDependencies(sandbox: Sandbox): Promise<{ exitCode?: number; stdout?: string; stderr?: string }> {
  const commands = await getInstallCommands(sandbox);
  const failures: string[] = [];

  for (const command of commands) {
    try {
      const install = await sandbox.commands.run(command, {
        cwd: APP_DIR,
        timeoutMs: INSTALL_TIMEOUT_MS,
      });
      if ((install.exitCode ?? 1) === 0) return install;
      failures.push(`${command}: ${install.stderr || install.stdout || `exit ${install.exitCode}`}`.slice(0, 500));
    } catch (err) {
      failures.push(`${command}: ${getCommandErrorText(err) || "commande interrompue"}`.slice(0, 500));
    }
    await cleanInstallArtifacts(sandbox);
  }

  throw new Error(
    `Installation du projet impossible après ${commands.length} essai(s): ${failures.join(" | ").slice(0, 1200)}`,
  );
}

/** Idempotent : prépare Vite sans écraser le travail déjà généré. */
export async function scaffoldViteProject(
  ownerId: string,
  projectId: string,
): Promise<{ installed: boolean; durationMs: number; installing?: boolean; logTail?: string; readOnly?: boolean; depsCount?: number }> {

  const t0 = Date.now();
  const { sandbox } = await ensureSandbox(ownerId, projectId);

  await seedNexyraCopyIfRequested(sandbox, ownerId, projectId);

  // Si un vrai projet a été importé, on ne lui ajoute pas les fichiers du template Nexyra.
  // On scaffold uniquement une sandbox vide (pas de package.json).
  const hasPackageJson = await sandboxFileExists(sandbox, "package.json");
  if (!hasPackageJson) {
    await sandbox.commands.run(`mkdir -p ${APP_DIR}/src`, { timeoutMs: 10_000 });
    for (const [rel, contents] of Object.entries(VITE_FILES)) {
      if (PRESERVED_SOURCE_FILES.has(rel)) {
        const exists = await sandbox.commands.run(
          `test -f ${APP_DIR}/${rel} && echo present || echo missing`,
          {
            timeoutMs: 10_000,
          },
        );
        if ((exists.stdout ?? "").includes("present")) continue;
      }
      await sandbox.files.write(`${APP_DIR}/${rel}`, contents);
    }
  }

  // Anti-pollution : si un ancien snapshot a laissé un vite.config.ts qui dépend
  // de plugins absents (ex. @tanstack/start-plugin-core), Vite crashe au boot.
  // On le réécrit avec le template Vite+React propre.
  try {
    const cfgPath = `${APP_DIR}/vite.config.ts`;
    const existing = await sandbox.files.read(cfgPath).catch(() => "");
    if (existing && /@tanstack\/(start|react-start)/.test(existing)) {
      await sandbox.files.write(cfgPath, VITE_FILES["vite.config.ts"]);
      console.log("[scaffold] vite.config.ts pollué (TanStack Start) → réécrit avec template Vite+React");
    }
  } catch {
    // ignore
  }

  const hasIndexHtml = await sandboxFileExists(sandbox, "index.html");
  if (hasIndexHtml) {
    const indexPath = `${APP_DIR}/index.html`;
    const indexHtml = await sandbox.files.read(indexPath).catch(() => VITE_FILES["index.html"]);
    if (!indexHtml.includes("nexyra-preview-bridge"))
      await sandbox.files.write(indexPath, withPreviewBridgeHtml(indexHtml));
  } else if (!hasPackageJson) {
    await sandbox.files.write(`${APP_DIR}/index.html`, withPreviewBridgeHtml(VITE_FILES["index.html"]));
  }

  const repairLog = hasPackageJson ? await repairPackageManifest(sandbox) : "";
  const manifestWasRepaired = repairLog && !repairLog.includes("package.json OK");
  if (manifestWasRepaired) {
    await sandbox.commands.run(`rm -f ${INSTALL_FAILED_FILE} ${INSTALL_DONE_FILE} ${INSTALL_PID_FILE}`, {
      timeoutMs: 10_000,
    });
    await cleanInstallArtifacts(sandbox);
  }

  const readOnlyDepsCount = await getReadOnlyImportDepsCount(sandbox, hasPackageJson);
  if (readOnlyDepsCount !== null) {
    await sandbox.commands.run(`if test -f ${INSTALL_PID_FILE}; then kill "$(cat ${INSTALL_PID_FILE})" 2>/dev/null || true; fi; rm -f ${INSTALL_FAILED_FILE} ${INSTALL_DONE_FILE} ${INSTALL_PID_FILE}`, {
      timeoutMs: 10_000,
    });
    await cleanInstallArtifacts(sandbox);
    return { installed: false, readOnly: true, depsCount: readOnlyDepsCount, durationMs: Date.now() - t0 };
  }

  const currentInstall = await getInstallState(sandbox);
  if (currentInstall.running) {
    return { installed: false, installing: true, durationMs: Date.now() - t0, logTail: currentInstall.logTail };
  }
  if (currentInstall.failed) {
    if (currentInstall.failedStrategy === INSTALL_STRATEGY_ID) {
      const retryCount = await getInstallRetryCount(sandbox);
      const transient = isTransientInstallError(currentInstall.logTail);
      if (transient && retryCount < INSTALL_MAX_RETRIES) {
        const next = await incrementInstallRetry(sandbox);
        console.log(`[scaffold] install échouée (transitoire) → retry ${next}/${INSTALL_MAX_RETRIES}`);
        await sandbox.commands.run(
          `rm -f ${INSTALL_FAILED_FILE} ${INSTALL_DONE_FILE} ${INSTALL_PID_FILE}`,
          { timeoutMs: 10_000 },
        );
        await cleanInstallArtifacts(sandbox);
        // tombe dans le bloc startInstallInBackground ci-dessous
      } else {
        await cleanInstallArtifacts(sandbox);
        const reason = transient
          ? `Échec persistant après ${retryCount} retry(s) sur erreur réseau.`
          : `Échec non-transitoire (probable conflit de dépendances).`;
        throw new Error(
          `Installation du projet impossible. ${reason}\nDernières lignes:\n${currentInstall.logTail || "Aucun détail disponible."}`,
        );
      }
    } else {
      await sandbox.commands.run(`rm -f ${INSTALL_FAILED_FILE} ${INSTALL_DONE_FILE} ${INSTALL_PID_FILE}`, {
        timeoutMs: 10_000,
      });
      await cleanInstallArtifacts(sandbox);
    }
  }

  // npm install seulement si Vite est réellement disponible.
  // Un install interrompu peut laisser node_modules présent mais sans .bin/vite.
  if (await hasViteBinary(sandbox)) {
    await sandbox.commands.run(`rm -f ${INSTALL_RETRY_FILE}`, { timeoutMs: 5_000 });
    return { installed: false, durationMs: Date.now() - t0 };
  }

  await startInstallInBackground(sandbox, await getInstallCommands(sandbox));

  const deadline = Date.now() + 25_000;
  let latest = "";
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    if (await hasViteBinary(sandbox)) {
      await sandbox.commands.run(`rm -f ${INSTALL_RETRY_FILE}`, { timeoutMs: 5_000 });
      return { installed: true, durationMs: Date.now() - t0 };
    }
    const state = await getInstallState(sandbox);
    latest = state.logTail;
    if (state.failed) {
      // Au lieu de jeter immédiatement, on laisse la prochaine invocation de
      // scaffoldViteProject décider du retry (compteur persistant côté sandbox).
      const retryCount = await getInstallRetryCount(sandbox);
      const transient = isTransientInstallError(latest);
      if (transient && retryCount < INSTALL_MAX_RETRIES) {
        return { installed: false, installing: true, durationMs: Date.now() - t0, logTail: latest };
      }
      await cleanInstallArtifacts(sandbox);
      const reason = transient
        ? `Échec persistant après ${retryCount} retry(s) sur erreur réseau.`
        : `Échec non-transitoire (probable conflit de dépendances).`;
      throw new Error(`Installation du projet impossible. ${reason}\nDernières lignes:\n${latest || "Aucun détail disponible."}`);
    }
  }

  return { installed: false, installing: true, durationMs: Date.now() - t0, logTail: latest };
}

/**
 * Statut courant de l'installation en arrière-plan (pour streaming live des logs
 * vers le terminal du front pendant que `scaffoldViteProject` tourne).
 */
export async function getInstallStatus(
  ownerId: string,
  projectId: string,
): Promise<{ running: boolean; done: boolean; failed: boolean; logTail: string }> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);
  const state = await getInstallState(sandbox);
  return {
    running: state.running,
    done: state.done,
    failed: state.failed,
    logTail: state.logTail,
  };
}

/** Tue tout vite résiduel puis lance `npm run dev` détaché (survit au retour de la commande). */
export async function startViteDev(ownerId: string, projectId: string): Promise<void> {
  const { sandbox } = await ensureSandbox(ownerId, projectId);

  const waitForLocalVite = async (seconds = 12): Promise<boolean> => {
    try {
      const check = await sandbox.commands.run(
        `python3 - <<'PY'
import socket, sys
import time

deadline = time.time() + ${seconds}
while time.time() < deadline:
  s = socket.socket()
  s.settimeout(1)
  try:
      s.connect(('127.0.0.1', ${DEV_PORT}))
      s.close()
      print('open')
      sys.exit(0)
  except Exception:
      time.sleep(0.5)

print('closed')
PY`,
        { timeoutMs: (seconds + 15) * 1000 },
      );
      return (check.stdout ?? "").includes("open");
    } catch (err) {
      // TimeoutError côté E2B = on considère Vite comme non-prêt et on continue
      // la procédure de démarrage au lieu de planter toute la requête.
      console.warn("[e2b] waitForLocalVite probe timed out:", (err as Error).message);
      return false;
    }
  };

  // Si Vite tourne déjà, on ne tue rien : c'est plus stable et évite les SIGTERM E2B.
  if (await waitForLocalVite(1)) return;

  if (!(await hasViteBinary(sandbox))) {
    const prepared = await scaffoldViteProject(ownerId, projectId);
    if (prepared.installing) {
      throw new Error(
        `Installation encore en cours. Dernières lignes:\n${prepared.logTail || "Préparation des dépendances..."}`,
      );
    }
  }

  // Nettoyage ciblé, sans `pkill -f node.*vite` : ce pattern peut tuer le runner lui-même.
  await sandbox.commands.run(
    `ps -eo pid=,args= | awk '/[v]ite/ && /5173/ {print $1}' | xargs -r kill || true`,
    { timeoutMs: 10_000 },
  );

  const launchErrors: string[] = [];
  try {
    await sandbox.commands.run(`./node_modules/.bin/vite --host 0.0.0.0 --port ${DEV_PORT}`, {
      cwd: APP_DIR,
      background: true,
      timeoutMs: 60 * 60_000,
    });
  } catch (err) {
    launchErrors.push(err instanceof Error ? err.message : String(err));
  }

  if (await waitForLocalVite(12)) return;

  try {
    await sandbox.commands.run(
      `bash -lc 'cd ${APP_DIR} && nohup ./node_modules/.bin/vite --host 0.0.0.0 --port ${DEV_PORT} > /tmp/vite.log 2>&1 < /dev/null & echo $! > /tmp/vite.pid'`,
      { timeoutMs: 10_000 },
    );
  } catch (err) {
    launchErrors.push(err instanceof Error ? err.message : String(err));
  }

  if (await waitForLocalVite(15)) return;

  // Détecte un node_modules corrompu (ex: "Cannot find module './constants'" depuis picomatch)
  // et relance une installation propre une seule fois.
  const probe = await sandbox.commands.run(`tail -n 120 /tmp/vite.log 2>/dev/null || true`, {
    timeoutMs: 10_000,
  });
  const probeText = `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`;
  if (/Cannot find module|PostCSS|ERR_MODULE_NOT_FOUND/i.test(probeText)) {
    await cleanInstallArtifacts(sandbox);
    await startInstallInBackground(sandbox, await getInstallCommands(sandbox));
    await sandbox.commands.run(
      `ps -eo pid=,args= | awk '/[v]ite/ && /5173/ {print $1}' | xargs -r kill || true`,
      { timeoutMs: 10_000 },
    );
    try {
      await sandbox.commands.run(
        `bash -lc 'cd ${APP_DIR} && nohup ./node_modules/.bin/vite --host 0.0.0.0 --port ${DEV_PORT} > /tmp/vite.log 2>&1 < /dev/null & echo $! > /tmp/vite.pid'`,
        { timeoutMs: 10_000 },
      );
    } catch (err) {
      launchErrors.push(err instanceof Error ? err.message : String(err));
    }
    if (await waitForLocalVite(20)) return;
    throw new Error(`Installation réparatrice relancée en arrière-plan. Dernières lignes:\n${probeText.slice(-1200)}`);
  }

  const logs = await sandbox.commands.run(`tail -n 80 /tmp/vite.log 2>/dev/null || true`, {
    timeoutMs: 10_000,
  });
  throw new Error(
    `Vite n'a pas démarré. ${launchErrors.join(" | ") || "Aucune erreur de lancement."}\n${
      logs.stdout || logs.stderr || "Aucun log Vite disponible."
    }`,
  );
}
