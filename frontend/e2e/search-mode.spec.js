const { test, expect } = require('@playwright/test');
const { mockChatRoute } = require('./helpers/chatMocks');
const { mockHomeDataRoutes } = require('./helpers/homeRouteMocks');

function createConversation({
  id,
  title,
  updatedAt = '2026-04-17T12:00:00.000Z',
  createdAt = '2026-04-17T11:59:00.000Z',
}) {
  return {
    id,
    title,
    mentor_id: null,
    updated_at: updatedAt,
    created_at: createdAt,
  };
}

function createMessage({
  id,
  role,
  content,
  createdAt,
  searchMetadata = null,
}) {
  return {
    id,
    role,
    content,
    created_at: createdAt,
    search_metadata: searchMetadata,
  };
}

function buildSearchMetadata(sourceCount = 10) {
  return {
    version: 2,
    mode: 'required',
    profile: 'official_priority',
    status: 'success',
    query: 'latest OpenAI pricing changes',
    providers: ['brave', 'exa'],
    sources: Array.from({ length: sourceCount }, (_, index) => ({
      id: index + 1,
      title: `Source ${index + 1}`,
      url: `https://example.com/source-${index + 1}`,
      domain: 'example.com',
      snippet: `Snippet ${index + 1}`,
      provider: index % 2 === 0 ? 'brave' : 'exa',
      sourceType: index % 2 === 0 ? 'official' : 'news',
      publishedAt: null,
    })),
  };
}

test('search mode sends explicit search requests and renders a scalable source tray', async ({ page }) => {
  const conversationId = 'conversation-search-mode';
  const userMessage = 'What changed with OpenAI pricing this week?';
  const assistantMessage = 'OpenAI updated pricing details [1] [2].';
  const searchMetadata = buildSearchMetadata(10);
  const state = await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
    createdConversations: [
      createConversation({
        id: conversationId,
        title: 'OpenAI Pricing Changes',
      }),
    ],
  });

  await mockChatRoute(page, async (body) => {
    expect(body.searchEnabled).toBe(true);

    state.messagesByConversationId[conversationId] = [
      createMessage({
        id: 'message-user-1',
        role: 'user',
        content: userMessage,
        createdAt: '2026-04-17T12:00:01.000Z',
      }),
      createMessage({
        id: 'message-assistant-1',
        role: 'assistant',
        content: assistantMessage,
        createdAt: '2026-04-17T12:00:02.000Z',
        searchMetadata,
      }),
    ];

    return {
      conversationId,
      conversationTitle: 'OpenAI Pricing Changes',
      userMessageId: 'message-user-1',
      assistantMessageId: 'message-assistant-1',
      message: assistantMessage,
      search: {
        mode: 'required',
        attempted: true,
        status: 'success',
        resultCount: searchMetadata.sources.length,
        warning: null,
        metadata: searchMetadata,
      },
    };
  });

  await page.goto('/home?e2e=search-mode');

  const searchToggle = page.getByRole('button', { name: 'Search mode off' });
  await searchToggle.click();
  await expect(page.getByRole('button', { name: 'Search mode on' })).toBeVisible();

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(userMessage);
  await composer.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/home/${conversationId}\\?e2e=search-mode$`));
  await expect(page.getByRole('button', { name: 'Sources 10' })).toBeVisible();

  await page.getByRole('button', { name: 'Sources 10' }).click();
  await expect(page.getByTestId('search-source-tab')).toHaveCount(10);
  await expect(page.getByText('Snippet 1')).toBeVisible();

  await page.getByTestId('search-source-tab').nth(7).click();
  await expect(page.getByText('Snippet 8')).toBeVisible();
});
