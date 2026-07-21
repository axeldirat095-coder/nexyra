import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Garde d'authentification universel.
 * - Si l'utilisateur n'est pas connecté → redirige vers /auth avec le chemin courant en `redirect`.
 * - Si en cours de chargement → écran de chargement neutre.
 * - Sinon → rend les enfants.
 *
 * Utilisé pour protéger /dev et /settings côté client (l'API reste protégée par RLS Supabase).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });

  useEffect(() => {
    if (!loading && !user && !location.pathname.startsWith("/auth")) {
      const redirect = encodeURIComponent(location.href);
      navigate({ to: "/auth", search: { redirect } as never, replace: true });
    }
  }, [loading, user, navigate, location.href, location.pathname]);

  if (loading || !user) {
    return (
      <div
        role="status"
        aria-label="Vérification de la session"
        className="flex min-h-screen items-center justify-center bg-background"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
