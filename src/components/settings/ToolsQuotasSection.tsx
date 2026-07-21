import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Wrench, Search, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface ToolRow {
  tool_name: string;
  credits_cost: number;
  provider: string | null;
  category: string;
  description: string | null;
  requires_byok: boolean;
  enabled_by_default: boolean;
}

export function ToolsQuotasSection() {
  const { user } = useAuth();
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: pricing }, { data: ovr }] = await Promise.all([
        (supabase.from as any)("tool_pricing").select("*").order("category").order("tool_name"),
        user
          ? (supabase.from as any)("tool_overrides").select("tool_name, enabled").eq("owner_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);
      if (!alive) return;
      setTools((pricing as ToolRow[]) ?? []);
      const map: Record<string, boolean> = {};
      for (const o of (ovr as any[]) ?? []) map[o.tool_name] = o.enabled;
      setOverrides(map);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return tools;
    return tools.filter(
      (t) =>
        t.tool_name.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term) ||
        (t.provider ?? "").toLowerCase().includes(term),
    );
  }, [tools, q]);

  const grouped = useMemo(() => {
    const g = new Map<string, ToolRow[]>();
    for (const t of filtered) {
      const arr = g.get(t.category) ?? [];
      arr.push(t);
      g.set(t.category, arr);
    }
    return Array.from(g.entries());
  }, [filtered]);

  const toggle = async (toolName: string, enabled: boolean) => {
    if (!user) return;
    setOverrides((m) => ({ ...m, [toolName]: enabled }));
    const { error } = await (supabase.from as any)("tool_overrides").upsert(
      { owner_id: user.id, tool_name: toolName, enabled },
      { onConflict: "owner_id,tool_name" },
    );
    if (error) {
      toast.error(`Échec : ${error.message}`);
      setOverrides((m) => ({ ...m, [toolName]: !enabled }));
    } else {
      toast.success(`Outil ${toolName} ${enabled ? "activé" : "désactivé"}`);
    }
  };

  if (!user) {
    return (
      <Card className="border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center text-sm text-muted-foreground">
        Connecte-toi pour gérer tes outils.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outils & quotas</h1>
          <p className="text-sm text-muted-foreground">
            Active ou désactive ce qu'Elena peut utiliser. Le coût indicatif en crédits est affiché par outil.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <Card className="border-border/40 bg-card/40 p-8 text-center text-sm text-muted-foreground">
          Chargement…
        </Card>
      ) : (
        grouped.map(([cat, items]) => (
          <Card key={cat} className="border-border/40 bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-glow-violet" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {cat}
              </h2>
              <span className="text-xs text-muted-foreground">({items.length})</span>
            </div>
            <div className="divide-y divide-border/30">
              {items.map((t) => {
                const enabled = overrides[t.tool_name] ?? t.enabled_by_default;
                return (
                  <div key={t.tool_name} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-medium">{t.tool_name}</code>
                        {t.requires_byok && (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                            <KeyRound className="mr-1 h-3 w-3" /> BYOK
                          </Badge>
                        )}
                        {t.provider && (
                          <Badge variant="outline" className="border-border/40 text-muted-foreground">
                            {t.provider}
                          </Badge>
                        )}
                      </div>
                      {t.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="font-mono">
                        {t.credits_cost === 0 ? "gratuit" : `${t.credits_cost} cr`}
                      </Badge>
                      <Switch checked={enabled} onCheckedChange={(v) => toggle(t.tool_name, v)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
