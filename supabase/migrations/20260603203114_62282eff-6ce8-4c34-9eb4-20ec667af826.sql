-- Document intent: these tables are server-side (service role) only.
-- Add explicit admin-only SELECT policies and deny-all client INSERT/UPDATE/DELETE
-- to make the access model explicit and prevent accidental exposure.

-- elena_metrics: add explicit deny for client INSERT/DELETE (writes go via service role)
CREATE POLICY "Deny client inserts on elena_metrics"
  ON public.elena_metrics FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Deny client deletes on elena_metrics"
  ON public.elena_metrics FOR DELETE TO authenticated, anon
  USING (false);

-- llm_cache: admin-only SELECT, deny all client writes
CREATE POLICY "Admins can view llm_cache"
  ON public.llm_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny client writes on llm_cache (insert)"
  ON public.llm_cache FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Deny client writes on llm_cache (update)"
  ON public.llm_cache FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny client writes on llm_cache (delete)"
  ON public.llm_cache FOR DELETE TO authenticated, anon
  USING (false);

-- prompt_cache: admin-only SELECT, deny all client writes
CREATE POLICY "Admins can view prompt_cache"
  ON public.prompt_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny client writes on prompt_cache (insert)"
  ON public.prompt_cache FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Deny client writes on prompt_cache (update)"
  ON public.prompt_cache FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny client writes on prompt_cache (delete)"
  ON public.prompt_cache FOR DELETE TO authenticated, anon
  USING (false);

-- prompt_versions: admin-only SELECT (proprietary prompt templates), deny client writes
CREATE POLICY "Admins can view prompt_versions"
  ON public.prompt_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny client writes on prompt_versions (insert)"
  ON public.prompt_versions FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Deny client writes on prompt_versions (update)"
  ON public.prompt_versions FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny client writes on prompt_versions (delete)"
  ON public.prompt_versions FOR DELETE TO authenticated, anon
  USING (false);