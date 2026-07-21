-- Fonction utilitaire timestamps (idempotente)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.block_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  preview_emoji text DEFAULT '🧩',
  code text NOT NULL,
  imports jsonb DEFAULT '[]'::jsonb,
  sort_order int DEFAULT 0,
  is_public boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_block_templates_category ON public.block_templates(category, sort_order);

ALTER TABLE public.block_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public blocks readable by all authenticated users"
  ON public.block_templates FOR SELECT
  TO authenticated
  USING (is_public = true);

CREATE TRIGGER trg_block_templates_updated_at
  BEFORE UPDATE ON public.block_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.block_templates (slug, name, category, description, preview_emoji, code, sort_order) VALUES

('hero-minimal', 'Hero Minimal', 'hero', 'Hero centré sobre, headline + sous-titre + 2 CTA', '✨',
$BLOCK$<section className="relative w-full py-24 md:py-32 bg-background">
  <div className="container mx-auto px-4 text-center max-w-4xl">
    <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">Nouveau</span>
    <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
      Construisez plus vite,<br/>livrez plus loin.
    </h1>
    <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
      La plateforme tout-en-un qui transforme vos idées en produits en quelques minutes.
    </p>
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
      <button className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition">Commencer gratuitement</button>
      <button className="px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-accent transition">Voir la démo</button>
    </div>
  </div>
</section>$BLOCK$, 1),

('hero-split', 'Hero Split', 'hero', 'Hero deux colonnes : texte + visuel', '🪄',
$BLOCK$<section className="w-full py-20 bg-background">
  <div className="container mx-auto px-4 grid md:grid-cols-2 gap-12 items-center">
    <div>
      <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6 leading-tight">
        L'outil qui pense<br/><span className="text-primary">comme vous</span>.
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Automatisez vos workflows et concentrez-vous sur ce qui compte vraiment.
      </p>
      <div className="flex gap-3">
        <button className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium">Essayer</button>
        <button className="px-6 py-3 rounded-lg border border-border text-foreground font-medium">En savoir plus</button>
      </div>
    </div>
    <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-border flex items-center justify-center">
      <span className="text-6xl">🚀</span>
    </div>
  </div>
</section>$BLOCK$, 2),

('features-grid-3', 'Features 3 colonnes', 'features', 'Grille de 3 features avec icônes', '⚡',
$BLOCK$<section className="w-full py-20 bg-background">
  <div className="container mx-auto px-4">
    <div className="text-center mb-12">
      <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">Tout ce dont vous avez besoin</h2>
      <p className="text-muted-foreground max-w-2xl mx-auto">Trois piliers pour propulser votre activité.</p>
    </div>
    <div className="grid md:grid-cols-3 gap-6">
      {[
        { icon: '⚡', title: 'Ultra rapide', desc: 'Des temps de chargement éclairs sur tous les appareils.' },
        { icon: '🔒', title: 'Sécurisé', desc: 'Vos données sont chiffrées de bout en bout.' },
        { icon: '🎯', title: 'Précis', desc: 'Des résultats fiables grâce à notre IA dernière génération.' },
      ].map((f, i) => (
        <div key={i} className="p-6 rounded-xl border border-border bg-card hover:border-primary/50 transition">
          <div className="text-3xl mb-4">{f.icon}</div>
          <h3 className="text-lg font-semibold text-foreground mb-2">{f.title}</h3>
          <p className="text-sm text-muted-foreground">{f.desc}</p>
        </div>
      ))}
    </div>
  </div>
</section>$BLOCK$, 3),

('features-bento', 'Features Bento', 'features', 'Grille bento moderne avec tailles variées', '🎨',
$BLOCK$<section className="w-full py-20 bg-background">
  <div className="container mx-auto px-4">
    <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-12">Une suite complète</h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto">
      <div className="md:col-span-2 p-8 rounded-2xl bg-card border border-border min-h-[240px]">
        <div className="text-3xl mb-3">📊</div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Analytics temps réel</h3>
        <p className="text-muted-foreground">Suivez vos KPI sans délai.</p>
      </div>
      <div className="p-8 rounded-2xl bg-primary text-primary-foreground min-h-[240px]">
        <div className="text-3xl mb-3">⚡</div>
        <h3 className="text-xl font-semibold mb-2">Performance</h3>
        <p className="opacity-90">Le plus rapide du marché.</p>
      </div>
      <div className="p-8 rounded-2xl bg-card border border-border">
        <div className="text-3xl mb-3">🔌</div>
        <h3 className="text-xl font-semibold text-foreground mb-2">100+ intégrations</h3>
      </div>
      <div className="md:col-span-2 p-8 rounded-2xl bg-accent text-accent-foreground">
        <div className="text-3xl mb-3">🤖</div>
        <h3 className="text-xl font-semibold mb-2">IA intégrée</h3>
        <p className="opacity-90">Automatisez tout en un clic.</p>
      </div>
    </div>
  </div>
</section>$BLOCK$, 4),

