UPDATE storage.buckets SET public = false WHERE id = 'chat-uploads';

DROP POLICY IF EXISTS realtime_authenticated_only ON public.messages;