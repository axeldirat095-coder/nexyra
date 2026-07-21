/**
 * Elena V3 — Axe B: mémoire projet long terme.
 * Persiste brief, secteur, décisions, fichiers livrés et TODO entre sessions WebContainer.
 * Toujours scopé au user authentifié via supabase auth-middleware client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type SB = SupabaseClient;

export type WorkspaceMemory = {
  workspace_id: string;
  brief: string | null;
  sector: string | null;
  design_notes: string | null;
  tech_decisions: string[];
  delivered_files: string[];
  open_todos: string[];
  scratch: Record<string, unknown>;
  updated_at: string | null;
};

const EMPTY = (workspaceId: string): WorkspaceMemory => ({
  workspace_id: workspaceId,
  brief: null,
  sector: null,
  design_notes: null,
  tech_decisions: [],
  delivered_files: [],
  open_todos: [],
  scratch: {},
  updated_at: null,
});

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function readMemory(
  supabase: SB,
  userId: string,
  workspaceId = "default",
): Promise<WorkspaceMemory> {
  const { data, error } = await supabase
    .from("workspace_memory")
    .select("workspace_id, brief, sector, design_notes, tech_decisions, delivered_files, open_todos, scratch, updated_at")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`memory_read: ${error.message}`);
  if (!data) return EMPTY(workspaceId);
  return {
    workspace_id: data.workspace_id,
    brief: data.brief,
    sector: data.sector,
    design_notes: data.design_notes,
    tech_decisions: asStringArray(data.tech_decisions),
    delivered_files: asStringArray(data.delivered_files),
    open_todos: asStringArray(data.open_todos),
    scratch: (data.scratch as Record<string, unknown>) ?? {},
    updated_at: data.updated_at,
  };
}

export type MemoryPatch = Partial<{
  brief: string;
  sector: string;
  design_notes: string;
  tech_decisions: string[];
  delivered_files: string[];
  open_todos: string[];
  scratch: Record<string, unknown>;
}>;

export async function writeMemory(
  supabase: SB,
  userId: string,
  patch: MemoryPatch,
  workspaceId = "default",
): Promise<WorkspaceMemory> {
  const current = await readMemory(supabase, userId, workspaceId);
  const next = {
    user_id: userId,
    workspace_id: workspaceId,
    brief: patch.brief ?? current.brief,
    sector: patch.sector ?? current.sector,
    design_notes: patch.design_notes ?? current.design_notes,
    tech_decisions: patch.tech_decisions ?? current.tech_decisions,
    delivered_files: patch.delivered_files ?? current.delivered_files,
    open_todos: patch.open_todos ?? current.open_todos,
    scratch: patch.scratch ?? current.scratch,
  };
  const { error } = await supabase
    .from("workspace_memory")
    .upsert(next, { onConflict: "user_id,workspace_id" });
  if (error) throw new Error(`memory_write: ${error.message}`);
  return readMemory(supabase, userId, workspaceId);
}

export type AppendPatch = Partial<{
  tech_decisions: string[];
  delivered_files: string[];
  open_todos: string[];
}>;

function uniqMerge(a: string[], b: string[]): string[] {
  const set = new Set(a);
  for (const x of b) set.add(x);
  return Array.from(set).slice(-100); // cap à 100 entrées par liste
}

export async function appendMemory(
  supabase: SB,
  userId: string,
  patch: AppendPatch,
  workspaceId = "default",
): Promise<WorkspaceMemory> {
  const current = await readMemory(supabase, userId, workspaceId);
  return writeMemory(
    supabase,
    userId,
    {
      tech_decisions: patch.tech_decisions ? uniqMerge(current.tech_decisions, patch.tech_decisions) : current.tech_decisions,
      delivered_files: patch.delivered_files ? uniqMerge(current.delivered_files, patch.delivered_files) : current.delivered_files,
      open_todos: patch.open_todos ? uniqMerge(current.open_todos, patch.open_todos) : current.open_todos,
    },
    workspaceId,
  );
}

export function memorySummaryForPrompt(m: WorkspaceMemory): string {
  const isEmpty = !m.brief && !m.sector && !m.design_notes
    && m.tech_decisions.length === 0 && m.delivered_files.length === 0 && m.open_todos.length === 0;
  if (isEmpty) {
    return "## Mémoire projet\n_(vide pour le moment — utilise `memory_write` dès que le user précise son brief/secteur, et `memory_append` pour acter chaque décision tech, fichier livré ou TODO)._";
  }
  const lines: string[] = ["## Mémoire projet (persistée entre sessions)"];
  if (m.brief) lines.push(`- **Brief** : ${m.brief}`);
  if (m.sector) lines.push(`- **Secteur** : ${m.sector}`);
  if (m.design_notes) lines.push(`- **Design** : ${m.design_notes}`);
  if (m.tech_decisions.length) lines.push(`- **Décisions tech** : ${m.tech_decisions.slice(-8).join(" · ")}`);
  if (m.delivered_files.length) lines.push(`- **Fichiers livrés** (${m.delivered_files.length}) : ${m.delivered_files.slice(-15).join(", ")}`);
  if (m.open_todos.length) lines.push(`- **TODO ouverts** : ${m.open_todos.slice(-10).map((t) => `• ${t}`).join("\n  ")}`);
  lines.push("\n_Mets à jour via `memory_write` (remplace) ou `memory_append` (ajoute aux listes)._");
  return lines.join("\n");
}
