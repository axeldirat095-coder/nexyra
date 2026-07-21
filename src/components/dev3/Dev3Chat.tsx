/**
 * Dev3Chat — panneau Elena pour la sandbox E2B (route /dev3).
 * - useChat AI SDK v5 + DefaultChatTransport vers /api/elena-e2b
 * - Authorization Bearer attaché depuis la session Supabase
 * - Affiche text + tool-parts (compact, accordéon)
 * - Notifie le parent à chaque write_file pour rafraîchir l'éditeur
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import {
  Loader2,
  Send,
  Square,
  Wrench,
  ChevronRight,
  AlertTriangle,
  Mic,
  Brush,
  Camera,
  Download,
  GraduationCap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { capturePixelScreenshot } from "@/components/workspace/preview-bridge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { DictationOverlay } from "@/components/DictationOverlay";
import { annotationStore } from "@/components/workspace/annotation-store";
import {
  AttachButton,
  AttachmentChips,
  DropZone,
  STORAGE_UPLOAD_THRESHOLD,
  classifyFile,
  makeAttachmentId,
  readAsDataUrl,
  readAsText,
  validateFile,
  type PendingAttachment,
} from "@/components/chat/ChatAttachments";
import { useServerFn } from "@tanstack/react-start";
import { uploadFileToSandbox } from "@/lib/e2b-file-upload.functions";
import { ingestFromStorage } from "@/lib/e2b-storage-ingest.functions";

type Props = {
  projectId: string;
  /** Notifie quand un fichier est écrit/édité par l'agent (pour reload du code panel) */
  onFileMutated?: (path: string) => void;
  /** Quand cette valeur change, le chat se vide complètement (localStorage + DB + state) */
  resetSignal?: number;
};

type AddToolOutput = (args: {
  tool: string;
  toolCallId: string;
  state?: "output-available" | "output-error";
  output?: unknown;
  errorText?: string;
}) => void | PromiseLike<void>;

const MAX_CAPTURE_AUTO_CONTINUES_PER_TURN = 2;
const MUTATING_TOOL_TYPES = new Set(["tool-write_file", "tool-edit_file", "tool-restart_preview"]);
const BUILD_TOOL_TYPES = new Set([
  "tool-delegate_designer",
  "tool-image_generate",
  "tool-write_file",
  "tool-edit_file",
  "tool-capture_current_preview",
  "tool-qa_self_render",
  "tool-qa_reference_render",
]);
const READ_ONLY_OR_MEMORY_TOOL_TYPES = new Set([
  "tool-ls",
  "tool-read_file",
  "tool-memory_list",
  "tool-memory_save",
]);
const CREATION_REQUEST_RE = /\b(cr[ée]e?|cr[ée]er|g[ée]n[èe]re|fais|construis|landing|hero|page|site|app|composant|carte blanche|comme tu le sens|go|vas-y|tu d[ée]cides)\b/i;
const LONG_ELENA_RUN_MS = 90_000;

function makeCaptureFailureOutput(message: string) {
  return {
    ok: false,
    error: message,
    rendered_image_base64: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    screenshot: null,
    snapshot_summary: JSON.stringify({ error: message }),
  };
}

function isLikelyBlankCapture(snapshot: { bodyText?: string; counts?: Record<string, number> }) {
  const text = (snapshot.bodyText ?? "").trim();
  const counts = snapshot.counts ?? {};
  const visibleNodes =
    (counts.h1 ?? 0) +
    (counts.h2 ?? 0) +
    (counts.h3 ?? 0) +
    (counts.button ?? 0) +
    (counts.a ?? 0) +
    (counts.img ?? 0) +
    (counts.section ?? 0) +
    (counts.main ?? 0);
  return text.length === 0 && visibleNodes === 0;
}

async function capturePreviewAfterReload(timeoutMs: number, maxWidth: number) {
  await wait(3400);
  let result = await capturePixelScreenshot(timeoutMs, maxWidth);
  if (isLikelyBlankCapture(result.snapshot)) {
    await wait(2600);
    result = await capturePixelScreenshot(timeoutMs, maxWidth);
  }
  return result;
}

async function loadChatFromDb(projectId: string): Promise<unknown[]> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return [];
    const { data, error } = await supabase
      .from("workspace_chat_messages")
      .select("client_id, position, payload, created_at, updated_at")
      .eq("owner_id", userId)
      .eq("project_key", `e2b:${projectId}`)
      // Le chat est un journal durable : l'ordre réel est la date d'insertion.
      // `position` peut contenir des doublons si un vieux cache a réécrit une
      // partie de la conversation, ce qui faisait remonter une version ancienne.
      .order("created_at", { ascending: true })
      .order("position", { ascending: true })
      .limit(2000);
    if (error || !data) return [];
    const latestByPosition = new Map<number, { payload: unknown; stamp: string }>();
    for (const row of data) {
      const position = Number(row.position);
      if (!Number.isFinite(position)) continue;
      const stamp = String(row.updated_at ?? row.created_at ?? "");
      const existing = latestByPosition.get(position);
      // Si une ancienne sauvegarde et une nouvelle sauvegarde ont la même
      // position, on garde la plus récente. C'est ce qui permet de restaurer
      // la suite du chat quand un vieux cache avait recréé des client_id.
      if (!existing || stamp >= existing.stamp) {
        latestByPosition.set(position, { payload: row.payload as unknown, stamp });
      }
    }
    return [...latestByPosition.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, row]) => row.payload);
  } catch {
    return [];
  }
}

