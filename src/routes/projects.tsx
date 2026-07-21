import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Plus, Upload, FolderKanban } from "lucide-react";
import { MyProjectsSection } from "@/components/settings/MyProjectsSection";
import { ProjectTypeChooser } from "@/components/ProjectTypeChooser";
import { ImportProjectDialog } from "@/components/sandbox/ImportProjectDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
  head: () => ({
    meta: [
      { title: "Nexyra AI — Mes projets" },
      { name: "description", content: "Tous vos projets Nexyra et Lovable au même endroit. Créer, renommer, importer et travailler avec Elena." },
    ],
  }),
});

function ProjectsPage() {
  return (
    <RequireAuth>
      <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="starry-page-bg" />
        <div className="page-content-layer">
          <Navbar />
          <main className="mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
            <ProjectsContent />
          </main>
          <Footer />
        </div>
      </div>
    </RequireAuth>
  );
}

function ProjectsContent() {
  const { user } = useAuth();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<{ projectId: string; orgId: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);


  const startImport = async () => {
    if (!user) return;
    const label = prompt("Nom du projet importé :", "Projet importé");
    if (!label?.trim()) return;
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("owner_id", user.id)
      .eq("is_personal", true)
      .maybeSingle();
    if (!org) {
      toast.error("Espace personnel introuvable");
      return;
    }
    const { data, error } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        org_id: org.id,
        name: label.trim(),
        type: "webapp",
        status: "active",
      })
      .select("id, org_id")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Création impossible");
      return;
    }
    setImportTarget({ projectId: data.id, orgId: data.org_id });
    setImportOpen(true);
  };

  return (
    <>
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
            <FolderKanban className="h-6 w-6 text-glow-blue" />
            Mes projets
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gère tous tes projets Nexyra et imports Lovable. Renomme, archive, supprime ou ouvre dans l'espace Dev avec Elena.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setChooserOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nouveau projet
          </Button>
          <Button onClick={startImport} variant="outline" className="gap-1.5">
            <Upload className="h-4 w-4" /> Importer un ZIP
          </Button>
        </div>
      </header>

      <section key={refreshKey}>
        <MyProjectsSection />
      </section>

      <ProjectTypeChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onCreated={() => {
          setChooserOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />

      {importTarget && (
        <ImportProjectDialog
          open={importOpen}
          onOpenChange={(v) => {
            setImportOpen(v);
            if (!v) setImportTarget(null);
          }}
          projectId={importTarget.projectId}
          orgId={importTarget.orgId}
          onImported={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}
