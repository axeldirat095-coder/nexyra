import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plug, Sparkles, ExternalLink, Loader2, CheckCircle2, AlertCircle, Server, Trash2, RefreshCw, Clock } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/integrations")({
  component: IntegrationsPage,
  head: () => ({
    meta: [
      { title: "Mes intégrations — Nexyra" },
      { name: "description", content: "Connecte Elena à Gmail, Stripe, Notion, Slack et 30+ services pour qu'elle agisse à ta place." },
    ],
  }),
});

interface CatalogItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  auth_type: string;
  is_vip: boolean;
  docs_url: string | null;
  icon_url: string | null;
  brand_color: string | null;
}

interface ProjectIntegration {
  id: string;
  catalog_id: string;
  status: string;
  account_label: string | null;
  last_used_at: string | null;
  last_error: string | null;
}

interface McpServer {
  id: string;
  name: string;
  url: string;
  auth_kind: string;
  status: string;
  tools_count: number;
  last_error: string | null;
  last_checked_at: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  email: "📧 Email",
  payment: "💳 Paiement",
  crm: "🤝 CRM",
  communication: "💬 Communication",
  productivity: "⚡ Productivité",
  social: "🌐 Social",
  calendar: "📅 Calendrier",
  storage: "📁 Stockage",
  analytics: "📊 Analytics",
  marketing: "📣 Marketing",
};

function IntegrationsPage() {
  return (
    <RequireAuth>
      <IntegrationsView />
    </RequireAuth>
  );
}

