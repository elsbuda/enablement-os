-- Company logos: one file per company in the public "logos" bucket, path "<company_id>/logo.<ext>".
-- Read is public (a logo is not confidential and must render without a session cookie on <img>).
-- Write is limited to owners and admins of that company, enforced on the storage path.

alter table companies add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists logos_public_read on storage.objects;
create policy logos_public_read on storage.objects for select
  using (bucket_id = 'logos');

drop policy if exists logos_admin_insert on storage.objects;
create policy logos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.can_admin(((storage.foldername(name))[1])::uuid));

drop policy if exists logos_admin_update on storage.objects;
create policy logos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.can_admin(((storage.foldername(name))[1])::uuid));

drop policy if exists logos_admin_delete on storage.objects;
create policy logos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.can_admin(((storage.foldername(name))[1])::uuid));
