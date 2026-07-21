/**
 * Agent tools — OpenAI function-calling schemas + executor on a virtual filesystem.
 *
 * The agent runs server-side; the "filesystem" is the in-memory snapshot of the
 * user's sandbox files sent by the client. We mutate this snapshot, and at the
 * end the client applies the diff to the real Sandpack state.
 *
 * BYOK rule: this module is provider-agnostic and ONLY consumes user/provider keys.
 * Never import LOVABLE_API_KEY here.
 *
 * Étape 9 — outils web ajoutés :
 *   - web_search : recherche temps réel via Firecrawl connector
 *   - read_url   : fetch + extraction Markdown via Firecrawl (déjà connecté)
 */

import {
  PREMIUM_BLOCKS,
  formatBlockForPrompt,
  lookupBlocks,
  listAvailableSections,
  listVibes,
  remixBlock,
  type BlockVibe,
} from "./blocks-library.server";

export interface VFile {
  path: string;
  content: string;
}

/** Convertit "hero-mushrooms" → "heroMushrooms" pour usage en variable JS/TS. */
function camelCase(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!cleaned) return "img";
  const parts = cleaned.split("-").filter(Boolean);
  return (
    parts[0].toLowerCase() +
    parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join("")
  );
}

/**
 * 🛡️ Auto-fix : convertit les usages cassés `src="/generated/X.png"` (404 dans Sandpack)
 * en imports ES6 + références dynamiques. Idempotent : si l'import existe déjà, ne touche pas.
 *
 * Détecte aussi les variantes : src='/generated/...', src="public/generated/...".
 * Limité aux fichiers code (vérifié en amont). Retourne { changed, content }.
 */
