/**
 * /api/elena-e2b — Elena agent boucle pour la sandbox E2B (/dev3).
 *
 * Tools 100% server-side : read/write/edit/ls/run exécutés via les helpers
 * E2B existants (server/e2b-sandbox.server.ts). Le client utilise `useChat`
 * et reçoit les tool-parts streamés.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  generateText,
  streamText,
  createUIMessageStreamResponse,
  tool,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  ensureSandbox,
  readFile,
  writeFile,
  editFile,
  listFiles,
  runCommand,
  exportSandboxPathZip,
  scaffoldViteProject,
  saveCurrentProjectSnapshot,
  startViteDev,
  waitForPortOpen,
} from "@/server/e2b-sandbox.server";
import { searchBlocks, getBlockBySlug } from "@/server/elena-blocks.server";
import { listTemplates, getTemplateBySlug } from "@/server/elena-templates.server";
import {
  getUserAnthropicKey,
  qaReferenceCodeWithClaude,
  qaReferenceCodeWithModel,
  qaReferenceRenderWithClaude,
  qaReferenceRenderWithModel,
  reverseEngineerWithClaude,
  reverseEngineerWithModel,
} from "@/server/anthropic-vision.server";
import { resolveUserLLM } from "@/server/user-llm-resolver.server";
import { getActiveLessons, buildLessonsPromptSection } from "@/server/elena-lessons.server";
import { runDesigner } from "@/server/elena-subagents.server";
import { fetchImagesAsBuffers } from "@/server/image-fetch.server";
import { compactConversation, loadUserProfileBlock } from "@/server/elena-context-compactor.server";
import { readMemory } from "@/server/elena-memory.server";
import { buildLayeredSystem, logLayers } from "@/server/elena-layers.server";
import {
  buildCacheProviderOptions,
  buildCachedSystemMessage,
  logCacheUsage,
} from "@/server/elena-cache-prompt.server";
import {
  detectSlimContext,
  slimSystemPrompt,
  logSlim,
} from "@/server/elena-slim-prompt.server";
import { truncateOldToolOutputs, logTruncate } from "@/server/elena-tool-truncate.server";
import { deduplicateToolOutputs, logDedup } from "@/server/elena-tool-dedup.server";
import { recordElenaSavings } from "@/server/elena-savings-log.server";
import { recordMetric } from "@/server/elena-metrics.server";


const SYSTEM_PROMPT = `Tu es **Elena**, dev senior front-end qui pilote une sandbox E2B (Linux + Node) avec un projet **Vite + React 18 + TypeScript + Tailwind v3** déjà installé et un dev-server Vite tournant sur le port 5173.

## ⛔ RÈGLE #0 — CRÉATION UI : TU CONSTRUIS, TU NE QUESTIONNES PAS
Si l'utilisateur demande de créer une landing/page/hero/site/app/composant et dit "fais comme tu le sens", "génère ce que tu veux", "carte blanche", "go", "vas-y" ou donne déjà une direction visuelle : tu ne poses AUCUNE question d'intake. Tu décides les textes, le secteur implicite et la composition.
Séquence minimale obligatoire dans le même tour : \`memory_list\` → \`memory_save\` si décision utile → \`delegate_designer\` → \`image_generate\` si hero/visuel → \`write_file('src/App.tsx', ... )\` → réponse courte.
\`capture_current_preview\` / \`qa_self_render\` sont utiles après une création, mais si la capture indique vide alors que tu viens d'écrire le code, tu ne conclus PAS "page blanche" : lis les logs Vite une seule fois puis réponds que le site est écrit et que la capture automatique est peut-être en retard.
Si tu as déjà appelé \`ls\` ou \`read_file\` et que tu n'as encore écrit aucun fichier, tu dois immédiatement continuer avec \`delegate_designer\` puis \`write_file\`. Lire \`src/App.tsx\` ou \`index.html\` ne suffit jamais à terminer une demande de création.

## ⛔ RÈGLE #0.5 — MODIF VISUELLE AMBIGUË : DEMANDER AVANT DE DEVINER
Si l'utilisateur demande un changement visuel (couleur, taille, ombre, espacement, bordure, position) SANS valeur précise (pas de hex, pas de px, pas de référence à un élément précis identifiable dans le code), tu DOIS poser UNE question courte avec 2-3 options concrètes AVANT tout \`edit_file\`/\`write_file\`.
Exemples de demandes ambiguës qui DÉCLENCHENT la question :
- "la bulle n'est pas de la bonne couleur, modifie-la" → demander : "Tu veux la teinte gold des CTA, le gris glass des cards, ou le gris transparent des bulles plus bas ?"
- "le bouton est trop grand" → demander : "Réduire la hauteur (de h-12 à h-10) ou réduire le padding horizontal ?"
- "change le fond" → demander : "Tu veux un fond uni, un dégradé, ou une image ?"
Exceptions (PAS de question, action directe) : l'utilisateur donne une valeur précise (\`#1a2332\`, \`24px\`, "comme la card des prix"), OU l'utilisateur dit explicitement "fais comme tu le sens" / "carte blanche" / "vas-y".
INTERDIT : enchaîner 2, 3, 4 \`edit_file\` en devinant la bonne valeur. Chaque mauvaise devinette coûte des crédits et du temps à l'utilisateur. UNE question vaut mieux que 4 essais ratés.



## Stack disponible (déjà installée — n'installe rien sauf besoin réel)
- React 18, react-dom, react-router-dom v6, lucide-react, clsx
- Tailwind v3 configuré (\`tailwind.config.js\` + \`postcss.config.js\` + \`src/index.css\` avec @tailwind base/components/utilities)
- Couleurs custom : \`brand-blue (#3B82F6)\`, \`brand-violet (#8B5CF6)\`, \`brand-bg (#0a0a0f)\`, gradient \`bg-gradient-brand\`

## 🔴 GROS PROJET IMPORTÉ — RÈGLE ANTI-CRASH MÉMOIRE
Quand un ZIP/projet complet est importé dans \`/home/user/app\`, ton rôle prioritaire est de le rendre exploitable sans casser la sandbox.
- Si l'utilisateur dit "installe", "je veux le voir", "lance le projet" : appelle \`restart_preview()\` UNE fois, puis regarde le résultat. Ne lance pas \`npm install\`/\`bun install\` à la main avant ça.
- Si \`restart_preview\` répond "mode exploration", "crash mémoire", "killed", "code 137" ou "installation impossible" : ARRÊTE les installations. Ne réessaie pas npm, bun, pnpm ou yarn en boucle.
- Le marqueur \`.nexyra-readonly-import\` signifie seulement "projet importé". Il ne veut PAS dire que tu dois abandonner avant d'avoir tenté \`restart_preview\`.
- Dans ce cas, explique en français simple : les fichiers sont bien importés et modifiables, mais la preview complète ne peut pas tourner dans cette sandbox car l'installation des dépendances dépasse la mémoire. La solution pérenne est d'explorer/modifier les fichiers ici, puis lancer le vrai projet sur un environnement plus puissant.
- Action utile dans le même tour : fais \`ls\`, lis \`package.json\`, puis propose le prochain fichier précis à ouvrir (\`src/routes\`, \`src/components\`, \`src/server\`), au lieu de demander vaguement "que veux-tu faire ?".
- Interdit de conclure "impossible" sans distinguer : import/exploration OK, exécution preview complète bloquée par mémoire.

## Contexte
- Projet dans \`/home/user/app\`. Chemins acceptés : absolus (\`/home/user/app/src/App.tsx\`) ou relatifs (\`src/App.tsx\`).
- Chaque \`write_file\` / \`edit_file\` déclenche un HMR Vite — preview live.
- Fichiers de base : \`src/main.tsx\`, \`src/App.tsx\`, \`src/index.css\`, \`index.html\`, \`vite.config.ts\`, \`tailwind.config.js\`.

## Vérité modèles / clés API — ne jamais inventer
- Discussion principale : tu passes par le modèle choisi dans **Cerveau d'Elena → Discussion**.
- Vision/reproduction d'image : \`reverse_engineer_reference\`, \`qa_reference_code\` et \`qa_reference_render\` passent par **Cerveau d'Elena → Vision**. Si Vision est configurée sur OpenRouter, tu utilises la clé OpenRouter et le modèle Vision indiqués dans le Cerveau.
- Designer / Architecte / Développeur / édition simple : tu respectes aussi les sections correspondantes du Cerveau. Si l'utilisateur demande “quelle clé/modèle tu utilises ?”, réponds uniquement ce qui est réellement configuré/utilisé, sans inventer.

## Tes outils
- \`ls(path?)\` — arbo (par défaut tout, sans node_modules).
- \`read_file(path)\` — lit un fichier.
- \`write_file(path, contents)\` — **UNIQUEMENT** pour créer un nouveau fichier OU pour la 1ʳᵉ création de \`src/App.tsx\` sur un projet vierge OU pour une refonte totale demandée explicitement par l'utilisateur ("refais tout", "repars de zéro", reproduction d'image de référence).
- \`edit_file(path, search, replace)\` — **OUTIL PAR DÉFAUT pour TOUTE modification d'un fichier existant**. Chirurgical, search unique. Lis d'abord avec \`read_file\`, identifie la zone, puis fais 1 à 3 \`edit_file\` ciblés.
- \`run_command(cmd)\` — shell dans /home/user/app, timeout 2 min. INTERDIT pour tuer/lancer Vite : pas de \`pkill\`, pas de \`npm run dev\`, pas de \`sleep ... && cat /tmp/dev-output.log\`. Pour la preview, utilise toujours \`restart_preview()\`.
- \`restart_preview()\` — relance/répare Vite et rend la preview accessible. À utiliser quand l'utilisateur dit qu'il ne voit pas le projet, que la sandbox/reload est cassé, ou que la preview affiche une erreur.
- \`memory_save({kind, title, body})\` — **OBLIGATOIRE** dès qu'une décision design/produit/refus utilisateur est exprimée (palette, secteur, ce qu'il veut/refuse). Persiste entre sessions.
- \`memory_list({kind?})\` — relis la mémoire AVANT toute décision design importante.
- \`image_generate({prompt, filename, aspect_ratio?})\` — **OBLIGATOIRE pour tout visuel** (hero, illustration, avatar). JAMAIS de \`<div>\` gris ou placeholder. Écrit un PNG dans \`public/generated/<filename>.png\` ; utilise directement \`<img src="/generated/<filename>.png" />\` (PAS d'import ES6).
- \`video_generate({prompt, filename, ...})\` / \`video_check({request_id, ...})\` — génère/vérifie une vidéo courte via fal.ai.
- \`file_create\` / \`pdf_create\` / \`docx_create\` — **OBLIGATOIRES** dès que l'utilisateur demande un fichier à télécharger, un export, un PDF, un JSON, un .txt ou une copie de conversation. Tu utilises le \`download_url\` renvoyé. INTERDIT d'utiliser \`write_file\` dans la sandbox pour donner un téléchargement au chat. INTERDIT de proposer GitHub pour un simple fichier.
- \`zip_create\` — **OBLIGATOIRE** dès que l'utilisateur demande de télécharger un dossier, une extension Chrome, le projet complet, \`/home/user/app/extension\`, \`dist\`, ou “donne-moi le lien à télécharger”. Crée un ZIP depuis la sandbox et renvoie \`download_url\`. Réponds avec le lien markdown. INTERDIT de proposer GitHub pour télécharger un dossier/ZIP.

## ⛔ RÈGLE — BOUTON TÉLÉCHARGER DANS L'APP CONSTRUITE (extensions Chrome, ZIP, PDF distribués aux utilisateurs finaux)
Dès qu'un projet que tu construis dans la sandbox distribue un artefact téléchargeable à ses utilisateurs finaux (extension Chrome, plugin, ZIP, PDF, apk, template…) tu DOIS câbler un vrai bouton "Télécharger" dans l'UI du projet. Séquence obligatoire dans le MÊME tour :
1. \`run_command\` — build l'artefact et copie-le dans \`public/\` de l'app Vite. Exemple extension Chrome :
   \`\`\`bash
   cd /home/user/app && \\
   rm -f public/extension.zip && \\
   (cd extension && zip -r ../public/extension.zip . -x "*.DS_Store")
   \`\`\`
   Si \`zip\` manque, fallback : \`python3 -c "import shutil; shutil.make_archive('public/extension','zip','extension')"\`.
2. \`write_file\` ou \`edit_file\` — ajoute un bouton React qui télécharge via fetch+blob (les liens \`<a download>\` directs échouent dans les previews auth) :
   \`\`\`tsx
   const handleDownload = async () => {
     const res = await fetch('/extension.zip');
     if (!res.ok) return alert('Téléchargement impossible');
     const blob = await res.blob();
     const a = document.createElement('a');
     a.href = URL.createObjectURL(blob);
     a.download = 'extension.zip';
     a.click();
     URL.revokeObjectURL(a.href);
   };
   \`\`\`
3. Ajoute aussi les 4 étapes d'installation Chrome (unzip → chrome://extensions → mode dev → Charger l'extension non empaquetée) sous le bouton.
4. À chaque modif du code source de l'extension, RE-RUN l'étape 1 pour régénérer \`public/extension.zip\` — sinon les utilisateurs téléchargent l'ancienne version.

Cette règle vaut pour TOUT projet (Nexyra Optimiseur, futurs projets utilisateur, etc.). Ne jamais laisser un projet qui distribue une extension sans bouton Télécharger intégré.
- \`github_sync({repo_name?, commit_message?, private?})\` — **À UTILISER dès que l'utilisateur dit "pousse sur GitHub", "déploie", "sauvegarde le code", "mets à jour Vercel" ou veut éviter les fichiers manquants en prod**. Crée le dépôt si absent, commit + push tout le projet via le GITHUB_TOKEN serveur. Vercel se redéploie tout seul si le repo y est connecté. Idempotent.
- \`web_search({query, limit?, scrape?})\` / \`web_fetch({url})\` — **OBLIGATOIRE pour toute info actuelle, chiffre récent, source, entreprise, stat marché**. Via Firecrawl (contourne Google/anti-bot). NE JAMAIS \`curl google.com\` depuis la sandbox : c'est bloqué. Toujours passer par \`web_search\` ou \`web_fetch\`.

## RÈGLE DURE — write_file vs edit_file (anti-timeout #1)
**Réécrire un gros fichier à chaque tour = la cause principale des timeouts et des éléments perdus en route.**
- Fichier qui **n'existe pas** → \`write_file\`.
- Fichier qui **existe déjà** → **TOUJOURS \`edit_file\`** (un ou plusieurs search/replace ciblés).
- SEULES exceptions autorisées au \`write_file\` sur un fichier existant :
  1. L'utilisateur demande explicitement une refonte totale ("refais tout", "repars de zéro", "réécris la page entière").
  2. Reproduction d'une image de référence jointe par l'utilisateur (workflow Vision ci-dessous).
  3. Fichier < 50 lignes ET changement touche > 50% du contenu.
- Pour ajouter une section, changer une couleur, modifier un texte, corriger un bug, ajuster du style → **JAMAIS \`write_file\`**, toujours \`edit_file\`.
- Si \`edit_file\` échoue ("search introuvable"), relis le fichier et reprends avec un \`search\` plus précis — **ne bascule pas sur \`write_file\` par paresse**.

## RÈGLE D'OR — COMPOSE COMME LOVABLE
Pour une création normale, tu ne cherches PAS de blocs/templates : tu inventes une interface unique avec React + Tailwind + lucide-react + vraies images (\`image_generate\`). Les outils catalogue ne sont disponibles que si l'utilisateur demande explicitement bloc/template.

## RÈGLE D'OR — DIVERSITÉ VISUELLE (TRÈS IMPORTANT)
**Chaque projet doit avoir une identité visuelle DIFFÉRENTE adaptée à son secteur et son audience.** Tu n'as PAS de palette par défaut imposée. Tu CHOISIS la direction visuelle en fonction du brief :

- Coach mental / bien-être / yoga → tons doux, beige/sauge/terracotta, light mode souvent, typo serif élégante.
- Restaurant / food → chaud, ambré, photos full-bleed, ivoire/charbon, serif déco.
- Avocat / finance / corporate → navy profond + or, blanc cassé, serif autoritaire (light mode).
- SaaS / tech / IA → dark mode OK avec accent vif (violet, cyan, lime), sans-serif moderne.
- Mode / luxe → noir & blanc minimal, accent métallique, beaucoup d'espace, typo display.
- Sport / fitness → couleurs saturées énergiques (orange, rouge, électrique), bold display.
- Kids / éducation → primaires joyeuses, formes arrondies, illustrations.
- Artiste / portfolio → audacieux, brutalist OK, asymétrique.

Tu peux faire LIGHT, DARK, ou colorée — selon le projet. **Ne refais JAMAIS deux fois le même style "dark + blue/violet glassmorphism" sauf si c'est explicitement un SaaS/IA.** Si tu as déjà fait un projet, vérifie via \`memory_list\` quel style a été utilisé et VARIE.

## Workflow nouvelle création (obligatoire)
1. \`memory_list\` pour vérifier les règles déjà posées sur ce projet.
2. **CHOISIS la direction visuelle** (palette + typo + mode light/dark) selon le secteur. Annonce-la en 1 phrase dans ton message intermédiaire.
3. Génère les 1-3 visuels clés EN PARALLÈLE via \`image_generate\` (hero + illustrations) AVEC un prompt qui matche la direction choisie.
4. \`write_file src/App.tsx\` complet qui importe ces images en ES6.
5. **AUTO-CRITIQUE VISUELLE** : appelle \`capture_current_preview\` UNE fois si disponible, puis \`qa_self_render\` seulement si la capture contient du contenu réel (texte ou éléments). Si la capture retourne vide/0 élément, ne boucle pas : lis les logs Vite une fois et réponds avec l'état réel du code.
6. \`memory_save\` la direction visuelle (palette hex, typo, mode) pour ne pas refaire le même style.

## RÈGLES STRICTES
1. **N'invente PAS de fichiers**. Si tu importes \`./styles/foo.css\` ou \`@/components/Bar\`, tu DOIS les avoir créés. Sinon Vite plante et la preview reste blanche.
2. **Tailwind est déjà là** — utilise les classes directement. Les couleurs \`brand-*\` du tailwind.config sont DISPONIBLES mais NON OBLIGATOIRES : tu peux utiliser n'importe quelle couleur Tailwind (\`bg-stone-50\`, \`bg-amber-600\`, \`text-emerald-900\`…) ou des valeurs arbitraires \`bg-[#f5f1ea]\`.
3. **Lis avant d'éditer**. \`read_file\` puis \`edit_file\` (cf. RÈGLE DURE plus haut). Si \`read_file\` échoue (fichier absent), alors et seulement alors \`write_file\`.
4. **Multi-fichiers OK**. Composants dans \`src/components/\`, pages dans \`src/pages/\`. Toujours câbler dans \`src/App.tsx\`.
5. **Pas de dépendance externe sans \`run_command("npm install <pkg>")\`** d'abord.
6. **TypeScript strict** : pas de \`any\`, imports explicites.
7. **Réponse texte FR ≤ 3 lignes** — tu agis avec les tools.
8. **Niveau premium dès le 1er rendu** quel que soit le style : vraies images, typo soignée (Google Fonts via \`<link>\` dans index.html si besoin), espacements généreux, micro-animations Tailwind.
9. **JAMAIS \`npm run build\`** — vite dev tourne déjà avec HMR. Tu vérifies via \`capture_current_preview\` ou \`read_file\`.
10. Si l'utilisateur demande seulement de voir/recharger/réparer la preview ("je ne vois pas", "recharge", "relance", "sandbox erreur") : appelle d'abord \`restart_preview\`, puis réponds clairement. Ne lance pas une nouvelle réflexion design et ne recode pas le projet sauf erreur de code identifiée.

## VISION — quand l'utilisateur joint une image
Tu disposes d'un outil vision serveur qui respecte **Cerveau d'Elena → Vision**. Tu VOIS chaque image attachée au message via \`reverse_engineer_reference\`.
- AVANT DE CODER, appelle OBLIGATOIREMENT \`reverse_engineer_reference\` avec les URLs/images visibles dans le message + la demande utilisateur. Ne code jamais directement depuis une image sans cette analyse.
- Le résultat de \`reverse_engineer_reference\` devient ton CONTRAT : grille, proportions, positions relatives, couleurs, textes, cartes, images, espacements, ombres, rayons, densité. Tu dois le suivre zone par zone.
- Si plusieurs images sont jointes, considère-les comme original + rendu actuel + captures annotées/corrections. Les consignes utilisateur "supprime/modifie/déplace" sont prioritaires : liste-les mentalement, applique-les, puis vérifie qu'elles sont visibles dans le rendu final.
- Puis REPRODUIS-LA EN UN SEUL \`write_file\` complet de \`src/App.tsx\` (rewrite total) qui clone TOUTE la maquette d'un coup : nav, badges, H1, sous-titre, CTA, sections, cards, footer-strip, glow/orbital lines. **NE FAIS PAS 10 \`edit_file\` chirurgicaux successifs** sur la même page — c'est inefficace et tu perds des éléments en route. Un rewrite = une preview qui matche.
- Pour une reproduction, vise d'abord la STRUCTURE EXACTE de la référence : mêmes zones, mêmes proportions, mêmes alignements, mêmes effets lumineux. N'ajoute pas de nouvelles sections si elles ne sont pas visibles dans la référence.
- Après le \`write_file\`, \`qa_reference_code\` n'est PLUS suffisant : il juge seulement le code. Pour une image de référence, appelle OBLIGATOIREMENT \`capture_current_preview\`, puis \`qa_reference_render\` avec les images de référence + la capture réelle. Si \`capture_current_preview\` retourne \`ok:false\` (preview/port indisponible), NE lance PAS \`qa_reference_render\` avec une image vide : diagnostique avec \`run_command\`/relance le dev-server si possible, puis réessaie UNE fois. Si la capture reste impossible, réponds clairement que le code est écrit mais que la preview ne répond pas, sans bloquer le chat. Si le verdict est \`FIX\` ou \`REFAIRE\`, applique UNE correction structurelle majeure, puis relance \`capture_current_preview\` + \`qa_reference_render\` UNE SEULE fois. Après 2 QA rendu maximum, tu dois répondre avec le meilleur résultat obtenu : ne boucle jamais.
- Si \`qa_reference_code\` dit OK mais \`qa_reference_render\` dit FIX/REFAIRE, le verdict rendu réel gagne toujours. Le but n'est pas que le code semble bon, c'est que l'écran ressemble à l'image de départ.
- **Photos réalistes (montagne, astronaute, micro, portrait, produit, etc.)** : tu ne peux pas les générer toi-même, mais tu DOIS les inclure quand même via Unsplash. Utilise directement \`https://images.unsplash.com/photo-XXXX?w=800&q=80&auto=format&fit=crop\` (cherche un photo-id plausible pour le sujet) ou \`https://source.unsplash.com/800x600/?<mot-clé>\` (ex: \`/?mountain,lake\`, \`/?astronaut,space\`, \`/?microphone,studio\`). **NE DEMANDE JAMAIS à l'utilisateur de te fournir les URLs** — choisis-les toi-même. Si l'utilisateur n'aime pas, il te dira.
- INTERDIT : « je ne peux pas créer une image identique », « je ne peux pas reproduire pixel-perfect », « envoie-moi les URLs », « si tu me donnes leurs URLs ». Phrases bannies.
- Après le rewrite, résume en 2 lignes max ce que tu as fait. PAS de "prochaine étape = ...", l'utilisateur juge.
- Si vraiment aucune image n'est attachée au message, dis « je ne vois pas d'image » — sinon tu agis.

## GARDE-FOU COÛT / ANTI-BOUCLE
- Budget maximal par réponse : 14 appels outils au total, dont max 2 \`capture_current_preview\`, max 2 \`qa_reference_render\` et max 2 \`qa_self_render\`.
- Si tu atteins cette limite, ARRÊTE immédiatement et réponds en français simple avec ce qui a été fait + ce qui reste imparfait.
- Ne relance jamais plusieurs cycles QA pour chercher le pixel-perfect. Une correction majeure suffit.
- Si un outil échoue 2 fois, n'insiste pas : explique l'impossibilité au lieu de continuer à consommer.
- Si \`capture_current_preview\` reste indisponible ou retourne \`ok:false\`, considère que le code est écrit mais que la preview ne répond pas : ne relance pas de réflexion design, ne lance pas \`qa_reference_render\`, réponds clairement.

## ARRÊT OBLIGATOIRE
- Dès que tu as écrit/modifié un fichier OU reçu un résultat d'outil qui suffit à répondre, tu termines par un court message final.
- Interdit d'appeler un outil juste pour “continuer à réfléchir”. Ne diagnostique pas la preview si l'utilisateur demandait seulement ton avis et que le rendu est visible côté utilisateur.
- Si tu n'as rien à modifier, réponds simplement ce qui bloque ou ce que tu as constaté. Ne lance pas de nouvelle action.

## Anti-erreurs
- Si \`edit_file\` dit "search introuvable" ou "présent N×", relis le fichier et reprends avec un \`search\` unique.
- Pour ajouter une dep : \`run_command("npm install <pkg>")\`. Vite recharge tout seul.
- Pour vérifier un crash : \`run_command("tail -50 /tmp/vite.log")\` (si dispo) ou \`run_command("ls src")\`.
`;

const BodySchema = z.object({
  messages: z.array(z.any()),
  projectId: z.string().min(1).max(120).default("dev3-poc"),
  tier_auto: z.boolean().optional(),
  tier_forced: z.enum(["XS", "S", "M", "L", "XL", "auto"]).nullable().optional(),
});

const MAX_SERVER_RUN_MS = 270_000;

function getLastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user" || !Array.isArray(message.parts)) continue;
    const text = message.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

function userExplicitlyWantsCatalogTools(messages: UIMessage[]): boolean {
  const last = getLastUserText(messages).toLowerCase();
  const catalogWord = "(?:bloc|blocks|template|templates|catalogue|biblioth[eè]que)";
  const negative = new RegExp(`(?:n['’]?utilise pas|ne\\s+.+?\\s+pas|sans|pas de).{0,60}\\b${catalogWord}\\b`);
  if (negative.test(last)) return false;
  const positive = new RegExp(
    `(?:utilise|prends|sers-toi|base-toi|inspire-toi|cherche|ajoute|mets).{0,60}\\b${catalogWord}\\b|\\b${catalogWord}\\b.{0,60}(?:existant|catalogue|nexyra)`,
  );
  return positive.test(last);
}

function withTimeoutSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, timeoutMs);
  signal?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    },
  };
}

function getRequestSignal(request: Request): AbortSignal | undefined {
  try {
    return request.signal;
  } catch {
    return undefined;
  }
}

function sanitizeMessagesForModel(messages: UIMessage[]): UIMessage[] {
  return messages
    .slice(-10)
    .map((message) => {
      const parts = Array.isArray(message.parts)
        ? message.parts.filter((part) => {
            if (!part || typeof part !== "object") return false;
            const type = (part as { type?: unknown }).type;
            if (typeof type !== "string") return false;
            if (type === "reasoning" || type.startsWith("reasoning-")) return false;
            // Le modèle principal d'Elena peut être OpenRouter/DeepSeek/text-only.
            // On ne lui envoie donc JAMAIS de part image/fichier dans l'historique :
            // les images restent en URL texte et sont traitées par les outils vision
            // dédiés (reverse_engineer_reference / qa_*). Sinon le gateway plante
            // avec "unknown variant `image_url`, expected `text`" à chaque message
            // après une capture déjà envoyée.
            if (type !== "text" && !type.startsWith("tool-")) return false;
            if (!type.startsWith("tool-")) return true;
            const state = (part as { state?: unknown }).state;
            return state === "output-available" || state === "output-error";
          })
        : [];
      return { role: message.role, parts } as UIMessage;
    })
    .filter((message) => message.parts.length > 0);
}

// FIX bug capture/QA : on retire les gros base64 des outputs d'outil avant de
// renvoyer l'historique au modèle. Sinon le LLM tente de recopier ces strings
// dans les arguments de qa_reference_render / qa_self_render et les tronque
// → "Invalid input for tool". Le serveur garde la dernière capture et la
// réinjecte automatiquement, le modèle n'a plus à la passer.
function stripHeavyToolPayloads(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (!Array.isArray(m.parts)) return m;
    const parts = m.parts.map((part) => {
      const p = part as { type?: string; output?: Record<string, unknown> };
      if (typeof p.type !== "string" || !p.type.startsWith("tool-")) return part;
      if (!p.output || typeof p.output !== "object") return part;
      const cleaned: Record<string, unknown> = { ...p.output };
      for (const k of ["rendered_image_base64", "image_base64", "dataUrl", "data_url"]) {
        const v = cleaned[k];
        if (typeof v === "string" && v.length > 400) {
          cleaned[k] =
            "<capture stockée serveur — appelle qa_self_render / qa_reference_render SANS rendered_image_base64>";
        }
      }
      return { ...(part as object), output: cleaned } as typeof part;
    });
    return { ...m, parts } as UIMessage;
  });
}

function extractLastCaptureBase64(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i]?.parts;
    if (!Array.isArray(parts)) continue;
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j] as { type?: string; output?: { rendered_image_base64?: unknown } };
      if (
        p?.type === "tool-capture_current_preview" &&
        typeof p.output?.rendered_image_base64 === "string"
      ) {
        const v = p.output.rendered_image_base64;
        if (v.startsWith("data:image/") && v.length > 400) return v;
      }
    }
  }
  return null;
}

function extractReferenceImageUrls(messages: UIMessage[]): string[] {
  const IMG_RE =
    /(https?:\/\/[^\s)\]]+\.(?:png|jpe?g|webp|gif|avif)(?:\?[^\s)\]]*)?)|(https?:\/\/[^\s)\]]+\/storage\/v1\/object\/public\/chat-uploads\/[^\s)\]]+)/gi;
  const urls = new Set<string>();
  for (const m of messages) {
    if (m.role !== "user" || !Array.isArray(m.parts)) continue;
    for (const p of m.parts) {
      const pp = p as { type?: string; url?: unknown; text?: unknown };
      if (pp.type === "file" && typeof pp.url === "string" && pp.url.startsWith("http")) {
        urls.add(pp.url);
      }
      if (pp.type === "text" && typeof pp.text === "string") {
        const matches = pp.text.match(IMG_RE);
        if (matches) for (const u of matches) urls.add(u);
      }
    }
  }
  return Array.from(urls).slice(0, 6);
}

function normalizePath(p: string): string {
  const trimmed = p.trim();
  if (trimmed.startsWith("/home/user/app/")) return trimmed;
  if (trimmed.startsWith("/")) return `/home/user/app${trimmed}`;
  return `/home/user/app/${trimmed.replace(/^\.?\/?/, "")}`;
}

const ARTIFACT_BUCKET = "elena-artifacts";
const ARTIFACT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

async function uploadDownloadArtifact({
  supabaseAdmin,
  userId,
  filename,
  bytes,
  mimeType,
}: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<
  | {
      ok: true;
      url: string;
      download_url: string;
      public_url: string;
      storage_path: string;
      filename: string;
      bytes: number;
      mime_type: string;
      expires_at: string;
    }
  | { ok: false; error: string }
> {
  const path = `elena-artifacts/${userId}/${Date.now()}-${filename}`;
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType });
  const { error } = await supabaseAdmin.storage
    .from(ARTIFACT_BUCKET)
    .upload(path, blob, { contentType: mimeType, upsert: false });
  if (error) return { ok: false, error: `upload: ${error.message}` };
  const { data: publicData } = supabaseAdmin.storage.from(ARTIFACT_BUCKET).getPublicUrl(path);
  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from(ARTIFACT_BUCKET)
    .createSignedUrl(path, ARTIFACT_SIGNED_URL_TTL_SECONDS, { download: filename });
  if (signedError || !signedData?.signedUrl) {
    return { ok: false, error: `lien téléchargement: ${signedError?.message ?? "signature impossible"}` };
  }
  return {
    ok: true,
    url: signedData.signedUrl,
    download_url: signedData.signedUrl,
    public_url: publicData.publicUrl,
    storage_path: path,
    filename,
    bytes: bytes.length,
    mime_type: mimeType,
    expires_at: new Date(Date.now() + ARTIFACT_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

function chatTextResponse(text: string): Response {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: "start" });
      controller.enqueue({ type: "start-step" });
      controller.enqueue({ type: "text-start", id: "text-1" });
      controller.enqueue({ type: "text-delta", id: "text-1", delta: text });
      controller.enqueue({ type: "text-end", id: "text-1" });
      controller.enqueue({ type: "finish-step" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export const Route = createFileRoute("/api/elena-e2b")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid body", details: parsed.error.format() },
            { status: 400 },
          );
        }
        const { messages, projectId, tier_auto, tier_forced } = parsed.data;

        const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.slice(7);

        const supaUser = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsErr } = await supaUser.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = claims.claims.sub as string;

        // BYOK + routage utilisateur "Cerveau d'Elena" (Discussion → orchestrator)
        const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { resolveModelForUser } = await import("@/server/user-ai-routing.server");
        const { createProviderClient, createProviderModel, getUserProviderKey } = await import("@/server/llm-provider.server");

        // ─── Axe A : routage intelligent par intent ──────────────────────────
        // Classe le dernier message user. Si c'est du smalltalk/diagnostic court
        // (level=conversation), on bascule sur le modèle "trivial" du Cerveau au
        // lieu du modèle Discussion (≥10× moins cher sur ces messages).
        const lastUserText = (() => {
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i] as UIMessage;
            if (m.role !== "user") continue;
            const parts = Array.isArray(m.parts) ? m.parts : [];
            const txt = parts
              .filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join("\n")
              .trim();
            if (txt) return txt;
          }
          return "";
        })();
        let orchestratorTask: "orchestrator" | "trivial_edit" = "orchestrator";
        let intentLevel: string | undefined;
        let intentKind: string | undefined;
        try {
          const { classifyIntent } = await import("@/server/intent-classifier.server");
          // file_count approx : on compte les fichiers présents en mémoire client
          // si dispo ; sinon 50 (projet non-vide par défaut, évite le biais "design").
          const fileCount = 50;
          const lovableKey = process.env.LOVABLE_API_KEY ?? null;
          const cacheClient = {
            rpc: async (fn: string, args: Record<string, unknown>) =>
              await supaAdmin.rpc(fn as never, args as never),
            from: (t: string) => ({
              insert: async (row: Record<string, unknown>) =>
                await supaAdmin.from(t as never).insert(row as never),
            }),
          };
          const intent = await classifyIntent(lastUserText, fileCount, {
            lovableApiKey: lovableKey,
            cache: cacheClient,
          });
          intentLevel = intent.level;
          intentKind = intent.kind;
          if (intent.level === "conversation") {
            orchestratorTask = "trivial_edit";
          }
        } catch (e) {
          console.warn("[elena-e2b] intent classify skipped", e);
        }

        const routed = await resolveModelForUser(userId, orchestratorTask);
        const orchestratorProvider = routed.provider;
        const orchestratorModelName = routed.model.replace(/^openai\//, "");
        const providerKey = await getUserProviderKey(userId, orchestratorProvider);
        // openaiKey reste utile pour les outils vision/QA/image qui restent sur OpenAI.
        const openaiKey = orchestratorProvider === "openai"
          ? providerKey
          : await getUserProviderKey(userId, "openai");
        if (!providerKey) {
          return Response.json(
            {
              error:
                `Elena ne trouve pas la clé ${orchestratorProvider}. Va dans Réglages → Clés API et colle-la, ou choisis un autre modèle dans Cerveau d'Elena → Discussion.`,
            },
            { status: 412 },
          );
        }

        let llmClient = createProviderClient(orchestratorProvider, providerKey);
        const openai = openaiKey ? createOpenAI({ apiKey: openaiKey }) : createOpenAI({ apiKey: "missing" });
        let model = createProviderModel(orchestratorProvider, llmClient, orchestratorModelName);
        let activeProvider = orchestratorProvider;
        let activeModelName = orchestratorModelName;
        let selectedTier: "XS" | "S" | "M" | "L" | "XL" | null = null;

        // ============ Tiers d'intelligence (Cerveau d'Elena) ============
        // Override du provider/model par le tier détecté (XS→XL). Défaut: auto ON.
        try {
          const { classifyTier, TIER_MODELS } = await import(
            "@/server/elena-tier-classifier.server"
          );
          const tierAuto = tier_auto !== false;
          const tierForced = tier_forced && tier_forced !== "auto"
            ? (tier_forced as "XS" | "S" | "M" | "L" | "XL")
            : null;
          if (tierForced) {
            selectedTier = tierForced;
          } else if (tierAuto && intentKind !== "image" && intentKind !== "video") {
            const cls = await classifyTier(
              { message: lastUserText, attachmentsCount: 0, hasVision: false },
              openaiKey,
            );
            selectedTier = cls.tier;
          }
          if (selectedTier) {
            const spec = TIER_MODELS[selectedTier];
            if (spec.provider === "openai" || spec.provider === "deepseek" || spec.provider === "openrouter") {
              const tierProvider = spec.provider;
              const tierKey = await getUserProviderKey(userId, tierProvider);
              if (tierKey) {
                activeProvider = tierProvider;
                activeModelName = spec.model;
                llmClient = createProviderClient(tierProvider, tierKey);
                model = createProviderModel(tierProvider, llmClient, activeModelName);
              } else {
                console.warn(`[tier] clé ${tierProvider} manquante, fallback route standard`);
                selectedTier = null;
              }
            } else {
              selectedTier = null;
            }
          }
        } catch (e) {
          console.warn("[tier] classification échouée, fallback route standard", e);
        }

        console.log("[elena-e2b] orchestrator route", {
          provider: activeProvider,
          model: activeModelName,
          task: orchestratorTask,
          intent_kind: intentKind,
          intent_level: intentLevel,
          tier: selectedTier,
        });




        // S'assure que la sandbox existe avant l'agent, sans transformer un
        // démarrage/installation lente en HTTP 503 (sinon le chat affiche écran blanc).
        try {
          await ensureSandbox(userId, projectId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return chatTextResponse(`La sandbox Elena n'est pas disponible pour le moment : ${msg.slice(0, 700)}`);
        }

        void (async () => {
          try {
            const prepared = await scaffoldViteProject(userId, projectId);
            if (!prepared.installing) await startViteDev(userId, projectId);
          } catch (err) {
            console.warn("[elena-e2b] preview warmup ignored", err);
          }
        })();

        // Ne pas brancher request.signal ici : sur une réponse streamée, certains
        // navigateurs coupent le signal HTTP alors que les tools serveur sont encore
        // en train de travailler, ce qui laissait reverse_engineer_reference bloqué.
        const timedAbort = withTimeoutSignal(undefined, MAX_SERVER_RUN_MS);
        const allowCatalogTools = userExplicitlyWantsCatalogTools(messages as UIMessage[]);

        // FIX bug QA : on extrait UNE fois côté serveur les médias volumineux
        // pour que les outils QA n'aient pas à les recevoir en argument (le LLM
        // les tronquait → "Invalid input for tool qa_reference_render").
        const referenceImageUrlsRef = {
          current: extractReferenceImageUrls(messages as UIMessage[]),
        };
        const lastCaptureBase64Ref = {
          current: extractLastCaptureBase64(messages as UIMessage[]) as string | null,
        };

        const coreTools = {
          delegate_designer: tool({
            description:
              "Délègue à la Designer une spec visuelle premium avant de coder une UI. Obligatoire pour landing/page/hero/site/app/composant, même si l'utilisateur donne carte blanche.",
            inputSchema: z.object({
              brief: z.string().min(3).max(4000),
            }),
            execute: async ({ brief }) => {
              const r = await runDesigner(brief, openaiKey, userId, timedAbort.signal);
              return { ok: true, spec: r.text, model: r.model };
            },
          }),
          reverse_engineer_reference: tool({
            description:
              "Analyse une maquette/image de référence AVANT de coder. Retourne un brief visuel ultra concret : grille, positions, proportions, couleurs, typo, composants, images, espacements et checklist de reconstruction. Obligatoire dès qu'une image est jointe.",
            inputSchema: z.object({
              image_urls: z.array(z.string().url()).min(1).max(6),
              user_request: z.string().min(3),
            }),
            execute: async ({ image_urls, user_request }) => {
              // 1) Cerveau d'Elena → Vision (provider/model choisi par l'utilisateur)
              const cerveau = await resolveUserLLM(userId, "qa_visual");
              if (cerveau.ok) {
                try {
                  const r = await reverseEngineerWithModel({
                    model: cerveau.resolved.languageModel,
                    modelLabel: cerveau.resolved.fullId,
                    imageUrls: image_urls,
                    userRequest: user_request,
                    abortSignal: timedAbort.signal,
                  });
                  return { ok: true, contract: r.text, image_urls, model: r.model };
                } catch (e) {
                  console.warn("[reverse_engineer] Cerveau model failed, fallback:", e);
                }
              } else {
                console.log("[reverse_engineer] Cerveau non utilisable:", cerveau.reason);
              }
              // 2) Fallback Anthropic direct si clé dédiée présente
              const claudeKey = await getUserAnthropicKey(userId);
              if (claudeKey) {
                try {
                  const r = await reverseEngineerWithClaude({
                    apiKey: claudeKey,
                    imageUrls: image_urls,
                    userRequest: user_request,
                    abortSignal: timedAbort.signal,
                  });
                  return { ok: true, contract: r.text, image_urls, model: r.model };
                } catch (e) {
                  console.warn("[reverse_engineer] Claude failed, fallback gpt-5.2:", e);
                }
              }
              try {
                const fetched = await fetchImagesAsBuffers(image_urls);
                const analysis = await generateText({
                  model: openai("gpt-5.2"),
                  abortSignal: timedAbort.signal,
                  messages: [
                    {
                      role: "user",
                      content: [
                        {
                          type: "text",
                          text: `Tu es un expert reverse-engineering UI. Analyse ces images pour aider Elena à recréer la page au plus proche, sans te contenter d'une inspiration.\n\nDemande utilisateur: ${user_request}\n\nRetourne en français un contrat de reconstruction structuré avec :\n1. Layout global: dimensions relatives, grille, colonnes, ordre vertical.\n2. Header/nav: positions, tailles, textes, CTA.\n3. Hero: placement exact des blocs gauche/centre/droite, taille du H1, sous-titre, bouton.\n4. Cards/sections visibles: nombre, largeur relative, icônes, textes, décorations.\n5. Palette: couleurs approximatives hex, gradients, glow, ombres, bordures.\n6. Typo: style, poids, hiérarchie.\n7. Images/médias à recréer ou remplacer intelligemment.\n8. Checklist "à ne pas oublier" avec tous les éléments visibles.\nSois concret et actionnable pour écrire du React/Tailwind.`,
                        },
                        ...fetched.map((f) => ({
                          type: "image" as const,
                          image: f.data,
                          mediaType: f.mediaType,
                        })),
                      ],
                    },
                  ],
                });
                return { ok: true, contract: analysis.text, image_urls, model: "openai/gpt-5.2" };
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, error: `Analyse image impossible: ${msg}`, image_urls };
              }
            },
          }),
          qa_reference_code: tool({
            description:
              "Contrôle qualité obligatoire après write_file quand une image de référence est utilisée. Compare les images + le contrat avec le code écrit et renvoie OK/FIX/REFAIRE avec corrections concrètes.",
            inputSchema: z.object({
              image_urls: z.array(z.string().url()).min(1).max(6),
              user_request: z.string().min(3),
              contract: z.string().min(20),
              code_context: z.string().min(80).max(80_000),
            }),
            execute: async ({ image_urls, user_request, contract, code_context }) => {
              // 1) Cerveau d'Elena → Vision
              const cerveau = await resolveUserLLM(userId, "qa_visual");
              if (cerveau.ok) {
                try {
                  const qa = await qaReferenceCodeWithModel({
                    model: cerveau.resolved.languageModel,
                    modelLabel: cerveau.resolved.fullId,
                    imageUrls: image_urls,
                    userRequest: user_request,
                    contract,
                    codeContext: code_context,
                    abortSignal: timedAbort.signal,
                  });
                  return {
                    ok: true,
                    verdict: qa.verdict,
                    critique: qa.text,
                    image_urls,
                    model: qa.model,
                  };
                } catch (e) {
                  console.warn("[qa_reference_code] Cerveau model failed, fallback:", e);
                }
              }
              const claudeKey = await getUserAnthropicKey(userId);
              if (claudeKey) {
                try {
                  const qa = await qaReferenceCodeWithClaude({
                    apiKey: claudeKey,
                    imageUrls: image_urls,
                    userRequest: user_request,
                    contract,
                    codeContext: code_context,
                    abortSignal: timedAbort.signal,
                  });
                  return {
                    ok: true,
                    verdict: qa.verdict,
                    critique: qa.text,
                    image_urls,
                    model: qa.model,
                  };
                } catch (e) {
                  console.warn("[qa_reference_code] Claude failed, fallback gpt-5.2:", e);
                }
              }
              try {
                const fetchedQa = await fetchImagesAsBuffers(image_urls);
                const qa = await generateText({
                  model: openai("gpt-5.2"),
                  abortSignal: timedAbort.signal,
                  messages: [
                    {
                      role: "user",
                      content: [
                        {
                          type: "text",
                          text: `Tu es le contrôleur qualité visuel d'Elena. Compare les images de référence avec ce contrat et ce code React/Tailwind. Sois sévère : si le code ne peut produire qu'une inspiration et pas la même structure visuelle, verdict REFAIRE. Les glows/voiles lumineux et les demandes supprimer/modifier sont bloquants.\n\nDemande utilisateur:\n${user_request}\n\nContrat:\n${contract.slice(0, 12000)}\n\nCode écrit:\n${code_context.slice(0, 30000)}\n\nRéponds avec:\n## Verdict\nOK ou FIX ou REFAIRE\n\n## Écarts bloquants\n- ...\n\n## Corrections à appliquer maintenant\n1. ...`,
                        },
                        ...fetchedQa.map((f) => ({
                          type: "image" as const,
                          image: f.data,
                          mediaType: f.mediaType,
                        })),
                      ],
                    },
                  ],
                });
                const verdictMatch = qa.text.match(/##\s*Verdict\s*\n\s*`?(OK|FIX|REFAIRE)`?/i);
                const verdict = (verdictMatch?.[1]?.toUpperCase() ?? "FIX") as
                  | "OK"
                  | "FIX"
                  | "REFAIRE";
                return { ok: true, verdict, critique: qa.text, image_urls, model: "openai/gpt-5.2" };
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, error: `Contrôle image impossible: ${msg}`, image_urls };
              }
            },
          }),
          capture_current_preview: tool({
            description:
              "Capture côté navigateur le rendu réel actuel de la preview après HMR. Obligatoire après write_file/edit_file avant tout QA de reproduction image.",
            inputSchema: z.object({
              reason: z.string().min(3).describe("Pourquoi tu captures la preview maintenant."),
              timeout_ms: z.number().int().min(2000).max(15000).default(8000),
              max_width: z.number().int().min(640).max(1600).default(1280),
            }),
          }),
          restart_preview: tool({
            description:
              "Relance/répare la preview Vite de la sandbox. À appeler quand l'utilisateur dit qu'il ne voit pas le projet, que le reload/sandbox est cassé, ou que la preview affiche exit status 1.",
            inputSchema: z.object({
              reason: z.string().min(3).max(300),
            }),
            execute: async () => {
              try {
                await ensureSandbox(userId, projectId);
                const prepared = await scaffoldViteProject(userId, projectId);
                if (prepared.readOnly) {
                  return {
                    ok: false,
                    mode: "exploration" as const,
                    error: `Projet importé en mode exploration : ${prepared.depsCount ?? "nombreuses"} dépendances détectées. Les fichiers sont disponibles, mais la preview complète est volontairement non lancée pour éviter un crash mémoire de la sandbox.`,
                  };
                }
                await startViteDev(userId, projectId);
                const port = await waitForPortOpen(userId, projectId, 5173);
                return { ok: true, previewUrl: port.previewUrl, message: "Preview relancée" };
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, error: `restart_preview a échoué : ${msg.slice(0, 600)}` };
              }
            },
          }),
          qa_reference_render: tool({
            description:
              "QA final anti-approximation : compare les images de référence avec une capture réelle du rendu Elena. Ce verdict prime sur qa_reference_code.",
            inputSchema: z.object({
              reference_image_urls: z
                .array(z.string().min(8))
                .max(6)
                .optional()
                .describe(
                  "Optionnel — si omis, le serveur réutilise automatiquement les images jointes par l'utilisateur dans ce tour. NE RECOPIE PAS les URLs longues.",
                ),
              rendered_image_base64: z
                .string()
                .optional()
                .describe(
                  "Optionnel — laisse vide : le serveur réutilise automatiquement la dernière capture preview. NE recopie JAMAIS le base64.",
                ),
              user_request: z.string().min(3),
              contract: z.string().min(20),
              snapshot_summary: z.string().max(4000).optional(),
            }),
            execute: async ({
              reference_image_urls,
              rendered_image_base64,
              user_request,
              contract,
              snapshot_summary,
            }) => {
              // Résolution serveur : si le modèle n'a pas (ou a tronqué) les médias,
              // on retombe sur la dernière capture + les images jointes par l'utilisateur.
              const resolvedRefs =
                Array.isArray(reference_image_urls) &&
                reference_image_urls.length > 0 &&
                reference_image_urls.every((u) => /^https?:\/\//.test(u))
                  ? reference_image_urls
                  : referenceImageUrlsRef.current;
              const resolvedRender =
                typeof rendered_image_base64 === "string" &&
                rendered_image_base64.startsWith("data:image/") &&
                rendered_image_base64.length > 400
                  ? rendered_image_base64
                  : lastCaptureBase64Ref.current;
              if (!resolvedRefs || resolvedRefs.length === 0) {
                return {
                  ok: false,
                  error:
                    "Aucune image de référence disponible. Demande à l'utilisateur de rejoindre l'image puis recommence.",
                };
              }
              if (!resolvedRender) {
                return {
                  ok: false,
                  error:
                    "Pas de capture preview disponible. Appelle d'abord capture_current_preview puis relance.",
                };
              }
              const reference_image_urls_final = resolvedRefs;
              const rendered_image_base64_final = resolvedRender;
              const cerveau = await resolveUserLLM(userId, "qa_visual");
              if (cerveau.ok) {
                try {
                  const qa = await qaReferenceRenderWithModel({
                    model: cerveau.resolved.languageModel,
                    modelLabel: cerveau.resolved.fullId,
                    referenceImageUrls: reference_image_urls_final,
                    renderedImageBase64: rendered_image_base64_final,
                    userRequest: user_request,
                    contract,
                    abortSignal: timedAbort.signal,
                  });
                  return { ok: true, verdict: qa.verdict, critique: qa.text, model: qa.model };
                } catch (e) {
                  console.warn("[qa_reference_render] Cerveau model failed, fallback:", e);
                }
              }
              const claudeKey = await getUserAnthropicKey(userId);
              if (claudeKey) {
                try {
                  const qa = await qaReferenceRenderWithClaude({
                    apiKey: claudeKey,
                    referenceImageUrls: reference_image_urls_final,
                    renderedImageBase64: rendered_image_base64_final,
                    userRequest: user_request,
                    contract,
                    abortSignal: timedAbort.signal,
                  });
                  return { ok: true, verdict: qa.verdict, critique: qa.text, model: qa.model };
                } catch (e) {
                  console.warn("[qa_reference_render] Claude failed, fallback gpt-5.2:", e);
                }
              }
              try {
                const fetchedRender = await fetchImagesAsBuffers(reference_image_urls_final);
                const qa = await generateText({
                  model: openai("gpt-5.2"),
                  abortSignal: timedAbort.signal,
                  messages: [
                    {
                      role: "user",
                      content: [
                        {
                          type: "text",
                          text: `Tu es QA visuel final. Compare les images de référence avec la DERNIÈRE image qui est le rendu réel Elena. Sois sévère: si la structure/proportions/glows ne correspondent pas, verdict REFAIRE.\n\nDemande utilisateur:\n${user_request}\n\nContrat:\n${contract.slice(0, 12000)}\n\nSnapshot DOM:\n${snapshot_summary ?? ""}\n\nFormat:\n## Verdict\nOK ou FIX ou REFAIRE\n\n## Écarts visibles majeurs\n- ...\n\n## Corrections à appliquer maintenant\n1. ...`,
                        },
                        ...fetchedRender.map((f) => ({
                          type: "image" as const,
                          image: f.data,
                          mediaType: f.mediaType,
                        })),
                        { type: "image" as const, image: rendered_image_base64_final },
                      ],
                    },
                  ],
                });
                const verdictMatch = qa.text.match(/##\s*Verdict\s*\n\s*`?(OK|FIX|REFAIRE)`?/i);
                const verdict = (verdictMatch?.[1]?.toUpperCase() ?? "FIX") as
                  | "OK"
                  | "FIX"
                  | "REFAIRE";
                return { ok: true, verdict, critique: qa.text, model: "openai/gpt-5.2" };
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, error: `Contrôle rendu impossible: ${msg}`, reference_image_urls };
              }
            },
          }),
          qa_self_render: tool({
            description:
              "AUTO-CRITIQUE visuelle (sans image de référence). Compare ta propre capture preview avec ce que tu as voulu faire (brief utilisateur + intention). Verdict OK = tu réponds. FIX = tu corriges les écarts puis tu peux re-capturer + re-qa UNE fois. Obligatoire après chaque création/refonte importante.",
            inputSchema: z.object({
              user_request: z.string().min(3),
              intent_summary: z
                .string()
                .min(20)
                .max(2000)
                .describe(
                  "Ce que tu as voulu produire : secteur, palette/typo choisies, sections, ambiance. 3-8 lignes.",
                ),
              rendered_image_base64: z
                .string()
                .optional()
                .describe(
                  "Optionnel — laisse vide : le serveur réutilise automatiquement la dernière capture preview.",
                ),
              snapshot_summary: z.string().max(4000).optional(),
            }),
            execute: async ({
              user_request,
              intent_summary,
              rendered_image_base64,
              snapshot_summary,
            }) => {
              const rendered_image_base64_final =
                typeof rendered_image_base64 === "string" &&
                rendered_image_base64.startsWith("data:image/") &&
                rendered_image_base64.length > 400
                  ? rendered_image_base64
                  : lastCaptureBase64Ref.current;
              if (!rendered_image_base64_final) {
                return {
                  ok: false,
                  verdict: "OK" as const,
                  critique:
                    "Pas de capture preview disponible. Appelle d'abord capture_current_preview puis relance qa_self_render.",
                };
              }
              try {
                const ctrl = new AbortController();
                const onAbort = () => ctrl.abort();
                timedAbort.signal.addEventListener("abort", onAbort, { once: true });
                const localTimeout = setTimeout(() => ctrl.abort(), 60_000);
                try {
                  const qa = await generateText({
                    model: openai("gpt-5.2"),
                    abortSignal: ctrl.signal,
                    messages: [
                      {
                        role: "user",
                        content: [
                          {
                            type: "text",
                            text: `Tu es QA visuel senior (niveau Linear/Vercel/Lovable). Tu juges la capture du rendu actuel d'Elena vs son intention déclarée et la demande utilisateur. Sois sévère mais constructif.\n\nDemande utilisateur:\n${user_request}\n\nIntention déclarée par Elena:\n${intent_summary}\n\nSnapshot DOM (optionnel):\n${snapshot_summary ?? ""}\n\nGrille de jugement (chaque point = potentiel FIX):\n1. Hiérarchie visuelle : H1 dominant, sous-titre, CTA évident ?\n2. Cohérence palette/typo avec l'intention déclarée et le secteur ?\n3. Densité/espacement : pas trop vide, pas trop serré, marges premium ?\n4. Images : vraies (pas de div gris/placeholder/lorem) et bien intégrées ?\n5. Sections : nombre suffisant pour une vraie landing (hero + 3-5 sections min) ?\n6. Détails premium : ombres, micro-animations, états hover suggérés ?\n7. Mobile : layout tient à vue d'œil ?\n\nFormat de réponse OBLIGATOIRE:\n## Verdict\nOK ou FIX\n\n## Points forts\n- ...\n\n## Écarts à corriger (uniquement si FIX)\n1. [Écart concret] → correction concrète à appliquer en edit_file\n2. ...\n\nRègles: si tout est niveau Lovable ou mieux → OK. Si écart majeur (placeholder, palette ratée, structure pauvre, typo générique) → FIX avec corrections actionnables.`,
                          },
                          { type: "image" as const, image: rendered_image_base64_final },
                        ],
                      },
                    ],
                  });
                  const verdictMatch = qa.text.match(/##\s*Verdict\s*\n\s*`?(OK|FIX)`?/i);
                  const verdict = (verdictMatch?.[1]?.toUpperCase() ?? "FIX") as "OK" | "FIX";
                  return { ok: true, verdict, critique: qa.text, model: "openai/gpt-5.2" };
                } finally {
                  clearTimeout(localTimeout);
                  timedAbort.signal.removeEventListener("abort", onAbort);
                }
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.warn("[qa_self_render] échec, on livre sans QA :", msg);
                return {
                  ok: false,
                  verdict: "OK" as const,
                  critique: `QA visuel indisponible (${msg}). Réponds à l'utilisateur sans relancer de QA.`,
                  error: msg,
                };
              }
            },
          }),
          ls: tool({
            description:
              "Liste les fichiers du projet (relatif à /home/user/app). Sans argument = arborescence complète (sans node_modules).",
            inputSchema: z.object({
              path: z.string().optional().describe("Sous-dossier optionnel (ex: 'src')."),
            }),
            execute: async ({ path }) => {
              const r = await listFiles(userId, projectId, path);
              return { files: r.files, count: r.files.length };
            },
          }),
          read_file: tool({
            description: "Lit le contenu complet d'un fichier.",
            inputSchema: z.object({
              path: z.string().describe("Chemin du fichier (ex: 'src/App.tsx')."),
            }),
            execute: async ({ path }) => {
              const abs = normalizePath(path);
              const contents = await readFile(userId, projectId, abs);
              return { path: abs, contents, bytes: contents.length };
            },
          }),
          write_file: tool({
            description:
              "Crée ou remplace COMPLÈTEMENT un fichier. Les dossiers parents sont créés automatiquement. HMR auto.",
            inputSchema: z.object({
              path: z.string().describe("Chemin du fichier (ex: 'src/components/Hero.tsx')."),
              contents: z.string().max(2_000_000).describe("Contenu complet du fichier."),
            }),
            execute: async ({ path, contents }) => {
              const abs = normalizePath(path);
              await writeFile(userId, projectId, abs, contents);
              return { ok: true, path: abs, bytes: contents.length };
            },
          }),
          edit_file: tool({
            description:
              "Édition chirurgicale par search/replace. `search` doit être unique dans le fichier. Préférer à write_file pour modifier l'existant.",
            inputSchema: z.object({
              path: z.string(),
              search: z.string().min(1),
              replace: z.string(),
            }),
            execute: async ({ path, search, replace }) => {
              const abs = normalizePath(path);
              try {
                return await editFile(userId, projectId, abs, search, replace);
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                // Erreurs récupérables (search introuvable / non-unique) → renvoyées comme
                // résultat d'outil pour qu'Elena puisse retry au lieu de couper le stream.
                return {
                  ok: false as const,
                  path: abs,
                  error: message,
                  hint: "Relis le fichier avec read_file puis reprends edit_file avec un `search` unique (ajoute du contexte autour pour le rendre unique). Ne bascule pas sur write_file.",
                };
              }
            },
          }),
          run_command: tool({
            description:
              "Exécute une commande shell dans /home/user/app pour inspecter les fichiers/logs. Ne jamais utiliser pour tuer/lancer Vite (`pkill`, `npm run dev`, `npx vite`) : utiliser restart_preview. Timeout par défaut 2 min, configurable jusqu'à 10 min via `timeoutSec`. Pas d'interactif.",
            inputSchema: z.object({
              cmd: z.string().min(1).max(500),
              timeoutSec: z.number().int().min(5).max(600).optional(),
            }),
            execute: async ({ cmd, timeoutSec }) => {
              const r = await runCommand(userId, projectId, cmd, {
                cwd: "/home/user/app",
                timeoutMs: (timeoutSec ?? 120) * 1000,
              });
              return {
                exitCode: r.exitCode,
                stdout: r.stdout.slice(0, 8_000),
                stderr: r.stderr.slice(0, 4_000),
              };
            },
          }),
          unzip_archive: tool({
            description:
              "Décompresse une archive .zip présente dans la sandbox. `source` = chemin du .zip (ex: '/tmp/import.zip' ou 'archive.zip' relatif à /home/user/app). `dest` = dossier de destination (créé si absent, défaut: dossier du zip). Utilise `unzip` puis fallback python3 zipfile. Renvoie la liste des 30 premières entrées extraites.",
            inputSchema: z.object({
              source: z.string().min(1).max(500),
              dest: z.string().min(1).max(500).optional(),
              overwrite: z.boolean().optional().default(true),
            }),
            execute: async ({ source, dest, overwrite }) => {
              const src = source.startsWith("/") ? source : `/home/user/app/${source.replace(/^\.?\/+/, "")}`;
              const destDir = dest
                ? (dest.startsWith("/") ? dest : `/home/user/app/${dest.replace(/^\.?\/+/, "")}`)
                : src.replace(/\.zip$/i, "") || `${src}-extracted`;
              const owFlag = overwrite === false ? "-n" : "-o";
              const script = `
set -e
test -f ${JSON.stringify(src)} || { echo "ZIP introuvable: ${src}"; exit 2; }
mkdir -p ${JSON.stringify(destDir)}
( command -v unzip >/dev/null && unzip -q ${owFlag} ${JSON.stringify(src)} -d ${JSON.stringify(destDir)} ) \\
  || python3 -m zipfile -e ${JSON.stringify(src)} ${JSON.stringify(destDir)}
echo "---ENTRIES---"
find ${JSON.stringify(destDir)} -maxdepth 3 -mindepth 1 | head -n 30
echo "---COUNT---"
find ${JSON.stringify(destDir)} -type f | wc -l
`;
              const r = await runCommand(userId, projectId, script, { cwd: "/home/user/app", timeoutMs: 180_000 });
              if (r.exitCode !== 0) {
                return {
                  ok: false,
                  error: `Décompression échouée (code ${r.exitCode}): ${(r.stderr || r.stdout).slice(-400)}`,
                };
              }
              const out = r.stdout || "";
              const entries = out.split("---ENTRIES---")[1]?.split("---COUNT---")[0]?.trim().split("\n").filter(Boolean) ?? [];
              const count = Number.parseInt(out.split("---COUNT---")[1]?.trim() || "0", 10) || 0;
              return { ok: true, source: src, dest: destDir, fileCount: count, entries };
            },
          }),
          memory_save: tool({
            description:
              "Sauvegarde UNE règle persistante pour ce projet (mémoire mem://). Utilise dès que l'utilisateur exprime une préférence, un refus, une décision design ou une contrainte métier qu'il ne faudra JAMAIS violer ni reproposer. Garde body court (1-3 phrases).",
            inputSchema: z.object({
              kind: z
                .enum(["core", "design", "constraint", "preference", "feature", "reference"])
                .default("preference"),
              title: z.string().min(2).max(200),
              body: z.string().min(2).max(2000),
              pinned: z.boolean().optional(),
            }),
            execute: async ({ kind, title, body, pinned }) => {
              const { data: proj } = await supaAdmin
                .from("projects")
                .select("org_id")
                .eq("id", projectId)
                .maybeSingle();
              if (!proj?.org_id) {
                // Sandbox éphémère (ex: dev3-poc) : pas de persistance possible
                // mais on évite de faire planter Elena.
                return { ok: true, skipped: true, reason: "Sandbox éphémère — mémoire non persistée." };
              }
              const { data, error } = await supaAdmin
                .from("project_memory")
                .insert({
                  project_id: projectId,
                  org_id: proj.org_id,
                  owner_id: userId,
                  kind,
                  title,
                  body,
                  source: "agent_auto",
                  is_pinned: pinned === true,
                })
                .select("id")
                .single();
              if (error) return { ok: false, error: error.message };
              return { ok: true, id: data.id, kind, title };
            },
          }),
          memory_list: tool({
            description:
              "Liste les règles mémoire du projet (filtrable par kind). À utiliser AVANT une décision design/produit pour vérifier qu'aucune règle n'est en conflit.",
            inputSchema: z.object({
              kind: z
                .enum(["core", "design", "constraint", "preference", "feature", "reference"])
                .optional(),
            }),
            execute: async ({ kind }) => {
              let q = supaAdmin
                .from("project_memory")
                .select("id, kind, title, body, is_pinned")
                .eq("project_id", projectId)
                .is("archived_at", null)
                .order("is_pinned", { ascending: false })
                .order("updated_at", { ascending: false })
                .limit(50);
              if (kind) q = q.eq("kind", kind);
              const { data, error } = await q;
              if (error) return { ok: false, error: error.message };
              return { ok: true, count: (data ?? []).length, rules: data ?? [] };
            },
          }),
          read_coach_rules: tool({
            description:
              "Lit les règles utilisateur du Coach (/elena-coach). À utiliser quand l'utilisateur te demande explicitement de regarder, analyser ou conseiller sur ses règles Coach (ex: 'Elena, regarde la catégorie workflow et dis-moi ce qui manque', 'qu'est-ce que je peux améliorer dans ma règle X ?'). Retourne titre, catégorie, étapes, flag fondamentale.",
            inputSchema: z.object({
              category: z
                .enum(["design", "code", "comportement", "communication", "workflow", "general"])
                .optional()
                .describe("Filtrer par catégorie. Omettre pour tout lister."),
            }),
            execute: async ({ category }) => {
              let q = supaAdmin
                .from("elena_lessons")
                .select("id, title, content, category, steps, is_fundamental, is_active")
                .eq("owner_id", userId)
                .order("is_fundamental", { ascending: false })
                .order("category", { ascending: true });
              if (category) q = q.eq("category", category);
              const { data, error } = await q.limit(100);
              if (error) return { ok: false, error: error.message };
              return {
                ok: true,
                count: (data ?? []).length,
                rules: data ?? [],
                note: "Pour proposer une modification à l'utilisateur, indique précisément : (1) quelle règle modifier, (2) quelle étape ajouter/modifier/supprimer, (3) le texte exact à coller dans /elena-coach. Tu ne peux PAS modifier toi-même — c'est l'utilisateur qui applique.",
              };
            },
          }),
          image_generate: tool({
            description:
              "Génère une image (hero, illustration, avatar) via OpenAI gpt-image-1 (clé BYOK utilisateur) et écrit le PNG binaire dans `public/generated/<filename>.png`. Retourne l'URL publique à utiliser directement comme `<img src=\"/generated/<filename>.png\" />` (PAS d'import ES6). OBLIGATOIRE pour tout visuel — jamais de <div> gris ni de placeholder.",
            inputSchema: z.object({
              prompt: z
                .string()
                .min(10)
                .max(2000)
                .describe(
                  "Description détaillée EN ANGLAIS (style, lumière, composition, mood). Plus c'est précis, mieux c'est.",
                ),
              filename: z
                .string()
                .min(2)
                .max(60)
                .regex(/^[a-z0-9-]+$/, "kebab-case sans extension")
                .describe("Nom kebab-case sans extension (ex: 'hero-kine', 'avatar-marie')."),
              aspect_ratio: z
                .enum(["1:1", "16:9", "9:16"])
                .optional()
                .describe("Ratio de l'image. Défaut 16:9 pour hero, 1:1 pour avatar."),
            }),
            execute: async ({ prompt, filename, aspect_ratio }) => {
              const size =
                aspect_ratio === "1:1"
                  ? "1024x1024"
                  : aspect_ratio === "9:16"
                    ? "1024x1536"
                    : "1536x1024";
              try {
                const res = await fetch("https://api.openai.com/v1/images/generations", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${openaiKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "gpt-image-1",
                    prompt,
                    n: 1,
                    size,
                    quality: "high",
                  }),
                  signal: timedAbort.signal,
                });
                if (!res.ok) {
                  const txt = await res.text().catch(() => "");
                  return {
                    ok: false,
                    error: `image_generate openai ${res.status}: ${txt.slice(0, 240)}`,
                  };
                }
                const json = (await res.json()) as {
                  data?: Array<{ b64_json?: string }>;
                };
                const b64 = json.data?.[0]?.b64_json ?? null;
                if (!b64) {
                  return { ok: false, error: "Aucune image retournée par OpenAI." };
                }
                // On écrit le PNG en binaire dans public/generated/ — servi tel quel
                // par Vite, ZÉRO passage par esbuild (évite crash EPIPE sur gros assets).
                const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                const relPath = `public/generated/${filename}.png`;
                const absPath = normalizePath(relPath);
                const { writeFileBinary } = await import("@/server/e2b-sandbox.server");
                await writeFileBinary(userId, projectId, absPath, bytes);
                const publicUrl = `/generated/${filename}.png`;
                return {
                  ok: true,
                  path: relPath,
                  filename,
                  public_url: publicUrl,
                  usage_example: `<img src="${publicUrl}" alt="..." className="w-full h-auto" />`,
                  note: "Image servie depuis public/ (pas d'import ES6 nécessaire). Utilise directement src=\"" + publicUrl + "\".",
                };
              } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : String(e) };
              }
            },
          }),
          video_generate: tool({
            description:
              "Lance une vidéo courte (5-10s) via fal.ai. ATTENTION coût réel : appelle cet outil UNE SEULE FOIS par vidéo. Il renvoie request_id/status processing. Ne relance JAMAIS video_generate si c'est long : utilise ensuite video_check avec le request_id. Deux modes : text-to-video et image-to-video (fournis image_url).",
            inputSchema: z.object({
              prompt: z
                .string()
                .min(5)
                .max(2000)
                .describe(
                  "Description EN ANGLAIS du mouvement/scène souhaité (ex: 'gentle breeze on trees, water rippling softly, slow camera push-in, golden hour'). Précis sur le mouvement, pas juste la scène.",
                ),
              filename: z
                .string()
                .min(2)
                .max(60)
                .regex(/^[a-z0-9-]+$/, "kebab-case sans extension")
                .describe("Nom kebab-case sans extension (ex: 'hero-loop', 'toulouse-cinemagraph')."),
              model: z
                .enum([
                  "fal-ai/veo3",
                  "fal-ai/kling-video/v2/master/text-to-video",
                  "fal-ai/kling-video/v2/master/image-to-video",
                  "fal-ai/luma-dream-machine",
                ])
                .optional()
                .describe(
                  "Par défaut Kling text-to-video. Auto-switch sur Kling i2v si `image_url` est fourni. Veo3 = top qualité (cher), Luma = stylisé.",
                ),
              aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).optional().describe("Défaut 16:9."),
              duration_s: z
                .union([z.literal(5), z.literal(8), z.literal(10)])
                .optional()
                .describe("Défaut 5s."),
              image_url: z
                .string()
                .url()
                .optional()
                .describe(
                  "URL publique de l'image source pour image-to-video / cinemagraph. Indispensable pour animer une photo existante.",
                ),
            }),
            execute: async ({ prompt, filename, model, aspect_ratio, duration_s, image_url }) => {
              const falKey = process.env.FAL_KEY;
              if (!falKey) {
                return {
                  ok: false,
                  error:
                    "FAL_KEY non configurée. L'utilisateur doit aller dans Paramètres → Clés API → 🎬 Vidéo → fal.ai et coller sa clé (https://fal.ai/dashboard/keys).",
                };
              }
              const chosenModel =
                image_url && !model
                  ? ("fal-ai/kling-video/v2/master/image-to-video" as const)
                  : (model ?? ("fal-ai/kling-video/v2/master/text-to-video" as const));
              try {
                const { generateFalVideo } = await import("@/server/video-generation.server");
                const result = await generateFalVideo(
                  {
                    prompt,
                    model: chosenModel,
                    aspect_ratio: aspect_ratio ?? "16:9",
                    duration_s: duration_s ?? 5,
                    image_url,
                  },
                  falKey,
                );
                if (!result.ok) return { ok: false, error: result.error };
                if (result.status === "processing") {
                  return {
                    ok: true,
                    status: result.status,
                    request_id: result.request_id,
                    status_url: result.status_url,
                    response_url: result.response_url,
                    model: result.model,
                    duration_s: result.duration_s,
                    filename,
                    next_step: `Attends 60-90 secondes puis appelle video_check avec request_id=${result.request_id}, status_url=${result.status_url}, response_url=${result.response_url}, filename=${filename}. Ne relance pas video_generate.`,
                  };
                }
                const dl = await fetch(result.video_url);
                if (!dl.ok) {
                  return {
                    ok: true,
                    video_url: result.video_url,
                    model: result.model,
                    note: "MP4 hébergé chez fal.ai (téléchargement local échoué). Utilise l'URL directe.",
                  };
                }
                const buf = new Uint8Array(await dl.arrayBuffer());
                const relPath = `public/generated/${filename}.mp4`;
                const absPath = normalizePath(relPath);
                const { writeFileBinary } = await import("@/server/e2b-sandbox.server");
                await writeFileBinary(userId, projectId, absPath, buf);
                const publicUrl = `/generated/${filename}.mp4`;
                return {
                  ok: true,
                  path: relPath,
                  filename,
                  public_url: publicUrl,
                  model: result.model,
                  duration_s: result.duration_s,
                  usage_example: `<video src="${publicUrl}" autoPlay loop muted playsInline className="w-full h-auto rounded-xl" />`,
                  note: "Vidéo servie depuis public/ (pas d'import ES6 nécessaire).",
                };
              } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : String(e) };
              }
            },
          }),
          video_check: tool({
            description:
              "Vérifie une vidéo fal.ai déjà lancée avec video_generate. Gratuit côté génération : ne crée PAS une nouvelle vidéo. Si terminée, télécharge le MP4 dans public/generated/<filename>.mp4.",
            inputSchema: z.object({
              request_id: z.string().min(1).describe("Identifiant renvoyé par video_generate."),
              filename: z
                .string()
                .min(2)
                .max(60)
                .regex(/^[a-z0-9-]+$/, "kebab-case sans extension"),
              model: z.enum([
                "fal-ai/veo3",
                "fal-ai/kling-video/v2/master/text-to-video",
                "fal-ai/kling-video/v2/master/image-to-video",
                "fal-ai/luma-dream-machine",
              ]).optional(),
              status_url: z.string().url().optional(),
              response_url: z.string().url().optional(),
            }),
            execute: async ({ request_id, filename, model, status_url, response_url }) => {
              const falKey = process.env.FAL_KEY;
              if (!falKey) return { ok: false, error: "FAL_KEY non configurée côté serveur." };
              const { checkFalVideo } = await import("@/server/video-generation.server");
              const result = await checkFalVideo({ request_id, model, status_url, response_url }, falKey);
              if (!result.ok) return { ok: false, error: result.error, request_id };
              if (result.status === "processing") {
                return {
                  ok: true,
                  status: "processing",
                  request_id,
                  provider_status: result.provider_status,
                  next_step: "La vidéo travaille encore. Réessaie video_check dans 45-60 secondes. Ne relance pas video_generate.",
                };
              }
              const dl = await fetch(result.video_url);
              if (!dl.ok) return { ok: true, status: "completed", video_url: result.video_url, note: "MP4 hébergé chez fal.ai (téléchargement local échoué)." };
              const buf = new Uint8Array(await dl.arrayBuffer());
              const relPath = `public/generated/${filename}.mp4`;
              const absPath = normalizePath(relPath);
              const { writeFileBinary } = await import("@/server/e2b-sandbox.server");
              await writeFileBinary(userId, projectId, absPath, buf);
              const publicUrl = `/generated/${filename}.mp4`;
              return {
                ok: true,
                status: "completed",
                path: relPath,
                filename,
                public_url: publicUrl,
                model: result.model,
                request_id,
                usage_example: `<video src="${publicUrl}" autoPlay loop muted playsInline className="w-full h-auto rounded-xl" />`,
              };
            },
          }),
          web_search: tool({
            description:
              "Recherche web en temps réel via Firecrawl. À utiliser dès que l'utilisateur demande des infos actuelles, des chiffres récents, des sources, des entreprises, ou tout ce qui n'est pas dans tes connaissances figées. Ne tente JAMAIS curl google.com — Google bloque. Utilise cet outil.",
            inputSchema: z.object({
              query: z.string().min(1).describe("Requête de recherche."),
              limit: z.number().int().min(1).max(10).optional().describe("Nombre de résultats (défaut 5)."),
              scrape: z.boolean().optional().describe("Si true, scrape le markdown de chaque résultat (plus lent, plus complet)."),
            }),
            execute: async ({ query, limit, scrape }) => {
              const key = process.env.FIRECRAWL_API_KEY;
              if (!key) return { ok: false as const, error: "FIRECRAWL_API_KEY absent côté serveur." };
              try {
                const body: Record<string, unknown> = { query, limit: limit ?? 5 };
                if (scrape) body.scrapeOptions = { formats: ["markdown"] };
                const res = await fetch("https://api.firecrawl.dev/v2/search", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
                if (!res.ok) {
                  const t = await res.text().catch(() => "");
                  return { ok: false as const, error: `Firecrawl ${res.status}: ${t.slice(0, 300)}` };
                }
                const json = (await res.json()) as {
                  data?: { web?: Array<{ url?: string; title?: string; description?: string; markdown?: string }> } | Array<{ url?: string; title?: string; description?: string; markdown?: string }>;
                };
                const raw = Array.isArray(json.data) ? json.data : json.data?.web ?? [];
                const results = raw.slice(0, limit ?? 5).map((r) => ({
                  url: r.url,
                  title: r.title,
                  description: r.description,
                  markdown: scrape ? (r.markdown ?? "").slice(0, 4000) : undefined,
                }));
                return { ok: true as const, count: results.length, results };
              } catch (e) {
                return { ok: false as const, error: e instanceof Error ? e.message : "erreur" };
              }
            },
          }),
          web_fetch: tool({
            description:
              "Scrape une URL précise en markdown via Firecrawl (gère le JS, contourne les protections anti-bot basiques). À utiliser quand tu as déjà une URL et veux son contenu.",
            inputSchema: z.object({
              url: z.string().url(),
              max_chars: z.number().int().min(500).max(20000).optional(),
            }),
            execute: async ({ url, max_chars }) => {
              const key = process.env.FIRECRAWL_API_KEY;
              if (!key) return { ok: false as const, error: "FIRECRAWL_API_KEY absent côté serveur." };
              try {
                const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
                });
                if (!res.ok) {
                  const t = await res.text().catch(() => "");
                  return { ok: false as const, error: `Firecrawl ${res.status}: ${t.slice(0, 300)}` };
                }
                const json = (await res.json()) as { data?: { markdown?: string; metadata?: { title?: string } } };
                const md = json.data?.markdown ?? "";
                const cap = max_chars ?? 8000;
                return {
                  ok: true as const,
                  url,
                  title: json.data?.metadata?.title,
                  markdown: md.slice(0, cap),
                  truncated: md.length > cap,
                };
              } catch (e) {
                return { ok: false as const, error: e instanceof Error ? e.message : "erreur" };
              }
            },
          }),

          file_create: tool({
            description:
              "Génère un fichier téléchargeable (texte OU binaire base64) et l'attache au chat. Retourne `download_url` (lien signé fiable) + `url`. Utilise-le dès que l'utilisateur demande un export, un copié-collé de conversation, un .txt/.json/.csv/.md/.html/.svg, etc. Réponds ensuite avec un lien markdown `[⬇ Télécharger nom](download_url)` cliquable. Ne propose jamais GitHub pour un simple téléchargement.",
            inputSchema: z.object({
              filename: z.string().min(1).describe("Ex: conversation.txt, export.json"),
              content: z.string().optional().describe("Contenu texte UTF-8"),
              content_base64: z.string().optional().describe("Contenu binaire base64 (sans préfixe data:)"),
              mime_type: z.string().optional(),
            }),
            execute: async ({ filename, content, content_base64, mime_type }) => {
              try {
                const MIME: Record<string, string> = {
                  txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8",
                  json: "application/json", csv: "text/csv; charset=utf-8",
                  html: "text/html; charset=utf-8", xml: "application/xml",
                  svg: "image/svg+xml", pdf: "application/pdf",
                };
                const safeName = filename.replace(/[^\w.\-]+/g, "_").slice(0, 100) || `file-${Date.now()}.txt`;
                const ext = safeName.split(".").pop()?.toLowerCase() ?? "txt";
                const mime = mime_type || MIME[ext] || "application/octet-stream";
                let bytes: Uint8Array;
                if (content_base64) {
                  const clean = content_base64.includes(",") ? content_base64.split(",")[1] : content_base64;
                  bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
                } else if (content != null) {
                  bytes = new TextEncoder().encode(content);
                } else {
                  return { ok: false as const, error: "content ou content_base64 requis" };
                }
                return uploadDownloadArtifact({
                  supabaseAdmin: supaAdmin,
                  userId,
                  filename: safeName,
                  bytes,
                  mimeType: mime,
                });
              } catch (e) {
                return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
              }
            },
          }),

          zip_create: tool({
            description:
              "Crée un ZIP téléchargeable depuis un fichier ou dossier de la sandbox. À utiliser pour télécharger une extension Chrome, un dossier, dist, public, src, ou le projet complet. Retourne `download_url` fiable. Réponds ensuite avec `[⬇ Télécharger le ZIP](download_url)`. Ne propose jamais GitHub pour ce cas.",
            inputSchema: z.object({
              source_path: z
                .string()
                .optional()
                .describe("Fichier/dossier à zipper, relatif à /home/user/app. Ex: extension, dist, ."),
              filename: z.string().optional().describe("Nom du zip final. Ex: mon-extension.zip"),
            }),
            execute: async ({ source_path, filename }) => {
              try {
                const zip = await exportSandboxPathZip(userId, projectId, source_path ?? ".", filename);
                return uploadDownloadArtifact({
                  supabaseAdmin: supaAdmin,
                  userId,
                  filename: zip.filename,
                  bytes: zip.bytes,
                  mimeType: "application/zip",
                }).then((result) => ({
                  ...result,
                  source_path: zip.sourcePath,
                  bytes: zip.size,
                }));
              } catch (e) {
                return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
              }
            },
          }),

          pdf_create: tool({
            description:
              "Crée un PDF stylé (cover + sections) et l'attache au chat. Retourne `download_url` (lien signé fiable) + `url`. Réponds avec un lien markdown `[⬇ Télécharger le PDF](download_url)`. Ne propose jamais GitHub pour un simple téléchargement.",
            inputSchema: z.object({
              filename: z.string().optional(),
              title: z.string(),
              subtitle: z.string().optional(),
              sections: z.array(z.object({ heading: z.string().optional(), body: z.string().optional() })),
              accent_color: z.string().optional().describe("Hex #RRGGBB"),
              footer: z.string().optional(),
            }),
            execute: async ({ filename, title, subtitle, sections, accent_color, footer }) => {
              try {
                const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
                const accent = (accent_color ?? "#3B82F6").replace("#", "");
                const r = parseInt(accent.slice(0, 2), 16) / 255;
                const g = parseInt(accent.slice(2, 4), 16) / 255;
                const b = parseInt(accent.slice(4, 6), 16) / 255;
                const pdf = await PDFDocument.create();
                const font = await pdf.embedFont(StandardFonts.Helvetica);
                const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
                const PAGE_W = 595, PAGE_H = 842, MARGIN = 50;
                const wrap = (t: string, maxW: number, size: number, f: typeof font) => {
                  const lines: string[] = [];
                  for (const para of t.split("\n")) {
                    const words = para.split(/\s+/);
                    let cur = "";
                    for (const w of words) {
                      const test = cur ? `${cur} ${w}` : w;
                      if (f.widthOfTextAtSize(test, size) > maxW) { if (cur) lines.push(cur); cur = w; }
                      else cur = test;
                    }
                    if (cur) lines.push(cur);
                  }
                  return lines;
                };
                let page = pdf.addPage([PAGE_W, PAGE_H]);
                page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: rgb(r, g, b) });
                page.drawText(title, { x: MARGIN, y: PAGE_H - 50, size: 22, font: fontBold, color: rgb(1, 1, 1) });
                if (subtitle) page.drawText(subtitle, { x: MARGIN, y: PAGE_H - 72, size: 11, font, color: rgb(1, 1, 1) });
                let y = PAGE_H - 120;
                const nl = (n: number) => { if (y - n < MARGIN + 30) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; } };
                for (const sec of sections) {
                  if (sec.heading) {
                    nl(30);
                    page.drawText(sec.heading, { x: MARGIN, y, size: 14, font: fontBold, color: rgb(r, g, b) });
                    y -= 6;
                    page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: PAGE_W - MARGIN, y: y - 2 }, thickness: 0.5, color: rgb(r, g, b) });
                    y -= 18;
                  }
                  for (const ln of wrap(String(sec.body ?? ""), PAGE_W - MARGIN * 2, 11, font)) {
                    nl(16);
                    page.drawText(ln, { x: MARGIN, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
                    y -= 15;
                  }
                  y -= 12;
                }
                if (footer) {
                  const pages = pdf.getPages();
                  for (let i = 0; i < pages.length; i++) {
                    pages[i].drawText(`${footer} · ${i + 1}/${pages.length}`, { x: MARGIN, y: 25, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
                  }
                }
                const bytes = await pdf.save();
                const safeName = (filename ?? `${title}.pdf`).replace(/[^\w.\-]+/g, "_").slice(0, 100);
                const finalName = /\.pdf$/i.test(safeName) ? safeName : `${safeName}.pdf`;
                return uploadDownloadArtifact({
                  supabaseAdmin: supaAdmin,
                  userId,
                  filename: finalName,
                  bytes,
                  mimeType: "application/pdf",
                });
              } catch (e) {
                return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
              }
            },
          }),

          docx_create: tool({
            description: "Crée un .docx (Word) titre + paragraphes et l'attache au chat. Retourne `download_url` (lien signé fiable) + `url`. Réponds avec un lien markdown vers `download_url`.",
            inputSchema: z.object({
              filename: z.string().optional(),
              title: z.string().optional(),
              paragraphs: z.array(z.string()),
            }),
            execute: async ({ filename, title, paragraphs }) => {
              try {
                const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
                const children: unknown[] = [];
                if (title) children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title, bold: true })] }));
                for (const p of paragraphs) children.push(new Paragraph({ children: [new TextRun(String(p))] }));
                const doc = new Document({ sections: [{ children: children as never }] });
                const buf = await Packer.toBuffer(doc);
                const bytes = new Uint8Array(buf);
                const safeName = (filename ?? `${title ?? "document"}.docx`).replace(/[^\w.\-]+/g, "_").slice(0, 100);
                const finalName = /\.docx$/i.test(safeName) ? safeName : `${safeName}.docx`;
                const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                return uploadDownloadArtifact({
                  supabaseAdmin: supaAdmin,
                  userId,
                  filename: finalName,
                  bytes,
                  mimeType: mime,
                });
              } catch (e) {
                return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
              }
            },
          }),
        };

        const catalogTools = {
          search_blocks: tool({
            description:
              "OUTIL EXCEPTIONNEL — cherche des blocs UI seulement si l'utilisateur demande explicitement un bloc/template/catalogue. Ne jamais utiliser pour démarrer une création normale.",
            inputSchema: z.object({
              query: z.string().optional().describe("Recherche full-text (ex: 'hero saas dark')."),
              category: z
                .string()
                .optional()
                .describe("landing, dashboard, pricing, features, etc."),
              sector: z
                .string()
                .optional()
                .describe("saas, restaurant, real_estate, portfolio, event, generic."),
              limit: z.number().int().min(1).max(20).optional(),
            }),
            execute: async (args) => {
              const results = await searchBlocks({
                query: args.query ?? null,
                category: args.category ?? null,
                sector: args.sector ?? null,
                limit: args.limit ?? 8,
              });
              return { count: results.length, results };
            },
          }),
          get_block: tool({
            description:
              "Récupère un bloc uniquement après une demande explicite de l'utilisateur et un search_blocks autorisé.",
            inputSchema: z.object({ slug: z.string().min(1) }),
            execute: async ({ slug }) => {
              const block = await getBlockBySlug(slug);
              return block;
            },
          }),
          list_templates: tool({
            description:
              "OUTIL EXCEPTIONNEL — liste des templates seulement si l'utilisateur demande explicitement un template/catalogue. Interdit pour les projets from scratch normaux.",
            inputSchema: z.object({
              sector: z.string().optional(),
              limit: z.number().int().min(1).max(20).optional(),
            }),
            execute: async (args) => {
              const results = await listTemplates({
                sector: args.sector ?? null,
                limit: args.limit ?? 10,
              });
              return { count: results.length, results };
            },
          }),
          get_template: tool({
            description:
              "Récupère le détail complet d'un template uniquement après demande explicite de l'utilisateur.",
            inputSchema: z.object({ slug: z.string().min(1) }),
            execute: async ({ slug }) => {
              return getTemplateBySlug(slug);
            },
          }),
          github_sync: tool({
            description:
              "Pousse l'intégralité du projet de la sandbox vers GitHub (créé le dépôt si absent). À utiliser quand l'utilisateur veut sauvegarder/déployer sur Git ou que Vercel doit être mis à jour. Nécessite GITHUB_TOKEN côté serveur. Renvoie l'URL HTML du dépôt et le SHA du commit. Idempotent.",
            inputSchema: z.object({
              repo_name: z
                .string()
                .min(1)
                .max(80)
                .regex(/^[a-z0-9._-]+$/i)
                .optional()
                .describe("Nom du dépôt (défaut: dérivé du projectId)."),
              commit_message: z
                .string()
                .min(1)
                .max(200)
                .optional()
                .describe("Message de commit (défaut: 'Update from Elena')."),
              private: z
                .boolean()
                .optional()
                .describe("Dépôt privé si nouveau (défaut: true)."),
            }),
            execute: async ({ repo_name, commit_message, private: isPrivate }) => {
              const token = process.env.GITHUB_TOKEN;
              if (!token) {
                return {
                  ok: false as const,
                  error: "GITHUB_TOKEN absent côté serveur. Demande à l'utilisateur de configurer le secret GITHUB_TOKEN.",
                };
              }
              const ghHeaders = {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Nexyra-Elena",
              };
              const userRes = await fetch("https://api.github.com/user", { headers: ghHeaders });
              if (!userRes.ok) {
                const txt = await userRes.text();
                return {
                  ok: false as const,
                  error: `GitHub /user a renvoyé ${userRes.status}: ${txt.slice(0, 200)}`,
                };
              }
              const userJson = (await userRes.json()) as { login: string; id: number; email?: string | null };
              const owner = userJson.login;
              const commitEmail = userJson.email || `${userJson.id}+${userJson.login}@users.noreply.github.com`;
              const commitName = userJson.login;
              const repo = (repo_name || projectId.slice(0, 8))
                .toLowerCase()
                .replace(/[^a-z0-9._-]/g, "-");

              const repoCheck = await fetch(
                `https://api.github.com/repos/${owner}/${repo}`,
                { headers: ghHeaders },
              );
              let defaultBranch = "main";
              if (repoCheck.status === 404) {
                const createRes = await fetch("https://api.github.com/user/repos", {
                  method: "POST",
                  headers: { ...ghHeaders, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: repo,
                    private: isPrivate !== false,
                    auto_init: false,
                    description: "Créé automatiquement par Elena (Nexyra)",
                  }),
                });
                if (!createRes.ok) {
                  const txt = await createRes.text();
                  return {
                    ok: false as const,
                    error: `Création du dépôt échouée (${createRes.status}): ${txt.slice(0, 200)}`,
                  };
                }
              } else if (repoCheck.ok) {
                const j = (await repoCheck.json()) as { default_branch?: string };
                defaultBranch = j.default_branch || "main";
              } else {
                const txt = await repoCheck.text();
                return {
                  ok: false as const,
                  error: `Lecture du dépôt échouée (${repoCheck.status}): ${txt.slice(0, 200)}`,
                };
              }

              const msg = (commit_message || "Update from Elena").replace(/'/g, "'\\''");
              const remoteWithToken = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
              const remoteClean = `https://github.com/${owner}/${repo}.git`;
              const script = [
                "set -e",
                "cd /home/user/app",
                `git config --global user.email '${commitEmail}' >/dev/null 2>&1`,
                `git config --global user.name '${commitName.replace(/'/g, "'\\''")}' >/dev/null 2>&1`,
                "git config --global init.defaultBranch main >/dev/null 2>&1",
                "if [ ! -d .git ]; then git init -q; fi",
                "[ -f .gitignore ] || printf 'node_modules\\ndist\\n.env\\n.env.local\\n' > .gitignore",
                "git remote remove origin 2>/dev/null || true",
                `git remote add origin '${remoteWithToken}'`,
                `git checkout -B ${defaultBranch} >/dev/null 2>&1 || true`,
                "git add -A",
                `git commit -m '${msg}' --allow-empty -q`,
                `git push -u origin ${defaultBranch} --force 2>&1 | sed 's#x-access-token:[^@]*@#REDACTED@#g'`,
                `git remote set-url origin '${remoteClean}'`,
                "echo '---SHA---'",
                "git rev-parse HEAD",
              ].join(" && ");
              const r = await runCommand(
                userId,
                projectId,
                `bash -lc "${script.replace(/"/g, '\\"')}"`,
                { cwd: "/home/user/app", timeoutMs: 180_000 },
              );
              const cleanStdout = r.stdout.split(token).join("REDACTED");
              const cleanStderr = r.stderr.split(token).join("REDACTED");
              if (r.exitCode !== 0) {
                return {
                  ok: false as const,
                  error: `git push échec (exit ${r.exitCode})`,
                  stdout: cleanStdout.slice(-2000),
                  stderr: cleanStderr.slice(-2000),
                  hint: "Vérifie que GITHUB_TOKEN a bien les scopes 'repo' (et 'workflow' si besoin).",
                };
              }
              const shaMatch = cleanStdout.match(/---SHA---\s*([a-f0-9]{7,40})/);
              const sha = shaMatch ? shaMatch[1] : null;
              return {
                ok: true as const,
                repo_url: `https://github.com/${owner}/${repo}`,
                branch: defaultBranch,
                commit_sha: sha,
                commit_message: commit_message || "Update from Elena",
                next_step:
                  "Le code est sur GitHub. Si le dépôt est connecté à Vercel, le déploiement se lance automatiquement (1-2 min).",
              };
            },
          }),
        };


        // github_sync est toujours disponible (déploiement/sauvegarde Git), même hors mode catalogue
        const { github_sync, ...catalogToolsRest } = catalogTools as typeof catalogTools & { github_sync: unknown };
        const tools = allowCatalogTools
          ? { ...coreTools, ...catalogTools }
          : { ...coreTools, github_sync };

        const rawEnriched = stripHeavyToolPayloads(sanitizeMessagesForModel(messages as UIMessage[]));
        // Chantier 4 — Tronque les vieux tool outputs (ELENA_TRUNCATE_OLD_TOOLS=on).
        // Garde intacts les 6 derniers messages, tronque les plus vieux à ~800 chars.
        const truncRes = truncateOldToolOutputs(rawEnriched);
        // Chantier 6 — Dédup des tool outputs identiques cross-tours
        // (ELENA_DEDUP_TOOL_OUTPUTS=on). Garde la dernière occurrence intacte,
        // remplace les plus vieilles par un pointeur court. Zéro perte d'info.
        const dedupRes = deduplicateToolOutputs(truncRes.messages);
        const enrichedMessages = dedupRes.messages;
        logTruncate("elena-e2b", projectId, truncRes.stats);
        logDedup("elena-e2b", projectId, dedupRes.stats);



        // 🧠 COMPACTION AUTO — résume les vieux messages au-delà de 30 tours
        // et n'envoie que les 16 derniers + résumé dans le system prompt.
        // On adapte UIMessage→ChatMsgLike pour le résumé, puis on slice
        // l'historique UIMessage d'origine pour préserver la structure parts/tools.
        const memoryPreloaded = await readMemory(supaUser, userId, projectId).catch(() => null);
        const flatForCompactor = enrichedMessages.map((m) => {
          const parts = (Array.isArray(m.parts) ? m.parts : []) as Array<{ type?: string; text?: string }>;
          const text = parts
            .filter((p) => p.type === "text" && typeof p.text === "string")
            .map((p) => p.text ?? "")
            .join("\n");
          return { role: String(m.role), content: text };
        });
        const compaction = await compactConversation(flatForCompactor, {
          supabase: supaUser,
          userId,
          workspaceId: projectId,
          openaiKey,
          memory: memoryPreloaded,
        });
        const compactedUIMessages = compaction.compacted
          ? enrichedMessages.slice(enrichedMessages.length - compaction.messages.length)
          : enrichedMessages;
        if (compaction.compacted) {
          console.log(
            `[elena-e2b] context compacted: ${enrichedMessages.length} → ${compactedUIMessages.length} msgs`,
          );
        }
        const userProfileBlock = await loadUserProfileBlock(supaUser, userId).catch(() => null);

        const lessons = await getActiveLessons(userId);
        const lessonsBlock = buildLessonsPromptSection(lessons);
        // Chantier 1 — Architecture en couches (ELENA_LAYERS=on pour activer).
        // OFF = concaténation identique à l'ancien code (aucun changement de comportement).
        // ON = ordre stable garanti L1 (ADN+lessons) → L2 (profil user) → L3 (résumé conv),
        // fondation pour le cache prompt du Chantier 2.
        // Chantier 3 — Slim prompt (ELENA_SLIM_PROMPT=on).
        // OFF = SYSTEM_PROMPT complet (identique à avant).
        // ON = retire les modules VISION/GROS_PROJET quand aucun déclencheur
        // détecté dans les 3 derniers messages user. Économie ~1.5-2k tokens/tour.
        const slimCtx = detectSlimContext(enrichedMessages);
        const slimmed = slimSystemPrompt(SYSTEM_PROMPT, slimCtx);
        logSlim("elena-e2b", projectId, slimmed.savedChars, slimmed.removed);
        const layered = buildLayeredSystem({
          adn: slimmed.slimmed + lessonsBlock,
          userProfile: userProfileBlock,
          conversationSummary: compaction.summaryBlock,
        });
        const systemFinal = layered.system;
        logLayers("elena-e2b", layered, {
          project: projectId,
          compacted: compaction.compacted ? 1 : 0,
        });
        // Chantier 2 — Cache prompt multi-provider (ELENA_CACHE_PROMPT=on).
        // OFF = undefined → aucun changement au call. ON = injecte la clé de
        // routage cache selon le provider actif (OpenAI = promptCacheKey stable
        // par user+projet). DeepSeek/OpenRouter cachent en auto, on observe
        // seulement les tokens cachés dans onFinish.
        const cacheOptions = buildCacheProviderOptions({
          provider: orchestratorProvider,
          userId,
          projectId,
        });
        // Phase 2.1 — Anthropic (direct ou via OpenRouter) : injecte cache_control
        // sur le system prompt en le transformant en ModelMessage structuré.
        const cachedSystem = buildCachedSystemMessage({
          provider: orchestratorProvider,
          model: orchestratorModelName,
          systemText: systemFinal,
        });
        const convertedMessages = await convertToModelMessages(compactedUIMessages);
        const outboundMessages = cachedSystem
          ? [...cachedSystem.systemMessages, ...convertedMessages]
          : convertedMessages;
        const result = streamText({
          model,
          ...(cachedSystem ? {} : { system: systemFinal }),
          messages: outboundMessages,
          tools,
          stopWhen: stepCountIs(20),
          abortSignal: timedAbort.signal,
          ...(cacheOptions ? { providerOptions: cacheOptions } : {}),
          // FIX bug QA : à chaque step on récupère la dernière capture publiée
          // par le client (onToolCall côté Dev3Chat) pour la réinjecter aux
          // outils qa_* sans que le modèle ait à la passer en argument.
          onStepFinish: ({ toolResults }) => {
            try {
              for (const r of toolResults ?? []) {
                if (r.toolName !== "capture_current_preview") continue;
                const out = r.output as { rendered_image_base64?: unknown } | undefined;
                const v = out?.rendered_image_base64;
                if (typeof v === "string" && v.startsWith("data:image/") && v.length > 400) {
                  lastCaptureBase64Ref.current = v;
                }
              }
            } catch (e) {
              console.warn("[elena-e2b] onStepFinish capture-store ignored", e);
            }
          },
        });

        return result.toUIMessageStreamResponse({
          onFinish: async ({ messages: finalMessages }) => {
            try {
              const last = finalMessages?.[finalMessages.length - 1];
              const parts = Array.isArray(last?.parts) ? last.parts : [];
              const toolCallCount = parts.filter(
                (p: { type?: string }) => typeof p.type === "string" && p.type.startsWith("tool-"),
              ).length;
              const textLen = parts
                .filter((p): p is { type: "text"; text: string } => p.type === "text")
                .map((p) => p.text)
                .join("").length;
              const finish = await Promise.resolve(result.finishReason).catch(() => "?");
              const steps = (await Promise.resolve(result.steps).catch(() => [] as unknown[])).length;
              console.log(
                `[elena-e2b] onFinish project=${projectId} finish=${finish} steps=${steps} toolCalls=${toolCallCount} textLen=${textLen}`,
              );
              // Chantier 2 — log cache hit/miss (indépendant du toggle : on
              // observe même quand off pour comparer avant/après).
              try {
                const usage = (await Promise.resolve(result.usage).catch(() => undefined)) as
                  | Record<string, unknown>
                  | undefined;
                const providerMetadata = await Promise.resolve(result.providerMetadata).catch(
                  () => undefined,
                );
                logCacheUsage("elena-e2b", {
                  provider: orchestratorProvider,
                  model: orchestratorModelName,
                  projectId,
                  usage,
                  providerMetadata,
                });
                // Chantier 7 — persist per-turn savings for the admin panel.
                const pickN = (o: unknown, keys: string[]): number => {
                  if (!o || typeof o !== "object") return 0;
                  const r = o as Record<string, unknown>;
                  for (const k of keys) {
                    const v = r[k];
                    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
                  }
                  return 0;
                };
                const inputTk = pickN(usage, ["inputTokens", "promptTokens", "prompt_tokens"]);
                const outputTk = pickN(usage, [
                  "outputTokens",
                  "completionTokens",
                  "completion_tokens",
                ]);
                const cacheReadTk =
                  pickN(usage, [
                    "cachedInputTokens",
                    "cached_input_tokens",
                    "promptCachedTokens",
                    "prompt_cached_tokens",
                  ]) ||
                  pickN(providerMetadata, [
                    "cachedInputTokens",
                    "cached_tokens",
                    "prompt_cache_hit_tokens",
                    "cache_read_input_tokens",
                  ]);
                const cacheWriteTk = pickN(providerMetadata, [
                  "cache_creation_input_tokens",
                  "cacheCreationInputTokens",
                ]);
                recordElenaSavings({
                  ownerId: userId,
                  projectId,
                  route: "elena-e2b",
                  model: activeModelName,
                  truncParts: truncRes.stats.truncatedParts,
                  truncSavedTk: Math.round(truncRes.stats.savedChars / 4),
                  dedupParts: dedupRes.stats.dedupedParts,
                  dedupSavedTk: Math.round(dedupRes.stats.savedChars / 4),
                  cacheReadTk,
                  cacheWriteTk,
                  inputTk,
                  outputTk,
                });
                // Chantier E — log le modèle effectivement utilisé pour que la
                // Tirelire (SavingsSection) puisse calculer les économies du
                // routing intelligent (tier XS → XL) vs baseline Claude.
                void recordMetric({
                  userId,
                  endpoint: "elena-e2b",
                  taskType: selectedTier ? `tier_${selectedTier}` : orchestratorTask ?? null,
                  model: `${activeProvider}/${activeModelName}`,
                  cacheType: cacheReadTk > 0 ? "exact" : "miss",
                  tokensInput: inputTk,
                  tokensOutput: outputTk,
                  latencyMs: 0,
                  success: true,
                });
              } catch (e) {
                console.warn("[elena-e2b] cache usage log skipped", e);
              }
            } catch (e) {
              console.warn("[elena-e2b] onFinish log error", e);
            }
            await saveCurrentProjectSnapshot(userId, projectId).catch((err) => {
              console.warn("[elena-e2b] autosave fin de tour ignorée", err);
            });
            timedAbort.cleanup();
          },
          onError: (err) => {
            console.error(
              "[elena-e2b] stream error",
              err instanceof Error ? err.stack ?? err.message : err,
            );
            void saveCurrentProjectSnapshot(userId, projectId).catch((saveErr) => {
              console.warn("[elena-e2b] autosave erreur ignorée", saveErr);
            });
            timedAbort.cleanup();
            // Message utilisateur clair selon le type d'erreur
            const raw =
              err instanceof Error
                ? err.message
                : typeof err === "string"
                  ? err
                  : JSON.stringify(err);
            const lower = raw.toLowerCase();
            if (lower.includes("insufficient_quota") || lower.includes("exceeded your current quota")) {
              return "💳 Quota OpenAI dépassé. Recharge ton compte OpenAI (platform.openai.com → Billing) ou bascule sur un autre provider dans Réglages → Clés API.";
            }
            if (lower.includes("invalid_api_key") || lower.includes("incorrect api key")) {
              return "🔑 Clé API invalide. Vérifie ta clé OpenAI dans Réglages → Clés API.";
            }
            if (lower.includes("rate_limit") || lower.includes("rate limit")) {
              return "⏱️ Limite de requêtes atteinte. Attends 30 secondes et relance.";
            }
            if (lower.includes("timeout") || lower.includes("aborted")) {
              return "⏱️ Elena a dépassé le temps imparti (90s). Relance avec une demande plus précise/courte.";
            }
            return `Elena s'est arrêtée — ${raw.slice(0, 200)}`;
          },

        });
      },
    },
  },
});
