const { test, expect } = require('@playwright/test');
const { deferred, mockChatRoute } = require('./helpers/chatMocks');
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

async function ensureConversationsOpen(page) {
  const rail = page.locator('nav[aria-hidden]').first();
  const sidePanel = page.locator('[role="region"][aria-label="Conversations and sections"]').first();

  if ((await rail.getAttribute('aria-hidden')) !== 'true') {
    await page.getByRole('button', { name: 'Open conversations' }).first().click();
    await expect(rail).toHaveAttribute('aria-hidden', 'true');
  }

  return sidePanel;
}

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

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
  await expect(page.getByText(answer)).toBeVisible({ timeout: 10000 });
});

test('direct /home/[conversationId] entry shows a loading placeholder instead of the empty hero while history hydrates', async ({ page }) => {
  const conversationId = 'conversation-direct-route-delayed';
  const question = 'How did route-based marketplaces smooth delivery peaks?';
  const answer = 'They smoothed peaks by shaping courier supply around dense zones and dispatch windows.';
  const messagesDeferred = deferred();

  await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: conversationId,
        title: 'Delayed Hydration Conversation',
      }),
    ],
    messagesByConversationId: {
      [conversationId]: [
        createMessage({
          id: 'message-delayed-user-1',
          role: 'user',
          content: question,
          createdAt: '2026-04-12T12:00:01.000Z',
        }),
        createMessage({
          id: 'message-delayed-assistant-1',
          role: 'assistant',
          content: answer,
          createdAt: '2026-04-12T12:00:02.000Z',
        }),
      ],
    },
    onMessagesRequest: async ({
      route,
      conversationId: requestedConversationId,
      select,
      messages,
      fulfillJson,
    }) => {
      if (requestedConversationId !== conversationId || select === 'content') {
        return false;
      }

      await messagesDeferred.promise;
      await fulfillJson(route, messages);
      return true;
    },
  });

  await page.goto(`/home/${conversationId}?e2e=home-routing-direct-delayed`);

  await expect(page.getByLabel('Loading conversation')).toBeVisible();
  await expect(page.getByText('What are we exploring today?')).toHaveCount(0);

  messagesDeferred.resolve();

  await expect(page.getByText(question)).toBeVisible();
  await expect(page.getByText(answer)).toBeVisible({ timeout: 10000 });
  await expect(page.getByLabel('Loading conversation')).toHaveCount(0);
});

test('direct /home/[conversationId] entry shows a load error instead of the empty hero when hydration fails', async ({ page }) => {
  const conversationId = 'conversation-missing-route';

  await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
  });

  await page.goto(`/home/${conversationId}?e2e=home-routing-missing`);

  await expect(page.getByText('Could not load this conversation')).toBeVisible();
  await expect(page.getByText('Conversation not found')).toBeVisible();
  await expect(page.getByText('What are we exploring today?')).toHaveCount(0);
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

  const sidePanel = await ensureConversationsOpen(page);
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
    createdConversations: [
      createConversation({
        id: conversationId,
        title,
        updatedAt: '2026-04-12T12:20:01.000Z',
        createdAt: '2026-04-12T12:20:01.000Z',
      }),
    ],
  });

  await mockChatRoute(page, async (body) => {
    expect(body.chatMode).toBe('persistent');
    expect(body.conversationId).toBe(conversationId);
    expect(body.mentorId).toBeUndefined();
    expect(body.message).toBe(message);

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

  const sidePanel = await ensureConversationsOpen(page);
  await sidePanel.locator('#side-panel-section-new').getByRole('button', { name: 'New chat with Keen' }).click();
  await expect(page).toHaveURL(new RegExp('/home\\?e2e=home-routing-draft$'));

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(message);
  await composer.press('Enter');

  await expect(page).toHaveURL(
    new RegExp(`/home/${conversationId}\\?e2e=home-routing-draft$`)
  );
  await expect(page.getByText(answer)).toBeVisible();
});

