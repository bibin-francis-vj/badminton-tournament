# Database scripts

Run these in **Supabase dashboard → SQL Editor → New query**, paste the file contents, then **Run**.

| File | What it does |
|---|---|
| `01-full-schema.sql` | **Fresh install.** Drops every app table (all data is lost), then creates `groups`, `pools`, `courts`, `teams`, `matches`, `referees` and `score_history` with access policies and real-time. |
| `02-seed-cubet-season-2.sql` | Optional. Loads the Cubet Badminton Tournament Season 2 fixture: 3 groups, 4 pools, 2 courts, 18 teams and 20 matches queued per court in fixture order. Run it right after `01-full-schema.sql`. |

## Data model

```
groups ──< pools            a group may have pools (standings are per pool),
   │          │             or none (standings are for the whole group)
   └──< teams >┘            teams."groupId" required, teams."poolId" required only when the group has pools
courts ──< matches          matches."courtId", "queueOrder" (queue position), "scheduledTime" (e.g. '7:15 PM')
courts ──< referees
```

Deleting a group or pool that still has teams is blocked by the database. Deleting a group deletes its pools. Deleting a court unassigns its referee and clears the court on its matches.

See [`../docs/SETUP.md`](../docs/SETUP.md) for the full setup guide.
