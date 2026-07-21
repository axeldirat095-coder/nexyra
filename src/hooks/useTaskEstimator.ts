/**
 * useTaskEstimator — estime le coût/durée d'une demande Elena AVANT exécution.
 *
 * Pas d'appel LLM : heuristique multi-signaux (instantanée, gratuite).
 * Détecte les demandes "lourdes" pour proposer une confirmation à l'utilisateur.
 *
 * Tarification approx (gpt-5 / openai gateway, ordre de grandeur) :
 *   - input  : ~$2.50 / 1M tokens
 *   - output : ~$10.00 / 1M tokens
 * Vitesse approx : ~30 tokens/sec en sortie.
 */

const PRICE_IN_PER_M = 2.5;
const PRICE_OUT_PER_M = 10.0;
const TOKENS_PER_SEC = 30;

export interface TaskEstimate {
  /** Demande considérée comme "lourde" → mérite confirmation */
  heavy: boolean;
  /** Score interne 0–10 (≥ 5 = lourd) */
  score: number;
  /** Tokens estimés en entrée (prompt + contexte fichiers) */
  tokensIn: number;
  /** Tokens estimés en sortie (réponse + code généré) */
  tokensOut: number;
  /** Coût estimé en USD */
  costUsd: number;
  /** Durée estimée en secondes (avant timeout SSE) */
  durationS: number;
  /** Niveau qualitatif lisible */
  size: "S" | "M" | "L" | "XL";
  /** Raisons qui ont déclenché le score (pour transparence) */
  reasons: string[];
}

interface EstimateInput {
  message: string;
  /** Fichiers du sandbox envoyés en contexte */
  files: Array<{ path: string; content: string }>;
}

const HEAVY_KEYWORDS = [
  // Création complète
  "crée une app", "cree une app", "create app", "nouvelle app",
  "crée un site", "cree un site", "site complet", "landing complète", "landing complete",
  "application complète", "application complete", "app complète", "app complete",
  "from scratch", "depuis zéro", "depuis zero", "à partir de zéro",
  // Refactor / architecture
  "refactor", "refonte", "réécris", "reecris", "rewrite",
  "architecture", "restructure", "réorganise", "reorganise",
  // Multi-feature
  "plusieurs pages", "multi-pages", "tout le", "toutes les",
  "système complet", "systeme complet", "module complet",
  // Backend lourd
  "migration", "schéma complet", "schema complet", "tables et rls",
  "auth complète", "auth complete", "authentification complète",
];

const MEDIUM_KEYWORDS = [
  "ajoute une page", "nouvelle page", "ajoute un composant",
  "ajoute une feature", "nouvelle feature", "implémente", "implemente",
  "intégration", "integration", "connecte", "branche",
];

function approxTokens(text: string): number {
  // Approx GPT : 1 token ≈ 4 chars (anglais) / ~3.5 (français mixte code)
  return Math.ceil(text.length / 3.5);
}

export function estimateTask({ message, files }: EstimateInput): TaskEstimate {
  const reasons: string[] = [];
  let score = 0;

  // 1) Longueur du message
  const msgLen = message.length;
  if (msgLen > 1200) { score += 3; reasons.push("Prompt très long (>1200 car.)"); }
  else if (msgLen > 500) { score += 2; reasons.push("Prompt long (>500 car.)"); }
  else if (msgLen > 200) { score += 1; }

  // 2) Mots-clés "lourds"
  const lower = message.toLowerCase();
  const heavyHit = HEAVY_KEYWORDS.find((k) => lower.includes(k));
  if (heavyHit) {
    score += 4;
    reasons.push(`Demande de création/refonte ("${heavyHit}")`);
  } else {
    const medHit = MEDIUM_KEYWORDS.find((k) => lower.includes(k));
    if (medHit) {
      score += 2;
      reasons.push(`Ajout de feature ("${medHit}")`);
    }
  }

  // 3) Nombre de fichiers en contexte
  if (files.length > 40) { score += 3; reasons.push(`Contexte volumineux (${files.length} fichiers)`); }
  else if (files.length > 15) { score += 2; reasons.push(`Contexte moyen (${files.length} fichiers)`); }
  else if (files.length > 5) { score += 1; }

  // 4) Plusieurs intentions dans la même phrase
  const verbs = (lower.match(/\b(crée|cree|ajoute|modifie|supprime|refactor|implémente|implemente|connecte|intègre|integre|configure|déploie|deploie)\b/g) || []).length;
  if (verbs >= 3) {
    score += 2;
    reasons.push(`Plusieurs actions (${verbs} verbes détectés)`);
  }

  // Estimation tokens
  const ctxChars = files.reduce((sum, f) => sum + Math.min(f.content.length, 8000), 0);
  const tokensIn = approxTokens(message) + Math.ceil(ctxChars / 3.5) + 1500; // +1500 pour system prompt
  // Output : proportionnel au score
  const tokensOut =
    score >= 7 ? 12000 :
    score >= 5 ? 6000 :
    score >= 3 ? 2500 :
    800;

  const costUsd = (tokensIn * PRICE_IN_PER_M + tokensOut * PRICE_OUT_PER_M) / 1_000_000;
  const durationS = Math.max(5, Math.ceil(tokensOut / TOKENS_PER_SEC));

  const size: TaskEstimate["size"] =
    score >= 7 ? "XL" :
    score >= 5 ? "L" :
    score >= 3 ? "M" : "S";

  return {
    heavy: score >= 5,
    score,
    tokensIn,
    tokensOut,
    costUsd,
    durationS,
    size,
    reasons,
  };
}
