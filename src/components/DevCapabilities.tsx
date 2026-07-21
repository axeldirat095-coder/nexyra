import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  X,
  Copy,
  Wand2,
  Info,
  Loader2,
  Layout,
  Brain,
  Workflow,
  Database,
  ShieldCheck,
  Code2,
  Coins,
  Smartphone,
  Activity,
  Megaphone,
  Store,
  Users,
  Sparkles,
  ArrowLeft,
  Play,
  CircleDashed,
  Pencil,
  Save,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";


// ============================================================
// Types miroir de la table public.capabilities
// ============================================================
type Status = "todo" | "in_progress" | "done";
type Priority = "P0" | "P1" | "P2";
type Effort = "S" | "M" | "L" | "XL";

type Capability = {
  id: string;
  category_id: string;
  category_label: string;
  category_icon: string;
  category_vision: string | null;
  title: string;
  info: string;
  status: Status;
  priority: Priority;
  effort: Effort;
  files: string[];
  position: number;
  completed_at: string | null;
  started_at: string | null;
};

type Category = {
  id: string;
  label: string;
  icon: string;
  vision: string;
  items: Capability[];
};

const ICON_MAP: Record<string, typeof Layout> = {
  Layout, Brain, Workflow, Database, ShieldCheck,
  Code2, Coins, Smartphone, Activity, Megaphone,
  Store, Users, Sparkles,
};

const CATEGORY_ACCENT: Record<string, string> = {
  ui: "text-glow-blue",
  ai: "text-glow-violet",
  api: "text-glow-blue",
  backend: "text-glow-violet",
  auth: "text-glow-blue",
  codegen: "text-glow-violet",
  credits: "text-glow-blue",
  mobile: "text-glow-violet",
  analytics: "text-glow-blue",
  marketing: "text-glow-violet",
  sales: "text-glow-blue",
  community: "text-glow-violet",
  quality: "text-glow-blue",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  P0: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  P1: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  P2: "bg-white/5 text-white/50 border-white/10",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  P0: "P0 · Critique",
  P1: "P1 · Important",
  P2: "P2 · Confort",
};

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };
const STATUS_RANK: Record<Status, number> = { in_progress: 0, todo: 1, done: 2 };

// ============================================================
// Prompts dynamiques
// ============================================================
function buildItemPrompt(item: Capability, cat: Category): string {
  const statusLabel =
    item.status === "done"
      ? "✅ DÉJÀ LIVRÉ — amélioration V2 demandée"
      : item.status === "in_progress"
      ? "🟠 EN COURS — finir/corriger ce qui est déjà commencé"
      : "❌ À CONSTRUIRE";

  const filesHint =
    item.files.length > 0
      ? `\n**Fichiers concernés :** ${item.files.join(", ")}`
      : "";

  const directive =
    item.status === "done"
      ? `Propose 3 axes d'amélioration V2 (UX / perf / robustesse), choisis le plus rentable, puis livre-le. Mets à jour le \`info\` de la ligne dans la table \`capabilities\`.`
      : item.status === "in_progress"
      ? `Reprends ce chantier en cours, identifie ce qui bloque, finis-le proprement et passe le statut à 'done' dans la table \`capabilities\`.`
      : `Construis cette ligne de bout en bout, puis passe son statut à 'done' et enrichis le \`info\` pour décrire ce que Nexyra sait désormais faire.`;

  return `# Nexyra · ${cat.label} · ${item.title}

**Statut actuel :** ${statusLabel}
**Priorité :** ${PRIORITY_LABEL[item.priority]} · Effort estimé : ${item.effort}
**Ce qui existe aujourd'hui :** ${item.info}${filesHint}

**Mission :**
${directive}

**Règles strictes (mode économie de crédits) :**
- Ne fais QUE ce qui est demandé. Pas de refonte cosmétique non sollicitée.
- Privilégie Lovable AI Gateway et Lovable Cloud avant toute brique externe.
- À la fin, mets à jour la ligne ${item.id} dans la table \`capabilities\` (status + info).`;
}

