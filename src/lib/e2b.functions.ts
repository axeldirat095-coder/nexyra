/**
 * Server functions exposant l'infra E2B au client.
 * Auth obligatoire — toutes les opérations sont scopées (owner_id, project_id).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ensureSandbox,
  exportProjectZip,
  getInstallStatus,
  listFiles,
  readFile,
  runCommand,
  scaffoldViteProject,
  startViteDev,
  waitForPortOpen,
  writeFile,
} from "@/server/e2b-sandbox.server";

const ProjectInput = z.object({ projectId: z.string().min(1).max(120) });

export const e2bEnsure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { previewUrl, created } = await ensureSandbox(context.userId, data.projectId);
    return { previewUrl, created };
  });

export const e2bWriteFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    ProjectInput.extend({
      path: z.string().min(1).max(500),
      contents: z.string().max(2_000_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await writeFile(context.userId, data.projectId, data.path, data.contents);
    return { ok: true, path: data.path, bytes: data.contents.length };
  });

export const e2bReadFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProjectInput.extend({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    try {
      const contents = await readFile(context.userId, data.projectId, data.path);
      return { ok: true, path: data.path, contents };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("does not exist") || e?.name === "FileNotFoundError") {
        return { ok: false, path: data.path, contents: "", error: "not_found" as const };
      }
      throw e;
    }
  });

export const e2bListFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    ProjectInput.extend({ subPath: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    return listFiles(context.userId, data.projectId, data.subPath ?? "");
  });

export const e2bRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    ProjectInput.extend({
      cmd: z.string().min(1).max(500),
      cwd: z.string().max(500).optional(),
      background: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const res = await runCommand(context.userId, data.projectId, data.cmd, {
      cwd: data.cwd,
      background: data.background,
    });
    return res;
  });

export const e2bWaitForPort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    ProjectInput.extend({ port: z.number().int().min(1).max(65_535) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    return waitForPortOpen(context.userId, data.projectId, data.port);
  });

export const e2bScaffoldVite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    try {
      return await scaffoldViteProject(context.userId, data.projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { installed: false, durationMs: 0, error: message };
    }
  });

export const e2bInstallStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    return getInstallStatus(context.userId, data.projectId);
  });

export const e2bStartViteDev = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    await startViteDev(context.userId, data.projectId);
    return { ok: true };
  });

export const e2bExportZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    return exportProjectZip(context.userId, data.projectId);
  });

import { dumpProjectFiles, resetSandbox, restoreProjectFiles } from "@/server/e2b-sandbox.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const e2bSaveSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    ProjectInput.extend({
      label: z.string().min(1).max(120).default("Sauvegarde"),
      replace: z.boolean().optional().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { files, bytes } = await dumpProjectFiles(context.userId, data.projectId);

    // Mode "replace": efface toutes les sauvegardes précédentes pour ce projet
    // avant d'insérer la nouvelle. Permet d'avoir UNE sauvegarde unique
    // qui s'écrase à chaque clic sur le bouton Save.
    if (data.replace) {
      await (supabaseAdmin as any)
        .from("sandbox_snapshots")
        .delete()
        .eq("owner_id", context.userId)
        .eq("project_key", data.projectId);
    }

    const { data: row, error } = await (supabaseAdmin as any)
      .from("sandbox_snapshots")
      .insert({
        owner_id: context.userId,
        project_key: data.projectId,
        label: data.label,
        files,
        file_count: files.length,
        size_bytes: bytes,
      })
      .select("id, label, file_count, size_bytes, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { snapshot: row };
  });

export const e2bListSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("sandbox_snapshots")
      .select("id, label, file_count, size_bytes, created_at")
      .eq("owner_id", context.userId)
      .eq("project_key", data.projectId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { snapshots: rows ?? [] };
  });

export const e2bRestoreSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProjectInput.extend({ snapshotId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (supabaseAdmin as any)
      .from("sandbox_snapshots")
      .select("files")
      .eq("id", data.snapshotId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Snapshot introuvable");
    const files = (row.files ?? []) as { path: string; contents: string }[];
    const { written } = await restoreProjectFiles(context.userId, data.projectId, files);
    return { written };
  });

export const e2bDeleteSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ snapshotId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (supabaseAdmin as any)
      .from("sandbox_snapshots")
      .delete()
      .eq("id", data.snapshotId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const e2bResetSandbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    return resetSandbox(context.userId, data.projectId);
  });

// ============================================================
// Catalogue de blocs UI
// ============================================================

export const blocksList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await (supabaseAdmin as any)
      .from("block_templates")
      .select("id, slug, name, category, description, preview_emoji, sort_order")
      .eq("is_public", true)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      blocks: (data ?? []) as Array<{
        id: string;
        slug: string;
        name: string;
        category: string;
        description: string | null;
        preview_emoji: string | null;
        sort_order: number;
      }>,
    };
  });

/**
 * Insère un bloc dans src/App.tsx de la sandbox.
 * Stratégie : lire App.tsx, injecter le JSX juste avant la dernière balise
 * fermante du return principal. Si pattern non trouvé, on remplace App.tsx
 * par un wrapper minimal contenant ce bloc.
 */
