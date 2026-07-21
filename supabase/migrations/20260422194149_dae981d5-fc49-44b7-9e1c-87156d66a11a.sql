
DROP POLICY IF EXISTS "system_insert_budget_notif" ON public.budget_notifications;
CREATE POLICY "users_insert_own_budget_notif"
  ON public.budget_notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
