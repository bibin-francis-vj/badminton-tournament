-- =============================================================================
-- Seed: CUBET BADMINTON TOURNAMENT – SEASON 2 (11 November 2026, 7:00–10:00 PM)
-- Generated from the updated Cubet_Badminton_Fixture.pdf. Run AFTER 01-full-schema.sql.
-- 3 groups, 4 pools, 2 courts, 18 teams, 20 matches (queued per court in fixture order).
--   Group A - Mens: Pool 1 and Pool 2, 4 teams each (6 matches per pool)
--   Group B - Mens: Pool 1 and Pool 2, 3 teams each (3 matches per pool)
--   Group C - Womens: knockout only (the two 8:00 PM matches are the semi-finals)
-- Referees are not included: add them in the app (Dashboard -> Referees).
-- =============================================================================

insert into groups (id, name) values
  ('group-a', 'Group A - Mens'),
  ('group-b', 'Group B - Mens'),
  ('group-women', 'Group C - Womens');

insert into pools (id, name, "groupId") values
  ('group-a-pool-1', 'Pool 1', 'group-a'),
  ('group-a-pool-2', 'Pool 2', 'group-a'),
  ('group-b-pool-1', 'Pool 1', 'group-b'),
  ('group-b-pool-2', 'Pool 2', 'group-b');

insert into courts (id, name) values
  ('court-1', 'Court 1'),
  ('court-2', 'Court 2');

insert into teams (id, name, players, "groupId", "poolId") values
  ('team-rahul-justin', 'Rahul & Justin', '[{"id": "team-rahul-justin-p1", "name": "Rahul"}, {"id": "team-rahul-justin-p2", "name": "Justin"}]'::jsonb, 'group-a', 'group-a-pool-2'),
  ('team-alex-sankalp', 'Alex & Sankalp', '[{"id": "team-alex-sankalp-p1", "name": "Alex"}, {"id": "team-alex-sankalp-p2", "name": "Sankalp"}]'::jsonb, 'group-a', 'group-a-pool-2'),
  ('team-bibin-abrin', 'Bibin & Abrin', '[{"id": "team-bibin-abrin-p1", "name": "Bibin"}, {"id": "team-bibin-abrin-p2", "name": "Abrin"}]'::jsonb, 'group-a', 'group-a-pool-2'),
  ('team-akhil-shamil', 'Akhil & Shamil', '[{"id": "team-akhil-shamil-p1", "name": "Akhil"}, {"id": "team-akhil-shamil-p2", "name": "Shamil"}]'::jsonb, 'group-a', 'group-a-pool-2'),
  ('team-anto-sreerag', 'Anto & Sreerag', '[{"id": "team-anto-sreerag-p1", "name": "Anto"}, {"id": "team-anto-sreerag-p2", "name": "Sreerag"}]'::jsonb, 'group-a', 'group-a-pool-1'),
  ('team-vipin-amal', 'Vipin & Amal', '[{"id": "team-vipin-amal-p1", "name": "Vipin"}, {"id": "team-vipin-amal-p2", "name": "Amal"}]'::jsonb, 'group-a', 'group-a-pool-1'),
  ('team-sajeer-austle', 'Sajeer & Austle', '[{"id": "team-sajeer-austle-p1", "name": "Sajeer"}, {"id": "team-sajeer-austle-p2", "name": "Austle"}]'::jsonb, 'group-a', 'group-a-pool-1'),
  ('team-akhilesh-vignesh', 'Akhilesh & Vignesh', '[{"id": "team-akhilesh-vignesh-p1", "name": "Akhilesh"}, {"id": "team-akhilesh-vignesh-p2", "name": "Vignesh"}]'::jsonb, 'group-a', 'group-a-pool-1'),
  ('team-akash-devanath', 'Akash & Devanath', '[{"id": "team-akash-devanath-p1", "name": "Akash"}, {"id": "team-akash-devanath-p2", "name": "Devanath"}]'::jsonb, 'group-b', 'group-b-pool-1'),
  ('team-sreejith-abdul-aziz', 'Sreejith & Abdul Aziz', '[{"id": "team-sreejith-abdul-aziz-p1", "name": "Sreejith"}, {"id": "team-sreejith-abdul-aziz-p2", "name": "Abdul Aziz"}]'::jsonb, 'group-b', 'group-b-pool-1'),
  ('team-thejus-binil', 'Thejus & Binil', '[{"id": "team-thejus-binil-p1", "name": "Thejus"}, {"id": "team-thejus-binil-p2", "name": "Binil"}]'::jsonb, 'group-b', 'group-b-pool-1'),
  ('team-adilsha-naseef', 'Adilsha & Naseef', '[{"id": "team-adilsha-naseef-p1", "name": "Adilsha"}, {"id": "team-adilsha-naseef-p2", "name": "Naseef"}]'::jsonb, 'group-b', 'group-b-pool-2'),
  ('team-vishnu-kb-aswinjith', 'Vishnu KB & Aswinjith', '[{"id": "team-vishnu-kb-aswinjith-p1", "name": "Vishnu KB"}, {"id": "team-vishnu-kb-aswinjith-p2", "name": "Aswinjith"}]'::jsonb, 'group-b', 'group-b-pool-2'),
  ('team-milan-haris', 'Milan & Haris', '[{"id": "team-milan-haris-p1", "name": "Milan"}, {"id": "team-milan-haris-p2", "name": "Haris"}]'::jsonb, 'group-b', 'group-b-pool-2'),
  ('team-athira-merlin', 'Athira & Merlin', '[{"id": "team-athira-merlin-p1", "name": "Athira"}, {"id": "team-athira-merlin-p2", "name": "Merlin"}]'::jsonb, 'group-women', null),
  ('team-aaina-shibna', 'Aaina & Shibna', '[{"id": "team-aaina-shibna-p1", "name": "Aaina"}, {"id": "team-aaina-shibna-p2", "name": "Shibna"}]'::jsonb, 'group-women', null),
  ('team-bhagyasree-parvathy', 'Bhagyasree & Parvathy', '[{"id": "team-bhagyasree-parvathy-p1", "name": "Bhagyasree"}, {"id": "team-bhagyasree-parvathy-p2", "name": "Parvathy"}]'::jsonb, 'group-women', null),
  ('team-aleena-nandhini', 'Aleena & Nandhini', '[{"id": "team-aleena-nandhini-p1", "name": "Aleena"}, {"id": "team-aleena-nandhini-p2", "name": "Nandhini"}]'::jsonb, 'group-women', null);