export const blocksInsert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProjectInput.extend({ blockId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: block, error } = await (supabaseAdmin as any)
      .from("block_templates")
      .select("name, code")
      .eq("id", data.blockId)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!block) throw new Error("Bloc introuvable");

    const blockJsx: string = block.code;
    const blockName: string = block.name;
    const appPath = "src/App.tsx";

    let current = "";
    try {
      current = await readFile(context.userId, data.projectId, appPath);
    } catch {
      // App.tsx n'existe pas encore
    }

    const indentedBlock = blockJsx
      .split("\n")
      .map((l) => "        " + l)
      .join("\n");
    const wrapped = `\n      {/* ▼ Bloc inséré: ${blockName} */}\n      <div className="w-full">\n${indentedBlock}\n      </div>\n      {/* ▲ Fin bloc */}\n`;

    // Marqueur de conteneur vertical Nexyra — garantit que les blocs s'empilent.
    const NEXYRA_STACK = `<div className="flex flex-col w-full min-h-screen" data-nexyra-stack="true">`;
    let next: string;
    const hasStack = current.includes('data-nexyra-stack="true"');

    if (hasStack) {
      // Insère juste avant le </div> de fermeture du stack Nexyra.
      const stackStart = current.indexOf(NEXYRA_STACK);
      // Trouve la dernière </div> du fichier (= fermeture du stack).
      const lastDiv = current.lastIndexOf("</div>");
      if (stackStart >= 0 && lastDiv > stackStart) {
        next = current.slice(0, lastDiv) + wrapped + current.slice(lastDiv);
      } else {
        next =
          current.slice(0, current.lastIndexOf("</div>")) +
          wrapped +
          current.slice(current.lastIndexOf("</div>"));
      }
    } else {
      // Premier bloc → on remplace App.tsx par un wrapper vertical propre.
      next = `export default function App() {\n  return (\n    ${NEXYRA_STACK}\n${wrapped}    </div>\n  );\n}\n`;
    }

    console.log(
      `[blocksInsert] project=${data.projectId} block="${blockName}" currentBytes=${current.length} hasStack=${hasStack} nextBytes=${next.length}`,
    );
    await writeFile(context.userId, data.projectId, appPath, next);
    // Vérification : relit App.tsx pour confirmer la persistance
    const verify = await readFile(context.userId, data.projectId, appPath).catch(() => "");
    console.log(`[blocksInsert] verify bytes=${verify.length} match=${verify === next}`);
    return {
      ok: true,
      blockName,
      bytes: next.length,
      verifyBytes: verify.length,
      preview: next.slice(0, 300),
    };
  });
