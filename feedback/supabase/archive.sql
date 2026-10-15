-- Enable the participant archive. Run in Supabase SQL Editor after setup.sql.
-- Photos and trajectories of completed creations become discoverable in the public archive.
-- Original poster paths, owner fields and unfinished records are not returned.
begin;

create index if not exists creations_archive_order
  on public.creations (captured_at desc, id desc) where ready = true;

create or replace function public.list_trajectories(p_offset integer default 0, p_limit integer default 7)
returns table(id uuid, captured_at timestamptz, photo_path text, arrows_path text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.captured_at, c.photo_path, c.arrows_path
  from public.creations c
  where c.ready = true
  order by c.captured_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limit, 7), 25))
  offset greatest(0, least(coalesce(p_offset, 0), 100000));
$$;
revoke all on function public.list_trajectories(integer, integer) from public;
grant execute on function public.list_trajectories(integer, integer) to anon, authenticated;

commit;
