/**
 * Chantier 4 — Troncature des vieux tool outputs.
 *
 * Contexte : sur un tour normal Elena, l'historique messages contient les
 * outputs de tous les tools appelés (read_file, list_files, write_file, ...).
 * Ces outputs restent en clair et gonflent le prompt à chaque tour suivant.
 * Sur un tour avec 8+ opérations fichiers, on peut envoyer 15-25k tokens
 * de contenus fichiers dont Elena n'a plus besoin.
 *
 * Stratégie : on garde intacts les tool outputs des N derniers messages
 * (Elena a besoin du contexte immédiat pour raisonner), et on tronque les
 * plus vieux à ~800 chars avec un placeholder qui rappelle qu'elle peut
 * relire le fichier via read_file si nécessaire.
 *
 * Toggle : `ELENA_TRUNCATE_OLD_TOOLS=on` (défaut off = comportement actuel).
 */

import type { UIMessage } from "ai";

export const TRUNCATE_ENABLED =
  (process.env.ELENA_TRUNCATE_OLD_TOOLS ?? "off").toLowerCase() === "on";

// Nombre de messages récents dont on garde les tool outputs intacts.
// 6 = ~2-3 tours user/assistant complets avec leurs tools.
const KEEP_RECENT_MSGS = 6;

// Longueur max d'un champ texte dans un output tronqué (chars).
const MAX_FIELD_CHARS = 800;

// Clés qu'on ne tronque JAMAIS (petits flags de statut nécessaires au raisonnement).
const KEEP_KEYS = new Set([
  "ok", "success", "error", "status", "code", "path", "filepath", "file_path",
  "exit_code", "exitCode", "found", "count", "total", "url", "sha", "commit_sha",
]);

const PLACEHOLDER = "<sortie tronquée (contexte ancien) — appelle read_file si besoin>";

function truncateValue(v: unknown): unknown {
  if (typeof v === "string") {
    if (v.length <= MAX_FIELD_CHARS) return v;
    return v.slice(0, 200) + `\n… [${v.length - 200} chars tronqués] …\n` + PLACEHOLDER;
  }
  if (Array.isArray(v)) {
    // Pour listes longues (list_files souvent 300+), on garde 20 premiers.
    if (v.length > 20) {
      return [...v.slice(0, 20), `… [${v.length - 20} éléments tronqués]`];
    }
    return v.map(truncateValue);
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = KEEP_KEYS.has(k) ? val : truncateValue(val);
    }
    return out;
  }
  return v;
}

export interface TruncateStats {
  truncatedParts: number;
  savedChars: number;
}

/**
 * Tronque les outputs de tool-parts pour tous les messages sauf les
 * KEEP_RECENT_MSGS derniers. Retourne les messages transformés + stats.
 */
export function truncateOldToolOutputs(messages: UIMessage[]): {
  messages: UIMessage[];
  stats: TruncateStats;
} {
  if (!TRUNCATE_ENABLED || messages.length <= KEEP_RECENT_MSGS) {
    return { messages, stats: { truncatedParts: 0, savedChars: 0 } };
  }

  const cutoff = messages.length - KEEP_RECENT_MSGS;
  let truncatedParts = 0;
  let savedChars = 0;

  const out = messages.map((m, idx) => {
    if (idx >= cutoff) return m; // récent → intact
    if (!Array.isArray(m.parts)) return m;

    const parts = m.parts.map((part) => {
      const p = part as { type?: string; output?: unknown };
      if (typeof p.type !== "string" || !p.type.startsWith("tool-")) return part;
      if (!p.output || typeof p.output !== "object") return part;
      const beforeLen = JSON.stringify(p.output).length;
      const truncated = truncateValue(p.output);
      const afterLen = JSON.stringify(truncated).length;
      if (afterLen < beforeLen) {
        truncatedParts++;
        savedChars += beforeLen - afterLen;
      }
      return { ...(part as object), output: truncated } as typeof part;
    });
    return { ...m, parts } as UIMessage;
  });

  return { messages: out, stats: { truncatedParts, savedChars } };
}

export function logTruncate(route: string, projectId: string, stats: TruncateStats): void {
  const savedTk = Math.round(stats.savedChars / 4);
  console.log(
    `[trunc] route=${route} enabled=${TRUNCATE_ENABLED} project=${projectId} parts=${stats.truncatedParts} savedChars=${stats.savedChars} ~savedTk=${savedTk}`,
  );
}
