import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Wallet, Save, AlertTriangle } from "lucide-react";

type Summary = {
  total_cost: number;
  total_tokens: number;
  month_usage: number;
  monthly_limit: number;
  alert_threshold_pct: number;
  over_threshold: boolean;
  over_limit: boolean;
};

export function BudgetSection() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [limit, setLimit] = useState<string>("50");
  const [threshold, setThreshold] = useState<string>("80");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: budget }, { data: sum }] = await Promise.all([
        supabase.from("budget_alerts" as never).select("*").eq("owner_id", user.id).maybeSingle(),
        supabase.rpc("get_costs_summary" as never, { _days: 30 } as never),
      ]);
      const b = budget as { monthly_limit_usd: number; alert_threshold_pct: number } | null;
      if (b) {
        setLimit(String(b.monthly_limit_usd));
        setThreshold(String(b.alert_threshold_pct));
      }
      setSummary(sum as unknown as Summary);
      setLoading(false);
    })();
  }, [user]);

  async function save() {
    if (!user) return;
    const lim = parseFloat(limit);
    const thr = parseInt(threshold, 10);
    if (isNaN(lim) || lim < 0) return toast.error("Limite invalide");
    if (isNaN(thr) || thr < 1 || thr > 100) return toast.error("Seuil invalide (1-100)");
    setSaving(true);
    const { error } = await supabase
      .from("budget_alerts" as never)
      .upsert({ owner_id: user.id, monthly_limit_usd: lim, alert_threshold_pct: thr } as never, {
        onConflict: "owner_id",
      } as never);
    setSaving(false);
    if (error) {
      toast.error("Erreur de sauvegarde");
      console.error(error);
    } else {
      toast.success("Budget mis à jour");
    }
  }

  const pct = summary && summary.monthly_limit > 0
    ? Math.min(100, (summary.month_usage / summary.monthly_limit) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <Card className="border-border/40 bg-card/40 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Usage du mois en cours</h3>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold">${(summary?.month_usage ?? 0).toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">
                sur ${(summary?.monthly_limit ?? 0).toFixed(2)} ({pct.toFixed(0)}%)
              </span>
            </div>
            <Progress value={pct} className="mt-2 h-2" />
            {summary?.over_limit && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Budget dépassé ce mois-ci. Augmente la limite ou attends le prochain cycle.</span>
              </div>
            )}
            {summary?.over_threshold && !summary.over_limit && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Tu approches de ta limite ({summary.alert_threshold_pct}% atteint).</span>
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="border-border/40 bg-card/40 p-5">
        <h3 className="mb-4 text-sm font-semibold">Réglages d'alerte</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="limit" className="text-xs">Limite mensuelle (USD)</Label>
            <Input
              id="limit"
              type="number"
              min="0"
              step="0.01"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">0 = pas de limite (alerte désactivée)</p>
          </div>
          <div>
            <Label htmlFor="threshold" className="text-xs">Seuil d'alerte (%)</Label>
            <Input
              id="threshold"
              type="number"
              min="1"
              max="100"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">Alerte affichée à partir de ce pourcentage.</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="mt-4">
          <Save className="h-4 w-4" /> {saving ? "Sauvegarde…" : "Enregistrer"}
        </Button>
      </Card>
    </div>
  );
}
