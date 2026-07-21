CREATE POLICY "Authenticated users can read capabilities"
  ON public.capabilities FOR SELECT
  TO authenticated
  USING (true);