delete from public.threads;

alter table if exists public.threads
  add column if not exists start_offset integer,
  add column if not exists end_offset integer;

alter table if exists public.threads
  alter column start_offset set not null,
  alter column end_offset set not null;
