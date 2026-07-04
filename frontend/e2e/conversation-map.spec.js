const { test, expect } = require('@playwright/test');
const { gotoHomeFixture } = require('./helpers/homeFixture');
const { mockHomeDataRoutes } = require('./helpers/homeRouteMocks');
const { selectTextInMessage } = require('./helpers/selectText');

const conversationId = 'conversation-map-persistent';
const crowdedConversationId = 'conversation-map-crowded';
const linearConversationId = 'conversation-map-linear';
const stableLayoutConversationId = 'conversation-map-stable-layout';
const ROOT_QUESTION = 'Give me two ways to explain delayed browser paint.';
const ROOT_REPLY =
  'We can explain it as event-loop scheduling or as render-pipeline coordination.';
const MAIN_REPLY =
  'In the event loop, microtasks drain before the browser is allowed to paint.';
const ALT_REPLY =
  'Paint is deferred while layout, style, and queued microtasks are still unsettled.';
const ALT_NESTED_VISUAL_PROMPT = 'Make it more visual instead.';
const ALT_NESTED_VISUAL =
  'Imagine the frame waiting backstage while queued reactions keep rewriting the scene.';
const ALT_NESTED_VISUAL_LONG = [
  ALT_NESTED_VISUAL,
  'The curtain cannot rise yet because another cue lands, another prop shifts, and the scene is still being rewritten.',
  'Every microtask is like one more stagehand running on with a last-second note before the spotlight is allowed to turn on.',
  '- Layout checks the marks.',
  '- Style fixes the costumes.',
  '- Paint keeps waiting in the wings.',
  'Only when the **backstage traffic settles** can the frame walk out in costume and present the finished moment to the audience.',
  'Until then, the browser keeps the curtain down because showing the scene too early would expose a half-built set.',
  'That is why a seemingly small chain of queued reactions can delay the visible frame even when the script itself feels short.',
].join('\n\n');

function createConversation({
  id,
  title,
  mentorId = null,
  updatedAt = '2026-04-15T09:02:00.000Z',
  createdAt = '2026-04-15T09:00:00.000Z',
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
  previousMessageId,
}) {
  return {
    id,
    role,
    content,
    created_at: createdAt,
    previous_message_id: previousMessageId,
  };
}

function createBranch({
  id,
  sourceMessageId,
  entryMessageId,
  title,
  isMain,
  position,
}) {
  return {
    id,
    source_message_id: sourceMessageId,
    entry_message_id: entryMessageId,
    title,
    is_main: isMain,
    position,
  };
}

