import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bot,
  Cpu,
  Plug,
  Wrench,
  Database,
  Palette,
  ArrowLeft,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type SettingsSectionId =
  | "agent"
  | "models"
  | "integrations"
  | "tools"
  | "storage"
  | "appearance";

const NAV: Array<{
  id: SettingsSectionId;
  label: string;
  desc: string;
  icon: typeof Bot;
}> = [
  { id: "agent", label: "Agent Nexyra", desc: "Personnalité & comportement", icon: Bot },
  { id: "models", label: "Modèles IA", desc: "Routage par tâche", icon: Cpu },
  { id: "integrations", label: "Intégrations & API", desc: "Clés et services connectés", icon: Plug },
  { id: "tools", label: "Outils", desc: "MCP, scraping, fichiers", icon: Wrench },
  { id: "storage", label: "Stockage", desc: "Mémoire & base de données", icon: Database },
  { id: "appearance", label: "Apparence", desc: "Thème & interface", icon: Palette },
];

interface SettingsLayoutProps {
  active: SettingsSectionId;
  onChange: (id: SettingsSectionId) => void;
  children: ReactNode;
}

export function SettingsLayout({ active, onChange, children }: SettingsLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Ouvrir le menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Link
              to="/dev"
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Retour à l'agent</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Paramètres</span>
            <span className="rounded-md border border-border/50 bg-card/40 px-2 py-0.5 text-xs text-muted-foreground">
              Nexyra AI
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 md:px-6 md:py-8">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-14 left-0 z-30 w-72 shrink-0 overflow-y-auto border-r border-border/40 bg-background/95 px-3 py-4 backdrop-blur-xl transition-transform md:static md:inset-auto md:block md:w-64 md:border-0 md:bg-transparent md:backdrop-blur-none",
            mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <div className="mb-3 px-2">
            <h2 className="text-lg font-semibold tracking-tight">Paramètres</h2>
            <p className="text-xs text-muted-foreground">Configuration de l'agent</p>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onChange(item.id);
                    setMobileOpen(false);
                  }}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                    isActive
                      ? "border-primary/40 bg-primary/10 text-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]"
                      : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-card/50 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                      isActive
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/40 bg-card/30 text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium leading-tight">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.desc}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 top-14 z-20 bg-background/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </div>
  );
}

export const SETTINGS_NAV = NAV;
