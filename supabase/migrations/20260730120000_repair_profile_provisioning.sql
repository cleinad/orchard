begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, new.created_at, now())
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the public profile paired with a newly inserted Auth user.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Maintains the one-to-one auth.users to public.profiles invariant.

insert into public.profiles (
  id,
  email,
  full_name,
  created_at,
  updated_at
)
select
  users.id,
  users.email,
  coalesce(users.raw_user_meta_data ->> 'full_name', ''),
  coalesce(users.created_at, now()),
  coalesce(users.updated_at, users.created_at, now())
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
where profiles.id is null
on conflict (id) do nothing;

commit;
