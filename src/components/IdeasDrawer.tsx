import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, X, Check, Trash2, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Idea = {
  id: string;
  title: string;
  source: string | null;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
};

export function IdeasDrawer({
  open,
  onClose,
  projectId,
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  refreshKey?: number;
}) {
  const [items, setItems] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    const { data } = await supabase
      .from("ideas")
      .select("id,title,source,status,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data as Idea[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open, projectId, refreshKey]);

  const updateStatus = async (id: string, status: Idea["status"]) => {
    const { error } = await supabase.from("ideas").update({ status }).eq("id", id);
    if (error) return toast.error("Échec mise à jour");
    setItems((p) => p.map((i) => (i.id === id ? { ...i, status } : i)));
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("ideas").delete().eq("id", id);
    if (error) return toast.error("Échec suppression");
    setItems((p) => p.filter((i) => i.id !== id));
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border/40 bg-card/95 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-300" />
                <h2 className="text-sm font-semibold">Idées captées</h2>
                {items.filter((i) => i.status === "pending").length > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    {items.filter((i) => i.status === "pending").length}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {loading && (
                <p className="text-center text-xs text-muted-foreground">Chargement…</p>
              )}
              {!loading && items.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucune idée captée pour l'instant.</p>
                  <p className="max-w-xs text-xs text-muted-foreground/70">
                    Dans le chat, commence un message par <code>idée :</code>, <code>idea:</code> ou <code>💡</code> — Elena la note ici.
                  </p>
                </div>
              )}
              {items.map((i) => (
                <motion.div
                  key={i.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-lg border p-3 text-sm ${
                    i.status === "pending"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : i.status === "accepted"
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-border/40 bg-muted/20 opacity-60"
                  }`}
                >
                  <p className="text-foreground">{i.title}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(i.created_at).toLocaleString("fr-FR")}
                    </span>
                    <div className="flex gap-1">
                      {i.status !== "accepted" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-emerald-400 hover:text-emerald-300"
                          onClick={() => updateStatus(i.id, "accepted")}
                        >
                          <Check className="h-3 w-3" /> Garder
                        </Button>
                      )}
                      {i.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => updateStatus(i.id, "rejected")}
                        >
                          Rejeter
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                        onClick={() => remove(i.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** Détecte si un message utilisateur est une "idée à capter". */
export function detectIdea(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(?:💡|idée\s*:|idea\s*:|note\s*:)\s*(.+)/i);
  if (m) return m[1].trim().slice(0, 280);
  return null;
}
