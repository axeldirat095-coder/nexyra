import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

type QuotaStatus = {
  allowed: boolean;
  usage?: number;
  limit?: number;
  remaining?: number;
  reason?: string;
};

export function QuotaStatusCard() {
  const [status, setStatus] = useState<QuotaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_user_quota_status" as never);
      if (!error && data) setStatus(data as unknown as QuotaStatus);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card className="border-border/40 bg-card/40 p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement du quota…
        </div>
      </Card>
    );
  }

  if (!status) return null;

  // Pas de quota défini = liberté
  if (!status.limit || status.limit > 100000) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <div>
            <h3 className="text-sm font-semibold">Aucune limite mensuelle</h3>
            <p className="text-xs text-muted-foreground">
              Tu n'as pas de quota strict défini sur ton compte.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const usage = status.usage ?? 0;
  const limit = status.limit;
  const pct = Math.min(100, (usage / limit) * 100);
  const blocked = !status.allowed;

  return (
    <Card
      className={
        blocked
          ? "border-destructive/40 bg-destructive/5 p-5"
          : pct >= 80
            ? "border-amber-500/30 bg-amber-500/5 p-5"
            : "border-border/40 bg-card/40 p-5"
      }
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {blocked ? (
            <ShieldAlert className="h-5 w-5 text-destructive" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-primary" />
          )}
          <h3 className="text-sm font-semibold">
            {blocked ? "Compte bloqué" : "Quota mensuel"}
          </h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {usage.toFixed(2)} / {limit.toFixed(2)} USD
        </span>
      </div>
      <Progress value={pct} className="h-2" />
      {blocked && status.reason && (
        <p className="mt-3 text-xs text-destructive">{status.reason}</p>
      )}
      {!blocked && pct >= 80 && (
        <p className="mt-3 text-xs text-amber-200">
          ⚠️ Tu approches de ta limite mensuelle. Contacte l'admin si besoin.
        </p>
      )}
    </Card>
  );
}
