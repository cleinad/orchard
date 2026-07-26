const { test, expect } = require('@playwright/test');
const { mockHomeDataRoutes } = require('./helpers/homeRouteMocks');

function streamBody(body, {
  response = 'Temporary answer',
  title = body.message,
  titleSource = 'fallback',
  titleStatus = 'completed',
  conversationId = null,
  run = null,
} = {}) {
  return [
    `data: ${JSON.stringify({ type: 'text-delta', delta: response })}\n\n`,
    `data: ${JSON.stringify({
      type: 'data-chatMeta',
      data: {
        message: response,
        conversationId,
        conversationTitle: title,
        conversationTitleSource: titleSource,
        titleStatus,
        threadId: body.threadId ?? body.run.newThreadId ?? null,
        userMessageId: body.run.userMessageId,
        assistantMessageId: body.run.assistantMessageId,
        runId: body.run.runId,
        search: null,
        searchActivity: null,
        ...(run ? { run } : {}),
      },
    })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
}

function persistentRunSnapshot(body, {
  status = 'completed',
  response = 'Persistent answer',
  title = body.message,
  titleSource = 'generated',
} = {}) {
  const now = new Date().toISOString();
  const conversationId = body.run.target.chatId;
  const completed = status === 'completed';
  const cancelled = status === 'cancelled';
  return {
    runId: body.run.runId,
    mode: 'persistent',
    status,
    target: {
      ...body.run.target,
      chatId: conversationId,
      conversationId,
    },
    userMessageId: body.run.userMessageId,
    assistantMessageId: body.run.assistantMessageId,
    createdThreadId: body.run.newThreadId ?? null,
    createdBranchId: body.run.newBranchId ?? null,
    response: completed ? response : null,
    search: null,
    searchActivity: null,
    title: {
      value: title,
      source: titleSource,
      version: titleSource === 'generated' ? 1 : 0,
      runId: body.run.runId,
    },
    subsystems: {
      response: completed ? 'completed' : cancelled ? 'cancelled' : 'running',
      title: completed ? 'completed' : cancelled ? 'cancelled' : 'running',
      search: 'skipped',
      memory: completed ? 'completed' : cancelled ? 'cancelled' : 'pending',
    },
    errorCode: null,
    errorMessage: null,
    acceptedAt: now,
    updatedAt: now,
    completedAt: completed || cancelled ? now : null,
    expiresAt: null,
  };
}

async function createPersistentChat(page, prompt) {
  await page.goto('/home?e2e=chat-run-lifecycle');
  await page.getByLabel('Message composer').fill(prompt);
  await page.getByLabel('Message composer').press('Enter');
}

async function createTemporaryChat(page, prompt) {
  await page.goto('/home?e2e=chat-run-lifecycle');
  await page.getByRole('main').getByLabel('New temporary chat').click();
  await page.getByLabel('Message composer').fill(prompt);
  await page.getByLabel('Message composer').press('Enter');
}

test('new persistent submission does not reconcile before server acknowledgement', async ({ page }) => {
  let reconciliationCalls = 0;
  await mockHomeDataRoutes(page, { conversations: [], messagesByConversationId: {} });
  await page.route('**/api/chat-runs/**', async (route) => {
    reconciliationCalls += 1;
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Run not found', code: 'run_not_found' }),
    });
  });
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 700));
    const run = persistentRunSnapshot(body, {
      response: 'Acknowledged persistent response',
      title: 'Acknowledged Run',
    });
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: streamBody(body, {
        response: run.response,
        title: run.title.value,
        titleSource: run.title.source,
        conversationId: run.target.conversationId,
        run,
      }),
    });
  });

  await createPersistentChat(page, 'Wait for server acknowledgement');

  await expect(page.getByText('Acknowledged persistent response')).toBeVisible();
  await expect(page.getByText('This run is no longer available.')).toHaveCount(0);
  expect(reconciliationCalls).toBe(0);
});

test('persistent reload before acknowledgement reconciles without resubmission', async ({ page }) => {
  let submissions = 0;
  let authoritativeRun = null;
  const homeState = await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
  });
  await page.route('**/api/chat-runs/**', async (route) => {
    await route.fulfill({
      status: authoritativeRun ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(authoritativeRun
        ? { run: authoritativeRun }
        : { error: 'Run not found', code: 'run_not_found' }),
    });
  });
  await page.route('**/api/chat', async (route) => {
    submissions += 1;
    const body = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 700));
    authoritativeRun = persistentRunSnapshot(body, {
      response: 'Recovered after pre-ack reload',
      title: 'Recovered Reload',
    });
    const conversationId = authoritativeRun.target.conversationId;
    const now = new Date().toISOString();
    homeState.conversations.unshift({
      id: conversationId,
      title: authoritativeRun.title.value,
      mentor_id: null,
      workspace_id: null,
      created_at: now,
      updated_at: now,
    });
    homeState.messagesByConversationId[conversationId] = [
      {
        id: authoritativeRun.userMessageId,
        role: 'user',
        content: body.message,
        previous_message_id: null,
        created_at: now,
        search_metadata: null,
      },
      {
        id: authoritativeRun.assistantMessageId,
        role: 'assistant',
        content: authoritativeRun.response,
        previous_message_id: authoritativeRun.userMessageId,
        created_at: now,
        search_metadata: null,
      },
    ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: streamBody(body, {
        response: authoritativeRun.response,
        title: authoritativeRun.title.value,
        conversationId,
        run: authoritativeRun,
      }),
    }).catch(() => null);
  });

  await createPersistentChat(page, 'Recover this persistent request');
  await expect(page.getByRole('button', { name: 'Stop response' })).toBeVisible();
  await page.reload();

  await expect(page.getByText('Recovered after pre-ack reload')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/home/${authoritativeRun.target.conversationId}`));
  expect(submissions).toBe(1);
});