test('promoted draft stays visible in the sidebar while the first response is pending', async ({ page }) => {
  const message = 'Sketch a launch plan for a new marketplace.';
  const conversationId = 'conversation-promoted-sidebar-visible';
  const answer = 'Start with one dense segment, then widen supply after repeat usage appears.';
  const chatStarted = deferred();
  const finishResponse = deferred();

  await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
    createdConversations: [
      createConversation({
        id: conversationId,
        title: 'Launch Plan',
        updatedAt: '2026-04-12T12:30:01.000Z',
        createdAt: '2026-04-12T12:30:01.000Z',
      }),
    ],
  });

  await mockChatRoute(page, async (body) => {
    chatStarted.resolve(body);
    await finishResponse.promise;
    return {
      conversationId,
      conversationTitle: 'Launch Plan',
      userMessageId: 'message-sidebar-user-1',
      assistantMessageId: 'message-sidebar-assistant-1',
      message: answer,
    };
  });

  await page.goto('/home?e2e=home-routing-sidebar-visible');

  const sidePanel = await ensureConversationsOpen(page);
  await sidePanel.locator('#side-panel-section-new').getByRole('button', { name: 'New chat with Keen' }).click();

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(message);
  await composer.press('Enter');

  await expect(page).toHaveURL(
    new RegExp(`/home/${conversationId}\\?e2e=home-routing-sidebar-visible$`)
  );
  await expect.poll(async () => (await chatStarted.promise).conversationId).toBe(conversationId);
  await expect(sidePanel.getByTestId(`conversation-row-${conversationId}`)).toBeVisible();

  finishResponse.resolve();
  await expect(page.getByText(answer)).toBeVisible();
});

test('unsent composer text is preserved per persistent chat', async ({ page }) => {
  const firstConversationId = 'conversation-chat-scoped-input-1';
  const secondConversationId = 'conversation-chat-scoped-input-2';

  await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: firstConversationId,
        title: 'Chat One',
        updatedAt: '2026-04-12T12:40:00.000Z',
      }),
      createConversation({
        id: secondConversationId,
        title: 'Chat Two',
        updatedAt: '2026-04-12T12:39:00.000Z',
      }),
    ],
    messagesByConversationId: {
      [firstConversationId]: [],
      [secondConversationId]: [],
    },
  });

  await page.goto(
    "/home/" + firstConversationId + "?e2e=home-routing-chat-scoped-input"
  );

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill('Draft for chat one');

  const sidePanel = await ensureConversationsOpen(page);
  await sidePanel.getByRole('button', { name: /Chat Two/ }).click();

  await expect(page).toHaveURL(
    new RegExp("/home/" + secondConversationId + "\\?e2e=home-routing-chat-scoped-input$")
  );

  const secondComposer = page.getByPlaceholder('Message Keen...');
  await secondComposer.fill('Draft for chat two');

  const reopenedSidePanel = await ensureConversationsOpen(page);
  await reopenedSidePanel.getByRole('button', { name: /Chat One/ }).click();
  await expect(page).toHaveURL(
    new RegExp("/home/" + firstConversationId + "\\?e2e=home-routing-chat-scoped-input$")
  );
  await expect(page.getByPlaceholder('Message Keen...')).toHaveValue('Draft for chat one');

  const reopenedSidePanelAgain = await ensureConversationsOpen(page);
  await reopenedSidePanelAgain.getByRole('button', { name: /Chat Two/ }).click();
  await expect(page.getByPlaceholder('Message Keen...')).toHaveValue('Draft for chat two');
});

test('the same chat stays editable while its response is in flight', async ({ page }) => {
  const conversationId = 'conversation-pending-editable';
  const firstQuestion = 'Explain dispatch density.';
  const nextTurnDraft = 'Use Sonnet for the next turn.';
  const answer = 'Dispatch density improves matching efficiency.';
  const response = deferred();
  const state = await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: conversationId,
        title: 'Dispatch Density',
      }),
    ],
    messagesByConversationId: {
      [conversationId]: [],
    },
    chatModels: [
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
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        provider: 'anthropic',
        providerLabel: 'Anthropic',
        iconKey: 'anthropic',
        description: 'Efficient Claude model for everyday research and coding.',
        available: true,
        isDefault: false,
        effort: {
          levels: ['low', 'medium', 'high', 'max'],
          defaultLevel: 'medium',
          supportsThinkingToggle: true,
          defaultThinkingEnabled: true,
        },
      },
    ],
  });

  await mockChatRoute(page, async (body) => {
    expect(body.message).toBe(firstQuestion);
    state.messagesByConversationId[conversationId] = [
      createMessage({
        id: 'message-pending-editable-user-1',
        role: 'user',
        content: firstQuestion,
        createdAt: '2026-04-12T12:50:01.000Z',
      }),
      createMessage({
        id: 'message-pending-editable-assistant-1',
        role: 'assistant',
        content: answer,
        createdAt: '2026-04-12T12:50:02.000Z',
      }),
    ];

    return response.promise;
  });

  const routeMessagesLoaded = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/messages')
    && response.request().method() === 'GET'
    && response.status() === 200
  );
  await page.goto(
    "/home/" + conversationId + "?e2e=home-routing-pending-editable"
  );
  await routeMessagesLoaded;

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(firstQuestion);
  await composer.press('Enter');

  await composer.fill(nextTurnDraft);
  await expect(composer).toHaveValue(nextTurnDraft);

  const modelPicker = page.getByRole('button', { name: /Chat model: GPT-5\.5/ });
  await modelPicker.click();
  await page.getByRole('menuitemradio', { name: /Claude Sonnet 4\.6/ }).click();
  await expect(page.getByRole('button', { name: /Chat model: Claude Sonnet 4\.6/ })).toBeVisible();

  response.resolve({
    message: answer,
    userMessageId: 'message-pending-editable-user-1',
    assistantMessageId: 'message-pending-editable-assistant-1',
  });

  await expect(page.getByText(answer)).toBeVisible({ timeout: 10000 });
  await expect(composer).toHaveValue(nextTurnDraft);
});