function IntegrationsView() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [activeIntegrations, setActiveIntegrations] = useState<ProjectIntegration[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [vipOnly, setVipOnly] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: cat } = await supabase
      .from("integration_catalog")
      .select("id, slug, name, description, category, auth_type, is_vip, docs_url, icon_url, brand_color")
      .eq("is_active", true)
      .order("name", { ascending: true });
    setCatalog((cat ?? []) as CatalogItem[]);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: proj } = await supabase
        .from("projects")
        .select("id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (proj) {
        setProjectId(proj.id);
        const [{ data: integs }, { data: mcps }] = await Promise.all([
          supabase
            .from("project_integrations")
            .select("id, catalog_id, status, account_label, last_used_at, last_error")
            .eq("project_id", proj.id),
          supabase
            .from("project_mcp_servers")
            .select("id, name, url, auth_kind, status, tools_count, last_error, last_checked_at")
            .eq("project_id", proj.id)
            .order("created_at", { ascending: true }),
        ]);
        setActiveIntegrations((integs ?? []) as ProjectIntegration[]);
        setMcpServers((mcps ?? []) as McpServer[]);
      }
    }
    setLoading(false);
  }

  async function removeMcp(id: string) {
    if (!confirm("Supprimer ce serveur MCP ?")) return;
    await supabase.from("project_mcp_servers").delete().eq("id", id);
    setMcpServers((prev) => prev.filter((s) => s.id !== id));
  }

  const categories = useMemo(() => {
    const set = new Set(catalog.map((c) => c.category));
    return ["all", ...Array.from(set)];
  }, [catalog]);

  const filtered = useMemo(() => {
    return catalog.filter((c) => {
      if (vipOnly && !c.is_vip) return false;
      if (category !== "all" && c.category !== category) return false;
      if (search && !`${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [catalog, search, category, vipOnly]);

  const connected = useMemo(() => {
    const m = new Map(catalog.map((c) => [c.id, c]));
    return activeIntegrations
      .filter((i) => i.status === "active" || i.status === "error")
      .map((i) => ({ integ: i, item: m.get(i.catalog_id) }))
      .filter((r) => r.item);
  }, [catalog, activeIntegrations]);

  const activeMap = useMemo(() => {
    const m = new Map<string, ProjectIntegration>();
    activeIntegrations.forEach((i) => m.set(i.catalog_id, i));
    return m;
  }, [activeIntegrations]);

  async function handleConnect(item: CatalogItem) {
    if (!projectId) {
      alert("Crée d'abord un projet pour connecter des intégrations.");
      return;
    }
    // Crée l'instance project_integration si absente
    let integ = activeMap.get(item.id);
    if (!integ) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: proj } = await supabase
        .from("projects")
        .select("org_id, owner_id")
        .eq("id", projectId)
        .maybeSingle();
      if (!proj) return;
      const { data: created, error } = await supabase
        .from("project_integrations")
        .insert({
          project_id: projectId,
          catalog_id: item.id,
          owner_id: proj.owner_id,
          org_id: proj.org_id,
          status: "pending",
        })
        .select("id, catalog_id, status, account_label, last_used_at, last_error")
        .single();
      if (error) {
        alert(`Erreur : ${error.message}`);
        return;
      }
      integ = created as ProjectIntegration;
      setActiveIntegrations((prev) => [...prev, integ!]);
    }

    if (item.auth_type === "oauth2") {
      window.location.href = `/api/integrations/oauth/start?integration_id=${integ.id}`;
    } else {
      // API key — UI form à venir, en attendant on demande la clé via prompt
      const key = prompt(`Colle ta clé API ${item.name} (${item.docs_url ?? "voir doc"}) :`);
      if (!key) return;
      const { error } = await supabase.rpc("set_integration_secret", {
        _integration_id: integ.id,
        _kind: "api_key",
        _value: key,
      });
      if (error) {
        alert(`Erreur : ${error.message}`);
        return;
      }
      await supabase.from("project_integrations").update({ status: "active" }).eq("id", integ.id);
      void load();
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-12 max-w-7xl">
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30">
              <Plug className="size-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Mes intégrations</h1>
              <p className="text-muted-foreground mt-1">
                Connecte Elena à tes outils du quotidien — elle agit ensuite à ta place.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 text-sm text-muted-foreground">
            <Badge variant="secondary" className="gap-1"><Sparkles className="size-3" /> {catalog.length} services disponibles</Badge>
            <Badge variant="secondary">{activeIntegrations.filter((i) => i.status === "active").length} connectés</Badge>
            <Badge variant="secondary" className="gap-1"><Server className="size-3" /> {mcpServers.length} serveur{mcpServers.length > 1 ? "s" : ""} MCP</Badge>
          </div>
        </header>

        {/* Monitoring : intégrations actives + serveurs MCP */}
        {(connected.length > 0 || mcpServers.length > 0) && (
          <section className="mb-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-green-500" /> Intégrations actives
                </h2>
                <Badge variant="secondary">{connected.length}</Badge>
              </div>
              {connected.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune intégration active. Connecte un service ci-dessous.</p>
              ) : (
                <ul className="space-y-2">
                  {connected.map(({ integ, item }) => (
                    <li key={integ.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item!.icon_url && (
                          <img src={item!.icon_url} alt="" className="size-6 rounded bg-white/95 p-0.5 object-contain shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{item!.name}{integ.account_label && integ.account_label !== "default" ? ` · ${integ.account_label}` : ""}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" />
                            {integ.last_used_at ? new Date(integ.last_used_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "jamais utilisée"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {integ.status === "error" ? (
                          <Badge variant="destructive" className="gap-1 text-xs" title={integ.last_error ?? ""}>
                            <AlertCircle className="size-3" /> Erreur
                          </Badge>
                        ) : (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">OK</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Server className="size-4 text-primary" /> Serveurs MCP
                </h2>
                <Badge variant="secondary">{mcpServers.length}</Badge>
              </div>
              {mcpServers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun MCP. Demande à Elena : <em>« Connecte ce MCP : https://… »</em>
                </p>
              ) : (
                <ul className="space-y-2">
                  {mcpServers.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-2">
                          {s.name}
                          <Badge variant="outline" className="text-[10px] uppercase">{s.auth_kind}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{s.tools_count} tools</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate" title={s.url}>{s.url}</div>
                        {s.last_error && (
                          <div className="text-xs text-destructive mt-0.5 truncate" title={s.last_error}>⚠ {s.last_error}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.status === "active" ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">OK</Badge>
                        ) : s.status === "error" ? (
                          <Badge variant="destructive" className="text-xs">Erreur</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">…</Badge>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => removeMcp(s.id)} title="Supprimer">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="sm" variant="outline" className="w-full mt-4" onClick={() => void load()}>
                <RefreshCw className="size-3.5 mr-1.5" /> Rafraîchir
              </Button>
            </Card>
          </section>
        )}

        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un service…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={vipOnly ? "default" : "outline"}
            onClick={() => setVipOnly((v) => !v)}
          >
            <Sparkles className="size-4 mr-2" /> VIP uniquement
          </Button>
        </div>

        <Tabs value={category} onValueChange={setCategory} className="mb-6">
          <TabsList className="flex flex-wrap h-auto">
            {categories.map((c) => (
              <TabsTrigger key={c} value={c}>
                {c === "all" ? "Tous" : CATEGORY_LABELS[c] ?? c}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => {
              const integ = activeMap.get(item.id);
              const isActive = integ?.status === "active";
              const isPending = integ?.status === "pending";
              const isError = integ?.status === "error";
              return (
                <Card
                  key={item.id}
                  className="p-5 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10 group relative overflow-hidden"
                >
                  {item.is_vip && (
                    <div
                      aria-hidden
                      className="absolute -top-12 -right-12 size-32 rounded-full bg-primary/10 blur-2xl pointer-events-none"
                    />
                  )}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {item.icon_url ? (
                        <div
                          className="size-10 rounded-lg flex items-center justify-center overflow-hidden ring-1 ring-border/40 bg-white/95 p-1.5 shadow-sm"
                          style={item.brand_color ? { boxShadow: `0 0 18px -8px ${item.brand_color}` } : undefined}
                        >
                          <img
                            src={item.icon_url}
                            alt={`${item.name} logo`}
                            className="size-full object-contain"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget.parentElement as HTMLElement).innerHTML =
                                `<span class="text-foreground font-bold">${item.name.slice(0, 1).toUpperCase()}</span>`;
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          className="size-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center font-bold text-foreground"
                          style={item.brand_color ? { background: `linear-gradient(135deg, ${item.brand_color}40, ${item.brand_color}10)` } : undefined}
                        >
                          {item.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold flex items-center gap-1.5">
                          {item.name}
                          {item.is_vip && <Sparkles className="size-3 text-primary" />}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {CATEGORY_LABELS[item.category] ?? item.category} · {item.auth_type}
                        </p>
                      </div>
                    </div>
                    {isActive && (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/30 gap-1">
                        <CheckCircle2 className="size-3" /> Actif
                      </Badge>
                    )}
                    {isPending && <Badge variant="outline">En attente</Badge>}
                    {isError && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="size-3" /> Erreur
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[2.5rem]">
                    {item.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={isActive ? "outline" : "default"}
                      onClick={() => handleConnect(item)}
                      className="flex-1"
                    >
                      <Plug className="size-3.5 mr-1.5" />
                      {isActive ? "Reconnecter" : isPending ? "Finaliser" : "Connecter"}
                    </Button>
                    {item.docs_url && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={item.docs_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            Aucun service ne correspond à ta recherche.
          </div>
        )}

        <div className="mt-12 p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20">
          <h3 className="font-semibold text-lg mb-2">💡 Astuce</h3>
          <p className="text-sm text-muted-foreground">
            Tu peux aussi demander à Elena dans le chat : <em>« Connecte mon Gmail »</em> ou{" "}
            <em>« Liste les services CRM disponibles »</em>. Elle utilise les mêmes outils que cette page.
          </p>
          <Link to="/dev" className="text-sm text-primary mt-3 inline-block hover:underline">
            → Ouvrir Elena
          </Link>
        </div>
      </main>
    </div>
  );
}