('pricing-3-tiers', 'Pricing 3 plans', 'pricing', 'Tableau de prix 3 colonnes avec plan recommandé', '💎',
$BLOCK$<section className="w-full py-20 bg-background">
  <div className="container mx-auto px-4">
    <div className="text-center mb-12">
      <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">Tarifs simples et clairs</h2>
      <p className="text-muted-foreground">Choisissez le plan qui vous correspond.</p>
    </div>
    <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {[
        { name: 'Starter', price: '0€', desc: 'Pour découvrir', features: ['1 projet', '100 actions/mois', 'Support email'], highlight: false },
        { name: 'Pro', price: '29€', desc: 'Le plus populaire', features: ['Projets illimités', '10K actions/mois', 'Support prioritaire', 'API access'], highlight: true },
        { name: 'Business', price: '99€', desc: 'Pour les équipes', features: ['Tout Pro', 'Multi-utilisateurs', 'SLA 99.9%', 'Account manager'], highlight: false },
      ].map((p, i) => (
        <div key={i} className={`p-6 rounded-2xl border ${p.highlight ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border bg-card'}`}>
          {p.highlight && <span className="inline-block px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium mb-3">Recommandé</span>}
          <h3 className="text-xl font-semibold text-foreground">{p.name}</h3>
          <p className="text-sm text-muted-foreground mb-4">{p.desc}</p>
          <div className="mb-6"><span className="text-4xl font-bold text-foreground">{p.price}</span><span className="text-muted-foreground">/mois</span></div>
          <ul className="space-y-2 mb-6">
            {p.features.map((f, j) => <li key={j} className="text-sm text-foreground flex gap-2"><span className="text-primary">✓</span>{f}</li>)}
          </ul>
          <button className={`w-full py-2.5 rounded-lg font-medium ${p.highlight ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground'}`}>Choisir</button>
        </div>
      ))}
    </div>
  </div>
</section>$BLOCK$, 5),

('testimonials-grid', 'Témoignages grille', 'testimonials', 'Grille de 3 témoignages clients', '💬',
$BLOCK$<section className="w-full py-20 bg-background">
  <div className="container mx-auto px-4">
    <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-12">Ils nous font confiance</h2>
    <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
      {[
        { name: 'Marie L.', role: 'CEO @ Acme', quote: 'Un changement radical pour mon équipe. Plus rien à voir avec avant.' },
        { name: 'Thomas R.', role: 'Founder @ Lumen', quote: 'Simple, puissant, et le support est exceptionnel. Je recommande à 100%.' },
        { name: 'Sarah K.', role: 'Designer @ Vivid', quote: 'Enfin un outil qui comprend les vrais besoins des créateurs.' },
      ].map((t, i) => (
        <div key={i} className="p-6 rounded-xl border border-border bg-card">
          <div className="text-2xl text-primary mb-3">"</div>
          <p className="text-foreground mb-6">{t.quote}</p>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent" />
            <div>
              <div className="font-medium text-foreground text-sm">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.role}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
</section>$BLOCK$, 6),

('cta-centered', 'CTA Centré', 'cta', 'Bandeau d''appel à l''action centré gradient', '🎯',
$BLOCK$<section className="w-full py-20 bg-background">
  <div className="container mx-auto px-4">
    <div className="max-w-4xl mx-auto p-10 md:p-16 rounded-3xl bg-gradient-to-br from-primary to-accent text-primary-foreground text-center">
      <h2 className="text-3xl md:text-4xl font-bold mb-4">Prêt à passer à la vitesse supérieure ?</h2>
      <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">Rejoignez des milliers d'utilisateurs qui ont déjà transformé leur activité.</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button className="px-6 py-3 rounded-lg bg-background text-foreground font-medium hover:opacity-90">Démarrer maintenant</button>
        <button className="px-6 py-3 rounded-lg border border-primary-foreground/30 font-medium hover:bg-primary-foreground/10">Parler à un expert</button>
      </div>
    </div>
  </div>
</section>$BLOCK$, 7),

('footer-simple', 'Footer Simple', 'footer', 'Footer compact 4 colonnes', '🦶',
$BLOCK$<footer className="w-full border-t border-border bg-background">
  <div className="container mx-auto px-4 py-12">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
      <div>
        <div className="font-bold text-foreground mb-3">Produit</div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li><a href="#" className="hover:text-foreground">Fonctionnalités</a></li>
          <li><a href="#" className="hover:text-foreground">Tarifs</a></li>
          <li><a href="#" className="hover:text-foreground">Démo</a></li>
        </ul>
      </div>
      <div>
        <div className="font-bold text-foreground mb-3">Société</div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li><a href="#" className="hover:text-foreground">À propos</a></li>
          <li><a href="#" className="hover:text-foreground">Blog</a></li>
          <li><a href="#" className="hover:text-foreground">Carrières</a></li>
        </ul>
      </div>
      <div>
        <div className="font-bold text-foreground mb-3">Ressources</div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li><a href="#" className="hover:text-foreground">Documentation</a></li>
          <li><a href="#" className="hover:text-foreground">Support</a></li>
        </ul>
      </div>
      <div>
        <div className="font-bold text-foreground mb-3">Légal</div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li><a href="#" className="hover:text-foreground">Mentions</a></li>
          <li><a href="#" className="hover:text-foreground">Confidentialité</a></li>
        </ul>
      </div>
    </div>
    <div className="pt-8 border-t border-border text-center text-sm text-muted-foreground">
      © 2025 Votre marque. Tous droits réservés.
    </div>
  </div>
</footer>$BLOCK$, 8);