test('model effort and thinking controls are included in chat requests', async ({ page }) => {
  const message = 'Use a higher effort setting for this.';
  const conversationId = 'conversation-effort-controls';
  const answer = 'Higher effort acknowledged.';
  let requestBody = null;

  await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
  });

  await mockChatRoute(page, async (body) => {
    requestBody = body;

    return {
      conversationId,
      conversationTitle: 'Effort Controls',
      userMessageId: 'message-effort-user-1',
      assistantMessageId: 'message-effort-assistant-1',
      message: answer,
    };
  });

  await page.goto('/home?e2e=home-routing-effort-controls');

  const modelPicker = page.getByRole('button', { name: /Chat model: GPT-5\.5/ });
  await modelPicker.evaluate((element) => {
    element.style.position = 'fixed';
    element.style.right = '12px';
    element.style.bottom = '32px';
    element.style.zIndex = '20';
  });
  await modelPicker.click();
  const triggerBox = await modelPicker.boundingBox();
  const mainPanel = page.locator('.chat-model-picker-popover > .chat-model-picker-panels > div').first();
  const popover = page.locator('.chat-model-picker-popover');
  const gptModelOption = page.getByRole('menuitemradio', { name: /GPT-5\.5/ });
  const initialPanelBox = await mainPanel.boundingBox();

  expect(triggerBox).not.toBeNull();
  expect(initialPanelBox).not.toBeNull();
  expect(initialPanelBox.y + initialPanelBox.height).toBeLessThanOrEqual(triggerBox.y + 1);
  expect(
    Math.abs(
      initialPanelBox.x + initialPanelBox.width - (triggerBox.x + triggerBox.width)
    )
  ).toBeLessThanOrEqual(2);

  await gptModelOption.hover();
  const panelBoxWithEffort = await mainPanel.boundingBox();
  const effortPanel = page.locator('.chat-model-effort-panel');
  const effortPanelBox = await effortPanel.boundingBox();

  expect(panelBoxWithEffort).not.toBeNull();
  expect(effortPanelBox).not.toBeNull();
  await expect(popover).toHaveAttribute('data-effort-placement', 'left');
  expect(Math.abs(panelBoxWithEffort.x - initialPanelBox.x)).toBeLessThanOrEqual(4);
  expect(
    Math.abs(
      panelBoxWithEffort.x
        + panelBoxWithEffort.width
        - (initialPanelBox.x + initialPanelBox.width)
    )
  ).toBeLessThanOrEqual(4);
  expect(effortPanelBox.x).toBeGreaterThanOrEqual(0);
  expect(effortPanelBox.x + effortPanelBox.width).toBeLessThanOrEqual(
    panelBoxWithEffort.x + 1
  );

  await page.keyboard.press('Escape');
  await modelPicker.evaluate((element) => {
    element.removeAttribute('style');
  });
  await modelPicker.click();
  await page.getByRole('menuitemradio', { name: /GPT-5\.5/ }).hover();
  await page.getByRole('menuitemradio', { name: /^High$/ }).click();
  await page.getByRole('switch', { name: /Thinking/ }).click();

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(message);
  await composer.press('Enter');

  await expect(page.getByText(answer)).toBeVisible({ timeout: 10000 });
  expect(requestBody).toEqual(
    expect.objectContaining({
      message,
      modelId: 'gpt-5.5',
      modelEffort: 'high',
      thinkingEnabled: false,
    })
  );
});

