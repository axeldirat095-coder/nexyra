/**
 * LOT 24 — Outils image / capture BYOK
 *
 *  - screenshot_capture : capture URL → PNG via ScreenshotOne (BYOK).
 *  - image_remove_bg    : retire le fond (Remove.bg prioritaire, fallback ClipDrop).
 *  - image_upscale      : upscale via fal.ai clarity-upscaler (2x/4x/16x).
 */
import type { ToolResult, FsMutation } from "./agent-tools.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export const LOT24_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "screenshot_capture",
      description:
        "Capture une URL en PNG/JPG full-page via ScreenshotOne (BYOK `screenshotone_access_key`). Retourne dataUrl base64 + sauvegarde optionnelle dans le VFS si `target_path` fourni. Idéal pour previews, mockups, références visuelles.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL https à capturer." },
          full_page: { type: "boolean", description: "Capture full-page (défaut true)." },
          viewport_width: { type: "number", description: "Défaut 1280." },
          viewport_height: { type: "number", description: "Défaut 800." },
          format: { type: "string", enum: ["png", "jpg", "webp"], description: "Défaut png." },
          target_path: { type: "string", description: "Chemin VFS pour sauvegarder (ex: src/assets/screenshot.png)." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_remove_bg",
      description:
        "Retire le fond d'une image. Cascade : Remove.bg (`removebg_api_key`) → ClipDrop (`clipdrop_api_key`). Retourne PNG transparent dataUrl + écrit dans VFS si `target_path`.",
      parameters: {
        type: "object",
        properties: {
          image_url: { type: "string", description: "URL https de l'image source." },
          target_path: { type: "string", description: "Chemin VFS (ex: src/assets/cutout.png)." },
        },
        required: ["image_url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_upscale",
      description:
        "Upscale d'image via fal.ai clarity-upscaler (BYOK `fal_api_key` ou env FAL_KEY). Facteur 2x, 4x, ou 16x (16x = 4x→4x séquentiel). Retourne URL upscaled.",
      parameters: {
        type: "object",
        properties: {
          image_url: { type: "string", description: "URL https de l'image source." },
          scale: { type: "number", enum: [2, 4, 16], description: "Facteur d'upscale. Défaut 4." },
          creativity: { type: "number", description: "0.0-0.5, défaut 0.35." },
        },
        required: ["image_url"],
        additionalProperties: false,
      },
    },
  },
] as const;

async function fetchUserKey(sb: SupabaseLike, userId: string, service: string): Promise<string | null> {
  const { data } = await sb.rpc("get_external_key_decrypted", {
    _owner_id: userId,
    _service: service,
  });
  return typeof data === "string" && data.length > 0 ? data : null;
}

