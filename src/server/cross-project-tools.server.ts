/**
 * Cross-project tools — Elena peut piocher des fichiers/modules dans les AUTRES
 * projets Nexyra de l'utilisateur (sandbox state stocké en DB).
 *
 * 3 outils :
 *  - project_list           : liste les projets de l'user (id, nom, type, fichiers)
 *  - project_read_file      : lit un fichier d'un autre projet (sans le copier)
 *  - project_import_files   : copie 1..N fichiers d'un autre projet dans la sandbox courante
 *                             + indexe en project_docs (RAG) pour mémoire long-terme
 *
 * Sécurité : RLS owner_id = auth.uid() côté project_sandbox_state ⇒ Elena ne peut
 * voir QUE les projets de l'utilisateur authentifié. On utilise le client supabase
 * scope user (pas admin).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { FsMutation, ToolResult } from "./agent-tools.server";

type SB = SupabaseClient<Database>;

export const CROSS_PROJECT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "project_list",
      description:
        "Liste les autres projets Nexyra de l'utilisateur (id, nom, type, nombre de fichiers, date de mise à jour). Utilise-le quand l'utilisateur demande de récupérer un module d'un autre projet (ex: « prends la partie vinted de TopChef »). Retourne aussi les projets actuellement vides (sans sandbox).",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "project_read_file",
      description:
        "Lit le contenu d'UN fichier d'un autre projet de l'utilisateur (sans le copier). À utiliser pour inspecter avant import (vérifier dépendances, structure). Donne d'abord project_list pour récupérer le project_id puis le path.",
      parameters: {
        type: "object",
        properties: {
          source_project_id: { type: "string", description: "UUID du projet source (cf. project_list)." },
          path: { type: "string", description: "Chemin du fichier dans le projet source." },
        },
        required: ["source_project_id", "path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "project_import_files",
      description:
        "Copie 1..N fichiers d'un autre projet de l'utilisateur DANS la sandbox courante. Idéal pour récupérer un module entier (ex: tous les fichiers sous src/modules/vinted). Les fichiers sont copiés tels quels (path_in_source → path_in_target) et indexés en mémoire RAG pour qu'Elena puisse y répondre ensuite. Si target_path n'est pas fourni, le path source est conservé. Limite : 50 fichiers par appel.",
      parameters: {
        type: "object",
        properties: {
          source_project_id: { type: "string", description: "UUID du projet source." },
          paths: {
            type: "array",
            description: "Liste des fichiers à importer. Si tu veux tout un dossier, liste explicitement les paths (utilise project_list pour les voir).",
            items: {
              type: "object",
              properties: {
                source_path: { type: "string" },
                target_path: { type: "string", description: "Optionnel — défaut = source_path." },
              },
              required: ["source_path"],
              additionalProperties: false,
            },
            minItems: 1,
            maxItems: 50,
          },
          overwrite: {
            type: "boolean",
            description: "Si false (défaut), on n'écrase pas les fichiers existants du projet courant.",
          },
        },
        required: ["source_project_id", "paths"],
        additionalProperties: false,
      },
    },
  },
] as const;

export type CrossProjectToolName =
  | "project_list"
  | "project_read_file"
  | "project_import_files";

interface SandboxFile {
  path: string;
  content: string;
}

const MAX_FILE_BYTES = 200_000;

export async function executeCrossProjectTool(
  name: string,
  rawArgs: Record<string, unknown>,
  supabase: SB,
  currentProjectId: string | null,
  userId: string,
  vfs: Map<string, string>,
  mutations: FsMutation[],
): Promise<ToolResult | null> {
  if (name === "project_list") {
    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, name, type, status, updated_at")
      .eq("owner_id", userId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return { ok: false, output: `project_list: ${error.message}` };
    const others = (projects ?? []).filter((p) => p.id !== currentProjectId);
    if (others.length === 0) {
      return { ok: true, output: "Aucun autre projet trouvé pour cet utilisateur." };
    }
    // Récup file_count via sandbox_state en batch
    const { data: states } = await supabase
      .from("project_sandbox_state")
      .select("project_id, file_count, updated_at")
      .in("project_id", others.map((p) => p.id));
    const countMap = new Map<string, number>();
    for (const s of states ?? []) countMap.set(s.project_id, s.file_count);
    const lines = others.map((p) => {
      const fc = countMap.get(p.id) ?? 0;
      return `• ${p.name}  [${p.type}]  id=${p.id}  ${fc} fichier(s)  maj=${new Date(p.updated_at).toISOString().slice(0, 10)}`;
    });
    return {
      ok: true,
      output: `📁 ${others.length} projet(s) disponible(s) :\n${lines.join("\n")}`,
    };
  }

  if (name === "project_read_file") {
    const sourceId = String(rawArgs.source_project_id ?? "").trim();
    const path = String(rawArgs.path ?? "").trim();
    if (!sourceId || !path) return { ok: false, output: "source_project_id + path requis" };
    const { data: state, error } = await supabase
      .from("project_sandbox_state")
      .select("files")
      .eq("project_id", sourceId)
      .maybeSingle();
    if (error) return { ok: false, output: `project_read_file: ${error.message}` };
    if (!state) return { ok: false, output: `Sandbox vide ou inaccessible : ${sourceId}` };
    const files = (state.files as unknown as SandboxFile[]) ?? [];
    const f = files.find((x) => x.path === path);
    if (!f) {
      const sample = files.slice(0, 20).map((x) => x.path).join("\n");
      return {
        ok: false,
        output: `Fichier "${path}" introuvable. Aperçu de la sandbox source :\n${sample}${files.length > 20 ? `\n… (+${files.length - 20})` : ""}`,
      };
    }
    const truncated =
      f.content.length > MAX_FILE_BYTES
        ? f.content.slice(0, MAX_FILE_BYTES) + "\n[…tronqué]"
        : f.content;
    return { ok: true, output: truncated };
  }

  if (name === "project_import_files") {
    const sourceId = String(rawArgs.source_project_id ?? "").trim();
    const overwrite = rawArgs.overwrite === true;
    const rawPaths = Array.isArray(rawArgs.paths) ? (rawArgs.paths as unknown[]) : [];
    if (!sourceId || rawPaths.length === 0) {
      return { ok: false, output: "source_project_id + paths (≥1) requis" };
    }
    if (!currentProjectId) {
      return { ok: false, output: "Aucun projet courant — impossible d'importer." };
    }
    const pathPairs = rawPaths
      .map((p) => {
        const obj = p as { source_path?: unknown; target_path?: unknown };
        const src = String(obj?.source_path ?? "").trim();
        const tgt = String(obj?.target_path ?? src).trim();
        return src ? { src, tgt } : null;
      })
      .filter((x): x is { src: string; tgt: string } => x !== null);
    if (pathPairs.length === 0) return { ok: false, output: "Aucun source_path valide." };

    const { data: state, error } = await supabase
      .from("project_sandbox_state")
      .select("files, project_id")
      .eq("project_id", sourceId)
      .maybeSingle();
    if (error) return { ok: false, output: `project_import_files: ${error.message}` };
    if (!state) return { ok: false, output: `Sandbox source vide : ${sourceId}` };
    const sourceFiles = (state.files as unknown as SandboxFile[]) ?? [];

    const imported: string[] = [];
    const skipped: string[] = [];
    const missing: string[] = [];

    // Récup org_id du projet courant pour l'index RAG
    const { data: currentProj } = await supabase
      .from("projects")
      .select("org_id, name")
      .eq("id", currentProjectId)
      .maybeSingle();
    const { data: sourceProj } = await supabase
      .from("projects")
      .select("name")
      .eq("id", sourceId)
      .maybeSingle();
    const sourceLabel = sourceProj?.name ?? sourceId.slice(0, 8);

    const docsToInsert: Array<{
      project_id: string;
      org_id: string;
      owner_id: string;
      title: string;
      content: string;
      tags: string[];
    }> = [];

    for (const { src, tgt } of pathPairs) {
      const f = sourceFiles.find((x) => x.path === src);
      if (!f) {
        missing.push(src);
        continue;
      }
      if (!overwrite && vfs.has(tgt)) {
        skipped.push(`${tgt} (déjà présent)`);
        continue;
      }
      vfs.set(tgt, f.content);
      mutations.push({ op: "write", path: tgt, content: f.content });
      imported.push(`${src}${src !== tgt ? ` → ${tgt}` : ""}`);

      if (currentProj?.org_id) {
        docsToInsert.push({
          project_id: currentProjectId,
          org_id: currentProj.org_id,
          owner_id: userId,
          title: `[Import ${sourceLabel}] ${tgt}`,
          content: `Source: projet "${sourceLabel}" (${sourceId})\nFichier: ${src} → ${tgt}\n\n\`\`\`\n${f.content.slice(0, 4000)}\n\`\`\``,
          tags: ["import-cross-project", sourceLabel.toLowerCase().replace(/\s+/g, "-")],
        });
      }
    }

    // Indexation RAG (best-effort, non-bloquant pour le user)
    if (docsToInsert.length > 0) {
      try {
        await supabase.from("project_docs").insert(docsToInsert);
      } catch (e) {
        console.warn("[project_import_files] RAG insert failed (non-fatal)", e);
      }
    }

    const lines = [
      `✅ ${imported.length}/${pathPairs.length} fichier(s) importé(s) depuis "${sourceLabel}"`,
      imported.length ? `\nImportés :\n${imported.map((p) => `  • ${p}`).join("\n")}` : "",
      skipped.length ? `\nIgnorés :\n${skipped.map((p) => `  • ${p}`).join("\n")}` : "",
      missing.length ? `\nIntrouvables dans le projet source :\n${missing.map((p) => `  • ${p}`).join("\n")}` : "",
      docsToInsert.length ? `\n📚 ${docsToInsert.length} doc(s) indexé(s) en mémoire RAG.` : "",
    ].filter(Boolean);

    return { ok: imported.length > 0, output: lines.join("\n") };
  }

  return null;
}