test('untouched model defaults are omitted from chat requests', async ({ page }) => {
  const message = 'Use the selected model default effort.';
  let requestBody = null;

  await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
    chatModels: [
      {
        id: 'auto',
        label: 'Auto',
        provider: 'auto',
        providerLabel: 'Auto',
        iconKey: 'auto',
        description: 'Routes automatically.',
        available: true,
        isDefault: true,
      },
      {
        id: 'claude-opus-4-8',
        label: 'Claude Opus 4.8',
        provider: 'anthropic',
        providerLabel: 'Anthropic',
        iconKey: 'anthropic',
        description: 'Premium Claude model for high-stakes work.',
        badge: 'Max',
        available: true,
        isDefault: false,
        effort: {
          levels: ['low', 'medium', 'high', 'max'],
          defaultLevel: 'high',
          supportsThinkingToggle: true,
          defaultThinkingEnabled: true,
        },
      },
    ],
  });

  await mockChatRoute(page, async (body) => {
    requestBody = body;

    return {
      conversationId: 'conversation-default-effort',
      conversationTitle: 'Default Effort',
      userMessageId: 'message-default-effort-user-1',
      assistantMessageId: 'message-default-effort-assistant-1',
      message: 'Default effort preserved.',
    };
  });

  await page.goto('/home?e2e=home-routing-default-effort');
  await page.getByRole('button', { name: /Chat model: Auto/ }).click();
  await page.getByRole('menuitemradio', { name: /Claude Opus 4\.8/ }).click();
  await page.keyboard.press('Escape');

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(message);
  await composer.press('Enter');

  await expect(page.getByText('Default effort preserved.')).toBeVisible({
    timeout: 10000,
  });
  expect(requestBody).toEqual(
    expect.objectContaining({
      message,
      modelId: 'claude-opus-4-8',
    })
  );
  expect(requestBody).not.toHaveProperty('modelEffort');
  expect(requestBody).not.toHaveProperty('thinkingEnabled');
});

test('auto mode omits untouched effort and thinking overrides', async ({ page }) => {
  const message = 'Route this automatically.';
  let requestBody = null;

  await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
    chatModels: [
      {
        id: 'auto',
        label: 'Auto',
        provider: 'auto',
        providerLabel: 'Auto',
        iconKey: 'auto',
        description: 'Routes automatically.',
        available: true,
        isDefault: true,
      },
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        provider: 'deepseek',
        providerLabel: 'DeepSeek',
        iconKey: 'deepseek',
        description: 'Stronger DeepSeek model.',
        badge: 'Max',
        available: true,
        isDefault: false,
        effort: {
          levels: ['low', 'medium', 'high', 'max'],
          defaultLevel: 'high',
          supportsThinkingToggle: true,
          defaultThinkingEnabled: true,
        },
      },
    ],
  });

  await mockChatRoute(page, async (body) => {
    requestBody = body;

    return {
      conversationId: 'conversation-auto-default-effort',
      conversationTitle: 'Auto Default Effort',
      userMessageId: 'message-auto-default-effort-user-1',
      assistantMessageId: 'message-auto-default-effort-assistant-1',
      message: 'Auto effort preserved.',
    };
  });

  await page.goto('/home?e2e=home-routing-auto-default-effort');

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(message);
  await composer.press('Enter');

  await expect(page.getByText('Auto effort preserved.')).toBeVisible({
    timeout: 10000,
  });
  expect(requestBody).toEqual(
    expect.objectContaining({
      message,
      modelId: 'auto',
    })
  );
  expect(requestBody).not.toHaveProperty('modelEffort');
  expect(requestBody).not.toHaveProperty('thinkingEnabled');
});

