-- Run once (or rerun) in the project's SQL Editor. Only this app's objects/policies are managed.
begin;

create table if not exists public.creations (
  id uuid primary key,
  owner_id uuid not null,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  ready boolean not null default false,
  photo_path text not null,
  arrows_path text not null,
  poster_path text not null,
  constraint creation_photo_path check (photo_path = owner_id::text || '/' || id::text || '/photo.jpg'),
  constraint creation_arrows_path check (arrows_path = owner_id::text || '/' || id::text || '/arrows.png'),
  constraint creation_poster_path check (poster_path = owner_id::text || '/' || id::text || '/poster.png')
);
-- No cascading relationship to auth.users: deleting an anonymous login preserves the artwork.
alter table public.creations enable row level security;
revoke all on public.creations from anon, authenticated;
grant select, insert, update on public.creations to authenticated;

drop policy if exists trajectory_owner_read on public.creations;
create policy trajectory_owner_read on public.creations for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists trajectory_owner_insert on public.creations;
create policy trajectory_owner_insert on public.creations for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists trajectory_owner_update on public.creations;
create policy trajectory_owner_update on public.creations for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Public retrieval exposes one completed record for an exact UUID, never an archive listing or owner IDs.
create or replace function public.get_creation(p_id uuid)
returns table(id uuid, captured_at timestamptz, photo_path text, arrows_path text, poster_path text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.captured_at, c.photo_path, c.arrows_path, c.poster_path
  from public.creations c where c.id = p_id and c.ready = true;
$$;
revoke all on function public.get_creation(uuid) from public;
grant execute on function public.get_creation(uuid) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trajectory-images', 'trajectory-images', true, 15728640, array['image/jpeg','image/png'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated visitors can read/update only their own upload paths. Bucket listing is not public.
drop policy if exists trajectory_storage_read on storage.objects;
create policy trajectory_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'trajectory-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists trajectory_storage_insert on storage.objects;
create policy trajectory_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trajectory-images' and
    name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(photo[.]jpg|arrows[.]png|poster[.]png)$'));
drop policy if exists trajectory_storage_update on storage.objects;
create policy trajectory_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'trajectory-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'trajectory-images' and
    name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(photo[.]jpg|arrows[.]png|poster[.]png)$'));

commit;
