import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, RotateCcw, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  createProjectSnapshot,
  listProjectSnapshots,
  restoreProjectSnapshot,
} from "@/lib/snapshots.functions";

type Snapshot = {
  id: string;
  version: number;
  label: string;
  created_at: string;
  size_bytes: number;
  messages_count: number;
};

export function SnapshotsDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  projectName: string;
}) {
  const [items, setItems] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const listFn = useServerFn(listProjectSnapshots);
  const createFn = useServerFn(createProjectSnapshot);
  const restoreFn = useServerFn(restoreProjectSnapshot);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listFn({ data: { projectId } });
      setItems((res.snapshots ?? []) as Snapshot[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const createNow = async () => {
    setBusy("create");
    try {
      await createFn({ data: { projectId, label: "Manuel" } });
      toast.success("Snapshot créé");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (s: Snapshot) => {
    if (!confirm(`Restaurer la version ${s.version} (${s.label}) ? Un snapshot de sécurité de l'état actuel sera créé.`)) return;
    setBusy(s.id);
    try {
      const res = await restoreFn({ data: { snapshotId: s.id } });
      toast.success(`Restauré à v${res.restored_version} (sécurité v${res.safety_version})`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Snapshots — {projectName}</DialogTitle>
          <DialogDescription>
            Sauvegardes versionnées du projet. Une sauvegarde automatique est créée toutes les 30 min en cas d'activité.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button onClick={createNow} disabled={busy === "create"} size="sm">
            {busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Snapshot maintenant
          </Button>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {loading && <p className="text-sm text-muted-foreground">Chargement...</p>}
          {!loading && items.length === 0 && (
            <Card className="border-dashed border-border/40 bg-card/30 p-6 text-center text-sm text-muted-foreground">
              Aucun snapshot pour ce projet.
            </Card>
          )}
          {items.map((s) => (
            <Card key={s.id} className="flex items-center justify-between gap-3 border-border/40 bg-card/40 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">
                    v{s.version}
                  </span>
                  <span className="truncate text-sm font-medium">{s.label}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(s.created_at).toLocaleString("fr-FR")}
                  <span>·</span>
                  <span>{s.messages_count} messages</span>
                  <span>·</span>
                  <span>{(s.size_bytes / 1024).toFixed(1)} ko</span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => restore(s)}
                disabled={busy === s.id}
              >
                {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Restaurer
              </Button>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
