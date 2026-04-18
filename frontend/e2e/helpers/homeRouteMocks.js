const DEFAULT_CHAT_MODELS = [
  {
    id: 'gpt-5.4',
    label: 'GPT 5.4',
    provider: 'openai',
    available: true,
    isDefault: true,
  },
];

const DEFAULT_VIEWER = {
  id: 'e2e-user-1',
  email: 'e2e@example.com',
  fullName: 'E2E User',
};

function parseEqFilter(value) {
  if (!value || !value.startsWith('eq.')) {
    return null;
  }

  return decodeURIComponent(value.slice(3));
}

async function fulfillJson(route, json, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(json),
  });
}

async function mockHomeDataRoutes(page, state) {
  const resolvedState = {
    viewer: DEFAULT_VIEWER,
    mentors: [],
    conversations: [],
    messagesByConversationId: {},
    threadsByConversationId: {},
    chatModels: DEFAULT_CHAT_MODELS,
    ...state,
  };

  await page.route('**/api/chat/models', async (route) => {
    await fulfillJson(route, { models: resolvedState.chatModels });
  });

  await page.route('**/api/mentors', async (route) => {
    await fulfillJson(route, resolvedState.mentors);
  });

  await page.route('**/auth/v1/user*', async (route) => {
    const viewer = resolvedState.viewer;

    if (!viewer) {
      await fulfillJson(route, { message: 'Missing session' }, 401);
      return;
    }

    await fulfillJson(route, {
      id: viewer.id,
      email: viewer.email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2026-04-12T00:00:00.000Z',
    });
  });

  await page.route('**/rest/v1/profiles*', async (route) => {
    const viewer = resolvedState.viewer;

    await fulfillJson(route, viewer ? { full_name: viewer.fullName } : null);
  });

  await page.route('**/rest/v1/conversations*', async (route) => {
    const url = new URL(route.request().url());
    const conversationId = parseEqFilter(url.searchParams.get('id'));

    if (conversationId) {
      const conversation =
        resolvedState.conversations.find((entry) => entry.id === conversationId) || null;

      await fulfillJson(
        route,
        conversation || { message: 'Conversation not found' },
        conversation ? 200 : 404
      );
      return;
    }

    await fulfillJson(route, resolvedState.conversations);
  });

  await page.route('**/rest/v1/messages*', async (route) => {
    const url = new URL(route.request().url());
    const conversationId = parseEqFilter(url.searchParams.get('conversation_id'));
    const select = url.searchParams.get('select') || '';
    const messages = conversationId
      ? resolvedState.messagesByConversationId[conversationId] || []
      : [];

    if (typeof resolvedState.onMessagesRequest === 'function') {
      const handled = await resolvedState.onMessagesRequest({
        route,
        url,
        conversationId,
        select,
        messages,
        fulfillJson,
      });

      if (handled) {
        return;
      }
    }

    if (select === 'content') {
      const latestMessage = messages[messages.length - 1] || null;
      await fulfillJson(route, latestMessage ? { content: latestMessage.content } : null);
      return;
    }

    await fulfillJson(route, messages);
  });

  await page.route('**/rest/v1/threads*', async (route) => {
    const url = new URL(route.request().url());
    const conversationId = parseEqFilter(url.searchParams.get('conversation_id'));
    const threads = conversationId
      ? resolvedState.threadsByConversationId[conversationId] || []
      : [];

    await fulfillJson(route, threads);
  });

  return resolvedState;
}

module.exports = {
  DEFAULT_CHAT_MODELS,
  DEFAULT_VIEWER,
  mockHomeDataRoutes,
};