function autoFixGeneratedImagePaths(src: string): { changed: boolean; content: string } {
  const re = /src=(["'])(?:\/|public\/)generated\/([a-zA-Z0-9_-]+)\.(?:png|svg|jpg|jpeg|webp)\1/g;
  const matches = Array.from(src.matchAll(re));
  if (matches.length === 0) return { changed: false, content: src };

  // Collecte les filenames uniques détectés
  const filenames = new Set<string>();
  for (const m of matches) filenames.add(m[2]);

  let out = src;
  const importsToAdd: string[] = [];
  for (const fname of filenames) {
    const varName = camelCase(fname);
    const importLine = `import ${varName} from "@/assets/generated/${fname}";`;
    // N'ajoute pas si déjà présent
    if (!out.includes(importLine) && !new RegExp(`from\\s+["']@/assets/generated/${fname}["']`).test(out)) {
      importsToAdd.push(importLine);
    }
    // Remplace tous les src="/generated/<fname>.<ext>" → src={varName}
    const replaceRe = new RegExp(
      `src=(["'])(?:\\/|public\\/)generated\\/${fname}\\.(?:png|svg|jpg|jpeg|webp)\\1`,
      "g",
    );
    out = out.replace(replaceRe, `src={${varName}}`);
  }

  if (importsToAdd.length > 0) {
    // Insère les imports en haut du fichier (après les imports existants si présents)
    const lastImportMatch = out.match(/^(?:import[\s\S]*?from\s+["'][^"']+["'];?\s*\n)+/m);
    if (lastImportMatch) {
      const insertAt = lastImportMatch.index! + lastImportMatch[0].length;
      out = out.slice(0, insertAt) + importsToAdd.join("\n") + "\n" + out.slice(insertAt);
    } else {
      out = importsToAdd.join("\n") + "\n\n" + out;
    }
  }

  return { changed: true, content: out };
}

export type ToolName =
  | "list_files"
  | "read_file"
  | "write_file"
  | "line_replace"
  | "delete_file"
  | "rename_file"
  | "add_dependency"
  | "run_command"
  | "web_search"
  | "read_url"
  | "pilot_complete_step"
  | "pilot_start_next_step"
  | "pilot_add_item"
  | "pilot_check_item"
  | "memory_save"
  | "memory_list"
  | "memory_archive"
  | "capability_sync"
  | "cost_estimate"
  | "capability_capture"
  | "image_generate"
  | "image_edit"
  | "project_onboard"
  | "snapshot_create"
  | "ask_user"
  | "build_check"
  | "lint_fix"
  | "dependency_scan"
  | "secrets_request"
  | "screenshot_qa"
  | "inspiration_lookup"
  | "block_remix"
  | "design_blueprint"
  | "data_inspect"
  | "document_parse"
  | "preview_console_logs"
  | "voice_tts"
  | "audio_transcribe"
  | "web_read"
  | "svg_generate"
  | "github_commit"
  | "video_generate"
  | "deploy_vercel"
  | "deploy_netlify"
  | "background_job"
  | "code_execute"
  | "browser_automate"
  | "memory_remember"
  | "memory_recall"
  | "rag_index"
  | "rag_search"
  | "subagent_run"
  | "stripe_checkout_create"
  | "web_screenshot"
  | "db_query"
  | "replicate_run"
  | "exa_search"
  | "ocr_extract"
  | "image_text"
  | "apify_run"
  | "video_veo"
  | "cohere_rerank"
  | "lighthouse_audit"
  | "sentry_capture"
  | "notion_create_page"
  | "linear_create_issue"
  | "twilio_send_sms"
  | "resend_email"
  | "algolia_index"
  | "r2_upload"
  | "hubspot_contact_create"
  | "calendly_event_types"
  | "posthog_capture"
  | "slack_send_message"
  | "github_pr_create"
  | "vercel_env_set"
  | "mailchimp_subscribe"
  | "klaviyo_track"
  | "discord_webhook"
  | "notion_db_query"
  | "airtable_upsert"
  | "zapier_trigger"
  | "lemonsqueezy_checkout"
  | "plaid_link_token"
  | "shopify_product_create"
  | "webflow_cms_create"
  | "pinecone_upsert"
  | "sanity_mutate"
  | "integration_list"
  | "integration_register"
  | "pdf_extract"
  | "docx_read"
  | "docx_write"
  | "xlsx_read"
  | "xlsx_write";

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface AgentTrace {
  iteration: number;
  tool: ToolName;
  args: Record<string, unknown>;
  result: ToolResult;
}

export interface FsMutation {
  op: "write" | "delete" | "rename" | "command";
  path: string;
  newPath?: string;
  content?: string;
  /** True for destructive ops the client should confirm with the user before applying. */
  requiresConfirmation?: boolean;
  /** For op === "command": the npm script to run in the sandbox. */
  script?: string;
}

/** OpenAI tool schemas — kept compact to save tokens. */
export const OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List all file paths currently in the sandbox.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the full content of a file by path.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or overwrite a file with the given content. Use this to add new components, pages, styles. Always provide the COMPLETE final file content — partial diffs are not supported.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "e.g. App.tsx, src/Button.tsx, styles.css" },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "line_replace",
      description:
        "Patch a file by replacing an exact text section with new content. PREFER THIS over write_file for any edit that doesn't rewrite the whole file — saves tokens/credits significantly. The 'search' string must match EXACTLY (whitespace included) and appear EXACTLY ONCE in the file. For long replacements, include 2-3 unique anchor lines at the start and end of 'search'. Returns an error if 'search' is not found or is ambiguous (multiple matches).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path, e.g. src/App.tsx" },
          search: { type: "string", description: "Exact existing text to find. Must match once." },
          replace: { type: "string", description: "New text to insert in place of 'search'." },
        },
        required: ["path", "search", "replace"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file from the sandbox.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_file",
      description: "Rename or move a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          new_path: { type: "string" },
        },
        required: ["path", "new_path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_dependency",
      description:
        "Add or update an npm dependency in package.json. Sandpack/WebContainer auto-installs on save. Use this instead of `npm install` (no shell available).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "npm package name, e.g. zod" },
          version: { type: "string", description: "semver range, defaults to ^latest" },
          dev: { type: "boolean", description: "true for devDependencies" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Request the client sandbox to run a npm script (build / dev / test / lint). The actual execution happens in the user's browser; this returns a queued marker so the client can pick it up. Output will be reported in the next user turn.",
      parameters: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "npm script name from package.json, e.g. 'build', 'test', 'lint'.",
          },
        },
        required: ["script"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web via the configured Firecrawl connector for up-to-date information (docs, libraries, best practices, current events). Returns top results. Use sparingly — only when the user asks something time-sensitive or beyond your training data.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Concise search query, like a Google search." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_url",
      description:
        "Fetch a single URL and extract the main content as Markdown (uses Firecrawl). Use to read documentation pages, articles, or specific resources the user mentioned.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full https:// URL to fetch." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pilot_complete_step",
      description:
        "Marque comme TERMINÉE l'étape de pilotage en cours du projet (ou une étape précise via step_id). Utilise cet outil dès que tu as fini le travail concret d'une étape, pour que le tableau de pilotage reste à jour. Optionnel : `summary` (1 phrase, ce qui a été livré).",
      parameters: {
        type: "object",
        properties: {
          step_id: {
            type: "string",
            description:
              "UUID de l'étape (optionnel — si absent, prend l'étape active du pilot_state).",
          },
          summary: {
            type: "string",
            description: "Mini-synthèse 1 phrase de ce qui vient d'être livré.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pilot_start_next_step",
      description:
        "Passe à l'étape SUIVANTE du tableau de pilotage (même catégorie, position+1 ; sinon première étape de la catégorie suivante). Marque la nouvelle étape `in_progress` et met à jour `pilot_state`. Retourne le titre de la nouvelle étape (ou « plus d'étapes » si fin).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "pilot_add_item",
      description:
        "Ajoute une sous-fiche / sous-tâche à une étape du tableau de pilotage (composant à créer, fichier à toucher, micro-décision). Utilise step_id de l'étape active si non fourni.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre court de la sous-fiche." },
          step_id: {
            type: "string",
            description: "UUID de l'étape (optionnel — défaut = étape active).",
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pilot_check_item",
      description: "Coche (ou décoche) une sous-fiche du tableau de pilotage par son UUID.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          done: {
            type: "boolean",
            description: "true pour cocher, false pour décocher (défaut true).",
          },
        },
        required: ["item_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_save",
      description:
        "Sauvegarde UNE règle persistante pour ce projet (mémoire mem:// style Lovable). Utilise dès que l'utilisateur exprime une préférence, un refus, une décision design ou une contrainte métier qu'il ne faudra JAMAIS violer ni reproposer. Exemples : « pas de Hero violet », « toujours utiliser shadcn », « cible = ados 13-18 ». Garde body court (1-3 phrases) avec « Pourquoi : … » si pertinent.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["core", "design", "constraint", "preference", "feature", "reference"],
            description:
              "core = règle universelle, constraint = interdiction, preference = manière de faire, design = visuel, feature = règle métier, reference = lien.",
          },
          title: { type: "string", description: "Nom court (3-6 mots)." },
          body: { type: "string", description: "La règle en 1-3 phrases." },
          pinned: {
            type: "boolean",
            description: "true si toujours injecté en core, défaut false.",
          },
        },
        required: ["kind", "title", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_list",
      description:
        "Liste les règles mémoire actuelles du projet (filtrable par kind). À utiliser AVANT une décision design/produit pour vérifier qu'aucune règle existante n'est en conflit.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["core", "design", "constraint", "preference", "feature", "reference"],
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_archive",
      description:
        "Archive (soft-delete) une règle mémoire devenue obsolète, par UUID. Utilise quand l'utilisateur change d'avis explicitement.",
      parameters: {
        type: "object",
        properties: {
          memory_id: { type: "string" },
        },
        required: ["memory_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "capability_sync",
      description:
        "Synchronise une carte du tableau de pilotage Nexyra (table /capabilities). Utilise-le après CHAQUE chantier Nexyra terminé pour : 1) marquer comme `done` les items existants, 2) ajouter les nouveaux items réalisés. Réservé admin. Match par (category_id + title) — repasse le même titre pour update.",
      parameters: {
        type: "object",
        properties: {
          category_id: { type: "string", description: "Ex: 'agent-v2', 'memory', 'pilot'" },
          category_label: { type: "string", description: "Ex: 'Roadmap V2 — Elena Lovable-grade'" },
          category_icon: {
            type: "string",
            description: "Nom d'icône lucide (ex: 'rocket', 'brain'). Défaut: 'sparkles'.",
          },
          title: { type: "string", description: "Titre court de la capacité." },
          info: { type: "string", description: "Description 1-3 phrases." },
          status: {
            type: "string",
            enum: ["todo", "in_progress", "done"],
            description: "Défaut: 'done'.",
          },
          priority: {
            type: "string",
            enum: ["P0", "P1", "P2", "P3"],
            description: "Défaut: 'P1'.",
          },
        },
        required: ["category_id", "category_label", "title", "info"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cost_estimate",
      description:
        "Estime le coût mensuel projeté d'un projet (USD) à partir des 30 derniers jours. Renvoie projected_monthly_usd, last7/last30, avg_per_message_usd, top_models, pct_of_quota. Utilise quand l'utilisateur demande le budget ou avant un gros chantier.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "UUID du projet (optionnel — défaut = projet en cours).",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "capability_capture",
      description:
        "Capture une idée d'amélioration mentionnée par l'utilisateur en chat et la pousse comme `todo` dans le tableau de pilotage Nexyra (catégorie « 💡 Idées capturées »). Utilise dès que l'utilisateur évoque une fonctionnalité/amélioration future SANS demander de l'implémenter immédiatement (ex: « il faudrait que », « ce serait bien si », « plus tard on pourrait », « note l'idée »). Évite les fuites d'idées. Réservé admin — ignore silencieusement si erreur 'forbidden'.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Titre court de l'idée (max 80 chars), verbe à l'infinitif idéalement.",
          },
          info: {
            type: "string",
            description: "Description 1-2 phrases : ce qu'il faut faire et pourquoi.",
          },
          priority: {
            type: "string",
            enum: ["P0", "P1", "P2", "P3"],
            description: "Défaut: 'P1'.",
          },
        },
        required: ["title", "info"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_generate",
      description:
        "Génère une image et la sauve dans `src/assets/generated/<filename>.ts` (export default dataURL base64). Cascade automatique BYOK : 1) **OpenAI gpt-image-1** (clé user — prioritaire, qualité photo+typo excellente), 2) fal.ai premium (Flux/Recraft/Ideogram) si FAL_KEY dispo, 3) Lovable AI (Nano Banana) en fallback, 4) SVG placeholder. ⚡ USAGE OBLIGATOIRE : importe l'image comme module ES6 → `import imgHero from \"@/assets/generated/hero\"` puis `<img src={imgHero} alt=\"...\" />`. JAMAIS `<img src=\"/generated/...\" />` (chemins publics ne marchent PAS dans Sandpack). RÈGLE CRITIQUE : utilise cet outil dès qu'il faut un visuel — JAMAIS de <div> gris, JAMAIS demander à l'utilisateur de fournir des images.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "Description détaillée en anglais (style, lumière, composition, mood). Plus c'est précis, mieux c'est.",
          },
          filename: {
            type: "string",
            description: "Nom kebab-case sans extension (ex: 'hero-product', 'icon-feature-1').",
          },
          style: {
            type: "string",
            enum: ["photo", "illustration", "text-image", "auto"],
            description:
              "photo=Flux Pro Ultra (réalisme), illustration=Recraft v3 (vectoriel), text-image=Ideogram v2 (texte lisible dans l'image), auto=défaut Flux.",
          },
          aspect_ratio: {
            type: "string",
            enum: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"],
            description: "Ratio. Défaut 16:9 pour hero, 1:1 pour avatar/icône, 9:16 pour mobile.",
          },
        },
        required: ["prompt", "filename"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_edit",
      description:
        "Édite/retouche/embellit une image existante via OpenAI gpt-image-1 (BYOK clé user). Source = filename d'une image déjà générée (présente dans src/assets/generated/<source>.ts ou public/generated/<source>.png). Utilise quand l'utilisateur veut modifier (ex: changer couleur ciel, retirer fond, ajouter glow, embellir). Sauvegarde sous un nouveau nom et retourne le snippet d'import. Nécessite une clé OpenAI configurée par l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          source_filename: {
            type: "string",
            description: "Nom du fichier source (sans extension), ex: 'hero-product'.",
          },
          target_filename: {
            type: "string",
            description: "Nom du fichier de sortie (sans extension), ex: 'hero-product-v2'.",
          },
          instruction: {
            type: "string",
            description:
              "Instruction d'édition en anglais (ex: 'make the sky purple', 'remove the background', 'add a subtle glow').",
          },
        },
        required: ["source_filename", "target_filename", "instruction"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_onboard",
      description:
        "À utiliser EXCLUSIVEMENT au TOUT DÉBUT d'un nouveau projet (≤ 3 fichiers dans la sandbox ET aucune mémoire projet existante) pour poser 2-4 questions clés guidant le brief : public cible, style visuel souhaité, fonctionnalités prioritaires, références d'inspiration. Renvoie les questions au front qui les affichera comme choix cliquables. NE PAS utiliser sur projet déjà commencé.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            description: "Liste de 2 à 4 questions ciblées avec options.",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                header: { type: "string", description: "Label court (ex: 'Public cible')" },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["label", "description"],
                  },
                },
              },
              required: ["question", "header", "options"],
            },
          },
        },
        required: ["questions"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "snapshot_create",
      description:
        "Crée un snapshot rapide du projet (label court, ex: 'avant refonte hero'). À utiliser AVANT toute modification destructive ou refonte importante. L'utilisateur pourra restaurer ce snapshot depuis l'UI. Coût négligeable.",
      parameters: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Label court (max 60 chars), ex: 'pré-refonte hero'.",
          },
        },
        required: ["label"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Pose UNE question de clarification à l'utilisateur quand un choix structurant n'est PAS évident depuis le brief/mémoire (ex: 2 directions UX possibles, choix techno, scope ambigü). Ne PAS utiliser pour des micro-décisions ou si la mémoire/brief tranche déjà. Stop l'exécution : Elena attend la réponse. Max 3 options.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "Question claire en français, terminer par '?'.",
          },
          header: { type: "string", description: "Tag court (ex: 'Direction UX')." },
          options: {
            type: "array",
            description: "2 ou 3 options claires.",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                description: { type: "string" },
              },
              required: ["label", "description"],
            },
          },
        },
        required: ["question", "header", "options"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_check",
      description:
        "Vérifie SYNTAXIQUEMENT les fichiers générés (parse JS/TS/JSX/TSX, JSON valide, imports résolus dans la VFS). À utiliser EN FIN DE TOUR avant de livrer pour s'assurer que rien ne plante au build. Renvoie la liste des erreurs détectées avec fichier+ligne. NE PAS sauter cette étape pour les refontes UI ou créations multi-fichiers.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "screenshot_qa",
      description:
        "QA VISUELLE statique — analyse les fichiers UI générés (JSX/TSX + styles.css/index.css + Tailwind classes) et détecte les problèmes de qualité visuelle AVANT livraison : (1) tokens couleur non définis, (2) classes hardcoded interdites (text-white, bg-black, text-gray-*), (3) sections sans contenu/image, (4) hero sans CTA, (5) contraste suspect, (6) manque de gradient/shadow premium, (7) padding/spacing absents, (8) images manquantes (src vide ou cassé), (9) responsive manquant (pas de md:/lg:). Retourne un score /100 + liste d'issues priorisées. À appeler APRÈS build_check, AVANT la phrase finale, sur tout chantier UI.",
      parameters: {
        type: "object",
        properties: {
          paths: {
            type: "array",
            items: { type: "string" },
            description:
              "Optionnel — fichiers UI à auditer en priorité. Si absent, scanne tous les .tsx/.jsx/.css de la VFS.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspiration_lookup",
      description:
        "Récupère 2-3 patterns UI premium (best practices Lovable-grade) pour un type de section donné (hero, pricing, footer, dashboard, etc.). Utilise des références internes éprouvées. À appeler AVANT de coder une section visuelle importante pour garantir un design 2026.",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            description:
              "Type de section : hero, pricing, footer, features, testimonials, cta, navbar, dashboard, auth, mobile-app, mobile-auth, mobile-feed, mobile-profile, mobile-settings, mobile-onboarding.",
          },
          vibe: {
            type: "string",
            description:
              "Ambiance visuelle : minimal, glassmorphism, brutalist, neon, premium-dark, editorial.",
          },
        },
        required: ["section"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "block_remix",
      description:
        "Applique une variation stylistique (vibe) à un bloc de la bibliothèque et retourne le TSX transformé prêt à coller. Utilise pour adapter rapidement un bloc à un autre style sans tout réécrire (ex: passer un hero premium-dark en minimal Apple-like). Vibes : premium-dark, minimal, glassmorphism, brutalist, editorial, neon. Tu peux aussi changer radius (sharp/soft/pill), densité (airy/compact) et accent OKLCH.",
      parameters: {
        type: "object",
        properties: {
          block_id: {
            type: "string",
            description: "ID exact du bloc (ex: 'saas-hero-mesh', 'mobile-onboarding'). Utilise inspiration_lookup pour découvrir.",
          },
          vibe: {
            type: "string",
            enum: ["premium-dark", "minimal", "glassmorphism", "brutalist", "editorial", "neon"],
            description: "Style cible. Défaut = premium-dark (no-op).",
          },
          radius: {
            type: "string",
            enum: ["sharp", "soft", "pill"],
            description: "Force tous les rounded-* du bloc (sharp=none, soft=plus arrondi, pill=full).",
          },
          density: {
            type: "string",
            enum: ["airy", "compact", "default"],
            description: "Ajuste paddings/gaps globalement.",
          },
          accent: {
            type: "string",
            description: "Couleur d'accent OKLCH (ex: 'oklch(70% 0.2 25)') à mettre dans --primary de styles.css.",
          },
        },
        required: ["block_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "design_blueprint",
      description:
        "🚨 ÉTAPE 1 OBLIGATOIRE pour tout chantier UI (création app/landing/site/dashboard depuis zéro OU refonte visuelle complète). Force la planification AVANT le code : palette OKLCH, typo, layout, sections ordonnées, images planifiées. L'output devient le contrat à respecter pour le reste du tour. NE JAMAIS sauter cette étape sur création/refonte. Si déjà appelé dans un tour, ne pas réappeler.",
      parameters: {
        type: "object",
        properties: {
          project_kind: {
            type: "string",
            enum: ["saas-landing", "website", "mobile-app", "dashboard", "auth-flow", "other"],
            description: "Nature du projet à concevoir.",
          },
          domain: {
            type: "string",
            description: "Secteur métier en 1-3 mots (ex: 'champignons gastronomie', 'fintech B2B', 'fitness coach').",
          },
          vibe: {
            type: "string",
            enum: ["premium-dark", "minimal", "glassmorphism", "editorial", "brutalist", "neon", "warm-organic"],
            description: "Ambiance visuelle cible.",
          },
          palette: {
            type: "object",
            description: "Palette OKLCH minimale. Couleurs en notation oklch(L% C H) ex: 'oklch(60% 0.2 250)'.",
            properties: {
              background: { type: "string", description: "Fond principal (sombre si vibe=premium-dark)." },
              foreground: { type: "string", description: "Texte principal (clair si fond sombre)." },
              primary: { type: "string", description: "Couleur d'action principale (CTA, liens)." },
              accent: { type: "string", description: "Couleur d'accent (gradients, highlights)." },
              muted: { type: "string", description: "Texte secondaire / surfaces neutres." },
            },
            required: ["background", "foreground", "primary", "accent", "muted"],
            additionalProperties: false,
          },
          typography: {
            type: "object",
            properties: {
              heading_font: { type: "string", description: "Famille Google Font pour titres (ex: Inter, Space Grotesk, Playfair Display)." },
              body_font: { type: "string", description: "Famille Google Font pour corps (ex: Inter, Manrope)." },
              h1_size_clamp: { type: "string", description: "clamp() pour H1 (ex: 'clamp(2.5rem, 7vw, 5rem)')." },
            },
            required: ["heading_font", "body_font", "h1_size_clamp"],
            additionalProperties: false,
          },
          sections: {
            type: "array",
            description: "Liste ordonnée des sections (3 à 8). Pour chacune : nom + bloc biblio à utiliser (ex: 'saas-hero-mesh') ou 'custom' si invention.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom court de la section (ex: 'Hero', 'Tarifs')." },
                block_id: { type: "string", description: "ID d'un bloc de la biblio (cf. inspiration_lookup) OU 'custom'." },
                purpose: { type: "string", description: "Objectif business de la section en 1 phrase." },
              },
              required: ["name", "block_id", "purpose"],
              additionalProperties: false,
            },
            minItems: 3,
            maxItems: 8,
          },
          images: {
            type: "array",
            description: "3 à 8 images à générer EN PARALLÈLE après le blueprint. Chaque image = 1 prompt précis + variable + flag hero.",
            items: {
              type: "object",
              properties: {
                variable: { type: "string", description: "Nom de variable JS pour l'import (ex: 'heroProduct')." },
                prompt: { type: "string", description: "Prompt image_generate complet et précis." },
                aspect: { type: "string", description: "Ratio (1:1, 3:4, 16:9, 9:16, etc.)." },
                hero: { type: "boolean", description: "true = image clé → utilise google/gemini-3-pro-image-preview." },
              },
              required: ["variable", "prompt", "aspect", "hero"],
              additionalProperties: false,
            },
            minItems: 3,
            maxItems: 8,
          },
        },
        required: ["project_kind", "domain", "vibe", "palette", "typography", "sections", "images"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "data_inspect",
      description:
        "Analyse rapide d'un fichier de données (CSV ou JSON) déjà présent dans le projet : nombre de lignes/colonnes, types détectés, aperçu des premières lignes. Idéal avant de coder un dashboard ou une transformation.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin du fichier dans le projet (ex: 'data/users.csv')." },
          rows_preview: { type: "number", description: "Nombre de lignes à afficher (défaut 5, max 20)." },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "document_parse",
      description:
        "Parse un document binaire (PDF, DOCX, PPTX) accessible via une URL publique et retourne son contenu en Markdown structuré (titres, paragraphes, tables). Utilise LlamaParse Cloud — nécessite la clé `llamaparse` dans Réglages.",
      parameters: {
        type: "object",
        properties: {
          source_url: { type: "string", description: "URL publique du document à parser." },
          language: { type: "string", description: "Code langue ISO (ex: 'fr', 'en'). Optionnel." },
        },
        required: ["source_url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_console_logs",
      description:
        "Récupère les derniers logs console (log/warn/error) capturés depuis la preview sandbox du projet courant. Indispensable pour diagnostiquer un bug runtime sans demander à l'utilisateur de copier-coller la console.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "UUID du projet (optionnel — déduit du contexte)." },
          level: {
            type: "string",
            enum: ["log", "warn", "error", "all"],
            description: "Filtrer par niveau (défaut 'all').",
          },
          limit: { type: "number", description: "Nombre max de logs (défaut 50, max 200)." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "voice_tts",
      description:
        "Synthèse vocale premium via ElevenLabs (clé `elevenlabs_api_key` requise). Retourne une URL MP3 publique hébergée sur Lovable Cloud. Idéal pour générer voix-off, démos audio, prototypes d'agents vocaux.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte à vocaliser (max 5000 caractères)." },
          voice_id: {
            type: "string",
            description:
              "ID voix ElevenLabs (par défaut Aria — multilingue). Ex: '9BWtsMINqrJLrRacOk9x' (Aria), 'CwhRBWXzGAHq8TQ4Fs17' (Roger), 'EXAVITQu4vr4xnSDxMaL' (Sarah).",
          },
          model_id: {
            type: "string",
            description: "Modèle TTS (défaut 'eleven_turbo_v2_5'). Alternatives : 'eleven_multilingual_v2', 'eleven_v3'.",
          },
          language: { type: "string", description: "Code langue ISO (ex: 'fr', 'en'). Optionnel — auto-détecté." },
          stability: { type: "number", description: "0-1, stabilité de la voix (défaut 0.5)." },
          similarity_boost: { type: "number", description: "0-1, fidélité au timbre (défaut 0.75)." },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "audio_transcribe",
      description:
        "Transcription audio Whisper Large v3 Turbo via Groq (clé `groq_api_key` requise). Reçoit une URL audio publique (MP3/WAV/M4A/OGG, ≤25 Mo) et retourne le texte avec langue + durée détectées.",
      parameters: {
        type: "object",
        properties: {
          audio_url: { type: "string", description: "URL publique de l'audio à transcrire." },
          language: { type: "string", description: "Code langue ISO (ex: 'fr', 'en'). Optionnel — auto-détecté." },
          prompt: { type: "string", description: "Contexte/glossaire pour orienter la transcription. Optionnel." },
          model: {
            type: "string",
            description: "Modèle Groq (défaut 'whisper-large-v3-turbo'). Alternatives : 'whisper-large-v3'.",
          },
        },
        required: ["audio_url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_read",
      description:
        "Lit n'importe quelle URL publique et retourne son contenu nettoyé en Markdown via Jina Reader (gratuit sans clé, accélèré + quotas plus larges avec clé `jina_api_key`). Idéal pour scraper docs, blogs, pages produits avant de coder.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL http(s) à lire." },
          max_chars: { type: "number", description: "Tronque la sortie (défaut 12000, max 30000)." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "svg_generate",
      description:
        "Génère une illustration vectorielle ou un logo via Recraft V3 (clé `recraft_api_key`). Sortie SVG hébergée sur Lovable Cloud + option d'écriture directe dans le projet. Pour icônes/logos/illustrations brand.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Description détaillée du visuel souhaité." },
          style: {
            type: "string",
            description:
              "Style Recraft : 'vector_illustration' (défaut), 'icon', 'digital_illustration', 'logo_raster'.",
          },
          substyle: { type: "string", description: "Sous-style Recraft (optionnel, ex: 'flat_2', 'line_art')." },
          save_path: {
            type: "string",
            description:
              "Chemin VFS pour sauvegarder le SVG dans le projet (ex: 'src/assets/logo.svg'). Optionnel.",
          },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_commit",
      description:
        "Pousse un ou plusieurs fichiers dans un repo GitHub via l'API Contents (clé `github_api_token`, scope `repo`). Crée la branche/commit, gère création + update (sha auto). Option PR vers la branche par défaut.",
      parameters: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repo cible au format 'owner/name'." },
          branch: { type: "string", description: "Branche cible (défaut = branche par défaut du repo)." },
          message: { type: "string", description: "Message de commit." },
          files: {
            type: "array",
            description: "1 à 50 fichiers à committer (path + content).",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "Chemin dans le repo (ex: 'src/index.ts')." },
                content: { type: "string", description: "Contenu texte du fichier." },
              },
              required: ["path", "content"],
              additionalProperties: false,
            },
            minItems: 1,
            maxItems: 50,
          },
          create_pr: { type: "boolean", description: "Si true, ouvre une PR vers la branche par défaut." },
          pr_title: { type: "string", description: "Titre PR (si create_pr)." },
          pr_body: { type: "string", description: "Description PR (si create_pr)." },
        },
        required: ["repo", "message", "files"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "video_generate",
      description:
        "Génère une vidéo image-to-video via Runway Gen-4 Turbo (clé `runway_api_key`). Fournis une URL d'image source + un prompt texte. Polling auto ~90s, retourne URL MP4 ou message 'en cours'.",
      parameters: {
        type: "object",
        properties: {
          prompt_image: { type: "string", description: "URL publique de l'image source." },
          prompt_text: { type: "string", description: "Description du mouvement / scène (optionnel)." },
          model: {
            type: "string",
            enum: ["gen3a_turbo", "gen4_turbo"],
            description: "Modèle Runway (défaut 'gen4_turbo').",
          },
          ratio: { type: "string", description: "Ratio (ex: '1280:720', '720:1280'). Défaut 1280:720." },
          duration: { type: "number", enum: [5, 10], description: "Durée en secondes (5 ou 10). Défaut 5." },
        },
        required: ["prompt_image"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deploy_vercel",
      description:
        "Lance un déploiement Vercel production depuis un repo GitHub (clé `vercel_api_token`). Crée la deployment via API v13 et retourne l'URL preview.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom du projet Vercel (slug)." },
          repo: { type: "string", description: "Repo GitHub source au format 'owner/name'." },
          ref: { type: "string", description: "Branche Git (défaut 'main')." },
          team_id: { type: "string", description: "ID team Vercel (optionnel)." },
          project_id: { type: "string", description: "ID projet Vercel (optionnel, défaut = name)." },
        },
        required: ["name", "repo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deploy_netlify",
      description:
        "Déclenche un build Netlify d'un site existant (clé `netlify_api_token`). Le site doit déjà être configuré (lié à un repo Git ou drop manuel).",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string", description: "ID ou nom du site Netlify (ex: 'my-app' ou UUID)." },
          clear_cache: { type: "boolean", description: "Si true, vide le cache build avant de redéployer." },
        },
        required: ["site_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "background_job",
      description:
        "Lance un job long-running async via Trigger.dev v3 (clé `trigger_api_key`). Idéal pour traitement batch, scraping, génération massive. Le task_identifier doit déjà exister côté Trigger.dev.",
      parameters: {
        type: "object",
        properties: {
          task_identifier: { type: "string", description: "ID de la task Trigger.dev (ex: 'send-emails')." },
          payload: { type: "object", description: "Données passées à la task (JSON arbitraire)." },
          queue: { type: "string", description: "Queue spécifique (optionnel)." },
          delay_ms: { type: "number", description: "Délai avant exécution en ms (optionnel)." },
        },
        required: ["task_identifier"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "code_execute",
      description:
        "Exécute du code Python/Node/Bash dans une sandbox isolée E2B (clé `e2b_api_key`). Retourne stdout/stderr/résultats. Idéal pour calcul, data analysis, prototype rapide AVANT d'écrire du code dans les fichiers du projet. Timeout max 120 s, code max 50k chars.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Code source à exécuter." },
          language: {
            type: "string",
            enum: ["python", "node", "bash"],
            description: "Langage (default: python).",
          },
          timeout_ms: { type: "number", description: "Timeout en ms (1000–120000, default 30000)." },
        },
        required: ["code"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_automate",
      description:
        "Pilote un navigateur Playwright headless cloud via Browserbase (clés `browserbase_api_key` + `browserbase_project_id`). Permet click/type/scroll, extraction texte/links/html, screenshot. Pour scraper sites JS-heavy, valider un parcours UX, capturer une preuve visuelle.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL http(s) à visiter." },
          actions: {
            type: "array",
            description: "Actions séquentielles (max 10) : click, type, wait, scroll.",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["click", "type", "wait", "scroll"] },
                selector: { type: "string" },
                text: { type: "string" },
                ms: { type: "number" },
                y: { type: "number" },
              },
              required: ["type"],
            },
          },
          extract: {
            type: "string",
            enum: ["text", "links", "html"],
            description: "Type d'extraction (default: text).",
          },
          screenshot: { type: "boolean", description: "Capture PNG de la page." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_remember",
      description:
        "Stocke un souvenir long-terme dans Mem0 (clé `mem0_api_key`), attaché à l'utilisateur courant. Persiste entre toutes les sessions et tous les projets. À utiliser pour préférences durables, faits clés sur l'utilisateur ou son business, décisions importantes. Max 5000 chars.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Texte du souvenir (1–5000 chars)." },
          category: { type: "string", description: "Catégorie libre (ex: 'préférence', 'business', 'fait')." },
          metadata: { type: "object", description: "Métadonnées arbitraires (clé/valeur)." },
        },
        required: ["content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_recall",
      description:
        "Recherche sémantique top-k dans la mémoire long-terme Mem0 (clé `mem0_api_key`). À utiliser avant chaque tâche importante pour récupérer le contexte utilisateur pertinent (préférences, faits passés, projets antérieurs).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Question ou contexte recherché." },
          limit: { type: "number", description: "Nombre max de résultats (1–20, default 5)." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rag_index",
      description:
        "Indexe un texte dans la mémoire vectorielle du projet courant (table project_docs). Embedding OpenAI text-embedding-3-small (clé `openai_api_key`). À utiliser pour brief, doc produit, transcript meeting, recherche utilisateur — tout ce qui doit être retrouvé sémantiquement plus tard via rag_search. Max 30k chars.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre court (default: 'Note')." },
          content: { type: "string", description: "Texte à indexer (1–30000 chars)." },
          tags: { type: "array", items: { type: "string" }, description: "Tags libres (max 20)." },
        },
        required: ["content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rag_search",
      description:
        "Recherche sémantique top-k dans la mémoire vectorielle du projet courant. À appeler AVANT chaque tâche projet importante pour récupérer brief, contraintes, décisions passées. Cosine similarity ≥ 0.5 par défaut.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Question ou mots-clés." },
          limit: { type: "number", description: "Top-k (1–20, default 5)." },
          min_similarity: { type: "number", description: "Seuil cosine (0–1, default 0.5)." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "subagent_run",
      description:
        "Lance un sous-agent focalisé pour décomposer/synthétiser une sous-tâche : un appel LLM unique, prompt système strict, pas d'outils. Utile pour brainstorm court, reformulation, plan d'attaque détaillé d'un point précis. Modèle par défaut gpt-4o-mini (clé `openai_api_key`).",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "Objectif précis du sous-agent." },
          context: { type: "string", description: "Contexte additionnel (max 12000 chars)." },
          model: { type: "string", description: "Modèle OpenAI (default gpt-4o-mini, ex: gpt-4o, gpt-5-mini)." },
          max_tokens: { type: "number", description: "Tokens max de réponse (100–4000, default 800)." },
        },
        required: ["goal"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stripe_checkout_create",
      description:
        "Crée une Stripe Checkout Session pour un Price ID existant (clé `stripe_secret_key`). Mode 'payment' (one-shot) ou 'subscription'. Retourne l'URL à donner à l'utilisateur. Le price doit déjà exister dans le compte Stripe.",
      parameters: {
        type: "object",
        properties: {
          price_id: { type: "string", description: "Stripe Price ID (commence par 'price_')." },
          mode: {
            type: "string",
            enum: ["payment", "subscription"],
            description: "Mode du checkout (default: payment).",
          },
          success_url: { type: "string", description: "URL de redirection après succès." },
          cancel_url: { type: "string", description: "URL de redirection si annulation." },
          customer_email: { type: "string", description: "Email pré-rempli (optionnel)." },
          quantity: { type: "number", description: "Quantité (1–100, default 1)." },
        },
        required: ["price_id", "success_url", "cancel_url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_screenshot",
      description:
        "Capture PNG (base64) d'une URL via Firecrawl. Utile pour preuve visuelle, QA d'un site distant, partage rapide d'un design vu en ligne. Aucune clé utilisateur requise.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL http(s)." },
          full_page: { type: "boolean", description: "Si true, capture toute la page (sinon viewport seul)." },
          wait_for: { type: "number", description: "Délai d'attente avant capture en ms (0–10000)." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "db_query",
      description:
        "SELECT contraint sur la base Lovable Cloud du projet, exécuté avec la session de l'utilisateur (RLS appliquée). Lecture seule, max 100 lignes. Filtres whitelist : eq, neq, gt, gte, lt, lte, like, ilike, in. À utiliser pour inspecter ses propres données (commandes, leads, conversations, etc.) avant d'agir.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "Nom de la table (snake_case)." },
          columns: { type: "string", description: "Colonnes type 'a,b,c' (default '*')." },
          filters: {
            type: "array",
            description: "Filtres séquentiels (AND).",
            items: {
              type: "object",
              properties: {
                column: { type: "string" },
                op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in"] },
                value: {},
              },
              required: ["column", "op", "value"],
            },
          },
          order_by: {
            type: "object",
            properties: {
              column: { type: "string" },
              ascending: { type: "boolean" },
            },
            required: ["column"],
          },
          limit: { type: "number", description: "Lignes max (1–100, default 25)." },
        },
        required: ["table"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replicate_run",
      description:
        "Exécute n'importe quel modèle Replicate (10000+ disponibles : SDXL, Llama, Whisper, music gen, etc.). Crée la prediction et polle jusqu'à 120 s. Clé `replicate_api_token`. Format model: 'owner/name', sinon utiliser 'version' (hash de version).",
      parameters: {
        type: "object",
        properties: {
          model: { type: "string", description: "Identifiant 'owner/name' (ex: 'meta/llama-3-8b-instruct')." },
          version: { type: "string", description: "Hash de version (alternative à model)." },
          input: { type: "object", description: "Inputs du modèle (cf. doc Replicate du modèle)." },
          timeout_ms: { type: "number", description: "Timeout total ms (5000–120000, default 60000)." },
        },
        required: ["input"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "exa_search",
      description:
        "Recherche neurale sémantique via Exa.ai (clé `exa_api_key`). Retourne URLs+titre+score, et optionnellement extrait le texte. Bien meilleur que keyword pour 'trouve-moi des essais sur X' ou 'startups qui font Y'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Requête en langage naturel." },
          num_results: { type: "number", description: "Top-k (1–20, default 5)." },
          type: {
            type: "string",
            enum: ["neural", "keyword", "auto"],
            description: "Stratégie de recherche (default auto).",
          },
          include_text: { type: "boolean", description: "Récupère un extrait texte par résultat." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ocr_extract",
      description:
        "OCR document/image (PDF, PNG, JPG) via Mistral OCR (clé `mistral_api_key`). Renvoie le texte en Markdown structuré, page par page. Idéal pour parser des factures, contrats, slides, captures.",
      parameters: {
        type: "object",
        properties: {
          document_url: { type: "string", description: "URL http(s) publique du document/image." },
          include_image_base64: { type: "boolean", description: "Inclut les images embarquées en base64." },
        },
        required: ["document_url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "image_text",
      description:
        "Génère une image avec TEXTE LISIBLE via Ideogram 3.0 (clé `ideogram_api_key`). Bien meilleur que image_generate pour posters, logos textuels, ads, mockups, slides — Ideogram excelle sur la typographie.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Description complète, mentionner le texte exact entre guillemets." },
          aspect_ratio: {
            type: "string",
            enum: ["1x1", "16x9", "9x16", "4x3", "3x4", "3x2", "2x3"],
            description: "Ratio (default 1x1).",
          },
          rendering_speed: {
            type: "string",
            enum: ["TURBO", "DEFAULT", "QUALITY"],
            description: "TURBO rapide & moins cher, QUALITY meilleur rendu.",
          },
          style_type: {
            type: "string",
            enum: ["AUTO", "GENERAL", "REALISTIC", "DESIGN"],
            description: "DESIGN = posters/logos, REALISTIC = photo.",
          },
          magic_prompt: { type: "string", enum: ["AUTO", "ON", "OFF"] },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apify_run",
      description:
        "Lance un Actor Apify (scrapers prêts à l'emploi : Google Maps, Instagram, LinkedIn, Amazon, TikTok…). BYOK `apify_api_token`. Retourne directement les items du dataset (synchrone).",
      parameters: {
        type: "object",
        properties: {
          actor_id: {
            type: "string",
            description: "ID de l'actor, ex 'compass~google-maps-scraper' ou 'apify~web-scraper'.",
          },
          input: {
            type: "object",
            description: "Input JSON spécifique à l'actor (voir docs Apify de l'actor).",
            additionalProperties: true,
          },
          max_items: { type: "number", description: "Plafond items (1–500, default 50)." },
          timeout_ms: { type: "number", description: "Timeout total en ms (10s–5min)." },
        },
        required: ["actor_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "video_veo",
      description:
        "Génère une vidéo 8s avec Veo 3 (Google) via fal.ai (clé `fal_api_key`). Qualité cinéma + audio synchronisé. Polling jusqu'à 5 min. Retourne URL MP4.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Description riche de la scène (caméra, lumière, action)." },
          aspect_ratio: { type: "string", enum: ["16:9", "9:16", "1:1"] },
          duration: { type: "string", enum: ["8s"] },
          generate_audio: { type: "boolean", description: "Audio natif Veo 3 (default true)." },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cohere_rerank",
      description:
        "Reranking sémantique d'une liste de documents pour une requête, via Cohere (clé `cohere_api_key`). À utiliser APRÈS rag_search ou web_search pour ne garder que les meilleurs hits — boost massif de qualité RAG.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          documents: { type: "array", items: { type: "string" }, description: "Textes candidats (max 1000)." },
          top_n: { type: "number", description: "Nb à garder (default 5)." },
          model: { type: "string", description: "Default 'rerank-v3.5'." },
        },
        required: ["query", "documents"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lighthouse_audit",
      description:
        "Audit Lighthouse complet (Performance, A11y, Best Practices, SEO) via Google PageSpeed Insights. Aucun BYOK obligatoire (clé optionnelle `pagespeed_api_key` pour quotas). Retourne scores + Core Web Vitals.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL http(s) publique à auditer." },
          strategy: { type: "string", enum: ["mobile", "desktop"], description: "Default mobile." },
          categories: {
            type: "array",
            items: { type: "string", enum: ["performance", "accessibility", "best-practices", "seo", "pwa"] },
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sentry_capture",
      description:
        "Envoie un event/message à Sentry (BYOK `sentry_dsn`). Permet à Elena de logger erreurs détectées, alertes ou jalons monitoring directement dans le projet Sentry de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Texte du message ou erreur." },
          level: { type: "string", enum: ["fatal", "error", "warning", "info", "debug"] },
          tags: { type: "object", additionalProperties: { type: "string" } },
          extra: { type: "object", additionalProperties: true },
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notion_create_page",
      description:
        "Crée une page Notion (BYOK `notion_api_key`). Fournir parent_page_id OU parent_database_id.",
      parameters: {
        type: "object",
        properties: {
          parent_page_id: { type: "string" },
          parent_database_id: { type: "string" },
          title: { type: "string" },
          content: { type: "string", description: "Paragraphe initial optionnel (max 2000 chars)." },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "linear_create_issue",
      description:
        "Crée une issue Linear via GraphQL (BYOK `linear_api_key`). Nécessite team_id (UUID Linear).",
      parameters: {
        type: "object",
        properties: {
          team_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "number", enum: [0, 1, 2, 3, 4], description: "0 none → 4 low." },
        },
        required: ["team_id", "title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "twilio_send_sms",
      description:
        "Envoie un SMS (ou WhatsApp si whatsapp=true) via Twilio. BYOK `twilio_account_sid` + `twilio_auth_token`. Numéros au format E.164 (+33...).",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Destinataire E.164." },
          from: { type: "string", description: "Numéro Twilio expéditeur E.164." },
          body: { type: "string" },
          whatsapp: { type: "boolean" },
        },
        required: ["to", "from", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resend_email",
      description:
        "Envoie un email transactionnel via Resend (BYOK `resend_api_key`). 'from' doit utiliser un domaine vérifié.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
          },
          subject: { type: "string" },
          html: { type: "string" },
          text: { type: "string" },
          reply_to: { type: "string" },
        },
        required: ["from", "to", "subject"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "algolia_index",
      description:
        "Indexe (ou met à jour si object_id fourni) un objet dans un index Algolia. BYOK `algolia_app_id` + `algolia_admin_key`.",
      parameters: {
        type: "object",
        properties: {
          index_name: { type: "string" },
          object: { type: "object", additionalProperties: true },
          object_id: { type: "string" },
        },
        required: ["index_name", "object"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "r2_upload",
      description:
        "Upload un fichier texte vers Cloudflare R2 (compatible S3) via SigV4. BYOK `r2_endpoint` (https://<acct>.r2.cloudflarestorage.com), `r2_access_key_id`, `r2_secret_access_key`.",
      parameters: {
        type: "object",
        properties: {
          bucket: { type: "string" },
          key: { type: "string", description: "Chemin objet dans le bucket." },
          content: { type: "string", description: "Contenu texte (UTF-8)." },
          content_type: { type: "string", description: "Default text/plain; charset=utf-8." },
        },
        required: ["bucket", "key", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hubspot_contact_create",
      description:
        "Crée ou met à jour (upsert sur email) un contact HubSpot CRM. BYOK `hubspot_private_token`.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          firstname: { type: "string" },
          lastname: { type: "string" },
          phone: { type: "string" },
          company: { type: "string" },
          properties: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Propriétés HubSpot custom additionnelles.",
          },
        },
        required: ["email"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendly_event_types",
      description:
        "Liste les event types Calendly (URLs de réservation) de l'utilisateur connecté. BYOK `calendly_api_key`.",
      parameters: {
        type: "object",
        properties: {
          active_only: { type: "boolean", description: "Filtrer actifs (default true)." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "posthog_capture",
      description:
        "Envoie un event analytics PostHog (capture). BYOK `posthog_api_key` (+ optionnel `posthog_host` pour self-hosted/EU).",
      parameters: {
        type: "object",
        properties: {
          event: { type: "string", description: "Nom de l'event, ex 'signup_completed'." },
          distinct_id: { type: "string", description: "ID utilisateur unique." },
          properties: { type: "object", additionalProperties: true },
          host: { type: "string", description: "Override host (ex https://eu.i.posthog.com)." },
        },
        required: ["event", "distinct_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "slack_send_message",
      description:
        "Poste un message dans un canal Slack via chat.postMessage. BYOK `slack_bot_token` (xoxb-...). Le bot doit être membre du canal.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", description: "ID canal (C0123...) ou #nom." },
          text: { type: "string" },
          thread_ts: { type: "string", description: "Pour répondre dans un thread." },
          blocks: { type: "array", description: "Block Kit Slack (optionnel).", items: { type: "object" } },
        },
        required: ["channel", "text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_pr_create",
      description:
        "Ouvre une Pull Request GitHub. BYOK `github_token` (PAT avec scope `repo`).",
      parameters: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Format 'owner/name'." },
          title: { type: "string" },
          head: { type: "string", description: "Branche source." },
          base: { type: "string", description: "Branche cible (ex 'main')." },
          body: { type: "string", description: "Description PR (markdown supporté)." },
          draft: { type: "boolean" },
        },
        required: ["repo", "title", "head", "base"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vercel_env_set",
      description:
        "Ajoute ou met à jour (upsert) une variable d'environnement sur un projet Vercel. BYOK `vercel_api_token`.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "ID Vercel du projet (prj_...)." },
          key: { type: "string", description: "MAJUSCULES_AVEC_UNDERSCORES." },
          value: { type: "string" },
          target: {
            type: "array",
            items: { type: "string", enum: ["production", "preview", "development"] },
          },
          type: { type: "string", enum: ["encrypted", "plain"] },
          team_id: { type: "string" },
        },
        required: ["project_id", "key", "value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mailchimp_subscribe",
      description:
        "Ajoute ou met à jour un membre dans une audience Mailchimp (upsert sur email). BYOK `mailchimp_api_key` (format xxxx-usZ).",
      parameters: {
        type: "object",
        properties: {
          list_id: { type: "string", description: "ID de l'audience Mailchimp." },
          email: { type: "string" },
          status: { type: "string", enum: ["subscribed", "pending", "unsubscribed", "cleaned"] },
          merge_fields: { type: "object", additionalProperties: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["list_id", "email"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "klaviyo_track",
      description:
        "Envoie un event analytics Klaviyo (server-side). BYOK `klaviyo_api_key` (Private API key pk_...).",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", description: "Nom de l'event, ex 'Placed Order'." },
          email: { type: "string" },
          properties: { type: "object", additionalProperties: true },
          value: { type: "number", description: "Valeur monétaire optionnelle." },
        },
        required: ["metric", "email"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "discord_webhook",
      description:
        "Poste un message dans un canal Discord via webhook. BYOK `discord_webhook_url` (URL complète du webhook).",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          username: { type: "string" },
          avatar_url: { type: "string" },
          embeds: { type: "array", items: { type: "object" }, description: "Embeds Discord (optionnel)." },
        },
        required: ["content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notion_db_query",
      description:
        "Query une base de données Notion avec filter/sorts. BYOK `notion_api_key` (intégration interne secret_...).",
      parameters: {
        type: "object",
        properties: {
          database_id: { type: "string" },
          filter: { type: "object", description: "Objet filter Notion." },
          sorts: { type: "array", items: { type: "object" } },
          page_size: { type: "number", description: "Default 25, max 100." },
        },
        required: ["database_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "airtable_upsert",
      description:
        "Crée ou met à jour des records Airtable (jusqu'à 10/appel). BYOK `airtable_api_key` (PAT pat...) + `airtable_base_id` (app...) ou via param.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "Nom de la table." },
          records: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                fields: { type: "object", additionalProperties: true },
              },
              required: ["fields"],
            },
          },
          upsert_fields: {
            type: "array",
            items: { type: "string" },
            description: "Si défini, performUpsert sur ces champs (max 3).",
          },
          base_id: { type: "string", description: "Override base_id (sinon depuis BYOK)." },
        },
        required: ["table", "records"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "zapier_trigger",
      description:
        "Déclenche un Zap via webhook Zapier. BYOK `zapier_webhook_url` ou via param `webhook_url`.",
      parameters: {
        type: "object",
        properties: {
          payload: { type: "object", additionalProperties: true },
          webhook_url: { type: "string", description: "Override URL (sinon depuis BYOK)." },
        },
        required: ["payload"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lemonsqueezy_checkout",
      description:
        "Crée une session de checkout Lemon Squeezy et retourne l'URL de paiement. BYOK `lemonsqueezy_api_key` + `lemonsqueezy_store_id`.",
      parameters: {
        type: "object",
        properties: {
          variant_id: { type: ["string", "number"], description: "ID du variant (produit) à vendre." },
          store_id: { type: ["string", "number"] },
          email: { type: "string" },
          name: { type: "string" },
          custom: { type: "object", additionalProperties: { type: "string" } },
          redirect_url: { type: "string" },
          receipt_link_url: { type: "string" },
        },
        required: ["variant_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plaid_link_token",
      description:
        "Crée un Plaid link_token côté serveur pour démarrer Plaid Link dans le frontend (banking onboarding). BYOK `plaid_client_id` + `plaid_secret`.",
      parameters: {
        type: "object",
        properties: {
          client_user_id: { type: "string", description: "ID utilisateur unique côté app." },
          client_name: { type: "string" },
          products: { type: "array", items: { type: "string" }, description: "Default ['auth','transactions']." },
          country_codes: { type: "array", items: { type: "string" } },
          language: { type: "string" },
          env: { type: "string", enum: ["sandbox", "development", "production"] },
        },
        required: ["client_user_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shopify_product_create",
      description:
        "Crée un produit dans une boutique Shopify via l'Admin REST API. BYOK `shopify_admin_token` (shpat_...) + `shopify_shop_domain` (mystore.myshopify.com).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body_html: { type: "string", description: "Description HTML." },
          vendor: { type: "string" },
          product_type: { type: "string" },
          tags: { type: ["string", "array"], items: { type: "string" } },
          status: { type: "string", enum: ["active", "draft", "archived"] },
          variants: {
            type: "array",
            items: {
              type: "object",
              properties: {
                price: { type: "string" },
                sku: { type: "string" },
                option1: { type: "string" },
              },
            },
          },
          images: {
            type: "array",
            items: { type: "object", properties: { src: { type: "string" } } },
          },
          shop_domain: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "webflow_cms_create",
      description:
        "Crée un item dans une collection Webflow CMS (v2 API). BYOK `webflow_api_token`. Param `publish=true` pour publier en live directement.",
      parameters: {
        type: "object",
        properties: {
          collection_id: { type: "string" },
          field_data: { type: "object", additionalProperties: true, description: "Champs slug, name, etc." },
          is_draft: { type: "boolean" },
          is_archived: { type: "boolean" },
          publish: { type: "boolean", description: "true = publie live, false = brouillon." },
        },
        required: ["collection_id", "field_data"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pinecone_upsert",
      description:
        "Upsert jusqu'à 100 vecteurs dans un index Pinecone (serverless). BYOK `pinecone_api_key` + `pinecone_index_host` (ex my-idx-xxx.svc.region.pinecone.io).",
      parameters: {
        type: "object",
        properties: {
          vectors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                values: { type: "array", items: { type: "number" } },
                metadata: { type: "object", additionalProperties: true },
              },
              required: ["id", "values"],
            },
          },
          namespace: { type: "string" },
          index_host: { type: "string", description: "Override host (sinon BYOK)." },
        },
        required: ["vectors"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sanity_mutate",
      description:
        "Applique des mutations (create/createOrReplace/patch/delete) à un dataset Sanity. BYOK `sanity_api_token` + `sanity_project_id` (+ optionnel `sanity_dataset`, default 'production').",
      parameters: {
        type: "object",
        properties: {
          mutations: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            description: "Tableau de mutations Sanity (max 50).",
          },
          project_id: { type: "string" },
          dataset: { type: "string" },
          return_documents: { type: "boolean" },
        },
        required: ["mutations"],
        additionalProperties: false,
      },
    },
  },
] as const;

const MAX_FILE_SIZE = 80_000;

function normalize(p: string): string {
  return p.replace(/^\/+/, "");
}

/**
 * Execute a tool call against the in-memory VFS.
 * Returns a string result fed back to the model.
 *
 * Async-safe : web_search/read_url passent par les helpers externes ;
 * pour rester compatible avec l'agent loop existant (sync), ces deux outils
 * sont gérés *avant* d'arriver ici par le route handler. Si appelés ici,
 * on retourne un message d'erreur explicite.
 */
export function executeTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  vfs: Map<string, string>,
  mutations: FsMutation[],
): ToolResult {
  try {
    switch (name) {
      case "list_files": {
        const list = Array.from(vfs.keys()).sort();
        return { ok: true, output: list.length ? list.join("\n") : "(empty)" };
      }
      case "read_file": {
        const path = normalize(String(rawArgs.path ?? ""));
        if (!path) return { ok: false, output: "Missing path" };
        const c = vfs.get(path);
        if (c === undefined) return { ok: false, output: `File not found: ${path}` };
        const truncated =
          c.length > MAX_FILE_SIZE ? c.slice(0, MAX_FILE_SIZE) + "\n[…truncated]" : c;
        return { ok: true, output: truncated };
      }
      case "write_file": {
        const path = normalize(String(rawArgs.path ?? ""));
        let content = String(rawArgs.content ?? "");
        if (!path) return { ok: false, output: "Missing path" };
        if (content.length > MAX_FILE_SIZE) {
          return { ok: false, output: `File too large (${content.length} > ${MAX_FILE_SIZE})` };
        }
        // 🛡️ Auto-fix anti-bug images : si Elena écrit `<img src="/generated/X.png">`
        // (bug historique : Sandpack ne sert pas public/* statiquement → alt text seul s'affiche),
        // on convertit en import ES6 + balise dynamique. Marche pour .png .svg .jpg .webp.
        const isCode = /\.(tsx|jsx|ts|js|astro|vue|svelte)$/i.test(path);
        if (isCode) {
          const fixed = autoFixGeneratedImagePaths(content);
          if (fixed.changed) {
            content = fixed.content;
          }
        }
        vfs.set(path, content);
        mutations.push({ op: "write", path, content });
        return { ok: true, output: `Wrote ${path} (${content.length} chars)` };
      }
      case "line_replace": {
        const path = normalize(String(rawArgs.path ?? ""));
        const search = String(rawArgs.search ?? "");
        const replace = String(rawArgs.replace ?? "");
        if (!path) return { ok: false, output: "Missing path" };
        if (!search) return { ok: false, output: "Missing 'search' string" };
        const current = vfs.get(path);
        if (current === undefined) return { ok: false, output: `File not found: ${path}` };
        const idx = current.indexOf(search);
        if (idx === -1) {
          return {
            ok: false,
            output: `'search' not found in ${path}. Read the file again to check exact whitespace, or fall back to write_file.`,
          };
        }
        if (current.indexOf(search, idx + 1) !== -1) {
          return {
            ok: false,
            output: `'search' is ambiguous in ${path} (multiple matches). Add more unique anchor context to 'search'.`,
          };
        }
        let next = current.slice(0, idx) + replace + current.slice(idx + search.length);
        if (next.length > MAX_FILE_SIZE) {
          return { ok: false, output: `Result too large (${next.length} > ${MAX_FILE_SIZE})` };
        }
        // 🛡️ Auto-fix anti-bug images sur les fichiers code (idempotent)
        const isCode = /\.(tsx|jsx|ts|js|astro|vue|svelte)$/i.test(path);
        if (isCode) {
          const fixed = autoFixGeneratedImagePaths(next);
          if (fixed.changed) next = fixed.content;
        }
        vfs.set(path, next);
        mutations.push({ op: "write", path, content: next });
        const delta = next.length - current.length;
        return {
          ok: true,
          output: `Patched ${path} (${search.length} → ${replace.length} chars, Δ ${delta >= 0 ? "+" : ""}${delta})`,
        };
      }
      case "delete_file": {
        const path = normalize(String(rawArgs.path ?? ""));
        if (!path) return { ok: false, output: "Missing path" };
        if (!vfs.has(path)) return { ok: false, output: `File not found: ${path}` };
        vfs.delete(path);
        mutations.push({ op: "delete", path, requiresConfirmation: true });
        return {
          ok: true,
          output: `Marked ${path} for deletion (awaiting user confirmation in UI)`,
        };
      }
      case "rename_file": {
        const path = normalize(String(rawArgs.path ?? ""));
        const newPath = normalize(String(rawArgs.new_path ?? ""));
        if (!path || !newPath) return { ok: false, output: "Missing path/new_path" };
        const c = vfs.get(path);
        if (c === undefined) return { ok: false, output: `File not found: ${path}` };
        if (vfs.has(newPath)) return { ok: false, output: `Target exists: ${newPath}` };
        vfs.delete(path);
        vfs.set(newPath, c);
        mutations.push({ op: "rename", path, newPath });
        return { ok: true, output: `Renamed ${path} → ${newPath}` };
      }
      case "add_dependency": {
        const dep = String(rawArgs.name ?? "").trim();
        if (!dep || !/^[@a-z0-9][\w@./-]*$/i.test(dep)) {
          return { ok: false, output: "Invalid package name" };
        }
        const version = String(rawArgs.version ?? "latest").trim() || "latest";
        const isDev = rawArgs.dev === true;
        const pkgKey = vfs.has("package.json")
          ? "package.json"
          : Array.from(vfs.keys()).find((k) => k.endsWith("/package.json"));
        if (!pkgKey) return { ok: false, output: "package.json not found in sandbox" };
        let pkg: Record<string, unknown>;
        try {
          pkg = JSON.parse(vfs.get(pkgKey) ?? "{}");
        } catch {
          return { ok: false, output: "package.json is not valid JSON" };
        }
        const field = isDev ? "devDependencies" : "dependencies";
        const deps = (pkg[field] as Record<string, string> | undefined) ?? {};
        deps[dep] = version === "latest" ? "latest" : version;
        pkg[field] = deps;
        const next = JSON.stringify(pkg, null, 2) + "\n";
        vfs.set(pkgKey, next);
        mutations.push({ op: "write", path: pkgKey, content: next });
        return {
          ok: true,
          output: `Added ${dep}@${version} to ${field}. Sandbox will reinstall on next save.`,
        };
      }
      case "run_command": {
        const script = String(rawArgs.script ?? "").trim();
        if (!script || !/^[a-z0-9:_-]{1,40}$/i.test(script)) {
          return { ok: false, output: "Invalid script name" };
        }
        mutations.push({ op: "command", path: "(sandbox)", script });
        return {
          ok: true,
          output: `Queued \`npm run ${script}\` for the sandbox. The user's browser will execute it; output will be reported on the next message.`,
        };
      }
      case "web_search":
      case "read_url":
        return {
          ok: false,
          output: `${name} doit être géré en amont (async). Bug du route handler.`,
        };
      default:
        return { ok: false, output: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : "tool error" };
  }
}

/**
 * Async tool exec — pour web_search / read_url qui font du fetch externe.
 * Retourne null si l'outil n'est pas un async tool (le caller utilisera executeTool).
 */
export async function executeAsyncTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  vfs?: Map<string, string>,
  mutations?: FsMutation[],
  opts?: { openaiKey?: string | null; ideogramKey?: string | null },
): Promise<ToolResult | null> {
  // image_generate — priorité OpenAI gpt-image-1 (BYOK user) puis fal.ai puis Lovable AI.
  if (name === "image_generate") {
    if (!vfs || !mutations) {
      return { ok: false, output: "image_generate: vfs/mutations requis" };
    }
    const prompt = String(rawArgs.prompt ?? "").trim();
    const filename = String(rawArgs.filename ?? "")
      .trim()
      .replace(/[^a-z0-9-]/gi, "-")
      .toLowerCase();
    const style = String(rawArgs.style ?? "auto") as
      | "photo"
      | "illustration"
      | "text-image"
      | "auto";
    const aspectRatio = String(rawArgs.aspect_ratio ?? "16:9");
    if (!prompt || !filename) return { ok: false, output: "prompt + filename requis" };

    const falKey = process.env.FAL_KEY;
    const publicPath = `public/generated/${filename}.png`;
    // ⚡ FIX SANDBOX : on stocke aussi la dataURL dans un module TS importable.
    // Sandpack ne sert PAS public/* comme assets HTTP statiques → <img src="/generated/x.png">
    // retournait 404 et seul l'alt text s'affichait. Le module TS contourne ça :
    // import img from "@/assets/generated/x" → <img src={img} /> fonctionne partout.
    const tsAssetPath = `src/assets/generated/${filename}.ts`;
    const buildTsModule = (dataUrl: string, modelUsed: string): string =>
      `// Auto-généré par image_generate (${modelUsed}) — ne pas éditer à la main.\n// Pour utiliser : import ${camelCase(filename)} from "@/assets/generated/${filename}";\nconst ${camelCase(filename)}: string = ${JSON.stringify(dataUrl)};\nexport default ${camelCase(filename)};\n`;

    // Helper : sauvegarde une dataURL ou télécharge depuis URL et stocke en dataURL
    const saveImage = async (urlOrData: string, modelUsed: string): Promise<ToolResult> => {
      let dataUrl = urlOrData;
      if (urlOrData.startsWith("http")) {
        try {
          const r = await fetch(urlOrData);
          if (!r.ok) throw new Error(`download HTTP ${r.status}`);
          const buf = await r.arrayBuffer();
          const b64 = Buffer.from(buf).toString("base64");
          const mime = r.headers.get("content-type") || "image/png";
          dataUrl = `data:${mime};base64,${b64}`;
        } catch (e) {
          return {
            ok: false,
            output: `image download failed: ${e instanceof Error ? e.message : String(e)}`,
          };
        }
      }
      // 1) PNG dans public/ (export futur, déploiement hors sandbox)
      vfs!.set(publicPath, dataUrl);
      mutations!.push({ op: "write", path: publicPath, content: dataUrl });
      // 2) Module TS dans src/assets/ (ce qui marche RÉELLEMENT dans Sandpack)
      const tsModule = buildTsModule(dataUrl, modelUsed);
      vfs!.set(tsAssetPath, tsModule);
      mutations!.push({ op: "write", path: tsAssetPath, content: tsModule });
      const importVar = camelCase(filename);
      return {
        ok: true,
        output: `🖼️ Image générée (${modelUsed}). USAGE OBLIGATOIRE :\n\`\`\`tsx\nimport ${importVar} from "@/assets/generated/${filename}";\n<img src={${importVar}} alt="..." className="..." />\n\`\`\`\nNE PAS utiliser \`<img src="/generated/${filename}.png" />\` — les chemins publics ne fonctionnent pas dans la sandbox preview.`,
      };
    };

    // Routing fal.ai par style
    const falModel =
      style === "illustration"
        ? "fal-ai/recraft-v3"
        : style === "text-image"
          ? "fal-ai/ideogram/v2"
          : "fal-ai/flux-pro/v1.1-ultra"; // photo / auto

    // Mémorise les erreurs pour message final clair
    const failures: string[] = [];

    // Helper retry : 1 retry sur 429/5xx avec backoff 800ms (transient errors only)
    const fetchRetry = async (url: string, init: RequestInit): Promise<Response> => {
      let r = await fetch(url, init);
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        await new Promise((res) => setTimeout(res, 800));
        r = await fetch(url, init);
      }
      return r;
    };

    // ---------- Tentative Ideogram v3 (PRIORITÉ pour style=text-image) ----------
    const ideogramKey = opts?.ideogramKey ?? null;
    if (style === "text-image" && ideogramKey) {
      try {
        const form = new FormData();
        form.append("prompt", prompt);
        form.append("aspect_ratio", aspectRatio.replace(":", "x"));
        form.append("rendering_speed", "DEFAULT");
        form.append("style_type", "DESIGN");
        form.append("magic_prompt", "AUTO");
        const ideoRes = await fetchRetry("https://api.ideogram.ai/v1/ideogram-v3/generate", {
          method: "POST",
          headers: { "Api-Key": ideogramKey },
          body: form,
        });
        if (ideoRes.ok) {
          const json = await ideoRes.json();
          const imgUrl = json?.data?.[0]?.url;
          if (imgUrl) return await saveImage(imgUrl, "ideogram-v3");
          failures.push("ideogram-v3 : aucune image retournée");
        } else {
          const t = await ideoRes.text().catch(() => "");
          failures.push(`ideogram-v3 HTTP ${ideoRes.status}: ${t.slice(0, 140)}`);
        }
      } catch (e) {
        failures.push(`ideogram-v3 error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ---------- Tentative 0 : OpenAI gpt-image-1 (clé user, prioritaire BYOK) ----------
    const openaiKey = opts?.openaiKey ?? null;
    if (openaiKey) {
      try {
        // gpt-image-1 supporte les sizes : 1024x1024, 1024x1536 (portrait), 1536x1024 (paysage), auto
        const size =
          aspectRatio === "1:1"
            ? "1024x1024"
            : aspectRatio === "9:16" || aspectRatio === "3:4"
              ? "1024x1536"
              : "1536x1024"; // 16:9, 21:9, 4:3, auto → paysage
        const oaiRes = await fetchRetry("https://api.openai.com/v1/images/generations", {
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
            quality: "medium", // low / medium / high — medium = compromis coût/qualité
          }),
        });
        if (oaiRes.ok) {
          const json = await oaiRes.json();
          const b64 = json?.data?.[0]?.b64_json;
          if (b64 && typeof b64 === "string") {
            return await saveImage(`data:image/png;base64,${b64}`, "openai/gpt-image-1");
          }
          failures.push("openai/gpt-image-1 : aucune image retournée");
        } else {
          const errText = await oaiRes.text().catch(() => "");
          failures.push(
            `openai/gpt-image-1 HTTP ${oaiRes.status}: ${errText.slice(0, 160)}`,
          );
        }
      } catch (e) {
        failures.push(
          `openai/gpt-image-1 network error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } else {
      failures.push("openai : clé user non disponible");
    }

    // ---------- Tentative 1 : fal.ai (premium) ----------
    if (falKey) {
      try {
        const falBody: Record<string, unknown> = { prompt };
        if (falModel.includes("flux-pro")) {
          falBody.aspect_ratio = aspectRatio;
          falBody.num_images = 1;
          falBody.enable_safety_checker = true;
        } else if (falModel.includes("recraft")) {
          falBody.image_size =
            aspectRatio === "1:1"
              ? "square_hd"
              : aspectRatio === "9:16"
                ? "portrait_16_9"
                : "landscape_16_9";
          falBody.style = "vector_illustration";
        } else if (falModel.includes("ideogram")) {
          falBody.aspect_ratio = aspectRatio.replace(":", "_");
          falBody.style = "design";
        }

        const falRes = await fetchRetry(`https://fal.run/${falModel}`, {
          method: "POST",
          headers: {
            Authorization: `Key ${falKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(falBody),
        });

        if (falRes.ok) {
          const json = await falRes.json();
          const imgUrl = json?.images?.[0]?.url || json?.image?.url || json?.url;
          if (imgUrl && typeof imgUrl === "string") {
            return await saveImage(imgUrl, falModel.split("/").slice(1).join("/"));
          }
          failures.push(`fal.ai (${falModel}) : aucune image retournée`);
        } else {
          const errText = await falRes.text().catch(() => "");
          // Détection compte épuisé / clé invalide → on enchaîne le fallback
          const lower = errText.toLowerCase();
          const exhausted =
            falRes.status === 402 ||
            falRes.status === 403 ||
            lower.includes("exhausted") ||
            lower.includes("balance");
          failures.push(
            exhausted
              ? `fal.ai : compte épuisé (HTTP ${falRes.status})`
              : `fal.ai HTTP ${falRes.status}: ${errText.slice(0, 120)}`
          );
        }
      } catch (e) {
        failures.push(`fal.ai network error: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      failures.push("fal.ai : FAL_KEY non configurée");
    }

    // ---------- Tentative 2 : Lovable AI Gateway (fallback gratuit/inclus) ----------
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (lovableKey) {
      try {
        const lovRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: `${prompt} (aspect ratio: ${aspectRatio})` }],
            modalities: ["image", "text"],
          }),
        });

        if (lovRes.ok) {
          const json = await lovRes.json();
          const dataUrl = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (dataUrl && typeof dataUrl === "string") {
            return await saveImage(dataUrl, "lovable-ai/nano-banana (fallback)");
          }
          failures.push("Lovable AI : aucune image retournée");
        } else {
          const errText = await lovRes.text().catch(() => "");
          failures.push(`Lovable AI HTTP ${lovRes.status}: ${errText.slice(0, 120)}`);
        }
      } catch (e) {
        failures.push(`Lovable AI error: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      failures.push("Lovable AI : LOVABLE_API_KEY non configurée");
    }

    // ---------- Tentative 3 : SVG placeholder Nexyra (dernier recours, gratuit) ----------
    const [w, h] = (() => {
      const map: Record<string, [number, number]> = {
        "1:1": [1024, 1024],
        "16:9": [1280, 720],
        "9:16": [720, 1280],
        "4:3": [1024, 768],
        "3:4": [768, 1024],
      };
      return map[aspectRatio] ?? [1280, 720];
    })();
    const safeLabel = prompt.replace(/[<>&"]/g, "").slice(0, 60);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0A0A0F"/>
      <stop offset="50%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="50%" y="50%" font-family="Inter, system-ui, sans-serif" font-size="${Math.round(w / 28)}" font-weight="700" fill="white" text-anchor="middle" dominant-baseline="middle" opacity="0.95">${safeLabel}</text>
  <text x="50%" y="${h - 40}" font-family="Inter, sans-serif" font-size="18" fill="white" text-anchor="middle" opacity="0.5">Nexyra · placeholder</text>
</svg>`;
    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    // 1) SVG public/ pour export futur
    vfs.set(publicPath.replace(/\.png$/, ".svg"), svgDataUrl);
    mutations.push({
      op: "write",
      path: publicPath.replace(/\.png$/, ".svg"),
      content: svgDataUrl,
    });
    // 2) Module TS importable (le seul qui marche dans Sandpack)
    const tsModule = `// Auto-généré (SVG placeholder Nexyra) — fallback car providers IA indisponibles.\nconst ${camelCase(filename)}: string = ${JSON.stringify(svgDataUrl)};\nexport default ${camelCase(filename)};\n`;
    vfs.set(tsAssetPath, tsModule);
    mutations.push({ op: "write", path: tsAssetPath, content: tsModule });
    const importVar = camelCase(filename);
    // ⚠️ ok:false — l'agent DOIT signaler clairement à l'utilisateur qu'aucun
    // provider IA n'a pu générer une vraie image, et lui demander de configurer
    // une clé OpenAI (ou FAL_KEY) dans Réglages → Clés API.
    return {
      ok: false,
      output: `❌ AUCUNE IMAGE IA GÉNÉRÉE — placeholder SVG posé à la place.\n\nProviders essayés (tous KO) :\n${failures.map((f) => `  • ${f}`).join("\n")}\n\n👉 ACTION REQUISE : dis à l'utilisateur en français, clairement, dans ta prochaine réponse :\n   « Je n'ai pas pu générer d'image car aucun provider IA n'est disponible. Va dans Réglages → Clés API et ajoute une clé OpenAI (gpt-image-1) ou FAL_KEY pour activer la génération d'images. »\n\nPlaceholder SVG disponible (pour ne pas casser l'UI) :\n\`\`\`tsx\nimport ${importVar} from "@/assets/generated/${filename}";\n<img src={${importVar}} alt="..." />\n\`\`\``,
    };
  }

  // image_edit — édite une image existante via OpenAI gpt-image-1 (BYOK).
  // Sources acceptées : module TS dans `src/assets/generated/<source>.ts` (export default dataURL),
  // ou PNG dataURL dans `public/generated/<source>.png`.
  if (name === "image_edit") {
    if (!vfs || !mutations) {
      return { ok: false, output: "image_edit: vfs/mutations requis" };
    }
    const sourceFilename = String(rawArgs.source_filename ?? "")
      .trim()
      .replace(/[^a-z0-9-]/gi, "-")
      .toLowerCase();
    const targetFilename = String(rawArgs.target_filename ?? "")
      .trim()
      .replace(/[^a-z0-9-]/gi, "-")
      .toLowerCase();
    const instruction = String(rawArgs.instruction ?? "").trim();
    if (!sourceFilename || !targetFilename || !instruction) {
      return { ok: false, output: "source_filename + target_filename + instruction requis" };
    }
    const openaiKey = opts?.openaiKey ?? null;
    if (!openaiKey) {
      return {
        ok: false,
        output:
          "image_edit nécessite une clé OpenAI configurée (Réglages → Clés API → OpenAI).",
      };
    }

    // Récupère la dataURL source depuis le VFS
    const candidates = [
      `src/assets/generated/${sourceFilename}.ts`,
      `public/generated/${sourceFilename}.png`,
      `public/generated/${sourceFilename}.svg`,
      `public/generated/${sourceFilename}.jpg`,
      `public/generated/${sourceFilename}.jpeg`,
      `public/generated/${sourceFilename}.webp`,
    ];
    let dataUrl: string | null = null;
    let foundPath: string | null = null;
    for (const p of candidates) {
      const v = vfs.get(p);
      if (!v) continue;
      foundPath = p;
      if (p.endsWith(".ts")) {
        // module TS : extrait la dataURL via regex sur le JSON.stringify
        const m = v.match(/=\s*"(data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+)"/);
        if (m) {
          dataUrl = m[1];
          break;
        }
      } else if (v.startsWith("data:image/")) {
        dataUrl = v;
        break;
      }
    }
    if (!dataUrl) {
      return {
        ok: false,
        output: `Image source introuvable : aucun de ${candidates.join(", ")} ne contient une image valide.`,
      };
    }

    // Convertit dataURL → Blob multipart pour /v1/images/edits
    try {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return { ok: false, output: `Format dataURL source invalide (${foundPath}).` };
      }
      const sourceMime = match[1];
      const sourceB64 = match[2];
      const sourceBytes = Buffer.from(sourceB64, "base64");
      // gpt-image-1 attend du PNG ; on garde le mime tel quel, OpenAI accepte png/webp/jpg.
      const ext = sourceMime.includes("png")
        ? "png"
        : sourceMime.includes("webp")
          ? "webp"
          : sourceMime.includes("jpeg") || sourceMime.includes("jpg")
            ? "jpg"
            : "png";
      const fd = new FormData();
      fd.append("model", "gpt-image-1");
      fd.append("prompt", instruction);
      fd.append("n", "1");
      fd.append("size", "1024x1024");
      fd.append("quality", "medium");
      fd.append(
        "image",
        new Blob([sourceBytes], { type: sourceMime }),
        `source.${ext}`,
      );

      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: fd,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          ok: false,
          output: `openai/gpt-image-1 edit HTTP ${res.status}: ${errText.slice(0, 200)}`,
        };
      }
      const json = await res.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) {
        return { ok: false, output: "openai/gpt-image-1 edit : aucune image retournée" };
      }
      const outputDataUrl = `data:image/png;base64,${b64}`;
      const tsAssetPath = `src/assets/generated/${targetFilename}.ts`;
      const publicPath = `public/generated/${targetFilename}.png`;
      const varName = camelCase(targetFilename);
      const tsModule = `// Auto-généré par image_edit (openai/gpt-image-1) — ne pas éditer à la main.\nconst ${varName}: string = ${JSON.stringify(outputDataUrl)};\nexport default ${varName};\n`;
      vfs.set(publicPath, outputDataUrl);
      mutations.push({ op: "write", path: publicPath, content: outputDataUrl });
      vfs.set(tsAssetPath, tsModule);
      mutations.push({ op: "write", path: tsAssetPath, content: tsModule });
      return {
        ok: true,
        output: `🪄 Image éditée (openai/gpt-image-1). USAGE :\n\`\`\`tsx\nimport ${varName} from "@/assets/generated/${targetFilename}";\n<img src={${varName}} alt="..." />\n\`\`\``,
      };
    } catch (e) {
      return {
        ok: false,
        output: `image_edit error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  if (name === "web_search") {
    const query = String(rawArgs.query ?? "").trim();
    if (!query) return { ok: false, output: "Missing query" };
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey)
      return { ok: false, output: "FIRECRAWL_API_KEY not configured (web_search disabled)" };
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, limit: 5 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, output: `web_search HTTP ${res.status}: ${t.slice(0, 200)}` };
      }
      const json = await res.json();
      const rows = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.results)
          ? json.results
          : [];
      const text = rows
        .slice(0, 5)
        .map((r: { title?: string; url?: string; description?: string; markdown?: string }) => {
          const title = r.title || r.url || "Résultat";
          const url = r.url ? ` — ${r.url}` : "";
          const desc = r.description || r.markdown || "";
          return `- ${title}${url}\n  ${String(desc).slice(0, 500)}`;
        })
        .join("\n");
      return { ok: true, output: (text || "Aucun résultat web.").slice(0, 6000) };
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : "web_search error" };
    }
  }

  if (name === "read_url") {
    const url = String(rawArgs.url ?? "").trim();
    if (!/^https?:\/\//.test(url))
      return { ok: false, output: "Invalid URL (must start with http(s)://)" };
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) return { ok: false, output: "FIRECRAWL_API_KEY not configured" };
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, output: `read_url HTTP ${res.status}: ${t.slice(0, 200)}` };
      }
      const json = await res.json();
      const md = json.data?.markdown ?? json.markdown ?? "";
      if (!md) return { ok: false, output: "Firecrawl returned no content" };
      return { ok: true, output: String(md).slice(0, 6000) };
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : "read_url error" };
    }
  }

  // build_check — vérification syntaxique légère des fichiers générés
  if (name === "build_check") {
    if (!vfs) return { ok: false, output: "build_check: vfs requis" };
    const errors: string[] = [];
    let checked = 0;
    for (const [path, content] of vfs.entries()) {
      if (!/\.(ts|tsx|js|jsx|json|css)$/.test(path)) continue;
      checked++;
      // JSON
      if (path.endsWith(".json")) {
        try {
          JSON.parse(content);
        } catch (e) {
          errors.push(
            `${path} : JSON invalide — ${e instanceof Error ? e.message : "parse error"}`,
          );
        }
        continue;
      }
      // Brace / paren balance (heuristique mais attrape 90 % des erreurs)
      let braces = 0,
        parens = 0,
        brackets = 0;
      let inStr: string | null = null;
      let inComment: "line" | "block" | null = null;
      let line = 1;
      for (let i = 0; i < content.length; i++) {
        const c = content[i];
        const next = content[i + 1];
        if (c === "\n") {
          line++;
          if (inComment === "line") inComment = null;
          continue;
        }
        if (inComment === "block") {
          if (c === "*" && next === "/") {
            inComment = null;
            i++;
          }
          continue;
        }
        if (inComment === "line") continue;
        if (inStr) {
          if (c === "\\") {
            i++;
            continue;
          }
          if (c === inStr) inStr = null;
          continue;
        }
        if (c === "/" && next === "/") {
          inComment = "line";
          i++;
          continue;
        }
        if (c === "/" && next === "*") {
          inComment = "block";
          i++;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") {
          inStr = c;
          continue;
        }
        if (c === "{") braces++;
        else if (c === "}") braces--;
        else if (c === "(") parens++;
        else if (c === ")") parens--;
        else if (c === "[") brackets++;
        else if (c === "]") brackets--;
        if (braces < 0 || parens < 0 || brackets < 0) {
          errors.push(`${path}:${line} : caractère de fermeture inattendu ('${c}')`);
          break;
        }
      }
      if (braces !== 0)
        errors.push(`${path} : accolades déséquilibrées (${braces > 0 ? "+" : ""}${braces})`);
      if (parens !== 0)
        errors.push(`${path} : parenthèses déséquilibrées (${parens > 0 ? "+" : ""}${parens})`);
      if (brackets !== 0)
        errors.push(`${path} : crochets déséquilibrés (${brackets > 0 ? "+" : ""}${brackets})`);
      // Imports relatifs cassés (heuristique — uniquement chemins commençant par ./ ou ../)
      const importRe = /\bfrom\s+["']((\.\.?\/)[^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(content)) !== null) {
        const imp = m[1];
        const dir = path.split("/").slice(0, -1).join("/");
        const resolved = normalizeRelative(dir, imp);
        const candidates = [
          resolved,
          `${resolved}.ts`,
          `${resolved}.tsx`,
          `${resolved}.js`,
          `${resolved}.jsx`,
          `${resolved}/index.ts`,
          `${resolved}/index.tsx`,
        ];
        if (!candidates.some((c) => vfs.has(c))) {
          errors.push(`${path} : import "${imp}" → fichier introuvable dans la VFS`);
        }
      }
    }
    if (errors.length === 0) {
      return {
        ok: true,
        output: `✅ build_check : ${checked} fichier(s) vérifiés, aucune erreur détectée.`,
      };
    }
    return {
      ok: false,
      output: `❌ build_check (${errors.length} erreur(s)) :\n${errors.slice(0, 8).join("\n")}`,
    };
  }

  // screenshot_qa — QA visuelle statique (heuristiques sur la VFS)
  if (name === "screenshot_qa") {
    if (!vfs) return { ok: false, output: "screenshot_qa: vfs requis" };
    const explicit = Array.isArray(rawArgs.paths)
      ? (rawArgs.paths as unknown[]).map((p) => normalize(String(p))).filter(Boolean)
      : [];
    const allKeys = Array.from(vfs.keys());
    const targets = explicit.length
      ? explicit.filter((p) => vfs.has(p))
      : allKeys.filter((k) => /\.(tsx|jsx|css)$/i.test(k) && !k.includes("node_modules"));

    if (targets.length === 0) {
      return { ok: false, output: "screenshot_qa : aucun fichier UI à auditer." };
    }

    type Issue = { sev: "high" | "med" | "low"; file: string; msg: string };
    const issues: Issue[] = [];

    // 1) Collecte tokens CSS définis (--name) + utilisés (var(--name))
    const definedTokens = new Set<string>();
    const usedTokens = new Set<string>();
    for (const path of allKeys) {
      if (!/\.css$/i.test(path)) continue;
      const css = vfs.get(path) ?? "";
      for (const m of css.matchAll(/--([a-z0-9-]+)\s*:/gi)) definedTokens.add(m[1]);
      for (const m of css.matchAll(/var\(--([a-z0-9-]+)\)/gi)) usedTokens.add(m[1]);
    }

    // 2) Audit JSX/TSX
    const FORBIDDEN_COLORS =
      /\b(?:text|bg|border|ring|from|to|via)-(?:white|black|gray-\d{2,3}|slate-\d{2,3}|zinc-\d{2,3}|neutral-\d{2,3})\b/g;
    const HEX_INLINE = /#[0-9a-f]{3,8}\b/gi;
    let totalSections = 0;
    let withImages = 0;
    let withCTA = 0;
    let withGradient = 0;
    let withShadow = 0;
    let withResponsive = 0;

    for (const path of targets) {
      if (!/\.(tsx|jsx)$/i.test(path)) continue;
      const src = vfs.get(path) ?? "";
      if (src.length < 50) continue;

      // Classes interdites (design system bypass)
      const forbidden = src.match(FORBIDDEN_COLORS);
      if (forbidden && forbidden.length > 0) {
        const sample = Array.from(new Set(forbidden)).slice(0, 4).join(", ");
        issues.push({
          sev: "high",
          file: path,
          msg: `${forbidden.length} classe(s) couleur hardcoded interdites (${sample}…) — utiliser tokens sémantiques (text-foreground, bg-primary, etc.).`,
        });
      }
      // Couleurs hex inline
      const hex = src.match(HEX_INLINE);
      if (hex && hex.length > 2) {
        issues.push({
          sev: "med",
          file: path,
          msg: `${hex.length} couleur(s) hex inline détectées — déplacer vers styles.css en tokens OKLCH.`,
        });
      }
      // Sections présentes
      const sections = (src.match(/<section\b/gi) ?? []).length;
      totalSections += sections;
      if (sections > 0 && !/<img|backgroundImage|bg-\[url\(|<svg/i.test(src)) {
        // section sans aucun visuel
      } else if (sections > 0) {
        withImages++;
      }
      // CTA (Button + onClick / asChild Link)
      if (/<Button[\s>]/.test(src) || /role=["']button["']/.test(src)) withCTA++;
      // Gradient / shadow premium
      if (/gradient-|bg-gradient|linear-gradient/i.test(src)) withGradient++;
      if (/shadow-(?:elegant|glow|2xl|xl|lg)|drop-shadow/i.test(src)) withShadow++;
      // Responsive
      if (/\b(?:sm|md|lg|xl):/.test(src)) withResponsive++;

      // Images cassées
      const imgs = Array.from(src.matchAll(/<img[^>]*\bsrc=\{?["'`]?([^"'`}\s>]*)/gi));
      for (const m of imgs) {
        const src2 = m[1] ?? "";
        if (!src2 || src2 === "" || src2 === "undefined" || src2 === "null") {
          issues.push({ sev: "high", file: path, msg: `<img> sans src valide.` });
          break;
        }
      }
      // Hero détecté ? Doit avoir CTA
      if (/hero|landing/i.test(path) && !/<Button[\s>]|asChild/.test(src)) {
        issues.push({
          sev: "high",
          file: path,
          msg: `Hero/landing détecté sans <Button> CTA visible.`,
        });
      }
      // Sections vides (placeholder text)
      if (/(lorem ipsum|todo:|placeholder|xxx)/i.test(src)) {
        issues.push({ sev: "med", file: path, msg: `Texte placeholder détecté (lorem/todo/xxx).` });
      }
    }

    // 3) Tokens utilisés mais non définis
    const missingTokens: string[] = [];
    for (const t of usedTokens) {
      if (!definedTokens.has(t)) missingTokens.push(t);
    }
    if (missingTokens.length > 0) {
      issues.push({
        sev: "high",
        file: "src/styles.css",
        msg: `${missingTokens.length} token(s) CSS utilisés sans définition : ${missingTokens
          .slice(0, 6)
          .map((t) => `--${t}`)
          .join(", ")}${missingTokens.length > 6 ? "…" : ""}.`,
      });
    }

    // 4) Heuristiques globales
    const tsxCount = targets.filter((t) => /\.tsx$/i.test(t)).length;
    if (tsxCount > 0) {
      if (withGradient === 0)
        issues.push({
          sev: "med",
          file: "(global)",
          msg: "Aucun gradient détecté — design plat (manque de profondeur premium).",
        });
      if (withShadow === 0)
        issues.push({ sev: "med", file: "(global)", msg: "Aucune shadow premium détectée." });
      if (withResponsive < Math.max(1, Math.floor(tsxCount / 2))) {
        issues.push({
          sev: "med",
          file: "(global)",
          msg: `Responsive insuffisant (${withResponsive}/${tsxCount} composants utilisent sm:/md:/lg:).`,
        });
      }
    }

    // 5) Score + verdict GATE DUR (Chantier 5)
    const weight = { high: 15, med: 7, low: 3 };
    const penalty = issues.reduce((acc, i) => acc + weight[i.sev], 0);
    const score = Math.max(0, 100 - penalty);
    const highCount = issues.filter((i) => i.sev === "high").length;
    const medCount = issues.filter((i) => i.sev === "med").length;

    // Seuil dur : score ≥ 80 ET aucune issue 🔴 ET ≤ 2 issues 🟡 → PASS.
    // Sinon → FAIL avec instruction explicite de corriger AVANT de livrer.
    const pass = score >= 80 && highCount === 0 && medCount <= 2;

    const lines: string[] = [];
    lines.push(
      `${pass ? "✅ PASS" : "❌ FAIL"} screenshot_qa — score ${score}/100 (${issues.length} issue(s) : ${highCount} 🔴 / ${medCount} 🟡 / ${issues.length - highCount - medCount} 🔵).`,
    );
    lines.push(`Audité : ${targets.length} fichier(s) — ${tsxCount} composants UI.`);
    lines.push(
      `Stats : gradient=${withGradient}, shadow=${withShadow}, responsive=${withResponsive}/${tsxCount}, sections=${totalSections}.`,
    );
    if (issues.length > 0) {
      lines.push("");
      lines.push("Issues à corriger (priorisées) :");
      const sorted = issues.sort((a, b) => weight[b.sev] - weight[a.sev]).slice(0, 12);
      for (const i of sorted) {
        const tag = i.sev === "high" ? "🔴" : i.sev === "med" ? "🟡" : "🔵";
        lines.push(`${tag} ${i.file} — ${i.msg}`);
      }
      if (issues.length > 12) lines.push(`… +${issues.length - 12} issue(s) supplémentaire(s).`);
    }
    if (!pass) {
      lines.push("");
      lines.push(
        "🚨 GATE BLOQUANT : tu ne peux PAS livrer en l'état. Corrige IMMÉDIATEMENT les issues ci-dessus (priorité 🔴 > 🟡), via `line_replace` de préférence, puis RELANCE `screenshot_qa`. Cible : score ≥ 80, 0 🔴, ≤ 2 🟡.",
      );
      lines.push(
        "Si une issue mentionne un token manquant → ajoute-le dans src/styles.css. Si gradient/shadow manque → applique les patterns biblio. Si image cassée → image_generate + import ES6.",
      );
    }
    // ok: false force Elena à boucler. Le runtime injectera également un rappel système.
    return { ok: pass, output: lines.join("\n") };
  }

  // design_blueprint — étape 1 obligatoire UI : valide la planif et la renvoie comme contrat
  if (name === "design_blueprint") {
    const projectKind = String(rawArgs.project_kind ?? "");
    const domain = String(rawArgs.domain ?? "");
    const vibe = String(rawArgs.vibe ?? "");
    const palette = (rawArgs.palette ?? {}) as Record<string, string>;
    const typo = (rawArgs.typography ?? {}) as Record<string, string>;
    const sections = Array.isArray(rawArgs.sections) ? (rawArgs.sections as Array<Record<string, string>>) : [];
    const images = Array.isArray(rawArgs.images) ? (rawArgs.images as Array<Record<string, unknown>>) : [];

    // Validation dure
    const errors: string[] = [];
    if (!projectKind) errors.push("project_kind manquant");
    if (!domain || domain.length < 3) errors.push("domain trop court (min 3 chars)");
    if (!vibe) errors.push("vibe manquant");
    for (const k of ["background", "foreground", "primary", "accent", "muted"]) {
      if (!palette[k]?.startsWith("oklch(")) errors.push(`palette.${k} doit être en notation oklch(...)`);
    }
    if (!typo.heading_font || !typo.body_font || !typo.h1_size_clamp) errors.push("typography incomplet");
    if (sections.length < 3) errors.push(`sections trop court (${sections.length}/3 min)`);
    if (images.length < 3) errors.push(`images trop court (${images.length}/3 min)`);
    const heroCount = images.filter((i) => i.hero === true).length;
    if (heroCount === 0) errors.push("au moins 1 image doit être marquée hero:true (sera générée en gemini-3-pro-image-preview)");

    // 🚦 Cohérence project_kind ↔ domain : refuse saas-landing pour les apps utilitaires
    const utilitaryDomain =
      /\b(gestion|gérer|optimis|tracker|suivi|cr[eé]ation|annonce|inventaire|stock|crm|todo|t[âa]che|finance|budget|note|reservation|booking|messag|chat|calendrier|planning|outil|app pour|application pour)\b/i.test(
        domain,
      );
    if (projectKind === "saas-landing" && utilitaryDomain) {
      errors.push(
        `project_kind=\"saas-landing\" incohérent avec domain=\"${domain}\" (qui décrit une app utilitaire). Choisis plutôt \"mobile-app\" ou \"dashboard\".`,
      );
    }
    // 🛡️ Anti-saturation : sur app fonctionnelle, limiter les images (sinon le tour se vide
    //    en générations base64 et il ne reste plus de tokens pour écrire les .tsx).
    const isFunctionalApp = ["mobile-app", "dashboard"].includes(projectKind);
    if (isFunctionalApp && images.length > 4) {
      errors.push(
        `Trop d'images planifiées (${images.length}) pour un projet ${projectKind}. Max 4 — garde l'essentiel (1 hero + 2-3 illustrations) et écris les composants en priorité. Les autres images viendront dans un 2e tour.`,
      );
    }

    if (errors.length > 0) {
      return {
        ok: false,
        output: `❌ Blueprint REJETÉ — corrige et rappelle design_blueprint :\n${errors.map((e) => `• ${e}`).join("\n")}`,
      };
    }

    // Contrat formaté → réinjecté dans le prompt suivant
    const lines: string[] = [
      `✅ BLUEPRINT VALIDÉ — c'est ton contrat pour la suite du tour. Respecte-le à la lettre.`,
      ``,
      `📐 Projet : ${projectKind} · Domaine : ${domain} · Vibe : ${vibe}`,
      ``,
      `🎨 Palette OKLCH (à mettre dans src/styles.css :root) :`,
      `  --background: ${palette.background};`,
      `  --foreground: ${palette.foreground};`,
      `  --primary: ${palette.primary};`,
      `  --accent: ${palette.accent};`,
      `  --muted: ${palette.muted};`,
      ``,
      `✍️  Typographie :`,
      `  • Headings: ${typo.heading_font}  → import @import url('https://fonts.googleapis.com/css2?family=${typo.heading_font.replace(/\s+/g, "+")}:wght@400;600;700;800&display=swap');`,
      `  • Body: ${typo.body_font}`,
      `  • H1 size: ${typo.h1_size_clamp}`,
      ``,
      `🧱 Sections (dans cet ordre) :`,
      ...sections.map((s, i) => `  ${i + 1}. ${s.name} → bloc \`${s.block_id}\` — ${s.purpose}`),
      ``,
      `🖼️  Images à générer EN PARALLÈLE MAINTENANT (un seul tour, plusieurs image_generate) :`,
      ...images.map((im, i) => {
        const model = im.hero ? "google/gemini-3-pro-image-preview" : "google/gemini-2.5-flash-image";
        return `  ${i + 1}. variable=${im.variable} | aspect=${im.aspect} | model=${model}\n     save_path: src/assets/generated/${im.variable}.png\n     prompt: ${im.prompt}`;
      }),
      ``,
      `🚨 PROCHAINES ÉTAPES OBLIGATOIRES (dans cet ordre) :`,
      `  1. Lance les ${images.length} image_generate EN PARALLÈLE (un seul tour de tool calls).`,
      `  2. Pour chaque section avec block_id ≠ "custom" → appelle inspiration_lookup({section: "..."}) puis copie le TSX dans un fichier.`,
      `  3. Écris/modifie src/styles.css avec la palette OKLCH ci-dessus + import des fonts Google.`,
      `  4. Compose la page dans src/routes/index.tsx en assemblant les sections dans l'ordre.`,
      `  5. build_check → screenshot_qa → si score <80, corrige et relance.`,
    ];
    return { ok: true, output: lines.join("\n") };
  }

  // inspiration_lookup — bibliothèque de blocs TSX premium PRÊTS À COPIER + fallback patterns textuels
  if (name === "inspiration_lookup") {
    const section = String(rawArgs.section ?? "").toLowerCase();
    const vibe = String(rawArgs.vibe ?? "premium-dark").toLowerCase();

    // 1) Try the real TSX block library first.
    const blocks = lookupBlocks(section);
    if (blocks.length > 0) {
      const header = [
        `🎨 ${blocks.length} BLOC${blocks.length > 1 ? "S" : ""} TSX PREMIUM pour "${section}" (vibe: ${vibe})`,
        ``,
        `🚨 RÈGLES OBLIGATOIRES :`,
        `1. COPIE le code ci-dessous tel quel dans un nouveau fichier (puis adapte les textes au domaine du user).`,
        `2. Pour CHAQUE image listée, lance image_generate EN PARALLÈLE (même tour si possible).`,
        `   • Les images marquées HERO → utilise model "google/gemini-3-pro-image-preview".`,
        `   • Les autres → "google/gemini-2.5-flash-image" (rapide).`,
        `3. Le nom de fichier image doit MATCHER la variable importée (ex: variable "heroProduct" → save_path "src/assets/generated/heroProduct.png").`,
        `4. NE JAMAIS écrire src="/generated/X.png" — toujours via les imports déjà présents dans le bloc.`,
        `5. Adapte les textes au domaine, garde l'ARCHITECTURE et les CLASSES TAILWIND telles quelles.`,
        ``,
      ].join("\n");
      return {
        ok: true,
        output: header + "\n" + blocks.map(formatBlockForPrompt).join("\n\n---\n\n"),
      };
    }

    // 2) Fallback: text-only patterns for sections we don't have a block for yet.
    const patterns: Record<string, string[]> = {
      "mobile-profile": [
        "Header profil : cover image 16:9 + avatar circulaire 96px overlap -bottom-12, nom + handle, bio 2 lignes, stats inline (Posts • Followers • Following), CTA 'Modifier' outline + 'Partager' icon.",
        "Tabs (Posts / Saved / Tagged) sticky sous header, grille 3 col carrés (aspect-square gap-1) ou liste selon tab.",
      ],
      "mobile-settings": [
        "Sections groupées rounded-2xl bg-card : header section uppercase muted text-xs, rows avec icône colorée + label + valeur/chevron/switch à droite, séparateurs internes border-b border-border/50.",
        "Avatar + nom en haut, version app en bas (text-xs muted center), bouton 'Se déconnecter' destructive en bas avant version.",
      ],
      "mobile-onboarding": [
        "3-4 écrans avec hero illustration premium (image_generate style:illustration), titre 28-32px bold, sous-titre 15-17px muted leading-relaxed, dots pagination dynamiques (active = w-6 bg-primary, autres = w-1.5 bg-muted), 'Passer' top-right + CTA 'Suivant' bottom rounded-2xl gradient.",
        "Permissions screen : icône 64px dans cercle gradient, 'Activer les notifications' titre, paragraphe explicatif, CTA primary 'Activer' + ghost 'Plus tard'.",
      ],
    };
    const list = patterns[section];
    if (!list) {
      const all = Array.from(new Set([...listAvailableSections(), ...Object.keys(patterns)])).sort();
      return {
        ok: false,
        output: `inspiration_lookup : section "${section}" inconnue. Sections supportées : ${all.join(", ")}.`,
      };
    }
    return {
      ok: true,
      output:
        `🎨 Patterns ${section} (vibe: ${vibe}) — descriptions :\n` +
        list.map((p, i) => `${i + 1}. ${p}`).join("\n"),
    };
  }

  // block_remix — applique vibe/radius/density/accent sur un bloc existant
  if (name === "block_remix") {
    const blockId = String(rawArgs.block_id ?? "").trim();
    if (!blockId) {
      return { ok: false, output: "block_remix : 'block_id' requis (ex: 'saas-hero-mesh'). Utilise inspiration_lookup pour découvrir." };
    }
    const vibe = (rawArgs.vibe ? String(rawArgs.vibe) : undefined) as BlockVibe | undefined;
    const radius = rawArgs.radius ? (String(rawArgs.radius) as "sharp" | "soft" | "pill") : undefined;
    const density = rawArgs.density ? (String(rawArgs.density) as "airy" | "compact" | "default") : undefined;
    const accent = rawArgs.accent ? String(rawArgs.accent) : undefined;

    const result = remixBlock(blockId, { vibe, radius, density, accent });
    if (!result) {
      const ids = PREMIUM_BLOCKS.map((b) => b.id).join(", ");
      return { ok: false, output: `block_remix : bloc "${blockId}" introuvable. IDs disponibles : ${ids}` };
    }
    const vibesAvail = listVibes().map((v) => `${v.id} (${v.label})`).join(" • ");
    const header = [
      `🎨 BLOCK REMIX — ${result.block.name} [${result.block.id}]`,
      `Vibe : ${vibe ?? "premium-dark"} | Radius : ${radius ?? "—"} | Density : ${density ?? "—"} | Accent : ${accent ?? "—"}`,
      `Vibes disponibles : ${vibesAvail}`,
      ``,
      result.notes.length ? `Notes :\n- ${result.notes.join("\n- ")}` : `Aucune transformation (vibe par défaut).`,
      ``,
      `🚨 INSTRUCTIONS :`,
      `1. Copie le TSX ci-dessous dans un fichier (les images du bloc original restent valides).`,
      accent ? `2. Mets à jour --primary dans src/styles.css avec : ${accent}` : `2. Garde le styles.css actuel (pas d'accent demandé).`,
      `3. Adapte uniquement les textes au domaine du user.`,
      ``,
      "```tsx",
      result.tsx.trim(),
      "```",
    ].join("\n");
    return { ok: true, output: header };
  }

  return null;
}

function normalizeRelative(dir: string, imp: string): string {
  const parts = dir ? dir.split("/") : [];
  const segs = imp.split("/");
  for (const s of segs) {
    if (s === ".") continue;
    if (s === "..") parts.pop();
    else parts.push(s);
  }
  return parts.join("/");
}

export function vfsFromFiles(files: VFile[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of files) m.set(normalize(f.path), f.content);
  return m;
}

/**
 * Chantier 6 — Pilot tools.
 *
 * Exécutés en amont du dispatcher classique : ils touchent la DB Lovable Cloud
 * (tables pilot_*) au nom de l'utilisateur courant. Le client supabase passé ici
 * est celui authentifié RLS (token user) — pas le service role.
 *
 * Renvoie null si le tool n'est pas un pilot_*. Sinon ToolResult standard.
 *
 * Le typage Supabase est volontairement lâche (`unknown`) côté signature pour
 * éviter les problèmes d'inférence excessive avec `Database` quand on chaine
 * plusieurs `.from(...).update(...).eq(...)`.
 */
export async function executePilotTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabaseClient: unknown,
  projectId: string | null,
): Promise<ToolResult | null> {
  if (
    name !== "pilot_complete_step" &&
    name !== "pilot_start_next_step" &&
    name !== "pilot_add_item" &&
    name !== "pilot_check_item"
  ) {
    return null;
  }
  if (!projectId) {
    return { ok: false, output: "Outils pilot_* indisponibles : aucun project_id en contexte." };
  }

  // Cast vers any localement — l'inférence stricte avec Database<...> casse le chainage.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseClient as { from: (table: string) => any };

  // Récupère l'étape active (ou la fournie via step_id).
  const getActiveStepId = async (): Promise<string | null> => {
    const { data } = await sb
      .from("pilot_state")
      .select("current_step_id")
      .eq("project_id", projectId)
      .maybeSingle();
    return (data?.current_step_id as string | null) ?? null;
  };

  try {
    if (name === "pilot_complete_step") {
      const stepId = (rawArgs.step_id as string | undefined) ?? (await getActiveStepId());
      if (!stepId) return { ok: false, output: "Aucune étape active à terminer." };
      const summary = (rawArgs.summary as string | undefined)?.slice(0, 500) ?? null;
      const patch: Record<string, unknown> = {
        status: "done",
        completed_at: new Date().toISOString(),
      };
      if (summary) patch.summary = summary;
      const { error: upErr } = await sb.from("pilot_steps").update(patch).eq("id", stepId);
      if (upErr) return { ok: false, output: `update step: ${(upErr as Error).message}` };

      // Si c'était l'étape active du pilot_state, on la libère.
      const { data: state } = await sb
        .from("pilot_state")
        .select("current_step_id, org_id")
        .eq("project_id", projectId)
        .maybeSingle();
      if (state?.current_step_id === stepId && state.org_id) {
        await sb.from("pilot_state").upsert(
          {
            project_id: projectId,
            org_id: state.org_id,
            current_step_id: null,
            last_action: `completed:${stepId}`,
          },
          { onConflict: "project_id" },
        );
      }
      return {
        ok: true,
        output: `✅ Étape ${stepId} marquée terminée.${summary ? ` Synthèse: ${summary}` : ""}`,
      };
    }

    if (name === "pilot_start_next_step") {
      // Étape active actuelle (peut être null)
      const currentId = await getActiveStepId();
      let currentCatId: string | null = null;
      let currentPos = -1;
      if (currentId) {
        const { data: cur } = await sb
          .from("pilot_steps")
          .select("category_id, position")
          .eq("id", currentId)
          .maybeSingle();
        currentCatId = cur?.category_id ?? null;
        currentPos = cur?.position ?? -1;
      }
      // Cherche la prochaine étape : même cat, position > currentPos, status != done
      let next: { id: string; title: string; category_id: string; org_id: string } | null = null;
      if (currentCatId) {
        const { data: nextInCat } = await sb
          .from("pilot_steps")
          .select("id, title, category_id, org_id, position, status")
          .eq("project_id", projectId)
          .eq("category_id", currentCatId);
        const candidates = (
          (nextInCat ?? []) as Array<{
            id: string;
            title: string;
            category_id: string;
            org_id: string;
            position: number;
            status: string;
          }>
        )
          .filter((s) => s.position > currentPos && s.status !== "done")
          .sort((a, b) => a.position - b.position);
        if (candidates[0]) next = candidates[0];
      }
      // Sinon, première étape pas done de la première catégorie suivante
      if (!next) {
        const { data: allSteps } = await sb
          .from("pilot_steps")
          .select("id, title, category_id, org_id, position, status")
          .eq("project_id", projectId);
        const { data: cats } = await sb
          .from("pilot_categories")
          .select("id, position")
          .eq("project_id", projectId);
        const catOrder = new Map<string, number>(
          ((cats ?? []) as Array<{ id: string; position: number }>).map((c) => [c.id, c.position]),
        );
        const remaining = (
          (allSteps ?? []) as Array<{
            id: string;
            title: string;
            category_id: string;
            org_id: string;
            position: number;
            status: string;
          }>
        )
          .filter((s) => s.status !== "done" && s.id !== currentId)
          .sort((a, b) => {
            const ca = catOrder.get(a.category_id) ?? 999;
            const cb = catOrder.get(b.category_id) ?? 999;
            if (ca !== cb) return ca - cb;
            return a.position - b.position;
          });
        if (remaining[0]) next = remaining[0];
      }
      if (!next) {
        return { ok: true, output: "🏁 Plus d'étapes à exécuter — projet terminé." };
      }
      // Marque la nouvelle étape in_progress + met à jour pilot_state
      await sb
        .from("pilot_steps")
        .update({ status: "in_progress", started_at: new Date().toISOString() })
        .eq("id", next.id);
      await sb.from("pilot_state").upsert(
        {
          project_id: projectId,
          org_id: next.org_id,
          current_step_id: next.id,
          current_category_id: next.category_id,
          autopilot_enabled: true,
          last_action: `started:${next.title}`,
        },
        { onConflict: "project_id" },
      );
      return { ok: true, output: `▶ Nouvelle étape active : "${next.title}" (id ${next.id}).` };
    }

    if (name === "pilot_add_item") {
      const title = String(rawArgs.title ?? "").trim();
      if (!title) return { ok: false, output: "title requis" };
      const stepId = (rawArgs.step_id as string | undefined) ?? (await getActiveStepId());
      if (!stepId) return { ok: false, output: "Aucune étape active : précise step_id." };
      const { data: step } = await sb
        .from("pilot_steps")
        .select("project_id, org_id")
        .eq("id", stepId)
        .maybeSingle();
      if (!step) return { ok: false, output: `step_id introuvable: ${stepId}` };
      const { error } = await sb.from("pilot_items").insert({
        project_id: step.project_id,
        org_id: step.org_id,
        step_id: stepId,
        title,
      });
      if (error) return { ok: false, output: `insert item: ${(error as Error).message}` };
      return { ok: true, output: `➕ Sous-fiche ajoutée : "${title}" sur étape ${stepId}.` };
    }

    if (name === "pilot_check_item") {
      const itemId = String(rawArgs.item_id ?? "").trim();
      if (!itemId) return { ok: false, output: "item_id requis" };
      const done = rawArgs.done === false ? false : true;
      const { error } = await sb.from("pilot_items").update({ done }).eq("id", itemId);
      if (error) return { ok: false, output: `update item: ${(error as Error).message}` };
      return {
        ok: true,
        output: `${done ? "☑" : "☐"} Sous-fiche ${itemId} ${done ? "cochée" : "décochée"}.`,
      };
    }

    return { ok: false, output: "pilot tool inattendu" };
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : "pilot tool error" };
  }
}

/**
 * Chantier 1 — Memory tools (mem:// style Lovable).
 *
 * Exécutés en amont du dispatcher classique : ils touchent la table
 * `project_memory` au nom de l'utilisateur courant (RLS via supabaseClient).
 *
 * Renvoie null si le tool n'est pas un memory_*.
 */
export async function executeMemoryTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabaseClient: unknown,
  projectId: string | null,
  userId: string,
): Promise<ToolResult | null> {
  if (name !== "memory_save" && name !== "memory_list" && name !== "memory_archive") {
    return null;
  }
  if (!projectId) {
    return { ok: false, output: "Outils memory_* indisponibles : aucun project_id en contexte." };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseClient as { from: (table: string) => any };

  try {
    if (name === "memory_save") {
      const kind = String(rawArgs.kind ?? "preference");
      const title = String(rawArgs.title ?? "").trim();
      const body = String(rawArgs.body ?? "").trim();
      const pinned = rawArgs.pinned === true;
      if (!title || !body) return { ok: false, output: "title et body requis" };
      if (title.length > 200) return { ok: false, output: "title trop long (max 200)" };
      if (body.length > 2000) return { ok: false, output: "body trop long (max 2000)" };

      // Récupère org_id du projet
      const { data: proj } = await sb
        .from("projects")
        .select("org_id")
        .eq("id", projectId)
        .maybeSingle();
      if (!proj?.org_id) return { ok: false, output: "Projet introuvable ou inaccessible." };

      const { data, error } = await sb
        .from("project_memory")
        .insert({
          project_id: projectId,
          org_id: proj.org_id,
          owner_id: userId,
          kind,
          title,
          body,
          source: "agent_auto",
          is_pinned: pinned,
        })
        .select("id")
        .single();
      if (error) return { ok: false, output: `insert memory: ${(error as Error).message}` };
      return { ok: true, output: `🧠 Mémoire sauvegardée [${kind}] "${title}" (id ${data.id}).` };
    }

    if (name === "memory_list") {
      const kind = rawArgs.kind ? String(rawArgs.kind) : null;
      let q = sb
        .from("project_memory")
        .select("id, kind, title, body, is_pinned")
        .eq("project_id", projectId)
        .is("archived_at", null)
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(50);
      if (kind) q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) return { ok: false, output: `list memory: ${(error as Error).message}` };
      const rows = (data ?? []) as Array<{
        id: string;
        kind: string;
        title: string;
        body: string;
        is_pinned: boolean;
      }>;
      if (rows.length === 0) return { ok: true, output: "(aucune règle mémoire)" };
      const out = rows
        .map((r) => `- [${r.kind}${r.is_pinned ? "★" : ""}] ${r.title} — ${r.body} (id: ${r.id})`)
        .join("\n");
      return { ok: true, output: out };
    }

    if (name === "memory_archive") {
      const id = String(rawArgs.memory_id ?? "").trim();
      if (!id) return { ok: false, output: "memory_id requis" };
      const { error } = await sb
        .from("project_memory")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return { ok: false, output: `archive: ${(error as Error).message}` };
      return { ok: true, output: `🗑 Mémoire ${id} archivée.` };
    }

    return { ok: false, output: "memory tool inattendu" };
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : "memory tool error" };
  }
}

/**
 * Roadmap V2 — Admin tools (capability_sync, cost_estimate).
 *
 * `capability_sync` : appel RPC `capability_upsert` (admin only) pour tenir le
 * tableau Nexyra à jour automatiquement après chaque chantier.
 * `cost_estimate`   : appel RPC `estimate_project_cost` pour projeter le coût
 * mensuel d'un projet à partir de l'historique récent.
 */
export async function executeAdminTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabaseClient: unknown,
  projectId: string | null,
): Promise<ToolResult | null> {
  if (name !== "capability_sync" && name !== "cost_estimate" && name !== "capability_capture")
    return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseClient as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: Error | null }>;
  };

  try {
    if (name === "capability_sync") {
      const category_id = String(rawArgs.category_id ?? "").trim();
      const category_label = String(rawArgs.category_label ?? "").trim();
      const category_icon = String(rawArgs.category_icon ?? "sparkles").trim() || "sparkles";
      const title = String(rawArgs.title ?? "").trim();
      const info = String(rawArgs.info ?? "").trim();
      const status = String(rawArgs.status ?? "done");
      const priority = String(rawArgs.priority ?? "P1");
      if (!category_id || !category_label || !title || !info) {
        return { ok: false, output: "category_id, category_label, title, info requis" };
      }
      const { data, error } = await sb.rpc("capability_upsert", {
        _category_id: category_id,
        _category_label: category_label,
        _category_icon: category_icon,
        _title: title,
        _info: info,
        _status: status,
        _priority: priority,
      });
      if (error) return { ok: false, output: `capability_sync: ${error.message}` };
      return { ok: true, output: `📋 Carte « ${title} » synchronisée [${status}] (id ${data}).` };
    }

    if (name === "cost_estimate") {
      const pid = (rawArgs.project_id as string | undefined) ?? projectId;
      if (!pid) return { ok: false, output: "project_id requis" };
      const { data, error } = await sb.rpc("estimate_project_cost", { _project_id: pid });
      if (error) return { ok: false, output: `cost_estimate: ${error.message}` };
      return { ok: true, output: JSON.stringify(data, null, 2).slice(0, 2000) };
    }

    if (name === "capability_capture") {
      const title = String(rawArgs.title ?? "")
        .trim()
        .slice(0, 120);
      const info = String(rawArgs.info ?? "")
        .trim()
        .slice(0, 600);
      const priority = String(rawArgs.priority ?? "P1");
      if (!title || !info) {
        return { ok: false, output: "title + info requis pour capability_capture" };
      }
      const { data, error } = await sb.rpc("capability_capture_idea", {
        _title: title,
        _info: info,
        _priority: priority,
      });
      if (error) {
        // Silencieux pour non-admin
        if (/forbidden/i.test(error.message)) {
          return { ok: true, output: `(idée non capturée — non admin)` };
        }
        return { ok: false, output: `capability_capture: ${error.message}` };
      }
      return { ok: true, output: `💡 Idée « ${title} » ajoutée au tableau (id ${data}).` };
    }

    return { ok: false, output: "admin tool inattendu" };
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : "admin tool error" };
  }
}

/**
 * UI tools — project_onboard / snapshot_create / ask_user.
 * Ces tools n'écrivent PAS la VFS et n'appellent PAS de DB lourde :
 * ils signalent au front qu'il doit afficher quelque chose (questions, snapshot crée).
 *
 * Pour `snapshot_create`, on enregistre une ligne légère dans `project_snapshots`
 * avec storage_path vide (snapshot logique — la restauration utilisera l'historique
 * messages côté UI). Côté front on affichera un toast "snapshot créé".
 *
 * Renvoie null si nom non géré.
 */
export interface UISignal {
  kind: "onboard" | "ask" | "snapshot";
  payload: Record<string, unknown>;
}

export async function executeUITool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabaseClient: unknown,
  projectId: string | null,
  userId: string,
  uiSignals: UISignal[],
): Promise<ToolResult | null> {
  if (name !== "project_onboard" && name !== "ask_user" && name !== "snapshot_create") {
    return null;
  }

  try {
    if (name === "project_onboard" || name === "ask_user") {
      const questions =
        name === "project_onboard"
          ? ((rawArgs.questions as unknown[] | undefined) ?? [])
          : [
              {
                question: rawArgs.question,
                header: rawArgs.header,
                options: rawArgs.options,
              },
            ];
      if (!Array.isArray(questions) || questions.length === 0) {
        return { ok: false, output: "questions vides" };
      }
      uiSignals.push({
        kind: name === "project_onboard" ? "onboard" : "ask",
        payload: { questions },
      });
      return {
        ok: true,
        output: `📝 ${questions.length} question${questions.length > 1 ? "s" : ""} envoyée${questions.length > 1 ? "s" : ""} à l'utilisateur. Stop ici et attends la réponse.`,
      };
    }

    if (name === "snapshot_create") {
      if (!projectId) return { ok: false, output: "snapshot_create : project_id requis" };
      const label =
        String(rawArgs.label ?? "Snapshot")
          .trim()
          .slice(0, 60) || "Snapshot";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabaseClient as { from: (t: string) => any };
      const { data, error } = await sb
        .from("project_snapshots")
        .insert({
          project_id: projectId,
          owner_id: userId,
          label,
          storage_path: `logical://${projectId}/${Date.now()}`,
          size_bytes: 0,
          messages_count: 0,
        })
        .select("id, version")
        .single();
      if (error) return { ok: false, output: `snapshot: ${(error as Error).message}` };
      uiSignals.push({ kind: "snapshot", payload: { id: data.id, label, version: data.version } });
      return { ok: true, output: `📸 Snapshot "${label}" créé (v${data.version}).` };
    }

    return null;
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : "ui tool error" };
  }
}
