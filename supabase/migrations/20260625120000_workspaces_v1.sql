create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 80),
  description text,
  context text,
  icon text,
  accent_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspaces_user_updated_at
  on public.workspaces(user_id, updated_at desc);

drop trigger if exists on_workspace_updated on public.workspaces;
create trigger on_workspace_updated
  before update on public.workspaces
  for each row execute function public.handle_updated_at();

alter table public.workspaces enable row level security;

drop policy if exists "Users can view own workspaces" on public.workspaces;
create policy "Users can view own workspaces"
  on public.workspaces
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own workspaces" on public.workspaces;
create policy "Users can insert own workspaces"
  on public.workspaces
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own workspaces" on public.workspaces;
create policy "Users can update own workspaces"
  on public.workspaces
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own workspaces" on public.workspaces;
create policy "Users can delete own workspaces"
  on public.workspaces
  for delete
  using (auth.uid() = user_id);

alter table public.conversations
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

create index if not exists idx_conversations_user_workspace_updated_at
  on public.conversations(user_id, workspace_id, updated_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_single_context_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_single_context_check
      check (mentor_id is null or workspace_id is null);
  end if;
end
$$;

do $$
declare
  owner_id_constraint record;
begin
  for owner_id_constraint in
    select distinct c.conname
    from pg_constraint c
    join unnest(c.conkey) as constrained_column(attnum) on true
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = constrained_column.attnum
    where c.conrelid = 'public.memory_items'::regclass
      and c.contype = 'f'
      and a.attname = 'owner_id'
  loop
    execute format(
      'alter table public.memory_items drop constraint if exists %I',
      owner_id_constraint.conname
    );
  end loop;
end
$$;

alter table public.memory_items
  drop constraint if exists memory_items_owner_type_check;

alter table public.memory_items
  add constraint memory_items_owner_type_check
  check (owner_type in ('global', 'mentor', 'workspace'));

alter table public.memory_items
  drop constraint if exists memory_items_owner_scope_check;

alter table public.memory_items
  add constraint memory_items_owner_scope_check
  check (
    (owner_type = 'global' and owner_id is null)
    or (owner_type in ('mentor', 'workspace') and owner_id is not null)
  );
