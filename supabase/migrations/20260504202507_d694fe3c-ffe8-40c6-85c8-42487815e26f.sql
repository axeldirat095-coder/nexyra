
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-uploads',
  'chat-uploads',
  true,
  10485760,
  ARRAY[
    'image/png','image/jpeg','image/webp','image/gif','image/svg+xml',
    'text/plain','text/markdown','text/csv','application/json','application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies: upload/update/delete par owner dans son propre dossier userId/...
CREATE POLICY "chat-uploads owner can insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "chat-uploads owner can update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'chat-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "chat-uploads owner can delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "chat-uploads public read"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'chat-uploads');
