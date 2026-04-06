drop index if exists public.conversations_user_expert_unique_idx;
drop index if exists public.conversations_user_mentor_unique_idx;

create index if not exists idx_conversations_user_updated_at
  on public.conversations(user_id, updated_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'mentor_id'
  ) then
    execute '
      create index if not exists idx_conversations_user_mentor_updated_at
      on public.conversations(user_id, mentor_id, updated_at desc)
    ';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'expert_id'
  ) then
    execute '
      create index if not exists idx_conversations_user_expert_updated_at
      on public.conversations(user_id, expert_id, updated_at desc)
    ';
  end if;
end
$$;
