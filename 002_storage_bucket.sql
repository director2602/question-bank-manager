-- Creates the private storage bucket used for question images and institute
-- logos, plus access policies enforced at the database level (defense in
-- depth alongside the server-side checks in the API routes).
--
-- Run once in the Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('question-bank-files', 'question-bank-files', false)
on conflict (id) do nothing;

-- Any authenticated user may READ files (question images need to render for
-- all roles that can view questions/papers).
create policy "Authenticated users can read question bank files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'question-bank-files');

-- Only ADMIN/EDITOR profiles may upload. This mirrors, and backs up, the
-- server-side role check performed in the upload API route.
create policy "Editors and admins can upload question bank files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'question-bank-files'
    and exists (
      select 1 from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = auth.uid() and r.code in ('ADMIN', 'EDITOR')
    )
  );

create policy "Editors and admins can delete question bank files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'question-bank-files'
    and exists (
      select 1 from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = auth.uid() and r.code in ('ADMIN', 'EDITOR')
    )
  );
