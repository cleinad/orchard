const { test, expect } = require('@playwright/test');
const { deferred, mockChatRoute, mockStreamingChatRoute } = require('./helpers/chatMocks');
const { mockHomeDataRoutes } = require('./helpers/homeRouteMocks');

function createConversation({
  id,
  title,
  mentorId = null,
  workspaceId = null,
  updatedAt = '2026-04-12T12:00:00.000Z',
  createdAt = '2026-04-12T11:00:00.000Z',
}) {
  return {
    id,
    title,
    mentor_id: mentorId,
    workspace_id: workspaceId,
    updated_at: updatedAt,
    created_at: createdAt,
  };
}

function createWorkspace({
  id,
  name,
  icon = 'W',
  accentColor = '#2563eb',
}) {
  return {
    id,
    name,
    description: null,
    context: null,
    icon,
    accent_color: accentColor,
    created_at: '2026-04-12T11:00:00.000Z',
    updated_at: '2026-04-12T11:00:00.000Z',
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

function createScrollableMessages(prefix, uniqueMarker) {
  return Array.from({ length: 24 }, (_, index) =>
    createMessage({
      id: `${prefix}-message-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: [
        index === 3 ? uniqueMarker : `${prefix} turn ${index + 1}`,
        'This paragraph gives the transcript enough height to make scroll restoration observable.',
        'The exact words are less important than keeping each message visually substantial.',
      ].join('\n\n'),
      createdAt: `2026-04-12T12:${String(index).padStart(2, '0')}:00.000Z`,
    })
  );
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

test('clicking a workspace chat does not reopen another collapsed workspace', async ({ page }) => {
  const firstWorkspaceId = 'workspace-alpha';
  const secondWorkspaceId = 'workspace-beta';
  const firstConversationId = 'conversation-alpha';
  const secondConversationId = 'conversation-beta';

  await mockHomeDataRoutes(page, {
    workspaces: [
      createWorkspace({
        id: firstWorkspaceId,
        name: 'Alpha',
        icon: 'A',
      }),
      createWorkspace({
        id: secondWorkspaceId,
        name: 'Beta',
        icon: 'B',
      }),
    ],
    conversations: [
      createConversation({
        id: firstConversationId,
        title: 'Alpha Chat',
        workspaceId: firstWorkspaceId,
        updatedAt: '2026-04-12T12:30:00.000Z',
      }),
      createConversation({
        id: secondConversationId,
        title: 'Beta Chat',
        workspaceId: secondWorkspaceId,
        updatedAt: '2026-04-12T12:00:00.000Z',
      }),
    ],
    messagesByConversationId: {
      [firstConversationId]: [
        createMessage({
          id: 'message-alpha-assistant-1',
          role: 'assistant',
          content: 'Alpha conversation loaded.',
          createdAt: '2026-04-12T12:30:01.000Z',
        }),
      ],
      [secondConversationId]: [
        createMessage({
          id: 'message-beta-assistant-1',
          role: 'assistant',
          content: 'Beta conversation loaded.',
          createdAt: '2026-04-12T12:00:01.000Z',
        }),
      ],
    },
  });

  await page.goto(`/home/${firstConversationId}?e2e=workspace-collapse-regression`);

  const sidePanel = await ensureConversationsOpen(page);
  await expect(sidePanel.getByRole('button', { name: 'Collapse Alpha' })).toBeVisible();

  await sidePanel.getByRole('button', { name: 'Collapse Alpha' }).click();
  await expect(sidePanel.getByRole('button', { name: 'Expand Alpha' })).toBeVisible();

  await sidePanel.getByRole('button', { name: 'Expand Beta' }).click();
  await expect(sidePanel.getByRole('button', { name: /Beta Chat/ })).toBeVisible();

  await page.evaluate(({ firstWorkspaceId, secondWorkspaceId }) => {
    const first = document.querySelector(
      `[data-testid="workspace-drop-target-${firstWorkspaceId}"]`
    );
    const second = document.querySelector(
      `[data-testid="workspace-drop-target-${secondWorkspaceId}"]`
    );
    if (!first || !second) {
      throw new Error('Workspace rows were not found');
    }

    const snapshots = [];
    const readSelection = () => {
      snapshots.push({
        firstSelected: first.className.includes('bg-foreground/[0.05]'),
        secondSelected: second.className.includes('bg-foreground/[0.05]'),
      });
    };
    const observer = new MutationObserver(readSelection);
    readSelection();
    observer.observe(first, { attributes: true, attributeFilter: ['class'] });
    observer.observe(second, { attributes: true, attributeFilter: ['class'] });
    window.__workspaceSelectionProbe = { snapshots, observer };
  }, { firstWorkspaceId, secondWorkspaceId });

  await sidePanel.getByRole('button', { name: /Beta Chat/ }).click();

  await expect(page).toHaveURL(
    new RegExp(`/home/${secondConversationId}\\?e2e=workspace-collapse-regression$`)
  );
  await expect(page.getByText('Beta conversation loaded.')).toBeVisible();
  await expect(sidePanel.getByRole('button', { name: 'Expand Alpha' })).toBeVisible();
  await expect(sidePanel.getByRole('button', { name: 'Collapse Alpha' })).toHaveCount(0);

  const selectionSnapshots = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const probe = window.__workspaceSelectionProbe;
    probe.observer.disconnect();
    delete window.__workspaceSelectionProbe;
    return probe.snapshots;
  });
  const firstSecondSelectedIndex = selectionSnapshots.findIndex(
    (snapshot) => snapshot.secondSelected
  );
  expect(firstSecondSelectedIndex).toBeGreaterThanOrEqual(0);
  expect(
    selectionSnapshots
      .slice(firstSecondSelectedIndex)
      .some((snapshot) => snapshot.firstSelected)
  ).toBe(false);

  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/home/${firstConversationId}\\?e2e=workspace-collapse-regression$`)
  );
  await expect.poll(async () =>
    page.evaluate(({ firstWorkspaceId, secondWorkspaceId }) => {
      const first = document.querySelector(
        `[data-testid="workspace-drop-target-${firstWorkspaceId}"]`
      );
      const second = document.querySelector(
        `[data-testid="workspace-drop-target-${secondWorkspaceId}"]`
      );
      return {
        firstSelected: first?.className.includes('bg-foreground/[0.05]') ?? false,
        secondSelected: second?.className.includes('bg-foreground/[0.05]') ?? false,
      };
    }, { firstWorkspaceId, secondWorkspaceId })
  ).toEqual({
    firstSelected: true,
    secondSelected: false,
  });
});

test('the first draft send replaces /home with the new persistent conversation route', async ({ page }) => {
  const message = 'Walk me through how delivery marketplaces scaled.';
  const answer = 'They scaled by matching dense demand clusters with increasingly efficient courier dispatch.';
  const title = 'Scaling Delivery Marketplaces';

  const state = await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
  });
  let conversationId = null;

  await mockChatRoute(page, async (body) => {
    conversationId = body.conversationId;
    expect(body.chatMode).toBe('persistent');
    expect(conversationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.run.createConversation).toBe(true);
    expect(body.mentorId).toBeUndefined();
    expect(body.message).toBe(message);

    state.conversations.unshift(createConversation({ id: conversationId, title }));
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

  const composer = page.getByLabel('Message composer');
  await composer.fill(message);
  await composer.press('Enter');

  await expect.poll(() => conversationId).not.toBeNull();

  await expect(page).toHaveURL(
    new RegExp(`/home/${conversationId}\\?e2e=home-routing-draft$`)
  );
  await expect(page.getByText(answer)).toBeVisible();
});

test('promoted draft stays visible in the sidebar while the first response is pending', async ({ page }) => {
  const message = 'Sketch a launch plan for a new marketplace.';
  const answer = 'Start with one dense segment, then widen supply after repeat usage appears.';
  const chatStarted = deferred();
  const finishResponse = deferred();
  let conversationId = null;

  const state = await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
  });

  await mockChatRoute(page, async (body) => {
    conversationId = body.conversationId;
    state.conversations.unshift(createConversation({
      id: conversationId,
      title: 'Launch Plan',
    }));
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

  const composer = page.getByLabel('Message composer');
  await composer.fill(message);
  await composer.press('Enter');
  const startedBody = await chatStarted.promise;

  await expect(page).toHaveURL(
    new RegExp(`/home/${conversationId}\\?e2e=home-routing-sidebar-visible$`)
  );
  expect(startedBody.conversationId).toBe(conversationId);
  await expect(sidePanel.getByTestId(`conversation-row-${conversationId}`)).toBeVisible();

  finishResponse.resolve();
  await expect(page.getByText(answer)).toBeVisible();
});

test('desktop conversations sidebar resizes by dragging and persists width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: 'conversation-sidebar-resize',
        title: 'Resizable Sidebar',
      }),
    ],
    messagesByConversationId: {},
  });

  await page.goto('/home?e2e=sidebar-resize');

  const sidePanel = await ensureConversationsOpen(page);
  const resizeHandle = page.getByTestId('side-panel-resize-handle');
  const before = await sidePanel.boundingBox();
  const handleBox = await resizeHandle.boundingBox();

  if (!before || !handleBox) {
    throw new Error('Sidebar or resize handle is missing a bounding box');
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 120, handleBox.y + handleBox.height / 2, {
    steps: 6,
  });
  await page.mouse.up();

  await expect
    .poll(async () => (await sidePanel.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width + 80);

  const storedWidth = await page.evaluate(() =>
    Number(window.localStorage.getItem('keen-side-panel-width-v1'))
  );

  expect(storedWidth).toBeGreaterThan(before.width + 80);
  expect(storedWidth).toBeLessThanOrEqual(600);
});

