import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FolderKanban, AlertTriangle, Plus, Sprout } from "lucide-react";

type ProjectRow = {
  id: string;
  name: string;
  draft_mode: boolean;
};

type QuotaRow = {
  id: string;
  project_id: string;
  monthly_hard_limit_usd: number;
  hard_block: boolean;
  reason: string | null;
  updated_at: string;
};

type Combined = {
  project: ProjectRow;
  quota: QuotaRow | null;
  monthUsage: number;
};

export function ProjectQuotasSection() {
  const [rows, setRows] = useState<Combined[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newProjectId, setNewProjectId] = useState("");
  const [newLimit, setNewLimit] = useState("10");

  const load = async () => {
    setLoading(true);
    const [{ data: projects }, { data: quotas }] = await Promise.all([
      supabase.from("projects").select("id, name, draft_mode").order("name"),
      supabase.from("project_quotas" as never).select("*"),
    ]);

    const quotaMap = new Map<string, QuotaRow>();
    ((quotas as unknown as QuotaRow[]) ?? []).forEach((q) => quotaMap.set(q.project_id, q));

    // Usage du mois par projet (via messages.cost_usd join conversations)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data: usageRows } = await supabase
      .from("messages")
      .select("cost_usd, conversation_id, conversations!inner(project_id)")
      .gte("created_at", monthStart.toISOString());

    const usageMap = new Map<string, number>();
    ((usageRows as unknown as Array<{ cost_usd: number | null; conversations: { project_id: string | null } | null }>) ?? [])
      .forEach((r) => {
        const pid = r.conversations?.project_id;
        if (!pid) return;
        usageMap.set(pid, (usageMap.get(pid) ?? 0) + (r.cost_usd ?? 0));
      });

    const combined: Combined[] = ((projects as ProjectRow[]) ?? []).map((p) => ({
      project: p,
      quota: quotaMap.get(p.id) ?? null,
      monthUsage: usageMap.get(p.id) ?? 0,
    }));
    setRows(combined);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!newProjectId.trim()) return toast.error("Saisis un project_id");
    const limit = parseFloat(newLimit);
    if (isNaN(limit) || limit < 0) return toast.error("Limite invalide");
    const { error } = await supabase
      .from("project_quotas" as never)
      .insert({ project_id: newProjectId.trim(), monthly_hard_limit_usd: limit } as never);
    if (error) toast.error(error.message);
    else {
      toast.success("Quota projet créé");
      setNewProjectId("");
      setNewLimit("10");
      load();
    }
  };

  const handleQuotaUpdate = async (id: string, patch: Partial<QuotaRow>) => {
    setSaving(id);
    const { error } = await supabase
      .from("project_quotas" as never)
      .update(patch as never)
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Mis à jour");
      load();
    }
    setSaving(null);
  };

  const handleDraftToggle = async (projectId: string, value: boolean) => {
    setSaving(projectId);
    const { error } = await supabase.from("projects").update({ draft_mode: value }).eq("id", projectId);
    if (error) toast.error(error.message);
    else {
      toast.success(value ? "Mode brouillon activé" : "Mode brouillon désactivé");
      load();
    }
    setSaving(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quotas par projet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plafond mensuel et mode brouillon (force eco) par projet. Cumulé au quota utilisateur.
        </p>
      </div>

      <Card className="border-border/40 bg-card/40 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Ajouter un quota projet</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
          <div>
            <Label className="text-xs">Project ID (UUID)</Label>
            <Input
              value={newProjectId}
              onChange={(e) => setNewProjectId(e.target.value)}
              placeholder="00000000-0000-..."
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Limite USD/mois</Label>
            <Input type="number" step="0.01" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={handleCreate} className="self-end">Créer</Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-border/40 bg-card/40 p-8 text-center text-sm text-muted-foreground">
          Aucun projet visible.
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(({ project, quota, monthUsage }) => {
            const pct = quota ? Math.min(100, (monthUsage / quota.monthly_hard_limit_usd) * 100) : 0;
            return (
              <Card key={project.id} className="border-border/40 bg-card/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FolderKanban className="h-4 w-4 text-primary" />
                      <span className="font-medium">{project.name}</span>
                      {project.draft_mode && (
                        <Badge variant="secondary" className="gap-1">
                          <Sprout className="h-3 w-3" /> Brouillon
                        </Badge>
                      )}
                      {quota?.hard_block && <Badge variant="destructive">Bloqué</Badge>}
                      <code className="text-[10px] text-muted-foreground/70">{project.id}</code>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <div>
                        <Label className="text-xs">Limite USD/mois</Label>
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={quota?.monthly_hard_limit_usd ?? ""}
                          placeholder="—"
                          disabled={!quota}
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            if (quota && !isNaN(v) && v !== quota.monthly_hard_limit_usd) {
                              handleQuotaUpdate(quota.id, { monthly_hard_limit_usd: v });
                            }
                          }}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Usage mois</Label>
                        <div className="mt-1 rounded-md border border-border/40 bg-background/40 px-3 py-2 text-sm">
                          ${monthUsage.toFixed(4)}{" "}
                          {quota && (
                            <span className="text-xs text-muted-foreground">
                              ({pct.toFixed(0)}%)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Brouillon (force eco)</Label>
                        <Switch
                          checked={project.draft_mode}
                          onCheckedChange={(v) => handleDraftToggle(project.id, v)}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Hard-block</Label>
                        <Switch
                          checked={quota?.hard_block ?? false}
                          disabled={!quota}
                          onCheckedChange={(v) => quota && handleQuotaUpdate(quota.id, { hard_block: v })}
                        />
                      </div>
                    </div>
                    {saving === project.id || (quota && saving === quota.id) ? (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Sauvegarde…
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-100/80">
            Le quota projet s'ajoute au quota utilisateur. Le mode brouillon force tous les
            messages de ce projet en éco (gemini flash lite / gpt-nano), même si l'utilisateur
            choisit Premium.
          </p>
        </div>
      </Card>
    </div>
  );
}