function createConversationMapState() {
  return {
    conversations: [
      createConversation({
        id: conversationId,
        title: 'Conversation Map Demo',
      }),
    ],
    messagesByConversationId: {
      [conversationId]: [
        createMessage({
          id: 'map-user-root',
          role: 'user',
          content: ROOT_QUESTION,
          createdAt: '2026-04-15T09:00:00.000Z',
          previousMessageId: null,
        }),
        createMessage({
          id: 'map-assistant-root',
          role: 'assistant',
          content: ROOT_REPLY,
          createdAt: '2026-04-15T09:00:10.000Z',
          previousMessageId: 'map-user-root',
        }),
        createMessage({
          id: 'map-main-user',
          role: 'user',
          content: 'Start with the event-loop explanation.',
          createdAt: '2026-04-15T09:00:20.000Z',
          previousMessageId: 'map-assistant-root',
        }),
        createMessage({
          id: 'map-main-assistant',
          role: 'assistant',
          content: MAIN_REPLY,
          createdAt: '2026-04-15T09:00:30.000Z',
          previousMessageId: 'map-main-user',
        }),
        createMessage({
          id: 'map-alt-user',
          role: 'user',
          content: 'Take the render-pipeline route instead.',
          createdAt: '2026-04-15T09:00:40.000Z',
          previousMessageId: 'map-assistant-root',
        }),
        createMessage({
          id: 'map-alt-assistant',
          role: 'assistant',
          content: ALT_REPLY,
          createdAt: '2026-04-15T09:00:50.000Z',
          previousMessageId: 'map-alt-user',
        }),
        createMessage({
          id: 'map-alt-nested-main-user',
          role: 'user',
          content: 'Now make that explanation more technical.',
          createdAt: '2026-04-15T09:01:00.000Z',
          previousMessageId: 'map-alt-assistant',
        }),
        createMessage({
          id: 'map-alt-nested-main-assistant',
          role: 'assistant',
          content: 'The renderer cannot commit a frame while pending microtasks can still mutate the DOM.',
          createdAt: '2026-04-15T09:01:10.000Z',
          previousMessageId: 'map-alt-nested-main-user',
        }),
        createMessage({
          id: 'map-alt-nested-alt-user',
          role: 'user',
          content: ALT_NESTED_VISUAL_PROMPT,
          createdAt: '2026-04-15T09:01:20.000Z',
          previousMessageId: 'map-alt-assistant',
        }),
        createMessage({
          id: 'map-alt-nested-alt-assistant',
          role: 'assistant',
          content: ALT_NESTED_VISUAL_LONG,
          createdAt: '2026-04-15T09:01:30.000Z',
          previousMessageId: 'map-alt-nested-alt-user',
        }),
      ],
    },
    branchesByConversationId: {
      [conversationId]: [
        createBranch({
          id: 'map-branch-main',
          sourceMessageId: 'map-assistant-root',
          entryMessageId: 'map-main-user',
          title: 'Main',
          isMain: true,
          position: 0,
        }),
        createBranch({
          id: 'map-branch-render-pipeline',
          sourceMessageId: 'map-assistant-root',
          entryMessageId: 'map-alt-user',
          title: 'Render pipeline',
          isMain: false,
          position: 1,
        }),
        createBranch({
          id: 'map-branch-technical',
          sourceMessageId: 'map-alt-assistant',
          entryMessageId: 'map-alt-nested-main-user',
          title: 'Technical',
          isMain: true,
          position: 0,
        }),
        createBranch({
          id: 'map-branch-visual',
          sourceMessageId: 'map-alt-assistant',
          entryMessageId: 'map-alt-nested-alt-user',
          title: 'Visual',
          isMain: false,
          position: 1,
        }),
      ],
    },
  };
}

function createLinearConversationMapState() {
  return {
    conversations: [
      createConversation({
        id: linearConversationId,
        title: 'Conversation Map Linear Path',
      }),
    ],
    messagesByConversationId: {
      [linearConversationId]: [
        createMessage({
          id: 'linear-user-root',
          role: 'user',
          content: 'Sketch the smallest useful explanation of browser paint.',
          createdAt: '2026-04-15T09:00:00.000Z',
          previousMessageId: null,
        }),
      ],
    },
    branchesByConversationId: {
      [linearConversationId]: [],
    },
  };
}

