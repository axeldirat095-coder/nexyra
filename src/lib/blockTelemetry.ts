import { supabase } from "@/integrations/supabase/client";

/**
 * Logge l'usage d'un bloc marketplace (insertion, preview, fork...).
 * Best-effort : n'interrompt jamais le flow utilisateur.
 */
export async function logBlockUsage(opts: {
  blockSlug: string;
  projectId?: string | null;
  event?: "insert" | "preview" | "fork" | "view";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("block_usage_events").insert([{
      block_slug: opts.blockSlug,
      project_id: opts.projectId ?? null,
      user_id: user?.id ?? null,
      event: opts.event ?? "insert",
      metadata: (opts.metadata ?? {}) as never,
    }]);
  } catch {
    // silent
  }
}
