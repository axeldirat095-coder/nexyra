import { lazy, Suspense, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { ShieldAlert, ArrowLeft, Bot, Cpu, Wrench, Database, KeyRound, Activity, BarChart3, AlertTriangle, LineChart, Wallet, ShieldCheck, Loader2, Gauge, PiggyBank } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  AgentSection,
  ModelsSection,
  IntegrationsSection,
  ToolsSection,
  StorageSection,
} from "@/components/settings/sections";

// Lazy-load admin-only heavy sections (charts, tables) — gain perf au premier paint
const AnalyticsSection = lazy(() => import("@/components/admin/AnalyticsSection").then(m => ({ default: m.AnalyticsSection })));
const AuditErrorsSection = lazy(() => import("@/components/admin/AuditErrorsSection").then(m => ({ default: m.AuditErrorsSection })));
const ProductMetricsSection = lazy(() => import("@/components/admin/ProductMetricsSection").then(m => ({ default: m.ProductMetricsSection })));
const CostsSection = lazy(() => import("@/components/admin/CostsSection").then(m => ({ default: m.CostsSection })));
const QuotasSection = lazy(() => import("@/components/admin/QuotasSection").then(m => ({ default: m.QuotasSection })));
const ProjectQuotasSection = lazy(() => import("@/components/admin/ProjectQuotasSection").then(m => ({ default: m.ProjectQuotasSection })));
const ElenaObservabilitySection = lazy(() => import("@/components/admin/ElenaObservabilitySection").then(m => ({ default: m.ElenaObservabilitySection })));
const SavingsSection = lazy(() => import("@/components/admin/SavingsSection").then(m => ({ default: m.SavingsSection })));

