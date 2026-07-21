import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Brain, Plus, Trash2, X, Save, Sparkles, FileText, Pin, PinOff, Compass, RefreshCw } from "lucide-react";
import { getWorkspaceMemory, updateWorkspaceMemory } from "@/lib/workspace-memory.functions";

type Doc = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
};

type MemoryKind = "core" | "design" | "constraint" | "preference" | "feature" | "reference";

type Memory = {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string;
  source: string;
  is_pinned: boolean;
  updated_at: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  orgId: string;
  ownerId: string;
}

const KIND_LABEL: Record<MemoryKind, string> = {
  core: "Core",
  design: "Design",
  constraint: "Refus / Interdit",
  preference: "Préférence",
  feature: "Métier",
  reference: "Référence",
};

const KIND_COLOR: Record<MemoryKind, string> = {
  core: "text-glow-violet border-glow-violet/40 bg-glow-violet/10",
  design: "text-pink-400 border-pink-400/40 bg-pink-400/10",
  constraint: "text-red-400 border-red-400/40 bg-red-400/10",
  preference: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  feature: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  reference: "text-amber-400 border-amber-400/40 bg-amber-400/10",
};

export function ProjectMemoryDrawer({ open, onClose, projectId, orgId, ownerId }: Props) {
  const [tab, setTab] = useState<"brief" | "rules" | "docs">("brief");

  // Brief Elena (workspace_memory) — ce qu'Elena se souvient automatiquement
  type BriefMem = {
    brief: string | null;
    sector: string | null;
    design_notes: string | null;
    tech_decisions: string[];
    open_todos: string[];
    delivered_files: string[];
    updated_at: string | null;
  };
  const [brief, setBrief] = useState<BriefMem | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const [briefDraft, setBriefDraft] = useState({ brief: "", sector: "", design_notes: "" });
  const fetchBrief = useServerFn(getWorkspaceMemory);
  const saveBriefFn = useServerFn(updateWorkspaceMemory);

  const loadBrief = async () => {
    setLoadingBrief(true);
    try {
      const r = await fetchBrief({ data: { workspaceId: projectId } });
      const m = r.memory;
      const b: BriefMem = {
        brief: m.brief,
        sector: m.sector,
        design_notes: m.design_notes,
        tech_decisions: m.tech_decisions,
        open_todos: m.open_todos,
        delivered_files: m.delivered_files,
        updated_at: m.updated_at,
      };
      setBrief(b);
      setBriefDraft({
        brief: b.brief ?? "",
        sector: b.sector ?? "",
        design_notes: b.design_notes ?? "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur chargement brief");
    } finally {
      setLoadingBrief(false);
    }
  };

  const saveBrief = async () => {
    setSavingBrief(true);
    try {
      const r = await saveBriefFn({
        data: {
          workspaceId: projectId,
          brief: briefDraft.brief.trim() || null,
          sector: briefDraft.sector.trim() || null,
          design_notes: briefDraft.design_notes.trim() || null,
        },
      });
      const m = r.memory;
      setBrief({
        brief: m.brief,
        sector: m.sector,
        design_notes: m.design_notes,
        tech_decisions: m.tech_decisions,
        open_todos: m.open_todos,
        delivered_files: m.delivered_files,
        updated_at: m.updated_at,
      });
      toast.success("Brief Elena mis à jour");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur sauvegarde");
    } finally {
      setSavingBrief(false);
    }
  };

  const removeTodo = async (idx: number) => {
    if (!brief) return;
    const next = brief.open_todos.filter((_, i) => i !== idx);
    try {
      await saveBriefFn({ data: { workspaceId: projectId, open_todos: next } });
      setBrief({ ...brief, open_todos: next });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const removeDecision = async (idx: number) => {
    if (!brief) return;
    const next = brief.tech_decisions.filter((_, i) => i !== idx);
    try {
      await saveBriefFn({ data: { workspaceId: projectId, tech_decisions: next } });
      setBrief({ ...brief, tech_decisions: next });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };


  // Notes RAG (project_docs)
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Doc | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");

  // Règles mémoire (project_memory)
  const [mems, setMems] = useState<Memory[]>([]);
  const [loadingMems, setLoadingMems] = useState(false);
  const [editingMem, setEditingMem] = useState<Memory | null>(null);
  const [memKind, setMemKind] = useState<MemoryKind>("preference");
  const [memTitle, setMemTitle] = useState("");
  const [memBody, setMemBody] = useState("");
  const [memPinned, setMemPinned] = useState(false);

  const loadDocs = async () => {
    setLoadingDocs(true);
    const { data, error } = await supabase
      .from("project_docs")
      .select("id, title, content, updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false });
    setLoadingDocs(false);
    if (error) toast.error(error.message);
    else setDocs(data ?? []);
  };

  const loadMems = async () => {
    setLoadingMems(true);
    const { data, error } = await supabase
      .from("project_memory")
      .select("id, kind, title, body, source, is_pinned, updated_at")
      .eq("project_id", projectId)
      .is("archived_at", null)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    setLoadingMems(false);
    if (error) toast.error(error.message);
    else setMems((data ?? []) as Memory[]);
  };

  useEffect(() => {
    if (open && projectId) {
      void loadDocs();
      void loadMems();
      void loadBrief();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  // ---- Notes RAG ----
  const startNewDoc = () => {
    setEditingDoc({ id: "", title: "", content: "", updated_at: "" });
    setDocTitle("");
    setDocContent("");
  };

  const startEditDoc = (d: Doc) => {
    setEditingDoc(d);
    setDocTitle(d.title);
    setDocContent(d.content);
  };

  const triggerEmbedding = async (docId: string) => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const tok = sess?.session?.access_token;
      if (!tok) return;
      await fetch("/api/embed-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ doc_id: docId }),
      });
    } catch (e) {
      console.warn("embed trigger failed", e);
    }
  };

  const saveDoc = async () => {
    if (!docTitle.trim() || !docContent.trim()) {
      toast.error("Titre et contenu requis");
      return;
    }
    let savedId = editingDoc?.id ?? "";
    if (editingDoc?.id) {
      const { error } = await supabase
        .from("project_docs")
        .update({ title: docTitle, content: docContent })
        .eq("id", editingDoc.id);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase
        .from("project_docs")
        .insert({ project_id: projectId, org_id: orgId, owner_id: ownerId, title: docTitle, content: docContent })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      savedId = data.id;
    }
    toast.success("Note enregistrée");
    setEditingDoc(null);
    void loadDocs();
    if (savedId) void triggerEmbedding(savedId);
  };

  const removeDoc = async (id: string) => {
    if (!confirm("Supprimer cette note ?")) return;
    const { error } = await supabase.from("project_docs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void loadDocs();
  };

  // ---- Règles mémoire ----
  const startNewMem = () => {
    setEditingMem({ id: "", kind: "preference", title: "", body: "", source: "manual", is_pinned: false, updated_at: "" });
    setMemKind("preference");
    setMemTitle("");
    setMemBody("");
    setMemPinned(false);
  };

  const startEditMem = (m: Memory) => {
    setEditingMem(m);
    setMemKind(m.kind);
    setMemTitle(m.title);
    setMemBody(m.body);
    setMemPinned(m.is_pinned);
  };

  const saveMem = async () => {
    if (!memTitle.trim() || !memBody.trim()) {
      toast.error("Titre et règle requis");
      return;
    }
    if (editingMem?.id) {
      const { error } = await supabase
        .from("project_memory")
        .update({ kind: memKind, title: memTitle, body: memBody, is_pinned: memPinned })
        .eq("id", editingMem.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("project_memory").insert({
        project_id: projectId,
        org_id: orgId,
        owner_id: ownerId,
        kind: memKind,
        title: memTitle,
        body: memBody,
        source: "manual",
        is_pinned: memPinned,
      });
      if (error) return toast.error(error.message);
    }
    toast.success("Règle mémoire enregistrée");
    setEditingMem(null);
    void loadMems();
  };

  const togglePin = async (m: Memory) => {
    const { error } = await supabase
      .from("project_memory")
      .update({ is_pinned: !m.is_pinned })
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    void loadMems();
  };

  const archiveMem = async (id: string) => {
    if (!confirm("Archiver cette règle ?")) return;
    const { error } = await supabase
      .from("project_memory")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    void loadMems();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="flex h-full w-[520px] flex-col border-l border-border/40 bg-background/95 backdrop-blur-xl">
        <header className="flex items-center justify-between border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-glow-violet" />
            <h2 className="text-sm font-semibold">Mémoire projet</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>

        <nav className="flex border-b border-border/30 px-2 pt-2">
          <button
            onClick={() => { setTab("brief"); setEditingMem(null); setEditingDoc(null); }}
            className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors ${
              tab === "brief" ? "bg-secondary/30 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            Brief Elena
          </button>
          <button
            onClick={() => { setTab("rules"); setEditingDoc(null); }}
            className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors ${
              tab === "rules" ? "bg-secondary/30 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Règles ({mems.length})
          </button>
          <button
            onClick={() => { setTab("docs"); setEditingMem(null); }}
            className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors ${
              tab === "docs" ? "bg-secondary/30 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Notes ({docs.length})
          </button>
        </nav>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "brief" ? (
            <div className="space-y-4">
              <div className="rounded-md border border-glow-violet/20 bg-glow-violet/5 p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">À quoi ça sert ?</p>
                Ce que Elena se souvient automatiquement de ton projet. Si elle dérive (mauvais secteur, mauvaise ambiance, oublie un détail), corrige ici — elle s'y référera au prochain message.
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {brief?.updated_at ? `Mis à jour ${new Date(brief.updated_at).toLocaleString("fr-FR")}` : "Pas encore de brief"}
                </span>
                <button
                  onClick={loadBrief}
                  disabled={loadingBrief}
                  className="flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                  title="Recharger"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingBrief ? "animate-spin" : ""}`} />
                  Recharger
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Brief du projet
                </label>
                <textarea
                  value={briefDraft.brief}
                  onChange={(e) => setBriefDraft({ ...briefDraft, brief: e.target.value })}
                  placeholder="Ex: SaaS d'automation pour vendeurs Vinted, inspiré Bleam, cible pros e-commerce"
                  rows={4}
                  maxLength={4000}
                  className="w-full resize-none rounded-md border border-border/40 bg-secondary/20 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-glow-violet/40"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Secteur / domaine
                </label>
                <input
                  value={briefDraft.sector}
                  onChange={(e) => setBriefDraft({ ...briefDraft, sector: e.target.value })}
                  placeholder="Ex: SaaS B2B, coaching, restauration, immobilier…"
                  maxLength={500}
                  className="w-full rounded-md border border-border/40 bg-secondary/20 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-glow-violet/40"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Design notes (ambiance, couleurs, références)
                </label>
                <textarea
                  value={briefDraft.design_notes}
                  onChange={(e) => setBriefDraft({ ...briefDraft, design_notes: e.target.value })}
                  placeholder="Ex: dark premium orange/cyan, glassmorphism, Inter, inspiré Linear/Vercel"
                  rows={3}
                  maxLength={4000}
                  className="w-full resize-none rounded-md border border-border/40 bg-secondary/20 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-glow-violet/40"
                />
              </div>

              <button
                onClick={saveBrief}
                disabled={savingBrief}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[image:var(--gradient-primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                {savingBrief ? "Enregistrement…" : "Enregistrer le brief"}
              </button>

              {brief && brief.tech_decisions.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-medium text-foreground">Décisions techniques ({brief.tech_decisions.length})</h3>
                  </div>
                  <ul className="space-y-1">
                    {brief.tech_decisions.map((d, i) => (
                      <li key={i} className="group flex items-start gap-2 rounded border border-border/30 bg-secondary/10 px-2 py-1.5 text-xs">
                        <span className="flex-1 text-muted-foreground">{d}</span>
                        <button onClick={() => removeDecision(i)} className="opacity-0 transition-opacity group-hover:opacity-100">
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {brief && brief.open_todos.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-medium text-foreground">TODO en cours ({brief.open_todos.length})</h3>
                  </div>
                  <ul className="space-y-1">
                    {brief.open_todos.map((t, i) => (
                      <li key={i} className="group flex items-start gap-2 rounded border border-border/30 bg-secondary/10 px-2 py-1.5 text-xs">
                        <span className="flex-1 text-muted-foreground">• {t}</span>
                        <button onClick={() => removeTodo(i)} className="opacity-0 transition-opacity group-hover:opacity-100" title="Marquer fait">
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {brief && brief.delivered_files.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Fichiers déjà livrés ({brief.delivered_files.length})
                  </summary>
                  <ul className="mt-2 space-y-0.5 pl-3">
                    {brief.delivered_files.slice(-30).map((f, i) => (
                      <li key={i} className="font-mono text-[10px] text-muted-foreground">{f}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : tab === "rules" ? (
            editingMem ? (
              <div className="space-y-3">
                <select
                  value={memKind}
                  onChange={(e) => setMemKind(e.target.value as MemoryKind)}
                  className="w-full rounded-md border border-border/40 bg-secondary/20 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-glow-violet/40"
                >
                  {(Object.keys(KIND_LABEL) as MemoryKind[]).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
                <input
                  value={memTitle}
                  onChange={(e) => setMemTitle(e.target.value)}
                  placeholder="Titre court (ex: Pas de Hero violet)"
                  maxLength={200}
                  className="w-full rounded-md border border-border/40 bg-secondary/20 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-glow-violet/40"
                />
                <textarea
                  value={memBody}
                  onChange={(e) => setMemBody(e.target.value)}
                  placeholder={"La règle en 1-3 phrases.\nAjoute « Pourquoi : … » si pertinent."}
                  rows={6}
                  maxLength={2000}
                  className="w-full resize-none rounded-md border border-border/40 bg-secondary/20 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-glow-violet/40"
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={memPinned}
                    onChange={(e) => setMemPinned(e.target.checked)}
                  />
                  Épinglé (toujours injecté en core)
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={saveMem}
                    className="flex items-center gap-1.5 rounded-md bg-[image:var(--gradient-primary)] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <Save className="h-3 w-3" />
                    Enregistrer
                  </button>
                  <button
                    onClick={() => setEditingMem(null)}
                    className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={startNewMem}
                  className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-glow-violet/40 py-2 text-xs text-glow-violet hover:bg-glow-violet/5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter une règle
                </button>
                {loadingMems && <p className="text-center text-xs text-muted-foreground">Chargement…</p>}
                {!loadingMems && mems.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground">
                    Aucune règle. Elena en sauvegardera automatiquement quand tu exprimes un refus, une préférence ou une décision design.
                  </p>
                )}
                <ul className="space-y-2">
                  {mems.map((m) => (
                    <li
                      key={m.id}
                      className="group rounded-md border border-border/30 bg-secondary/10 p-3 transition-colors hover:border-glow-violet/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => startEditMem(m)} className="flex-1 text-left">
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${KIND_COLOR[m.kind]}`}>
                              {KIND_LABEL[m.kind]}
                            </span>
                            {m.source === "agent_auto" && (
                              <span className="rounded border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                auto
                              </span>
                            )}
                            {m.is_pinned && <Pin className="h-3 w-3 text-glow-violet" />}
                          </div>
                          <h3 className="text-sm font-medium text-foreground">{m.title}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">{m.body}</p>
                        </button>
                        <div className="flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button onClick={() => togglePin(m)} title={m.is_pinned ? "Désépingler" : "Épingler"}>
                            {m.is_pinned ? (
                              <PinOff className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            ) : (
                              <Pin className="h-3.5 w-3.5 text-muted-foreground hover:text-glow-violet" />
                            )}
                          </button>
                          <button onClick={() => archiveMem(m.id)} title="Archiver">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : editingDoc ? (
            <div className="space-y-3">
              <input
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Titre (ex: Conventions React)"
                className="w-full rounded-md border border-border/40 bg-secondary/20 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-glow-violet/40"
              />
              <textarea
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                placeholder="Spécifications, conventions, contraintes métier, schémas, exemples de code…"
                rows={14}
                className="w-full resize-none rounded-md border border-border/40 bg-secondary/20 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-glow-violet/40"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveDoc}
                  className="flex items-center gap-1.5 rounded-md bg-[image:var(--gradient-primary)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  <Save className="h-3 w-3" />
                  Enregistrer
                </button>
                <button
                  onClick={() => setEditingDoc(null)}
                  className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={startNewDoc}
                className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-glow-violet/40 py-2 text-xs text-glow-violet hover:bg-glow-violet/5"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter une note
              </button>
              {loadingDocs && <p className="text-center text-xs text-muted-foreground">Chargement…</p>}
              {!loadingDocs && docs.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  Aucune note. Ajoute des specs longues, contenus de référence, schémas — Elena les retrouvera via RAG.
                </p>
              )}
              <ul className="space-y-2">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="group rounded-md border border-border/30 bg-secondary/10 p-3 transition-colors hover:border-glow-violet/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => startEditDoc(d)} className="flex-1 text-left">
                        <h3 className="text-sm font-medium text-foreground">{d.title}</h3>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.content}</p>
                      </button>
                      <button
                        onClick={() => removeDoc(d.id)}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
