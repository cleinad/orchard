-- Remove Supabase's permissive Data API defaults for objects Orchard creates
-- in public. Managed schemas such as storage and graphql_public are
-- intentionally unchanged.
--
-- PostgreSQL grants PUBLIC execution on new functions globally. It cannot
-- revoke that default for only one schema, so every Orchard function migration
-- must revoke PUBLIC explicitly before granting its intended execution roles.
--
-- Self-hosted migrations run as supabase_admin, so this clears both
-- supabase_admin and postgres defaults. Hosted migrations run as postgres and
-- intentionally leave the internal supabase_admin defaults platform-managed;
-- postgres cannot change that role's default privileges.

begin;

-- Harden objects created by the effective migration role. Orchard's
-- self-hosted path uses supabase_admin, while hosted tooling may use postgres
-- directly or authenticate through another role.
alter default privileges in schema public
  revoke all privileges
  on tables from anon, authenticated, service_role;

alter default privileges in schema public
  revoke all privileges
  on functions from anon, authenticated, service_role;

alter default privileges in schema public
  revoke all privileges
  on sequences from anon, authenticated, service_role;

-- The consolidated baseline explicitly granted permissive postgres defaults.
-- Revoke those even when another role executes this migration.
alter default privileges for role postgres in schema public
  revoke all privileges
  on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all privileges
  on functions from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all privileges
  on sequences from anon, authenticated, service_role;

-- These authenticated RPCs inherited service_role execution from the former
-- permissive defaults but are called with the user's authenticated session.
revoke all
on function public.accept_chat_run(
  uuid, text, text, jsonb, uuid, uuid, uuid, uuid, uuid, text
)
from service_role;

revoke all
on function public.commit_persistent_chat_run_response(
  uuid, text, jsonb, text, jsonb, jsonb, uuid, uuid
)
from service_role;

commit;
