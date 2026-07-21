import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Globe, Layout, Smartphone, Pencil, Archive, Trash2, ArchiveRestore, Check, X, History, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/i18n";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import { SnapshotsDialog } from "./SnapshotsDialog";
import { ProjectVisibilityToggle } from "@/components/projects/ProjectVisibilityToggle";

type Visibility = "private" | "public";
type Project = {
  id: string;
  name: string;
  type: Database["public"]["Enums"]["project_type"];
  status: Database["public"]["Enums"]["project_status"];
  visibility: Visibility;
  updated_at: string;
};

const ICONS = {
  website: Globe,
  webapp: Layout,
  mobile_app: Smartphone,
} as const;

export function MyProjectsSection() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [snapshotProject, setSnapshotProject] = useState<Project | null>(null);

  const openProject = async (id: string) => {
    // Bump updated_at pour que /dev charge ce projet (il prend le plus récent)
    const { error } = await supabase
      .from("projects")
      .update({ updated_at: new Date().toISOString(), status: "active" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    localStorage.setItem("nexyra:dev2:active-project", id);
    sessionStorage.setItem("nexyra:dev2:new-project", id);
    toast.success("Ouverture du projet…");
    navigate({ to: "/dev" });
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("projects")
      .select("id,name,type,status,visibility,updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });
    setItems((data as Project[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  const startEdit = (p: Project) => {
    setEditingId(p.id);
    setDraftName(p.name);
  };

  const saveName = async (id: string) => {
    const name = draftName.trim();
    if (!name) return;
    const { error } = await supabase.from("projects").update({ name }).eq("id", id);
    if (error) return toast.error(error.message);
    setItems((p) => p.map((x) => (x.id === id ? { ...x, name } : x)));
    setEditingId(null);
    toast.success(t("projects.saved"));
  };

  const setStatus = async (id: string, status: Project["status"]) => {
    const { error } = await supabase.from("projects").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    setItems((p) => p.map((x) => (x.id === id ? { ...x, status } : x)));
    toast.success(t("projects.saved"));
  };

  const remove = async (id: string) => {
    if (!confirm(t("projects.confirm_delete"))) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((p) => p.filter((x) => x.id !== id));
    toast.success(t("projects.deleted"));
  };

  if (loading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

  if (items.length === 0)
    return (
      <Card className="border-dashed border-border/40 bg-card/30 p-8 text-center text-sm text-muted-foreground">
        {t("projects.empty")}
      </Card>
    );

  return (
    <div className="space-y-2">
      {items.map((p) => {
        const Icon = ICONS[p.type];
        const isEditing = editingId === p.id;
        const isArchived = p.status === "archived";
        return (
          <Card
            key={p.id}
            className={`flex items-center gap-3 border-border/40 bg-card/40 p-3 ${
              isArchived ? "opacity-60" : ""
            }`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border/40 bg-card/60 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName(p.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-8"
                  />
                  <Button size="sm" onClick={() => saveName(p.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{p.type} · {p.status} · {new Date(p.updated_at).toLocaleDateString("fr-FR")}</span>
                    <ProjectVisibilityToggle
                      projectId={p.id}
                      initial={(p.visibility ?? "private") as Visibility}
                      onChange={(next) =>
                        setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, visibility: next } : x)))
                      }
                    />
                  </div>
                </>
              )}
            </div>
            {!isEditing && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => openProject(p.id)}
                  className="h-8 gap-1.5 px-2.5 text-xs"
                  disabled={isArchived}
                  title={isArchived ? "Désarchive d'abord pour ouvrir" : "Ouvrir dans l'espace Dev"}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ouvrir
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSnapshotProject(p)} title="Snapshots & restauration">
                  <History className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => startEdit(p)} title={t("projects.rename")}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setStatus(p.id, isArchived ? "active" : "archived")}
                  title={isArchived ? t("projects.unarchive") : t("projects.archive")}
                >
                  {isArchived ? (
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(p.id)}
                  className="text-destructive hover:text-destructive"
                  title={t("projects.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </Card>
        );
      })}
      {snapshotProject && (
        <SnapshotsDialog
          open={!!snapshotProject}
          onOpenChange={(v) => !v && setSnapshotProject(null)}
          projectId={snapshotProject.id}
          projectName={snapshotProject.name}
        />
      )}
    </div>
  );
}
