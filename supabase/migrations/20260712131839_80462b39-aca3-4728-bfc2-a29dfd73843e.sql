CREATE POLICY "elena-artifacts owner read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'elena-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "elena-artifacts owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'elena-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "elena-artifacts owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'elena-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "elena-artifacts owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'elena-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "elena-artifacts service role full"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'elena-artifacts') WITH CHECK (bucket_id = 'elena-artifacts');