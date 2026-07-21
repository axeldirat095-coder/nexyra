import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";

export function Hero() {
  return (
    <section className="relative flex min-h-[90vh] items-center justify-center px-4 pt-16 pb-8">
      {/* Glow orbs */}
      <div className="glow-orb -top-40 -left-40 h-96 w-96 bg-glow-turquoise/20" />
      <div className="glow-orb -right-32 top-1/3 h-80 w-80 bg-glow-violet/22" />
      <div className="glow-orb -bottom-40 left-1/3 h-72 w-72 bg-glow-blue/18" />
      <div className="glow-orb bottom-8 right-1/4 h-64 w-64 bg-glow-pink/16" />

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
            <span className="brand-dot h-1.5 w-1.5 rounded-full animate-pulse" />
            Propulsé par l'IA multi-agents
          </span>
        </motion.div>

        <motion.div
          className="mt-8 flex flex-col items-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          <img
            src="/images/nexyra-logo-transparent.png"
            alt="Nexyra AI"
            className="h-28 sm:h-36 lg:h-44 object-contain drop-shadow-[0_0_30px_oklch(0.5_0.28_285/30%)]"
          />
        </motion.div>

        <motion.p
          className="mt-6 text-xl font-medium text-muted-foreground sm:text-2xl lg:text-3xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          Votre équipe IA, prête à l'emploi
        </motion.p>

        <motion.p
          className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground/80 sm:text-lg"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          Des agents intelligents qui automatisent vos tâches, analysent vos données et boostent votre productivité. Conçu pour les entrepreneurs et créateurs ambitieux.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          <a href="#pricing" className="btn-gradient inline-flex h-12 items-center gap-2 px-8 text-base">
            Commencer gratuitement
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
          <Link
            to="/dev3"
            className="inline-flex h-12 items-center gap-2 rounded-md bg-gradient-to-r from-blue-500 to-violet-500 px-8 text-base font-medium text-white shadow-lg transition-opacity hover:opacity-90"
          >
            🚀 Tester Elena V3
          </Link>
        </motion.div>

        <motion.div
          className="mt-10 flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55 }}
        >
          <span className="text-xs uppercase tracking-widest text-muted-foreground/60">
            Ou rejoins la waitlist privée
          </span>
          <WaitlistForm source="landing-hero" cta="Je veux un accès" />
        </motion.div>

      </div>
    </section>
  );
}
