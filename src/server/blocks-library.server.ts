/**
 * Premium TSX Blocks Library — used by Elena's `inspiration_lookup` tool.
 *
 * Each block is a SHIP-READY TSX snippet using semantic design tokens
 * (no hardcoded text-white / bg-black). Elena copies the snippet then
 * adapts the copy / images to the user's domain.
 *
 * Conventions enforced in every block:
 *  - Tailwind v4 + shadcn primitives, semantic tokens only.
 *  - Images are imported via `import xxx from "@/assets/generated/xxx"` placeholders.
 *  - All sections respect mobile-first responsive (sm/md/lg breakpoints).
 *  - Premium polish: gradients, glow shadows, subtle motion hints (transition-all).
 */

export interface PremiumBlock {
  /** Stable id (e.g. "saas-hero-mesh"). */
  id: string;
  /** Short human label. */
  name: string;
  /** When to use it. */
  description: string;
  /** Domain: saas | website | mobile-app | dashboard. */
  domain: "saas" | "website" | "mobile-app" | "dashboard";
  /** Tags for ranking (e.g. ["hero","gradient","mesh"]). */
  tags: string[];
  /** Suggested image generation prompts (so Elena can fire them in parallel). */
  images?: { variable: string; prompt: string; aspect?: string; hero?: boolean }[];
  /** TSX source code. Self-contained except for imports it declares at top. */
  tsx: string;
}

/* --------------------------------------------------------------------- */
/* SAAS — Landing pages                                                   */
/* --------------------------------------------------------------------- */