function buildCategoryPrompt(cat: Category): string {
  const total = cat.items.length;
  const done = cat.items.filter((i) => i.status === "done").length;
  const inProg = cat.items.filter((i) => i.status === "in_progress").length;
  const pct = Math.round((done / total) * 100);

  // On limite à 5 lignes max, par priorité, pour ne pas exploser le contexte
  const todoSorted = cat.items
    .filter((i) => i.status !== "done")
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.position - b.position
    );

  const top = todoSorted.slice(0, 5);
  const rest = todoSorted.length - top.length;

  const focusList =
    top.length === 0
      ? "   (catégorie 100% livrée — passe en mode V2)"
      : top
          .map((i) => `   ☐ [${i.priority} · ${i.effort}] ${i.title}`)
          .join("\n");

  const orientation =
    todoSorted.length === 0
      ? `Catégorie complète à 100%. Mission : choisis 3 améliorations V2 prioritaires (UX, perf, robustesse).`
      : pct >= 60
      ? `Catégorie bien avancée (${pct}%). Mission : finir les ${todoSorted.length} ligne(s) restantes en regroupant ce qui peut l'être (1 livraison = plusieurs lignes cochées).`
      : pct >= 30
      ? `Catégorie à mi-parcours (${pct}%). Mission : attaquer les ${Math.min(top.length, 3)} lignes prioritaires ci-dessous.`
      : `Catégorie en démarrage (${pct}%). Mission : poser une roadmap en 3 étapes claires avant tout code, puis attaquer la 1ère.`;

  const restNote =
    rest > 0
      ? `\n*(${rest} autre(s) ligne(s) restante(s) volontairement omises ici pour rester focalisé.)*`
      : "";

  const inProgNote =
    inProg > 0 ? `\n⚠️ ${inProg} ligne(s) déjà en cours — finir avant d'en démarrer d'autres.` : "";

  return `# CHANTIER NEXYRA — ${cat.label}

**Vision business :** ${cat.vision}

**État actuel : ${done}/${total} livrés (${pct}%)**${inProgNote}

🎯 Focus prioritaire (top 5 par priorité P0/P1/P2) :
${focusList}${restNote}

**Mission :**
${orientation}

**Règles strictes :**
- Regroupe les lignes proches en un seul lot (1 livraison = plusieurs cases cochées).
- Privilégie Lovable AI Gateway / Lovable Cloud avant toute API tierce.
- Pour chaque ligne livrée : passe le statut à 'done' dans la table \`capabilities\` et réécris son \`info\`.
- Pas de nouvelle dépendance sans justification.`;
}

// ============================================================
// Mutations DB
// ============================================================
async function updateStatus(id: string, status: Status) {
  const nowIso = new Date().toISOString();
  const patch =
    status === "in_progress"
      ? { status, started_at: nowIso, completed_at: null }
      : status === "done"
      ? { status, completed_at: nowIso }
      : { status, started_at: null, completed_at: null };
  const { error } = await supabase.from("capabilities").update(patch).eq("id", id);
  if (error) throw error;
}

