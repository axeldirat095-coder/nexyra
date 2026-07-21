import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Brain, FolderOpen, Languages, Palette, Plug, UserCircle, Wallet, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { MyProjectsSection } from "@/components/settings/MyProjectsSection";
import { BudgetSection } from "@/components/settings/BudgetSection";
import { QuotaStatusCard } from "@/components/settings/QuotaStatusCard";
import { ToolsQuotasSection } from "@/components/settings/ToolsQuotasSection";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IntegrationsSection } from "@/components/settings/sections";
import { AiRoutingSection } from "@/components/settings/AiRoutingSection";
import { UserProfileSection } from "@/components/settings/UserProfileSection";
import { useI18n } from "@/i18n/i18n";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
  head: () => ({
    meta: [
      { title: "Paramètres — Nexyra AI" },
      { name: "description", content: "Tes projets, langue et apparence." },
    ],
  }),
});

function SettingsRoute() {
  return (
    <RequireAuth>
      <SettingsPage />
    </RequireAuth>
  );
}

type Section = "projects" | "profile" | "brain" | "integrations" | "tools" | "budget" | "language" | "appearance";

function SettingsPage() {
  const { t } = useI18n();
  const [active, setActive] = useState<Section>("projects");

  const NAV = [
    { id: "projects" as const, label: t("settings.projects"), desc: t("settings.projects.desc"), icon: FolderOpen },
    { id: "profile" as const, label: "Profil utilisateur", desc: "Qui tu es, comment te parler", icon: UserCircle },
    { id: "brain" as const, label: "Cerveau d'Elena", desc: "Quelle IA pour quelle tâche", icon: Brain },
    { id: "integrations" as const, label: "Clés API", desc: "OpenAI, Anthropic, Google…", icon: Plug },
    { id: "tools" as const, label: "Outils & quotas", desc: "Active/désactive, voir coûts", icon: Wrench },
    { id: "budget" as const, label: "Budget & coûts", desc: "Limite mensuelle, alertes", icon: Wallet },
    { id: "language" as const, label: t("settings.language"), desc: "FR / EN", icon: Languages },
    { id: "appearance" as const, label: t("settings.appearance"), desc: "Light / Dark", icon: Palette },
  ];


  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <Link
            to="/dev"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Retour à l'agent</span>
          </Link>
          <span className="rounded-md border border-border/50 bg-card/40 px-2 py-0.5 text-xs text-muted-foreground">
            {t("settings.title")}
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-6 md:px-6 md:py-8">
        <aside className="hidden w-60 shrink-0 md:block">
          <h2 className="mb-3 px-2 text-lg font-semibold tracking-tight">{t("settings.title")}</h2>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                    isActive
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-card/50 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 items-center justify-center rounded-md border",
                      isActive
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/40 bg-card/30 text-muted-foreground",
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

        <div className="md:hidden mb-4 flex gap-1 overflow-x-auto pb-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={cn(
                "shrink-0 rounded-md border px-3 py-1.5 text-xs",
                active === item.id
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border/40 text-muted-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <main className="min-w-0 flex-1 animate-fade-in">
          {active === "projects" && (
            <>
              <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t("settings.projects")}</h1>
              <MyProjectsSection />
            </>
          )}
          {active === "profile" && <UserProfileSection />}
          {active === "brain" && <AiRoutingSection />}
          {active === "integrations" && <IntegrationsSection />}
          {active === "tools" && <ToolsQuotasSection />}
          {active === "budget" && (
            <>
              <h1 className="mb-4 text-2xl font-semibold tracking-tight">Budget & coûts</h1>
              <div className="space-y-4">
                <QuotaStatusCard />
                <BudgetSection />
              </div>
            </>
          )}
          {active === "language" && (
            <>
              <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t("settings.language")}</h1>
              <Card className="border-border/40 bg-card/40 p-5">
                <LanguageToggle />
              </Card>
            </>
          )}
          {active === "appearance" && (
            <>
              <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t("settings.appearance")}</h1>
              <Card className="flex items-center justify-between border-border/40 bg-card/40 p-5">
                <div>
                  <div className="text-sm font-medium">Mode clair / sombre</div>
                  <p className="text-xs text-muted-foreground">Bascule l'interface entre les deux thèmes.</p>
                </div>
                <ThemeToggle />
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
