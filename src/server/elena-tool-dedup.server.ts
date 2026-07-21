/**
 * Chantier 6 — Déduplication des tool outputs sur l'historique multi-tours.
 *
 * Contexte : Elena appelle souvent le même outil avec les mêmes arguments à
 * plusieurs tours (`read_file('src/App.tsx')` peut être invoqué 3-5 fois dans
 * une session pour re-vérifier l'état d'un fichier). Chaque appel réenvoie
 * TOUT le contenu du fichier dans l'historique du prompt suivant. Sur des
 * fichiers de 1000-3000 lignes, ça représente 5-15k tokens dupliqués par tour.
 *
 * Chantier 4 (`truncateOldToolOutputs`) tronque brutalement les vieux outputs
 * à 800 chars. Ici on va plus loin : pour les paires (tool, input) identiques
 * qui apparaissent plusieurs fois, on garde UNIQUEMENT l'occurrence la plus
 * récente (la vérité actuelle) et on remplace les précédentes par un pointeur
 * léger « voir tour suivant ». Aucune perte d'info : la version fraîche est
 * intacte, la plus vieille était de toute façon obsolète.
 *
 * Cas particuliers :
 *  - `read_file(path=X)` : on dedupe par `path` — la dernière lecture fait foi.
 *  - `ls` (arbo complète) : idem, la dernière fait foi.
 *  - `run_command(cmd=...)` : dedupe strict par cmd exact (safe pour les
 *    commandes idempotentes de type `cat`, `grep`, `ls`).
 *  - `write_file` / `edit_file` : JAMAIS dédupliqué (chaque écriture est un
 *    événement historique distinct que le modèle doit voir).
 *  - `screenshot_qa` / `capture_current_preview` : dédupliqués si input
 *    identique (on garde le dernier snapshot).
 *
 * Toggle : `ELENA_DEDUP_TOOL_OUTPUTS=on`. Off par défaut → no-op strict.
 *
 * Combiné avec le cache OpenRouter (Chantier 5) : dedup réduit la taille du
 * bloc historique qu'on paye à 10% (cache hit) → double économie.
 */

import type { UIMessage } from "ai";

export const DEDUP_ENABLED =
  (process.env.ELENA_DEDUP_TOOL_OUTPUTS ?? "off").toLowerCase() === "on";

// On protège les N derniers messages : jamais dédupliqués (contexte immédiat
// où Elena raisonne encore sur les valeurs exactes).
const KEEP_RECENT_MSGS = 4;

// Outils qu'on ne dédupe JAMAIS : chaque appel est un événement historique.
const NEVER_DEDUP = new Set([
  "tool-write_file",
  "tool-edit_file",
  "tool-line_replace",
  "tool-delete_file",
  "tool-rename_file",
  "tool-move_file",
  "tool-run_command", // Ç ne peut pas savoir si idempotent — on est prudent.
  "tool-restart_preview",
  "tool-install_package",
  "tool-git_commit",
]);

// Outils qu'on dédupe par sous-clé de l'input (ex: read_file → par `path`).
const DEDUP_KEY_BY_TOOL: Record<string, (input: Record<string, unknown>) => string> = {
  "tool-read_file": (i) => `path=${String(i.path ?? "")}`,
  "tool-ls": (i) => `path=${String(i.path ?? "")}`,
  "tool-list_files": (i) => `path=${String(i.path ?? "")}`,
  "tool-search_project": (i) => `q=${String(i.query ?? i.q ?? "")}`,
  "tool-capture_current_preview": () => "capture",
  "tool-screenshot_qa": () => "screenshot",
};