test('collapsed rail section icons reopen only their matching sidebar section', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: 'conversation-rail-section-state',
        title: 'Rail Section State',
      }),
    ],
    messagesByConversationId: {},
  });

  await page.goto('/home?e2e=rail-section-state');

  const sidePanel = await ensureConversationsOpen(page);
  const workspacesHeader = sidePanel.getByRole('button', { name: 'Workspaces', exact: true });
  const temporaryHeader = sidePanel.getByRole('button', { name: 'Temporary', exact: true });
  const chatsHeader = sidePanel.getByRole('button', { name: 'Chats', exact: true });

  await expect(workspacesHeader).toHaveAttribute('aria-expanded', 'true');
  await temporaryHeader.click();
  await chatsHeader.click();
  await expect(workspacesHeader).toHaveAttribute('aria-expanded', 'true');
  await expect(temporaryHeader).toHaveAttribute('aria-expanded', 'false');
  await expect(chatsHeader).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Escape');
  await expect(page.locator('nav[aria-hidden]').first()).toHaveAttribute('aria-hidden', 'false');

  await page.getByRole('button', { name: 'Temporary chats' }).click();
  await expect(page.locator('nav[aria-hidden]').first()).toHaveAttribute('aria-hidden', 'true');
  await expect(workspacesHeader).toHaveAttribute('aria-expanded', 'true');
  await expect(temporaryHeader).toHaveAttribute('aria-expanded', 'true');
  await expect(chatsHeader).toHaveAttribute('aria-expanded', 'false');
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

  const composer = page.getByLabel('Message composer');
  await composer.fill('Draft for chat one');

  const sidePanel = await ensureConversationsOpen(page);
  await sidePanel.getByRole('button', { name: /Chat Two/ }).click();

  await expect(page).toHaveURL(
    new RegExp("/home/" + secondConversationId + "\\?e2e=home-routing-chat-scoped-input$")
  );

  const secondComposer = page.getByLabel('Message composer');
  await secondComposer.fill('Draft for chat two');

  const reopenedSidePanel = await ensureConversationsOpen(page);
  await reopenedSidePanel.getByRole('button', { name: /Chat One/ }).click();
  await expect(page).toHaveURL(
    new RegExp("/home/" + firstConversationId + "\\?e2e=home-routing-chat-scoped-input$")
  );
  await expect(page.getByLabel('Message composer')).toHaveValue('Draft for chat one');

  const reopenedSidePanelAgain = await ensureConversationsOpen(page);
  await reopenedSidePanelAgain.getByRole('button', { name: /Chat Two/ }).click();
  await expect(page.getByLabel('Message composer')).toHaveValue('Draft for chat two');
});

