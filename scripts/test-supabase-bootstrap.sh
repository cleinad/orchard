#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
postgres_image=${SUPABASE_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.063}
auth_image=${SUPABASE_AUTH_IMAGE:-public.ecr.aws/supabase/gotrue:v2.192.0}
storage_image=${SUPABASE_STORAGE_IMAGE:-public.ecr.aws/supabase/storage-api:v1.61.7}
pg_prove_image=${SUPABASE_PG_PROVE_IMAGE:-public.ecr.aws/supabase/pg_prove:3.36}
postgres_password="disposable-bootstrap-postgres"
auth_password="disposable-bootstrap-auth"
storage_password="disposable-bootstrap-storage"
network_name="orchard-bootstrap-$RANDOM-$$"
postgres_container="${network_name}-postgres"
auth_container="${network_name}-auth"
storage_container="${network_name}-storage"
profile_repair_migration="20260730120000_repair_profile_provisioning.sql"

cleanup() {
  docker rm -f \
    "$storage_container" \
    "$auth_container" \
    "$postgres_container" \
    >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$network_name" >/dev/null
docker run --detach \
  --name "$postgres_container" \
  --network "$network_name" \
  --network-alias db \
  --env POSTGRES_PASSWORD="$postgres_password" \
  "$postgres_image" >/dev/null

postgres_ready=false
for _ in $(seq 1 60); do
  postgres_logs=$(docker logs "$postgres_container" 2>&1)
  if [[ "$postgres_logs" == *"PostgreSQL init process complete; ready for start up."* ]] &&
    docker exec "$postgres_container" pg_isready -U postgres >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 1
done

if [[ "$postgres_ready" != "true" ]]; then
  printf 'error: Supabase PostgreSQL did not become ready\n' >&2
  docker logs "$postgres_container" >&2
  exit 1
fi

docker exec \
  --env PGPASSWORD="$postgres_password" \
  "$postgres_container" \
  psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  -c "alter role supabase_auth_admin with password '$auth_password'; grant all on schema auth to supabase_auth_admin; alter role supabase_storage_admin with password '$storage_password'; grant all on schema storage to supabase_storage_admin;" \
  >/dev/null

docker run --detach \
  --name "$auth_container" \
  --network "$network_name" \
  --env GOTRUE_API_HOST="0.0.0.0" \
  --env GOTRUE_API_PORT="9999" \
  --env API_EXTERNAL_URL="http://unused-auth:9999" \
  --env GOTRUE_SITE_URL="http://127.0.0.1:3000" \
  --env GOTRUE_DB_DRIVER="postgres" \
  --env GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:${auth_password}@db:5432/postgres" \
  --env GOTRUE_JWT_SECRET="disposable-bootstrap-jwt-secret-at-least-32-characters" \
  --env GOTRUE_JWT_EXP="3600" \
  --env GOTRUE_DISABLE_SIGNUP="false" \
  --env GOTRUE_EXTERNAL_EMAIL_ENABLED="true" \
  --env GOTRUE_MAILER_AUTOCONFIRM="true" \
  "$auth_image" >/dev/null

auth_ready=false
for _ in $(seq 1 60); do
  auth_column_count=$(docker exec "$postgres_container" psql -U postgres -d postgres -Atc \
    "select count(*) from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at';")
  if [[ "$auth_column_count" == "1" ]]; then
    auth_ready=true
    break
  fi
  sleep 1
done

if [[ "$auth_ready" != "true" ]]; then
  printf 'error: Supabase Auth schema did not become ready\n' >&2
  docker logs "$auth_container" >&2
  exit 1
fi

docker run --detach \
  --name "$storage_container" \
  --network "$network_name" \
  --env DATABASE_URL="postgres://supabase_storage_admin:${storage_password}@db:5432/postgres" \
  --env PGRST_JWT_SECRET="disposable-bootstrap-jwt-secret-at-least-32-characters" \
  --env ANON_KEY="unused" \
  --env SERVICE_KEY="unused" \
  --env POSTGREST_URL="http://unused-rest:3000" \
  --env FILE_SIZE_LIMIT="52428800" \
  --env STORAGE_BACKEND="file" \
  --env FILE_STORAGE_BACKEND_PATH="/var/lib/storage" \
  --env TENANT_ID="stub" \
  --env REGION="stub" \
  --env GLOBAL_S3_BUCKET="stub" \
  --env ENABLE_IMAGE_TRANSFORMATION="false" \
  "$storage_image" >/dev/null

storage_ready=false
for _ in $(seq 1 60); do
  storage_table_count=$(docker exec "$postgres_container" psql -U postgres -d postgres -Atc \
    "select count(*) from information_schema.tables where table_schema = 'storage' and table_name in ('buckets', 'objects');")
  if [[ "$storage_table_count" == "2" ]]; then
    storage_ready=true
    break
  fi
  sleep 1
done

if [[ "$storage_ready" != "true" ]]; then
  printf 'error: Supabase Storage schema did not become ready\n' >&2
  docker logs "$storage_container" >&2
  exit 1
fi

if [[ -n "$(docker port "$postgres_container")" ||
  -n "$(docker port "$auth_container")" ||
  -n "$(docker port "$storage_container")" ]]; then
  printf 'error: disposable bootstrap published a host port\n' >&2
  exit 1
fi

insert_auth_user() {
  local database_role=$1
  local database_password=$2
  local user_id=$3
  local email=$4
  local full_name=$5

  docker exec \
    --interactive \
    --env PGPASSWORD="$database_password" \
    "$postgres_container" \
    psql -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$database_role" -d postgres \
    -v user_id="$user_id" \
    -v email="$email" \
    -v full_name="$full_name" <<'SQL'
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new
)
values (
  '00000000-0000-0000-0000-000000000000',
  :'user_id',
  'authenticated',
  'authenticated',
  :'email',
  '',
  '2026-07-30 12:00:00+00',
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('full_name', :'full_name'),
  '2026-07-30 12:00:00+00',
  '2026-07-30 12:00:00+00',
  '',
  '',
  '',
  ''
);
SQL
}

