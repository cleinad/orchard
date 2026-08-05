const http = require('node:http');
const {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} = require('node:crypto');

const DEFAULT_USER = {
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

async function fixtureRequest(path, options = {}) {
  const { url } = getFixtureConfig();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || `Fixture request failed with ${response.status}`);
  }

  return body;
}

async function createAuthenticatedCookie(options = {}) {
  return fixtureRequest('/__e2e/session', {
    method: 'POST',
    body: JSON.stringify(options),
  }).then(({ cookie }) => cookie);
}

function getFixtureState(userId) {
  return fixtureRequest(`/__e2e/session/${encodeURIComponent(userId)}`);
}

function updateFixtureState(userId, updates) {
  return fixtureRequest(`/__e2e/session/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function createUser(options) {
  const id = options.userId || `e2e-user-${randomUUID()}`;
  const email = options.email || DEFAULT_USER.email;
  const fullName = options.fullName || DEFAULT_USER.user_metadata.full_name;

  return {
    ...DEFAULT_USER,
    id,
    email,
    user_metadata: {
      full_name: fullName,
    },
  };
}

function startServer() {
  const { host, port, url: fixtureUrl } = getFixtureConfig();
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const keyId = createHash('sha256')
    .update(`${publicJwk.n}.${publicJwk.e}`)
    .digest('base64url')
    .slice(0, 16);
  const sessions = new Map();

  function mintAccessToken(state, expiresIn = 3600) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', kid: keyId, typ: 'JWT' }),
      'utf8',
    ).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({
        iss: `${fixtureUrl}/auth/v1`,
        sub: state.user.id,
        aud: 'authenticated',
        exp: now + expiresIn,
        iat: now,
        role: 'authenticated',
        email: state.user.email,
        aal: 'aal1',
        session_id: state.sessionId,
      }),
      'utf8',
    ).toString('base64url');
    const signingInput = `${header}.${claims}`;
    const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey);

    return `${signingInput}.${signature.toString('base64url')}`;
  }

  function createSession(options) {
    const user = createUser(options);
    const expiresIn =
      typeof options.expiresIn === 'number' ? options.expiresIn : 3600;
    const state = {
      user,
      sessionId: randomUUID(),
      refreshToken: `orchard-e2e-refresh-${randomUUID()}`,
      profile: options.profileExists === false
        ? null
        : {
            id: user.id,
            full_name: options.fullName || user.user_metadata.full_name,
            global_instructions: options.globalInstructions || '',
          },
      profileReadDelayMs: options.profileReadDelayMs || 0,
      profileReadFailures: options.profileReadFailures || 0,
      profileWriteFailures: options.profileWriteFailures || 0,
      logoutFailures: options.logoutFailures || 0,
      counters: {
        authUser: 0,
        profileReads: 0,
        profileWrites: 0,
        refreshes: 0,
        logouts: 0,
      },
    };
    state.accessToken = mintAccessToken(state, expiresIn);
    sessions.set(user.id, state);

    const hostname = new URL(fixtureUrl).hostname;
    const storageKey = `sb-${hostname.split('.')[0]}-auth-token`;
    const session = {
      access_token: state.accessToken,
      refresh_token: state.refreshToken,
      expires_in: expiresIn,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      token_type: 'bearer',
      user,
    };
    const encodedSession = Buffer.from(JSON.stringify(session), 'utf8').toString(
      'base64url',
    );

    return {
      state,
      cookie: {
        name: storageKey,
        value: `base64-${encodedSession}`,
        domain: hostname,
        path: '/',
        sameSite: 'Lax',
      },
    };
  }

  function publicState(state) {
    return {
      userId: state.user.id,
      user: state.user,
      profile: state.profile,
      counters: state.counters,
    };
  }

  function authenticate(request) {
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    if (!token) return null;

    const segments = token.split('.');
    if (segments.length !== 3) return null;
    const signatureValid = verify(
      'RSA-SHA256',
      Buffer.from(`${segments[0]}.${segments[1]}`),
      publicKey,
      Buffer.from(segments[2], 'base64url'),
    );
    if (!signatureValid) return null;

    try {
      const claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString());
      const state = sessions.get(claims.sub);
      return state?.sessionId === claims.session_id ? state : null;
    } catch {
      return null;
    }
  }

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url || '/',
      `http://${request.headers.host}`,
    );

    try {
      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/auth/v1/.well-known/jwks.json'
      ) {
        sendJson(response, 200, {
          keys: [
            {
              ...publicJwk,
              alg: 'RS256',
              kid: keyId,
              use: 'sig',
            },
          ],
        });
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/__e2e/session') {
        const options = await readJson(request);
        const { state, cookie } = createSession(options);
        sendJson(response, 201, {
          userId: state.user.id,
          cookie,
        });
        return;
      }

      const sessionControlMatch = requestUrl.pathname.match(
        /^\/__e2e\/session\/(.+)$/,
      );
      if (sessionControlMatch) {
        const state = sessions.get(decodeURIComponent(sessionControlMatch[1]));
        if (!state) {
          sendJson(response, 404, { error: 'Unknown E2E session' });
          return;
        }

        if (request.method === 'GET') {
          sendJson(response, 200, publicState(state));
          return;
        }

        if (request.method === 'PATCH') {
          const updates = await readJson(request);
          for (const key of [
            'profileReadDelayMs',
            'profileReadFailures',
            'profileWriteFailures',
            'logoutFailures',
          ]) {
            if (typeof updates[key] === 'number') state[key] = updates[key];
          }
          if (updates.profileExists === false) state.profile = null;
          if (updates.profileExists === true && !state.profile) {
            state.profile = {
              id: state.user.id,
              full_name: state.user.user_metadata.full_name,
              global_instructions: updates.globalInstructions || '',
            };
          }
          sendJson(response, 200, publicState(state));
          return;
        }
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/auth/v1/token' &&
        requestUrl.searchParams.get('grant_type') === 'refresh_token'
      ) {
        const { refresh_token: refreshToken } = await readJson(request);
        const state = [...sessions.values()].find(
          (candidate) => candidate.refreshToken === refreshToken,
        );
        if (!state) {
          sendJson(response, 401, { message: 'Invalid refresh token' });
          return;
        }

        state.counters.refreshes += 1;
        state.accessToken = mintAccessToken(state);
        sendJson(response, 200, {
          access_token: state.accessToken,
          refresh_token: state.refreshToken,
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: state.user,
        });
        return;
      }

      const state = authenticate(request);
      if (!state) {
        sendJson(response, 401, {
          code: 401,
          message: 'Invalid E2E access token',
        });
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/auth/v1/user') {
        state.counters.authUser += 1;
        sendJson(response, 200, state.user);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/auth/v1/logout') {
        state.counters.logouts += 1;
        if (state.logoutFailures > 0) {
          state.logoutFailures -= 1;
          sendJson(response, 500, { message: 'Injected logout failure' });
          return;
        }
        response.writeHead(204);
        response.end();
        return;
      }

      if (requestUrl.pathname === '/rest/v1/profiles') {
        const requestedId = requestUrl.searchParams
          .get('id')
          ?.replace(/^eq\./, '');
        if (requestedId !== state.user.id) {
          sendJson(response, 403, { message: 'Profile access denied' });
          return;
        }

        if (request.method === 'GET') {
          state.counters.profileReads += 1;
          if (state.profileReadDelayMs > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, state.profileReadDelayMs),
            );
          }
          if (state.profileReadFailures > 0) {
            state.profileReadFailures -= 1;
            sendJson(response, 500, { message: 'Injected profile read failure' });
            return;
          }

          sendJson(response, 200, state.profile ? [state.profile] : [], {
            'content-range': state.profile ? '0-0/1' : '*/0',
          });
          return;
        }

        if (request.method === 'PATCH') {
          state.counters.profileWrites += 1;
          if (state.profileWriteFailures > 0) {
            state.profileWriteFailures -= 1;
            sendJson(response, 500, { message: 'Injected profile write failure' });
            return;
          }
          if (!state.profile) {
            sendJson(response, 406, { message: 'Profile does not exist' });
            return;
          }

          const updates = await readJson(request);
          if (typeof updates.global_instructions === 'string') {
            state.profile.global_instructions = updates.global_instructions;
          }
          const singular = request.headers.accept?.includes(
            'application/vnd.pgrst.object',
          );
          sendJson(response, 200, singular ? state.profile : [state.profile]);
          return;
        }
      }

      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Fixture failure',
      });
    }
  });

  server.listen(port, host, () => {
    process.stdout.write(
      `E2E Supabase Auth fixture listening on ${host}:${port}\n`,
    );
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createAuthenticatedCookie,
  getFixtureState,
  updateFixtureState,
};
