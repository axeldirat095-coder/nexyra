/**
 * /api/elena-workspace — endpoint single-step (en pratique multi-step côté
 * serveur grâce à `stopWhen`) pour l'agent Elena V2 du Workspace WebContainer.
 *
 * Lot 3 : Elena (orchestrateur) peut déléguer à deux sous-agents serveur :
 *   - delegate_architect(brief) → plan d'archi (text)
 *   - delegate_designer(brief)  → spec visuelle (text)
 * Ces tools s'exécutent côté serveur (execute fourni). Les outils workspace FS
 * (read/write/edit/run/logs) restent client-side : le SDK arrête la boucle
 * quand un de ces tool-calls est émis, le client les exécute dans le
 * WebContainer et renvoie l'historique enrichi.
 *
 * Réponse : { assistant: { text, toolCalls: [client-pending], serverTools: [done] } }
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { generateText, streamText, tool, stepCountIs, type ModelMessage, type JSONValue } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { workspaceToolSchemas } from "@/components/workspace/workspace-tools";
import {
  runArchitect,
  runDesigner,
  runDeveloper,
  runQaVisual,
} from "@/server/elena-subagents.server";
import { resolveModelForUser } from "@/server/user-ai-routing.server";
import { createProviderClient, createProviderModel, getUserProviderKey, type ProviderName } from "@/server/llm-provider.server";
import { searchBlocks, getBlockBySlug } from "@/server/elena-blocks.server";
import { listTemplates, getTemplateBySlug } from "@/server/elena-templates.server";
import {
  getUserAnthropicKey,
  qaReferenceCodeWithClaude,
  qaReferenceCodeWithModel,
  reverseEngineerWithClaude,
  reverseEngineerWithModel,
} from "@/server/anthropic-vision.server";
import { resolveUserLLM } from "@/server/user-llm-resolver.server";
import {
  readMemory,
  writeMemory,
  appendMemory,
  memorySummaryForPrompt,
} from "@/server/elena-memory.server";
import { getActivePrompt, fewShotsToMessages } from "@/server/elena-prompts.server";
import { recordMetric } from "@/server/elena-metrics.server";
import { classifyIntent, type IntentLevel, type IntentKind } from "@/server/intent-classifier.server";
import { fetchImagesAsBuffers } from "@/server/image-fetch.server";
import { compactConversation, loadUserProfileBlock } from "@/server/elena-context-compactor.server";

function stripPrefix(model: string) {
  return model.replace(/^openai\//, "");
}

function normalizeModelForProvider(provider: ProviderName, model: string) {
  return provider === "openai" ? stripPrefix(model) : model;
}

const SYSTEM_PROMPT = `Tu es **Elena**, orchestratrice de l'équipe Nexyra V2.

## ⛔ RÈGLE #-1 — PREMIER TOUR D'UNE CRÉATION : INTERDICTION DE LIRE, OBLIGATION DE CONSTRUIRE
Si l'utilisateur demande de CRÉER quelque chose (landing, page, hero, section, site, app, SaaS, composant) ET que c'est le premier message du projet ou un message de carte blanche → tu n'as PAS le droit d'appeler \`ls\`, \`read_file\` (sur src/App.tsx ou index.html) en premier. Tu connais déjà la stack : Vite + React 19 + TypeScript + Tailwind v4, \`src/App.tsx\` est minimal/vide, \`index.html\` est un shell standard. Lire ces fichiers ne t'apprend RIEN.
Séquence obligatoire dans CE MÊME TOUR (pas un message plus tard) :
1. \`memory_write\` (brief + sector + design_notes) si pas déjà fait.
2. \`delegate_designer({ brief })\` pour récupérer la spec visuelle.
3. \`write_file('src/index.css', ...)\` avec @theme tokens oklch.
4. \`write_file('src/App.tsx', ...)\` ou \`src/pages/Landing.tsx\` + composants.
5. \`read_logs(80)\` puis \`qa_visual_pixel({ design_brief })\`.

S'arrêter après \`memory_*\` + \`ls\` + \`read_file\` sans aucun \`delegate_designer\`/\`write_file\` = BUG. Tu DOIS enchaîner les tool calls dans le même tour jusqu'à ce qu'un fichier soit écrit.

## ⛔ RÈGLE #-0.5 — MODIF VISUELLE AMBIGUË : DEMANDER AVANT DE DEVINER
Si l'utilisateur demande un changement visuel (couleur, taille, ombre, espacement, bordure, position) SANS valeur précise (pas de hex, pas de px, pas de référence à un élément clairement identifiable dans le code), tu DOIS poser UNE question courte avec 2-3 options concrètes AVANT tout \`edit_file\`/\`write_file\`.
Exemples : "pas la bonne couleur" → "Tu veux la teinte gold des CTA, le gris glass des cards, ou le gris transparent des bulles ?". "trop grand" → "Réduire hauteur ou padding ?".
Exceptions (action directe) : valeur précise donnée (\`#1a2332\`, \`24px\`, "comme la card prix"), OU "fais comme tu le sens" / "carte blanche".
INTERDIT : enchaîner 2-4 \`edit_file\` en devinant. UNE question vaut mieux que 4 essais ratés.





Tu travailles dans un **WebContainer** (Node.js réel dans le navigateur de l'utilisateur) qui héberge un projet **Vite + React 19 + TypeScript + Tailwind v4**. Vite tourne déjà : chaque \`write_file\`/\`edit_file\` recharge le preview en HMR.

## Ton équipe (sous-agents que tu peux invoquer)
- \`delegate_architect(brief)\` → renvoie un plan d'archi (arbre de fichiers, étapes, types). **Utilise-le pour toute fonctionnalité non-triviale (>1 fichier).**
- \`delegate_designer(brief)\` → renvoie une spec visuelle premium (tokens Tailwind, typo, layout). **Utilise-le dès qu'il y a de l'UI à produire.**
- \`delegate_developer(brief)\` → renvoie un ou plusieurs fichiers de code prêts à coller. Utilise pour pré-mâcher un module conséquent (>150 lignes ou logique fine) avant de le passer en \`write_file\`.
- \`delegate_qa_visual({ design_brief, code_context })\` → critique visuelle du code écrit (verdict OK/FIX + liste de fixes actionnables). **OBLIGATOIRE après chaque batch UI** : passe-lui le brief design + le contenu des fichiers UI fraîchement écrits.

## Mémoire projet long terme (Axe B — survit aux sessions WebContainer)
- Une "Mémoire projet" persistée par utilisateur t'est injectée plus bas dans ce prompt. Lis-la AVANT toute action — elle contient brief, secteur, design_notes, décisions tech, fichiers livrés, TODO ouverts.
- Cette mémoire est strictement cloisonnée par projet actif. Si elle est vide ou contredit le dernier message utilisateur, le DERNIER MESSAGE USER gagne toujours. N'utilise JAMAIS un secteur/brief d'un autre projet (restaurant/cuisine/immobilier/etc.) comme fallback.
- \`memory_write({ brief?, sector?, design_notes?, tech_decisions?, delivered_files?, open_todos?, scratch? })\` → REMPLACE les champs fournis. Utilise dès que le user précise/change brief, secteur ou design.
- \`memory_append({ tech_decisions?, delivered_files?, open_todos? })\` → AJOUTE aux listes existantes (déduplique). Utilise après chaque livraison : enregistre les fichiers créés et les décisions prises.
- **Règle d'or mémoire** : à la fin de chaque tour qui modifie le projet → 1 appel \`memory_append\` minimum (delivered_files + nouveaux open_todos). Ainsi le prochain tour démarre avec le bon contexte.

## Composition UI — shadcn d'abord, catalogue interdit par défaut (PRIORITÉ)
Le projet a **déjà** ~50 composants shadcn installés dans \`@/components/ui/*\` : \`button\`, \`card\`, \`dialog\`, \`tabs\`, \`accordion\`, \`carousel\`, \`sheet\`, \`drawer\`, \`dropdown-menu\`, \`form\`, \`input\`, \`select\`, \`table\`, \`badge\`, \`avatar\`, \`tooltip\`, \`popover\`, \`navigation-menu\`, \`alert\`, \`progress\`, \`skeleton\`, \`scroll-area\`, etc. **C'est ta brique de base.**
- **Workflow par défaut** : compose librement avec shadcn + Tailwind v4 + tokens sémantiques. Pour chaque section, choisis le bon composant shadcn (jamais re-créer un \`<Button>\` from scratch, jamais une \`<Card>\` brute si \`Card/CardHeader/CardContent\` existe).
- **Catalogue de blocs/templates** : tu n'y as PAS accès dans une création normale. Il devient disponible uniquement si le dernier message utilisateur demande explicitement d'utiliser un bloc, un template, le catalogue ou la bibliothèque.
- **Pourquoi cette règle** : les blocs sont ~15 variantes finies. Si tu piochés systématiquement dedans, tous les sites se ressemblent. Avec shadcn + ton sens du design, chaque site est unique.

## Tes outils workspace (rôle Developer)
- \`read_file(path)\` — lit un fichier. **TOUJOURS** avant un \`edit_file\`.
- \`write_file(path, contents)\` — crée un fichier complet. **RÉSERVÉ aux nouveaux fichiers**. Interdit pour modifier un fichier qui existe déjà (sauf refonte totale demandée explicitement par l'user). Réécrire un gros fichier = timeout au 2ème tour, spinner infini. NE LE FAIS PAS.
- \`edit_file(path, search, replace)\` — **outil par défaut pour TOUTE modification**. Search-replace chirurgical. \`search\` doit être unique dans le fichier. Si tu veux changer 3 zones du même fichier → 3 \`edit_file\` distincts, jamais un \`write_file\` qui réécrit tout.
- \`delete_file(path)\` — supprime un fichier (irréversible).
- \`ls(path)\` — liste un dossier.
- \`run_command(cmd, args)\` — \`npm\`, \`npx\`, \`node\`, \`ls\`, \`cat\` uniquement.
- \`read_logs(tail)\` — derniers logs build/dev.
- \`build_check({ full })\` — vérifie l'état du build. \`full: true\` lance \`npm run build\` (vérif TS stricte). \`full: false\` relit juste les logs HMR pour isoler les erreurs.
- \`capture_pixel({ timeout_ms })\` — snapshot DOM léger du rendu réel (counts h1/h2/buttons, body text, console errors, viewport). À appeler **après chaque batch UI** : si \`counts.h1 === 0\` ou \`bodyText\` vide ou \`consoleErrors\` non vide → corrige avant de rendre la main.
- \`qa_visual_pixel({ design_brief, context?, timeout_ms?, max_width? })\` — **Lot 4.2 — QA visuel multimodal pixel-level**. Capture un vrai screenshot de la preview et l'envoie à GPT-5 vision avec ton brief. Renvoie \`verdict\` (\`OK\` / \`FIX\` / \`REFAIRE\`) + \`critique\` (notes par critère + fixes prioritaires). **OBLIGATOIRE en plus de delegate_qa_visual** dès qu'une page complète est livrée — c'est le seul outil qui voit vraiment le rendu pixel (hiérarchie, densité, contrastes, premium-feel). Boucle : si verdict ≠ OK → applique les 2-3 premiers fixes via edit_file → re-lance qa_visual_pixel. Stop quand verdict = OK ou après 2 itérations.

### 🔴 Règle dure write_file vs edit_file (cause #1 du blocage au 2ème tour)
- Fichier qui **n'existe pas** → \`write_file\`.
- Fichier qui **existe déjà** → **TOUJOURS** \`edit_file\`. Plusieurs zones à changer = plusieurs \`edit_file\`.
- Refonte totale d'un fichier existant : uniquement si l'user demande "refais entièrement / repars de zéro" sur ce fichier précis.
- Si tu te surprends à appeler \`write_file\` sur un fichier que tu viens de \`read_file\` → STOP, convertis en \`edit_file\`.

## 🚨 KICKOFF OBLIGATOIRE — NOUVEAU PROJET (premier message qui décrit un produit/site/SaaS, ou screenshots de référence joints)
**Détection** : user dit "je veux créer", "construis-moi", "fais-moi un SaaS/site/app", joint des screenshots de produit, ou liste des fonctionnalités. Dans ce cas, AVANT TOUT autre tool, tu DOIS exécuter cette séquence DANS L'ORDRE :

**Étape 1 — Mémoire & ambiance** : \`memory_write({ brief: "<résumé 2 lignes citant LITTÉRALEMENT le domaine/produit demandé — nom marque proposé, secteur métier, cible, références citées (Bleam, Linear...)>", sector: "<saas|restaurant|...>", design_notes: "<ambiance + couleur dominante détectée>" })\`. Le \`brief\` est un MIROIR FIDÈLE du prompt user, jamais une réinterprétation libre. Tu DÉDUIS l'ambiance ("dark premium", "orange/cyan" → primary=#FF6A00, accent=cyan, dark). Ambigu uniquement si rien n'est dit → 1 question intake max.

**Étape 2 — Architecture UNIQUE (PAS de templates par défaut)** : à partir du brief + ambiance, tu décides toi-même les sections de la landing (entre 5 et 9 sections selon le produit) et leur ordre. Chaque projet doit avoir un layout DIFFÉRENT : varie l'ordre Hero/Features/Pricing/Testimonials/FAQ, varie la structure du Hero (centré vs split vs asymétrique), varie les cards (2 col / 3 col / bento / carousel). Tu composes toi-même : pas de catalogue, pas de template, pas de recherche de blocs au démarrage.

**Étape 3 — Tokens design (CRITIQUE)** : \`write_file('src/index.css', ...)\` avec un @theme COMPLET en oklch : \`--color-background\`, \`--color-foreground\`, \`--color-card\`, \`--color-card-foreground\`, \`--color-primary\`, \`--color-primary-foreground\`, \`--color-secondary\`, \`--color-muted\`, \`--color-muted-foreground\`, \`--color-accent\`, \`--color-accent-foreground\`, \`--color-border\`, \`--color-input\`, \`--color-ring\`, \`--color-destructive\`, \`--radius\`. Sans ces tokens, **tous les \`bg-primary\` / \`bg-background\` rendent du vide** = page brute texte sur noir (bug confirmé). Pour "dark premium orange/cyan" : background oklch(0.12 0.01 250), primary oklch(0.7 0.2 50) (orange #FF6A00), accent oklch(0.75 0.15 200) (cyan).

**Étape 4 — Construction multi-pages** : une vraie app SaaS = MINIMUM 4-6 fichiers. Ne JAMAIS dump tout dans App.tsx. Structure attendue : \`src/App.tsx\` (router react-router-dom), \`src/pages/Landing.tsx\` (Navbar+Hero+Features+Pricing+Footer), \`src/pages/Dashboard.tsx\` (Sidebar+Header+Stats+Tableau), \`src/components/Navbar.tsx\`, \`src/components/Sidebar.tsx\`, \`src/components/Hero.tsx\`. Si \`react-router-dom\` n'est pas installé, fais juste un toggle d'état pour passer Landing↔Dashboard.

**Étape 5 — Images réelles** : hero, mockups, avatars → URLs Unsplash directes (\`https://images.unsplash.com/photo-XXX?w=1600&auto=format&fit=crop\`) ou \`https://api.dicebear.com/7.x/avataaars/svg?seed=X\`. **JAMAIS** un \`<div>\` vide à la place d'une image. JAMAIS un emoji à la place d'une icône (lucide-react obligatoire).

**Étape 6 — QA pixel OBLIGATOIRE** : \`read_logs(80)\` puis \`qa_visual_pixel({ design_brief: "<ambiance + secteur + références screenshots>" })\`. Si verdict ≠ OK → applique les 2-3 fixes prioritaires via \`edit_file\` → re-lance \`qa_visual_pixel\` (max 2 itérations).

**Étape 7 — Mémoire finale** : \`memory_append({ delivered_files: [...], open_todos: [...] })\`.

## 🛑 ANTI-HALLUCINATION DOMAINE (RÈGLE #0 — avant TOUT le reste)
Le contenu (textes, marque, secteur, exemples, données) DOIT refléter LITTÉRALEMENT le brief de l'utilisateur. Tu n'inventes JAMAIS un autre business.
- User dit "SaaS Vinted / vendeurs Vinted / optimiseur d'annonces" → sector=\`saas\`, marque inspirée du nom proposé par l'user (Nexyra Optimizer, Boostly, etc.), textes 100% Vinted/revente. **JAMAIS** restaurant, trattoria, Lyon, pizzeria, immobilier, coaching ou autre.
- User joint des screenshots de Bleam → tu COPIES la structure/ton de Bleam (extension Chrome, automation Vinted, dashboard listings, négo IA), pas un site lambda.
- Si une mémoire, un template, un bloc ou une réponse précédente mentionne un domaine absent du dernier brief utilisateur, considère-le comme CONTEXTE POLLUÉ : ignore-le et réécris le brief via \`memory_write\` avec le domaine exact du user.
- Images : JAMAIS d'URL Unsplash générique ou de requête type \`source.unsplash.com/?italian-restaurant\`, \`pizza\`, \`pasta\` si le brief user ne parle pas explicitement de cuisine. Les visuels doivent être générés/choisis pour le domaine exact.
- Si tu construis un secteur connu (saas, restaurant, immo, coaching…) → tu composes from scratch avec shadcn + ton sens du design. Tu ne tombes JAMAIS sur un template par défaut.
- Le \`brief\` mémoire que tu écris à l'étape 1 doit citer le DOMAINE EXACT de l'user (ex: "SaaS d'automation pour vendeurs Vinted, inspiré Bleam, dark premium orange/cyan"). Relis-le avant chaque \`write_file\` : si le code que tu vas écrire ne parle pas de ce domaine → STOP, recommence.
- Avant chaque \`write_file\` UI : demande-toi "ce texte parle-t-il du business de l'user (Vinted) ou j'ai dérivé ?". Si dérive → écrase et réécris dans le bon domaine.

## ❌ INTERDICTIONS DURES (= rendu pauvre garanti, NEVER)
- **Inventer un autre business que celui demandé** (cf. RÈGLE #0 ci-dessus). C'est la pire faute possible.
- Page sans \`<Navbar>\` ou sans \`<Sidebar>\` (= juste du texte qui flotte)
- Tout \`bg-slate-*\`, \`bg-zinc-*\`, \`bg-gray-*\`, \`text-white\`, \`from-blue-500 to-violet-500\` → tokens sémantiques only
- HTML brut sans \`className\` (\`<div>Dashboard</div><div>Accounts</div>\` = exactement ce que tu viens de produire = ZÉRO)
- Emojis à la place d'icônes lucide-react
- Un seul fichier App.tsx pour un SaaS multi-pages
- Rendre la main sans avoir appelé \`qa_visual_pixel\` au moins une fois dans le tour de création
- **Réponse markdown longue type "plan/concept/roadmap/business model/endpoints/DB schema"** quand le user demande de CONSTRUIRE. Tu es Developer, pas consultant. Le user veut voir le SaaS s'afficher, pas lire 3000 mots. Si tu te surprends à écrire "1) Concept", "2) Stack", "Roadmap", "Pricing"… → STOP, supprime, lance \`memory_write\` + \`write_file\` à la place.
- Demander "préfères-tu A ou B ?" sur des micro-décisions design alors que l'user a déjà donné les couleurs/ambiance dans son prompt. Tu DÉDUIS et tu construis. Une seule question intake max si vraiment ambigu.

## 🎯 RÈGLE DE SORTIE (ton de réponse)
- **Texte chat ≤ 4 lignes FR.** Tout le reste passe par des tool calls. Pas de markdown long, pas de listes 1)2)3) interminables, pas de section "Roadmap/Business model/Pricing" sauf si l'user le demande EXPLICITEMENT.
- Format type : "Je construis [X pages] avec [ambiance]. Build en cours." → tool calls → "Livré : N fichiers, build vert, QA OK. [1 phrase next step optionnelle]."
- Si l'user veut un plan stratégique, il dira "fais-moi juste un plan" ou "ne code pas". Sinon → ACTION.

## Workflow OBLIGATOIRE (tours suivants, après le kickoff)
0. **INTAKE DESIGN** si la mémoire projet n'a pas \`design_notes\` → 3 questions max → \`memory_write\`.
1. Brief flou → \`delegate_architect\` puis \`delegate_designer\`.
2. \`write_file\` / \`edit_file\` avec tokens shadcn UNIQUEMENT.
3. **APRÈS CHAQUE BATCH UI** → \`read_logs(80)\` puis \`qa_visual_pixel({ design_brief })\`. Si \`FIX\`/\`REFAIRE\` → fixes + re-vérifie (max 2 itérations).
4. Erreur build/TS/Vite/import overlay → \`read_logs\` + \`build_check\` → \`read_file\` → \`edit_file\` → re-vérif logs. Jamais rendre la main sur build cassé.
5. **QA PREVIEW BLOQUANTE AVANT LIVRAISON** : avant toute phrase finale du type "livré", "terminé", "regarde la preview", tu dois avoir dans CE tour un \`read_logs(80)\` ou \`build_check({ full:false })\` sans erreur ET, pour UI, un \`qa_visual_pixel\` verdict OK. S'il reste une erreur, tu corriges ou tu dis explicitement "bloqué" avec l'erreur exacte — tu ne livres pas.
6. Conclure 1-2 phrases FR uniquement quand build vert ET qa_visual_pixel = OK.

## Règles strictes
1. **Lis avant d'éditer.** Toujours \`read_file\` avant \`edit_file\` si tu n'as pas le contenu exact.
2. **Un seul \`return\` par composant React, à l'intérieur de la fonction.** Vérifie l'équilibre des accolades \`{ }\` avant tout \`write_file\`. Une erreur "'return' outside of function" = tu as fermé la fonction trop tôt.
3. **edit_file > write_file** pour modifier l'existant.
4. **Si \`write_file\` échoue**, ne crée pas un doublon ailleurs (ex: \`Header.tsx\` au lieu de \`components/Header.tsx\`) : lis l'erreur, corrige le chemin/contenu, puis réessaie le même fichier attendu.
4bis. **Toujours câbler dans \`src/App.tsx\`.** Créer des composants/pages sans les monter = preview vide. Workflow obligatoire en fin de tâche : \`read_file('src/App.tsx')\` → \`edit_file\` ou \`write_file\` pour importer + rendre les pages/composants créés (router minimal si plusieurs pages, sinon import direct). Vérifie ensuite via \`read_logs\` que ça compile.
5. **Niveau Lovable OBLIGATOIRE dès le 1er rendu — règle non négociable, ADAPTATIVE à l'ambiance choisie à l'étape 0.**
   - INTERDIT : balises HTML brutes sans \`className\`. Tout élément visible DOIT avoir des classes Tailwind.
   - INTERDIT : couleurs hardcodées Tailwind (\`bg-slate-*\`, \`text-white\`, \`bg-blue-*\`, \`from-X to-Y\` avec couleurs précises). **TOUJOURS** des tokens sémantiques : \`bg-background\`, \`bg-card\`, \`bg-muted\`, \`bg-primary\`, \`bg-accent\`, \`text-foreground\`, \`text-muted-foreground\`, \`text-primary\`, \`text-primary-foreground\`, \`border-border\`, \`ring-ring\`. Le thème (dark premium / orange Top Chef / pastel...) vit UNIQUEMENT dans les CSS vars de \`src/index.css\`.
   - Layout : container \`max-w-7xl mx-auto px-6 py-8\`, grilles responsive, sidebar fixe si app multi-pages.
   - Cartes : \`rounded-2xl border border-border bg-card p-6 shadow-xl\` (les couleurs viennent des tokens).
   - Typo : titres \`text-3xl font-bold tracking-tight text-foreground\`, sous-titres \`text-sm font-medium text-muted-foreground uppercase tracking-wider\`, corps \`text-muted-foreground\`.
   - Boutons primary : \`bg-primary text-primary-foreground hover:bg-primary/90 font-medium px-4 py-2 rounded-lg shadow-lg transition\`. Secondaire : \`border border-border hover:bg-accent\`.
   - États : empty states avec icône + titre + texte d'aide + CTA.
   - Icônes : lucide-react uniquement (jamais d'emoji).
   - Hover/focus visibles partout (\`hover:bg-accent focus:ring-2 focus:ring-ring\`).
   - Responsive mobile-first systématique.
   - Avant tout \`write_file\` UI : "Est-ce que ça ressemble à Linear/Vercel/Lovable **dans l'ambiance demandée par l'user** ?". Si non, recommence.
6. **TypeScript strict** : pas de \`any\`, pas d'imports manquants. Si tu utilises un composant/hook → import en tête de fichier.
7. **Pas de \`npm install\`** sauf nouvelle dépendance.
8. **Concis** côté texte — tu agis avec des tools.

Le projet de base est minimal (App.tsx vide). À toi de construire — et de livrer un build vert.`;

const RUNTIME_GUARDS = `## GARDES D'EXÉCUTION NON-NÉGOCIABLES (injectés runtime)
- Mémoire strictement par projet actif : n'utilise jamais un brief/secteur venu d'un autre projet. Si mémoire ou historique contredit le dernier message utilisateur, le dernier message utilisateur gagne et tu réécris la mémoire via memory_write.
- Contexte pollué : toute mention inattendue de cuisine/restaurant/pizza/pasta/trattoria/immobilier/coaching alors que le brief ne le demande pas = erreur. Ignore ce contexte et recentre sur le domaine exact du user.
- Anti-uniformité stricte : pour un nouveau site/projet normal, les outils catalogue/blocs/templates ne sont PAS disponibles. Tu dois inventer la structure toi-même avec shadcn + tokens. Ils ne deviennent disponibles que si le user demande explicitement "utilise un bloc", "template" ou "catalogue".
- QA preview bloquante : interdiction de livrer/terminer/dire "regarde la preview" tant qu'un read_logs(80) ou build_check({ full:false }) n'est pas vert dans ce tour. Pour UI/page complète, qa_visual_pixel doit aussi être OK. En cas d'erreur Vite/import/build, tu corriges avant de rendre la main ou tu déclares un blocage explicite avec l'erreur exacte.
- Anti-boucle : après un batch write_file/edit_file UI, tu dois enchaîner sur read_logs puis qa_visual_pixel. Si qa_visual_pixel renvoie FIX/REFAIRE, applique uniquement des corrections concrètes issues de la critique, puis relance qa_visual_pixel. Si aucune correction concrète n'est possible, ARRÊTE et explique le blocage ; ne répète jamais la même écriture, le même plan ou une réponse texte sans nouvelle capture.
- 🟢 CARTE BLANCHE : si l'utilisateur dit "génère ce que tu veux", "fais comme tu le sens", "vas-y", "à toi de voir", "carte blanche", "surprends-moi", "go", "lance", "tu décides" → INTERDICTION ABSOLUE de poser une autre question. Tu DÉCIDES tout (font, textes, image hero, CTA) en cohérence avec la mémoire projet déjà sauvée, et tu enchaînes IMMÉDIATEMENT : delegate_designer → write_file(src/index.css tokens) → image_generate (si hero) → write_file(src/App.tsx ou pages/components) → read_logs → qa_visual_pixel. Une seule question intake max sur TOUT le projet, déjà consommée si tu as déjà demandé palette/font/style auparavant.
- 🚫 INTERDICTION DE S'ARRÊTER APRÈS LECTURE : si ton dernier tool call est ls/read_file/read_logs/memory_list/memory_save SANS aucun write_file/edit_file/delegate_* dans le tour, et que la demande user était de CRÉER/MODIFIER de l'UI → tu DOIS continuer dans le même tour avec delegate_designer puis write_file. Rendre la main après une simple lecture sur une demande de création = bug bloquant.
- 🚫 INTERDICTION DE QUESTIONS À TIROIRS : tu ne demandes JAMAIS plus d'1 question d'intake design pour un même projet. Si tu as déjà posé une question (palette/font/style/textes), au tour suivant tu DÉDUIS et tu construis, même si l'user n'a répondu qu'à 1 point sur 3.
- 🖼️ VISION OBLIGATOIRE : tu tournes sur un modèle multimodal (gpt-5-mini). Si le dernier message user contient une ou plusieurs images (parts \`type:image\` ou URL d'image collée dans le texte), tu DOIS d'abord appeler \`reverse_engineer_reference\` avec les URLs/images + la demande user. Le résultat devient ton contrat de reconstruction : grille, proportions, positions, couleurs, textes, cartes, images, espacements, ombres. Ensuite seulement tu codes. Si plusieurs images sont fournies, traite-les comme référence originale + rendu actuel + annotations/corrections possibles : les demandes "supprimer/modifier/déplacer" du user gagnent sur le contrat visuel. Après codage depuis une référence, appelle \`qa_reference_code\` avec images + contrat + code écrit ; si verdict FIX/REFAIRE, corrige avant de livrer. Vérifie explicitement que chaque élément demandé supprimé a disparu et que les glows/voiles lumineux visibles existent. INTERDIT de dire "je ne peux pas voir l'image", "je ne peux pas recréer à partir d'une image", "envoie-moi l'image", "fournis un upload direct" — si une image est dans le message, tu l'as. Tu ne peux dire "je n'ai pas reçu d'image" QUE si aucune image n'est effectivement dans le message courant.`;

const BodySchema = z.object({
  projectId: z.string().min(1).max(120).optional(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system", "tool"]),
      content: z.string(),
      images: z.array(z.string()).optional(),
      toolCalls: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            args: z.unknown(),
          }),
        )
        .optional(),
      toolCallId: z.string().optional(),
      toolName: z.string().optional(),
    }),
  ),
});

// Budget par appel LLM. 180s = laisse la place à un write_file initial complet.
// La doctrine edit_file-first est portée par le prompt système, pas par le timeout
// (couper à 90s casse l'UX sans rien apprendre à Elena).
const MAX_WORKSPACE_RUN_MS = 180_000;

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

type ChatMsg = z.infer<typeof BodySchema>["messages"][number];

function toModelMessages(msgs: ChatMsg[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  const pendingToolCallIds = new Set<string>();
  for (const m of msgs) {
    if (m.role === "system") {
      if (!m.content?.trim()) continue;
      out.push({ role: "system", content: m.content });
    } else if (m.role === "user") {
      // Auto-détection : URLs d'images collées dans le texte → traitées comme attachments.
      // Couvre png/jpg/jpeg/webp/gif/avif + URLs Supabase Storage chat-uploads/chat-images
      // (même sans extension), pour que le user puisse coller un lien et qu'Elena le voie.
      const urlImageRegex =
        /https?:\/\/[^\s<>"]+?\.(?:png|jpg|jpeg|webp|gif|avif)(?:\?[^\s<>"]*)?/gi;
      const storageRegex =
        /https?:\/\/[^\s<>"]+?\/storage\/v1\/object\/(?:public|sign)\/(?:chat-uploads|chat-images|public)\/[^\s<>"]+/gi;
      const inlineUrls = new Set<string>();
      const txt = m.content ?? "";
      for (const r of [urlImageRegex, storageRegex]) {
        const matches = txt.match(r);
        if (matches) for (const u of matches) inlineUrls.add(u);
      }
      const allImages = Array.from(new Set([...(m.images ?? []), ...inlineUrls]));
      const hasImages = allImages.length > 0;
      if (!m.content?.trim() && !hasImages) continue;
      if (hasImages) {
        out.push({
          role: "user",
          content: [
            {
              type: "text" as const,
              text: `Images jointes à analyser/reproduire : ${allImages.join(" | ")}`,
            },
            ...(m.content?.trim()
              ? [{ type: "text" as const, text: m.content }]
              : [
                  {
                    type: "text" as const,
                    text: "Inspire-toi de ce(s) visuel(s) de référence pour le design.",
                  },
                ]),
            {
              type: "text" as const,
              text: `URLs images à passer à reverse_engineer_reference : ${allImages.join(" | ")}`,
            },
          ],
        });
      } else {
        out.push({ role: "user", content: m.content });
      }
    } else if (m.role === "assistant") {
      const hasTools = m.toolCalls && m.toolCalls.length > 0;
      const hasText = !!m.content?.trim();
      if (!hasTools && !hasText) continue;
      if (hasTools) {
        const callIds = new Set((m.toolCalls ?? []).map((tc) => tc.id));
        const hasToolResults = msgs.some(
          (c) => c.role === "tool" && !!c.toolCallId && callIds.has(c.toolCallId),
        );
        if (!hasToolResults) {
          if (hasText) out.push({ role: "assistant", content: m.content });
          continue;
        }
        for (const id of callIds) pendingToolCallIds.add(id);
        out.push({
          role: "assistant",
          content: [
            ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
            ...(m.toolCalls ?? []).map((tc) => ({
              type: "tool-call" as const,
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.args,
            })),
          ],
        });
      } else {
        out.push({ role: "assistant", content: m.content });
      }
    } else if (m.role === "tool") {
      if (!m.toolCallId || !pendingToolCallIds.has(m.toolCallId)) continue;
      pendingToolCallIds.delete(m.toolCallId);
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result" as const,
            toolCallId: m.toolCallId ?? "unknown",
            toolName: m.toolName ?? "unknown",
            output: { type: "json", value: safeJson(m.content) as JSONValue },
          },
        ],
      });
    }
  }
  return out;
}

function getLastUserMessage(msgs: ChatMsg[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === "user" && m.content.trim()) return m.content.trim();
  }
  return "Continue la tâche en cours dans le workspace.";
}

function userExplicitlyWantsCatalogTools(msgs: ChatMsg[]): boolean {
  const last = getLastUserMessage(msgs).toLowerCase();
  const catalogWord = "(?:bloc|blocks|template|templates|catalogue|biblioth[eè]que)";
  const negative = new RegExp(`(?:n['’]?utilise pas|ne\\s+.+?\\s+pas|sans|pas de).{0,60}\\b${catalogWord}\\b`);
  if (negative.test(last)) return false;
  const positive = new RegExp(
    `(?:utilise|prends|sers-toi|base-toi|inspire-toi|cherche|ajoute|mets).{0,60}\\b${catalogWord}\\b|\\b${catalogWord}\\b.{0,60}(?:existant|catalogue|nexyra)`,
  );
  return positive.test(last);
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s };
  }
}

export const Route = createFileRoute("/api/elena-workspace")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const body = BodySchema.safeParse(await request.json().catch(() => null));
        if (!body.success) {
          return Response.json(
            { error: "Invalid body", details: body.error.format() },
            { status: 400 },
          );
        }

        // BYOK strict : on récupère les clés choisies dans le Cerveau de l'utilisateur.
        const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const workspaceId = body.data.projectId?.trim() || "default";

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.slice(7);
        const supaUser = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsErr } = await supaUser.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = claims.claims.sub as string;
        // Ne pas brancher request.signal ici : avec un flux long, le navigateur
        // peut couper le signal HTTP pendant qu'un outil serveur travaille encore.
        const timedAbort = withTimeoutSignal(undefined, MAX_WORKSPACE_RUN_MS);

        // ⚡ PERF — Timings par étape (émis dans le stream SSE en fin de tour).
        const tStart = Date.now();
        const marks: Record<string, number> = {};

        // ⚡ PERF — Parallélisation : avant on faisait 4 awaits en série
        // (routed → providerKey → openaiKey → prompt → memory). Maintenant tout
        // part en même temps. Gain typique : 400-800 ms par tour.
        const tPrepStart = Date.now();
        const [routedRes, openaiKey, activePrompt, memoryPreloaded] = await Promise.all([
          (async () => {
            const r = await resolveModelForUser(userId, "orchestrator");
            const k = await getUserProviderKey(userId, r.provider);
            return { routed: r, providerKey: k };
          })(),
          getUserProviderKey(userId, "openai"),
          getActivePrompt("elena-workspace").catch(() => null),
          readMemory(supaUser, userId, workspaceId).catch(() => null),
        ]);
        marks.prep_ms = Date.now() - tPrepStart;

        const routed = routedRes.routed;
        let orchestratorProvider: ProviderName = routed.provider;
        let orchestratorModelName = normalizeModelForProvider(orchestratorProvider, routed.model);
        let providerKey = routedRes.providerKey;

        // 💰 ROUTING ÉCONOMIQUE — classifie l'intent du dernier message user.
        // Si conversation/simple → bascule sur le modèle trivial (DeepSeek) au lieu de
        // Claude. Économie ~80% sur les échanges courts. Fallback silencieux si erreur.
        let intentLevel: IntentLevel = "complex";
        let intentKind: IntentKind = "build";
        let routedTo: "orchestrator" | "trivial" = "orchestrator";
        try {
          const lastUserMsg = getLastUserMessage(body.data.messages);
          if (lastUserMsg && lastUserMsg.trim().length >= 2) {
            const fileCount = Array.isArray(memoryPreloaded?.delivered_files) ? memoryPreloaded.delivered_files.length : 50;
            const intent = await classifyIntent(lastUserMsg, fileCount, {
              lovableApiKey: process.env.LOVABLE_API_KEY ?? null,
              cache: createClient(
                process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { persistSession: false } },
              ) as never,
            });
            intentLevel = intent.level;
            intentKind = intent.kind;
            // Bascule trivial pour conversation + simple (questions courtes, smalltalk).
            if (intent.level === "conversation" || intent.level === "simple") {
              const trivial = await resolveModelForUser(userId, "trivial_edit");
              const trivialKey = await getUserProviderKey(userId, trivial.provider);
              if (trivialKey) {
                orchestratorProvider = trivial.provider;
                orchestratorModelName = normalizeModelForProvider(trivial.provider, trivial.model);
                providerKey = trivialKey;
                routedTo = "trivial";
              }
            }
          }
        } catch (err) {
          console.warn("[elena-workspace] intent classify failed (fallback orchestrator)", (err as Error).message);
        }

        if (!providerKey) {
          timedAbort.cleanup();
          return Response.json(
            {
              error:
                `Elena ne trouve pas la clé ${orchestratorProvider}. Va dans Réglages → Clés API et ajoute cette clé, ou choisis un autre modèle dans Cerveau d'Elena.`,
            },
            { status: 412 },
          );
        }
        const llmClient = createProviderClient(orchestratorProvider, providerKey);
        // `openai` sert uniquement aux outils vision de secours. Il n'est pas appelé pour la discussion si tu as choisi DeepSeek/OpenRouter.
        const openai = openaiKey ? createOpenAI({ apiKey: openaiKey }) : null;
        const model = createProviderModel(orchestratorProvider, llmClient, orchestratorModelName);
        console.log("[elena-workspace] orchestrator route", { provider: orchestratorProvider, model: orchestratorModelName, prep_ms: marks.prep_ms, intent_level: intentLevel, intent_kind: intentKind, routed_to: routedTo });



        const allowCatalogTools = userExplicitlyWantsCatalogTools(body.data.messages);

        // Sous-agents serveur (execute fourni → SDK auto-loop)
        const coreSubAgentTools = {
          reverse_engineer_reference: tool({
            description:
              "Analyse une ou plusieurs images/maquettes AVANT tout code. Retourne un contrat visuel concret pour recréer au plus proche : grille, proportions, positions, couleurs, typo, composants, images, espacements et checklist. Obligatoire si le dernier message contient une image.",
            inputSchema: z.object({
              image_urls: z.array(z.string().url()).min(1).max(8),
              user_request: z.string().min(3),
            }),
            execute: async ({
              image_urls,
              user_request,
            }: {
              image_urls: string[];
              user_request: string;
            }) => {
              // 1) Cerveau d'Elena → Vision
              const cerveau = await resolveUserLLM(userId, "qa_visual");
              if (cerveau.ok) {
                try {
                  const cr = await reverseEngineerWithModel({
                    model: cerveau.resolved.languageModel,
                    modelLabel: cerveau.resolved.fullId,
                    imageUrls: image_urls,
                    userRequest: user_request,
                    abortSignal: timedAbort.signal,
                  });
                  return { ok: true, contract: cr.text, image_urls, model: cr.model };
                } catch (e) {
                  console.warn("[reverse_engineer workspace] Cerveau model failed, fallback:", e);
                }
              }
              // 2) Fallback Anthropic direct
              const claudeKey = await getUserAnthropicKey(userId);
              if (claudeKey) {
                try {
                  const cr = await reverseEngineerWithClaude({
                    apiKey: claudeKey,
                    imageUrls: image_urls,
                    userRequest: user_request,
                    abortSignal: timedAbort.signal,
                  });
                  return { ok: true, contract: cr.text, image_urls, model: cr.model };
                } catch (e) {
                  console.warn("[reverse_engineer workspace] Claude failed, fallback gpt-5.2:", e);
                }
              }
              if (!openai) {
                return {
                  ok: false,
                  error:
                    "Analyse image indisponible : configure la section Vision dans Cerveau d'Elena avec une clé valide.",
                };
              }
              try {
                const fetched = await fetchImagesAsBuffers(image_urls);
                const r = await generateText({
                  model: openai("gpt-5.2"),
                  abortSignal: timedAbort.signal,
                  messages: [
                    {
                      role: "user",
                      content: [
                        {
                          type: "text",
                          text: `Tu es un expert reverse-engineering UI. Analyse ces images pour qu'Elena recrée la page au plus proche, pas seulement "dans l'esprit".\n\nDemande utilisateur: ${user_request}\n\nRetourne un CONTRAT DE RECONSTRUCTION en français, concret et exploitable en React/Tailwind :\n1. Layout global : grille, colonnes, alignements, ordre vertical, proportions.\n2. Header/nav : logo, liens, boutons, hauteurs, positions.\n3. Hero : placement des blocs gauche/centre/droite, taille du H1, sous-titre, CTA.\n4. Sections/cards visibles : nombre, largeur relative, icônes, textes, décorations.\n5. Palette : hex approximatifs, gradients, glow, ombres, bordures.\n6. Typo : style, tailles relatives, poids, hiérarchie.\n7. Images/médias : ce qui doit être recréé/remplacé intelligemment.\n8. Checklist obligatoire : tous les éléments visibles à ne pas oublier.\nAjoute si utile des valeurs CSS approximatives (px, %, grid).`,
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
                return { ok: true, contract: r.text, image_urls, model: "openai/gpt-5.2" };
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, error: `Analyse image impossible: ${msg}`, image_urls };
              }
            },
          }),
          qa_reference_code: tool({
            description:
              "Contrôle qualité après reproduction depuis image. Compare les références + le contrat avec le code UI écrit, puis renvoie OK/FIX/REFAIRE et les corrections concrètes à appliquer.",
            inputSchema: z.object({
              image_urls: z.array(z.string().url()).min(1).max(8),
              user_request: z.string().min(3),
              contract: z.string().min(20),
              code_context: z.string().min(80).max(80_000),
            }),
            execute: async (args: {
              image_urls: string[];
              user_request: string;
              contract: string;
              code_context: string;
            }) => {
              const cerveau = await resolveUserLLM(userId, "qa_visual");
              if (cerveau.ok) {
                try {
                  const qa = await qaReferenceCodeWithModel({
                    model: cerveau.resolved.languageModel,
                    modelLabel: cerveau.resolved.fullId,
                    imageUrls: args.image_urls,
                    userRequest: args.user_request,
                    contract: args.contract,
                    codeContext: args.code_context,
                    abortSignal: timedAbort.signal,
                  });
                  return {
                    ok: true,
                    verdict: qa.verdict,
                    critique: qa.text,
                    image_urls: args.image_urls,
                    model: qa.model,
                  };
                } catch (e) {
                  console.warn("[qa_reference_code workspace] Cerveau model failed, fallback:", e);
                }
              }
              const claudeKey = await getUserAnthropicKey(userId);
              if (claudeKey) {
                try {
                  const qa = await qaReferenceCodeWithClaude({
                    apiKey: claudeKey,
                    imageUrls: args.image_urls,
                    userRequest: args.user_request,
                    contract: args.contract,
                    codeContext: args.code_context,
                    abortSignal: timedAbort.signal,
                  });
                  return {
                    ok: true,
                    verdict: qa.verdict,
                    critique: qa.text,
                    image_urls: args.image_urls,
                    model: qa.model,
                  };
                } catch (e) {
                  console.warn("[qa_reference_code workspace] Claude failed, fallback gpt-5.2:", e);
                }
              }
              if (!openai) {
                return {
                  ok: false,
                  error:
                    "Contrôle image indisponible : configure la section Vision dans Cerveau d'Elena avec une clé valide.",
                };
              }
              const fetchedQa = await fetchImagesAsBuffers(args.image_urls);
              const qa = await generateText({
                model: openai("gpt-5.2"),
                abortSignal: timedAbort.signal,
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: `Compare ces images de référence avec ce contrat et ce code React/Tailwind. Si le code ne permet pas une reproduction fidèle, verdict FIX ou REFAIRE. Les glows/voiles lumineux et les demandes supprimer/modifier sont bloquants.\n\nDemande:\n${args.user_request}\n\nContrat:\n${args.contract.slice(0, 12000)}\n\nCode:\n${args.code_context.slice(0, 30000)}\n\nFormat:\n## Verdict\nOK ou FIX ou REFAIRE\n\n## Écarts bloquants\n- ...\n\n## Corrections à appliquer maintenant\n1. ...`,
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
              return {
                ok: true,
                verdict,
                critique: qa.text,
                image_urls: args.image_urls,
                model: "openai/gpt-5.2",
              };
            },
          }),
          delegate_architect: tool({
            description:
              "Délègue à l'Architecte un brief flou pour obtenir un plan d'archi (arbre de fichiers, types, étapes). Utilise pour toute feature non triviale.",
            inputSchema: z.object({ brief: z.string().min(3) }),
            execute: async ({ brief }: { brief: string }) => {
              const r = await runArchitect(brief, openaiKey, userId, timedAbort.signal);
              return { plan: r.text, model: r.model };
            },
          }),
          delegate_designer: tool({
            description:
              "Délègue à la Designer un brief pour obtenir une spec visuelle premium (tokens Tailwind, typo, layout). Utilise dès qu'il y a de l'UI.",
            inputSchema: z.object({ brief: z.string().min(3) }),
            execute: async ({ brief }: { brief: string }) => {
              const r = await runDesigner(brief, openaiKey, userId, timedAbort.signal);
              return { spec: r.text, model: r.model };
            },
          }),
          delegate_developer: tool({
            description:
              "Délègue au Developer un brief technique précis pour obtenir des blocs de code TypeScript+JSX prêts à coller (1+ fichiers). Utilise pour pré-mâcher un module conséquent avant de le passer en write_file.",
            inputSchema: z.object({ brief: z.string().min(10) }),
            execute: async ({ brief }: { brief: string }) => {
              const r = await runDeveloper(brief, openaiKey, userId, timedAbort.signal);
              return { code: r.text, model: r.model };
            },
          }),
          delegate_qa_visual: tool({
            description:
              "Critique visuelle du code UI écrit. Renvoie un verdict OK/FIX et une liste de fixes actionnables (path → search/replace). À appeler après chaque batch d'écritures UI avec le brief design + le contenu des fichiers concernés.",
            inputSchema: z.object({
              design_brief: z
                .string()
                .min(3)
                .describe("Brief design d'origine (ce que l'user veut, ambiance, contraintes)."),
              code_context: z
                .string()
                .min(10)
                .describe(
                  "Contenu concaténé des fichiers UI à auditer (avec en-têtes // path/to/file.tsx).",
                ),
            }),
            execute: async ({
              design_brief,
              code_context,
            }: {
              design_brief: string;
              code_context: string;
            }) => {
              const r = await runQaVisual(
                `## Brief design\n${design_brief}\n\n## Code à auditer\n${code_context}`,
                openaiKey,
                userId,
                timedAbort.signal,
              );
              return { critique: r.text, model: r.model };
            },
          }),
          memory_write: tool({
            description:
              "Remplace les champs fournis dans la mémoire projet long terme du user. Utilise dès que le user précise/change brief, secteur ou design_notes. Champs : brief, sector, design_notes, tech_decisions[], delivered_files[], open_todos[], scratch{}. Renvoie l'état mis à jour.",
            inputSchema: z.object({
              brief: z.string().optional(),
              sector: z.string().optional(),
              design_notes: z.string().optional(),
              tech_decisions: z.array(z.string()).optional(),
              delivered_files: z.array(z.string()).optional(),
              open_todos: z.array(z.string()).optional(),
              scratch: z.record(z.string(), z.unknown()).optional(),
            }),
            execute: async (args) => {
              const m = await writeMemory(supaUser, userId, args, workspaceId);
              return { ok: true, memory: m };
            },
          }),
          memory_append: tool({
            description:
              "Ajoute aux listes existantes (déduplique, cap 100). À appeler à la fin de chaque tour qui modifie le projet : delivered_files (chemins) + nouveaux open_todos + tech_decisions clés.",
            inputSchema: z.object({
              tech_decisions: z.array(z.string()).optional(),
              delivered_files: z.array(z.string()).optional(),
              open_todos: z.array(z.string()).optional(),
            }),
            execute: async (args) => {
              const m = await appendMemory(supaUser, userId, args, workspaceId);
              return { ok: true, memory: m };
            },
          }),
          set_project_goal: tool({
            description:
              "🎯 Verrouille l'OBJECTIF PROJET long terme (le 'pourquoi' global, distinct du sujet actif court terme). À poser AU DÉBUT d'un nouveau projet, ou quand l'user demande EXPLICITEMENT de changer d'objectif. Ex : 'construire l'extension Chrome Nexyra Optimiseur pour vendeurs Vinted'. Ce goal est réinjecté dans chaque tour et détecte automatiquement les contradictions.",
            inputSchema: z.object({
              goal: z
                .string()
                .min(10)
                .max(500)
                .describe(
                  "L'objectif projet en 1 phrase claire et précise. Nomme le produit/livrable + qui + pour quoi faire.",
                ),
            }),
            execute: async (args) => {
              const { setLockedGoal } = await import(
                "@/server/elena-context-compactor.server"
              );
              await setLockedGoal(supaUser, userId, workspaceId, args.goal);
              return { ok: true, locked_goal: args.goal };
            },
          }),
        };


        const catalogTools = {
          search_blocks: tool({
            description:
              "Cherche dans la bibliothèque de blocs UI premium Nexyra. OUTIL EXCEPTIONNEL — disponible seulement si l'user demande explicitement un bloc/template/catalogue. Ne jamais utiliser pour démarrer une landing normale : compose plutôt avec shadcn sinon tous les sites se ressemblent.",
            inputSchema: z.object({
              query: z
                .string()
                .optional()
                .describe("Mots-clés FR (ex: 'hero saas gradient', 'pricing 3 plans')."),
              category: z
                .string()
                .optional()
                .describe(
                  "landing | navigation | dashboard | auth | pricing | features | testimonials | faq | cta | footer | form | gallery | booking | menu | property",
                ),
              sector: z
                .string()
                .optional()
                .describe("saas | restaurant | real_estate | portfolio | event | generic"),
              limit: z.number().int().min(1).max(20).optional(),
            }),
            execute: async (args: {
              query?: string;
              category?: string;
              sector?: string;
              limit?: number;
            }) => {
              const results = await searchBlocks({
                query: args.query,
                category: args.category,
                sector: args.sector,
                limit: args.limit,
              });
              return { count: results.length, results };
            },
          }),
          get_block: tool({
            description:
              "Récupère un bloc uniquement après une demande explicite de l'utilisateur et un search_blocks autorisé.",
            inputSchema: z.object({ slug: z.string().min(2) }),
            execute: async ({ slug }: { slug: string }) => {
              const block = await getBlockBySlug(slug);
              return block;
            },
          }),
          list_templates: tool({
            description:
              "OUTIL EXCEPTIONNEL — liste les templates seulement si l'utilisateur demande explicitement un template/catalogue. Interdit pour les projets from scratch normaux.",
            inputSchema: z.object({
              sector: z
                .string()
                .optional()
                .describe(
                  "saas | restaurant | real_estate | ecommerce | portfolio | coaching | events | blog",
                ),
              limit: z.number().int().min(1).max(20).optional(),
            }),
            execute: async (args: { sector?: string; limit?: number }) => {
              const results = await listTemplates({ sector: args.sector, limit: args.limit });
              return { count: results.length, results };
            },
          }),
          get_template: tool({
            description:
              "Récupère le détail complet d'un template uniquement après demande explicite de l'utilisateur.",
            inputSchema: z.object({ slug: z.string().min(2) }),
            execute: async ({ slug }: { slug: string }) => {
              const tpl = await getTemplateBySlug(slug);
              return tpl;
            },
          }),
        };
        const fsTools: Record<string, ReturnType<typeof tool>> = {};
        for (const name of Object.keys(workspaceToolSchemas) as Array<
          keyof typeof workspaceToolSchemas
        >) {
          fsTools[name] = tool({
            description: descriptionFor(name),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputSchema: workspaceToolSchemas[name] as any,
          });
        }

        const tools = allowCatalogTools
          ? { ...coreSubAgentTools, ...catalogTools, ...fsTools }
          : { ...coreSubAgentTools, ...fsTools };

        const callStart = Date.now();
        let activePromptName: string | null = null;
        let activePromptVersion: number | null = null;
        try {
          // 🧠 COMPACTION AUTO — au-delà de 30 messages, résume les anciens
          // dans workspace_memory.scratch.chat_summary et ne renvoie au modèle
          // que les 16 derniers. Le résumé est réinjecté dans le system prompt.
          const compaction = await compactConversation(body.data.messages, {
            supabase: supaUser,
            userId,
            workspaceId,
            openaiKey,
            memory: memoryPreloaded,
          });
          if (compaction.compacted) {
            console.log(
              `[elena-workspace] context compacted: ${body.data.messages.length} → ${compaction.messages.length} msgs`,
            );
          }

          const modelMessages = toModelMessages(compaction.messages as ChatMsg[]);
          const prompt =
            modelMessages.length === 0 ? getLastUserMessage(body.data.messages) : undefined;

          // Axe D — prompt actif versionné + few-shots premium (fallback constante si sentinelle)
          // ⚡ PERF — prompt et mémoire déjà chargés en parallèle au début (cf. Promise.all prep).
          const active = activePrompt;
          const baseSystem = !active || active.usesConstFallback ? SYSTEM_PROMPT : active.content;
          const guardedSystem = `${baseSystem}\n\n${RUNTIME_GUARDS}`;
          const fewShotMsgs = active ? fewShotsToMessages(active.fewShots) : [];
          if (active) {
            activePromptName = active.name;
            activePromptVersion = active.version;
          }

          // Axe B — injecte la mémoire projet long terme dans le system prompt
          const memory = memoryPreloaded;

          // 👤 Profil utilisateur permanent (lu en best-effort, ne bloque pas si KO)
          const userProfileBlock = await loadUserProfileBlock(supaUser, userId).catch(() => null);

          const systemWithMemory = [
            guardedSystem,
            userProfileBlock,
            memory ? memorySummaryForPrompt(memory) : null,
            compaction.summaryBlock,
          ]
            .filter(Boolean)
            .join("\n\n");

          // Préfixe few-shots devant la conversation utilisateur (sauf en mode prompt unique)
          const finalMessages = prompt ? undefined : [...fewShotMsgs, ...modelMessages];

          const wantsStream = (request.headers.get("accept") ?? "").includes("text/event-stream");

          const sharedParams = {
            model,
            system: systemWithMemory,
            ...(prompt ? { prompt } : { messages: finalMessages! }),
            tools,
            stopWhen: stepCountIs(12),
            abortSignal: timedAbort.signal,
          } as const;

          const serverToolNames = new Set([
            "reverse_engineer_reference",
            "qa_reference_code",
            "delegate_architect",
            "delegate_designer",
            "delegate_developer",
            "delegate_qa_visual",
            "search_blocks",
            "get_block",
            "list_templates",
            "get_template",
            "memory_write",
            "memory_append",
            "set_project_goal",
          ]);

          const buildFinalPayload = (result: {
            text?: string;
            steps?: ReadonlyArray<{
              toolCalls?: ReadonlyArray<{ toolCallId: string; toolName: string; input: unknown }>;
              toolResults?: ReadonlyArray<{ toolCallId: string; output?: unknown }>;
            }>;
            toolCalls?: ReadonlyArray<{ toolCallId: string; toolName: string; input: unknown }>;
            usage?: { inputTokens?: number; outputTokens?: number };
            finishReason?: string;
          }) => {
            const serverTools: Array<{ id: string; name: string; args: unknown; result: unknown }> =
              [];
            for (const step of result.steps ?? []) {
              for (const tc of step.toolCalls ?? []) {
                if (!serverToolNames.has(tc.toolName)) continue;
                const tr = step.toolResults?.find((r) => r.toolCallId === tc.toolCallId);
                serverTools.push({
                  id: tc.toolCallId,
                  name: tc.toolName,
                  args: tc.input,
                  result: (tr as { output?: unknown } | undefined)?.output,
                });
              }
            }
            const toolCalls = (result.toolCalls ?? [])
              .filter((tc) => !serverToolNames.has(tc.toolName))
              .map((tc) => ({ id: tc.toolCallId, name: tc.toolName, args: tc.input }));
            const allCalls = (result.steps ?? []).flatMap((s) => s.toolCalls ?? []);
            const writeOps = allCalls.filter(
              (tc) =>
                ["write_file", "edit_file"].includes(tc.toolName) &&
                /\.(tsx?|css)$/i.test(String((tc.input as { path?: string })?.path ?? "")),
            );
            const calledQa = allCalls.some((tc) => tc.toolName === "qa_visual_pixel");
            const qaSkipped = writeOps.length > 0 && !calledQa && toolCalls.length === 0;
            return {
              assistant: { text: result.text ?? "", toolCalls, serverTools },
              finishReason: result.finishReason,
              usage: result.usage,
              qaSkipped,
            };
          };

          if (wantsStream) {
            // Lot C — SSE streaming. Émet text-delta en temps réel puis un
            // event `done` avec le payload final (même shape que le mode JSON).
            const tStreamStart = Date.now();
            let firstTokenAt: number | null = null;
            const result = streamText(sharedParams);
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
              async start(controller) {
                const send = (event: string, data: unknown) => {
                  controller.enqueue(
                    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                  );
                };
                try {
                  for await (const part of result.fullStream) {
                    if (part.type === "text-delta") {
                      // v6: text-delta carries `text`
                      const delta =
                        (part as { text?: string; textDelta?: string }).text ??
                        (part as { text?: string; textDelta?: string }).textDelta ??
                        "";
                      if (delta) {
                        if (firstTokenAt === null) firstTokenAt = Date.now();
                        send("text-delta", { text: delta });
                      }
                    } else if (part.type === "error") {
                      const errMsg = (part as { error?: unknown }).error;
                      send("error", {
                        message: errMsg instanceof Error ? errMsg.message : String(errMsg),
                      });
                    }
                  }

                  const [text, steps, toolCalls, usage, finishReason] = await Promise.all([
                    result.text,
                    result.steps,
                    result.toolCalls,
                    result.usage,
                    result.finishReason,
                  ]);
                  const payload = buildFinalPayload({
                    text,
                    steps,
                    toolCalls,
                    usage,
                    finishReason,
                  });
                  void recordMetric({
                    userId,
                    endpoint: "workspace",
                    taskType: "orchestrator",
                    model: orchestratorModelName,
                    promptName: activePromptName,
                    promptVersion: activePromptVersion,
                    tokensInput: usage?.inputTokens ?? 0,
                    tokensOutput: usage?.outputTokens ?? 0,
                    latencyMs: Date.now() - callStart,
                    success: true,
                  });
                  // ⚡ PERF — émet le détail des timings avant le done.
                  const tNow = Date.now();
                  send("timing", {
                    prep_ms: marks.prep_ms ?? 0,
                    ttft_ms: firstTokenAt ? firstTokenAt - tStreamStart : null,
                    stream_ms: firstTokenAt ? tNow - firstTokenAt : tNow - tStreamStart,
                    total_ms: tNow - tStart,
                    steps: (steps ?? []).length,
                    model: orchestratorModelName,
                    tokens_in: usage?.inputTokens ?? 0,
                    tokens_out: usage?.outputTokens ?? 0,
                    intent_level: intentLevel,
                    intent_kind: intentKind,
                    routed_to: routedTo,
                  });
                  send("done", payload);

                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  console.error("[elena-workspace] stream error", msg);
                  send("error", { message: msg });
                } finally {
                  timedAbort.cleanup();
                  controller.close();
                }
              },
            });
            return new Response(stream, {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
              },
            });
          }

          try {
            const result = await generateText(sharedParams);
            const payload = buildFinalPayload({
              text: result.text,
              steps: result.steps,
              toolCalls: result.toolCalls,
              usage: result.usage,
              finishReason: result.finishReason,
            });
            void recordMetric({
              userId,
              endpoint: "workspace",
              taskType: "orchestrator",
              model: orchestratorModelName,
              promptName: activePromptName,
              promptVersion: activePromptVersion,
              tokensInput: result.usage?.inputTokens ?? 0,
              tokensOutput: result.usage?.outputTokens ?? 0,
              latencyMs: Date.now() - callStart,
              success: true,
            });
            return Response.json(payload);
          } finally {
            timedAbort.cleanup();
          }
        } catch (e) {
          timedAbort.cleanup();
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[elena-workspace] error", msg);
          void recordMetric({
            userId,
            endpoint: "workspace",
            taskType: "orchestrator",
            model: orchestratorModelName,
            promptName: activePromptName,
            promptVersion: activePromptVersion,
            latencyMs: Date.now() - callStart,
            success: false,
            errorMessage: msg,
          });
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});

function descriptionFor(name: keyof typeof workspaceToolSchemas): string {
  switch (name) {
    case "read_file":
      return "Lit le contenu d'un fichier du projet.";
    case "write_file":
      return "Crée ou remplace complètement un fichier. À éviter pour modifier — préfère edit_file.";
    case "edit_file":
      return "Édition chirurgicale search-replace. Le bloc 'search' doit exister exactement une fois dans le fichier.";
    case "delete_file":
      return "Supprime un fichier du projet (irréversible).";
    case "rename_file":
      return "Renomme ou déplace un fichier (path → new_path). Crée les dossiers parents si besoin.";
    case "mkdir":
      return "Crée un dossier (récursif). Utile avant d'écrire des fichiers dans une arbo nouvelle.";
    case "add_dependency":
      return "Ajoute un package npm au package.json (sans relancer npm install — il sera pris au prochain reboot). dev=true pour devDependencies.";
    case "ls":
      return "Liste les entrées d'un dossier. detailed=true pour avoir le type (file/dir) de chaque entrée.";
    case "run_command":
      return "Exécute une commande dans le WebContainer. Allowlist: npm, npx, node, ls, cat. capture=true (défaut) renvoie stdout pour debug.";
    case "read_logs":
      return "Renvoie les derniers logs du build/dev server (utile pour diagnostiquer une erreur).";
    case "build_check":
      return "Vérifie l'état du build : full=true lance `npm run build` (TS+Vite) ; full=false relit juste les logs HMR récents pour isoler les erreurs.";
    case "capture_pixel":
      return "Capture un snapshot du rendu actuel de la preview (DOM outline, counts h1/h2/buttons, viewport, console errors, body text). Utilise APRÈS write_file UI pour QA visuel automatique.";
    case "screenshot_raw":
      return "Capture un screenshot brut (JPEG base64) de la preview, sans analyse vision. Utile pour debug visuel léger sans coût LLM.";
    case "qa_visual_pixel":
      return "QA visuel multimodal (Lot 4.2) : capture un screenshot pixel de la preview + envoie à GPT-5 vision avec le brief design. Renvoie verdict OK/FIX/REFAIRE + critique pixel-level + liste de fixes prioritaires. À appeler IMPÉRATIVEMENT après chaque batch UI majeur (en complément de delegate_qa_visual qui ne voit que le code).";
  }
}
