# Auth And Route Protection

## Overview

Keen uses Supabase auth with `@supabase/ssr`.

The important split is:

- page protection happens in `frontend/proxy.ts`
- API protection happens inside each route handler
- login and signup UI live on `frontend/app/login/page.tsx`

This is the canonical doc for how route protection currently works.

## Public vs Protected Pages

### Public pages

- `/`
- `/login`

The proxy also treats `/signup` as public, but the current app does not ship a separate `/signup` page. Signup is handled as a mode on `/login`.

### Protected pages

Every other non-API app page is protected by `frontend/proxy.ts`.

That includes:

- `/home`
- `/home/[conversationId]`
- `/memory`
- `/mentors`
- `/settings`
- future app routes unless they are explicitly made public

### Paths excluded from proxy auth

The proxy matcher intentionally excludes:

- `/api`
- `/_next/static`
- `/_next/image`
- `/favicon.ico`
- `/robots.txt`
- `/sitemap.xml`

Those paths are not page navigations and should not be handled by the page-auth redirect layer.

## Request Flow

### 1. Browser auth client

`frontend/lib/supabase.ts` creates the browser Supabase client with `createBrowserClient()`.

The app uses cookie-backed auth so the server can read the same session that the browser uses.

### 2. Protected page request

When the browser requests a protected page:

1. `frontend/proxy.ts` runs first
2. it reads the Supabase session from cookies using `createServerClient()`
3. if no signed-in user exists, it redirects to `/login?redirect=<original-path-and-query>`
4. if a user exists, the request continues

This means page protection happens before the protected UI renders.

### 3. Login redirect handling

`frontend/app/login/page.tsx` reads the `redirect` query param on the client and sanitizes it before use.

Rules:

- invalid redirect values fall back to `/home`
- redirects back to `/` are ignored and fall back to `/home`
- redirect loops back into `/login` or `/signup` are ignored and fall back to `/home`

After a successful sign-in, or a sign-up that returns an active session, the page redirects to that safe target.

## API Auth

API routes are not protected by the page proxy.

That is intentional. Route handlers must still verify auth on their own because:

- API routes can be called directly without visiting a page first
- page protection should not be the only security boundary
- server handlers need access to the authenticated user id for RLS-scoped queries

The standard pattern is:

1. call `createSupabaseServerClient()`
2. call `supabase.auth.getUser()`
3. return `401 Unauthorized` when no signed-in user exists

Examples:

- `frontend/app/api/chat/models/route.ts`
- `frontend/app/api/memory/items/route.ts`
- `frontend/app/api/tts/route.ts`

`frontend/app/api/memory/route.ts` is a deprecated endpoint that returns `410 Deprecated` and does not participate in the normal auth flow.

## Client Components And Auth

Protected page components should not be the primary auth gate.

The preferred model is:

- proxy decides whether the user may enter the page
- page components load user-scoped data after entry
- shared hooks such as `useViewerIdentity()` are for data display, not route protection

This avoids the old pattern where a page briefly rendered and only redirected after client hydration.

## E2E Bypass

Playwright currently uses a focused bypass for deterministic home-route fixture tests.

The bypass is active only when all of the following are true:

- the dev server env includes `KEEN_E2E_BYPASS_AUTH=1`
- the request path starts with `/home`
- the URL includes an `e2e` query param

This bypass exists only to support fixture-driven browser tests on `/home` routes, including routed home variants when needed.

It does not make the rest of the app public, and it should not be treated as the normal auth path.

## Automated Coverage

The auth and route-protection contract now has focused Vitest coverage.

### Covered files

- `frontend/__tests__/proxy.test.ts`
- `frontend/__tests__/app/tts-route.test.ts`
- `frontend/__tests__/lib/auth-redirect.test.ts`

### What those tests verify

- public pages stay public without consulting Supabase
- protected pages redirect unauthenticated users to `/login`
- protected-page redirects preserve the original path and query string
- the `/home`-prefixed `?e2e=...` bypass only applies under the intended test conditions
- routed `/home/[conversationId]?e2e=...` requests use the same guarded bypass path as `/home?e2e=...`
- `getSafeRedirectPath()` rejects unsafe or looping redirect targets
- `POST /api/tts` returns `401` when unauthenticated
- `POST /api/tts` still validates key and payload behavior after auth succeeds

### Focused command

From `frontend/`:

```bash
npm test -- __tests__/lib/auth-redirect.test.ts __tests__/proxy.test.ts __tests__/app/tts-route.test.ts
```

This is the quickest canary for changes to:

- `frontend/proxy.ts`
- `frontend/app/login/page.tsx`
- `frontend/lib/auth-redirect.ts`
- `frontend/app/api/tts/route.ts`

## Developer Rules

When adding or changing routes:

1. New app pages are protected by default under the current proxy matcher.
2. If a page should be public, add it explicitly to `isPublicPage()` in `frontend/proxy.ts`.
3. Do not rely on `router.replace('/login')` inside client pages as the main auth boundary.
4. New user-scoped API routes must authenticate inside the handler even if they are only called from protected pages.
5. If a test needs unauthenticated access to a protected page, treat that as a special-case test harness decision, not product behavior.

## Relevant Files

| File | Role |
|------|------|
| `frontend/proxy.ts` | Page-level auth gate for public vs protected app routes |
| `frontend/lib/supabase.ts` | Browser Supabase client |
| `frontend/lib/supabase-server.ts` | Server Supabase client for route handlers and server code |
| `frontend/lib/auth-redirect.ts` | Safe post-login redirect sanitization |
| `frontend/app/login/page.tsx` | Login and signup UI, safe post-login redirect handling |
| `frontend/app/api/chat/models/route.ts` | Example authenticated API route |
| `frontend/app/api/tts/route.ts` | Authenticated TTS route |
