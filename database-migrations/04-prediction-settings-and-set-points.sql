-- Per-match set length chosen by the admin (null = default: 15 for pool, 21 for semi-final/final)
alter table public.matches add column if not exists "pointsPerSet" integer
  check ("pointsPerSet" is null or "pointsPerSet" in (15, 21));

-- Prediction close time, changeable by the admin (needs the reset password) from Dashboard -> Predict
create table if not exists public.prediction_settings (
  id integer primary key default 1 check (id = 1),
  deadline timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.prediction_settings enable row level security;
create policy "prediction settings are public" on public.prediction_settings for select using (true);
grant select on public.prediction_settings to anon, authenticated;
insert into public.prediction_settings (id, deadline) values (1, timestamptz '2026-11-11 20:00:00+05:30')
  on conflict (id) do update set deadline = excluded.deadline, updated_at = now();
alter publication supabase_realtime add table public.prediction_settings;

create or replace function public.prediction_deadline()
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select coalesce((select deadline from public.prediction_settings where id = 1), timestamptz '2026-11-11 20:00:00+05:30')
$$;

create or replace function private.check_admin_password(p_password text)
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
end $$;
revoke all on function private.check_admin_password(text) from public, anon, authenticated;

create or replace function public.set_prediction_deadline(p_password text, p_deadline timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_admin_password(p_password);
  if p_deadline is null then raise exception 'Pick a close time' using errcode = '22004'; end if;
  insert into public.prediction_settings (id, deadline, updated_at) values (1, p_deadline, now())
    on conflict (id) do update set deadline = excluded.deadline, updated_at = now();
  return p_deadline;
end $$;
revoke all on function public.set_prediction_deadline(text, timestamptz) from public;
grant execute on function public.set_prediction_deadline(text, timestamptz) to anon, authenticated;

create or replace function public.reset_predictions(p_password text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_admin_password(p_password);
  delete from public.predictions where true;
end $$;
