begin;

create table public.model_usage_calls (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  run_id uuid references public.chat_runs(id) on delete set null,
  call_kind text not null,
  attempt smallint not null,
  chat_mode text,
  surface text not null,
  requested_model_id text,
  resolved_model_id text,
  provider text not null,
  provider_model_id text not null,
  status text not null,
  finish_reason text,
  input_tokens bigint,
  no_cache_input_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  total_tokens bigint,
  duration_ms integer not null,
  estimated_cost_nanousd bigint,
  pricing_version text,
  cost_status text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint model_usage_calls_call_kind_check check (
    call_kind in (
      'chat_response',
      'chat_response_retry',
      'conversation_title',
      'search_decision',
      'search_plan',
      'mentor_generation'
    )
  ),
  constraint model_usage_calls_attempt_check check (attempt >= 0),
  constraint model_usage_calls_chat_mode_check check (
    chat_mode is null or chat_mode in ('persistent', 'temporary')
  ),
  constraint model_usage_calls_surface_check check (
    surface in ('main', 'branch', 'inline_thread', 'mentor')
  ),
  constraint model_usage_calls_status_check check (
    status in ('completed', 'failed', 'cancelled', 'interrupted')
  ),
  constraint model_usage_calls_cost_status_check check (
    cost_status in ('priced', 'missing_usage', 'missing_price', 'failed_before_usage')
  ),
  constraint model_usage_calls_chat_surface_mode_check check (
    (surface = 'mentor' and chat_mode is null)
    or (surface <> 'mentor' and chat_mode is not null)
  ),
  constraint model_usage_calls_token_values_check check (
    input_tokens >= 0
    and no_cache_input_tokens >= 0
    and cache_read_tokens >= 0
    and cache_write_tokens >= 0
    and output_tokens >= 0
    and reasoning_tokens >= 0
    and total_tokens >= 0
  ),
  constraint model_usage_calls_duration_check check (duration_ms >= 0),
  constraint model_usage_calls_cost_check check (estimated_cost_nanousd >= 0),
  constraint model_usage_calls_time_order_check check (
    completed_at >= started_at
  ),
  constraint model_usage_calls_pricing_check check (
    (cost_status = 'priced' and estimated_cost_nanousd is not null and pricing_version is not null)
    or (cost_status <> 'priced' and estimated_cost_nanousd is null)
  )
);

comment on table public.model_usage_calls is
  'Content-free, server-written terminal accounting for individual AI provider calls.';

create index model_usage_calls_user_started_idx
  on public.model_usage_calls (user_id, started_at desc);

create index model_usage_calls_started_idx
  on public.model_usage_calls (started_at desc);

create index model_usage_calls_resolved_model_started_idx
  on public.model_usage_calls (resolved_model_id, started_at desc);

alter table public.model_usage_calls enable row level security;

revoke all on table public.model_usage_calls from public, anon, authenticated;
grant insert, select on table public.model_usage_calls to service_role;

