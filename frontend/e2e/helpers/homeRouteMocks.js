const DEFAULT_CHAT_MODELS = [
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'openai',
    providerLabel: 'OpenAI',
    iconKey: 'openai',
    description: 'Best OpenAI model for complex reasoning and coding.',
    badge: 'Max',
    available: true,
    isDefault: true,
    effort: {
      levels: ['low', 'medium', 'high', 'max'],
      defaultLevel: 'medium',
      supportsThinkingToggle: true,
      defaultThinkingEnabled: true,
    },
  },
];

const DEFAULT_VIEWER = {
  id: 'e2e-user-1',
  email: 'e2e@example.com',
  fullName: 'E2E User',
  globalInstructions: '',
};

function parseEqFilter(value) {
  if (!value || !value.startsWith('eq.')) {
    return null;
  }

  return decodeURIComponent(value.slice(3));
}

function parseInFilter(value) {
  if (!value || !value.startsWith('in.(') || !value.endsWith(')')) {
    return [];
  }

  return value
    .slice(4, -1)
    .split(',')
    .map((item) => decodeURIComponent(item.trim()))
    .filter(Boolean);
}

function fallbackTitleFromMessage(message) {
  const normalized = typeof message === 'string' ? message.trim() : '';
  return normalized.length > 0 ? normalized.slice(0, 60) : 'New chat';
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
    viewer: { ...DEFAULT_VIEWER },
    profileExists: true,
    mentors: [],
    workspaces: [],
    conversations: [],
    messagesByConversationId: {},
    attachmentsByMessageId: {},
    branchesByConversationId: {},
    threadsByConversationId: {},
    chatModels: DEFAULT_CHAT_MODELS,
    createdConversations: [],
    ...state,
  };

  await page.route('**/api/chat/models', async (route) => {
    await fulfillJson(route, { models: resolvedState.chatModels });
  });

  await page.route('**/api/mentors', async (route) => {
    await fulfillJson(route, resolvedState.mentors);
  });

  await page.route('**/api/workspaces', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const now = new Date().toISOString();
      const workspace = {
        id: `workspace-e2e-created-${resolvedState.workspaces.length + 1}`,
        name: body?.name || 'Workspace',
        description: body?.description ?? null,
        context: body?.context ?? null,
        icon: body?.icon ?? null,
        accent_color: body?.accent_color ?? null,
        created_at: now,
        updated_at: now,
      };
      resolvedState.workspaces.unshift(workspace);
      await fulfillJson(route, { workspace }, 201);
      return;
    }

    await fulfillJson(route, { workspaces: resolvedState.workspaces });
  });

  await page.route('**/api/workspaces/*', async (route) => {
    const url = new URL(route.request().url());
    const workspaceId = decodeURIComponent(url.pathname.split('/').pop() || '');
    const method = route.request().method();
    const workspace = resolvedState.workspaces.find((entry) => entry.id === workspaceId);

    if (!workspace) {
      await fulfillJson(route, { error: 'Workspace not found' }, 404);
      return;
    }

    if (method === 'PATCH') {
      const body = route.request().postDataJSON();
      Object.assign(workspace, {
        ...(Object.prototype.hasOwnProperty.call(body, 'name') ? { name: body.name } : {}),
        ...(Object.prototype.hasOwnProperty.call(body, 'description') ? { description: body.description } : {}),
        ...(Object.prototype.hasOwnProperty.call(body, 'context') ? { context: body.context } : {}),
        updated_at: new Date().toISOString(),
      });
      await fulfillJson(route, { workspace });
      return;
    }

    if (method === 'DELETE') {
      const conversationIds = resolvedState.conversations
        .filter((conversation) => conversation.workspace_id === workspaceId)
        .map((conversation) => conversation.id);

      resolvedState.workspaces = resolvedState.workspaces.filter(
        (entry) => entry.id !== workspaceId
      );
      resolvedState.conversations = resolvedState.conversations.filter(
        (conversation) => conversation.workspace_id !== workspaceId
      );

      for (const conversationId of conversationIds) {
        delete resolvedState.messagesByConversationId[conversationId];
        delete resolvedState.branchesByConversationId[conversationId];
        delete resolvedState.threadsByConversationId[conversationId];
      }

      await fulfillJson(route, {
        success: true,
        deleted: {
          workspace: 1,
          conversations: conversationIds.length,
        },
      });
      return;
    }

    await fulfillJson(route, { workspace });
  });

  await page.route('**/api/conversations', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const queuedConversation = resolvedState.createdConversations.shift();
      const now = new Date().toISOString();
      const conversation = queuedConversation || {
        id: `conversation-e2e-created-${resolvedState.conversations.length + 1}`,
        title: fallbackTitleFromMessage(body?.initialMessage),
        mentor_id: body?.mentorId ?? null,
        workspace_id: body?.workspaceId ?? null,
        created_at: now,
        updated_at: now,
      };

      resolvedState.conversations.unshift(conversation);
      await fulfillJson(route, {
        conversation: {
          id: conversation.id,
          title: conversation.title,
          mentorId: conversation.mentor_id ?? conversation.mentorId ?? null,
          workspaceId: conversation.workspace_id ?? conversation.workspaceId ?? null,
          createdAt: conversation.created_at ?? conversation.createdAt ?? now,
          updatedAt: conversation.updated_at ?? conversation.updatedAt ?? now,
        },
      }, 201);
      return;
    }

    if (method === 'DELETE') {
      const body = route.request().postDataJSON();
      const conversationId = body?.conversationId;
      resolvedState.conversations = resolvedState.conversations.filter(
        (conversation) => conversation.id !== conversationId
      );
      delete resolvedState.messagesByConversationId[conversationId];
      await fulfillJson(route, { ok: true });
      return;
    }

    await route.fallback();
  });

  await page.route('**/api/conversations/*/context', async (route) => {
    const method = route.request().method();
    if (method !== 'PATCH') {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    const conversationId = decodeURIComponent(parts[parts.length - 2] || '');
    const body = route.request().postDataJSON();
    const targetWorkspaceId = body?.workspaceId ?? null;
    const conversation = resolvedState.conversations.find((entry) => entry.id === conversationId);

    if (!conversation) {
      await fulfillJson(route, { error: 'Conversation not found' }, 404);
      return;
    }

    if (conversation.mentor_id) {
      await fulfillJson(route, { error: 'Mentor conversations cannot be moved yet' }, 400);
      return;
    }

    if (conversation.workspace_id === targetWorkspaceId) {
      await fulfillJson(route, { error: 'Conversation is already in that context' }, 409);
      return;
    }

    if (
      targetWorkspaceId &&
      !resolvedState.workspaces.some((workspace) => workspace.id === targetWorkspaceId)
    ) {
      await fulfillJson(route, { error: 'Workspace not found' }, 404);
      return;
    }

    conversation.workspace_id = targetWorkspaceId;
    conversation.mentor_id = null;
    conversation.updated_at = new Date().toISOString();

    await fulfillJson(route, {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        mentorId: conversation.mentor_id,
        workspaceId: conversation.workspace_id,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
      },
    });
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
    const method = route.request().method();

    if (method === 'PATCH' && viewer) {
      if (!resolvedState.profileExists) {
        await fulfillJson(
          route,
          {
            code: 'PGRST116',
            message: 'JSON object requested, multiple (or no) rows returned',
          },
          406
        );
        return;
      }

      const body = route.request().postDataJSON();
      viewer.globalInstructions = body?.global_instructions ?? '';
      await fulfillJson(route, {
        global_instructions: viewer.globalInstructions,
      });
      return;
    }

    await fulfillJson(
      route,
      viewer && resolvedState.profileExists
        ? {
            full_name: viewer.fullName,
            global_instructions: viewer.globalInstructions,
          }
        : null
    );
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

  await page.route('**/rest/v1/message_attachments*', async (route) => {
    const url = new URL(route.request().url());
    const messageIdFilter = parseEqFilter(url.searchParams.get('message_id'));
    const messageIdFilters = parseInFilter(url.searchParams.get('message_id'));
    const messageIds = messageIdFilter
      ? [messageIdFilter]
      : messageIdFilters.length > 0
        ? messageIdFilters
        : Object.values(resolvedState.messagesByConversationId)
          .flat()
          .map((message) => message.id);
    const attachments = messageIds.flatMap(
      (messageId) => resolvedState.attachmentsByMessageId[messageId] || []
    );

    await fulfillJson(route, attachments);
  });

  await page.route('**/rest/v1/conversation_branches*', async (route) => {
    const url = new URL(route.request().url());
    const conversationId = parseEqFilter(url.searchParams.get('conversation_id'));
    const branches = conversationId
      ? resolvedState.branchesByConversationId[conversationId] || []
      : [];

    await fulfillJson(route, branches);
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
