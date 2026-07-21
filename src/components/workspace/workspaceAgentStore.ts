/**
 * workspaceAgentStore — singleton module-level pour Elena.
 *
 * Pourquoi : avant, la boucle agent vivait dans le hook React `useWorkspaceAgent`.
 * Dès que l'utilisateur changeait de page (même au sein de Nexyra), le composant
 * se démontait et la boucle s'interrompait. Maintenant la boucle vit ici, au
 * niveau module : elle continue tant que l'onglet est ouvert, peu importe la
 * navigation SPA. Le hook devient une simple subscription.
 *
 * Limite connue : un refresh dur (F5) recharge le module ET le WebContainer →
 * la boucle ne peut pas survivre côté client. Pour la "vraie" persistance
 * cross-refresh, il faudrait déplacer l'exécution des tools côté serveur, ce
 * qui est un autre chantier.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { executeWorkspaceTool, type WorkspaceToolName } from "./workspace-tools";
import type { ChatMessage, ChatToolCall, ToolDiff } from "./useWorkspaceAgent";

const MAX_STEPS = 8;
const WRITE_OPS = new Set<string>(["write_file", "edit_file", "delete_file"]);
const ACTIVE_PROJECT_KEY = "nexyra:dev2:active-project";
const SAFE_KEY = "nexyra:elena-v2:safemode";
// Flag persisté indiquant qu'une boucle agent était en cours quand l'onglet
// a été fermé/rechargé. Sert à proposer une reprise auto au mount.
const RUNNING_PREFIX = "nexyra:elena-v2:running:";
function runningKey(pid: string) {
  return `${RUNNING_PREFIX}${pid}`;
}
function setRunning(pid: string, on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(runningKey(pid), String(Date.now()));
    else window.localStorage.removeItem(runningKey(pid));
  } catch {
    // ignore
  }
}
function isRunning(pid: string): boolean {
  if (typeof window === "undefined") return false;
  const v = window.localStorage.getItem(runningKey(pid));
  if (!v) return false;
  // Ignore les flags trop vieux (> 30 min) pour éviter de relancer une boucle
  // morte depuis longtemps après un crash propre.
  const ts = Number(v);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < 30 * 60 * 1000;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getActiveProjectId(): string {
  if (typeof window === "undefined") return "default";
  return window.localStorage.getItem(ACTIVE_PROJECT_KEY) || "default";
}
function storageKey(pid: string) {
  return `nexyra:elena-v2:chat:${pid}`;
}
function loadPersisted(pid: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(pid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function persist(pid: string, messages: ChatMessage[]) {
  if (typeof window === "undefined" || messages.length === 0) return;
  try {
    window.localStorage.setItem(storageKey(pid), JSON.stringify(messages));
  } catch {
    // quota
  }
}

// ─── DB persistence (Lot A — preview parity) ────────────────────────────────
// localStorage reste un cache instantané pour le premier render ; la DB est
// la source de vérité (survit refresh, cross-device, cross-browser).
function serializePayload(m: ChatMessage): string {
  return JSON.stringify(m);
}

async function dbLoad(pid: string): Promise<ChatMessage[] | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return null;
    const { data, error } = await supabase
      .from("workspace_chat_messages")
      .select("client_id, position, payload")
      .eq("owner_id", session.user.id)
      .eq("project_key", pid)
      .order("position", { ascending: true })
      .limit(2000);
    if (error || !data) return null;
    return data.map((r) => r.payload as unknown as ChatMessage);
  } catch {
    return null;
  }
}

async function dbUpsert(
  pid: string,
  ownerId: string,
  rows: { client_id: string; position: number; payload: ChatMessage }[],
) {
  if (rows.length === 0) return;
  try {
    await supabase.from("workspace_chat_messages").upsert(
      rows.map((r) => ({
        owner_id: ownerId,
        project_key: pid,
        client_id: r.client_id,
        position: r.position,
        payload: r.payload as unknown as Json,
      })),
      { onConflict: "owner_id,project_key,client_id" },
    );
  } catch {
    // best effort — localStorage cache reste en fallback
  }
}

async function dbWipe(pid: string) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    await supabase
      .from("workspace_chat_messages")
      .delete()
      .eq("owner_id", session.user.id)
      .eq("project_key", pid);
  } catch {
    // ignore
  }
}
function loadSafe(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SAFE_KEY) === "1";
}

function sanitizeHistory(history: ChatMessage[]) {
  const toolResultIds = new Set(
    history.filter((m) => m.role === "tool" && m.toolCallId).map((m) => m.toolCallId as string),
  );
  return history.filter((m) => {
    if (m.role !== "assistant" || !m.toolCalls?.length) return true;
    return m.content.trim() || m.toolCalls.every((tc) => toolResultIds.has(tc.id));
  });
}

async function computeDiff(name: string, args: unknown): Promise<ToolDiff | null> {
  const a = (args ?? {}) as Record<string, unknown>;
  const path = String(a.path ?? "");
  if (!path) return null;
  let before = "";
  try {
    const r = (await executeWorkspaceTool("read_file", { path })) as { content?: string };
    before = r?.content ?? "";
  } catch {
    before = "";
  }
  if (name === "write_file") return { path, before, after: String(a.contents ?? ""), op: "write" };
  if (name === "delete_file") return { path, before, after: "", op: "delete" };
  if (name === "edit_file") {
    const search = String(a.search ?? "");
    const replace = String(a.replace ?? "");
    const idx = before.indexOf(search);
    const after =
      idx !== -1 && before.indexOf(search, idx + 1) === -1
        ? before.slice(0, idx) + replace + before.slice(idx + search.length)
        : before;
    return { path, before, after, op: "edit" };
  }
  return null;
}

const UI_FILE_RE = /\.(tsx?|jsx?|css)$/i;

function isUiMutation(name: string, args: unknown): boolean {
  if (!WRITE_OPS.has(name)) return false;
  const path = String(((args ?? {}) as Record<string, unknown>).path ?? "");
  return UI_FILE_RE.test(path);
}

function mutationSignature(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  return JSON.stringify({
    name,
    path: a.path ?? "",
    contents: typeof a.contents === "string" ? a.contents : undefined,
    search: typeof a.search === "string" ? a.search : undefined,
    replace: typeof a.replace === "string" ? a.replace : undefined,
  });
}

function resultOk(result: unknown): boolean {
  return !(result && typeof result === "object" && (result as { ok?: unknown }).ok === false);
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Elena arrêtée par l'utilisateur", "AbortError");
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("Elena arrêtée par l'utilisateur", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Elena arrêtée par l'utilisateur", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function qaVerdict(result: unknown): "OK" | "FIX" | "REFAIRE" | null {
  if (!result || typeof result !== "object") return null;
  const v = (result as { verdict?: unknown }).verdict;
  return v === "OK" || v === "FIX" || v === "REFAIRE" ? v : null;
}

function latestUserBrief(history: ChatMessage[]): string {
  const last = [...history].reverse().find((m) => m.role === "user" && m.content.trim());
  return (last?.content.trim() || "Interface demandée par l'utilisateur").slice(0, 900);
}

export type AgentTiming = {
  prep_ms: number;
  ttft_ms: number | null;
  stream_ms: number;
  total_ms: number;
  steps: number;
  model: string;
  tokens_in: number;
  tokens_out: number;
  intent_level?: string;
  intent_kind?: string;
  routed_to?: "orchestrator" | "trivial";
};

export type AgentState = {
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  safeMode: boolean;
  lastTiming?: AgentTiming | null;
};


type Listener = (s: AgentState) => void;

class AgentStore {
  private states = new Map<string, AgentState>();
  private listeners = new Map<string, Set<Listener>>();
  private abortControllers = new Map<string, AbortController>();
  private approvals = new Map<string, Map<string, (ok: boolean) => void>>();
  // DB sync : pour chaque pid → snapshot des payloads sérialisés déjà flushés
  // en DB. Permet de ne ré-uploader que les messages nouveaux ou modifiés.
  private dbSnapshot = new Map<string, Map<string, string>>();
  private dbFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private dbLoaded = new Set<string>();

  getState(pid: string): AgentState {
    let s = this.states.get(pid);
    if (!s) {
      s = { messages: loadPersisted(pid), busy: false, error: null, safeMode: loadSafe() };
      this.states.set(pid, s);
    }
    return s;
  }

  subscribe(pid: string, fn: Listener): () => void {
    let set = this.listeners.get(pid);
    if (!set) {
      set = new Set();
      this.listeners.set(pid, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }

  private scheduleDbFlush(pid: string) {
    const existing = this.dbFlushTimers.get(pid);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.dbFlushTimers.delete(pid);
      void this.flushDb(pid);
    }, 400);
    this.dbFlushTimers.set(pid, t);
  }

  private async flushDb(pid: string) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const ownerId = session?.user?.id;
      if (!ownerId) return;
      const messages = this.getState(pid).messages;
      let snap = this.dbSnapshot.get(pid);
      if (!snap) {
        snap = new Map();
        this.dbSnapshot.set(pid, snap);
      }
      const dirty: { client_id: string; position: number; payload: ChatMessage }[] = [];
      messages.forEach((m, i) => {
        const ser = serializePayload(m);
        if (snap!.get(m.id) !== ser) {
          dirty.push({ client_id: m.id, position: i, payload: m });
          snap!.set(m.id, ser);
        }
      });
      if (dirty.length === 0) return;
      // Upsert par lots de 50
      for (let i = 0; i < dirty.length; i += 50) {
        await dbUpsert(pid, ownerId, dirty.slice(i, i + 50));
      }
    } catch {
      // ignore — on retentera au prochain update
    }
  }

  /**
   * Charge l'historique depuis la DB (source de vérité). Appelé par le hook
   * au mount. Si la DB renvoie des messages, ils écrasent le cache localStorage
   * (chat survit refresh, cross-device, cross-browser).
   */
  async loadFromDb(pid: string): Promise<void> {
    if (this.dbLoaded.has(pid)) return;
    this.dbLoaded.add(pid);
    const remote = await dbLoad(pid);
    if (!remote) return;
    // Initialise le snapshot pour éviter de ré-uploader ce qu'on vient de lire
    const snap = new Map<string, string>();
    for (const m of remote) snap.set(m.id, serializePayload(m));
    this.dbSnapshot.set(pid, snap);
    // DB fait foi : remplace le state si elle a du contenu OU si le local est vide
    const cur = this.getState(pid);
    if (remote.length > 0 || cur.messages.length === 0) {
      this.update(pid, { messages: remote }, { skipDbFlush: true });
    }
  }

  private update(pid: string, patch: Partial<AgentState>, opts?: { skipDbFlush?: boolean }) {
    const cur = this.getState(pid);
    const next = { ...cur, ...patch };
    this.states.set(pid, next);
    if (patch.messages) {
      persist(pid, patch.messages);
      if (!opts?.skipDbFlush) this.scheduleDbFlush(pid);
    }
    this.listeners.get(pid)?.forEach((l) => l(next));
  }

  setSafeMode(pid: string, v: boolean) {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SAFE_KEY, v ? "1" : "0");
      } catch {
        // ignore
      }
    }
    this.update(pid, { safeMode: v });
  }

  reset(pid: string) {
    this.abortControllers.get(pid)?.abort();
    const apprs = this.approvals.get(pid);
    if (apprs) {
      for (const [, r] of apprs) r(false);
      apprs.clear();
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey(pid));
      } catch {
        // ignore
      }
    }
    this.dbSnapshot.delete(pid);
    void dbWipe(pid);
    this.update(pid, { messages: [], error: null, busy: false }, { skipDbFlush: true });
  }

  cancel(pid: string) {
    this.abortControllers.get(pid)?.abort();
    this.abortControllers.delete(pid);
    const apprs = this.approvals.get(pid);
    if (apprs) {
      for (const [, r] of apprs) r(false);
      apprs.clear();
    }
    setRunning(pid, false);
    this.update(pid, { busy: false });
  }

  approveToolCall(pid: string, id: string) {
    const r = this.approvals.get(pid)?.get(id);
    if (r) {
      r(true);
      this.approvals.get(pid)?.delete(id);
    }
  }
  rejectToolCall(pid: string, id: string) {
    const r = this.approvals.get(pid)?.get(id);
    if (r) {
      r(false);
      this.approvals.get(pid)?.delete(id);
    }
  }

  reloadFromStorage(pid: string) {
    this.update(pid, { messages: loadPersisted(pid) }, { skipDbFlush: true });
    // Et tente une recharge DB en arrière-plan
    this.dbLoaded.delete(pid);
    void this.loadFromDb(pid);
  }

  private async callServer(
    history: ChatMessage[],
    signal: AbortSignal,
    pid: string,
    onDelta?: (chunk: string) => void,
  ) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Tu dois être connecté pour utiliser Elena. Connecte-toi puis réessaie.");
    }
    const useStream = typeof onDelta === "function";
    const res = await fetch("/api/elena-workspace", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...(useStream ? { Accept: "text/event-stream" } : {}),
      },
      signal,
      body: JSON.stringify({
        projectId: pid,
        messages: sanitizeHistory(history).map((m) => ({
          role: m.role,
          content: m.content,
          images: m.images,
          toolCalls: m.toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args })),
          toolCallId: m.toolCallId,
          toolName: m.toolName,
        })),
      }),
    }).catch((e) => {
      if ((e as Error).name === "AbortError") throw e;
      throw new Error(
        "Connexion au serveur Elena interrompue (timeout ou réseau). Réessaie ta demande — si ça persiste, simplifie-la (Elena fait trop d'étapes d'un coup).",
      );
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 412) {
        throw new Error(
          "Elena a besoin de ta clé OpenAI. Va dans Réglages → Intégrations & API et colle ta clé sk-... pour activer Elena.",
        );
      }
      if (res.status === 401)
        throw new Error("Session expirée. Reconnecte-toi puis relance Elena.");
      if (res.status === 429)
        throw new Error("OpenAI rate limit atteint. Attends quelques secondes et réessaie.");
      const lower = body.toLowerCase();
      if (/insufficient_quota|exceeded.*quota|billing/i.test(body)) {
        throw new Error(
          "OpenAI signale quota/billing épuisé. Vérifie ta balance et tes limites sur platform.openai.com (Settings → Billing).",
        );
      }
      if (/invalid_api_key|incorrect api key|401/.test(lower)) {
        throw new Error(
          "OpenAI a refusé ta clé (invalid_api_key). Recolle ta clé sk-... dans Réglages → Intégrations & API.",
        );
      }
      throw new Error(`Agent server ${res.status}: ${body.slice(0, 240)}`);
    }

    type FinalPayload = {
      assistant: {
        text: string;
        toolCalls: { id: string; name: string; args: unknown }[];
        serverTools?: { id: string; name: string; args: unknown; result: unknown }[];
      };
      finishReason: string;
      qaSkipped?: boolean;
    };

    if (
      !useStream ||
      !res.body ||
      !(res.headers.get("content-type") ?? "").includes("text/event-stream")
    ) {
      return (await res.json()) as FinalPayload;
    }

    // Lot C — parse SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let final: FinalPayload | null = null;
    let streamErr: string | null = null;
    try {
      while (true) {
        throwIfAborted(signal);
        const { done, value } = await abortable(reader.read(), signal);
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let evt = "message";
          let data = "";
          for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) evt = line.slice(6).trim();
            else if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).trim();
          }
            if (!data) continue;
            try {
              const parsed = JSON.parse(data);
              if (evt === "text-delta") {
                const t = (parsed as { text?: string }).text;
                if (t) onDelta!(t);
              } else if (evt === "timing") {
                // ⚡ PERF — stocke le dernier détail de timing pour le badge UI.
                this.update(pid, { lastTiming: parsed as AgentTiming }, { skipDbFlush: true });
              } else if (evt === "done") {
                final = parsed as FinalPayload;
              } else if (evt === "error") {
                streamErr = (parsed as { message?: string }).message ?? "stream error";
              }
            } catch {
              // ignore malformed event
            }

        }
      }
    } finally {
      if (signal.aborted) await reader.cancel().catch(() => undefined);
    }
    if (streamErr) throw new Error(streamErr);
    if (!final) throw new Error("Stream terminé sans payload final.");
    return final;
  }

  /**
   * Coeur de la boucle agent. Lit l'historique persisté dans le state, appelle
   * /api/elena-workspace, exécute les tools client, jusqu'à finishReason ≠
   * tool-calls ou MAX_STEPS. Mise à jour incrémentale du state.
   */
  private async runLoop(pid: string, ctl: AbortController) {
    setRunning(pid, true);
    if (!this.approvals.has(pid)) this.approvals.set(pid, new Map());
    const apprs = this.approvals.get(pid)!;

    let history: ChatMessage[] = [...this.getState(pid).messages];
    const pushMsg = (m: ChatMessage) => {
      history = [...history, m];
      this.update(pid, { messages: history });
    };
    const replaceAssistant = (id: string, patch: Partial<ChatMessage>) => {
      history = history.map((m) => (m.id === id ? { ...m, ...patch } : m));
      this.update(pid, { messages: history });
    };

    try {
      let qaRetries = 0;
      let uiChangedSinceQa = false;
      let qaOkAfterUiChange = false;
      let lastQaVerdict: "OK" | "FIX" | "REFAIRE" | null = null;
      const attemptedMutations = new Set<string>();
      const successfulMutations = new Set<string>();
      let loopCompleted = false;
      for (let step = 0; step < MAX_STEPS; step++) {
        throwIfAborted(ctl.signal);
        // Lot C — placeholder streamé. On crée un message assistant vide avant
        // l'appel pour que les text-deltas s'affichent en temps réel (effet
        // typing Lovable-like). Le payload final remplace toolCalls + texte.
        const placeholderId = uid();
        const placeholder: ChatMessage = {
          id: placeholderId,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
        };
        pushMsg(placeholder);
        let streamed = "";
        const onDelta = (chunk: string) => {
          streamed += chunk;
          replaceAssistant(placeholderId, { content: streamed });
        };

        const { assistant, qaSkipped } = await this.callServer(history, ctl.signal, pid, onDelta);

        const serverDone: ChatToolCall[] = (assistant.serverTools ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          args: s.args,
          result: s.result,
          status: "done",
        }));
        const clientPending: ChatToolCall[] = assistant.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.args,
          status: "pending",
        }));
        const toolCalls: ChatToolCall[] | undefined =
          serverDone.length + clientPending.length > 0
            ? [...serverDone, ...clientPending]
            : undefined;

        // Remplace le placeholder par la version finale (texte officiel + tool calls)
        replaceAssistant(placeholderId, { content: assistant.text, toolCalls });
        const assistantMsg = { ...placeholder, content: assistant.text, toolCalls };

        for (const s of serverDone) {
          pushMsg({
            id: uid(),
            role: "tool",
            toolCallId: s.id,
            toolName: s.name,
            content: JSON.stringify(s.result ?? null),
            createdAt: Date.now(),
          });
        }

        if (clientPending.length === 0) {
          const needsQa = uiChangedSinceQa && !qaOkAfterUiChange;
          if ((needsQa || qaSkipped) && qaRetries < 2) {
            qaRetries++;
            pushMsg({
              id: uid(),
              role: "system",
              content: `⚠️ Contrôle final obligatoire. Le projet vient d'être modifié mais la preview n'a pas encore été validée OK. Lance MAINTENANT read_logs({ tail: 80 }) puis qa_visual_pixel({ design_brief: ${JSON.stringify(latestUserBrief(history))} }). Si verdict FIX/REFAIRE, applique uniquement les 2-3 corrections concrètes, puis relance qa_visual_pixel une seule fois. Si aucune correction concrète n'est possible, arrête-toi en expliquant le blocage au lieu de tourner en boucle.`,
              createdAt: Date.now(),
            });
            continue;
          }
          if (needsQa && lastQaVerdict !== "OK") {
            pushMsg({
              id: uid(),
              role: "assistant",
              content:
                "Je m'arrête ici : la preview a été modifiée, mais le contrôle visuel n'a pas validé OK après les tentatives autorisées. Il faut une nouvelle consigne courte pour corriger précisément ce qui manque.",
              createdAt: Date.now(),
            });
          }
          loopCompleted = true;
          break;
        }

        const merged = toolCalls ?? [];
        const refreshAssistant = () =>
          replaceAssistant(assistantMsg.id, { toolCalls: [...merged] });

        const orderedPending = [...clientPending].sort((a, b) => {
          if (a.name === "qa_visual_pixel" && b.name !== "qa_visual_pixel") return 1;
          if (b.name === "qa_visual_pixel" && a.name !== "qa_visual_pixel") return -1;
          return 0;
        });

        for (const tc of orderedPending) {
          throwIfAborted(ctl.signal);
          const isMutation = WRITE_OPS.has(tc.name);
          const isUiWrite = isUiMutation(tc.name, tc.args);
          const sig = isMutation ? mutationSignature(tc.name, tc.args) : "";
          if (isMutation && successfulMutations.has(sig)) {
            tc.status = "done";
            tc.result = { ok: true, skipped: true, reason: "duplicate_mutation_already_applied" };
            refreshAssistant();
            pushMsg({
              id: uid(),
              role: "tool",
              toolCallId: tc.id,
              toolName: tc.name,
              content: JSON.stringify(tc.result),
              createdAt: Date.now(),
            });
            continue;
          }
          if (isMutation && attemptedMutations.has(sig)) {
            tc.status = "done";
            tc.result = { ok: false, skipped: true, reason: "duplicate_failed_mutation_blocked" };
            refreshAssistant();
            pushMsg({
              id: uid(),
              role: "tool",
              toolCallId: tc.id,
              toolName: tc.name,
              content: JSON.stringify(tc.result),
              createdAt: Date.now(),
            });
            continue;
          }
          if (isMutation) attemptedMutations.add(sig);

          if (this.getState(pid).safeMode && WRITE_OPS.has(tc.name)) {
            try {
              const diff = await computeDiff(tc.name, tc.args);
              if (diff) {
                tc.diff = diff;
                tc.status = "awaiting_approval";
                refreshAssistant();
                const approved = await new Promise<boolean>((resolve) => {
                  apprs.set(tc.id, resolve);
                });
                if (!approved) {
                  tc.status = "done";
                  tc.result = { ok: false, skipped: true, reason: "user_rejected" };
                  refreshAssistant();
                  pushMsg({
                    id: uid(),
                    role: "tool",
                    toolCallId: tc.id,
                    toolName: tc.name,
                    content: JSON.stringify(tc.result),
                    createdAt: Date.now(),
                  });
                  continue;
                }
              }
            } catch {
              // diff failed → execute directly
            }
          }

          tc.status = "running";
          refreshAssistant();
          let resultPayload: unknown;
          try {
            resultPayload = await abortable(
              executeWorkspaceTool(tc.name as WorkspaceToolName, tc.args),
              ctl.signal,
            );
            throwIfAborted(ctl.signal);
            tc.result = resultPayload;
            tc.status = "done";
            if (isUiWrite && resultOk(resultPayload)) {
              uiChangedSinceQa = true;
              qaOkAfterUiChange = false;
            }
            if (isMutation && resultOk(resultPayload)) {
              successfulMutations.add(sig);
            }
            if (tc.name === "qa_visual_pixel" && resultOk(resultPayload)) {
              lastQaVerdict = qaVerdict(resultPayload);
              if (lastQaVerdict === "OK") qaOkAfterUiChange = true;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            tc.error = msg;
            tc.status = "error";
            resultPayload = { ok: false, error: msg };
          }
          refreshAssistant();
          pushMsg({
            id: uid(),
            role: "tool",
            toolCallId: tc.id,
            toolName: tc.name,
            content: JSON.stringify(resultPayload),
            createdAt: Date.now(),
          });
        }
      }
      if (!loopCompleted) {
        pushMsg({
          id: uid(),
          role: "assistant",
          content:
            "Je m'arrête pour éviter une boucle : Elena a atteint la limite de contrôle sans arriver à une validation claire. Relance avec une consigne plus courte sur le point précis à corriger.",
          createdAt: Date.now(),
        });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        history = this.getState(pid).messages.map((m) => {
          const calls = m.toolCalls ?? [];
          if (m.role !== "assistant" || !calls.some((tc) => tc.status === "running" || tc.status === "pending" || tc.status === "awaiting_approval")) return m;
          return {
            ...m,
            toolCalls: calls.map((tc) =>
              tc.status === "running" || tc.status === "pending" || tc.status === "awaiting_approval"
                ? { ...tc, status: "error", error: "Arrêté par l'utilisateur" }
                : tc,
            ),
          };
        });
        if (history[history.length - 1]?.content !== "_Arrêté._") {
          history = [
            ...history,
            { id: uid(), role: "assistant", content: "_Arrêté._", createdAt: Date.now() },
          ];
        }
        this.update(pid, { messages: history, busy: false, error: null });
        this.update(pid, { busy: false });
        setRunning(pid, false);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.update(pid, { error: msg });
    } finally {
      this.update(pid, { busy: false });
      setRunning(pid, false);
      if (this.abortControllers.get(pid) === ctl) this.abortControllers.delete(pid);
    }
  }

  async send(pid: string, prompt: string, images?: string[]) {
    const state = this.getState(pid);
    if ((!prompt.trim() && !images?.length) || state.busy) return;

    const ctl = new AbortController();
    this.abortControllers.set(pid, ctl);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: prompt,
      images: images?.length ? images : undefined,
      createdAt: Date.now(),
    };

    const history = [...state.messages, userMsg];
    this.update(pid, { messages: history, busy: true, error: null });

    await this.runLoop(pid, ctl);
  }

  /**
   * Détecte si une boucle agent était en cours quand l'onglet a été
   * fermé/rechargé (flag persisté `nexyra:elena-v2:running:<pid>` < 30 min).
   * Si oui, et que l'historique persisté se termine sur quelque chose
   * d'incomplet (dernier message = user, OU = assistant avec toolCalls dont
   * un résultat manque, OU = tool result orphelin), relance la boucle.
   *
   * Idempotent : ne relance pas si déjà busy en mémoire.
   */
  tryResume(pid: string): boolean {
    const s = this.getState(pid);
    if (s.busy) return false;
    if (!isRunning(pid)) return false;
    setRunning(pid, false);
    this.update(pid, { busy: false, error: null });
    return false;
  }
}

export const agentStore = new AgentStore();
export { getActiveProjectId };
