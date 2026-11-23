-- Storage is supplied by Supabase. The embedded PostgreSQL demo uses bundled assets.
do $$
begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('question-media','question-media',true,5000000,array['image/jpeg','image/png','image/webp','image/avif'])
  on conflict(id) do nothing;
  execute $policy$
   create policy whirl_media_upload on storage.objects for insert to authenticated
   with check(bucket_id='question-media' and name ~ '^[a-f0-9-]+\.(jpg|png|webp|avif)$' and
    exists(select 1 from public.profiles where id=auth.uid() and role='admin'))
  $policy$;
 end if;
end;
$$;
