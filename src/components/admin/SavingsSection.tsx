import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, PiggyBank, Zap, TrendingDown, Route } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Totals {
  turns: number;
  trunc_saved_tk: number;
  dedup_saved_tk: number;
  cache_read_tk: number;
  cache_write_tk: number;
  input_tk: number;
  output_tk: number;
  saved_usd: number;
}

interface ProjectRow {
  project_id: string;
  turns: number;
  saved_tk: number;
  saved_usd: number;
  cache_hit_pct: number;
}

interface Summary {
  days: number;
  is_admin: boolean;
  total: Totals;
  by_project: ProjectRow[];
}

// Prix USD par million de tokens (input / output). Baseline = claude-sonnet-4.5.
const MODEL_PRICING: Record<string, { in: number; out: number; label: string }> = {
  "deepseek/deepseek-chat": { in: 0.14, out: 0.28, label: "DeepSeek Chat" },
  "deepseek-chat": { in: 0.14, out: 0.28, label: "DeepSeek Chat" },
  "openai/gpt-5-nano": { in: 0.05, out: 0.4, label: "GPT-5 Nano" },
  "gpt-5-nano": { in: 0.05, out: 0.4, label: "GPT-5 Nano" },
  "openai/gpt-5-mini": { in: 0.25, out: 2, label: "GPT-5 Mini" },
  "gpt-5-mini": { in: 0.25, out: 2, label: "GPT-5 Mini" },
  "openai/gpt-5": { in: 1.25, out: 10, label: "GPT-5" },
  "gpt-5": { in: 1.25, out: 10, label: "GPT-5" },
  "openrouter/anthropic/claude-sonnet-4.5": { in: 3, out: 15, label: "Claude Sonnet 4.5" },
  "anthropic/claude-sonnet-4.5": { in: 3, out: 15, label: "Claude Sonnet 4.5" },
};
const BASELINE = { in: 3, out: 15 }; // Claude Sonnet 4.5

interface RoutingRow {
  model: string;
  label: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  cost_actual_usd: number;
  cost_baseline_usd: number;
  saved_usd: number;
}

interface RoutingSummary {
  total_calls: number;
  total_cost_actual: number;
  total_cost_baseline: number;
  total_saved: number;
  save_pct: number;
  by_model: RoutingRow[];
}

const RANGES = [
  { d: 1, label: "24 h" },
  { d: 7, label: "7 j" },
  { d: 30, label: "30 j" },
];