async function saveChatToDb(
  projectId: string,
  messages: unknown[],
  savedSignatures?: Map<string, string>,
) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId || messages.length === 0) return;
    const compacted = JSON.parse(compactMessagesForStorage(messages)) as Array<{ id?: string }>;
    const rows = compacted.map((message, position) => ({
      owner_id: userId,
      project_key: `e2b:${projectId}`,
      client_id: message.id ?? `${projectId}-${position}`,
      position,
      payload: message as unknown as Json,
    }));
    const dirtyRows = savedSignatures
      ? rows.filter((row) => savedSignatures.get(row.client_id) !== JSON.stringify(row.payload))
      : rows;
    if (dirtyRows.length === 0) return;
    const { error } = await supabase.from("workspace_chat_messages").upsert(dirtyRows, {
      onConflict: "owner_id,project_key,client_id",
    });
    if (error) throw error;
    if (savedSignatures) {
      for (const row of dirtyRows) savedSignatures.set(row.client_id, JSON.stringify(row.payload));
    }
  } catch (e) {
    console.warn("[Dev3Chat] sauvegarde DB chat ignorée", e);
  }
}

function countCapturesSinceLastUser(messages: Array<{ role: string; parts?: AnyPart[] }>) {
  const lastUserIndex = messages.reduce(
    (idx, message, i) => (message.role === "user" ? i : idx),
    -1,
  );
  return messages
    .slice(Math.max(0, lastUserIndex + 1))
    .flatMap((message) => message.parts ?? [])
    .filter((part) => part.type === "tool-capture_current_preview").length;
}

function shouldContinueAfterClientCapture({
  messages,
}: {
  messages: Array<{ role: string; parts?: AnyPart[] }>;
}) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;
  if (countCapturesSinceLastUser(messages) > MAX_CAPTURE_AUTO_CONTINUES_PER_TURN) return false;
  const parts = last.parts ?? [];
  const lastStepStart = parts.reduce((idx, part, i) => (part.type === "step-start" ? i : idx), -1);
  const toolParts = parts.slice(lastStepStart + 1).filter((part) => part.type?.startsWith("tool-"));
  return (
    toolParts.some((part) => part.type === "tool-capture_current_preview") &&
    toolParts.every((part) => part.state === "output-available" || part.state === "output-error")
  );
}

function shouldRefreshPreview(message: { parts?: AnyPart[] }) {
  return (message.parts ?? []).some((part) => {
    if (!MUTATING_TOOL_TYPES.has(part.type)) return false;
    const output = part.output as { ok?: boolean } | undefined;
    return output?.ok === true;
  });
}

function stoppedAfterOnlyReading(message: { parts?: AnyPart[] }, lastUserText: string) {
  if (!CREATION_REQUEST_RE.test(lastUserText)) return false;
  const toolParts = (message.parts ?? []).filter((part) => part.type?.startsWith("tool-"));
  if (toolParts.length === 0) return false;
  if (toolParts.some((part) => BUILD_TOOL_TYPES.has(part.type))) return false;
  return toolParts.every((part) => READ_ONLY_OR_MEMORY_TOOL_TYPES.has(part.type));
}

// Elena a commencé à construire (designer / image_generate) mais n'a jamais
// écrit le moindre fichier ni capturé la preview : elle s'est arrêtée au
// milieu du workflow. On la relance une fois pour finir le tour.
function stoppedMidBuild(message: { parts?: AnyPart[] }, lastUserText: string) {
  if (!CREATION_REQUEST_RE.test(lastUserText)) return false;
  const toolParts = (message.parts ?? []).filter((part) => part.type?.startsWith("tool-"));
  if (toolParts.length === 0) return false;
  const hasBuildPrep = toolParts.some(
    (part) => part.type === "tool-delegate_designer" || part.type === "tool-image_generate",
  );
  const hasWrite = toolParts.some(
    (part) => part.type === "tool-write_file" || part.type === "tool-edit_file",
  );
  return hasBuildPrep && !hasWrite;
}

function sanitizeMessagesForResume<T extends { parts?: AnyPart[] }>(messages: T[]): T[] {
  return messages
    .map((message) => ({
      ...message,
      parts: (message.parts ?? []).filter((part) => {
        if (part.type === "text") return Boolean((part.text ?? "").trim());
        if (!part.type?.startsWith("tool-")) return false;
        // Une capture preview restaurée après F5 peut relancer automatiquement
        // l'agent sans action utilisateur et recréer une boucle "travaille encore".
        if (part.type === "tool-capture_current_preview") return false;
        return part.state === "output-available" || part.state === "output-error";
      }),
    }))
    .filter((message) =>
      (message.parts ?? []).some((part) =>
        part.type === "text" ? Boolean((part.text ?? "").trim()) : true,
      ),
    );
}

