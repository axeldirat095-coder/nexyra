export type VideoGenerationInput = {
  prompt: string;
  model:
    | "fal-ai/veo3"
    | "fal-ai/kling-video/v2/master/text-to-video"
    | "fal-ai/kling-video/v2/master/image-to-video"
    | "fal-ai/luma-dream-machine";
  aspect_ratio: "16:9" | "9:16" | "1:1";
  duration_s: 5 | 8 | 10;
  image_url?: string;
};

const FAL_VIDEO_MODELS: VideoGenerationInput["model"][] = [
  "fal-ai/kling-video/v2/master/text-to-video",
  "fal-ai/kling-video/v2/master/image-to-video",
  "fal-ai/luma-dream-machine",
  "fal-ai/veo3",
];

export type VideoGenerationResult =
  | {
      ok: true;
      status: "processing";
      model: VideoGenerationInput["model"];
      duration_s: VideoGenerationInput["duration_s"];
      request_id: string;
      status_url: string;
      response_url: string;
      check_instruction: string;
    }
  | {
      ok: true;
      status: "completed";
      video_url: string;
      model: VideoGenerationInput["model"];
      duration_s: VideoGenerationInput["duration_s"];
      request_id: string;
    }
  | { ok: false; error: string };

export type VideoCheckInput = {
  model?: VideoGenerationInput["model"];
  request_id: string;
  status_url?: string;
  response_url?: string;
};

export type VideoCheckResult =
  | { ok: true; status: "processing"; request_id: string; model: VideoGenerationInput["model"]; provider_status?: string }
  | { ok: true; status: "completed"; request_id: string; model: VideoGenerationInput["model"]; video_url: string }
  | { ok: false; status: "failed"; request_id?: string; model?: VideoGenerationInput["model"]; error: string };

type FalCandidate = {
  model: VideoGenerationInput["model"];
  statusUrl: string;
  responseUrl: string;
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function candidateBases(model: VideoGenerationInput["model"]) {
  const parts = model.split("/");
  return unique([
    model,
    parts.length > 2 ? parts.slice(0, -1).join("/") : model,
    parts.length > 3 ? parts.slice(0, 3).join("/") : model,
    parts.slice(0, 2).join("/"),
  ]);
}

function buildCandidates(body: VideoCheckInput, requestId: string): FalCandidate[] {
  const models = body.model ? [body.model] : FAL_VIDEO_MODELS;
  const candidates: FalCandidate[] = [];
  if (body.status_url || body.response_url) {
    candidates.push({
      model: body.model ?? "fal-ai/kling-video/v2/master/text-to-video",
      statusUrl: body.status_url ?? `${body.response_url}/status`,
      responseUrl: body.response_url ?? body.status_url!.replace(/\/status\/?$/, ""),
    });
  }
  for (const model of models) {
    for (const base of candidateBases(model)) {
      candidates.push({
        model,
        statusUrl: `https://queue.fal.run/${base}/requests/${requestId}/status`,
        responseUrl: `https://queue.fal.run/${base}/requests/${requestId}`,
      });
    }
  }
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = `${c.statusUrl}|${c.responseUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readStatus(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  const raw = obj.status ?? obj.state;
  return typeof raw === "string" ? raw.toUpperCase() : undefined;
}

function readError(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const err = (payload as Record<string, unknown>).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") return (err as { message: string }).message;
  return undefined;
}

function findVideoUrl(payload: unknown, depth = 0): string | undefined {
  if (depth > 5 || !payload) return undefined;
  if (typeof payload === "string") return /^https?:\/\//.test(payload) ? payload : undefined;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findVideoUrl(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  for (const key of ["video_url", "url"]) {
    const value = obj[key];
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  }
  for (const value of Object.values(obj)) {
    const found = findVideoUrl(value, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export async function generateFalVideo(
  body: VideoGenerationInput,
  apiKey: string | undefined,
): Promise<VideoGenerationResult> {
  if (!apiKey) return { ok: false, error: "FAL_KEY non configurée côté serveur." };

  const isI2V = body.model.includes("image-to-video");
  if (isI2V && !body.image_url) return { ok: false, error: "image_url requis pour image-to-video" };

  // Kling master n'accepte QUE 5 ou 10 secondes — on clamp 8 → 10
  const isKlingMaster = body.model.includes("kling-video/v2/master");
  const safeDuration: 5 | 8 | 10 =
    isKlingMaster && body.duration_s === 8 ? 10 : body.duration_s;

  const input: Record<string, unknown> = {
    prompt: body.prompt,
    duration: String(safeDuration),
  };
  // Kling i2v déduit le ratio de l'image — ne PAS envoyer aspect_ratio (cause 422)
  if (!isI2V) input.aspect_ratio = body.aspect_ratio;
  if (body.image_url) input.image_url = body.image_url;

  try {
    const submit = await fetch(`https://queue.fal.run/${body.model}`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!submit.ok) {
      const t = await submit.text().catch(() => "");
      return { ok: false, error: `fal submit ${submit.status}: ${t.slice(0, 250)}` };
    }
    const sub = (await submit.json()) as {
      request_id: string;
      status_url: string;
      response_url: string;
    };

    return {
      ok: true,
      status: "processing",
      model: body.model,
      duration_s: safeDuration,
      request_id: sub.request_id,
      status_url: sub.status_url,
      response_url: sub.response_url,
      check_instruction: `La génération est lancée. Ne relance PAS video_generate. Vérifie plus tard avec video_check({ request_id: "${sub.request_id}", model: "${body.model}", status_url: "${sub.status_url}", response_url: "${sub.response_url}" }).`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fal generation failed" };
  }
}

