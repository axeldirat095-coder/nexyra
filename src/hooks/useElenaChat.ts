import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  pending?: boolean;
  replyToContent?: string;
};

type MessageMetadata = { reply_to_content?: unknown } | null;

type DbRole = Database["public"]["Enums"]["message_role"];

interface UseElenaChatOptions {
  projectId?: string | null;
  /** Si true, charge la dernière conversation "libre" (project_id IS NULL) au montage. */
  freeMode?: boolean;
}

export function useElenaChat({ projectId, freeMode = false }: UseElenaChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Recharge la conversation + messages depuis la DB.
  // Si convId fourni, on cible directement cette conversation (utile après un tour agent).
  // IMPORTANT : si aucun projet n'est sélectionné ET pas de convId explicite,
  // on n'affiche RIEN (pas de fallback sur une conv "globale" qui pollue le chat).
  const reload = useCallback(
    async (convId?: string | null) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let targetId = convId ?? null;
      if (!targetId) {
        // Pas de projet actif ET pas en mode libre → chat vide.
        if (!projectId && !freeMode) {
          setConversationId(null);
          setMessages([]);
          return;
        }
        const query = supabase
          .from("conversations")
          .select("id")
          .eq("owner_id", user.id)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1);
        const { data: conv } = await (projectId
          ? query.eq("project_id", projectId)
          : query.is("project_id", null)
        ).maybeSingle();
        targetId = conv?.id ?? null;
      }

      if (!targetId) {
        setConversationId(null);
        setMessages([]);
        return;
      }

      setConversationId(targetId);
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, role, content, created_at, metadata")
        .eq("conversation_id", targetId)
        .order("created_at", { ascending: true });
      if (msgs) {
        setMessages(
          msgs
            .filter((m) => (m.role as DbRole) !== "system")
            .map((m) => {
              const metadata = m.metadata as MessageMetadata;
              const replyToContent =
                metadata && typeof metadata.reply_to_content === "string"
                  ? metadata.reply_to_content
                  : undefined;
              return {
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                timestamp: new Date(m.created_at),
                replyToContent,
              };
            }),
        );
      }
    },
    [projectId, freeMode],
  );

  // Charge la dernière conversation du projet au montage / changement de projet
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await reload();
    })();
    return () => {
      mounted = false;
    };
  }, [projectId, freeMode, reload]);

  const send = useCallback(
    async (
      text: string,
      modeOverride?: "auto" | "eco" | "standard" | "premium",
      extras?: { images?: string[] },
    ) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };
      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          pending: true,
        },
      ]);
      setIsStreaming(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Tu dois être connecté pour parler à Elena.");
        setIsStreaming(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const resp = await fetch("/api/elena-chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            project_id: projectId ?? null,
            message: trimmed,
            mode_override: modeOverride,
            images: extras?.images ?? [],
            // Tiers d'intelligence (Cerveau d'Elena) — lus depuis localStorage
            tier_auto: typeof window !== "undefined"
              ? localStorage.getItem("elena.tier.autoClassify") !== "false"
              : true,
            tier_forced: typeof window !== "undefined"
              ? (localStorage.getItem("elena.tier.forced") ?? "auto")
              : "auto",
          }),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          const errPayload = await resp.json().catch(() => ({}));
          const msg =
            (errPayload as { error?: string }).error ??
            `Erreur ${resp.status}`;
          throw new Error(msg);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";
        let currentEvent = "message";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line === "") {
              currentEvent = "message";
              continue;
            }
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (!json) continue;
            try {
              const parsed = JSON.parse(json);
              if (currentEvent === "meta" && parsed.conversation_id) {
                setConversationId(parsed.conversation_id);
              } else if (parsed.delta) {
                assistantText += parsed.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: assistantText, pending: true }
                      : m,
                  ),
                );
              }
            } catch {
              // ignore
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, pending: false } : m,
          ),
        );

        // Résumé auto (fire & forget) si la conv dépasse le seuil
        if (conversationId) {
          (async () => {
            try {
              const [{ data: conv }, { data: settings }] = await Promise.all([
                supabase.from("conversations").select("messages_since_summary").eq("id", conversationId).maybeSingle(),
                supabase.from("elena_settings").select("auto_summarize_after").eq("owner_id", session.user.id).maybeSingle(),
              ]);
              const threshold = settings?.auto_summarize_after ?? 20;
              const count = (conv as { messages_since_summary?: number } | null)?.messages_since_summary ?? 0;
              if (threshold > 0 && count >= threshold) {
                await fetch("/api/elena-summarize", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ conversation_id: conversationId }),
                });
              }
            } catch (e) {
              console.warn("auto-summarize skipped", e);
            }
          })();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        setError(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  pending: false,
                  content:
                    m.content ||
                    `⚠️ ${msg}`,
                }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [conversationId, projectId, isStreaming],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  /** Annule le streaming en cours. Marque le dernier message assistant comme arrêté. */
  const stop = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m, i) =>
        i === prev.length - 1 && m.role === "assistant" && m.pending
          ? { ...m, pending: false, content: m.content || "⏹ Arrêté." }
          : m,
      ),
    );
  }, []);

  return { messages, send, isStreaming, error, conversationId, reset, stop, reload };
}
