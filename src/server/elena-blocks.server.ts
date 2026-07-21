/**
 * Elena V3 — accès à la bibliothèque de blocs UI premium (table `code_blocks`).
 * Utilisé par les tools `search_blocks` / `get_block` côté serveur.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BlockSearchResult = {
  slug: string;
  category: string;
  sector: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  dependencies: string[] | null;
  popularity: number;
  rank: number;
};

export async function searchBlocks(opts: {
  query?: string | null;
  category?: string | null;
  sector?: string | null;
  limit?: number;
}): Promise<BlockSearchResult[]> {
  const { data, error } = await supabaseAdmin.rpc("search_code_blocks", {
    _query: opts.query ?? undefined,
    _category: (opts.category as never) ?? undefined,
    _sector: (opts.sector as never) ?? undefined,
    _limit: opts.limit ?? 8,
  });
  if (error) throw new Error(`search_code_blocks: ${error.message}`);
  return (data ?? []) as BlockSearchResult[];
}

export async function getBlockBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("code_blocks")
    .select("slug, title, description, category, sector, tags, dependencies, code, popularity")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`get_block: ${error.message}`);
  if (!data) throw new Error(`Block not found: ${slug}`);
  // Bump popularité (best-effort, on ignore les erreurs)
  void supabaseAdmin.rpc("record_block_usage", { _slug: slug });
  return data;
}