function getStoredMessageId(message: unknown, fallback: string) {
  if (!message || typeof message !== "object") return fallback;
  const id = (message as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id : fallback;
}

function mergeStoredMessages<T>(remoteMessages: T[], localMessages: T[]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  remoteMessages.forEach((message, index) => {
    const id = getStoredMessageId(message, `remote-${index}`);
    seen.add(id);
    merged.push(message);
  });
  // Le localStorage sert uniquement à récupérer la fin qui n'aurait pas encore
  // atteint la DB. On n'ajoute donc pas les anciens messages locaux déjà couverts
  // par la base, sinon un vieux cache peut réinjecter un morceau obsolète.
  localMessages.slice(remoteMessages.length).forEach((message, index) => {
    const id = getStoredMessageId(message, `local-${index}`);
    if (seen.has(id)) return;
    seen.add(id);
    merged.push(message);
  });
  return merged;
}

const SUGGESTIONS = [
  "Liste les fichiers du projet",
  "Crée une landing dark premium avec hero + features + pricing",
  "Ajoute une page /about avec react-router-dom",
  "Refais App.tsx en composants séparés",
];

export function Dev3Chat({ projectId, onFileMutated, resetSignal }: Props) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dictating, setDictating] = useState(false);
  const uploadToSandbox = useServerFn(uploadFileToSandbox);
  const ingestFromCloud = useServerFn(ingestFromStorage);
  const [brushActive, setBrushActive] = useState(annotationStore.get().active);
  const [longRunWarning, setLongRunWarning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const addToolOutputRef = useRef<AddToolOutput | null>(null);
  const autoContinueEnabledRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const stopRequestedRef = useRef(false);
  const lastUserTextRef = useRef("");
  const readOnlyAutoContinueCountRef = useRef(0);

  // Sync local UI state avec le store global d'annotation (commande possible
  // depuis n'importe où, ex: WorkspacePreview ou raccourci futur).
  useEffect(() => annotationStore.subscribe((s) => setBrushActive(s.active)), []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/elena-e2b",
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          // Sécurité : on retire les parts "file"/"image" des messages avant
          // l'envoi. Le gateway renvoie sinon
          // "unknown variant `image_url`, expected `text`" sur les modèles
          // non-vision. On garde une trace textuelle pour ne rien perdre.
          const safeMessages = (messages as Array<{ parts?: AnyPart[] }>).map((m) => ({
            ...m,
            parts: (m.parts ?? []).map((p) => {
              const t = p.type ?? "";
              if (t === "file" || t === "image" || t.startsWith("image")) {
                return { type: "text", text: "[Pièce jointe image retirée de l'historique]" } as AnyPart;
              }
              return p;
            }),
          }));
          const tierAuto = typeof window !== "undefined"
            ? localStorage.getItem("elena.tier.autoClassify") !== "false"
            : true;
          const tierForced = typeof window !== "undefined"
            ? (localStorage.getItem("elena.tier.forced") ?? "auto")
            : "auto";
          return {
            body: { messages: safeMessages, projectId, tier_auto: tierAuto, tier_forced: tierForced, ...(body ?? {}) },
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          };
        },
      }),
    [projectId],
  );

  // Persistance localStorage : restaure l'historique au mount, sauvegarde à
  // chaque changement. Scopé par projectId pour ne pas mélanger les chats.
  const storageKey = `nexyra:dev3-chat:${projectId}`;
  const skipInitialEmptyPersistRef = useRef(false);
  const initialMessages = useMemo(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const restored = Array.isArray(parsed) ? sanitizeMessagesForResume(parsed) : [];
      skipInitialEmptyPersistRef.current = restored.length > 0;
      return restored;
    } catch {
      return [];
    }
  }, [storageKey]);

  const { messages, sendMessage, status, error, stop, setMessages, addToolOutput } = useChat({
    transport,
    messages: initialMessages,
    sendAutomaticallyWhen: (ctx) =>
      autoContinueEnabledRef.current && shouldContinueAfterClientCapture(ctx),
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName !== "capture_current_preview") return;
      const input = toolCall.input as { timeout_ms?: number; max_width?: number };
      const publishToolOutput = (output: unknown) => {
        const publish = addToolOutputRef.current;
        if (!publish) {
          console.warn("[Dev3Chat] capture output ignorée: chat pas encore prêt");
          return;
        }
        window.setTimeout(() => {
          void publish({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output,
          });
        }, 0);
      };
      try {
        onFileMutated?.("preview-capture");
        window.dispatchEvent(
          new CustomEvent("nexyra:e2b-file-mutated", { detail: { path: "preview-capture" } }),
        );
        const { screenshot, snapshot } = await capturePreviewAfterReload(
          typeof input.timeout_ms === "number" ? input.timeout_ms : 8000,
          typeof input.max_width === "number" ? input.max_width : 1280,
        );
        publishToolOutput({
          ok: true,
          rendered_image_base64: screenshot.dataUrl,
          screenshot: { width: screenshot.width, height: screenshot.height },
          snapshot_summary: JSON.stringify({
            url: snapshot.url,
            title: snapshot.title,
            counts: snapshot.counts,
            viewport: snapshot.viewport,
            console_errors: snapshot.consoleErrors.length,
            body_text: snapshot.bodyText.slice(0, 800),
          }),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Capture preview impossible";
        publishToolOutput(makeCaptureFailureOutput(message));
      }
    },
    onFinish: ({ message }) => {
      if (stopRequestedRef.current) {
        autoContinueEnabledRef.current = false;
        stopRequestedRef.current = false;
        return;
      }
      if (
        stoppedAfterOnlyReading(message, lastUserTextRef.current) &&
        readOnlyAutoContinueCountRef.current < 2
      ) {
        readOnlyAutoContinueCountRef.current += 1;
        autoContinueEnabledRef.current = true;
        window.setTimeout(() => {
          void sendMessage({
            text:
              "Continue maintenant : tu viens seulement de lire/lister. Termine la demande utilisateur dans ce tour : si c'est une création, décide toi-même la direction, appelle le Designer si utile, puis écris les fichiers. Ne pose pas de question.",
          });
        }, 0);
        return;
      }
      if (
        stoppedMidBuild(message, lastUserTextRef.current) &&
        readOnlyAutoContinueCountRef.current < 2
      ) {
        readOnlyAutoContinueCountRef.current += 1;
        autoContinueEnabledRef.current = true;
        window.setTimeout(() => {
          void sendMessage({
            text:
              "Continue immédiatement : tu as commencé la construction mais tu n'as écrit AUCUN fichier. Écris maintenant les fichiers nécessaires, puis réponds court. Si la capture automatique paraît vide alors que le code est écrit, ne boucle pas sur la preview.",
          });
        }, 0);
        return;
      }
      autoContinueEnabledRef.current = Boolean(
        message.parts?.some((part) => part.type === "tool-capture_current_preview"),
      );
      if (shouldRefreshPreview(message)) {
        onFileMutated?.("preview-refresh");
      }
      // Repère les write_file/edit_file pour signaler au parent
      for (const part of message.parts ?? []) {
        const p = part as { type?: string; output?: { path?: string; ok?: boolean } };
        if (
          (p.type === "tool-write_file" || p.type === "tool-edit_file") &&
          p.output?.ok &&
          p.output.path
        ) {
          onFileMutated?.(p.output.path);
        }
      }
    },
  });
  addToolOutputRef.current = addToolOutput as AddToolOutput;
  const latestMessagesRef = useRef<unknown[]>(messages as unknown[]);
  const dbSavedSignaturesRef = useRef<Map<string, string>>(new Map());
  const dbFlushInFlightRef = useRef(false);
  const dbFlushQueuedRef = useRef(false);
  const dbHydratedRef = useRef(false);

  const busy = status === "submitted" || status === "streaming";
  const hasAssistantResponseAfterLastUser = useMemo(() => {
    const lastUserIndex = messages.reduce((idx, message, i) => (message.role === "user" ? i : idx), -1);
    return messages.slice(lastUserIndex + 1).some(hasTextPart);
  }, [messages]);

  useEffect(() => {
    setLongRunWarning(false);
    if (!busy) return;
    const timeout = window.setTimeout(() => {
      setLongRunWarning(true);
      toast.warning(
        "Elena prend plus longtemps que prévu. Tu peux l'arrêter avec le bouton carré si besoin.",
      );
    }, LONG_ELENA_RUN_MS);
    return () => window.clearTimeout(timeout);
  }, [busy]);

  // Auto-scroll: pas de smooth (force le navigateur à recalculer la mise en
  // page à chaque token et fige l'onglet sur les longues conversations).
  // On scroll seulement si l'utilisateur est déjà près du bas, et on throttle
  // via requestAnimationFrame pour ne pas tuer le main thread pendant le stream.
  const scrollRafRef = useRef<number | null>(null);
  const didOpenAtBottomRef = useRef(false);

  useEffect(() => {
    didOpenAtBottomRef.current = false;
    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  }, [projectId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const forceInitialScroll = !didOpenAtBottomRef.current && messages.length > 0;
    if (forceInitialScroll) {
      didOpenAtBottomRef.current = true;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (!forceInitialScroll && distanceFromBottom > 200) return; // user a scrollé en haut → ne pas le forcer
    if (!forceInitialScroll && scrollRafRef.current !== null) return;
    const scrollToBottom = () => {
      scrollRafRef.current = null;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    if (forceInitialScroll) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToBottom));
      return;
    }
    scrollRafRef.current = window.requestAnimationFrame(scrollToBottom);
  }, [messages, status]);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  const flushDb = useCallback(
    async (safeMessages: unknown[]) => {
      if (dbFlushInFlightRef.current) {
        dbFlushQueuedRef.current = true;
        return;
      }
      dbFlushInFlightRef.current = true;
      try {
        await saveChatToDb(projectId, safeMessages, dbSavedSignaturesRef.current);
      } finally {
        dbFlushInFlightRef.current = false;
        if (dbFlushQueuedRef.current) {
          dbFlushQueuedRef.current = false;
          const latestSafe = sanitizeMessagesForResume(
            latestMessagesRef.current as Array<{ parts?: AnyPart[] }>,
          );
          if (latestSafe.length > 0) void flushDb(latestSafe as unknown[]);
        }
      }
    },
    [projectId],
  );

  const flushPersistence = useCallback(
    (saveDb: boolean) => {
      const safeMessages = sanitizeMessagesForResume(
        latestMessagesRef.current as Array<{ parts?: AnyPart[] }>,
      );
      try {
        if (safeMessages.length === 0) {
          if (skipInitialEmptyPersistRef.current) {
            skipInitialEmptyPersistRef.current = false;
            return;
          }
          localStorage.removeItem(storageKey);
        } else {
          skipInitialEmptyPersistRef.current = false;
          safeSetChatHistory(storageKey, safeMessages);
        }
      } catch (e) {
        console.warn("[Dev3Chat] historique local non sauvegardé", e);
      }
      if (saveDb && safeMessages.length > 0 && dbHydratedRef.current) {
        void flushDb(safeMessages as unknown[]);
      }
    },
    [flushDb, storageKey],
  );

  // Sauvegarde durable du chat. Avant, c'était un debounce : pendant une longue
  // réponse, le timer était repoussé à chaque token, donc un refresh/crash avant
  // la fin pouvait perdre tout le tour. Maintenant c'est un throttle : on écrit
  // régulièrement le dernier état, y compris pendant le streaming.
  const streaming = status === "streaming" || status === "submitted";
  useEffect(() => {
    if (typeof window === "undefined") return;
    latestMessagesRef.current = messages as unknown[];
    if (!streaming && persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (persistTimerRef.current !== null) return;
    persistTimerRef.current = window.setTimeout(
      () => {
        persistTimerRef.current = null;
        flushPersistence(true);
      },
      streaming ? 1500 : 250,
    );
  }, [messages, streaming, flushPersistence]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      flushPersistence(false);
    };
  }, [flushPersistence]);

  useEffect(() => {
    const flushBeforeUnload = () => {
      if (messages.length === 0) return;
      const safeMessages = sanitizeMessagesForResume(messages);
      safeSetChatHistory(storageKey, safeMessages);
    };
    window.addEventListener("pagehide", flushBeforeUnload);
    window.addEventListener("beforeunload", flushBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", flushBeforeUnload);
      window.removeEventListener("beforeunload", flushBeforeUnload);
    };
  }, [messages, storageKey]);

  useEffect(() => {
    if (status === "error") autoContinueEnabledRef.current = false;
  }, [status]);

  // Restauration durable : la DB est la source principale, mais on fusionne le
  // cache local s'il contient des messages jamais envoyés (crash/refresh brutal).
  useEffect(() => {
    let cancelled = false;
    dbHydratedRef.current = false;
    dbSavedSignaturesRef.current.clear();
    void loadChatFromDb(projectId).then((dbMessages) => {
      if (cancelled) return;
      const remote = sanitizeMessagesForResume(
        dbMessages as Array<{ parts?: AnyPart[] }>,
      ) as unknown as typeof messages;
      const local = sanitizeMessagesForResume(
        latestMessagesRef.current as Array<{ parts?: AnyPart[] }>,
      ) as unknown as typeof messages;
      if (remote.length === 0 && local.length === 0) {
        dbHydratedRef.current = true;
        return;
      }
      dbSavedSignaturesRef.current = new Map(
        (JSON.parse(compactMessagesForStorage(remote)) as Array<{ id?: string }>).map((message, position) => [
          message.id ?? `${projectId}-${position}`,
          JSON.stringify(message),
        ]),
      );
      const restored = mergeStoredMessages(remote, local);
      setMessages(restored);
      dbHydratedRef.current = true;
      if (restored.length > remote.length) {
        void flushDb(restored as unknown[]);
      }
    }).catch(() => {
      if (!cancelled) dbHydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Reset complet déclenché par le parent (bouton "Reset complet" sur /dev3).
  // On vide le state, le localStorage et les lignes en DB pour ce projet.
  const lastResetRef = useRef<number | undefined>(resetSignal);
  useEffect(() => {
    if (resetSignal === undefined) return;
    if (lastResetRef.current === resetSignal) return;
    lastResetRef.current = resetSignal;
    setMessages([]);
    dbSavedSignaturesRef.current.clear();
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    void (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) return;
        await supabase
          .from("workspace_chat_messages")
          .delete()
          .eq("owner_id", userId)
          .eq("project_key", `e2b:${projectId}`);
      } catch (e) {
        console.warn("[Dev3Chat] purge DB chat ignorée", e);
      }
    })();
    toast.success("Chat Elena réinitialisé");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Payloads des pièces jointes (texte extrait ou markdown image) — annexés
  // au message uniquement à l'envoi, jamais affichés dans le textarea.
  const attachmentPayloads = useRef<Map<string, string>>(new Map());

  const handleAttach = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const err = validateFile(file);
        if (err) {
          toast.error(err);
          continue;
        }
        const id = makeAttachmentId();
        const kind = classifyFile(file);
        setAttachments((prev) => [
          ...prev,
          { id, name: file.name, kind, size: file.size, status: "uploading" },
        ]);
        try {
          if (kind === "text") {
            const content = await readAsText(file);
            const snippet = `\n\n--- Fichier joint: ${file.name} ---\n\`\`\`\n${content.slice(0, 20000)}\n\`\`\`\n`;
            attachmentPayloads.current.set(id, snippet);
            setAttachments((prev) =>
              prev.map((a) => (a.id === id ? { ...a, status: "ready" } : a)),
            );
          } else if (kind === "image") {
            const { data: sess } = await supabase.auth.getUser();
            const uid = sess.user?.id;
            if (!uid) throw new Error("Non connecté — reconnecte-toi pour joindre des images.");
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `${uid}/dev2/${projectId}/${Date.now()}-${safeName}`;
            const { error: upErr } = await supabase.storage
              .from("chat-uploads")
              .upload(path, file, { upsert: false, contentType: file.type });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from("chat-uploads").getPublicUrl(path);
            const md = `\n\n![${file.name}](${pub.publicUrl})\n`;
            attachmentPayloads.current.set(id, md);
            setAttachments((prev) =>
              prev.map((a) => (a.id === id ? { ...a, status: "ready", ref: pub.publicUrl } : a)),
            );
          } else {
            // Binaire (ZIP ou autre). Au-delà du seuil, on passe par Lovable Cloud
            // Storage pour éviter la limite des payloads HTTP base64 et permettre
            // d'importer des projets lourds (20-200 MB).
            const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";
            const useStorage = file.size > STORAGE_UPLOAD_THRESHOLD;
            if (useStorage) {
              const { data: sess } = await supabase.auth.getUser();
              const uid = sess.user?.id;
              if (!uid) throw new Error("Non connecté — reconnecte-toi pour joindre des fichiers.");
              const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
              const storagePath = `${uid}/${projectId}/${Date.now()}-${safeName}`;
              const { error: upErr } = await supabase.storage
                .from("elena-uploads")
                .upload(storagePath, file, {
                  upsert: false,
                  contentType: file.type || "application/octet-stream",
                });
              if (upErr) throw upErr;
              const res = await ingestFromCloud({
                data: {
                  projectId,
                  storagePath,
                  filename: file.name,
                  mode: isZip ? "unzip" : "deposit",
                },
              });
              const sizeMb = (res.bytes / 1024 / 1024).toFixed(1);
              const snippet = isZip
                ? `\n\n--- Projet importé: ${file.name} (${sizeMb} Mo, ${res.mode === "unzip" ? res.importedFileCount : 0} fichiers) ---\nDécompressé dans \`/home/user/app\` (remplace le projet courant). Lance \`ls\` puis \`read_file\` pour explorer.\n`
                : `\n\n--- Fichier joint (gros): ${file.name} (${sizeMb} Mo) ---\nDéposé dans la sandbox à \`${res.path}\`. Tu peux le lire avec \`read_file\` ou \`run_command\`.\n`;
              attachmentPayloads.current.set(id, snippet);
              setAttachments((prev) =>
                prev.map((a) => (a.id === id ? { ...a, status: "ready", ref: res.path } : a)),
              );
            } else if (isZip) {
              // Petit ZIP → ancien chemin base64 vers _uploads/, Elena décompresse avec unzip_archive.
              const dataUrl = await readAsDataUrl(file);
              const base64 = dataUrl.split(",")[1] ?? "";
              const res = await uploadToSandbox({
                data: { projectId, filename: file.name, base64 },
              });
              const snippet = `\n\n--- Archive jointe: ${file.name} (${(res.bytes / 1024).toFixed(0)} Ko) ---\nDéposée dans la sandbox à \`${res.path}\`. Utilise l'outil \`unzip_archive\` (source=\"${res.path}\") pour la décompresser, puis liste son contenu.\n`;
              attachmentPayloads.current.set(id, snippet);
              setAttachments((prev) =>
                prev.map((a) => (a.id === id ? { ...a, status: "ready", ref: res.path } : a)),
              );
            } else {
              // Petit binaire inconnu → ancien chemin base64.
              const dataUrl = await readAsDataUrl(file);
              const base64 = dataUrl.split(",")[1] ?? "";
              const res = await uploadToSandbox({
                data: { projectId, filename: file.name, base64 },
              });
              const snippet = `\n\n--- Fichier joint: ${file.name} (${(res.bytes / 1024).toFixed(0)} Ko) ---\nDéposé dans la sandbox à \`${res.path}\`. Tu peux le lire avec \`read_file\` ou \`run_command\` (cat, file, hexdump...).\n`;
              attachmentPayloads.current.set(id, snippet);
              setAttachments((prev) =>
                prev.map((a) => (a.id === id ? { ...a, status: "ready", ref: res.path } : a)),
              );
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: "error", error: msg } : a)),
          );
          toast.error(`Échec ${file.name}: ${msg}`);
        }
      }
    },
    [projectId, uploadToSandbox, ingestFromCloud],
  );

  const removeAttachment = useCallback((id: string) => {
    attachmentPayloads.current.delete(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  function submit() {
    const txt = input.trim();
    const readyIds = attachments.filter((a) => a.status === "ready").map((a) => a.id);
    const attachmentText = readyIds.map((id) => attachmentPayloads.current.get(id) ?? "").join("");
    if (!txt && !attachmentText) return;
    if (busy) return;
    setMessages((prev) => sanitizeMessagesForResume(prev));
    // Si le mode pinceau a produit des strokes, on les annexe au message
    // puis on nettoie automatiquement le canvas et on désactive le mode.
    const annotations = annotationStore.serialize();
    const finalText = `${txt}${attachmentText}${annotations ?? ""}`;
    lastUserTextRef.current = finalText;
    readOnlyAutoContinueCountRef.current = 0;
    if (annotations) {
      annotationStore.clear();
      annotationStore.setActive(false);
    }
    setInput("");
    readyIds.forEach((id) => attachmentPayloads.current.delete(id));
    setAttachments([]);
    autoContinueEnabledRef.current = true;
    void sendMessage({ text: finalText });
    window.setTimeout(() => flushPersistence(true), 120);
    setTimeout(() => taRef.current?.focus(), 0);
  }

  function handleStop() {
    stopRequestedRef.current = true;
    autoContinueEnabledRef.current = false;
    stop();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <DropZone onDrop={handleAttach} className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground flex items-center justify-between">
        <span>Elena — agent E2B</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Demande à Elena de créer ou modifier des fichiers dans la sandbox. Glisse-dépose des
              images ou fichiers texte ici.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-[11px] px-2 py-1 rounded-md border border-border bg-muted/30 hover:bg-muted transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          if (!hasRenderablePart(m)) return null;
          return <MessageView key={m.id} message={m} renderSignature={getMessageRenderSignature(m)} />;
        })}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {longRunWarning ? "Elena travaille encore… bouton carré = arrêter" : "Elena réfléchit…"}
          </div>
        )}

        {error && !hasAssistantResponseAfterLastUser && (
          <div className="text-xs p-2 rounded border border-destructive/30 bg-destructive/10 text-destructive flex gap-2 items-start">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{formatChatError(error.message)}</span>
          </div>
        )}
      </div>

      <div className="p-2 border-t border-border bg-card">
        <AttachmentChips items={attachments} onRemove={removeAttachment} />
        <div className="flex gap-1 items-end">
          <AttachButton
            onPick={handleAttach}
            disabled={busy}
            accept="image/*,text/*,.md,.csv,.json,.log,.yml,.yaml,.xml,.pdf,.zip,application/zip"
          />
          <button
            type="button"
            onClick={() => setDictating(true)}
            disabled={busy}
            title="Dictée vocale"
            className="h-9 w-9 flex items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40"
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const { screenshot } = await capturePixelScreenshot();
                const res = await fetch(screenshot.dataUrl);
                const blob = await res.blob();
                const ext = (blob.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
                const file = new File([blob], `preview-${Date.now()}.${ext}`, { type: blob.type });
                await handleAttach([file]);
                toast.success("Capture jointe à Elena");
              } catch (e) {
                toast.error(`Capture échouée: ${e instanceof Error ? e.message : "erreur"}`);
              }
            }}
            disabled={busy}
            title="Capture la preview et la joint au message"
            className="h-9 w-9 flex items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40"
          >
            <Camera className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => annotationStore.toggle()}
            disabled={busy}
            title={
              brushActive
                ? "Désactiver le pinceau"
                : "Pinceau — dessine sur la preview pour montrer où Elena doit agir"
            }
            className={cn(
              "h-9 w-9 flex items-center justify-center rounded-md border disabled:opacity-40 transition-colors",
              brushActive
                ? "border-violet-500/60 bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
                : "border-border hover:bg-muted",
            )}
          >
            <Brush className="h-4 w-4" />
          </button>
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Demande à Elena… (Entrée = envoyer, Shift+Entrée = nouvelle ligne)"
            className="flex-1 resize-none bg-background border border-border rounded-md p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {busy ? (
            <Button onClick={handleStop} size="sm" variant="destructive" title="Arrêter Elena">
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={!input.trim()} size="sm">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <DictationOverlay
        open={dictating}
        initialText={input}
        onCommit={(text) => {
          setInput(text);
          setDictating(false);
          setTimeout(() => taRef.current?.focus(), 0);
        }}
        onCancel={() => setDictating(false)}
      />
    </DropZone>
  );
}

