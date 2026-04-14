const { test, expect } = require('@playwright/test');
const { mockChatRoute } = require('./helpers/chatMocks');
const { mockHomeDataRoutes } = require('./helpers/homeRouteMocks');

function createConversation({
  id,
  title,
  mentorId = null,
  updatedAt = '2026-04-12T12:00:00.000Z',
  createdAt = '2026-04-12T11:00:00.000Z',
}) {
  return {
    id,
    title,
    mentor_id: mentorId,
    updated_at: updatedAt,
    created_at: createdAt,
  };
}

function createMessage({
  id,
  role,
  content,
  createdAt,
}) {
  return {
    id,
    role,
    content,
    created_at: createdAt,
  };
}

test('hydrates a persistent conversation on direct /home/[conversationId] entry', async ({ page }) => {
  const conversationId = 'conversation-direct-route';
  const question = 'How did early delivery logistics work?';
  const answer = 'Early courier networks relied on dense local dispatch and phone-based coordination.';

  await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: conversationId,
        title: 'History of Food Delivery',
      }),
    ],
    messagesByConversationId: {
      [conversationId]: [
        createMessage({
          id: 'message-direct-user-1',
          role: 'user',
          content: question,
          createdAt: '2026-04-12T12:00:01.000Z',
        }),
        createMessage({
          id: 'message-direct-assistant-1',
          role: 'assistant',
          content: answer,
          createdAt: '2026-04-12T12:00:02.000Z',
        }),
      ],
    },
  });

  await page.goto(`/home/${conversationId}?e2e=home-routing-direct`);

  await expect(page).toHaveURL(new RegExp(`/home/${conversationId}\\?e2e=home-routing-direct$`));
  await expect(page.getByText(question)).toBeVisible();
  await expect(page.getByText(answer)).toBeVisible();
});

test('clicking a saved chat updates the URL and loads the persistent conversation', async ({ page }) => {
  const conversationId = 'conversation-sidebar-route';
  const title = 'History of Food Delivery';
  const answer = 'The first consumer delivery systems were constrained by dispatch coverage and route density.';

  await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: conversationId,
        title,
      }),
    ],
    messagesByConversationId: {
      [conversationId]: [
        createMessage({
          id: 'message-sidebar-assistant-1',
          role: 'assistant',
          content: answer,
          createdAt: '2026-04-12T12:10:00.000Z',
        }),
      ],
    },
  });

  await page.goto('/home?e2e=home-routing-click');
  await page.getByLabel('Toggle conversations').click();

  const sidePanel = page.locator('aside');
  await sidePanel.getByRole('button', { name: /^Keen$/ }).click();
  await sidePanel.getByRole('button', { name: new RegExp(title) }).click();

  await expect(page).toHaveURL(
    new RegExp(`/home/${conversationId}\\?e2e=home-routing-click$`)
  );
  await expect(page.getByText(answer)).toBeVisible();
});

test('the first draft send replaces /home with the new persistent conversation route', async ({ page }) => {
  const message = 'Walk me through how delivery marketplaces scaled.';
  const conversationId = 'conversation-promoted-from-draft';
  const answer = 'They scaled by matching dense demand clusters with increasingly efficient courier dispatch.';
  const title = 'Scaling Delivery Marketplaces';

  const state = await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
  });

  await mockChatRoute(page, async (body) => {
    expect(body.chatMode).toBe('persistent');
    expect(body.conversationId).toBeUndefined();
    expect(body.mentorId).toBeUndefined();
    expect(body.message).toBe(message);

    state.conversations.unshift(
      createConversation({
        id: conversationId,
        title,
        updatedAt: '2026-04-12T12:20:02.000Z',
        createdAt: '2026-04-12T12:20:01.000Z',
      })
    );
    state.messagesByConversationId[conversationId] = [
      createMessage({
        id: 'message-draft-user-1',
        role: 'user',
        content: message,
        createdAt: '2026-04-12T12:20:01.000Z',
      }),
      createMessage({
        id: 'message-draft-assistant-1',
        role: 'assistant',
        content: answer,
        createdAt: '2026-04-12T12:20:02.000Z',
      }),
    ];

    return {
      conversationId,
      conversationTitle: title,
      userMessageId: 'message-draft-user-1',
      assistantMessageId: 'message-draft-assistant-1',
      message: answer,
    };
  });

  await page.goto('/home?e2e=home-routing-draft');
  await page.getByLabel('Toggle conversations').click();

  const sidePanel = page.locator('aside');
  await sidePanel.getByLabel('New chat with Keen').click();
  await expect(page).toHaveURL(new RegExp('/home\\?e2e=home-routing-draft$'));

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(message);
  await composer.press('Enter');

  await expect(page).toHaveURL(
    new RegExp(`/home/${conversationId}\\?e2e=home-routing-draft$`)
  );
  await expect(page.getByText(answer)).toBeVisible();
});

test('temporary chats stay on /home when switching away from a persistent route', async ({ page }) => {
  const conversationId = 'conversation-to-temp-route';
  const answer = 'Courier batching got better as marketplaces improved geographic density.';

  await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: conversationId,
        title: 'Courier Density',
      }),
    ],
    messagesByConversationId: {
      [conversationId]: [
        createMessage({
          id: 'message-temp-route-assistant-1',
          role: 'assistant',
          content: answer,
          createdAt: '2026-04-12T12:30:00.000Z',
        }),
      ],
    },
  });

  await page.goto(`/home/${conversationId}?e2e=home-routing-temporary`);

  await expect(page.getByText(answer)).toBeVisible();
  await page.getByLabel('New temporary chat').click();

  await expect(page).toHaveURL(new RegExp('/home\\?e2e=home-routing-temporary$'));
  await expect(page.getByRole('heading', { name: 'Temporary chat' })).toBeVisible();
  await expect(page.getByText("This conversation won't be saved.")).toBeVisible();
});
