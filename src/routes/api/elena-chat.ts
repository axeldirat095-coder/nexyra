import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  callWithFallback,
  logFallbackEvent,
  type ProviderName,
} from "@/server/ai-providers.server";
import { getUserProviderKey, type ProviderName as RoutingProviderName } from "@/server/llm-provider.server";
import { resolveModelForUser } from "@/server/user-ai-routing.server";
import { classifyTier, TIER_MODELS, type Tier } from "@/server/elena-tier-classifier.server";

type ElenaMode = Database["public"]["Enums"]["elena_mode"];

type IntentKind = "code" | "image" | "video" | "data" | "text";

interface ChatBody {
  conversation_id?: string;
  project_id?: string | null;
  message: string;
  mode_override?: ElenaMode;
  /** Vision multimodale + édition d'image — URLs publiques (chat-uploads). */
  images?: string[];
  /** Tiers d'intelligence — classifieur XS→XL (Cerveau d'Elena). */
  tier_auto?: boolean;
  tier_forced?: Tier | "auto" | null;
}

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function pickModel(
  mode: ElenaMode,
  s: { model_eco: string; model_standard: string; model_premium: string },
  hint: "eco" | "standard" | "premium",
): string {
  if (mode === "eco") return s.model_eco;
  if (mode === "standard") return s.model_standard;
  if (mode === "premium") return s.model_premium;
  if (hint === "premium") return s.model_premium;
  if (hint === "eco") return s.model_eco;
  return s.model_standard;
}

function detectIntentKind(text: string, hasImage: boolean = false): IntentKind {
  const t = text.toLowerCase();
  // Vidéo : génération text-to-video / image-to-video. Détecté AVANT image.
  const videoNoun =
    /\b(vid[ée]o|clip|cinemagraph|cin[ée]magraphe|gif anim[ée]|motion|boucle|loop)\b/i.test(t);
  const videoVerb =
    /\b(g[ée]n[èe]re|cr[ée]e|fais|fabrique|produis|montre|anime(?:r)?|animation|fais bouger|fait bouger|transforme.*en vid[ée]o|mets? en mouvement)\b/i.test(t);
  const videoModelHint = /\b(veo3?|kling|luma|dream\s*machine)\b/i.test(t);
  if ((videoNoun && videoVerb) || videoModelHint) return "video";
  // Image jointe + verbe d'animation = image-to-video (cinemagraph)
  if (
    hasImage &&
    /\b(anime(?:r)?|animation|fais bouger|fait bouger|mets? en mouvement|cinemagraph|cin[ée]magraphe|boucle|loop|motion)\b/i.test(t)
  )
    return "video";
  if (
    /(génère|genere|crée une image|dessine|illustration|logo|visuel|photo|picture|image de)/i.test(t) ||
    // Verbes d'édition / itération sur une image existante
    /\b(modifie|modifier|retouche|retoucher|recadre|recadrer|recolorer?|colorise|assombri|éclair|flou|net|améliore l['’ ]image|change (la|le|cette) (couleur|fond|image|photo)|même image|cette image|la photo|l['’]image)\b/i.test(t)
  )
    return "image";
  if (/(\bcode\b|composant|component|refactor|fonction|function|bug|typescript|react|api|endpoint|migration|sql|hook|class\b)/i.test(t))
    return "code";
  if (/(csv|json|tableau|dataset|statistique|analyse|métrique|metric|chart|graphique|données|data)/i.test(t))
    return "data";
  return "text";
}

// COST-OPTIMIZED routing: par défaut on tape eco. Standard et premium uniquement
// si vraie complexité détectée. Économie ciblée: -60% sur le volume.
function detectIntentLevel(text: string, kind: IntentKind): "eco" | "standard" | "premium" {
  const t = text.toLowerCase();
  // Premium réservé aux vrais sujets lourds
  if (
    /(refactor complet|architecture|migration|raisonnement|stratégie|réfléchis longuement|analyse approfondie|plan détaillé|debug complexe)/i.test(t) ||
    text.length > 1200
  )
    return "premium";
  // Standard pour data/image (besoin de précision modérée) ou requêtes moyennes
  if (kind === "image" || kind === "data") return "standard";
  if (text.length > 400) return "standard";
  // Tout le reste → eco (par défaut)
  return "eco";
}

// Strip provider prefix → OpenAI model name (e.g. "openai/gpt-5" → "gpt-5")
function stripPrefix(model: string): string {
  return model.replace(/^openai\//, "").replace(/^google\//, "");
}

// Map alias models (gpt-5*, etc. = Lovable Gateway aliases) to real OpenAI model IDs.
// Direct OpenAI API doesn't know "gpt-5-mini" → must use real names.
// Qualité min = gpt-4o (équivalent ChatGPT). Plus de chute silencieuse vers gpt-4o-mini.
function toRealOpenAIModel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("gpt-5-nano")) return "gpt-4o-mini";
  if (m.includes("gpt-5-mini")) return "gpt-4o";
  if (m.includes("gpt-5")) return "gpt-4o";
  if (m.startsWith("gpt-")) return model; // already a real OpenAI id
  return "gpt-4o";
}

function chatCompletionsUrl(provider: RoutingProviderName): string {
  if (provider === "deepseek") return "https://api.deepseek.com/v1/chat/completions";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  return "https://api.openai.com/v1/chat/completions";
}

function chatHeaders(provider: RoutingProviderName, key: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://nexyra.app";
    headers["X-Title"] = "Nexyra Elena";
  }
  return headers;
}

