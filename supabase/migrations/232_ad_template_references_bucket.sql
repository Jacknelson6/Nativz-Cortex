-- 232_ad_template_references_bucket.sql
--
-- Storage bucket for the reference screenshots admins drop into the
-- per-brand pattern library at /ads. The DB row in
-- ad_prompt_templates holds the structural spec; this bucket holds the
-- raw image the spec was extracted from. Path shape:
--   ad-template-references/<clientId>/<templateId>.<ext>
--
-- Public-read so reference_image_url resolves directly in <Image>;
-- writes are gated to authenticated users (the upload route also checks
-- admin role before calling the service role).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ad-template-references',
  'ad-template-references',
  true,
  10485760,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can upload ad template references" on storage.objects;
create policy "Authenticated users can upload ad template references"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ad-template-references');

drop policy if exists "Authenticated users can update ad template references" on storage.objects;
create policy "Authenticated users can update ad template references"
  on storage.objects for update to authenticated
  using (bucket_id = 'ad-template-references');

drop policy if exists "Authenticated users can delete ad template references" on storage.objects;
create policy "Authenticated users can delete ad template references"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ad-template-references');

drop policy if exists "Public read ad template references" on storage.objects;
create policy "Public read ad template references"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'ad-template-references');
