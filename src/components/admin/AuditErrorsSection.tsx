import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, FileClock, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type AuditRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  org_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
};

type ErrorRow = {
  id: string;
  created_at: string;
  level: string;
  source: string;
  message: string;
  route: string | null;
  resolved: boolean;
  stack: string | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR");

export function AuditErrorsSection() {
  const [tab, setTab] = useState<"errors" | "audit">("errors");
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [a, e] = await Promise.all([
      supabase
        .from("audit_logs")
        .select("id,created_at,user_id,org_id,action,resource_type,resource_id,details")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("error_events")
        .select("id,created_at,level,source,message,route,resolved,stack")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (a.data) setAudits(a.data as AuditRow[]);
    if (e.data) setErrors(e.data as ErrorRow[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const filteredErrors = useMemo(
    () => (showResolved ? errors : errors.filter((x) => !x.resolved)),
    [errors, showResolved],
  );

  const markResolved = async (id: string) => {
    const { error } = await supabase
      .from("error_events")
      .update({ resolved: true })
      .eq("id", id);
    if (error) {
      toast.error("Échec mise à jour");
      return;
    }
    setErrors((prev) => prev.map((e) => (e.id === id ? { ...e, resolved: true } : e)));
    toast.success("Erreur marquée résolue");
  };

  const levelColor = (lvl: string) =>
    lvl === "fatal" || lvl === "error"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : lvl === "warn"
        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
        : "bg-muted text-muted-foreground border-border/40";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Audit & Erreurs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Journal des actions sensibles + erreurs capturées (client & serveur). 100 dernières
            entrées.
          </p>
        </div>
        <Button onClick={refresh} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "errors" | "audit")}>
        <TabsList>
          <TabsTrigger value="errors" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> Erreurs
            {filteredErrors.length > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5">
                {filteredErrors.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <FileClock className="h-4 w-4" /> Audit log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="mt-4">
          <Card className="border-border/40 bg-card/40">
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
              <span className="text-xs text-muted-foreground">
                {filteredErrors.length} erreur(s) {showResolved ? "(toutes)" : "non résolues"}
              </span>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(e) => setShowResolved(e.target.checked)}
                />
                Inclure les résolues
              </label>
            </div>
            <ScrollArea className="h-[520px]">
              <div className="divide-y divide-border/30">
                {filteredErrors.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    🎉 Aucune erreur {showResolved ? "" : "non résolue"} pour l'instant.
                  </div>
                )}
                {filteredErrors.map((e) => (
                  <details key={e.id} className="group px-4 py-3">
                    <summary className="flex cursor-pointer items-start gap-3">
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${levelColor(
                          e.level,
                        )}`}
                      >
                        {e.level}
                      </span>
                      <span className="shrink-0 rounded border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {e.source}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {e.message}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {fmt(e.created_at)}
                      </span>
                      {!e.resolved && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={(ev) => {
                            ev.preventDefault();
                            markResolved(e.id);
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3" /> Résoudre
                        </Button>
                      )}
                    </summary>
                    <div className="mt-2 space-y-1 pl-2 text-xs text-muted-foreground">
                      {e.route && (
                        <div>
                          <span className="text-foreground/70">Route :</span> {e.route}
                        </div>
                      )}
                      {e.stack && (
                        <pre className="max-h-60 overflow-auto rounded bg-muted/30 p-2 text-[11px] leading-relaxed text-foreground/80">
                          {e.stack}
                        </pre>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card className="border-border/40 bg-card/40">
            <ScrollArea className="h-[520px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card/95 backdrop-blur">
                  <tr className="border-b border-border/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Ressource</th>
                    <th className="px-3 py-2">Utilisateur</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">
                        Aucune action loggée pour l'instant.
                      </td>
                    </tr>
                  )}
                  {audits.map((a) => (
                    <tr key={a.id} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {fmt(a.created_at)}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">{a.action}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {a.resource_type ?? "—"}
                        {a.resource_id ? ` · ${a.resource_id.slice(0, 8)}` : ""}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        {a.user_id?.slice(0, 8) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
