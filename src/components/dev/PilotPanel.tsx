/**
 * PilotPanel — Tableau de pilotage du projet (Chantier 3 v2).
 * UI CRUD légère sur pilot_categories + pilot_steps + pilot_items + bouton autopilote.
 * Source de vérité = Lovable Cloud (DB).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  CircleDot,
  CircleCheck,
  CircleAlert,
  Loader2,
  ClipboardCopy,
  Sparkles,
  Play,
  Square,
  CheckSquare,
} from "lucide-react";

type PilotStatus = Database["public"]["Enums"]["pilot_status"];
type Category = Database["public"]["Tables"]["pilot_categories"]["Row"];
type Step = Database["public"]["Tables"]["pilot_steps"]["Row"];
type Item = Database["public"]["Tables"]["pilot_items"]["Row"];

type Props = {
  projectId: string | null;
  onCopyPrompt?: (text: string) => void;
};

const STATUS_META: Record<PilotStatus, { label: string; icon: typeof CircleDashed; cls: string }> = {
  todo: { label: "À faire", icon: CircleDashed, cls: "text-muted-foreground" },
  in_progress: { label: "En cours", icon: CircleDot, cls: "text-glow-blue" },
  done: { label: "Terminé", icon: CircleCheck, cls: "text-emerald-400" },
  blocked: { label: "Bloqué", icon: CircleAlert, cls: "text-amber-400" },
};

const NEXT_STATUS: Record<PilotStatus, PilotStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
  blocked: "todo",
};

export function PilotPanel({ projectId, onCopyPrompt }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [newCatTitle, setNewCatTitle] = useState("");
  const [activeSection, setActiveSection] = useState<"elena" | "nexyra">("elena");
  const [showFrozen, setShowFrozen] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) {
      setCategories([]);
      setSteps([]);
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const [
        { data: cats, error: catErr },
        { data: stp, error: stpErr },
        { data: itm, error: itmErr },
      ] = await Promise.all([
        supabase.from("pilot_categories").select("*").eq("project_id", projectId).order("position"),
        supabase.from("pilot_steps").select("*").eq("project_id", projectId).order("position"),
        supabase.from("pilot_items").select("*").eq("project_id", projectId).order("position"),
      ]);
      if (catErr) throw catErr;
      if (stpErr) throw stpErr;
      if (itmErr) throw itmErr;
      setCategories((cats ?? []) as Category[]);
      setSteps((stp ?? []) as Step[]);
      setItems((itm ?? []) as Item[]);
      const inProg = new Set((stp ?? []).filter((s) => s.status === "in_progress").map((s) => s.category_id));
      setExpandedCats((prev) => {
        const next = { ...prev };
        for (const id of inProg) next[id] = true;
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur chargement pilotage";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const stepsByCat = useMemo(() => {
    const map = new Map<string, Step[]>();
    for (const s of steps) {
      const arr = map.get(s.category_id) ?? [];
      arr.push(s);
      map.set(s.category_id, arr);
    }
    return map;
  }, [steps]);

  const itemsByStep = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const arr = map.get(it.step_id) ?? [];
      arr.push(it);
      map.set(it.step_id, arr);
    }
    return map;
  }, [items]);

  const totalCost = useMemo(() => {
    let sum = 0;
    for (const c of categories) {
      const stepsCost = (stepsByCat.get(c.id) ?? []).reduce(
        (s, x) => s + Number(x.estimated_cost_usd ?? 0),
        0,
      );
      sum += Number(c.estimated_cost_usd ?? 0) || stepsCost;
    }
    return sum;
  }, [categories, stepsByCat]);

  // ---------- Mutations ----------
  const addCategory = async () => {
    if (!projectId || !newCatTitle.trim()) return;
    const { data: orgRow } = await supabase
      .from("projects")
      .select("org_id, owner_id")
      .eq("id", projectId)
      .single();
    if (!orgRow) {
      toast.error("Projet introuvable");
      return;
    }
    const { error } = await supabase.from("pilot_categories").insert({
      project_id: projectId,
      org_id: orgRow.org_id,
      owner_id: orgRow.owner_id,
      title: newCatTitle.trim(),
      position: categories.length,
      section: activeSection,
      priority: "P1",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewCatTitle("");
    load();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Supprimer cette catégorie et ses étapes ?")) return;
    // On supprime aussi les steps + items en cascade côté app (FK ON DELETE CASCADE pour items, manuel pour steps)
    await supabase.from("pilot_steps").delete().eq("category_id", id);
    const { error } = await supabase.from("pilot_categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const addStep = async (cat: Category) => {
    const title = prompt("Titre de l'étape ?")?.trim();
    if (!title) return;
    const existing = stepsByCat.get(cat.id) ?? [];
    const { error } = await supabase.from("pilot_steps").insert({
      project_id: cat.project_id,
      org_id: cat.org_id,
      category_id: cat.id,
      title,
      position: existing.length,
    });
    if (error) toast.error(error.message);
    else load();
  };

  const deleteStep = async (id: string) => {
    const { error } = await supabase.from("pilot_steps").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const cycleStatus = async (step: Step) => {
    const next = NEXT_STATUS[step.status as PilotStatus];
    const patch: Partial<Step> = { status: next };
    if (next === "in_progress" && !step.started_at) patch.started_at = new Date().toISOString();
    if (next === "done") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("pilot_steps").update(patch).eq("id", step.id);
    if (error) toast.error(error.message);
    else load();
  };

  const updateStepCost = async (step: Step, value: string) => {
    const num = value === "" ? null : Number(value);
    if (num != null && Number.isNaN(num)) return;
    const { error } = await supabase
      .from("pilot_steps")
      .update({ estimated_cost_usd: num })
      .eq("id", step.id);
    if (error) toast.error(error.message);
    else load();
  };

  // 🆕 LOT A — Owner per pilot step : 'auto' (Elena décide), 'elena' (toujours Elena), 'human' (toi).
  const updateOwnerMode = async (step: Step, mode: "auto" | "elena" | "human") => {
    const { error } = await supabase
      .from("pilot_steps")
      .update({ owner_mode: mode })
      .eq("id", step.id);
    if (error) toast.error(error.message);
    else load();
  };

  const updateCatCost = async (cat: Category, value: string) => {
    const num = value === "" ? null : Number(value);
    if (num != null && Number.isNaN(num)) return;
    const { error } = await supabase
      .from("pilot_categories")
      .update({ estimated_cost_usd: num })
      .eq("id", cat.id);
    if (error) toast.error(error.message);
    else load();
  };

  // Cycle priorité catégorie : P0 → P1 → gel → P0
  const cyclePriority = async (cat: Category) => {
    const next = cat.priority === "P0" ? "P1" : cat.priority === "P1" ? "gel" : "P0";
    const { error } = await supabase
      .from("pilot_categories")
      .update({ priority: next })
      .eq("id", cat.id);
    if (error) toast.error(error.message);
    else load();
  };
  const addItem = async (step: Step) => {
    const title = prompt("Nouvelle sous-fiche / composant ?")?.trim();
    if (!title) return;
    const existing = itemsByStep.get(step.id) ?? [];
    const { error } = await supabase.from("pilot_items").insert({
      project_id: step.project_id,
      org_id: step.org_id,
      step_id: step.id,
      title,
      position: existing.length,
    });
    if (error) toast.error(error.message);
    else load();
  };
  const toggleItem = async (it: Item) => {
    const { error } = await supabase.from("pilot_items").update({ done: !it.done }).eq("id", it.id);
    if (error) toast.error(error.message);
    else load();
  };
  const deleteItem = async (id: string) => {
    const { error } = await supabase.from("pilot_items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  // --- Prompt helpers ---
  const buildStepPrompt = (cat: Category, step: Step, mode: "copy" | "launch") => {
    const stepItems = itemsByStep.get(step.id) ?? [];
    const itemsBlock = stepItems.length
      ? `\n\nSous-fiches à traiter :\n${stepItems.map((i) => `- ${i.done ? "[x]" : "[ ]"} ${i.title}`).join("\n")}`
      : "";
    if (mode === "launch") {
      return `🚀 LANCE l'étape "${step.title}" (catégorie ${cat.title}).\n${
        step.description ? `Détails : ${step.description}\n` : ""
      }${itemsBlock}\n\nMode autopilote : annonce ce que tu vas faire (1 phrase), exécute, puis fais une mini-synthèse de fin d'étape "✅ Étape ${step.title} terminée. Je passe à la suivante".`;
    }
    return `Travaille sur l'étape "${step.title}" (catégorie ${cat.title}).${
      step.description ? `\nDétails : ${step.description}` : ""
    }${itemsBlock}\n\nAnnonce ce que tu vas faire, demande GO, exécute, puis rends compte.`;
  };

  const copyStepPrompt = (cat: Category, step: Step) => {
    const text = buildStepPrompt(cat, step, "copy");
    if (onCopyPrompt) {
      onCopyPrompt(text);
      toast.success("Prompt injecté dans le chat");
    } else {
      navigator.clipboard.writeText(text).then(() => toast.success("Prompt copié"));
    }
  };

  const launchStep = async (cat: Category, step: Step) => {
    // Marque in_progress + injecte prompt dans le chat
    if (step.status !== "in_progress") {
      await supabase
        .from("pilot_steps")
        .update({
          status: "in_progress",
          started_at: step.started_at ?? new Date().toISOString(),
        })
        .eq("id", step.id);
    }
    // Chantier 5 — persiste l'étape active côté serveur pour qu'Elena la retrouve
    // après une question annexe et reprenne automatiquement.
    await supabase.from("pilot_state").upsert(
      {
        project_id: cat.project_id,
        org_id: cat.org_id,
        current_step_id: step.id,
        current_category_id: cat.id,
        autopilot_enabled: true,
        last_action: `launched:${step.title}`,
      },
      { onConflict: "project_id" },
    );
    const text = buildStepPrompt(cat, step, "launch");
    if (onCopyPrompt) {
      onCopyPrompt(text);
      toast.success(`▶ Étape lancée : "${step.title}"`);
    } else {
      navigator.clipboard.writeText(text).then(() => toast.success("Prompt copié"));
    }
    load();
  };

  // --- Suggérer un plan via Lovable AI Gateway ---
  const suggestPlan = async () => {
    if (!projectId) return;
    setSuggesting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const tok = session?.session?.access_token;
      if (!tok) {
        toast.error("Session expirée");
        return;
      }
      const res = await fetch("/api/pilot-suggest", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tok}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project_id: projectId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Échec de la suggestion");
        return;
      }
      toast.success(`✨ ${json.categories_added} catégories + ${json.steps_added} étapes ajoutées`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSuggesting(false);
    }
  };

  // ---------- Render ----------
  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Sélectionne un projet pour activer son tableau de pilotage.
      </div>
    );
  }

  // Filtrage par section + tri par priorité (P0 → P1 → gel)
  const PRIO_ORDER = { P0: 0, P1: 1, gel: 2 } as const;
  const elenaCount = categories.filter((c) => c.section === "elena").length;
  const nexyraCount = categories.filter((c) => c.section === "nexyra").length;
  const visibleCategories = categories
    .filter((c) => c.section === activeSection)
    .filter((c) => showFrozen || c.priority !== "gel")
    .sort((a, b) => {
      const pa = PRIO_ORDER[a.priority as keyof typeof PRIO_ORDER] ?? 9;
      const pb = PRIO_ORDER[b.priority as keyof typeof PRIO_ORDER] ?? 9;
      if (pa !== pb) return pa - pb;
      return a.position - b.position;
    });

  const PRIO_META: Record<string, { label: string; cls: string }> = {
    P0: { label: "P0 · Maintenant", cls: "text-rose-300 bg-rose-500/15 border-rose-500/30" },
    P1: { label: "P1 · Ensuite", cls: "text-amber-300 bg-amber-500/15 border-amber-500/30" },
    gel: { label: "Gelé · Parking", cls: "text-muted-foreground bg-muted/20 border-border/30" },
  };

  // Groupage par priorité pour les en-têtes
  const groupedByPrio = visibleCategories.reduce<Record<string, Category[]>>((acc, c) => {
    const k = c.priority as string;
    (acc[k] ||= []).push(c);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/30 px-4 py-2.5">
        <div>
          <div className="text-sm font-semibold text-foreground">Tableau de pilotage</div>
          <div className="text-[11px] text-muted-foreground">
            {visibleCategories.length} catégorie{visibleCategories.length > 1 ? "s" : ""} affichée{visibleCategories.length > 1 ? "s" : ""} · coût total{" "}
            <span className="font-mono text-foreground">${totalCost.toFixed(2)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button
            onClick={suggestPlan}
            disabled={suggesting}
            className="flex h-7 items-center gap-1 rounded-md bg-[image:var(--gradient-primary)] px-2.5 text-xs font-medium text-white shadow-[0_0_12px_rgba(139,92,246,0.3)] transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
            title="Génère un plan complet à partir du brief projet (via Elena)"
          >
            {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Suggérer un plan
          </button>
        </div>
      </div>

      {/* Tabs Elena | Nexyra */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border/30 bg-background/40 px-3 py-1.5">
        {(["elena", "nexyra"] as const).map((s) => {
          const active = activeSection === s;
          const count = s === "elena" ? elenaCount : nexyraCount;
          return (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-[image:var(--gradient-primary)] text-white shadow-[0_0_8px_rgba(139,92,246,0.25)]"
                  : "text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
              }`}
            >
              {s === "elena" ? "🤖 Elena (moteur)" : "💼 Nexyra (commercial)"}
              <span className="ml-1.5 opacity-70">({count})</span>
            </button>
          );
        })}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={showFrozen}
            onChange={(e) => setShowFrozen(e.target.checked)}
            className="h-3 w-3"
          />
          Afficher gelés
        </label>
      </div>

      {/* Add category */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/20 bg-secondary/10 px-4 py-2">
        <input
          value={newCatTitle}
          onChange={(e) => setNewCatTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
          placeholder={`Nouvelle catégorie ${activeSection === "elena" ? "Elena" : "Nexyra"}…`}
          className="flex-1 rounded-md border border-border/30 bg-background/40 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-glow-violet/40 focus:outline-none"
        />
        <button
          onClick={addCategory}
          disabled={!newCatTitle.trim()}
          className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-[image:var(--gradient-primary)] px-2.5 text-xs font-medium text-white disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          Ajouter
        </button>
      </div>

      {/* Categories list — groupées par priorité */}
      <div className="flex-1 overflow-y-auto p-3">
        {visibleCategories.length === 0 && !loading && (
          <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
            <div className="max-w-xs space-y-2">
              <p>Aucune catégorie {activeSection === "elena" ? "Elena" : "Nexyra"} visible.</p>
              <p className="text-[11px]">
                Ajoute-en une ci-dessus, ou coche « Afficher gelés » si tu cherches une cat archivée.
              </p>
            </div>
          </div>
        )}

        {(["P0", "P1", "gel"] as const).map((prio) => {
          const group = groupedByPrio[prio];
          if (!group || group.length === 0) return null;
          const meta = PRIO_META[prio];
          return (
            <div key={prio} className="mb-4 last:mb-0">
              <div className={`mb-2 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.cls}`}>
                {meta.label} · {group.length}
              </div>
              <ul className="space-y-2">
          {group.map((cat) => {
            const catSteps = stepsByCat.get(cat.id) ?? [];
            const isOpen = expandedCats[cat.id] ?? false;
            const stepsCost = catSteps.reduce((s, x) => s + Number(x.estimated_cost_usd ?? 0), 0);
            const displayCost = Number(cat.estimated_cost_usd ?? 0) || stepsCost;
            const done = catSteps.filter((s) => s.status === "done").length;
            return (
              <li key={cat.id} className="rounded-lg border border-border/30 bg-secondary/10">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => setExpandedCats((p) => ({ ...p, [cat.id]: !isOpen }))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{cat.title}</span>
                      <span className="rounded-full bg-glow-violet/15 px-1.5 py-0.5 font-mono text-[10px] text-glow-violet">
                        ${displayCost.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {catSteps.length} étape{catSteps.length > 1 ? "s" : ""} · {done} terminée
                      {done > 1 ? "s" : ""}
                    </div>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={cat.estimated_cost_usd ?? ""}
                    onBlur={(e) => updateCatCost(cat, e.target.value)}
                    placeholder="$"
                    className="h-7 w-16 rounded-md border border-border/30 bg-background/40 px-2 text-right font-mono text-[11px] focus:border-glow-violet/40 focus:outline-none"
                  />
                  <button
                    onClick={() => addStep(cat)}
                    className="flex h-7 items-center gap-1 rounded-md border border-border/30 bg-secondary/30 px-2 text-[11px] text-foreground hover:border-glow-blue/40 hover:text-glow-blue"
                  >
                    <Plus className="h-3 w-3" />
                    Étape
                  </button>
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="rounded-md p-1 text-muted-foreground hover:text-red-400"
                    title="Supprimer la catégorie"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {isOpen && (
                  <ul className="space-y-1 border-t border-border/20 bg-background/30 px-2 py-2">
                    {catSteps.length === 0 && (
                      <li className="py-2 text-center text-[11px] text-muted-foreground">
                        Aucune étape. Clique sur « Étape » pour en ajouter.
                      </li>
                    )}
                    {catSteps.map((step) => {
                      const meta = STATUS_META[step.status as PilotStatus];
                      const Icon = meta.icon;
                      const stepItems = itemsByStep.get(step.id) ?? [];
                      const stepOpen = expandedSteps[step.id] ?? false;
                      const itemsDone = stepItems.filter((i) => i.done).length;
                      return (
                        <li key={step.id} className="rounded-md hover:bg-secondary/20">
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            <button
                              onClick={() => cycleStatus(step)}
                              className={`shrink-0 ${meta.cls}`}
                              title={`Statut : ${meta.label} (clic pour cycler)`}
                            >
                              <Icon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setExpandedSteps((p) => ({ ...p, [step.id]: !stepOpen }))}
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                              title={stepOpen ? "Masquer sous-fiches" : "Afficher sous-fiches"}
                            >
                              {stepOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-xs text-foreground">{step.title}</div>
                              {(step.summary || stepItems.length > 0) && (
                                <div className="truncate text-[10px] text-muted-foreground">
                                  {step.summary
                                    ? step.summary
                                    : `${stepItems.length} sous-fiche${stepItems.length > 1 ? "s" : ""} · ${itemsDone} faite${itemsDone > 1 ? "s" : ""}`}
                                </div>
                              )}
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={step.estimated_cost_usd ?? ""}
                              onBlur={(e) => updateStepCost(step, e.target.value)}
                              placeholder="$"
                              className="h-6 w-14 rounded-md border border-border/20 bg-background/40 px-1.5 text-right font-mono text-[10px] focus:border-glow-blue/40 focus:outline-none"
                            />
                            {/* 🆕 LOT A — Owner per step : Auto / Elena / Humain */}
                            <div className="flex shrink-0 overflow-hidden rounded-md border border-border/20 text-[9px] font-medium uppercase">
                              {(["auto", "elena", "human"] as const).map((m) => {
                                const active = (step.owner_mode ?? "auto") === m;
                                const label = m === "auto" ? "A" : m === "elena" ? "E" : "H";
                                const title =
                                  m === "auto"
                                    ? "Auto — Elena décide selon le contexte"
                                    : m === "elena"
                                      ? "Elena — toujours l'agent"
                                      : "Humain — tu prends en main";
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    title={title}
                                    onClick={() => updateOwnerMode(step, m)}
                                    className={`px-1.5 py-0.5 transition ${
                                      active
                                        ? m === "elena"
                                          ? "bg-glow-blue/20 text-glow-blue"
                                          : m === "human"
                                            ? "bg-amber-500/20 text-amber-300"
                                            : "bg-secondary/40 text-foreground"
                                        : "text-muted-foreground hover:bg-secondary/30"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              onClick={() => launchStep(cat, step)}
                              className="rounded-md p-1 text-glow-blue hover:bg-glow-blue/10"
                              title="▶ Lancer l'étape (autopilote)"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => copyStepPrompt(cat, step)}
                              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                              title="Copier prompt étape (mode questions)"
                            >
                              <ClipboardCopy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteStep(step.id)}
                              className="rounded-md p-1 text-muted-foreground hover:text-red-400"
                              title="Supprimer l'étape"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>

                          {stepOpen && (
                            <ul className="ml-8 mr-2 mb-2 space-y-0.5 border-l border-border/20 pl-3">
                              {stepItems.length === 0 && (
                                <li className="py-1 text-[10px] text-muted-foreground">
                                  Aucune sous-fiche.
                                </li>
                              )}
                              {stepItems.map((it) => (
                                <li key={it.id} className="flex items-center gap-1.5 py-0.5">
                                  <button
                                    onClick={() => toggleItem(it)}
                                    className={it.done ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"}
                                  >
                                    {it.done ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                                  </button>
                                  <span
                                    className={`flex-1 truncate text-[11px] ${it.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                                  >
                                    {it.title}
                                  </span>
                                  <button
                                    onClick={() => deleteItem(it.id)}
                                    className="rounded p-0.5 text-muted-foreground hover:text-red-400"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </li>
                              ))}
                              <li>
                                <button
                                  onClick={() => addItem(step)}
                                  className="flex items-center gap-1 py-0.5 text-[10px] text-muted-foreground hover:text-glow-blue"
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                  Ajouter une sous-fiche
                                </button>
                              </li>
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