function createCrowdedConversationMapState() {
  return {
    conversations: [
      createConversation({
        id: crowdedConversationId,
        title: 'Conversation Map Crowded Layout',
      }),
    ],
    messagesByConversationId: {
      [crowdedConversationId]: [
        createMessage({
          id: 'crowded-user-root',
          role: 'user',
          content: 'Show me two routes and then branch both of them.',
          createdAt: '2026-04-15T10:00:00.000Z',
          previousMessageId: null,
        }),
        createMessage({
          id: 'crowded-assistant-root',
          role: 'assistant',
          content: 'We can take a primary route or an alternate route first.',
          createdAt: '2026-04-15T10:00:10.000Z',
          previousMessageId: 'crowded-user-root',
        }),
        createMessage({
          id: 'crowded-main-user',
          role: 'user',
          content: 'Take the primary route.',
          createdAt: '2026-04-15T10:00:20.000Z',
          previousMessageId: 'crowded-assistant-root',
        }),
        createMessage({
          id: 'crowded-main-assistant',
          role: 'assistant',
          content: 'This is the primary route.',
          createdAt: '2026-04-15T10:00:30.000Z',
          previousMessageId: 'crowded-main-user',
        }),
        createMessage({
          id: 'crowded-alt-user',
          role: 'user',
          content: 'Take the alternate route.',
          createdAt: '2026-04-15T10:00:40.000Z',
          previousMessageId: 'crowded-assistant-root',
        }),
        createMessage({
          id: 'crowded-alt-assistant',
          role: 'assistant',
          content: 'This is the alternate route.',
          createdAt: '2026-04-15T10:00:50.000Z',
          previousMessageId: 'crowded-alt-user',
        }),
        createMessage({
          id: 'crowded-main-main-user',
          role: 'user',
          content: 'Continue the primary route normally.',
          createdAt: '2026-04-15T10:01:00.000Z',
          previousMessageId: 'crowded-main-assistant',
        }),
        createMessage({
          id: 'crowded-main-main-assistant',
          role: 'assistant',
          content: 'Primary route continues straight.',
          createdAt: '2026-04-15T10:01:10.000Z',
          previousMessageId: 'crowded-main-main-user',
        }),
        createMessage({
          id: 'crowded-main-alt-user',
          role: 'user',
          content: 'Fork the primary route into a side path.',
          createdAt: '2026-04-15T10:01:20.000Z',
          previousMessageId: 'crowded-main-assistant',
        }),
        createMessage({
          id: 'crowded-main-alt-assistant',
          role: 'assistant',
          content: 'Primary route side path.',
          createdAt: '2026-04-15T10:01:30.000Z',
          previousMessageId: 'crowded-main-alt-user',
        }),
        createMessage({
          id: 'crowded-alt-main-user',
          role: 'user',
          content: 'Continue the alternate route normally.',
          createdAt: '2026-04-15T10:01:40.000Z',
          previousMessageId: 'crowded-alt-assistant',
        }),
        createMessage({
          id: 'crowded-alt-main-assistant',
          role: 'assistant',
          content: 'Alternate route continues straight.',
          createdAt: '2026-04-15T10:01:50.000Z',
          previousMessageId: 'crowded-alt-main-user',
        }),
      ],
    },
    branchesByConversationId: {
      [crowdedConversationId]: [
        createBranch({
          id: 'crowded-root-main',
          sourceMessageId: 'crowded-assistant-root',
          entryMessageId: 'crowded-main-user',
          title: 'Main',
          isMain: true,
          position: 0,
        }),
        createBranch({
          id: 'crowded-root-alt',
          sourceMessageId: 'crowded-assistant-root',
          entryMessageId: 'crowded-alt-user',
          title: 'Alternate',
          isMain: false,
          position: 1,
        }),
        createBranch({
          id: 'crowded-main-main',
          sourceMessageId: 'crowded-main-assistant',
          entryMessageId: 'crowded-main-main-user',
          title: 'Primary main',
          isMain: true,
          position: 0,
        }),
        createBranch({
          id: 'crowded-main-alt',
          sourceMessageId: 'crowded-main-assistant',
          entryMessageId: 'crowded-main-alt-user',
          title: 'Primary side',
          isMain: false,
          position: 1,
        }),
        createBranch({
          id: 'crowded-alt-main',
          sourceMessageId: 'crowded-alt-assistant',
          entryMessageId: 'crowded-alt-main-user',
          title: 'Alternate main',
          isMain: true,
          position: 0,
        }),
      ],
    },
  };
}

