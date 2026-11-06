-- =============================================================================
-- Badminton Tournament App: full database schema (FRESH INSTALL)
--
-- WARNING: this script DROPS every app table first, so all existing data is lost.
-- Run it once on a new Supabase project (or when you deliberately want a clean slate),
-- then run 02-seed-*.sql if you want to load a fixture.
--
-- Supabase -> SQL Editor -> New query -> paste this file -> Run.
-- Column names in "quotes" are camelCase on purpose: the app reads/writes them exactly.
--
-- Structure:
--   groups  (e.g. Group A - Pro, Group B - Moderate, Women's)
--     └─ pools (optional, e.g. Pool 1, Pool 2). Standings are per pool,
--              or per group when the group has no pools.
--   teams belong to a group, and to one of that group's pools if it has any.
-- =============================================================================

drop table if exists score_history cascade;
drop table if exists matches       cascade;
drop table if exists referees      cascade;
drop table if exists teams         cascade;
drop table if exists pools         cascade;
drop table if exists groups        cascade;
drop table if exists zones         cascade;   -- replaced by groups
drop table if exists courts        cascade;

create table groups (
  id          text primary key,
  name        text not null,
  created_at  timestamptz default now()
);

create table pools (
  id          text primary key,
  name        text not null,
  "groupId"   text not null references groups(id) on delete cascade,
  created_at  timestamptz default now()
);
create index idx_pools_group on pools ("groupId");

create table courts (
  id             text primary key,
  name           text not null,
  "refereeId"    text default '',
  "refereeName"  text default 'Unassigned',
  created_at     timestamptz default now()
);

create table teams (
  id          text primary key,
  name        text not null,
  players     jsonb not null,
  "groupId"   text not null references groups(id) on delete restrict,   -- can't delete a group that still has teams
  "poolId"    text references pools(id) on delete restrict,             -- can't delete a pool that still has teams
  stats       jsonb default '{"matchesWon": 0, "matchesLost": 0, "points": 0}'::jsonb,  -- computed from pool matches
  "statsOverride" jsonb,                                                 -- admin-entered stats shown instead of "stats"
  "standingRank"  integer,                                               -- admin-set position in its pool (1 = top)
  created_at  timestamptz default now()
);
create index idx_teams_group on teams ("groupId");
create index idx_teams_pool  on teams ("poolId");

create table matches (
  id                  text primary key,
  team1               jsonb not null,                                             -- snapshot of the team row
  team2               jsonb not null,
  score               jsonb default '{"team1": 0, "team2": 0}'::jsonb,           -- sets won
  "sets"              jsonb default '[{"setNumber": 1, "score": {"team1": 0, "team2": 0}}]'::jsonb,
  "currentSetNumber"  integer default 1,
  "servingTeam"       text default 'team1',
  "team1Position"     text default 'left',
  "team2Position"     text default 'right',
  history             jsonb default '[]'::jsonb,                                  -- point log for undo
  winner              jsonb,
  status              text default 'upcoming',                                    -- upcoming | live | completed
  "courtId"           text references courts(id) on delete set null,
  "pendingApproval"   boolean default false,
  "requestedBy"       text,
  "queueOrder"        integer,
  "scheduledTime"     text,                                                       -- e.g. '7:15 PM' (display only)
  stage               text not null default 'pool'
                        check (stage in ('pool', 'semifinal', 'final')),          -- only 'pool' matches count toward standings
  "matchName"         text,                                                       -- e.g. 'Semi-final 1', 'Final'
  "bracketSlot"       integer,                                                    -- semi-final 1 or 2 (final = 1)
  "courtPositions"    jsonb not null default '{}'::jsonb,                         -- per set: player in each team's RIGHT service court at the start
  created_at          timestamptz default now()
);
create index idx_matches_queue_order
  on matches ("courtId", "queueOrder")
  where "courtId" is not null and status in ('upcoming', 'live');

create table referees (
  id          text primary key,
  name        text not null,
  "courtId"   text references courts(id) on delete set null,
  username    text unique not null,
  password    text not null,
  created_at  timestamptz default now()
);

create table score_history (
  "matchId"   text not null,
  team        text not null,
  timestamp   bigint primary key,
  created_at  timestamptz default now()
);

-- Row Level Security: permissive policies (anyone with the anon key can read/write).
-- Fine for an internal event; see docs/SETUP.md -> "Security notes".
do $$
declare t text;
begin
  foreach t in array array['groups', 'pools', 'courts', 'teams', 'matches', 'referees', 'score_history'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "allow all" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- Real-time: push changes to every open browser instantly.
do $$
declare t text;
begin
  foreach t in array array['groups', 'pools', 'courts', 'teams', 'matches', 'referees'] loop
    execute format('alter table %I replica identity full', t);
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
