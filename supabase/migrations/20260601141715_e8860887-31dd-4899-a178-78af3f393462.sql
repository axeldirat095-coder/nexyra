DROP POLICY IF EXISTS "realtime_authenticated_only" ON realtime.messages;

CREATE POLICY "topic_scoped_realtime_select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'capabilities-live'
  OR realtime.topic() LIKE '%' || (select auth.uid()::text) || '%'
);