function createStableLayoutConversationMapState() {
  return {
    conversations: [
      createConversation({
        id: stableLayoutConversationId,
        title: 'Conversation Map Stable Layout',
      }),
    ],
    messagesByConversationId: {
      [stableLayoutConversationId]: [
        createMessage({
          id: 'stable-root-user',
          role: 'user',
          content: 'Show me three directions but keep the map layout fixed.',
          createdAt: '2026-04-15T11:00:00.000Z',
          previousMessageId: null,
        }),
        createMessage({
          id: 'stable-root-assistant',
          role: 'assistant',
          content: 'We can take the first route, the second route, or the third route.',
          createdAt: '2026-04-15T11:00:10.000Z',
          previousMessageId: 'stable-root-user',
        }),
        createMessage({
          id: 'stable-first-user',
          role: 'user',
          content: 'Take the first route.',
          createdAt: '2026-04-15T11:00:20.000Z',
          previousMessageId: 'stable-root-assistant',
        }),
        createMessage({
          id: 'stable-first-assistant',
          role: 'assistant',
          content: 'This is the first route.',
          createdAt: '2026-04-15T11:00:30.000Z',
          previousMessageId: 'stable-first-user',
        }),
        createMessage({
          id: 'stable-second-user',
          role: 'user',
          content: 'Take the second route.',
          createdAt: '2026-04-15T11:00:40.000Z',
          previousMessageId: 'stable-root-assistant',
        }),
        createMessage({
          id: 'stable-second-assistant',
          role: 'assistant',
          content: 'This is the second route.',
          createdAt: '2026-04-15T11:00:50.000Z',
          previousMessageId: 'stable-second-user',
        }),
        createMessage({
          id: 'stable-third-user',
          role: 'user',
          content: 'Take the third route.',
          createdAt: '2026-04-15T11:01:00.000Z',
          previousMessageId: 'stable-root-assistant',
        }),
        createMessage({
          id: 'stable-third-assistant',
          role: 'assistant',
          content: 'This is the third route.',
          createdAt: '2026-04-15T11:01:10.000Z',
          previousMessageId: 'stable-third-user',
        }),
      ],
    },
    branchesByConversationId: {
      [stableLayoutConversationId]: [
        createBranch({
          id: 'stable-first-branch',
          sourceMessageId: 'stable-root-assistant',
          entryMessageId: 'stable-first-user',
          title: 'First',
          isMain: false,
          position: 0,
        }),
        createBranch({
          id: 'stable-second-branch',
          sourceMessageId: 'stable-root-assistant',
          entryMessageId: 'stable-second-user',
          title: 'Second',
          isMain: false,
          position: 1,
        }),
        createBranch({
          id: 'stable-third-branch',
          sourceMessageId: 'stable-root-assistant',
          entryMessageId: 'stable-third-user',
          title: 'Third',
          isMain: false,
          position: 2,
        }),
      ],
    },
  };
}

test('desktop map opens in a split pane and activates a full branch route from one click', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockHomeDataRoutes(page, createConversationMapState());

  await page.goto(`/home/${conversationId}?e2e=conversation-map-desktop`);

  await expect(page.getByText(ROOT_QUESTION)).toBeVisible();
  await expect(page.getByText(MAIN_REPLY)).toBeVisible();
  await expect(page.getByText(ALT_REPLY)).toHaveCount(0);

  await page.getByTestId('conversation-map-toggle').click();
  const mapPane = page.getByTestId('conversation-map-desktop');
  await expect(mapPane).toBeVisible();

  const rootTurnNode = mapPane.locator('[data-map-node-id="map-assistant-root"]');
  await expect(rootTurnNode).toContainText(ROOT_QUESTION);
  await expect(rootTurnNode).toContainText(ROOT_REPLY);
  await expect(mapPane.getByText('Render pipeline')).toHaveCount(0);

  await mapPane.locator('[data-map-node-id="map-alt-nested-alt-assistant"]').click();

  const transcript = page.getByTestId('home-scroll-container');
  await expect(transcript.getByText(ALT_REPLY)).toBeVisible();
  await expect(transcript.getByText(ALT_NESTED_VISUAL)).toBeVisible();
  await expect(transcript.getByText(MAIN_REPLY)).toHaveCount(0);

  const getAnchorTopOffset = () => page.evaluate(() => {
    const container = document.querySelector('[data-testid="home-scroll-container"]');
    const prompt = document.querySelector('[data-message-id="map-alt-nested-alt-user"]');
    if (!(container instanceof HTMLElement) || !(prompt instanceof HTMLElement)) {
      throw new Error('Transcript container or prompt anchor is missing');
    }

    const containerRect = container.getBoundingClientRect();
    const promptRect = prompt.getBoundingClientRect();

    return {
      topOffset: promptRect.top - containerRect.top,
    };
  });

  const anchorPosition = await getAnchorTopOffset();
  expect(anchorPosition.topOffset).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await getAnchorTopOffset()).topOffset).toBeLessThan(180);
});

