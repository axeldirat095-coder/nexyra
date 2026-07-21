/**
 * WorkspacePreview — version E2B sandbox (remplace l'ancienne WebContainer).
 *
 * Sauvegarde de l'ancienne version : WorkspacePreview.webcontainer.bak.tsx
 *
 * - Une sandbox E2B isolée par projet (clé = active-project id).
 * - Boot auto au montage : ensure → scaffold Vite → start dev → wait port 5173.
 * - Iframe scopé au previewUrl renvoyé par E2B.
 * - Garde la même barre d'outils (devices, reboot, reset).
 * - Export/Deploy temporairement désactivés (à reconnecter sur E2B après valid.).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  RotateCcw,
  Rocket,
  Smartphone,
  Tablet,
  Monitor,
  Download,
  RefreshCw,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  e2bEnsure,
  e2bExportZip,
  e2bResetSandbox,
  e2bSaveSnapshot,
  e2bScaffoldVite,
  e2bStartViteDev,
  e2bWaitForPort,
} from "@/lib/e2b.functions";
import { Save, Trash } from "lucide-react";
import { SnapshotsDialog } from "./SnapshotsDialog";
import { BlocksDrawer } from "./BlocksDrawer";
import { AnnotationLayer } from "./AnnotationLayer";
import { registerPreviewFrame } from "./preview-bridge";

type PreviewDevice = "desktop" | "tablet" | "mobile";
const DEVICE_WIDTH: Record<PreviewDevice, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

const ACTIVE_PROJECT_KEY = "nexyra:dev2:active-project";

function getActiveProjectId(): string {
  if (typeof window === "undefined") return "dev2-default";
  return localStorage.getItem(ACTIVE_PROJECT_KEY) ?? "dev2-default";
}

function withPreviewCacheBuster(src: string, projectId: string, token: number): string {
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}nx_project=${encodeURIComponent(projectId)}&nx_reload=${token}`;
}

function shortInstallLog(log?: string): string {
  const lines = (log ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3);
  return lines.length ? ` ${lines.join(" · ").slice(0, 180)}` : " Ça peut prendre 2 à 5 minutes.";
}

export function WorkspacePreview() {
  const ensure = useServerFn(e2bEnsure);
  const scaffold = useServerFn(e2bScaffoldVite);
  const startDev = useServerFn(e2bStartViteDev);
  const waitForPort = useServerFn(e2bWaitForPort);
  const exportZip = useServerFn(e2bExportZip);
  const saveSnap = useServerFn(e2bSaveSnapshot);
  const resetFn = useServerFn(e2bResetSandbox);

  const [projectId, setProjectId] = useState<string>(() => getActiveProjectId());
  const [projectName, setProjectName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [iframeKey, setIframeKey] = useState(0);
  const bootedRef = useRef<string | null>(null);
  const activeBootRef = useRef(0);

  // Récupère le nom lisible du projet (pour l'utiliser comme label de sauvegarde).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // projectId peut être un UUID (vrai projet) ou "dev2-default" (sandbox libre)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);
      if (!isUuid) {
        if (!cancelled) setProjectName("Sandbox");
        return;
      }
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
        if (!cancelled) setProjectName(data?.name ?? "Projet");
      } catch {
        if (!cancelled) setProjectName("Projet");
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Réagit au changement de projet actif (event dispatché par useActiveProject).
  useEffect(() => {
    const onChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ projectId: string | null }>).detail;
      const next = detail?.projectId ?? "dev2-default";
      if (next !== projectId) {
        activeBootRef.current += 1;
        setProjectId(next);
        setPreviewUrl(null);
        setIframeKey((k) => k + 1);
        bootedRef.current = null;
      }
    };
    window.addEventListener("nexyra:active-project-changed", onChange);
    return () => window.removeEventListener("nexyra:active-project-changed", onChange);
  }, [projectId]);

  // Reload iframe (debounced) when Elena writes a file in the sandbox.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onMut = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setIframeKey((k) => k + 1), 1500);
    };
    window.addEventListener("nexyra:e2b-file-mutated", onMut);
    return () => {
      window.removeEventListener("nexyra:e2b-file-mutated", onMut);
      if (t) clearTimeout(t);
    };
  }, []);

  const boot = useCallback(async (attempt = 1, bootToken = activeBootRef.current + 1) => {
    if (attempt === 1) activeBootRef.current = bootToken;
    const bootProjectId = projectId;
    setBusy(true);
    setError(null);
    setPreviewUrl(null);
    setStatus("Création / reprise sandbox…");
    try {
      const ens = await ensure({ data: { projectId: bootProjectId } });
      if (activeBootRef.current !== bootToken || bootProjectId !== projectId) return;
      setStatus("Préparation du projet…");
      let scaf = await scaffold({ data: { projectId: bootProjectId } });
      if ("error" in scaf && scaf.error) throw new Error(scaf.error);
      // Mode lecture/édition (gros projet importé, install skippée)
      if ("readOnly" in scaf && scaf.readOnly) {
        if (activeBootRef.current !== bootToken || bootProjectId !== projectId) return;
        setPreviewUrl(null);
        setStatus(
          `Mode lecture/édition (${scaf.depsCount ?? "?"} dépendances détectées) — preview live désactivée pour ce projet. Éditer le code et l'export GitHub fonctionnent normalement.`,
        );
        return;
      }
      let installPolls = 0;
      while ("installing" in scaf && scaf.installing && installPolls < 60) {
        if (activeBootRef.current !== bootToken || bootProjectId !== projectId) return;
        setStatus(`Installation des dépendances en cours…${shortInstallLog(scaf.logTail)}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        scaf = await scaffold({ data: { projectId: bootProjectId } });
        if ("error" in scaf && scaf.error) throw new Error(scaf.error);
        installPolls += 1;
      }
      if ("installing" in scaf && scaf.installing) {
        throw new Error(
          `Installation trop longue après 5 minutes. Dernières lignes:\n${scaf.logTail || "Aucun détail disponible."}`,
        );
      }

      if (activeBootRef.current !== bootToken || bootProjectId !== projectId) return;
      setStatus("Lancement vite dev…");
      await startDev({ data: { projectId: bootProjectId } });
      if (activeBootRef.current !== bootToken || bootProjectId !== projectId) return;
      setStatus("Attente port 5173…");
      await waitForPort({ data: { projectId: bootProjectId, port: 5173 } });
      if (activeBootRef.current !== bootToken || bootProjectId !== projectId) return;
      setPreviewUrl(ens.previewUrl);
      setIframeKey((k) => k + 1);
      setStatus("Prêt");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const canRetryInstall =
        attempt === 1 &&
        (msg.includes("node_modules/.bin/vite") ||
          msg.includes("interrompue par la sandbox") ||
          msg.includes("Installation du projet impossible"));
      if (canRetryInstall) {
        setStatus("Installation incomplète détectée — relance automatique…");
        await new Promise((resolve) => setTimeout(resolve, 800));
        return boot(2, bootToken);
      }
      setError(msg);
      setStatus("Erreur");
    } finally {
      if (activeBootRef.current === bootToken) setBusy(false);
    }
  }, [ensure, scaffold, startDev, waitForPort, projectId]);

  // Auto-boot quand le projet change.
  useEffect(() => {
    if (bootedRef.current === projectId) return;
    bootedRef.current = projectId;
    void boot();
  }, [boot, projectId]);

  useEffect(() => {
    const onImported = (ev: Event) => {
      const detail = (ev as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId && detail.projectId !== projectId) return;
      bootedRef.current = null;
      activeBootRef.current += 1;
      setPreviewUrl(null);
      setIframeKey((k) => k + 1);
      void boot(1, activeBootRef.current + 1);
    };
    window.addEventListener("nexyra:e2b-project-imported", onImported);
    return () => window.removeEventListener("nexyra:e2b-project-imported", onImported);
  }, [boot, projectId]);

  const handleReload = () => setIframeKey((k) => k + 1);

  const handleReboot = async () => {
    bootedRef.current = null;
    await boot();
  };

  const handleNotImpl = (label: string) => () => {
    toast.info(`${label} : disponible bientôt avec la sandbox E2B.`);
  };

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    const tid = toast.loading("Export du projet en cours…");
    try {
      const { filename, base64, bytes } = await exportZip({ data: { projectId } });
      const bin = atob(base64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const blob = new Blob([buf], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Export OK (${(bytes / 1024).toFixed(0)} Ko)`, { id: tid });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Export échoué : ${msg}`, { id: tid });
    } finally {
      setExporting(false);
    }
  };

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (saving) return;
    const label = projectName ?? "Sandbox";
    setSaving(true);
    const tid = toast.loading(`Sauvegarde de "${label}"…`);
    try {
      const r = await saveSnap({ data: { projectId, label, replace: true } });
      toast.success(`"${label}" sauvegardé (${r.snapshot.file_count} fichiers)`, { id: tid });
    } catch (e) {
      toast.error(`Sauvegarde KO : ${e instanceof Error ? e.message : String(e)}`, { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const [resetting, setResetting] = useState(false);
  const handleReset = async () => {
    if (resetting) return;
    if (!window.confirm("⚠ Réinitialiser la sandbox ?\n\nTous les fichiers actuels seront perdus et un projet Vite vierge sera recréé.\nPense à faire une sauvegarde avant si nécessaire.")) return;
    setResetting(true);
    const tid = toast.loading("Réinitialisation de la sandbox…");
    try {
      await resetFn({ data: { projectId } });
      bootedRef.current = null;
      setPreviewUrl(null);
      toast.success("Sandbox réinitialisée — relance en cours", { id: tid });
      await boot();
    } catch (e) {
      toast.error(`Reset KO : ${e instanceof Error ? e.message : String(e)}`, { id: tid });
    } finally {
      setResetting(false);
    }
  };

  if (!previewUrl) {
    return (
      <div className="flex h-full w-full flex-col bg-slate-950 text-slate-300">
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          ) : (
            <RefreshCw className="h-4 w-4 text-slate-500" />
          )}
          <div className="text-sm flex-1 truncate">{status}</div>
          <button
            onClick={() => void handleReboot()}
            disabled={busy}
            className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40"
            title="Relancer la sandbox"
          >
            <RotateCcw className="inline h-3 w-3 mr-1" />
            Relancer
          </button>
        </div>
        <div className="flex-1 overflow-auto px-4 py-3 font-mono text-xs">
          <div className="text-slate-500">Sandbox projet : <span className="text-slate-300">{projectId}</span></div>
          {error && <div className="mt-3 text-red-400 whitespace-pre-wrap">⚠ {error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-3 py-2">
        <div className="flex items-center gap-1">
          {(["mobile", "tablet", "desktop"] as PreviewDevice[]).map((d) => {
            const Icon = d === "mobile" ? Smartphone : d === "tablet" ? Tablet : Monitor;
            return (
              <button
                key={d}
                onClick={() => setDevice(d)}
                title={d}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded transition-colors",
                  device === d
                    ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
          <div className="mx-1 h-4 w-px bg-slate-700" />
          <button
            onClick={handleReload}
            title="Recharger l'iframe"
            className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className="h-3 w-3" /> Recharger
          </button>
          <button
            onClick={() => void handleReboot()}
            title="Rebooter la sandbox E2B"
            className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-red-300 hover:bg-red-500/10"
          >
            <RotateCcw className="h-3 w-3" /> Reboot
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || !previewUrl}
            title="Sauvegarder l'état actuel des fichiers"
            className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
          </button>
          <SnapshotsDialog projectId={projectId} />
          <BlocksDrawer projectId={projectId} />
          <button
            onClick={() => void handleExport()}
            disabled={exporting || !previewUrl}
            title="Exporter le projet en ZIP"
            className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Export
          </button>
          <button
            onClick={() => void handleReset()}
            disabled={resetting}
            title="Réinitialiser la sandbox (efface tout)"
            className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-40"
          >
            {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash className="h-3 w-3" />} Reset
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-slate-500 md:inline truncate max-w-[200px]" title={previewUrl}>
            {previewUrl}
          </span>
          <button
            onClick={handleNotImpl("Déploiement")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-gradient-to-r from-blue-600 to-violet-600 text-white font-medium opacity-60 hover:opacity-90 transition-opacity"
            title="Déployer (bientôt avec E2B)"
          >
            <Rocket className="h-3 w-3" />
            Déployer
          </button>
        </div>
      </div>
      <div className="relative flex flex-1 items-start justify-center overflow-auto bg-slate-900 p-3">
        <IframePreview
          key={`${previewUrl}-${iframeKey}`}
          src={withPreviewCacheBuster(previewUrl, projectId, iframeKey)}
          device={device}
        />
        <AnnotationLayer />
      </div>
    </div>
  );
}

/**
 * Iframe avec auto-retry : si la 1re tentative échoue (proxy E2B pas encore prêt
 * → "n'autorise pas la connexion"), on recharge automatiquement jusqu'à 4 fois.
 */
function IframePreview({
  src,
  device,
}: {
  src: string;
  device: PreviewDevice;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    registerPreviewFrame(ref.current);
    return () => registerPreviewFrame(null);
  }, [attempt, src]);

  useEffect(() => {
    setLoaded(false);
    setAttempt(0);
  }, [src]);

  useEffect(() => {
    if (loaded) return;
    if (attempt >= 4) return;
    const t = setTimeout(() => {
      // Si le iframe n'a pas déclenché onLoad sous 4 s, on retente.
      setAttempt((a) => a + 1);
    }, 4500);
    return () => clearTimeout(t);
  }, [attempt, loaded]);

  return (
    <iframe
      ref={ref}
      key={attempt}
      title="Preview projet Elena (E2B)"
      src={src}
      onLoad={() => setLoaded(true)}
      className="h-full bg-white shadow-2xl transition-all"
      style={{ width: DEVICE_WIDTH[device], maxWidth: "100%" }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
}
