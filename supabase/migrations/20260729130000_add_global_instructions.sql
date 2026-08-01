begin;

alter table public.profiles
  add column global_instructions text not null default '';

alter table public.profiles
  add constraint profiles_global_instructions_length_check
  check (char_length(global_instructions) <= 4000);

comment on column public.profiles.global_instructions is
  'User-authored instructions applied to every conversational response.';

commit;
