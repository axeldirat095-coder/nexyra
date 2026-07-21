import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import { Download } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useElenaChat } from "@/hooks/useElenaChat";
import {
  Sparkles,
  Send,
  Square,
  MessageCircle,
  Loader2,
  Plus,
  Search,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  AttachButton,
  AttachmentChips,
  DropZone,
  classifyFile,
  makeAttachmentId,
  readAsText,
  validateFile,
  type PendingAttachment,
} from "@/components/chat/ChatAttachments";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  head: () => ({
    meta: [
      { title: "Discuter avec Elena — Nexyra" },
      {
        name: "description",
        content:
          "Mode discussion libre avec Elena, l'agent IA Nexyra. Pose tes questions sans avoir à créer de projet.",
      },
      { property: "og:title", content: "Discuter avec Elena — Nexyra" },
      {
        property: "og:description",
        content: "Conversation libre avec Elena, l'agent IA Nexyra.",
      },
    ],
  }),
});

function ChatPage() {
  return (
    <RequireAuth>
      <ChatView />
    </RequireAuth>
  );
}

type ConvRow = {
  id: string;
  title: string;
  last_message_at: string | null;
  created_at: string;
};

const SUGGESTIONS = [
  "Explique-moi ce que tu peux faire pour moi",
  "Aide-moi à structurer une idée business",
  "Rédige-moi un email de prospection percutant",
  "Donne-moi un plan d'action pour lancer une newsletter",
];

async function downloadImage(url: string, filename = "image.png") {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank");
  }
}

function ChatImage({ src, alt }: { src?: string; alt?: string }) {
  if (!src) return null;
  const filename = (alt && alt.trim()) || src.split("/").pop()?.split("?")[0] || "image.png";
  return (
    <span className="relative inline-block group my-2 max-w-[320px]">
      <img
        src={src}
        alt={alt ?? ""}
        className="rounded-xl border border-border/40 w-full h-auto"
        loading="lazy"
      />
      <button
        type="button"
        onClick={() => downloadImage(src, filename)}
        className="absolute top-2 right-2 size-8 rounded-lg bg-background/80 backdrop-blur border border-border/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
        title="Télécharger"
        aria-label="Télécharger l'image"
      >
        <Download className="size-4" />
      </button>
    </span>
  );
}

const markdownComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) => <ChatImage src={src} alt={alt} />,
};

