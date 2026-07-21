/**
 * Elena Agent v2 — endpoint OPT-IN propulsé par le Vercel AI SDK v5.
 *
 * 🚧 Statut : refacto progressive du loop legacy (`/api/elena-agent`, 2700 lignes).
 *    Cette route est utilisée uniquement quand l'utilisateur active
 *    `preferences.loop_engine === "ai_sdk_v5"` dans ses Settings Elena.
 *    Le legacy reste actif par défaut — pas de régression.
 *
 *  Couvre pour l'instant :
 *  - streaming texte token-par-token (toUIMessageStreamResponse).
 *  - 3 outils essentiels : `read_file`, `write_file`, `list_files` opérant sur
 *    la VFS in-memory passée par le client (mêmes contrats que le legacy).
 *  - garde-fous : auth Supabase (Bearer), validation Zod, stopWhen(50).
 *
 *  À venir (lots suivants) :
 *  - tools complets (image_generate, build_check, line_replace, …).
 *  - persistance messages.
 *  - fallback chain multi-provider.
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { buildMobileScaffold, buildScreen } from "@/lib/mobile-templates";

type VFile = { path: string; content: string };

// ─────────────────────────────────────────────────────────────────────
// Sandboxes d'exécution code
// ─────────────────────────────────────────────────────────────────────

/** JS sandbox : Function() isolé + timeout + console capturé.
 *  Pas de require/import, pas d'accès au Worker fetch (var bloquées).
 *  Suffisant pour calculs / parsing / scripts purs. */
