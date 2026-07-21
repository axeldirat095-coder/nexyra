import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Shield, Lock, Database, Eye, FileText, Mail } from "lucide-react";

export const Route = createFileRoute("/trust")({
  component: TrustPage,
  head: () => ({
    meta: [
      { title: "Confiance & Sécurité — Nexyra AI" },
      {
        name: "description",
        content:
          "Comment Nexyra AI protège vos données : authentification, hébergement, sous-traitants, conservation et contact sécurité.",
      },
      { property: "og:title", content: "Confiance & Sécurité — Nexyra AI" },
      {
        property: "og:description",
        content:
          "Politiques de sécurité, hébergement, données et contact de Nexyra AI.",
      },
    ],
  }),
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Shield;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card/40 backdrop-blur p-6 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function TrustPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="starry-page-bg" />
      <div className="page-content-layer">
        <Navbar />
        <main className="container max-w-4xl mx-auto px-4 py-16 space-y-10">
          <header className="space-y-4 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium">
              <Shield className="h-3.5 w-3.5" />
              Confiance & Sécurité
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Comment nous protégeons vos données
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Cette page est maintenue par l'équipe Nexyra AI pour répondre aux
              questions courantes sur la sécurité et la confidentialité. Elle ne
              constitue pas une certification indépendante.
            </p>
          </header>

          <div className="grid gap-4">
            <Section icon={Lock} title="Accès et authentification">
              <p>
                L'accès à votre compte est protégé par une connexion email /
                mot de passe et par la connexion Google. Les sessions sont
                gérées côté navigateur via des jetons sécurisés.
              </p>
              <p>
                Les actions sensibles sont vérifiées côté serveur, et chaque
                utilisateur ne peut accéder qu'à ses propres données grâce à
                des règles d'isolation au niveau base de données.
              </p>
            </Section>

            <Section icon={Database} title="Hébergement et infrastructure">
              <p>
                L'application est hébergée sur l'infrastructure Lovable Cloud.
                La base de données et l'authentification s'appuient sur des
                services managés conformes aux standards de l'industrie.
              </p>
              <p>
                Les communications entre votre navigateur et nos serveurs sont
                chiffrées en transit (HTTPS/TLS).
              </p>
            </Section>

            <Section icon={Eye} title="Données collectées et usage">
              <p>
                Nous collectons uniquement les données nécessaires au
                fonctionnement du service : compte utilisateur, projets que
                vous créez, conversations avec l'agent Elena, fichiers que vous
                déposez dans votre espace de travail.
              </p>
              <p>
                Vos contenus ne sont jamais utilisés pour entraîner des modèles
                d'IA tiers. Les appels aux fournisseurs d'IA sont effectués via
                des passerelles qui transmettent uniquement les éléments
                nécessaires à la réponse demandée.
              </p>
            </Section>

            <Section icon={FileText} title="Sous-traitants et intégrations">
              <p>
                Nous nous appuyons sur des fournisseurs reconnus pour
                l'hébergement, l'envoi d'e-mails transactionnels et les modèles
                d'IA. Lorsque vous connectez un service externe (GitHub,
                fournisseur IA, intégration webhook), les jetons d'accès sont
                chiffrés et ne sont jamais renvoyés au navigateur.
              </p>
            </Section>

            <Section icon={Database} title="Conservation et suppression">
              <p>
                Vos données sont conservées tant que votre compte est actif.
                Vous pouvez à tout moment supprimer un projet ou une
                conversation depuis l'application.
              </p>
              <p>
                Pour demander la suppression complète de votre compte et des
                données associées, contactez-nous (voir ci-dessous).
              </p>
            </Section>

            <Section icon={Mail} title="Contact sécurité">
              <p>
                Pour toute question liée à la sécurité, à la vie privée ou
                pour signaler une vulnérabilité, écrivez-nous. Nous accusons
                réception et traitons chaque signalement de façon
                confidentielle.
              </p>
              <p>
                <a
                  href="mailto:security@nexyra.ai"
                  className="text-primary hover:underline"
                >
                  security@nexyra.ai
                </a>
              </p>
            </Section>
          </div>

          <p className="text-xs text-muted-foreground text-center pt-6">
            Dernière mise à jour : juin 2026. Cette page sera enrichie au fur
            et à mesure de l'évolution du produit.
          </p>
        </main>
        <Footer />
      </div>
    </div>
  );
}
