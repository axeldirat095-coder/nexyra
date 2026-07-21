/**
 * LOT 26 — Media & conversion tools
 *
 *  - luma_video          : génération vidéo Luma Dream Machine via fal.ai
 *                          (BYOK `fal_api_key` ou env FAL_KEY).
 *  - deepgram_transcribe : STT premium Deepgram Nova-3 (BYOK `deepgram_api_key`).
 *  - cloudconvert        : conversion universelle MD/DOCX/PDF/HTML/...
 *                          via CloudConvert (BYOK `cloudconvert_api_key`).
 */
import type { ToolResult, FsMutation } from "./agent-tools.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export const LOT26_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "luma_video",
      description:
        "Génère une vidéo via Luma Dream Machine (text→video, image→video). BYOK `fal_api_key` ou env FAL_KEY. Polling jusqu'à 5 min. Retourne URL MP4. Idéal pour clips marketing, animations courtes (5-10s).",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Prompt vidéo détaillé." },
          image_url: { type: "string", description: "Optionnel : image source pour image→video." },
          aspect_ratio: { type: "string", enum: ["16:9", "9:16", "1:1", "4:3", "3:4"], description: "Défaut 16:9." },
          loop: { type: "boolean", description: "Boucle parfaite (défaut false)." },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deepgram_transcribe",
      description:
        "Transcription audio premium Deepgram Nova-3 (BYOK `deepgram_api_key`). Multilingue, ponctuation auto, diarization optionnelle. Retourne transcript + segments.",
      parameters: {
        type: "object",
        properties: {
          audio_url: { type: "string", description: "URL https audio (mp3/wav/m4a/webm/...)." },
          language: { type: "string", description: "Code ISO (fr, en, es, multi). Défaut 'multi'." },
          diarize: { type: "boolean", description: "Détection des locuteurs (défaut false)." },
          smart_format: { type: "boolean", description: "Ponctuation + casing auto (défaut true)." },
        },
        required: ["audio_url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cloudconvert",
      description:
        "Conversion universelle de fichiers via CloudConvert (BYOK `cloudconvert_api_key`). Supporte MD↔DOCX↔PDF↔HTML, images, audio, vidéo. Idéal pour exports utilisateurs.",
      parameters: {
        type: "object",
        properties: {
          input_url: { type: "string", description: "URL https du fichier source." },
          input_format: { type: "string", description: "Extension source (md, docx, pdf, html, png, mp3, …)." },
          output_format: { type: "string", description: "Extension cible (pdf, docx, md, …)." },
        },
        required: ["input_url", "input_format", "output_format"],
        additionalProperties: false,
      },
    },
  },
] as const;

async function fetchUserKey(sb: SupabaseLike, userId: string, service: string): Promise<string | null> {
  const { data } = await sb.rpc("get_external_key_decrypted", { _owner_id: userId, _service: service });
  return typeof data === "string" && data.length > 0 ? data : null;
}