type AnyPart = {
  type: string;
  text?: string;
  state?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function compactMessagesForStorage(messages: unknown[]) {
  return JSON.stringify(messages, (key, value) => {
    if (typeof value !== "string") return value;
    if ((key === "rendered_image_base64" || key === "dataUrl") && value.startsWith("data:image/")) {
      return `[capture image masquée pour éviter de saturer le stockage — ${value.length} caractères]`;
    }
    if (value.length > 30_000) return `${value.slice(0, 30_000)}\n…[contenu raccourci]`;
    return value;
  });
}

/**
 * setItem avec fallback anti-quota : si le payload dépasse la limite du
 * localStorage (~5 Mo selon navigateur), on retente en ne gardant que la queue
 * du chat (les N derniers messages). Le chat complet reste en base — le
 * localStorage ne sert qu'à la reprise rapide au reload.
 */
function safeSetChatHistory(key: string, messages: unknown[]): boolean {
  const tails = [messages.length, 60, 30, 15, 8, 4];
  for (const n of tails) {
    const slice = messages.slice(-n);
    try {
      localStorage.setItem(key, compactMessagesForStorage(slice));
      if (n < messages.length) {
        console.info(`[Dev3Chat] historique local tronqué aux ${n} derniers messages (quota)`);
      }
      return true;
    } catch (e) {
      const isQuota =
        e instanceof DOMException &&
        (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014);
      if (!isQuota) {
        console.warn("[Dev3Chat] historique local non sauvegardé", e);
        return false;
      }
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
  return false;
}

function hasTextPart(message: { role?: string; parts?: AnyPart[] }) {
  if (message.role !== "assistant") return false;
  return (message.parts ?? []).some(
    (part) => part.type === "text" && Boolean((part.text ?? "").trim()),
  );
}

function hasRenderablePart(message: { parts?: AnyPart[] }) {
  return (message.parts ?? []).some((part) => {
    if (part.type === "text") return Boolean((part.text ?? "").trim());
    return Boolean(part.type?.startsWith("tool-"));
  });
}

function getMessageRenderSignature(message: { id: string; role: string; parts?: AnyPart[] }) {
  return `${message.id}:${message.role}:${(message.parts ?? [])
    .map((part) => `${part.type}:${part.state ?? ""}:${part.text ?? ""}:${part.output ? "1" : "0"}`)
    .join("|")}`;
}

function formatChatError(message: string) {
  if (message.toLowerCase().includes("network")) {
    return "Connexion instable avec Elena. Si la réponse apparaît après actualisation, elle a bien été sauvegardée.";
  }
  return message;
}

const MessageView = memo(
  function MessageView({ message }: { message: { id: string; role: string; parts?: AnyPart[] }; renderSignature: string }) {
    const isUser = message.role === "user";
    return (
      <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "max-w-[92%] rounded-lg px-3 py-2 text-sm space-y-2",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {(message.parts ?? []).map((part, i) => {
            if (part.type === "text") {
              return (
                <div key={i} className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap">
                  <ReactMarkdown>{part.text ?? ""}</ReactMarkdown>
                </div>
              );
            }
            if (part.type?.startsWith("tool-")) {
              return <ToolPart key={i} part={part} />;
            }
            return null;
          })}
        </div>
        {!isUser && <CoachElenaButton message={message} />}
      </div>
    );
  },
  (prev, next) => {
    // Re-render uniquement si l'identité ou le contenu du message a vraiment
    // changé. Les messages déjà figés (anciens) ne se re-render plus à chaque
    // token reçu pour le message en cours de streaming.
    if (prev.renderSignature !== next.renderSignature) return false;
    if (prev.message.id !== next.message.id) return false;
    const a = prev.message.parts ?? [];
    const b = next.message.parts ?? [];
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].type !== b[i].type) return false;
      if (a[i].state !== b[i].state) return false;
      if (a[i].text !== b[i].text) return false;
      if (a[i].output !== b[i].output) return false;
    }
    return true;
  },
);

