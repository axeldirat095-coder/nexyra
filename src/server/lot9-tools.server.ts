/**
 * LOT 9 — Outils contenu / qualité / scraping pour Elena.
 *
 *  - ocr_extract        : OCR document/image via Mistral OCR (BYOK `mistral_api_key`).
 *  - image_text         : génération d'image avec texte lisible via Ideogram 3.0
 *                         (BYOK `ideogram_api_key`). Idéal pour posters, logos textuels, ads.
 *  - apify_run          : exécute un Actor Apify (scrapers prêts à l'emploi).
 *                         BYOK `apify_api_token`. Synchronous run, dataset items renvoyés.
 *  - video_veo          : génération vidéo Veo 3 via fal.ai (BYOK `fal_api_key`).
 *                         Polling 5 min max, retourne URL du fichier MP4.
 *  - cohere_rerank      : reranking sémantique Top-N (BYOK `cohere_api_key`).
 *                         Améliore drastiquement la qualité d'un retrieval RAG.
 *  - lighthouse_audit   : audit perf/SEO/A11y via Google PageSpeed Insights.
 *                         Pas de BYOK obligatoire (clé optionnelle pour quotas étendus).
 *  - sentry_capture     : envoie un event/message Sentry (BYOK `sentry_dsn`).
 *
 *  Worker-safe : fetch + JSON uniquement.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const LOT9_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "ocr_extract",
  "image_text",
  "apify_run",
  "video_veo",
  "cohere_rerank",
  "lighthouse_audit",
  "sentry_capture",
]);

export function isLot9Tool(name: string): boolean {
  return LOT9_TOOLS.has(name as ToolName);
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

// ---------- ocr_extract (Mistral) ----------

interface OcrArgs {
  document_url: string;
  include_image_base64?: boolean;
}

async function runOcr(
  args: OcrArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const url = String(args.document_url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, output: "ocr_extract: 'document_url' http(s) requis (PDF/image public)." };
  }
  const apiKey = await fetchUserKey(supabase, userId, "mistral_api_key");
  if (!apiKey) {
    return { ok: false, output: "ocr_extract: clé `mistral_api_key` requise." };
  }

  const isImage = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
  const document = isImage
    ? { type: "image_url", image_url: url }
    : { type: "document_url", document_url: url };

  try {
    const res = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document,
        include_image_base64: args.include_image_base64 ?? false,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      return { ok: false, output: `ocr_extract: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
    }
    const json = (await res.json()) as {
      pages?: Array<{ index?: number; markdown?: string }>;
    };
    markUsed(supabase, userId, "mistral_api_key");
    const pages = json.pages ?? [];
    const md = pages.map((p) => `## Page ${p.index ?? "?"}\n\n${p.markdown ?? ""}`).join("\n\n---\n\n");
    const trimmed = md.slice(0, 8000);
    return {
      ok: true,
      output: `📄 OCR Mistral — ${pages.length} page(s):\n\n${trimmed}${md.length > 8000 ? "\n\n[…tronqué]" : ""}`,
    };
  } catch (e) {
    return { ok: false, output: `ocr_extract: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- image_text (Ideogram 3.0) ----------

interface IdeogramArgs {
  prompt: string;
  aspect_ratio?: "1x1" | "16x9" | "9x16" | "4x3" | "3x4" | "3x2" | "2x3";
  rendering_speed?: "TURBO" | "DEFAULT" | "QUALITY";
  style_type?: "AUTO" | "GENERAL" | "REALISTIC" | "DESIGN";
  magic_prompt?: "AUTO" | "ON" | "OFF";
}

async function runImageText(
  args: IdeogramArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) return { ok: false, output: "image_text: 'prompt' requis." };

  const apiKey = await fetchUserKey(supabase, userId, "ideogram_api_key");
  if (!apiKey) return { ok: false, output: "image_text: clé `ideogram_api_key` requise." };

  try {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("aspect_ratio", args.aspect_ratio ?? "1x1");
    form.append("rendering_speed", args.rendering_speed ?? "DEFAULT");
    form.append("style_type", args.style_type ?? "AUTO");
    form.append("magic_prompt", args.magic_prompt ?? "AUTO");

    const res = await fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", {
      method: "POST",
      headers: { "Api-Key": apiKey },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      return { ok: false, output: `image_text: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
    }
    const json = (await res.json()) as {
      data?: Array<{ url?: string; prompt?: string; resolution?: string }>;
    };
    markUsed(supabase, userId, "ideogram_api_key");
    const items = json.data ?? [];
    if (items.length === 0) return { ok: false, output: "image_text: aucune image générée." };
    const list = items
      .map((it, i) => `${i + 1}. ${it.url ?? ""} (${it.resolution ?? "?"})`)
      .join("\n");
    return { ok: true, output: `🎨 Ideogram 3.0 — ${items.length} image(s) :\n${list}` };
  } catch (e) {
    return { ok: false, output: `image_text: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- apify_run ----------

interface ApifyArgs {
  actor_id: string; // ex "apify~web-scraper" ou "compass~google-maps-scraper"
  input?: Record<string, unknown>;
  max_items?: number; // default 50
  timeout_ms?: number;
}

async function runApify(
  args: ApifyArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const actor = String(args.actor_id ?? "").trim();
  if (!/^[a-zA-Z0-9_~.-]+$/.test(actor)) {
    return { ok: false, output: "apify_run: 'actor_id' invalide (format owner~name ou id)." };
  }
  const apiKey = await fetchUserKey(supabase, userId, "apify_api_token");
  if (!apiKey) return { ok: false, output: "apify_run: clé `apify_api_token` requise." };

  const limit = Math.min(Math.max(args.max_items ?? 50, 1), 500);
  const timeout = Math.min(Math.max(args.timeout_ms ?? 120_000, 10_000), 300_000);

  try {
    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${apiKey}&clean=true&limit=${limit}&timeout=${Math.floor(timeout / 1000)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args.input ?? {}),
      signal: AbortSignal.timeout(timeout + 10_000),
    });
    if (!res.ok) {
      return { ok: false, output: `apify_run: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
    }
    const items = (await res.json()) as unknown[];
    markUsed(supabase, userId, "apify_api_token");
    const arr = Array.isArray(items) ? items : [];
    const sample = JSON.stringify(arr.slice(0, 20), null, 2).slice(0, 6000);
    return {
      ok: true,
      output: `🕷️ Apify "${actor}" — ${arr.length} item(s):\n${sample}${arr.length > 20 ? `\n[…+${arr.length - 20} de plus]` : ""}`,
    };
  } catch (e) {
    return { ok: false, output: `apify_run: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- video_veo (fal.ai Veo 3) ----------

interface VeoArgs {
  prompt: string;
  aspect_ratio?: "16:9" | "9:16" | "1:1";
  duration?: "8s";
  generate_audio?: boolean;
}

async function runVeo(
  args: VeoArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) return { ok: false, output: "video_veo: 'prompt' requis." };

  const apiKey = await fetchUserKey(supabase, userId, "fal_api_key");
  if (!apiKey) return { ok: false, output: "video_veo: clé `fal_api_key` requise." };

  try {
    // 1) submit
    const submitRes = await fetch("https://queue.fal.run/fal-ai/veo3", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: args.aspect_ratio ?? "16:9",
        duration: args.duration ?? "8s",
        generate_audio: args.generate_audio ?? true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!submitRes.ok) {
      return { ok: false, output: `video_veo: submit HTTP ${submitRes.status} ${(await submitRes.text()).slice(0, 300)}` };
    }
    const submit = (await submitRes.json()) as {
      request_id?: string;
      status_url?: string;
      response_url?: string;
    };
    if (!submit.request_id) return { ok: false, output: "video_veo: pas de request_id." };

    // 2) poll
    const deadline = Date.now() + 5 * 60_000;
    const statusUrl = submit.status_url ?? `https://queue.fal.run/fal-ai/veo3/requests/${submit.request_id}/status`;
    const responseUrl = submit.response_url ?? `https://queue.fal.run/fal-ai/veo3/requests/${submit.request_id}`;
    while (Date.now() < deadline) {
      await sleep(5_000);
      const st = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!st.ok) continue;
      const sj = (await st.json()) as { status?: string };
      if (sj.status === "COMPLETED") break;
      if (sj.status === "FAILED") {
        return { ok: false, output: "video_veo: génération FAILED côté fal.ai." };
      }
    }

    const finalRes = await fetch(responseUrl, {
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!finalRes.ok) {
      return { ok: false, output: `video_veo: result HTTP ${finalRes.status}` };
    }
    const result = (await finalRes.json()) as { video?: { url?: string } };
    markUsed(supabase, userId, "fal_api_key");
    const videoUrl = result.video?.url;
    if (!videoUrl) return { ok: false, output: "video_veo: pas d'URL vidéo dans la réponse." };
    return { ok: true, output: `🎬 Veo 3 — vidéo prête :\n${videoUrl}` };
  } catch (e) {
    return { ok: false, output: `video_veo: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- cohere_rerank ----------

interface CohereRerankArgs {
  query: string;
  documents: string[];
  top_n?: number;
  model?: string;
}

async function runCohereRerank(
  args: CohereRerankArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const query = String(args.query ?? "").trim();
  const docs = Array.isArray(args.documents) ? args.documents.filter((d) => typeof d === "string") : [];
  if (!query || docs.length === 0) {
    return { ok: false, output: "cohere_rerank: 'query' et 'documents' (array) requis." };
  }
  const topN = Math.min(Math.max(args.top_n ?? 5, 1), Math.min(docs.length, 50));

  // Cascade BYOK : Cohere prioritaire, fallback Voyage AI
  const cohereKey = await fetchUserKey(supabase, userId, "cohere_api_key");
  const voyageKey = !cohereKey ? await fetchUserKey(supabase, userId, "voyage_api_key") : null;
  if (!cohereKey && !voyageKey) {
    return { ok: false, output: "cohere_rerank: clé `cohere_api_key` ou `voyage_api_key` requise." };
  }

  try {
    if (cohereKey) {
      const res = await fetch("https://api.cohere.com/v2/rerank", {
        method: "POST",
        headers: { Authorization: `Bearer ${cohereKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: args.model ?? "rerank-v3.5",
          query,
          documents: docs.slice(0, 1000),
          top_n: topN,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        return { ok: false, output: `cohere_rerank: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
      }
      const json = (await res.json()) as { results?: Array<{ index: number; relevance_score: number }> };
      markUsed(supabase, userId, "cohere_api_key");
      const results = json.results ?? [];
      const formatted = results
        .map((r, i) => `${i + 1}. [${r.relevance_score.toFixed(3)}] (#${r.index}) ${(docs[r.index] ?? "").slice(0, 200).replace(/\s+/g, " ")}`)
        .join("\n");
      return { ok: true, output: `🎯 Cohere rerank — top ${results.length} :\n${formatted}` };
    }
    // Voyage fallback
    const res = await fetch("https://api.voyageai.com/v1/rerank", {
      method: "POST",
      headers: { Authorization: `Bearer ${voyageKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: args.model ?? "rerank-2",
        query,
        documents: docs.slice(0, 1000),
        top_k: topN,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { ok: false, output: `voyage_rerank: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
    }
    const json = (await res.json()) as { data?: Array<{ index: number; relevance_score: number }> };
    markUsed(supabase, userId, "voyage_api_key");
    const results = json.data ?? [];
    const formatted = results
      .map((r, i) => `${i + 1}. [${r.relevance_score.toFixed(3)}] (#${r.index}) ${(docs[r.index] ?? "").slice(0, 200).replace(/\s+/g, " ")}`)
      .join("\n");
    return { ok: true, output: `🎯 Voyage rerank — top ${results.length} :\n${formatted}` };
  } catch (e) {
    return { ok: false, output: `rerank: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- lighthouse_audit (PageSpeed Insights) ----------

interface LighthouseArgs {
  url: string;
  strategy?: "mobile" | "desktop";
  categories?: Array<"performance" | "accessibility" | "best-practices" | "seo" | "pwa">;
}

async function runLighthouse(
  args: LighthouseArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const url = String(args.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, output: "lighthouse_audit: 'url' http(s) requise." };
  }
  const apiKey =
    (await fetchUserKey(supabase, userId, "pagespeed_api_key").catch(() => null)) ??
    process.env.PAGESPEED_API_KEY ??
    null;
  const cats = args.categories ?? ["performance", "accessibility", "best-practices", "seo"];
  const strategy = args.strategy ?? "mobile";

  try {
    const params = new URLSearchParams();
    params.set("url", url);
    params.set("strategy", strategy);
    for (const c of cats) params.append("category", c.toUpperCase());
    if (apiKey) params.set("key", apiKey);

    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
      { signal: AbortSignal.timeout(90_000) },
    );
    if (!res.ok) {
      return { ok: false, output: `lighthouse_audit: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
    }
    const json = (await res.json()) as {
      lighthouseResult?: {
        categories?: Record<string, { title?: string; score?: number | null }>;
        audits?: Record<string, { title?: string; displayValue?: string }>;
      };
    };
    if (apiKey) markUsed(supabase, userId, "pagespeed_api_key");

    const categories = json.lighthouseResult?.categories ?? {};
    const audits = json.lighthouseResult?.audits ?? {};
    const scores = Object.entries(categories)
      .map(([k, v]) => `- ${v.title ?? k}: ${v.score == null ? "N/A" : Math.round(v.score * 100)}/100`)
      .join("\n");
    const keyAudits = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"]
      .map((k) => audits[k] ? `- ${audits[k].title}: ${audits[k].displayValue ?? "?"}` : null)
      .filter(Boolean)
      .join("\n");

    return {
      ok: true,
      output: `🚦 Lighthouse (${strategy}) — ${url}\n\n## Scores\n${scores}\n\n## Métriques clés\n${keyAudits}`,
    };
  } catch (e) {
    return { ok: false, output: `lighthouse_audit: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- sentry_capture ----------

interface SentryArgs {
  message: string;
  level?: "fatal" | "error" | "warning" | "info" | "debug";
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

function parseDsn(dsn: string): { host: string; projectId: string; publicKey: string } | null {
  // https://<key>@o<org>.ingest.sentry.io/<projectId>
  const m = dsn.match(/^https?:\/\/([^@]+)@([^/]+)\/(\d+)$/);
  if (!m) return null;
  return { publicKey: m[1], host: m[2], projectId: m[3] };
}

async function runSentry(
  args: SentryArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const message = String(args.message ?? "").trim();
  if (!message) return { ok: false, output: "sentry_capture: 'message' requis." };

  const dsn = await fetchUserKey(supabase, userId, "sentry_dsn");
  if (!dsn) return { ok: false, output: "sentry_capture: clé `sentry_dsn` requise." };

  const parsed = parseDsn(dsn);
  if (!parsed) return { ok: false, output: "sentry_capture: DSN Sentry invalide." };

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const payload = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: args.level ?? "error",
    message: { formatted: message },
    tags: args.tags ?? {},
    extra: args.extra ?? {},
    logger: "elena-agent",
  };

  try {
    const url = `https://${parsed.host}/api/${parsed.projectId}/store/`;
    const auth = `Sentry sentry_version=7, sentry_client=elena/1.0, sentry_key=${parsed.publicKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": auth,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, output: `sentry_capture: HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
    }
    markUsed(supabase, userId, "sentry_dsn");
    return { ok: true, output: `🛰️ Sentry event envoyé (id=${eventId}, level=${payload.level}).` };
  } catch (e) {
    return { ok: false, output: `sentry_capture: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeLot9Tool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult | null> {
  if (!isLot9Tool(name)) return null;
  try {
    if (name === "ocr_extract")
      return await runOcr(rawArgs as unknown as OcrArgs, supabase, userId);
    if (name === "image_text")
      return await runImageText(rawArgs as unknown as IdeogramArgs, supabase, userId);
    if (name === "apify_run")
      return await runApify(rawArgs as unknown as ApifyArgs, supabase, userId);
    if (name === "video_veo")
      return await runVeo(rawArgs as unknown as VeoArgs, supabase, userId);
    if (name === "cohere_rerank")
      return await runCohereRerank(rawArgs as unknown as CohereRerankArgs, supabase, userId);
    if (name === "lighthouse_audit")
      return await runLighthouse(rawArgs as unknown as LighthouseArgs, supabase, userId);
    if (name === "sentry_capture")
      return await runSentry(rawArgs as unknown as SentryArgs, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