function markUsed(sb: SupabaseLike, userId: string, service: string): void {
  void sb.rpc("mark_external_key_used", { _owner_id: userId, _service: service }).then(() => undefined);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bufferToDataUrl(buf: ArrayBuffer, mime: string): Promise<string> {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return `data:${mime};base64,${b64}`;
}

// ---------- screenshot_capture ----------

async function runScreenshotCapture(
  args: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
  sb: SupabaseLike,
  userId: string,
): Promise<ToolResult> {
  const url = String(args.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, output: "screenshot_capture: 'url' http(s) requise." };
  const accessKey = await fetchUserKey(sb, userId, "screenshotone_access_key");
  if (!accessKey) {
    return { ok: false, output: "screenshot_capture: clé `screenshotone_access_key` requise (https://screenshotone.com)." };
  }
  const format = (args.format === "jpg" || args.format === "webp" ? args.format : "png") as string;
  const params = new URLSearchParams({
    access_key: accessKey,
    url,
    format,
    full_page: String(args.full_page !== false),
    viewport_width: String(args.viewport_width ?? 1280),
    viewport_height: String(args.viewport_height ?? 800),
    block_ads: "true",
    block_cookie_banners: "true",
  });
  try {
    const res = await fetch(`https://api.screenshotone.com/take?${params.toString()}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, output: `screenshot_capture: HTTP ${res.status} — ${txt.slice(0, 120)}` };
    }
    const buf = await res.arrayBuffer();
    const mime = format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    const dataUrl = await bufferToDataUrl(buf, mime);
    markUsed(sb, userId, "screenshotone_access_key");

    const targetPath = args.target_path ? String(args.target_path) : null;
    if (targetPath) {
      const moduleSrc = `// Capture ScreenshotOne — ne pas éditer.\nconst img: string = ${JSON.stringify(dataUrl)};\nexport default img;\n`;
      vfs.set(targetPath, moduleSrc);
      mutations.push({ op: "write", path: targetPath, content: moduleSrc });
    }
    return {
      ok: true,
      output: `📸 Screenshot capturé (${format}, ${(buf.byteLength / 1024).toFixed(1)} KB) — ${url}${targetPath ? `\n→ écrit dans ${targetPath}` : ""}\n${dataUrl.slice(0, 80)}…`,
    };
  } catch (e) {
    return { ok: false, output: `screenshot_capture: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- image_remove_bg ----------

async function runRemoveBg(
  args: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
  sb: SupabaseLike,
  userId: string,
): Promise<ToolResult> {
  const imageUrl = String(args.image_url ?? "").trim();
  if (!/^https?:\/\//i.test(imageUrl)) return { ok: false, output: "image_remove_bg: 'image_url' http(s) requise." };

  const removeBgKey = await fetchUserKey(sb, userId, "removebg_api_key");
  const clipdropKey = !removeBgKey ? await fetchUserKey(sb, userId, "clipdrop_api_key") : null;
  if (!removeBgKey && !clipdropKey) {
    return { ok: false, output: "image_remove_bg: clé `removebg_api_key` ou `clipdrop_api_key` requise." };
  }

  let pngBuf: ArrayBuffer;
  let providerUsed: string;
  try {
    if (removeBgKey) {
      const res = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": removeBgKey, "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, size: "auto", format: "png" }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return { ok: false, output: `image_remove_bg (remove.bg): HTTP ${res.status} — ${txt.slice(0, 120)}` };
      }
      pngBuf = await res.arrayBuffer();
      providerUsed = "remove.bg";
      markUsed(sb, userId, "removebg_api_key");
    } else {
      // ClipDrop : multipart avec image_file fetched
      const srcRes = await fetch(imageUrl);
      if (!srcRes.ok) return { ok: false, output: `image_remove_bg: source HTTP ${srcRes.status}` };
      const srcBuf = await srcRes.arrayBuffer();
      const fd = new FormData();
      fd.append("image_file", new Blob([srcBuf]), "image.png");
      const res = await fetch("https://clipdrop-api.co/remove-background/v1", {
        method: "POST",
        headers: { "x-api-key": clipdropKey! },
        body: fd,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return { ok: false, output: `image_remove_bg (clipdrop): HTTP ${res.status} — ${txt.slice(0, 120)}` };
      }
      pngBuf = await res.arrayBuffer();
      providerUsed = "clipdrop";
      markUsed(sb, userId, "clipdrop_api_key");
    }
  } catch (e) {
    return { ok: false, output: `image_remove_bg: ${e instanceof Error ? e.message : "erreur"}` };
  }

  const dataUrl = await bufferToDataUrl(pngBuf, "image/png");
  const targetPath = args.target_path ? String(args.target_path) : null;
  if (targetPath) {
    const moduleSrc = `// Cutout ${providerUsed} — ne pas éditer.\nconst img: string = ${JSON.stringify(dataUrl)};\nexport default img;\n`;
    vfs.set(targetPath, moduleSrc);
    mutations.push({ op: "write", path: targetPath, content: moduleSrc });
  }
  return {
    ok: true,
    output: `✂️ Fond retiré (${providerUsed}, ${(pngBuf.byteLength / 1024).toFixed(1)} KB)${targetPath ? ` → ${targetPath}` : ""}\n${dataUrl.slice(0, 80)}…`,
  };
}

// ---------- image_upscale (fal.ai clarity-upscaler) ----------

async function runUpscaleOnce(
  imageUrl: string,
  scale: 2 | 4,
  creativity: number,
  falKey: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const submitRes = await fetch("https://queue.fal.run/fal-ai/clarity-upscaler", {
    method: "POST",
    headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      scale_factor: scale,
      creativity,
      resemblance: 1.5,
      num_inference_steps: 18,
    }),
  });
  if (!submitRes.ok) {
    const txt = await submitRes.text().catch(() => "");
    return { ok: false, error: `submit HTTP ${submitRes.status}: ${txt.slice(0, 120)}` };
  }
  const submit = (await submitRes.json()) as { request_id?: string; status_url?: string; response_url?: string };
  if (!submit.request_id) return { ok: false, error: "no request_id" };
  const statusUrl = submit.status_url ?? `https://queue.fal.run/fal-ai/clarity-upscaler/requests/${submit.request_id}/status`;
  const responseUrl = submit.response_url ?? `https://queue.fal.run/fal-ai/clarity-upscaler/requests/${submit.request_id}`;

  for (let i = 0; i < 60; i++) {
    await sleep(2500);
    const sRes = await fetch(statusUrl, { headers: { Authorization: `Key ${falKey}` } });
    if (!sRes.ok) continue;
    const s = (await sRes.json()) as { status?: string };
    if (s.status === "COMPLETED") {
      const rRes = await fetch(responseUrl, { headers: { Authorization: `Key ${falKey}` } });
      if (!rRes.ok) return { ok: false, error: `response HTTP ${rRes.status}` };
      const r = (await rRes.json()) as { image?: { url?: string } };
      const url = r.image?.url;
      if (!url) return { ok: false, error: "no image url in response" };
      return { ok: true, url };
    }
    if (s.status === "FAILED") return { ok: false, error: "FAILED" };
  }
  return { ok: false, error: "timeout (>2.5min)" };
}