// ============================================================
// Composant ligne
// ============================================================
function CapabilityRow({ item, cat }: { item: Capability; cat: Category }) {
  const [busy, setBusy] = useState(false);

  const cycle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next: Status =
        item.status === "todo"
          ? "in_progress"
          : item.status === "in_progress"
          ? "done"
          : "todo";
      await updateStatus(item.id, next);
      toast.success(
        next === "done" ? "Livré ✅" : next === "in_progress" ? "En cours 🟠" : "Remis à faire"
      );
    } catch {
      toast.error("Impossible de mettre à jour (lecture seule pour les visiteurs).");
    } finally {
      setBusy(false);
    }
  };

  const StatusIcon = busy
    ? Loader2
    : item.status === "done"
    ? Check
    : item.status === "in_progress"
    ? Play
    : X;

  const statusColor =
    item.status === "done"
      ? "text-emerald-400"
      : item.status === "in_progress"
      ? "text-amber-400"
      : "text-rose-400/80";

  const copyPrompt = () => {
    navigator.clipboard.writeText(buildItemPrompt(item, cat));
    toast.success(`Prompt copié : ${item.title}`);
  };

  return (
    <li className="flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-white/[0.04] transition-colors">
      <button
        onClick={cycle}
        title="Changer le statut (todo → en cours → livré)"
        className={`shrink-0 ${statusColor} hover:scale-110 transition-transform`}
      >
        <StatusIcon className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
      </button>

      <span
        className={`flex-1 text-sm ${
          item.status === "done"
            ? "text-white/85"
            : item.status === "in_progress"
            ? "text-amber-100/90"
            : "text-white/65"
        }`}
      >
        {item.title}
      </span>

      <span
        className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border ${PRIORITY_BADGE[item.priority]}`}
        title={PRIORITY_LABEL[item.priority]}
      >
        {item.priority}
      </span>

      <span
        className="shrink-0 text-[10px] text-white/40 font-mono w-5 text-center"
        title={`Effort estimé : ${item.effort}`}
      >
        {item.effort}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className="opacity-60 hover:opacity-100 transition-opacity p-1" aria-label="Info">
            <Info className="w-3.5 h-3.5 text-white/70" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs text-xs leading-relaxed">
          <p>{item.info}</p>
          {item.files.length > 0 && (
            <p className="mt-1.5 text-[10px] text-white/60 font-mono">
              📁 {item.files.join(" · ")}
            </p>
          )}
          {item.completed_at && (
            <p className="mt-1.5 text-[10px] text-emerald-300/80">
              ✅ Livré le {new Date(item.completed_at).toLocaleDateString("fr-FR")}
            </p>
          )}
        </TooltipContent>
      </Tooltip>

      <button
        onClick={copyPrompt}
        className="opacity-60 hover:opacity-100 transition-opacity p-1"
        title={
          item.status === "done"
            ? "Copier un prompt d'amélioration V2"
            : item.status === "in_progress"
            ? "Copier un prompt pour finir cette ligne"
            : "Copier un prompt pour me demander de la construire"
        }
        aria-label="Copier prompt"
      >
        <Copy className="w-3.5 h-3.5 text-white/70" />
      </button>
    </li>
  );
}

// ============================================================
// Composant catégorie
// ============================================================
function CategoryPromptDialog({
  category,
  customPrompt,
  onSave,
}: {
  category: Category;
  customPrompt: string | null;
  onSave: (prompt: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // À chaque ouverture, on recharge la valeur courante (custom si présent, sinon auto-généré)
  useEffect(() => {
    if (open) {
      setDraft(customPrompt ?? buildCategoryPrompt(category));
    }
  }, [open, customPrompt, category]);

  const isCustom = customPrompt !== null && customPrompt.trim().length > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs text-white/80 hover:text-white inline-flex items-center gap-1.5 transition-colors"
        title="Voir / éditer / copier le prompt de passation de cette catégorie"
      >
        <FileText className="w-3.5 h-3.5" />
        Prompt
        {isCustom && (
          <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" title="Prompt personnalisé" />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl bg-[#0F0F18] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-glow-blue" />
              Prompt de passation — {category.label}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Ce prompt est destiné à Elena. Édite-le pour qu'elle reprenne le chantier
              sans contexte manquant, puis copie-le quand tu veux relancer.
              {!isCustom && (
                <span className="block mt-1 text-amber-300/80 text-xs">
                  Aucun prompt personnalisé enregistré : voici l'auto-généré.
                  Édite-le et clique « Enregistrer » pour le verrouiller.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[400px] font-mono text-xs bg-black/40 border-white/10 text-white/90 resize-y"
          />

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(draft);
                toast.success("Prompt copié dans le presse-papier");
              }}
              className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copier
            </button>
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave(draft);
                  toast.success("Prompt enregistré");
                  setOpen(false);
                } catch (e: any) {
                  toast.error(`Erreur : ${e?.message ?? e}`);
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded-lg bg-gradient-to-r from-glow-blue to-glow-violet hover:opacity-90 px-4 py-2 text-xs text-white font-medium inline-flex items-center gap-1.5 transition-opacity disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Enregistrer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryCard({
  category,
  customPrompt,
  onSavePrompt,
}: {
  category: Category;
  customPrompt: string | null;
  onSavePrompt: (categoryId: string, prompt: string) => Promise<void>;
}) {
  const Icon = ICON_MAP[category.icon] ?? Layout;
  const accent = CATEGORY_ACCENT[category.id] ?? "text-glow-blue";
  const total = category.items.length;
  const done = category.items.filter((i) => i.status === "done").length;
  const inProg = category.items.filter((i) => i.status === "in_progress").length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 shrink-0">
            <Icon className={`w-6 h-6 ${accent}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-semibold text-white">{category.label}</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="opacity-50 hover:opacity-100 transition-opacity" aria-label="Vision">
                    <Info className="w-3.5 h-3.5 text-white/70" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
                  <strong className="text-white">Vision :</strong> {category.vision}
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-white/60 mt-0.5">
              {done}/{total} livrés
              {inProg > 0 && <span className="text-amber-300/90"> · {inProg} en cours</span>}
            </p>
          </div>
        </div>
        <CategoryPromptDialog
          category={category}
          customPrompt={customPrompt}
          onSave={(prompt) => onSavePrompt(category.id, prompt)}
        />
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between text-xs text-white/60 mb-1.5">
          <span>{pct}% complet</span>
          <span>{total - done} restant{total - done > 1 ? "s" : ""}</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      <ul className="space-y-1.5">
        {category.items.map((item) => (
          <CapabilityRow key={item.id} item={item} cat={category} />
        ))}
      </ul>
    </div>
  );
}