test('persistent reconciliation failures stay recoverable and do not masquerade as missing runs', async ({ page }) => {
  const conversationId = '20000000-0000-4000-8000-000000000009';
  const now = new Date().toISOString();
  await mockHomeDataRoutes(page, {
    conversations: [{
      id: conversationId,
      title: 'Recoverable Reconciliation',
      mentor_id: null,
      workspace_id: null,
      created_at: now,
      updated_at: now,
    }],
    messagesByConversationId: {
      [conversationId]: [{
        id: '30000000-0000-4000-8000-000000000009',
        role: 'user',
        content: 'Recover this status',
        previous_message_id: null,
        created_at: now,
        search_metadata: null,
      }],
    },
  });
  await page.route('**/api/chat-runs/**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Failed to load chat run',
        code: 'run_lookup_failed',
      }),
    });
  });

  await page.goto(`/home/${conversationId}?e2e=chat-run-lifecycle`);
  const body = {
    message: 'Recover this status',
    run: {
      runId: '10000000-0000-4000-8000-000000000009',
      userMessageId: '30000000-0000-4000-8000-000000000009',
      assistantMessageId: '40000000-0000-4000-8000-000000000009',
      target: {
        kind: 'main',
        chatId: conversationId,
        conversationId,
        threadId: null,
        branchId: null,
        branchSourceMessageId: null,
        sourceMessageId: null,
        expectedPredecessorId: null,
      },
    },
  };
  const streamingRun = persistentRunSnapshot(body, { status: 'streaming' });
  await page.evaluate((run) => {
    window.sessionStorage.setItem('orchard-chat-runs-v2', JSON.stringify([run]));
  }, streamingRun);
  await page.reload();

  await expect.poll(async () => page.evaluate(() => {
    const stored = window.sessionStorage.getItem('orchard-chat-runs-v2');
    return stored ? JSON.parse(stored)[0]?.status ?? null : null;
  })).toBe('interrupted');
  const errorRow = page.locator('[data-message-error="true"]');
  await expect(errorRow).toContainText(
    'The response status could not be confirmed. Reconnect to check again.'
  );
  await expect(page.getByText('This run is no longer available.')).toHaveCount(0);
  await expect(errorRow.getByRole('button', { name: /Copy/ })).toHaveCount(0);
  await expect(errorRow.getByRole('button', { name: 'Branch' })).toHaveCount(0);
});