function toolDedupKey(
  partType: string,
  input: unknown,
): string | null {
  if (NEVER_DEDUP.has(partType)) return null;
  const inputObj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const custom = DEDUP_KEY_BY_TOOL[partType];
  if (custom) return `${partType}::${custom(inputObj)}`;
  // Défaut : dedup strict sur (tool + JSON(input) canonique tronqué).
  let inputStr = "";
  try {
    inputStr = JSON.stringify(inputObj);
  } catch {
    return null;
  }
  if (inputStr.length > 2000) return null; // input trop gros → on skip
  return `${partType}::${inputStr}`;
}

export interface DedupStats {
  dedupedParts: number;
  savedChars: number;
  uniqueKeys: number;
}

/**
 * Dédup les tool outputs sur l'historique. Pour chaque clé (tool+input
 * équivalent), on garde UNIQUEMENT la dernière occurrence intacte ; les plus
 * vieilles ont leur `output` remplacé par un pointeur court.
 *
 * Les KEEP_RECENT_MSGS derniers messages sont toujours protégés.
 */
export function deduplicateToolOutputs(messages: UIMessage[]): {
  messages: UIMessage[];
  stats: DedupStats;
} {
  if (!DEDUP_ENABLED || messages.length <= KEEP_RECENT_MSGS + 1) {
    return { messages, stats: { dedupedParts: 0, savedChars: 0, uniqueKeys: 0 } };
  }

  const cutoff = messages.length - KEEP_RECENT_MSGS;

  // Pass 1 : indexer la DERNIÈRE occurrence de chaque clé (parcours du plus
  // récent au plus vieux, on retient le premier vu = le plus récent).
  const latestByKey = new Map<string, { msgIdx: number; partIdx: number }>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = Array.isArray(messages[i].parts) ? messages[i].parts : [];
    for (let j = 0; j < parts.length; j++) {
      const p = parts[j] as { type?: string; input?: unknown; output?: unknown };
      if (typeof p.type !== "string" || !p.type.startsWith("tool-")) continue;
      if (!p.output) continue;
      const key = toolDedupKey(p.type, p.input);
      if (!key) continue;
      if (!latestByKey.has(key)) latestByKey.set(key, { msgIdx: i, partIdx: j });
    }
  }

  let dedupedParts = 0;
  let savedChars = 0;

  // Pass 2 : réécrit les vieilles occurrences (< cutoff) qui ne sont pas la
  // dernière connue.
  const out = messages.map((m, i) => {
    if (i >= cutoff) return m;
    if (!Array.isArray(m.parts)) return m;

    const newParts = m.parts.map((part, j) => {
      const p = part as { type?: string; input?: unknown; output?: unknown };
      if (typeof p.type !== "string" || !p.type.startsWith("tool-")) return part;
      if (!p.output) return part;
      const key = toolDedupKey(p.type, p.input);
      if (!key) return part;
      const latest = latestByKey.get(key);
      if (!latest) return part;
      if (latest.msgIdx === i && latest.partIdx === j) return part; // c'est LA version fraîche
      // Sinon → cette occurrence est ancienne, remplace par pointeur.
      const beforeLen = JSON.stringify(p.output).length;
      const pointer = {
        deduped: true,
        note: `Sortie identique/plus récente disponible plus loin dans l'historique (tour ${latest.msgIdx + 1}). Consulte la version fraîche.`,
      };
      const afterLen = JSON.stringify(pointer).length;
      dedupedParts++;
      savedChars += Math.max(0, beforeLen - afterLen);
      return { ...(part as object), output: pointer } as typeof part;
    });

    return { ...m, parts: newParts } as UIMessage;
  });

  return { messages: out, stats: { dedupedParts, savedChars, uniqueKeys: latestByKey.size } };
}

export function logDedup(route: string, projectId: string, stats: DedupStats): void {
  const savedTk = Math.round(stats.savedChars / 4);
  console.log(
    `[dedup] route=${route} enabled=${DEDUP_ENABLED} project=${projectId} parts=${stats.dedupedParts} uniqueKeys=${stats.uniqueKeys} savedChars=${stats.savedChars} ~savedTk=${savedTk}`,
  );
}
