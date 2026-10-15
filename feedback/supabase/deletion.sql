-- Run after setup.sql and archive.sql in Supabase SQL Editor (Database).
-- Only the authenticated creator can remove a creation and its three files.
-- Actual file removal uses the Storage API, never SQL DELETE on storage.objects.
begin;

grant delete on storage.objects to authenticated;

drop policy if exists trajectory_storage_delete on storage.objects;
create policy trajectory_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trajectory-images' and
    name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(photo[.]jpg|arrows[.]png|poster[.]png)$'));

create or replace function public.prepare_creation_deletion(p_id uuid)
returns table(photo_path text, arrows_path text, poster_path text)
language plpgsql security definer set search_path = ''
as $$
declare target public.creations;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select c.* into target from public.creations c where c.id = p_id for update;
  if not found then return; end if;
  if target.owner_id <> auth.uid() then raise exception 'Only the creator can delete this creation' using errcode = '42501'; end if;
  -- Remove from public listings before deleting files; retain the row for retries.
  update public.creations c set ready = false where c.id = p_id;
  return query select target.photo_path, target.arrows_path, target.poster_path;
end;
$$;
revoke all on function public.prepare_creation_deletion(uuid) from public, anon;
grant execute on function public.prepare_creation_deletion(uuid) to authenticated;

create or replace function public.finish_creation_deletion(p_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare target public.creations; prefix text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select c.* into target from public.creations c where c.id = p_id for update;
  if found and target.owner_id <> auth.uid() then raise exception 'Only the creator can delete this creation' using errcode = '42501'; end if;
  if found and target.ready then raise exception 'Prepare deletion first'; end if;
  prefix := auth.uid()::text || '/' || p_id::text || '/';
  if exists (select 1 from storage.objects o where o.bucket_id = 'trajectory-images'
    and o.name in (prefix || 'photo.jpg', prefix || 'arrows.png', prefix || 'poster.png')) then
    raise exception 'Image removal is not complete';
  end if;
  delete from public.creations c where c.id = p_id and c.owner_id = auth.uid();
  return true;
end;
$$;
revoke all on function public.finish_creation_deletion(uuid) from public, anon;
grant execute on function public.finish_creation_deletion(uuid) to authenticated;

-- DELETE is never granted on creations: the finishing RPC checks that Storage is clean.
commit;
