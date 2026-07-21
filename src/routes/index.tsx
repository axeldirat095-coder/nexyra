import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Pricing } from "@/components/Pricing";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Nexyra AI — Votre équipe IA, prête à l'emploi" },
      { name: "description", content: "Plateforme SaaS d'intelligence artificielle multi-agents pour entrepreneurs et créateurs. Automatisez, analysez et créez avec des agents IA spécialisés." },
      { property: "og:title", content: "Nexyra AI — Votre équipe IA, prête à l'emploi" },
      { property: "og:description", content: "Plateforme SaaS d'intelligence artificielle multi-agents pour entrepreneurs et créateurs." },
    ],
  }),
});

function Index() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="starry-page-bg" />
      <div className="page-content-layer">
        <Navbar />
        <Hero />
        <Pricing />
        <Footer />
      </div>
    </div>
  );
}
