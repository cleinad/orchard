# Production Deployment

Orchard runs as one stateless Next.js container on `theserver`. The container
listens only on the host loopback interface, and the existing Cloudflare Tunnel
publishes it at `https://orchard.study`.

## Production shape

```text
Browser
  -> https://orchard.study
  -> Cloudflare Tunnel on theserver
  -> http://127.0.0.1:3000
  -> orchard-app container
  -> the configured hosted Supabase project
  -> configured model and search providers
```

`https://www.orchard.study` reaches the same container and redirects to the
canonical apex hostname. Supabase is deployed and operated separately.

## Prerequisites

- The repository is checked out at `/home/gang-chen/Documents/orchard`.
- Docker and Docker Compose are running.
- `frontend/.env.local` exists with mode `600` and remains untracked.
- `NEXT_PUBLIC_SUPABASE_URL` is the active hosted Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` contains the public anon or publishable key,
  never a service-role key.
- At least one model-provider key is set.

The two `NEXT_PUBLIC_SUPABASE_*` variables are embedded in the browser bundle
during `next build`. Rebuild the image whenever either value changes. Provider
keys and `SUPABASE_SERVICE_ROLE_KEY` are runtime-only secrets and must not be
added as Docker build arguments. The build preflight rejects a JWT public key
whose role is not `anon`, an opaque `sb_secret_` key, a public key equal to the
configured service-role key, and non-HTTPS remote Supabase URLs.

`api.orchard.study` is reserved as the future vendor-neutral Supabase hostname.
Moving to it requires enabling the Supabase custom-domain feature, updating
`NEXT_PUBLIC_SUPABASE_URL`, and rebuilding the application image.

## Deploy

From the repository root:

```bash
docker compose --env-file frontend/.env.local config --quiet
docker compose --env-file frontend/.env.local up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

Expected health response:

```json
{"status":"ok"}
```

The Compose service binds `127.0.0.1:3000`; do not publish port `3000` on a
public interface. Cloudflare Tunnel is the only public application entrypoint.

## Redeploy

Update the checkout without rewriting local history, then rebuild:

```bash
git pull --ff-only
docker compose --env-file frontend/.env.local up -d --build
curl --fail http://127.0.0.1:3000/api/health
```

Changing any `NEXT_PUBLIC_*` variable requires this rebuild. Runtime-only
environment changes also recreate the container through the same command.

## Operate and recover

Inspect status and logs:

```bash
docker compose ps
docker compose logs --tail=200 app
docker compose logs --follow app
```

Restart without rebuilding:

```bash
docker compose restart app
```

To roll back application code, check out a known-good commit and run the deploy
commands again. Orchard has no application-local durable volume; database,
authentication, and Storage recovery belong to the Supabase deployment.

## Cloudflare Tunnel

The user-level `cloudflared` service on `theserver` owns the ingress rules.
Both application hostnames route to the loopback-bound container:

```yaml
- hostname: orchard.study
  service: http://127.0.0.1:3000
- hostname: www.orchard.study
  service: http://127.0.0.1:3000
```

Keep both rules above the required final catch-all rule. Validate the
configuration before restarting the tunnel:

```bash
cloudflared tunnel ingress validate
systemctl --user restart cloudflared
systemctl --user status cloudflared
```
