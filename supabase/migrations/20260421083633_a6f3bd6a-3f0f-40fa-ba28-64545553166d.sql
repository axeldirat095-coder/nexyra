DROP POLICY IF EXISTS errors_public_insert ON public.error_events;

CREATE POLICY errors_bounded_insert ON public.error_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(message) BETWEEN 1 AND 4000
    AND level IN ('debug','info','warn','error','fatal')
    AND source IN ('client','server','edge','worker')
    AND (stack IS NULL OR length(stack) <= 16000)
    AND (route IS NULL OR length(route) <= 500)
    AND (user_agent IS NULL OR length(user_agent) <= 500)
  );