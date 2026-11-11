-- Audience predictions: each signed-in (Google) user picks the winner of each group.
-- Picks can be added or changed only before prediction_deadline(); change the time there (and in src/pages/Predictions.tsx).
create or replace function public.prediction_deadline()
returns timestamptz language sql immutable set search_path = '' as $$ select timestamptz '2026-11-11 20:00:00+05:30' $$;

create table if not exists public.predictions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id text not null references public.groups(id) on delete cascade,
  team_id text not null references public.teams(id) on delete cascade,
  user_name text not null default '',
  user_avatar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

alter table public.predictions enable row level security;

create policy "predictions are public" on public.predictions
  for select using (true);

create policy "add own prediction before deadline" on public.predictions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and now() < public.prediction_deadline()
    and exists (select 1 from public.teams t where t.id = team_id and t."groupId" = group_id)
  );

create policy "change own prediction before deadline" on public.predictions
  for update to authenticated
  using (user_id = (select auth.uid()) and now() < public.prediction_deadline())
  with check (
    user_id = (select auth.uid())
    and now() < public.prediction_deadline()
    and exists (select 1 from public.teams t where t.id = team_id and t."groupId" = group_id)
  );

create or replace function public.predictions_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; else new.created_at := now(); end if;
  return new;
end $$;

create trigger predictions_touch before insert or update on public.predictions
  for each row execute function public.predictions_touch();

grant select on public.predictions to anon, authenticated;
grant insert, update on public.predictions to authenticated;

alter publication supabase_realtime add table public.predictions;

-- Admin reset: deletes all predictions, guarded by the reset password (stored only as a bcrypt hash).
-- One-time setup in the SQL editor:  select private.set_reset_password('your reset password');
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_secrets (name text primary key, hash text not null);
revoke all on private.admin_secrets from public, anon, authenticated;

create or replace function private.set_reset_password(p_password text)
returns void language sql security definer set search_path = '' as $$
  insert into private.admin_secrets(name, hash) values ('reset', extensions.crypt(p_password, extensions.gen_salt('bf')))
  on conflict (name) do update set hash = excluded.hash
$$;
revoke all on function private.set_reset_password(text) from public, anon, authenticated;

create or replace function public.reset_predictions(p_password text)
returns void language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  select hash into h from private.admin_secrets where name = 'reset';
  if h is null then
    raise exception 'Reset password is not set up in the database yet' using errcode = 'P0001';
  end if;
  if extensions.crypt(coalesce(p_password, ''), h) <> h then
    raise exception 'Incorrect reset password' using errcode = '28P01';
  end if;
  delete from public.predictions where true;
end $$;
revoke all on function public.reset_predictions(text) from public;
grant execute on function public.reset_predictions(text) to anon, authenticated;
