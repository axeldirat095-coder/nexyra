/**
 * Elena Agent — autonomous tool-calling loop with SSE streaming.
 *
 * BYOK strict : utilise uniquement les clés API configurées par l'utilisateur.
 *
 * Étapes V2 intégrées :
 *  - 3 : escalade auto vers gpt-5.2 + reasoning=high si tâche complexe.
 *  - 4 : Auto-RAG project_docs (FTS) injecté dans le prompt système.
 *  - 9 : tools web_search + read_url (async) — exécutés en amont du dispatcher.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  OPENAI_TOOLS,
  executeTool,
  executeAsyncTool,
  executePilotTool,
  executeMemoryTool,
  executeAdminTool,
  executeUITool,
  vfsFromFiles,
  type AgentTrace,
  type FsMutation,
  type ToolName,
  type UISignal,
  type VFile,
} from "@/server/agent-tools.server";
import { INTEGRATION_TOOLS, executeIntegrationTool } from "@/server/integration-tools.server";
import { MCP_TOOLS, executeMcpTool } from "@/server/mcp-tools.server";
import { CROSS_PROJECT_TOOLS, executeCrossProjectTool } from "@/server/cross-project-tools.server";
import { executeDataTool } from "@/server/data-tools.server";
import { executeVoiceTool } from "@/server/voice-tools.server";
import { executeWebTool } from "@/server/web-tools.server";
import { executeDeployTool } from "@/server/deploy-tools.server";
import { executeSandboxTool } from "@/server/sandbox-tools.server";
import { executeLot7Tool } from "@/server/lot7-tools.server";
import { executeLot8Tool } from "@/server/lot8-tools.server";
import { executeLot9Tool } from "@/server/lot9-tools.server";
import { executeLot10Tool } from "@/server/lot10-tools.server";
import { executeLot11Tool } from "@/server/lot11-tools.server";
import { executeLot12Tool } from "@/server/lot12-tools.server";
import { executeLot13Tool } from "@/server/lot13-tools.server";
import {
  executeIntegrationsTool,
  INTEGRATIONS_TOOL_SCHEMAS,
} from "@/server/integrations-tools.server";
import { DOC_TOOL_SCHEMAS, executeDocTool } from "@/server/doc-tools.server";
import { LOT16_TOOL_SCHEMAS, executeLot16Tool } from "@/server/lot16-tools.server";
import { LOT18_TOOL_SCHEMAS, executeLot18Tool } from "@/server/lot18-tools.server";
import { LOT19_TOOL_SCHEMAS, executeLot19Tool } from "@/server/lot19-tools.server";
import { LOT20_TOOL_SCHEMAS, executeLot20Tool } from "@/server/lot20-tools.server";
import { LOT24_TOOL_SCHEMAS, executeLot24Tool } from "@/server/lot24-tools.server";
import { LOT25_TOOL_SCHEMAS, executeLot25Tool } from "@/server/lot25-tools.server";
import { LOT26_TOOL_SCHEMAS, executeLot26Tool } from "@/server/lot26-tools.server";
import { LOT27_TOOL_SCHEMAS, executeLot27Tool } from "@/server/lot27-tools.server";
import { LOT28_TOOL_SCHEMAS, executeLot28Tool } from "@/server/lot28-tools.server";
import { maybeRegenerateProjectSummary } from "@/server/project-summary.server";
import { classifyIntent } from "@/server/intent-classifier.server";
import { recordAgentTurn, fetchLastScreenshot } from "@/server/agent-run-state.server";
import { checkToolPolicy, policyDeniedResult } from "@/server/tool-policy.server";

interface AgentBody {
  message: string;
  files: VFile[];
  mode?: "vanilla" | "react" | "vue" | "astro" | "svelte";
  conversation_id?: string | null;
  project_id?: string | null;
  model?: string;
  /** Vision multimodale — dataURLs (data:image/...;base64,...) jointes par l'utilisateur. */
  images?: string[];
}

const MAX_ITERATIONS = 8;
// Extension adaptative : sur builds complexes (multi-pages, multi-images, blueprint
// + branchement + QA), 8 itérations peuvent ne pas suffire. Si l'agent progresse
// (mutations à chaque tour, build_check OK), on autorise jusqu'à MAX_ITERATIONS_HARD.
const MAX_ITERATIONS_HARD = 14;
// GPT-5 + tools peut générer 60-90s sur la 1re itération (gros system prompt + multi-tools).
// Timeout long mais borné pour éviter l'attente infinie.
const MODEL_TIMEOUT_MS = 45_000;
const PREMIUM_MODEL_TIMEOUT_MS = 75_000;
const ECO_MODEL_TIMEOUT_MS = 25_000;
const PROVIDER_CHAIN_BUDGET_MS = 210_000;
const STREAM_IDLE_TIMEOUT_MS = 45_000;
// ⏱️ Time-to-first-token : durée max avant le 1er chunk streamé (réception HTTP ≠ 1er token).
// Avec GPT-5 + reasoning, l'API peut renvoyer 200 OK puis "réfléchir" 60-120s en silence.
// On coupe court à 30s pour basculer vers un fallback ou afficher une erreur lisible.
const FIRST_TOKEN_TIMEOUT_MS = 30_000;
// Heartbeat envoyé au client tant que le 1er token n'est pas arrivé (évite l'effet "agent figé").
const THINKING_PING_INTERVAL_MS = 5_000;
const TOOL_TIMEOUT_MS = 60_000;

const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  codex: "https://api.openai.com/v1/chat/completions",
  xai: "https://api.x.ai/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  // Google Gemini via OpenAI-compat endpoint (excellent en sens UI/typo, complément à GPT-5)
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

const FIRST_PASS_TOOL_NAMES = new Set([
  // 🎯 1re itération = décider + planifier, pas exécuter en bloc.
  // On limite aux 5 outils nécessaires pour lire/écrire et poser le design.
  // Les autres (add_dependency, run_command, inspiration_lookup, block_remix)
  // s'ajoutent dès l'iter 1 → réduit drastiquement le payload tools envoyé à GPT-5
  // au 1er appel et raccourcit le "thinking" initial.
  "list_files",
  "read_file",
  "write_file",
  "line_replace",
  "design_blueprint",
]);
const FIRST_PASS_TOOLS = OPENAI_TOOLS.filter((tool) =>
  FIRST_PASS_TOOL_NAMES.has(tool.function.name),
);
const FILE_MUTATION_OPS = new Set(["write", "delete", "rename"]);

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: "gpt-5-mini",
  codex: "gpt-5-mini",
  xai: "grok-2-latest",
  mistral: "codestral-latest",
  google: "gemini-2.5-flash",
};

const FAST_FALLBACK_MODEL_BY_PROVIDER: Partial<Record<string, string>> = {
  openai: "gpt-5-mini",
  codex: "gpt-5-mini",
  google: "gemini-2.5-flash",
};

// Modèle premium par provider pour intent "design" (premier rendu UI premium)
const PREMIUM_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: "gpt-5",
  codex: "gpt-5",
  google: "gemini-2.5-pro",
};

// LOT 2 — Modèle économique (nano) pour intent "conversation" (questions vie courante, salutations, mini-questions)
// Économise ~80% des crédits sur les échanges qui ne demandent pas de raisonnement.
const ECO_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: "gpt-5-nano",
  codex: "gpt-5-nano",
  google: "gemini-2.5-flash-lite",
};

