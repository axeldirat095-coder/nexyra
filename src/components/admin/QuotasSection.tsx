import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Shield, AlertTriangle, Plus } from "lucide-react";

type QuotaRow = {
  id: string;
  user_id: string;
  monthly_hard_limit_usd: number;
  hard_block: boolean;
  blocked_until: string | null;
  reason: string | null;
  updated_at: string;
};

export function QuotasSection() {
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newUserId, setNewUserId] = useState("");
  const [newLimit, setNewLimit] = useState("10");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_quotas" as never)
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    else setQuotas((data as unknown as QuotaRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!newUserId.trim()) {
      toast.error("Saisis un user_id");
      return;
    }
    const limit = parseFloat(newLimit);
    if (isNaN(limit) || limit < 0) {
      toast.error("Limite invalide");
      return;
    }
    const { error } = await supabase
      .from("user_quotas" as never)
      .insert({ user_id: newUserId.trim(), monthly_hard_limit_usd: limit } as never);
    if (error) toast.error(error.message);
    else {
      toast.success("Quota créé");
      setNewUserId("");
      setNewLimit("10");
      load();
    }
  };

  const handleUpdate = async (id: string, patch: Partial<QuotaRow>) => {
    setSaving(id);
    const { error } = await supabase
      .from("user_quotas" as never)
      .update(patch as never)
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Mis à jour");
      load();
    }
    setSaving(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quotas utilisateurs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kill-switch : limite mensuelle stricte en USD par user. Au-delà, Elena refuse.
          Permet aussi de bloquer manuellement un compte abusif.
        </p>
      </div>

      <Card className="border-border/40 bg-card/40 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Ajouter / écraser un quota</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
          <div>
            <Label className="text-xs">User ID (UUID)</Label>
            <Input
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="00000000-0000-..."
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Limite USD/mois</Label>
            <Input
              type="number"
              step="0.01"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button onClick={handleCreate} className="self-end">
            Créer
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : quotas.length === 0 ? (
        <Card className="border-border/40 bg-card/40 p-8 text-center text-sm text-muted-foreground">
          Aucun quota défini. Par défaut, les utilisateurs n'ont pas de limite.
        </Card>
      ) : (
        <div className="space-y-3">
          {quotas.map((q) => (
            <Card key={q.id} className="border-border/40 bg-card/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="truncate text-xs text-muted-foreground">{q.user_id}</code>
                    {q.hard_block && (
                      <Badge variant="destructive" className="gap-1">
                        <Shield className="h-3 w-3" /> Bloqué
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 grid gap-3 md:grid-cols-3">
                    <div>
                      <Label className="text-xs">Limite USD/mois</Label>
                      <Input
                        type="number"
                        step="0.01"
                        defaultValue={q.monthly_hard_limit_usd}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v !== q.monthly_hard_limit_usd) {
                            handleUpdate(q.id, { monthly_hard_limit_usd: v });
                          }
                        }}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Raison (si bloqué)</Label>
                      <Input
                        defaultValue={q.reason ?? ""}
                        placeholder="Abus détecté..."
                        onBlur={(e) => {
                          if (e.target.value !== (q.reason ?? "")) {
                            handleUpdate(q.id, { reason: e.target.value || null });
                          }
                        }}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Hard-block</Label>
                        <Switch
                          checked={q.hard_block}
                          onCheckedChange={(checked) =>
                            handleUpdate(q.id, { hard_block: checked })
                          }
                        />
                      </div>
                      {saving === q.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-100/80">
            Le kill-switch vérifie le quota avant chaque message Elena. Les utilisateurs sans
            entrée dans cette table n'ont aucune limite — pense à créer un quota par défaut
            quand tu ouvres aux clients.
          </p>
        </div>
      </Card>
    </div>
  );
}
