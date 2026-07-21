UPDATE public.capabilities
SET status = 'done',
    completed_at = COALESCE(completed_at, now()),
    info = CASE
      WHEN title ILIKE '%animations premium%' THEN
        'framer-motion utilisé partout (drawers, navbar mobile, idées, bulle Elena). Ajout : transition de page douce au RootComponent (fade+translate, 280ms, easing premium) et hook useScrollReveal qui active .is-visible sur les éléments .reveal-on-scroll via IntersectionObserver. Utilities CSS hover-lift / hover-scale / .stagger déjà disponibles dans styles.css. Respecte prefers-reduced-motion.'
      WHEN title ILIKE '%idée captée%' OR title ILIKE '%idee captee%' THEN
        'Bulle "💡 Idée captée" rendue au-dessus de l''input chat avec animation spring (motion.button, AnimatePresence). Détection automatique via detectIdea() sur les patterns 💡 / idée: / idea: / note:. Insertion immédiate dans la table ideas (org+project scope), badge cliquable qui ouvre le panneau IdeasDrawer avec compteur pending et actions Garder/Rejeter/Supprimer.'
      WHEN title ILIKE '%mode clair%' OR title ILIKE '%mode sombre%' OR title ILIKE '%clair / mode sombre%' THEN
        'Toggle thème clair/sombre fonctionnel : hook useTheme persiste le choix dans localStorage (clé nexyra-theme), applique .light/.dark sur <html> + colorScheme. Composant ThemeToggle (icône Sun/Moon) intégré dans la Navbar publique ET dans le header de l''espace /dev. Variables CSS .light complètes dans styles.css (background, foreground, primary, sidebar...).'
      ELSE info
    END
WHERE category_id = 'ui-ux'
  AND (
    title ILIKE '%animations premium%'
    OR title ILIKE '%idée captée%'
    OR title ILIKE '%idee captee%'
    OR title ILIKE '%mode clair%'
    OR title ILIKE '%mode sombre%'
    OR title ILIKE '%clair / mode sombre%'
  );