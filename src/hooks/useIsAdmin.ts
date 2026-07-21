import { useAuth } from "./useAuth";

/**
 * Indique si l'utilisateur courant possède le rôle 'admin'.
 * Utilisé pour protéger /admin (console interne Nexyra).
 * Version MVP : l'unique compte est admin.
 */
export function useIsAdmin() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  return { isAdmin, loading };
}