test('desktop map is available for a linear conversation with one turn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockHomeDataRoutes(page, createLinearConversationMapState());

  await page.goto(`/home/${linearConversationId}?e2e=conversation-map-linear`);

  await expect(page.getByTestId('conversation-map-toggle')).toBeVisible();

  await page.getByTestId('conversation-map-toggle').click();
  const mapPane = page.getByTestId('conversation-map-desktop');
  await expect(mapPane).toBeVisible();
  await expect(mapPane.getByText('1 turn')).toBeVisible();

  const rootTurnNode = mapPane.locator('[data-map-node-id="linear-user-root"]');
  await expect(rootTurnNode).toContainText(
    'Sketch the smallest useful explanation of browser paint.'
  );
  await expect(rootTurnNode).toContainText('Response pending.');
  await expect(mapPane.locator('[data-map-node="true"]')).toHaveCount(1);
});

test('desktop map navigation does not rebound the transcript back to the bottom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockHomeDataRoutes(page, createConversationMapState());

  await page.goto(`/home/${conversationId}?e2e=conversation-map-scroll-regression`);
  await page.getByTestId('conversation-map-toggle').click();

  const mapPane = page.getByTestId('conversation-map-desktop');
  const transcript = page.getByTestId('home-scroll-container');
  const getScrollTop = () => transcript.evaluate((element) => element.scrollTop);

  await mapPane.locator('[data-map-node-id="map-alt-nested-alt-assistant"]').click();
  await expect(transcript.getByText(ALT_NESTED_VISUAL)).toBeVisible();

  await expect.poll(getScrollTop).toBeGreaterThan(250);

  await mapPane.locator('[data-map-node-id="map-assistant-root"]').click();

  await expect.poll(getScrollTop).toBeLessThan(40);
  await expect(transcript.getByText(ROOT_QUESTION)).toBeVisible();

  await page.waitForTimeout(800);
  const settledScrollTop = await getScrollTop();
  expect(settledScrollTop).toBeLessThan(40);
});

test('desktop map keeps existing node positions stable when selecting another formed branch', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockHomeDataRoutes(page, createStableLayoutConversationMapState());

  await page.goto(`/home/${stableLayoutConversationId}?e2e=conversation-map-stable-layout`);
  await page.getByTestId('conversation-map-toggle').click();

  const mapPane = page.getByTestId('conversation-map-desktop');
  const getRelativePositions = () =>
    mapPane.locator('[data-map-node="true"]').evaluateAll((elements) => {
      const root = elements.find(
        (element) => element.getAttribute('data-map-node-id') === 'stable-root-assistant'
      );
      if (!root) {
        throw new Error('Missing stable root node');
      }

      const rootRect = root.getBoundingClientRect();

      return Object.fromEntries(
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return [
            element.getAttribute('data-map-node-id'),
            {
              x: Math.round((rect.left - rootRect.left) * 10) / 10,
              y: Math.round((rect.top - rootRect.top) * 10) / 10,
            },
          ];
        })
      );
    });

  const before = await getRelativePositions();

  await mapPane.locator('[data-map-node-id="stable-third-assistant"]').click();
  await expect(page.getByTestId('home-scroll-container').getByText('This is the third route.')).toBeVisible();

  const after = await getRelativePositions();

  expect(after).toEqual(before);
});

test('desktop map shows a local preview tooltip on hover and hides it on leave', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockHomeDataRoutes(page, createConversationMapState());

  await page.goto(`/home/${conversationId}?e2e=conversation-map-hover`);
  await page.getByTestId('conversation-map-toggle').click();

  const mapPane = page.getByTestId('conversation-map-desktop');
  const visualNode = mapPane.locator('[data-map-node-id="map-alt-nested-alt-assistant"]');
  const tooltip = page.getByTestId('conversation-map-tooltip');

  await visualNode.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('li')).toHaveCount(3);
  await expect(tooltip.locator('li').filter({ hasText: 'Layout checks the marks.' })).toBeVisible();
  await expect(
    tooltip.locator('strong').filter({ hasText: 'backstage traffic settles' })
  ).toBeVisible();

  await page.mouse.move(8, 8);
  await expect(tooltip).toHaveCount(0);
});

