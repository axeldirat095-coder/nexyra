-- 1) Drop overly permissive SELECT policy on messages
DROP POLICY IF EXISTS "realtime_authenticated_only" ON public.messages;

-- 2) Tighten audit_logs insert to require org membership when org_id is provided
DROP POLICY IF EXISTS "audit_self_insert" ON public.audit_logs;
CREATE POLICY "audit_self_insert"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (org_id IS NULL OR is_org_member(auth.uid(), org_id))
);

-- 3) Restrict chat-uploads bucket SELECT to owner (folder = user id) or admin
DROP POLICY IF EXISTS "chat-uploads public read" ON storage.objects;
DROP POLICY IF EXISTS "chat_uploads_owner_read" ON storage.objects;
CREATE POLICY "chat_uploads_owner_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-uploads'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Make the chat-uploads bucket private so direct public URLs no longer work
UPDATE storage.buckets SET public = false WHERE id = 'chat-uploads';