test('persistent chat switches reuse cached transcripts and restore scroll cleanly', async ({ page }) => {
  const firstConversationId = 'conversation-cache-switch-1';
  const secondConversationId = 'conversation-cache-switch-2';
  const firstOnlyMessage = 'Only chat one contains this cached scroll marker.';
  const secondOnlyMessage = 'Only chat two contains this clean switch marker.';
  const messageRequests = {};

  await page.setViewportSize({ width: 1280, height: 720 });

  await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({
        id: firstConversationId,
        title: 'Cache Switch One',
        updatedAt: '2026-04-12T12:42:00.000Z',
      }),
      createConversation({
        id: secondConversationId,
        title: 'Cache Switch Two',
        updatedAt: '2026-04-12T12:41:00.000Z',
      }),
    ],
    messagesByConversationId: {
      [firstConversationId]: createScrollableMessages('cache-switch-one', firstOnlyMessage),
      [secondConversationId]: createScrollableMessages('cache-switch-two', secondOnlyMessage),
    },
    onMessagesRequest: async ({ conversationId, select }) => {
      if (conversationId && select !== 'content') {
        messageRequests[conversationId] = (messageRequests[conversationId] || 0) + 1;
      }

      return false;
    },
  });

  await page.goto(`/home/${firstConversationId}?e2e=home-routing-cache-switch`);

  const transcript = page.getByTestId('home-scroll-container');
  await expect(transcript.getByText(firstOnlyMessage)).toBeVisible();
  await expect.poll(() =>
    transcript.evaluate((element) => element.scrollHeight > element.clientHeight)
  ).toBe(true);

  const savedScrollTop = await transcript.evaluate((element) => {
    element.scrollTop = Math.min(420, element.scrollHeight - element.clientHeight);
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
    return element.scrollTop;
  });
  expect(savedScrollTop).toBeGreaterThan(100);
  await expect.poll(() =>
    transcript.evaluate((element) => Math.round(element.scrollTop))
  ).toBe(Math.round(savedScrollTop));

  const sidePanel = await ensureConversationsOpen(page);
  await expect.poll(() =>
    transcript.evaluate((element) => Math.round(element.scrollTop))
  ).toBe(Math.round(savedScrollTop));
  await sidePanel.getByRole('button', { name: /Cache Switch Two/ }).click();

  await expect(page).toHaveURL(
    new RegExp(`/home/${secondConversationId}\\?e2e=home-routing-cache-switch$`)
  );
  await expect(transcript.getByText(secondOnlyMessage)).toBeVisible();
  await expect(transcript.getByText(firstOnlyMessage)).toHaveCount(0);
  expect(messageRequests[firstConversationId]).toBe(1);
  expect(messageRequests[secondConversationId]).toBe(1);

  const reopenedSidePanel = await ensureConversationsOpen(page);
  await reopenedSidePanel.getByRole('button', { name: /Cache Switch One/ }).click();

  await expect(page).toHaveURL(
    new RegExp(`/home/${firstConversationId}\\?e2e=home-routing-cache-switch$`)
  );
  await expect(transcript.getByText(firstOnlyMessage)).toBeVisible();
  await expect(transcript.getByText(secondOnlyMessage)).toHaveCount(0);
  expect(messageRequests[firstConversationId]).toBe(1);

  await expect.poll(() =>
    transcript.evaluate((element) => element.scrollTop)
  ).toBeGreaterThan(savedScrollTop - 120);
  await expect.poll(() =>
    transcript.evaluate((element) => element.scrollTop)
  ).toBeLessThan(savedScrollTop + 180);
});

