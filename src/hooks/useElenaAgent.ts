import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AgentMutation = {
  op: "write" | "delete" | "rename" | "command";
  path: string;
  newPath?: string;
  content?: string;
  requiresConfirmation?: boolean;
  script?: string;
};

export type AgentTraceEntry = {
  iteration: number;
  tool: string;
  args: Record<string, unknown>;
  result: { ok: boolean; output: string };
};

export type AgentProgress =
  | { kind: "tool_start"; tool: string; summary: string }
  | { kind: "tool_end"; tool: string; ok: boolean; summary: string }
  | { kind: "mutation"; mutation: AgentMutation }
  | { kind: "fallback"; from: string; to: string }
  | { kind: "meta"; conversationId: string }
  | { kind: "text_start"; iteration: number }
  | { kind: "text_delta"; iteration: number; delta: string }
  | { kind: "text_end"; iteration: number }
  | { kind: "thinking"; elapsedMs: number; iteration: number }
  | { kind: "first_chunk"; ttftMs: number; iteration: number }
  | {
      kind: "cost_warning";
      tool: string;
      path: string;
      critical: boolean;
      size: number;
      est_tokens: number;
      est_cost_cents: number;
      message: string;
    };

export type AgentUISignal = {
  kind: "onboard" | "ask" | "snapshot";
  payload: {
    questions?: Array<{
      id?: string;
      label: string;
      options?: Array<{ value: string; label: string }>;
    }>;
    label?: string;
    snapshot_id?: string;
  };
};

export interface AgentResponse {
  text: string;
  mutations: AgentMutation[];
  trace: AgentTraceEntry[];
  conversation_id?: string | null;
  ui_signals?: AgentUISignal[];
  usage?: {
    tokens_in: number;
    tokens_out: number;
    model: string;
    provider?: string;
    intent?: string;
    fallback_used?: boolean;
  };
}

interface RunOpts {
  message: string;
  files: Array<{ path: string; content: string }>;
  mode: "vanilla" | "react" | "vue" | "astro" | "svelte";
  conversationId?: string | null;
  projectId?: string | null;
  /** Vision multimodale — dataURLs jointes (gpt-image-1 / gpt-5 vision). */
  images?: string[];
  onProgress?: (p: AgentProgress) => void;
}

/**
 * Hook autonomous agent — parse SSE stream from /api/elena-agent.
 */
