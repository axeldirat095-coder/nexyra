import { motion } from "framer-motion";

const steps = [
  {
    num: "01",
    title: "Décrivez",
    desc: "Expliquez votre besoin en langage naturel, par texte ou par voix. Pas besoin de prompt complexe.",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "L'IA agit",
    desc: "Nos agents collaborent entre eux pour accomplir la tâche. Recherche, rédaction, analyse, création — tout est automatisé.",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Résultats",
    desc: "Recevez des livrables de qualité professionnelle : rapports, emails, analyses, visuels. Prêts à utiliser.",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative px-4 py-24 sm:py-32">
      <div className="glow-orb left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 bg-glow-pink/10" />
      <div className="relative mx-auto max-w-5xl">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="brand-kicker text-sm font-semibold uppercase tracking-widest">Comment ça marche</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Trois étapes. <span className="gradient-text">Zéro friction.</span>
          </h2>
        </motion.div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              className="relative text-center"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              {i < steps.length - 1 && (
                <div className="pointer-events-none absolute right-0 top-12 hidden h-px w-full translate-x-1/2 bg-gradient-to-r from-border to-transparent md:block" />
              )}
               <div className="brand-icon mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
                {s.icon}
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{s.num}</span>
              <h3 className="mt-2 text-xl font-bold">{s.title}</h3>
              <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