function markUsed(sb: SupabaseLike, userId: string, service: string): void {
  void sb.rpc("mark_external_key_used", { _owner_id: userId, _service: service }).then(() => undefined);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- luma_video (fal.ai luma-dream-machine) ----------

async function runLumaVideo(
  args: Record<string, unknown>,
  sb: SupabaseLike,
  userId: string,
): Promise<ToolResult> {
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) return { ok: false, output: "luma_video: 'prompt' requis." };

  const falKey = (await fetchUserKey(sb, userId, "fal_api_key")) ?? process.env.FAL_KEY ?? null;
  if (!falKey) return { ok: false, output: "luma_video: clé `fal_api_key` (BYOK) ou env FAL_KEY requise." };

  const aspect = (args.aspect_ratio as string) ?? "16:9";
  const loop = args.loop === true;
  const imageUrl = args.image_url ? String(args.image_url) : undefined;

  const endpoint = imageUrl
    ? "https://queue.fal.run/fal-ai/luma-dream-machine/image-to-video"
    : "https://queue.fal.run/fal-ai/luma-dream-machine";

  try {
    const submitRes = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspect,
        loop,
        ...(imageUrl ? { image_url: imageUrl } : {}),
      }),
    });
    if (!submitRes.ok) {
      const txt = await submitRes.text().catch(() => "");
      return { ok: false, output: `luma_video: submit HTTP ${submitRes.status} — ${txt.slice(0, 160)}` };
    }
    const submit = (await submitRes.json()) as { request_id?: string; status_url?: string; response_url?: string };
    if (!submit.request_id) return { ok: false, output: "luma_video: pas de request_id" };
    const statusUrl = submit.status_url ?? `${endpoint}/requests/${submit.request_id}/status`;
    const responseUrl = submit.response_url ?? `${endpoint}/requests/${submit.request_id}`;

    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const sRes = await fetch(statusUrl, { headers: { Authorization: `Key ${falKey}` } });
      if (!sRes.ok) continue;
      const s = (await sRes.json()) as { status?: string };
      if (s.status === "COMPLETED") {
        const rRes = await fetch(responseUrl, { headers: { Authorization: `Key ${falKey}` } });
        if (!rRes.ok) return { ok: false, output: `luma_video: response HTTP ${rRes.status}` };
        const r = (await rRes.json()) as { video?: { url?: string } };
        const url = r.video?.url;
        if (!url) return { ok: false, output: "luma_video: pas d'URL vidéo dans la réponse" };
        markUsed(sb, userId, "fal_api_key");
        return { ok: true, output: `🎬 Luma Dream Machine (${aspect}${loop ? ", loop" : ""}) terminé\n→ ${url}` };
      }
      if (s.status === "FAILED") return { ok: false, output: "luma_video: génération FAILED" };
    }
    return { ok: false, output: "luma_video: timeout (>5min)" };
  } catch (e) {
    return { ok: false, output: `luma_video: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- deepgram_transcribe ----------

async function runDeepgramTranscribe(
  args: Record<string, unknown>,
  sb: SupabaseLike,
  userId: string,
): Promise<ToolResult> {
  const audioUrl = String(args.audio_url ?? "").trim();
  if (!/^https?:\/\//i.test(audioUrl)) return { ok: false, output: "deepgram_transcribe: 'audio_url' http(s) requise." };

  const apiKey = await fetchUserKey(sb, userId, "deepgram_api_key");
  if (!apiKey) return { ok: false, output: "deepgram_transcribe: clé `deepgram_api_key` requise (https://deepgram.com)." };

  const language = args.language ? String(args.language) : "multi";
  const diarize = args.diarize === true;
  const smartFormat = args.smart_format !== false;

  const params = new URLSearchParams({
    model: "nova-3",
    language,
    smart_format: String(smartFormat),
    diarize: String(diarize),
    punctuate: "true",
  });

  try {
    const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: audioUrl }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, output: `deepgram_transcribe: HTTP ${res.status} — ${txt.slice(0, 160)}` };
    }
    type DGResp = {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
          }>;
        }>;
      };
      metadata?: { duration?: number };
    };
    const json = (await res.json()) as DGResp;
    const alt = json.results?.channels?.[0]?.alternatives?.[0];
    const transcript = alt?.transcript ?? "";
    const confidence = alt?.confidence ?? 0;
    const duration = json.metadata?.duration ?? 0;
    markUsed(sb, userId, "deepgram_api_key");

    const preview = transcript.length > 800 ? transcript.slice(0, 800) + "…" : transcript;
    return {
      ok: true,
      output: `🎙️ Deepgram Nova-3 (${language}, ${duration.toFixed(1)}s, conf ${(confidence * 100).toFixed(1)}%)\n\n${preview}`,
    };
  } catch (e) {
    return { ok: false, output: `deepgram_transcribe: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- cloudconvert ----------

async function runCloudConvert(
  args: Record<string, unknown>,
  sb: SupabaseLike,
  userId: string,
): Promise<ToolResult> {
  const inputUrl = String(args.input_url ?? "").trim();
  const inputFormat = String(args.input_format ?? "").trim().toLowerCase();
  const outputFormat = String(args.output_format ?? "").trim().toLowerCase();
  if (!/^https?:\/\//i.test(inputUrl)) return { ok: false, output: "cloudconvert: 'input_url' http(s) requise." };
  if (!inputFormat || !outputFormat) return { ok: false, output: "cloudconvert: input_format et output_format requis." };

  const apiKey = await fetchUserKey(sb, userId, "cloudconvert_api_key");
  if (!apiKey) return { ok: false, output: "cloudconvert: clé `cloudconvert_api_key` requise (https://cloudconvert.com)." };

  try {
    // Job multi-tasks : import-url → convert → export-url
    const jobRes = await fetch("https://api.cloudconvert.com/v2/jobs", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tasks: {
          "import-1": { operation: "import/url", url: inputUrl },
          "convert-1": {
            operation: "convert",
            input: "import-1",
            input_format: inputFormat,
            output_format: outputFormat,
          },
          "export-1": { operation: "export/url", input: "convert-1", inline: false, archive_multiple_files: false },
        },
      }),
    });
    if (!jobRes.ok) {
      const txt = await jobRes.text().catch(() => "");
      return { ok: false, output: `cloudconvert: job HTTP ${jobRes.status} — ${txt.slice(0, 160)}` };
    }
    const job = (await jobRes.json()) as { data?: { id?: string } };
    const jobId = job.data?.id;
    if (!jobId) return { ok: false, output: "cloudconvert: pas de job id" };

    // Poll job status
    for (let i = 0; i < 60; i++) {
      await sleep(3000);
      const sRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!sRes.ok) continue;
      type JobResp = {
        data?: {
          status?: string;
          tasks?: Array<{
            name?: string;
            operation?: string;
            status?: string;
            result?: { files?: Array<{ url?: string; filename?: string }> };
          }>;
        };
      };
      const s = (await sRes.json()) as JobResp;
      const status = s.data?.status;
      if (status === "finished") {
        const exportTask = (s.data?.tasks ?? []).find((t) => t.operation === "export/url");
        const file = exportTask?.result?.files?.[0];
        if (!file?.url) return { ok: false, output: "cloudconvert: pas d'URL export" };
        markUsed(sb, userId, "cloudconvert_api_key");
        return {
          ok: true,
          output: `🔄 CloudConvert ${inputFormat} → ${outputFormat} terminé (${file.filename ?? "fichier"})\n→ ${file.url}`,
        };
      }
      if (status === "error") return { ok: false, output: "cloudconvert: job error" };
    }
    return { ok: false, output: "cloudconvert: timeout (>3min)" };
  } catch (e) {
    return { ok: false, output: `cloudconvert: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

export async function executeLot26Tool(
  name: string,
  rawArgs: Record<string, unknown>,
  _vfs: Map<string, string>,
  _mutations: FsMutation[],
  supabaseClient: unknown,
  userId: string,
): Promise<ToolResult | null> {
  if (!userId) return null;
  if (name === "luma_video") return runLumaVideo(rawArgs, supabaseClient, userId);
  if (name === "deepgram_transcribe") return runDeepgramTranscribe(rawArgs, supabaseClient, userId);
  if (name === "cloudconvert") return runCloudConvert(rawArgs, supabaseClient, userId);
  return null;
}
