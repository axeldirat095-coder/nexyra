import { useEffect, useState, useCallback } from "react";

const AUTH_KEY = "nexyra_local_auth";

// Identifiants en dur pour MVP
const VALID_EMAIL = "ets.dirat@hotmail.fr";
const VALID_PASSWORD = "nexyra";

export type LocalUser = { email: string; role: "admin" };
export type LocalSession = { user: LocalUser };

function getStored(): LocalSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSession(session: LocalSession | null) {
  if (session) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(AUTH_KEY);
  }
}

export function useAuth() {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStored();
    setUser(stored?.user ?? null);
    setSession(stored ?? null);
    setLoading(false);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (email !== VALID_EMAIL || password !== VALID_PASSWORD) {
      throw new Error("Email ou mot de passe incorrect");
    }
    const s: LocalSession = { user: { email: VALID_EMAIL, role: "admin" } };
    storeSession(s);
    setUser(s.user);
    setSession(s);
    return s;
  }, []);

  const signOut = useCallback(async () => {
    storeSession(null);
    setUser(null);
    setSession(null);
  }, []);

  return { user, session, loading, signIn, signOut };
}
