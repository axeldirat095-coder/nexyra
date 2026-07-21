/**
 * WorkspaceChat — panneau conversationnel Elena V2.
 * Affiche messages user / assistant + tool-calls (collapsibles).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, Wrench, CheckCircle2, AlertTriangle, Square, Sparkles, Paperclip, X, ShieldCheck, ShieldOff, Check, Ban, Mic, MicOff } from "lucide-react";
import { useWorkspaceAgent, type ChatMessage, type ChatToolCall, type ToolDiff } from "./useWorkspaceAgent";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { estimateTask, type TaskEstimate } from "@/hooks/useTaskEstimator";
import { usePerfHistory } from "./usePerfHistory";
import { cn } from "@/lib/utils";

const QUICK_SUGGESTIONS = [
  "Crée une landing avec un hero gradient",
  "Ajoute une section pricing à 3 colonnes",
  "Mets le site en mode dark premium",
  "Génère un formulaire de contact",
  "Liste tous les fichiers du projet",
];

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB / image

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function WorkspaceChat() {
  const { messages, send, busy, error, cancel, safeMode, setSafeMode, approveToolCall, rejectToolCall, lastTiming } = useWorkspaceAgent();
  const [perfOpen, setPerfOpen] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const lastUserPreview = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content ?? "";
    }
    return "";
  }, [messages]);
  const perfHistory = usePerfHistory(lastTiming, lastUserPreview);

  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [pendingEstimate, setPendingEstimate] = useState<TaskEstimate | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const speech = useSpeechRecognition({
    onTranscript: (t) => setInput((prev) => (prev ? `${prev} ${t}` : t)),
  });

  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Premier rendu avec messages chargés → saut instantané tout en bas
    // pour ouvrir sur le dernier message échangé (pas le premier).
    if (!didInitialScrollRef.current && messages.length > 0) {
      didInitialScrollRef.current = true;
      // Double rAF pour attendre que les bulles soient mesurées par le layout
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        });
      });
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  // Listen for inserts from scrape panel / left toolbar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") {
        setInput((prev) => (prev ? `${prev}\n\n${detail}` : detail));
        taRef.current?.focus();
      }
    };
    window.addEventListener("workspace:chat-insert", handler);
    return () => window.removeEventListener("workspace:chat-insert", handler);
  }, []);

  const liveEstimate = useMemo(
    () => (input.trim().length > 8 ? estimateTask({ message: input, files: [] }) : null),
    [input],
  );

  // IDs des tool-calls en attente d'approbation (pour bouton "tout approuver")
  const pendingIds = useMemo(() => {
    const ids: string[] = [];
    for (const m of messages) {
      for (const tc of m.toolCalls ?? []) {
        if (tc.status === "awaiting_approval") ids.push(tc.id);
      }
    }
    return ids;
  }, [messages]);

  const approveAll = () => pendingIds.forEach((id) => approveToolCall(id));
  const rejectAll = () => pendingIds.forEach((id) => rejectToolCall(id));

  const doSend = (txt: string, imgs: string[]) => {
    setInput("");
    setImages([]);
    void send(txt || "Inspire-toi de ce visuel pour le design.", imgs);
  };

  const submit = () => {
    if ((!input.trim() && images.length === 0) || busy) return;
    // Estimation cost — confirm if heavy
    if (liveEstimate && liveEstimate.heavy) {
      setPendingEstimate(liveEstimate);
      return;
    }
    doSend(input.trim(), images);
  };

  const confirmAndSend = () => {
    const txt = input.trim();
    const imgs = images;
    setPendingEstimate(null);
    doSend(txt, imgs);
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadErr(null);
    const next: string[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > MAX_IMAGE_BYTES) {
        setUploadErr(`${f.name} > 4 Mo`);
        continue;
      }
      try {
        next.push(await fileToDataUrl(f));
      } catch {
        setUploadErr("Lecture impossible");
      }
    }
    if (next.length) setImages((prev) => [...prev, ...next].slice(0, 4));
    if (fileRef.current) fileRef.current.value = "";
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-violet-400" />
          Elena
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSafeMode(!safeMode)}
            title={safeMode ? "Mode safe ON — chaque modif fichier doit être approuvée" : "Mode safe OFF — Elena applique directement"}
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition",
              safeMode
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : "border-slate-700 bg-slate-900/40 text-slate-500 hover:text-slate-300",
            )}
          >
            {safeMode ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
            Safe
          </button>
          {lastTiming && (
            <button
              onClick={() => setPerfOpen((v) => !v)}
              title="Détail du temps de la dernière réponse Elena"
              className={cn(
                "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium tabular-nums transition",
                lastTiming.total_ms < 3000
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  : lastTiming.total_ms < 8000
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
              )}
            >
              ⚡ {(lastTiming.total_ms / 1000).toFixed(1)}s
            </button>
          )}
          <span className="hidden text-[10px] uppercase tracking-wider text-slate-500 sm:inline">
            orchestrator · architecte · designer
          </span>
        </div>
      </div>
      {perfOpen && lastTiming && (
        <div className="border-b border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400 tabular-nums">
          <div className="mb-1 font-medium text-slate-300">⚡ Dernière réponse — détail</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span>Préparation serveur</span><span className="text-slate-200">{lastTiming.prep_ms} ms</span>
            <span>Attente 1er mot (modèle)</span><span className="text-slate-200">{lastTiming.ttft_ms !== null ? `${lastTiming.ttft_ms} ms` : "—"}</span>
            <span>Streaming texte</span><span className="text-slate-200">{lastTiming.stream_ms} ms</span>
            <span>Total bout-en-bout</span><span className="font-medium text-slate-100">{(lastTiming.total_ms / 1000).toFixed(2)} s</span>
            <span>Étapes (tool calls)</span><span className="text-slate-200">{lastTiming.steps}</span>
            <span>Modèle</span><span className="truncate text-slate-200">{lastTiming.model}</span>
            <span>Tokens in / out</span><span className="text-slate-200">{lastTiming.tokens_in.toLocaleString()} / {lastTiming.tokens_out.toLocaleString()}</span>
            {lastTiming.intent_level && (
              <>
                <span>Type de message</span><span className="text-slate-200">{lastTiming.intent_kind} · {lastTiming.intent_level}</span>
                <span>Routage économique</span>
                <span className={lastTiming.routed_to === "trivial" ? "font-medium text-emerald-300" : "text-slate-200"}>
                  {lastTiming.routed_to === "trivial" ? "💰 modèle éco (DeepSeek)" : "modèle complet"}
                </span>
              </>
            )}
          </div>

          <div className="mt-2 border-t border-slate-800 pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-slate-300">📊 Historique enregistré ({perfHistory.entries.length})</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={async () => { const ok = await perfHistory.copyText(); setCopyOk(ok); setTimeout(() => setCopyOk(false), 1500); }}
                  disabled={perfHistory.entries.length === 0}
                  className="rounded border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  {copyOk ? "✓ copié" : "Copier"}
                </button>
                <button
                  onClick={perfHistory.downloadJSON}
                  disabled={perfHistory.entries.length === 0}
                  className="rounded border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  Export JSON
                </button>
                <button
                  onClick={perfHistory.clear}
                  disabled={perfHistory.entries.length === 0}
                  className="rounded border border-rose-700/50 bg-rose-900/20 px-2 py-0.5 text-[10px] text-rose-300 hover:bg-rose-900/40 disabled:opacity-40"
                >
                  Vider
                </button>
              </div>
            </div>
            {perfHistory.stats && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-400">
                <span>Total moyen</span><span className="text-slate-200">{(perfHistory.stats.total_avg / 1000).toFixed(2)} s</span>
                <span>Total p50 / p95</span><span className="text-slate-200">{(perfHistory.stats.total_p50 / 1000).toFixed(2)}s / {(perfHistory.stats.total_p95 / 1000).toFixed(2)}s</span>
                <span>Prep moyen</span><span className="text-slate-200">{perfHistory.stats.prep_avg} ms</span>
                <span>Attente 1er mot moyen</span><span className="text-slate-200">{perfHistory.stats.ttft_avg} ms</span>
              </div>
            )}
            <p className="mt-1 text-[10px] text-slate-500">
              Les 200 derniers échanges sont conservés dans ce navigateur. Clique "Copier" puis colle-moi le récap pour analyse.
            </p>
          </div>
        </div>
      )}



      <div ref={scrollRef} className="relative flex-1 space-y-3 overflow-auto px-3 py-3">
        {pendingIds.length >= 2 && (
          <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-2 flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-[11px] text-amber-200">
              {pendingIds.length} modifs en attente
            </span>
            <div className="ml-auto flex gap-1.5">
              <button
                onClick={approveAll}
                className="flex items-center gap-1 rounded bg-emerald-500/25 px-2 py-1 text-[10px] font-medium text-emerald-100 ring-1 ring-emerald-500/40 hover:bg-emerald-500/40"
              >
                <Check className="h-3 w-3" /> Tout approuver
              </button>
              <button
                onClick={rejectAll}
                className="flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 text-[10px] font-medium text-red-200 ring-1 ring-red-500/40 hover:bg-red-500/25"
              >
                <Ban className="h-3 w-3" /> Tout rejeter
              </button>
            </div>
          </div>
        )}
        {messages.length === 0 && !busy && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
            Demande à Elena ce que tu veux construire. Ex :
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>"Crée une landing avec un hero gradient + 3 features"</li>
              <li>"Ajoute un compteur de clics au centre de la page"</li>
              <li>"Liste tous les fichiers du projet"</li>
            </ul>
          </div>
        )}
        {messages
          .filter((m) => m.role !== "tool" && m.role !== "system")
          .map((m) => (
            <MessageBubble key={m.id} msg={m} onApprove={approveToolCall} onReject={rejectToolCall} />
          ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
            Elena réfléchit…
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            ⚠ {error}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 p-2">
        {/* Quick suggestions */}
        {messages.length === 0 && !busy && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInput(s);
                  taRef.current?.focus();
                }}
                className="rounded-full border border-slate-700 bg-slate-900/40 px-2.5 py-1 text-[10px] text-slate-300 hover:border-violet-500/50 hover:text-violet-200"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-md border border-slate-700">
                <img src={src} alt={`ref-${i}`} className="h-full w-full object-cover" />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute right-0 top-0 rounded-bl-md bg-black/70 p-0.5 text-white opacity-0 group-hover:opacity-100"
                  title="Retirer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {uploadErr && <div className="mb-1 px-1 text-[10px] text-red-400">{uploadErr}</div>}
        <div className="flex items-end gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2 focus-within:border-violet-500/50">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy || images.length >= 4}
            className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-violet-300 disabled:opacity-40"
            title="Joindre une image de référence (max 4)"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          {speech.isSupported && (
            <button
              onClick={speech.toggle}
              disabled={busy}
              className={cn(
                "rounded-md p-2 transition-colors disabled:opacity-40",
                speech.isListening
                  ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                  : "text-slate-400 hover:bg-slate-800 hover:text-violet-300",
              )}
              title={speech.isListening ? "Arrêter la dictée" : "Dictée vocale"}
            >
              {speech.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={2}
            placeholder="Décris ce qu'Elena doit construire…"
            className="min-h-[40px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-slate-600"
          />
          {busy ? (
            <button
              onClick={cancel}
              className="rounded-md bg-red-500/20 p-2 text-red-300 hover:bg-red-500/30"
              title="Annuler"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim() && images.length === 0}
              className="rounded-md bg-gradient-to-br from-blue-500 to-violet-500 p-2 text-white shadow disabled:opacity-40"
              title="Envoyer (Entrée)"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-slate-600">
          <span>Entrée pour envoyer · Shift+Entrée saut de ligne</span>
          {liveEstimate && (
            <span className={cn("tabular-nums", liveEstimate.heavy && "text-amber-400")}>
              ~{liveEstimate.size} · ${liveEstimate.costUsd.toFixed(3)} · {liveEstimate.durationS}s
            </span>
          )}
        </div>
        {speech.error && (
          <div className="mt-1 px-1 text-[10px] text-red-400">{speech.error}</div>
        )}
      </div>

      {/* Estimation cost confirmation modal */}
      {pendingEstimate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPendingEstimate(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-amber-500/30 bg-slate-950 p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              Demande lourde — confirmation
            </div>
            <div className="space-y-1.5 text-xs text-slate-300">
              <div>Taille estimée : <span className="font-mono text-amber-200">{pendingEstimate.size}</span></div>
              <div>Coût estimé : <span className="font-mono text-amber-200">${pendingEstimate.costUsd.toFixed(3)}</span></div>
              <div>Durée estimée : <span className="font-mono text-amber-200">{pendingEstimate.durationS}s</span></div>
              {pendingEstimate.reasons.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-slate-400">Détails</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-400">
                    {pendingEstimate.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </details>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPendingEstimate(null)}
                className="flex-1 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                onClick={confirmAndSend}
                className="flex-1 rounded-md bg-gradient-to-br from-blue-500 to-violet-500 px-3 py-2 text-xs font-medium text-white hover:opacity-90"
              >
                Lancer quand même
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type RowCallbacks = { onApprove: (id: string) => void; onReject: (id: string) => void };

function MessageBubble({ msg, onApprove, onReject }: { msg: ChatMessage } & RowCallbacks) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2 rounded-lg bg-blue-500/15 px-3 py-2 text-sm text-blue-50 ring-1 ring-blue-500/30">
          {msg.images && msg.images.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {msg.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`ref-${i}`}
                  className="h-20 w-20 rounded object-cover ring-1 ring-blue-400/40"
                />
              ))}
            </div>
          )}
          {msg.content && <div>{msg.content}</div>}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {msg.content && (
        <div className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
          {msg.content}
        </div>
      )}
      {msg.toolCalls?.map((tc) => (
        <ToolCallRow key={tc.id} tc={tc} onApprove={onApprove} onReject={onReject} />
      ))}
    </div>
  );
}

function ToolCallRow({ tc, onApprove, onReject }: { tc: ChatToolCall } & RowCallbacks) {
  const isDelegate = tc.name === "delegate_architect" || tc.name === "delegate_designer";
  const isAwaiting = tc.status === "awaiting_approval";
  const [open, setOpen] = useState(isDelegate || isAwaiting);
  // Auto-déplie quand un tool-call passe en attente d'approbation
  useEffect(() => {
    if (isAwaiting) setOpen(true);
  }, [isAwaiting]);

  const Icon =
    tc.status === "done"
      ? CheckCircle2
      : tc.status === "error"
        ? AlertTriangle
        : tc.status === "running"
          ? Loader2
          : isAwaiting
            ? ShieldCheck
            : Wrench;
  const color =
    tc.status === "done"
      ? "text-emerald-400"
      : tc.status === "error"
        ? "text-red-400"
        : tc.status === "running"
          ? "text-blue-400"
          : isAwaiting
            ? "text-amber-400"
            : "text-slate-400";

  const label =
    tc.name === "delegate_architect"
      ? "Architecte"
      : tc.name === "delegate_designer"
        ? "Designer"
        : tc.name;

  return (
    <div
      className={cn(
        "rounded-md border text-xs",
        isAwaiting
          ? "border-amber-500/40 bg-amber-500/5"
          : isDelegate
            ? "border-violet-500/30 bg-violet-500/5"
            : "border-slate-800 bg-slate-900/40",
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-800/40"
      >
        <Icon className={cn("h-3.5 w-3.5 shrink-0", color, tc.status === "running" && "animate-spin")} />
        <span className={cn("font-mono", isAwaiting ? "text-amber-200" : isDelegate ? "text-violet-200" : "text-slate-300")}>
          {label}
        </span>
        <span className="truncate text-slate-500">{summarizeArgs(tc.args)}</span>
        {isAwaiting && (
          <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
            à valider
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-800 px-2.5 py-2">
          {isAwaiting && tc.diff && <DiffPreview diff={tc.diff} />}
          {isAwaiting && (
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(tc.id)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-500/20 px-3 py-1.5 text-[11px] font-medium text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30"
              >
                <Check className="h-3.5 w-3.5" /> Approuver
              </button>
              <button
                onClick={() => onReject(tc.id)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-500/15 px-3 py-1.5 text-[11px] font-medium text-red-200 ring-1 ring-red-500/40 hover:bg-red-500/25"
              >
                <Ban className="h-3.5 w-3.5" /> Rejeter
              </button>
            </div>
          )}
          {!isAwaiting && isDelegate && tc.result ? (
            <DelegateResult name={tc.name} result={tc.result} args={tc.args} />
          ) : !isAwaiting ? (
            <>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Args</div>
                <pre className="max-h-48 overflow-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-300">
                  {JSON.stringify(tc.args, null, 2)}
                </pre>
              </div>
              {tc.result !== undefined && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Result</div>
                  <pre className="max-h-48 overflow-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-300">
                    {JSON.stringify(tc.result, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : null}
          {tc.error && <div className="text-[11px] text-red-400">{tc.error}</div>}
        </div>
      )}
    </div>
  );
}

function DelegateResult({ name, result, args }: { name: string; result: unknown; args: unknown }) {
  const text =
    (result as { plan?: string; spec?: string })?.plan ??
    (result as { plan?: string; spec?: string })?.spec ??
    "";
  const brief = (args as { brief?: string })?.brief ?? "";
  return (
    <div className="space-y-2">
      {brief && (
        <div className="text-[11px] italic text-slate-400">Brief : « {brief} »</div>
      )}
      <div className="max-h-72 overflow-auto rounded bg-slate-950/60 p-2.5 text-[12px] leading-relaxed text-slate-200 whitespace-pre-wrap">
        {text || JSON.stringify(result, null, 2)}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-violet-400/80">
        ↳ {name === "delegate_architect" ? "Plan d'archi" : "Spec design"}
      </div>
    </div>
  );
}

function DiffPreview({ diff }: { diff: ToolDiff }) {
  const opLabel = diff.op === "write" ? (diff.before ? "Modifier" : "Créer") : diff.op === "delete" ? "Supprimer" : "Éditer";
  if (diff.op === "delete") {
    return (
      <div className="rounded border border-red-500/30 bg-red-500/5 p-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-red-300">{opLabel} · {diff.path}</div>
        <div className="text-[11px] text-red-200">⚠ Le fichier sera supprimé ({diff.before.length} caractères).</div>
      </div>
    );
  }
  const beforeLines = diff.before ? diff.before.split("\n") : [];
  const afterLines = diff.after ? diff.after.split("\n") : [];
  const max = 40;
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-amber-300">
        {opLabel} · <span className="font-mono text-amber-200">{diff.path}</span>
        <span className="ml-2 text-slate-500">{beforeLines.length} → {afterLines.length} lignes</span>
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        <div>
          <div className="mb-0.5 text-[9px] uppercase tracking-wider text-red-300">Avant</div>
          <pre className="max-h-56 overflow-auto rounded bg-red-950/30 p-2 font-mono text-[10px] leading-relaxed text-red-100/80">
            {beforeLines.length === 0 ? "(fichier inexistant)" : beforeLines.slice(0, max).join("\n")}
            {beforeLines.length > max ? `\n… (+${beforeLines.length - max} lignes)` : ""}
          </pre>
        </div>
        <div>
          <div className="mb-0.5 text-[9px] uppercase tracking-wider text-emerald-300">Après</div>
          <pre className="max-h-56 overflow-auto rounded bg-emerald-950/30 p-2 font-mono text-[10px] leading-relaxed text-emerald-100/80">
            {afterLines.length === 0 ? "(vide)" : afterLines.slice(0, max).join("\n")}
            {afterLines.length > max ? `\n… (+${afterLines.length - max} lignes)` : ""}
          </pre>
        </div>
      </div>
    </div>
  );
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  if (typeof a.path === "string") return a.path;
  if (typeof a.cmd === "string") {
    const arr = Array.isArray(a.args) ? (a.args as unknown[]).join(" ") : "";
    return `${a.cmd} ${arr}`.trim();
  }
  return "";
}
