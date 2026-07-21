import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      toast.success("Connecté !");
      navigate({ to: target, replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Erreur de connexion");
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
          <p className="mt-1 text-sm text-muted-foreground">Connexion admin</p>
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "..." : "Se connecter"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Identifiants admin fournis par Elena
        </p>
        <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">
          ← Retour à l'accueil
        </Link>
      </Card>
    </div>
  );
}