async function runNodeSandbox(code: string, timeoutMs = 3000) {
  // SECURITY: never execute AI-generated JS in-process. Delegate to Piston's
  // isolated Node runtime (same external sandbox used for Python).
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

/** Python sandbox via Piston public API (gratuit, pas de clé).
 *  Latence ~1-3s. Si indispo, retourne ok:false. */
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

/** Pixel-diff entre deux PNG (URLs ou data:base64).
 *  Renvoie ratio de pixels différents (0..1). */
async function runPixelDiff(beforeUrl: string, afterUrl: string, threshold = 0.1) {
  async function loadPng(src: string): Promise<PNG> {
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
  try {
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

/** Embeddings CLIP via fal.ai (512-d). Renvoie le vecteur ou null. */
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
    // Truncate / pad to 512
    if (vec.length === 512) return vec;
    if (vec.length > 512) return vec.slice(0, 512);
    return [...vec, ...new Array(512 - vec.length).fill(0)];
  } catch {
    return null;
  }
}

function buildRequestSchema() {
  return z.object({
    messages: z.array(z.unknown()),
    files: z.array(z.object({ path: z.string(), content: z.string() })).default([]),
    model: z.string().default("google/gemini-3-flash-preview"),
  });
}
type RequestBody = {
  messages: unknown[];
  files: { path: string; content: string }[];
  model: string;
};

const SYSTEM_PROMPT = [
  "Tu es Elena v2 (engine: ai-sdk-v5).",
  "Tu travailles sur un mini-sandbox de fichiers (VFS) passés en contexte.",
  "Pour LIRE un fichier → utilise `read_file({ path })`.",
  "Pour LISTER les fichiers → utilise `list_files()`.",
  "Pour ÉCRIRE / CRÉER un fichier → utilise `write_file({ path, content })`.",
  "Pour EXÉCUTER du JS pur (calculs, parsing, tests) → `node_exec({ code })` (sandbox isolé, pas de fetch/require).",
  "Pour EXÉCUTER du Python (3.10) → `python_exec({ code, stdin? })` (via runner externe, ~1-3s).",
  "Pour COMPARER deux screenshots PNG (QA visuelle) → `pixel_diff({ before_url, after_url })`.",
  "Pour CRÉER une app mobile React Native (Expo) clé-en-main → `scaffold_mobile_app({ appName, tabs?, theme?, primaryColor? })` (génère ~12 fichiers dans la VFS).",
  "Pour AJOUTER un écran à l'app mobile → `add_mobile_screen({ name })` (Home/Profile/Explore reconnus, sinon générique).",
  "Pour OUVRIR un appel vocal temps réel avec l'utilisateur → `voice_realtime_session({ voice?, instructions? })` (renvoie un client_secret OpenAI Realtime à utiliser côté UI).",
  "Pour LANCER un avatar parlant HeyGen → `avatar_session()` (renvoie un token streaming).",
  "Pour MÉMORISER une image (réutilisable plus tard) → `image_memory_store({ image_url, caption?, tags? })`.",
  "Pour RETROUVER des images mémorisées similaires à une nouvelle image → `image_memory_search({ image_url, k? })`.",
  "Pour OUVRIR une session collaborative temps réel (curseurs, présences) sur une room → `collab_session({ room })` (token Liveblocks BYOK).",
  "Pour DÉLÉGUER une tâche de raisonnement lourde / long contexte à Claude 3.5 Sonnet → `claude_reasoning({ prompt, system?, max_tokens? })` (BYOK Anthropic).",
  "Pour GÉNÉRER une vidéo (text-to-video ou image-to-video, 5-10s) → `video_generate({ prompt, model?, aspect_ratio?, duration_s?, image_url? })` via fal.ai (Veo3, Kling, Luma).",
  "Réponds en français, ton 'Lovable-like' : bref, direct, orienté action.",
].join("\n");

export const Route = createFileRoute("/api/elena-chat-v2")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        // —— Auth (Bearer Supabase, on refuse l'anonyme) ——
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = auth.slice(7);
        const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
        const supabaseAnon =
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnon) {
          return new Response("Server misconfig (supabase env)", { status: 500 });
        }
        const sb = createClient(supabaseUrl, supabaseAnon, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: claims, error: claimsErr } = await sb.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub as string;
        const origin = new URL(request.url).origin;
        const falKey = process.env.FAL_KEY ?? null;

        // —— Validation payload ——
        let body: RequestBody;
        try {
          body = buildRequestSchema().parse(await request.json()) as RequestBody;
        } catch (e) {
          return new Response(`Bad request: ${e instanceof Error ? e.message : "invalid"}`, {
            status: 400,
          });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        // —— VFS mutable durant la requête (les writes restent en mémoire ;
        //    le client doit relire la réponse pour appliquer côté UI). ——
        const vfs = new Map<string, string>();
        for (const f of body.files) vfs.set(f.path, f.content);

        const tools = {
          list_files: tool({
            description: "Liste tous les fichiers présents dans la VFS du sandbox.",
            inputSchema: z.object({}),
            execute: async () => ({ paths: Array.from(vfs.keys()).sort() }),
          }),
          read_file: tool({
            description: "Lit le contenu d'un fichier de la VFS.",
            inputSchema: z.object({ path: z.string() }),
            execute: async ({ path }) => {
              const content = vfs.get(path);
              if (content === undefined) return { ok: false, error: `Not found: ${path}` };
              return { ok: true, path, content };
            },
          }),
          write_file: tool({
            description:
              "Écrit (crée ou remplace) un fichier dans la VFS. Le contenu doit être COMPLET.",
            inputSchema: z.object({
              path: z.string().min(1),
              content: z.string(),
            }),
            execute: async ({ path, content }) => {
              const op: "create" | "modify" = vfs.has(path) ? "modify" : "create";
              vfs.set(path, content);
              return { ok: true, op, path, bytes: content.length };
            },
          }),
          node_exec: tool({
            description:
              "Exécute du JavaScript pur dans un sandbox isolé (pas de fetch/require/process). " +
              "Idéal pour calculs, parsing, tests de logique. Timeout 3s. " +
              "Utilise `console.log()` pour capturer la sortie ; le `return` final est aussi récupéré.",
            inputSchema: z.object({
              code: z.string().min(1),
              timeout_ms: z.number().int().min(100).max(10_000).default(3000),
            }),
            execute: async ({ code, timeout_ms }) => runNodeSandbox(code, timeout_ms),
          }),
          python_exec: tool({
            description:
              "Exécute du Python 3.10 via un runner externe (Piston). Stdlib only, pas de pip. ~1-3s de latence.",
            inputSchema: z.object({
              code: z.string().min(1),
              stdin: z.string().default(""),
            }),
            execute: async ({ code, stdin }) => runPythonPiston(code, stdin),
          }),
          pixel_diff: tool({
            description:
              "Compare deux screenshots PNG (URLs http(s) ou data:image/png;base64,...). " +
              "Renvoie le ratio de pixels différents (0..1) — utile pour QA visuelle post-mutation.",
            inputSchema: z.object({
              before_url: z.string().min(1),
              after_url: z.string().min(1),
              threshold: z.number().min(0).max(1).default(0.1),
            }),
            execute: async ({ before_url, after_url, threshold }) =>
              runPixelDiff(before_url, after_url, threshold),
          }),
          scaffold_mobile_app: tool({
            description:
              "Crée une app mobile React Native (Expo SDK 51) complète dans la VFS : " +
              "package.json, app.json, App.tsx avec navigation par tabs, écrans, composants Card/Button/Screen, " +
              "Tailwind (NativeWind) et thème dark/light. À utiliser UNE seule fois en début de projet mobile.",
            inputSchema: z.object({
              appName: z.string().min(1),
              slug: z.string().optional(),
              theme: z.enum(["dark", "light"]).default("dark"),
              primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3B82F6"),
              tabs: z.array(z.string()).default(["Home", "Explore", "Profile"]),
            }),
            execute: async ({ appName, slug, theme, primaryColor, tabs }) => {
              const files = buildMobileScaffold({ appName, slug, theme, primaryColor, tabs });
              for (const f of files) vfs.set(f.path, f.content);
              return { ok: true, created: files.length, paths: files.map((f) => f.path) };
            },
          }),
          add_mobile_screen: tool({
            description:
              "Ajoute un écran React Native dans `src/screens/<Name>.tsx`. Reconnaît Home/Profile/Explore " +
              "et choisit un template adapté ; sinon, écran générique. À chaîner avec `write_file` " +
              "pour câbler l'écran dans `App.tsx` si besoin.",
            inputSchema: z.object({ name: z.string().regex(/^[A-Z][A-Za-z0-9]+$/) }),
            execute: async ({ name }) => {
              const file = buildScreen(name);
              vfs.set(file.path, file.content);
              return { ok: true, path: file.path, bytes: file.content.length };
            },
          }),
          voice_realtime_session: tool({
            description:
              "Mint un client_secret éphémère OpenAI Realtime pour ouvrir un appel vocal " +
              "temps réel avec l'utilisateur côté UI (WebRTC). Nécessite que l'utilisateur " +
              "ait connecté sa clé OpenAI dans Réglages → Intégrations.",
            inputSchema: z.object({
              voice: z.enum(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]).default("verse"),
              instructions: z.string().max(4000).optional(),
            }),
            execute: async ({ voice, instructions }) => {
              const r = await fetch(`${origin}/api/realtime-session`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ voice, instructions }),
              });
              return (await r.json()) as Record<string, unknown>;
            },
          }),
          avatar_session: tool({
            description:
              "Mint un token streaming HeyGen pour afficher un avatar parlant côté UI. " +
              "Nécessite HEYGEN_API_KEY (global) ou clé HeyGen utilisateur.",
            inputSchema: z.object({}),
            execute: async () => {
              const r = await fetch(`${origin}/api/heygen-session`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
              });
              return (await r.json()) as Record<string, unknown>;
            },
          }),
          image_memory_store: tool({
            description:
              "Mémorise une image dans la mémoire visuelle binaire de l'utilisateur " +
              "(embedding CLIP 512-d via fal.ai). Idéal pour rappeler plus tard " +
              "« ce visuel que j'ai déjà utilisé ».",
            inputSchema: z.object({
              image_url: z.string().url(),
              caption: z.string().max(500).optional(),
              tags: z.array(z.string()).max(20).default([]),
              project_id: z.string().uuid().optional(),
            }),
            execute: async ({ image_url, caption, tags, project_id }) => {
              if (!falKey) return { ok: false, error: "FAL_KEY non configurée" };
              const emb = await clipEmbed(image_url, falKey);
              if (!emb) return { ok: false, error: "Échec embedding CLIP (fal.ai)" };
              const { data, error } = await sb
                .from("image_memory")
                .insert({
                  owner_id: userId,
                  image_url,
                  caption: caption ?? null,
                  tags,
                  project_id: project_id ?? null,
                  source: "elena",
                  embedding: emb as unknown as string,
                })
                .select("id")
                .single();
              if (error) return { ok: false, error: error.message };
              return { ok: true, id: data.id, dim: emb.length };
            },
          }),
          image_memory_search: tool({
            description:
              "Cherche dans la mémoire visuelle de l'utilisateur les images les plus " +
              "similaires à une image donnée (embedding CLIP).",
            inputSchema: z.object({
              image_url: z.string().url(),
              k: z.number().int().min(1).max(20).default(5),
              project_id: z.string().uuid().optional(),
              min_similarity: z.number().min(0).max(1).default(0.2),
            }),
            execute: async ({ image_url, k, project_id, min_similarity }) => {
              if (!falKey) return { ok: false, error: "FAL_KEY non configurée" };
              const emb = await clipEmbed(image_url, falKey);
              if (!emb) return { ok: false, error: "Échec embedding CLIP (fal.ai)" };
              const { data, error } = await sb.rpc("match_image_memory", {
                _query: emb as unknown as string,
                _match_count: k,
                _project_id: project_id ?? null,
                _min_similarity: min_similarity,
              });
              if (error) return { ok: false, error: error.message };
              return { ok: true, matches: data ?? [] };
            },
          }),
          collab_session: tool({
            description:
              "Mint un token Liveblocks pour ouvrir une session collaborative temps réel " +
              "(curseurs, présences, multi-joueur) sur une `room`. Nécessite la clé Liveblocks BYOK.",
            inputSchema: z.object({
              room: z.string().min(1).max(200),
              permissions: z.array(z.enum(["room:write", "room:read", "room:presence:write"])).default(["room:write"]),
            }),
            execute: async ({ room, permissions }) => {
              const r = await fetch(`${origin}/api/liveblocks-auth`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ room, permissions }),
              });
              return (await r.json()) as Record<string, unknown>;
            },
          }),
          claude_reasoning: tool({
            description:
              "Délègue une tâche de raisonnement lourd ou long contexte (≥ 32k tokens, plan complexe, " +
              "audit code) à Claude 3.5 Sonnet via la clé Anthropic BYOK de l'utilisateur. " +
              "Renvoie le texte de la réponse Claude.",
            inputSchema: z.object({
              prompt: z.string().min(1).max(80_000),
              system: z.string().max(20_000).optional(),
              model: z.string().default("claude-3-5-sonnet-20241022"),
              max_tokens: z.number().int().min(1).max(8192).default(2048),
              temperature: z.number().min(0).max(1).default(0.4),
            }),
            execute: async (args) => {
              const r = await fetch(`${origin}/api/claude-message`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(args),
              });
              return (await r.json()) as Record<string, unknown>;
            },
          }),
          video_generate: tool({
            description:
              "Lance une vidéo courte (5-10s) via fal.ai. Coût réel : appelle cet outil UNE SEULE FOIS par vidéo. " +
              "Il renvoie request_id/status processing ; ensuite utilise video_check, ne relance jamais video_generate. Modèles : 'fal-ai/veo3' (top qualité), " +
              "'fal-ai/kling-video/v2/master/text-to-video' (par défaut, rapide), " +
              "'fal-ai/luma-dream-machine', ou 'fal-ai/kling-video/v2/master/image-to-video' (anim image, fournir image_url). " +
              "Renvoie un suivi, puis video_check renvoie { video_url } quand c'est terminé.",
            inputSchema: z.object({
              prompt: z.string().min(1).max(2000),
              model: z
                .enum([
                  "fal-ai/veo3",
                  "fal-ai/kling-video/v2/master/text-to-video",
                  "fal-ai/kling-video/v2/master/image-to-video",
                  "fal-ai/luma-dream-machine",
                ])
                .default("fal-ai/kling-video/v2/master/text-to-video"),
              aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
              duration_s: z.union([z.literal(5), z.literal(8), z.literal(10)]).default(5),
              image_url: z.string().url().optional(),
            }),
            execute: async (args) => {
              const r = await fetch(`${origin}/api/video-generate`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(args),
              });
              return (await r.json()) as Record<string, unknown>;
            },
          }),
          video_check: tool({
            description:
              "Vérifie une vidéo fal.ai déjà lancée avec video_generate. Ne crée PAS une nouvelle génération, donc évite les coûts en double.",
            inputSchema: z.object({
              request_id: z.string().min(1),
              model: z.enum([
                "fal-ai/veo3",
                "fal-ai/kling-video/v2/master/text-to-video",
                "fal-ai/kling-video/v2/master/image-to-video",
                "fal-ai/luma-dream-machine",
              ]).optional(),
              status_url: z.string().url().optional(),
              response_url: z.string().url().optional(),
            }),
            execute: async (args) => {
              const url = new URL(`${origin}/api/video-generate`);
              url.searchParams.set("request_id", args.request_id);
              if (args.model) url.searchParams.set("model", args.model);
              if (args.status_url) url.searchParams.set("status_url", args.status_url);
              if (args.response_url) url.searchParams.set("response_url", args.response_url);
              const r = await fetch(url.toString(), {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
              });
              return (await r.json()) as Record<string, unknown>;
            },
          }),
        };

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway(body.model);

        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          tools,
          stopWhen: stepCountIs(50),
          messages: await convertToModelMessages(body.messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
        });
      },
    },
  },
});
