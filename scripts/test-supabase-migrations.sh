#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
postgres_image=${SUPABASE_POSTGRES_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.063}
auth_image=${SUPABASE_AUTH_IMAGE:-public.ecr.aws/supabase/gotrue:v2.192.0}
storage_image=${SUPABASE_STORAGE_IMAGE:-public.ecr.aws/supabase/storage-api:v1.61.7}
pg_prove_image=${SUPABASE_PG_PROVE_IMAGE:-public.ecr.aws/supabase/pg_prove:3.36}
postgres_password="disposable-telemetry-postgres"
auth_password="disposable-telemetry-auth"
storage_password="disposable-telemetry-storage"
network_name="orchard-telemetry-$RANDOM-$$"
postgres_container="${network_name}-postgres"
auth_container="${network_name}-auth"
storage_container="${network_name}-storage"

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
  if [[ "$postgres_logs" == *"PostgreSQL init process complete; ready for start up."* ]] \
    && docker exec "$postgres_container" pg_isready -U postgres >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 1
done
[[ "$postgres_ready" == "true" ]] || { docker logs "$postgres_container"; exit 1; }

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
  --env GOTRUE_JWT_SECRET="disposable-telemetry-jwt-secret-at-least-32-characters" \
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
[[ "$auth_ready" == "true" ]] || { docker logs "$auth_container"; exit 1; }

docker run --detach \
  --name "$storage_container" \
  --network "$network_name" \
  --env DATABASE_URL="postgres://supabase_storage_admin:${storage_password}@db:5432/postgres" \
  --env PGRST_JWT_SECRET="disposable-telemetry-jwt-secret-at-least-32-characters" \
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
[[ "$storage_ready" == "true" ]] || { docker logs "$storage_container"; exit 1; }

if [[ -n "$(docker port "$postgres_container")" \
  || -n "$(docker port "$auth_container")" \
  || -n "$(docker port "$storage_container")" ]]; then
  printf 'error: disposable verification published a host port\n' >&2
  exit 1
fi

applied_count=0
while IFS= read -r migration; do
  printf 'applying=%s\n' "$(basename "$migration")"
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

[[ "$applied_count" -gt 0 ]] || { printf 'error: no migrations applied\n' >&2; exit 1; }

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
  pg_prove --verbose /tests/database.sql /tests/billing_rpc_privileges.sql

printf 'active_migrations_applied=%s\n' "$applied_count"
printf 'database_invariants=passed\n'
printf 'disposable_supabase_verification=passed\n'
