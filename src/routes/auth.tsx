import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({
    meta: [{ title: "Connexion — Nexyra AI" }],
  }),
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const target = redirect ? decodeURIComponent(redirect) : "/dev";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}${target}`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        toast.success("Compte créé. Connecte-toi !");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connecté !");
        window.location.href = target;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="starry-page-bg" />
      <Card className="page-content-layer w-full max-w-md border-border/40 bg-card/60 p-6 backdrop-blur-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight gradient-text">Nexyra AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Connexion à Elena" : "Création du compte admin"}
          </p>
        </div>
        <form onSubmit={handle} className="space-y-4" autoComplete="on">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@nexyra.ai"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            {mode === "signup" && (
              <p className="text-[10px] text-muted-foreground">
                💡 Ton navigateur (Google, Safari…) te proposera d'enregistrer ou de générer un mot de passe sécurisé.
              </p>
            )}
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "..." : mode === "signin" ? "Se connecter" : "Créer le compte"}
          </Button>
        </form>
        <div className="my-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-border/40" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">ou</span>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              const result = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: `${window.location.origin}${target}`,
              });
              if (result.error) throw result.error;
              if (result.redirected) return;
              window.location.href = target;
            } catch (err: any) {
              toast.error(err?.message ?? "Erreur Google");
              setLoading(false);
            }
          }}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continuer avec Google
        </Button>
        <button
          type="button"
          onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
        <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">
          ← Retour à l'accueil
        </Link>
      </Card>
    </div>
  );
}