test('a pending persistent title reconciles after response completion and reload', async ({ page }) => {
  const conversationId = '20000000-0000-4000-8000-000000000010';
  const now = new Date().toISOString();
  const body = {
    message: 'Give this conversation a better title',
    run: {
      runId: '10000000-0000-4000-8000-000000000010',
      userMessageId: '30000000-0000-4000-8000-000000000010',
      assistantMessageId: '40000000-0000-4000-8000-000000000010',
      target: {
        kind: 'main',
        chatId: conversationId,
        conversationId,
        threadId: null,
        branchId: null,
        branchSourceMessageId: null,
        sourceMessageId: null,
        expectedPredecessorId: null,
      },
    },
  };
  const authoritativeRun = persistentRunSnapshot(body, {
    response: 'The response was already completed.',
    title: 'Recovered Generated Title',
  });
  const pendingTitleRun = {
    ...authoritativeRun,
    title: {
      ...authoritativeRun.title,
      value: body.message,
      source: 'fallback',
      version: 0,
    },
    subsystems: { ...authoritativeRun.subsystems, title: 'running' },
  };
  const homeState = await mockHomeDataRoutes(page, {
    conversations: [{
      id: conversationId,
      title: body.message,
      mentor_id: null,
      workspace_id: null,
      created_at: now,
      updated_at: now,
    }],
    messagesByConversationId: {
      [conversationId]: [
        {
          id: body.run.userMessageId,
          role: 'user',
          content: body.message,
          previous_message_id: null,
          created_at: now,
          search_metadata: null,
        },
        {
          id: body.run.assistantMessageId,
          role: 'assistant',
          content: authoritativeRun.response,
          previous_message_id: body.run.userMessageId,
          created_at: now,
          search_metadata: null,
        },
      ],
    },
  });
  await page.route('**/api/chat-runs/**', async (route) => {
    homeState.conversations[0].title = authoritativeRun.title.value;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ run: authoritativeRun }),
    });
  });

  await page.goto(`/home/${conversationId}?e2e=chat-run-lifecycle`);
  await page.evaluate((run) => {
    window.sessionStorage.setItem('orchard-chat-runs-v2', JSON.stringify([run]));
  }, pendingTitleRun);
  await page.reload();

  await page.getByRole('button', { name: 'Open conversations' }).click();
  await expect(page.getByRole('button', { name: /Recovered Generated Title/ })).toBeVisible();
  await expect.poll(async () => page.evaluate(() =>
    window.sessionStorage.getItem('orchard-chat-runs-v2')
  )).toBeNull();
});

test('a superseded generated title cannot replace a manual sidebar title', async ({ page }) => {
  const conversationId = '20000000-0000-4000-8000-000000000011';
  const now = new Date().toISOString();
  const body = {
    message: 'Original fallback title',
    run: {
      runId: '10000000-0000-4000-8000-000000000011',
      userMessageId: '30000000-0000-4000-8000-000000000011',
      assistantMessageId: '40000000-0000-4000-8000-000000000011',
      target: {
        kind: 'main',
        chatId: conversationId,
        conversationId,
        threadId: null,
        branchId: null,
        branchSourceMessageId: null,
        sourceMessageId: null,
        expectedPredecessorId: null,
      },
    },
  };
  const supersededRun = persistentRunSnapshot(body, {
    response: 'The response completed after a manual rename.',
    title: body.message,
    titleSource: 'fallback',
  });
  const pendingTitleRun = {
    ...supersededRun,
    subsystems: { ...supersededRun.subsystems, title: 'running' },
  };
  await mockHomeDataRoutes(page, {
    conversations: [{
      id: conversationId,
      title: 'My Manual Title',
      mentor_id: null,
      workspace_id: null,
      created_at: now,
      updated_at: now,
    }],
    messagesByConversationId: { [conversationId]: [] },
  });
  await page.route('**/api/chat-runs/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ run: supersededRun }),
    });
  });

  await page.goto(`/home/${conversationId}?e2e=chat-run-lifecycle`);
  await page.evaluate((run) => {
    window.sessionStorage.setItem('orchard-chat-runs-v2', JSON.stringify([run]));
  }, pendingTitleRun);
  await page.reload();

  await page.getByRole('button', { name: 'Open conversations' }).click();
  await expect(page.getByRole('button', { name: /My Manual Title/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Original fallback title/ })).toHaveCount(0);
});

test('persistent Stop waits for acceptance and never renders a missing-run error', async ({ page }) => {
  let cancellationCalls = 0;
  let requestBody = null;
  await mockHomeDataRoutes(page, { conversations: [], messagesByConversationId: {} });
  await page.route('**/api/chat-runs/**', async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/cancel')) {
      cancellationCalls += 1;
      if (cancellationCalls >= 3 && requestBody) {
        const run = persistentRunSnapshot(requestBody, { status: 'cancelled' });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ run }),
        });
        return;
      }
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Run not found', code: 'run_not_found' }),
    });
  });
  await page.route('**/api/chat', async (route) => {
    requestBody = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: [DONE]\n\n',
    }).catch(() => null);
  });

  await createPersistentChat(page, 'Stop before acknowledgement');
  const stop = page.getByRole('button', { name: 'Stop response' });
  await expect(stop).toBeVisible();
  await stop.click();

  await expect(stop).toHaveCount(0);
  await expect(page.getByText('This run is no longer available.')).toHaveCount(0);
  await expect(page.locator('[data-message-role="assistant"]')).toHaveCount(0);
  expect(cancellationCalls).toBe(3);
});

