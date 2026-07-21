ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS long_term_summary text,
  ADD COLUMN IF NOT EXISTS summary_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS messages_count_at_summary integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.projects.long_term_summary IS
  'Résumé condensé du projet (décisions, contexte, état) maintenu par Elena. Injecté dans son contexte à chaque tour pour éviter de relire tout l''historique.';
COMMENT ON COLUMN public.projects.summary_updated_at IS
  'Dernière mise à jour automatique du long_term_summary.';
COMMENT ON COLUMN public.projects.messages_count_at_summary IS
  'Nombre de messages assistant au moment du dernier résumé. Sert à déclencher la régénération.';