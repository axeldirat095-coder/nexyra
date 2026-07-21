/**
 * BlocksDrawer — catalogue de blocs UI prêts à insérer dans la sandbox.
 * Liste les blocs depuis Supabase, groupés par catégorie, et insère le code
 * choisi dans src/App.tsx via blocksInsert.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Blocks, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { blocksInsert, blocksList } from "@/lib/e2b.functions";
import { cn } from "@/lib/utils";

type Block = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  preview_emoji: string | null;
  sort_order: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  hero: "Hero",
  features: "Features",
  pricing: "Pricing",
  testimonials: "Témoignages",
  cta: "Appel à l'action",
  footer: "Footer",
};

export function BlocksDrawer({ projectId }: { projectId: string }) {
  const list = useServerFn(blocksList);
  const insert = useServerFn(blocksInsert);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [inserting, setInserting] = useState<string | null>(null);

  useEffect(() => {
    if (!open || blocks.length > 0) return;
    setLoading(true);
    list({})
      .then((r) => setBlocks(r.blocks))
      .catch((e) => toast.error(`Chargement KO : ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLoading(false));
  }, [open, blocks.length, list]);

  const handleInsert = async (block: Block) => {
    if (inserting) return;
    setInserting(block.id);
    const tid = toast.loading(`Insertion de "${block.name}"…`);
    try {
      await insert({ data: { projectId, blockId: block.id } });
      toast.success(`Bloc "${block.name}" inséré`, { id: tid });
      // Notifier le preview iframe pour recharger
      window.dispatchEvent(new CustomEvent("nexyra:e2b-file-mutated"));
    } catch (e) {
      toast.error(`Insertion KO : ${e instanceof Error ? e.message : String(e)}`, { id: tid });
    } finally {
      setInserting(null);
    }
  };

  // Groupe par catégorie
  const grouped = blocks.reduce<Record<string, Block[]>>((acc, b) => {
    (acc[b.category] ??= []).push(b);
    return acc;
  }, {});

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Catalogue de blocs UI"
        className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-blue-300 hover:bg-blue-500/10"
      >
        <Blocks className="h-3 w-3" /> Blocs
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-slate-950 shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Bibliothèque de blocs</h2>
                <p className="text-[11px] text-slate-500">
                  Cliquez pour insérer dans la page actuelle
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-auto p-3">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
                </div>
              ) : blocks.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Aucun bloc disponible.
                </div>
              ) : (
                Object.entries(grouped).map(([cat, items]) => (
                  <section key={cat} className="mb-5">
                    <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {CATEGORY_LABEL[cat] ?? cat}
                    </h3>
                    <div className="space-y-2">
                      {items.map((b) => {
                        const busy = inserting === b.id;
                        return (
                          <button
                            key={b.id}
                            disabled={busy}
                            onClick={() => void handleInsert(b)}
                            className={cn(
                              "group flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-left transition",
                              "hover:border-blue-500/50 hover:bg-slate-900/80",
                              busy && "opacity-50",
                            )}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xl">
                              {b.preview_emoji ?? "🧩"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-slate-100">{b.name}</div>
                              {b.description && (
                                <div className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">
                                  {b.description}
                                </div>
                              )}
                            </div>
                            {busy ? (
                              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-400" />
                            ) : (
                              <Plus className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-blue-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