test('streaming auto-follow ignores no-op downward scrolling and pauses on upward scrolling', async ({ page }) => {
  const chunks = [
    `STREAM_START\n\n${'Opening response paragraph. '.repeat(80)}`,
    `\n\nSTREAM_MIDDLE\n\n${'Middle response paragraph. '.repeat(80)}`,
    `\n\nSTREAM_END\n\n${'Closing response paragraph. '.repeat(80)}`,
  ];

  await page.setViewportSize({ width: 1280, height: 720 });
  await mockHomeDataRoutes(page, {});

  await mockStreamingChatRoute(page, {
    chunks,
    delayMs: 500,
    metadata: {
      userMessageId: 'message-stream-scroll-user',
      assistantMessageId: 'message-stream-scroll-assistant',
    },
  });

  await page.goto('/home?e2e=conversation-map-temporary');

  const transcript = page.getByTestId('home-scroll-container');
  await expect(transcript.getByText('Give me two ways to explain delayed browser paint.'))
    .toBeVisible();
  const composer = page.getByLabel('Message composer');
  await composer.fill('Keep the transcript still when I scroll.');
  await composer.press('Enter');

  await expect(transcript.getByText('STREAM_START')).toBeVisible();
  await expect.poll(() => transcript.evaluate((element) =>
    element.scrollHeight - element.scrollTop - element.clientHeight
  )).toBeLessThanOrEqual(2);

  const transcriptBox = await transcript.boundingBox();
  expect(transcriptBox).not.toBeNull();
  await page.mouse.move(
    transcriptBox.x + transcriptBox.width / 2,
    transcriptBox.y + transcriptBox.height / 2
  );
  await page.mouse.wheel(0, 48);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press('ArrowUp');

  await expect(transcript.getByText('STREAM_MIDDLE')).toBeVisible();
  await expect.poll(() => transcript.evaluate((element) =>
    element.scrollHeight - element.scrollTop - element.clientHeight
  )).toBeLessThanOrEqual(2);

  await page.mouse.wheel(0, -48);

  await expect.poll(() => transcript.evaluate((element) =>
    element.scrollHeight - element.scrollTop - element.clientHeight
  )).toBeGreaterThan(2);
  const pausedScrollTop = await transcript.evaluate((element) => element.scrollTop);

  await expect(transcript.getByText('STREAM_END')).toBeVisible();
  await page.waitForTimeout(600);
  await expect.poll(() => transcript.evaluate((element) => element.scrollTop))
    .toBe(pausedScrollTop);
});

