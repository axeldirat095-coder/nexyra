-- 1. Étendre l'enum ai_provider
ALTER TYPE public.ai_provider ADD VALUE IF NOT EXISTS 'codex';
ALTER TYPE public.ai_provider ADD VALUE IF NOT EXISTS 'xai';
ALTER TYPE public.ai_provider ADD VALUE IF NOT EXISTS 'mistral';

-- 2. Ajouter les nouvelles capacités prioritaires
INSERT INTO public.capabilities
  (category_id, category_label, category_icon, category_vision, title, info, status, priority, effort, position)
VALUES
  ('agent', 'Agent autonome', 'Brain',
   'Elena doit se comporter comme l''agent Lovable : autonome, transparente, jamais perdue.',
   'Streaming live des étapes (✍️ écrit Hero.tsx…)',
   'Pendant que l''agent boucle côté serveur, le client doit voir en direct chaque tool-call (write/read/run) avec le nom du fichier — pas juste un spinner.',
   'todo', 'P0', 'M', 100),
  ('agent', 'Agent autonome', 'Brain',
   'Elena doit se comporter comme l''agent Lovable : autonome, transparente, jamais perdue.',
   'Undo / rollback d''une session agent',
   'Bouton "Annuler les changements de cette réponse" qui restaure l''état du sandbox d''avant le tour agent. Indispensable quand Elena casse quelque chose.',
   'todo', 'P0', 'M', 101),
  ('agent', 'Agent autonome', 'Brain',
   'Elena doit se comporter comme l''agent Lovable : autonome, transparente, jamais perdue.',
   'Diff preview avant application',
   'Pour les modifications lourdes, afficher un diff (avant/après) que l''utilisateur valide avant que la sandbox ne change.',
   'todo', 'P1', 'L', 102),
  ('agent', 'Agent autonome', 'Brain',
   'Elena doit se comporter comme l''agent Lovable : autonome, transparente, jamais perdue.',
   'Auto-retry sur erreur de build (try-to-fix)',
   'Si Sandpack remonte une erreur de compilation après un tour agent, relancer automatiquement Elena avec le message d''erreur en contexte (max 2 retries).',
   'todo', 'P0', 'M', 103),
  ('agent', 'Agent autonome', 'Brain',
   'Elena doit se comporter comme l''agent Lovable : autonome, transparente, jamais perdue.',
   'Onboarding projet (questions guidées)',
   'Sur la 1ère interaction d''un projet vide, Elena pose 2-3 questions ciblées (style visuel, sections clés, branding) avant de générer.',
   'todo', 'P1', 'S', 104),
  ('ai', 'Cerveau IA', 'Brain',
   'Routage intelligent multi-modèles, économe et performant.',
   'Sélecteur de provider IA dans Réglages',
   'UI permettant à l''utilisateur d''ajouter ses clés OpenAI, Codex, Anthropic, Google, xAI, Mistral et de choisir lequel utiliser par défaut pour l''agent.',
   'todo', 'P0', 'M', 110),
  ('ai', 'Cerveau IA', 'Brain',
   'Routage intelligent multi-modèles, économe et performant.',
   'Fallback automatique provider down',
   'Si OpenAI renvoie 429/500, basculer automatiquement sur Anthropic ou Google selon la chaîne configurée dans elena_settings.fallback_chain.',
   'todo', 'P1', 'M', 111),
  ('codegen', 'Code generation', 'Code2',
   'Génération de code de niveau production, pas juste des prototypes.',
   'Auto-bascule mode React/Vanilla selon contexte',
   'Quand l''agent crée des .tsx, basculer automatiquement la sandbox en mode React (et inversement). Évite les écrans blancs sur projets existants.',
   'todo', 'P0', 'S', 120),
  ('codegen', 'Code generation', 'Code2',
   'Génération de code de niveau production, pas juste des prototypes.',
   'Snapshot automatique après chaque tour agent',
   'Sauvegarde l''état complet du sandbox après chaque réponse agent pour permettre un rollback fin (au-delà du undo single-turn).',
   'todo', 'P1', 'M', 121);
