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

  const contextBox = page.getByPlaceholder(/Add instructions/);
  await expect(contextBox).toHaveValue('Use running and cycling training context.');
  await contextBox.fill('Prefer practical training advice and concise caveats.');
  await page.getByRole('button', { name: 'Save instructions' }).click();

  await expect(contextBox).toHaveValue('Prefer practical training advice and concise caveats.');
  expect(state.workspaces[0].context).toBe('Prefer practical training advice and concise caveats.');
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
  await page.getByRole('button', { name: 'New chat', exact: true }).click();

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
