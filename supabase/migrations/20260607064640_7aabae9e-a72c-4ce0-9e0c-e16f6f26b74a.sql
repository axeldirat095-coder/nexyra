
-- RLS policies pour le bucket elena-uploads : chaque user accède uniquement à son propre dossier.
CREATE POLICY "elena_uploads_owner_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'elena-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "elena_uploads_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'elena-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "elena_uploads_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'elena-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
