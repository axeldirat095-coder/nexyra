/**
 * Chantier 3 — Slim system prompt (extraction des modules conditionnels).
 *
 * Objectif : réduire les tokens envoyés à chaque tour en n'incluant les gros
 * modules du system prompt QUE quand le contexte les rend utiles. Le
 * comportement d'Elena reste identique : quand un déclencheur est présent,
 * le module est réinjecté à l'identique.
 *
 * Toggle : `ELENA_SLIM_PROMPT=on` pour activer. Défaut = off = prompt complet
 * (aucune régression, rollback instantané).
 *
 * Modules extraits (identifiés par leur header markdown) :
 *  - `## VISION — quand l'utilisateur joint une image` (~1.5-2k tokens) :
 *    ne sert que quand une image est attachée au dernier message user.
 *  - `## 🔴 GROS PROJET IMPORTÉ — RÈGLE ANTI-CRASH MÉMOIRE` (~600 tokens) :
 *    ne sert qu'en présence d'un import ZIP récent (mots-clés user).
 *
 * Détection = analyse du dernier message user + parts. On n'appelle jamais
 * la sandbox depuis ici (aucune latence ajoutée).
 */

import type { UIMessage } from "ai";

export const SLIM_PROMPT_ENABLED =
  (process.env.ELENA_SLIM_PROMPT ?? "off").toLowerCase() === "on";

export interface SlimContext {
  hasImage: boolean;
  hasImportSignal: boolean;
}

/**
 * Analyse le dernier message user pour détecter les déclencheurs de modules.
 */
export function detectSlimContext(messages: UIMessage[]): SlimContext {
  let hasImage = false;
  let hasImportSignal = false;
  const IMPORT_RE = /\b(zip|import[ée]?|installe|d[ée]zippe|projet complet|readonly-import|nexyra-readonly)\b/i;

  // On inspecte les 3 derniers messages user pour capter la conversation récente.
  const userMsgs = messages.filter((m) => m.role === "user").slice(-3);
  for (const m of userMsgs) {
    const parts = Array.isArray(m.parts) ? m.parts : [];
    for (const p of parts) {
      const type = (p as { type?: string }).type;
      if (!type) continue;
      // Détection image : AI-SDK v5 = 'file' avec mediaType image/*, ou 'image'.
      if (type === "image" || type === "file") {
        const mt = (p as { mediaType?: string; mimeType?: string }).mediaType
          ?? (p as { mimeType?: string }).mimeType
          ?? "";
        if (type === "image" || mt.startsWith("image/")) hasImage = true;
      }
      if (type === "text") {
        const t = (p as { text?: string }).text ?? "";
        if (IMPORT_RE.test(t)) hasImportSignal = true;
      }
    }
  }

  return { hasImage, hasImportSignal };
}

/**
 * Retire du prompt les modules non déclenchés. On identifie chaque module par
 * son header `## ...` et on coupe jusqu'au prochain `## ` (ou fin de chaîne).
 */
export function slimSystemPrompt(fullSystem: string, ctx: SlimContext): {
  slimmed: string;
  removed: string[];
  savedChars: number;
} {
  if (!SLIM_PROMPT_ENABLED) {
    return { slimmed: fullSystem, removed: [], savedChars: 0 };
  }

  let out = fullSystem;
  const removed: string[] = [];

  const cut = (headerNeedle: string, label: string) => {
    const idx = out.indexOf(headerNeedle);
    if (idx === -1) return;
    // Trouve le prochain header `## ` après notre section.
    const after = out.indexOf("\n## ", idx + headerNeedle.length);
    const end = after === -1 ? out.length : after + 1; // +1 pour garder le \n
    out = out.slice(0, idx) + out.slice(end);
    removed.push(label);
  };

  if (!ctx.hasImage) {
    // Module Vision — pas d'image jointe.
    cut("## VISION — quand l'utilisateur joint une image", "vision");
  }
  if (!ctx.hasImportSignal) {
    // Module Gros projet importé — pas de signal ZIP dans la conversation récente.
    cut("## 🔴 GROS PROJET IMPORTÉ — RÈGLE ANTI-CRASH MÉMOIRE", "import");
  }

  return {
    slimmed: out,
    removed,
    savedChars: fullSystem.length - out.length,
  };
}

export function logSlim(route: string, projectId: string, savedChars: number, removed: string[]): void {
  // Estimation : ~4 chars/token en français-tech.
  const savedTk = Math.round(savedChars / 4);
  console.log(
    `[slim] route=${route} enabled=${SLIM_PROMPT_ENABLED} project=${projectId} removed=[${removed.join(",")}] savedChars=${savedChars} ~savedTk=${savedTk}`,
  );
}