// ============================================================
// Page principale
// ============================================================
export function DevCapabilities() {
  const [rows, setRows] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "todo" | "in_progress" | "done">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");
  const [search, setSearch] = useState("");
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});

  // Chargement des prompts custom + realtime
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("category_prompts").select("*");
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      for (const row of data as { category_id: string; prompt: string }[]) {
        map[row.category_id] = row.prompt;
      }
      setCustomPrompts(map);
    })();

    const ch = supabase
      .channel("category-prompts-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "category_prompts" },
        (payload) => {
          setCustomPrompts((prev) => {
            const next = { ...prev };
            if (payload.eventType === "DELETE") {
              delete next[(payload.old as any).category_id];
            } else {
              const row = payload.new as { category_id: string; prompt: string };
              next[row.category_id] = row.prompt;
            }
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  const saveCategoryPrompt = async (categoryId: string, prompt: string) => {
    const { error } = await supabase
      .from("category_prompts")
      .upsert({ category_id: categoryId, prompt }, { onConflict: "category_id" });
    if (error) throw error;
  };


  // Initial load + realtime
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("capabilities")
        .select("*")
        .order("category_id")
        .order("position");
      if (cancelled) return;
      if (error) {
        toast.error("Erreur de chargement de la roadmap");
      } else if (data) {
        setRows(data as Capability[]);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel("capabilities-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "capabilities" },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") {
              return [...prev, payload.new as Capability];
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((r) =>
                r.id === (payload.new as Capability).id ? (payload.new as Capability) : r
              );
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((r) => r.id !== (payload.old as Capability).id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // Regroupement en catégories + filtres
  const categories = useMemo<Category[]>(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, Category>();
    for (const r of rows) {
      if (!map.has(r.category_id)) {
        map.set(r.category_id, {
          id: r.category_id,
          label: r.category_label,
          icon: r.category_icon,
          vision: r.category_vision ?? "",
          items: [],
        });
      }
      const passStatus = filter === "all" ? true : r.status === filter;
      const passPriority = priorityFilter === "all" ? true : r.priority === priorityFilter;
      const passSearch =
        q === "" ||
        r.title.toLowerCase().includes(q) ||
        r.info.toLowerCase().includes(q) ||
        r.category_label.toLowerCase().includes(q);
      if (passStatus && passPriority && passSearch) {
        map.get(r.category_id)!.items.push(r);
      }
    }
    return Array.from(map.values())
      .map((c) => ({
        ...c,
        items: c.items.sort(
          (a, b) =>
            STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            a.position - b.position
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [rows, filter, priorityFilter, search]);

  // Stats globales
  const totalAll = rows.length;
  const totalDone = rows.filter((r) => r.status === "done").length;
  const totalInProg = rows.filter((r) => r.status === "in_progress").length;
  const totalP0Open = rows.filter((r) => r.status !== "done" && r.priority === "P0").length;
  const globalPct = totalAll === 0 ? 0 : Math.round((totalDone / totalAll) * 100);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen relative bg-[#0A0A0F] text-white">
        {/* Fond étoilé */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.15),transparent_50%),radial-gradient(ellipse_at_bottom,rgba(139,92,246,0.12),transparent_50%)]" />
          <div className="absolute inset-0 opacity-30 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><circle cx=%2210%22 cy=%2220%22 r=%220.5%22 fill=%22white%22/><circle cx=%2280%22 cy=%2240%22 r=%220.5%22 fill=%22white%22/><circle cx=%2230%22 cy=%2270%22 r=%220.5%22 fill=%22white%22/><circle cx=%2260%22 cy=%2210%22 r=%220.5%22 fill=%22white%22/><circle cx=%2290%22 cy=%2280%22 r=%220.5%22 fill=%22white%22/></svg>')]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Header */}
          <div className="mb-10">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour à l'accueil
            </Link>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              Tableau de pilotage Nexyra
            </h1>
            <p className="text-white/60 max-w-3xl">
              Roadmap vivante en base de données. Chaque ligne se met à jour en temps réel à mesure que je livre.
              Clique sur l'icône de statut pour basculer todo → en cours → livré. Les boutons{" "}
              <Copy className="inline w-3 h-3" /> et <Wand2 className="inline w-3 h-3" /> génèrent des prompts contextuels à me coller.
            </p>
          </div>

          {/* Stats globales */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Avancement global" value={`${globalPct}%`} sub={`${totalDone}/${totalAll}`} />
            <StatCard label="En cours" value={String(totalInProg)} sub="à finir d'abord" tone="amber" />
            <StatCard label="P0 ouverts" value={String(totalP0Open)} sub="critique" tone="rose" />
            <StatCard label="Catégories" value={String(new Set(rows.map((r) => r.category_id)).size)} sub="domaines" />
          </div>

          <div className="mb-8">
            <Progress value={globalPct} className="h-2" />
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <input
              type="search"
              placeholder="Rechercher (ex: stripe, agent, mobile…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[220px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30"
            />
            <FilterGroup
              value={filter}
              onChange={(v) => setFilter(v as typeof filter)}
              options={[
                { v: "all", label: "Tout" },
                { v: "todo", label: "À faire" },
                { v: "in_progress", label: "En cours" },
                { v: "done", label: "Livrés" },
              ]}
            />
            <FilterGroup
              value={priorityFilter}
              onChange={(v) => setPriorityFilter(v as typeof priorityFilter)}
              options={[
                { v: "all", label: "Toutes priorités" },
                { v: "P0", label: "P0" },
                { v: "P1", label: "P1" },
                { v: "P2", label: "P2" },
              ]}
            />
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20 text-white/60">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Chargement de la roadmap...
            </div>
          )}

          {/* Empty state */}
          {!loading && categories.length === 0 && (
            <div className="text-center py-16 text-white/50">
              <CircleDashed className="w-10 h-10 mx-auto mb-3 opacity-40" />
              Aucun résultat avec ces filtres.
            </div>
          )}

          {/* Catégories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {categories.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                customPrompt={customPrompts[cat.id] ?? null}
                onSavePrompt={saveCategoryPrompt}
              />

            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = "blue",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "blue" | "amber" | "rose";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-300"
      : tone === "rose"
      ? "text-rose-300"
      : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
      <div className={`text-2xl font-semibold mt-0.5 ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-white/50">{sub}</div>
    </div>
  );
}

function FilterGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
            value === o.v ? "bg-white/15 text-white" : "text-white/60 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
