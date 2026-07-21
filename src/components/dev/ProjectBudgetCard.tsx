import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, ShieldAlert, Zap, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type BudgetStatus = {
  usage: number;
  limit: number | null;
  has_quota: boolean;
  pct: number;
  draft_mode: boolean;
  hard_block: boolean;
};

interface Props {
  projectId: string;
  isOwner: boolean;
}

/**
 * Carte budget projet pour le workspace /dev.
 * Affiche : usage mensuel, % du budget, toggle "Mode brouillon" (force eco).
 * Refresh auto toutes les 30s. Visible uniquement si l'utilisateur est owner du projet.
 */
export function ProjectBudgetCard({ projectId, isOwner }: Props) {
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "get_project_budget_status" as never,
      { _project_id: projectId } as never,
    );
    if (!error && data) setStatus(data as unknown as BudgetStatus);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const toggleDraft = async (next: boolean) => {
    setToggling(true);
    const { error } = await supabase
      .from("projects")
      .update({ draft_mode: next })
      .eq("id", projectId);
    setToggling(false);
    if (error) {
      toast.error("Impossible de modifier le mode brouillon");
      return;
    }
    setStatus((s) => (s ? { ...s, draft_mode: next } : s));
    toast.success(
      next
        ? "Mode brouillon ON — Elena passe en éco (modèles low-cost)"
        : "Mode brouillon OFF — Elena retrouve son routage normal",
    );
  };

  if (!isOwner) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/30 bg-secondary/10 px-2.5 py-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> budget…
      </div>
    );
  }

  if (!status) return null;

  const { has_quota, usage, limit, pct, draft_mode, hard_block } = status;
  const blocked = hard_block || (has_quota && limit !== null && usage >= limit);
  const warning = has_quota && pct >= 80 && !blocked;

  const tone = blocked
    ? "border-destructive/40 bg-destructive/10"
    : warning
      ? "border-amber-500/40 bg-amber-500/10"
      : "border-border/30 bg-secondary/15";

  return (
    <div
      className={`hidden md:flex items-center gap-2 rounded-md border ${tone} px-2.5 py-1.5 text-[10px] backdrop-blur-md`}
      title={`Budget mensuel du projet — $${usage.toFixed(2)}${has_quota ? ` / $${(limit ?? 0).toFixed(2)}` : ""}`}
    >
      {blocked ? (
        <ShieldAlert className="h-3 w-3 shrink-0 text-destructive" />
      ) : (
        <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" />
      )}
      <div className="flex flex-col gap-0.5 min-w-[70px] xl:min-w-[90px]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-foreground">
            {has_quota
              ? `$${usage.toFixed(2)} / $${(limit ?? 0).toFixed(2)}`
              : `$${usage.toFixed(2)}`}
          </span>
          <button
            onClick={() => void refresh()}
            className="text-muted-foreground transition-colors hover:text-foreground"
            title="Rafraîchir"
            type="button"
          >
            <RefreshCw className="h-2.5 w-2.5" />
          </button>
        </div>
        {has_quota && (
          <Progress
            value={Math.min(100, pct)}
            className="h-1 w-full bg-border/40"
          />
        )}
      </div>

      <div className="ml-1 hidden xl:flex items-center gap-1.5 border-l border-border/30 pl-2">
        <Zap className={`h-3 w-3 shrink-0 ${draft_mode ? "text-emerald-400" : "text-muted-foreground"}`} />
        <span className="text-muted-foreground">Brouillon</span>
        <Switch
          checked={draft_mode}
          onCheckedChange={toggleDraft}
          disabled={toggling}
          className="scale-75"
        />
      </div>
    </div>
  );
}
