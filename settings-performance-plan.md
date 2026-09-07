# Settings Performance Plan

## Core problem

`/settings` currently does redundant authentication and profile work during
navigation, blocks the entire page behind client-side loading, and hydrates
application providers that settings does not use. The extra network requests
make the page feel slow and inconsistent, while origin delays can surface as a
Cloudflare 502 instead of a usable settings shell.

The target is predictable work and immediate warm navigation:

- Cold load: one local JWT verification plus one profile query.
- Navigation from `/home` to `/settings`: zero auth or profile requests after
  the viewer has already loaded.
- Settings renders immediately from shared viewer state.

```text
Cold entry
Proxy: getClaims() / refresh cookie
  -> protected layout: one profile query
  -> ViewerProvider

Warm navigation
Home -> prefetched Settings
  -> reuse ViewerProvider
  -> render immediately
```

## Target architecture

### 1. Keep the proxy cheap

Use `getClaims()` in `proxy.ts` for protected-page redirects. It verifies
asymmetrically signed JWTs with cached public keys instead of making the Auth
server request required by `getUser()`.

The proxy should refresh cookies and perform only an optimistic redirect. It
must not query profiles or become the sole authorization boundary. Do not use
cookie-backed `getSession()` data for authorization.

### 2. Share an authenticated route layout

Group protected pages without changing their URLs:

```text
app/
  layout.tsx

  (authenticated)/
    layout.tsx
    home/
      layout.tsx
      page.tsx
    settings/
      page.tsx
      SettingsClient.tsx
```

The authenticated layout loads the viewer and owns a persistent
`ViewerProvider`. The home layout owns chat-only providers. Because the shared
layout remains mounted between `/home` and `/settings`, viewer state survives
client navigation.

### 3. Centralize the server viewer loader

Create a server-only, request-deduplicated `getViewer()` data-access function.
It should:

1. Verify claims and redirect invalid sessions to login.
2. Query only the profile fields required by shared account UI.
3. Return a minimal serializable viewer.
4. Keep authorization adjacent to protected data access.

React `cache()` may deduplicate repeated calls within one server request. It is
not a cross-request authorization cache.

### 4. Initialize persistent viewer state

The authenticated layout should pass the server-loaded viewer into:

```tsx
<ViewerProvider initialViewer={viewer}>
  {children}
</ViewerProvider>
```

The sidebar and settings page consume this provider synchronously. Settings
must not launch a separate browser-side identity or profile request.

### 5. Prefetch settings navigation

Use a styled Next.js `<Link href="/settings" prefetch>` for the settings
control. If the link is hidden inside a closed panel, call
`router.prefetch('/settings')` while the browser is idle, when the panel opens,
or on pointer hover.

Prefetching should prepare the route payload without interrupting active chat
runs or remounting providers shared by the authenticated layout.

### 6. Remove the full-page loading gate

Normal `/home` to `/settings` navigation should render synchronously from
`ViewerProvider`. A hard load may wait for the single profile query on the
server and then send completed HTML.

If streaming is useful later, limit it to the account-dependent section. The
header, font selector, and static settings structure should remain available
when the profile service is slow or unavailable.

### 7. Keep chat runtime code out of settings

Move `ChatRunCoordinator`, `SidePanelProvider`, and other chat-only hydration
into the home layout. Settings should ship and hydrate only the controls and
providers it uses.

### 8. Update saves optimistically

When global instructions are saved:

1. Update `ViewerProvider` immediately.
2. Run the authorized server action or profile update.
3. Retain the new value on success.
4. Roll back and show a recoverable error on failure.

Returning to home or reopening settings should reuse the new provider value
without another profile query.

## Expected request budget

| Scenario | Current | Target |
| --- | ---: | ---: |
| Open settings from home | 2 Auth + 1 profile | 0 |
| Hard-load settings | 2 Auth + 1 profile | 1 JWT verification + 1 profile |
| Return to settings | Repeats requests | 0 |
| Settings JavaScript | Includes global chat providers | Settings controls only |

## Acceptance evidence

- Proxy tests prove claims verification, redirects, and refreshed-cookie
  propagation.
- Settings data tests prove one scoped profile query on a cold request.
- Browser tests record zero Auth-user requests and one profile read on a hard
  load.
- Navigation tests prove the settings link is prefetched and active persistent
  and temporary chat runs survive the transition.
- Failure tests prove profile timeouts and upstream errors preserve a usable
  settings shell without a full-page spinner.
- Production verification records route timing and origin health separately so
  a Cloudflare 502 can be distinguished from application rendering latency.
