import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Activity, MessageSquare, Coins, Zap, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Range = "24h" | "7d" | "30d";

type MsgRow = {
  id: string;
  created_at: string;
  role: string;
  model_used: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_usd: number | null;
  owner_id: string;
  conversation_id: string;
  content: string;
};

type DayBucket = { day: string; count: number };

const RANGE_HOURS: Record<Range, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

function formatUsd(n: number) {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function AnalyticsSection() {
  const [range, setRange] = useState<Range>("7d");
  const [rows, setRows] = useState<MsgRow[]>([]);
  const [live, setLive] = useState<MsgRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch agrégat période
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - RANGE_HOURS[range] * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("messages")
        .select("id, created_at, role, model_used, tokens_input, tokens_output, cost_usd, owner_id, conversation_id, content")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (cancelled) return;
      if (error) {
        console.error(error);
        setRows([]);
      } else {
        setRows(data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Live tail (50 derniers messages, auto-refresh 10s)
  useEffect(() => {
    let cancelled = false;
    const fetchLive = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, created_at, role, model_used, tokens_input, tokens_output, cost_usd, owner_id, conversation_id, content")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled && data) setLive(data);
    };
    void fetchLive();
    if (!autoRefresh) return;
    const id = setInterval(fetchLive, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [autoRefresh]);

  const stats = useMemo(() => {
    const totalMessages = rows.length;
    const assistantMessages = rows.filter((r) => r.role === "assistant").length;
    const tokensIn = rows.reduce((s, r) => s + (r.tokens_input ?? 0), 0);
    const tokensOut = rows.reduce((s, r) => s + (r.tokens_output ?? 0), 0);
    const cost = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
    const uniqueUsers = new Set(rows.map((r) => r.owner_id)).size;

    const modelCount: Record<string, number> = {};
    for (const r of rows) {
      if (!r.model_used) continue;
      modelCount[r.model_used] = (modelCount[r.model_used] ?? 0) + 1;
    }
    const topModel =
      Object.entries(modelCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    // Buckets par jour
    const byDay: Record<string, number> = {};
    for (const r of rows) {
      const d = r.created_at.slice(0, 10);
      byDay[d] = (byDay[d] ?? 0) + 1;
    }
    const days: DayBucket[] = Object.entries(byDay)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, count]) => ({ day, count }));

    return { totalMessages, assistantMessages, tokensIn, tokensOut, cost, uniqueUsers, topModel, days };
  }, [rows]);

  const maxDay = Math.max(1, ...stats.days.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Analytics & Monitoring</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Usage Elena, coûts, tokens, modèles utilisés. Données issues de la table messages.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border/40 bg-card/30 p-0.5">
          {(["24h", "7d", "30d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded px-2.5 py-1 text-xs transition-colors",
                range === r
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/40 bg-card/40 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" /> Messages
          </div>
          <p className="mt-1 text-2xl font-semibold">{stats.totalMessages}</p>
          <p className="text-xs text-muted-foreground">{stats.assistantMessages} d'Elena</p>
        </Card>
        <Card className="border-border/40 bg-card/40 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5" /> Tokens
          </div>
          <p className="mt-1 text-2xl font-semibold">
            {(stats.tokensIn + stats.tokensOut).toLocaleString("fr-FR")}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.tokensIn.toLocaleString("fr-FR")} in · {stats.tokensOut.toLocaleString("fr-FR")} out
          </p>
        </Card>
        <Card className="border-border/40 bg-card/40 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Coins className="h-3.5 w-3.5" /> Coût estimé
          </div>
          <p className="mt-1 text-2xl font-semibold">{formatUsd(stats.cost)}</p>
          <p className="text-xs text-muted-foreground">{stats.uniqueUsers} utilisateur(s)</p>
        </Card>
        <Card className="border-border/40 bg-card/40 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" /> Modèle dominant
          </div>
          <p className="mt-1 truncate text-sm font-semibold" title={stats.topModel}>
            {stats.topModel}
          </p>
          <p className="text-xs text-muted-foreground">le plus utilisé</p>
        </Card>
      </div>

      {/* Bar chart par jour */}
      <Card className="border-border/40 bg-card/40 p-5">
        <h3 className="mb-3 text-sm font-semibold">Messages par jour</h3>
        {loading ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : stats.days.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun message sur la période.</p>
        ) : (
          <div className="flex h-32 items-end gap-1">
            {stats.days.map((d) => (
              <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-[image:var(--gradient-primary)] transition-opacity group-hover:opacity-80"
                  style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: 2 }}
                  title={`${d.day} : ${d.count} messages`}
                />
                <span className="text-[9px] text-muted-foreground">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Live tail */}
      <Card className="border-border/40 bg-card/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Live · 50 derniers messages
            {autoRefresh && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                auto-refresh 10s
              </span>
            )}
          </h3>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("h-3 w-3", autoRefresh && "animate-spin")} />
            {autoRefresh ? "Pause" : "Reprendre"}
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card/95 text-muted-foreground">
              <tr className="border-b border-border/30">
                <th className="px-2 py-1.5 text-left font-medium">Heure</th>
                <th className="px-2 py-1.5 text-left font-medium">Rôle</th>
                <th className="px-2 py-1.5 text-left font-medium">Modèle</th>
                <th className="px-2 py-1.5 text-right font-medium">Tokens</th>
                <th className="px-2 py-1.5 text-right font-medium">Coût</th>
                <th className="px-2 py-1.5 text-left font-medium">Aperçu</th>
              </tr>
            </thead>
            <tbody>
              {live.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-muted-foreground">
                    Aucun message.
                  </td>
                </tr>
              )}
              {live.map((m) => (
                <tr key={m.id} className="border-b border-border/20 hover:bg-secondary/20">
                  <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                    {new Date(m.created_at).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px]",
                        m.role === "assistant"
                          ? "bg-primary/15 text-primary"
                          : m.role === "user"
                            ? "bg-secondary/40 text-foreground"
                            : "bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{m.model_used ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {((m.tokens_input ?? 0) + (m.tokens_output ?? 0)) || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {m.cost_usd ? formatUsd(Number(m.cost_usd)) : "—"}
                  </td>
                  <td className="max-w-[280px] truncate px-2 py-1.5 text-foreground/80">
                    {m.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
