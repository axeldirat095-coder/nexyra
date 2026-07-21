
CREATE TABLE IF NOT EXISTS public.tool_pricing (
  tool_name TEXT PRIMARY KEY,
  credits_cost INTEGER NOT NULL DEFAULT 1,
  provider TEXT,
  category TEXT NOT NULL DEFAULT 'core',
  description TEXT,
  requires_byok BOOLEAN NOT NULL DEFAULT false,
  enabled_by_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tool_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tool_pricing readable by all auth"
  ON public.tool_pricing FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.tool_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, tool_name)
);

ALTER TABLE public.tool_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user manages own tool overrides"
  ON public.tool_overrides FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_tool_overrides_owner ON public.tool_overrides(owner_id);

CREATE OR REPLACE FUNCTION public.tool_get_effective_state(_tool_name TEXT)
RETURNS TABLE(enabled BOOLEAN, credits_cost INTEGER, requires_byok BOOLEAN, provider TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(o.enabled, p.enabled_by_default, true) AS enabled,
    COALESCE(p.credits_cost, 1) AS credits_cost,
    COALESCE(p.requires_byok, false) AS requires_byok,
    p.provider
  FROM (SELECT _tool_name AS t) q
  LEFT JOIN public.tool_pricing p ON p.tool_name = q.t
  LEFT JOIN public.tool_overrides o
    ON o.tool_name = q.t AND o.owner_id = auth.uid()
$$;

-- Seed (UPSERT)
INSERT INTO public.tool_pricing (tool_name, credits_cost, provider, category, description, requires_byok) VALUES
  ('list_files', 0, NULL, 'fs', 'Lister les fichiers du projet', false),
  ('read_file', 0, NULL, 'fs', 'Lire un fichier', false),
  ('write_file', 1, NULL, 'fs', 'Créer/écraser un fichier', false),
  ('line_replace', 1, NULL, 'fs', 'Édition ciblée par lignes', false),
  ('delete_file', 1, NULL, 'fs', 'Supprimer un fichier', false),
  ('rename_file', 1, NULL, 'fs', 'Renommer un fichier', false),
  ('add_dependency', 2, NULL, 'fs', 'Ajouter un package npm', false),
  ('run_command', 2, NULL, 'fs', 'Exécuter une commande shell', false),
  ('web_search', 2, 'lovable', 'web', 'Recherche web', false),
  ('read_url', 2, 'lovable', 'web', 'Lire une URL', false),
  ('web_read', 2, 'firecrawl', 'web', 'Scrape avancé', true),
  ('web_screenshot', 3, 'firecrawl', 'web', 'Screenshot d''une page', true),
  ('image_generate', 5, 'openai', 'media', 'Génération d''image', true),
  ('image_edit', 5, 'openai', 'media', 'Édition d''image', true),
  ('svg_generate', 1, 'lovable', 'media', 'Génération SVG', false),
  ('voice_tts', 4, 'elevenlabs', 'media', 'Text-to-speech', true),
  ('audio_transcribe', 3, 'openai', 'media', 'Whisper transcription', true),
  ('video_generate', 15, 'replicate', 'media', 'Génération vidéo', true),
  ('document_parse', 2, 'lovable', 'doc', 'Parsing PDF/DOCX', false),
  ('rag_index', 2, 'lovable', 'rag', 'Indexer dans la mémoire vectorielle', false),
  ('rag_search', 2, 'lovable', 'rag', 'Recherche vectorielle', false),
  ('memory_save', 0, NULL, 'memory', 'Sauver une note', false),
  ('memory_list', 0, NULL, 'memory', 'Lister les notes', false),
  ('memory_archive', 0, NULL, 'memory', 'Archiver une note', false),
  ('memory_remember', 0, NULL, 'memory', 'Mémoire long-terme', false),
  ('memory_recall', 0, NULL, 'memory', 'Rappel mémoire', false),
  ('build_check', 1, NULL, 'qa', 'Vérifier le build', false),
  ('screenshot_qa', 2, NULL, 'qa', 'QA visuelle', false),
  ('preview_console_logs', 0, NULL, 'qa', 'Logs console', false),
  ('browser_automate', 5, 'playwright', 'qa', 'Automatisation navigateur', true),
  ('code_execute', 3, NULL, 'core', 'Exécution sandbox', false),
  ('subagent_run', 5, NULL, 'core', 'Délégation sous-agent', false),
  ('background_job', 2, NULL, 'core', 'Job en arrière-plan', false),
  ('snapshot_create', 1, NULL, 'core', 'Créer un snapshot', false),
  ('project_onboard', 0, NULL, 'core', 'Onboarding projet', false),
  ('ask_user', 0, NULL, 'core', 'Question utilisateur', false),
  ('inspiration_lookup', 1, NULL, 'design', 'Recherche d''inspiration', false),
  ('block_remix', 1, NULL, 'design', 'Remix de bloc UI', false),
  ('design_blueprint', 2, NULL, 'design', 'Blueprint design', false),
  ('data_inspect', 0, NULL, 'data', 'Inspecter données', false),
  ('db_query', 2, NULL, 'data', 'Requête DB', false),
  ('github_commit', 2, 'github', 'deploy', 'Commit GitHub', true),
  ('deploy_vercel', 5, 'vercel', 'deploy', 'Déploiement Vercel', true),
  ('deploy_netlify', 5, 'netlify', 'deploy', 'Déploiement Netlify', true),
  ('stripe_checkout_create', 3, 'stripe', 'payments', 'Stripe Checkout', true),
  ('replicate_run', 5, 'replicate', 'media', 'Modèle Replicate', true),
  ('cost_estimate', 0, NULL, 'core', 'Estimation coût', false),
  ('capability_sync', 0, NULL, 'core', 'Sync capability', false),
  ('capability_capture', 0, NULL, 'core', 'Capturer capability', false),
  ('pilot_complete_step', 0, NULL, 'pilot', 'Étape pilote terminée', false),
  ('pilot_start_next_step', 0, NULL, 'pilot', 'Démarrer prochaine étape', false),
  ('pilot_add_item', 0, NULL, 'pilot', 'Ajouter un item pilote', false),
  ('pilot_check_item', 0, NULL, 'pilot', 'Cocher un item pilote', false)
ON CONFLICT (tool_name) DO UPDATE SET
  credits_cost = EXCLUDED.credits_cost,
  provider = EXCLUDED.provider,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  requires_byok = EXCLUDED.requires_byok,
  updated_at = now();

CREATE TRIGGER trg_tool_pricing_updated_at BEFORE UPDATE ON public.tool_pricing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tool_overrides_updated_at BEFORE UPDATE ON public.tool_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