function ChatView() {
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const { messages, send, isStreaming, error, stop, reset, reload, conversationId } = useElenaChat({
    projectId: null,
    freeMode: true,
  });
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 768px)").matches,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Charge la liste des conversations libres
  async function loadConversations() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("conversations")
      .select("id, title, last_message_at, created_at")
      .eq("owner_id", user.id)
      .is("project_id", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) setConversations(data as ConvRow[]);
  }

  useEffect(() => {
    void loadConversations();
  }, []);

  // Sync l'ID actif quand le hook crée/charge une conv
  useEffect(() => {
    if (conversationId && conversationId !== activeConvId) {
      setActiveConvId(conversationId);
      void loadConversations();
    }
  }, [conversationId, activeConvId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function handleNewChat() {
    reset();
    setActiveConvId(null);
    setInput("");
    setAttachments([]);
    textareaRef.current?.focus();
  }

  async function handleSelectConv(id: string) {
    if (id === activeConvId) return;
    setActiveConvId(id);
    await reload(id);
  }

  async function handleDeleteConv(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Supprimer cette discussion ?")) return;
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) {
      toast.error("Suppression impossible");
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeConvId) handleNewChat();
  }

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  async function handleAttach(files: File[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Connecte-toi pour joindre des fichiers");
      return;
    }
    for (const file of files) {
      const err = validateFile(file);
      if (err) { toast.error(err); continue; }
      const id = makeAttachmentId();
      const kind = classifyFile(file);
      setAttachments((prev) => [...prev, { id, name: file.name, kind, size: file.size, status: "uploading" }]);
      try {
        if (kind === "text") {
          const content = await readAsText(file);
          const ref = `INLINE:${content.slice(0, 20000)}`;
          setAttachments((prev) => prev.map((a) => a.id === id ? { ...a, status: "ready", ref } : a));
        } else {
          const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
          const { error } = await supabase.storage.from("chat-uploads").upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
          });
          if (error) throw error;
          const { data } = supabase.storage.from("chat-uploads").getPublicUrl(path);
          setAttachments((prev) => prev.map((a) => a.id === id ? { ...a, status: "ready", ref: data.publicUrl } : a));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Échec upload";
        setAttachments((prev) => prev.map((a) => a.id === id ? { ...a, status: "error", error: msg } : a));
        toast.error(`${file.name} : ${msg}`);
      }
    }
  }

  function buildMessageWithAttachments(text: string): string {
    const ready = attachments.filter((a) => a.status === "ready" && a.ref);
    if (ready.length === 0) return text;
    const parts: string[] = [text];
    for (const a of ready) {
      if (a.kind === "image" && a.ref) {
        parts.push(`\n\n📎 Image jointe : ![${a.name}](${a.ref})`);
      } else if (a.kind === "text" && a.ref?.startsWith("INLINE:")) {
        const content = a.ref.slice(7);
        parts.push(`\n\n📎 Fichier joint **${a.name}** :\n\n\`\`\`\n${content}\n\`\`\``);
      } else if (a.ref) {
        parts.push(`\n\n📎 Fichier joint : [${a.name}](${a.ref})`);
      }
    }
    return parts.join("");
  }

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    if (attachments.some((a) => a.status === "uploading")) {
      toast.info("Upload en cours…");
      return;
    }
    const final = buildMessageWithAttachments(text || "(fichier joint)");
    const imageUrls = attachments
      .filter((a) => a.status === "ready" && a.kind === "image" && a.ref && !a.ref.startsWith("INLINE:"))
      .map((a) => a.ref as string);
    setInput("");
    setAttachments([]);
    void send(final, undefined, { images: imageUrls });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const activeTitle = activeConvId
    ? conversations.find((c) => c.id === activeConvId)?.title ?? "Discussion"
    : "Nouvelle discussion";

  return (
    <div className="h-[100dvh] bg-background flex flex-col md:pt-20">
      {/* Navbar masquée sur mobile pour libérer l'espace */}
      <div className="hidden md:block">
        <Navbar />
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Overlay mobile quand sidebar ouverte */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          />
        )}

        {/* Sidebar : overlay sur mobile, colonne inline sur desktop */}
        <aside
          className={cn(
            "bg-muted/20 backdrop-blur flex flex-col",
            // Mobile : drawer
            "fixed inset-y-0 left-0 z-40 w-[82%] max-w-[320px] border-r border-border/60 shadow-2xl transition-transform duration-200",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            // Desktop : reset overlay + comportement collapsible
            "md:static md:translate-x-0 md:shadow-none md:transition-[width] md:duration-200",
            sidebarOpen ? "md:w-72" : "md:w-0 md:-ml-px md:overflow-hidden md:border-r-0",
          )}
        >
          <div className="p-3 space-y-2 border-b border-border/60">
            <Button onClick={() => { handleNewChat(); setSidebarOpen(false); }} className="w-full justify-start gap-2" variant="default">
              <Plus className="size-4" /> Nouveau chat
            </Button>
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="pl-8 h-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredConvs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6 px-3">
                {search ? "Aucun résultat" : "Aucune discussion encore."}
              </p>
            )}
            {filteredConvs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { void handleSelectConv(c.id); setSidebarOpen(false); }}
                className={cn(
                  "group w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2",
                  c.id === activeConvId
                    ? "bg-primary/15 text-foreground"
                    : "hover:bg-muted/60 text-muted-foreground hover:text-foreground active:bg-muted/80",
                )}
              >
                <MessageCircle className="size-3.5 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{c.title}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleDeleteConv(c.id, e)}
                  className="md:opacity-0 md:group-hover:opacity-100 opacity-60 hover:text-destructive p-1 rounded"
                  aria-label="Supprimer"
                >
                  <Trash2 className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main chat area */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="border-b border-border/60 px-3 py-2.5 flex items-center gap-2 shrink-0 bg-background/80 backdrop-blur sticky top-0 z-20">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? "Masquer la barre" : "Afficher la barre"}
              aria-label="Menu"
            >
              {sidebarOpen ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
            </Button>
            <h1 className="flex-1 text-sm font-medium truncate text-center md:text-left">
              {activeTitle}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 md:hidden"
              onClick={handleNewChat}
              aria-label="Nouvelle discussion"
            >
              <Plus className="size-5" />
            </Button>
          </div>

          <DropZone onDrop={handleAttach} disabled={isStreaming} className="flex-1 flex flex-col min-h-0">
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
              <div className="max-w-3xl mx-auto px-3 md:px-4 py-4 md:py-6 space-y-4 md:space-y-6">
                {messages.length === 0 && (
                  <div className="min-h-[55vh] flex flex-col items-center justify-center text-center px-2">
                    <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
                      <Sparkles className="size-8 text-primary" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-semibold mb-2">Bonjour 👋</h2>
                    <p className="text-sm md:text-base text-muted-foreground max-w-md mb-6">
                      Pose-moi n'importe quelle question ou demande-moi un coup de main.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setInput(s);
                            textareaRef.current?.focus();
                          }}
                          className="text-left text-sm p-3 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/5 active:bg-primary/10 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex w-full",
                      msg.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    {msg.role === "user" ? (
                      <div className="max-w-[85%] md:max-w-[80%] rounded-2xl px-4 py-2.5 bg-primary text-primary-foreground">
                        <div className="prose prose-sm prose-invert max-w-none prose-p:my-1">
                          <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-full w-full">
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-pre:my-2">
                          <ReactMarkdown components={markdownComponents}>{msg.content || ""}</ReactMarkdown>
                          {msg.pending && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                              <Loader2 className="size-3 animate-spin" /> Elena réfléchit…
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                    ⚠️ {error}
                  </div>
                )}
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t border-border/60 bg-background/80 backdrop-blur pb-[env(safe-area-inset-bottom)]"
            >
              <div className="max-w-3xl mx-auto px-3 md:px-4 py-2.5 md:py-3">
                <AttachmentChips
                  items={attachments}
                  onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
                />
                <div className="flex gap-2 items-end rounded-2xl border border-border/60 bg-background p-2 shadow-sm focus-within:border-primary/50 transition-colors">
                  <AttachButton onPick={handleAttach} disabled={isStreaming} />
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Écris à Elena…"
                    rows={1}
                    className="resize-none flex-1 min-h-[40px] max-h-[160px] border-0 focus-visible:ring-0 shadow-none bg-transparent px-1 py-2 text-base md:text-sm"
                    disabled={isStreaming}
                  />
                  {isStreaming ? (
                    <Button type="button" variant="outline" onClick={stop} size="icon" className="h-10 w-10 shrink-0">
                      <Square className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      disabled={!input.trim() && attachments.length === 0}
                    >
                      <Send className="size-4" />
                    </Button>
                  )}
                </div>
                <p className="hidden md:block text-[11px] text-muted-foreground mt-2 text-center">
                  Pour des actions concrètes (créer un projet, intégrer un service),{" "}
                  <a href="/dev" className="text-primary hover:underline">passe par l'espace Dev</a>.
                </p>
              </div>
            </form>
          </DropZone>
        </main>
      </div>
    </div>
  );
}
