alter table if exists public.threads
  add column if not exists selection_stream_version text not null default 'markdown-structure-v2';

do $$
begin
  if to_regclass('public.threads') is not null then
    alter table public.threads
      alter column selection_stream_version set default 'markdown-structure-v2';

    update public.threads
      set selection_stream_version = 'markdown-structure-v2'
      where selection_stream_version is distinct from 'markdown-structure-v2';

    alter table public.threads
      drop constraint if exists threads_selection_stream_version_check;

    alter table public.threads
      add constraint threads_selection_stream_version_check
      check (selection_stream_version = 'markdown-structure-v2');
  end if;
end $$;
