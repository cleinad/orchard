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

async function selectSearchMode(page, label) {
  await page.getByRole('button', { name: /^Search mode / }).click();
  await page.getByRole('menuitemradio', { name: label }).click();
}

async function ensureConversationsOpen(page) {
  const rail = page.locator('nav[aria-hidden]').first();
  const sidePanel = page.locator('[role="region"][aria-label="Conversations and sections"]').first();

  if ((await rail.getAttribute('aria-hidden')) !== 'true') {
    await page.getByRole('button', { name: 'Open conversations' }).first().click();
    await expect(rail).toHaveAttribute('aria-hidden', 'true');
  }

  return sidePanel;
}

test('default composer sends auto search mode', async ({ page }) => {
  const conversationId = 'conversation-search-auto';
  const userMessage = 'Help me brainstorm names';
  const state = await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
    createdConversations: [
      createConversation({
        id: conversationId,
        title: 'Name Brainstorm',
      }),
    ],
  });

  await mockChatRoute(page, async (body) => {
    expect(body.searchMode).toBe('auto');

    state.messagesByConversationId[conversationId] = [
      createMessage({
        id: 'message-user-auto',
        role: 'user',
        content: userMessage,
        createdAt: '2026-04-17T12:00:01.000Z',
      }),
      createMessage({
        id: 'message-assistant-auto',
        role: 'assistant',
        content: 'Here are a few name directions.',
        createdAt: '2026-04-17T12:00:02.000Z',
      }),
    ];

    return {
      conversationId,
      conversationTitle: 'Name Brainstorm',
      userMessageId: 'message-user-auto',
      assistantMessageId: 'message-assistant-auto',
      message: 'Here are a few name directions.',
      search: {
        mode: 'auto',
        attempted: false,
        status: 'not_attempted',
        resultCount: 0,
        warning: null,
        metadata: null,
        decision: {
          shouldSearch: false,
          reason: 'Stable brainstorming request.',
          confidence: 0.9,
          freshnessRisk: 'none',
        },
        skippedReason: 'auto_decision',
      },
    };
  });

  await page.goto('/home?e2e=search-mode-auto');
  await expect(page.getByRole('button', { name: 'Search mode auto' })).toBeVisible();

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(userMessage);
  await composer.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/home/${conversationId}\\?e2e=search-mode-auto$`));
});

test('always search sends required search mode and renders a scalable source tray', async ({ page }) => {
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
    expect(body.searchMode).toBe('required');

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

  await selectSearchMode(page, 'Always search');
  await expect(page.getByRole('button', { name: 'Search mode always search' })).toBeVisible();

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(userMessage);
  await composer.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/home/${conversationId}\\?e2e=search-mode$`));
  const inlineCitations = page.getByTestId('search-citation');
  await expect(inlineCitations).toHaveCount(2);
  await expect(inlineCitations.nth(0)).toHaveText('1');
  await expect(inlineCitations.nth(1)).toHaveText('2');
  await expect(inlineCitations.nth(0).locator('img')).toHaveCount(0);
  await expect(inlineCitations.nth(0)).toHaveAttribute('data-selection-exclude', 'true');
  await expect(inlineCitations.nth(0)).toHaveCSS('user-select', 'none');
  await expect(page.getByRole('button', { name: 'Sources 10' })).toBeVisible();

  await page.getByRole('button', { name: 'Sources 10' }).click();
  await expect(page.getByTestId('search-source-tab')).toHaveCount(10);
  await expect(page.getByText('Snippet 1')).toBeHidden();

  const eighthSource = page.getByTestId('search-source-tab').nth(7);
  await eighthSource.hover();
  await expect(page.getByText('Snippet 8')).toBeHidden();

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    eighthSource.click(),
  ]);
  await expect(popup).toHaveURL('https://example.com/source-8');
  await popup.close();
});

test('off mode sends off and search mode is restored per composer session', async ({ page }) => {
  const conversations = [
    createConversation({
      id: 'conversation-search-a',
      title: 'First Search Chat',
      updatedAt: '2026-04-17T12:10:00.000Z',
    }),
    createConversation({
      id: 'conversation-search-b',
      title: 'Second Search Chat',
      updatedAt: '2026-04-17T12:09:00.000Z',
    }),
  ];

  await mockHomeDataRoutes(page, {
    conversations,
    messagesByConversationId: {
      'conversation-search-a': [
        createMessage({
          id: 'message-a',
          role: 'assistant',
          content: 'First chat ready.',
          createdAt: '2026-04-17T12:00:00.000Z',
        }),
      ],
      'conversation-search-b': [
        createMessage({
          id: 'message-b',
          role: 'assistant',
          content: 'Second chat ready.',
          createdAt: '2026-04-17T12:00:00.000Z',
        }),
      ],
    },
  });

  await mockChatRoute(page, async (body) => {
    expect(body.searchMode).toBe('off');
    return {
      conversationId: 'conversation-search-b',
      conversationTitle: 'Second Search Chat',
      message: 'Answered without search.',
      search: {
        mode: 'off',
        attempted: false,
        status: 'not_attempted',
        resultCount: 0,
        warning: null,
        metadata: null,
        skippedReason: 'mode_off',
      },
    };
  });

  await page.goto('/home/conversation-search-a?e2e=search-mode-session');
  await expect(page.getByText('First chat ready.')).toBeVisible();
  await selectSearchMode(page, 'Always search');
  await expect(page.getByRole('button', { name: 'Search mode always search' })).toBeVisible();

  const sidePanel = await ensureConversationsOpen(page);
  await sidePanel.getByRole('button', { name: /Second Search Chat/ }).click();
  await expect(page.getByText('Second chat ready.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search mode auto' })).toBeVisible();
  await selectSearchMode(page, 'Off');
  await expect(page.getByRole('button', { name: 'Search mode off' })).toBeVisible();

  const reopenedSidePanel = await ensureConversationsOpen(page);
  await reopenedSidePanel.getByRole('button', { name: /First Search Chat/ }).click();
  await expect(page.getByRole('button', { name: 'Search mode always search' })).toBeVisible();

  const reopenedSidePanelAgain = await ensureConversationsOpen(page);
  await reopenedSidePanelAgain.getByRole('button', { name: /Second Search Chat/ }).click();
  await expect(page.getByRole('button', { name: 'Search mode off' })).toBeVisible();

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill('Answer from memory');
  await composer.press('Enter');
});