test('desktop map resize handle changes the pane width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockHomeDataRoutes(page, createConversationMapState());

  await page.goto(`/home/${conversationId}?e2e=conversation-map-resize`);
  await page.getByTestId('conversation-map-toggle').click();

  const mapPane = page.getByTestId('conversation-map-desktop');
  const resizeHandle = page.getByTestId('conversation-map-resize-handle');

  const before = await mapPane.boundingBox();
  const handleBox = await resizeHandle.boundingBox();
  if (!before || !handleBox) {
    throw new Error('Map pane or resize handle is missing a bounding box');
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 620, handleBox.y + handleBox.height / 2, {
    steps: 8,
  });
  await page.mouse.up();

  const after = await mapPane.boundingBox();
  if (!after) {
    throw new Error('Map pane lost its bounding box after resize');
  }

  expect(after.width).toBeGreaterThan(before.width + 40);

  const storedRatio = await page.evaluate((id) => {
    const raw = window.localStorage.getItem('keen-conversation-map-state-v1');
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed.viewsByConversation?.[`persistent:${id}`]?.splitRatio ?? null;
  }, conversationId);

  expect(storedRatio).not.toBeNull();
  expect(storedRatio).toBeGreaterThan(0.7);
  expect(storedRatio).toBeLessThanOrEqual(0.75);
});

test('zooming out keeps every turn card rendered in the map', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockHomeDataRoutes(page, createConversationMapState());

  await page.goto(`/home/${conversationId}?e2e=conversation-map-zoom-out`);
  await page.getByTestId('conversation-map-toggle').click();

  const mapPane = page.getByTestId('conversation-map-desktop');
  await expect(mapPane.locator('[data-map-node="true"]')).toHaveCount(5);

  const paneBox = await mapPane.boundingBox();
  if (!paneBox) {
    throw new Error('Map pane is missing a bounding box');
  }

  await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2);
  for (let index = 0; index < 10; index += 1) {
    await page.mouse.wheel(0, 1200);
  }

  await expect(mapPane.locator('[data-map-node="true"]')).toHaveCount(5);
});

test('deep branch growth does not render overlapping cards', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockHomeDataRoutes(page, createCrowdedConversationMapState());

  await page.goto(`/home/${crowdedConversationId}?e2e=conversation-map-crowded-layout`);
  await page.getByTestId('conversation-map-toggle').click();

  const mapPane = page.getByTestId('conversation-map-desktop');
  await expect(mapPane.locator('[data-map-node="true"]')).toHaveCount(6);

  const overlaps = await mapPane.locator('[data-map-node="true"]').evaluateAll((elements) => {
    const rects = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.getAttribute('data-map-node-id'),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });

    const collisions = [];

    for (let index = 0; index < rects.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < rects.length; nextIndex += 1) {
        const current = rects[index];
        const next = rects[nextIndex];
        const intersects =
          current.left < next.right - 1 &&
          current.right > next.left + 1 &&
          current.top < next.bottom - 1 &&
          current.bottom > next.top + 1;

        if (intersects) {
          collisions.push([current.id, next.id]);
        }
      }
    }

    return collisions;
  });

  expect(overlaps).toEqual([]);
});

test('mobile map uses a takeover surface and returns to the transcript after navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home?e2e=conversation-map-temporary');

  await page.getByTestId('conversation-map-toggle').click();
  await expect(page.getByTestId('conversation-map-mobile')).toBeVisible();
  await expect(page.getByTestId('conversation-map-desktop')).toHaveCount(0);

  await page.locator('[data-map-node-id="map-alt-nested-alt-assistant"]').click();

  await expect(page.getByTestId('conversation-map-mobile')).toHaveCount(0);
  const transcript = page.getByTestId('home-scroll-container');
  await expect(transcript.getByText(ALT_REPLY)).toBeVisible();
  await expect(transcript.getByText(ALT_NESTED_VISUAL)).toBeVisible();
  await expect(transcript.getByText(ALT_NESTED_VISUAL_PROMPT)).toBeVisible();
});

test('opening the learning-mode popover closes the desktop map', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });

  const fixture = await gotoHomeFixture(page, 'conversation-map-temporary');
  await page.getByTestId('conversation-map-toggle').click();
  await expect(page.getByTestId('conversation-map-desktop')).toBeVisible();

  await selectTextInMessage(page, fixture.messageId, fixture.selectedText);

  await expect(page.getByTestId('selection-popover')).toBeVisible();
  await expect(page.getByTestId('conversation-map-desktop')).toHaveCount(0);
});
