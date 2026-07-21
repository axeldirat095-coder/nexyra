
-- 1. chat-images: SELECT policy owner-scoped (bucket now private)
CREATE POLICY "chat_images_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 2. project-snapshots: UPDATE policy owner-scoped
CREATE POLICY "project_snapshots_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'project-snapshots' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'project-snapshots' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 3. capabilities: restrict to authenticated only
DROP POLICY IF EXISTS public_read_capabilities ON public.capabilities;
CREATE POLICY "authenticated_read_capabilities" ON public.capabilities
  FOR SELECT TO authenticated
  USING (true);
REVOKE SELECT ON public.capabilities FROM anon;
