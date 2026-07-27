# Authentication and Route Protection

Orchard uses Supabase Auth through `@supabase/ssr`.

## Public pages

- `/`
- `/login`
- `/signup`
- `/icon.png`

Other application pages require an authenticated user. An unauthenticated page
request is redirected to `/login?redirect=<path>`.

After sign-in, the auth page validates the redirect as a local application path
and returns the user there. Root, login, signup, protocol-relative, and external
redirects fall back to `/home`.

## Browser and server clients

`frontend/lib/supabase.ts` creates the browser client for auth state and
authenticated Storage uploads.

`frontend/lib/supabase-server.ts` creates the cookie-aware server client used by
route handlers. The proxy refreshes auth cookies during protected page
requests.

## API authorization

The page proxy excludes `/api`; each route handler must authenticate explicitly
with `supabase.auth.getUser()` before reading or mutating user data.

Authentication alone is not enough. Queries also scope by the current user, and
Supabase row-level security provides the database boundary.

Typical responses:

- `401` when no authenticated user exists
- `404` when a user-scoped record is absent or not owned by the caller
- `400` for invalid request data

## Browser-test bypass

The Playwright development server enables a narrowly scoped page-auth bypass.
It applies only to `/home` and `/workspaces` requests that also carry an `e2e`
query parameter.

API routes are not covered by the bypass; browser fixtures intercept or mock
the relevant requests. Production does not enable this path.

## Key implementation

- `frontend/proxy.ts`
- `frontend/lib/supabase.ts`
- `frontend/lib/supabase-server.ts`
- `frontend/lib/auth-redirect.ts`
- `frontend/app/components/AuthPage.tsx`

## Verification

- `frontend/__tests__/proxy.test.ts`
- `frontend/__tests__/lib/auth-redirect.test.ts`
- authorization cases in route tests under `frontend/__tests__/app/`

## Related docs

- [Local setup](../development/setup.md)
- [Architecture](../architecture.md)
- [Workspaces](./workspaces.md)
