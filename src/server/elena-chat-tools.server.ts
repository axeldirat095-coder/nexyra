/**
 * Outils Elena côté chat libre (/api/elena-chat).
 *
 * Sous-ensemble des tools de l'agent v2 qui ne dépendent PAS d'une VFS / sandbox :
 * - python_exec, node_exec, pixel_diff
 * - video_generate (proxy vers /api/video-generate)
 * - claude_reasoning (BYOK Anthropic via /api/claude-message)
 * - image_memory_store / image_memory_search (CLIP fal.ai + pgvector)
 * - voice_realtime_session, avatar_session (mint token, UI à venir côté chat)
 *
 * Format : compatible OpenAI tools (functions) + executor pur.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ToolCtx = {
  origin: string;
  bearer: string; // user JWT pour proxifier les routes internes
  userId: string;
  sb: SupabaseClient;
  sbAdmin: SupabaseClient;
  falKey: string | null;
};

export type OpenAITool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export const elenaChatTools: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "python_exec",
      description:
        "Exécute du Python 3.10 via un runner externe (Piston). Stdlib only, pas de pip. ~1-3s de latence.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Code Python à exécuter." },
          stdin: { type: "string", default: "" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "node_exec",
      description:
        "Exécute du JavaScript pur dans un sandbox isolé (pas de fetch/require/process). Idéal calculs/parsing/tests. Timeout 3s.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string" },
          timeout_ms: { type: "number", default: 3000, minimum: 100, maximum: 10000 },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "video_generate",
      description:
        "Lance une vidéo courte (5-10s) via fal.ai. Coût réel : ne l'appelle qu'UNE FOIS par vidéo. " +
        "Renvoie request_id/status processing ; ensuite utiliser video_check, jamais relancer video_generate.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          model: {
            type: "string",
            enum: [
              "fal-ai/veo3",
              "fal-ai/kling-video/v2/master/text-to-video",
              "fal-ai/kling-video/v2/master/image-to-video",
              "fal-ai/luma-dream-machine",
            ],
            default: "fal-ai/kling-video/v2/master/text-to-video",
          },
          aspect_ratio: { type: "string", enum: ["16:9", "9:16", "1:1"], default: "16:9" },
          duration_s: { type: "number", enum: [5, 8, 10], default: 5 },
          image_url: { type: "string" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "video_check",
      description:
        "Vérifie une génération vidéo déjà lancée avec request_id. Ne crée pas de nouvelle vidéo et évite les coûts en double.",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string" },
          status_url: { type: "string" },
          response_url: { type: "string" },
          model: {
            type: "string",
            enum: [
              "fal-ai/veo3",
              "fal-ai/kling-video/v2/master/text-to-video",
              "fal-ai/kling-video/v2/master/image-to-video",
              "fal-ai/luma-dream-machine",
            ],
          },
        },
        required: ["request_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "claude_reasoning",
      description:
        "Délègue une tâche de raisonnement lourde / long contexte à Claude 3.5 Sonnet (BYOK Anthropic). " +
        "Utilise quand un avis externe est utile (relecture critique, plan stratégique long).",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          system: { type: "string" },
          max_tokens: { type: "number", default: 2000, minimum: 100, maximum: 8000 },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pixel_diff",
      description:
        "Compare deux PNG (URLs http(s) ou data:image/png;base64) — renvoie ratio de pixels différents.",
      parameters: {
        type: "object",
        properties: {
          before_url: { type: "string" },
          after_url: { type: "string" },
          threshold: { type: "number", default: 0.1, minimum: 0, maximum: 1 },
        },
        required: ["before_url", "after_url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_memory_store",
      description:
        "Mémorise une image dans la mémoire visuelle de l'utilisateur (embedding CLIP via fal.ai).",
      parameters: {
        type: "object",
        properties: {
          image_url: { type: "string" },
          caption: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["image_url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_memory_search",
      description: "Recherche les k images les plus proches d'une image donnée dans la mémoire.",
      parameters: {
        type: "object",
        properties: {
          image_url: { type: "string" },
          k: { type: "number", default: 5, minimum: 1, maximum: 20 },
        },
        required: ["image_url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "voice_realtime_session",
      description:
        "Mint un client_secret OpenAI Realtime pour ouvrir un appel vocal temps réel côté UI. Renvoie le token.",
      parameters: {
        type: "object",
        properties: {
          voice: {
            type: "string",
            enum: ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"],
            default: "verse",
          },
          instructions: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "avatar_session",
      description:
        "Mint un token streaming HeyGen pour afficher un avatar parlant côté UI. Renvoie le token.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "file_create",
      description:
        "Génère un fichier téléchargeable (texte/JSON/CSV/Markdown/HTML/XML/SVG ou binaire base64) et l'attache au chat. Retourne `download_url` (lien signé fiable) + `url`. Utilise-le dès que l'utilisateur demande un export, un copié-collé de la conversation, un JSON, un .txt, un .csv, etc. Réponds ensuite avec un lien markdown `[⬇ Télécharger nom](download_url)`. Ne propose jamais GitHub pour un simple téléchargement.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "Ex: `conversation.txt`, `export.json`." },
          content: { type: "string", description: "Contenu texte (UTF-8). Obligatoire si pas de content_base64." },
          content_base64: { type: "string", description: "Contenu binaire base64 (sans préfixe data:). Prioritaire sur content." },
          mime_type: { type: "string", description: "Deviné depuis l'extension si absent." },
        },
        required: ["filename"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pdf_create",
      description:
        "Crée un PDF stylé (cover + sections) et l'attache au chat. Retourne `download_url` (lien signé fiable) + `url`. Réponds avec un lien markdown `[⬇ Télécharger le PDF](download_url)`. Ne propose jamais GitHub pour un simple téléchargement.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string" },
          title: { type: "string" },
          subtitle: { type: "string" },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: { heading: { type: "string" }, body: { type: "string" } },
            },
          },
          accent_color: { type: "string" },
          footer: { type: "string" },
        },
        required: ["title", "sections"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "docx_create",
      description: "Crée un .docx (Word) titre + paragraphes et l'attache au chat. Retourne `download_url` (lien signé fiable) + `url`. Réponds avec un lien markdown vers `download_url`.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string" },
          title: { type: "string" },
          paragraphs: { type: "array", items: { type: "string" } },
        },
        required: ["paragraphs"],
      },
    },
  },
];

// ─────────────────────────── Implémentations ───────────────────────────

async function runNodeSandbox(code: string, timeoutMs = 3000) {
  // SECURITY: never execute AI-generated JS in-process. Delegate to Piston's
  // isolated Node runtime — same external sandbox we use for Python.
  try {
    const r = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: "javascript",
        version: "18.15.0",
        files: [{ content: code }],
        run_timeout: Math.max(500, Math.min(timeoutMs, 10_000)),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { ok: false, error: `Piston ${r.status}`, logs: [] as string[] };
    const j = (await r.json()) as { run?: { stdout?: string; stderr?: string; code?: number } };
    const stdout = j.run?.stdout ?? "";
    const stderr = j.run?.stderr ?? "";
    const logs = [stdout, stderr].filter(Boolean);
    if ((j.run?.code ?? 0) !== 0) return { ok: false, error: stderr || "exit non-zero", logs };
    return { ok: true, result: stdout.trim() || null, logs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), logs: [] as string[] };
  }
}

async function runPythonPiston(code: string, stdin = "") {
  try {
    const r = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: "python",
        version: "3.10.0",
        files: [{ content: code }],
        stdin,
        run_timeout: 5000,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { ok: false, error: `Piston ${r.status}` };
    const j = (await r.json()) as { run?: { stdout?: string; stderr?: string; code?: number } };
    return {
      ok: (j.run?.code ?? 0) === 0,
      stdout: j.run?.stdout ?? "",
      stderr: j.run?.stderr ?? "",
      exit_code: j.run?.code ?? 0,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

async function runPixelDiff(beforeUrl: string, afterUrl: string, threshold = 0.1) {
  try {
    const [{ default: pixelmatch }, { PNG }] = await Promise.all([
      import("pixelmatch"),
      import("pngjs"),
    ]);
    async function loadPng(src: string) {
      let buf: Uint8Array;
      if (src.startsWith("data:")) {
        const b64 = src.split(",")[1] ?? "";
        buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      } else {
        const r = await fetch(src, { signal: AbortSignal.timeout(10_000) });
        if (!r.ok) throw new Error(`fetch ${src} → ${r.status}`);
        buf = new Uint8Array(await r.arrayBuffer());
      }
      return PNG.sync.read(Buffer.from(buf));
    }
    const [a, b] = await Promise.all([loadPng(beforeUrl), loadPng(afterUrl)]);
    if (a.width !== b.width || a.height !== b.height) {
      return { ok: false, error: `Size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}` };
    }
    const diff = new PNG({ width: a.width, height: a.height });
    const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold });
    const total = a.width * a.height;
    return {
      ok: true,
      width: a.width,
      height: a.height,
      changed_pixels: changed,
      total_pixels: total,
      diff_ratio: Number((changed / total).toFixed(4)),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function clipEmbed(imageUrl: string, falKey: string): Promise<number[] | null> {
  try {
    const r = await fetch("https://fal.run/fal-ai/clip-vit-large-patch14", {
      method: "POST",
      headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { embedding?: number[]; image_embedding?: number[] };
    const vec = j.embedding ?? j.image_embedding ?? null;
    if (!vec || vec.length === 0) return null;
    if (vec.length === 512) return vec;
    if (vec.length > 512) return vec.slice(0, 512);
    return [...vec, ...new Array(512 - vec.length).fill(0)];
  } catch {
    return null;
  }
}

// ─────────────────────────── File attach helpers ───────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", markdown: "text/markdown",
  json: "application/json", csv: "text/csv", tsv: "text/tab-separated-values",
  html: "text/html", htm: "text/html", xml: "application/xml", yaml: "application/yaml",
  yml: "application/yaml", svg: "image/svg+xml", log: "text/plain",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

const ARTIFACT_BUCKET = "chat-uploads";
const ARTIFACT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

function sanitizeFilename(name: string, fallbackExt: string): string {
  const base = String(name || "").trim().replace(/[^\w.\-]+/g, "_").slice(0, 100);
  if (!base) return `fichier-${Date.now()}.${fallbackExt}`;
  return /\.[a-z0-9]{1,8}$/i.test(base) ? base : `${base}.${fallbackExt}`;
}

async function uploadArtifact(
  ctx: ToolCtx,
  filename: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<
  | {
      ok: true;
      url: string;
      download_url: string;
      public_url: string;
      storage_path: string;
      filename: string;
      bytes: number;
      mime_type: string;
      expires_at: string;
    }
  | { ok: false; error: string }
> {
  const ts = Date.now();
  const path = `elena-artifacts/${ctx.userId}/${ts}-${filename}`;
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  const { error } = await ctx.sbAdmin.storage
    .from(ARTIFACT_BUCKET)
    .upload(path, blob, { contentType: mimeType, upsert: false });
  if (error) return { ok: false, error: `upload ${ARTIFACT_BUCKET}: ${error.message}` };
  const { data: publicData } = ctx.sbAdmin.storage.from(ARTIFACT_BUCKET).getPublicUrl(path);
  const { data: signedData, error: signedError } = await ctx.sbAdmin.storage
    .from(ARTIFACT_BUCKET)
    .createSignedUrl(path, ARTIFACT_SIGNED_URL_TTL_SECONDS, { download: filename });
  if (signedError || !signedData?.signedUrl) {
    return { ok: false, error: `lien téléchargement: ${signedError?.message ?? "signature impossible"}` };
  }
  const expiresAt = new Date(Date.now() + ARTIFACT_SIGNED_URL_TTL_SECONDS * 1000).toISOString();
  return {
    ok: true,
    url: signedData.signedUrl,
    download_url: signedData.signedUrl,
    public_url: publicData.publicUrl,
    storage_path: path,
    filename,
    bytes: bytes.length,
    mime_type: mimeType,
    expires_at: expiresAt,
  };
}


// ─────────────────────────── Dispatcher ───────────────────────────

export async function executeElenaChatTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolCtx,
): Promise<unknown> {
  switch (name) {
    case "node_exec":
      return runNodeSandbox(String(args.code ?? ""), Number(args.timeout_ms ?? 3000));

    case "python_exec":
      return runPythonPiston(String(args.code ?? ""), String(args.stdin ?? ""));

    case "pixel_diff":
      return runPixelDiff(
        String(args.before_url ?? ""),
        String(args.after_url ?? ""),
        Number(args.threshold ?? 0.1),
      );

    case "video_generate": {
      const { generateFalVideo } = await import("@/server/video-generation.server");
      return generateFalVideo(
        {
          prompt: String(args.prompt ?? ""),
          model: (args.model as never) ?? "fal-ai/kling-video/v2/master/text-to-video",
          aspect_ratio: (args.aspect_ratio as never) ?? "16:9",
          duration_s: (args.duration_s as never) ?? 5,
          ...(typeof args.image_url === "string" ? { image_url: args.image_url } : {}),
        },
        ctx.falKey ?? undefined,
      );
    }

    case "video_check": {
      const { checkFalVideo } = await import("@/server/video-generation.server");
      return checkFalVideo(
        {
          request_id: String(args.request_id ?? ""),
          ...(typeof args.model === "string" ? { model: args.model as never } : {}),
          ...(typeof args.status_url === "string" ? { status_url: args.status_url } : {}),
          ...(typeof args.response_url === "string" ? { response_url: args.response_url } : {}),
        },
        ctx.falKey ?? undefined,
      );
    }

    case "claude_reasoning": {
      const r = await fetch(`${ctx.origin}/api/claude-message`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return await r.json();
    }

    case "voice_realtime_session": {
      const r = await fetch(`${ctx.origin}/api/realtime-session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return await r.json();
    }

    case "avatar_session": {
      const r = await fetch(`${ctx.origin}/api/heygen-session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ctx.bearer}` },
      });
      return await r.json();
    }

    case "image_memory_store": {
      if (!ctx.falKey) return { ok: false, error: "FAL_KEY non configurée" };
      const imageUrl = String(args.image_url ?? "");
      const emb = await clipEmbed(imageUrl, ctx.falKey);
      if (!emb) return { ok: false, error: "Échec embedding CLIP" };
      const { data, error } = await ctx.sb
        .from("image_memories" as never)
        .insert({
          owner_id: ctx.userId,
          image_url: imageUrl,
          caption: args.caption ?? null,
          tags: args.tags ?? [],
          embedding: `[${emb.join(",")}]`,
        } as never)
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: (data as { id: string }).id };
    }

    case "image_memory_search": {
      if (!ctx.falKey) return { ok: false, error: "FAL_KEY non configurée" };
      const emb = await clipEmbed(String(args.image_url ?? ""), ctx.falKey);
      if (!emb) return { ok: false, error: "Échec embedding CLIP" };
      const { data, error } = await ctx.sb.rpc("match_image_memories" as never, {
        _owner_id: ctx.userId,
        _query_embedding: `[${emb.join(",")}]` as never,
        _match_count: Number(args.k ?? 5),
      } as never);
      if (error) return { ok: false, error: error.message };
      return { ok: true, matches: data ?? [] };
    }

    case "file_create": {
      const b64 = typeof args.content_base64 === "string" ? args.content_base64 : null;
      const text = typeof args.content === "string" ? args.content : null;
      if (!b64 && text == null) return { ok: false, error: "file_create: `content` ou `content_base64` requis." };
      const ext = String(args.filename ?? "").split(".").pop()?.toLowerCase() ?? "txt";
      const filename = sanitizeFilename(String(args.filename ?? ""), ext || "txt");
      const finalExt = filename.split(".").pop()?.toLowerCase() ?? "txt";
      const mime = String(args.mime_type ?? "") || MIME_BY_EXT[finalExt] || "application/octet-stream";
      let bytes: Uint8Array;
      try {
        if (b64) {
          const clean = b64.includes(",") ? b64.split(",")[1] : b64;
          bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
        } else {
          bytes = new TextEncoder().encode(text ?? "");
        }
      } catch (e) {
        return { ok: false, error: `decode: ${e instanceof Error ? e.message : String(e)}` };
      }
      return uploadArtifact(ctx, filename, bytes, mime);
    }

    case "pdf_create": {
      try {
        const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
        const title = String(args.title ?? "Document");
        const subtitle = args.subtitle ? String(args.subtitle) : "";
        const sections = (args.sections as Array<{ heading?: string; body?: string }>) ?? [];
        const footer = args.footer ? String(args.footer) : "";
        const accent = String(args.accent_color ?? "#3B82F6").replace("#", "");
        const r = parseInt(accent.slice(0, 2), 16) / 255;
        const g = parseInt(accent.slice(2, 4), 16) / 255;
        const b = parseInt(accent.slice(4, 6), 16) / 255;
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
        const PAGE_W = 595, PAGE_H = 842, MARGIN = 50;
        const wrap = (t: string, maxW: number, size: number, f: typeof font): string[] => {
          const lines: string[] = [];
          for (const para of t.split("\n")) {
            const words = para.split(/\s+/);
            let cur = "";
            for (const w of words) {
              const test = cur ? `${cur} ${w}` : w;
              if (f.widthOfTextAtSize(test, size) > maxW) { if (cur) lines.push(cur); cur = w; }
              else cur = test;
            }
            if (cur) lines.push(cur);
          }
          return lines;
        };
        let page = pdf.addPage([PAGE_W, PAGE_H]);
        page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: rgb(r, g, b) });
        page.drawText(title, { x: MARGIN, y: PAGE_H - 50, size: 22, font: fontBold, color: rgb(1, 1, 1) });
        if (subtitle) page.drawText(subtitle, { x: MARGIN, y: PAGE_H - 72, size: 11, font, color: rgb(1, 1, 1) });
        let y = PAGE_H - 120;
        const nl = (n: number) => { if (y - n < MARGIN + 30) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; } };
        for (const sec of sections) {
          if (sec.heading) {
            nl(30);
            page.drawText(String(sec.heading), { x: MARGIN, y, size: 14, font: fontBold, color: rgb(r, g, b) });
            y -= 6;
            page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: PAGE_W - MARGIN, y: y - 2 }, thickness: 0.5, color: rgb(r, g, b) });
            y -= 18;
          }
          for (const ln of wrap(String(sec.body ?? ""), PAGE_W - MARGIN * 2, 11, font)) {
            nl(16);
            page.drawText(ln, { x: MARGIN, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
            y -= 15;
          }
          y -= 12;
        }
        if (footer) {
          const pages = pdf.getPages();
          for (let i = 0; i < pages.length; i++) {
            pages[i].drawText(`${footer} · ${i + 1}/${pages.length}`, { x: MARGIN, y: 25, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
          }
        }
        const bytes = await pdf.save();
        const filename = sanitizeFilename(String(args.filename ?? title ?? "document"), "pdf");
        return uploadArtifact(ctx, filename, bytes, "application/pdf");
      } catch (e) {
        return { ok: false, error: `pdf_create: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case "docx_create": {
      try {
        const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
        const paras = (args.paragraphs as string[]) ?? [];
        const children: unknown[] = [];
        if (args.title) {
          children.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: String(args.title), bold: true })],
          }));
        }
        for (const p of paras) children.push(new Paragraph({ children: [new TextRun(String(p))] }));
        const doc = new Document({ sections: [{ children: children as never }] });
        const buf = await Packer.toBuffer(doc);
        const filename = sanitizeFilename(String(args.filename ?? args.title ?? "document"), "docx");
        return uploadArtifact(
          ctx,
          filename,
          new Uint8Array(buf),
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
      } catch (e) {
        return { ok: false, error: `docx_create: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    default:
      return { ok: false, error: `Outil inconnu: ${name}` };
  }
}
