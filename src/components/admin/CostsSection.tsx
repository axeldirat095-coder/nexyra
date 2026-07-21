import { useEffect, useMemo, useState, type ComponentType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  AlertTriangle,
  TrendingUp,
  Coins,
  Database as DbIcon,
  Zap,
  RefreshCw,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";

type CostsSummary = {
  days: number;
  is_admin_view: boolean;
  total_cost: number;
  total_tokens: number;
  series: Array<{ day: string; cost: number; tokens: number }>;
  top_projects: Array<{ project_id: string; project_name: string; cost: number; messages: number }>;
  month_usage: number;
  monthly_limit: number;
  alert_threshold_pct: number;
  over_threshold: boolean;
  over_limit: boolean;
};

type CacheStats = {
  entries: number;
  total_hits: number;
  total_cost_saved: number;
  total_tokens_saved: number;
};

type RoutingLevel = {
  level: string;
  messages: number;
  cost: number;
  tokens: number;
  share_pct: number;
};

type RoutingDistribution = {
  days: number;
  is_admin_view: boolean;
  total_messages: number;
  total_cost: number;
  levels: RoutingLevel[];
};

const RANGES = [7, 30, 90] as const;
const REFRESH_INTERVAL_MS = 60_000;

const LEVEL_META: Record<string, { label: string; color: string }> = {
  eco: { label: "Éco", color: "bg-emerald-400" },
  standard: { label: "Standard", color: "bg-sky-400" },
  premium: { label: "Premium", color: "bg-fuchsia-400" },
  auto: { label: "Auto", color: "bg-amber-400" },
  unknown: { label: "Inconnu", color: "bg-muted-foreground" },
};

const RechartsXAxis = XAxis as unknown as ComponentType<Record<string, unknown>>;
const RechartsYAxis = YAxis as unknown as ComponentType<Record<string, unknown>>;
const RechartsTooltip = Tooltip as unknown as ComponentType<Record<string, unknown>>;
const RechartsLine = Line as unknown as ComponentType<Record<string, unknown>>;

export function CostsSection() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<CostsSummary | null>(null);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [routing, setRouting] = useState<RoutingDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function load(d: number) {
    setLoading(true);
    const [{ data: res, error }, { data: cstats }, { data: routingRes }] = await Promise.all([
      supabase.rpc("get_costs_summary" as never, { _days: d } as never),
      supabase.rpc("get_cache_stats" as never),
      supabase.rpc("get_routing_distribution" as never, { _days: d } as never),
    ]);
    if (error) {
      toast.error("Erreur de chargement des coûts");
      console.error(error);
    } else {
      setData(res as unknown as CostsSummary);
    }
    if (cstats) setCache(cstats as unknown as CacheStats);
    if (routingRes) setRouting(routingRes as unknown as RoutingDistribution);
    setLastRefresh(new Date());
    setLoading(false);
  }

  useEffect(() => {
    load(days);
    const interval = window.setInterval(() => load(days), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [days]);

  const ecoShare = useMemo(() => {
    if (!routing || routing.total_messages === 0) return null;
    const eco = routing.levels.find((l) => l.level === "eco");
    return eco?.share_pct ?? 0;
  }, [routing]);

  const cacheHitRate = useMemo(() => {
    if (!cache) return null;
    const assistantCalls = routing?.total_messages ?? 0;
    const totalCalls = assistantCalls + cache.total_hits;
    if (totalCalls === 0) return null;
    return Math.round((cache.total_hits / totalCalls) * 100);
  }, [cache, routing]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Pilotage coûts & routing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vue temps réel (refresh auto 60s). Cible : &gt;70% des appels en éco, hit rate cache &gt; 30%.
          </p>
          {lastRefresh && (
            <p className="mt-1 text-[11px] text-muted-foreground/70">
              Dernier refresh : {lastRefresh.toLocaleTimeString("fr-FR")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {RANGES.map((d) => (
              <Button
                key={d}
                variant={days === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(d)}
              >
                {d}j
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(days)}
            disabled={loading}
            aria-label="Rafraîchir maintenant"
            title="Rafraîchir maintenant"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {data?.over_limit && (
        <Card className="border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <h3 className="text-sm font-semibold text-destructive">Budget mensuel dépassé</h3>
              <p className="mt-1 text-xs text-destructive/90">
                Tu as dépensé ${data.month_usage.toFixed(2)} ce mois (limite ${data.monthly_limit.toFixed(2)}).
                Pense à ajuster ta limite dans Paramètres ou à activer le kill-switch.
              </p>
            </div>
          </div>
        </Card>
      )}

      {data?.over_threshold && !data.over_limit && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-semibold text-amber-200">Seuil d'alerte atteint</h3>
              <p className="mt-1 text-xs text-amber-100/80">
                Usage ce mois : ${data.month_usage.toFixed(2)} / ${data.monthly_limit.toFixed(2)} ({data.alert_threshold_pct}% atteint).
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard icon={<Wallet className="h-4 w-4" />} label={`Coût ${days}j`} value={`$${(data?.total_cost ?? 0).toFixed(2)}`} loading={loading} />
        <KpiCard icon={<Coins className="h-4 w-4" />} label={`Tokens ${days}j`} value={(data?.total_tokens ?? 0).toLocaleString("fr-FR")} loading={loading} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Mois en cours" value={`$${(data?.month_usage ?? 0).toFixed(2)}${data?.monthly_limit ? ` / $${data.monthly_limit.toFixed(2)}` : ""}`} loading={loading} />
        <KpiCard
          icon={<Zap className="h-4 w-4" />}
          label="Part éco"
          value={ecoShare == null ? "—" : `${ecoShare}%`}
          loading={loading}
          accent={ecoShare != null && ecoShare >= 70 ? "good" : ecoShare != null && ecoShare < 50 ? "warn" : undefined}
        />
        <KpiCard
          icon={<DbIcon className="h-4 w-4" />}
          label="Cache hit rate"
          value={cacheHitRate == null ? "—" : `${cacheHitRate}%`}
          loading={loading}
          accent={cacheHitRate != null && cacheHitRate >= 30 ? "good" : undefined}
        />
      </div>

      <Card className="border-border/40 bg-card/40 p-5">
        <h3 className="mb-4 text-sm font-semibold">Coût par jour (USD)</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.series ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border opacity-30" />
              <RechartsXAxis dataKey="day" className="text-muted-foreground" fontSize={11} />
              <RechartsYAxis className="text-muted-foreground" fontSize={11} />
              <RechartsTooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`$${Number(v).toFixed(4)}`, "Coût"]}
              />
              <RechartsLine type="monotone" dataKey="cost" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {cache && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <DbIcon className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-emerald-200">Cache mutualisé (économies réelles)</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Entrées actives" value={cache.entries.toLocaleString("fr-FR")} />
            <Stat label="Réutilisations" value={cache.total_hits.toLocaleString("fr-FR")} />
            <Stat label="Tokens économisés" value={cache.total_tokens_saved.toLocaleString("fr-FR")} />
            <Stat label="$ économisés" value={`$${Number(cache.total_cost_saved).toFixed(4)}`} accent />
          </div>
        </Card>
      )}

      <Card className="border-border/40 bg-card/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Distribution routing — {days}j</h3>
          <span className="text-[11px] text-muted-foreground">
            {routing?.total_messages?.toLocaleString("fr-FR") ?? 0} réponses Elena
          </span>
        </div>
        {routing && routing.levels.length > 0 ? (
          <div className="space-y-3">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/30">
              {routing.levels.map((lvl) => {
                const meta = LEVEL_META[lvl.level] ?? LEVEL_META.unknown;
                return (
                  <div
                    key={lvl.level}
                    className={meta.color}
                    style={{ width: `${lvl.share_pct}%` }}
                    title={`${meta.label} : ${lvl.share_pct}%`}
                  />
                );
              })}
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {routing.levels.map((lvl) => {
                const meta = LEVEL_META[lvl.level] ?? LEVEL_META.unknown;
                return (
                  <div
                    key={lvl.level}
                    className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.color}`} />
                      <div>
                        <p className="text-sm font-medium">{meta.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {lvl.messages.toLocaleString("fr-FR")} msg · ${Number(lvl.cost).toFixed(4)}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold">{lvl.share_pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Aucune donnée de routing sur la période.</p>
        )}
      </Card>

      <Card className="border-border/40 bg-card/40 p-5">
        <h3 className="mb-4 text-sm font-semibold">Top 5 projets coûteux</h3>
        {data?.top_projects && data.top_projects.length > 0 ? (
          <div className="space-y-2">
            {data.top_projects.map((p) => (
              <div
                key={p.project_id}
                className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{p.project_name}</p>
                  <p className="text-xs text-muted-foreground">{p.messages} messages</p>
                </div>
                <span className="text-sm font-semibold text-primary">${Number(p.cost).toFixed(4)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Aucun coût enregistré sur la période.</p>
        )}
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  loading,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
  accent?: "good" | "warn";
}) {
  return (
    <Card className="border-border/40 bg-card/40 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight ${
          accent === "good" ? "text-emerald-300" : accent === "warn" ? "text-amber-300" : ""
        }`}
      >
        {loading ? "…" : value}
      </p>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent ? "text-emerald-300" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
