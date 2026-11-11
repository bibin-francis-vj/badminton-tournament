-- Which sign-in methods the audience may use for predictions (admin toggles in Dashboard -> Predict)
alter table public.prediction_settings
  add column if not exists google_login boolean not null default true,
  add column if not exists email_login boolean not null default false;

create or replace function public.set_prediction_login_methods(p_password text, p_google boolean, p_email boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_admin_password(p_password);
  if not (coalesce(p_google, false) or coalesce(p_email, false)) then
    raise exception 'Turn on at least one sign-in method' using errcode = '22023';
  end if;
  update public.prediction_settings set google_login = p_google, email_login = p_email, updated_at = now() where id = 1;
end $$;
revoke all on function public.set_prediction_login_methods(text, boolean, boolean) from public;
grant execute on function public.set_prediction_login_methods(text, boolean, boolean) to anon, authenticated;

-- One-time codes for Cubet email sign-in (Edge Function supabase/functions/prediction-email-otp only)
create table if not exists public.email_otps (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  sent_at timestamptz not null default now()
);
alter table public.email_otps enable row level security;
revoke all on public.email_otps from anon, authenticated;

-- A pick is allowed only through a sign-in method the admin has turned on; email sign-ins must be @cubettech.com
create or replace function public.prediction_login_allowed()
returns boolean language sql stable security invoker set search_path = '' as $$
  select case coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '')
    when 'google' then coalesce((select google_login from public.prediction_settings where id = 1), true)
    when 'email' then coalesce((select email_login from public.prediction_settings where id = 1), false)
      and lower(coalesce(auth.jwt() ->> 'email', '')) like '%@cubettech.com'
    else false
  end
$$;

drop policy if exists "add own prediction before deadline" on public.predictions;
create policy "add own prediction before deadline" on public.predictions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and now() < public.prediction_deadline()
    and public.prediction_login_allowed()
    and exists (select 1 from public.teams t where t.id = team_id and t."groupId" = group_id)
  );

drop policy if exists "change own prediction before deadline" on public.predictions;
create policy "change own prediction before deadline" on public.predictions
  for update to authenticated
  using (user_id = (select auth.uid()) and now() < public.prediction_deadline())
  with check (
    user_id = (select auth.uid())
    and now() < public.prediction_deadline()
    and public.prediction_login_allowed()
    and exists (select 1 from public.teams t where t.id = team_id and t."groupId" = group_id)
  );

-- Keep the code itself (service role only) so a resend within its 10 minutes sends the same code
delete from public.email_otps;
alter table public.email_otps drop column if exists code_hash;
alter table public.email_otps add column if not exists code text not null;
