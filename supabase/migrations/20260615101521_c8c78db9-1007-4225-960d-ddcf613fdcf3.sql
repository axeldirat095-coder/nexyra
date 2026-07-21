CREATE POLICY "Users can update own files in elena-uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'elena-uploads' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'elena-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);