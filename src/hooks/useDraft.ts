import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useDraft — auto-save d'un brouillon en localStorage avec debounce.
 * Anti-perte : si l'utilisateur recharge ou se trompe de bouton, son texte est restauré au mount.
 *
 * @param key   Clé localStorage (préfixe "nexyra:draft:" auto-ajouté).
 * @param debounceMs Délai d'écriture après la dernière frappe (défaut 500ms).
 */
export function useDraft(key: string, debounceMs = 500) {
  const storageKey = `nexyra:draft:${key}`;
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (value) window.localStorage.setItem(storageKey, value);
        else window.localStorage.removeItem(storageKey);
      } catch {
        /* quota / private mode : noop */
      }
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, storageKey, debounceMs]);

  const clear = useCallback(() => {
    setValue("");
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
  }, [storageKey]);

  return [value, setValue, clear] as const;
}
