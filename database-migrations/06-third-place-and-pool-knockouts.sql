-- 3rd place matches and pool-wise knockouts.
-- Safe to run while matches are in progress: it only widens the allowed stages and adds an empty column.
-- Existing matches are not changed (their new column stays null = knockout for the whole group).

-- 1. Allow a third stage: the 3rd place match (losers of the two semi-finals)
alter table matches drop constraint if exists matches_stage_check;
alter table matches add constraint matches_stage_check
  check (stage in ('pool', 'semifinal', 'final', 'third_place'));

-- 2. Which bracket a knockout belongs to: null = the whole group, a pool id = that pool's own bracket
alter table matches add column if not exists "knockoutPoolId" text;