function fmtTk(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} k`;
  return String(n);
}
function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}


export function SavingsSection() {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<Summary | null>(null);
  const [routing, setRouting] = useState<RoutingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setErr(null);
    (async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const [{ data: raw, error }, metricsRes] = await Promise.all([
        supabase.rpc("elena_savings_summary", { _days: days }),
        supabase
          .from("elena_metrics")
          .select("model, tokens_input, tokens_output")
          .eq("success", true)
          .gte("created_at", since)
          .not("model", "is", null),
      ]);
      if (cancel) return;
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      setData(raw as unknown as Summary);

      // Agrège les économies du routing intelligent (tier system)
      const rows = (metricsRes.data ?? []) as Array<{
        model: string | null;
        tokens_input: number | null;
        tokens_output: number | null;
      }>;
      const byModel = new Map<string, RoutingRow>();
      let totCalls = 0;
      let totActual = 0;
      let totBaseline = 0;
      for (const r of rows) {
        const model = r.model ?? "unknown";
        const tin = r.tokens_input ?? 0;
        const tout = r.tokens_output ?? 0;
        const price = MODEL_PRICING[model] ?? { in: 3, out: 15, label: model };
        const actual = (tin * price.in + tout * price.out) / 1_000_000;
        const baseline = (tin * BASELINE.in + tout * BASELINE.out) / 1_000_000;
        totCalls += 1;
        totActual += actual;
        totBaseline += baseline;
        const existing = byModel.get(model);
        if (existing) {
          existing.calls += 1;
          existing.tokens_in += tin;
          existing.tokens_out += tout;
          existing.cost_actual_usd += actual;
          existing.cost_baseline_usd += baseline;
          existing.saved_usd += baseline - actual;
        } else {
          byModel.set(model, {
            model,
            label: price.label,
            calls: 1,
            tokens_in: tin,
            tokens_out: tout,
            cost_actual_usd: actual,
            cost_baseline_usd: baseline,
            saved_usd: baseline - actual,
          });
        }
      }
      const saved = totBaseline - totActual;
      setRouting({
        total_calls: totCalls,
        total_cost_actual: totActual,
        total_cost_baseline: totBaseline,
        total_saved: saved,
        save_pct: totBaseline > 0 ? Math.round((saved / totBaseline) * 100) : 0,
        by_model: Array.from(byModel.values()).sort((a, b) => b.saved_usd - a.saved_usd),
      });
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [days]);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
          <PiggyBank className="h-6 w-6 text-emerald-400" />
          Économies Elena
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Combien de tokens Elena évite d'envoyer aux modèles grâce à la troncature, la
          déduplication et le cache. Estimation en $ basée sur Claude Sonnet ($3 / M tokens
          d'entrée, cache -90%).
        </p>
      </div>

      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.d}
            onClick={() => setDays(r.d)}
            className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
              days === r.d
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {err && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {err}
        </Card>
      )}

      {!loading && !err && data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
              <div className="flex items-center gap-2 text-emerald-300">
                <PiggyBank className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">Économisé</span>
              </div>
              <p className="mt-2 text-2xl font-bold">{fmtUsd(data.total.saved_usd)}</p>
              <p className="text-xs text-muted-foreground">sur {data.total.turns} tours Elena</p>
            </Card>
            <Card className="border-border/40 bg-card/40 p-5">
              <div className="flex items-center gap-2 text-primary">
                <TrendingDown className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">Dédup + Tronqué</span>
              </div>
              <p className="mt-2 text-2xl font-bold">
                {fmtTk(data.total.trunc_saved_tk + data.total.dedup_saved_tk)}
              </p>
              <p className="text-xs text-muted-foreground">
                tokens jamais envoyés (tronq {fmtTk(data.total.trunc_saved_tk)} + dédup{" "}
                {fmtTk(data.total.dedup_saved_tk)})
              </p>
            </Card>
            <Card className="border-border/40 bg-card/40 p-5">
              <div className="flex items-center gap-2 text-violet-300">
                <Zap className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">Cache Anthropic</span>
              </div>
              <p className="mt-2 text-2xl font-bold">
                {data.total.input_tk > 0
                  ? Math.round((100 * data.total.cache_read_tk) / data.total.input_tk)
                  : 0}
                %
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtTk(data.total.cache_read_tk)} tokens lus depuis le cache /{" "}
                {fmtTk(data.total.input_tk)} input
              </p>
            </Card>
            <Card className="border-border/40 bg-card/40 p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Total input / output
              </div>
              <p className="mt-2 text-2xl font-bold">
                {fmtTk(data.total.input_tk)} <span className="text-muted-foreground">/</span>{" "}
                {fmtTk(data.total.output_tk)}
              </p>
              <p className="text-xs text-muted-foreground">tokens sur la période</p>
            </Card>
          </div>

          <Card className="border-border/40 bg-card/40 p-5">
            <h3 className="mb-4 text-sm font-semibold">Top projets par économies</h3>
            {data.by_project.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun tour Elena enregistré sur cette période.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="pb-2">Projet</th>
                      <th className="pb-2">Tours</th>
                      <th className="pb-2">Tokens économisés</th>
                      <th className="pb-2">$ économisés</th>
                      <th className="pb-2">Cache hit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_project.map((p) => (
                      <tr key={p.project_id} className="border-t border-border/30">
                        <td className="py-2 font-mono text-xs">{p.project_id}</td>
                        <td className="py-2">{p.turns}</td>
                        <td className="py-2">{fmtTk(p.saved_tk)}</td>
                        <td className="py-2 text-emerald-300">{fmtUsd(p.saved_usd)}</td>
                        <td className="py-2">
                          <Badge variant={p.cache_hit_pct > 30 ? "default" : "secondary"}>
                            {p.cache_hit_pct}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ===== Économies routing intelligent (tier system) ===== */}
          {routing && (
            <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Route className="h-4 w-4 text-emerald-400" />
                  Routing intelligent (5 tiers XS → XL)
                </h3>
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-300">
                  {routing.total_calls} appels
                </Badge>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Économies vs. si Elena avait tout envoyé à Claude Sonnet 4.5 (baseline le plus
                cher). Les questions triviales partent sur DeepSeek (~20× moins cher), les
                standards sur GPT-5 Mini, seule l'archi complexe utilise Claude.
              </p>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="text-xs uppercase tracking-wider text-emerald-300">
                    Économisé
                  </div>
                  <p className="mt-1 text-xl font-bold">{fmtUsd(routing.total_saved)}</p>
                  <p className="text-xs text-muted-foreground">
                    soit {routing.save_pct}% du coût baseline
                  </p>
                </div>
                <div className="rounded-lg border border-border/40 bg-card/40 p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Coût réel payé
                  </div>
                  <p className="mt-1 text-xl font-bold">{fmtUsd(routing.total_cost_actual)}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-card/40 p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Coût baseline (tout-Claude)
                  </div>
                  <p className="mt-1 text-xl font-bold text-muted-foreground">
                    {fmtUsd(routing.total_cost_baseline)}
                  </p>
                </div>
              </div>
              {routing.by_model.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun appel enregistré sur la période.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="pb-2">Modèle</th>
                        <th className="pb-2">Appels</th>
                        <th className="pb-2">Tokens (in / out)</th>
                        <th className="pb-2">Coût réel</th>
                        <th className="pb-2">Coût baseline</th>
                        <th className="pb-2">Économie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routing.by_model.map((m) => (
                        <tr key={m.model} className="border-t border-border/30">
                          <td className="py-2 font-medium">{m.label}</td>
                          <td className="py-2">{m.calls}</td>
                          <td className="py-2 text-xs text-muted-foreground">
                            {fmtTk(m.tokens_in)} / {fmtTk(m.tokens_out)}
                          </td>
                          <td className="py-2">{fmtUsd(m.cost_actual_usd)}</td>
                          <td className="py-2 text-muted-foreground">
                            {fmtUsd(m.cost_baseline_usd)}
                          </td>
                          <td className="py-2 text-emerald-300">
                            {m.saved_usd > 0 ? fmtUsd(m.saved_usd) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            Astuce : les gains montent au fil de la session. Un premier tour sur un projet neuf
            = peu ou pas d'économies. À partir du 2ᵉ / 3ᵉ tour, la dédup, le cache et le
            routing intelligent commencent tous à payer.
          </p>

        </>
      )}
    </div>
  );
}
