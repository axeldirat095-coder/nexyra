/**
 * Elena V3 — Lot 6: catalogue de templates projet sectoriels.
 * Chaque template décrit ses pages et la liste de blocs UI à assembler.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TemplatePage = {
  path: string;
  title: string;
  blocks: string[];
};

export type ProjectTemplate = {
  slug: string;
  sector: string;
  title: string;
  description: string;
  ideal_for: string | null;
  features: string[];
  pages: TemplatePage[];
  block_slugs: string[];
  popularity: number;
};

export async function listTemplates(opts: {
  sector?: string | null;
  limit?: number;
}): Promise<ProjectTemplate[]> {
  const { data, error } = await supabaseAdmin.rpc("list_project_templates", {
    p_sector: opts.sector ?? undefined,
    p_limit: opts.limit ?? 20,
  });
  if (error) throw new Error(`list_project_templates: ${error.message}`);
  return (data ?? []) as ProjectTemplate[];
}

export async function getTemplateBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("project_templates")
    .select("slug, sector, title, description, ideal_for, pages, block_slugs, features, design_notes, popularity")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`get_template: ${error.message}`);
  if (!data) throw new Error(`Template not found: ${slug}`);
  void supabaseAdmin.rpc("record_template_usage", { p_slug: slug });
  return data;
}
