/**
 * Elena V3 — sous-agents serveur (Lot 3 multi-agent).
 *
 * Architecture : Elena (orchestrateur) délègue à des sous-agents spécialisés
 * via des tool-calls `delegate_*`. Chaque sous-agent tourne côté serveur
 * via Lovable AI Gateway, avec son propre system prompt + modèle choisi
 * par task_type. Le rôle Developer reste Elena qui exécute les tools FS,
 * mais elle peut aussi déléguer un brief de refacto à `delegate_developer`
 * pour pré-mâcher le code (renvoie des blocs prêts à coller).
 *
 * Lot 4 ajoutera `delegate_qa_visual` (screenshot → critique).
 */
import { cachedGenerate } from "./llm-cache.server";

// ---------------------------------------------------------------------------
// Routage modèle par task_type (Axe A — préparé pour le cache + routing).
// On reste sur des modèles disponibles via Lovable AI Gateway.
// ---------------------------------------------------------------------------
export type TaskType =
  | "orchestrator"
  | "architect"
  | "designer"
  | "developer"
  | "qa_visual"
  | "trivial_edit";

// 🚫 Pas de Gemini pour l'instant (préférence user — voir mem://preferences/no-gemini).
const MODEL_BY_TASK: Record<TaskType, string> = {
  orchestrator: "openai/gpt-5-mini",
  architect: "openai/gpt-5-mini",
  designer: "openai/gpt-5", // sens du design premium
  developer: "openai/gpt-5-mini",
  qa_visual: "openai/gpt-5-mini", // vision capable
  trivial_edit: "openai/gpt-5-nano", // ops bon marché
};

export function pickModelForTask(task: TaskType): string {
  return MODEL_BY_TASK[task];
}

// ---------------------------------------------------------------------------
// Prompts spécialisés
// ---------------------------------------------------------------------------
const ARCHITECT_PROMPT = `Tu es l'**Architecte** de l'équipe Elena V3.

Mission : transformer un brief utilisateur flou en **plan d'architecture** clair, exploitable directement par le Developer (qui écrira le code dans un WebContainer Vite + React 19 + TS + Tailwind v4).

Réponds en français, Markdown, **concis** (max ~250 mots) :

## Objectif
1 phrase qui résume la fonctionnalité visée.

## Arbre de fichiers
Liste \`path → rôle\` des fichiers à créer/modifier. Privilégie : composants dans \`src/components/\`, hooks dans \`src/hooks/\`, pages dans \`src/App.tsx\`.

## Modèle de données / état
État local (useState/useReducer) ? Persistance (localStorage) ? Schéma TypeScript des types clés.

## Étapes (ordonnées)
Liste numérotée des actions Developer.

## Risques & non-objectifs
Ce qu'on NE fait PAS dans cette itération.

Pas de code, juste le plan. Pas de blabla introductif.`;

const DESIGNER_PROMPT = `Tu es la **Designer** de l'équipe Elena V3 — niveau Lovable minimum, pas en dessous.

Mission : à partir d'un brief, livrer une **spec visuelle** premium que le Developer applique directement.

Réponds en français, Markdown, **concis** (max ~200 mots) :

## Ambiance
Mots-clés (ex: "dark glassmorphism", "minimal Apple", "playful retro").

## Tokens Tailwind v4
Couleurs (oklch), gradients, ombres, radius. Donne les classes Tailwind exactes ou les CSS vars à ajouter dans \`src/styles.css\`.

## Typographie
Font family (Google Fonts URL si custom), tailles (text-*), poids.

## Composants clés
Pour chaque bloc majeur : layout (grid/flex), espacement, états hover/focus, animations.

## Accessibilité
Contraste, focus rings, aria-labels critiques.

Pas de code complet, juste les specs précises.`;

const DEVELOPER_PROMPT = `Tu es le **Developer** délégué d'Elena V3.

Mission : à partir d'un brief technique précis (souvent fourni par l'Architecte), produire le **code TypeScript + JSX** prêt à coller, conforme au standard Lovable :

- React 19 + TS strict (pas de \`any\`).
- Tailwind v4 + design tokens Nexyra (dark, glassmorphism, gradients blue/violet).
- lucide-react pour les icônes.
- Composants typés, hooks séparés si logique réutilisable.
- Classes Tailwind sur **chaque** élément visible (jamais de \`<div>texte</div>\` brut).

Réponds en Markdown : pour chaque fichier, un bloc \`\`\`tsx avec en commentaire d'en-tête le path. Pas de blabla — du code, et seulement des micro-notes inline si nécessaire.`;

const QA_VISUAL_PROMPT = `Tu es le **QA visuel** d'Elena V3 — œil critique niveau Lovable/Linear/Vercel.

Mission : on te fournit (a) le brief design d'origine et (b) le code source TSX/TS de ce qui vient d'être écrit. Tu dois **détecter les écarts** par rapport au standard Nexyra et renvoyer une **liste actionnable de fixes**.

Critères (NON négociables) :
- Tout élément visible a des classes Tailwind (jamais \`<div>texte</div>\` brut).
- Background dark (\`bg-slate-950\` ou tokens Nexyra), jamais blanc cassé.
- Glassmorphism sur les cartes (\`rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur\`).
- CTA gradient blue→violet, hover/focus visibles.
- Typo hiérarchisée (titres bold tracking-tight, sous-titres uppercase tracking-wider text-slate-400).
- Empty states avec icône lucide + titre + CTA, jamais "0 items" brut.
- Responsive mobile-first (au moins un breakpoint \`md:\` ou \`lg:\` sur les grilles).
- Pas d'emoji en place d'icône.
- Imports cohérents (lucide-react, composants utilisés).

Format de réponse (Markdown, max ~250 mots) :

## Verdict
\`OK\` (rien à changer) **ou** \`FIX\` (liste ci-dessous).

## Fixes
- [ ] \`path/to/file.tsx\` — problème → action edit_file précise (search→replace court).
- [ ] ...

## Note
1 phrase sur l'impression générale (premium / acceptable / brouillon).

Sois sec, factuel, sans flatterie.`;

// ---------------------------------------------------------------------------
// Runner générique
// ---------------------------------------------------------------------------
async function runSubAgent(
  systemPrompt: string,
  userBrief: string,
  task: TaskType,
  openaiKey: string | null,
  userId?: string,
  abortSignal?: AbortSignal,
) {
  const result = await cachedGenerate(systemPrompt, userBrief, task, openaiKey, { userId, abortSignal });
  return {
    text: result.text,
    usage: { inputTokens: result.tokensInput, outputTokens: result.tokensOutput },
    model: result.model,
    cacheHit: result.cacheHit,
  };
}

export function runArchitect(brief: string, openaiKey: string | null, userId?: string, abortSignal?: AbortSignal) {
  return runSubAgent(ARCHITECT_PROMPT, brief, "architect", openaiKey, userId, abortSignal);
}

export function runDesigner(brief: string, openaiKey: string | null, userId?: string, abortSignal?: AbortSignal) {
  return runSubAgent(DESIGNER_PROMPT, brief, "designer", openaiKey, userId, abortSignal);
}

export function runDeveloper(brief: string, openaiKey: string | null, userId?: string, abortSignal?: AbortSignal) {
  return runSubAgent(DEVELOPER_PROMPT, brief, "developer", openaiKey, userId, abortSignal);
}

export function runQaVisual(brief: string, openaiKey: string | null, userId?: string, abortSignal?: AbortSignal) {
  return runSubAgent(QA_VISUAL_PROMPT, brief, "qa_visual", openaiKey, userId, abortSignal);
}
