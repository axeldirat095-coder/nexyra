import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Layout, Smartphone, ArrowUpRight, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/showcase")({
  component: ShowcasePage,
  head: () => ({
    meta: [
      { title: "Nexyra AI — Showcase : projets faits avec Nexyra" },
      { name: "description", content: "Découvre les projets construits avec Nexyra AI par notre communauté : sites, web apps, outils internes." },
      { property: "og:title", content: "Showcase Nexyra AI" },
      { property: "og:description", content: "Galerie publique des projets faits avec Nexyra." },
    ],
  }),
});

const ICONS = { website: Globe, webapp: Layout, mobile_app: Smartphone } as const;
type ProjectType = keyof typeof ICONS;

interface PublicProject {
  id: string;
  name: string;
  description: string | null;
  type: ProjectType;
  updated_at: string;
}

function ShowcasePage() {
  const [items, setItems] = useState<PublicProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,name,description,type,updated_at")
        .eq("visibility", "public")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(60);
      if (!cancelled) {
        setItems((data ?? []) as PublicProject[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="starry-page-bg" />
      <div className="page-content-layer">
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-32 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
              <Sparkles className="h-3 w-3" /> Showcase communautaire
            </span>
            <h1 className="text-4xl font-bold tracking-tight gradient-text sm:text-5xl">
              Faits avec Nexyra
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Une sélection de projets publics construits par notre communauté.
              Passe ton projet en « public » dans /projects pour apparaître ici.
            </p>
          </motion.div>

          <div className="mt-12">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-40 animate-pulse rounded-2xl border border-border/40 bg-card/30" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-border/50 bg-card/40 p-12 text-center backdrop-blur-md">
                <p className="text-sm text-muted-foreground">
                  Aucun projet public pour l'instant. Sois le premier à partager le tien !
                </p>
                <Link to="/projects" className="btn-gradient mt-4 inline-flex h-10 items-center px-5 text-sm font-semibold">
                  Aller à mes projets
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((p, i) => {
                  const Icon = ICONS[p.type] ?? Layout;
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, delay: 0.05 * i }}
                      className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-5 backdrop-blur-md transition-all hover:border-primary/40 hover:shadow-[0_0_30px_oklch(0.6_0.22_270/15%)]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 ring-1 ring-primary/30">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <h3 className="mt-3 truncate text-base font-semibold text-foreground">{p.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {p.description ?? "Pas de description."}
                      </p>
                      <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                        {p.type} · {new Date(p.updated_at).toLocaleDateString("fr-FR")}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
