/**
 * WorkspaceLeftToolbar — vertical icon rail on the left of /dev2.
 * Exposes the 7 project-tooling features kept from the legacy /dev:
 *   1. Project switcher    2. Memory drawer    3. Ideas drawer
 *   4. Snapshots dialog    5. Import project   6. Web scraping
 *   7. Seed memory
 *
 * Drawers/dialogs are rendered here so the rail owns its UI surface.
 */
import { forwardRef, useState } from "react";
import {
  FolderKanban,
  Brain,
  Lightbulb,
  Camera,
  FolderInput,
  Globe,
  Zap,
  Plus,
  Check,
  Plug,
  Settings,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useActiveProject, type ActiveProject } from "./useActiveProject";
import { ProjectTypeChooser } from "@/components/ProjectTypeChooser";
import { ProjectMemoryDrawer } from "@/components/ProjectMemoryDrawer";
import { IdeasDrawer } from "@/components/IdeasDrawer";
import { SnapshotsDialog } from "@/components/settings/SnapshotsDialog";
import { ImportProjectDialog } from "@/components/sandbox/ImportProjectDialog";
import { ScrapePanel } from "@/components/sandbox/ScrapePanel";
import { DeployVercelButton } from "./DeployVercelButton";
import { GitHubImportButton } from "./GitHubImportButton";
import { ZipImportButton } from "./ZipImportButton";
import { useAuth } from "@/hooks/useAuth";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Tool = "memory" | "ideas" | "snapshots" | "import" | "scrape" | null;

export function WorkspaceLeftToolbar() {
  const { user } = useAuth();
  const { active, orgId, projects, select, refresh, activateCreatedProject } = useActiveProject();
  const [openTool, setOpenTool] = useState<Tool>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const requireProject = (): ActiveProject | null => {
    if (!active) {
      toast.info("Sélectionne ou crée un projet d'abord");
      setChooserOpen(true);
      return null;
    }
    return active;
  };

  const onScrapeText = (text: string) => {
    // Push to Elena chat input via window event the chat listens to.
    window.dispatchEvent(new CustomEvent("workspace:chat-insert", { detail: text }));
    setOpenTool(null);
  };

  const handleSeedMemory = async () => {
    const p = requireProject();
    if (!p) return;
    const brief = window.prompt(
      "Brief / pitch du projet pour initialiser la mémoire long-terme :",
      "",
    );
    if (!brief?.trim()) return;
    setSeeding(true);
    try {
      const res = await fetch("/api/seed-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id, brief }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Mémoire initialisée");
    } catch (e) {
      toast.error(`Échec seed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-slate-950/80 py-2">
        {/* 1. Project switcher */}
        <Popover>
          <PopoverTrigger asChild>
            <RailButton title={active ? `Projet: ${active.name}` : "Projets"} icon={<FolderKanban className="h-4 w-4" />} active={!!active} />
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-72 p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-foreground">Mes projets</span>
              <button
                onClick={() => setChooserOpen(true)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-violet-400 hover:bg-violet-500/10"
              >
                <Plus className="h-3 w-3" /> Nouveau
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {projects.length === 0 && (
                <p className="px-2 py-3 text-[11px] text-muted-foreground">
                  Aucun projet. Crée-en un.
                </p>
              )}
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    select(p);
                    toast.success(`Projet « ${p.name} » sélectionné`);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-secondary/40",
                    active?.id === p.id && "bg-secondary/30",
                  )}
                >
                  <span className="truncate">{p.name}</span>
                  {active?.id === p.id && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Divider />

        {/* 2. Memory */}
        <RailButton
          title="Mémoire projet"
          icon={<Brain className="h-4 w-4" />}
          onClick={() => requireProject() && setOpenTool("memory")}
        />
        {/* 3. Ideas */}
        <RailButton
          title="Idées captées"
          icon={<Lightbulb className="h-4 w-4" />}
          onClick={() => requireProject() && setOpenTool("ideas")}
        />
        {/* 4. Snapshots */}
        <RailButton
          title="Snapshots / versions"
          icon={<Camera className="h-4 w-4" />}
          onClick={() => requireProject() && setOpenTool("snapshots")}
        />

        <Divider />

        {/* 5. Import */}
        <RailButton
          title="Importer un projet (ZIP)"
          icon={<FolderInput className="h-4 w-4" />}
          onClick={() => requireProject() && setOpenTool("import")}
        />
        {/* 6. Scrape */}
        <RailButton
          title="Scraper une page web"
          icon={<Globe className="h-4 w-4" />}
          onClick={() => setOpenTool("scrape")}
        />
        {/* 7. Seed memory */}
        <RailButton
          title="Seed mémoire depuis un brief"
          icon={<Zap className="h-4 w-4" />}
          onClick={handleSeedMemory}
          disabled={seeding}
        />

        <div className="mt-auto flex flex-col items-center gap-1">
          <Divider />
          <GitHubImportButton active={active} />
          <ZipImportButton active={active} />
          <DeployVercelButton active={active} />
          <Link
            to="/integrations"
            title="Intégrations & MCP"
            aria-label="Intégrations"
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <Plug className="h-4 w-4" />
          </Link>
          <Link
            to="/settings"
            title="Paramètres"
            aria-label="Paramètres"
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <div className="px-1 pb-1 text-center text-[9px] text-slate-600">
            {user ? "v3" : "—"}
          </div>
        </div>
      </aside>

      {/* Drawers / dialogs */}
      <ProjectTypeChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onCreated={async (id) => {
          setChooserOpen(false);
          activateCreatedProject(id);
          await refresh();
          // refresh sets active to first; try to pick the freshly created one
          const fresh = (await (async () => {
            const { supabase } = await import("@/integrations/supabase/client");
            const { data } = await supabase.from("projects").select("id,name,type").eq("id", id).maybeSingle();
            return data as ActiveProject | null;
          })());
          if (fresh) {
            select(fresh);
          }
        }}
      />

      {active && (
        <ProjectMemoryDrawer
          open={openTool === "memory"}
          onClose={() => setOpenTool(null)}
          projectId={active.id}
          orgId={orgId ?? ""}
          ownerId={user?.id ?? ""}
        />
      )}
      {active && (
        <IdeasDrawer
          open={openTool === "ideas"}
          onClose={() => setOpenTool(null)}
          projectId={active.id}
        />
      )}
      {active && (
        <SnapshotsDialog
          open={openTool === "snapshots"}
          onOpenChange={(v) => setOpenTool(v ? "snapshots" : null)}
          projectId={active.id}
          projectName={active.name}
        />
      )}
      {active && orgId && (
        <ImportProjectDialog
          open={openTool === "import"}
          onOpenChange={(v) => setOpenTool(v ? "import" : null)}
          projectId={active.id}
          orgId={orgId}
          onImported={() => toast.success("Projet importé")}
        />
      )}

      <Sheet open={openTool === "scrape"} onOpenChange={(v) => setOpenTool(v ? "scrape" : null)}>
        <SheetContent side="left" className="w-full max-w-md sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Scraper une page web</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ScrapePanel onSendToElena={onScrapeText} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

const RailButton = forwardRef<
  HTMLButtonElement,
  {
    title: string;
    icon: React.ReactNode;
    onClick?: () => void;
    active?: boolean;
    disabled?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function RailButton({ title, icon, onClick, active, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      {...rest}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {icon}
    </button>
  );
});

function Divider() {
  return <div className="my-1 h-px w-6 bg-slate-800" aria-hidden />;
}
