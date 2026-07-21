import { motion } from "framer-motion";
import { useState } from "react";

const plans = [
  {
    name: "Free",
    desc: "Pour découvrir Nexyra",
    monthly: 0,
    annual: 0,
    features: ["3 agents IA", "50 requêtes/mois", "Analyse d'images basique", "Support communautaire"],
    cta: "Démarrer gratuitement",
    featured: false,
  },
  {
    name: "Pro",
    desc: "Pour les créateurs ambitieux",
    monthly: 29,
    annual: 24,
    features: ["Agents illimités", "2 000 requêtes/mois", "Vision avancée", "Assistant vocal", "Support prioritaire", "API access"],
    cta: "Commencer l'essai Pro",
    featured: true,
  },
  {
    name: "Business",
    desc: "Pour les équipes et entreprises",
    monthly: 99,
    annual: 79,
    features: ["Tout de Pro", "Requêtes illimitées", "Agents personnalisés", "Intégrations avancées", "SSO & sécurité", "Account manager dédié"],
    cta: "Contacter les ventes",
    featured: false,
  },
];

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="relative px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="brand-kicker text-sm font-semibold uppercase tracking-widest">Tarifs</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Un plan pour chaque <span className="gradient-text">ambition</span>
          </h2>
        </motion.div>

        {/* Toggle */}
        <div className="mt-10 flex items-center justify-center gap-3">
          <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted-foreground"}`}>Mensuel</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative h-7 w-12 rounded-full transition-all ${annual ? "btn-gradient" : "bg-secondary"}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-foreground transition-transform ${annual ? "left-[calc(100%-1.625rem)]" : "left-0.5"}`}
            />
          </button>
          <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>
            Annuel <span className="brand-kicker inline-block text-xs">-20%</span>
          </span>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-3">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              className={`glass-card relative flex flex-col p-8 ${p.featured ? "ring-1 ring-primary/40 shadow-[0_0_40px_-10px_oklch(0.65_0.22_295_/_28%)]" : ""}`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              {p.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[image:var(--gradient-primary)] px-4 py-1 text-xs font-semibold text-primary-foreground">
                  Populaire
                </span>
              )}
              <h3 className="text-lg font-bold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">{annual ? p.annual : p.monthly}€</span>
                {p.monthly > 0 && <span className="text-sm text-muted-foreground">/mois</span>}
              </div>
              <ul className="mt-8 flex-1 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`mt-8 flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold transition-all ${
                  p.featured
                    ? "btn-gradient"
                    : "btn-brand-ghost"
                }`}
              >
                {p.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