test('model effort controls use a drill-in panel on narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
    chatModels: [
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
        supportsImages: true,
        effort: {
          levels: ['low', 'medium', 'high', 'max'],
          defaultLevel: 'medium',
          supportsThinkingToggle: true,
          defaultThinkingEnabled: true,
        },
      },
      {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash',
        provider: 'google',
        providerLabel: 'Google',
        iconKey: 'google',
        description: 'Fast Gemini 3 model with broad thinking-level support.',
        available: true,
        isDefault: false,
        supportsImages: true,
        effort: {
          levels: ['minimal', 'low', 'medium', 'high'],
          defaultLevel: 'medium',
          supportsThinkingToggle: false,
          defaultThinkingEnabled: true,
        },
      },
    ],
  });

  await page.goto('/home?e2e=home-routing-effort-drilldown');

  await page.getByRole('button', { name: /Chat model: GPT-5\.5/ }).click();
  await page.getByRole('menuitemradio', { name: /Gemini 3 Flash/ }).click();

  const popover = page.locator('.chat-model-picker-popover');
  const panels = page.locator('.chat-model-picker-panels');
  const panelsBox = await panels.boundingBox();

  await expect(popover).toHaveAttribute('data-effort-mode', 'drilldown');
  await expect(page.getByRole('button', { name: /Chat model: Gemini 3 Flash/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach image' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Models$/ })).toBeVisible();
  await expect(page.getByText('Gemini 3 Flash effort')).toBeVisible();
  await expect(page.getByRole('menu', { name: 'Model effort' })).toBeVisible();
  await expect(page.locator('.chat-model-effort-panel')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('keen-chat-model')))
    .toBe('gemini-3-flash-preview');

  expect(panelsBox).not.toBeNull();
  expect(panelsBox.width).toBeGreaterThan(220);
  expect(panelsBox.x).toBeGreaterThanOrEqual(0);
  expect(panelsBox.x + panelsBox.width).toBeLessThanOrEqual(390);
});

test('home composer removes attached images when switching to a non-vision model', async ({ page }) => {
  await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
    chatModels: [
      {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash',
        provider: 'google',
        providerLabel: 'Google',
        iconKey: 'google',
        description: 'Fast Gemini 3 model with image support.',
        available: true,
        isDefault: true,
        supportsImages: true,
      },
      {
        id: 'auto',
        label: 'Auto',
        provider: 'auto',
        providerLabel: 'Auto',
        iconKey: 'auto',
        description: 'Routes automatically.',
        available: true,
        isDefault: false,
        supportsImages: false,
      },
    ],
  });
  await page.addInitScript(() => {
    window.localStorage.setItem('keen-chat-model', 'gemini-3-flash-preview');
  });

  await page.goto('/home?e2e=home-routing-image-model-switch');

  await expect(page.getByRole('button', { name: /Chat model: Gemini 3 Flash/ })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'home-switch.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  });
  await expect(page.getByAltText('home-switch.png')).toBeVisible();

  await page.getByRole('button', { name: /Chat model: Gemini 3 Flash/ }).click();
  await page.getByRole('menuitemradio', { name: /Auto/ }).click();

  await expect(page.getByAltText('home-switch.png')).toHaveCount(0);
  await expect(page.getByTestId('composer-image-warning')).toHaveText(
    'Removed attached images because the selected model cannot read images.'
  );
  await expect(page.getByRole('button', { name: 'Attach image' })).toBeDisabled();
});

test('a second chat can send while another chat is still in flight', async ({ page }) => {
  const firstConversationId = 'conversation-concurrent-first';
  const firstQuestion = 'What improves last-mile efficiency?';
  const firstAnswer = 'Dense demand reduces idle routing.';
  const secondQuestion = 'Can temporary chats send right now?';
  const secondAnswer = 'Yes, temporary chats can send while another chat is processing.';
  const firstResponse = deferred();
  const seenMessages = [];
  const state = await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: firstConversationId,
        title: 'Last-Mile Efficiency',
      }),
    ],
    messagesByConversationId: {
      [firstConversationId]: [],
    },
  });

  await mockChatRoute(page, async (body) => {
    seenMessages.push(body.message);

    if (body.message === firstQuestion) {
      state.messagesByConversationId[firstConversationId] = [
        createMessage({
          id: 'message-concurrent-first-user-1',
          role: 'user',
          content: firstQuestion,
          createdAt: '2026-04-12T13:00:01.000Z',
        }),
        createMessage({
          id: 'message-concurrent-first-assistant-1',
          role: 'assistant',
          content: firstAnswer,
          createdAt: '2026-04-12T13:00:02.000Z',
        }),
      ];

      return firstResponse.promise;
    }

    if (body.message === secondQuestion) {
      expect(body.chatMode).toBe('temporary');
      return {
        message: secondAnswer,
        userMessageId: 'message-concurrent-temp-user-1',
        assistantMessageId: 'message-concurrent-temp-assistant-1',
      };
    }

    throw new Error('Unexpected chat message: ' + body.message);
  });

  const firstRouteMessagesLoaded = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/messages')
    && response.request().method() === 'GET'
    && response.status() === 200
  );
  await page.goto(
    '/home/' + firstConversationId + '?e2e=home-routing-concurrent-send'
  );
  await firstRouteMessagesLoaded;

  const firstComposer = page.getByPlaceholder('Message Keen...');
  await firstComposer.fill(firstQuestion);
  await firstComposer.press('Enter');

  await page.getByLabel('New temporary chat').click();
  await expect(page).toHaveURL(new RegExp('/home\\?e2e=home-routing-concurrent-send$'));

  const temporaryComposer = page.getByPlaceholder('Message Keen...');
  await temporaryComposer.fill(secondQuestion);
  await temporaryComposer.press('Enter');

  await expect(page.getByText(secondAnswer)).toBeVisible({ timeout: 10000 });
  expect(seenMessages).toEqual([firstQuestion, secondQuestion]);

  firstResponse.resolve({
    message: firstAnswer,
    userMessageId: 'message-concurrent-first-user-1',
    assistantMessageId: 'message-concurrent-first-assistant-1',
  });

  await expect(page).toHaveURL(new RegExp('/home\\?e2e=home-routing-concurrent-send$'));
});