export function useElenaAgent() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTrace, setLastTrace] = useState<AgentTraceEntry[]>([]);
  const lastErrorRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // LOT 1 — on garde la conversation active pour pouvoir l'annuler côté serveur
  const activeConversationRef = useRef<string | null>(null);

  const run = useCallback(async (opts: RunOpts): Promise<AgentResponse | null> => {
    setError(null);
    lastErrorRef.current = null;
    setRunning(true);
    activeConversationRef.current = opts.conversationId ?? null;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    // Aligné avec le backend (180s par appel modèle × jusqu'à 8 itérations).
    // On garde une borne large pour ne pas couper un tour qui produit déjà des fichiers.
    const timeoutId = window.setTimeout(() => controller.abort(), 600_000);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Connecte-toi pour utiliser l'agent.");

      const resp = await fetch("/api/elena-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message: opts.message,
          files: opts.files,
          mode: opts.mode,
          conversation_id: opts.conversationId ?? null,
          project_id: opts.projectId ?? null,
          images: opts.images ?? [],
        }),
        signal: controller.signal,
      });

      // Erreur HTTP avant le stream
      if (!resp.ok || !resp.body) {
        const json = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || `Agent ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";
      let final: AgentResponse | null = null;
      let streamErr: string | null = null;
      let sawDone = false;
      let partialText = "";
      const partialMutations: AgentMutation[] = [];
      let sawAnyEvent = false;
      const processSseLine = (rawLine: string): boolean => {
        let line = rawLine;
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line === "") {
          currentEvent = "message";
          return true;
        }
        if (line.startsWith(":")) return true;
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          return true;
        }
        if (!line.startsWith("data: ")) return true;
        const payload = line.slice(6).trim();
        if (!payload) return true;
        try {
          const data = JSON.parse(payload);
          sawAnyEvent = true;
          if (currentEvent === "tool_start") {
            opts.onProgress?.({ kind: "tool_start", tool: data.tool, summary: data.summary ?? "" });
          } else if (currentEvent === "tool_end") {
            opts.onProgress?.({ kind: "tool_end", tool: data.tool, ok: !!data.ok, summary: data.summary ?? "" });
          } else if (currentEvent === "fallback") {
            opts.onProgress?.({ kind: "fallback", from: data.from ?? "", to: data.to ?? "" });
          } else if (currentEvent === "mutation") {
            partialMutations.push(data as AgentMutation);
            opts.onProgress?.({ kind: "mutation", mutation: data as AgentMutation });
          } else if (currentEvent === "meta" && data.conversation_id) {
            activeConversationRef.current = data.conversation_id;
            opts.onProgress?.({ kind: "meta", conversationId: data.conversation_id });
          } else if (currentEvent === "text_start") {
            opts.onProgress?.({ kind: "text_start", iteration: data.iteration ?? 0 });
          } else if (currentEvent === "text_delta") {
            partialText += data.delta ?? "";
            opts.onProgress?.({ kind: "text_delta", iteration: data.iteration ?? 0, delta: data.delta ?? "" });
          } else if (currentEvent === "text_end") {
            opts.onProgress?.({ kind: "text_end", iteration: data.iteration ?? 0 });
          } else if (currentEvent === "thinking") {
            opts.onProgress?.({ kind: "thinking", elapsedMs: data.elapsed_ms ?? 0, iteration: data.iteration ?? 0 });
          } else if (currentEvent === "first_chunk") {
            opts.onProgress?.({ kind: "first_chunk", ttftMs: data.ttft_ms ?? 0, iteration: data.iteration ?? 0 });
          } else if (currentEvent === "cost_warning") {
            opts.onProgress?.({
              kind: "cost_warning",
              tool: data.tool ?? "",
              path: data.path ?? "",
              critical: !!data.critical,
              size: data.size ?? 0,
              est_tokens: data.est_tokens ?? 0,
              est_cost_cents: data.est_cost_cents ?? 0,
              message: data.message ?? "",
            });
          } else if (currentEvent === "done") {
            final = data as AgentResponse;
            sawDone = true;
          } else if (currentEvent === "error") {
            streamErr = data.error || "Erreur agent";
          }
          return true;
        } catch {
          return false;
        }
      };

      while (!sawDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (!processSseLine(line)) {
            buffer = `${line}\n${buffer}`;
            break;
          }
          if (sawDone) break;
        }
        if (sawDone) {
          await reader.cancel().catch(() => undefined);
        }
      }
      buffer += decoder.decode();
      if (!sawDone && buffer.trim()) {
        const leftovers = buffer.split("\n").filter((line) => line.trim().length > 0);
        for (const line of leftovers) {
          processSseLine(line);
          if (sawDone) break;
        }
      }

      if (streamErr) throw new Error(streamErr);
      if (!final && (partialText.trim() || partialMutations.length > 0)) {
        final = {
          text: partialText.trim() || "✅ J’ai appliqué les changements reçus avant l’interruption du stream.",
          mutations: partialMutations,
          trace: [],
          conversation_id: activeConversationRef.current,
          ui_signals: [],
        };
      }
      if (!final && sawAnyEvent) {
        final = {
          text: "⚠️ Le stream Elena s’est interrompu avant la réponse finale. Aucun changement complet n’a été confirmé — relance une demande plus courte.",
          mutations: [],
          trace: [],
          conversation_id: activeConversationRef.current,
          ui_signals: [],
        };
      }
      if (!final) throw new Error("Agent indisponible : aucun événement reçu du serveur.");
      setLastTrace(final.trace ?? []);
      return final;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur agent";
      // Détection d'abort élargie : selon le runtime (browser/CF), un fetch streaming
      // coupé via AbortController peut jeter `AbortError`, `TypeError: network error`,
      // `BodyStreamBuffer was aborted`, ou simplement signal.aborted=true.
      const aborted = controller.signal.aborted;
      const isAbort =
        aborted ||
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error &&
          (e.name === "AbortError" ||
            /aborted|network error|body.*aborted/i.test(e.message)));
      const friendly = isAbort
        ? "⏱️ Requête arrêtée. Relance ta demande quand tu veux — Elena reprendra où elle en était."
        : msg;
      console.error("[useElenaAgent] run failed:", { msg, isAbort, error: e });
      lastErrorRef.current = friendly;
      setError(friendly);
      return null;
    } finally {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }, []);

  const stop = useCallback(async () => {
    // LOT 1 — Stop serveur réel : on signale l'annulation côté DB,
    // la boucle agent verra le flag entre 2 itérations et arrêtera proprement.
    const conversationId = activeConversationRef.current;
    if (conversationId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch("/api/elena-cancel", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ conversation_id: conversationId }),
          }).catch(() => undefined);
        }
      } catch {
        /* ignore — on coupe quand même côté client */
      }
    }
    abortRef.current?.abort();
    abortRef.current = null;
    activeConversationRef.current = null;
    setRunning(false);
  }, []);

  return { run, running, error, lastTrace, lastErrorRef, stop };
}
