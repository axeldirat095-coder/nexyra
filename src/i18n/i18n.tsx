import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "fr" | "en";

const KEY = "nexyra-lang";

const dict: Record<Lang, Record<string, string>> = {
  fr: {
    "settings.title": "Paramètres",
    "settings.projects": "Mes projets",
    "settings.projects.desc": "Renommer, archiver, supprimer",
    "settings.language": "Langue",
    "settings.appearance": "Apparence",
    "projects.empty": "Aucun projet pour l'instant.",
    "projects.rename": "Renommer",
    "projects.archive": "Archiver",
    "projects.unarchive": "Désarchiver",
    "projects.delete": "Supprimer",
    "projects.confirm_delete": "Supprimer ce projet définitivement ?",
    "projects.saved": "Projet mis à jour",
    "projects.deleted": "Projet supprimé",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.loading": "Chargement…",
  },
  en: {
    "settings.title": "Settings",
    "settings.projects": "My projects",
    "settings.projects.desc": "Rename, archive, delete",
    "settings.language": "Language",
    "settings.appearance": "Appearance",
    "projects.empty": "No projects yet.",
    "projects.rename": "Rename",
    "projects.archive": "Archive",
    "projects.unarchive": "Unarchive",
    "projects.delete": "Delete",
    "projects.confirm_delete": "Delete this project permanently?",
    "projects.saved": "Project updated",
    "projects.deleted": "Project deleted",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.loading": "Loading…",
  },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string };
const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fr");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Lang | null) ?? "fr";
    setLangState(stored);
    document.documentElement.lang = stored;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        localStorage.setItem(KEY, l);
        document.documentElement.lang = l;
      },
      t: (k) => dict[lang][k] ?? dict.fr[k] ?? k,
    }),
    [lang],
  );

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) {
    // Fallback non-fatal pour composants hors provider
    return { lang: "fr" as Lang, setLang: () => {}, t: (k: string) => dict.fr[k] ?? k };
  }
  return ctx;
}
