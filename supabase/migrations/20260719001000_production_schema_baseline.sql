-- Schema-only baseline captured from the hosted development project on 2026-07-19.
-- It intentionally contains no production row data or managed auth/storage schema.



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."memory_extraction_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scope_type" "text" NOT NULL,
    "branch_id" "uuid",
    "thread_id" "uuid",
    "last_processed_message_id" "uuid",
    "pending_user_turn_count" integer DEFAULT 0 NOT NULL,
    "pending_since" timestamp with time zone,
    "last_attempted_at" timestamp with time zone,
    "last_succeeded_at" timestamp with time zone,
    "processing_started_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_extraction_states_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "memory_extraction_states_pending_user_turn_count_check" CHECK (("pending_user_turn_count" >= 0)),
    CONSTRAINT "memory_extraction_states_scope_check" CHECK (((("scope_type" = 'main'::"text") AND ("branch_id" IS NULL) AND ("thread_id" IS NULL)) OR (("scope_type" = 'branch'::"text") AND ("branch_id" IS NOT NULL) AND ("thread_id" IS NULL)) OR (("scope_type" = 'thread'::"text") AND ("branch_id" IS NULL) AND ("thread_id" IS NOT NULL)))),
    CONSTRAINT "memory_extraction_states_scope_type_check" CHECK (("scope_type" = ANY (ARRAY['main'::"text", 'branch'::"text", 'thread'::"text"]))),
    CONSTRAINT "memory_extraction_states_status_check" CHECK (("status" = ANY (ARRAY['idle'::"text", 'pending'::"text", 'processing'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."memory_extraction_states" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_memory_extraction_state"("state_id" "uuid") RETURNS "public"."memory_extraction_states"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  claimed public.memory_extraction_states%rowtype;
begin
  update public.memory_extraction_states
  set
    status = 'processing',
    processing_started_at = now(),
    last_attempted_at = now(),
    attempt_count = attempt_count + 1,
    last_error = null
  where id = state_id
    and user_id = auth.uid()
    and (
      status in ('pending', 'failed')
      or (
        status = 'processing'
        and processing_started_at < now() - interval '5 minutes'
      )
    )
  returning * into claimed;

  return claimed;
end;
$$;


ALTER FUNCTION "public"."claim_memory_extraction_state"("state_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_chat_usage_limits"("p_user_id" "uuid", "p_month_start" timestamp with time zone, "p_month_end" timestamp with time zone, "p_window_start" timestamp with time zone, "p_window_end" timestamp with time zone, "p_total_increment" integer, "p_premium_increment" integer, "p_monthly_total_limit" integer, "p_window_total_limit" integer, "p_monthly_premium_limit" integer, "p_window_premium_limit" integer) RETURNS TABLE("allowed" boolean, "monthly_used_count" integer, "monthly_limit" integer, "window_used_count" integer, "window_limit" integer, "monthly_premium_used_count" integer, "monthly_premium_limit" integer, "window_premium_used_count" integer, "window_premium_limit" integer, "blocked_limit" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_monthly_total integer := 0;
  v_window_total integer := 0;
  v_monthly_premium integer := 0;
  v_window_premium integer := 0;
begin
  if auth.uid() is distinct from p_user_id and auth.role() <> 'service_role' then
    raise exception 'not allowed';
  end if;

  if p_total_increment <= 0
    or p_premium_increment < 0
    or p_monthly_total_limit < 0
    or p_window_total_limit < 0
    or p_monthly_premium_limit < 0
    or p_window_premium_limit < 0 then
    raise exception 'invalid usage arguments';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select coalesce(count, 0) into v_monthly_total
    from public.usage_counters
    where user_id = p_user_id
      and feature_key = 'chat_total_monthly'
      and period_start = p_month_start
    for update;

  select coalesce(count, 0) into v_window_total
    from public.usage_counters
    where user_id = p_user_id
      and feature_key = 'chat_total_window'
      and period_start = p_window_start
    for update;

  select coalesce(count, 0) into v_monthly_premium
    from public.usage_counters
    where user_id = p_user_id
      and feature_key = 'chat_premium_units_monthly'
      and period_start = p_month_start
    for update;

  select coalesce(count, 0) into v_window_premium
    from public.usage_counters
    where user_id = p_user_id
      and feature_key = 'chat_premium_units_window'
      and period_start = p_window_start
    for update;

  v_monthly_total := coalesce(v_monthly_total, 0);
  v_window_total := coalesce(v_window_total, 0);
  v_monthly_premium := coalesce(v_monthly_premium, 0);
  v_window_premium := coalesce(v_window_premium, 0);

  if v_monthly_total + p_total_increment > p_monthly_total_limit then
    return query select false, v_monthly_total, p_monthly_total_limit, v_window_total, p_window_total_limit, v_monthly_premium, p_monthly_premium_limit, v_window_premium, p_window_premium_limit, 'monthly_total';
    return;
  end if;

  if v_window_total + p_total_increment > p_window_total_limit then
    return query select false, v_monthly_total, p_monthly_total_limit, v_window_total, p_window_total_limit, v_monthly_premium, p_monthly_premium_limit, v_window_premium, p_window_premium_limit, 'window_total';
    return;
  end if;

  if v_monthly_premium + p_premium_increment > p_monthly_premium_limit then
    return query select false, v_monthly_total, p_monthly_total_limit, v_window_total, p_window_total_limit, v_monthly_premium, p_monthly_premium_limit, v_window_premium, p_window_premium_limit, 'monthly_premium';
    return;
  end if;

  if v_window_premium + p_premium_increment > p_window_premium_limit then
    return query select false, v_monthly_total, p_monthly_total_limit, v_window_total, p_window_total_limit, v_monthly_premium, p_monthly_premium_limit, v_window_premium, p_window_premium_limit, 'window_premium';
    return;
  end if;

  insert into public.usage_counters (
    user_id,
    feature_key,
    period_start,
    period_end,
    count
  )
  values
    (p_user_id, 'chat_total_monthly', p_month_start, p_month_end, p_total_increment),
    (p_user_id, 'chat_total_window', p_window_start, p_window_end, p_total_increment),
    (p_user_id, 'chat_premium_units_monthly', p_month_start, p_month_end, p_premium_increment),
    (p_user_id, 'chat_premium_units_window', p_window_start, p_window_end, p_premium_increment)
  on conflict (user_id, feature_key, period_start) do update
    set count = public.usage_counters.count + excluded.count,
        period_end = excluded.period_end,
        updated_at = now();

  return query select true,
    v_monthly_total + p_total_increment,
    p_monthly_total_limit,
    v_window_total + p_total_increment,
    p_window_total_limit,
    v_monthly_premium + p_premium_increment,
    p_monthly_premium_limit,
    v_window_premium + p_premium_increment,
    p_window_premium_limit,
    null::text;
  return;
end;
$$;


ALTER FUNCTION "public"."consume_chat_usage_limits"("p_user_id" "uuid", "p_month_start" timestamp with time zone, "p_month_end" timestamp with time zone, "p_window_start" timestamp with time zone, "p_window_end" timestamp with time zone, "p_total_increment" integer, "p_premium_increment" integer, "p_monthly_total_limit" integer, "p_window_total_limit" integer, "p_monthly_premium_limit" integer, "p_window_premium_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_model_usage"("p_user_id" "uuid", "p_feature_key" "text", "p_period_start" "date", "p_period_end" "date", "p_increment" integer, "p_limit" integer) RETURNS TABLE("allowed" boolean, "used_count" integer, "monthly_limit" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer;
begin
  if auth.uid() is distinct from p_user_id and auth.role() <> 'service_role' then
    raise exception 'not allowed';
  end if;

  if p_increment <= 0 or p_limit < 0 then
    raise exception 'invalid usage arguments';
  end if;

  loop
    update public.usage_counters
      set count = count + p_increment,
          period_end = p_period_end,
          updated_at = now()
      where user_id = p_user_id
        and feature_key = p_feature_key
        and period_start = p_period_start
        and count + p_increment <= p_limit
      returning count into v_count;

    if found then
      return query select true, v_count, p_limit;
      return;
    end if;

    select count into v_count
      from public.usage_counters
      where user_id = p_user_id
        and feature_key = p_feature_key
        and period_start = p_period_start;

    if found then
      return query select false, v_count, p_limit;
      return;
    end if;

    begin
      insert into public.usage_counters (
        user_id,
        feature_key,
        period_start,
        period_end,
        count
      )
      values (
        p_user_id,
        p_feature_key,
        p_period_start,
        p_period_end,
        p_increment
      )
      returning count into v_count;

      return query select true, v_count, p_limit;
      return;
    exception when unique_violation then
      -- Retry; another request created the row concurrently.
    end;
  end loop;
end;
$$;


ALTER FUNCTION "public"."consume_model_usage"("p_user_id" "uuid", "p_feature_key" "text", "p_period_start" "date", "p_period_end" "date", "p_increment" integer, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_workspace_cascade"("p_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_memory_ids uuid[] := array[]::uuid[];
  v_conversation_ids uuid[] := array[]::uuid[];
  v_storage_paths text[] := array[]::text[];
begin
  if v_user_id is null then
    return jsonb_build_object(
      'workspace_deleted', false,
      'conversation_count', 0,
      'memory_item_count', 0,
      'storage_paths', '[]'::jsonb
    );
  end if;

  if not exists (
    select 1
    from public.workspaces
    where id = p_workspace_id
      and user_id = v_user_id
  ) then
    return jsonb_build_object(
      'workspace_deleted', false,
      'conversation_count', 0,
      'memory_item_count', 0,
      'storage_paths', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(id), array[]::uuid[])
  into v_memory_ids
  from public.memory_items
  where user_id = v_user_id
    and owner_type = 'workspace'
    and owner_id = p_workspace_id;

  select coalesce(array_agg(id), array[]::uuid[])
  into v_conversation_ids
  from public.conversations
  where user_id = v_user_id
    and workspace_id = p_workspace_id;

  select coalesce(array_agg(distinct message_attachments.storage_path), array[]::text[])
  into v_storage_paths
  from public.message_attachments
  join public.messages
    on messages.id = message_attachments.message_id
  where message_attachments.user_id = v_user_id
    and messages.user_id = v_user_id
    and messages.conversation_id = any(v_conversation_ids);

  if cardinality(v_memory_ids) > 0 then
    delete from public.memory_item_embeddings
    where user_id = v_user_id
      and memory_item_id = any(v_memory_ids);
  end if;

  delete from public.memory_items
  where user_id = v_user_id
    and owner_type = 'workspace'
    and owner_id = p_workspace_id;

  delete from public.conversations
  where user_id = v_user_id
    and workspace_id = p_workspace_id;

  delete from public.workspaces
  where id = p_workspace_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'workspace_deleted', true,
    'conversation_count', cardinality(v_conversation_ids),
    'memory_item_count', cardinality(v_memory_ids),
    'storage_paths', to_jsonb(v_storage_paths)
  );
end;
$$;


ALTER FUNCTION "public"."delete_workspace_cascade"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_billing_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_billing_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_conversation_branches_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_conversation_branches_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_memory_items"("p_user_id" "uuid", "p_query_embedding" "public"."vector", "p_match_count" integer DEFAULT 24, "p_owner_type" "text" DEFAULT NULL::"text", "p_owner_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("memory_item_id" "uuid", "similarity" real)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    mie.memory_item_id,
    (1 - (mie.embedding <=> p_query_embedding))::REAL AS similarity
  FROM public.memory_item_embeddings mie
  INNER JOIN public.memory_items mi
    ON mi.id = mie.memory_item_id
   AND mi.user_id = p_user_id
   AND mi.status = 'active'
  WHERE
    mie.user_id = p_user_id
    AND (p_owner_type IS NULL OR mi.owner_type = p_owner_type)
    AND (p_owner_id IS NULL OR mi.owner_id = p_owner_id)
  ORDER BY mie.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 100));
$$;


ALTER FUNCTION "public"."match_memory_items"("p_user_id" "uuid", "p_query_embedding" "public"."vector", "p_match_count" integer, "p_owner_type" "text", "p_owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_conversation_context"("p_conversation_id" "uuid", "p_workspace_id" "uuid" DEFAULT NULL::"uuid", "p_memory_policy" "text" DEFAULT 'conservative'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_conversation record;
  v_target_workspace record;
  v_moved_memory_count integer := 0;
  v_left_memory_count integer := 0;
  v_source_owner_type text;
  v_source_owner_id uuid;
  v_updated_conversation record;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if p_memory_policy is distinct from 'conservative' then
    return jsonb_build_object('error', 'unsupported_memory_policy');
  end if;

  select id, user_id, title, mentor_id, workspace_id, created_at, updated_at
  into v_conversation
  from public.conversations
  where id = p_conversation_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('conversation_found', false);
  end if;

  if v_conversation.mentor_id is not null then
    return jsonb_build_object(
      'conversation_found', true,
      'error', 'mentor_context_unsupported'
    );
  end if;

  if v_conversation.workspace_id is not distinct from p_workspace_id then
    return jsonb_build_object(
      'conversation_found', true,
      'error', 'noop'
    );
  end if;

  if p_workspace_id is not null then
    select id
    into v_target_workspace
    from public.workspaces
    where id = p_workspace_id
      and user_id = v_user_id;

    if not found then
      return jsonb_build_object(
        'conversation_found', true,
        'target_workspace_found', false
      );
    end if;
  end if;

  v_source_owner_type := case
    when v_conversation.workspace_id is null then 'global'
    else 'workspace'
  end;
  v_source_owner_id := v_conversation.workspace_id;

  if p_workspace_id is not null then
    with linked_source_memories as (
      select mi.id
      from public.memory_items mi
      where mi.user_id = v_user_id
        and mi.status = 'active'
        and mi.owner_type = v_source_owner_type
        and (
          (v_source_owner_type = 'global' and mi.owner_id is null)
          or (v_source_owner_type = 'workspace' and mi.owner_id = v_source_owner_id)
        )
        and exists (
          select 1
          from public.memory_item_sources mis
          where mis.memory_item_id = mi.id
            and mis.user_id = v_user_id
            and mis.conversation_id = p_conversation_id
        )
    ),
    movable_memories as (
      select lsm.id
      from linked_source_memories lsm
      where not exists (
        select 1
        from public.memory_item_sources other_sources
        where other_sources.memory_item_id = lsm.id
          and other_sources.user_id = v_user_id
          and other_sources.conversation_id is not null
          and other_sources.conversation_id <> p_conversation_id
      )
    ),
    moved_memories as (
      update public.memory_items mi
      set owner_type = 'workspace',
          owner_id = p_workspace_id
      where mi.id in (select id from movable_memories)
        and mi.user_id = v_user_id
      returning mi.id
    )
    select
      (select count(*) from moved_memories),
      (select count(*) from linked_source_memories)
        - (select count(*) from moved_memories)
    into v_moved_memory_count, v_left_memory_count;
  else
    select count(*)
    into v_left_memory_count
    from public.memory_items mi
    where mi.user_id = v_user_id
      and mi.status = 'active'
      and mi.owner_type = 'workspace'
      and mi.owner_id = v_conversation.workspace_id
      and exists (
        select 1
        from public.memory_item_sources mis
        where mis.memory_item_id = mi.id
          and mis.user_id = v_user_id
          and mis.conversation_id = p_conversation_id
      );
  end if;

  update public.conversations
  set workspace_id = p_workspace_id,
      mentor_id = null,
      updated_at = now()
  where id = p_conversation_id
    and user_id = v_user_id
  returning id, title, mentor_id, workspace_id, created_at, updated_at
  into v_updated_conversation;

  return jsonb_build_object(
    'conversation_found', true,
    'target_workspace_found', true,
    'conversation', jsonb_build_object(
      'id', v_updated_conversation.id,
      'title', v_updated_conversation.title,
      'mentor_id', v_updated_conversation.mentor_id,
      'workspace_id', v_updated_conversation.workspace_id,
      'created_at', v_updated_conversation.created_at,
      'updated_at', v_updated_conversation.updated_at
    ),
    'memory', jsonb_build_object(
      'moved', coalesce(v_moved_memory_count, 0),
      'copied', 0,
      'leftInPlace', coalesce(v_left_memory_count, 0)
    )
  );
end;
$$;


ALTER FUNCTION "public"."move_conversation_context"("p_conversation_id" "uuid", "p_workspace_id" "uuid", "p_memory_policy" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_conversation_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_conversation_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_billing_subscription_if_newer"("p_subscription" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rows integer;
begin
  insert into public.billing_subscriptions (
    subscription_id,
    stripe_customer_id,
    user_id,
    price_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    cancel_at,
    canceled_at,
    trial_end,
    latest_invoice_id,
    latest_invoice_status,
    latest_payment_intent_status,
    metadata,
    last_stripe_event_id,
    last_stripe_event_created,
    updated_at
  )
  values (
    p_subscription->>'subscription_id',
    p_subscription->>'stripe_customer_id',
    (p_subscription->>'user_id')::uuid,
    p_subscription->>'price_id',
    p_subscription->>'status',
    nullif(p_subscription->>'current_period_start', '')::timestamptz,
    nullif(p_subscription->>'current_period_end', '')::timestamptz,
    coalesce((p_subscription->>'cancel_at_period_end')::boolean, false),
    nullif(p_subscription->>'cancel_at', '')::timestamptz,
    nullif(p_subscription->>'canceled_at', '')::timestamptz,
    nullif(p_subscription->>'trial_end', '')::timestamptz,
    p_subscription->>'latest_invoice_id',
    p_subscription->>'latest_invoice_status',
    p_subscription->>'latest_payment_intent_status',
    coalesce(p_subscription->'metadata', '{}'::jsonb),
    p_subscription->>'last_stripe_event_id',
    nullif(p_subscription->>'last_stripe_event_created', '')::timestamptz,
    coalesce(nullif(p_subscription->>'updated_at', '')::timestamptz, now())
  )
  on conflict (subscription_id) do update
    set stripe_customer_id = excluded.stripe_customer_id,
        user_id = excluded.user_id,
        price_id = excluded.price_id,
        status = excluded.status,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        cancel_at = excluded.cancel_at,
        canceled_at = excluded.canceled_at,
        trial_end = excluded.trial_end,
        latest_invoice_id = excluded.latest_invoice_id,
        latest_invoice_status = excluded.latest_invoice_status,
        latest_payment_intent_status = excluded.latest_payment_intent_status,
        metadata = excluded.metadata,
        last_stripe_event_id = excluded.last_stripe_event_id,
        last_stripe_event_created = excluded.last_stripe_event_created,
        updated_at = excluded.updated_at
    where public.billing_subscriptions.last_stripe_event_created is null
      or excluded.last_stripe_event_created is null
      or public.billing_subscriptions.last_stripe_event_created < excluded.last_stripe_event_created
      or (
        public.billing_subscriptions.last_stripe_event_created = excluded.last_stripe_event_created
        and coalesce(public.billing_subscriptions.last_stripe_event_id, '') < coalesce(excluded.last_stripe_event_id, '')
      );

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;


ALTER FUNCTION "public"."upsert_billing_subscription_if_newer"("p_subscription" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_customers" (
    "user_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_entitlements" (
    "user_id" "uuid" NOT NULL,
    "plan_key" "text" DEFAULT 'free'::"text" NOT NULL,
    "can_use_cloud_models" boolean DEFAULT false NOT NULL,
    "monthly_limit" integer DEFAULT 250 NOT NULL,
    "status" "text" DEFAULT 'none'::"text" NOT NULL,
    "subscription_id" "text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "display_state" "text" DEFAULT 'no_subscription'::"text" NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."billing_entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_subscriptions" (
    "subscription_id" "text" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "price_id" "text",
    "status" "text" NOT NULL,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "canceled_at" timestamp with time zone,
    "trial_end" timestamp with time zone,
    "latest_invoice_id" "text",
    "latest_invoice_status" "text",
    "latest_payment_intent_status" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_stripe_event_id" "text",
    "last_stripe_event_created" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancel_at" timestamp with time zone
);


ALTER TABLE "public"."billing_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_webhook_events" (
    "event_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "stripe_created" timestamp with time zone,
    "processing_status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "error" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_webhook_events_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['processing'::"text", 'processed'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."billing_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "model_id" "text" NOT NULL,
    "plan_id" "text" NOT NULL,
    "window_start_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_usage_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "source_message_id" "uuid" NOT NULL,
    "entry_message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "is_main" boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "thread_id" "uuid",
    "mentor_id" "uuid",
    "workspace_id" "uuid",
    CONSTRAINT "conversations_single_context_check" CHECK ((("mentor_id" IS NULL) OR ("workspace_id" IS NULL)))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_extraction_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "scope_type" "text",
    "branch_id" "uuid",
    "thread_id" "uuid",
    "trigger_reason" "text" NOT NULL,
    "status" "text" NOT NULL,
    "skip_reason" "text",
    "model_provider" "text",
    "model_id" "text",
    "start_message_id" "uuid",
    "end_message_id" "uuid",
    "source_user_message_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "processed_message_count" integer DEFAULT 0 NOT NULL,
    "pending_user_turn_count_before" integer DEFAULT 0 NOT NULL,
    "pending_user_turn_count_after" integer DEFAULT 0 NOT NULL,
    "cursor_recovery_reason" "text",
    "input_message_count" integer DEFAULT 0 NOT NULL,
    "input_token_estimate" integer DEFAULT 0 NOT NULL,
    "candidate_count" integer DEFAULT 0 NOT NULL,
    "inserted_count" integer DEFAULT 0 NOT NULL,
    "merged_count" integer DEFAULT 0 NOT NULL,
    "superseded_count" integer DEFAULT 0 NOT NULL,
    "ignored_count" integer DEFAULT 0 NOT NULL,
    "invalid_count" integer DEFAULT 0 NOT NULL,
    "embedded_count" integer DEFAULT 0 NOT NULL,
    "duration_ms" integer,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_extraction_runs_candidate_count_check" CHECK (("candidate_count" >= 0)),
    CONSTRAINT "memory_extraction_runs_duration_ms_check" CHECK ((("duration_ms" IS NULL) OR ("duration_ms" >= 0))),
    CONSTRAINT "memory_extraction_runs_embedded_count_check" CHECK (("embedded_count" >= 0)),
    CONSTRAINT "memory_extraction_runs_ignored_count_check" CHECK (("ignored_count" >= 0)),
    CONSTRAINT "memory_extraction_runs_input_message_count_check" CHECK (("input_message_count" >= 0)),
    CONSTRAINT "memory_extraction_runs_input_token_estimate_check" CHECK (("input_token_estimate" >= 0)),
    CONSTRAINT "memory_extraction_runs_inserted_count_check" CHECK (("inserted_count" >= 0)),
    CONSTRAINT "memory_extraction_runs_invalid_count_check" CHECK (("invalid_count" >= 0)),
    CONSTRAINT "memory_extraction_runs_merged_count_check" CHECK (("merged_count" >= 0)),
    CONSTRAINT "memory_extraction_runs_pending_user_turn_count_after_check" CHECK (("pending_user_turn_count_after" >= 0)),
    CONSTRAINT "memory_extraction_runs_pending_user_turn_count_before_check" CHECK (("pending_user_turn_count_before" >= 0)),
    CONSTRAINT "memory_extraction_runs_processed_message_count_check" CHECK (("processed_message_count" >= 0)),
    CONSTRAINT "memory_extraction_runs_scope_type_check" CHECK ((("scope_type" IS NULL) OR ("scope_type" = ANY (ARRAY['main'::"text", 'branch'::"text", 'thread'::"text"])))),
    CONSTRAINT "memory_extraction_runs_status_check" CHECK (("status" = ANY (ARRAY['skipped'::"text", 'success'::"text", 'failed'::"text"]))),
    CONSTRAINT "memory_extraction_runs_superseded_count_check" CHECK (("superseded_count" >= 0))
);


ALTER TABLE "public"."memory_extraction_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_item_embeddings" (
    "memory_item_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "embedding" "public"."vector"(1536) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."memory_item_embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_item_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "memory_item_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "message_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "source_role" "text",
    "contribution_type" "text" DEFAULT 'extracted'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_item_sources_source_role_check" CHECK (("source_role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."memory_item_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "owner_type" "text" NOT NULL,
    "owner_id" "uuid",
    "type" "text" NOT NULL,
    "text" "text" NOT NULL,
    "normalized_text" "text" NOT NULL,
    "confidence" real DEFAULT 0.7 NOT NULL,
    "salience" integer DEFAULT 50 NOT NULL,
    "stability" "text" NOT NULL,
    "sensitivity" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "source_conversation_id" "uuid",
    "source_message_id" "uuid",
    "source_role" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_items_confidence_check" CHECK ((("confidence" >= (0)::double precision) AND ("confidence" <= (1)::double precision))),
    CONSTRAINT "memory_items_owner_scope_check" CHECK (((("owner_type" = 'global'::"text") AND ("owner_id" IS NULL)) OR (("owner_type" = ANY (ARRAY['mentor'::"text", 'workspace'::"text"])) AND ("owner_id" IS NOT NULL)))),
    CONSTRAINT "memory_items_owner_type_check" CHECK (("owner_type" = ANY (ARRAY['global'::"text", 'mentor'::"text", 'workspace'::"text"]))),
    CONSTRAINT "memory_items_salience_check" CHECK ((("salience" >= 0) AND ("salience" <= 100))),
    CONSTRAINT "memory_items_sensitivity_check" CHECK (("sensitivity" = ANY (ARRAY['normal'::"text", 'private'::"text", 'sensitive'::"text"]))),
    CONSTRAINT "memory_items_source_role_check" CHECK (("source_role" = ANY (ARRAY['user'::"text", 'assistant'::"text"]))),
    CONSTRAINT "memory_items_stability_check" CHECK (("stability" = ANY (ARRAY['stable'::"text", 'episodic'::"text"]))),
    CONSTRAINT "memory_items_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'superseded'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."memory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mentors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "tagline" "text" NOT NULL,
    "description" "text",
    "base_system_prompt" "text" NOT NULL,
    "user_instructions" "text" DEFAULT ''::"text" NOT NULL,
    "is_builtin" boolean DEFAULT false NOT NULL,
    "accent_color" "text",
    "avatar_url" "text",
    "voice_id" "text",
    "model_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mentors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "storage_bucket" "text" DEFAULT 'chat-images'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" integer NOT NULL,
    "width" integer,
    "height" integer,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_attachments_mime_type_check" CHECK (("mime_type" = ANY (ARRAY['image/png'::"text", 'image/jpeg'::"text", 'image/webp'::"text", 'image/gif'::"text"]))),
    CONSTRAINT "message_attachments_size_bytes_check" CHECK ((("size_bytes" > 0) AND ("size_bytes" <= 10485760)))
);


ALTER TABLE "public"."message_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "thread_id" "uuid",
    "parent_message_id" "uuid",
    "previous_message_id" "uuid",
    "search_metadata" "jsonb",
    CONSTRAINT "messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "source_message_id" "uuid" NOT NULL,
    "highlighted_text" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_offset" integer NOT NULL,
    "end_offset" integer NOT NULL,
    "selection_stream_version" "text" DEFAULT 'legacy-dom-v1'::"text" NOT NULL,
    CONSTRAINT "threads_selection_stream_version_check" CHECK (("selection_stream_version" = ANY (ARRAY['legacy-dom-v1'::"text", 'markdown-structure-v2'::"text"])))
);


ALTER TABLE "public"."threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_counters" (
    "user_id" "uuid" NOT NULL,
    "feature_key" "text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usage_counters_count_check" CHECK (("count" >= 0))
);


ALTER TABLE "public"."usage_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "context" "text",
    "icon" "text",
    "accent_color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspaces_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) > 0) AND ("length"("name") <= 80)))
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."billing_entitlements"
    ADD CONSTRAINT "billing_entitlements_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("subscription_id");



ALTER TABLE ONLY "public"."billing_webhook_events"
    ADD CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."chat_usage_events"
    ADD CONSTRAINT "chat_usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_branches"
    ADD CONSTRAINT "conversation_branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mentors"
    ADD CONSTRAINT "experts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mentors"
    ADD CONSTRAINT "experts_user_id_slug_key" UNIQUE ("user_id", "slug");



ALTER TABLE ONLY "public"."memory_extraction_runs"
    ADD CONSTRAINT "memory_extraction_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_extraction_states"
    ADD CONSTRAINT "memory_extraction_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_item_embeddings"
    ADD CONSTRAINT "memory_item_embeddings_pkey" PRIMARY KEY ("memory_item_id");



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "memory_item_sources_memory_item_id_conversation_id_message__key" UNIQUE NULLS NOT DISTINCT ("memory_item_id", "conversation_id", "message_id", "contribution_type");



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "memory_item_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "memory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_storage_bucket_storage_path_key" UNIQUE ("storage_bucket", "storage_path");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_counters"
    ADD CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("user_id", "feature_key", "period_start");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_billing_customers_stripe_customer_id" ON "public"."billing_customers" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_billing_subscriptions_customer_id" ON "public"."billing_subscriptions" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_billing_subscriptions_status_period" ON "public"."billing_subscriptions" USING "btree" ("user_id", "status", "current_period_end" DESC);



CREATE INDEX "idx_billing_subscriptions_user_id" ON "public"."billing_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_billing_webhook_events_status" ON "public"."billing_webhook_events" USING "btree" ("processing_status", "created_at");



CREATE INDEX "idx_chat_usage_events_user_created_at" ON "public"."chat_usage_events" USING "btree" ("user_id", "created_at");



CREATE INDEX "idx_chat_usage_events_user_window" ON "public"."chat_usage_events" USING "btree" ("user_id", "window_start_at", "created_at");



CREATE INDEX "idx_conversation_branches_conversation_id" ON "public"."conversation_branches" USING "btree" ("conversation_id");



CREATE UNIQUE INDEX "idx_conversation_branches_entry_message_id" ON "public"."conversation_branches" USING "btree" ("entry_message_id");



CREATE UNIQUE INDEX "idx_conversation_branches_main_per_source" ON "public"."conversation_branches" USING "btree" ("source_message_id") WHERE "is_main";



CREATE INDEX "idx_conversation_branches_source_message_id" ON "public"."conversation_branches" USING "btree" ("source_message_id");



CREATE INDEX "idx_conversations_thread_id" ON "public"."conversations" USING "btree" ("thread_id");



CREATE INDEX "idx_conversations_user_id" ON "public"."conversations" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_user_mentor" ON "public"."conversations" USING "btree" ("user_id", "mentor_id");



CREATE INDEX "idx_conversations_user_mentor_updated_at" ON "public"."conversations" USING "btree" ("user_id", "mentor_id", "updated_at" DESC);



CREATE INDEX "idx_conversations_user_updated_at" ON "public"."conversations" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "idx_conversations_user_workspace_updated_at" ON "public"."conversations" USING "btree" ("user_id", "workspace_id", "updated_at" DESC);



CREATE INDEX "idx_memory_extraction_runs_user_conversation_created" ON "public"."memory_extraction_runs" USING "btree" ("user_id", "conversation_id", "created_at" DESC);



CREATE INDEX "idx_memory_extraction_runs_user_created" ON "public"."memory_extraction_runs" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_memory_extraction_states_scope_unique" ON "public"."memory_extraction_states" USING "btree" ("user_id", "conversation_id", "scope_type", "branch_id", "thread_id") NULLS NOT DISTINCT;



CREATE INDEX "idx_memory_extraction_states_user_status_pending" ON "public"."memory_extraction_states" USING "btree" ("user_id", "status", "pending_since");



CREATE INDEX "idx_memory_item_embeddings_user_item" ON "public"."memory_item_embeddings" USING "btree" ("user_id", "memory_item_id");



CREATE INDEX "idx_memory_item_embeddings_vector" ON "public"."memory_item_embeddings" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='100');



CREATE INDEX "idx_memory_item_sources_conversation_id" ON "public"."memory_item_sources" USING "btree" ("user_id", "conversation_id");



CREATE INDEX "idx_memory_item_sources_memory_item_id" ON "public"."memory_item_sources" USING "btree" ("memory_item_id");



CREATE INDEX "idx_memory_item_sources_message_id" ON "public"."memory_item_sources" USING "btree" ("user_id", "message_id");



CREATE UNIQUE INDEX "idx_memory_items_active_exact_unique" ON "public"."memory_items" USING "btree" ("user_id", "owner_type", "owner_id", "normalized_text") NULLS NOT DISTINCT WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_memory_items_normalized_text_trgm" ON "public"."memory_items" USING "gin" ("normalized_text" "public"."gin_trgm_ops");



CREATE INDEX "idx_memory_items_user_owner_status" ON "public"."memory_items" USING "btree" ("user_id", "owner_type", "owner_id", "status");



CREATE INDEX "idx_memory_items_user_stability_status" ON "public"."memory_items" USING "btree" ("user_id", "stability", "status");



CREATE INDEX "idx_memory_items_user_status_updated" ON "public"."memory_items" USING "btree" ("user_id", "status", "updated_at" DESC);



CREATE INDEX "idx_memory_items_user_type_status" ON "public"."memory_items" USING "btree" ("user_id", "type", "status");



CREATE INDEX "idx_mentors_user_builtin" ON "public"."mentors" USING "btree" ("user_id", "is_builtin");



CREATE INDEX "idx_mentors_user_id" ON "public"."mentors" USING "btree" ("user_id");



CREATE INDEX "idx_message_attachments_message_id" ON "public"."message_attachments" USING "btree" ("message_id", "position");



CREATE INDEX "idx_message_attachments_user_id" ON "public"."message_attachments" USING "btree" ("user_id");



CREATE INDEX "idx_messages_conversation_id" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at");



CREATE INDEX "idx_messages_previous_message_id" ON "public"."messages" USING "btree" ("previous_message_id");



CREATE INDEX "idx_messages_thread_id" ON "public"."messages" USING "btree" ("thread_id");



CREATE INDEX "idx_threads_conversation_id" ON "public"."threads" USING "btree" ("conversation_id");



CREATE INDEX "idx_threads_source_message_id" ON "public"."threads" USING "btree" ("source_message_id");



CREATE INDEX "idx_usage_counters_user_period" ON "public"."usage_counters" USING "btree" ("user_id", "period_start" DESC);



CREATE INDEX "idx_workspaces_user_updated_at" ON "public"."workspaces" USING "btree" ("user_id", "updated_at" DESC);



CREATE OR REPLACE TRIGGER "on_billing_customer_updated" BEFORE UPDATE ON "public"."billing_customers" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_billing_entitlement_updated" BEFORE UPDATE ON "public"."billing_entitlements" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_billing_subscription_updated" BEFORE UPDATE ON "public"."billing_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_conversation_branches_updated" BEFORE UPDATE ON "public"."conversation_branches" FOR EACH ROW EXECUTE FUNCTION "public"."handle_conversation_branches_updated_at"();



CREATE OR REPLACE TRIGGER "on_memory_extraction_states_updated" BEFORE UPDATE ON "public"."memory_extraction_states" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_memory_item_updated" BEFORE UPDATE ON "public"."memory_items" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_mentor_updated" BEFORE UPDATE ON "public"."mentors" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_message_created" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_conversation_timestamp"();



CREATE OR REPLACE TRIGGER "on_profile_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_usage_counter_updated" BEFORE UPDATE ON "public"."usage_counters" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "on_workspace_updated" BEFORE UPDATE ON "public"."workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."billing_customers"
    ADD CONSTRAINT "billing_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_entitlements"
    ADD CONSTRAINT "billing_entitlements_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("subscription_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."billing_entitlements"
    ADD CONSTRAINT "billing_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_stripe_customer_id_fkey" FOREIGN KEY ("stripe_customer_id") REFERENCES "public"."billing_customers"("stripe_customer_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_usage_events"
    ADD CONSTRAINT "chat_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_branches"
    ADD CONSTRAINT "conversation_branches_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_branches"
    ADD CONSTRAINT "conversation_branches_entry_message_id_fkey" FOREIGN KEY ("entry_message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_branches"
    ADD CONSTRAINT "conversation_branches_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_branches"
    ADD CONSTRAINT "conversation_branches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_expert_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "public"."mentors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mentors"
    ADD CONSTRAINT "experts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_extraction_runs"
    ADD CONSTRAINT "memory_extraction_runs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."conversation_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_extraction_runs"
    ADD CONSTRAINT "memory_extraction_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_extraction_runs"
    ADD CONSTRAINT "memory_extraction_runs_end_message_id_fkey" FOREIGN KEY ("end_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_extraction_runs"
    ADD CONSTRAINT "memory_extraction_runs_start_message_id_fkey" FOREIGN KEY ("start_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_extraction_runs"
    ADD CONSTRAINT "memory_extraction_runs_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_extraction_runs"
    ADD CONSTRAINT "memory_extraction_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_extraction_states"
    ADD CONSTRAINT "memory_extraction_states_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."conversation_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_extraction_states"
    ADD CONSTRAINT "memory_extraction_states_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_extraction_states"
    ADD CONSTRAINT "memory_extraction_states_last_processed_message_id_fkey" FOREIGN KEY ("last_processed_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_extraction_states"
    ADD CONSTRAINT "memory_extraction_states_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_extraction_states"
    ADD CONSTRAINT "memory_extraction_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_embeddings"
    ADD CONSTRAINT "memory_item_embeddings_memory_item_id_fkey" FOREIGN KEY ("memory_item_id") REFERENCES "public"."memory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_embeddings"
    ADD CONSTRAINT "memory_item_embeddings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "memory_item_sources_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "memory_item_sources_memory_item_id_fkey" FOREIGN KEY ("memory_item_id") REFERENCES "public"."memory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "memory_item_sources_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_item_sources"
    ADD CONSTRAINT "memory_item_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "memory_items_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "memory_items_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "memory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_previous_message_id_fkey" FOREIGN KEY ("previous_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."threads"
    ADD CONSTRAINT "threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_counters"
    ADD CONSTRAINT "usage_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can create own mentors" ON "public"."mentors" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own conversation branches" ON "public"."conversation_branches" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own conversations" ON "public"."conversations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own custom mentors" ON "public"."mentors" FOR DELETE USING ((("auth"."uid"() = "user_id") AND ("is_builtin" = false)));



CREATE POLICY "Users can delete own memory item embeddings" ON "public"."memory_item_embeddings" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own memory item sources" ON "public"."memory_item_sources" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own memory items" ON "public"."memory_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own message attachments" ON "public"."message_attachments" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own threads" ON "public"."threads" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own workspaces" ON "public"."workspaces" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert messages in own conversations" ON "public"."messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "messages"."conversation_id") AND ("conversations"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can insert own conversation branches" ON "public"."conversation_branches" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own conversations" ON "public"."conversations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own memory extraction runs" ON "public"."memory_extraction_runs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own memory extraction states" ON "public"."memory_extraction_states" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own memory item embeddings" ON "public"."memory_item_embeddings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own memory item sources" ON "public"."memory_item_sources" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."memory_items"
  WHERE (("memory_items"."id" = "memory_item_sources"."memory_item_id") AND ("memory_items"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can insert own memory items" ON "public"."memory_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own message attachments" ON "public"."message_attachments" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ("storage_bucket" = 'chat-images'::"text") AND ("storage_path" ~~ ((( SELECT "auth"."uid"() AS "uid"))::"text" || '/%'::"text")) AND (("message_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."messages"
  WHERE (("messages"."id" = "message_attachments"."message_id") AND ("messages"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own threads" ON "public"."threads" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own workspaces" ON "public"."workspaces" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own billing customer" ON "public"."billing_customers" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own billing entitlements" ON "public"."billing_entitlements" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own billing subscriptions" ON "public"."billing_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own chat usage events" ON "public"."chat_usage_events" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own conversation branches" ON "public"."conversation_branches" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own threads" ON "public"."threads" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own usage counters" ON "public"."usage_counters" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own conversation branches" ON "public"."conversation_branches" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own conversations" ON "public"."conversations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own memory extraction states" ON "public"."memory_extraction_states" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own memory item embeddings" ON "public"."memory_item_embeddings" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own memory items" ON "public"."memory_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own mentors" ON "public"."mentors" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own workspaces" ON "public"."workspaces" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view messages in own conversations" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "messages"."conversation_id") AND ("conversations"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own conversations" ON "public"."conversations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own memory extraction runs" ON "public"."memory_extraction_runs" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (COALESCE((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text"), ''::"text") = 'admin'::"text")));



CREATE POLICY "Users can view own memory extraction states" ON "public"."memory_extraction_states" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own memory item embeddings" ON "public"."memory_item_embeddings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own memory item sources" ON "public"."memory_item_sources" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own memory items" ON "public"."memory_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own mentors" ON "public"."mentors" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own message attachments" ON "public"."message_attachments" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own workspaces" ON "public"."workspaces" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."billing_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_entitlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_usage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_branches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_extraction_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_extraction_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_item_embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_item_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mentors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."memory_extraction_states" TO "anon";
GRANT ALL ON TABLE "public"."memory_extraction_states" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_extraction_states" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_memory_extraction_state"("state_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_memory_extraction_state"("state_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_memory_extraction_state"("state_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_memory_extraction_state"("state_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_chat_usage_limits"("p_user_id" "uuid", "p_month_start" timestamp with time zone, "p_month_end" timestamp with time zone, "p_window_start" timestamp with time zone, "p_window_end" timestamp with time zone, "p_total_increment" integer, "p_premium_increment" integer, "p_monthly_total_limit" integer, "p_window_total_limit" integer, "p_monthly_premium_limit" integer, "p_window_premium_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_chat_usage_limits"("p_user_id" "uuid", "p_month_start" timestamp with time zone, "p_month_end" timestamp with time zone, "p_window_start" timestamp with time zone, "p_window_end" timestamp with time zone, "p_total_increment" integer, "p_premium_increment" integer, "p_monthly_total_limit" integer, "p_window_total_limit" integer, "p_monthly_premium_limit" integer, "p_window_premium_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_chat_usage_limits"("p_user_id" "uuid", "p_month_start" timestamp with time zone, "p_month_end" timestamp with time zone, "p_window_start" timestamp with time zone, "p_window_end" timestamp with time zone, "p_total_increment" integer, "p_premium_increment" integer, "p_monthly_total_limit" integer, "p_window_total_limit" integer, "p_monthly_premium_limit" integer, "p_window_premium_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_chat_usage_limits"("p_user_id" "uuid", "p_month_start" timestamp with time zone, "p_month_end" timestamp with time zone, "p_window_start" timestamp with time zone, "p_window_end" timestamp with time zone, "p_total_increment" integer, "p_premium_increment" integer, "p_monthly_total_limit" integer, "p_window_total_limit" integer, "p_monthly_premium_limit" integer, "p_window_premium_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_model_usage"("p_user_id" "uuid", "p_feature_key" "text", "p_period_start" "date", "p_period_end" "date", "p_increment" integer, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_model_usage"("p_user_id" "uuid", "p_feature_key" "text", "p_period_start" "date", "p_period_end" "date", "p_increment" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_model_usage"("p_user_id" "uuid", "p_feature_key" "text", "p_period_start" "date", "p_period_end" "date", "p_increment" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_model_usage"("p_user_id" "uuid", "p_feature_key" "text", "p_period_start" "date", "p_period_end" "date", "p_increment" integer, "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_workspace_cascade"("p_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_workspace_cascade"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_workspace_cascade"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_workspace_cascade"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_billing_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_billing_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_billing_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_conversation_branches_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_conversation_branches_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_conversation_branches_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."match_memory_items"("p_user_id" "uuid", "p_query_embedding" "public"."vector", "p_match_count" integer, "p_owner_type" "text", "p_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_memory_items"("p_user_id" "uuid", "p_query_embedding" "public"."vector", "p_match_count" integer, "p_owner_type" "text", "p_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_memory_items"("p_user_id" "uuid", "p_query_embedding" "public"."vector", "p_match_count" integer, "p_owner_type" "text", "p_owner_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_conversation_context"("p_conversation_id" "uuid", "p_workspace_id" "uuid", "p_memory_policy" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_conversation_context"("p_conversation_id" "uuid", "p_workspace_id" "uuid", "p_memory_policy" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."move_conversation_context"("p_conversation_id" "uuid", "p_workspace_id" "uuid", "p_memory_policy" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_conversation_context"("p_conversation_id" "uuid", "p_workspace_id" "uuid", "p_memory_policy" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_conversation_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_conversation_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_conversation_timestamp"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_billing_subscription_if_newer"("p_subscription" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_billing_subscription_if_newer"("p_subscription" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_billing_subscription_if_newer"("p_subscription" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_billing_subscription_if_newer"("p_subscription" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."billing_customers" TO "anon";
GRANT ALL ON TABLE "public"."billing_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_customers" TO "service_role";



GRANT ALL ON TABLE "public"."billing_entitlements" TO "anon";
GRANT ALL ON TABLE "public"."billing_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."billing_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."billing_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."billing_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."billing_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."chat_usage_events" TO "anon";
GRANT ALL ON TABLE "public"."chat_usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_usage_events" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_branches" TO "anon";
GRANT ALL ON TABLE "public"."conversation_branches" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_branches" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."memory_extraction_runs" TO "anon";
GRANT ALL ON TABLE "public"."memory_extraction_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_extraction_runs" TO "service_role";



GRANT ALL ON TABLE "public"."memory_item_embeddings" TO "anon";
GRANT ALL ON TABLE "public"."memory_item_embeddings" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_item_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."memory_item_sources" TO "anon";
GRANT ALL ON TABLE "public"."memory_item_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_item_sources" TO "service_role";



GRANT ALL ON TABLE "public"."memory_items" TO "anon";
GRANT ALL ON TABLE "public"."memory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_items" TO "service_role";



GRANT ALL ON TABLE "public"."mentors" TO "anon";
GRANT ALL ON TABLE "public"."mentors" TO "authenticated";
GRANT ALL ON TABLE "public"."mentors" TO "service_role";



GRANT ALL ON TABLE "public"."message_attachments" TO "anon";
GRANT ALL ON TABLE "public"."message_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."message_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."threads" TO "anon";
GRANT ALL ON TABLE "public"."threads" TO "authenticated";
GRANT ALL ON TABLE "public"."threads" TO "service_role";



GRANT ALL ON TABLE "public"."usage_counters" TO "anon";
GRANT ALL ON TABLE "public"."usage_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_counters" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