function normalizeChatModel(provider: RoutingProviderName, model: string): string {
  if (provider === "openai") return toRealOpenAIModel(stripPrefix(model));
  if (provider === "deepseek") return model.replace(/^deepseek\//, "");
  return model;
}

// Pricing approximatif USD / 1k tokens (input+output moyenné)
function priceFor(model: string): { input: number; output: number } {
  const m = model.toLowerCase();
  if (m.includes("gpt-5-nano")) return { input: 0.00005, output: 0.0004 };
  if (m.includes("gpt-5-mini")) return { input: 0.00025, output: 0.002 };
  if (m.includes("gpt-5")) return { input: 0.00125, output: 0.01 };
  return { input: 0.001, output: 0.004 };
}

function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = priceFor(model);
  return (tokensIn * p.input + tokensOut * p.output) / 1000;
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Génère un titre court et intelligent (3-6 mots) à partir du 1er échange.
 * Fire & forget — ne bloque jamais le stream. Utilise gpt-4o-mini (très peu cher).
 */
async function generateSmartTitle(
  userMessage: string,
  assistantReply: string,
  openaiKey: string,
): Promise<string | null> {
  try {
    const prompt = `Résume cette conversation en un titre court et descriptif de 3 à 6 mots maximum, en français, sans guillemets ni ponctuation finale. Va droit au sujet (ex: "Plan marketing newsletter", "Logo minimaliste bleu", "Bug auth Supabase").

Utilisateur : ${userMessage.slice(0, 500)}
Elena : ${assistantReply.slice(0, 400)}

Titre :`;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 24,
        temperature: 0.4,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    let title = (json.choices?.[0]?.message?.content ?? "").trim();
    title = title.replace(/^["'«»]+|["'«»\.]+$/g, "").trim();
    if (!title) return null;
    return title.slice(0, 80);
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/elena-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
          const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
            return jsonError("Server misconfigured", 500);
          }

          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) return jsonError("Unauthorized", 401);
          const token = authHeader.slice(7);

          // Client utilisateur (RLS) pour conv/messages/settings
          const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });

          // Client admin (service role) pour déchiffrer la clé API
          const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });

          const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
          if (claimsError || !claimsData?.claims?.sub) return jsonError("Unauthorized", 401);
          const userId = claimsData.claims.sub as string;

          const body = (await request.json()) as ChatBody;
          if (!body.message?.trim()) return jsonError("Empty message", 400);

          // 0. KILL-SWITCH : check quota user + projet (anti-explosion budget)
          const { data: quotaCheck } = await supabaseAdmin.rpc(
            "check_project_quota" as never,
            { _user_id: userId, _project_id: body.project_id ?? null } as never,
          );
          const quota = quotaCheck as { allowed: boolean; reason?: string; scope?: string; usage?: number; limit?: number } | null;
          if (quota && !quota.allowed) {
            const scopeLabel = quota.scope === "project" ? "Budget projet" : "Quota";
            return jsonError(
              `🛑 ${scopeLabel} : ${quota.reason ?? "limite atteinte"}. Contacte l'admin si tu penses que c'est une erreur.`,
              429,
            );
          }

          // 0.bis. Mode brouillon projet → force eco (cap automatique)
          let draftMode = false;
          if (body.project_id) {
            const { data: proj } = await supabaseAdmin
              .from("projects")
              .select("draft_mode")
              .eq("id", body.project_id)
              .maybeSingle();
            draftMode = (proj as { draft_mode?: boolean } | null)?.draft_mode ?? false;
            if (draftMode) {
              body.mode_override = "eco";
            }
          }

          // 1. BYOK strict : Elena utilise la clé OpenAI de l'utilisateur courant.
          //    Aucun fallback Lovable AI (règle produit Nexyra).
          const { data: keyData, error: keyErr } = await supabaseAdmin.rpc(
            "get_api_key_decrypted",
            { _owner_id: userId, _provider: "openai" },
          );
          if (keyErr) {
            console.error("get_api_key_decrypted failed", keyErr);
          }
          const userApiKey = (keyData as string | null) ?? null;

          // 2. Réglages Elena — défaut sur Gemini Flash (gratuit via Lovable AI Gateway)
          const { data: settings } = await supabase
            .from("elena_settings")
            .select("*")
            .eq("owner_id", userId)
            .maybeSingle();

          const mode: ElenaMode = body.mode_override ?? settings?.default_mode ?? "auto";
          let intentKind = detectIntentKind(body.message, (body.images?.length ?? 0) > 0);
          const intentLevel = detectIntentLevel(body.message, intentKind);

          const routedChat = await resolveModelForUser(userId, "orchestrator");
          let chatProvider: RoutingProviderName = routedChat.provider;
          let routedModelName = routedChat.model;
          let selectedTier: Tier | null = null;

          // ============ Tiers d'intelligence (Cerveau d'Elena) ============
          // Si l'utilisateur a activé le classifieur (par défaut : oui), on
          // override le provider/model par le tier détecté (XS→XL).
          const tierAuto = body.tier_auto !== false; // défaut ON
          const tierForced = body.tier_forced && body.tier_forced !== "auto"
            ? (body.tier_forced as Tier)
            : null;
          try {
            if (tierForced) {
              selectedTier = tierForced;
            } else if (tierAuto && intentKind !== "image" && intentKind !== "video") {
              const cls = await classifyTier(
                {
                  message: body.message,
                  attachmentsCount: body.images?.length ?? 0,
                  hasVision: (body.images?.length ?? 0) > 0,
                },
                userApiKey,
              );
              selectedTier = cls.tier;
            }
            if (selectedTier) {
              const spec = TIER_MODELS[selectedTier];
              chatProvider = spec.provider as RoutingProviderName;
              routedModelName = spec.model;
            }
          } catch (e) {
            console.warn("[tier] classification échouée, fallback route standard", e);
          }

          const routedKey = await getUserProviderKey(userId, chatProvider);
          if (!routedKey) {
            return jsonError(
              `Elena ne trouve pas la clé ${chatProvider}. Va dans Réglages → Clés API et colle-la, ou choisis un autre modèle dans Cerveau d'Elena → Discussion.`,
              412,
            );
          }
          const upstreamUrl = chatCompletionsUrl(chatProvider);
          const upstreamKey = routedKey;
          const fullModel = `${chatProvider}/${routedModelName}${selectedTier ? ` [tier:${selectedTier}]` : ""}`;
          const model = normalizeChatModel(chatProvider, routedModelName);
          // COST-OPTIMIZED: cap le contexte à 12 messages max (vs 30 par défaut).
          // Au-delà, le résumé conv prend le relais. Économie tokens input ~40%.
          const maxContext = Math.min(settings?.max_context_messages ?? 12, 12);

          // 3. Contexte projet + RAG (notes projet)
          let projectContext = "";
          let ragContext = "";
          let projectType: Database["public"]["Enums"]["project_type"] = "webapp";
          if (body.project_id) {
            const { data: proj } = await supabase
              .from("projects")
              .select("name, type, description")
              .eq("id", body.project_id)
              .maybeSingle();
            if (proj) {
              projectType = proj.type;
              projectContext = `\n\nContexte projet courant : "${proj.name}" (type: ${proj.type}).${proj.description ? ` Description : ${proj.description}` : ""}`;
            }

            // RAG : sémantique d'abord (pgvector), FTS en fallback
            let ragDocs: Array<{ title: string; content: string; similarity?: number }> = [];
            let ragMode: "semantic" | "fts" | "none" = "none";

            // 1) Sémantique avec la clé OpenAI utilisateur
            try {
              if (!userApiKey) throw new Error("OpenAI key missing for embeddings");
              const { generateEmbedding, toPgVector } = await import("@/server/embeddings.server");
              const qEmb = await generateEmbedding(body.message, userApiKey);
              if (qEmb) {
                const { data: matches } = await supabase.rpc("match_project_docs" as never, {
                  _project_id: body.project_id,
                  _query_embedding: toPgVector(qEmb) as never,
                  _match_count: 3,
                  _min_similarity: 0.55,
                } as never);
                const arr = matches as Array<{ title: string; content: string; similarity: number }> | null;
                if (arr && arr.length > 0) {
                  ragDocs = arr;
                  ragMode = "semantic";
                }
              }
            } catch (e) {
              console.warn("RAG semantic failed", e);
            }

            // 2) Fallback FTS si la sémantique n'a rien donné (ou pas de clé)
            if (ragDocs.length === 0) {
              try {
                const tsQuery = body.message
                  .toLowerCase()
                  .replace(/[^\p{L}\p{N}\s]/gu, " ")
                  .split(/\s+/)
                  .filter((w) => w.length > 3)
                  .slice(0, 8)
                  .join(" | ");
                if (tsQuery) {
                  const { data: docs } = await supabase
                    .from("project_docs")
                    .select("title, content")
                    .eq("project_id", body.project_id)
                    .textSearch("content", tsQuery, { type: "websearch", config: "french" })
                    .limit(3);
                  if (docs && docs.length > 0) {
                    ragDocs = docs;
                    ragMode = "fts";
                  }
                }
              } catch (e) {
                console.warn("RAG fts failed", e);
              }
            }

            if (ragDocs.length > 0) {
              ragContext =
                `\n\n--- Notes projet pertinentes (mémoire ${ragMode}) ---\n` +
                ragDocs
                  .map((d) => {
                    const sim = d.similarity ? ` (similarité ${(d.similarity * 100).toFixed(0)}%)` : "";
                    // COST-OPTIMIZED: tronqué à 800 chars (vs 1500). Suffisant pour
                    // donner du contexte sans exploser les tokens input.
                    return `### ${d.title}${sim}\n${d.content.slice(0, 800)}`;
                  })
                  .join("\n\n") +
                "\n--- Fin des notes ---";
            }
          }

          const systemBase =
            projectType === "website"
              ? settings?.system_prompt_website
              : projectType === "mobile_app"
                ? settings?.system_prompt_mobile
                : settings?.system_prompt_webapp;

          // Identité Elena unifiée (chat ↔ dev) : MÊME assistante, MÊME ton, MÊME qualité.
          // En mode chat libre : pas d'outils file/code, mais raisonnement et discussion identiques.
          const isFreeChat = !body.project_id;
          const elenaIdentity = [
            "Tu es **Elena**, l'agente IA de Nexyra AI. Tu es la MÊME Elena que dans l'espace Dev :",
            "même cerveau, même rigueur, même ton. La SEULE différence ici : tu ne touches pas aux fichiers d'un projet (pas de sandbox).",
            "",
            "QUALITÉ DE RÉPONSE (niveau ChatGPT) :",
            "- Réponses UTILES, claires, structurées. Adapte la longueur à la question : courte pour question simple, détaillée et structurée pour explication / conseil / brainstorm.",
            "- Markdown propre : titres `##`, listes à puces, **gras** sur les points clés, blocs de code pour les snippets pertinents.",
            "- Pour une demande complexe : résume → propose des options ou un plan → termine par une question ou un CTA.",
            "- Tu peux raisonner étape par étape quand c'est utile, mais pas de pavé inutile.",
            "- Français par défaut, sauf si l'utilisateur écrit dans une autre langue.",
            "- Tu connais à fond : produit, design, marketing, business, code (TanStack Start, React 19, Vite, Tailwind v4, shadcn, Supabase/Lovable Cloud, IA).",
            "",
            "INTENTION DU MESSAGE — détecte et adapte :",
            "- QUESTION / EXPLICATION / SMALL TALK → réponds normalement, comme ChatGPT, sans rien refuser.",
            "- CONSEIL / BRAINSTORM (couleur, structure, stack, copywriting…) → propose 2-3 pistes claires + ta recommandation.",
            "- DEMANDE D'IMPLÉMENTATION CODE (« crée », « code », « ajoute cette feature ») → réponds en discussion + redirige : « Pour que je le construise vraiment, ouvre l'espace **Dev** et redis-le moi là-bas. Ici on est en chat libre, je ne touche pas aux fichiers. »",
            "- DÉCLARATION DE RÈGLE / PRÉFÉRENCE (« j'aime pas X », « toujours faire Y ») → confirme en 1 phrase, sans théâtre.",
            "",
            "CAPACITÉS MULTIMÉDIA :",
            "- 🖼️ **Images** : tu PEUX générer/éditer des images directement. Par défaut → `gpt-image-1` (OpenAI BYOK). Si l'utilisateur dit « avec recraft », « en recraft v3 », « style vector/illustration » → c'est routé vers `fal-ai/recraft-v3` (excellent pour logos/illustrations vectorielles + texte). NE dis JAMAIS « je ne peux pas générer d'image ».",
            "- 🎬 **Vidéos** : tu PEUX générer des vidéos courtes (5-10s) text-to-video ou image-to-video via fal.ai (Veo3 / Kling / Luma). Si l'utilisateur dit « génère/crée/fais une vidéo de … » → c'est routé automatiquement, la vidéo apparaît inline. NE dis JAMAIS « je ne peux pas faire de vidéo ».",
            "- 👁️ **Vision** : si l'utilisateur joint une photo, tu la VOIS — décris-la, analyse-la, réponds dessus. Si en plus il dit « modifie / retouche » → édition auto.",
            "- 📎 **Fichiers** : tu PEUX créer des fichiers téléchargeables (`file_create`, `pdf_create`, `docx_create`). Pour un export, un PDF, un JSON, un .txt ou une copie de conversation : utilise ces outils, puis donne le lien `download_url`. Ne réponds jamais qu'il faut GitHub pour télécharger un simple fichier.",
            "",
            "INTERDITS ABSOLUS :",
            "- ❌ « je suis juste un assistant textuel », « je ne peux pas faire ça » sur des sujets que tu maîtrises.",
            "- ❌ Phrases creuses : « un instant s'il te plaît », « je m'occupe de ça », « je reviens vers toi ». Tu réponds APRÈS avoir réfléchi, pas avant.",
            "- ❌ Refuser de répondre à une question générale sous prétexte que tu es « un agent dev ».",
            "- ❌ Dans CE mode chat libre : prétendre que tu modifies des fichiers. Tu n'as pas accès au sandbox ici.",
            isFreeChat
              ? "- ⚠️ Tu es actuellement en MODE CHAT LIBRE (sans projet ouvert). Pas d'accès aux fichiers, mais raisonnement complet : réponds à TOUT comme un ChatGPT premium."
              : "- ⚠️ Un projet est ouvert mais tu es dans la vue chat (lecture seule). Pour modifier le code, l'utilisateur doit passer par l'éditeur Dev.",
          ].join("\n");

          const systemPrompt =
            elenaIdentity +
            "\n\n---\n\n" +
            (systemBase ??
              "Tu es Elena, agente IA experte de Nexyra. Tu réponds en français, de manière concise et structurée (markdown autorisé).") +
            projectContext +
            ragContext +
            `\n\n[Intention détectée: ${intentKind} · niveau: ${intentLevel}]`;

          // 4. Org perso
          const { data: orgRow } = await supabase
            .from("organizations")
            .select("id")
            .eq("owner_id", userId)
            .eq("is_personal", true)
            .maybeSingle();
          const orgId = orgRow?.id;
          if (!orgId) return jsonError("No personal org", 500);

          // 5. Conversation
          let conversationId = body.conversation_id;
          const wasNewConversation = !conversationId;
          if (!conversationId) {
            const { data: conv, error: convErr } = await supabase
              .from("conversations")
              .insert({
                owner_id: userId,
                org_id: orgId,
                project_id: body.project_id ?? null,
                title: body.message.slice(0, 60),
              })
              .select("id")
              .single();
            if (convErr || !conv) return jsonError("Conversation create failed", 500);
            conversationId = conv.id;
          }

          // 6. Historique
          const { data: history } = await supabase
            .from("messages")
            .select("role, content")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true })
            .limit(maxContext);

          // 6.bis Construction du message user (multimodal si images jointes & modèle vision)
          const userImages = (body.images ?? []).filter(
            (u) => typeof u === "string" && /^https?:\/\//.test(u),
          );
          // Format OpenAI `image_url` n'est accepté que par les modèles OpenAI vision
          // routés directement (gpt-4o / gpt-4.1 / o-series). Pour tout autre modèle
          // (Claude, Gemini, etc.) on dégrade en texte pour éviter le 400
          // "unknown variant `image_url`, expected `text`" du gateway.
          const isOpenAIVision = /^(openai\/)?(gpt-4o|gpt-4\.1|o[134])/i.test(model);
          const userMessageContent =
            userImages.length > 0 && isOpenAIVision
              ? ([
                  { type: "text", text: body.message },
                  ...userImages.map((url) => ({
                    type: "image_url",
                    image_url: { url, detail: "auto" as const },
                  })),
                ] as unknown as string)
              : userImages.length > 0
                ? `${body.message}\n\n${userImages.map((u) => `[Image jointe: ${u}]`).join("\n")}`
                : body.message;

          const messages = [
            { role: "system" as const, content: systemPrompt },
            ...(history ?? []).map((m) => ({
              role: m.role as "user" | "assistant" | "system",
              content: m.content,
            })),
            { role: "user" as const, content: userMessageContent },
          ];

          // 7. Sauver user message
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            owner_id: userId,
            org_id: orgId,
            role: "user",
            content: body.message,
            metadata: userImages.length > 0 ? { images: userImages } : null,
          });

          // 7.0 IMAGE INTENT — court-circuit : on génère/édite et on stream le résultat
          //     directement dans le chat (pas d'appel LLM texte). MODE CHAT LIBRE
          //     uniquement (pas de project_id) : en mode projet, l'utilisateur
          //     doit passer par /dev pour que l'image entre dans le sandbox.
          if (intentKind === "image" && !body.project_id) {
            const { generateInlineImage, editInlineImage } = await import(
              "@/server/chat-image-tools.server"
            );

            // Détection édition : (a) image jointe au message OU (b) verbe d'édition
            // ("modifie/retouche/change/rends/ajoute/enlève/remplace/recadre…") +
            // image disponible dans la conversation (dernière image générée ou jointe).
            const editVerb =
              /(modifie|modifier|retouche|retoucher|change|changer|rends|rendre|ajoute|ajouter|enlève|enlever|supprime|supprimer|remplace|remplacer|recadre|recadrer|zoom|recolorer?|colorise|éclair|assombri|flou|net|améliore|corrige|même image|cette image|la photo|l['’]image)/i.test(
                body.message,
              );

            // Cherche la dernière image dans l'historique (assistant ou user)
            // pour pouvoir continuer l'édition sans re-joindre la photo à chaque tour.
            let lastImageInThread: string | null = null;
            const { data: recentMsgs } = await supabase
              .from("messages")
              .select("role, content, metadata")
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: false })
              .limit(20);
            for (const m of recentMsgs ?? []) {
              const meta = m.metadata as { image_url?: string; images?: string[] } | null;
              if (meta?.image_url) { lastImageInThread = meta.image_url; break; }
              if (Array.isArray(meta?.images) && meta!.images!.length > 0) {
                lastImageInThread = meta!.images![0]; break;
              }
              const md = (m.content || "").match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
              if (md) { lastImageInThread = md[1]; break; }
            }

            const sourceUrl =
              userImages[0] ?? (editVerb ? lastImageInThread : null) ?? null;
            const isEdit = !!sourceUrl;

            // Détection provider via mot-clé. "recraft" → fal-ai/recraft-v3.
            // Style optionnel : "vector", "illustration", "digital", "réaliste".
            const tLow = body.message.toLowerCase();
            const wantsRecraft = /\brecraft(\s*v?3)?\b/.test(tLow);
            let recraftStyle: string | undefined;
            if (/\bvector(ielle)?\b/.test(tLow)) recraftStyle = "vector_illustration";
            else if (/\billustration\s+digitale?\b|\bdigital\b/.test(tLow)) recraftStyle = "digital_illustration";
            else if (/\billustration\b/.test(tLow)) recraftStyle = "digital_illustration";
            else recraftStyle = "realistic_image";

            // STREAM IMMÉDIAT + heartbeat : gpt-image-1/recraft peuvent prendre 30-60s,
            // ce qui dépasse les timeouts de proxy. On ouvre l'SSE tout de suite.
            const imgStream = new ReadableStream({
              async start(controller) {
                const enc = new TextEncoder();
                const send = (chunk: string) => {
                  try { controller.enqueue(enc.encode(chunk)); } catch { /* closed */ }
                };
                let closed = false;
                const safeClose = () => { if (!closed) { closed = true; try { controller.close(); } catch { /* */ } } };

                const providerLabel = wantsRecraft ? "Recraft v3" : "gpt-image-1";
                send(`event: meta\ndata: ${JSON.stringify({ conversation_id: conversationId, model: null, intent: "image" })}\n\n`);
                send(`data: ${JSON.stringify({ delta: `${isEdit ? "🪄 Édition d'image en cours…" : `🖼️ Génération d'image en cours… (${providerLabel})`}\n\n*Patience, ${providerLabel} prend 15 à 60 secondes.*\n\n` })}\n\n`);

                const hb = setInterval(() => send(`: keepalive ${Date.now()}\n\n`), 5000);

                let result: Awaited<ReturnType<typeof generateInlineImage>>;
                try {
                  result = isEdit
                    ? await editInlineImage({
                        prompt: body.message,
                        sourceUrl: sourceUrl!,
                        openaiKey: userApiKey ?? "",
                        storage: supabaseAdmin,
                        userId,
                      })
                    : await generateInlineImage({
                        prompt: body.message,
                        openaiKey: userApiKey ?? "",
                        storage: supabaseAdmin,
                        userId,
                        provider: wantsRecraft ? "recraft" : "auto",
                        recraftStyle,
                        // Tier image : forcé par l'utilisateur, sinon défaut S
                        // (Nano Banana 2 — bon rapport qualité/prix, économie ~5× vs L).
                        tier: (body.tier_forced && body.tier_forced !== "auto"
                          ? (body.tier_forced as Tier)
                          : (body.tier_auto !== false ? "S" : undefined)) as Tier | undefined,
                      });
                } catch (e) {
                  result = {
                    error: `Erreur réseau : ${e instanceof Error ? e.message : "fetch failed"}`,
                    failures: [],
                  };
                }

                let reply: string;
                let ok = false;
                let modelUsed: string = "image-generation-failed";
                let imageUrl: string | null = null;
                let errMsg: string | null = null;
                if ("url" in result) {
                  ok = true;
                  modelUsed = result.model;
                  imageUrl = result.url;
                  reply = `${isEdit ? "🪄 Image éditée" : "🖼️ Image générée"} :\n\n![](${result.url})\n\n_Modèle : \`${result.model}\` — clic droit pour télécharger._`;
                } else {
                  errMsg = result.error;
                  reply = `⚠️ ${result.error}\n\n<details><summary>Détails techniques</summary>\n\n\`\`\`\n${result.failures.join("\n")}\n\`\`\`\n</details>`;
                }

                clearInterval(hb);
                send(`data: ${JSON.stringify({ delta: reply })}\n\n`);
                send(`event: done\ndata: {}\n\n`);
                safeClose();

                // Persistance asynchrone
                void supabase.from("messages").insert({
                  conversation_id: conversationId,
                  owner_id: userId,
                  org_id: orgId,
                  role: "assistant",
                  content: reply,
                  model_used: modelUsed,
                  cost_usd: ok ? 0.04 : 0,
                  metadata: ok
                    ? { intent_kind: "image", image_url: imageUrl, edit: isEdit }
                    : { intent_kind: "image", error: errMsg },
                });
                void supabase
                  .from("conversations")
                  .update({ last_message_at: new Date().toISOString() })
                  .eq("id", conversationId!);

                if (wasNewConversation && userApiKey) {
                  void generateSmartTitle(body.message, reply, userApiKey).then((title) => {
                    if (title) {
                      void supabaseAdmin
                        .from("conversations")
                        .update({ title })
                        .eq("id", conversationId!);
                    }
                  });
                }
              },
            });
            return new Response(imgStream, { headers: sseHeaders });
          }

          // 6.99 VIDEO INTENT — court-circuit : on appelle /api/video-generate (fal.ai)
          //      et on stream le résultat (markdown <video>) dans le chat.
          if (intentKind === "video") {
            // Pré-détection des hints utilisateur (modèle, ratio, durée)
            const tLow = body.message.toLowerCase();
            const checkMatch = tLow.match(/(?:request[_ -]?id|vid[eé]o)\s*:?\s*`?([a-z0-9_-]{16,})`?/i);
            if (/v[ée]rifi|check|statut|status/.test(tLow) && checkMatch?.[1]) {
              const requestId = checkMatch[1];
              const vidCheckStream = new ReadableStream({
                async start(controller) {
                  const enc = new TextEncoder();
                  const send = (chunk: string) => {
                    try { controller.enqueue(enc.encode(chunk)); } catch { /* closed */ }
                  };
                  let reply = "";
                  try {
                    const { checkFalVideoAnyModel } = await import("@/server/video-generation.server");
                    const j = await checkFalVideoAnyModel(requestId, process.env.FAL_KEY);
                    if (j.ok && j.status === "completed") {
                      reply = `🎬 Vidéo prête :\n\n<video src="${j.video_url}" controls playsinline style="max-width:100%;border-radius:12px"></video>\n\n[⬇ Télécharger](${j.video_url})`;
                    } else if (j.ok) {
                      reply = `⏳ La vidéo travaille encore (${j.provider_status ?? "en cours"}). Redemande une vérification dans 45-60 secondes. Ne relance pas une nouvelle génération.`;
                    } else {
                      reply = `⚠️ Vérification vidéo échouée : ${j.error}`;
                    }
                  } catch (e) {
                    reply = `⚠️ Vérification vidéo échouée : ${e instanceof Error ? e.message : "erreur"}`;
                  }
                  send(`data: ${JSON.stringify({ delta: reply })}\n\n`);
                  send(`event: done\ndata: {}\n\n`);
                  try { controller.close(); } catch { /* */ }
                  void supabase.from("messages").insert({
                    conversation_id: conversationId,
                    owner_id: userId,
                    org_id: orgId,
                    role: "assistant",
                    content: reply,
                    model_used: "video_check",
                    cost_usd: 0,
                    metadata: { intent_kind: "video_check", request_id: requestId },
                  });
                },
              });
              return new Response(vidCheckStream, { headers: sseHeaders });
            }
            let videoModel:
              | "fal-ai/veo3"
              | "fal-ai/kling-video/v2/master/text-to-video"
              | "fal-ai/kling-video/v2/master/image-to-video"
              | "fal-ai/luma-dream-machine" = "fal-ai/kling-video/v2/master/text-to-video";
            if (/veo\s*3|veo3/.test(tLow)) videoModel = "fal-ai/veo3";
            else if (/luma|dream\s*machine/.test(tLow)) videoModel = "fal-ai/luma-dream-machine";

            let aspect: "16:9" | "9:16" | "1:1" = "16:9";
            if (/(vertical|9:?16|portrait|story|tiktok|reels?)/.test(tLow)) aspect = "9:16";
            else if (/(carr[ée]|1:?1|square)/.test(tLow)) aspect = "1:1";

            let duration: 5 | 8 | 10 = 5;
            if (/\b10\s*s(ec|econdes)?\b/.test(tLow)) duration = 10;
            else if (/\b8\s*s(ec|econdes)?\b/.test(tLow)) duration = 8;

            // image-to-video si une image est jointe
            const sourceImg = userImages[0];
            if (sourceImg) videoModel = "fal-ai/kling-video/v2/master/image-to-video";

            const origin = new URL(request.url).origin;
            const modelLabel = videoModel.split("/").slice(-1)[0];

            // STREAM IMMÉDIAT : on ouvre l'SSE tout de suite, on envoie le statut,
            // on garde la connexion vivante avec des heartbeats pendant que fal.ai
            // travaille (40-90s typiquement), puis on émet la vidéo finale.
            // Sinon le proxy/Worker tue la connexion avant la fin.
            const vidStream = new ReadableStream({
              async start(controller) {
                const enc = new TextEncoder();
                const send = (chunk: string) => {
                  try { controller.enqueue(enc.encode(chunk)); } catch { /* closed */ }
                };
                let closed = false;
                const safeClose = () => { if (!closed) { closed = true; try { controller.close(); } catch { /* */ } } };

                send(`event: meta\ndata: ${JSON.stringify({ conversation_id: conversationId, model: videoModel, intent: "video" })}\n\n`);
                send(`data: ${JSON.stringify({ delta: `🎬 Génération vidéo en cours… (${duration}s · ${aspect} · \`${modelLabel}\`)\n\n*Patience, fal.ai met généralement 40 à 90 secondes pour produire le clip.*\n\n` })}\n\n`);

                // Heartbeat SSE comments toutes les 5s pour empêcher le proxy de couper.
                const hb = setInterval(() => send(`: keepalive ${Date.now()}\n\n`), 5000);

                let reply = "";
                let videoUrl: string | null = null;
                let modelUsed = videoModel;
                try {
                  const { generateFalVideo } = await import("@/server/video-generation.server");
                  const j = (await generateFalVideo(
                    {
                      prompt: body.message,
                      model: videoModel,
                      aspect_ratio: aspect,
                      duration_s: duration,
                      ...(sourceImg ? { image_url: sourceImg } : {}),
                    },
                    process.env.FAL_KEY,
                  )) as {
                    ok: boolean;
                    status?: "processing" | "completed";
                    video_url?: string;
                    model?: string;
                    request_id?: string;
                    error?: string;
                  };
                  if (j.ok && j.video_url) {
                    videoUrl = j.video_url;
                    modelUsed = (j.model as typeof modelUsed) ?? videoModel;
                    reply = `🎬 Vidéo générée (${duration}s · ${aspect} · \`${modelUsed}\`) :\n\n<video src="${videoUrl}" controls playsinline style="max-width:100%;border-radius:12px"></video>\n\n[⬇ Télécharger](${videoUrl})`;
                  } else if (j.ok && j.status === "processing" && j.request_id) {
                    modelUsed = (j.model as typeof modelUsed) ?? videoModel;
                    reply = `🎬 Vidéo lancée (${duration}s · ${aspect} · \`${modelUsed}\`).\n\nIdentifiant : \`${j.request_id}\`\n\nJe n'attends plus en boucle pour éviter les frais inutiles. Reviens dans 1 à 2 minutes et demande : « vérifie la vidéo ${j.request_id} ». Ne relance pas une nouvelle génération.`;
                  } else {
                    reply = `⚠️ Génération vidéo échouée : ${j.error ?? "erreur inconnue"}`;
                  }
                } catch (e) {
                  reply = `⚠️ Génération vidéo échouée : ${e instanceof Error ? e.message : "fetch failed"}`;
                }

                clearInterval(hb);
                send(`data: ${JSON.stringify({ delta: reply })}\n\n`);
                send(`event: done\ndata: {}\n\n`);
                safeClose();

                // Persistance asynchrone (le client a déjà tout reçu).
                void supabase.from("messages").insert({
                  conversation_id: conversationId,
                  owner_id: userId,
                  org_id: orgId,
                  role: "assistant",
                  content: reply,
                  model_used: modelUsed,
                  cost_usd: videoUrl ? 0.5 : 0,
                  metadata: videoUrl
                    ? { intent_kind: "video", video_url: videoUrl, model: modelUsed, duration_s: duration, aspect_ratio: aspect }
                    : { intent_kind: "video", error: reply },
                });
                void supabase
                  .from("conversations")
                  .update({ last_message_at: new Date().toISOString() })
                  .eq("id", conversationId!);

                if (wasNewConversation && userApiKey) {
                  void generateSmartTitle(body.message, reply, userApiKey).then((title) => {
                    if (title) {
                      void supabaseAdmin
                        .from("conversations")
                        .update({ title })
                        .eq("id", conversationId!);
                    }
                  });
                }
              },
            });
            return new Response(vidStream, { headers: sseHeaders });
          }


          // 7.5 TOOL-CALLING LOOP — outils v2 dispo en chat libre.
          //     Déclenché seulement si le message contient des mots-clés outils
          //     (sinon on garde le streaming pur, plus rapide pour le chat normal).
          const needsTools =
            /\b(python|calcule(?:r)?|exécute(?:r)?|execute|node\s*exec|sandbox|claude|raisonn(?:e|er|ement)|pixel\s*diff|m[ée]moris(?:e|er)\s+(?:cette|une|l[ae']?)\s+image|recherche.*image\s+similaire|appel\s+vocal|parle-?moi.*voix|avatar\s+(?:parlant|heygen)|heygen|fichier|pdf|docx?|word|excel|xlsx|csv|json|\.txt|t[ée]l[ée]charg|export(?:e|er|é)?|joins?[- ]moi|joint|attache|piece\s*jointe|pi[èe]ce\s*jointe|copi[eé].*(?:chat|conversation)|sauvegarde\s+(?:le|la|ce|cette))\b/i.test(
              body.message,
            );

          if (needsTools) {
            const { elenaChatTools, executeElenaChatTool } = await import(
              "@/server/elena-chat-tools.server"
            );
            const ctx = {
              origin: new URL(request.url).origin,
              bearer: token,
              userId,
              sb: supabase as never,
              sbAdmin: supabaseAdmin as never,
              falKey: process.env.FAL_KEY ?? null,
            };

            // OpenAI tool-calling loop (max 4 itérations).
            type ToolMsg = {
              role: "system" | "user" | "assistant" | "tool";
              content?: unknown;
              tool_calls?: Array<{
                id: string;
                type: "function";
                function: { name: string; arguments: string };
              }>;
              tool_call_id?: string;
              name?: string;
            };
            const convo: ToolMsg[] = messages.map((m) => ({
              role: m.role,
              content: m.content,
            })) as ToolMsg[];

            let finalText = "";
            let totalIn = 0;
            let totalOut = 0;
            const toolTrace: Array<{ name: string; ok: boolean }> = [];
            const artifacts: Array<{
              filename: string;
              download_url: string;
              url?: string;
              mime_type?: string;
              expires_at?: string;
            }> = [];

            for (let iter = 0; iter < 4; iter++) {
              const r = await fetch(upstreamUrl, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${upstreamKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model,
                  messages: convo,
                  tools: elenaChatTools,
                  tool_choice: "auto",
                  stream: false,
                }),
              });
              if (!r.ok) {
                const t = await r.text().catch(() => "");
                return jsonError(`OpenAI tool-loop ${r.status} : ${t.slice(0, 220)}`, 502);
              }
              const j = (await r.json()) as {
                choices: Array<{
                  message: {
                    role: "assistant";
                    content: string | null;
                    tool_calls?: Array<{
                      id: string;
                      type: "function";
                      function: { name: string; arguments: string };
                    }>;
                  };
                  finish_reason: string;
                }>;
                usage?: { prompt_tokens: number; completion_tokens: number };
              };
              totalIn += j.usage?.prompt_tokens ?? 0;
              totalOut += j.usage?.completion_tokens ?? 0;
              const choice = j.choices[0];
              if (!choice) break;
              const msg = choice.message;

              if (msg.tool_calls && msg.tool_calls.length > 0) {
                // Push assistant message with tool_calls
                convo.push({
                  role: "assistant",
                  content: msg.content ?? "",
                  tool_calls: msg.tool_calls,
                });
                // Execute each tool, push tool result
                for (const call of msg.tool_calls) {
                  let parsed: Record<string, unknown> = {};
                  try {
                    parsed = JSON.parse(call.function.arguments || "{}");
                  } catch {
                    parsed = {};
                  }
                  const result = await executeElenaChatTool(call.function.name, parsed, ctx);
                  const artifact = result as {
                    ok?: boolean;
                    filename?: unknown;
                    download_url?: unknown;
                    url?: unknown;
                    mime_type?: unknown;
                    expires_at?: unknown;
                  };
                  if (
                    artifact.ok === true &&
                    ["file_create", "pdf_create", "docx_create"].includes(call.function.name) &&
                    typeof artifact.filename === "string" &&
                    (typeof artifact.download_url === "string" || typeof artifact.url === "string")
                  ) {
                    artifacts.push({
                      filename: artifact.filename,
                      download_url: String(artifact.download_url ?? artifact.url),
                      ...(typeof artifact.url === "string" ? { url: artifact.url } : {}),
                      ...(typeof artifact.mime_type === "string" ? { mime_type: artifact.mime_type } : {}),
                      ...(typeof artifact.expires_at === "string" ? { expires_at: artifact.expires_at } : {}),
                    });
                  }
                  toolTrace.push({
                    name: call.function.name,
                    ok: !!(result as { ok?: boolean })?.ok,
                  });
                  convo.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify(result).slice(0, 8000),
                  });
                }
                continue; // boucle pour laisser le LLM produire la réponse finale
              }

              // Pas de tool_call → réponse finale
              finalText = msg.content ?? "";
              break;
            }

            if (!finalText) {
              finalText =
                "✅ Outils exécutés mais pas de réponse texte du modèle. Détails : " +
                JSON.stringify(toolTrace);
            }

            if (artifacts.length > 0) {
              const missingLinks = artifacts.filter((artifact) => !finalText.includes(artifact.download_url));
              if (missingLinks.length > 0) {
                finalText +=
                  "\n\n" +
                  missingLinks
                    .map((artifact) => `📎 Fichier prêt : [⬇ Télécharger ${artifact.filename}](${artifact.download_url})`)
                    .join("\n");
              }
            }

            const cost = estimateCost(model, totalIn, totalOut);
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              owner_id: userId,
              org_id: orgId,
              role: "assistant",
              content: finalText,
              model_used: fullModel,
              tokens_input: totalIn,
              tokens_output: totalOut,
              cost_usd: cost,
              metadata: {
                intent_level: intentLevel,
                intent_kind: intentKind,
                tools_used: toolTrace,
                artifacts,
              } as never,
            });
            await supabase
              .from("conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", conversationId!);

            if (wasNewConversation && userApiKey) {
              void generateSmartTitle(body.message, finalText, userApiKey).then((title) => {
                if (title) {
                  void supabaseAdmin
                    .from("conversations")
                    .update({ title })
                    .eq("id", conversationId!);
                }
              });
            }

            // Stream le résultat final en chunks (simulé) pour cohérence UI
            const toolStream = new ReadableStream({
              start(controller) {
                const enc = new TextEncoder();
                controller.enqueue(
                  enc.encode(
                    `event: meta\ndata: ${JSON.stringify({
                      conversation_id: conversationId,
                      model: fullModel,
                      intent: intentKind,
                      tools_used: toolTrace,
                    })}\n\n`,
                  ),
                );
                const chunks = finalText.match(/[\s\S]{1,40}/g) ?? [finalText];
                for (const c of chunks) {
                  controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: c })}\n\n`));
                }
                controller.enqueue(enc.encode(`event: done\ndata: {}\n\n`));
                controller.close();
              },
            });
            return new Response(toolStream, { headers: sseHeaders });
          }

          // 7.bis CACHE LOOKUP — élargi (anciennement: <2000 chars + pas de projet).
          // Maintenant: tout message ≤4000 chars qui n'est pas une image.
          // Clé inclut project_id pour isoler les contextes projet.
          // Économie ciblée: -50% sur les requêtes répétées/similaires.
          const cacheable = body.message.length <= 4000 && intentKind !== "image";
          let cacheKey: string | null = null;
          if (cacheable) {
            // Normalisation : minuscules + espaces compressés pour mieux matcher
            const normalized = body.message.trim().toLowerCase().replace(/\s+/g, " ");
            const projectScope = body.project_id ?? "global";
            cacheKey = await sha256(`${model}::${projectScope}::${normalized}`);
            const { data: cacheHit } = await supabaseAdmin.rpc(
              "get_or_increment_cache" as never,
              { _hash: cacheKey, _model: model } as never,
            );
            const hit = (cacheHit as Array<{ response: string; tokens_saved: number; cost_saved_usd: number }> | null)?.[0];
            if (hit?.response) {
              // Sert directement depuis le cache sans appeler OpenAI
              await supabase.from("messages").insert({
                conversation_id: conversationId,
                owner_id: userId,
                org_id: orgId,
                role: "assistant",
                content: hit.response,
                model_used: fullModel,
                cost_usd: 0,
                metadata: { cache_hit: true, cost_saved: hit.cost_saved_usd, intent_level: intentLevel, intent_kind: intentKind },
              });
              await supabase
                .from("conversations")
                .update({ last_message_at: new Date().toISOString() })
                .eq("id", conversationId!);

              const cacheStream = new ReadableStream({
                start(controller) {
                  const enc = new TextEncoder();
                  controller.enqueue(
                    enc.encode(
                      `event: meta\ndata: ${JSON.stringify({ conversation_id: conversationId, model: fullModel, intent: intentKind, level: intentLevel, cache_hit: true })}\n\n`,
                    ),
                  );
                  controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: hit.response })}\n\n`));
                  controller.enqueue(enc.encode(`event: done\ndata: {}\n\n`));
                  controller.close();
                },
              });
              return new Response(cacheStream, { headers: sseHeaders });
            }
          }

          // 8. Appel upstream (Lovable Gateway ou OpenAI direct selon routage).
          const upstream = await fetch(upstreamUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${upstreamKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true } }),
          });

          if (!upstream.ok || !upstream.body) {
            const errText = await upstream.text().catch(() => "");
            console.error("OpenAI primary error", upstream.status, errText);

            // Fallback : si l'utilisateur a configuré une clé Anthropic ou Google, on bascule.
            const fbEnabled = (settings as { fallback_enabled?: boolean } | null)?.fallback_enabled ?? true;
            const rawChain = (settings as { fallback_chain?: string[] } | null)?.fallback_chain ?? ["openai", "anthropic", "google"];
            const fbChain = rawChain.filter((p): p is ProviderName => p === "openai" || p === "anthropic" || p === "google");
            const transient = upstream.status === 401 || upstream.status === 402 || upstream.status === 429 || upstream.status >= 500;

            if (userApiKey && fbEnabled && transient && fbChain.some((p) => p !== "openai")) {
              try {
                const fbResult = await callWithFallback({
                  primaryProvider: "openai",
                  primaryKey: userApiKey,
                  primaryOpenAIModel: model,
                  fallbackChain: fbChain,
                  messages,
                  fetchUserKey: async (provider) => {
                    const { data } = await supabaseAdmin.rpc("get_api_key_decrypted", {
                      _owner_id: userId,
                      _provider: provider,
                    });
                    return (data as string | null) ?? null;
                  },
                  onAttempt: (info) => {
                    if (!info.ok) console.warn("[fallback]", info.provider, info.status, info.error);
                  },
                });

                await logFallbackEvent(supabaseAdmin, userId, {
                  from: "openai",
                  to: fbResult.provider,
                  primary_status: upstream.status,
                  primary_error: errText.slice(0, 300),
                  model_used: fbResult.modelUsed,
                });

                const cost = estimateCost(model, fbResult.tokensIn, fbResult.tokensOut);
                await supabase.from("messages").insert({
                  conversation_id: conversationId!,
                  owner_id: userId,
                  org_id: orgId,
                  role: "assistant",
                  content: fbResult.text,
                  model_used: fbResult.modelUsed,
                  tokens_input: fbResult.tokensIn,
                  tokens_output: fbResult.tokensOut,
                  cost_usd: cost,
                  metadata: { fallback_from: "openai", primary_status: upstream.status, intent_level: intentLevel, intent_kind: intentKind } as never,
                });
                await supabase
                  .from("conversations")
                  .update({ last_message_at: new Date().toISOString() })
                  .eq("id", conversationId!);

                if (wasNewConversation && userApiKey) {
                  void generateSmartTitle(body.message, fbResult.text, userApiKey).then((title) => {
                    if (title) {
                      void supabaseAdmin
                        .from("conversations")
                        .update({ title })
                        .eq("id", conversationId!);
                    }
                  });
                }

                const fbStream = new ReadableStream({
                  start(controller) {
                    const enc = new TextEncoder();
                    controller.enqueue(
                      enc.encode(
                        `event: meta\ndata: ${JSON.stringify({ conversation_id: conversationId, model: fbResult.modelUsed, intent: intentKind, level: intentLevel, fallback_from: "openai", fallback_reason: `OpenAI ${upstream.status}` })}\n\n`,
                      ),
                    );
                    const chunks = fbResult.text.match(/[\s\S]{1,40}/g) ?? [fbResult.text];
                    for (const c of chunks) {
                      controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: c })}\n\n`));
                    }
                    controller.enqueue(enc.encode(`event: done\ndata: {}\n\n`));
                    controller.close();
                  },
                });
                return new Response(fbStream, { headers: sseHeaders });
              } catch (fbErr) {
                console.error("All providers failed", fbErr);
                return jsonError(
                  `Tous tes providers ont échoué (OpenAI ${upstream.status}, fallback : ${fbErr instanceof Error ? fbErr.message : "ko"}). Vérifie tes clés dans Réglages.`,
                  502,
                );
              }
            }

            if (upstream.status === 401) {
              return jsonError(
                `OpenAI a refusé ta clé (401). Détail : ${errText.slice(0, 220) || "invalid_api_key"}. Va dans Réglages → Intégrations & API et recolle ta clé sk-...`,
                401,
              );
            }
            if (upstream.status === 429) {
              return jsonError("OpenAI : limite atteinte sur ton compte. Patiente ou augmente tes quotas chez OpenAI.", 429);
            }
            return jsonError(`Erreur OpenAI (${upstream.status}) : ${errText.slice(0, 200)}`, 502);
          }

          // Mark used (fire & forget)
          supabaseAdmin.rpc("mark_api_key_used", { _owner_id: userId, _provider: "openai" });

          // 9. Stream pass-through
          const stream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              const decoder = new TextDecoder();
              const reader = upstream.body!.getReader();
              let assistantText = "";
              let buffer = "";
              let usageIn = 0;
              let usageOut = 0;

              controller.enqueue(
                encoder.encode(
                  `event: meta\ndata: ${JSON.stringify({ conversation_id: conversationId, model: fullModel, intent: intentKind, level: intentLevel, rag_used: ragContext.length > 0, cache_hit: false })}\n\n`,
                ),
              );

              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  let idx: number;
                  while ((idx = buffer.indexOf("\n")) !== -1) {
                    let line = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 1);
                    if (line.endsWith("\r")) line = line.slice(0, -1);
                    if (!line.startsWith("data: ")) continue;
                    const json = line.slice(6).trim();
                    if (json === "[DONE]") continue;
                    try {
                      const parsed = JSON.parse(json);
                      const delta = parsed.choices?.[0]?.delta?.content ?? "";
                      if (delta) {
                        assistantText += delta;
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
                        );
                      }
                      // Usage stats arrivent dans le dernier chunk
                      if (parsed.usage) {
                        usageIn = parsed.usage.prompt_tokens ?? 0;
                        usageOut = parsed.usage.completion_tokens ?? 0;
                      }
                    } catch {
                      // ignore
                    }
                  }
                }
              } catch (e) {
                console.error("stream error", e);
              } finally {
                if (assistantText.trim()) {
                  // Estime le coût si l'API n'a pas renvoyé d'usage
                  if (usageIn === 0) usageIn = Math.ceil(body.message.length / 4);
                  if (usageOut === 0) usageOut = Math.ceil(assistantText.length / 4);
                  const cost = estimateCost(model, usageIn, usageOut);

                  await supabase.from("messages").insert({
                    conversation_id: conversationId!,
                    owner_id: userId,
                    org_id: orgId,
                    role: "assistant",
                    content: assistantText,
                    model_used: fullModel,
                    tokens_input: usageIn,
                    tokens_output: usageOut,
                    cost_usd: cost,
                    metadata: { intent_level: intentLevel, intent_kind: intentKind, rag_used: ragContext.length > 0 } as never,
                  });
                  await supabase
                    .from("conversations")
                    .update({
                      last_message_at: new Date().toISOString(),
                      messages_since_summary: (settings?.auto_summarize_after ?? 20) > 0 ? 0 : 0,
                    })
                    .eq("id", conversationId!);

                  // Titre intelligent (fire & forget) après le 1er échange
                  if (wasNewConversation && userApiKey) {
                    void generateSmartTitle(body.message, assistantText, userApiKey).then((title) => {
                      if (title) {
                        void supabaseAdmin
                          .from("conversations")
                          .update({ title })
                          .eq("id", conversationId!);
                      }
                    });
                  }

                  // Stocke en cache (fire & forget) pour les prochaines requêtes
                  if (cacheable && cacheKey) {
                    supabaseAdmin.from("prompt_cache" as never).insert({
                      prompt_hash: cacheKey,
                      model,
                      response: assistantText,
                      tokens_saved: usageIn + usageOut,
                      cost_saved_usd: cost,
                    } as never).then(({ error }) => {
                      if (error && !error.message.includes("duplicate")) {
                        console.warn("cache insert failed", error.message);
                      }
                    });
                  }
                }
                controller.enqueue(new TextEncoder().encode(`event: done\ndata: {}\n\n`));
                controller.close();
              }
            },
          });

          return new Response(stream, { headers: sseHeaders });
        } catch (e) {
          console.error("elena-chat fatal", e);
          return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
        }
      },
    },
  },
});
