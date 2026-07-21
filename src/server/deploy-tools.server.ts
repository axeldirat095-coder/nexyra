/**
 * Deploy + background-jobs + video tools for Elena (LOT 5).
 *
 *  - video_generate   : Runway Gen-3/4 image-to-video (clé `runway_api_key`).
 *  - deploy_vercel    : POST /v13/deployments depuis un repo Git (clé `vercel_api_token`).
 *  - deploy_netlify   : trigger build/deploy d'un site existant (clé `netlify_api_token`).
 *  - background_job   : envoie un trigger à Trigger.dev v3 (clé `trigger_api_key`).
 *
 * Worker-safe : fetch + JSON. Polling Runway plafonné ~90 s.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const DEPLOY_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "video_generate",
  "deploy_vercel",
  "deploy_netlify",
  "background_job",
]);

export function isDeployTool(name: string): boolean {
  return DEPLOY_TOOLS.has(name as ToolName);
}

async function fetchUserKey(
  supabase: SupabaseClient<Database>,
  userId: string,
  service: string,
): Promise<string | null> {
  const { data } = await supabase.rpc("get_external_key_decrypted", {
    _owner_id: userId,
    _service: service,
  });
  return typeof data === "string" && data.length > 0 ? data : null;
}

function markUsed(
  supabase: SupabaseClient<Database>,
  userId: string,
  service: string,
): void {
  void supabase
    .rpc("mark_external_key_used", { _owner_id: userId, _service: service })
    .then(() => undefined);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- video_generate (Runway) ----------

interface VideoArgs {
  prompt_image: string; // URL publique
  prompt_text?: string;
  model?: "gen3a_turbo" | "gen4_turbo";
  ratio?: string; // ex "1280:720"
  duration?: 5 | 10;
}

const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";

async function runVideoGenerate(
  args: VideoArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const url = args.prompt_image?.trim();
  if (!url) return { ok: false, output: "video_generate: `prompt_image` (URL) requis." };
  const key = await fetchUserKey(supabase, userId, "runway_api_key");
  if (!key) {
    return {
      ok: false,
      output: "video_generate: clé Runway manquante (Réglages → Clés API → Runway).",
    };
  }
  const model = args.model || "gen4_turbo";
  const ratio = args.ratio || "1280:720";
  const duration = args.duration ?? 5;

  try {
    const create = await fetch(`${RUNWAY_BASE}/image_to_video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Runway-Version": "2024-11-06",
      },
      body: JSON.stringify({
        promptImage: url,
        promptText: args.prompt_text,
        model,
        ratio,
        duration,
      }),
    });
    if (!create.ok) {
      const t = await create.text().catch(() => "");
      return { ok: false, output: `video_generate Runway: ${create.status} ${t.slice(0, 300)}` };
    }
    const { id: taskId } = (await create.json()) as { id: string };

    // Poll up to ~90s
    const start = Date.now();
    let videoUrl: string | undefined;
    let status = "PENDING";
    while (Date.now() - start < 90_000) {
      await sleep(3_000);
      const st = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${key}`, "X-Runway-Version": "2024-11-06" },
      });
      const sj = (await st.json().catch(() => ({}))) as {
        status?: string;
        output?: string[];
        failure?: string;
      };
      status = sj.status ?? "PENDING";
      if (status === "SUCCEEDED") {
        videoUrl = sj.output?.[0];
        break;
      }
      if (status === "FAILED") {
        return { ok: false, output: `video_generate: Runway FAILED — ${sj.failure ?? "?"}` };
      }
    }
    markUsed(supabase, userId, "runway_api_key");
    if (!videoUrl) {
      return {
        ok: true,
        output: `🎬 Vidéo en cours (task ${taskId}, status ${status}). Réinterroge dans 1-2 min via l'API Runway.`,
      };
    }
    return {
      ok: true,
      output: `🎬 Vidéo générée (${model}, ${duration}s, ${ratio}) : ${videoUrl}`,
    };
  } catch (e) {
    return { ok: false, output: `video_generate: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- deploy_vercel ----------

interface VercelArgs {
  name: string;
  repo: string; // "owner/name"
  ref?: string; // branch
  team_id?: string;
  project_id?: string;
}

async function runDeployVercel(
  args: VercelArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.name?.trim()) return { ok: false, output: "deploy_vercel: `name` requis." };
  if (!args.repo || !/^[\w.-]+\/[\w.-]+$/.test(args.repo)) {
    return { ok: false, output: "deploy_vercel: `repo` au format 'owner/name' requis." };
  }
  const token = await fetchUserKey(supabase, userId, "vercel_api_token");
  if (!token) {
    return { ok: false, output: "deploy_vercel: token Vercel manquant (Réglages → Vercel)." };
  }
  try {
    const url = new URL("https://api.vercel.com/v13/deployments");
    if (args.team_id) url.searchParams.set("teamId", args.team_id);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: args.name,
        project: args.project_id || args.name,
        gitSource: {
          type: "github",
          repo: args.repo,
          ref: args.ref || "main",
        },
        target: "production",
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      url?: string;
      id?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        output: `deploy_vercel: ${res.status} ${body.error?.message ?? "erreur"}`,
      };
    }
    markUsed(supabase, userId, "vercel_api_token");
    return {
      ok: true,
      output: `▲ Déploiement Vercel lancé (id ${body.id}) : https://${body.url}`,
    };
  } catch (e) {
    return { ok: false, output: `deploy_vercel: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- deploy_netlify ----------

interface NetlifyArgs {
  site_id: string;
  clear_cache?: boolean;
}

async function runDeployNetlify(
  args: NetlifyArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  if (!args.site_id?.trim()) return { ok: false, output: "deploy_netlify: `site_id` requis." };
  const token = await fetchUserKey(supabase, userId, "netlify_api_token");
  if (!token) {
    return { ok: false, output: "deploy_netlify: token Netlify manquant (Réglages → Netlify)." };
  }
  try {
    const res = await fetch(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(args.site_id)}/builds`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ clear_cache: args.clear_cache === true }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      deploy_id?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        output: `deploy_netlify: ${res.status} ${body.message ?? "erreur"}`,
      };
    }
    markUsed(supabase, userId, "netlify_api_token");
    return {
      ok: true,
      output: `🟢 Build Netlify déclenché (id ${body.id}, deploy ${body.deploy_id ?? "n/a"}). Suivi : https://app.netlify.com/sites/${args.site_id}/deploys`,
    };
  } catch (e) {
    return { ok: false, output: `deploy_netlify: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- background_job (Trigger.dev v3) ----------

interface TriggerArgs {
  task_identifier: string;
  payload?: Record<string, unknown>;
  queue?: string;
  delay_ms?: number;
}

async function runBackgroundJob(
  args: TriggerArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const task = args.task_identifier?.trim();
  if (!task) return { ok: false, output: "background_job: `task_identifier` requis." };
  const token = await fetchUserKey(supabase, userId, "trigger_api_key");
  if (!token) {
    return {
      ok: false,
      output: "background_job: token Trigger.dev manquant (Réglages → Trigger.dev).",
    };
  }
  try {
    const body: Record<string, unknown> = { payload: args.payload ?? {} };
    if (args.queue) body.options = { queue: args.queue };
    if (args.delay_ms && args.delay_ms > 0) {
      body.options = {
        ...(body.options as object),
        delay: new Date(Date.now() + args.delay_ms).toISOString(),
      };
    }
    const res = await fetch(
      `https://api.trigger.dev/api/v1/tasks/${encodeURIComponent(task)}/trigger`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        output: `background_job: ${res.status} ${json.error ?? json.message ?? "erreur"}`,
      };
    }
    markUsed(supabase, userId, "trigger_api_key");
    return {
      ok: true,
      output: `⏱️ Job Trigger.dev '${task}' lancé (run ${json.id}).`,
    };
  } catch (e) {
    return { ok: false, output: `background_job: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeDeployTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult | null> {
  if (!isDeployTool(name)) return null;
  try {
    if (name === "video_generate")
      return await runVideoGenerate(rawArgs as unknown as VideoArgs, supabase, userId);
    if (name === "deploy_vercel")
      return await runDeployVercel(rawArgs as unknown as VercelArgs, supabase, userId);
    if (name === "deploy_netlify")
      return await runDeployNetlify(rawArgs as unknown as NetlifyArgs, supabase, userId);
    if (name === "background_job")
      return await runBackgroundJob(rawArgs as unknown as TriggerArgs, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
