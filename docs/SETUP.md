# Setup Guide

This guide covers getting the app running locally, connecting it to Supabase, and deploying it.

## 1. Prerequisites

- **Node.js 18 or newer** (`node -v`)
- A free **Supabase** account: <https://supabase.com>

## 2. Install

```bash
git clone <repo-url> badminton_league
cd badminton_league
npm install
cp .env.example .env
```

## 3. Create the Supabase project and get the keys

1. Go to <https://supabase.com/dashboard> → **New project**. Pick a name, database password and region, then wait about 2 minutes for it to provision.
2. Click **Connect** at the top of the project, or open **Project Settings → API Keys** / **Data API**, and copy:
   - **Project URL** (`https://<project-ref>.supabase.co`) → `SUPABASE_URL`
   - **anon / public key** (starts with `eyJ…`, shown on the *Legacy API keys* tab in newer dashboards) → `SUPABASE_ANON_KEY`. The newer `sb_publishable_…` key also works.
3. **Never** use the `service_role` / secret key. The five variables below are bundled into the browser JavaScript, where anyone can read it.

## 4. Configure `.env`

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...

# Admin dashboard login (/login)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose-a-password

# Password asked before either dashboard "Reset" option runs
# ("Reset scores only" / "Reset everything"). If this is not set, reset is disabled.
RESET_PASSWORD=choose-another-password
```

`.env` is in `.gitignore`. Keep it that way and don't commit real keys or passwords.

Only these five names reach the app: `vite.config.ts` exposes exactly the variables listed in its `CLIENT_ENV` array (no `VITE_` prefix needed). Anything else in `.env` stays out of the browser bundle. To add a new client-side variable, add it to `CLIENT_ENV` and to `src/vite-env.d.ts`.

## 5. Create the database

In Supabase, open **SQL Editor → New query**, paste the contents of a script below, and click **Run**:

1. [`database-migrations/01-full-schema.sql`](../database-migrations/01-full-schema.sql): creates the tables (`groups`, `pools`, `courts`, `teams`, `matches`, `referees`, `score_history`) and the access policies, and turns on **real-time** so every open screen updates instantly. **It drops existing app tables first, so all data is lost.**
2. Optional: [`database-migrations/02-seed-cubet-season-2.sql`](../database-migrations/02-seed-cubet-season-2.sql) loads the Cubet Season 2 fixture (groups, pools, 2 courts, 18 teams, 20 queued matches).

Without the seed, the app starts empty: create groups/pools in the **Groups** tab and courts in the **Courts** tab.

## 6. Run

```bash
npm run dev
```

This opens <http://localhost:3000>. The dev server also listens on your network, so phones and tablets on the same Wi-Fi can open `http://<your-computer-ip>:3000`. This is handy for referees and for a scoreboard on a TV.

Restart `npm run dev` whenever you change `.env`.

| Screen | URL | Who |
|---|---|---|
| Home | `/` | everyone |
| Staff sign-in | `/login` (Admin / Referee tabs; `/login?role=referee` opens the Referee tab) | admins and referees |
| Admin dashboard | `/login` → `/dashboard` | organisers (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) |
| Referee panel | `/login?role=referee` → `/referee/panel` | referees (accounts created by the admin) |
| Live scoreboard | `/live` | everyone, no login |
| Knockout bracket | `/live?tab=bracket` (Bracket tab of the live scoreboard) | everyone, no login |

The home page has no sign-in links: share `/login` (or `/login?role=referee`) with staff directly.

## 7. Deploy (Vercel)

1. Push the repo to GitHub and import it in Vercel. It detects Vite automatically: build `npm run build`, output `dist`.
2. In **Project → Settings → Environment Variables**, add the same five variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `RESET_PASSWORD`) for Production and Preview, then redeploy. They are read at build time, so changing one always needs a redeploy.
3. `vercel.json` already rewrites every path to `index.html`, so links like `/live` work on refresh.

Other static hosts (Netlify, Cloudflare Pages) work too. Add an equivalent "all routes → `/index.html`" rewrite.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Missing Supabase environment variables" in the console | `.env` (or the Vercel environment variables) is missing or misnamed. The names must be exactly `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Restart the dev server or redeploy. |
| `relation "matches" does not exist` | The schema script hasn't been run (step 5). |
| `Could not find the table 'public.groups'` or a missing column (`groupId`, `scheduledTime`, …) | The database is from an older version (with zones). Run `01-full-schema.sql`; it wipes and recreates the tables. |
| Scores only update after a refresh | Real-time isn't enabled. Run `01-full-schema.sql` again on a fresh database, or check **Database → Publications → supabase_realtime** includes the app tables. If real-time is unavailable, the app falls back to re-loading data every 30 s. |
| Leaderboard looks wrong | Dashboard → **Statistics → Recalculate Stats**. This rebuilds every team's stats from the completed matches. |
| Works locally, blank page on Vercel | The env variables aren't set in Vercel, or you didn't redeploy after adding them. |

## Security notes

This setup is meant for a friendly internal tournament, not for anything sensitive:

- The admin and reset passwords are checked **in the browser**. Anyone who opens the browser developer tools can find them in the JavaScript bundle.
- Referee passwords are stored as **plain text**. Anyone with the anon key can read the `referees` table, so don't reuse real passwords.
- The database policies allow anyone with the URL and anon key to read and write every table.

To harden it, move logins to **Supabase Auth** and replace the `allow all` policies with role-based RLS policies. That way only authenticated admins and referees can write, and the public can only read.