function CoachElenaButton({ message }: { message: { parts?: AnyPart[] } }) {
  const text = (message.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .slice(0, 500);
  const prefill = text ? `Concernant cette réponse d'Elena :\n"${text.slice(0, 200)}..."\n\nLa correction est : ` : "";
  return (
    <Link
      to="/elena-coach"
      search={{ prefill }}
      target="_blank"
      className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted/50 transition"
    >
      <GraduationCap className="h-3 w-3" />
      Coacher Elena sur ce point
    </Link>
  );
}

function ToolPart({ part }: { part: AnyPart }) {
  const [open, setOpen] = useState(false);
  const name = part.type.replace(/^tool-/, "");
  const state = part.state ?? "input-streaming";
  const rawDone = state === "output-available";
  const rawErrored = state === "output-error";
  // Un outil peut renvoyer { ok: false, error: "..." } sans throw → afficher "err".
  const output = part.output as {
    ok?: boolean;
    error?: string;
    filename?: string;
    download_url?: string;
    url?: string;
    mime_type?: string;
    bytes?: number;
    expires_at?: string;
  } | undefined;
  const outputFailed = rawDone && output != null && output.ok === false;
  const done = rawDone && !outputFailed;
  const errored = rawErrored || !!outputFailed;

  // Résumé compact selon l'outil
  const input = part.input as Record<string, unknown> | undefined;
  let summary = "";
  if (output?.filename) summary = output.filename;
  else if (input?.path) summary = String(input.path);
  else if (input?.cmd) summary = String(input.cmd);
  else if (input?.query) summary = String(input.query);

  const downloadUrl = done && output?.ok === true ? output.download_url ?? output.url : undefined;
  const isDownloadTool = ["file_create", "zip_create", "pdf_create", "docx_create"].includes(name);

  return (
    <div className="rounded-md border border-border/60 bg-background/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/50"
      >
        <ChevronRight className={cn("h-3 w-3 transition", open && "rotate-90")} />
        <Wrench className="h-3 w-3" />
        <span className="font-mono font-medium">{name}</span>
        {summary && (
          <span className="font-mono text-muted-foreground truncate flex-1 text-left">
            {summary}
          </span>
        )}
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded",
            done && "bg-green-500/20 text-green-400",
            errored && "bg-destructive/20 text-destructive",
            !done && !errored && "bg-muted text-muted-foreground",
          )}
        >
          {done ? "ok" : errored ? "err" : "…"}
        </span>
      </button>
      {isDownloadTool && downloadUrl && output?.filename && (
        <div className="px-2 pb-2">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            download={output.filename}
            className="inline-flex max-w-full items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Télécharger {output.filename}</span>
          </a>
          {output.expires_at && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Lien valable jusqu'au {new Date(output.expires_at).toLocaleDateString("fr-FR")}.
            </div>
          )}
        </div>
      )}
      {open && (
        <div className="px-2 pb-2 space-y-1 text-[11px] font-mono">
          {input && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">input</summary>
              <pre className="mt-1 p-2 bg-muted/40 rounded overflow-auto max-h-40">
                {JSON.stringify(input, null, 2)}
              </pre>
            </details>
          )}
          {part.output != null && (
            <details open>
              <summary className="cursor-pointer text-muted-foreground">output</summary>
              <pre className="mt-1 p-2 bg-muted/40 rounded overflow-auto max-h-60">
                {JSON.stringify(part.output, null, 2)}
              </pre>
            </details>
          )}
          {part.errorText && <div className="text-destructive">{part.errorText}</div>}
        </div>
      )}
    </div>
  );
}