test('a superseded chat load cannot replace the cached chat returned to', async ({ page }) => {
  const firstConversationId = 'conversation-stale-load-1';
  const secondConversationId = 'conversation-stale-load-2';
  const firstAnswer = 'The cached conversation stays selected.';
  const secondLoadGate = deferred();
  const secondFailureFulfilled = deferred();

  await mockHomeDataRoutes(page, {
    conversations: [
      createConversation({ id: firstConversationId, title: 'Cached Route One' }),
      createConversation({ id: secondConversationId, title: 'Delayed Route Two' }),
    ],
    messagesByConversationId: {
      [firstConversationId]: [
        createMessage({
          id: 'message-stale-load-first-assistant-1',
          role: 'assistant',
          content: firstAnswer,
          createdAt: '2026-04-12T12:50:00.000Z',
        }),
      ],
      [secondConversationId]: [],
    },
    onMessagesRequest: async ({
      route,
      conversationId,
      select,
      fulfillJson,
    }) => {
      if (conversationId !== secondConversationId || select === 'content') {
        return false;
      }

      await secondLoadGate.promise;
      await fulfillJson(route, { message: 'Delayed load failed' }, 500);
      secondFailureFulfilled.resolve();
      return true;
    },
  });

  await page.goto(`/home/${firstConversationId}?e2e=home-routing-stale-load`);
  await expect(page.getByText(firstAnswer)).toBeVisible();

  const sidePanel = await ensureConversationsOpen(page);
  await sidePanel.getByRole('button', { name: /Delayed Route Two/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/home/${secondConversationId}\\?e2e=home-routing-stale-load$`)
  );

  await sidePanel.getByRole('button', { name: /Cached Route One/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/home/${firstConversationId}\\?e2e=home-routing-stale-load$`)
  );
  await expect(page.getByText(firstAnswer)).toBeVisible();

  const staleErrorAppeared = page
    .getByText('Could not load this conversation')
    .waitFor({ state: 'visible', timeout: 750 })
    .then(() => true, () => false);

  secondLoadGate.resolve();
  await secondFailureFulfilled.promise;

  expect(await staleErrorAppeared).toBe(false);
  await expect(page.getByText(firstAnswer)).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/home/${firstConversationId}\\?e2e=home-routing-stale-load$`)
  );
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

  const composer = page.getByLabel('Message composer');
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
    element.style.bottom = '96px';
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

  const composer = page.getByLabel('Message composer');
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

  const composer = page.getByLabel('Message composer');
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

  const composer = page.getByLabel('Message composer');
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

  const modelPicker = page.getByRole('button', { name: /Chat model: GPT-5\.5/ });
  await modelPicker.evaluate((element) => {
    element.style.position = 'fixed';
    element.style.right = '12px';
    element.style.bottom = '96px';
    element.style.zIndex = '20';
  });

  await modelPicker.click();
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

  const firstComposer = page.getByLabel('Message composer');
  await firstComposer.fill(firstQuestion);
  await firstComposer.press('Enter');

  await page.getByRole('main').getByLabel('New temporary chat').click();
  await expect(page).toHaveURL(new RegExp('/home\\?e2e=home-routing-concurrent-send$'));

  const temporaryComposer = page.getByLabel('Message composer');
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

  const sidePanel = await ensureConversationsOpen(page);
  await sidePanel.getByRole('button', { name: /Last-Mile Efficiency/ }).click();

  await expect(page).toHaveURL(
    new RegExp('/home/' + firstConversationId + '\\?e2e=home-routing-concurrent-send$')
  );
  await expect(page.getByText(firstAnswer)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(secondAnswer)).toHaveCount(0);
});

test('background draft promotion does not steal focus from the chat you switched to', async ({ page }) => {
  const savedConversationId = 'conversation-stays-selected';
  const firstQuestion = 'Start a new investigation for me.';
  const promotedAnswer = 'The draft can finish in the background.';
  const chatStarted = deferred();
  const response = deferred();
  let promotedConversationId = null;
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
  });

  await mockChatRoute(page, async (body) => {
    expect(body.message).toBe(firstQuestion);
    promotedConversationId = body.conversationId;
    state.conversations.unshift(createConversation({
      id: promotedConversationId,
      title: 'Background Draft',
      updatedAt: '2026-04-12T15:00:01.000Z',
      createdAt: '2026-04-12T15:00:01.000Z',
    }));
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

    chatStarted.resolve();
    return response.promise;
  });

  await page.goto('/home?e2e=home-routing-background-draft');

  const composer = page.getByLabel('Message composer');
  await composer.fill(firstQuestion);
  await composer.press('Enter');
  await chatStarted.promise;

  const sidePanel = await ensureConversationsOpen(page);
  await sidePanel.getByRole('button', { name: /Saved Conversation/ }).click();
  await expect(page).toHaveURL(
    new RegExp('/home/' + savedConversationId + '\\?e2e=home-routing-background-draft$')
  );
  await expect(page.getByText('Stay focused on this conversation.')).toBeVisible();

  await expect(page).toHaveURL(
    new RegExp('/home/' + savedConversationId + '\\?e2e=home-routing-background-draft$')
  );
  await sidePanel.getByRole('button', { name: /Start a new investigation/ }).click();
  await expect(page).toHaveURL(
    new RegExp('/home/' + promotedConversationId + '\\?e2e=home-routing-background-draft$')
  );
  await expect(page.getByTestId('home-scroll-container').getByText(firstQuestion))
    .toBeVisible();

  await sidePanel.getByRole('button', { name: /Saved Conversation/ }).click();
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
  await page.getByRole('main').getByLabel('New temporary chat').click();

  await expect(page).toHaveURL(new RegExp('/home\\?e2e=home-routing-temporary$'));
  await expect(page.getByRole('heading', { name: 'Temporary chat' })).toBeVisible();
});
