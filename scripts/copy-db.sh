#!/usr/bin/env bash
# Copy the live Supabase database (tables, functions, rules, auth users and all data)
# into an EMPTY test project. The live database is only read, never changed.
#
# 1. Put both connection strings in .env.dbcopy (git ignores it):
#      OLD_DB_URL="postgresql://postgres.<live-ref>:<password>@aws-...pooler.supabase.com:5432/postgres"
#      NEW_DB_URL="postgresql://postgres.<test-ref>:<password>@aws-...pooler.supabase.com:5432/postgres"
# 2. Run: bash scripts/copy-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.dbcopy ] || { echo "Missing .env.dbcopy (see the top of this script)."; exit 1; }
set -a; source .env.dbcopy; set +a
: "${OLD_DB_URL:?OLD_DB_URL is empty}"; : "${NEW_DB_URL:?NEW_DB_URL is empty}"
[ "$OLD_DB_URL" != "$NEW_DB_URL" ] || { echo "OLD and NEW are the same database. Stopping."; exit 1; }

OUT=db-copy
mkdir -p "$OUT"
psql17() { docker run --rm -i --network host -v "$PWD/$OUT:/work" -w /work postgres:17 psql "$@"; }

echo "Checking the test project is empty..."
count=$(psql17 "$NEW_DB_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")
if [ "$count" != "0" ]; then
  echo "The test project already has $count tables in public. Use an empty project (or reset it). Stopping."
  exit 1
fi

echo "1/3 Reading the live database..."
npx -y supabase@latest db dump --remote="$OLD_DB_URL" -f "$OUT/roles.sql" --role-only
npx -y supabase@latest db dump --remote="$OLD_DB_URL" -f "$OUT/schema.sql"
npx -y supabase@latest db dump --remote="$OLD_DB_URL" -f "$OUT/data.sql" --use-copy --data-only
psql17 "$OLD_DB_URL" -tAc "select format('alter publication supabase_realtime add table %I.%I;', schemaname, tablename)
  from pg_publication_tables where pubname = 'supabase_realtime'" > "$OUT/realtime.sql"

# Keep only what the app uses: its own tables, the admin secret and the signed-in users
# (storage and auth log/session tables are skipped; the test project can't write some of them).
awk '
  /^COPY / { inb = 1; keep = ($2 ~ /^"(public|private)"\./ || $2 == "\"auth\".\"users\"" || $2 == "\"auth\".\"identities\"") && $2 != "\"public\".\"email_otps\"" }
  !inb && /setval\(.\"auth\"/ { next }
  { if (!inb || keep) print }
  inb && /^\\\.$/ { inb = 0 }
' "$OUT/data.sql" > "$OUT/data-app.sql"

echo "2/3 Writing into the test project..."
psql17 --single-transaction -v ON_ERROR_STOP=1 \
  -f roles.sql -f schema.sql \
  -c 'set session_replication_role = replica' \
  -f data-app.sql \
  "$NEW_DB_URL"

echo "3/3 Turning on live updates for the same tables..."
while read -r stmt; do
  [ -n "$stmt" ] && psql17 "$NEW_DB_URL" -qc "$stmt" 2>/dev/null || true
done < "$OUT/realtime.sql"

echo
echo "Done. Row counts in the test project:"
psql17 "$NEW_DB_URL" -c "select 'teams' t, count(*) from teams union all select 'matches', count(*) from matches
  union all select 'predictions', count(*) from predictions union all select 'auth users', count(*) from auth.users"
