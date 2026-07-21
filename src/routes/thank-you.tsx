import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Check, KeyRound, Sparkles, Layers, LifeBuoy } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/thank-you")({
  component: ThankYouPage,
  head: () => ({
    meta: [
      { title: "Merci ! — Bienvenue chez Nexyra AI" },
      { name: "description", content: "Merci pour ton inscription. Voici les 4 étapes pour démarrer avec Nexyra AI en moins de 5 minutes." },
      { property: "og:title", content: "Bienvenue chez Nexyra AI" },
      { property: "og:description", content: "Onboarding guidé pour démarrer en 5 minutes." },
    ],
  }),
});

const STEPS = [
  {
    icon: KeyRound,
    title: "Connecte tes clés API",
    desc: "BYOK : OpenAI, Anthropic, Google, xAI… Tes factures restent chez toi.",
    cta: "Aller aux intégrations",
    to: "/integrations" as const,
  },
  {
    icon: Sparkles,
    title: "Lance ton premier projet",
    desc: "Décris ton idée à Elena, elle scaffold l'app complète en quelques minutes.",
    cta: "Ouvrir le chat",
    to: "/chat" as const,
  },
  {
    icon: Layers,
    title: "Ajoute des blocs sectoriels",
    desc: "Hero, Pricing, Auth, dashboard… importables en un clic depuis la marketplace.",
    cta: "Voir mes projets",
    to: "/projects" as const,
  },
  {
    icon: LifeBuoy,
    title: "Besoin d'aide ?",
    desc: "Notre équipe répond en moins de 4h en semaine, et en moins de 24h le week-end.",
    cta: "Mes paramètres",
    to: "/settings" as const,
  },
];

function ThankYouPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="starry-page-bg" />
      {/* Confetti subtle */}
      <div className="pointer-events-none absolute inset-x-0 top-16 mx-auto h-72 w-72 rounded-full bg-glow-violet/15 blur-3xl" />
      <div className="page-content-layer">
        <Navbar />
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-32 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}
              className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-primary shadow-[0_0_40px_oklch(0.65_0.18_160/35%)]"
            >
              <Check className="h-8 w-8 text-white" />
            </motion.div>
            <h1 className="text-4xl font-bold tracking-tight gradient-text sm:text-5xl">
              Merci, et bienvenue !
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Ton compte est prêt. Suis ces 4 étapes pour avoir ta première app live
              en moins de 5 minutes.
            </p>
          </motion.div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.15 + i * 0.08 }}
                className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-6 backdrop-blur-md transition-all hover:border-primary/40 hover:shadow-[0_0_30px_oklch(0.6_0.22_270/15%)]"
              >
                <div className="absolute right-4 top-4 text-xs font-semibold text-muted-foreground/40">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 ring-1 ring-primary/30">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                <Link
                  to={s.to}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium gradient-text transition-opacity hover:opacity-80"
                >
                  {s.cta}
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </motion.div>
            ))}
          </div>

          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Link to="/chat" className="btn-gradient inline-flex h-12 items-center px-8 text-base font-semibold">
              Démarrer maintenant
            </Link>
            <Link to="/" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
              ← Retour à l'accueil
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
