/**
 * Bouton "Déployer sur Vercel" + bouton compagnon "Ouvrir le dernier déploiement".
 * - La fusée pousse la sandbox active vers Vercel via `deploySandboxToVercel`,
 *   sauf pour les projets reliés GitHub → Vercel : dans ce cas on pousse vers
 *   GitHub pour préserver la source Git du déploiement.
 * - On garde l'URL stable du dernier déploiement par projet dans localStorage,
 *   pour permettre de la rouvrir sans repasser par Vercel.
 */
import { useEffect, useState } from "react";
import { Rocket, LoaderCircle, ExternalLink } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { deploySandboxToVercel, deploySandboxViaGithub, getVercelDeploymentStatus } from "@/lib/deploy.functions";
import type { ActiveProject } from "./useActiveProject";

function sanitizeName(raw: string): string {
  const s = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);
  return s || `nexyra-${Date.now().toString(36)}`;
}

const STORAGE_KEY = "nexyra:lastVercelDeploy";

type DeployCache = Record<string, { url: string; stableUrl: string | null; at: number }>;

function readCache(): DeployCache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DeployCache) : {};
  } catch {
    return {};
  }
}

function writeCache(projectId: string, url: string, stableUrl: string | null) {
  try {
    const c = readCache();
    c[projectId] = { url, stableUrl, at: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function DeployVercelButton({ active }: { active: ActiveProject | null }) {
  const deploy = useServerFn(deploySandboxToVercel);
  const deployGithub = useServerFn(deploySandboxViaGithub);
  const getStatus = useServerFn(getVercelDeploymentStatus);
  const [busy, setBusy] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  // Charge l'URL stockée pour le projet actif
  useEffect(() => {
    if (!active) {
      setLastUrl(null);
      return;
    }
    const entry = readCache()[active.id];
    setLastUrl(entry?.stableUrl || entry?.url || null);
  }, [active]);

  // Suit le statut Vercel jusqu'à READY ou ERROR (max ~2 min).
  const pollUntilDone = async (
    deploymentId: string,
  ): Promise<{
    ok: boolean;
    state: string;
    url?: string | null;
    stableUrl?: string | null;
    errorMessage?: string | null;
    inspectorUrl?: string | null;
  }> => {
    const start = Date.now();
    const maxMs = 150_000;
    let delay = 3_000;
    while (Date.now() - start < maxMs) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay + 1_000, 8_000);
      try {
        const s = await getStatus({ data: { deploymentId } });
        if (!s.ok) continue;
        if (s.state === "READY") {
          return {
            ok: true,
            state: s.state,
            url: s.url,
            stableUrl: s.stableUrl,
            errorMessage: s.errorMessage,
            inspectorUrl: s.inspectorUrl,
          };
        }
        if (s.state === "ERROR" || s.state === "CANCELED") {
          return {
            ok: false,
            state: s.state,
            url: s.url,
            stableUrl: s.stableUrl,
            errorMessage: s.errorMessage,
            inspectorUrl: s.inspectorUrl,
          };
        }
      } catch {
        /* keep polling */
      }
    }
    return { ok: false, state: "TIMEOUT", errorMessage: "Timeout (>2 min)" };
  };

  const handleClick = async () => {
    if (!active) {
      toast.info("Sélectionne un projet d'abord");
      return;
    }
    setBusy(true);
    const t = toast.loading("Envoi du projet vers Vercel…");
    try {
      const metadata = (active.metadata ?? {}) as Record<string, unknown>;
      const deployMode = typeof metadata.vercel_deploy_mode === "string" ? metadata.vercel_deploy_mode : null;
      const linkedRepo = metadata.github_repo && typeof metadata.github_repo === "object" ? metadata.github_repo : null;
      const stableProjectUrl = typeof metadata.vercel_public_url === "string" && metadata.vercel_public_url.trim()
        ? metadata.vercel_public_url.trim()
        : null;

      if (deployMode === "github" || linkedRepo) {
        toast.dismiss(t);
        const tg = toast.loading("Envoi vers GitHub… Vercel redéploiera ensuite automatiquement");
        const res = await deployGithub({
          data: {
            projectId: active.id,
            commitMessage: `Update from Nexyra — ${new Date().toLocaleString("fr-FR")}`,
          },
        });
        toast.dismiss(tg);
        if (!res.ok) {
          toast.error(`Échec GitHub : ${res.error}`, { duration: 15000 });
          return;
        }
        const url = res.vercelUrl || stableProjectUrl;
        if (url) {
          writeCache(active.id, url, url);
          setLastUrl(url);
        }
        toast.success("✅ Code envoyé sur GitHub — Vercel va reprendre la mise à jour", {
          duration: 12000,
          action: url
            ? {
                label: "Ouvrir",
                onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
              }
            : undefined,
          icon: <ExternalLink className="h-4 w-4" />,
        });
        return;
      }

      const override = metadata.vercel_project_name;
      const projectName = typeof override === "string" && override.trim()
        ? sanitizeName(override)
        : sanitizeName(active.name);
      const res = await deploy({
        data: { projectId: active.id, projectName, framework: "vite" },
      });
      if (!res.ok) {
        toast.dismiss(t);
        toast.error(`Échec déploiement : ${res.error}`);
        return;
      }
      const deploymentId = res.id;
      toast.dismiss(t);

      if (!deploymentId) {
        // Pas d'ID = on ne peut pas suivre, on affiche juste l'URL si dispo
        const url = res.stableUrl || res.url;
        if (url) {
          writeCache(active.id, res.url ?? url, res.stableUrl ?? null);
          setLastUrl(url);
        }
        toast.success("Déploiement lancé (statut non suivi)");
        return;
      }

      // Phase 2 : poll Vercel jusqu'au build final
      const t2 = toast.loading("Build Vercel en cours… (peut prendre 30s-2 min)");
      const final = await pollUntilDone(deploymentId);
      toast.dismiss(t2);

      if (!final.ok) {
        const reason = final.errorMessage || final.state || "inconnu";
        toast.error(`❌ Build Vercel échoué : ${reason}`, {
          duration: 15000,
          action: final.inspectorUrl
            ? {
                label: "Voir logs",
                onClick: () => window.open(final.inspectorUrl!, "_blank", "noopener,noreferrer"),
              }
            : undefined,
        });
        return;
      }

      const url = final.stableUrl || final.url || res.stableUrl || res.url;
      if (url) {
        writeCache(active.id, final.url ?? url, final.stableUrl ?? null);
        setLastUrl(url);
      }
      toast.success("✅ Site en ligne sur Vercel — clique pour ouvrir", {
        duration: 12000,
        action: url
          ? {
              label: "Ouvrir",
              onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
            }
          : undefined,
        icon: <ExternalLink className="h-4 w-4" />,
      });
      if (url) {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      toast.dismiss(t);
      toast.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title="Déployer sur Vercel (URL stable)"
        aria-label="Déployer sur Vercel"
        className="flex h-9 w-9 items-center justify-center rounded-md text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50"
      >
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
      </button>
      {lastUrl && (
        <button
          type="button"
          onClick={() => window.open(lastUrl, "_blank", "noopener,noreferrer")}
          title={`Ouvrir le dernier déploiement : ${lastUrl}`}
          aria-label="Ouvrir le dernier déploiement Vercel"
          className="flex h-9 w-9 items-center justify-center rounded-md text-sky-400 transition-colors hover:bg-sky-500/10 hover:text-sky-300"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      )}
    </>
  );
}
