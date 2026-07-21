insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

create policy "chat-images public read"
  on storage.objects for select
  using (bucket_id = 'chat-images');

create policy "chat-images authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "chat-images owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );