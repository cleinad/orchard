const { test, expect } = require('@playwright/test');
const { deferred, mockChatRoute } = require('./helpers/chatMocks');
const { mockHomeDataRoutes } = require('./helpers/homeRouteMocks');

function createWorkspace({
  id,
  name,
  description = null,
  context = null,
  icon = 'W',
  accentColor = '#2563eb',
}) {
  return {
    id,
    name,
    description,
    context,
    icon,
    accent_color: accentColor,
    created_at: '2026-06-25T12:00:00.000Z',
    updated_at: '2026-06-25T12:00:00.000Z',
  };
}

function createConversation({
  id,
  title,
  workspaceId = null,
  mentorId = null,
  updatedAt = '2026-06-25T12:05:00.000Z',
}) {
  return {
    id,
    title,
    mentor_id: mentorId,
    workspace_id: workspaceId,
    updated_at: updatedAt,
    created_at: '2026-06-25T12:00:00.000Z',
  };
}

async function ensureConversationsOpen(page) {
  const rail = page.locator('nav[aria-hidden]').first();
  const sidePanel = page
    .locator('[role="region"][aria-label="Conversations and sections"]')
    .first();

  if ((await rail.getAttribute('aria-hidden')) !== 'true') {
    await page.getByRole('button', { name: 'Open conversations' }).first().click();
    await expect(rail).toHaveAttribute('aria-hidden', 'true');
  }

  return sidePanel;
}

test('workspace view shows sessions, sidebar workspace grouping, memory, and editable context', async ({ page }) => {
  const workspaceId = 'workspace-health';
  const sessionTitle = 'Zone 2 training plan';
  const state = await mockHomeDataRoutes(page, {
    workspaces: [
      createWorkspace({
        id: workspaceId,
        name: 'Health',
        description: 'Training, recovery, and bloodwork',
        context: 'Use running and cycling training context.',
        icon: 'H',
      }),
    ],
    conversations: [
      createConversation({
        id: 'conversation-health-1',
        title: sessionTitle,
        workspaceId,
      }),
      createConversation({
        id: 'conversation-keen-1',
        title: 'Default Keen chat',
      }),
    ],
    memoryItems: [
      {
        id: 'memory-health-1',
        user_id: 'e2e-user-1',
        owner_type: 'workspace',
        owner_id: workspaceId,
        type: 'goal',
        text: 'User is rebuilding aerobic base.',
        normalized_text: 'user rebuilding aerobic base',
        confidence: 0.9,
        salience: 80,
        stability: 'stable',
        sensitivity: 'normal',
        status: 'active',
        source_conversation_id: null,
        source_message_id: null,
        source_role: null,
        created_at: '2026-06-25T12:00:00.000Z',
        updated_at: '2026-06-25T12:00:00.000Z',
      },
    ],
  });

  await page.goto(`/workspaces/${workspaceId}?e2e=workspace-view`);

  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible();
  await expect(page.getByText('Training, recovery, and bloodwork')).toBeVisible();
  await expect(page.getByText(sessionTitle)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible();
  await expect(page.getByPlaceholder('Message Health...')).toBeVisible();

  const sidePanel = await ensureConversationsOpen(page);
  await expect(sidePanel.locator('#side-panel-section-workspaces')).toBeVisible();
  const workspacesBox = await sidePanel.locator('#side-panel-section-workspaces').boundingBox();
  const temporaryBox = await sidePanel.locator('#side-panel-section-temporary').boundingBox();
  expect(workspacesBox.y).toBeLessThan(temporaryBox.y);
  await sidePanel.getByRole('button', { name: 'Expand Health' }).click();
  await expect(sidePanel.getByRole('button', { name: new RegExp(sessionTitle) })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Memory' }).click();
  await expect(page.getByText('User is rebuilding aerobic base.')).toBeVisible();

  await page.getByRole('button', {
    name: 'Edit workspace instructions',
  }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit instructions' });
  await expect(dialog).toBeVisible();
  const contextBox = dialog.getByPlaceholder(/Add background/);
  await expect(contextBox).toHaveValue('Use running and cycling training context.');
  await contextBox.fill('Prefer practical training advice and concise caveats.');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Prefer practical training advice and concise caveats.')).toBeVisible();
  expect(state.workspaces[0].context).toBe('Prefer practical training advice and concise caveats.');
});

test('workspace delete requires confirmation and removes scoped chats and memories', async ({ page }) => {
  const workspaceId = 'workspace-health';
  const state = await mockHomeDataRoutes(page, {
    workspaces: [
      createWorkspace({
        id: workspaceId,
        name: 'Health',
        description: 'Training, recovery, and bloodwork',
        context: 'Use running and cycling training context.',
        icon: 'H',
      }),
      createWorkspace({
        id: 'workspace-math',
        name: 'Math',
        icon: 'M',
      }),
    ],
    conversations: [
      createConversation({
        id: 'conversation-health-1',
        title: 'Health plan',
        workspaceId,
      }),
      createConversation({
        id: 'conversation-math-1',
        title: 'Eigenvalues',
        workspaceId: 'workspace-math',
      }),
      createConversation({
        id: 'conversation-keen-1',
        title: 'Default Keen chat',
      }),
    ],
    memoryItems: [
      {
        id: 'memory-health-1',
        user_id: 'e2e-user-1',
        owner_type: 'workspace',
        owner_id: workspaceId,
        type: 'goal',
        text: 'User is rebuilding aerobic base.',
        normalized_text: 'user rebuilding aerobic base',
        confidence: 0.9,
        salience: 80,
        stability: 'stable',
        sensitivity: 'normal',
        status: 'active',
        source_conversation_id: null,
        source_message_id: null,
        source_role: null,
        created_at: '2026-06-25T12:00:00.000Z',
        updated_at: '2026-06-25T12:00:00.000Z',
      },
      {
        id: 'memory-global-1',
        user_id: 'e2e-user-1',
        owner_type: 'global',
        owner_id: null,
        type: 'profile',
        text: 'User likes concise answers.',
        normalized_text: 'user likes concise answers',
        confidence: 0.9,
        salience: 80,
        stability: 'stable',
        sensitivity: 'normal',
        status: 'active',
        source_conversation_id: null,
        source_message_id: null,
        source_role: null,
        created_at: '2026-06-25T12:00:00.000Z',
        updated_at: '2026-06-25T12:00:00.000Z',
      },
    ],
  });

  await page.goto(`/workspaces/${workspaceId}?e2e=workspace-delete`);
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible();

  await page.getByRole('button', { name: 'Workspace actions' }).click();
  await page.mouse.move(0, 0);
  await page.getByRole('menuitem', { name: 'Delete workspace' }).click();

  const dialog = page.getByRole('dialog', { name: 'Delete this workspace?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('all chats in it');
  await expect(dialog).toContainText('Global memory will not be changed.');

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible();
  expect(state.workspaces.some((workspace) => workspace.id === workspaceId)).toBe(true);
  expect(
    state.conversations.some((conversation) => conversation.workspace_id === workspaceId)
  ).toBe(true);

  await page.getByRole('button', { name: 'Workspace actions' }).click();
  await page.mouse.move(0, 0);
  await page.getByRole('menuitem', { name: 'Delete workspace' }).click();
  await page
    .getByRole('button', { name: 'Delete workspace and chats' })
    .click();

  await expect(page).toHaveURL(/\/home\?e2e=workspace-delete$/);
  expect(state.workspaces.some((workspace) => workspace.id === workspaceId)).toBe(false);
  expect(
    state.conversations.some((conversation) => conversation.workspace_id === workspaceId)
  ).toBe(false);
  expect(
    state.memoryItems.some(
      (item) => item.owner_type === 'workspace' && item.owner_id === workspaceId
    )
  ).toBe(false);
  expect(state.conversations.some((conversation) => conversation.id === 'conversation-keen-1')).toBe(true);
  expect(state.memoryItems.some((item) => item.id === 'memory-global-1')).toBe(true);

  const sidePanel = await ensureConversationsOpen(page);
  await expect(sidePanel.getByTestId('workspace-drop-target-workspace-math')).toBeVisible();
  await expect(sidePanel.getByTestId(`workspace-drop-target-${workspaceId}`)).toHaveCount(0);
  await expect(sidePanel.getByRole('button', { name: /Health plan/ })).toHaveCount(0);
});

test('workspace new chat preserves workspace selection after navigating home', async ({ page }) => {
  const workspaceId = 'workspace-health';
  const chatStarted = deferred();

  await mockHomeDataRoutes(page, {
    workspaces: [
      createWorkspace({
        id: workspaceId,
        name: 'Health',
        description: 'Training, recovery, and bloodwork',
        context: 'Use running and cycling training context.',
        icon: 'H',
      }),
    ],
    conversations: [],
  });

  await mockChatRoute(page, async (body) => {
    chatStarted.resolve(body);
    return {
      message: 'Workspace draft answer',
      conversationId: body.conversationId,
      workspaceId: body.workspaceId,
      assistantMessageId: 'assistant-workspace-draft',
      userMessageId: 'user-workspace-draft',
    };
  });

  await page.goto(`/workspaces/${workspaceId}?e2e=workspace-draft`);
  await page.getByRole('main').getByRole('button', { name: 'New chat', exact: true }).click();

  await expect(page).toHaveURL(/\/home\?e2e=workspace-draft$/);

  const composer = page.locator('textarea[placeholder^="Message"]').first();
  await composer.fill('draft workspace send');
  await page.keyboard.press('Enter');

  const chatBody = await chatStarted.promise;
  expect(chatBody).toMatchObject({
    message: 'draft workspace send',
    conversationId: 'conversation-e2e-created-1',
    workspaceId,
    chatMode: 'persistent',
  });
  await expect(page).toHaveURL(/\/home\/conversation-e2e-created-1\?e2e=workspace-draft$/);
});

test('workspace composer persists model changes and enables image attachments for vision models', async ({ page }) => {
  const workspaceId = 'workspace-health';

  await mockHomeDataRoutes(page, {
    workspaces: [
      createWorkspace({
        id: workspaceId,
        name: 'Health',
        description: 'Training, recovery, and bloodwork',
        icon: 'H',
      }),
    ],
    conversations: [],
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
        supportsImages: false,
      },
      {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash',
        provider: 'google',
        providerLabel: 'Google',
        iconKey: 'google',
        description: 'Fast Gemini 3 model with image support.',
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

  await page.goto(`/workspaces/${workspaceId}?e2e=workspace-images`);

  await expect(page.getByRole('button', { name: 'Attach image' })).toBeDisabled();
  await page.getByRole('button', { name: /Chat model: Auto/ }).click();
  await page.getByRole('menuitemradio', { name: /Gemini 3 Flash/ }).click();

  await expect(page.getByRole('button', { name: /Chat model: Gemini 3 Flash/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach image' })).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('keen-chat-model')))
    .toBe('gemini-3-flash-preview');

  await page.reload();
  await expect(page.getByRole('button', { name: /Chat model: Gemini 3 Flash/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Attach image' })).toBeEnabled();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'workspace.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64'
    ),
  });

  await expect(page.getByAltText('workspace.png')).toBeVisible();
});

test('dragging a default chat into a workspace moves the chat and single-source global memory', async ({ page }) => {
  const workspaceId = 'workspace-health';
  const conversationId = 'conversation-keen-drag';
  const chatStarted = deferred();
  const state = await mockHomeDataRoutes(page, {
    workspaces: [
      createWorkspace({
        id: workspaceId,
        name: 'Health',
        icon: 'H',
      }),
    ],
    conversations: [
      createConversation({
        id: conversationId,
        title: 'Aerobic base notes',
      }),
    ],
    messagesByConversationId: {
      [conversationId]: [
        {
          id: 'message-keen-drag-user',
          role: 'user',
          content: 'Remember that I am rebuilding aerobic base.',
          created_at: '2026-06-25T12:00:00.000Z',
          previous_message_id: null,
        },
      ],
    },
    memoryItems: [
      {
        id: 'memory-single-source',
        user_id: 'e2e-user-1',
        owner_type: 'global',
        owner_id: null,
        type: 'goal',
        text: 'User is rebuilding aerobic base.',
        normalized_text: 'user rebuilding aerobic base',
        confidence: 0.9,
        salience: 80,
        stability: 'stable',
        sensitivity: 'normal',
        status: 'active',
        source_conversation_id: conversationId,
        source_message_id: 'message-keen-drag-user',
        source_role: 'user',
        created_at: '2026-06-25T12:00:00.000Z',
        updated_at: '2026-06-25T12:00:00.000Z',
      },
      {
        id: 'memory-shared-global',
        user_id: 'e2e-user-1',
        owner_type: 'global',
        owner_id: null,
        type: 'preference',
        text: 'User likes concise answers.',
        normalized_text: 'user likes concise answers',
        confidence: 0.9,
        salience: 80,
        stability: 'stable',
        sensitivity: 'normal',
        status: 'active',
        source_conversation_id: conversationId,
        source_message_id: 'message-keen-drag-user',
        source_role: 'user',
        created_at: '2026-06-25T12:00:00.000Z',
        updated_at: '2026-06-25T12:00:00.000Z',
      },
    ],
    memoryItemSources: [
      {
        memory_item_id: 'memory-shared-global',
        conversation_id: conversationId,
        message_id: 'message-keen-drag-user',
      },
      {
        memory_item_id: 'memory-shared-global',
        conversation_id: 'conversation-other-global',
        message_id: 'message-other-global-user',
      },
    ],
  });

  await mockChatRoute(page, async (body) => {
    chatStarted.resolve(body);
    return {
      message: 'Moved workspace answer',
      conversationId: body.conversationId,
      workspaceId: body.workspaceId,
      assistantMessageId: 'assistant-after-drag',
      userMessageId: 'user-after-drag',
    };
  });

  await page.goto(`/home/${conversationId}?e2e=workspace-drag-in`);
  const sidePanel = await ensureConversationsOpen(page);
  const chatRow = sidePanel.getByTestId(`conversation-row-${conversationId}`);
  const workspaceRow = sidePanel.getByTestId(`workspace-drop-target-${workspaceId}`);

  await chatRow.dragTo(workspaceRow);

  expect(state.conversations.find((conversation) => conversation.id === conversationId).workspace_id)
    .toBe(workspaceId);
  expect(state.memoryItems.find((item) => item.id === 'memory-single-source').owner_type)
    .toBe('workspace');
  expect(state.memoryItems.find((item) => item.id === 'memory-single-source').owner_id)
    .toBe(workspaceId);
  expect(state.memoryItems.find((item) => item.id === 'memory-shared-global').owner_type)
    .toBe('global');

  if ((await sidePanel.getByRole('button', { name: 'Expand Health' }).count()) > 0) {
    await sidePanel.getByRole('button', { name: 'Expand Health' }).click();
  }
  await expect(sidePanel.getByTestId(`conversation-row-${conversationId}`)).toBeVisible();

  const composer = page.locator('textarea[placeholder^="Message"]').first();
  await composer.fill('continue after move');
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await chatStarted.promise).workspaceId).toBe(workspaceId);
});

test('dragging a workspace chat to another workspace moves the chat and single-source workspace memory', async ({ page }) => {
  const sourceWorkspaceId = 'workspace-health';
  const targetWorkspaceId = 'workspace-math';
  const conversationId = 'conversation-workspace-cross-drag';
  const state = await mockHomeDataRoutes(page, {
    workspaces: [
      createWorkspace({
        id: sourceWorkspaceId,
        name: 'Health',
        icon: 'H',
      }),
      createWorkspace({
        id: targetWorkspaceId,
        name: 'Math',
        icon: 'M',
      }),
    ],
    conversations: [
      createConversation({
        id: conversationId,
        title: 'Workspace transfer plan',
        workspaceId: sourceWorkspaceId,
      }),
    ],
    memoryItems: [
      {
        id: 'memory-workspace-transfer',
        user_id: 'e2e-user-1',
        owner_type: 'workspace',
        owner_id: sourceWorkspaceId,
        type: 'goal',
        text: 'User is comparing training metrics.',
        normalized_text: 'user comparing training metrics',
        confidence: 0.9,
        salience: 80,
        stability: 'stable',
        sensitivity: 'normal',
        status: 'active',
        source_conversation_id: conversationId,
        source_message_id: 'message-workspace-transfer-user',
        source_role: 'user',
        created_at: '2026-06-25T12:00:00.000Z',
        updated_at: '2026-06-25T12:00:00.000Z',
      },
    ],
  });

  await page.goto(`/home/${conversationId}?e2e=workspace-cross-drag`);
  const sidePanel = await ensureConversationsOpen(page);
  if ((await sidePanel.getByRole('button', { name: 'Expand Health' }).count()) > 0) {
    await sidePanel.getByRole('button', { name: 'Expand Health' }).click();
  }

  const chatRow = sidePanel.getByTestId(`conversation-row-${conversationId}`);
  const targetWorkspaceRow = sidePanel.getByTestId(`workspace-drop-target-${targetWorkspaceId}`);

  await chatRow.dragTo(targetWorkspaceRow);

  expect(state.conversations.find((conversation) => conversation.id === conversationId).workspace_id)
    .toBe(targetWorkspaceId);
  expect(state.memoryItems.find((item) => item.id === 'memory-workspace-transfer').owner_type)
    .toBe('workspace');
  expect(state.memoryItems.find((item) => item.id === 'memory-workspace-transfer').owner_id)
    .toBe(targetWorkspaceId);

  if ((await sidePanel.getByRole('button', { name: 'Expand Math' }).count()) > 0) {
    await sidePanel.getByRole('button', { name: 'Expand Math' }).click();
  }
  await expect(sidePanel.getByTestId(`conversation-row-${conversationId}`)).toBeVisible();
});

test('dragging a workspace chat to Chats requires confirmation and leaves workspace memory scoped', async ({ page }) => {
  const workspaceId = 'workspace-health';
  const conversationId = 'conversation-workspace-drag-out';
  const state = await mockHomeDataRoutes(page, {
    workspaces: [
      createWorkspace({
        id: workspaceId,
        name: 'Health',
        icon: 'H',
      }),
    ],
    conversations: [
      createConversation({
        id: conversationId,
        title: 'Workspace plan',
        workspaceId,
      }),
    ],
    memoryItems: [
      {
        id: 'memory-workspace-local',
        user_id: 'e2e-user-1',
        owner_type: 'workspace',
        owner_id: workspaceId,
        type: 'goal',
        text: 'User is rebuilding aerobic base.',
        normalized_text: 'user rebuilding aerobic base',
        confidence: 0.9,
        salience: 80,
        stability: 'stable',
        sensitivity: 'normal',
        status: 'active',
        source_conversation_id: conversationId,
        source_message_id: 'message-workspace-user',
        source_role: 'user',
        created_at: '2026-06-25T12:00:00.000Z',
        updated_at: '2026-06-25T12:00:00.000Z',
      },
    ],
  });

  await page.goto(`/home/${conversationId}?e2e=workspace-drag-out`);
  const sidePanel = await ensureConversationsOpen(page);
  if ((await sidePanel.getByRole('button', { name: 'Expand Health' }).count()) > 0) {
    await sidePanel.getByRole('button', { name: 'Expand Health' }).click();
  }

  const chatRow = sidePanel.getByTestId(`conversation-row-${conversationId}`);
  const chatsRow = sidePanel.getByTestId('global-drop-target');

  await chatRow.dragTo(chatsRow);
  const dialog = page.getByRole('dialog', { name: 'Move this chat to Chats?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Existing workspace memories');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.conversations.find((conversation) => conversation.id === conversationId).workspace_id)
    .toBe(workspaceId);

  await chatRow.dragTo(chatsRow);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Move chat' }).click();
  await expect(dialog).not.toBeVisible();

  expect(state.conversations.find((conversation) => conversation.id === conversationId).workspace_id)
    .toBeNull();
  expect(state.memoryItems.find((item) => item.id === 'memory-workspace-local').owner_type)
    .toBe('workspace');
  expect(state.memoryItems.find((item) => item.id === 'memory-workspace-local').owner_id)
    .toBe(workspaceId);
});

test('workspace composer autosizes and hands first send to the normal home chat runtime', async ({ page }) => {
  const workspaceId = 'workspace-health';
  const conversationId = 'conversation-workspace-created';
  const chatRelease = deferred();
  const chatStarted = deferred();
  const chatBodies = [];

  await mockHomeDataRoutes(page, {
    workspaces: [
      createWorkspace({
        id: workspaceId,
        name: 'Health',
        description: 'Training, recovery, and bloodwork',
        context: 'Use running and cycling training context.',
        icon: 'H',
      }),
    ],
    conversations: [],
    createdConversations: [
      createConversation({
        id: conversationId,
        title: 'first workspace send',
        workspaceId,
      }),
    ],
  });

  await mockChatRoute(page, async (body) => {
    chatBodies.push(body);
    chatStarted.resolve(body);
    await chatRelease.promise;
    return {
      message: 'Workspace answer',
      conversationId: body.conversationId,
      workspaceId: body.workspaceId,
      assistantMessageId: 'assistant-workspace-created',
      userMessageId: 'user-workspace-created',
    };
  });

  await page.goto(`/workspaces/${workspaceId}?e2e=workspace-submit`);

  const composer = page.getByPlaceholder('Message Health...');
  await expect(composer).toBeVisible();
  const initialHeight = await composer.evaluate((node) => node.clientHeight);
  await composer.fill('line one\nline two\nline three\nline four');
  await expect.poll(async () =>
    composer.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }))
  ).toEqual(expect.objectContaining({
    clientHeight: expect.any(Number),
    scrollHeight: expect.any(Number),
  }));
  const grownSize = await composer.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }));
  expect(grownSize.clientHeight).toBeGreaterThan(initialHeight);
  expect(grownSize.scrollHeight).toBeLessThanOrEqual(grownSize.clientHeight + 1);

  await composer.fill('first workspace send');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(new RegExp(`/home/${conversationId}`));
  const chatBody = await chatStarted.promise;
  expect(chatBody).toMatchObject({
    message: 'first workspace send',
    conversationId,
    workspaceId,
    chatMode: 'persistent',
  });
  expect(chatBodies).toHaveLength(1);
  await expect(
    page.getByTestId('home-scroll-container').getByText('first workspace send')
  ).toBeVisible();
  await expect(page.getByText('Workspace answer')).not.toBeVisible();

  chatRelease.resolve();
  await expect(page.getByText('Workspace answer')).toBeVisible();
});