test('background draft promotion does not steal focus from the chat you switched to', async ({ page }) => {
  const savedConversationId = 'conversation-stays-selected';
  const promotedConversationId = 'conversation-promoted-in-background';
  const firstQuestion = 'Start a new investigation for me.';
  const promotedAnswer = 'The draft can finish in the background.';
  const response = deferred();
  const state = await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: savedConversationId,
        title: 'Saved Conversation',
      }),
    ],
    messagesByConversationId: {
      [savedConversationId]: [
        createMessage({
          id: 'message-saved-conversation-assistant-1',
          role: 'assistant',
          content: 'Stay focused on this conversation.',
          createdAt: '2026-04-12T13:10:00.000Z',
        }),
      ],
    },
    createdConversations: [
      createConversation({
        id: promotedConversationId,
        title: 'Background Draft',
        updatedAt: '2026-04-12T15:00:01.000Z',
        createdAt: '2026-04-12T15:00:01.000Z',
      }),
    ],
  });

  await mockChatRoute(page, async (body) => {
    expect(body.message).toBe(firstQuestion);
    state.conversations.unshift(
      createConversation({
        id: promotedConversationId,
        title: 'Background Draft',
        updatedAt: '2026-04-12T13:10:02.000Z',
        createdAt: '2026-04-12T13:10:01.000Z',
      })
    );
    state.messagesByConversationId[promotedConversationId] = [
      createMessage({
        id: 'message-background-draft-user-1',
        role: 'user',
        content: firstQuestion,
        createdAt: '2026-04-12T13:10:01.000Z',
      }),
      createMessage({
        id: 'message-background-draft-assistant-1',
        role: 'assistant',
        content: promotedAnswer,
        createdAt: '2026-04-12T13:10:02.000Z',
      }),
    ];

    return response.promise;
  });

  await page.goto('/home?e2e=home-routing-background-draft');

  const composer = page.getByPlaceholder('Message Keen...');
  await composer.fill(firstQuestion);
  await composer.press('Enter');

  const sidePanel = await ensureConversationsOpen(page);
  await sidePanel.getByRole('button', { name: /Saved Conversation/ }).click();
  await expect(page).toHaveURL(
    new RegExp('/home/' + savedConversationId + '\\?e2e=home-routing-background-draft$')
  );
  await expect(page.getByText('Stay focused on this conversation.')).toBeVisible();

  response.resolve({
    conversationId: promotedConversationId,
    conversationTitle: 'Background Draft',
    userMessageId: 'message-background-draft-user-1',
    assistantMessageId: 'message-background-draft-assistant-1',
    message: promotedAnswer,
  });

  await expect(page).toHaveURL(
    new RegExp('/home/' + savedConversationId + '\\?e2e=home-routing-background-draft$')
  );
  await expect(page.getByText('Stay focused on this conversation.')).toBeVisible();
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

  await page.goto('/home/' + conversationId + '?e2e=home-routing-temporary');

  await expect(page.getByText(answer)).toBeVisible();
  await page.getByLabel('New temporary chat').click();

  await expect(page).toHaveURL(new RegExp('/home\\?e2e=home-routing-temporary$'));
  await expect(page.getByRole('heading', { name: 'Temporary chat' })).toBeVisible();
});