const SectionFallback = () => (
  <div role="status" aria-label="Chargement de la section" className="flex h-40 items-center justify-center">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Console Admin — Nexyra Core" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type AdminSectionId =
  | "overview"
  | "elena-agent"
  | "elena-models"
  | "api-keys"
  | "tools"
  | "memory"
  | "analytics"
  | "audit"
  | "metrics"
  | "costs"
  | "quotas"
  | "project-quotas"
  | "elena-observability"
  | "savings";

const NAV: Array<{ id: AdminSectionId; label: string; desc: string; icon: typeof Bot }> = [
  { id: "overview", label: "Vue d'ensemble", desc: "État de la console", icon: Activity },
  { id: "elena-agent", label: "Elena — Agent", desc: "Prompts système maîtres", icon: Bot },
  { id: "elena-models", label: "Elena — Modèles", desc: "Routeur Auto/Éco/Std/Premium", icon: Cpu },
  { id: "api-keys", label: "Clés API perso", desc: "OpenAI, Claude, Gemini, HF, Replicate", icon: KeyRound },
  { id: "tools", label: "Outils & Open-source", desc: "MCP, GPU, scraping, vidéo", icon: Wrench },
  { id: "memory", label: "Mémoire & quotas", desc: "Stockage, conso, kill-switch", icon: Database },
  { id: "analytics", label: "Analytics & Live", desc: "Usage, coûts, tokens, logs temps réel", icon: BarChart3 },
  { id: "audit", label: "Audit & Erreurs", desc: "Actions sensibles + erreurs capturées", icon: AlertTriangle },
  { id: "metrics", label: "Métriques produit", desc: "DAU, rétention, funnel d'activation", icon: LineChart },
  { id: "costs", label: "Coûts & budget", desc: "Dépenses OpenAI, top projets, alertes", icon: Wallet },
  { id: "quotas", label: "Kill-switch quotas", desc: "Limites strictes par utilisateur", icon: ShieldCheck },
  { id: "project-quotas", label: "Quotas projets", desc: "Budget & mode brouillon par projet", icon: ShieldCheck },
  { id: "elena-observability", label: "Observabilité Elena", desc: "Lighthouse, erreurs, runs agent", icon: Gauge },
  { id: "savings", label: "Économies Elena", desc: "Tokens économisés (dédup, cache)", icon: PiggyBank },
];

function AdminPage() {
  const { isAdmin, loading } = useIsAdmin();
  const navigate = useNavigate();
  const [active, setActive] = useState<AdminSectionId>("overview");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Vérification d'accès...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md border-destructive/40 bg-destructive/5 p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold">Accès restreint</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cette console est réservée aux administrateurs Nexyra.
          </p>
          <Button onClick={() => navigate({ to: "/" })} variant="outline" className="mt-5">
            <ArrowLeft className="h-4 w-4" /> Retour à l'accueil
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-destructive/30 bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Retour</span>
            </Link>
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-destructive">
              <ShieldAlert className="h-3 w-3" /> Admin Nexyra Core
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Console interne · non publique</span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 md:px-6 md:py-8">
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="mb-3 px-2">
            <h2 className="text-lg font-semibold tracking-tight">Console Elena</h2>
            <p className="text-xs text-muted-foreground">Tes outils de constructeur</p>
          </div>
          <nav className="flex flex-col gap-1" aria-label="Navigation console admin">
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
                    isActive
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-card/50 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
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

        {/* Mobile tabs */}
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

        <main className="min-w-0 flex-1">
          {active === "overview" && <Overview />}
          {active === "elena-agent" && <AgentSection />}
          {active === "elena-models" && <ModelsSection />}
          {active === "api-keys" && <IntegrationsSection />}
          {active === "tools" && <ToolsSection />}
          {active === "memory" && <StorageSection />}
          {active === "analytics" && <Suspense fallback={<SectionFallback />}><AnalyticsSection /></Suspense>}
          {active === "audit" && <Suspense fallback={<SectionFallback />}><AuditErrorsSection /></Suspense>}
          {active === "metrics" && <Suspense fallback={<SectionFallback />}><ProductMetricsSection /></Suspense>}
          {active === "costs" && <Suspense fallback={<SectionFallback />}><CostsSection /></Suspense>}
          {active === "quotas" && <Suspense fallback={<SectionFallback />}><QuotasSection /></Suspense>}
          {active === "project-quotas" && <Suspense fallback={<SectionFallback />}><ProjectQuotasSection /></Suspense>}
          {active === "elena-observability" && <Suspense fallback={<SectionFallback />}><ElenaObservabilitySection /></Suspense>}
          {active === "savings" && <Suspense fallback={<SectionFallback />}><SavingsSection /></Suspense>}
        </main>
      </div>
      <Outlet />
    </div>
  );
}

function Overview() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Console Elena Core</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cockpit de paramétrage de l'agent maître Elena. Tout ce qui est ici alimente Elena
          côté constructeur (toi). Les utilisateurs finals n'auront jamais accès à ces réglages —
          ils auront leur propre version simplifiée plus tard.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/40 bg-card/40 p-5">
          <Bot className="mb-2 h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Agent Elena</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Personnalité, prompts système par type de projet (web, app, mobile).
          </p>
        </Card>
        <Card className="border-border/40 bg-card/40 p-5">
          <KeyRound className="mb-2 h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Clés API perso</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            OpenAI, Claude, Gemini, Hugging Face, Replicate. Chiffrées. Elena s'en sert.
          </p>
        </Card>
        <Card className="border-border/40 bg-card/40 p-5">
          <Wrench className="mb-2 h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Outils & open-source</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            À venir : MCP, location GPU, vidéo, scraping. Pour rendre Elena plus puissante.
          </p>
        </Card>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5 p-5">
        <h3 className="text-sm font-semibold text-amber-200">⚠️ Zone constructeur</h3>
        <p className="mt-1 text-xs text-amber-100/80">
          Toute modification ici impacte Elena pour TOUTES les conversations. Pas de panique :
          les anciens messages restent intacts, mais le prochain message utilisera les nouveaux
          réglages (modèle, prompt système, clés).
        </p>
      </Card>
    </div>
  );
}
