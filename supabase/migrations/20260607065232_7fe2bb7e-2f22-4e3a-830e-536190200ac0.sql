
-- 1) Remove category_prompts from realtime publication (no client code uses it)
ALTER PUBLICATION supabase_realtime DROP TABLE public.category_prompts;

-- 2) Tighten realtime broadcast policy: restrict capabilities-live topic to admins,
--    keep per-user budget notification topic
DROP POLICY IF EXISTS topic_scoped_realtime_select ON realtime.messages;
CREATE POLICY topic_scoped_realtime_select ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (realtime.topic() = 'capabilities-live' AND public.has_role(auth.uid(), 'admin'::app_role))
    OR realtime.topic() = ('budget-notif-' || (auth.uid())::text)
  );

-- 3) project_quotas: explicit deny of non-admin writes (defense in depth)
CREATE POLICY "Deny non-admin insert on project_quotas"
  ON public.project_quotas AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny non-admin update on project_quotas"
  ON public.project_quotas AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny non-admin delete on project_quotas"
  ON public.project_quotas AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
