import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { motion } from "framer-motion";

export const Route = createFileRoute("/comparison")({
  component: ComparisonPage,
  head: () => ({
    meta: [
      { title: "Nexyra vs Lovable, v0, Bolt — Comparatif des plateformes IA" },
      {
        name: "description",
        content:
          "Comparez Nexyra AI à Lovable, v0 et Bolt : multi-providers BYOK, marketplace de blocs, tableau de pilotage, contrôle des coûts. Pourquoi Nexyra va plus loin.",
      },
      { property: "og:title", content: "Nexyra vs Lovable / v0 / Bolt — Comparatif" },
      {
        property: "og:description",
        content: "Tableau comparatif premium des plateformes de génération d'app IA.",
      },
    ],
  }),
});

type Cell = boolean | "partial" | string;

interface Row {
  feature: string;
  detail?: string;
  nexyra: Cell;
  lovable: Cell;
  v0: Cell;
  bolt: Cell;
}

const ROWS: Row[] = [
  {
    feature: "Multi-providers IA (BYOK)",
    detail: "OpenAI, Anthropic, Google, xAI, DeepSeek… clés à toi, factures à toi.",
    nexyra: "10+ providers",
    lovable: "partial",
    v0: false,
    bolt: "partial",
  },
  {
    feature: "Tableau de pilotage produit",
    detail: "Capabilities trackées (todo / in-progress / done) avec priorité & effort.",
    nexyra: true,
    lovable: false,
    v0: false,
    bolt: false,
  },
  {
    feature: "Marketplace de blocs sectoriels",
    detail: "Hero, Pricing, Auth pré-designés, importables en un clic.",
    nexyra: true,
    lovable: "partial",
    v0: true,
    bolt: false,
  },
  {
    feature: "Backend intégré (DB + Auth + Storage)",
    nexyra: true,
    lovable: true,
    v0: false,
    bolt: "partial",
  },
  {
    feature: "Edge functions auto-déployées",
    nexyra: true,
    lovable: true,
    v0: false,
    bolt: false,
  },
  {
    feature: "Outils image & vidéo natifs",
    detail: "Génération, édition, upscale, remove-bg, vidéo Luma/Veo.",
    nexyra: "10+ outils",
    lovable: "partial",
    v0: false,
    bolt: false,
  },
  {
    feature: "Cross-project memory",
    detail: "Elena se souvient de tes préférences entre projets.",
    nexyra: true,
    lovable: true,
    v0: false,
    bolt: false,
  },
  {
    feature: "Mode 'outil perso' vs 'public'",
    detail: "Bascule entre app interne et SaaS public en un toggle.",
    nexyra: "À venir",
    lovable: false,
    v0: false,
    bolt: false,
  },
  {
    feature: "Transparence des quotas / coûts",
    nexyra: true,
    lovable: "partial",
    v0: false,
    bolt: "partial",
  },
  {
    feature: "Open source friendly",
    detail: "Export GitHub, code lisible, pas de lock-in.",
    nexyra: true,
    lovable: true,
    v0: true,
    bolt: true,
  },
];

function CellRender({ value }: { value: Cell }) {
  if (value === true) return <Check className="mx-auto h-5 w-5 text-emerald-400" />;
  if (value === false) return <X className="mx-auto h-5 w-5 text-muted-foreground/40" />;
  if (value === "partial")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
        Partiel
      </span>
    );
  return <span className="text-xs font-medium text-foreground">{value}</span>;
}

function ComparisonPage() {
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
              <Sparkles className="h-3 w-3" /> Comparatif honnête
            </span>
            <h1 className="text-4xl font-bold tracking-tight gradient-text sm:text-5xl">
              Nexyra vs Lovable, v0 & Bolt
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Toutes ces plateformes sont géniales. Voici, sans langue de bois, là où Nexyra
              va un cran plus loin — et là où la concurrence reste au niveau.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-12 overflow-hidden rounded-2xl border border-border/50 bg-card/40 backdrop-blur-md"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4 font-medium">Critère</th>
                    <th className="px-5 py-4 text-center font-semibold gradient-text">Nexyra</th>
                    <th className="px-5 py-4 text-center font-medium">Lovable</th>
                    <th className="px-5 py-4 text-center font-medium">v0</th>
                    <th className="px-5 py-4 text-center font-medium">Bolt</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={`border-t border-border/30 ${i % 2 === 0 ? "bg-transparent" : "bg-secondary/10"}`}
                    >
                      <td className="px-5 py-4">
                        <div className="font-medium text-foreground">{row.feature}</div>
                        {row.detail ? (
                          <div className="mt-0.5 text-xs text-muted-foreground/70">{row.detail}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-center"><CellRender value={row.nexyra} /></td>
                      <td className="px-5 py-4 text-center"><CellRender value={row.lovable} /></td>
                      <td className="px-5 py-4 text-center"><CellRender value={row.v0} /></td>
                      <td className="px-5 py-4 text-center"><CellRender value={row.bolt} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-12 flex flex-col items-center gap-4 text-center"
          >
            <p className="max-w-xl text-sm text-muted-foreground">
              Comparatif basé sur les fonctionnalités publiques de chaque plateforme à mai 2026.
              Tu vois une erreur ? Écris-nous, on corrige sous 24 h.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/auth" search={{ redirect: undefined }} className="btn-gradient inline-flex h-11 items-center px-6 text-sm font-semibold">
                Tester Nexyra gratuitement
              </Link>
              <Link to="/" className="btn-brand-ghost inline-flex h-11 items-center px-6 text-sm">
                Retour à l'accueil
              </Link>
            </div>
          </motion.div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