test('a rejected first persistent submission restores the editable draft', async ({ page }) => {
  await mockHomeDataRoutes(page, { conversations: [], messagesByConversationId: {} });
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Mentor not found',
      }),
    });
  });

  const prompt = 'Keep this rejected first prompt editable';
  await createPersistentChat(page, prompt);

  await expect(page).toHaveURL(/\/home\?e2e=chat-run-lifecycle$/);
  await expect(page.getByLabel('Message composer')).toHaveValue(prompt);
  await expect(page.getByTestId('composer-image-warning')).toHaveText('Mentor not found');
  await expect(page.locator('[data-message-error="true"]')).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => ({
    promotion: window.sessionStorage.getItem('orchard-provisional-chat-promotions-v1'),
    run: window.sessionStorage.getItem('orchard-chat-runs-v2'),
  }))).toEqual({ promotion: null, run: null });
});

test('persistent generation continues across in-app navigation', async ({ page }) => {
  const workspaceId = 'workspace-persistent-run-navigation';
  const now = new Date().toISOString();
  let releaseResponse;
  const responseGate = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  const state = await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
    workspaces: [{
      id: workspaceId,
      name: 'Persistent Run Navigation',
      description: null,
      context: null,
      icon: 'P',
      accent_color: null,
      created_at: now,
      updated_at: now,
    }],
  });
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    await responseGate;
    const run = persistentRunSnapshot(body, {
      response: 'Persistent work finished off-screen',
      title: 'Off-Screen Persistent Work',
    });
    const conversationId = run.target.conversationId;
    const createdAt = new Date().toISOString();
    const conversation = state.conversations.find((entry) => entry.id === conversationId);
    if (conversation) conversation.title = run.title.value;
    state.messagesByConversationId[conversationId] = [
      {
        id: run.userMessageId,
        role: 'user',
        content: body.message,
        previous_message_id: null,
        created_at: createdAt,
        search_metadata: null,
      },
      {
        id: run.assistantMessageId,
        role: 'assistant',
        content: run.response,
        previous_message_id: run.userMessageId,
        created_at: createdAt,
        search_metadata: null,
      },
    ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: streamBody(body, {
        response: run.response,
        title: run.title.value,
        titleSource: run.title.source,
        conversationId,
        run,
      }),
    });
  });

  await createPersistentChat(page, 'Keep this persistent request running');
  await expect(page.getByRole('button', { name: 'Stop response' })).toBeVisible();
  await page.getByRole('button', { name: 'Open conversations' }).click();
  await page.getByTestId(`workspace-drop-target-${workspaceId}`)
    .getByRole('button')
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${workspaceId}`));

  releaseResponse();
  await page.goBack();
  await expect(page.getByText('Persistent work finished off-screen')).toBeVisible();
});

test('completed temporary response and generated title restore locally after reload', async ({ page }) => {
  let reconciliationCalls = 0;
  await mockHomeDataRoutes(page, { conversations: [], messagesByConversationId: {} });
  await page.route('**/api/chat-runs/**', async (route) => {
    reconciliationCalls += 1;
    await route.fulfill({ status: 500, body: 'temporary runs must not reconcile remotely' });
  });
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: streamBody(body, {
        response: 'Locally restored temporary answer',
        title: 'Local Garden Plan',
        titleSource: 'generated',
      }),
    });
  });

  await createTemporaryChat(page, 'Plan a small balcony garden');
  await expect(page.getByText('Locally restored temporary answer')).toBeVisible();

  await page.reload();

  await page.getByRole('button', { name: 'Open conversations' }).click();
  await page.getByRole('button', { name: 'Temp Local Garden Plan' }).click();
  await expect(page.getByText('Locally restored temporary answer')).toBeVisible();
  expect(reconciliationCalls).toBe(0);
});

test('reload during a temporary generation becomes interrupted without resubmission', async ({ page }) => {
  let submissions = 0;
  let reconciliationCalls = 0;
  await mockHomeDataRoutes(page, { conversations: [], messagesByConversationId: {} });
  await page.route('**/api/chat-runs/**', async (route) => {
    reconciliationCalls += 1;
    await route.fulfill({ status: 500, body: 'temporary runs must not reconcile remotely' });
  });
  await page.route('**/api/chat', async (route) => {
    submissions += 1;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: [DONE]\n\n',
    }).catch(() => null);
  });

  await createTemporaryChat(page, 'Do not duplicate this temporary request');
  await expect(page.getByRole('button', { name: 'Stop response' })).toBeVisible();
  await page.reload();

  await page.getByRole('button', { name: 'Open conversations' }).click();
  await page.getByRole('button', {
    name: 'Temp Do not duplicate this temporary request',
  }).click();
  await expect(page.getByText(
    'The temporary response was interrupted. Retry when you are ready.'
  )).toBeVisible();
  const errorRow = page.locator('[data-message-error="true"]');
  await expect(errorRow.getByRole('button', { name: /Copy/ })).toHaveCount(0);
  await expect(errorRow.getByRole('button', { name: 'Branch' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop response' })).toHaveCount(0);
  expect(submissions).toBe(1);
  expect(reconciliationCalls).toBe(0);
});

test('ambiguous temporary network failure is not automatically retried', async ({ page }) => {
  let submissions = 0;
  await mockHomeDataRoutes(page, { conversations: [], messagesByConversationId: {} });
  await page.route('**/api/chat-runs/**', async (route) => {
    await route.fulfill({ status: 500, body: 'temporary runs must not reconcile remotely' });
  });
  await page.route('**/api/chat', async (route) => {
    submissions += 1;
    await route.abort('connectionreset');
  });

  await createTemporaryChat(page, 'Fail this connection once');

  await expect(page.getByText(
    'The temporary response was interrupted. Retry when you are ready.'
  )).toBeVisible();
  await page.waitForTimeout(1_000);
  expect(submissions).toBe(1);
});

test('repeated submission while a temporary run is active starts only one request', async ({ page }) => {
  let submissions = 0;
  await mockHomeDataRoutes(page, { conversations: [], messagesByConversationId: {} });
  await page.route('**/api/chat', async (route) => {
    submissions += 1;
    const body = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: streamBody(body, { response: 'Only one temporary response' }),
    });
  });

  await page.goto('/home?e2e=chat-run-deduplication');
  await page.getByRole('main').getByLabel('New temporary chat').click();
  const composer = page.getByLabel('Message composer');
  await composer.fill('Submit this temporary prompt once');
  await composer.press('Enter');
  await composer.press('Enter');

  await expect(page.getByText('Only one temporary response')).toBeVisible();
  expect(submissions).toBe(1);
});

test('temporary generation continues across in-app navigation while connected', async ({ page }) => {
  const workspaceId = 'workspace-run-navigation';
  const now = new Date().toISOString();
  await mockHomeDataRoutes(page, {
    conversations: [],
    messagesByConversationId: {},
    workspaces: [{
      id: workspaceId,
      name: 'Run Navigation',
      description: null,
      context: null,
      icon: 'R',
      accent_color: null,
      created_at: now,
      updated_at: now,
    }],
  });
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: streamBody(body, {
        response: 'Finished while viewing the workspace',
        title: 'Background Navigation',
        titleSource: 'generated',
      }),
    });
  });

  await createTemporaryChat(page, 'Keep working while I navigate');
  await expect(page.getByRole('button', { name: 'Stop response' })).toBeVisible();
  await page.getByRole('button', { name: 'Open conversations' }).click();
  await page.getByTestId(`workspace-drop-target-${workspaceId}`)
    .getByRole('button')
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${workspaceId}`));

  await page.goBack();
  await page.getByRole('button', { name: 'Temp Background Navigation' }).click();
  await expect(page.getByText('Finished while viewing the workspace')).toBeVisible();
});

test('Stop cancels a temporary run locally without a cancellation API', async ({ page }) => {
  let cancellationCalls = 0;
  await mockHomeDataRoutes(page, { conversations: [], messagesByConversationId: {} });
  await page.route('**/api/chat-runs/**', async (route) => {
    cancellationCalls += 1;
    await route.fulfill({ status: 500, body: 'temporary runs must cancel locally' });
  });
  await page.route('**/api/chat', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: [DONE]\n\n',
    }).catch(() => null);
  });

  await createTemporaryChat(page, 'Cancel this response');
  const stop = page.getByRole('button', { name: 'Stop response' });
  await expect(stop).toBeVisible();
  await stop.click();

  await expect(stop).toHaveCount(0);
  await expect(page.locator('[data-message-role="assistant"]')).toHaveCount(0);
  expect(cancellationCalls).toBe(0);
});
