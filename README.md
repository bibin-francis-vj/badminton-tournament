# 🏸 Cubet Badminton Tournament – Season 2

A web app for running our company's internal badminton tournament: team and match management, live referee scoring on each court, a public live scoreboard and automatic leaderboards.

## Features

- **Admin dashboard**: set up groups, pools and courts, manage doubles teams, schedule pool matches, semi-finals and finals, queue matches on courts, create referee logins, approve and edit match results, and adjust standings.
- **Referee panel**: phone-friendly scoring for the referee's assigned court. It uses rally scoring with a serve indicator, undo, manual set end and best-of-3 sets.
- **Live scoreboard** (`/live`): every court updates in real time, with a group filter and per-pool standings. Put it on a TV.
- **Knockout bracket** (Bracket tab of `/live`): semi-finals, final and champion for each group, as a vertical tree built for phones.
- **Single staff sign-in** (`/login`): Admin and Referee tabs on one page; the public home page has no sign-in links.
- **Leaderboards**: matches won, then total points scored. Stats are always derived from completed matches.

## Quick start

```bash
npm install
cp .env.example .env   # fill in Supabase URL/key and admin passwords
npm run dev            # http://localhost:3000
```

Before the first run, create the database by running
[`database-migrations/01-full-schema.sql`](database-migrations/01-full-schema.sql) in the Supabase SQL Editor.

👉 **Full instructions:** [docs/SETUP.md](docs/SETUP.md) covers the Supabase keys, database, deployment and troubleshooting.
👉 **How to run a tournament:** [docs/USER-GUIDE.md](docs/USER-GUIDE.md) covers the admin and referee workflow, scoring rules and rankings.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000, reachable from other devices on your network |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |

## Tech stack

React 18 + TypeScript, Vite, Tailwind CSS, Zustand, React Router 6, Supabase (Postgres + real-time), Lucide icons. Deployed as a static site (Vercel config included).

## Project structure

```
src/
├── App.tsx                    # Routes: /, /login, /dashboard, /referee/panel, /live (tabs: courts, standings, results, bracket)
├── pages/                     # HomePage, Login (admin + referee), Dashboard, RefereePanel, LiveView
├── components/                # GroupManager, TeamManager, MatchScheduler, KnockoutPanel, ResultEditor,
│                              # RefereeManager, CourtAssignment, MatchApprovalPanel, Statistics,
│                              # StandingEditor, LiveScoreboard, KnockoutBracket, route guards
├── store/tournamentStore.ts   # Zustand store: all actions (scoring, sets, match completion, stats)
├── utils/supabaseStorage.ts   # Supabase reads/writes
├── utils/calculations.ts      # Team stats and rankings
├── hooks/useRealtimeSubscriptions.ts
├── lib/supabase.ts            # Supabase client (reads SUPABASE_URL / SUPABASE_ANON_KEY)
└── types/index.ts
database-migrations/           # SQL: full schema + upgrade script for older databases
docs/                          # SETUP.md, USER-GUIDE.md
```

> ⚠️ Logins are lightweight: passwords are checked in the browser, and the database is open to anyone holding the anon key. That's fine for an internal event, but see [Security notes](docs/SETUP.md#security-notes) before using it for anything more.
