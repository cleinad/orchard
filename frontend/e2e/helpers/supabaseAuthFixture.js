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
      mentors: Array.isArray(options.mentors) ? options.mentors : [],
      workspaces: Array.isArray(options.workspaces) ? options.workspaces : [],
      conversations: Array.isArray(options.conversations)
        ? options.conversations
        : [],
      messagesByConversationId:
        options.messagesByConversationId
        && typeof options.messagesByConversationId === 'object'
          ? options.messagesByConversationId
          : {},
      branchesByConversationId:
        options.branchesByConversationId
        && typeof options.branchesByConversationId === 'object'
          ? options.branchesByConversationId
          : {},
      threadsByConversationId:
        options.threadsByConversationId
        && typeof options.threadsByConversationId === 'object'
          ? options.threadsByConversationId
          : {},
      attachments: Array.isArray(options.attachments)
        ? options.attachments
        : [],
      counters: {
        authUser: 0,
        profileReads: 0,
        profileWrites: 0,
        refreshes: 0,
        logouts: 0,
        mentorReads: 0,
        workspaceListReads: 0,
        workspaceDetailReads: 0,
        workspaceWrites: 0,
        workspaceDeletes: 0,
        conversationReads: 0,
        messageReads: 0,
        branchReads: 0,
        threadReads: 0,
        attachmentReads: 0,
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
          if (
            updates.messagesByConversationId
            && typeof updates.messagesByConversationId === 'object'
          ) {
            state.messagesByConversationId = updates.messagesByConversationId;
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

      if (request.method === 'GET' && requestUrl.pathname === '/rest/v1/mentors') {
        const requestedUserId = requestUrl.searchParams
          .get('user_id')
          ?.replace(/^eq\./, '');
        if (requestedUserId !== state.user.id) {
          sendJson(response, 403, { message: 'Mentor access denied' });
          return;
        }

        state.counters.mentorReads += 1;
        sendJson(response, 200, state.mentors);
        return;
      }

      if (
        request.method === 'PATCH'
        && requestUrl.pathname === '/rest/v1/workspaces'
      ) {
        const state = authenticate(request);
        if (!state) {
          sendJson(response, 401, { message: 'Invalid access token' });
          return;
        }

        const requestedUserId = requestUrl.searchParams
          .get('user_id')
          ?.replace(/^eq\./, '');
        const requestedWorkspaceId = requestUrl.searchParams
          .get('id')
          ?.replace(/^eq\./, '');
        if (
          requestedUserId !== state.user.id
          || typeof requestedWorkspaceId !== 'string'
        ) {
          sendJson(response, 403, { message: 'Workspace access denied' });
          return;
        }

        const workspace = state.workspaces.find(
          (candidate) => candidate.id === requestedWorkspaceId,
        );
        if (!workspace) {
          sendJson(response, 406, { message: 'Workspace does not exist' });
          return;
        }

        Object.assign(workspace, await readJson(request), {
          updated_at: new Date().toISOString(),
        });
        state.counters.workspaceWrites += 1;
        const singular = request.headers.accept?.includes(
          'application/vnd.pgrst.object',
        );
        sendJson(response, 200, singular ? workspace : [workspace]);
        return;
      }

      if (
        request.method === 'POST'
        && requestUrl.pathname === '/rest/v1/rpc/delete_workspace_cascade'
      ) {
        const state = authenticate(request);
        if (!state) {
          sendJson(response, 401, { message: 'Invalid access token' });
          return;
        }

        const { p_workspace_id: workspaceId } = await readJson(request);
        const workspaceIndex = state.workspaces.findIndex(
          (candidate) => candidate.id === workspaceId,
        );
        if (workspaceIndex < 0) {
          sendJson(response, 200, {
            workspace_deleted: false,
            conversation_count: 0,
            storage_paths: [],
          });
          return;
        }

        const conversationCount = state.conversations.filter(
          (conversation) => conversation.workspace_id === workspaceId,
        ).length;
        state.workspaces.splice(workspaceIndex, 1);
        state.conversations = state.conversations.filter(
          (conversation) => conversation.workspace_id !== workspaceId,
        );
        state.counters.workspaceDeletes += 1;
        sendJson(response, 200, {
          workspace_deleted: true,
          conversation_count: conversationCount,
          storage_paths: [],
        });
        return;
      }

      if (
        request.method === 'GET'
        && requestUrl.pathname === '/rest/v1/workspaces'
      ) {
        const requestedUserId = requestUrl.searchParams
          .get('user_id')
          ?.replace(/^eq\./, '');
        if (requestedUserId !== state.user.id) {
          sendJson(response, 403, { message: 'Workspace access denied' });
          return;
        }

        const requestedWorkspaceId = requestUrl.searchParams
          .get('id')
          ?.replace(/^eq\./, '');
        if (requestedWorkspaceId) {
          state.counters.workspaceDetailReads += 1;
          const workspace = state.workspaces.find(
            (candidate) => candidate.id === requestedWorkspaceId,
          );
          sendJson(response, 200, workspace || null);
          return;
        }

        state.counters.workspaceListReads += 1;
        sendJson(response, 200, state.workspaces);
        return;
      }

      if (
        request.method === 'GET'
        && requestUrl.pathname === '/rest/v1/conversations'
      ) {
        const requestedUserId = requestUrl.searchParams
          .get('user_id')
          ?.replace(/^eq\./, '');
        if (requestedUserId !== state.user.id) {
          sendJson(response, 403, { message: 'Conversation access denied' });
          return;
        }

        state.counters.conversationReads += 1;
        const requestedConversationId = requestUrl.searchParams
          .get('id')
          ?.replace(/^eq\./, '');
        if (requestedConversationId) {
          const conversation = state.conversations.find(
            (candidate) => candidate.id === requestedConversationId,
          );
          sendJson(response, 200, conversation || null);
          return;
        }
        sendJson(response, 200, state.conversations);
        return;
      }

      if (
        request.method === 'GET'
        && requestUrl.pathname === '/rest/v1/messages'
      ) {
        state.counters.messageReads += 1;
        const conversationId = requestUrl.searchParams
          .get('conversation_id')
          ?.replace(/^eq\./, '');
        const rows = Array.isArray(
          state.messagesByConversationId[conversationId],
        )
          ? state.messagesByConversationId[conversationId]
          : [];
        const range = request.headers.range?.match(/^(\d+)-(\d+)$/);
        const from = range ? Number(range[1]) : 0;
        const to = range ? Number(range[2]) : rows.length - 1;
        sendJson(response, 200, rows.slice(from, to + 1), {
          'content-range':
            rows.length === 0
              ? '*/0'
              : `${from}-${Math.min(to, rows.length - 1)}/${rows.length}`,
        });
        return;
      }

      if (
        request.method === 'GET'
        && requestUrl.pathname === '/rest/v1/conversation_branches'
      ) {
        state.counters.branchReads += 1;
        const conversationId = requestUrl.searchParams
          .get('conversation_id')
          ?.replace(/^eq\./, '');
        sendJson(
          response,
          200,
          state.branchesByConversationId[conversationId] ?? [],
        );
        return;
      }

      if (
        request.method === 'GET'
        && requestUrl.pathname === '/rest/v1/threads'
      ) {
        state.counters.threadReads += 1;
        const conversationId = requestUrl.searchParams
          .get('conversation_id')
          ?.replace(/^eq\./, '');
        sendJson(
          response,
          200,
          state.threadsByConversationId[conversationId] ?? [],
        );
        return;
      }

      if (
        request.method === 'GET'
        && requestUrl.pathname === '/rest/v1/message_attachments'
      ) {
        state.counters.attachmentReads += 1;
        const requestedIds = requestUrl.searchParams
          .get('message_id')
          ?.replace(/^in\.\(/, '')
          .replace(/\)$/, '')
          .split(',')
          .map((id) => decodeURIComponent(id));
        const requestedIdSet = new Set(requestedIds ?? []);
        sendJson(
          response,
          200,
          state.attachments.filter((attachment) =>
            requestedIdSet.has(attachment.message_id)
          ),
        );
        return;
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
