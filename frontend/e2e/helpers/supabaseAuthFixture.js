const http = require('node:http');

const E2E_ACCESS_TOKEN = 'orchard-e2e-access-token';
const E2E_USER = {
  id: 'e2e-user-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e@example.com',
  app_metadata: {},
  user_metadata: {
    full_name: 'E2E User',
  },
  identities: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function getFixtureConfig() {
  const host = process.env.PLAYWRIGHT_HOST || '127.0.0.1';
  const port = Number(process.env.PLAYWRIGHT_SUPABASE_AUTH_PORT || 54329);

  return {
    host,
    port,
    url: `http://${host}:${port}`,
  };
}

function createAuthenticatedCookie() {
  const { url } = getFixtureConfig();
  const hostname = new URL(url).hostname;
  const storageKey = `sb-${hostname.split('.')[0]}-auth-token`;
  const session = {
    access_token: E2E_ACCESS_TOKEN,
    refresh_token: 'orchard-e2e-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: E2E_USER,
  };
  const encodedSession = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');

  return {
    name: storageKey,
    value: `base64-${encodedSession}`,
    domain: hostname,
    path: '/',
    sameSite: 'Lax',
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(body));
}

function startServer() {
  const { host, port } = getFixtureConfig();
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/auth/v1/user') {
      if (request.headers.authorization === `Bearer ${E2E_ACCESS_TOKEN}`) {
        sendJson(response, 200, E2E_USER);
      } else {
        sendJson(response, 401, {
          code: 401,
          message: 'Invalid E2E access token',
        });
      }
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  });

  server.listen(port, host, () => {
    process.stdout.write(`E2E Supabase Auth fixture listening on ${host}:${port}\n`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createAuthenticatedCookie,
};