create or replace function public.admin_model_usage_overview(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  registered_users bigint,
  active_users bigint,
  responses bigint,
  provider_calls bigint,
  input_tokens numeric,
  cache_read_tokens numeric,
  output_tokens numeric,
  reasoning_tokens numeric,
  total_tokens numeric,
  estimated_cost_nanousd numeric,
  estimated_chat_cost_nanousd numeric,
  average_chat_cost_nanousd numeric,
  completed_calls bigint,
  usage_reported_calls bigint,
  billable_usage_calls bigint,
  priced_calls bigint,
  missing_usage_calls bigint,
  missing_price_calls bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_start is null or p_end is null or p_start >= p_end then
    raise exception 'invalid usage interval' using errcode = '22007';
  end if;

  return query
  with ranged_calls as (
    select calls.*
    from public.model_usage_calls as calls
    where calls.started_at >= p_start
      and calls.started_at < p_end
  ),
  primary_requests as (
    select distinct calls.user_id, calls.request_id
    from public.model_usage_calls as calls
    where calls.call_kind = 'chat_response'
  ),
  totals as (
    select
      count(distinct calls.user_id) filter (
        where calls.call_kind in ('chat_response', 'mentor_generation')
      ) as active_users,
      count(distinct calls.request_id) filter (
        where calls.call_kind = 'chat_response'
      ) as responses,
      count(*) as provider_calls,
      sum(calls.input_tokens) as input_tokens,
      sum(calls.cache_read_tokens) as cache_read_tokens,
      sum(calls.output_tokens) as output_tokens,
      sum(calls.reasoning_tokens) as reasoning_tokens,
      sum(calls.total_tokens) as total_tokens,
      sum(calls.estimated_cost_nanousd) as estimated_cost_nanousd,
      sum(calls.estimated_cost_nanousd) filter (
        where exists (
          select 1
          from primary_requests
          where primary_requests.user_id = calls.user_id
            and primary_requests.request_id = calls.request_id
        )
      ) as estimated_chat_cost_nanousd,
      count(*) filter (where calls.status = 'completed') as completed_calls,
      count(*) filter (
        where calls.status = 'completed'
          and calls.cost_status in ('priced', 'missing_price')
      ) as usage_reported_calls,
      count(*) filter (
        where calls.cost_status in ('priced', 'missing_price')
      ) as billable_usage_calls,
      count(*) filter (where calls.cost_status = 'priced') as priced_calls,
      count(*) filter (
        where calls.cost_status in ('missing_usage', 'failed_before_usage')
      ) as missing_usage_calls,
      count(*) filter (where calls.cost_status = 'missing_price') as missing_price_calls
    from ranged_calls as calls
  )
  select
    (select count(*) from public.profiles)::bigint,
    totals.active_users::bigint,
    totals.responses::bigint,
    totals.provider_calls::bigint,
    totals.input_tokens,
    totals.cache_read_tokens,
    totals.output_tokens,
    totals.reasoning_tokens,
    totals.total_tokens,
    totals.estimated_cost_nanousd,
    totals.estimated_chat_cost_nanousd,
    case
      when totals.responses = 0 then null
      else totals.estimated_chat_cost_nanousd / totals.responses
    end,
    totals.completed_calls::bigint,
    totals.usage_reported_calls::bigint,
    totals.billable_usage_calls::bigint,
    totals.priced_calls::bigint,
    totals.missing_usage_calls::bigint,
    totals.missing_price_calls::bigint
  from totals;
end;
$$;

create or replace function public.admin_model_usage_daily(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  usage_day date,
  responses bigint,
  provider_calls bigint,
  total_tokens numeric,
  estimated_cost_nanousd numeric,
  missing_usage_calls bigint,
  missing_price_calls bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_start is null or p_end is null or p_start >= p_end then
    raise exception 'invalid usage interval' using errcode = '22007';
  end if;

  return query
  select
    (date_trunc('day', calls.started_at at time zone 'UTC'))::date,
    count(distinct calls.request_id) filter (
      where calls.call_kind = 'chat_response'
    )::bigint,
    count(*)::bigint,
    sum(calls.total_tokens),
    sum(calls.estimated_cost_nanousd),
    count(*) filter (
      where calls.cost_status in ('missing_usage', 'failed_before_usage')
    )::bigint,
    count(*) filter (where calls.cost_status = 'missing_price')::bigint
  from public.model_usage_calls as calls
  where calls.started_at >= p_start
    and calls.started_at < p_end
  group by 1
  order by 1;
end;
$$;

create or replace function public.admin_model_usage_models(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  model_key text,
  resolved_model_id text,
  provider text,
  provider_model_id text,
  primary_responses bigint,
  auxiliary_calls bigint,
  distinct_users bigint,
  auto_requested_responses bigint,
  input_tokens numeric,
  cache_read_tokens numeric,
  output_tokens numeric,
  reasoning_tokens numeric,
  total_tokens numeric,
  estimated_cost_nanousd numeric,
  failed_calls bigint,
  billable_usage_calls bigint,
  priced_calls bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_start is null or p_end is null or p_start >= p_end then
    raise exception 'invalid usage interval' using errcode = '22007';
  end if;

  return query
  select
    coalesce(calls.resolved_model_id, calls.provider || ':' || calls.provider_model_id),
    calls.resolved_model_id,
    calls.provider,
    calls.provider_model_id,
    count(distinct calls.request_id) filter (
      where calls.call_kind = 'chat_response'
    )::bigint,
    count(*) filter (where calls.call_kind <> 'chat_response')::bigint,
    count(distinct calls.user_id)::bigint,
    count(distinct calls.request_id) filter (
      where calls.call_kind = 'chat_response'
        and calls.requested_model_id = 'auto'
    )::bigint,
    sum(calls.input_tokens),
    sum(calls.cache_read_tokens),
    sum(calls.output_tokens),
    sum(calls.reasoning_tokens),
    sum(calls.total_tokens),
    sum(calls.estimated_cost_nanousd),
    count(*) filter (where calls.status = 'failed')::bigint,
    count(*) filter (
      where calls.cost_status in ('priced', 'missing_price')
    )::bigint,
    count(*) filter (where calls.cost_status = 'priced')::bigint
  from public.model_usage_calls as calls
  where calls.started_at >= p_start
    and calls.started_at < p_end
  group by
    coalesce(calls.resolved_model_id, calls.provider || ':' || calls.provider_model_id),
    calls.resolved_model_id,
    calls.provider,
    calls.provider_model_id
  order by sum(calls.estimated_cost_nanousd) desc nulls last, model_key;
end;
$$;

create or replace function public.admin_model_usage_users(
  p_start timestamptz,
  p_end timestamptz,
  p_sort text default 'estimated_cost',
  p_direction text default 'desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  total_users bigint,
  user_id uuid,
  email text,
  joined_at timestamptz,
  last_active_at timestamptz,
  responses bigint,
  provider_calls bigint,
  input_tokens numeric,
  cache_read_tokens numeric,
  output_tokens numeric,
  reasoning_tokens numeric,
  total_tokens numeric,
  estimated_cost_nanousd numeric,
  average_chat_cost_nanousd numeric,
  most_requested_model_id text,
  most_resolved_model_id text,
  completed_calls bigint,
  usage_reported_calls bigint,
  billable_usage_calls bigint,
  priced_calls bigint,
  missing_price_calls bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_start is null or p_end is null or p_start >= p_end then
    raise exception 'invalid usage interval' using errcode = '22007';
  end if;
  if p_sort not in (
    'estimated_cost',
    'responses',
    'provider_calls',
    'total_tokens',
    'last_active',
    'joined_at',
    'email'
  ) then
    raise exception 'invalid usage sort' using errcode = '22023';
  end if;
  if p_direction not in ('asc', 'desc') then
    raise exception 'invalid usage direction' using errcode = '22023';
  end if;
  if p_limit < 1 or p_limit > 100 or p_offset < 0 then
    raise exception 'invalid usage page' using errcode = '22023';
  end if;

  return query
  with ranged_calls as (
    select calls.*
    from public.model_usage_calls as calls
    where calls.started_at >= p_start
      and calls.started_at < p_end
  ),
  primary_requests as (
    select distinct calls.user_id, calls.request_id
    from public.model_usage_calls as calls
    where calls.call_kind = 'chat_response'
  ),
  per_user as (
    select
      profiles.id as user_id,
      profiles.email,
      profiles.created_at as joined_at,
      max(calls.started_at) filter (
        where calls.call_kind in ('chat_response', 'mentor_generation')
      ) as last_active_at,
      count(distinct calls.request_id) filter (
        where calls.call_kind = 'chat_response'
      )::bigint as responses,
      count(calls.id)::bigint as provider_calls,
      sum(calls.input_tokens) as input_tokens,
      sum(calls.cache_read_tokens) as cache_read_tokens,
      sum(calls.output_tokens) as output_tokens,
      sum(calls.reasoning_tokens) as reasoning_tokens,
      sum(calls.total_tokens) as total_tokens,
      sum(calls.estimated_cost_nanousd) as estimated_cost_nanousd,
      sum(calls.estimated_cost_nanousd) filter (
        where exists (
          select 1
          from primary_requests
          where primary_requests.user_id = calls.user_id
            and primary_requests.request_id = calls.request_id
        )
      ) as estimated_chat_cost_nanousd,
      count(calls.id) filter (where calls.status = 'completed')::bigint as completed_calls,
      count(calls.id) filter (
        where calls.status = 'completed'
          and calls.cost_status in ('priced', 'missing_price')
      )::bigint as usage_reported_calls,
      count(calls.id) filter (
        where calls.cost_status in ('priced', 'missing_price')
      )::bigint as billable_usage_calls,
      count(calls.id) filter (where calls.cost_status = 'priced')::bigint as priced_calls,
      count(calls.id) filter (where calls.cost_status = 'missing_price')::bigint as missing_price_calls
    from public.profiles as profiles
    left join ranged_calls as calls on calls.user_id = profiles.id
    group by profiles.id, profiles.email, profiles.created_at
  ),
  requested_modes as (
    select distinct on (calls.user_id)
      calls.user_id,
      calls.requested_model_id
    from ranged_calls as calls
    where calls.call_kind = 'chat_response'
      and calls.requested_model_id is not null
    group by calls.user_id, calls.requested_model_id
    order by calls.user_id, count(distinct calls.request_id) desc, calls.requested_model_id
  ),
  resolved_modes as (
    select distinct on (calls.user_id)
      calls.user_id,
      calls.resolved_model_id
    from ranged_calls as calls
    where calls.call_kind = 'chat_response'
      and calls.resolved_model_id is not null
    group by calls.user_id, calls.resolved_model_id
    order by calls.user_id, count(distinct calls.request_id) desc, calls.resolved_model_id
  ),
  rows_with_modes as (
    select
      users.*,
      requested_modes.requested_model_id as most_requested_model_id,
      resolved_modes.resolved_model_id as most_resolved_model_id
    from per_user as users
    left join requested_modes using (user_id)
    left join resolved_modes using (user_id)
  )
  select
    count(*) over ()::bigint,
    users.user_id,
    users.email,
    users.joined_at,
    users.last_active_at,
    users.responses,
    users.provider_calls,
    users.input_tokens,
    users.cache_read_tokens,
    users.output_tokens,
    users.reasoning_tokens,
    users.total_tokens,
    users.estimated_cost_nanousd,
    case
      when users.responses = 0 then null
      else users.estimated_chat_cost_nanousd / users.responses
    end,
    users.most_requested_model_id,
    users.most_resolved_model_id,
    users.completed_calls,
    users.usage_reported_calls,
    users.billable_usage_calls,
    users.priced_calls,
    users.missing_price_calls
  from rows_with_modes as users
  order by
    case when p_direction = 'asc' and p_sort = 'estimated_cost' then users.estimated_cost_nanousd end asc nulls last,
    case when p_direction = 'desc' and p_sort = 'estimated_cost' then users.estimated_cost_nanousd end desc nulls last,
    case when p_direction = 'asc' and p_sort = 'responses' then users.responses end asc,
    case when p_direction = 'desc' and p_sort = 'responses' then users.responses end desc,
    case when p_direction = 'asc' and p_sort = 'provider_calls' then users.provider_calls end asc,
    case when p_direction = 'desc' and p_sort = 'provider_calls' then users.provider_calls end desc,
    case when p_direction = 'asc' and p_sort = 'total_tokens' then users.total_tokens end asc nulls last,
    case when p_direction = 'desc' and p_sort = 'total_tokens' then users.total_tokens end desc nulls last,
    case when p_direction = 'asc' and p_sort = 'last_active' then users.last_active_at end asc nulls last,
    case when p_direction = 'desc' and p_sort = 'last_active' then users.last_active_at end desc nulls last,
    case when p_direction = 'asc' and p_sort = 'joined_at' then users.joined_at end asc,
    case when p_direction = 'desc' and p_sort = 'joined_at' then users.joined_at end desc,
    case when p_direction = 'asc' and p_sort = 'email' then users.email end asc nulls last,
    case when p_direction = 'desc' and p_sort = 'email' then users.email end desc nulls last,
    users.user_id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.admin_model_usage_overview(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_model_usage_daily(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_model_usage_models(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_model_usage_users(timestamptz, timestamptz, text, text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.admin_model_usage_overview(timestamptz, timestamptz)
  to service_role;
grant execute on function public.admin_model_usage_daily(timestamptz, timestamptz)
  to service_role;
grant execute on function public.admin_model_usage_models(timestamptz, timestamptz)
  to service_role;
grant execute on function public.admin_model_usage_users(timestamptz, timestamptz, text, text, integer, integer)
  to service_role;

commit;