async function runImageUpscale(
  args: Record<string, unknown>,
  sb: SupabaseLike,
  userId: string,
): Promise<ToolResult> {
  const imageUrl = String(args.image_url ?? "").trim();
  if (!/^https?:\/\//i.test(imageUrl)) return { ok: false, output: "image_upscale: 'image_url' http(s) requise." };
  const requestedScale = Number(args.scale ?? 4);
  const scale = (requestedScale === 2 ? 2 : requestedScale === 16 ? 16 : 4) as 2 | 4 | 16;
  const creativity = Math.max(0, Math.min(0.5, Number(args.creativity ?? 0.35)));

  const falKey = (await fetchUserKey(sb, userId, "fal_api_key")) ?? process.env.FAL_KEY ?? null;
  if (!falKey) {
    return { ok: false, output: "image_upscale: clé `fal_api_key` (BYOK) ou env FAL_KEY requise." };
  }

  try {
    if (scale === 16) {
      const r1 = await runUpscaleOnce(imageUrl, 4, creativity, falKey);
      if (!r1.ok) return { ok: false, output: `image_upscale (pass1 4x): ${r1.error}` };
      const r2 = await runUpscaleOnce(r1.url, 4, creativity, falKey);
      if (!r2.ok) return { ok: false, output: `image_upscale (pass2 4x): ${r2.error}` };
      markUsed(sb, userId, "fal_api_key");
      return { ok: true, output: `🔍 Upscale 16x (4x→4x) terminé\n→ ${r2.url}` };
    }
    const r = await runUpscaleOnce(imageUrl, scale, creativity, falKey);
    if (!r.ok) return { ok: false, output: `image_upscale: ${r.error}` };
    markUsed(sb, userId, "fal_api_key");
    return { ok: true, output: `🔍 Upscale ${scale}x terminé\n→ ${r.url}` };
  } catch (e) {
    return { ok: false, output: `image_upscale: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

export async function executeLot24Tool(
  name: string,
  rawArgs: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
  supabaseClient: unknown,
  userId: string,
): Promise<ToolResult | null> {
  if (!userId) return null;
  if (name === "screenshot_capture") return runScreenshotCapture(rawArgs, vfs, mutations, supabaseClient, userId);
  if (name === "image_remove_bg") return runRemoveBg(rawArgs, vfs, mutations, supabaseClient, userId);
  if (name === "image_upscale") return runImageUpscale(rawArgs, supabaseClient, userId);
  return null;
}
