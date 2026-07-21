/**
 * Elena — Architecture en couches (Chantier 1).
 *
 * Assemble le system prompt d'Elena en 4 couches ordonnées de la plus
 * stable à la plus volatile. Cet ordre stable est la fondation du cache
 * prompt (Chantier 2) — chaque provider (OpenAI, DeepSeek, OpenRouter)
 * cache un préfixe stable et le facture 10x moins cher.
 *
 * Couches :
 *   L1 — ADN Elena     (identité + coaching lessons)        [stable à vie]
 *   L2 — Profil user   (préférences utilisateur permanentes) [stable par user]
 *   L3 — Contexte      (résumé conversation + mémoire projet) [stable par projet]
 *   L4 — Tour en cours (messages récents)                    [volatil]
 *
 * L4 n'est PAS géré ici : ce sont les `messages` passés à `streamText`.
 * Ce module retourne seulement le bloc `system` (L1+L2+L3 concaténé) et
 * les métadonnées par couche (pour logs + Chantier 2).
 *
 * Comportement OFF (`ELENA_LAYERS=off` ou variable absente) : concaténation
 * identique à l'ancien code (`[SYSTEM_PROMPT+lessons, userProfile, summary]`).
 * Aucun risque de régression comportementale.
 */

export type LayerPiece = {
  /** Nom de la couche : L1 / L2 / L3. */
  name: "L1" | "L2" | "L3";
  /** Contenu de la couche (peut être vide si non applicable ce tour). */
  content: string;
  /** Estimation grossière du nombre de tokens (chars / 4). */
  approxTokens: number;
};

export type LayeredSystem = {
  /** System prompt final à passer à `streamText({ system })`. */
  system: string;
  /** Détail par couche — utilisé par Chantier 2 pour attacher `cache_control`. */
  pieces: LayerPiece[];
  /** Total approx tokens (somme des couches). */
  totalApproxTokens: number;
  /** true si le mode layers est actif (env `ELENA_LAYERS=on`). */
  layersEnabled: boolean;
};

export type LayerInputs = {
  /** L1 : SYSTEM_PROMPT statique + block coaching lessons. */
  adn: string;
  /** L2 : profil user (elena_settings.preferences.user_profile). */
  userProfile: string | null | undefined;
  /** L3 : bloc résumé conversation compactée. */
  conversationSummary: string | null | undefined;
  /**
   * L3 (option) : bloc mémoire projet (brief/secteur/décisions).
   * Non injecté par défaut aujourd'hui — on garde le flag pour Chantier 3.
   */
  projectMemory?: string | null;
};

/** Estimation tokens simple et déterministe (chars / 4). */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function isLayersEnabled(): boolean {
  const v = process.env.ELENA_LAYERS;
  if (!v) return false;
  return v === "on" || v === "1" || v === "true";
}

/**
 * Construit le system prompt en couches ordonnées.
 * Ordre GARANTI : L1 (ADN) → L2 (user) → L3 (contexte).
 * C'est cet ordre stable qui rend le cache prompt efficace au Chantier 2.
 */
export function buildLayeredSystem(inputs: LayerInputs): LayeredSystem {
  const enabled = isLayersEnabled();

  const l1Content = (inputs.adn ?? "").trim();
  const l2Content = (inputs.userProfile ?? "").trim();
  // L3 = résumé conversation + (option future) mémoire projet
  const l3Parts: string[] = [];
  if (inputs.conversationSummary?.trim()) l3Parts.push(inputs.conversationSummary.trim());
  if (inputs.projectMemory?.trim()) l3Parts.push(inputs.projectMemory.trim());
  const l3Content = l3Parts.join("\n\n");

  const pieces: LayerPiece[] = [
    { name: "L1", content: l1Content, approxTokens: approxTokens(l1Content) },
    { name: "L2", content: l2Content, approxTokens: approxTokens(l2Content) },
    { name: "L3", content: l3Content, approxTokens: approxTokens(l3Content) },
  ];

  const system = pieces
    .map((p) => p.content)
    .filter(Boolean)
    .join("\n\n");

  return {
    system,
    pieces,
    totalApproxTokens: pieces.reduce((s, p) => s + p.approxTokens, 0),
    layersEnabled: enabled,
  };
}

/**
 * Log console une-ligne pour observabilité — appelé par les routes Elena.
 * Format volontairement stable pour grepping/monitoring.
 */
export function logLayers(route: string, layered: LayeredSystem, extra: Record<string, unknown> = {}): void {
  try {
    const [l1, l2, l3] = layered.pieces;
    const extras = Object.entries(extra)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(
      `[layers] route=${route} enabled=${layered.layersEnabled} ` +
        `L1=${l1?.approxTokens ?? 0} L2=${l2?.approxTokens ?? 0} L3=${l3?.approxTokens ?? 0} ` +
        `total=${layered.totalApproxTokens}tk` +
        (extras ? ` ${extras}` : ""),
    );
  } catch {
    // logging ne doit jamais casser un tour Elena
  }
}