// On laisse passer les modèles natifs (gpt-5*, gpt-4o*) sans réécriture.
// La logique de fallback intra-provider gère un éventuel modèle indisponible.
function normalizeProviderModel(provider: string, model: string): string {
  return model
    .replace(/^openai\//, "")
    .replace(/^google\//, "")
    .trim();
}

function timeoutForModel(model: string): number {
  if (/nano|flash-lite/i.test(model)) return ECO_MODEL_TIMEOUT_MS;
  if (/^gpt-5$|gemini-2\.5-pro/i.test(model)) return PREMIUM_MODEL_TIMEOUT_MS;
  return MODEL_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timeout après ${Math.round(ms / 1000)}s`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function summarizeDeliveredWork(mutations: FsMutation[]): string {
  const files = mutations
    .filter((m) => FILE_MUTATION_OPS.has(m.op))
    .map((m) => (m.op === "rename" ? `${m.path} → ${m.newPath ?? "?"}` : m.path));
  const unique = [...new Set(files)].slice(0, 4);
  if (unique.length === 0) {
    return "⚠️ Le tour s'est terminé sans réponse claire de ma part. Reformule ta demande ou précise ce que tu attends — je n'ai rien modifié de visible.";
  }
  // Détecte si on n'a écrit QUE des assets/images (pas de composant UI rendu).
  const hasUiComponent = files.some(
    (p) => /\.(tsx|jsx|vue|svelte)$/i.test(p) && !p.includes("/assets/") && !p.startsWith("public/"),
  );
  const more = files.length > unique.length ? ` +${files.length - unique.length}` : "";
  if (!hasUiComponent) {
    return `⚠️ J'ai généré des assets (${unique.join(" · ")}${more}) mais le composant UI qui les utilise n'a pas été écrit — la preview reste vide. Relance la demande pour que je termine.`;
  }
  return `✅ C'est appliqué : ${unique.join(" · ")}${more}. Regarde la preview.`;
}

/**
 * Étape 3 — Détection de complexité + routing intelligent.
 * - 'design'   : tâche UI/visuel/refonte → modèle Pro/GPT-5 (qualité max).
 * - 'complex'  : refacto, debug, archi → escalade reasoning.
 * - 'simple'   : CRUD, edit textuel ponctuel → mini.
 * Renvoie le niveau d'intent. Le caller en déduit modèle + reasoning.
 */
type IntentLevel = "conversation" | "design" | "complex" | "simple";
function detectIntent(message: string, fileCount: number): IntentLevel {
  const t = message.toLowerCase().trim();
  // LOT 2 — Conversation : salutations, remerciements, questions vie courante, mini-questions
  // → routage vers gpt-5-nano (vrai assistant multitâche, économie crédits massive)
  // ATTENTION : on ne déclenche "conversation" QUE si aucun mot-clé build/design/action n'est présent.
  const conversationKw =
    /^(salut|bonjour|hello|hi |coucou|merci|ok|d'accord|daccord|super|parfait|cool|génial|genial|bravo|wow|ah |oui|non|peut-être|peut etre|comment ça va|comment vas-tu|ça va|tu vas bien|qui es-tu|que peux-tu|c'est quoi|qu'est-ce que|explique|dis-moi|raconte|pourquoi le ciel|météo|recette|capital|histoire de|définition|definition|différence entre|difference entre|traduction|traduit)/;
  const buildSignal =
    /\b(crée|cree|build|fais|génère|genere|ajoute|modifie|refais|recrée|recree|implémente|implemente|page|composant|component|écran|screen|landing|hero|button|formulaire|formular|fix|corrige|bug|debug|refactor|optimise|app|site|interface|ui|ux|api|backend|database|table|migration|fichier|component|hook|route)\b/;
  // Si message court (<120 chars) ET match conversation ET pas de signal build → conversation
  if (t.length < 120 && conversationKw.test(t) && !buildSignal.test(t)) return "conversation";

  // 🔍 DIAGNOSTIC PREVIEW : si l'utilisateur signale un problème d'affichage,
  // on FORCE le mode conversation (read-only) — JAMAIS de recréation.
  // Sans ça, Elena interprète "je vois plus la preview" comme "refais l'app".
  const previewIssueKw =
    /\b(preview|aperçu|apercu|écran blanc|ecran blanc|page blanche|j[ae'].{0,5}vois (plus|pas|rien)|s'affiche pas|s.affiche pas|saffiche pas|marche plus|fonctionne plus|cassé|casse|broken|blank|vide|disparu|disparue|disparait|n'apparait pas|napparait pas|ne s'affiche|ne saffiche|rien ne s'affiche|rien ne charge|loading infini|reste sur le loader)\b/;
  if (previewIssueKw.test(t)) return "conversation";

  // Design : élargi → app, mobile, pwa, dashboard, onboarding, saas, page, formulaire, écran, screen
  const designKw =
    /\b(design|hero|landing|page d'accueil|ui|ux|interface|refonte|refais|recrée|recree|plus beau|plus joli|premium|moderne|tendance|2026|wow|magnifique|stunning|crée|cree|build a|fais.{0,20}(site|app|page|écran|screen|landing)|app|application|mobile|pwa|dashboard|tableau de bord|onboarding|saas|page|formulaire|écran|screen|feed|profil|settings|réglages|landing|portfolio|blog|e-?commerce|marketplace|booking|chat|messagerie)\b/;
  const heavyKw =
    /\b(refactor|refacto|architecture|optimise|optimiser|debug|comprendre pourquoi|analyse|pourquoi.*fonctionne pas|migration|sécur|perform|tout.{0,20}fichier|chaque.{0,20}page|complet|complète|complete)\b/;
  const longMessage = message.length > 220;
  const multiFile = fileCount > 30;
  // FORCE design UNIQUEMENT si projet vide ET signal de construction explicite.
  // Sans signal build → on reste en simple/conversation (pas de refonte spontanée).
  const emptyProject = fileCount <= 6;
  if (emptyProject && message.trim().length > 12 && buildSignal.test(t)) return "design";
  if (designKw.test(t) && buildSignal.test(t)) return "design";
  if (longMessage || heavyKw.test(t) || multiFile) return "complex";
  return "simple";
}
function isComplexTask(message: string, fileCount: number): boolean {
  const lvl = detectIntent(message, fileCount);
  return lvl === "complex" || lvl === "design";
}

/**
 * Étape 4 — Auto-RAG.
 * Recherche full-text simple dans project_docs (économique : pas d'embeddings nécessaires).
 * Retourne 3 docs max, tronqués à 1500 chars chacun.
 */
async function fetchRAGContext(
  supabase: ReturnType<typeof createClient<Database>>,
  projectId: string,
  message: string,
): Promise<string> {
  // Mots-clés > 4 chars du message
  const words = (message.toLowerCase().match(/[a-zà-ÿ0-9_]{4,}/gi) ?? [])
    .filter((w) => !["avec", "sans", "dans", "pour", "elena", "comment", "fonctionne"].includes(w))
    .slice(0, 6);
  if (words.length === 0) return "";

  // ilike sur title OU content avec OR sur les mots-clés
  // Construit : title.ilike.%w1%,content.ilike.%w1%,title.ilike.%w2%...
  const orFilter = words.flatMap((w) => [`title.ilike.%${w}%`, `content.ilike.%${w}%`]).join(",");

  const { data, error } = await supabase
    .from("project_docs")
    .select("title, content, tags")
    .eq("project_id", projectId)
    .or(orFilter)
    .limit(3);
  if (error || !data || data.length === 0) return "";

  return data.map((d) => `### ${d.title}\n${d.content.slice(0, 1500)}`).join("\n\n");
}

/**
 * LOT 2 — RAG sémantique via embeddings (text-embedding-3-small + match_project_docs).
 * Plus précis que le FTS pour les requêtes naturelles ("comment fonctionne X", "où est Y").
 * Skippé si pas de clé OpenAI ou si message trop court.
 * Combiné avec le FTS via Set pour dédupliquer.
 */
async function fetchRAGContextSemantic(
  supabase: ReturnType<typeof createClient<Database>>,
  projectId: string,
  message: string,
  openaiKey: string | null,
): Promise<string> {
  if (!openaiKey || message.trim().length < 12) return "";
  try {
    // Import dynamique pour ne pas casser le bundling si le helper change
    const { generateEmbedding, toPgVector } = await import("@/server/embeddings.server");
    const vec = await generateEmbedding(message, openaiKey);
    if (!vec) return "";
    // Cast en `any` car le RPC `match_project_docs` n'est pas dans les types générés.
    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: Array<{ title: string; content: string; similarity: number }> | null;
          error: unknown;
        }>;
      }
    ).rpc("match_project_docs", {
      _project_id: projectId,
      _query_embedding: toPgVector(vec),
      _match_count: 3,
      _min_similarity: 0.55,
    });
    if (error || !data || data.length === 0) return "";
    return data
      .map(
        (d) =>
          `### ${d.title} (sim=${(d.similarity * 100).toFixed(0)}%)\n${d.content.slice(0, 1500)}`,
      )
      .join("\n\n");
  } catch (e) {
    console.warn("[elena-agent] semantic RAG failed, fallback to FTS only", e);
    return "";
  }
}

/**
 * LOT 2 — Combine RAG sémantique (priorité) + FTS (fallback/complément).
 * Dédupli par titre.
 */
async function fetchRAGContextHybrid(
  supabase: ReturnType<typeof createClient<Database>>,
  projectId: string,
  message: string,
  openaiKey: string | null,
): Promise<string> {
  const [semantic, fts] = await Promise.all([
    fetchRAGContextSemantic(supabase, projectId, message, openaiKey),
    fetchRAGContext(supabase, projectId, message),
  ]);
  if (!semantic) return fts;
  if (!fts) return semantic;
  // Dédupli grossier par 1re ligne (titre)
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const block of [semantic, fts]) {
    for (const chunk of block.split("\n\n###").map((c, i) => (i === 0 ? c : "###" + c))) {
      const title = chunk.split("\n")[0].trim();
      if (seen.has(title)) continue;
      seen.add(title);
      merged.push(chunk);
    }
  }
  return merged.slice(0, 4).join("\n\n");
}

/**
 * Chantier 1 — Mémoire conversationnelle.
 * Charge les N derniers échanges (user + assistant) de la conversation pour
 * qu'Elena ait le fil complet et ne reparte pas de zéro à chaque message.
 */
async function fetchConversationHistory(
  supabase: ReturnType<typeof createClient<Database>>,
  conversationId: string,
  limit = 40,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  // Compaction historique : on récupère jusqu'à `limit` messages récents, puis si
  // la conversation est plus longue, on injecte un message synthèse "résumé conv"
  // au début pour ne pas perdre le contexte initial sur les conversations >40 tours.
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const recent = data
    .reverse()
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  // Si on a hit la limite, injecter le résumé long_term_summary depuis la conv
  // (déjà maintenu par /api/elena-summarize) pour préserver le contexte ancien.
  if (recent.length >= limit) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("summary")
      .eq("id", conversationId)
      .maybeSingle();
    const summary = (conv?.summary ?? "").trim();
    if (summary.length > 0) {
      return [
        {
          role: "user" as const,
          content: `[Résumé des tours précédents — pour contexte uniquement]\n${summary.slice(0, 4000)}`,
        },
        ...recent,
      ];
    }
  }
  return recent;
}

/**
 * P-5 — Sélectionne les mems les plus pertinentes pour le message courant.
 * Stratégie :
 *  1) Toutes les mems `is_pinned` sont gardées (règles critiques validées par l'utilisateur).
 *  2) Pour les autres : scoring keyword (intersection des mots ≥4 chars du message
 *     avec title+body de la mem) → top jusqu'à `limit` mems.
 *  3) Si pas de match → fallback sur les `limit` plus récentes (déjà ordonnées par updated_at).
 * Cohérent avec le RAG sémantique sur project_docs (LOT 2).
 */
function selectRelevantMems<
  T extends { kind: string; title: string; body: string; is_pinned: boolean },
>(mems: T[], message: string, limit: number): T[] {
  const pinned = mems.filter((m) => m.is_pinned);
  const others = mems.filter((m) => !m.is_pinned);
  if (others.length === 0 || pinned.length >= limit) return pinned.slice(0, limit);

  const remaining = limit - pinned.length;
  const tokens = (message.toLowerCase().match(/[a-zà-ÿ0-9_]{4,}/gi) ?? []).filter(
    (w) => !["avec", "sans", "dans", "pour", "elena", "comment", "tout", "tous"].includes(w),
  );

  if (tokens.length === 0) return [...pinned, ...others.slice(0, remaining)];

  const scored = others
    .map((m) => {
      const haystack = (m.title + " " + m.body).toLowerCase();
      let score = 0;
      for (const t of tokens) if (haystack.includes(t)) score += 1;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked = scored.slice(0, remaining).map((x) => x.m);
  // Fallback : complète avec les plus récentes si pas assez de matchs
  if (picked.length < remaining) {
    const seen = new Set(picked.map((m) => m.title));
    for (const m of others) {
      if (picked.length >= remaining) break;
      if (!seen.has(m.title)) picked.push(m);
    }
  }
  return [...pinned, ...picked];
}

/**
 * Chantier 1 — Brief projet persistant.
 * Charge la description du projet + la conversation.summary pour les injecter
 * dans le system prompt (équivalent du `mem://` côté Lovable).
 *
 * P-5 — RAG sémantique sur la mémoire :
 * - Mems `is_pinned` → TOUJOURS injectées (règles critiques marquées par l'utilisateur).
 * - Mems normales → top-K (10) sélectionnées par scoring keyword vs message courant
 *   (au lieu d'injecter brut les 40). Réduit ~60% du brief dynamique non-caché.
 * - Si le message est court ou vide, fallback sur les 10 plus récentes.
 */
async function fetchProjectBrief(
  supabase: ReturnType<typeof createClient<Database>>,
  projectId: string | null,
  conversationId: string | null,
  currentMessage: string = "",
): Promise<string> {
  const parts: string[] = [];

  if (projectId) {
    const { data: proj } = await supabase
      .from("projects")
      .select("name, description, type, metadata, long_term_summary, summary_updated_at")
      .eq("id", projectId)
      .maybeSingle();
    if (proj) {
      parts.push(`### Projet : ${proj.name} (${proj.type})`);
      if (proj.description) parts.push(proj.description);
      const meta = proj.metadata as Record<string, unknown> | null;
      const brief = meta?.brief;
      if (typeof brief === "string" && brief.trim()) {
        parts.push(`**Brief produit :** ${brief.trim()}`);
      }
      // LOT #2 — Mémoire long-terme : résumé condensé du projet (auto-régénéré tous les ~30 messages)
      if (proj.long_term_summary && proj.long_term_summary.trim().length > 20) {
        const ageDays = proj.summary_updated_at
          ? Math.floor((Date.now() - new Date(proj.summary_updated_at).getTime()) / 86_400_000)
          : null;
        const freshness = ageDays !== null ? ` (mis à jour il y a ${ageDays}j)` : "";
        parts.push(
          `### 📜 Contexte projet long-terme${freshness}\n${proj.long_term_summary.trim()}`,
        );
      }
    }

    // Chantier 5 — étape de pilotage en cours (robustesse à l'interruption)
    const { data: state } = await supabase
      .from("pilot_state")
      .select("current_step_id, current_category_id, autopilot_enabled")
      .eq("project_id", projectId)
      .maybeSingle();
    if (state?.current_step_id) {
      const [{ data: step }, { data: cat }] = await Promise.all([
        supabase
          .from("pilot_steps")
          .select("title, description, status")
          .eq("id", state.current_step_id)
          .maybeSingle(),
        state.current_category_id
          ? supabase
              .from("pilot_categories")
              .select("title")
              .eq("id", state.current_category_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (step && step.status !== "done") {
        const lines = [
          `### 🎯 Étape de pilotage EN COURS`,
          `- Catégorie : ${cat?.title ?? "—"}`,
          `- Étape : ${step.title}`,
        ];
        if (step.description) lines.push(`- Détails : ${step.description}`);
        lines.push(`- Autopilote : ${state.autopilot_enabled ? "ACTIVÉ" : "désactivé"}`);
        parts.push(lines.join("\n"));
      }
    }

    // Chantier 1 — Mémoire mem:// : règles persistantes du projet
    // P-5 : retrieval intelligent au lieu d'injection brute des 40 mems.
    const { data: mems } = await supabase
      .from("project_memory")
      .select("kind, title, body, is_pinned, updated_at")
      .eq("project_id", projectId)
      .is("archived_at", null)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(40);
    if (mems && mems.length > 0) {
      const selected = selectRelevantMems(mems, currentMessage, 10);
      const lines: string[] = [
        `### 🧠 Mémoire projet (${selected.length}/${mems.length} règles pertinentes — TOUJOURS respecter)`,
      ];
      for (const m of selected) {
        const star = m.is_pinned ? "★" : "";
        lines.push(`- [${m.kind}${star}] ${m.title} — ${m.body}`);
      }
      parts.push(lines.join("\n"));
    }
  }

  if (conversationId) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("summary, title")
      .eq("id", conversationId)
      .maybeSingle();
    if (conv?.summary) {
      parts.push(`### Résumé conversation\n${conv.summary}`);
    }
  }

  return parts.join("\n\n");
}

/**
 * BUG #3 FIX — extrait un hint secteur/persona depuis le brief projet
 * pour ancrer la génération UI sur un domaine concret (vétérinaire, e-commerce, fintech…).
 */
function extractSectorHint(brief: string): string {
  if (!brief || brief.length < 20) return "";
  const lower = brief.toLowerCase();
  const sectors: Array<[RegExp, string]> = [
    [
      /v[ée]t[ée]rinaire|animaux?\s+(de\s+compagnie|domestiques?)|clinique animale/i,
      "vétérinaire / soins animaliers",
    ],
    [
      /restaurant|menu|chef|cuisine|recette|gastronomie|food\s*(truck|service)/i,
      "restauration / food",
    ],
    [
      /m[eé]dical|sant[ée]|m[eé]decin|patient|h[oô]pital|clinique|t[ée]l[ée]consult/i,
      "santé / médical",
    ],
    [/avocat|juridique|droit|cabinet|legal|notaire/i, "juridique / legal"],
    [/immobilier|property|location|appartement|annonce immo|agence immo/i, "immobilier"],
    [
      /e-?commerce|boutique en ligne|panier|checkout|catalogue produit|vente en ligne|marketplace/i,
      "e-commerce / marketplace",
    ],
    [
      /fintech|banque|finance|investissement|trading|crypto|portefeuille|wallet/i,
      "fintech / finance",
    ],
    [
      /[ée]ducation|cours|apprentissage|[ée]l[èe]ve|professeur|formation|e-?learning|lms/i,
      "éducation / e-learning",
    ],
    [/fitness|sport|coach|musculation|yoga|run(ning)?|training/i, "fitness / sport"],
    [/voyage|tourisme|h[oô]tel|booking|vol|destination|travel/i, "voyage / tourisme"],
    [/coiffure|beaut[ée]|salon|barbier|esth[ée]tique|cosm[ée]tique/i, "beauté / coiffure"],
    [/artisan|plombier|[ée]lectricien|menuisier|btp|chantier|construction/i, "artisanat / BTP"],
    [/musique|artist|concert|playlist|streaming|podcast|radio/i, "musique / audio"],
    [/jeu vid[ée]o|gaming|joueur|esport|leaderboard|tournoi/i, "gaming / esport"],
    [/rh|recrutement|cv|candidat|entreprise|emploi|job board/i, "RH / recrutement"],
    [/agence|marketing|communication|seo|social media/i, "agence / marketing"],
    [/dating|rencontre|swipe|match|couple|c[ée]libataire/i, "dating / rencontre"],
    [/livraison|colis|coursier|logistique|transport|tracking/i, "livraison / logistique"],
    [/[ée]v[ée]nement|mariage|f[êe]te|invitation|rsvp|billetterie/i, "événementiel / billetterie"],
    [/crm|gestion client|pipeline commercial|lead|prospect/i, "CRM / B2B sales"],
    [/saas|tableau de bord|analytics|dashboard b2b|outil interne/i, "SaaS B2B / outil interne"],
  ];
  for (const [rx, label] of sectors) {
    if (rx.test(brief)) return label;
  }
  // Fallback : essaye d'extraire les 1-2 premiers noms communs significatifs
  const m = lower.match(
    /\b(?:app(?:lication)?|site|plateforme|outil)\s+(?:de|pour|d[e'])\s+([a-zà-ÿ\s-]{4,40}?)(?:[.,;!?]|\s+(?:qui|avec|et|pour))/,
  );
  if (m && m[1]) return m[1].trim();
  return "";
}

type SbxMode = "vanilla" | "react" | "vue" | "astro" | "svelte";

const STACK_HINT: Record<SbxMode, string> = {
  vanilla: "Vanilla HTML / CSS / JS. Entrée : `index.html`.",
  react:
    "React 19 + TypeScript (Sandpack runtime). Composants fonctionnels, imports relatifs (`./Button`). Entrée : `App.tsx` + `index.tsx`.",
  vue: "Vue 3 + TypeScript (Composition API, `<script setup>`). Entrée : `src/App.vue` + `src/main.ts`. Single-File Components.",
  astro:
    "Astro (islands architecture, zero-JS par défaut). Pages dans `src/pages/*.astro`, frontmatter `---` pour le code serveur. Assets dans `public/`.",
  svelte:
    "Svelte 4 (compilateur). Composants `.svelte` avec balises `<script>`, `<style>` scopés. Entrée : `App.svelte` + `main.js`.",
};

/**
 * P-2 — Cache prompt exact-prefix.
 * Le system prompt est coupé en 2 :
 *  • [0] STABLE_SYSTEM_PROMPT : 100% identique d'un turn à l'autre → OpenAI cache hit garanti
 *    (préfixe long >> 1024 tokens, conditions du cache automatique remplies).
 *  • [1] buildDynamicSystemBlock(...) : varie à chaque turn (paths projet, fichiers preloadés,
 *    RAG, brief). Volontairement court pour ne pas exploser le coût input non-caché.
 *
 * Anthropic / xAI font la même chose : on garde le contenu stable AVANT le contenu volatile.
 */
const STABLE_SYSTEM_PROMPT: string = [
  "Tu es Elena, agent dev autonome Nexyra (équivalent Lovable).",
  "",
  "🚨 RÈGLE ANTI-RECRÉATION (CRITIQUE — viole et c'est un bug majeur) :",
  "- Si l'utilisateur signale un PROBLÈME D'AFFICHAGE (« je vois pas la preview », « écran blanc », « ça marche plus », « rien ne s'affiche », « la page est vide ») → tu es en mode DIAGNOSTIC.",
  "- En mode diagnostic : INTERDIT d'écrire/modifier/supprimer le moindre fichier. Tu ne fais QUE lire (read_file, list_files, build_check) pour comprendre.",
  "- Réponds en langage naturel : ce que tu as vérifié, ce que tu soupçonnes, ce que tu proposes. JAMAIS de write_file/line_replace en premier réflexe.",
  "- Si le projet semble vide (peu de fichiers) après que l'utilisateur a déjà travaillé dessus → C'EST PROBABLEMENT UN BUG DE SAUVEGARDE, pas un signal de tout reconstruire. Demande à l'utilisateur avant toute action destructrice.",
  "- ❌ JAMAIS : « je vois que la sandbox est vide, je relance la création complète ». ✅ Toujours : « la sandbox semble vide côté serveur, peux-tu vérifier que ton projet a bien été chargé ? Je peux essayer de recharger ou tu peux me dire ce que tu attendais de voir. »",
  "",
  "MÉTHODE :",
  "- Planifie en SILENCE (pas de balise <plan>). Lance directement les outils.",
  "- IMPORTANT : dès que le résultat visible demandé est atteint, ARRÊTE les outils et réponds avec une phrase finale courte. Ne boucle jamais pour perfectionner indéfiniment.",
  "- Pour les autres fichiers, utilise read_file AVANT de modifier.",
  "- ⚡ ÉCONOMIE CRÉDITS : pour TOUTE modification ciblée (ajouter une prop, changer une couleur, patcher une fonction), utilise `line_replace` (search/replace exact) — JAMAIS write_file. write_file est réservé aux NOUVEAUX fichiers ou aux refactos qui réécrivent >70% du fichier. line_replace divise le coût par 5 à 20 sur les gros fichiers.",
  "- write_file REMPLACE intégralement → contenu complet obligatoire (réservé créations + gros refactos).",
  "- Économe : touche le minimum de fichiers.",
  "- Si la mémoire projet ci-dessous contient une info utile, RÉFÈRE-T'Y au lieu d'inventer.",
  "- Le BRIEF PROJET est la source de vérité sur ce que l'utilisateur veut construire — ne dévie JAMAIS du domaine décrit (ex: si brief = app Vinted, ne génère pas un Hero générique).",
  "- L'historique conversation est fourni : sers-t'en pour comprendre les décisions déjà prises.",
  "- Pour info temps-réel ou doc externe, utilise web_search ou read_url (sparingly).",
  "- ⚡ PARALLÉLISME : si tu dois lire/écrire plusieurs fichiers indépendants, émets-les en MÊME ITÉRATION (le serveur les exécute en parallèle, gain x2-4).",
  "",
  "🎨 DESIGN-SYSTEM-FIRST (RÈGLE ABSOLUE — niveau Lovable minimum) :",
  "- Tu dois AU MINIMUM atteindre le niveau Lovable dès le 1er rendu. Lovable = plancher, pas plafond.",
  "- AVANT TOUT composant UI sur un projet vide ou template, écris D'ABORD un fichier `src/styles.css` (ou `src/index.css` selon le stack) avec un DESIGN SYSTEM RICHE :",
  "  • Palette OKLCH complète : --background, --foreground, --primary (+3 nuances), --accent, --muted, --card, --border, --ring (light + dark).",
  "  • Au moins 2 GRADIENTS sémantiques : --gradient-hero, --gradient-subtle (utiliser color-mix ou linear-gradient).",
  "  • Au moins 2 SHADOWS premium : --shadow-elegant, --shadow-glow (avec color-mix de la couleur primary).",
  "  • Transitions : --transition-smooth (cubic-bezier).",
  "  • Mode sombre PENSÉ EN PARALLÈLE (variables `.dark { ... }`).",
  "  • Typo : import font Google + définition --font-sans, --font-display.",
  "- INTERDIT : `bg-white text-black`, palette plate Tailwind par défaut, couleurs hardcodées dans les composants. Toujours via tokens sémantiques.",
  "- Pour shadcn : crée des VARIANTS premium (hero gradient, glass morphism, premium shadow) au lieu du variant default plat.",
  "",
  "🖼️ IMAGES PREMIUM (qualité Lovable+, anti-squelette) :",
  "- Une UI sans images = squelette inacceptable. Génère systématiquement.",
  "- Routing OBLIGATOIRE via le paramètre `style` de `image_generate` :",
  "  • `style: 'photo'` → Flux 1.1 Pro Ultra. Pour : héros photoréalistes, humains, produits, lifestyle, ambiance cinéma. C'est le DÉFAUT pour tout hero.",
  "  • `style: 'illustration'` → Recraft v3. Pour : icônes, illustrations vectorielles, brand assets, mascots, pictos.",
  "  • `style: 'text-image'` → Ideogram v2. Pour : logos avec texte lisible, posters, mockups d'écran, bannières avec wording.",
  "  • `style: 'auto'` → Flux par défaut.",
  "- `aspect_ratio` : `16:9` pour hero, `1:1` pour avatar/icône, `9:16` pour mobile/story, `21:9` pour bannière ultra-large.",
  "- Pour TOUT site/app complet, vise 1 hero (style photo, 16:9) + 2-4 visuels adaptés. Si tu es limité en temps/itérations, livre d'abord une interface complète fonctionnelle puis améliore les images au tour suivant.",
  '- INTERDIT : `<div className="bg-gray-200" />`, placeholders gris, ou Unsplash hardcodé. Toujours `image_generate`.',
  "- 🎨 RETOUCHE D'IMAGE EXISTANTE : si l'utilisateur dit `modifie/retouche/embellis/améliore/change le fond/recadre/colorise/éclaire [cette image]` → tu DOIS utiliser `image_edit` (PAS `image_generate` from scratch). image_edit préserve le sujet et n'altère que ce qui est demandé. image_generate from scratch = perte du contenu original = bug user.",
  '- ⚡ USAGE OBLIGATOIRE de l\'image générée — module ES6, JAMAIS de chemin public/static :',
  '  ✅ `import imgHero from "@/assets/generated/hero-mushrooms";` puis `<img src={imgHero} alt="..." className="w-full h-full object-cover" />`',
  '  ❌ `<img src="/generated/hero-mushrooms.png" />` ← NE FONCTIONNE PAS dans la sandbox preview (Sandpack ne sert pas public/* statiquement). C\'est le bug n°1 historique : alt text affiché à la place de l\'image.',
  '  ❌ `<img src="public/generated/..." />` ← jamais.',
  '  → Le nom du module = camelCase du filename (ex: filename "hero-mushrooms" → import `heroMushrooms`).',
  "- Prompts EN ANGLAIS pour qualité max (Flux/Recraft/Ideogram sont entraînés EN). Précise : sujet, style, lumière, composition, mood.",
  "",
  "📐 PATTERNS SECTORIELS (recettes par domaine — applique strictement selon le brief) :",
  "- E-commerce / Marketplace (Vinted, Etsy, Shopify-like) : header sticky + searchbar + grille produits 3-4 col + filtres pills horizontaux + cards produit avec image/prix/seller + bottom-nav mobile.",
  "- SaaS landing : hero plein écran avec gradient + headline 60px + CTA primary glow + section features 3 col avec icônes + pricing 3 plans + testimonials + footer riche.",
  "- Dashboard / Admin : sidebar nav fixe avec logo + 4 KPI cards en haut + chart hero (recharts) + table principale avec filtres date + topbar avec avatar/notifs.",
  "- Blog / Magazine : header minimal + article featured pleine largeur avec image + grille articles 2-3 col + sidebar tags/catégories + newsletter inline.",
  "- Portfolio / Agence : hero typo géante avec animation + grille projets bento (tailles variées) + section about avec photo + contact form.",
  "- Food / Recettes : hero avec photo plat + filtres catégories visuels + grille recettes cards photo+temps+difficulté + page recette structurée (ingrédients gauche / étapes droite).",
  "- EdTech / Cours : hero avec étudiants + grille cours avec progress bar + sidebar progression + quiz cards.",
  "- Fintech / Banking : dashboard solde grand + graphique balance + liste transactions + cartes virtuelles 3D + actions rapides.",
  "- Social / Community : feed timeline + sidebar profile + stories rondes en haut + cards post avec actions + suggestions.",
  "- Booking / Réservation : hero avec searchbar dates + grille listings avec carrousel image + carte map sticky + filtres avancés.",
  "- Health / Wellness : palette pastel apaisante + hero illustré + cards programmes + tracker visuel + témoignages.",
  "- B2B / Enterprise : sober premium, beaucoup de blanc + sections content-heavy + logos clients + case studies avec stats + livre blanc CTA.",
  "→ Pour chaque pattern : sections COMPLÈTES, hiérarchie claire, spacing généreux (py-20+), animations subtiles (hover, fade-in).",
  "",
  "📱 APP MOBILE-FIRST PREMIUM (référence TopChef — obligatoire pour toute demande app/mobile/PWA) :",
  "- Premier jet attendu = écran utilisable et quasi fini, pas une maquette filaire. Si l'utilisateur demande une app, génère d'abord une expérience mobile 390×844 complète avant desktop.",
  "- Structure obligatoire : shell mobile plein écran avec safe-area, header sticky/backdrop-blur, recherche/pills horizontales, cartes visuelles avec vraies images, états loading/empty, bottom navigation fixe 4-5 onglets avec icônes, feedback active:scale, padding-bottom nav.",
  "- Pattern TopChef à reproduire par domaine : fond sombre texturé/subtil, cartes catégories image plein bleed + overlay lisible, micro hiérarchie (eyebrow, titre, compteur), listes denses avec thumbnail 64-80px, badges temps/difficulté/statut, transitions tap fluides.",
  "- Pour Recettes / Food / Champignons : accueil mobile avec hero ou header illustré, recherche, catégories visuelles (Comestibles, À vérifier, Toxiques, Favoris/Saisons), cards photo, fiche détail structurée (photo, badges, avertissement sécurité, caractéristiques, habitat, confusion possible).",
  "- Interdit en premier rendu mobile : écran desktop rétréci, cartes vides, fond plat, grille qui dépasse, texte qui sort, absence de nav, placeholders gris, uniquement emojis sans images.",
  "- Avant de coder une app mobile → appelle `inspiration_lookup` avec section `mobile-app` puis applique au moins 2 patterns retournés.",
  "",

  "🔒 ENFORCEMENT QUALITÉ VISUELLE (NON-NÉGOCIABLE — checks au 1er rendu) :",
  "- ✅ PRE-FLIGHT styles.css : AVANT d'écrire le 1er composant UI sur projet vide/template, vérifie via `read_file('src/styles.css')` qu'il existe ET contient `oklch(` + `--gradient-` + `--shadow-`. Sinon → écris-le AVANT tout autre composant. Aucune exception.",
  "- ✅ HERO IMAGE AUTO : dès qu'une section Hero/landing/accueil est créée, tu DOIS émettre `image_generate(style='photo', aspect_ratio='16:9', hero=true)` dans le MÊME tour que l'écriture du composant. Pas de Hero sans image réelle. Si pas de Hero mais app mobile → 1 image lifestyle ou cover obligatoire.",
  "- ✅ PATTERNS SECTORIELS OBLIGATOIRES : si le brief / le domaine détecté correspond à un secteur de la liste ci-dessus (e-commerce, SaaS, dashboard, food, fintech, social, booking, etc.), tu DOIS appliquer les sections du pattern correspondant dans l'ordre. Pas le droit de livrer une page « générique SaaS » pour une app Vinted ou un dashboard finance.",
  "- ✅ MOBILE-FIRST 390×844 par défaut : si l'intent contient `app`, `mobile`, `pwa`, `application`, `iOS`, `Android` → tu construis D'ABORD la version mobile 390×844 complète (shell, bottom-nav, safe-area), PUIS éventuellement desktop. Jamais l'inverse.",
  "- ✅ ANIMATIONS PAR DÉFAUT : tout composant interactif a au minimum `transition-all duration-200`, `hover:` (scale, shadow, ou color shift), et `active:scale-95` sur boutons mobile. Sections principales : `animate-in fade-in slide-in-from-bottom-4` au mount. Pas d'UI statique morte.",
  "- ✅ DARK MODE TESTÉ : si le styles.css définit `.dark { ... }`, tu vérifies qu'AUCUN composant n'utilise `bg-white`, `text-black`, `bg-gray-*`, `text-gray-*` hardcodés. Tout passe par tokens (`bg-background`, `text-foreground`, `bg-card`, etc.). Le toggle dark/light DOIT donner un rendu cohérent dans les 2 modes.",
  "",

  "🧪 BACKEND MOCK AUTO (preview = vrai runtime Node, mais sans backend réel) :",
  "- Le preview tourne dans un WebContainer (vrai Node + Vite) qui exécute le code mais N'A PAS de Supabase, BDD, ni API externe configurés par défaut.",
  "- Si l'app générée fait des appels data (login, CRUD, listes, formulaires persistés) SANS que l'utilisateur ait explicitement demandé un backend réel → tu DOIS créer `src/lib/mock-backend.ts` qui expose une API in-memory + localStorage : `mockAuth` (signIn/signUp/signOut/getUser), `mockDb.from(table).select/insert/update/delete()`, `mockStorage` (Map → localStorage). Tous les composants/hooks consomment ce mock.",
  "- Données seed : ajoute 3-8 entrées réalistes par table dans `mock-backend.ts` pour que les écrans ne soient jamais vides au premier rendu.",
  "- Quand l'utilisateur dira « branche le vrai backend » → tu remplaceras les imports `@/lib/mock-backend` par les vrais clients. Le mock sert de contrat d'API.",
  "- INTERDIT : laisser `fetch('/api/...')` casser au premier clic, ou afficher des données hardcodées dans les composants (perd la dynamique). Le mock = source unique.",
  "",

  "🧠 INTELLIGENCE V3 — autonomie & continuité (CRITIQUE) :",
  "- 📋 PLAN IMPLICITE : avant un GROS chantier (création complète, refonte, ≥3 fichiers à toucher, ou tâche multi-étape), annonce en UNE phrase de 5-15 mots ton plan en 3-5 puces inline. Ex: « Plan : blueprint → palette → hero+sections → images → QA. » PUIS lance les outils sans attendre validation. Pas besoin de plan pour les fix ciblés (1 bouton, 1 couleur, 1 bug).",
  "- 🚀 AUTOPILOTE MULTI-ÉTAPE : si le tableau de pilotage contient une étape `in_progress` ou si l'utilisateur dit « go », « enchaîne », « continue », « la suite », « va-y » → tu enchaînes AUTONOMEMENT les étapes du tableau (lis avec `pilot_*` au besoin, complète avec `pilot_complete_step`, passe à la suivante avec `pilot_start_next_step`) SANS reprompter l'utilisateur entre chaque. Tu t'arrêtes seulement quand : (a) catégorie/chantier terminé, (b) décision utilisateur réelle requise, (c) blocage technique. Sinon tu continues.",
  "- 🔄 REPRISE APRÈS QUESTION ANNEXE : si pendant un chantier l'utilisateur pose une question off-topic (ex: « c'est quoi React Server Components ? » alors qu'on bosse sur la palette), réponds en 1-3 phrases puis ENCHAÎNE NATURELLEMENT : « Je reprends [contexte] : … » et continue le chantier en cours. Ne perds JAMAIS le fil. Le contexte du chantier vient de l'historique conversation et du tableau de pilotage.",
  "- ⚡ RAISONNEMENT ADAPTATIF : pour une question simple/conversation, réponds vite et court (pas de sur-analyse). Pour un design/refacto complexe, prends le temps de lire les fichiers concernés AVANT d'écrire. Le moteur ajuste déjà `reasoning_effort` selon l'intent — toi, ajuste la profondeur de tes réponses en miroir.",
  "",
  "OUTILS PILOTAGE (chantier 6) — utilise-les pour tenir le tableau à jour en temps réel :",
  "- `pilot_complete_step` : dès qu'une étape est livrée (avec une mini-synthèse 1 phrase). Indispensable en autopilote.",
  "- `pilot_start_next_step` : pour passer automatiquement à l'étape suivante après en avoir terminé une (mode autopilote).",
  "- `pilot_add_item` : si tu identifies une sous-tâche concrète à tracer (ex: composant, fichier, micro-décision).",
  "- `pilot_check_item` : pour cocher une sous-fiche au fil de l'eau.",
  "→ En mode autopilote, l'enchaînement type est : travail → `pilot_complete_step(summary)` → `pilot_start_next_step` → travail suivant.",
  "",
  "OUTILS MÉMOIRE (chantier 1 — CRITIQUE) — `mem://` style Lovable :",
  "- `memory_save` : utilise-le DÈS QUE l'utilisateur exprime :",
  "  • Un REFUS ou une INTERDICTION (ex: « non, pas de violet », « pas de Hero générique », « jamais de pop-up ») → kind: 'constraint'",
  "  • Une PRÉFÉRENCE de méthode (ex: « toujours mobile-first », « utilise shadcn ») → kind: 'preference'",
  "  • Une DÉCISION DESIGN (ex: « palette ocre + noir », « font: Inter ») → kind: 'design'",
  "  • Une CIBLE / RÈGLE MÉTIER (ex: « cible = ados 13-18 », « TVA 20% incluse ») → kind: 'feature'",
  "  • Une RÉFÉRENCE (ex: « inspiration: vinted.fr ») → kind: 'reference'",
  "  RÈGLE ABSOLUE : si l'utilisateur dit « non » + une raison, ou corrige ton travail, sauvegarde IMMÉDIATEMENT la règle pour ne JAMAIS reproposer la même chose.",
  "- `memory_list` : avant une décision design/produit ambigüe, liste les règles existantes pour vérifier qu'aucune ne s'oppose à ce que tu prévois.",
  "- `memory_archive` : si l'utilisateur change explicitement d'avis sur une règle existante.",
  "→ Le bloc « 🧠 Mémoire projet » dans le BRIEF dynamique contient toutes les règles actives — RESPECTE-LES sans exception. Toute violation = bug critique.",
  "",
  "💡 CAPTURE D'IDÉES (CRITIQUE — anti-fuite d'idées) :",
  "- `capability_capture` : DÈS QUE l'utilisateur évoque une idée d'amélioration FUTURE qu'il NE demande PAS d'implémenter maintenant, appelle-le immédiatement.",
  "- Triggers : « il faudrait que », « ce serait bien si », « plus tard », « note l'idée », « on pourrait », « j'aimerais que un jour », « pense à ».",
  "- Ne demande JAMAIS confirmation pour capturer — juste capture et confirme en 1 mot. L'idée capturée apparaît dans le tableau /capabilities.",
  "- Si l'utilisateur balance plusieurs idées en rafale, fais plusieurs `capability_capture` consécutifs.",
  "",
  "OUTILS ADMIN NEXYRA (Roadmap V2) :",
  "- `capability_sync` : à la FIN de chaque chantier Nexyra (sur le projet Nexyra lui-même uniquement), appelle-le une fois par item livré pour mettre à jour le tableau /capabilities. Repasse exactement le même `title` pour update existant. Réservé admin — ignore l'erreur 'forbidden' silencieusement si l'utilisateur n'est pas admin.",
  "- `cost_estimate` : si l'utilisateur demande « combien ça coûte », « quel budget », ou avant un gros chantier, appelle-le pour donner une projection chiffrée plutôt que de bullshiter.",
  "",
  "🗣️ MODE DISCUSSION GÉNÉRALE (CRITIQUE — agent multitâche) :",
  "- Tu n'es PAS uniquement un agent de construction. Tu es AUSSI un assistant conversationnel intelligent (style ChatGPT) qui répond à TOUTES les questions de l'utilisateur.",
  "- Détecte l'INTENTION du message :",
  "  • CONSTRUCTION (ex: « crée », « ajoute », « modifie », « refais », « génère un Hero », « build une page ») → utilise les outils file/code comme d'habitude.",
  "  • QUESTION GÉNÉRALE / CONVERSATION (ex: « c'est quoi React ? », « explique-moi… », « tu penses quoi de… », « raconte-moi », « comment on fait pour… », « quelle heure il est à NYC », « donne-moi une recette », small talk) → réponds NORMALEMENT en langage naturel, SANS appeler aucun outil file/code, comme un assistant IA classique.",
  "  • CONSEIL / BRAINSTORM SUR LE PROJET (ex: « tu mettrais quoi comme couleur ? », « quel framework choisir ? », « comment je devrais structurer ça ? ») → réponds en conseil clair, propose 2-3 options, SANS toucher au code tant que l'utilisateur n'a pas validé.",
  "  • DÉCLARATION DE RÈGLE / REFUS / PRÉFÉRENCE → memory_save + confirmation 1 phrase (cf. ci-dessous).",
  "- En mode discussion : réponses utiles, structurées (markdown OK : listes, gras), longueur adaptée à la question (courte pour question simple, détaillée pour explication). PAS de limite 1-2 phrases dans ce mode.",
  "- Tu peux quand même utiliser `web_search` ou `read_url` pour répondre à une question factuelle/actu si pertinent.",
  "- INTERDIT en mode discussion : refuser de répondre, dire « je suis un agent de construction », forcer un passage en mode build. Tu réponds, point.",
  "",
  "MESSAGE PUREMENT DÉCLARATIF (règle/préférence sans demande d'action) :",
  "- Si l'utilisateur DÉCLARE une règle/préférence/refus SANS demander d'action concrète (ex: « jamais de violet », « palette = vert et blanc », « cible ados 13-18 ») :",
  "  1) Appelle `memory_save` IMMÉDIATEMENT (un seul appel suffit).",
  "  2) Réponds en UNE phrase qui CONFIRME la règle enregistrée, pas une promesse d'action.",
  "  3) ✅ Bon : « ✅ Noté : pas de violet sur ce projet. Palette = vert + blanc. »",
  "  4) ❌ Mauvais : « Je vais ajuster les styles… un instant s'il te plaît » (Elena ne doit PAS prétendre travailler si l'utilisateur n'a pas demandé de modif).",
  "- N'invente JAMAIS une tâche que l'utilisateur n'a pas demandée. Une déclaration ≠ une demande d'implémentation.",
  "",
  "PHRASES INTERDITES (anti-théâtre) :",
  "- ❌ « un instant s'il te plaît », « je reviens », « patiente », « je m'occupe de ça », « je vais procéder », « je te reviens avec ».",
  "- Tu réponds APRÈS avoir agi, pas avant. Si tu n'as rien à faire, dis-le clairement (✅ règle enregistrée).",
  "",
  "🧭 ONBOARDING OBLIGATOIRE (étape 0 — AVANT le blueprint sur projet neuf) :",
  "- DÉCLENCHEUR STRICT : si la sandbox est vide/quasi-vide (≤3 fichiers user) ET le brief fait <60 mots, ta TOUTE PREMIÈRE action DOIT être `project_onboard` avec 3-4 questions ciblées.",
  "- Questions OBLIGATOIRES à poser (adapte aux 3-4 plus pertinentes) : (1) Type — landing marketing OU app fonctionnelle (web/mobile) OU dashboard ? (2) Public cible précis ? (3) Fonctionnalités prioritaires (top 3) ? (4) Style visuel (premium-dark / minimal / glassmorphism / coloré / éditorial) ? (5) Référence visuelle si tu en as une ?",
  "- 🚨 INTERDIT : lancer `design_blueprint` ou `image_generate` ou `write_file` AVANT d'avoir reçu les réponses d'onboarding sur un brief court. Tu gaspilles tokens + images + frustres l'user qui voit une page blanche.",
  "- Une fois les réponses récupérées (tour suivant), tu enchaînes : `design_blueprint` → SQUELETTE UI FONCTIONNEL COMPLET (fichiers .tsx/.css visibles, placeholders propres) → `build_check` → images parallèles → branchement images → `screenshot_qa`.",
  "- Skip onboarding UNIQUEMENT si AU MOINS UNE de ces conditions : (a) brief ≥60 mots ET mentionne explicitement palette OU style OU référence visuelle, OU (b) projet déjà commencé (>3 fichiers user), OU (c) demande de fix ciblé sur du code existant (1 bouton, 1 texte, 1 couleur, 1 bug). Lister 2-3 features dans le brief NE SUFFIT PAS à skipper.",
  "- ⚠️ ATTENTION CLASSIFICATION : un brief type « app pour gérer/optimiser/créer/suivre X » = APP FONCTIONNELLE (mobile-app ou dashboard), JAMAIS une landing saas. Ne pars JAMAIS en mode landing marketing si l'user demande un outil utilitaire.",
  "",
  "🚫 INTERDICTION ABSOLUE — « Regarde la preview » :",
  "- Tu n'écris JAMAIS « regarde la preview », « regarde le résultat », « c'est en ligne », « va voir » SI tu n'as PAS écrit au moins 1 fichier `.tsx`/`.jsx`/`.vue`/`.svelte` qui produit du rendu visible dans CE tour.",
  "- Générer uniquement des images/assets sans composant qui les utilise = page blanche pour l'user. C'est un BUG critique. Si tu n'as écrit que des assets, dis explicitement « assets générés, je passe au composant maintenant » et CONTINUE le travail (n'attends pas le user).",
  "",
  "📐 BLUEPRINT OBLIGATOIRE (étape 1 de tout chantier UI) :",
  "- Pour TOUTE création d'app/landing/site/dashboard depuis zéro OU refonte visuelle complète, ta PREMIÈRE action AVANT tout `write_file`/`line_replace` UI doit être `design_blueprint` (APRÈS l'onboarding si brief vague).",
  "- Tu y déclares : project_kind, domain (secteur métier du user), vibe, palette OKLCH (5 couleurs), typography (heading_font + body_font Google Fonts + h1_size_clamp), 3-8 sections ordonnées (chacune avec un block_id de la biblio ou 'custom'), 3-8 images planifiées (variable + prompt + aspect + flag hero).",
  "- Le tool VALIDE durement (palette en oklch(...), min 1 image hero, etc.) et te renvoie un CONTRAT formaté. Tu DOIS le respecter à la lettre dans la suite du tour.",
  "- Dès que blueprint validé → écris D'ABORD les fichiers UI fonctionnels (.tsx/.css) avec placeholders visuels propres. La preview doit déjà afficher une app utilisable AVANT toute génération d'image. Ensuite seulement : image_generate EN PARALLÈLE, branchement des imports, build_check, screenshot_qa.",
  "- Exception : skip blueprint si la demande user est un fix ciblé (1 bouton, 1 texte, 1 couleur) — pas si elle dit 'crée X', 'refais Y', 'génère une app Z'.",
  "",
  "🎨 INSPIRATION & BIBLIOTHÈQUE DE BLOCS PREMIUM (priorité absolue) :",
  "- `inspiration_lookup` renvoie maintenant des **BLOCS TSX RÉELS PRÊTS À COPIER** (pas que des descriptions). Sections couvertes : hero, features, pricing, testimonials, cta, navbar, footer, dashboard, mobile-app, mobile-shell, mobile-home, mobile-detail, mobile-auth, auth.",
  "- 🚨 OBLIGATION : pour TOUTE section visuelle (landing SaaS, page web, écran mobile, dashboard) tu DOIS d'abord appeler `inspiration_lookup({section: '...'})` → COPIER le code TSX retourné dans un fichier → ADAPTER UNIQUEMENT les textes/copy au domaine du user (jamais réinventer la structure ni les classes Tailwind).",
  "- Chaque bloc liste les images requises avec leur variable + prompt. Tu DOIS lancer `image_generate` EN PARALLÈLE pour TOUTES ces images dans le même tour. Les images marquées HERO → utilise `model: 'google/gemini-3-pro-image-preview'`. Les autres → `google/gemini-2.5-flash-image`.",
  "- Le `save_path` de chaque image DOIT être `src/assets/generated/<variable>.png` pour matcher l'import du bloc (ex: variable `heroProduct` → `save_path: 'src/assets/generated/heroProduct.png'`).",
  "- Si la section demandée n'existe pas dans la biblio, tu reçois des descriptions textuelles — applique-les fidèlement.",
  "- 🆕 `block_remix({block_id, vibe, radius?, density?, accent?})` : applique une vibe (premium-dark/minimal/glassmorphism/brutalist/editorial/neon) sur un bloc existant et te rend le TSX transformé. Utilise quand le user veut un style spécifique au lieu du défaut premium-dark — pas besoin de réécrire à la main.",
  "- 🔌 MCP universel : `mcp_connect({name, url, auth_kind?, token?, auth_header_name?})` enregistre n'importe quel serveur MCP (Notion, Linear, Sentry, custom…) sur le projet et fait le handshake. Puis `mcp_list_tools({server})` pour voir les capabilities, `mcp_call({server, tool, arguments})` pour exécuter. Utilise dès que l'user fournit une URL MCP.",
  "",
  "⚡ PIPELINE IMAGES PARALLÈLE (règle anti-latence — N×plus rapide ET N×moins cher) :",
  "- Le runtime EXÉCUTE TES TOOL_CALLS EN PARALLÈLE quand ils sont dans le même tour. Profites-en : 6 images en parallèle = ~6s au lieu de ~36s en série.",
  "- 🚨 RÈGLE D'OR : dès que tu connais ≥2 images à générer (via blueprint OU via les blocs piochés), tu DOIS émettre TOUS les `image_generate` dans UN SEUL message assistant (multiple tool_calls simultanés). Jamais une image par tour.",
  "- ✅ Bon pattern (1 tour) : assistant.tool_calls = [image_generate(heroProduct, hero=true), image_generate(card1), image_generate(card2), image_generate(card3), image_generate(row1), image_generate(row2)]",
  "- ❌ Mauvais pattern (6 tours) : tour1 image_generate(heroProduct) → tour2 image_generate(card1) → ... (gaspillage de latence + coût + frustration user).",
  "- Tu peux mixer dans le même tour : N×image_generate + 1×inspiration_lookup + 1×write_file styles.css. Tout part en parallèle.",
  "- Modèle par défaut : `google/gemini-2.5-flash-image` (rapide). Pour les hero/visuels clés (≤2 par projet) : `google/gemini-3-pro-image-preview`.",
  "- Si tu génères une image en série isolée alors que tu en avais d'autres à faire, c'est un BUG dans ton raisonnement — corrige-toi au tour suivant en batchant le reste.",
  "",
  "🔍 AUTO-QA + BUILD CHECK (avant de rendre la main) :",
  "- APRÈS avoir écrit/modifié des fichiers code (ts/tsx/js/jsx/json) → appelle `lint_fix` PUIS `build_check` pour normaliser et valider syntaxe/imports. Si erreurs → corrige avec `line_replace` ciblé et relance. Le moteur force automatiquement ce passage si tu rends la main sans l'avoir fait.",
  "- 🛡️ SÉCURITÉ DEPS : avant un publish ou si l'utilisateur demande un audit, appelle `dependency_scan` (zéro clé requise) — retourne les CVE high/critical sur les deps de package.json.",
  "- 🔑 SECRETS : si une fonctionnalité requiert une clé externe non encore disponible (ex: SENDGRID_API_KEY pour mail, clé d'un SaaS tiers), appelle `secrets_request` avec name + reason. NE code JAMAIS la clé en dur, NE demande JAMAIS la clé dans le chat.",
  "- 📸 GATE BLOQUANT : sur tout chantier UI/landing/page tu DOIS appeler `screenshot_qa` AVANT ta réponse finale. Le tool retourne `ok:false` si score < 80 OU ≥1 issue 🔴 OU ≥3 issues 🟡 — dans ce cas tu DOIS corriger (line_replace de préférence) et RELANCER screenshot_qa. Tu ne livres JAMAIS sans un PASS ✅ confirmé.",
  "- Si après 3 tentatives tu n'arrives pas à atteindre PASS, livre quand même mais MENTIONNE explicitement à l'user les issues résiduelles dans ta réponse finale (transparence).",
  "- Avant ta réponse finale sur un chantier UI, vérifie MENTALEMENT :",
  "  □ Le styles.css contient-il une vraie palette OKLCH + gradients + shadows ? (sinon → ajoute-le)",
  "  □ Y a-t-il au moins 1 vraie image (via image_generate) sur les pages principales ? (sinon → génère-la)",
  "  □ Le pattern sectoriel est-il respecté (sections complètes, pas une page vide) ?",
  "  □ Aucun `bg-white` / `text-black` / couleur hex hardcodée dans les composants ?",
  "  □ Mode sombre fonctionne ?",
  "- Si une case n'est pas cochée → corrige AVANT de répondre.",
  "",
  "RÉPONSE FINALE (CRITIQUE) :",
  "- En mode CONSTRUCTION : 1-2 phrases MAX en français, style Lovable. Décris l'effet visible OU la règle enregistrée, PAS la liste des fichiers.",
  "- En mode DISCUSSION / CONSEIL : longueur libre, adaptée à la question. Markdown OK (listes, gras). Sois utile et précis comme un vrai assistant IA.",
  "- ✅ Build : « Hero ajouté avec dégradé vert. Regarde la preview. »",
  "- ✅ Déclaration : « ✅ Noté : pas de violet, palette vert + blanc. »",
  "- ✅ Discussion : réponse complète et claire, pas de format imposé.",
  "- ❌ JAMAIS de balise <plan>/<thinking>, JAMAIS de phrase d'attente type « un instant ».",
].join("\n");

/**
 * P-2 — Bloc dynamique court (paths, fichiers, RAG, brief).
 * Volontairement séparé du STABLE_SYSTEM_PROMPT pour ne PAS casser le cache préfixe.
 */
function buildDynamicSystemBlock(
  mode: SbxMode,
  allPaths: string[],
  preloaded: VFile[],
  ragContext: string,
  projectBrief: string,
  byok?: { openai: boolean; fal: boolean; lovable: boolean },
): string {
  const stack = STACK_HINT[mode] ?? STACK_HINT.vanilla;
  const inlineFiles = preloaded
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 4000)}`)
    .join("\n\n");
  const ragBlock = ragContext
    ? `\nMÉMOIRE PROJET (RAG — extraits pertinents) :\n${ragContext}\n`
    : "";
  const sectorHint = extractSectorHint(projectBrief);
  const briefBlock = projectBrief
    ? `\nBRIEF PROJET (mémoire persistante — TOUJOURS respecter) :\n${projectBrief}\n${
        sectorHint
          ? `\n🎯 SECTEUR/DOMAINE DÉTECTÉ : ${sectorHint}\n→ Tout texte (hero, titres, CTA), toute image, tout pattern UI DOIT être spécifique à ce domaine. INTERDIT : "Bienvenue", "Notre solution", "Lorem", textes génériques SaaS.\n`
          : ""
      }`
    : "";
  const byokBlock = byok
    ? `\n## CAPACITÉS MULTIMÉDIA DISPONIBLES (BYOK)\n` +
      `• image_generate / image_edit (OpenAI gpt-image-1) : ${byok.openai ? "✅ DISPO" : "❌ INDISPONIBLE — clé OpenAI manquante"}\n` +
      `• image_generate (fal.ai Flux/Recraft/Ideogram premium) : ${byok.fal ? "✅ DISPO" : "❌ INDISPONIBLE — FAL_KEY non configurée"}\n` +
      `• image_generate (Lovable AI Nano Banana fallback) : ${byok.lovable ? "✅ DISPO" : "❌ INDISPONIBLE"}\n` +
      (!byok.openai && !byok.fal && !byok.lovable
        ? `\n⛔ AUCUN provider image disponible. Si l'utilisateur demande un visuel : NE PROMETS PAS d'image. Dis-lui clairement : « Je ne peux pas générer d'image, configure une clé OpenAI dans Réglages → Clés API. »\n`
        : "")
    : "";
  return [
    `## CONTEXTE DU TOUR (volatile)`,
    `Stack : ${stack}`,
    `Fichiers du projet COURANT uniquement (${allPaths.length}) : ${allPaths.slice(0, 40).join(", ")}${allPaths.length > 40 ? ", …" : ""}`,
    "⚠️ La sandbox est ISOLÉE par projet : ces fichiers appartiennent UNIQUEMENT au projet en cours.",
    "",
    `Voici DÉJÀ chargés ${preloaded.length} fichiers pertinents (pas besoin de read_file dessus) :`,
    inlineFiles || "(aucun)",
    briefBlock,
    ragBlock,
    byokBlock,
  ].join("\n");
}

function selectRelevantFiles(files: VFile[], message: string, mode: SbxMode): VFile[] {
  const MAX = 8;
  const picked = new Map<string, VFile>();

  const ENTRY_BY_MODE: Record<SbxMode, string[]> = {
    react: ["App.tsx", "index.tsx", "App.jsx", "index.jsx", "main.tsx"],
    vue: ["src/App.vue", "src/main.ts", "src/main.js"],
    astro: ["src/pages/index.astro", "astro.config.mjs"],
    svelte: ["App.svelte", "main.js", "main.ts"],
    vanilla: ["index.html", "style.css", "styles.css", "script.js"],
  };
  const entries = ENTRY_BY_MODE[mode] ?? ENTRY_BY_MODE.vanilla;
  for (const f of files) {
    if (entries.includes(f.path)) picked.set(f.path, f);
  }

  const words = message.toLowerCase().match(/[a-z0-9_]{4,}/g) ?? [];
  const stop = new Set([
    "avec",
    "sans",
    "dans",
    "pour",
    "page",
    "site",
    "app",
    "elena",
    "create",
    "ajoute",
    "modifie",
  ]);
  const keywords = [...new Set(words.filter((w) => !stop.has(w)))];

  for (const f of files) {
    if (picked.size >= MAX) break;
    if (picked.has(f.path)) continue;
    const lower = f.path.toLowerCase();
    if (keywords.some((kw) => lower.includes(kw))) picked.set(f.path, f);
  }

  return Array.from(picked.values()).slice(0, MAX);
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

function compactToolCallsForHistory(
  toolCalls: OpenAIToolCall[] | undefined,
): OpenAIToolCall[] | undefined {
  if (!toolCalls) return undefined;
  return toolCalls.map((call) => {
    const fnName = call.function.name;
    if (fnName !== "write_file" && fnName !== "line_replace") return call;
    try {
      const parsed = JSON.parse(call.function.arguments || "{}");
      if (fnName === "write_file") {
        const content = typeof parsed.content === "string" ? parsed.content : "";
        return {
          ...call,
          function: {
            ...call.function,
            arguments: JSON.stringify({
              ...parsed,
              content: `[contenu complet déjà écrit dans la VFS — ${content.length} caractères omis pour éviter la boucle]`,
            }),
          },
        };
      }
      // line_replace
      const search = typeof parsed.search === "string" ? parsed.search : "";
      const replace = typeof parsed.replace === "string" ? parsed.replace : "";
      return {
        ...call,
        function: {
          ...call.function,
          arguments: JSON.stringify({
            path: parsed.path,
            search: `[patch déjà appliqué — ${search.length} chars]`,
            replace: `[patch déjà appliqué — ${replace.length} chars]`,
          }),
        },
      };
    } catch {
      return call;
    }
  });
}

function summarizeToolArgs(tool: string, args: Record<string, unknown>): string {
  const path = (args.path as string) ?? (args.new_path as string) ?? "";
  if (path) return path;
  if (tool === "add_dependency") return String(args.package ?? args.name ?? "");
  if (tool === "run_command") return String(args.script ?? "").slice(0, 60);
  if (tool === "web_search") return String(args.query ?? "").slice(0, 60);
  if (tool === "read_url") return String(args.url ?? "").slice(0, 60);
  if (tool === "image_generate")
    return `${String(args.style ?? "auto")} · ${String(args.filename ?? "")}`;
  if (tool === "image_edit") return String(args.filename ?? "");
  if (tool === "inspiration_lookup")
    return `${String(args.section ?? "")} · ${String(args.vibe ?? "premium")}`;
  if (tool === "block_remix")
    return `${String(args.block_id ?? "")} → ${String(args.vibe ?? "premium-dark")}`;
  if (tool === "build_check") return "vérification syntaxe + imports";
  if (tool === "screenshot_qa") {
    const paths = Array.isArray((args as Record<string, unknown>).paths)
      ? ((args as Record<string, unknown>).paths as unknown[])
      : [];
    return paths.length ? `QA visuelle · ${paths.length} fichier(s)` : "QA visuelle (scan complet)";
  }
  if (tool === "ask_user") return String(args.question ?? "").slice(0, 60);
  if (tool === "project_onboard") return "questions onboarding";
  if (tool === "snapshot_create") return String(args.label ?? "snapshot");
  return "";
}

export const Route = createFileRoute("/api/elena-agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestOrigin = new URL(request.url).origin;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
          return new Response(JSON.stringify({ error: "Server misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const token = auth.slice(7);

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userId = claims.claims.sub as string;

        const body = (await request.json()) as AgentBody;
        if (!body.message?.trim() || !Array.isArray(body.files)) {
          return new Response(JSON.stringify({ error: "Invalid body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: quotaCheck } = await supabaseAdmin.rpc(
          "check_user_quota" as never,
          { _user_id: userId } as never,
        );
        const quota = quotaCheck as { allowed: boolean; reason?: string } | null;
        if (quota && !quota.allowed) {
          return new Response(JSON.stringify({ error: `🛑 ${quota.reason ?? "Quota dépassé"}.` }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: settings } = await supabase
          .from("elena_settings")
          .select("agent_provider, agent_model, fallback_chain, fallback_enabled, preferences")
          .eq("owner_id", userId)
          .maybeSingle();
        const userPrefs = ((settings?.preferences ?? {}) as Record<string, unknown>) || {};
        const explanationMode = userPrefs.explanation_mode === true;
        const autoQaEnabled = userPrefs.auto_qa !== false; // default ON
        type Provider = Database["public"]["Enums"]["ai_provider"];
        const primaryProvider: Provider = (settings?.agent_provider ?? "openai") as Provider;
        const fallbackEnabled = settings?.fallback_enabled ?? true;
        const rawChain = (settings?.fallback_chain ?? []) as string[];

        // Étape 3 — Routing intelligent : design → modèle premium, complex → modèle robuste, simple → mini.
        // Important : aucun paramètre `reasoning`/`reasoning_effort` n'est envoyé car certains endpoints le rejettent.
        // ⚡ V2.1 : classifieur LLM nano (cacheable) avec fallback regex sur detectIntent.
        const lovableApiKeyForClassify = process.env.LOVABLE_API_KEY ?? null;
        const classified = await classifyIntent(body.message.trim(), body.files.length, {
          lovableApiKey: lovableApiKeyForClassify,
          cache: supabaseAdmin as never,
        });
        const intent = classified.level;
        const supportsAdvancedModel = primaryProvider === "openai" || primaryProvider === "codex";
        const designModel = PREMIUM_MODEL_BY_PROVIDER[primaryProvider] ?? null;
        const escalatedModel =
          intent === "complex" && supportsAdvancedModel
            ? "gpt-5"
            : intent === "design" && designModel
              ? designModel
              : null;

        const supportedProviders = new Set(Object.keys(PROVIDER_ENDPOINTS));
        const attemptProviders: Provider[] = [primaryProvider];
        if (fallbackEnabled) {
          for (const p of rawChain) {
            if (!supportedProviders.has(p)) continue;
            if (attemptProviders.includes(p as Provider)) continue;
            attemptProviders.push(p as Provider);
          }
        }

        const providerKeys: Array<{
          provider: Provider;
          apiKey: string;
          model: string;
          endpoint: string;
          useReasoning: boolean;
        }> = [];
        for (const p of attemptProviders) {
          const { data: kd } = await supabaseAdmin.rpc("get_api_key_decrypted", {
            _owner_id: userId,
            _provider: p,
          });
          const k = (kd as string | null) ?? null;
          if (!k) continue;
          const baseModel =
            p === primaryProvider
              ? (body.model ??
                settings?.agent_model ??
                DEFAULT_MODEL_BY_PROVIDER[p] ??
                "gpt-5-mini")
              : (DEFAULT_MODEL_BY_PROVIDER[p] ?? "gpt-5-mini");
          const premium = PREMIUM_MODEL_BY_PROVIDER[p];
          const eco = ECO_MODEL_BY_PROVIDER[p];
          const finalModel = normalizeProviderModel(
            p,
            // LOT 2 — conversation = nano (économique)
            intent === "conversation" && eco
              ? eco
              : intent === "complex" && (p === "openai" || p === "codex")
                ? "gpt-5"
                : intent === "design" && premium
                  ? premium
                  : baseModel,
          );
          providerKeys.push({
            provider: p,
            apiKey: k,
            model: finalModel,
            endpoint: PROVIDER_ENDPOINTS[p] ?? PROVIDER_ENDPOINTS.openai,
            useReasoning: false,
          });
        }

        if (providerKeys.length === 0) {
          return new Response(
            JSON.stringify({
              error: `Configure ta clé ${primaryProvider.toUpperCase()} dans Réglages → Clés API pour activer l'agent.`,
            }),
            { status: 412, headers: { "Content-Type": "application/json" } },
          );
        }

        const mode = body.mode ?? "react";
        const vfs = vfsFromFiles(body.files);
        const mutations: FsMutation[] = [];
        const trace: AgentTrace[] = [];
        const uiSignals: UISignal[] = [];

        // Org perso (utilisée pour conv auto-créée + insert messages)
        const { data: orgRow } = await supabase
          .from("organizations")
          .select("id")
          .eq("owner_id", userId)
          .eq("is_personal", true)
          .maybeSingle();
        const orgId = orgRow?.id ?? null;

        // FIX BUG : conversation agent persistante.
        // On valide d'abord la conversation reçue, puis on persiste avec le client serveur vérifié.
        let conversationId: string | null = body.conversation_id ?? null;
        if (conversationId) {
          const { data: existingConv } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .eq("id", conversationId)
            .eq("owner_id", userId)
            .maybeSingle();
          if (!existingConv) conversationId = null;
        }
        if (!conversationId && orgId) {
          const { data: convNew } = await supabaseAdmin
            .from("conversations")
            .insert({
              owner_id: userId,
              org_id: orgId,
              project_id: body.project_id ?? null,
              title: body.message.trim().slice(0, 60),
            })
            .select("id")
            .single();
          if (convNew?.id) conversationId = convNew.id;
        }

        // LOT 2 — RAG hybride (sémantique embeddings + FTS) si une clé OpenAI est dispo
        const openaiKeyForRag =
          providerKeys.find((p) => p.provider === "openai" || p.provider === "codex")?.apiKey ??
          null;
        // LOT 17 — clé Ideogram v3 user (BYOK) pour image_generate style=text-image
        const { data: _ideogramKeyResp } = await supabase.rpc("get_external_key_decrypted", {
          _owner_id: userId,
          _service: "ideogram_api_key",
        });
        const ideogramKeyForImage = (_ideogramKeyResp as string | null) ?? null;

        // P-7 — Pre-warm : on ouvre une connexion TCP/TLS vers le provider EN PARALLÈLE
        // du chargement contextuel. Quand la vraie requête modèle partira, le handshake
        // est déjà fait → ~150-400ms gagnés sur le TTFT (surtout cold workers).
        // Fire-and-forget : on ignore résultat & erreurs, c'est juste un warmup réseau.
        const prewarmTarget = providerKeys[0];
        const prewarmEndpoint = prewarmTarget ? PROVIDER_ENDPOINTS[prewarmTarget.provider] : null;
        if (prewarmEndpoint && prewarmTarget) {
          const prewarmCtl = new AbortController();
          setTimeout(() => prewarmCtl.abort(), 1500);
          fetch(prewarmEndpoint, {
            method: "OPTIONS",
            signal: prewarmCtl.signal,
            headers: { Authorization: `Bearer ${prewarmTarget.apiKey}` },
          }).catch(() => {});
        }

        // P-3 — Speculative loading : RAG + brief + history en PARALLÈLE
        // Avant : 3 awaits séquentiels (~600-1200ms cumulés).
        // Maintenant : Promise.all → on attend le plus lent (~300-500ms).
        const [ragContext, projectBrief, history] = await Promise.all([
          body.project_id
            ? fetchRAGContextHybrid(supabase, body.project_id, body.message.trim(), openaiKeyForRag)
            : Promise.resolve(""),
          fetchProjectBrief(supabase, body.project_id ?? null, conversationId, body.message.trim()),
          conversationId
            ? fetchConversationHistory(supabase, conversationId, 24)
            : Promise.resolve([] as Awaited<ReturnType<typeof fetchConversationHistory>>),
        ]);

        const preloaded = selectRelevantFiles(body.files, body.message.trim(), mode);
        // P-2 : 2 messages system → STABLE en [0] (cache hit), DYNAMIQUE en [1].
        // Le préfixe stable >> 1024 tokens déclenche le cache automatique OpenAI/xAI.
        const messages: OpenAIMessage[] = [
          { role: "system", content: STABLE_SYSTEM_PROMPT },
          {
            role: "system",
            content: buildDynamicSystemBlock(
              mode,
              Array.from(vfs.keys()),
              preloaded,
              ragContext,
              projectBrief,
              {
                openai: !!openaiKeyForRag,
                fal: !!process.env.FAL_KEY,
                lovable: !!process.env.LOVABLE_API_KEY,
              },
            ),
          },
          ...history.map((m) => ({ role: m.role, content: m.content })),
          (() => {
            const txt = body.message.trim();
            const imgs = Array.isArray(body.images)
              ? body.images.filter((u) => typeof u === "string" && u.startsWith("data:image/")).slice(0, 6)
              : [];
            if (imgs.length === 0) return { role: "user" as const, content: txt };
            // Format multimodal compatible OpenAI gpt-5 / gpt-4o : array of parts.
            const parts: OpenAIContentPart[] = [{ type: "text", text: txt || "(image jointe — analyse-la)" }];
            for (const url of imgs) parts.push({ type: "image_url", image_url: { url, detail: "auto" } });
            return { role: "user" as const, content: parts };
          })(),
        ];

        // 🗣️ MODE EXPLICATION — si activé dans les préférences utilisateur, Elena décrit
        //    son plan d'action AVANT d'exécuter les outils.
        if (explanationMode) {
          messages.splice(2, 0, {
            role: "system",
            content:
              "🗣️ MODE EXPLICATION ACTIVÉ — Avant de lancer la moindre mutation de fichier, " +
              "rédige un court paragraphe (3-6 lignes max) qui décrit : (1) ce que tu as compris de la demande, " +
              "(2) le plan concret en 2-4 étapes numérotées, (3) les fichiers/composants principaux que tu vas créer ou modifier. " +
              "Ensuite seulement, enchaîne avec les appels d'outils. Garde le ton bref et orienté action.",
          });
        }

        // 🔍 AUTO-QA TOGGLE — si l'utilisateur a désactivé Auto-QA dans ses préférences,
        //    on indique à Elena de NE PAS appeler screenshot_qa (gain de latence/crédits).
        if (!autoQaEnabled) {
          messages.splice(2, 0, {
            role: "system",
            content:
              "🔕 AUTO-QA VISUELLE DÉSACTIVÉE par l'utilisateur dans ses préférences. " +
              "Tu N'APPELLES PAS `screenshot_qa` à la fin du chantier. Tu livres directement après `build_check` (qui reste obligatoire pour les fichiers code). " +
              "Cette instruction PRIME sur la règle 'GATE BLOQUANT screenshot_qa' du prompt principal.",
          });
        }

        // 🚀 FORCE-EXECUTION GUARD — Bug fréquent : utilisateur dit « finalise / termine /
        //    continue / vas-y », Elena re-pondère le même plan textuel sans exécuter.
        //    Si on détecte un signal de continuation ET qu'une étape pilot est active
        //    ET que les 2 derniers messages assistant n'ont produit aucune mutation,
        //    on injecte une directive explicite : EXÉCUTE l'étape, pas de plan.
        {
          const userTxt = body.message.trim();
          const isContinuation =
            /^(go|ok|oui|yep|vas[- ]?y|c'est bon|c est bon|continue(z)?|finalise(z)?|termine(z)?|enchaîne|enchaine|fais[- ]le|done|ship|let'?s go|let's? do it)\b/i.test(
              userTxt,
            ) || userTxt.length <= 20;
          const hasActivePilot = projectBrief.includes("🎯 Étape de pilotage EN COURS");
          if (isContinuation && hasActivePilot && conversationId) {
            const { data: lastAssistants } = await supabase
              .from("messages")
              .select("metadata")
              .eq("conversation_id", conversationId)
              .eq("role", "assistant")
              .order("created_at", { ascending: false })
              .limit(2);
            const noMutationsRecently =
              (lastAssistants ?? []).length > 0 &&
              (lastAssistants ?? []).every((m) => {
                const meta = m.metadata as { mutations?: number } | null;
                return !meta || (typeof meta.mutations === "number" && meta.mutations === 0);
              });
            if (noMutationsRecently) {
              messages.push({
                role: "system",
                content:
                  "🚀 SIGNAL DE CONTINUATION DÉTECTÉ — l'utilisateur veut que tu EXÉCUTES, pas que tu re-planifies. " +
                  "Les 2 derniers tours assistant n'ont produit AUCUNE mutation de fichier. " +
                  "INTERDIT au prochain tour : (1) re-décrire le plan, (2) reposer une question d'onboarding, (3) répondre uniquement par texte. " +
                  "ACTION OBLIGATOIRE : appelle directement les outils nécessaires pour avancer l'étape pilot active (write_file / line_replace / image_generate / build_check selon ce qui manque). Si tu n'as plus rien à faire, marque l'étape comme terminée via `pilot_complete_step`.",
              });
            }
          }
        }

        // Persiste le message utilisateur AVANT l'appel modèle.
        // Avant, si l'agent plantait avant la fin, le chat restait visible en local puis disparaissait au refresh.
        let userMessagePersisted = false;
        const userMessageContent = body.message.trim();
        if (conversationId && orgId) {
          let { error: userPersistErr } = await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            owner_id: userId,
            org_id: orgId,
            role: "user",
            content: userMessageContent,
            metadata: { agent: true },
          });
          // FIX FK : si la conversation référencée n'existe plus (purgée, race), on en
          // recrée une à la volée et on retente UNE fois plutôt que d'abandonner la persistance.
          if (
            userPersistErr &&
            /foreign key|messages_conversation_id_fkey/i.test(userPersistErr.message)
          ) {
            const { data: convRecreated } = await supabaseAdmin
              .from("conversations")
              .insert({
                owner_id: userId,
                org_id: orgId,
                project_id: body.project_id ?? null,
                title: body.message.trim().slice(0, 60),
              })
              .select("id")
              .single();
            if (convRecreated?.id) {
              conversationId = convRecreated.id;
              const retry = await supabaseAdmin.from("messages").insert({
                conversation_id: conversationId,
                owner_id: userId,
                org_id: orgId,
                role: "user",
                content: userMessageContent,
                metadata: { agent: true },
              });
              userPersistErr = retry.error;
            }
          }
          userMessagePersisted = !userPersistErr;
          if (userPersistErr) {
            console.error("[elena-agent] user message persist failed", userPersistErr.message);
          } else {
            await supabaseAdmin
              .from("conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", conversationId);
          }
        }

        let streamClosed = false;
        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (event: string, data: unknown) => {
              if (streamClosed) return false;
              try {
                controller.enqueue(
                  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                );
                return true;
              } catch (err) {
                streamClosed = true;
                console.warn("[elena-agent] stream already closed, event skipped", event, err);
                return false;
              }
            };
            const closeStream = () => {
              if (streamClosed) return;
              streamClosed = true;
              try {
                controller.close();
              } catch (err) {
                console.warn("[elena-agent] stream close skipped", err);
              }
            };
            let finalText = "";
            let totalTokensIn = 0;
            let totalTokensOut = 0;
            let doneSent = false;
            const sendDoneOnce = (payload: Record<string, unknown>) => {
              if (doneSent) return;
              doneSent = true;
              send("done", payload);
            };
            let activeIdx = 0;
            let active = providerKeys[activeIdx];

            // ---- Keep-alive SSE ----
            // Cloudflare Workers / proxies coupent les connexions HTTP « idle » (~30-100s sans bytes).
            // Pendant qu'on attend la 1re réponse du modèle (ou entre 2 itérations longues), on
            // pousse un commentaire SSE neutre toutes les 15s pour garder le canal vivant.
            const keepAlive = setInterval(() => {
              if (streamClosed) return;
              try {
                controller.enqueue(enc.encode(`: keep-alive ${Date.now()}\n\n`));
              } catch {
                /* stream déjà fermé */
              }
            }, 15_000);

            try {
              // Émet conversation_id immédiatement (utile si auto-créée) pour que le front se synchronise.
              if (conversationId) {
                send("meta", { conversation_id: conversationId });
              }

              // Indique l'intent + modèle choisi (transparence routing)
              send("tool_start", {
                iteration: -1,
                tool: "router",
                summary: `intent=${intent} → ${active.provider}/${active.model}`,
              });
              send("tool_end", {
                iteration: -1,
                tool: "router",
                ok: true,
                summary: `${intent} · ${active.model}${active.useReasoning ? " (reasoning)" : ""}`,
              });
              if (escalatedModel && active.useReasoning) {
                send("tool_start", {
                  iteration: -1,
                  tool: "reasoning_boost",
                  summary: `mode complexe → ${escalatedModel}`,
                });
                send("tool_end", {
                  iteration: -1,
                  tool: "reasoning_boost",
                  ok: true,
                  summary: escalatedModel,
                });
              }
              if (ragContext) {
                send("tool_start", {
                  iteration: -1,
                  tool: "auto_rag",
                  summary: "mémoire projet injectée",
                });
                send("tool_end", {
                  iteration: -1,
                  tool: "auto_rag",
                  ok: true,
                  summary: `${ragContext.length} chars`,
                });
              }
              if (projectBrief) {
                send("tool_start", {
                  iteration: -1,
                  tool: "project_brief",
                  summary: "brief projet chargé",
                });
                send("tool_end", {
                  iteration: -1,
                  tool: "project_brief",
                  ok: true,
                  summary: `${projectBrief.length} chars`,
                });
              }
              if (history.length > 0) {
                send("tool_start", {
                  iteration: -1,
                  tool: "conversation_memory",
                  summary: `${history.length} messages`,
                });
                send("tool_end", {
                  iteration: -1,
                  tool: "conversation_memory",
                  ok: true,
                  summary: `${history.length} échanges chargés`,
                });
              }

              // LOT 1 — Stop serveur réel : timestamp de référence pour détecter les annulations
              const agentStartedAt = new Date().toISOString();
              const checkCancelled = async (): Promise<boolean> => {
                if (!conversationId) return false;
                try {
                  const { data } = await supabaseAdmin.rpc("is_agent_cancelled", {
                    _conversation_id: conversationId,
                    _since: agentStartedAt,
                  });
                  return data === true;
                } catch (err) {
                  console.warn("[elena-agent] cancel check failed", err);
                  return false;
                }
              };

              let previewGuardCount = 0;
              // 🧭 GARDE ONBOARDING — projet vide + brief court → impose project_onboard au 1er tour.
              const userBrief = body.message.trim();
              const wordCount = userBrief.split(/\s+/).filter(Boolean).length;
              const userFileCount = Array.from(vfs.keys()).filter(
                (p) => !p.startsWith("public/") && !p.startsWith("node_modules") && p !== ".env",
              ).length;
              const mentionsStyleOrRef =
                /\b(palette|couleur|style|design system|inspir|comme\s+\w+|r[eé]f[eé]rence|figma|dribbble|screenshot|maquette|moodboard|premium-dark|minimal|glassmorph|brutalist|neon)\b/i.test(
                  userBrief,
                );
              const isFixRequest =
                /\b(fix|bug|corrige|change|modifie|remplace|ajoute juste|enl[èe]ve|supprime|update|vire)\b/i.test(
                  userBrief,
                ) && wordCount < 30;
              const shouldOnboard =
                userFileCount <= 3 &&
                wordCount < 60 &&
                !mentionsStyleOrRef &&
                !isFixRequest &&
                history.length === 0;
              let onboardGuardTriggered = false;
              // Adaptive cap : commence à MAX_ITERATIONS, peut grimper jusqu'à
              // MAX_ITERATIONS_HARD si l'agent progresse (mutations à chaque tour récent).
              let dynamicCap = MAX_ITERATIONS;
              let mutationsAtIterStart = 0;
              // Compaction historique : on indexe les messages tool par itération
              // pour pouvoir les compresser dès qu'ils ne sont plus "frais" (iter-2 et +).
              // Gain : payload envoyé à GPT-5 reste borné même sur 8 itérations.
              const toolMsgsByIter = new Map<number, number[]>();
              const compactedIters = new Set<number>();
              // Reprise auto mid-loop : compte les coupures stream récupérées dans ce run.
              let midStreamRecoveries = 0;
              for (let iter = 0; iter < dynamicCap; iter++) {
                // Compacte les résultats tool des itérations anciennes (≤ iter-2).
                // On garde frais : itération courante + précédente.
                const compactBefore = iter - 2;
                if (compactBefore >= 0) {
                  for (const [pastIter, idxs] of toolMsgsByIter) {
                    if (pastIter > compactBefore || compactedIters.has(pastIter)) continue;
                    for (const idx of idxs) {
                      const m = messages[idx];
                      if (
                        m &&
                        m.role === "tool" &&
                        typeof m.content === "string" &&
                        m.content.length > 300
                      ) {
                        m.content = `[résultat tool iter ${pastIter} compacté — ${m.content.length} chars omis pour réduire le payload]`;
                      }
                    }
                    compactedIters.add(pastIter);
                  }
                }
                // Extension adaptative : à partir de l'avant-dernière itération, si l'agent
                // a produit ≥1 mutation lors des 2 derniers tours, on autorise +2 itérations
                // (jusqu'au cap hard). Sinon on coupe — pas de gaspillage.
                if (iter >= dynamicCap - 1 && dynamicCap < MAX_ITERATIONS_HARD) {
                  const recentMutations = mutations.length - mutationsAtIterStart;
                  if (recentMutations > 0) {
                    dynamicCap = Math.min(dynamicCap + 2, MAX_ITERATIONS_HARD);
                  }
                }
                mutationsAtIterStart = mutations.length;
                // Stop serveur : si l'utilisateur a cliqué "Stop", on sort proprement
                if (await checkCancelled()) {
                  send("tool_start", {
                    iteration: iter,
                    tool: "cancelled",
                    summary: "Arrêt demandé par l'utilisateur",
                  });
                  send("tool_end", {
                    iteration: iter,
                    tool: "cancelled",
                    ok: true,
                    summary: "Agent stoppé",
                  });
                  finalText =
                    finalText ||
                    "⏹️ Arrêté à ta demande. Aucune itération supplémentaire n'a consommé de crédits.";
                  break;
                }
                let resp: Response | null = null;
                let lastErrTxt = "";
                let lastErrStatus = 0;
                let lastErrProvider = "";
                let providerBudgetExpired = false;
                const providerBudgetStartedAt = Date.now();
                for (let a = activeIdx; a < providerKeys.length && !providerBudgetExpired; a++) {
                  const candidate = providerKeys[a];
                  // Fallback intra-provider : si le modèle premium renvoie 404/400/model_not_found,
                  // on retente avec une cascade de modèles connus pour la même clé.
                  const modelCandidates: string[] = [candidate.model];
                  if (candidate.provider === "openai" || candidate.provider === "codex") {
                    for (const fb of ["gpt-5", "gpt-5-mini", "gpt-4o-mini"]) {
                      if (!modelCandidates.includes(fb)) modelCandidates.push(fb);
                    }
                  } else {
                    const fastFallback = FAST_FALLBACK_MODEL_BY_PROVIDER[candidate.provider];
                    if (fastFallback && !modelCandidates.includes(fastFallback))
                      modelCandidates.push(fastFallback);
                  }
                  let gotResp = false;
                  for (const tryModel of modelCandidates) {
                    const remainingBudgetMs =
                      PROVIDER_CHAIN_BUDGET_MS - (Date.now() - providerBudgetStartedAt);
                    if (remainingBudgetMs <= 5_000) {
                      providerBudgetExpired = true;
                      lastErrTxt = "Budget temps agent épuisé avant réponse modèle";
                      lastErrStatus = 504;
                      lastErrProvider = candidate.provider;
                      break;
                    }
                    // P-7 : downgrade auto vers le modèle eco/mini à partir de l'itération 2.
                    // Le 1er tour pose le plan avec le modèle premium ; les itérations suivantes
                    // (exécution mécanique des tools) tournent sur mini → -50% sur le coût total.
                    let effectiveModel = tryModel;
                    if (iter >= 2) {
                      if (candidate.provider === "openai" || candidate.provider === "codex") {
                        effectiveModel = "gpt-5-mini";
                      } else {
                        const eco = ECO_MODEL_BY_PROVIDER[candidate.provider];
                        if (eco) effectiveModel = eco;
                      }
                    }
                    // Vision multimodale : OpenAI/Codex acceptent content array
                    // (parts text+image_url). Pour les autres providers (anthropic/google/deepseek)
                    // on aplatit en texte pour éviter une 400.
                    const supportsVision =
                      candidate.provider === "openai" || candidate.provider === "codex";
                    const messagesForProvider = supportsVision
                      ? messages
                      : messages.map((m) => {
                          if (Array.isArray(m.content)) {
                            const txt = m.content
                              .map((p) =>
                                p.type === "text"
                                  ? p.text
                                  : "[image jointe — non supportée par ce provider]",
                              )
                              .join("\n");
                            return { ...m, content: txt };
                          }
                          return m;
                        });
                    const reqBody: Record<string, unknown> = {
                      model: effectiveModel,
                      messages: messagesForProvider,
                      tools:
                        iter === 0 ? FIRST_PASS_TOOLS : [...OPENAI_TOOLS, ...INTEGRATION_TOOLS, ...INTEGRATIONS_TOOL_SCHEMAS, ...DOC_TOOL_SCHEMAS, ...LOT16_TOOL_SCHEMAS, ...LOT18_TOOL_SCHEMAS, ...LOT19_TOOL_SCHEMAS, ...LOT20_TOOL_SCHEMAS, ...LOT24_TOOL_SCHEMAS, ...LOT25_TOOL_SCHEMAS, ...LOT26_TOOL_SCHEMAS, ...LOT27_TOOL_SCHEMAS, ...LOT28_TOOL_SCHEMAS, ...MCP_TOOLS, ...CROSS_PROJECT_TOOLS],
                      tool_choice: "auto",
                      parallel_tool_calls: true,
                      stream: true,
                      stream_options: { include_usage: true },
                    };
                    // Intelligence P0 — reasoning_effort adaptatif (GPT-5 family only).
                    // simple/conversation → low (TTFT rapide), design/complex → high (raisonne).
                    // Itérations ≥2 (exécution mécanique de tools) → low quel que soit l'intent.
                    if (
                      (candidate.provider === "openai" || candidate.provider === "codex") &&
                      /^gpt-5/.test(effectiveModel)
                    ) {
                      const effort: "low" | "medium" | "high" =
                        iter >= 2
                          ? "low"
                          : intent === "complex" || intent === "design"
                            ? "high"
                            : intent === "conversation"
                              ? "low"
                              : "medium";
                      reqBody.reasoning_effort = effort;
                    }
                    let r: Response;
                    const modelAbort = new AbortController();
                    let modelTimedOut = false;
                    const modelTimeoutMs = Math.max(
                      5_000,
                      Math.min(timeoutForModel(tryModel), remainingBudgetMs),
                    );
                    const modelTimeout = setTimeout(() => {
                      modelTimedOut = true;
                      modelAbort.abort();
                    }, modelTimeoutMs);
                    try {
                      r = await fetch(candidate.endpoint, {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${candidate.apiKey}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify(reqBody),
                        signal: modelAbort.signal,
                      });
                    } catch (netErr) {
                      const isAbort =
                        modelTimedOut || (netErr instanceof Error && netErr.name === "AbortError");
                      lastErrTxt = isAbort
                        ? `Timeout: aucun token reçu après ${Math.round(modelTimeoutMs / 1000)}s (modèle saturé ou requête trop lourde)`
                        : `Network: ${netErr instanceof Error ? netErr.message : "fetch failed"}`;
                      lastErrStatus = isAbort ? 504 : 0;
                      lastErrProvider = candidate.provider;
                      console.error(
                        `[elena-agent] ${candidate.provider} ${isAbort ? "timeout" : "network"} error`,
                        netErr,
                      );
                      // Sur timeout premium, on tente le modèle rapide de la même clé avant de changer de provider.
                      if (isAbort) continue;
                      continue;
                    } finally {
                      clearTimeout(modelTimeout);
                    }
                    if (r.ok) {
                      resp = r;
                      if (tryModel !== candidate.model) {
                        send("fallback", {
                          from: `${candidate.provider}/${candidate.model}`,
                          to: `${candidate.provider}/${tryModel}`,
                        });
                        candidate.model = tryModel;
                      }
                      if (a !== activeIdx) {
                        send("fallback", {
                          from: providerKeys[activeIdx].provider,
                          to: candidate.provider,
                        });
                        activeIdx = a;
                        active = candidate;
                      }
                      gotResp = true;
                      break;
                    }
                    lastErrTxt = await r.text().catch(() => "");
                    lastErrStatus = r.status;
                    lastErrProvider = candidate.provider;
                    console.error(
                      `[elena-agent] ${candidate.provider} (${tryModel}) HTTP ${r.status}: ${lastErrTxt.slice(0, 500)}`,
                    );
                    // Modèle indisponible (404, 400 invalid_request_error, model_not_found, unsupported)
                    // → on tente le modèle suivant de la même clé.
                    const isModelMissing =
                      r.status === 404 ||
                      (r.status === 400 &&
                        /model|invalid_request_error|unsupported/i.test(lastErrTxt)) ||
                      /model.{0,20}(not.{0,5}found|does.{0,5}not.{0,5}exist|invalid|unsupported)/i.test(
                        lastErrTxt,
                      );
                    const isTransientModelFailure =
                      r.status === 408 ||
                      r.status === 429 ||
                      r.status === 500 ||
                      r.status === 502 ||
                      r.status === 503 ||
                      r.status === 504;
                    // Erreur temporaire/saturation sur un modèle premium → tente le modèle rapide
                    // de la même clé avant d'abandonner le provider entier.
                    if (isTransientModelFailure) continue;
                    if (!isModelMissing) break;
                  }
                  if (gotResp) break;
                  // Quota / auth / rate limit / timeout → bascule vers le provider suivant
                  // de la chaîne (sinon on bloque le tour entier sur un seul provider en panne).
                  if (
                    lastErrStatus === 429 ||
                    lastErrStatus === 401 ||
                    lastErrStatus === 402 ||
                    lastErrStatus === 403 ||
                    lastErrStatus === 502 ||
                    lastErrStatus === 503 ||
                    lastErrStatus === 504 // timeout côté nous
                  ) {
                    continue;
                  }
                }
                if (!resp) {
                  // Parse OpenAI-style { error: { message } } pour message lisible
                  let pretty = lastErrTxt;
                  try {
                    const j = JSON.parse(lastErrTxt);
                    pretty = j?.error?.message ?? lastErrTxt;
                  } catch {
                    /* keep raw */
                  }
                  const isTimeout = lastErrStatus === 504;
                  const isProviderBusy =
                    lastErrStatus === 429 || lastErrStatus === 502 || lastErrStatus === 503;
                  const detail = isTimeout
                    ? "⏱️ Tous les fournisseurs ont mis trop de temps à répondre. Essaie de simplifier ta demande ou de la découper en plusieurs étapes — relance dans 30s."
                    : isProviderBusy
                      ? "⚠️ Les fournisseurs IA sont temporairement saturés. J’ai tenté les modèles rapides ; relance dans quelques secondes ou réduis la demande."
                      : `${lastErrProvider || "provider"} ${lastErrStatus || "?"} : ${pretty.slice(0, 280) || "aucune réponse"}`;
                  const errorText = isTimeout || isProviderBusy ? detail : `❌ Agent : ${detail}`;
                  sendDoneOnce({
                    text: errorText,
                    mutations: [],
                    trace,
                    conversation_id: conversationId,
                    ui_signals: uiSignals,
                    usage: {
                      tokens_in: totalTokensIn,
                      tokens_out: totalTokensOut,
                      model: active?.model ?? "unknown",
                      provider: active?.provider ?? lastErrProvider,
                      intent,
                      fallback_used: activeIdx > 0,
                    },
                  });
                  if (conversationId && orgId) {
                    await supabaseAdmin.from("messages").insert({
                      conversation_id: conversationId,
                      owner_id: userId,
                      org_id: orgId,
                      role: "assistant",
                      content: errorText,
                      model_used: active ? `${active.provider}/${active.model}` : null,
                      metadata: { agent: true, error: true, intent_level: intent, reply_to_content: userMessageContent },
                    });
                    await supabaseAdmin
                      .from("conversations")
                      .update({ last_message_at: new Date().toISOString() })
                      .eq("id", conversationId);
                  }
                  return;
                }

                // P-6 : parsing SSE token-par-token.
                // - Accumule `content` (texte) et émet `text_delta` au client en temps réel.
                // - Reconstruit les `tool_calls` à partir des deltas (index → {id, name, args string}).
                // - Récupère l'usage final dans le dernier chunk (stream_options.include_usage).
                let assembledContent = "";
                const toolCallsAcc: Array<{ id: string; name: string; args: string }> = [];
                let chunkUsage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
                let firstTextDeltaSent = false;
                let firstChunkReceived = false;

                if (!resp.body) break;
                const streamReader = resp.body.getReader();
                const streamDecoder = new TextDecoder();
                let sseBuf = "";
                let sseDone = false;

                // 💓 Heartbeat "thinking" — tant qu'aucun token n'est arrivé,
                // on envoie un événement SSE toutes les 5s pour que le client
                // affiche "Elena réfléchit (12s)…" plutôt qu'un agent figé.
                const ttftStartedAt = Date.now();
                const thinkingPing = setInterval(() => {
                  if (firstChunkReceived) return;
                  const elapsedMs = Date.now() - ttftStartedAt;
                  send("thinking", {
                    iteration: iter,
                    elapsed_ms: elapsedMs,
                    provider: active.provider,
                    model: active.model,
                  });
                }, THINKING_PING_INTERVAL_MS);

                let streamFatalError: Error | null = null;
                try {
                  while (!sseDone) {
                    // ⏱️ Timeout adaptatif : avant le 1er chunk on applique TTFT (30s).
                    // Après, on retombe sur STREAM_IDLE (45s) pour les gaps inter-chunks.
                    const readTimeoutMs = firstChunkReceived
                      ? STREAM_IDLE_TIMEOUT_MS
                      : FIRST_TOKEN_TIMEOUT_MS;
                    const readTimeoutLabel = firstChunkReceived
                      ? `${active.provider}/${active.model} stream idle`
                      : `${active.provider}/${active.model} 1er token (TTFT ${Math.round(readTimeoutMs / 1000)}s)`;
                    const { done: rDone, value } = await withTimeout(
                      streamReader.read(),
                      readTimeoutMs,
                      readTimeoutLabel,
                    );
                    if (rDone) break;
                    if (!firstChunkReceived) {
                      firstChunkReceived = true;
                      send("first_chunk", {
                        iteration: iter,
                        ttft_ms: Date.now() - ttftStartedAt,
                      });
                    }
                    sseBuf += streamDecoder.decode(value, { stream: true });
                    let nlIdx: number;
                    while ((nlIdx = sseBuf.indexOf("\n")) !== -1) {
                      let rawLine = sseBuf.slice(0, nlIdx);
                      sseBuf = sseBuf.slice(nlIdx + 1);
                      if (rawLine.endsWith("\r")) rawLine = rawLine.slice(0, -1);
                      if (!rawLine.startsWith("data: ")) continue;
                      const data = rawLine.slice(6).trim();
                      if (data === "[DONE]") {
                        sseDone = true;
                        break;
                      }
                      if (!data) continue;
                      try {
                        const chunk = JSON.parse(data) as {
                          choices?: Array<{
                            delta?: {
                              content?: string | null;
                              tool_calls?: Array<{
                                index: number;
                                id?: string;
                                function?: { name?: string; arguments?: string };
                              }>;
                            };
                          }>;
                          usage?: { prompt_tokens?: number; completion_tokens?: number };
                        };
                        if (chunk.usage) chunkUsage = chunk.usage;
                        const delta = chunk.choices?.[0]?.delta;
                        if (!delta) continue;
                        if (typeof delta.content === "string" && delta.content.length > 0) {
                          assembledContent += delta.content;
                          if (!firstTextDeltaSent) {
                            send("text_start", { iteration: iter });
                            firstTextDeltaSent = true;
                          }
                          send("text_delta", { iteration: iter, delta: delta.content });
                        }
                        if (delta.tool_calls) {
                          for (const tc of delta.tool_calls) {
                            const idx = tc.index ?? 0;
                            if (!toolCallsAcc[idx]) {
                              toolCallsAcc[idx] = { id: tc.id ?? "", name: "", args: "" };
                            }
                            if (tc.id) toolCallsAcc[idx].id = tc.id;
                            if (tc.function?.name) toolCallsAcc[idx].name += tc.function.name;
                            if (tc.function?.arguments)
                              toolCallsAcc[idx].args += tc.function.arguments;
                          }
                        }
                      } catch {
                        // chunk JSON tronqué → on remet la ligne dans le buffer pour la prochaine itération
                        sseBuf = rawLine + "\n" + sseBuf;
                        break;
                      }
                    }
                  }
                } catch (streamErr) {
                  streamFatalError = streamErr instanceof Error ? streamErr : new Error(String(streamErr));
                  // Tentative de fermeture propre du reader (best-effort)
                  try {
                    await streamReader.cancel();
                  } catch {
                    /* noop */
                  }
                } finally {
                  clearInterval(thinkingPing);
                }

                if (streamFatalError) {
                  const isTtft = !firstChunkReceived;

                  // 🔁 REPRISE AUTO MID-LOOP — si on a déjà reçu du contenu (texte ou tool_calls)
                  // avant la coupure, on ne tue PAS le tour : on pousse ce qu'on a en historique,
                  // on injecte un hint "continue où tu t'es arrêté", et on relance la même iter.
                  // Limité à 2 reprises par run pour éviter les boucles infinies.
                  const hasPartialProgress =
                    !isTtft &&
                    (assembledContent.length > 0 || toolCallsAcc.filter(Boolean).length > 0);
                  if (hasPartialProgress && midStreamRecoveries < 2) {
                    midStreamRecoveries += 1;
                    // Reconstruit ce qu'on a (tool_calls partiels = on garde uniquement
                    // ceux dont les arguments JSON parsent — sinon on jette pour éviter une 400)
                    const partialToolCalls = toolCallsAcc.filter(Boolean).flatMap((t) => {
                      if (!t.name || !t.args) return [];
                      try {
                        JSON.parse(t.args);
                      } catch {
                        return [];
                      }
                      return [{
                        id: t.id || `call_${Math.random().toString(36).slice(2, 10)}`,
                        type: "function" as const,
                        function: { name: t.name, arguments: t.args },
                      }];
                    });
                    if (assembledContent.length > 0 || partialToolCalls.length > 0) {
                      messages.push({
                        role: "assistant",
                        content: assembledContent || null,
                        tool_calls: partialToolCalls.length > 0
                          ? compactToolCallsForHistory(partialToolCalls)
                          : undefined,
                      });
                    }
                    messages.push({
                      role: "system",
                      content:
                        `🔁 Connexion modèle interrompue mid-stream (${streamFatalError.message}). ` +
                        "Reprends EXACTEMENT où tu t'es arrêté — n'excuse pas, ne recommence pas du début, continue le travail en cours. " +
                        `Tentative restante : ${2 - midStreamRecoveries}.`,
                    });
                    if (firstTextDeltaSent) {
                      send("text_end", { iteration: iter });
                    }
                    send("hint", {
                      iteration: iter,
                      kind: "stream_resumed",
                      message: `Coupure mid-stream récupérée — Elena continue (${midStreamRecoveries}/2).`,
                    });
                    console.warn(
                      `[elena-agent] mid-stream recovery ${midStreamRecoveries}/2 at iter ${iter}`,
                      streamFatalError.message,
                    );
                    iter -= 1; // re-run la même iter avec le contexte mis à jour
                    continue;
                  }

                  const ttftMsg = isTtft
                    ? `⏱️ ${active.provider}/${active.model} n'a renvoyé aucun token en ${Math.round(FIRST_TOKEN_TIMEOUT_MS / 1000)}s. Le modèle est probablement saturé ou la requête est trop lourde — relance dans 30s ou simplifie ta demande.`
                    : `⚠️ Connexion au modèle interrompue après le 1er token (${active.provider}/${active.model}) : ${streamFatalError.message}. Relance pour continuer.`;
                  if (firstTextDeltaSent) {
                    send("text_end", { iteration: iter });
                  }
                  console.error(`[elena-agent] stream error (TTFT=${isTtft})`, streamFatalError);
                  sendDoneOnce({
                    text: ttftMsg,
                    mutations: [],
                    trace,
                    conversation_id: conversationId,
                    ui_signals: uiSignals,
                    usage: {
                      tokens_in: totalTokensIn,
                      tokens_out: totalTokensOut,
                      model: active.model,
                      provider: active.provider,
                      intent,
                      fallback_used: activeIdx > 0,
                    },
                  });
                  if (conversationId && orgId) {
                    await supabaseAdmin.from("messages").insert({
                      conversation_id: conversationId,
                      owner_id: userId,
                      org_id: orgId,
                      role: "assistant",
                      content: ttftMsg,
                      model_used: `${active.provider}/${active.model}`,
                      metadata: { agent: true, error: true, intent_level: intent, ttft_timeout: isTtft, reply_to_content: userMessageContent },
                    });
                    await supabaseAdmin
                      .from("conversations")
                      .update({ last_message_at: new Date().toISOString() })
                      .eq("id", conversationId);
                  }
                  return;
                }

                sseBuf += streamDecoder.decode();
                if (firstTextDeltaSent) {
                  send("text_end", { iteration: iter });
                }
                totalTokensIn += chunkUsage?.prompt_tokens ?? 0;
                totalTokensOut += chunkUsage?.completion_tokens ?? 0;

                // Reconstruit le message assistant comme le format non-stream
                const reconstructedToolCalls = toolCallsAcc.filter(Boolean).map((t) => ({
                  id: t.id || `call_${Math.random().toString(36).slice(2, 10)}`,
                  type: "function" as const,
                  function: { name: t.name, arguments: t.args },
                }));

                const msg: OpenAIMessage = {
                  role: "assistant",
                  content: assembledContent || null,
                  tool_calls:
                    reconstructedToolCalls.length > 0 ? reconstructedToolCalls : undefined,
                };

                messages.push({
                  role: "assistant",
                  content: msg.content ?? null,
                  tool_calls: compactToolCallsForHistory(msg.tool_calls),
                });

                if (!msg.tool_calls || msg.tool_calls.length === 0) {
                  // 🚫 GARDE PREVIEW — si Elena dit "regarde la preview" mais n'a écrit AUCUN
                  //    composant UI dans tout le tour (uniquement assets/images), on la force à finir.
                  const finalContentRaw = typeof msg.content === "string" ? msg.content : "";
                  const finalContent = finalContentRaw.toLowerCase();
                  const claimsPreview = /regarde\s+(la\s+)?preview|regarde\s+le\s+r[ée]sultat|c'est\s+en\s+ligne|va\s+voir|c'est\s+pr[êe]t/i.test(
                    finalContent,
                  );
                  const wroteUiComponent = mutations.some(
                    (m) =>
                      m.op === "write" &&
                      /\.(tsx|jsx|vue|svelte)$/i.test(m.path) &&
                      !m.path.includes("/assets/") &&
                      !m.path.startsWith("public/"),
                  );
                  const previewGuardCountLocal = previewGuardCount;
                  // Déclencheur élargi : (a) Elena dit "regarde la preview" sans composant UI,
                  // OU (b) elle a généré des assets/images dans ce tour mais AUCUN composant UI
                  // qui les utilise (cas Vinted SaaS observé : 6 images générées, 0 .tsx écrit
                  // → l'user voit page blanche + message "Relance la demande").
                  const generatedAssetsThisRun = mutations.some(
                    (m) =>
                      m.op === "write" &&
                      (m.path.startsWith("public/generated/") ||
                        m.path.includes("/assets/generated/") ||
                        /\.(png|jpe?g|webp|svg)$/i.test(m.path)),
                  );
                  const shouldForcePreviewGuard =
                    !wroteUiComponent &&
                    previewGuardCountLocal < 2 &&
                    (claimsPreview || generatedAssetsThisRun);
                  if (shouldForcePreviewGuard) {
                    previewGuardCount += 1;
                    messages.push({
                      role: "system",
                      content:
                        "🚫 BUG DÉTECTÉ : tu as généré des assets/images mais AUCUN composant UI (.tsx/.jsx) dans ce tour — la page de l'utilisateur est BLANCHE. " +
                        "INTERDIT de rendre la main avec un message du type « relance la demande pour que je termine » : tu dois TERMINER MAINTENANT, dans CE même run d'agent. " +
                        "Action obligatoire dans le PROCHAIN tour : (1) si besoin `inspiration_lookup` pour le bloc principal, (2) `write_file` du/des composant(s) .tsx/.jsx qui importent les images générées (modules ES6 depuis `@/assets/generated/...`), (3) `build_check`, (4) `screenshot_qa`. NE rends PAS la main avant d'avoir un composant rendu visible.",
                    });
                    send("hint", {
                      iteration: iter,
                      kind: "preview_guard_block",
                      message: "Preview vide détectée — Elena forcée à écrire le composant.",
                    });
                    continue;
                  }

                  // 📸 GATE QA — si Elena tente de livrer alors que dernier screenshot_qa du
                  //    chantier est en FAIL, on la force à corriger (max 2 relances).
                  const lastQa = [...trace].reverse().find((t) => t.tool === "screenshot_qa");
                  const qaRelaunchCount = trace.filter(
                    (t) => t.tool === "screenshot_qa" && t.iteration > (lastQa?.iteration ?? 0) - 3,
                  ).length;
                  if (lastQa && !lastQa.result.ok && qaRelaunchCount < 3) {
                    messages.push({
                      role: "system",
                      content:
                        "🚨 GATE QA BLOQUANT : tu tentes de livrer alors que le dernier `screenshot_qa` est en ❌ FAIL. " +
                        "Tu DOIS corriger les issues prioritaires (🔴 puis 🟡) avec `line_replace`, puis RELANCER `screenshot_qa` jusqu'à obtenir ✅ PASS (score ≥ 80, 0 🔴, ≤ 2 🟡). " +
                        "Continue le tour — n'écris ta réponse finale qu'après le PASS confirmé. Tentatives restantes : " +
                        (3 - qaRelaunchCount) +
                        ".",
                    });
                    send("hint", {
                      iteration: iter,
                      kind: "qa_gate_block",
                      message: `QA en FAIL — Elena forcée à corriger (tentative ${qaRelaunchCount + 1}/3).`,
                    });
                    // On ne break pas : on retourne au prochain tour avec ce rappel injecté.
                    continue;
                  }

                  // 🛑 NO-OP GUARD — intent build mais 0 mutation : Elena répond du texte
                  // sans avoir touché un fichier. On force une dernière itération.
                  // ⚠️ On EXCLUT les réponses qui ressemblent à une question de clarification
                  //    (Elena demande des précisions) — sinon on loop et on perd la réponse.
                  const noopGuardKey = "__noop_guard_used__";
                  const alreadyUsedNoop = (messages as unknown as { [k: string]: unknown }[]).some(
                    (m) => typeof m.content === "string" && m.content.includes(noopGuardKey),
                  );
                  const assistantText = typeof msg.content === "string" ? msg.content : "";
                  const looksLikeClarification =
                    assistantText.trim().length > 0 &&
                    (assistantText.includes("?") ||
                      /\b(préciser|précise|clarifier|quelle|quel|peux-tu|peux tu|quelles|comment|souhaites|veux-tu|veux tu|confirme|détails?)\b/i.test(
                        assistantText,
                      ));
                  if (
                    (intent === "complex" || intent === "simple" || intent === "design") &&
                    mutations.length === 0 &&
                    !alreadyUsedNoop &&
                    !looksLikeClarification &&
                    assistantText.trim().length < 600 &&
                    iter < dynamicCap - 1
                  ) {
                    messages.push({
                      role: "system",
                      content:
                        `🛑 NO-OP DÉTECTÉ ${noopGuardKey} : l'utilisateur a demandé du build/code mais tu termines sans AUCUNE modification de fichier (0 write_file, 0 line_replace). ` +
                        "Si tu as besoin de clarifications, POSE une question explicite (avec « ? »). Sinon applique les écritures (write_file/line_replace) puis build_check, puis réponds.",
                    });
                    send("hint", {
                      iteration: iter,
                      kind: "noop_guard_block",
                      message: "Aucune mutation — Elena forcée à appliquer le code.",
                    });
                    // On garde le texte comme fallback au cas où le prochain tour serait vide.
                    finalText = assistantText;
                    continue;
                  }
                  finalText = assistantText;

                  // ⚡ V2.1 — STATE MACHINE DE RUN : si Elena re-propose le même plan
                  //    qu'au tour précédent, on injecte un hint dur et on relance UN tour.
                  if (conversationId) {
                    const lastToolName = trace.length ? trace[trace.length - 1].tool : null;
                    const verdict = await recordAgentTurn(supabaseAdmin, {
                      conversationId,
                      ownerId: userId,
                      finalText: assistantText,
                      lastTool: lastToolName,
                    });
                    if (verdict.loopHint && verdict.repeatCount === 1 && iter < dynamicCap - 1) {
                      messages.push({ role: "system", content: verdict.loopHint });
                      send("hint", {
                        iteration: iter,
                        kind: "loop_block",
                        message: `Boucle détectée (×${verdict.repeatCount + 1}) — Elena forcée à exécuter ou poser 1 question.`,
                      });
                      continue;
                    }
                  }
                  break;
                }

                // P-4 : exécution PARALLÈLE des tool calls de cette itération.
                // Plus le modèle appelle de tools indépendants (read 3 fichiers, etc.), plus le gain est gros.
                // Les tools sont thread-safe : chacun écrit dans son propre slot de `mutations[]`,
                // et `vfs` (Map) gère les writes concurrents sans corruption.
                // On émet `tool_start` immédiatement (avant le await), puis on attend tout en parallèle,
                // puis on émet `tool_end` + `mutation` + `tool` message dans l'ordre original.
                const parsedCalls = msg.tool_calls.map((call) => {
                  const name = call.function.name as ToolName;
                  let args: Record<string, unknown> = {};
                  try {
                    args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
                  } catch {
                    args = {};
                  }
                  return { call, name, args };
                });

                // 🧭 GARDE ONBOARDING (post-modèle, pré-exécution) — au 1er tour, si Elena
                //   tente d'écrire/générer/blueprinter sans avoir appelé project_onboard, on bloque,
                //   on annule ses tool_calls, et on l'oblige à reformuler en posant les questions.
                if (
                  shouldOnboard &&
                  !onboardGuardTriggered &&
                  iter <= 1 &&
                  !parsedCalls.some((p) => p.name === "project_onboard")
                ) {
                  const offendingTools = parsedCalls
                    .map((p) => p.name)
                    .filter((n) =>
                      ["design_blueprint", "image_generate", "write_file", "line_replace", "inspiration_lookup"].includes(
                        n,
                      ),
                    );
                  if (offendingTools.length > 0) {
                    onboardGuardTriggered = true;
                    // Retire l'assistant message contenant les tool_calls interdits (pour ne pas casser la cohérence OpenAI)
                    messages.pop();
                    messages.push({
                      role: "system",
                      content:
                        "🚫 GARDE ONBOARDING : le brief utilisateur fait moins de 60 mots et la sandbox est vide. " +
                        `Tu as tenté de lancer ${offendingTools.join(", ")} sans passer par project_onboard. ` +
                        "INTERDIT — tu gaspilles tokens et tu pars sur la mauvaise direction. " +
                        "Action OBLIGATOIRE MAINTENANT : appelle UNIQUEMENT `project_onboard` avec 3-4 questions ciblées : " +
                        "(1) Type — landing marketing OU app fonctionnelle (web/mobile) OU dashboard ? " +
                        "(2) Public cible précis ? " +
                        "(3) Top 3 fonctionnalités prioritaires ? " +
                        "(4) Style visuel (premium-dark / minimal / glassmorphism / coloré) ? " +
                        "⚠️ Adapte la question (1) au brief : si l'user dit « app pour gérer/optimiser/créer X », il s'agit d'une APP FONCTIONNELLE, pas d'une landing.",
                    });
                    send("hint", {
                      iteration: iter,
                      kind: "onboard_guard_block",
                      message: `Onboard requis avant ${offendingTools.join("/")} — Elena renvoyée poser les questions.`,
                    });
                    continue;
                  }
                }

                // 1) Émet TOUS les tool_start d'abord (UI voit aussitôt N tâches en cours)
                //    + alerte coût si write_file sur fichier critique d'un projet existant
                const CRITICAL_PATHS = [
                  "src/App.tsx",
                  "src/main.tsx",
                  "src/styles.css",
                  "src/index.css",
                  "src/router.tsx",
                  "src/routes/index.tsx",
                  "src/routes/__root.tsx",
                ];
                const projectIsExisting = vfs.size > 10;
                for (const { name, args } of parsedCalls) {
                  if (name === "write_file" && projectIsExisting) {
                    const path = String(args.path ?? "");
                    const content = String(args.content ?? "");
                    const isCritical = CRITICAL_PATHS.includes(path);
                    const isHeavy = content.length > 4000;
                    if (isCritical || isHeavy) {
                      // estimation grossière : ~4 chars/token, ~$0.01 / 1k tokens output (gpt-5-mini)
                      const estTokens = Math.round(content.length / 4);
                      const estCostCents = Math.max(1, Math.round((estTokens / 1000) * 1.0));
                      send("cost_warning", {
                        iteration: iter,
                        tool: name,
                        path,
                        critical: isCritical,
                        size: content.length,
                        est_tokens: estTokens,
                        est_cost_cents: estCostCents,
                        message: isCritical
                          ? `⚠️ Réécriture complète de ${path} (fichier critique). ~${estTokens} tokens, ~${estCostCents}¢. Préférer line_replace pour patch ciblé.`
                          : `⚠️ write_file lourd sur ${path} (${content.length} chars, ~${estTokens} tokens, ~${estCostCents}¢).`,
                      });
                    }
                  }
                  send("tool_start", {
                    iteration: iter,
                    tool: name,
                    summary: summarizeToolArgs(name, args),
                  });
                }

                // 2) Lance tout en parallèle. On capture les mutations PAR APPEL (pas globales)
                //    pour pouvoir les émettre dans l'ordre des calls et éviter les races.
                const toolPromises = parsedCalls.map(async ({ name, args }) => {
                  const localMutations: FsMutation[] = [];

                  // Tool policy gate (per-user override + pricing)
                  const policy = await checkToolPolicy(supabase, userId, name);
                  if (!policy.allowed) {
                    return {
                      localMutations,
                      result: policyDeniedResult(name, policy.reason ?? `Outil "${name}" indisponible.`),
                    };
                  }

                  const asyncResult = await withTimeout(
                    executeAsyncTool(name, args, vfs, localMutations, {
                      openaiKey: openaiKeyForRag,
                      ideogramKey: ideogramKeyForImage,
                    }),
                    TOOL_TIMEOUT_MS,
                    name,
                  );
                  const pilotResult =
                    asyncResult ??
                    (await withTimeout(
                      executePilotTool(name, args, supabase, body.project_id ?? null),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const memoryResult =
                    pilotResult ??
                    (await withTimeout(
                      executeMemoryTool(name, args, supabase, body.project_id ?? null, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const adminResult =
                    memoryResult ??
                    (await withTimeout(
                      executeAdminTool(name, args, supabase, body.project_id ?? null),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const uiResult =
                    adminResult ??
                    (await withTimeout(
                      executeUITool(
                        name,
                        args,
                        supabase,
                        body.project_id ?? null,
                        userId,
                        uiSignals,
                      ),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const integrationResult =
                    uiResult ??
                    (await withTimeout(
                      executeIntegrationTool(
                        name,
                        args,
                        supabase,
                        body.project_id ?? null,
                        uiSignals,
                        requestOrigin,
                      ),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const mcpResult =
                    integrationResult ??
                    (await withTimeout(
                      executeMcpTool(
                        name,
                        args,
                        supabase,
                        body.project_id ?? null,
                        uiSignals,
                      ),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const crossResult =
                    mcpResult ??
                    (await withTimeout(
                      executeCrossProjectTool(
                        name,
                        args,
                        supabase,
                        body.project_id ?? null,
                        userId,
                        vfs,
                        localMutations,
                      ),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const dataResult =
                    crossResult ??
                    (await withTimeout(
                      executeDataTool(name, args, supabase, body.project_id ?? null, userId, vfs),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const voiceResult =
                    dataResult ??
                    (await withTimeout(
                      executeVoiceTool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const webResult =
                    voiceResult ??
                    (await withTimeout(
                      executeWebTool(name, args, supabase, userId, vfs, localMutations),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const deployResult =
                    webResult ??
                    (await withTimeout(
                      executeDeployTool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const sandboxResult =
                    deployResult ??
                    (await withTimeout(
                      executeSandboxTool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot7Result =
                    sandboxResult ??
                    (await withTimeout(
                      executeLot7Tool(name, args, supabase, body.project_id ?? null, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot8Result =
                    lot7Result ??
                    (await withTimeout(
                      executeLot8Tool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot9Result =
                    lot8Result ??
                    (await withTimeout(
                      executeLot9Tool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot10Result =
                    lot9Result ??
                    (await withTimeout(
                      executeLot10Tool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot11Result =
                    lot10Result ??
                    (await withTimeout(
                      executeLot11Tool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot12Result =
                    lot11Result ??
                    (await withTimeout(
                      executeLot12Tool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot13Result =
                    lot12Result ??
                    (await withTimeout(
                      executeLot13Tool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const integrationsResult =
                    lot13Result ??
                    (await withTimeout(
                      executeIntegrationsTool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const docResult =
                    integrationsResult ??
                    (await withTimeout(
                      executeDocTool(name, args, vfs, localMutations),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot16Result =
                    docResult ??
                    (await withTimeout(
                      executeLot16Tool(name, args, supabase, userId, uiSignals),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot18Result =
                    lot16Result ??
                    (await withTimeout(
                      executeLot18Tool(name, args, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot19Result =
                    lot18Result ??
                    (await withTimeout(
                      executeLot19Tool(name, args, vfs, localMutations, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot20Result =
                    lot19Result ??
                    (await withTimeout(
                      executeLot20Tool(name, args, vfs, localMutations, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot24Result =
                    lot20Result ??
                    (await withTimeout(
                      executeLot24Tool(name, args, vfs, localMutations, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot25Result =
                    lot24Result ??
                    (await withTimeout(
                      executeLot25Tool(name, args, vfs, localMutations, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot26Result =
                    lot25Result ??
                    (await withTimeout(
                      executeLot26Tool(name, args, vfs, localMutations, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot27Result =
                    lot26Result ??
                    (await withTimeout(
                      executeLot27Tool(name, args, vfs, localMutations, supabase, userId),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const lot28Result =
                    lot27Result ??
                    (await withTimeout(
                      executeLot28Tool(name, args, vfs, localMutations),
                      TOOL_TIMEOUT_MS,
                      name,
                    ));
                  const result = lot28Result ?? executeTool(name, args, vfs, localMutations);
                  return { localMutations, result };
                });

                const settled = await Promise.all(toolPromises);

                // 3) Émet `mutation` + `tool_end` + push messages, dans l'ordre original des calls
                for (let i = 0; i < parsedCalls.length; i++) {
                  const { call, name, args } = parsedCalls[i];
                  const { localMutations, result } = settled[i];
                  for (const mutation of localMutations) {
                    mutations.push(mutation);
                    if (
                      mutation.op === "write" ||
                      mutation.op === "delete" ||
                      mutation.op === "rename"
                    ) {
                      send("mutation", mutation);
                    }
                  }
                  send("tool_end", {
                    iteration: iter,
                    tool: name,
                    ok: result.ok,
                    summary: summarizeToolArgs(name, args),
                  });
                  trace.push({ iteration: iter, tool: name, args, result });
                  messages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name,
                    content: result.output.slice(0, 6000),
                  });
                  // Index pour la compaction historique (cf. début de boucle iter)
                  const toolIdx = messages.length - 1;
                  let bucket = toolMsgsByIter.get(iter);
                  if (!bucket) {
                    bucket = [];
                    toolMsgsByIter.set(iter, bucket);
                  }
                  bucket.push(toolIdx);
                }

                // 🖼️ V2.1 — MULTIMODAL FEEDBACK LOOP : si screenshot_qa a FAIL et qu'on a
                //    un project_id, on capture une vraie screenshot du preview dev (via image.thum.io)
                //    et on l'injecte en image_url dans le prochain tour pour que le modèle vision
                //    puisse VOIR le bug. Best-effort, no-op si projet sans preview ou si capture échoue.
                {
                  const qaIdx = parsedCalls.findIndex((c) => c.name === "screenshot_qa");
                  const qaResult = qaIdx >= 0 ? settled[qaIdx]?.result : null;
                  const projectIdForShot = body.project_id ?? null;
                  if (
                    qaIdx >= 0 &&
                    qaResult &&
                    qaResult.ok === false &&
                    autoQaEnabled &&
                    projectIdForShot &&
                    conversationId &&
                    iter < dynamicCap - 1
                  ) {
                    const previewBase = `https://project--${projectIdForShot}-dev.lovable.app/`;
                    const shotUrl = `https://image.thum.io/get/png/width/1280/wait/3/${encodeURIComponent(previewBase)}`;
                    // On stocke le shot en state pour ré-utilisation et on l'injecte directement.
                    void recordAgentTurn(supabaseAdmin, {
                      conversationId,
                      ownerId: userId,
                      finalText: "(screenshot_qa fail — multimodal)",
                      lastTool: "screenshot_qa",
                      screenshotUrl: shotUrl,
                    });
                    messages.push({
                      role: "user",
                      content: [
                        {
                          type: "text",
                          text: "📸 Voici la capture RÉELLE du preview après ton dernier `screenshot_qa` (FAIL). REGARDE l'image, identifie les 1-3 bugs visuels les plus criants (layout cassé, texte rogné, contraste illisible, image manquante, espacement chaotique) et corrige-les directement avec `line_replace`. Ne refais PAS d'audit textuel — fonde-toi sur ce que tu VOIS.",
                        },
                        { type: "image_url", image_url: { url: shotUrl } },
                      ] as unknown as string,
                    });
                    send("hint", {
                      iteration: iter,
                      kind: "multimodal_qa",
                      message: "Capture preview injectée — Elena voit l'écran réel.",
                    });
                  }
                }

                //    génère ses images une par tour au lieu de batcher. Coût élevé en latence.
                {
                  const imgsThisTurn = parsedCalls.filter((c) => c.name === "image_generate").length;
                  const imgsBefore = trace.filter(
                    (t) => t.tool === "image_generate" && t.iteration < iter,
                  ).length;
                  if (imgsThisTurn === 1 && imgsBefore >= 1 && imgsBefore < 6) {
                    messages.push({
                      role: "system",
                      content:
                        "⚠️ INEFFICACE : tu viens de générer 1 image isolée alors que tu en as déjà généré " +
                        imgsBefore +
                        " sur les tours précédents. Si d'autres images restent à produire, BATCH-LES dans le PROCHAIN tour : émets plusieurs `image_generate` simultanément (multiple tool_calls dans le même message assistant). Le runtime les exécute en parallèle = N× plus rapide.",
                    });
                    send("hint", {
                      iteration: iter,
                      kind: "image_serial_warning",
                      message: `Elena génère ses images en série (${imgsBefore + 1} jusqu'ici en ${imgsBefore + 1} tours). Rappel parallèle injecté.`,
                    });
                  }
                }

                // 🔧 AUTO-FIX BUILD_CHECK — si build_check renvoie ok=false, on injecte
                //    un rappel système IMPÉRATIF pour qu'Elena corrige les erreurs avec
                //    line_replace ciblé au tour suivant (au lieu de rendre la main).
                {
                  const buildIdx = parsedCalls.findIndex((c) => c.name === "build_check");
                  if (buildIdx >= 0) {
                    const buildResult = settled[buildIdx]?.result;
                    let parsed: { ok?: boolean; errors?: Array<{ file?: string; message?: string; line?: number }> } | null = null;
                    try {
                      parsed = JSON.parse(buildResult?.output ?? "{}");
                    } catch {
                      parsed = null;
                    }
                    const buildKey = "__build_autofix_used__";
                    const alreadyAutoFixed = (messages as unknown as { content?: unknown }[]).some(
                      (m) => typeof m.content === "string" && m.content.includes(buildKey),
                    );
                    if (parsed && parsed.ok === false && !alreadyAutoFixed && iter < dynamicCap - 1) {
                      const errs = (parsed.errors ?? []).slice(0, 8);
                      const errFiles = Array.from(new Set(errs.map((e) => e.file).filter(Boolean))) as string[];
                      const errBullets = errs
                        .map((e) => `  - ${e.file ?? "?"}${e.line ? `:${e.line}` : ""} → ${e.message ?? "erreur"}`)
                        .join("\n");
                      messages.push({
                        role: "system",
                        content:
                          `🔧 BUILD CHECK FAIL ${buildKey} — tu DOIS corriger maintenant, pas rendre la main.\n` +
                          `Fichiers en erreur : ${errFiles.join(", ") || "(voir détails)"}.\n` +
                          `Erreurs détectées :\n${errBullets}\n\n` +
                          "Action OBLIGATOIRE au prochain tour : (1) `read_file` sur les fichiers en erreur si tu ne les as pas en mémoire, (2) `line_replace` ciblé pour corriger CHAQUE erreur (jamais de write_file complet), (3) ré-`build_check` pour valider. NE rends PAS la main avant que `build_check.ok === true`.",
                      });
                      send("hint", {
                        iteration: iter,
                        kind: "build_autofix",
                        message: `Build cassé (${errs.length} erreur${errs.length > 1 ? "s" : ""}) — Elena forcée à patcher.`,
                      });
                  }
                }

                // 🛠️ AUTO BUILD_CHECK ENFORCEMENT (LOT 28) — si writes code mais pas de build_check
                //    appelé dans CETTE itération, on force Elena à l'appeler au tour suivant.
                {
                  const wroteCode = parsedCalls.some((c) => {
                    if (c.name !== "write_file" && c.name !== "line_replace") return false;
                    const p = String((c.args as { path?: unknown })?.path ?? "");
                    return /\.(tsx?|jsx?|json|css)$/.test(p);
                  });
                  const calledBuild = parsedCalls.some(
                    (c) => c.name === "build_check" || c.name === "lint_fix",
                  );
                  const enforceKey = "__build_enforce_used__";
                  const alreadyEnforced = (messages as unknown as { content?: unknown }[]).some(
                    (m) => typeof m.content === "string" && m.content.includes(enforceKey),
                  );
                  if (wroteCode && !calledBuild && !alreadyEnforced && iter < dynamicCap - 1) {
                    messages.push({
                      role: "system",
                      content:
                        `🛠️ AUTO-CHECK ${enforceKey} — tu viens d'écrire/modifier du code mais n'as PAS validé.\n` +
                        "Action OBLIGATOIRE au prochain tour : (1) `lint_fix` pour normaliser les fichiers touchés, (2) `build_check` pour valider syntaxe/imports. Si erreurs → corrige avec `line_replace` puis ré-`build_check`. PUIS seulement tu rends la main.",
                    });
                  }
                }
                }
              }

              await supabaseAdmin.rpc("mark_api_key_used", {
                _owner_id: userId,
                _provider: active.provider,
              });

              const persistedFinalText = finalText || summarizeDeliveredWork(mutations);

              // Persiste la réponse finale. Le message utilisateur a déjà été persisté avant l'appel modèle ;
              // on ne le réinsère que si cette première persistance a échoué.
              if (conversationId && orgId) {
                const rows = [
                  ...(!userMessagePersisted
                    ? [
                        {
                          conversation_id: conversationId,
                          owner_id: userId,
                          org_id: orgId,
                          role: "user" as const,
                          content: userMessageContent,
                          metadata: { agent: true },
                        },
                      ]
                    : []),
                  {
                    conversation_id: conversationId,
                    owner_id: userId,
                    org_id: orgId,
                    role: "assistant" as const,
                    content: persistedFinalText,
                    model_used: `${active.provider}/${active.model}`,
                    tokens_input: totalTokensIn,
                    tokens_output: totalTokensOut,
                    metadata: {
                      agent: true,
                      mutations: mutations.length,
                      reached_iteration_limit: !finalText,
                      iterations: trace.length,
                      fallback_used: activeIdx > 0,
                      rag_used: ragContext.length > 0,
                      reasoning_used: active.useReasoning,
                      intent_level: intent,
                      ui_signals: uiSignals.length,
                        reply_to_content: userMessageContent,
                    },
                  },
                ];
                const { error: persistErr } = await supabaseAdmin.from("messages").insert(rows);
                if (persistErr) {
                  console.error("[elena-agent] message persist failed", persistErr.message);
                }
                await supabaseAdmin
                  .from("conversations")
                  .update({ last_message_at: new Date().toISOString() })
                  .eq("id", conversationId);

                // LOT #2 — Mémoire long-terme : régénération fire-and-forget (~tous les 30 msgs)
                // Ne bloque jamais le tour : si ça échoue, on passe.
                if (body.project_id && openaiKeyForRag) {
                  void maybeRegenerateProjectSummary({
                    admin: supabaseAdmin,
                    projectId: body.project_id,
                    apiKey: openaiKeyForRag,
                  });
                }
              }

              sendDoneOnce({
                text: persistedFinalText,
                mutations,
                trace,
                conversation_id: conversationId,
                ui_signals: uiSignals,
                usage: {
                  tokens_in: totalTokensIn,
                  tokens_out: totalTokensOut,
                  model: active.model,
                  provider: active.provider,
                  intent,
                  fallback_used: activeIdx > 0,
                },
              });
            } catch (e) {
              const errorText = e instanceof Error ? e.message : "Agent error";
              console.error("[elena-agent] fatal error", errorText, e);
              try {
                if (conversationId && orgId) {
                  await supabaseAdmin.from("messages").insert({
                    conversation_id: conversationId,
                    owner_id: userId,
                    org_id: orgId,
                    role: "assistant",
                    content: `⚠️ ${errorText}`,
                    metadata: { agent: true, error: true, intent_level: intent, reply_to_content: userMessageContent },
                  });
                  await supabaseAdmin
                    .from("conversations")
                    .update({ last_message_at: new Date().toISOString() })
                    .eq("id", conversationId);
                }
              } catch (persistErr) {
                console.error("[elena-agent] error persist failed", persistErr);
              }
              sendDoneOnce({
                text: `⚠️ ${errorText}`,
                mutations: [],
                trace,
                conversation_id: conversationId,
                ui_signals: uiSignals,
                usage: {
                  tokens_in: totalTokensIn,
                  tokens_out: totalTokensOut,
                  model: active?.model ?? "unknown",
                  provider: active?.provider ?? "unknown",
                  intent,
                  fallback_used: activeIdx > 0,
                },
              });
            } finally {
              // Stoppe le keep-alive (sinon la fonction ne se termine jamais côté Worker).
              clearInterval(keepAlive);
              // GARANTIE BUG #1 : si on n'a JAMAIS émis de "done" (cas finish_reason inattendu, sortie de boucle silencieuse),
              // on émet un done de secours pour que le front débloque l'UI.
              sendDoneOnce({
                text:
                  finalText || "✅ Tâche terminée (aucun texte de réponse retourné par le modèle).",
                mutations,
                trace,
                conversation_id: conversationId,
                ui_signals: uiSignals,
                usage: {
                  tokens_in: totalTokensIn,
                  tokens_out: totalTokensOut,
                  model: active?.model ?? "unknown",
                  provider: active?.provider ?? "unknown",
                  intent,
                  fallback_used: activeIdx > 0,
                },
              });
              closeStream();
            }
          },
          cancel() {
            // Le runtime nous notifie que le client a fermé la connexion → marquer fermé
            // pour que les prochains enqueue() soient des no-op (évite "Controller is already closed").
            streamClosed = true;
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
