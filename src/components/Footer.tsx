import { Button } from "@/components/ui/button";
import { Rocket, ExternalLink } from "lucide-react";
import { CommunityCTA } from "@/components/community/CommunityCTA";

export function Footer() {
  return (
    <footer className="px-4 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Button asChild size="lg" className="gap-2">
            <a href="/dev" target="_blank" rel="noopener noreferrer">
              <Rocket className="h-4 w-4" />
              Ouvrir Nexyra Dev
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          </Button>
        </div>
        <div className="flex w-full flex-col items-center gap-8 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <img src="/images/nexyra-logo-transparent.png" alt="Nexyra AI" className="h-7 w-7 object-contain" />
            <span className="text-sm font-semibold gradient-text">Nexyra AI</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <a href="/dev" className="transition-colors hover:text-foreground">Dev</a>
            <a href="/capabilities" className="transition-colors hover:text-foreground">Pilotage</a>
            <a href="/showcase" className="transition-colors hover:text-foreground">Showcase</a>
            <a href="/feedback" className="transition-colors hover:text-foreground">Feedback</a>
            <a href="/integrations" className="transition-colors hover:text-foreground">Intégrations</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Tarifs</a>
            <CommunityCTA variant="inline" />
          </nav>
          <p className="text-xs text-muted-foreground">© 2026 Nexyra AI. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
}
