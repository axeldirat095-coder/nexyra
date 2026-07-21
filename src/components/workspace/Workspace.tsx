import { useEffect, useState } from "react";
import { WorkspaceProvider } from "./WorkspaceContext";
import { WorkspacePreview } from "./WorkspacePreview";
import { WorkspaceTerminal } from "./WorkspaceTerminal";
import { WorkspaceChatE2B } from "./WorkspaceChatE2B";
import { WorkspaceLeftToolbar } from "./WorkspaceLeftToolbar";
import { WorkspaceCodeView } from "./WorkspaceCodeView";
import { useActiveProject } from "./useActiveProject";
import { PilotPanel } from "@/components/dev/PilotPanel";
import { LargeSandboxBadge } from "./LargeSandboxBadge";
import { Sparkles, Hammer, ExternalLink, AlertTriangle, Eye, Code2, Terminal, ListChecks } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Workspace() {
  const [isolated, setIsolated] = useState<boolean | null>(null);
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    setIsolated(typeof window !== "undefined" && window.crossOriginIsolated);
    setInIframe(typeof window !== "undefined" && window.self !== window.top);
  }, []);

  // E2B sandbox runs server-side — no cross-origin isolation needed.
  void isolated; void inIframe;

  return (
    <WorkspaceProvider>
      <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img
                src="/images/nexyra-logo-transparent.png"
                alt="Nexyra AI"
                className="h-7 w-7 object-contain"
              />
              <span className="text-base font-bold tracking-tight gradient-text">Nexyra AI</span>
            </Link>
            <div className="h-6 w-px bg-slate-700" aria-hidden />
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-violet-500">
                <Hammer className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold">Elena V2 — Workspace</div>
                <div className="text-[11px] text-slate-500">
                  Vrai projet Vite + React dans un WebContainer (Node.js navigateur)
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <LargeSandboxBadge />
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-1 text-violet-300 ring-1 ring-violet-500/30">
              <Sparkles className="h-3 w-3" />
              Lot 2 — agent Elena actif
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkspaceLeftToolbar />
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_400px] overflow-hidden">
            <div className="min-h-0 overflow-hidden border-r border-slate-800">
              <MainPane />
            </div>
            <div className="min-h-0 overflow-hidden border-t border-slate-800 lg:border-t-0">
              <WorkspaceChatE2B />
            </div>
          </div>
        </div>
      </div>
    </WorkspaceProvider>
  );
}

type MainTab = "preview" | "code" | "terminal" | "pilot";

function MainPane() {
  const [tab, setTab] = useState<MainTab>("preview");
  const { active } = useActiveProject();
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-slate-800 bg-slate-950/80">
        <TabBtn active={tab === "preview"} onClick={() => setTab("preview")} icon={<Eye className="h-3.5 w-3.5" />} label="Aperçu" />
        <TabBtn active={tab === "code"} onClick={() => setTab("code")} icon={<Code2 className="h-3.5 w-3.5" />} label="Code" />
        <TabBtn active={tab === "terminal"} onClick={() => setTab("terminal")} icon={<Terminal className="h-3.5 w-3.5" />} label="Terminal" />
        <TabBtn active={tab === "pilot"} onClick={() => setTab("pilot")} icon={<ListChecks className="h-3.5 w-3.5" />} label="Pilotage" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "preview" && <WorkspacePreview />}
        {tab === "code" && <WorkspaceCodeView />}
        {tab === "terminal" && <WorkspaceTerminal />}
        {tab === "pilot" && (
          active ? (
            <div className="h-full overflow-y-auto bg-background text-foreground">
              <PilotPanel projectId={active.id} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-500">
              Sélectionne un projet dans la barre de gauche pour afficher son tableau de pilotage.
            </div>
          )
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-b-2 border-violet-500 text-slate-100"
          : "border-b-2 border-transparent text-slate-500 hover:text-slate-300",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