-- Matches store a snapshot of each team row (the app reads team1/team2 as full objects).
insert into matches (id, team1, team2, "courtId", "queueOrder", "scheduledTime", status)
select f.id, to_jsonb(t1) - 'created_at', to_jsonb(t2) - 'created_at', f.court, f.queue_order, f.time, 'upcoming'
from (values
  ('match-court-1-01', 'team-rahul-justin', 'team-alex-sankalp', 'court-1', 0, '7:00 PM'),
  ('match-court-1-02', 'team-akash-devanath', 'team-sreejith-abdul-aziz', 'court-1', 1, '7:15 PM'),
  ('match-court-1-03', 'team-anto-sreerag', 'team-vipin-amal', 'court-1', 2, '7:30 PM'),
  ('match-court-1-04', 'team-rahul-justin', 'team-bibin-abrin', 'court-1', 3, '7:45 PM'),
  ('match-court-1-05', 'team-athira-merlin', 'team-aaina-shibna', 'court-1', 4, '8:00 PM'),
  ('match-court-1-06', 'team-sajeer-austle', 'team-anto-sreerag', 'court-1', 5, '8:15 PM'),
  ('match-court-1-07', 'team-akash-devanath', 'team-thejus-binil', 'court-1', 6, '8:30 PM'),
  ('match-court-1-08', 'team-sajeer-austle', 'team-vipin-amal', 'court-1', 7, '8:45 PM'),
  ('match-court-1-09', 'team-adilsha-naseef', 'team-vishnu-kb-aswinjith', 'court-1', 8, '9:00 PM'),
  ('match-court-1-10', 'team-sreejith-abdul-aziz', 'team-thejus-binil', 'court-1', 9, '9:15 PM'),
  ('match-court-2-01', 'team-akhilesh-vignesh', 'team-vipin-amal', 'court-2', 0, '7:00 PM'),
  ('match-court-2-02', 'team-bibin-abrin', 'team-akhil-shamil', 'court-2', 1, '7:15 PM'),
  ('match-court-2-03', 'team-sajeer-austle', 'team-akhilesh-vignesh', 'court-2', 2, '7:30 PM'),
  ('match-court-2-04', 'team-alex-sankalp', 'team-akhil-shamil', 'court-2', 3, '7:45 PM'),
  ('match-court-2-05', 'team-bhagyasree-parvathy', 'team-aleena-nandhini', 'court-2', 4, '8:00 PM'),
  ('match-court-2-06', 'team-adilsha-naseef', 'team-milan-haris', 'court-2', 5, '8:15 PM'),
  ('match-court-2-07', 'team-alex-sankalp', 'team-bibin-abrin', 'court-2', 6, '8:30 PM'),
  ('match-court-2-08', 'team-anto-sreerag', 'team-akhilesh-vignesh', 'court-2', 7, '8:45 PM'),
  ('match-court-2-09', 'team-rahul-justin', 'team-akhil-shamil', 'court-2', 8, '9:00 PM'),
  ('match-court-2-10', 'team-milan-haris', 'team-vishnu-kb-aswinjith', 'court-2', 9, '9:15 PM')
) as f(id, team1_id, team2_id, court, queue_order, time)
join teams t1 on t1.id = f.team1_id
join teams t2 on t2.id = f.team2_id;

-- Group C - Womens plays knockouts only: these two fixture matches are its semi-finals.
update matches set stage = 'semifinal', "matchName" = 'Semi-final 1', "bracketSlot" = 1 where id = 'match-court-1-05';
update matches set stage = 'semifinal', "matchName" = 'Semi-final 2', "bracketSlot" = 2 where id = 'match-court-2-05';
