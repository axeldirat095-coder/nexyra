import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Gauge, AlertTriangle, Loader2, Zap, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MetricRow {
  id: string;
  endpoint: string;
  task_type: string | null;
  model: string | null;
  cache_type: "exact" | "semantic" | "miss" | null;
  tokens_input: number;
  tokens_output: number;
  latency_ms: number;
  success: boolean;
  created_at: string;
}

interface LhRow {
  id: string;
  url: string;
  strategy: string;
  performance: number | null;
  accessibility: number | null;
  best_practices: number | null;
  seo: number | null;
  overall: number | null;
  notes: string | null;
  created_at: string;
}

interface ErrRow {
  id: string;
  level: string;
  source: string;
  message: string;
  route: string | null;
  created_at: string;
}

interface RunRow {
  conversation_id: string;
  last_tool: string | null;
  expected_next_action: string | null;
  repeat_count: number;
  updated_at: string;
}

function scoreColor(s: number | null): string {
  if (s == null) return "text-muted-foreground";
  if (s >= 90) return "text-emerald-400";
  if (s >= 70) return "text-amber-400";
  return "text-rose-400";
}

export function ElenaObservabilitySection() {
  const [lh, setLh] = useState<LhRow[]>([]);
  const [errs, setErrs] = useState<ErrRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
      const [lhRes, errRes, runRes, metricRes] = await Promise.all([
        supabase
          .from("lighthouse_runs")
          .select("id, url, strategy, performance, accessibility, best_practices, seo, overall, notes, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("error_events")
          .select("id, level, source, message, route, created_at")
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("agent_run_state")
          .select("conversation_id, last_tool, expected_next_action, repeat_count, updated_at")
          .order("updated_at", { ascending: false })
          .limit(15),
        supabase
          .from("elena_metrics")
          .select("id, endpoint, task_type, model, cache_type, tokens_input, tokens_output, latency_ms, success, created_at")
          .gte("created_at", since24h)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (cancelled) return;
      setLh((lhRes.data as LhRow[]) ?? []);
      setErrs((errRes.data as ErrRow[]) ?? []);
      setRuns((runRes.data as RunRow[]) ?? []);
      setMetrics((metricRes.data as MetricRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metricsAgg = useMemo(() => {
    if (metrics.length === 0) {
      return { total: 0, exact: 0, semantic: 0, miss: 0, hitRate: 0, avgLatency: 0, tokensIn: 0, tokensOut: 0, errorRate: 0 };
    }
    const exact = metrics.filter((m) => m.cache_type === "exact").length;
    const semantic = metrics.filter((m) => m.cache_type === "semantic").length;
    const miss = metrics.filter((m) => m.cache_type === "miss" || m.cache_type === null).length;
    const hits = exact + semantic;
    const errors = metrics.filter((m) => !m.success).length;
    const tokensIn = metrics.reduce((a, m) => a + (m.tokens_input || 0), 0);
    const tokensOut = metrics.reduce((a, m) => a + (m.tokens_output || 0), 0);
    const avgLatency = Math.round(metrics.reduce((a, m) => a + (m.latency_ms || 0), 0) / metrics.length);
    return {
      total: metrics.length,
      exact,
      semantic,
      miss,
      hitRate: Math.round((hits / metrics.length) * 100),
      avgLatency,
      tokensIn,
      tokensOut,
      errorRate: Math.round((errors / metrics.length) * 100),
    };
  }, [metrics]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const lastLh = lh[0];
  const errCount24h = errs.filter((e) => Date.now() - new Date(e.created_at).getTime() < 24 * 3600_000).length;
  const stuckRuns = runs.filter((r) => r.repeat_count >= 3).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Observabilité Elena</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Performance Lighthouse, erreurs runtime, runs agent en cours. Mis à jour à chaque visite.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/40 bg-card/40 p-5">
          <Gauge className="mb-2 h-5 w-5 text-primary" />
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Dernier score Lighthouse</h3>
          {lastLh ? (
            <>
              <p className={`mt-1 text-3xl font-bold ${scoreColor(lastLh.overall)}`}>
                {lastLh.overall ?? "—"}<span className="text-base text-muted-foreground">/100</span>
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{lastLh.url}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Aucun audit encore.</p>
          )}
        </Card>
        <Card className="border-border/40 bg-card/40 p-5">
          <AlertTriangle className="mb-2 h-5 w-5 text-amber-400" />
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Erreurs 24 h</h3>
          <p className={`mt-1 text-3xl font-bold ${errCount24h === 0 ? "text-emerald-400" : "text-amber-400"}`}>
            {errCount24h}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{errs.length} total (15 derniers)</p>
        </Card>
        <Card className="border-border/40 bg-card/40 p-5">
          <Activity className="mb-2 h-5 w-5 text-violet-400" />
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Runs Elena bloqués</h3>
          <p className={`mt-1 text-3xl font-bold ${stuckRuns === 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {stuckRuns}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">repeat_count ≥ 3 sur {runs.length} runs récents</p>
        </Card>
      </div>

      <Card className="border-border/40 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Métriques LLM Elena (24 h)</h3>
          <Badge variant="outline" className="ml-auto text-[10px]">{metricsAgg.total} appels</Badge>
        </div>
        {metricsAgg.total === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucune métrique encore. Lance un message Elena dans /dev2 pour alimenter le tableau.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-md border border-border/30 bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cache hit rate</p>
              <p className={`mt-1 text-2xl font-bold ${metricsAgg.hitRate >= 30 ? "text-emerald-400" : "text-amber-400"}`}>
                {metricsAgg.hitRate}%
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {metricsAgg.exact} exact + {metricsAgg.semantic} sémantique
              </p>
            </div>
            <div className="rounded-md border border-border/30 bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Latence moyenne</p>
              <p className={`mt-1 text-2xl font-bold ${metricsAgg.avgLatency < 2000 ? "text-emerald-400" : metricsAgg.avgLatency < 6000 ? "text-amber-400" : "text-rose-400"}`}>
                {metricsAgg.avgLatency}<span className="text-sm text-muted-foreground">ms</span>
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">par appel</p>
            </div>
            <div className="rounded-md border border-border/30 bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tokens in</p>
              <p className="mt-1 text-2xl font-bold text-blue-400">{metricsAgg.tokensIn.toLocaleString("fr-FR")}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">cumulés</p>
            </div>
            <div className="rounded-md border border-border/30 bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tokens out</p>
              <p className="mt-1 text-2xl font-bold text-violet-400">{metricsAgg.tokensOut.toLocaleString("fr-FR")}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">cumulés</p>
            </div>
            <div className="rounded-md border border-border/30 bg-background/40 p-3">
              <DollarSign className="mb-1 h-3 w-3 text-emerald-400" />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Erreurs</p>
              <p className={`mt-1 text-2xl font-bold ${metricsAgg.errorRate === 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {metricsAgg.errorRate}%
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{metricsAgg.miss} miss / {metricsAgg.total}</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="border-border/40 bg-card/40 p-5">
        <h3 className="mb-3 text-sm font-semibold">Historique Lighthouse (20 derniers)</h3>
        {lh.length === 0 ? (
          <p className="text-xs text-muted-foreground">Pas encore d'audit. Demande à Elena : « Lance un lighthouse_ci sur https://… ».</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 text-left text-muted-foreground">
                  <th className="py-2 pr-3">Date</th>
                  <th className="pr-3">URL</th>
                  <th className="pr-3">Stratégie</th>
                  <th className="pr-3">Perf</th>
                  <th className="pr-3">A11y</th>
                  <th className="pr-3">BP</th>
                  <th className="pr-3">SEO</th>
                  <th className="pr-3">Global</th>
                </tr>
              </thead>
              <tbody>
                {lh.map((r) => (
                  <tr key={r.id} className="border-b border-border/20">
                    <td className="py-2 pr-3 text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="max-w-[260px] truncate pr-3">{r.url}</td>
                    <td className="pr-3"><Badge variant="outline" className="text-[10px]">{r.strategy}</Badge></td>
                    <td className={`pr-3 font-mono ${scoreColor(r.performance)}`}>{r.performance ?? "—"}</td>
                    <td className={`pr-3 font-mono ${scoreColor(r.accessibility)}`}>{r.accessibility ?? "—"}</td>
                    <td className={`pr-3 font-mono ${scoreColor(r.best_practices)}`}>{r.best_practices ?? "—"}</td>
                    <td className={`pr-3 font-mono ${scoreColor(r.seo)}`}>{r.seo ?? "—"}</td>
                    <td className={`pr-3 font-mono font-semibold ${scoreColor(r.overall)}`}>{r.overall ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/40 bg-card/40 p-5">
          <h3 className="mb-3 text-sm font-semibold">Erreurs récentes</h3>
          {errs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune erreur capturée.</p>
          ) : (
            <ul className="space-y-2">
              {errs.map((e) => (
                <li key={e.id} className="rounded-md border border-border/30 bg-background/40 p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant={e.level === "error" || e.level === "fatal" ? "destructive" : "outline"} className="text-[10px]">{e.level}</Badge>
                    <span className="text-muted-foreground">{e.source}</span>
                    <span className="ml-auto text-muted-foreground">{new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                  <p className="mt-1 line-clamp-2">{e.message}</p>
                  {e.route && <p className="mt-0.5 text-muted-foreground">{e.route}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="border-border/40 bg-card/40 p-5">
          <h3 className="mb-3 text-sm font-semibold">Runs Elena (état agent)</h3>
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun run actif.</p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.conversation_id} className="rounded-md border border-border/30 bg-background/40 p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">{r.conversation_id.slice(0, 8)}…</span>
                    {r.repeat_count >= 3 && <Badge variant="destructive" className="text-[10px]">stuck ×{r.repeat_count}</Badge>}
                    <span className="ml-auto text-muted-foreground">{new Date(r.updated_at).toLocaleTimeString("fr-FR")}</span>
                  </div>
                  <p className="mt-1">tool: <span className="font-mono">{r.last_tool ?? "—"}</span></p>
                  {r.expected_next_action && <p className="text-muted-foreground">next: {r.expected_next_action}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