export async function checkFalVideo(
  body: VideoCheckInput,
  apiKey: string | undefined,
): Promise<VideoCheckResult> {
  if (!apiKey) return { ok: false, status: "failed", error: "FAL_KEY non configurée côté serveur." };
  const requestId = body.request_id.trim();
  if (!requestId) return { ok: false, status: "failed", error: "request_id requis" };

  const candidates = buildCandidates(body, requestId);
  let lastError = "Aucune route Fal n'a reconnu ce request_id.";
  try {
    for (const candidate of candidates) {
      const s = await fetch(candidate.statusUrl, { headers: { Authorization: `Key ${apiKey}` } });
      if (!s.ok) {
        const t = await s.text().catch(() => "");
        lastError = `fal status ${s.status}: ${t.slice(0, 200)}`;
        continue;
      }
      const statusJson = await s.json().catch(() => ({}));
      const status = readStatus(statusJson);
      const statusVideoUrl = findVideoUrl(statusJson);
      if (statusVideoUrl) return { ok: true, status: "completed", request_id: requestId, model: candidate.model, video_url: statusVideoUrl };
      if (!status) {
        lastError = "fal status: réponse sans statut exploitable";
        continue;
      }
      if (status === "FAILED" || status === "ERROR") {
        return { ok: false, status: "failed", request_id: requestId, model: candidate.model, error: readError(statusJson) ?? "fal job FAILED" };
      }
      if (status !== "COMPLETED") {
        return { ok: true, status: "processing", request_id: requestId, model: candidate.model, provider_status: status ?? "UNKNOWN" };
      }

      const r = await fetch(candidate.responseUrl, { headers: { Authorization: `Key ${apiKey}` } });
      if (!r.ok) {
        lastError = `fal response ${r.status}`;
        continue;
      }
      const result = await r.json().catch(() => ({}));
      const videoUrl = findVideoUrl(result);
      if (videoUrl) return { ok: true, status: "completed", request_id: requestId, model: candidate.model, video_url: videoUrl };
      lastError = "fal: pas d'URL vidéo renvoyée";
    }
    return { ok: false, status: "failed", request_id: requestId, model: body.model, error: lastError };
  } catch (e) {
    return { ok: false, status: "failed", request_id: requestId, model: body.model, error: e instanceof Error ? e.message : "fal check failed" };
  }
}

export async function checkFalVideoAnyModel(
  requestId: string,
  apiKey: string | undefined,
): Promise<VideoCheckResult> {
  return checkFalVideo({ request_id: requestId }, apiKey);
}