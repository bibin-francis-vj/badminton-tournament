-- Match commentary: a time log of what happens in a match (start, pauses, moments like a smash, notes,
-- set and match ends). Points are already logged with their time in matches.history, so they are not repeated here.
--
-- Safe to run during a match: it only ADDS a new table. No existing table or row is changed.

create table if not exists match_events (
  id           uuid primary key default gen_random_uuid(),
  match_id     text not null references matches(id) on delete cascade,
  type         text not null check (type in ('start', 'pause', 'resume', 'moment', 'note', 'set_end', 'match_end')),
  at           timestamptz not null default now(),          -- when it happened (the tap on the referee's phone)
  team         text check (team in ('team1', 'team2')),       -- moments: the team that made it
  player_id    text,                                          -- moments: who (null = the pair / not sure)
  player_name  text,
  kind         text check (char_length(kind) <= 40),          -- moment: 'smash', 'drop' ... / pause: 'injury', 'shuttle' ...
  comment      text check (char_length(comment) <= 500),
  set_number   integer,
  score        jsonb,                                         -- current set score at that time, e.g. {"team1": 7, "team2": 5}
  sets_won     jsonb,                                         -- sets won at that time, e.g. {"team1": 1, "team2": 0}
  path         jsonb check (path is null or jsonb_typeof(path) = 'object'),  -- moment: shot line {from:{x,y}, to:{x,y}, auto}
  created_by   text,                                          -- referee name
  created_at   timestamptz not null default now()
);

create index if not exists match_events_match_at on match_events (match_id, at);

-- (for a table created by an earlier version of this script)
alter table match_events add column if not exists path jsonb check (path is null or jsonb_typeof(path) = 'object');

-- Same access as the other match tables (referees are not Supabase users). No updates: entries are added or removed.
alter table match_events enable row level security;
drop policy if exists "read" on match_events;
drop policy if exists "add" on match_events;
drop policy if exists "remove" on match_events;
create policy "read" on match_events for select using (true);
create policy "add" on match_events for insert with check (true);
create policy "remove" on match_events for delete using (true);
grant select, insert, delete on match_events to anon, authenticated;

-- Live updates in every open browser
alter table match_events replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_events') then
    alter publication supabase_realtime add table match_events;
  end if;
end $$;
