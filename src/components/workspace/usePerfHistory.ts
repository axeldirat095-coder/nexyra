/**
 * usePerfHistory — enregistre l'historique des timings Elena dans le localStorage
 * pour qu'on puisse exporter un récap analysable (copier / JSON / texte).
 */
import { useCallback, useEffect, useState } from "react";
import type { AgentTiming } from "./workspaceAgentStore";

const STORAGE_KEY = "nexyra:perf-history:v1";
const MAX_ENTRIES = 200;

export interface PerfEntry extends AgentTiming {
  at: string; // ISO date
  userPreview?: string;
}

function load(): PerfEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(entries: PerfEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* quota — ignore */
  }
}

export function usePerfHistory(lastTiming: AgentTiming | null | undefined, lastUserPreview?: string) {
  const [entries, setEntries] = useState<PerfEntry[]>(() => load());
  const [lastKey, setLastKey] = useState<string | null>(null);

  useEffect(() => {
    if (!lastTiming) return;
    // dédup : on s'appuie sur (total_ms + ttft + stream + tokens_out) comme empreinte
    const key = `${lastTiming.total_ms}|${lastTiming.ttft_ms}|${lastTiming.stream_ms}|${lastTiming.tokens_out}|${lastTiming.model}`;
    if (key === lastKey) return;
    setLastKey(key);
    const entry: PerfEntry = {
      ...lastTiming,
      at: new Date().toISOString(),
      userPreview: lastUserPreview?.slice(0, 120),
    };
    setEntries((prev) => {
      const next = [...prev, entry].slice(-MAX_ENTRIES);
      save(next);
      return next;
    });
  }, [lastTiming, lastUserPreview, lastKey]);

  const clear = useCallback(() => {
    setEntries([]);
    save([]);
  }, []);

  const stats = useCallback(() => {
    if (entries.length === 0) return null;
    const totals = entries.map((e) => e.total_ms);
    const ttfts = entries.map((e) => e.ttft_ms ?? 0).filter((v) => v > 0);
    const preps = entries.map((e) => e.prep_ms);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const p = (xs: number[], q: number) => {
      if (!xs.length) return 0;
      const sorted = [...xs].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    };
    return {
      count: entries.length,
      total_avg: avg(totals),
      total_p50: p(totals, 0.5),
      total_p95: p(totals, 0.95),
      ttft_avg: avg(ttfts),
      prep_avg: avg(preps),
    };
  }, [entries]);

  const toJSON = useCallback(() => {
    const s = stats();
    return JSON.stringify({ exported_at: new Date().toISOString(), stats: s, entries }, null, 2);
  }, [entries, stats]);

  const toText = useCallback(() => {
    const s = stats();
    const lines: string[] = [];
    lines.push(`# Historique perfs Elena — ${entries.length} échanges`);
    if (s) {
      lines.push(
        `Moy total: ${(s.total_avg / 1000).toFixed(2)}s · p50: ${(s.total_p50 / 1000).toFixed(2)}s · p95: ${(s.total_p95 / 1000).toFixed(2)}s`,
      );
      lines.push(`Moy prep: ${s.prep_avg} ms · Moy attente 1er mot: ${s.ttft_avg} ms`);
      lines.push("");
    }
    for (const e of entries.slice(-50)) {
      const t = new Date(e.at).toLocaleTimeString();
      lines.push(
        `[${t}] total=${(e.total_ms / 1000).toFixed(2)}s prep=${e.prep_ms}ms ttft=${e.ttft_ms ?? "—"}ms stream=${e.stream_ms}ms steps=${e.steps} tok=${e.tokens_in}/${e.tokens_out} model=${e.model}${e.userPreview ? ` · "${e.userPreview}"` : ""}`,
      );
    }
    return lines.join("\n");
  }, [entries, stats]);

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(toText());
      return true;
    } catch {
      return false;
    }
  }, [toText]);

  const downloadJSON = useCallback(() => {
    const blob = new Blob([toJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexyra-perfs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [toJSON]);

  return { entries, stats: stats(), clear, copyText, downloadJSON, toText };
}
