/**
 * Server functions pour la mémoire scratch d'Elena (workspace_memory).
 * Permet à l'utilisateur de voir/éditer le brief, secteur, design_notes,
 * tech_decisions, open_todos qu'Elena se construit automatiquement.
 *
 * Utilisé par ProjectMemoryDrawer onglet "Brief Elena".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readMemory, writeMemory } from "@/server/elena-memory.server";

const WorkspaceIdInput = z.object({
  workspaceId: z.string().min(1).max(200).default("default"),
});

function toDto(m: Awaited<ReturnType<typeof readMemory>>) {
  // Omet `scratch` (Record<string, unknown> non-sérialisable côté RPC).
  return {
    workspace_id: m.workspace_id,
    brief: m.brief,
    sector: m.sector,
    design_notes: m.design_notes,
    tech_decisions: m.tech_decisions,
    delivered_files: m.delivered_files,
    open_todos: m.open_todos,
    updated_at: m.updated_at,
  };
}

export const getWorkspaceMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => WorkspaceIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const memory = await readMemory(context.supabase, context.userId, data.workspaceId);
    return { memory: toDto(memory) };
  });

const PatchInput = WorkspaceIdInput.extend({
  brief: z.string().max(4000).nullable().optional(),
  sector: z.string().max(500).nullable().optional(),
  design_notes: z.string().max(4000).nullable().optional(),
  tech_decisions: z.array(z.string().min(1).max(500)).max(100).optional(),
  delivered_files: z.array(z.string().min(1).max(500)).max(200).optional(),
  open_todos: z.array(z.string().min(1).max(500)).max(100).optional(),
});

export const updateWorkspaceMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PatchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { workspaceId, ...patch } = data;
    // Convertit null → string vide (writeMemory garde l'ancienne valeur si undefined)
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      normalized[k] = v === null ? "" : v;
    }
    const memory = await writeMemory(
      context.supabase,
      context.userId,
      normalized as Parameters<typeof writeMemory>[2],
      workspaceId,
    );
    return { memory: toDto(memory) };
  });