applied_count=0
backfill_fixture_inserted=false
while IFS= read -r migration; do
  migration_name=$(basename "$migration")

  if [[ "$migration_name" == "$profile_repair_migration" ]]; then
    insert_auth_user \
      supabase_admin \
      "$postgres_password" \
      33333333-3333-4333-8333-333333333333 \
      before-repair@example.test \
      "Before Repair"
    backfill_fixture_inserted=true
  fi

  # Auth trigger DDL requires the database migration administrator. Orchard's
  # application runtime must never use this role.
  printf 'applying=%s\n' "$migration_name"
  docker exec \
    --interactive \
    --env PGPASSWORD="$postgres_password" \
    "$postgres_container" \
    psql -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
    < "$migration"
  applied_count=$((applied_count + 1))
done < <(
  find "$repo_root/supabase/migrations" \
    -maxdepth 1 \
    -type f \
    -name '[0-9]*.sql' |
    sort
)

if [[ "$applied_count" == "0" || "$backfill_fixture_inserted" != "true" ]]; then
  printf 'error: active migration set is incomplete\n' >&2
  exit 1
fi

insert_auth_user \
  supabase_auth_admin \
  "$auth_password" \
  44444444-4444-4444-8444-444444444444 \
  after-repair@example.test \
  "After Repair"

schema_check=$(docker exec "$postgres_container" psql -U postgres -d postgres -Atc \
  "select concat_ws('|',
    to_regclass('public.profiles'),
    to_regclass('public.messages'),
    to_regclass('public.chat_runs'),
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'global_instructions'),
    (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal and tgenabled = 'O'),
    (select count(*) from pg_proc where oid = 'public.handle_new_user()'::regprocedure and prosecdef and array_to_string(proconfig, ',') not like '%public%'),
    (select count(*) from auth.users as users left join public.profiles as profiles on profiles.id = users.id where profiles.id is null),
    (select count(*) from public.profiles where id in ('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444')),
    to_regclass('storage.buckets'),
    (select count(*) from storage.buckets where id in ('chat-images', 'mentor-avatars'))
  );")

if [[ "$schema_check" != "profiles|messages|chat_runs|1|1|1|0|2|storage.buckets|2" ]]; then
  printf 'error: unexpected bootstrapped schema: %s\n' "$schema_check" >&2
  exit 1
fi

if [[ "${SUPABASE_BOOTSTRAP_DATABASE_TESTS:-false}" == "true" ]]; then
  docker exec \
    --interactive \
    --env PGPASSWORD="$postgres_password" \
    "$postgres_container" \
    psql -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
    < "$repo_root/supabase/seed.sql"

  docker run --rm \
    --network "$network_name" \
    --env PGHOST="db" \
    --env PGPORT="5432" \
    --env PGDATABASE="postgres" \
    --env PGUSER="supabase_admin" \
    --env PGPASSWORD="$postgres_password" \
    --volume "$repo_root/supabase/tests:/tests:ro" \
    "$pg_prove_image" \
    pg_prove --verbose /tests/database.sql
  printf 'supabase_database_tests=passed\n'
fi

printf 'active_migrations_applied=%s\n' "$applied_count"
printf 'profile_backfill=passed\n'
printf 'profile_signup_trigger=passed\n'
printf 'supabase_bootstrap=passed\n'
