/**
 * /elena-coach — Carnet de leçons Elena (v2 : étapes éditables).
 *
 * Chaque règle = carte avec étapes numérotées éditables une par une.
 * Toutes les règles actives sont injectées dans le prompt d'Elena à chaque réponse.
 */
import { useEffect, useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, Plus, Trash2, Power, PowerOff, GraduationCap,
  Lock, GripVertical, Pencil, Check, X, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listElenaLessons, createElenaLesson, updateElenaLesson, deleteElenaLesson,
} from "@/lib/elena-lessons.functions";

const searchSchema = z.object({ prefill: z.string().optional() });

export const Route = createFileRoute("/elena-coach")({
  validateSearch: searchSchema,
  component: () => (
    <RequireAuth>
      <ElenaCoachPage />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Coacher Elena — Nexyra" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Step = { id: string; text: string };
type Lesson = {
  id: string;
  title: string;
  content: string;
  category: string;
  is_active: boolean;
  is_fundamental: boolean;
  steps: Step[] | null;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
};

const CATEGORIES = [
  { value: "design", label: "🎨 Design" },
  { value: "code", label: "💻 Code" },
  { value: "comportement", label: "🧭 Comportement" },
  { value: "communication", label: "💬 Communication" },
  { value: "workflow", label: "⚙️ Workflow" },
  { value: "general", label: "📌 Général" },
];

const newId = () => `s_${Math.random().toString(36).slice(2, 9)}`;

function ElenaCoachPage() {
  const search = useSearch({ from: "/elena-coach" });
  const list = useServerFn(listElenaLessons);
  const create = useServerFn(createElenaLesson);
  const update = useServerFn(updateElenaLesson);
  const remove = useServerFn(deleteElenaLesson);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  // Création
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [draftSteps, setDraftSteps] = useState<Step[]>([{ id: newId(), text: "" }]);
  const [content, setContent] = useState(search.prefill ?? "");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await list();
      setLessons(r.lessons as Lesson[]);
    } catch {
      toast.error("Impossible de charger les règles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, []);

  async function onCreate() {
    if (!title.trim()) { toast.error("Donne un titre à ta règle"); return; }
    const cleanSteps = draftSteps.map(s => ({ ...s, text: s.text.trim() })).filter(s => s.text.length > 0);
    if (cleanSteps.length === 0 && !content.trim()) {
      toast.error("Ajoute au moins une étape ou une description"); return;
    }
    setSaving(true);
    try {
      await create({ data: {
        title: title.trim(),
        content: content.trim(),
        category,
        steps: cleanSteps,
      } });
      setTitle(""); setContent(""); setDraftSteps([{ id: newId(), text: "" }]);
      toast.success("Règle ajoutée — Elena l'appliquera dès le prochain message");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Coacher Elena</h1>
          </div>
          <p className="text-muted-foreground">
            Chaque règle ici devient une consigne <strong>obligatoire</strong> qu'Elena applique
            sur <strong>tous tes projets</strong>. Découpe en étapes claires pour qu'elle suive ton workflow.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary">{lessons.filter(l => l.is_active).length} règles actives</Badge>
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> {lessons.filter(l => l.is_fundamental).length} fondamentales</Badge>
          </div>
          <Card className="p-3 mt-2 bg-primary/5 border-primary/20 text-sm flex gap-2 items-start">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">Astuce :</strong> dans le chat Elena, demande-lui
              "<em>regarde ma règle X dans le coach et dis-moi ce que je peux améliorer pour éviter le bug Y</em>".
              Elle te répondra avec une étape précise à ajouter ici.
            </span>
          </Card>
        </header>

        {/* ========= NOUVELLE RÈGLE ========= */}
        <Card className="p-5 space-y-4 border-primary/30">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="h-5 w-5" /> Nouvelle règle
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
            <Input
              placeholder="Nom court de la règle (ex: QA visuelle avant réponse)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Textarea
            placeholder="Description courte (optionnel) — ex: 'Elena doit toujours vérifier le rendu avant de répondre.'"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            rows={2}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium">Étapes (une consigne par étape)</label>
            {draftSteps.map((s, i) => (
              <div key={s.id} className="flex gap-2 items-start">
                <span className="text-xs text-muted-foreground mt-3 w-5 text-right">{i + 1}.</span>
                <Input
                  value={s.text}
                  placeholder="ex: Capture la preview avec capture_current_preview"
                  onChange={(e) => setDraftSteps(draftSteps.map(x => x.id === s.id ? { ...x, text: e.target.value } : x))}
                />
                <Button size="icon" variant="ghost" onClick={() => setDraftSteps(draftSteps.filter(x => x.id !== s.id))} disabled={draftSteps.length === 1}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setDraftSteps([...draftSteps, { id: newId(), text: "" }])}>
              <Plus className="h-3 w-3 mr-1" /> Ajouter une étape
            </Button>
          </div>

          <div className="flex justify-end">
            <Button onClick={onCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Créer la règle
            </Button>
          </div>
        </Card>

        {/* ========= LISTE ========= */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">📚 Règles enregistrées</h2>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : lessons.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">Aucune règle — ajoute-en une ci-dessus.</Card>
          ) : (
            lessons.map(l => (
              <LessonCard
                key={l.id}
                lesson={l}
                onSave={async (patch) => { await update({ data: { id: l.id, ...patch } }); await refresh(); }}
                onDelete={async () => {
                  const msg = l.is_fundamental
                    ? `⚠️ "${l.title}" est une règle FONDAMENTALE. La supprimer peut dégrader Elena. Continuer ?`
                    : `Supprimer "${l.title}" ?`;
                  if (!confirm(msg)) return;
                  await remove({ data: { id: l.id } }); await refresh();
                }}
                onToggle={async () => { await update({ data: { id: l.id, is_active: !l.is_active } }); await refresh(); }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ============ Carte de règle (édition par étape) ============ */
function LessonCard({
  lesson, onSave, onDelete, onToggle,
}: {
  lesson: Lesson;
  onSave: (patch: { title?: string; content?: string; category?: string; steps?: Step[] }) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggle: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  const [category, setCategory] = useState(lesson.category);
  const [content, setContent] = useState(lesson.content);
  const [steps, setSteps] = useState<Step[]>(lesson.steps ?? []);
  const [busy, setBusy] = useState(false);

  function resetFromProps() {
    setTitle(lesson.title); setCategory(lesson.category);
    setContent(lesson.content); setSteps(lesson.steps ?? []);
  }

  async function save() {
    setBusy(true);
    try {
      const cleanSteps = steps.map(s => ({ ...s, text: s.text.trim() })).filter(s => s.text);
      await onSave({ title: title.trim(), category, content: content.trim(), steps: cleanSteps });
      setEditing(false);
      toast.success("Règle mise à jour");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(false); }
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const next = [...steps];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setSteps(next);
  }

  return (
    <Card className={`p-4 ${!lesson.is_active ? "opacity-50" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-2 mb-2">
              <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-semibold">{lesson.title}</h3>
              <Badge variant="outline" className="text-xs">
                {CATEGORIES.find(c => c.value === lesson.category)?.label ?? lesson.category}
              </Badge>
              {lesson.is_fundamental && (
                <Badge className="text-xs gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">
                  <Lock className="h-3 w-3" /> Fondamentale
                </Badge>
              )}
              {!lesson.is_active && <Badge variant="destructive" className="text-xs">Archivée</Badge>}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {editing ? (
            <>
              <Button size="icon" variant="ghost" onClick={save} disabled={busy} title="Enregistrer">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-primary" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => { resetFromProps(); setEditing(false); }} title="Annuler">
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" onClick={() => setEditing(true)} title="Modifier">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={onToggle} title={lesson.is_active ? "Archiver" : "Réactiver"}>
                {lesson.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={onDelete} title="Supprimer">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {editing ? (
        <Textarea
          className="mt-2"
          rows={2}
          placeholder="Description courte"
          value={content}
          onChange={e => setContent(e.target.value)}
          maxLength={2000}
        />
      ) : (
        lesson.content && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{lesson.content}</p>
      )}

      {/* Étapes */}
      <div className="mt-3 space-y-1.5">
        {(editing ? steps : (lesson.steps ?? [])).map((s, i) => (
          <div key={s.id} className="flex items-start gap-2 text-sm">
            <span className="text-xs text-muted-foreground mt-2 w-5 text-right shrink-0">{i + 1}.</span>
            {editing ? (
              <>
                <div className="flex flex-col gap-0.5 mt-1">
                  <button onClick={() => moveStep(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0}><GripVertical className="h-3 w-3 rotate-90" /></button>
                </div>
                <Input
                  value={s.text}
                  onChange={e => setSteps(steps.map(x => x.id === s.id ? { ...x, text: e.target.value } : x))}
                  className="text-sm"
                />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSteps(steps.filter(x => x.id !== s.id))}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <span className="flex-1 leading-relaxed">{s.text}</span>
            )}
          </div>
        ))}
        {editing && (
          <Button size="sm" variant="ghost" className="mt-1" onClick={() => setSteps([...steps, { id: newId(), text: "" }])}>
            <Plus className="h-3 w-3 mr-1" /> Ajouter une étape
          </Button>
        )}
        {!editing && (lesson.steps ?? []).length === 0 && !lesson.content && (
          <p className="text-xs italic text-muted-foreground">Aucune étape — clique sur ✏️ pour en ajouter.</p>
        )}
      </div>
    </Card>
  );
}
