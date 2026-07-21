/**
 * SnapshotsDialog — gestion des sauvegardes manuelles de la sandbox /dev2.
 *
 * - Liste les snapshots du projet (label, date, nb fichiers, taille)
 * - Permet d'en restaurer ou d'en supprimer un.
 * Le bouton "Save" lui-même est dans WorkspacePreview (toolbar).
 */
import { useEffect, useState } from "react";
import { Loader2, RotateCw, Trash2, History } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  e2bDeleteSnapshot,
  e2bListSnapshots,
  e2bRestoreSnapshot,
} from "@/lib/e2b.functions";

type Snapshot = {
  id: string;
  label: string;
  file_count: number;
  size_bytes: number;
  created_at: string;
};

export function SnapshotsDialog({ projectId }: { projectId: string }) {
  const list = useServerFn(e2bListSnapshots);
  const restore = useServerFn(e2bRestoreSnapshot);
  const remove = useServerFn(e2bDeleteSnapshot);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    list({ data: { projectId } })
      .then((r) => setItems(r.snapshots as Snapshot[]))
      .catch((e) => toast.error(`Liste KO : ${e.message}`))
      .finally(() => setLoading(false));
  }, [open, projectId, list]);

  const handleRestore = async (id: string) => {
    if (!confirm("Restaurer cette sauvegarde ? Les fichiers actuels de la sandbox seront écrasés.")) return;
    setBusyId(id);
    const tid = toast.loading("Restauration en cours…");
    try {
      const { written } = await restore({ data: { projectId, snapshotId: id } });
      toast.success(`Restauration OK (${written} fichiers)`, { id: tid });
      setOpen(false);
    } catch (e) {
      toast.error(`Restauration KO : ${e instanceof Error ? e.message : String(e)}`, { id: tid });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette sauvegarde définitivement ?")) return;
    setBusyId(id);
    try {
      await remove({ data: { snapshotId: id } });
      setItems((arr) => arr.filter((s) => s.id !== id));
      toast.success("Sauvegarde supprimée");
    } catch (e) {
      toast.error(`Suppression KO : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          title="Mes sauvegardes"
          className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-slate-300 hover:bg-slate-800"
        >
          <History className="h-3 w-3" /> Sauvegardes
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-slate-950 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>Sauvegardes de la sandbox</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : items.length === 0 ? (
            <div className="py-6 text-sm text-slate-400">
              Aucune sauvegarde pour ce projet. Clique sur <b>Save</b> dans la barre preview pour
              en créer une.
            </div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {items.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-100">{s.label}</div>
                    <div className="text-[11px] text-slate-500">
                      {new Date(s.created_at).toLocaleString("fr-FR")} · {s.file_count} fichiers ·{" "}
                      {(s.size_bytes / 1024).toFixed(0)} Ko
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={busyId === s.id}
                      onClick={() => void handleRestore(s.id)}
                      className="flex items-center gap-1 rounded bg-blue-600/20 px-2 py-1 text-xs text-blue-200 hover:bg-blue-600/30 disabled:opacity-40"
                    >
                      {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                      Restaurer
                    </button>
                    <button
                      disabled={busyId === s.id}
                      onClick={() => void handleDelete(s.id)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
