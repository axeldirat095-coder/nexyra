import { useEffect, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface CreditsRow {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
}

export function CreditsBalance({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const [row, setRow] = useState<CreditsRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("user_credits")
        .select("balance, lifetime_earned, lifetime_spent")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setRow(
          data ?? { balance: 0, lifetime_earned: 0, lifetime_spent: 0 },
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-200">
        <Coins className="h-3 w-3" />
        {loading ? "…" : (row?.balance ?? 0).toFixed(0)}
      </span>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-5 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Coins className="h-4 w-4 text-amber-400" />
          Solde de crédits
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>
      <div className="mt-3 text-3xl font-bold gradient-text">
        {loading ? "—" : Number(row?.balance ?? 0).toFixed(2)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div>
          <div className="font-medium text-foreground">{Number(row?.lifetime_earned ?? 0).toFixed(0)}</div>
          <div>Total gagné</div>
        </div>
        <div>
          <div className="font-medium text-foreground">{Number(row?.lifetime_spent ?? 0).toFixed(0)}</div>
          <div>Total dépensé</div>
        </div>
      </div>
    </div>
  );
}
