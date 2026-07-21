DROP POLICY IF EXISTS authenticated_write_category_prompts ON public.category_prompts;

CREATE POLICY admin_write_category_prompts
ON public.category_prompts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));