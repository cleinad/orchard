-- Delete one owned conversation and return the private objects that need
-- post-commit Storage cleanup.  Keeping discovery and row deletion in one
-- transaction prevents attachment metadata from being orphaned by a race.
create or replace function public.delete_conversation_cascade(p_conversation_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_storage_paths text[] := array[]::text[];
begin
  if v_user_id is null then
    return jsonb_build_object(
      'conversation_deleted', false,
      'storage_paths', '[]'::jsonb
    );
  end if;

  -- Lock the parent before inspecting children so a concurrent request cannot
  -- attach a message between path collection and the cascading delete.
  select id into v_conversation_id
  from public.conversations
  where id = p_conversation_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'conversation_deleted', false,
      'storage_paths', '[]'::jsonb
    );
  end if;

  -- An attachment can be committed against an existing message while this
  -- transaction is collecting paths. Serialize that narrow write window so a
  -- cascaded metadata row never leaves an unreported Storage object behind.
  lock table public.message_attachments in share row exclusive mode;

  select coalesce(array_agg(distinct attachments.storage_path), array[]::text[])
  into v_storage_paths
  from public.message_attachments attachments
  join public.messages messages on messages.id = attachments.message_id
  where attachments.user_id = v_user_id
    and messages.user_id = v_user_id
    and messages.conversation_id = p_conversation_id;

  delete from public.conversations
  where id = p_conversation_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'conversation_deleted', true,
    'storage_paths', to_jsonb(v_storage_paths)
  );
end;
$$;

revoke all on function public.delete_conversation_cascade(uuid) from public, anon;
grant execute on function public.delete_conversation_cascade(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
