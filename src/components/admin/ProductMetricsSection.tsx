import { useEffect, useState, type ComponentType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Users, TrendingUp, Filter } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Metrics = {
  days: number;
  dau: number;
  wau: number;
  mau: number;
  series: { day: string; users: number }[];
  funnel: { signups: number; with_project: number; with_message: number };
  retention: { d1: number; d7: number; d30: number; cohort_size: number };
  generated_at: string;
};

const RANGES = [7, 30, 90] as const;

const RechartsXAxis = XAxis as unknown as ComponentType<Record<string, unknown>>;
const RechartsYAxis = YAxis as unknown as ComponentType<Record<string, unknown>>;
const RechartsTooltip = Tooltip as unknown as ComponentType<Record<string, unknown>>;
const RechartsArea = Area as unknown as ComponentType<Record<string, unknown>>;

export function ProductMetricsSection() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (d: number) => {
    setLoading(true);
    setError(null);
    const { data: res, error } = await supabase.rpc("get_product_metrics" as never, {
      _days: d,
    } as never);
    if (error) setError(error.message);
    else setData(res as unknown as Metrics);
    setLoading(false);
  };

  useEffect(() => {
    load(days);
  }, [days]);

  const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Métriques produit
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            DAU / WAU / MAU, rétention et funnel d'activation. Données calculées côté base.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border/40 bg-card/40 p-0.5 text-xs">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={`rounded px-2 py-1 ${
                  days === r ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >
                {r}j
              </button>
            ))}
          </div>
          <Button onClick={() => load(days)} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: "DAU (24h)", value: data?.dau ?? 0 },
          { label: "WAU (7j)", value: data?.wau ?? 0 },
          { label: "MAU (30j)", value: data?.mau ?? 0 },
        ].map((s) => (
          <Card key={s.label} className="border-border/40 bg-card/40 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> {s.label}
            </div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* DAU chart */}
      <Card className="border-border/40 bg-card/40 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="h-4 w-4 text-primary" /> Utilisateurs actifs / jour
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.series ?? []}>
              <defs>
                <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <RechartsXAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <RechartsYAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <RechartsTooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <RechartsArea
                type="monotone"
                dataKey="users"
                stroke="hsl(var(--primary))"
                fill="url(#dauGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Funnel */}
        <Card className="border-border/40 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4 text-primary" /> Funnel d'activation ({days}j)
          </div>
          {data && (
            <div className="space-y-2">
              {[
                { label: "Inscriptions", value: data.funnel.signups, base: data.funnel.signups },
                {
                  label: "→ Projet créé",
                  value: data.funnel.with_project,
                  base: data.funnel.signups,
                },
                {
                  label: "→ Message envoyé",
                  value: data.funnel.with_message,
                  base: data.funnel.signups,
                },
              ].map((row) => {
                const p = pct(row.value, row.base);
                return (
                  <div key={row.label}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium text-foreground">
                        {row.value} <span className="text-muted-foreground">({p}%)</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.min(100, p)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Retention */}
        <Card className="border-border/40 bg-card/40 p-4">
          <div className="mb-3 text-sm font-medium">
            Rétention (cohortes {days}j) ·{" "}
            <span className="text-muted-foreground">
              n = {data?.retention.cohort_size ?? 0}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["d1", "d7", "d30"] as const).map((k) => (
              <div
                key={k}
                className="rounded-lg border border-border/40 bg-muted/20 p-3 text-center"
              >
                <div className="text-[11px] uppercase text-muted-foreground">{k}</div>
                <div className="mt-1 text-xl font-semibold">
                  {data?.retention[k] ?? 0}
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            % d'utilisateurs revenus envoyer un message à J+1, J+7 et J+30 après leur
            inscription.
          </p>
        </Card>
      </div>
    </div>
  );
}
