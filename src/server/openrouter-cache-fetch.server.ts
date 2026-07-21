/**
 * Chantier 5 — Cache prompt OpenRouter (Anthropic Claude).
 *
 * OpenRouter facture les modèles Anthropic via l'API OpenAI-compatible, mais
 * Anthropic n'écoute pas un flag top-level : il faut poser
 * `cache_control: { type: "ephemeral" }` sur les content-parts qu'on veut
 * cacher. Le SDK @ai-sdk/openai-compatible envoie `content` en string simple
 * pour un message system → aucun marqueur transmis, cache jamais activé.
 *
 * Solution : un wrapper `fetch` qu'on branche sur `createOpenAICompatible({ fetch })`.
 * Il intercepte la requête sortante, détecte les modèles Claude, transforme le
 * body pour convertir le system message (et le dernier user, pour cacher
 * l'historique) en content-parts avec `cache_control`, puis délègue au fetch
 * natif. Aucun impact sur les autres modèles (transparent = passe direct).
 *
 * Toggle : réutilise ELENA_CACHE_PROMPT=on (déjà activé). Off = fetch natif.
 *
 * Économie : Anthropic cache = -90% sur les tokens répétés (cache reads).
 * Sur Elena avec un system ~7k tokens + 30k d'historique, le 2ᵉ tour peut
 * descendre de ~$0.10 à ~$0.02.
 */

import { CACHE_PROMPT_ENABLED } from "./elena-cache-prompt.server";

const CLAUDE_RE = /anthropic\/|claude/i;

type ContentPart = {
  type: string;
  text?: string;
  cache_control?: { type: "ephemeral" };
};

type ChatMessage = {
  role: string;
  content: string | ContentPart[] | undefined;
};

/**
 * Transforme un message dont le content est string en tableau de parts avec
 * cache_control sur la dernière. Si déjà en tableau, ajoute cache_control sur
 * la dernière text-part.
 */
function stampCacheControl(msg: ChatMessage): void {
  if (!msg) return;
  if (typeof msg.content === "string") {
    if (msg.content.length < 200) return; // trop court pour valoir le cache
    msg.content = [
      { type: "text", text: msg.content, cache_control: { type: "ephemeral" } },
    ];
    return;
  }
  if (Array.isArray(msg.content) && msg.content.length > 0) {
    // Trouve la dernière text-part et pose le marqueur.
    for (let i = msg.content.length - 1; i >= 0; i--) {
      const p = msg.content[i];
      if (p && (p.type === "text" || typeof p.text === "string")) {
        p.cache_control = { type: "ephemeral" };
        return;
      }
    }
  }
}

/**
 * Anthropic autorise jusqu'à 4 "breakpoints" de cache par requête. Stratégie :
 *  - breakpoint 1 : fin du system prompt (stable entre tours = énorme gain)
 *  - breakpoint 2 : fin de l'avant-dernier user message (cache l'historique
 *    jusqu'au tour précédent)
 * On évite de marquer le tout dernier user pour laisser une "queue" fraîche.
 */
function injectAnthropicCache(body: Record<string, unknown>): void {
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return;

  // 1) System message : premier message role=system.
  const sys = messages.find((m) => (m as ChatMessage)?.role === "system") as ChatMessage | undefined;
  if (sys) stampCacheControl(sys);

  // 2) Avant-dernier user message pour cacher l'historique.
  const userIdxs: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if ((messages[i] as ChatMessage)?.role === "user") userIdxs.push(i);
  }
  if (userIdxs.length >= 2) {
    const target = messages[userIdxs[userIdxs.length - 2]] as ChatMessage;
    stampCacheControl(target);
  }
}

/**
 * Wrapper fetch conditionnel. Rendu no-op quand le toggle est off ou quand
 * le modèle n'est pas un modèle Anthropic.
 */
export function createOpenRouterCacheFetch(): typeof fetch {
  const base = fetch;
  if (!CACHE_PROMPT_ENABLED) return base;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const method = (init?.method ?? "POST").toUpperCase();
      if (method !== "POST" || !init?.body) return base(input, init);

      const bodyStr = typeof init.body === "string" ? init.body : null;
      if (!bodyStr) return base(input, init);

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(bodyStr) as Record<string, unknown>;
      } catch {
        return base(input, init);
      }

      const model = typeof parsed.model === "string" ? parsed.model : "";
      if (!CLAUDE_RE.test(model)) return base(input, init);

      injectAnthropicCache(parsed);
      const newBody = JSON.stringify(parsed);
      // Log unique par requête pour observabilité (pas de PII).
      console.log(
        `[or-cache] injected cache_control model=${model} msgs=${Array.isArray(parsed.messages) ? parsed.messages.length : 0} bytes=${newBody.length}`,
      );
      return base(input, { ...init, body: newBody });
    } catch (e) {
      console.warn("[or-cache] wrapper error, falling back to native fetch", e);
      return base(input, init);
    }
  }) as typeof fetch;
}
