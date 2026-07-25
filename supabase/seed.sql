-- Deterministic, local-only development identities.
-- Password for both users: orchard-local-password

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'orchard.one@example.test',
    extensions.crypt('orchard-local-password', extensions.gen_salt('bf')),
    '2026-07-19 00:00:00+00',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Orchard Local One"}',
    '2026-07-19 00:00:00+00',
    '2026-07-19 00:00:00+00',
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'orchard.two@example.test',
    extensions.crypt('orchard-local-password', extensions.gen_salt('bf')),
    '2026-07-19 00:00:00+00',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Orchard Local Two"}',
    '2026-07-19 00:00:00+00',
    '2026-07-19 00:00:00+00',
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'orchard.one@example.test',
    '11111111-1111-4111-8111-111111111111',
    '{"sub":"11111111-1111-4111-8111-111111111111","email":"orchard.one@example.test","email_verified":true}',
    'email',
    '2026-07-19 00:00:00+00',
    '2026-07-19 00:00:00+00',
    '2026-07-19 00:00:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'orchard.two@example.test',
    '22222222-2222-4222-8222-222222222222',
    '{"sub":"22222222-2222-4222-8222-222222222222","email":"orchard.two@example.test","email_verified":true}',
    'email',
    '2026-07-19 00:00:00+00',
    '2026-07-19 00:00:00+00',
    '2026-07-19 00:00:00+00'
  )
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, created_at, updated_at)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'orchard.one@example.test',
    'Orchard Local One',
    '2026-07-19 00:00:00+00',
    '2026-07-19 00:00:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'orchard.two@example.test',
    'Orchard Local Two',
    '2026-07-19 00:00:00+00',
    '2026-07-19 00:00:00+00'
  )
on conflict (id) do nothing;

insert into public.conversations (
  id,
  user_id,
  title,
  title_source,
  title_version,
  created_at,
  updated_at
)
values
  (
    '11111111-aaaa-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'Orchard One Seed Chat',
    'user',
    1,
    '2026-07-19 00:00:00+00',
    '2026-07-19 00:00:00+00'
  ),
  (
    '22222222-aaaa-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    'Orchard Two Seed Chat',
    'user',
    1,
    '2026-07-19 00:00:00+00',
    '2026-07-19 00:00:00+00'
  )
on conflict (id) do nothing;

insert into public.messages (
  id,
  conversation_id,
  user_id,
  role,
  content,
  created_at
)
values
  (
    '11111111-bbbb-4111-8111-111111111111',
    '11111111-aaaa-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'user',
    'Synthetic local message for Orchard user one.',
    '2026-07-19 00:00:00+00'
  ),
  (
    '22222222-bbbb-4222-8222-222222222222',
    '22222222-aaaa-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    'user',
    'Synthetic local message for Orchard user two.',
    '2026-07-19 00:00:00+00'
  )
on conflict (id) do nothing;