const SAAS_HERO_MESH: PremiumBlock = {
  id: "saas-hero-mesh",
  name: "SaaS Hero — Gradient mesh + product preview",
  description:
    "Hero plein écran avec mesh gradient animé, badge nouveauté, H1 XXL, double CTA, aperçu produit en miroir flottant.",
  domain: "saas",
  tags: ["hero", "gradient", "mesh", "premium-dark"],
  images: [
    {
      variable: "heroProduct",
      hero: true,
      prompt:
        "Premium SaaS dashboard UI screenshot, glass morphism, dark navy background with subtle violet gradient, charts and KPI cards visible, ultra-detailed, 4K, marketing shot",
      aspect: "16:9",
    },
  ],
  tsx: `import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroProduct from "@/assets/generated/heroProduct";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 pb-32">
      {/* Mesh gradient background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-primary/30 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-[500px] w-[500px] rounded-full bg-accent/30 blur-[120px]" />
      </div>

      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Nouveau · Disponible en bêta privée
          </div>

          <h1 className="text-balance bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text text-[clamp(2.5rem,7vw,5rem)] font-bold leading-[1.05] tracking-tight text-transparent">
            Construisez plus vite.<br />
            Itérez sans friction.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            La plateforme tout-en-un qui réunit votre équipe, vos données et vos workflows dans un seul espace lumineux.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="group h-12 gap-2 bg-gradient-to-r from-primary to-accent px-8 text-base shadow-[0_0_40px_-10px_hsl(var(--primary))]">
              Commencer gratuitement
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <Button size="lg" variant="ghost" className="h-12 px-8 text-base">
              Voir la démo
            </Button>
          </div>
        </div>

        <div className="relative mx-auto mt-20 max-w-6xl">
          <div className="absolute inset-x-12 -bottom-4 h-32 rounded-full bg-primary/40 blur-3xl" />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <img src={heroProduct} alt="Aperçu du produit" className="w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_FEATURES_BENTO: PremiumBlock = {
  id: "saas-features-bento",
  name: "SaaS Features — Bento grid 6 cards",
  description:
    "Grille bento 3 colonnes / 6 features (1 large + 5 normales), icônes Lucide colorées, micro-illustrations.",
  domain: "saas",
  tags: ["features", "bento", "grid"],
  tsx: `import { Zap, Shield, Workflow, BarChart3, Users, Globe } from "lucide-react";

const features = [
  { icon: Zap, title: "Ultra rapide", desc: "Réponse < 50ms même à 1M d'événements/jour.", span: "md:col-span-2" },
  { icon: Shield, title: "Sécurisé", desc: "SOC2, chiffrement AES-256." },
  { icon: Workflow, title: "Automatisations", desc: "Triggers, webhooks, conditions." },
  { icon: BarChart3, title: "Analytics live", desc: "KPI temps réel + cohortes." },
  { icon: Users, title: "Collaboratif", desc: "Permissions fines par espace." },
  { icon: Globe, title: "Multi-régions", desc: "EU, US, APAC sans config." },
];

export function Features() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-6">
        <div className="mb-14 max-w-2xl">
          <p className="mb-3 text-sm font-medium text-primary">Tout ce qu'il vous faut</p>
          <h2 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Une plateforme conçue pour les équipes ambitieuses
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={i}
              className={\`group relative overflow-hidden rounded-2xl border border-border bg-card/60 p-7 transition-all hover:border-primary/40 hover:shadow-[0_0_30px_-12px_hsl(var(--primary))] \${f.span ?? ""}\`}
            >
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_PRICING_3COLS: PremiumBlock = {
  id: "saas-pricing-3cols",
  name: "SaaS Pricing — 3 plans + toggle annuel",
  description: "3 cartes tarifs, plan central surélevé avec ring glow, toggle Mensuel/Annuel.",
  domain: "saas",
  tags: ["pricing", "plans"],
  tsx: `import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  { name: "Starter", price: { m: 0, y: 0 }, desc: "Pour découvrir", features: ["1 projet", "Jusqu'à 3 utilisateurs", "Support communautaire"], cta: "Commencer", highlight: false },
  { name: "Pro", price: { m: 29, y: 23 }, desc: "Pour les équipes en croissance", features: ["Projets illimités", "Jusqu'à 25 utilisateurs", "Support prioritaire", "API & webhooks"], cta: "Essayer 14 jours", highlight: true },
  { name: "Entreprise", price: { m: 99, y: 79 }, desc: "Sur-mesure", features: ["SLA 99.99%", "SSO + SAML", "Dédié + onboarding"], cta: "Nous contacter", highlight: false },
];

export function Pricing() {
  const [annual, setAnnual] = useState(true);
  return (
    <section className="py-24">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Des tarifs simples et transparents</h2>
          <p className="mt-4 text-muted-foreground">Aucun frais caché, annulable à tout moment.</p>

          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border bg-card p-1">
            <button onClick={() => setAnnual(false)} className={\`rounded-full px-4 py-1.5 text-sm transition \${!annual ? "bg-primary text-primary-foreground" : "text-muted-foreground"}\`}>Mensuel</button>
            <button onClick={() => setAnnual(true)} className={\`rounded-full px-4 py-1.5 text-sm transition \${annual ? "bg-primary text-primary-foreground" : "text-muted-foreground"}\`}>
              Annuel <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">−20%</span>
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={\`relative rounded-2xl border bg-card p-8 transition-all \${p.highlight ? "scale-[1.03] border-primary shadow-[0_0_60px_-15px_hsl(var(--primary))]" : "border-border"}\`}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-accent px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Recommandé
                </div>
              )}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight">{annual ? p.price.y : p.price.m}€</span>
                <span className="text-sm text-muted-foreground">/mois</span>
              </div>
              <Button className={\`mt-6 h-11 w-full \${p.highlight ? "bg-gradient-to-r from-primary to-accent" : ""}\`} variant={p.highlight ? "default" : "outline"}>
                {p.cta}
              </Button>
              <ul className="mt-8 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_TESTIMONIALS_MARQUEE: PremiumBlock = {
  id: "saas-testimonials-marquee",
  name: "Testimonials — Marquee 2 lignes",
  description: "2 lignes de témoignages qui défilent en sens inverse, cards avec avatar+citation.",
  domain: "saas",
  tags: ["testimonials", "social-proof"],
  tsx: `const quotes = [
  { name: "Marie L.", role: "PM @ Notion", quote: "On a divisé par 3 le temps de mise en prod. Magique." },
  { name: "Thomas R.", role: "CTO @ Alan", quote: "Le ratio valeur/prix est imbattable sur ce marché." },
  { name: "Sarah K.", role: "Head of Ops", quote: "Mes équipes ne peuvent plus s'en passer en 2 semaines." },
  { name: "Julien M.", role: "Founder @ Doctolib", quote: "L'API est d'une élégance rare." },
  { name: "Léa B.", role: "Designer", quote: "Enfin un outil qui respecte nos workflows." },
  { name: "Antoine D.", role: "VP Eng", quote: "Adopté en 1 semaine, plébiscité dès la 2e." },
];

function Card({ q }: { q: typeof quotes[number] }) {
  return (
    <div className="w-[320px] shrink-0 rounded-2xl border border-border bg-card/60 p-5 backdrop-blur">
      <p className="text-sm leading-relaxed">"{q.quote}"</p>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-accent" />
        <div>
          <div className="text-sm font-medium">{q.name}</div>
          <div className="text-xs text-muted-foreground">{q.role}</div>
        </div>
      </div>
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="overflow-hidden py-24">
      <div className="container mx-auto mb-12 px-6 text-center">
        <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Ils en parlent mieux que nous</h2>
      </div>
      <div className="space-y-4">
        <div className="flex animate-[scroll-x_40s_linear_infinite] gap-4">
          {[...quotes, ...quotes].map((q, i) => <Card key={i} q={q} />)}
        </div>
        <div className="flex animate-[scroll-x_40s_linear_infinite_reverse] gap-4">
          {[...quotes, ...quotes].reverse().map((q, i) => <Card key={i} q={q} />)}
        </div>
      </div>
      <style>{\`@keyframes scroll-x { to { transform: translateX(-50%); } }\`}</style>
    </section>
  );
}
`,
};

const SAAS_CTA_GRADIENT: PremiumBlock = {
  id: "saas-cta-gradient",
  name: "CTA section — Gradient pleine largeur",
  description: "Section CTA finale, gradient vif, padding y-32, double bouton.",
  domain: "saas",
  tags: ["cta", "conversion"],
  tsx: `import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section className="container mx-auto px-6 py-20">
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/20 via-card to-accent/20 px-8 py-20 text-center">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.2),transparent_70%)]" />
        <h2 className="mx-auto max-w-2xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Prêt à passer la vitesse supérieure ?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Rejoignez les 12 000 équipes qui ont fait le choix de la simplicité.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" className="h-12 gap-2 bg-gradient-to-r from-primary to-accent px-8">
            Démarrer maintenant <ArrowRight className="h-4 w-4" />
          </Button>
          <Button size="lg" variant="ghost" className="h-12 px-8">Parler à un expert</Button>
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_NAVBAR: PremiumBlock = {
  id: "saas-navbar",
  name: "SaaS Navbar — Sticky blur",
  description: "Navbar sticky avec backdrop-blur, logo + nav center + CTA droite, mobile drawer.",
  domain: "saas",
  tags: ["navbar", "header"],
  tsx: `import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const links = [
  { label: "Produit", href: "#produit" },
  { label: "Tarifs", href: "#tarifs" },
  { label: "Clients", href: "#clients" },
  { label: "Ressources", href: "#ressources" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-accent" />
          <span className="text-base font-semibold">Atlas</span>
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.label} href={l.href} className="text-sm text-muted-foreground transition hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Button variant="ghost" size="sm">Connexion</Button>
          <Button size="sm" className="bg-gradient-to-r from-primary to-accent">Essayer gratuit</Button>
        </div>
        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <div className="container mx-auto flex flex-col gap-1 px-6 py-4">
            {links.map((l) => (
              <a key={l.label} href={l.href} className="rounded-lg px-3 py-2.5 text-sm transition hover:bg-muted">
                {l.label}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm">Connexion</Button>
              <Button size="sm" className="bg-gradient-to-r from-primary to-accent">Essayer</Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
`,
};

const SAAS_FOOTER: PremiumBlock = {
  id: "saas-footer",
  name: "SaaS Footer — 4 colonnes + status",
  description: "Footer 4 colonnes + colonne brand, newsletter, status pill, copyright.",
  domain: "saas",
  tags: ["footer"],
  tsx: `import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const groups = [
  { title: "Produit", links: ["Fonctionnalités", "Tarifs", "Intégrations", "Changelog"] },
  { title: "Ressources", links: ["Documentation", "Guides", "API", "Status"] },
  { title: "Entreprise", links: ["À propos", "Blog", "Carrières", "Presse"] },
  { title: "Légal", links: ["Confidentialité", "CGU", "Cookies", "RGPD"] },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/30">
      <div className="container mx-auto px-6 py-16">
        <div className="grid gap-10 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-accent" />
              <span className="text-base font-semibold">Atlas</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              La plateforme tout-en-un pour les équipes qui livrent vite et bien.
            </p>
            <form className="mt-5 flex max-w-sm gap-2">
              <Input type="email" placeholder="vous@email.com" className="h-10" />
              <Button size="sm" className="h-10 bg-gradient-to-r from-primary to-accent">S'abonner</Button>
            </form>
          </div>
          {groups.map((g) => (
            <div key={g.title}>
              <h4 className="mb-4 text-sm font-semibold">{g.title}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {g.links.map((l) => (
                  <li key={l}><a href="#" className="transition hover:text-foreground">{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Atlas. Tous droits réservés.</p>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  );
}
`,
};

/* --------------------------------------------------------------------- */
/* SAAS — Extension pack (13 nouveaux blocs)                              */
/* --------------------------------------------------------------------- */

const SAAS_STATS_STRIP: PremiumBlock = {
  id: "saas-stats-strip",
  name: "SaaS Stats — 4 chiffres clés",
  description: "Bandeau stats 4 colonnes, gros chiffres gradient, label sobre.",
  domain: "saas",
  tags: ["stats", "social-proof"],
  tsx: `const stats = [
  { v: "12 000+", l: "Équipes actives" },
  { v: "99,99%", l: "Uptime SLA" },
  { v: "180", l: "Pays" },
  { v: "4,9/5", l: "Note clients" },
];

export function Stats() {
  return (
    <section className="border-y border-border bg-card/30 py-14">
      <div className="container mx-auto grid grid-cols-2 gap-8 px-6 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="text-center">
            <p className="bg-gradient-to-br from-primary to-accent bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">{s.v}</p>
            <p className="mt-2 text-sm text-muted-foreground">{s.l}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
`,
};

const SAAS_FAQ_ACCORDION: PremiumBlock = {
  id: "saas-faq-accordion",
  name: "SaaS FAQ — Accordion 6 questions",
  description: "FAQ pleine largeur, accordions chevron, padding aéré.",
  domain: "saas",
  tags: ["faq"],
  tsx: `import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  { q: "Combien de temps pour démarrer ?", a: "Moins de 5 minutes. Inscription, import, et c'est parti." },
  { q: "Puis-je annuler à tout moment ?", a: "Oui, sans frais ni engagement. Aucune question posée." },
  { q: "Mes données sont-elles sécurisées ?", a: "Chiffrement AES-256, hébergement EU, conformité SOC2 Type II." },
  { q: "Existe-t-il une API ?", a: "API REST + webhooks dispo dès le plan Pro. SDK JS / Python / Go." },
  { q: "Proposez-vous une période d'essai ?", a: "14 jours gratuits sur le plan Pro, sans carte bancaire." },
  { q: "Comment fonctionne le support ?", a: "Chat in-app pour Pro, support dédié + SLA pour Entreprise." },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="py-24">
      <div className="container mx-auto max-w-3xl px-6">
        <h2 className="mb-3 text-center text-4xl font-bold tracking-tight sm:text-5xl">Questions fréquentes</h2>
        <p className="mb-12 text-center text-muted-foreground">Vous ne trouvez pas votre réponse ? Écrivez-nous.</p>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card/60">
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-muted/30">
                <span className="font-medium">{f.q}</span>
                <ChevronDown className={\`h-4 w-4 shrink-0 text-muted-foreground transition \${open === i ? "rotate-180" : ""}\`} />
              </button>
              {open === i && <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground">{f.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_LOGOS_CLOUD: PremiumBlock = {
  id: "saas-logos-cloud",
  name: "SaaS Logos cloud — Trusted by",
  description: "Bandeau logos clients en niveaux de gris, 6 colonnes responsive.",
  domain: "saas",
  tags: ["logos", "social-proof"],
  tsx: `const logos = ["Notion", "Alan", "Doctolib", "Qonto", "Algolia", "Swile"];

export function LogosCloud() {
  return (
    <section className="py-16">
      <div className="container mx-auto px-6">
        <p className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Ils nous font confiance
        </p>
        <div className="grid grid-cols-3 items-center gap-x-10 gap-y-6 opacity-70 md:grid-cols-6">
          {logos.map((l) => (
            <div key={l} className="text-center text-lg font-semibold tracking-tight text-muted-foreground transition hover:text-foreground">{l}</div>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_COMPARISON_TABLE: PremiumBlock = {
  id: "saas-comparison-table",
  name: "SaaS Comparison — Vs concurrents",
  description: "Tableau comparatif 4 colonnes (Vous, Compétiteur A/B/C), 6 lignes features.",
  domain: "saas",
  tags: ["comparison", "table"],
  tsx: `import { Check, X } from "lucide-react";

const cols = ["Atlas", "Tool A", "Tool B", "Tool C"];
const rows = [
  { f: "Setup en < 5 min", v: [true, false, true, false] },
  { f: "API + webhooks", v: [true, true, false, false] },
  { f: "Support FR", v: [true, false, false, true] },
  { f: "Hébergement EU", v: [true, false, true, false] },
  { f: "SSO / SAML", v: [true, true, false, false] },
  { f: "Tarif < 30 €/mois", v: [true, false, false, true] },
];

export function Comparison() {
  return (
    <section className="py-24">
      <div className="container mx-auto max-w-5xl px-6">
        <h2 className="mb-12 text-center text-4xl font-bold tracking-tight sm:text-5xl">Pourquoi nous choisir ?</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fonctionnalité</th>
                {cols.map((c, i) => (
                  <th key={c} className={\`px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider \${i === 0 ? "text-primary" : "text-muted-foreground"}\`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.f}>
                  <td className="px-5 py-4 font-medium">{r.f}</td>
                  {r.v.map((v, i) => (
                    <td key={i} className="px-5 py-4 text-center">
                      {v ? <Check className={\`mx-auto h-4 w-4 \${i === 0 ? "text-primary" : "text-muted-foreground"}\`} /> : <X className="mx-auto h-4 w-4 text-muted-foreground/40" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_BLOG_GRID: PremiumBlock = {
  id: "saas-blog-grid",
  name: "SaaS Blog — Grille 3 articles",
  description: "Grille 3 cartes blog avec image cover, catégorie, titre, date.",
  domain: "saas",
  tags: ["blog", "content"],
  images: [
    { variable: "post1", prompt: "Abstract editorial cover, gradient blue to violet, modern minimal", aspect: "16:9" },
    { variable: "post2", prompt: "Abstract editorial cover, dark grain texture, premium magazine", aspect: "16:9" },
    { variable: "post3", prompt: "Abstract editorial cover, soft light geometric shapes, modern", aspect: "16:9" },
  ],
  tsx: `import post1 from "@/assets/generated/post1";
import post2 from "@/assets/generated/post2";
import post3 from "@/assets/generated/post3";

const posts = [
  { img: post1, cat: "Produit", title: "5 patterns UX qui doublent la conversion", date: "12 mars 2025", read: "6 min" },
  { img: post2, cat: "Engineering", title: "Comment on a réduit nos coûts cloud de 40%", date: "28 fév. 2025", read: "9 min" },
  { img: post3, cat: "Culture", title: "Notre méthode de remote-first asynchrone", date: "14 fév. 2025", read: "5 min" },
];

export function BlogGrid() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-6">
        <div className="mb-12 flex items-end justify-between gap-4">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Du blog</h2>
          <a href="#" className="text-sm font-medium text-primary">Tous les articles →</a>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {posts.map((p) => (
            <a key={p.title} href="#" className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/40">
              <div className="aspect-[16/9] overflow-hidden">
                <img src={p.img} alt={p.title} className="h-full w-full object-cover transition group-hover:scale-105" />
              </div>
              <div className="p-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">{p.cat}</p>
                <h3 className="text-lg font-semibold leading-snug transition group-hover:text-primary">{p.title}</h3>
                <p className="mt-3 text-xs text-muted-foreground">{p.date} · {p.read} de lecture</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_TEAM_GRID: PremiumBlock = {
  id: "saas-team-grid",
  name: "SaaS Team — Grille membres",
  description: "Grille 4 colonnes membres : photo carrée, nom, rôle, lien LinkedIn.",
  domain: "saas",
  tags: ["team", "about"],
  tsx: `import { Linkedin } from "lucide-react";

const team = [
  { name: "Marie Dubois", role: "CEO & Co-fondatrice" },
  { name: "Thomas Renaud", role: "CTO & Co-fondateur" },
  { name: "Sarah Khan", role: "Head of Product" },
  { name: "Julien Martin", role: "Head of Engineering" },
];

export function Team() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">L'équipe</h2>
          <p className="mt-4 text-muted-foreground">Une équipe pluridisciplinaire qui partage la même obsession du détail.</p>
        </div>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {team.map((m) => (
            <div key={m.name} className="group">
              <div className="aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30" />
              <div className="mt-4 flex items-start justify-between">
                <div>
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                </div>
                <a href="#" aria-label="LinkedIn" className="text-muted-foreground transition hover:text-primary">
                  <Linkedin className="h-4 w-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_CONTACT_FORM: PremiumBlock = {
  id: "saas-contact-form",
  name: "SaaS Contact — Form + infos split",
  description: "Section contact 50/50 : infos (mail, tel, adresse) gauche, formulaire droite.",
  domain: "saas",
  tags: ["contact", "form"],
  tsx: `import { Mail, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function Contact() {
  return (
    <section className="py-24">
      <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Parlons-en.</h2>
          <p className="mt-4 max-w-md text-muted-foreground">Une question, un projet ? Notre équipe vous répond sous 24h ouvrées.</p>
          <ul className="mt-10 space-y-5">
            <li className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><Mail className="h-4 w-4" /></div>
              <div><p className="text-sm text-muted-foreground">Email</p><p className="font-medium">contact@atlas.app</p></div>
            </li>
            <li className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><Phone className="h-4 w-4" /></div>
              <div><p className="text-sm text-muted-foreground">Téléphone</p><p className="font-medium">+33 1 23 45 67 89</p></div>
            </li>
            <li className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><MapPin className="h-4 w-4" /></div>
              <div><p className="text-sm text-muted-foreground">Adresse</p><p className="font-medium">12 rue Réaumur, 75002 Paris</p></div>
            </li>
          </ul>
        </div>
        <form className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input placeholder="Prénom" className="h-11" />
            <Input placeholder="Nom" className="h-11" />
          </div>
          <Input type="email" placeholder="Email pro" className="h-11" />
          <Input placeholder="Société" className="h-11" />
          <Textarea placeholder="Votre message..." rows={5} />
          <Button className="h-11 w-full bg-gradient-to-r from-primary to-accent">Envoyer</Button>
        </form>
      </div>
    </section>
  );
}
`,
};

const SAAS_NEWSLETTER: PremiumBlock = {
  id: "saas-newsletter",
  name: "SaaS Newsletter — Card centrée",
  description: "Card newsletter centrée, gradient subtil, input + bouton inline.",
  domain: "saas",
  tags: ["newsletter", "cta"],
  tsx: `import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";

export function Newsletter() {
  return (
    <section className="container mx-auto px-6 py-20">
      <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-gradient-to-br from-card via-card to-primary/10 p-10 text-center">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Mail className="h-5 w-5" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight">Recevez nos meilleurs articles</h2>
        <p className="mt-3 text-muted-foreground">1 email par semaine. Zéro spam. Désinscription en 1 clic.</p>
        <form className="mx-auto mt-6 flex max-w-md gap-2">
          <Input type="email" placeholder="vous@email.com" className="h-11" />
          <Button className="h-11 bg-gradient-to-r from-primary to-accent">S'inscrire</Button>
        </form>
      </div>
    </section>
  );
}
`,
};

const SAAS_VIDEO_HERO: PremiumBlock = {
  id: "saas-video-hero",
  name: "SaaS Hero — Vidéo + play overlay",
  description: "Hero avec thumbnail vidéo plein bleed, play button gradient, overlay sombre.",
  domain: "saas",
  tags: ["hero", "video"],
  images: [
    { variable: "videoThumb", hero: true, prompt: "Cinematic product demo screenshot, premium SaaS dashboard, dark mode with violet accents, ultra-detailed, magazine quality", aspect: "16:9" },
  ],
  tsx: `import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import videoThumb from "@/assets/generated/videoThumb";

export function VideoHero() {
  return (
    <section className="container mx-auto px-6 py-20">
      <div className="mx-auto mb-12 max-w-3xl text-center">
        <h1 className="text-balance text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-tight">
          Voyez Atlas en action
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">2 minutes pour comprendre comment on transforme votre stack.</p>
        <Button size="lg" className="mt-8 h-12 bg-gradient-to-r from-primary to-accent px-8">Démarrer gratuitement</Button>
      </div>
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-border shadow-2xl">
        <img src={videoThumb} alt="Démo produit" className="w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        <button aria-label="Lire la démo" className="group absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute inset-0 -m-4 animate-ping rounded-full bg-primary/40" />
          <div className="relative rounded-full bg-gradient-to-br from-primary to-accent p-5 shadow-[0_0_60px_-10px_hsl(var(--primary))] transition group-hover:scale-110">
            <Play className="h-6 w-6 fill-primary-foreground text-primary-foreground" />
          </div>
        </button>
      </div>
    </section>
  );
}
`,
};

const SAAS_TIMELINE: PremiumBlock = {
  id: "saas-timeline",
  name: "SaaS Timeline — Process 4 étapes",
  description: "Timeline verticale 4 étapes, dots gradient, ligne pointillée.",
  domain: "saas",
  tags: ["timeline", "process"],
  tsx: `const steps = [
  { n: "01", t: "Inscription", d: "Créez votre espace en 30 secondes, sans carte bancaire." },
  { n: "02", t: "Connexion des outils", d: "Plus de 80 intégrations natives, branchées en un clic." },
  { n: "03", t: "Configuration assistée", d: "Notre IA configure vos workflows à partir de votre stack." },
  { n: "04", t: "Production", d: "Vous êtes en prod en moins d'une journée. On vous accompagne." },
];

export function Timeline() {
  return (
    <section className="py-24">
      <div className="container mx-auto max-w-3xl px-6">
        <h2 className="mb-14 text-center text-4xl font-bold tracking-tight sm:text-5xl">Comment ça marche</h2>
        <ol className="relative space-y-10 border-l-2 border-dashed border-border pl-10">
          {steps.map((s) => (
            <li key={s.n} className="relative">
              <span className="absolute -left-[52px] flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-bold text-primary-foreground shadow-[0_0_20px_-4px_hsl(var(--primary))]">
                {s.n}
              </span>
              <h3 className="text-xl font-semibold">{s.t}</h3>
              <p className="mt-2 text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
`,
};

const SAAS_INTEGRATIONS_GRID: PremiumBlock = {
  id: "saas-integrations-grid",
  name: "SaaS Integrations — Grille 12 logos",
  description: "Grille 6 colonnes, cards intégrations avec nom + catégorie.",
  domain: "saas",
  tags: ["integrations"],
  tsx: `const integrations = [
  "Slack", "Notion", "GitHub", "Linear", "Stripe", "Figma",
  "Google", "Zapier", "Airtable", "HubSpot", "Salesforce", "Intercom",
];

export function Integrations() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 text-sm font-medium text-primary">Écosystème ouvert</p>
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">+80 intégrations natives</h2>
          <p className="mt-4 text-muted-foreground">Connectez tous vos outils en 1 clic. Aucun code requis.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {integrations.map((i) => (
            <div key={i} className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 p-4 text-center transition hover:border-primary/40 hover:bg-card">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/40 to-accent/40 transition group-hover:from-primary group-hover:to-accent" />
              <span className="text-xs font-medium">{i}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_BENTO_LARGE: PremiumBlock = {
  id: "saas-bento-large",
  name: "SaaS Bento — Grid asymétrique premium",
  description: "Bento 4 cellules asymétriques (2 grandes + 2 petites), visuels gradient.",
  domain: "saas",
  tags: ["bento", "features", "premium"],
  tsx: `import { Sparkles, Zap, Lock, BarChart3 } from "lucide-react";

export function BentoLarge() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-6">
        <h2 className="mb-12 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">Une expérience pensée dans le moindre détail.</h2>
        <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/20 via-card to-card p-8 md:col-span-2 md:row-span-2">
            <Sparkles className="mb-5 h-7 w-7 text-primary" />
            <h3 className="text-2xl font-semibold">IA générative intégrée</h3>
            <p className="mt-3 max-w-sm text-muted-foreground">Notre moteur IA propose des actions contextuelles à chaque étape de votre workflow, sans configuration.</p>
            <div className="absolute -bottom-10 -right-10 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
          </div>
          <div className="rounded-3xl border border-border bg-card p-6">
            <Zap className="mb-3 h-6 w-6 text-primary" />
            <h3 className="font-semibold">Performance edge</h3>
            <p className="mt-2 text-sm text-muted-foreground">Latence < 50ms partout dans le monde.</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6">
            <Lock className="mb-3 h-6 w-6 text-primary" />
            <h3 className="font-semibold">Sécurité enterprise</h3>
            <p className="mt-2 text-sm text-muted-foreground">SOC2, ISO 27001, RGPD natif.</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6 md:col-span-2">
            <BarChart3 className="mb-3 h-6 w-6 text-primary" />
            <h3 className="font-semibold">Analytics temps réel</h3>
            <p className="mt-2 text-sm text-muted-foreground">Dashboards customisables, alertes intelligentes, export programmé.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
`,
};

const SAAS_USECASES_TABS: PremiumBlock = {
  id: "saas-usecases-tabs",
  name: "SaaS Use cases — Tabs verticaux",
  description: "Section use cases : tabs verticaux gauche, contenu actif droite avec image.",
  domain: "saas",
  tags: ["usecases", "tabs"],
  tsx: `import { useState } from "react";

const cases = [
  { id: "ops", title: "Équipes Ops", desc: "Centralisez vos données et automatisez vos process. Gagnez 12h par semaine.", metric: "+40% productivité" },
  { id: "sales", title: "Équipes Sales", desc: "Pipeline visuel, scoring auto, séquences mail. Closez plus vite.", metric: "x2,3 deals" },
  { id: "product", title: "Équipes Produit", desc: "Roadmap publique, feedback users, prioritisation par impact.", metric: "−30% time-to-ship" },
  { id: "support", title: "Équipes Support", desc: "Helpdesk omnicanal, base de connaissances IA, SLA tracking.", metric: "98% CSAT" },
];

export function UseCases() {
  const [active, setActive] = useState(cases[0].id);
  const current = cases.find((c) => c.id === active)!;
  return (
    <section className="py-24">
      <div className="container mx-auto px-6">
        <h2 className="mb-12 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">Adapté à toutes vos équipes</h2>
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">
          <div className="space-y-1">
            {cases.map((c) => (
              <button
                key={c.id}
                onClick={() => setActive(c.id)}
                className={\`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition \${active === c.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"}\`}
              >
                <span className="font-medium">{c.title}</span>
                <span className={\`text-xs \${active === c.id ? "opacity-100" : "opacity-0"}\`}>→</span>
              </button>
            ))}
          </div>
          <div className="rounded-3xl border border-border bg-gradient-to-br from-card via-card to-primary/10 p-10">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">{current.title}</p>
            <h3 className="mt-3 text-3xl font-bold">{current.metric}</h3>
            <p className="mt-4 max-w-md text-muted-foreground">{current.desc}</p>
            <div className="mt-8 aspect-video rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20" />
          </div>
        </div>
      </div>
    </section>
  );
}
`,
};

/* --------------------------------------------------------------------- */
/* MOBILE — App shells                                                    */
/* --------------------------------------------------------------------- */

const MOBILE_SHELL: PremiumBlock = {
  id: "mobile-shell",
  name: "Mobile App Shell — 390×844 with bottom nav",
  description:
    "Shell mobile premium avec safe-area, header sticky blur, contenu scrollable, bottom nav 5 onglets + FAB central.",
  domain: "mobile-app",
  tags: ["mobile", "shell", "navigation"],
  tsx: `import { Home, Search, Plus, Bell, User } from "lucide-react";
import { useState, ReactNode } from "react";

interface ShellProps {
  title: string;
  children: ReactNode;
}

export function MobileShell({ title, children }: ShellProps) {
  const [active, setActive] = useState("home");
  const tabs = [
    { id: "home", icon: Home, label: "Accueil" },
    { id: "search", icon: Search, label: "Recherche" },
    { id: "add", icon: Plus, label: "", fab: true },
    { id: "alerts", icon: Bell, label: "Alertes" },
    { id: "profile", icon: User, label: "Profil" },
  ];
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 px-5 pb-3 pt-12 backdrop-blur-xl">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto px-5 pb-28 pt-4">{children}</main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-background/90 px-2 pb-5 pt-2 backdrop-blur-xl">
        <div className="flex items-center justify-around">
          {tabs.map((t) =>
            t.fab ? (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className="-translate-y-3 rounded-2xl bg-gradient-to-br from-primary to-accent p-3.5 shadow-[0_8px_24px_-8px_hsl(var(--primary))] transition active:scale-95"
                aria-label="Ajouter"
              >
                <t.icon className="h-5 w-5 text-primary-foreground" />
              </button>
            ) : (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={\`flex flex-col items-center gap-1 px-3 py-1.5 transition \${active === t.id ? "text-primary" : "text-muted-foreground"}\`}
              >
                <t.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t.label}</span>
                {active === t.id && <span className="h-1 w-1 rounded-full bg-primary" />}
              </button>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}
`,
};

const MOBILE_HOME_DISCOVER: PremiumBlock = {
  id: "mobile-home-discover",
  name: "Mobile Home — Discover feed (TopChef-style)",
  description:
    "Page d'accueil mobile : greeting+avatar, recherche pill, scroll horizontal de cards image, liste verticale de rows.",
  domain: "mobile-app",
  tags: ["mobile", "home", "feed"],
  images: [
    { variable: "card1", prompt: "Vibrant lifestyle photo, top-down, premium magazine quality, soft light", aspect: "3:4", hero: true },
    { variable: "card2", prompt: "Premium product photo, close-up, dramatic light", aspect: "3:4" },
    { variable: "card3", prompt: "Editorial lifestyle photograph, atmospheric, cinematic", aspect: "3:4" },
    { variable: "row1", prompt: "Square premium product photo on neutral background", aspect: "1:1" },
    { variable: "row2", prompt: "Square premium product photo on neutral background", aspect: "1:1" },
  ],
  tsx: `import { Search, ChevronRight } from "lucide-react";
import card1 from "@/assets/generated/card1";
import card2 from "@/assets/generated/card2";
import card3 from "@/assets/generated/card3";
import row1 from "@/assets/generated/row1";
import row2 from "@/assets/generated/row2";

const featured = [
  { img: card1, title: "Sélection du jour", tag: "Tendance" },
  { img: card2, title: "Nouveautés", tag: "Nouveau" },
  { img: card3, title: "Coups de cœur", tag: "Édito" },
];

const items = [
  { img: row1, title: "Élément premier", subtitle: "Sous-titre descriptif", badge: "Top" },
  { img: row2, title: "Élément second", subtitle: "Sous-titre descriptif", badge: "Pro" },
];

export function HomeContent() {
  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Bonjour 👋</p>
          <h2 className="text-xl font-bold">Marc</h2>
        </div>
        <div className="h-11 w-11 rounded-full bg-gradient-to-br from-primary to-accent" />
      </div>

      {/* Search */}
      <button className="flex w-full items-center gap-3 rounded-full bg-muted/50 px-4 py-3 text-left text-sm text-muted-foreground transition active:scale-[0.99]">
        <Search className="h-4 w-4" />
        Rechercher...
      </button>

      {/* Featured horizontal scroll */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Découvrir</h3>
          <button className="flex items-center text-xs text-primary">Voir tout <ChevronRight className="h-3 w-3" /></button>
        </div>
        <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {featured.map((c, i) => (
            <div key={i} className="relative h-[180px] w-[140px] shrink-0 overflow-hidden rounded-2xl">
              <img src={c.img} alt={c.title} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <span className="mb-1 inline-block rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">{c.tag}</span>
                <p className="text-sm font-semibold leading-tight text-white">{c.title}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Vertical list */}
      <section>
        <h3 className="mb-3 text-base font-semibold">Pour vous</h3>
        <div className="space-y-2">
          {items.map((it, i) => (
            <button key={i} className="flex w-full items-center gap-4 rounded-2xl bg-card p-3 transition active:scale-[0.98]">
              <img src={it.img} alt={it.title} className="h-16 w-16 rounded-2xl object-cover" />
              <div className="flex-1 text-left">
                <p className="line-clamp-1 font-semibold">{it.title}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{it.subtitle}</p>
                <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{it.badge}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
`,
};

const MOBILE_DETAIL: PremiumBlock = {
  id: "mobile-detail",
  name: "Mobile Detail — Hero image + sticky CTA",
  description:
    "Page détail mobile : image hero 16:9 plein bleed, back button glass, contenu, CTA sticky bottom.",
  domain: "mobile-app",
  tags: ["mobile", "detail"],
  images: [
    { variable: "detailHero", prompt: "Cinematic premium product hero shot, magazine cover quality, atmospheric light", aspect: "16:9", hero: true },
  ],
  tsx: `import { ArrowLeft, Heart, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import detailHero from "@/assets/generated/detailHero";

export function DetailScreen() {
  return (
    <div className="mx-auto min-h-screen max-w-[430px] bg-background pb-32">
      {/* Hero */}
      <div className="relative">
        <img src={detailHero} alt="Détail" className="aspect-[16/10] w-full object-cover" />
        <button className="absolute left-4 top-12 rounded-full bg-background/40 p-2.5 backdrop-blur-md">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="absolute right-4 top-12 flex gap-2">
          <button className="rounded-full bg-background/40 p-2.5 backdrop-blur-md"><Heart className="h-4 w-4" /></button>
          <button className="rounded-full bg-background/40 p-2.5 backdrop-blur-md"><Share className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6 px-5 pt-6">
        <div>
          <p className="text-sm text-primary">Catégorie</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">Titre principal détaillé</h1>
          <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {["Tag 1", "Premium", "Nouveau", "Tag 4"].map((t) => (
              <span key={t} className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs">{t}</span>
            ))}
          </div>
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Description</h3>
          <p className="text-sm leading-relaxed text-foreground/80">
            Description complète, riche et engageante. Elle donne envie d'agir et apporte tous les détails utiles à l'utilisateur en quelques lignes.
          </p>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Détails</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { k: "Durée", v: "30 min" },
              { k: "Niveau", v: "Facile" },
              { k: "Note", v: "4.9 ★" },
              { k: "Avis", v: "1 240" },
            ].map((d) => (
              <div key={d.k} className="rounded-2xl bg-card p-4">
                <p className="text-xs text-muted-foreground">{d.k}</p>
                <p className="mt-1 font-semibold">{d.v}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-background/90 p-4 backdrop-blur-xl">
        <Button className="h-14 w-full rounded-2xl bg-gradient-to-r from-primary to-accent text-base font-semibold">
          Continuer
        </Button>
      </div>
    </div>
  );
}
`,
};

const MOBILE_AUTH: PremiumBlock = {
  id: "mobile-auth",
  name: "Mobile Auth — Login premium",
  description: "Login mobile : logo, greeting, inputs h-14 rounded-2xl, CTA full width, séparateur, sociaux.",
  domain: "mobile-app",
  tags: ["mobile", "auth"],
  tsx: `import { Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginScreen() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-background px-6 pb-10 pt-20">
      <div className="mb-10 flex flex-col items-center">
        <div className="mb-4 h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-accent" />
        <h1 className="text-2xl font-bold">Bon retour 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">Connectez-vous pour continuer</p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="email" placeholder="Email" className="h-14 rounded-2xl pl-11" />
        </div>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="password" placeholder="Mot de passe" className="h-14 rounded-2xl pl-11" />
        </div>
        <button className="block w-full text-right text-xs text-primary">Mot de passe oublié ?</button>
      </div>

      <Button className="mt-6 h-14 w-full rounded-2xl bg-gradient-to-r from-primary to-accent text-base">Se connecter</Button>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">ou continuer avec</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-14 rounded-2xl">Google</Button>
        <Button variant="outline" className="h-14 rounded-2xl">Apple</Button>
      </div>

      <p className="mt-auto pt-8 text-center text-sm text-muted-foreground">
        Pas de compte ? <a href="#" className="font-semibold text-primary">S'inscrire</a>
      </p>
    </div>
  );
}
`,
};

/* --------------------------------------------------------------------- */
/* WEBSITE — Editorial / vitrine                                          */
/* --------------------------------------------------------------------- */

const WEBSITE_HERO_EDITORIAL: PremiumBlock = {
  id: "website-hero-editorial",
  name: "Website Hero — Editorial split",
  description: "Hero éditorial 50/50 : texte gauche serif, image lifestyle droite plein bleed.",
  domain: "website",
  tags: ["hero", "editorial"],
  images: [
    { variable: "heroSide", hero: true, prompt: "Editorial lifestyle photograph, magazine cover quality, atmospheric light, premium", aspect: "3:4" },
  ],
  tsx: `import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroSide from "@/assets/generated/heroSide";

export function Hero() {
  return (
    <section className="container mx-auto grid grid-cols-1 gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
      <div>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Édition limitée</p>
        <h1 className="text-balance font-serif text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] tracking-tight">
          Une expérience pensée pour les passionnés.
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
          Découvrez notre dernière collection, façonnée à la main par des artisans engagés.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" className="h-12 gap-2 px-8">
            Découvrir <ArrowRight className="h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" className="h-12 px-8">Notre histoire</Button>
        </div>
      </div>
      <div className="relative">
        <div className="aspect-[3/4] overflow-hidden rounded-3xl">
          <img src={heroSide} alt="Hero" className="h-full w-full object-cover" />
        </div>
      </div>
    </section>
  );
}
`,
};

/* --------------------------------------------------------------------- */
/* DASHBOARD                                                              */
/* --------------------------------------------------------------------- */

const DASHBOARD_SHELL: PremiumBlock = {
  id: "dashboard-shell",
  name: "Dashboard Shell — Sidebar + KPIs + chart",
  description: "Shell dashboard premium : sidebar 240px, header sticky, 4 KPI, zone chart, table.",
  domain: "dashboard",
  tags: ["dashboard", "shell"],
  tsx: `import { LayoutGrid, BarChart3, Users, Settings, Bell, Search, TrendingUp, TrendingDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const nav = [
  { icon: LayoutGrid, label: "Vue d'ensemble", active: true },
  { icon: BarChart3, label: "Analytics" },
  { icon: Users, label: "Utilisateurs" },
  { icon: Settings, label: "Paramètres" },
];

const kpis = [
  { label: "Revenus", value: "42 580 €", delta: "+12,4%", up: true },
  { label: "Utilisateurs", value: "8 142", delta: "+8,2%", up: true },
  { label: "Conversion", value: "3,42%", delta: "−0,3%", up: false },
  { label: "MRR", value: "12 480 €", delta: "+18,1%", up: true },
];

export function Dashboard() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden w-60 flex-col border-r border-border bg-card/30 p-4 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-accent" />
          <span className="font-semibold">Atlas</span>
        </div>
        <nav className="space-y-1">
          {nav.map((n) => (
            <button
              key={n.label}
              className={\`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition \${n.active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}\`}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-background/70 px-6 py-3 backdrop-blur-xl">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher..." className="h-9 pl-9" />
          </div>
          <Button variant="ghost" size="icon"><Bell className="h-4 w-4" /></Button>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent" />
        </header>

        <main className="flex-1 space-y-6 p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vue d'ensemble</h1>
            <p className="mt-1 text-sm text-muted-foreground">Données mises à jour en temps réel.</p>
          </div>

          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{k.label}</p>
                <p className="mt-2 text-2xl font-bold">{k.value}</p>
                <p className={\`mt-2 inline-flex items-center gap-1 text-xs \${k.up ? "text-emerald-400" : "text-rose-400"}\`}>
                  {k.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {k.delta}
                </p>
              </div>
            ))}
          </div>

          {/* Chart placeholder */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Revenus (30 derniers jours)</h3>
              <Button variant="outline" size="sm">Exporter</Button>
            </div>
            <div className="h-64 rounded-xl bg-gradient-to-br from-primary/10 via-card to-accent/10" />
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-6 py-4">
              <h3 className="font-semibold">Activité récente</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-6 py-3">Client</th><th className="px-6 py-3">Plan</th><th className="px-6 py-3">Statut</th><th className="px-6 py-3 text-right">Montant</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { c: "Acme Corp", p: "Pro", s: "Actif", m: "289 €" },
                  { c: "Globex", p: "Entreprise", s: "Actif", m: "990 €" },
                  { c: "Initech", p: "Starter", s: "En essai", m: "0 €" },
                ].map((r, i) => (
                  <tr key={i} className="transition hover:bg-muted/30">
                    <td className="px-6 py-3 font-medium">{r.c}</td>
                    <td className="px-6 py-3 text-muted-foreground">{r.p}</td>
                    <td className="px-6 py-3"><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">{r.s}</span></td>
                    <td className="px-6 py-3 text-right font-medium">{r.m}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
`,
};

/* --------------------------------------------------------------------- */
/* MOBILE — extension (11 nouveaux → total 15)                            */
/* --------------------------------------------------------------------- */

const MOBILE_ONBOARDING: PremiumBlock = {
  id: "mobile-onboarding",
  name: "Mobile Onboarding — 3 slides + dots",
  description: "Onboarding mobile : illustration plein écran, titre, sous-titre, dots progress, CTA suivant + skip.",
  domain: "mobile-app",
  tags: ["mobile", "onboarding"],
  images: [
    { variable: "onb1", hero: true, prompt: "Vibrant illustration premium, abstract gradient shapes blue violet, modern flat design", aspect: "3:4" },
  ],
  tsx: `import { useState } from "react";
import { Button } from "@/components/ui/button";
import onb1 from "@/assets/generated/onb1";

const slides = [
  { img: onb1, title: "Bienvenue", text: "Découvre une nouvelle façon d'avancer chaque jour." },
  { img: onb1, title: "Reste motivé", text: "Suis tes progrès et célèbre chaque étape." },
  { img: onb1, title: "Commence", text: "Tu es prêt — lance-toi en quelques secondes." },
];

export function Onboarding() {
  const [i, setI] = useState(0);
  const last = i === slides.length - 1;
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-background px-6 pb-10 pt-12">
      <button onClick={() => setI(slides.length - 1)} className="ml-auto text-sm text-muted-foreground">Passer</button>
      <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center">
        <img src={slides[i].img} alt="" className="mb-10 h-72 w-72 rounded-3xl object-cover" />
        <h1 className="text-3xl font-bold tracking-tight">{slides[i].title}</h1>
        <p className="mt-3 max-w-xs text-sm text-muted-foreground">{slides[i].text}</p>
      </div>
      <div className="mb-6 flex justify-center gap-2">
        {slides.map((_, k) => (
          <span key={k} className={\`h-1.5 rounded-full transition-all \${k === i ? "w-6 bg-primary" : "w-1.5 bg-muted"}\`} />
        ))}
      </div>
      <Button onClick={() => setI(last ? 0 : i + 1)} className="h-14 w-full rounded-2xl bg-gradient-to-r from-primary to-accent text-base">
        {last ? "Commencer" : "Suivant"}
      </Button>
    </div>
  );
}
`,
};

const MOBILE_PROFILE: PremiumBlock = {
  id: "mobile-profile",
  name: "Mobile Profile — Avatar + stats + settings list",
  description: "Profil mobile : header avatar XL, 3 stats, liste paramètres avec icônes et chevrons.",
  domain: "mobile-app",
  tags: ["mobile", "profile", "settings"],
  tsx: `import { Bell, Shield, CreditCard, HelpCircle, LogOut, ChevronRight } from "lucide-react";

const stats = [
  { label: "Projets", value: "24" },
  { label: "Suivis", value: "1.2k" },
  { label: "Followers", value: "842" },
];
const settings = [
  { icon: Bell, label: "Notifications" },
  { icon: Shield, label: "Confidentialité" },
  { icon: CreditCard, label: "Abonnement" },
  { icon: HelpCircle, label: "Aide" },
  { icon: LogOut, label: "Déconnexion", danger: true },
];

export function ProfileScreen() {
  return (
    <div className="mx-auto min-h-screen max-w-[430px] bg-background px-5 pb-20 pt-12">
      <div className="flex flex-col items-center text-center">
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-accent ring-4 ring-background" />
        <h1 className="mt-4 text-xl font-bold">Marc Dupont</h1>
        <p className="text-sm text-muted-foreground">marc@nexyra.app</p>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3 rounded-2xl bg-card p-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      <ul className="mt-6 space-y-2">
        {settings.map((s) => (
          <li key={s.label}>
            <button className={\`flex w-full items-center gap-4 rounded-2xl bg-card p-4 transition active:scale-[0.99] \${s.danger ? "text-destructive" : ""}\`}>
              <s.icon className="h-5 w-5" />
              <span className="flex-1 text-left text-sm font-medium">{s.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
`,
};

const MOBILE_SEARCH: PremiumBlock = {
  id: "mobile-search",
  name: "Mobile Search — Filters + results",
  description: "Recherche mobile : input sticky, chips filtres scroll horizontal, résultats en grid 2 col.",
  domain: "mobile-app",
  tags: ["mobile", "search", "filters"],
  images: [
    { variable: "thumb1", prompt: "Square premium product photo on neutral background", aspect: "1:1" },
    { variable: "thumb2", prompt: "Square premium product photo on neutral background", aspect: "1:1" },
  ],
  tsx: `import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import thumb1 from "@/assets/generated/thumb1";
import thumb2 from "@/assets/generated/thumb2";

const chips = ["Tous", "Populaires", "Nouveaux", "Pro", "Gratuit"];
const results = [
  { img: thumb1, title: "Résultat un", price: "29 €" },
  { img: thumb2, title: "Résultat deux", price: "49 €" },
  { img: thumb1, title: "Résultat trois", price: "19 €" },
  { img: thumb2, title: "Résultat quatre", price: "99 €" },
];

export function SearchScreen() {
  return (
    <div className="mx-auto min-h-screen max-w-[430px] bg-background pb-10">
      <div className="sticky top-0 z-30 space-y-3 bg-background/80 px-5 pb-3 pt-12 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher..." className="h-12 rounded-2xl pl-10" />
          </div>
          <button className="h-12 w-12 rounded-2xl bg-card"><SlidersHorizontal className="mx-auto h-4 w-4" /></button>
        </div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((c, i) => (
            <button key={c} className={\`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition \${i === 0 ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}\`}>{c}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-5 pt-4">
        {results.map((r, i) => (
          <button key={i} className="text-left">
            <img src={r.img} alt={r.title} className="aspect-square w-full rounded-2xl object-cover" />
            <p className="mt-2 line-clamp-1 text-sm font-semibold">{r.title}</p>
            <p className="text-xs text-primary">{r.price}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
`,
};

const MOBILE_CHAT: PremiumBlock = {
  id: "mobile-chat",
  name: "Mobile Chat — Conversation + composer",
  description: "Chat mobile : header avec avatar, bulles alternées, composer fixe avec input + bouton envoyer.",
  domain: "mobile-app",
  tags: ["mobile", "chat", "messaging"],
  tsx: `import { ArrowLeft, Send, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";

const messages = [
  { me: false, text: "Salut ! Comment ça va ?", time: "10:32" },
  { me: true, text: "Très bien et toi ?", time: "10:33" },
  { me: false, text: "Super, j'avance bien sur le projet 🚀", time: "10:34" },
  { me: true, text: "Génial, on en parle demain ?", time: "10:35" },
];

export function ChatScreen() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-5 pb-3 pt-12 backdrop-blur-xl">
        <button><ArrowLeft className="h-5 w-5" /></button>
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-accent" />
        <div className="flex-1">
          <p className="font-semibold">Sophie</p>
          <p className="text-xs text-emerald-400">en ligne</p>
        </div>
      </header>
      <main className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.map((m, i) => (
          <div key={i} className={\`flex \${m.me ? "justify-end" : "justify-start"}\`}>
            <div className={\`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm \${m.me ? "bg-gradient-to-br from-primary to-accent text-primary-foreground" : "bg-card"}\`}>
              {m.text}
              <span className="ml-2 text-[10px] opacity-70">{m.time}</span>
            </div>
          </div>
        ))}
      </main>
      <footer className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background/90 px-4 pb-6 pt-3 backdrop-blur-xl">
        <button className="h-10 w-10 rounded-full bg-card"><Paperclip className="mx-auto h-4 w-4" /></button>
        <Input placeholder="Message..." className="h-11 flex-1 rounded-full" />
        <button className="h-11 w-11 rounded-full bg-gradient-to-br from-primary to-accent">
          <Send className="mx-auto h-4 w-4 text-primary-foreground" />
        </button>
      </footer>
    </div>
  );
}
`,
};

const MOBILE_NOTIFICATIONS: PremiumBlock = {
  id: "mobile-notifications",
  name: "Mobile Notifications — List grouped by day",
  description: "Notifications mobile : groupées par Aujourd'hui / Hier, icône colorée, titre + sous-titre + heure.",
  domain: "mobile-app",
  tags: ["mobile", "notifications"],
  tsx: `import { Heart, MessageCircle, UserPlus, ShoppingBag } from "lucide-react";

const groups = [
  { day: "Aujourd'hui", items: [
    { icon: Heart, color: "bg-rose-500/15 text-rose-400", title: "Sophie a aimé ton post", time: "il y a 5min" },
    { icon: MessageCircle, color: "bg-blue-500/15 text-blue-400", title: "Nouveau commentaire", time: "il y a 1h" },
    { icon: UserPlus, color: "bg-violet-500/15 text-violet-400", title: "Marc te suit maintenant", time: "il y a 3h" },
  ]},
  { day: "Hier", items: [
    { icon: ShoppingBag, color: "bg-emerald-500/15 text-emerald-400", title: "Commande livrée", time: "Hier 18:24" },
  ]},
];

export function Notifications() {
  return (
    <div className="mx-auto min-h-screen max-w-[430px] bg-background px-5 pb-10 pt-12">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <div className="mt-6 space-y-6">
        {groups.map((g) => (
          <section key={g.day}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.day}</p>
            <div className="space-y-2">
              {g.items.map((it, i) => (
                <button key={i} className="flex w-full items-start gap-3 rounded-2xl bg-card p-3 text-left transition active:scale-[0.99]">
                  <div className={\`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl \${it.color}\`}>
                    <it.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{it.title}</p>
                    <p className="text-xs text-muted-foreground">{it.time}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
`,
};

const MOBILE_CART: PremiumBlock = {
  id: "mobile-cart",
  name: "Mobile Cart — Items + sticky summary",
  description: "Panier mobile : items avec qty steppers, sous-total / livraison / total, CTA sticky.",
  domain: "mobile-app",
  tags: ["mobile", "cart", "ecommerce"],
  images: [
    { variable: "cart1", prompt: "Square premium product photo on neutral background", aspect: "1:1" },
  ],
  tsx: `import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import cart1 from "@/assets/generated/cart1";

const items = [
  { img: cart1, name: "Article premium", price: 49, qty: 1 },
  { img: cart1, name: "Accessoire pro", price: 29, qty: 2 },
];

export function CartScreen() {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  return (
    <div className="mx-auto min-h-screen max-w-[430px] bg-background pb-32 pt-12">
      <h1 className="px-5 text-2xl font-bold">Mon panier</h1>
      <ul className="mt-5 space-y-3 px-5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3 rounded-2xl bg-card p-3">
            <img src={it.img} alt={it.name} className="h-20 w-20 rounded-xl object-cover" />
            <div className="flex flex-1 flex-col">
              <p className="text-sm font-semibold">{it.name}</p>
              <p className="mt-0.5 text-sm text-primary">{it.price} €</p>
              <div className="mt-auto flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-full bg-background px-2 py-1">
                  <button className="rounded-full bg-muted p-1"><Minus className="h-3 w-3" /></button>
                  <span className="w-5 text-center text-sm">{it.qty}</span>
                  <button className="rounded-full bg-muted p-1"><Plus className="h-3 w-3" /></button>
                </div>
                <button className="text-muted-foreground"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 mx-5 space-y-2 rounded-2xl bg-card p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Sous-total</span><span>{subtotal} €</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Livraison</span><span>4,90 €</span></div>
        <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Total</span><span>{subtotal + 4.9} €</span></div>
      </div>
      <div className="fixed bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-background/90 p-4 backdrop-blur-xl">
        <Button className="h-14 w-full rounded-2xl bg-gradient-to-r from-primary to-accent">Passer commande</Button>
      </div>
    </div>
  );
}
`,
};

const MOBILE_CHECKOUT: PremiumBlock = {
  id: "mobile-checkout",
  name: "Mobile Checkout — Address + payment + review",
  description: "Checkout mobile : stepper 3 étapes, formulaire compact, méthode paiement avec radios, récap.",
  domain: "mobile-app",
  tags: ["mobile", "checkout", "payment"],
  tsx: `import { Check, CreditCard, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const steps = ["Adresse", "Paiement", "Récap"];

export function Checkout() {
  return (
    <div className="mx-auto min-h-screen max-w-[430px] bg-background px-5 pb-10 pt-12">
      <h1 className="text-2xl font-bold">Commander</h1>
      <div className="mt-5 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={\`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold \${i === 0 ? "bg-gradient-to-br from-primary to-accent text-primary-foreground" : "bg-card text-muted-foreground"}\`}>
              {i === 0 ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            {i < steps.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>
      <section className="mt-8 space-y-3">
        <p className="text-sm font-semibold">Adresse de livraison</p>
        <Input placeholder="Nom complet" className="h-12 rounded-2xl" />
        <Input placeholder="Adresse" className="h-12 rounded-2xl" />
        <div className="flex gap-3">
          <Input placeholder="Code postal" className="h-12 rounded-2xl" />
          <Input placeholder="Ville" className="h-12 rounded-2xl" />
        </div>
      </section>
      <section className="mt-6 space-y-2">
        <p className="text-sm font-semibold">Mode de paiement</p>
        {[
          { icon: CreditCard, label: "Carte bancaire", sub: "•••• 4242", checked: true },
          { icon: Wallet, label: "Apple Pay", sub: "Touch ID", checked: false },
        ].map((m) => (
          <label key={m.label} className={\`flex items-center gap-3 rounded-2xl border p-4 \${m.checked ? "border-primary bg-primary/5" : "border-border bg-card"}\`}>
            <m.icon className="h-5 w-5" />
            <div className="flex-1">
              <p className="text-sm font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.sub}</p>
            </div>
            <span className={\`flex h-5 w-5 items-center justify-center rounded-full border \${m.checked ? "border-primary bg-primary" : "border-border"}\`}>
              {m.checked && <Check className="h-3 w-3 text-primary-foreground" />}
            </span>
          </label>
        ))}
      </section>
      <Button className="mt-8 h-14 w-full rounded-2xl bg-gradient-to-r from-primary to-accent">Continuer</Button>
    </div>
  );
}
`,
};

const MOBILE_EMPTY_STATE: PremiumBlock = {
  id: "mobile-empty-state",
  name: "Mobile Empty State — Illustration + CTA",
  description: "État vide mobile : illustration centrée, titre, sous-titre, CTA primaire.",
  domain: "mobile-app",
  tags: ["mobile", "empty-state"],
  tsx: `import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col items-center justify-center bg-background px-8 text-center">
      <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
        <Inbox className="h-12 w-12 text-primary" />
      </div>
      <h2 className="text-xl font-bold">Rien par ici</h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Ta liste est vide pour l'instant. Crée ton premier élément pour commencer.
      </p>
      <Button className="mt-6 h-12 rounded-2xl bg-gradient-to-r from-primary to-accent px-8">Créer maintenant</Button>
    </div>
  );
}
`,
};

const MOBILE_PAYWALL: PremiumBlock = {
  id: "mobile-paywall",
  name: "Mobile Paywall — Premium upgrade",
  description: "Paywall mobile : header gradient, liste avantages avec checks, plans toggle mensuel/annuel, CTA.",
  domain: "mobile-app",
  tags: ["mobile", "paywall", "subscription"],
  tsx: `import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const benefits = [
  "Accès illimité à toutes les fonctionnalités",
  "Sans publicité",
  "Support prioritaire 24/7",
  "Synchronisation multi-appareils",
];

export function Paywall() {
  return (
    <div className="mx-auto min-h-screen max-w-[430px] bg-background pb-10">
      <div className="relative overflow-hidden bg-gradient-to-br from-primary via-accent to-primary px-6 pb-12 pt-14 text-center text-primary-foreground">
        <button className="absolute left-4 top-12"><X className="h-5 w-5" /></button>
        <Sparkles className="mx-auto h-10 w-10" />
        <h1 className="mt-4 text-3xl font-bold">Passe en Premium</h1>
        <p className="mt-2 text-sm opacity-90">Débloque toutes les fonctionnalités pro</p>
      </div>
      <ul className="mx-5 mt-8 space-y-3">
        {benefits.map((b) => (
          <li key={b} className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15"><Check className="h-3 w-3 text-primary" /></span>
            <span className="text-sm">{b}</span>
          </li>
        ))}
      </ul>
      <div className="mx-5 mt-8 space-y-3">
        <label className="flex items-center justify-between rounded-2xl border-2 border-primary bg-primary/5 p-4">
          <div>
            <p className="text-sm font-semibold">Annuel — 49,99 €/an</p>
            <p className="text-xs text-emerald-400">Économise 40%</p>
          </div>
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">POPULAIRE</span>
        </label>
        <label className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Mensuel — 6,99 €/mois</p>
        </label>
      </div>
      <Button className="mx-5 mt-6 h-14 w-[calc(100%-2.5rem)] rounded-2xl bg-gradient-to-r from-primary to-accent text-base">
        Commencer 7 jours gratuits
      </Button>
      <p className="mt-3 text-center text-[10px] text-muted-foreground">Sans engagement, annule à tout moment</p>
    </div>
  );
}
`,
};

const MOBILE_STORY_VIEWER: PremiumBlock = {
  id: "mobile-story-viewer",
  name: "Mobile Story Viewer — Full-screen + progress",
  description: "Viewer story mobile : image plein écran, barres progress, header user, actions tap.",
  domain: "mobile-app",
  tags: ["mobile", "story", "media"],
  images: [
    { variable: "storyBg", hero: true, prompt: "Vertical cinematic lifestyle photograph, dramatic light, atmospheric, 9:16", aspect: "9:16" },
  ],
  tsx: `import { X, MoreHorizontal, Heart, Send } from "lucide-react";
import storyBg from "@/assets/generated/storyBg";

export function StoryViewer() {
  return (
    <div className="relative mx-auto min-h-screen max-w-[430px] overflow-hidden bg-black">
      <img src={storyBg} alt="Story" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-3 pt-12">
        <div className="flex gap-1">
          {[100, 60, 0, 0].map((p, i) => (
            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div className="h-full bg-white transition-all" style={{ width: \`\${p}%\` }} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent ring-2 ring-white" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">sophie_x</p>
            <p className="text-[10px] text-white/70">il y a 2h</p>
          </div>
          <button className="text-white"><MoreHorizontal className="h-5 w-5" /></button>
          <button className="text-white"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent p-4 pb-8">
        <input placeholder="Répondre..." className="h-11 flex-1 rounded-full border border-white/30 bg-transparent px-4 text-sm text-white placeholder:text-white/60 focus:outline-none" />
        <button className="text-white"><Heart className="h-6 w-6" /></button>
        <button className="text-white"><Send className="h-6 w-6" /></button>
      </div>
    </div>
  );
}
`,
};

const MOBILE_MAP_NEARBY: PremiumBlock = {
  id: "mobile-map-nearby",
  name: "Mobile Map — Nearby places sheet",
  description: "Map mobile : zone carte placeholder, bottom sheet liste lieux proches, search overlay.",
  domain: "mobile-app",
  tags: ["mobile", "map", "location"],
  tsx: `import { Search, MapPin, Star, Navigation } from "lucide-react";

const places = [
  { name: "Café Atlas", dist: "120m", rating: 4.8 },
  { name: "Studio Lumen", dist: "340m", rating: 4.6 },
  { name: "Galerie Nord", dist: "510m", rating: 4.9 },
];

export function MapNearby() {
  return (
    <div className="relative mx-auto min-h-screen max-w-[430px] overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 h-[60vh] bg-gradient-to-br from-blue-900/30 via-violet-900/20 to-emerald-900/30">
        <div className="absolute inset-0 [background-image:radial-gradient(circle_at_30%_40%,hsl(var(--primary)/0.4),transparent_50%),radial-gradient(circle_at_70%_60%,hsl(var(--accent)/0.3),transparent_50%)]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-pulse rounded-full bg-primary ring-8 ring-primary/30" />
        </div>
      </div>
      <div className="absolute inset-x-4 top-12 flex items-center gap-2 rounded-full bg-background/90 px-4 py-3 shadow-lg backdrop-blur-xl">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input placeholder="Où veux-tu aller ?" className="flex-1 bg-transparent text-sm focus:outline-none" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-background p-5 pb-10">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />
        <h3 className="mb-3 font-semibold">Près de toi</h3>
        <ul className="space-y-2">
          {places.map((p) => (
            <li key={p.name} className="flex items-center gap-3 rounded-2xl bg-card p-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><MapPin className="h-4 w-4 text-primary" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.dist} • <Star className="mb-0.5 inline h-3 w-3 text-amber-400" /> {p.rating}</p>
              </div>
              <button className="rounded-full bg-primary p-2"><Navigation className="h-3.5 w-3.5 text-primary-foreground" /></button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
`,
};

/* --------------------------------------------------------------------- */
/* WEBSITE — extension (9 nouveaux → total 10)                            */
/* --------------------------------------------------------------------- */

const WEBSITE_NAVBAR: PremiumBlock = {
  id: "website-navbar",
  name: "Website Navbar — Editorial sticky",
  description: "Navbar éditoriale : logo serif, liens centrés, CTA droit, ligne fine.",
  domain: "website",
  tags: ["navbar", "editorial"],
  tsx: `import { Button } from "@/components/ui/button";

const links = ["Collection", "Histoire", "Journal", "Boutique"];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <a href="/" className="font-serif text-xl tracking-tight">Atlas</a>
        <nav className="hidden gap-8 md:flex">
          {links.map((l) => <a key={l} href="#" className="text-sm text-muted-foreground transition hover:text-foreground">{l}</a>)}
        </nav>
        <Button variant="outline" className="rounded-full">Visiter</Button>
      </div>
    </header>
  );
}
`,
};

const WEBSITE_FOOTER: PremiumBlock = {
  id: "website-footer",
  name: "Website Footer — Editorial mega",
  description: "Footer éditorial : 4 colonnes (Contact / Boutique / Atelier / Newsletter), copyright fin.",
  domain: "website",
  tags: ["footer", "editorial"],
  tsx: `import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/30">
      <div className="container mx-auto grid gap-10 px-6 py-16 md:grid-cols-4">
        <div>
          <p className="font-serif text-2xl tracking-tight">Atlas</p>
          <p className="mt-3 text-sm text-muted-foreground">Maison artisanale fondée en 1998.</p>
        </div>
        {["Boutique", "Atelier"].map((g, i) => (
          <div key={g}>
            <p className="text-sm font-semibold">{g}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {Array.from({ length: 4 }).map((_, k) => <li key={k}><a href="#">Lien {i + 1}.{k + 1}</a></li>)}
            </ul>
          </div>
        ))}
        <div>
          <p className="text-sm font-semibold">Newsletter</p>
          <p className="mt-3 text-sm text-muted-foreground">Une lettre mensuelle, jamais plus.</p>
          <div className="mt-3 flex gap-2">
            <Input placeholder="Email" className="rounded-full" />
            <Button className="rounded-full">OK</Button>
          </div>
        </div>
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Atlas — Tous droits réservés</div>
    </footer>
  );
}
`,
};

const WEBSITE_FEATURE_SPLIT: PremiumBlock = {
  id: "website-feature-split",
  name: "Website Feature — Split image + text alterné",
  description: "Section feature alternée : image grande à gauche/droite, texte avec liste à puces, alternance.",
  domain: "website",
  tags: ["feature", "split"],
  images: [
    { variable: "splitA", prompt: "Editorial atelier photograph, hands at work, warm light, premium magazine quality", aspect: "4:5", hero: true },
    { variable: "splitB", prompt: "Editorial detail shot, materials and textures, atmospheric", aspect: "4:5" },
  ],
  tsx: `import { Check } from "lucide-react";
import splitA from "@/assets/generated/splitA";
import splitB from "@/assets/generated/splitB";

const sections = [
  { img: splitA, kicker: "Atelier", title: "Façonné à la main", text: "Chaque pièce passe entre les mains de nos artisans. Aucune machine, aucune approximation.", points: ["Matières nobles", "Finitions main", "Édition limitée"] },
  { img: splitB, kicker: "Matières", title: "Sourcing engagé", text: "Nous sélectionnons nos fournisseurs sur des critères éthiques et environnementaux stricts.", points: ["Cuir tanné végétal", "Bois certifié FSC", "Circuit court"] },
];

export function FeatureSplit() {
  return (
    <section className="container mx-auto space-y-24 px-6 py-24">
      {sections.map((s, i) => (
        <div key={s.title} className={\`grid grid-cols-1 items-center gap-12 lg:grid-cols-2 \${i % 2 ? "lg:[&>:first-child]:order-2" : ""}\`}>
          <div className="overflow-hidden rounded-3xl">
            <img src={s.img} alt={s.title} className="aspect-[4/5] w-full object-cover" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{s.kicker}</p>
            <h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight">{s.title}</h2>
            <p className="mt-4 max-w-md text-base text-muted-foreground">{s.text}</p>
            <ul className="mt-6 space-y-2">
              {s.points.map((p) => (
                <li key={p} className="flex items-center gap-3 text-sm"><Check className="h-4 w-4 text-primary" /> {p}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </section>
  );
}
`,
};

const WEBSITE_GALLERY: PremiumBlock = {
  id: "website-gallery",
  name: "Website Gallery — Masonry editorial",
  description: "Galerie masonry 3 colonnes, hauteurs variables, hover scale léger.",
  domain: "website",
  tags: ["gallery", "masonry"],
  images: [
    { variable: "g1", prompt: "Editorial lifestyle photograph, atmospheric", aspect: "4:5" },
    { variable: "g2", prompt: "Editorial detail shot, premium quality", aspect: "1:1" },
    { variable: "g3", prompt: "Editorial product photograph, dramatic light", aspect: "3:4" },
    { variable: "g4", prompt: "Editorial scene, magazine cover", aspect: "4:5" },
  ],
  tsx: `import g1 from "@/assets/generated/g1";
import g2 from "@/assets/generated/g2";
import g3 from "@/assets/generated/g3";
import g4 from "@/assets/generated/g4";

const cols = [
  [{ img: g1, ratio: "aspect-[4/5]" }, { img: g2, ratio: "aspect-square" }],
  [{ img: g3, ratio: "aspect-[3/4]" }, { img: g1, ratio: "aspect-[4/5]" }],
  [{ img: g4, ratio: "aspect-[4/5]" }, { img: g2, ratio: "aspect-square" }],
];

export function Gallery() {
  return (
    <section className="container mx-auto px-6 py-20">
      <div className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Galerie</p>
        <h2 className="mt-2 font-serif text-4xl tracking-tight">Notre univers</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cols.map((col, i) => (
          <div key={i} className="space-y-4">
            {col.map((it, k) => (
              <div key={k} className={\`overflow-hidden rounded-2xl \${it.ratio}\`}>
                <img src={it.img} alt="" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
`,
};

const WEBSITE_TESTIMONIAL_QUOTE: PremiumBlock = {
  id: "website-testimonial-quote",
  name: "Website Testimonial — Large editorial quote",
  description: "Citation éditoriale XXL serif, attribution avec avatar, fond contrasté.",
  domain: "website",
  tags: ["testimonial", "editorial"],
  tsx: `export function TestimonialQuote() {
  return (
    <section className="bg-card/40 py-24">
      <div className="container mx-auto max-w-4xl px-6 text-center">
        <p className="font-serif text-3xl leading-tight tracking-tight md:text-5xl">
          « Une attention au détail rare, et un service à la hauteur. C'est devenu ma maison de référence. »
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent" />
          <p className="font-semibold">Hélène Marchand</p>
          <p className="text-sm text-muted-foreground">Vogue Paris</p>
        </div>
      </div>
    </section>
  );
}
`,
};

const WEBSITE_PRODUCT_GRID: PremiumBlock = {
  id: "website-product-grid",
  name: "Website Product Grid — Editorial shop",
  description: "Grille produits éditoriale : 3 colonnes, image carrée, nom serif, prix discret, hover overlay.",
  domain: "website",
  tags: ["product", "grid", "ecommerce"],
  images: [
    { variable: "p1", prompt: "Premium product photograph on neutral linen background, soft shadow", aspect: "1:1", hero: true },
    { variable: "p2", prompt: "Premium product photograph on neutral background", aspect: "1:1" },
    { variable: "p3", prompt: "Premium product photograph on neutral background", aspect: "1:1" },
  ],
  tsx: `import p1 from "@/assets/generated/p1";
import p2 from "@/assets/generated/p2";
import p3 from "@/assets/generated/p3";

const products = [
  { img: p1, name: "Sac Atlas", price: "390 €" },
  { img: p2, name: "Carnet Lumen", price: "85 €" },
  { img: p3, name: "Étui Nord", price: "150 €" },
];

export function ProductGrid() {
  return (
    <section className="container mx-auto px-6 py-20">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Boutique</p>
          <h2 className="mt-2 font-serif text-4xl tracking-tight">Sélection</h2>
        </div>
        <a href="#" className="text-sm underline">Tout voir</a>
      </div>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {products.map((p) => (
          <a key={p.name} href="#" className="group">
            <div className="relative overflow-hidden rounded-2xl bg-muted">
              <img src={p.img} alt={p.name} className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="font-serif text-lg">{p.name}</p>
              <p className="text-sm text-muted-foreground">{p.price}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
`,
};

const WEBSITE_BLOG_EDITORIAL: PremiumBlock = {
  id: "website-blog-editorial",
  name: "Website Blog — Editorial featured + list",
  description: "Blog éditorial : article en vedette grand format gauche, 3 derniers articles compacts droite.",
  domain: "website",
  tags: ["blog", "editorial"],
  images: [
    { variable: "feat", hero: true, prompt: "Editorial cover photograph, magazine quality, atmospheric", aspect: "4:3" },
  ],
  tsx: `import feat from "@/assets/generated/feat";

const recent = [
  { title: "L'art du temps lent", cat: "Atelier", date: "12 mars" },
  { title: "Voyage chez nos artisans", cat: "Reportage", date: "28 février" },
  { title: "Une saison, une matière", cat: "Édito", date: "10 février" },
];

export function BlogEditorial() {
  return (
    <section className="container mx-auto grid gap-12 px-6 py-20 lg:grid-cols-5">
      <article className="lg:col-span-3">
        <img src={feat} alt="" className="aspect-[4/3] w-full rounded-3xl object-cover" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-primary">À la une</p>
        <h2 className="mt-2 font-serif text-3xl leading-tight md:text-4xl">Les coulisses de notre nouvelle collection</h2>
        <p className="mt-4 text-base text-muted-foreground">Une exploration intime de notre processus créatif, du croquis à la pièce finale.</p>
        <a href="#" className="mt-4 inline-block text-sm underline">Lire l'article</a>
      </article>
      <aside className="space-y-6 lg:col-span-2 lg:border-l lg:border-border lg:pl-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Récents</p>
        <ul className="space-y-6">
          {recent.map((r) => (
            <li key={r.title} className="border-b border-border pb-6 last:border-0">
              <p className="text-[10px] uppercase tracking-wider text-primary">{r.cat} • {r.date}</p>
              <h3 className="mt-1 font-serif text-xl leading-snug">{r.title}</h3>
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
`,
};

const WEBSITE_CONTACT_SPLIT: PremiumBlock = {
  id: "website-contact-split",
  name: "Website Contact — Split form + infos",
  description: "Contact éditorial : formulaire gauche, infos (adresse / horaires / email) droite avec carte placeholder.",
  domain: "website",
  tags: ["contact", "form"],
  tsx: `import { Mail, MapPin, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function ContactSplit() {
  return (
    <section className="container mx-auto grid gap-16 px-6 py-20 lg:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Contact</p>
        <h2 className="mt-2 font-serif text-4xl tracking-tight">Écrivez-nous</h2>
        <form className="mt-8 space-y-4">
          <Input placeholder="Nom complet" className="h-12" />
          <Input type="email" placeholder="Email" className="h-12" />
          <Textarea placeholder="Votre message" className="min-h-[140px]" />
          <Button className="h-12 w-full md:w-auto md:px-10">Envoyer</Button>
        </form>
      </div>
      <div className="space-y-8">
        <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-primary/15 via-card to-accent/15" />
        <ul className="space-y-4 text-sm">
          {[
            { icon: MapPin, label: "12 rue Saint-Honoré, Paris 75001" },
            { icon: Mail, label: "bonjour@atlas-maison.com" },
            { icon: Clock, label: "Du mardi au samedi, 11h–19h" },
          ].map((i, k) => (
            <li key={k} className="flex items-start gap-3">
              <i.icon className="mt-0.5 h-4 w-4 text-primary" />
              <span>{i.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
`,
};

const WEBSITE_CTA_BANNER: PremiumBlock = {
  id: "website-cta-banner",
  name: "Website CTA Banner — Editorial wide",
  description: "Bannière CTA éditoriale : titre serif XXL, sous-titre, double bouton, fond contrasté.",
  domain: "website",
  tags: ["cta", "editorial"],
  tsx: `import { Button } from "@/components/ui/button";

export function CtaBanner() {
  return (
    <section className="bg-foreground py-24 text-background">
      <div className="container mx-auto max-w-3xl px-6 text-center">
        <h2 className="font-serif text-4xl leading-tight tracking-tight md:text-6xl">
          Une pièce qui dure une vie.
        </h2>
        <p className="mt-6 text-base opacity-80">
          Découvrez notre dernière collection en exclusivité dans notre atelier parisien.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" variant="secondary" className="h-12 px-8">Voir la collection</Button>
          <Button size="lg" variant="outline" className="h-12 border-background/30 bg-transparent px-8 text-background hover:bg-background hover:text-foreground">Prendre rendez-vous</Button>
        </div>
      </div>
    </section>
  );
}
`,
};

/* --------------------------------------------------------------------- */
/* DASHBOARD — extension (7 nouveaux → total 8)                           */
/* --------------------------------------------------------------------- */

const DASHBOARD_ANALYTICS: PremiumBlock = {
  id: "dashboard-analytics",
  name: "Dashboard Analytics — KPIs + dual chart",
  description: "Page analytics : 4 KPI avec sparkline, 2 zones chart côte à côte, légende.",
  domain: "dashboard",
  tags: ["dashboard", "analytics", "charts"],
  tsx: `import { TrendingUp, Users, MousePointerClick, ShoppingCart } from "lucide-react";

const kpis = [
  { icon: Users, label: "Visiteurs", value: "42.8k", delta: "+12%" },
  { icon: MousePointerClick, label: "Clics", value: "18.4k", delta: "+8%" },
  { icon: ShoppingCart, label: "Conversions", value: "1 240", delta: "+22%" },
  { icon: TrendingUp, label: "Revenu", value: "84.2k €", delta: "+15%" },
];

export function Analytics() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">30 derniers jours</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <k.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-emerald-400">{k.delta}</span>
            </div>
            <p className="mt-3 text-2xl font-bold">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <div className="mt-3 h-8 rounded bg-gradient-to-r from-primary/10 via-primary/30 to-primary/10" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <h3 className="font-semibold">Trafic par source</h3>
          <div className="mt-4 h-64 rounded-xl bg-gradient-to-br from-primary/15 via-card to-accent/15" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-semibold">Répartition</h3>
          <div className="mt-4 flex h-64 items-center justify-center">
            <div className="h-40 w-40 rounded-full border-[16px] border-primary border-r-accent border-b-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
`,
};

const DASHBOARD_TABLE_USERS: PremiumBlock = {
  id: "dashboard-table-users",
  name: "Dashboard Table — Users with filters",
  description: "Table utilisateurs : header avec search + filter + bouton add, lignes avec avatar / role badge / actions.",
  domain: "dashboard",
  tags: ["dashboard", "table", "users"],
  tsx: `import { Search, Plus, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const users = [
  { name: "Sophie Mercier", email: "sophie@nexyra.app", role: "Admin", status: "Actif" },
  { name: "Marc Dupont", email: "marc@nexyra.app", role: "Editor", status: "Actif" },
  { name: "Lina Roy", email: "lina@nexyra.app", role: "Viewer", status: "Invité" },
  { name: "Tom Albert", email: "tom@nexyra.app", role: "Editor", status: "Actif" },
];

const roleColor: Record<string, string> = {
  Admin: "bg-violet-500/15 text-violet-400",
  Editor: "bg-blue-500/15 text-blue-400",
  Viewer: "bg-muted text-muted-foreground",
};

export function UsersTable() {
  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">{users.length} membres</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher..." className="h-9 w-64 pl-9" />
          </div>
          <Button className="h-9 gap-2"><Plus className="h-4 w-4" /> Inviter</Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-6 py-3"><input type="checkbox" /></th>
              <th className="px-6 py-3">Membre</th>
              <th className="px-6 py-3">Rôle</th>
              <th className="px-6 py-3">Statut</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.email} className="transition hover:bg-muted/30">
                <td className="px-6 py-3"><input type="checkbox" /></td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent" />
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-3"><span className={\`rounded-full px-2 py-0.5 text-xs \${roleColor[u.role]}\`}>{u.role}</span></td>
                <td className="px-6 py-3 text-muted-foreground">{u.status}</td>
                <td className="px-6 py-3 text-right"><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`,
};

const DASHBOARD_KANBAN: PremiumBlock = {
  id: "dashboard-kanban",
  name: "Dashboard Kanban — 4 colonnes drag-ready",
  description: "Kanban dashboard : 4 colonnes (Todo / Doing / Review / Done), cards avec tag couleur, avatar, points.",
  domain: "dashboard",
  tags: ["dashboard", "kanban", "tasks"],
  tsx: `import { Plus, MessageSquare, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";

const cols = [
  { name: "À faire", count: 3, color: "bg-muted-foreground", cards: [
    { tag: "Design", tagColor: "bg-violet-500/15 text-violet-400", title: "Refonte page pricing", comments: 4, files: 2 },
    { tag: "Bug", tagColor: "bg-rose-500/15 text-rose-400", title: "Login mobile crash iOS 17", comments: 2, files: 0 },
  ]},
  { name: "En cours", count: 2, color: "bg-amber-400", cards: [
    { tag: "Feature", tagColor: "bg-blue-500/15 text-blue-400", title: "Onboarding 3 étapes", comments: 6, files: 1 },
  ]},
  { name: "Review", count: 1, color: "bg-violet-400", cards: [
    { tag: "Doc", tagColor: "bg-emerald-500/15 text-emerald-400", title: "Guide API v2", comments: 3, files: 4 },
  ]},
  { name: "Terminé", count: 5, color: "bg-emerald-400", cards: [
    { tag: "Marketing", tagColor: "bg-amber-500/15 text-amber-400", title: "Campagne Q2", comments: 1, files: 0 },
  ]},
];

export function Kanban() {
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tableau</h1>
        <Button className="h-9 gap-2"><Plus className="h-4 w-4" /> Nouvelle tâche</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cols.map((c) => (
          <div key={c.name} className="rounded-2xl border border-border bg-card/40 p-3">
            <div className="flex items-center justify-between px-2 py-2">
              <div className="flex items-center gap-2">
                <span className={\`h-2 w-2 rounded-full \${c.color}\`} />
                <p className="text-sm font-semibold">{c.name}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{c.count}</span>
              </div>
              <button className="text-muted-foreground"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              {c.cards.map((card, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-3">
                  <span className={\`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold \${card.tagColor}\`}>{card.tag}</span>
                  <p className="mt-2 text-sm font-medium leading-snug">{card.title}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex gap-3">
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {card.comments}</span>
                      <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> {card.files}</span>
                    </div>
                    <div className="flex -space-x-1">
                      <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary to-accent ring-2 ring-card" />
                      <div className="h-5 w-5 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 ring-2 ring-card" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
`,
};

const DASHBOARD_SETTINGS: PremiumBlock = {
  id: "dashboard-settings",
  name: "Dashboard Settings — Tabs + sections",
  description: "Settings dashboard : tabs verticaux gauche, sections (profil / sécurité / notifs) avec form + toggles.",
  domain: "dashboard",
  tags: ["dashboard", "settings"],
  tsx: `import { User, Bell, Lock, CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const tabs = [
  { icon: User, label: "Profil", active: true },
  { icon: Lock, label: "Sécurité" },
  { icon: Bell, label: "Notifications" },
  { icon: CreditCard, label: "Facturation" },
];

const toggles = [
  { label: "Email résumé hebdomadaire", on: true },
  { label: "Notifications push", on: false },
  { label: "Mises à jour produit", on: true },
];

export function Settings() {
  return (
    <div className="grid gap-6 p-6 md:grid-cols-[220px_1fr]">
      <aside>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Réglages</h1>
        <nav className="space-y-1">
          {tabs.map((t) => (
            <button key={t.label} className={\`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition \${t.active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}\`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Profil</h2>
          <p className="text-sm text-muted-foreground">Ces infos sont visibles publiquement.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div><label className="text-xs text-muted-foreground">Nom</label><Input defaultValue="Sophie Mercier" /></div>
            <div><label className="text-xs text-muted-foreground">Email</label><Input defaultValue="sophie@nexyra.app" /></div>
            <div className="md:col-span-2"><label className="text-xs text-muted-foreground">Bio</label><Input defaultValue="Designer produit" /></div>
          </div>
          <div className="mt-6 flex justify-end gap-2"><Button variant="outline">Annuler</Button><Button>Enregistrer</Button></div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <ul className="mt-4 divide-y divide-border">
            {toggles.map((t) => (
              <li key={t.label} className="flex items-center justify-between py-3">
                <span className="text-sm">{t.label}</span>
                <button className={\`relative h-6 w-11 rounded-full transition \${t.on ? "bg-primary" : "bg-muted"}\`}>
                  <span className={\`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all \${t.on ? "left-5" : "left-0.5"}\`} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
`,
};

const DASHBOARD_BILLING: PremiumBlock = {
  id: "dashboard-billing",
  name: "Dashboard Billing — Plan + invoices",
  description: "Billing dashboard : carte plan actuel + usage barre, table factures avec statut + download.",
  domain: "dashboard",
  tags: ["dashboard", "billing"],
  tsx: `import { Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const invoices = [
  { id: "INV-0042", date: "1 mars 2026", amount: "29 €", status: "Payée" },
  { id: "INV-0041", date: "1 février 2026", amount: "29 €", status: "Payée" },
  { id: "INV-0040", date: "1 janvier 2026", amount: "29 €", status: "Payée" },
];

export function Billing() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Facturation</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-accent/10 p-6 lg:col-span-2">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><span className="text-xs font-semibold uppercase tracking-wider text-primary">Plan actuel</span></div>
          <p className="mt-3 text-3xl font-bold">Pro — 29 €/mois</p>
          <p className="mt-1 text-sm text-muted-foreground">Renouvellement le 1er avril 2026</p>
          <div className="mt-6">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Messages utilisés</span><span>4 280 / 10 000</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-[42%] rounded-full bg-gradient-to-r from-primary to-accent" /></div>
          </div>
          <div className="mt-6 flex gap-2"><Button>Changer de plan</Button><Button variant="outline">Annuler l'abonnement</Button></div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Méthode de paiement</p>
          <p className="mt-3 font-semibold">Visa •••• 4242</p>
          <p className="text-xs text-muted-foreground">Expire 12/27</p>
          <Button variant="outline" className="mt-4 w-full">Mettre à jour</Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4"><h3 className="font-semibold">Historique</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-6 py-3">N°</th><th className="px-6 py-3">Date</th><th className="px-6 py-3">Montant</th><th className="px-6 py-3">Statut</th><th className="px-6 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map((i) => (
              <tr key={i.id} className="transition hover:bg-muted/30">
                <td className="px-6 py-3 font-medium">{i.id}</td>
                <td className="px-6 py-3 text-muted-foreground">{i.date}</td>
                <td className="px-6 py-3">{i.amount}</td>
                <td className="px-6 py-3"><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">{i.status}</span></td>
                <td className="px-6 py-3 text-right"><Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`,
};

const DASHBOARD_AUTH_CARD: PremiumBlock = {
  id: "dashboard-auth-card",
  name: "Dashboard Auth — Login card centered",
  description: "Carte login dashboard : centré, logo, inputs, CTA full, séparateur, sociaux, lien signup.",
  domain: "dashboard",
  tags: ["dashboard", "auth", "login"],
  tsx: `import { Mail, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AuthCard() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent" />
          <h1 className="mt-4 text-2xl font-bold">Bon retour</h1>
          <p className="text-sm text-muted-foreground">Connecte-toi à ton espace</p>
        </div>
        <form className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="email" placeholder="Email" className="h-11 pl-9" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="password" placeholder="Mot de passe" className="h-11 pl-9" />
          </div>
          <Button className="h-11 w-full bg-gradient-to-r from-primary to-accent">Se connecter</Button>
        </form>
        <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">ou</span><div className="h-px flex-1 bg-border" /></div>
        <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-10">Google</Button><Button variant="outline" className="h-10">GitHub</Button></div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Pas de compte ? <a href="#" className="font-semibold text-primary">S'inscrire</a></p>
      </div>
    </div>
  );
}
`,
};

const DASHBOARD_NOTIFICATIONS_CENTER: PremiumBlock = {
  id: "dashboard-notifications-center",
  name: "Dashboard Notifications — Center panel",
  description: "Centre de notifications : header avec mark-all-read, liste groupée par type, status non lu/lu.",
  domain: "dashboard",
  tags: ["dashboard", "notifications"],
  tsx: `import { CheckCheck, AlertCircle, Info, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const items = [
  { icon: AlertCircle, color: "text-rose-400 bg-rose-500/15", title: "Quota API à 90%", text: "Pense à upgrader avant fin de mois.", time: "il y a 5min", unread: true },
  { icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/15", title: "Déploiement réussi", text: "v2.4.1 en production.", time: "il y a 1h", unread: true },
  { icon: Info, color: "text-blue-400 bg-blue-500/15", title: "Nouvelle fonctionnalité", text: "Découvre les blocs UI premium.", time: "il y a 3h", unread: false },
  { icon: Info, color: "text-blue-400 bg-blue-500/15", title: "Maintenance planifiée", text: "Dimanche 2h–4h UTC.", time: "Hier", unread: false },
];

export function NotificationsCenter() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">{items.filter((i) => i.unread).length} non lues</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2"><CheckCheck className="h-4 w-4" /> Tout marquer lu</Button>
      </div>
      <ul className="mt-6 space-y-2">
        {items.map((it, i) => (
          <li key={i} className={\`group flex items-start gap-3 rounded-2xl border border-border p-4 transition \${it.unread ? "bg-primary/5" : "bg-card"}\`}>
            <div className={\`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl \${it.color}\`}><it.icon className="h-4 w-4" /></div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{it.title}</p>
                {it.unread && <span className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{it.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">{it.time}</p>
            </div>
            <button className="opacity-0 transition group-hover:opacity-100"><X className="h-4 w-4 text-muted-foreground" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
`,
};

/* --------------------------------------------------------------------- */

export const PREMIUM_BLOCKS: PremiumBlock[] = [
  // SaaS — pack initial
  SAAS_HERO_MESH,
  SAAS_FEATURES_BENTO,
  SAAS_PRICING_3COLS,
  SAAS_TESTIMONIALS_MARQUEE,
  SAAS_CTA_GRADIENT,
  SAAS_NAVBAR,
  SAAS_FOOTER,
  // SaaS — extension (13 nouveaux → total 20)
  SAAS_STATS_STRIP,
  SAAS_FAQ_ACCORDION,
  SAAS_LOGOS_CLOUD,
  SAAS_COMPARISON_TABLE,
  SAAS_BLOG_GRID,
  SAAS_TEAM_GRID,
  SAAS_CONTACT_FORM,
  SAAS_NEWSLETTER,
  SAAS_VIDEO_HERO,
  SAAS_TIMELINE,
  SAAS_INTEGRATIONS_GRID,
  SAAS_BENTO_LARGE,
  SAAS_USECASES_TABS,
  // Mobile (15)
  MOBILE_SHELL,
  MOBILE_HOME_DISCOVER,
  MOBILE_DETAIL,
  MOBILE_AUTH,
  MOBILE_ONBOARDING,
  MOBILE_PROFILE,
  MOBILE_SEARCH,
  MOBILE_CHAT,
  MOBILE_NOTIFICATIONS,
  MOBILE_CART,
  MOBILE_CHECKOUT,
  MOBILE_EMPTY_STATE,
  MOBILE_PAYWALL,
  MOBILE_STORY_VIEWER,
  MOBILE_MAP_NEARBY,
  // Website (10)
  WEBSITE_HERO_EDITORIAL,
  WEBSITE_NAVBAR,
  WEBSITE_FOOTER,
  WEBSITE_FEATURE_SPLIT,
  WEBSITE_GALLERY,
  WEBSITE_TESTIMONIAL_QUOTE,
  WEBSITE_PRODUCT_GRID,
  WEBSITE_BLOG_EDITORIAL,
  WEBSITE_CONTACT_SPLIT,
  WEBSITE_CTA_BANNER,
  // Dashboard (8)
  DASHBOARD_SHELL,
  DASHBOARD_ANALYTICS,
  DASHBOARD_TABLE_USERS,
  DASHBOARD_KANBAN,
  DASHBOARD_SETTINGS,
  DASHBOARD_BILLING,
  DASHBOARD_AUTH_CARD,
  DASHBOARD_NOTIFICATIONS_CENTER,
];

/** Map section keyword → block ids most relevant. */
const SECTION_INDEX: Record<string, string[]> = {
  hero: ["saas-hero-mesh", "saas-video-hero", "website-hero-editorial"],
  "video-hero": ["saas-video-hero"],
  features: ["saas-features-bento", "saas-bento-large", "website-feature-split"],
  bento: ["saas-bento-large", "saas-features-bento"],
  pricing: ["saas-pricing-3cols"],
  testimonials: ["saas-testimonials-marquee", "website-testimonial-quote"],
  cta: ["saas-cta-gradient", "saas-newsletter", "website-cta-banner"],
  navbar: ["saas-navbar", "website-navbar"],
  footer: ["saas-footer", "website-footer"],
  stats: ["saas-stats-strip"],
  faq: ["saas-faq-accordion"],
  logos: ["saas-logos-cloud"],
  "social-proof": ["saas-logos-cloud", "saas-stats-strip", "saas-testimonials-marquee"],
  comparison: ["saas-comparison-table"],
  blog: ["saas-blog-grid", "website-blog-editorial"],
  team: ["saas-team-grid"],
  about: ["saas-team-grid"],
  contact: ["saas-contact-form", "website-contact-split"],
  newsletter: ["saas-newsletter"],
  timeline: ["saas-timeline"],
  process: ["saas-timeline"],
  integrations: ["saas-integrations-grid"],
  usecases: ["saas-usecases-tabs"],
  tabs: ["saas-usecases-tabs"],
  // Website
  "website-hero": ["website-hero-editorial"],
  "website-navbar": ["website-navbar"],
  "website-footer": ["website-footer"],
  gallery: ["website-gallery"],
  product: ["website-product-grid"],
  shop: ["website-product-grid"],
  ecommerce: ["website-product-grid", "mobile-cart", "mobile-checkout"],
  editorial: ["website-hero-editorial", "website-feature-split", "website-blog-editorial"],
  // Dashboard
  dashboard: ["dashboard-shell", "dashboard-analytics"],
  "dashboard-shell": ["dashboard-shell"],
  analytics: ["dashboard-analytics"],
  charts: ["dashboard-analytics"],
  table: ["dashboard-table-users"],
  users: ["dashboard-table-users"],
  kanban: ["dashboard-kanban"],
  board: ["dashboard-kanban"],
  tasks: ["dashboard-kanban"],
  settings: ["dashboard-settings"],
  billing: ["dashboard-billing"],
  invoices: ["dashboard-billing"],
  notifications: ["dashboard-notifications-center", "mobile-notifications"],
  "auth-card": ["dashboard-auth-card"],
  login: ["dashboard-auth-card", "mobile-auth"],
  // Mobile
  "mobile-app": ["mobile-shell", "mobile-home-discover", "mobile-onboarding"],
  "mobile-shell": ["mobile-shell"],
  "mobile-home": ["mobile-home-discover"],
  "mobile-feed": ["mobile-home-discover"],
  "mobile-detail": ["mobile-detail"],
  "mobile-auth": ["mobile-auth"],
  auth: ["mobile-auth", "dashboard-auth-card"],
  onboarding: ["mobile-onboarding"],
  profile: ["mobile-profile"],
  search: ["mobile-search"],
  chat: ["mobile-chat"],
  messaging: ["mobile-chat"],
  cart: ["mobile-cart"],
  checkout: ["mobile-checkout"],
  "empty-state": ["mobile-empty-state"],
  paywall: ["mobile-paywall"],
  subscription: ["mobile-paywall"],
  story: ["mobile-story-viewer"],
  map: ["mobile-map-nearby"],
  location: ["mobile-map-nearby"],
};

export function lookupBlocks(section: string): PremiumBlock[] {
  const key = section.toLowerCase();
  const ids = SECTION_INDEX[key] ?? [];
  return ids
    .map((id) => PREMIUM_BLOCKS.find((b) => b.id === id))
    .filter((b): b is PremiumBlock => Boolean(b));
}

export function listAvailableSections(): string[] {
  return Object.keys(SECTION_INDEX);
}

/* --------------------------------------------------------------------- */
/* VIBES — variations stylistiques applicables à n'importe quel bloc      */
/* --------------------------------------------------------------------- */

export type BlockVibe = "premium-dark" | "minimal" | "glassmorphism" | "brutalist" | "editorial" | "neon";

export interface VibePreset {
  id: BlockVibe;
  label: string;
  description: string;
  /** Transforms text→text appliqués au TSX. Ordre important. */
  replacements: { from: RegExp | string; to: string }[];
  /** Notes additionnelles passées au LLM. */
  notes: string;
}

const VIBE_PRESETS: Record<BlockVibe, VibePreset> = {
  "premium-dark": {
    id: "premium-dark",
    label: "Premium dark (défaut)",
    description: "Style natif des blocs : fond sombre, gradients violet/bleu, glow subtil.",
    replacements: [],
    notes: "Aucune transformation : c'est le style par défaut des blocs.",
  },
  minimal: {
    id: "minimal",
    label: "Minimal Apple-like",
    description: "Surfaces plates, beaucoup de blanc/neutre, pas de gradient, ombres très douces, radius modeste.",
    replacements: [
      { from: /bg-gradient-to-[a-z]+ from-[\w/-]+ via-[\w/-]+ to-[\w/-]+/g, to: "bg-background" },
      { from: /bg-gradient-to-[a-z]+ from-[\w/-]+ to-[\w/-]+/g, to: "bg-background" },
      { from: /shadow-[\w-]+/g, to: "shadow-sm" },
      { from: /rounded-3xl/g, to: "rounded-xl" },
      { from: /rounded-2xl/g, to: "rounded-lg" },
      { from: /backdrop-blur-[a-z]+/g, to: "" },
      { from: /border-primary\/\d+/g, to: "border-border" },
      { from: /text-transparent bg-clip-text bg-gradient-to-[a-z]+ [^"`]*/g, to: "text-foreground" },
    ],
    notes: "Aplatis tout : aucun gradient, ombres minimales, contraste sobre, radius doux. Privilégier blanc/noir/neutre.",
  },
  glassmorphism: {
    id: "glassmorphism",
    label: "Glassmorphism",
    description: "Cards translucides, blur fort, bordures lumineuses, fond gradient mesh.",
    replacements: [
      { from: /bg-card(?![/\w-])/g, to: "bg-card/40 backdrop-blur-2xl" },
      { from: /bg-background(?![/\w-])/g, to: "bg-background/60 backdrop-blur-xl" },
      { from: /border-border(?![/\w-])/g, to: "border-white/10" },
      { from: /shadow-sm/g, to: "shadow-2xl shadow-primary/10" },
    ],
    notes: "Toutes les surfaces deviennent translucides + blur. Garder un fond gradient mesh derrière.",
  },
  brutalist: {
    id: "brutalist",
    label: "Néo-brutaliste",
    description: "Bordures épaisses, ombres dures décalées, radius nul, couleurs vives saturées.",
    replacements: [
      { from: /rounded-3xl/g, to: "rounded-none" },
      { from: /rounded-2xl/g, to: "rounded-none" },
      { from: /rounded-xl/g, to: "rounded-none" },
      { from: /rounded-lg/g, to: "rounded-none" },
      { from: /shadow-[\w-]+/g, to: "shadow-[6px_6px_0_0_hsl(var(--foreground))]" },
      { from: /border(?!-)/g, to: "border-2" },
      { from: /backdrop-blur-[a-z]+/g, to: "" },
    ],
    notes: "Suppression de tous les radius, bordures épaisses (border-2 min), ombres dures décalées. Tons saturés.",
  },
  editorial: {
    id: "editorial",
    label: "Éditorial magazine",
    description: "Typo serif, larges marges, ratio doré, photo grand format, palette terreuse.",
    replacements: [
      { from: /font-bold/g, to: "font-serif font-bold tracking-tight" },
      { from: /tracking-tight/g, to: "tracking-tighter" },
      { from: /text-5xl|text-6xl|text-7xl/g, to: "text-6xl md:text-7xl" },
    ],
    notes: "Typographie serif (Playfair, Fraunces) pour titres. Beaucoup d'air, photos grand format. Idéal magazines/brand sites.",
  },
  neon: {
    id: "neon",
    label: "Neon cyber",
    description: "Glows colorés intenses (violet/cyan/magenta), texte néon, fond noir profond.",
    replacements: [
      { from: /shadow-[\w-]+/g, to: "shadow-[0_0_40px_hsl(var(--primary)/0.6)]" },
      { from: /border-border(?![/\w-])/g, to: "border-primary/40" },
      { from: /text-foreground(?![/\w-])/g, to: "text-foreground drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]" },
    ],
    notes: "Glows partout, palette OKLCH très saturée (violet 0.3+ / cyan), fond noir oklch(8% 0 0).",
  },
};

export function listVibes(): VibePreset[] {
  return Object.values(VIBE_PRESETS);
}

export interface RemixOptions {
  vibe?: BlockVibe;
  /** Couleur d'accent OKLCH ou nom de token (ex: "oklch(70% 0.2 25)"). Remplace les usages de --primary dans le bloc. */
  accent?: string;
  /** Modifie le radius global : "sharp" | "soft" | "pill". */
  radius?: "sharp" | "soft" | "pill";
  /** Densité visuelle : "airy" augmente paddings/gaps, "compact" les réduit. */
  density?: "airy" | "compact" | "default";
}

const RADIUS_MAP: Record<string, { from: RegExp; to: string }[]> = {
  sharp: [
    { from: /rounded-(3xl|2xl|xl|lg|md)/g, to: "rounded-none" },
    { from: /rounded-full/g, to: "rounded-sm" },
  ],
  soft: [
    { from: /rounded-lg/g, to: "rounded-2xl" },
    { from: /rounded-xl/g, to: "rounded-3xl" },
  ],
  pill: [
    { from: /rounded-(lg|xl|2xl)/g, to: "rounded-full" },
  ],
};

const DENSITY_MAP: Record<string, { regex: RegExp; delta: number; min: number; max: number }[]> = {
  airy: [
    { regex: /\bpy-(\d+)\b/g, delta: 8, min: 0, max: 48 },
    { regex: /\bgap-(\d+)\b/g, delta: 4, min: 0, max: 20 },
  ],
  compact: [
    { regex: /\bpy-(\d+)\b/g, delta: -6, min: 2, max: 999 },
    { regex: /\bgap-(\d+)\b/g, delta: -2, min: 2, max: 999 },
  ],
  default: [],
};

/** Applique une vibe + remix à un bloc et retourne le TSX transformé. */
export function remixBlock(blockId: string, opts: RemixOptions = {}): { block: PremiumBlock; tsx: string; notes: string[] } | null {
  const block = PREMIUM_BLOCKS.find((b) => b.id === blockId);
  if (!block) return null;

  let tsx = block.tsx;
  const notes: string[] = [];

  const vibe = opts.vibe ?? "premium-dark";
  const preset = VIBE_PRESETS[vibe];
  if (preset) {
    for (const r of preset.replacements) {
      tsx = tsx.replace(r.from as RegExp, r.to);
    }
    if (vibe !== "premium-dark") notes.push(`Vibe "${preset.label}" appliquée — ${preset.notes}`);
  }

  if (opts.radius && RADIUS_MAP[opts.radius]) {
    for (const r of RADIUS_MAP[opts.radius]) tsx = tsx.replace(r.from, r.to);
    notes.push(`Radius global → ${opts.radius}.`);
  }

  if (opts.density && DENSITY_MAP[opts.density] && opts.density !== "default") {
    for (const r of DENSITY_MAP[opts.density]) {
      tsx = tsx.replace(r.regex, (_match, num: string) => {
        const prefix = _match.split("-")[0];
        const next = Math.max(r.min, Math.min(r.max, parseInt(num, 10) + r.delta));
        return `${prefix}-${next}`;
      });
    }
    notes.push(`Densité → ${opts.density} (paddings/gaps ajustés).`);
  }

  if (opts.accent) {
    notes.push(
      `Accent couleur demandé : ${opts.accent}. ➜ Mets à jour --primary dans src/styles.css à cette valeur OKLCH (le bloc utilise déjà bg-primary / text-primary).`,
    );
  }

  return { block, tsx, notes };
}

/** Format a block for the LLM consumer (compact yet complete). */
export function formatBlockForPrompt(block: PremiumBlock): string {
  const imgs = block.images
    ? block.images
        .map(
          (im) =>
            `  - ${im.variable} (${im.aspect ?? "1:1"}${im.hero ? ", HERO → use gemini-3-pro-image-preview" : ""}): ${im.prompt}`,
        )
        .join("\n")
    : "  (aucune image requise)";
  return [
    `### BLOCK: ${block.name} [${block.id}]`,
    `Description: ${block.description}`,
    `Tags: ${block.tags.join(", ")}`,
    `Images à générer en parallèle :`,
    imgs,
    "",
    "```tsx",
    block.tsx.trim(),
    "```",
  ].join("\n");
}
