import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, User, LogOut, Maximize2, Minimize2 } from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin } = useIsAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isConnected = !!user;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Déconnecté");
    navigate({ to: "/" });
  };

  // Plein écran (toggle) — utile pour bosser Nexyra sur un seul écran sans la chrome du navigateur.
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      toast.error("Plein écran indisponible");
    }
  };

  const initial = user?.email?.charAt(0).toUpperCase() ?? "?";

  const links = [
    { label: "Discuter", href: "/chat", isRoute: true },
    { label: "Pilotage", href: "/capabilities", isRoute: true },
    { label: "Dev", href: "/dev", isRoute: true },
    { label: "Mes projets", href: "/projects", isRoute: true },
    { label: "Comparatif", href: "/comparison", isRoute: true },
    { label: "Tarifs", href: "#pricing" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-transparent backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <img src="/images/nexyra-logo-transparent.png" alt="Nexyra AI" className="h-8 w-8 object-contain" />
          <span className="text-lg font-bold tracking-tight gradient-text">Nexyra AI</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) =>
            l.isRoute ? (
              <Link
                key={l.href}
                to={l.href}
                  className="text-sm font-medium gradient-text transition-opacity hover:opacity-80"
              >
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} className="text-sm font-medium gradient-text transition-opacity hover:opacity-80">
                {l.label}
              </a>
            )
          )}
          {isAdmin && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20"
              title="Console Admin Nexyra"
            >
              <ShieldAlert className="h-3 w-3" /> Admin
            </Link>
          )}
          <ThemeToggle />
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Quitter le plein écran" : "Passer en plein écran"}
            title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/40 bg-card/40 text-muted-foreground backdrop-blur-md transition-all hover:border-primary/50 hover:text-foreground"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <AuthPill
            isConnected={isConnected}
            initial={initial}
            email={user?.email}
            onLogout={handleLogout}
          />
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground md:hidden"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? (
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-background/90 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-4 px-4 py-6">
              {links.map((l) =>
                l.isRoute ? (
                  <Link key={l.href} to={l.href} onClick={() => setMobileOpen(false)} className="text-sm font-medium gradient-text transition-opacity hover:opacity-80">
                    {l.label}
                  </Link>
                ) : (
                  <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </a>
                )
              )}
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive"
                >
                  <ShieldAlert className="h-4 w-4" /> Console Admin
                </Link>
              )}
              <a href="#pricing" onClick={() => setMobileOpen(false)} className="btn-gradient inline-flex h-10 items-center justify-center px-5 text-sm">
                Commencer gratuitement
              </a>
              <AuthPill
                isConnected={isConnected}
                initial={initial}
                email={user?.email}
                onLogout={() => {
                  setMobileOpen(false);
                  handleLogout();
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

function AuthPill({
  isConnected,
  initial,
  email,
  onLogout,
}: {
  isConnected: boolean;
  initial: string;
  email?: string | null;
  onLogout: () => void;
}) {
  if (!isConnected) {
    return (
      <Link to="/auth" search={{ redirect: undefined }} className="group flex flex-col items-center gap-0.5" title="Se connecter">
        <img
          src="/images/nexyra-logo-transparent.png"
          alt=""
          aria-hidden="true"
          className="h-4 w-4 object-contain opacity-80 transition-opacity group-hover:opacity-100"
        />
        <span className="inline-flex items-center gap-1.5 text-sm font-medium gradient-text transition-opacity group-hover:opacity-80">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
          Connexion
        </span>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/40 px-2 py-1 backdrop-blur-md transition-all hover:border-primary/50"
          title={email ?? "Compte"}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-xs font-bold text-white">
            {initial}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            <User className="mr-2 h-4 w-4" /> Mon profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/dev" className="cursor-pointer">
            Espace Dev
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
