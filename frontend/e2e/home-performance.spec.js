const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { gzipSync } = require('node:zlib');
const {
  createAuthenticatedCookie,
  getFixtureState,
} = require('./helpers/supabaseAuthFixture');
const { mockHomeDataRoutes } = require('./helpers/homeRouteMocks');
const {
  mockChatRoute,
} = require('./helpers/chatMocks');
const { selectTextInMessage } = require('./helpers/selectText');

const SERVER_DATA_MODE = process.env.PLAYWRIGHT_E2E_SERVER_DATA === '1';
const PRODUCTION_SERVER = process.env.PLAYWRIGHT_PRODUCTION_SERVER === '1';
const REQUIRED_REGIONS = [
  'shell',
  'sidebar',
  'header',
  'transcript',
  'composer',
];
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function createConversation(id, title = id) {
  return {
    id,
    title,
    mentor_id: null,
    workspace_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T01:00:00.000Z',
  };
}

function createWorkspace(id, name = id) {
  return {
    id,
    name,
    description: `${name} workspace description`,
    context: `Use ${name.toLowerCase()} workspace instructions.`,
    icon: name.slice(0, 1),
    accent_color: '#2563eb',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T01:00:00.000Z',
  };
}

function createMessages(conversationId, count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${conversationId}-message-${index + 1}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content:
      index % 2 === 0
        ? `Question ${index + 1} for ${conversationId}`
        : `Answer ${index + 1} for ${conversationId}`,
    created_at: `2026-08-02T01:${String(index).padStart(2, '0')}:00.000Z`,
    previous_message_id:
      index === 0 ? null : `${conversationId}-message-${index}`,
  }));
}

async function pasteTinyImage(page) {
  await page.getByLabel('Message composer').evaluate((textarea, base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const file = new File([bytes], 'home-performance.png', {
      type: 'image/png',
    });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        items: [
          {
            kind: 'file',
            type: file.type,
            getAsFile: () => file,
          },
        ],
      },
    });
    textarea.dispatchEvent(event);
  }, TINY_PNG_BASE64);
}

async function installHomePerformanceObserver(page) {
  await page.addInitScript((requiredRegions) => {
    const createMetrics = (start, existingRegions = []) => ({
      start,
      existingRegions,
      regionTimes: {},
      layoutShift: 0,
      longTasks: 0,
      longTaskDuration: 0,
    });
    let metrics = createMetrics(0);
    let regionRecordScheduled = false;

    window.__orchardHomePerformance = {
      counters: {},
      gauges: {},
    };

    const recordVisibleRegions = () => {
      const now = performance.now();
      for (const region of requiredRegions) {
        const element = document.querySelector(
          `[data-home-region="${region}"]`
        );
        if (!(element instanceof HTMLElement)) continue;
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        const isVisible =
          rect.width > 0
          && rect.height > 0
          && styles.display !== 'none'
          && styles.visibility !== 'hidden'
          && styles.opacity !== '0';
        if (metrics.regionTimes[region] === undefined && isVisible) {
          metrics.regionTimes[region] = now - metrics.start;
        }
      }
    };

    const scheduleRegionRecord = () => {
      if (regionRecordScheduled) return;
      regionRecordScheduled = true;
      requestAnimationFrame(() => {
        regionRecordScheduled = false;
        recordVisibleRegions();
      });
    };

    new MutationObserver(scheduleRegionRecord).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'style'],
    });
    document.addEventListener('readystatechange', scheduleRegionRecord);

    if ('PerformanceObserver' in window) {
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              metrics.layoutShift += entry.value;
            }
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        // Layout-shift entries are unavailable in some browser builds.
      }

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            metrics.longTasks += 1;
            metrics.longTaskDuration += entry.duration;
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // Long-task entries are unavailable in some browser builds.
      }
    }

    window.__beginHomeTransition = () => {
      metrics = createMetrics(
        performance.now(),
        requiredRegions.filter((region) =>
          document.querySelector(`[data-home-region="${region}"]:not([hidden])`)
        )
      );
      scheduleRegionRecord();
    };
    window.__resetHomePerformance = () => {
      window.__orchardHomePerformance = {
        counters: {},
        gauges: { ...window.__orchardHomePerformance?.gauges },
      };
      metrics = createMetrics(performance.now());
      scheduleRegionRecord();
    };
    window.__readHomePerformance = () => {
      recordVisibleRegions();
      const regionValues = requiredRegions
        .map((region) => metrics.regionTimes[region])
        .filter((value) => typeof value === 'number');
      const pageRegionValues = ['header', 'transcript', 'composer']
        .map((region) => metrics.regionTimes[region])
        .filter((value) => typeof value === 'number');
      const transitionRegionValues = requiredRegions
        .filter((region) => !metrics.existingRegions.includes(region))
        .map((region) => metrics.regionTimes[region])
        .filter((value) => typeof value === 'number');
      return {
        counters: { ...window.__orchardHomePerformance.counters },
        gauges: { ...window.__orchardHomePerformance.gauges },
        regionTimes: { ...metrics.regionTimes },
        readyMs:
          regionValues.length === requiredRegions.length
            ? Math.max(...regionValues)
            : null,
        spreadMs:
          regionValues.length === requiredRegions.length
            ? Math.max(...regionValues) - Math.min(...regionValues)
            : null,
        pageSpreadMs:
          pageRegionValues.length === 3
            ? Math.max(...pageRegionValues) - Math.min(...pageRegionValues)
            : null,
        transitionSpreadMs:
          transitionRegionValues.length > 1
            ? Math.max(...transitionRegionValues)
              - Math.min(...transitionRegionValues)
            : 0,
        layoutShift: metrics.layoutShift,
        longTasks: metrics.longTasks,
        longTaskDuration: metrics.longTaskDuration,
      };
    };
  }, REQUIRED_REGIONS);
}

async function waitForHomeRegions(page) {
  await expect(page.locator('[data-home-region]')).toHaveCount(
    REQUIRED_REGIONS.length
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
  return page.evaluate(() => window.__readHomePerformance());
}

async function emulateFast4GWithCpuSlowdown(page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    connectionType: 'cellular4g',
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return session;
}

async function readTransferredJavaScript(page) {
  const browserResult = await page.evaluate(() => {
    const resources = performance
      .getEntriesByType('resource')
      .filter(
        (entry) =>
          entry.name.includes('/_next/static/chunks/')
          && entry.name.endsWith('.js')
      );
    return {
      files: resources.length,
      paths: resources.map((entry) => new URL(entry.name).pathname),
      transferBytes: resources.reduce(
        (sum, entry) => sum + entry.transferSize,
        0
      ),
      encodedBytes: resources.reduce(
        (sum, entry) => sum + entry.encodedBodySize,
        0
      ),
    };
  });
  const requestedBuiltFiles = [...new Set(browserResult.paths)].map(
    (pathname) => `.next/${pathname.replace(/^\/_next\//, '')}`
  );
  const missingBuiltFiles = requestedBuiltFiles.filter(
    (pathname) => !fs.existsSync(pathname)
  );
  if (missingBuiltFiles.length > 0) {
    throw new Error(
      `Browser chunks do not match the measured .next build: ${missingBuiltFiles.join(', ')}`
    );
  }
  const builtFiles = requestedBuiltFiles;
  const builtBytes = builtFiles.map((pathname) => fs.readFileSync(pathname));
  return {
    files: browserResult.files,
    transferBytes: browserResult.transferBytes,
    encodedBytes: browserResult.encodedBytes,
    buildFiles: builtFiles.length,
    buildRawBytes: builtBytes.reduce(
      (sum, contents) => sum + contents.byteLength,
      0
    ),
    buildGzipBytes: builtBytes.reduce(
      (sum, contents) => sum + gzipSync(contents).byteLength,
      0
    ),
  };
}

function incrementalJavaScript(after, before) {
  return {
    files: after.files - before.files,
    transferBytes: after.transferBytes - before.transferBytes,
    encodedBytes: after.encodedBytes - before.encodedBytes,
    buildFiles: after.buildFiles - before.buildFiles,
    buildRawBytes: after.buildRawBytes - before.buildRawBytes,
    buildGzipBytes: after.buildGzipBytes - before.buildGzipBytes,
  };
}

async function installControlledChatStream(page, metadata) {
  await page.addInitScript((streamMetadata) => {
    const originalFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();

    window.__emitHomeChatDelta = (delta) => {
      window.__homeChatStreamController?.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'text-delta', delta })}\n\n`
        )
      );
    };
    window.__finishHomeChatStream = (message) => {
      const controller = window.__homeChatStreamController;
      if (!controller) return;
      controller.enqueue(encoder.encode('data: {"type":"text-end"}\n\n'));
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'data-chatMeta',
            data: { ...streamMetadata, message },
          })}\n\n`
        )
      );
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
      window.__homeChatStreamController = null;
    };

    window.fetch = (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        window.location.href
      );
      if (url.pathname !== '/api/chat') {
        return originalFetch(input, init);
      }

      const body = new ReadableStream({
        start(controller) {
          window.__homeChatStreamController = controller;
        },
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      );
    };
  }, metadata);
}

function recordBrowserDataRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === '/auth/v1/user'
      || url.pathname === '/auth/v1/token'
      || url.pathname.startsWith('/rest/v1/')
      || url.pathname === '/api/mentors'
      || url.pathname === '/api/workspaces'
      || url.pathname.startsWith('/api/workspaces/')
      || url.pathname === '/api/chat/models'
      || url.pathname.startsWith('/api/conversations/')
      || url.pathname === '/api/chat'
      || url.pathname.startsWith('/api/chat-runs/')
    ) {
      requests.push(`${request.method()} ${url.pathname}`);
    }
  });
  return requests;
}

async function ensureConversationsOpen(page) {
  await page.waitForFunction(
    () =>
      !window.__orchardHomePerformance
      || (window.__orchardHomePerformance.counters['side-panel-render'] ?? 0) > 0
  );
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

test.describe('home production performance baseline', () => {
  test.skip(
    !SERVER_DATA_MODE || !PRODUCTION_SERVER,
    'requires server-data mode against an exact production build'
  );
  test.describe.configure({ mode: 'serial' });

  test('hard empty home renders the complete shell without browser data requests', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const userId = `home-hard-empty-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({ userId }),
    ]);
    await installHomePerformanceObserver(page);
    await emulateFast4GWithCpuSlowdown(page);
    const browserDataRequests = recordBrowserDataRequests(page);
    const readySamples = [];
    const spreadSamples = [];
    const ttfbSamples = [];
    const layoutShiftSamples = [];
    let firstHtml = '';
    let transferredJavaScript = null;

    for (let sample = 0; sample < 10; sample += 1) {
      const response = await page.goto(`/home?sample=${sample}`, {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.ok()).toBe(true);
      if (sample === 0) {
        firstHtml = await response.text();
      }
      const metrics = await waitForHomeRegions(page);
      if (sample === 0) {
        await page.waitForLoadState('networkidle');
        transferredJavaScript = await readTransferredJavaScript(page);
      }
      const navigation = await page.evaluate(() => {
        const entry = performance.getEntriesByType('navigation')[0];
        return entry ? { responseStart: entry.responseStart } : null;
      });

      expect(metrics.readyMs).not.toBeNull();
      expect(metrics.spreadMs).not.toBeNull();
      expect(navigation).not.toBeNull();
      readySamples.push(metrics.readyMs);
      spreadSamples.push(metrics.spreadMs);
      ttfbSamples.push(navigation.responseStart);
      layoutShiftSamples.push(metrics.layoutShift);
    }

    for (const region of REQUIRED_REGIONS) {
      expect(firstHtml).toContain(`data-home-region="${region}"`);
    }
    expect(firstHtml).toContain("Let&#x27;s explore");
    expect(browserDataRequests).toEqual([]);

    const fixtureState = await getFixtureState(userId);
    expect(fixtureState.counters).toMatchObject({
      authUser: 0,
      refreshes: 0,
      profileReads: 10,
      mentorReads: 10,
      workspaceListReads: 10,
      conversationReads: 10,
    });

    console.log(
      `home-hard-empty-metrics ${JSON.stringify({
        samples: readySamples.length,
        readyP50Ms: percentile(readySamples, 0.5),
        readyP95Ms: percentile(readySamples, 0.95),
        ttfbP50Ms: percentile(ttfbSamples, 0.5),
        ttfbP95Ms: percentile(ttfbSamples, 0.95),
        regionSpreadP95Ms: percentile(spreadSamples, 0.95),
        layoutShiftP95: percentile(layoutShiftSamples, 0.95),
        transferredJavaScript,
      })}`
    );
  });

  test('hard routed home records the current browser transcript waterfall', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const conversation = createConversation(
      'home-hard-conversation',
      'Hard conversation'
    );
    const messages = createMessages(conversation.id);
    const userId = `home-hard-routed-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        conversations: [conversation],
      }),
    ]);
    await mockHomeDataRoutes(page, {
      conversations: [conversation],
      messagesByConversationId: {
        [conversation.id]: messages,
      },
    });
    await installHomePerformanceObserver(page);
    await emulateFast4GWithCpuSlowdown(page);
    const browserDataRequests = recordBrowserDataRequests(page);
    const transcriptVisibleSamples = [];
    const ttfbSamples = [];
    const spreadSamples = [];
    const layoutShiftSamples = [];
    let firstHtml = '';
    let transferredJavaScript = null;

    for (let sample = 0; sample < 10; sample += 1) {
      const response = await page.goto(
        `/home/${conversation.id}?sample=${sample}`,
        { waitUntil: 'domcontentloaded' }
      );
      expect(response?.ok()).toBe(true);
      if (sample === 0) {
        firstHtml = await response.text();
      }
      await expect(page.getByText(messages[0].content)).toBeVisible();
      const metrics = await waitForHomeRegions(page);
      const navigation = await page.evaluate(() => {
        const entry = performance.getEntriesByType('navigation')[0];
        return entry ? { responseStart: entry.responseStart } : null;
      });
      if (sample === 0) {
        transferredJavaScript = await readTransferredJavaScript(page);
      }
      expect(navigation).not.toBeNull();
      transcriptVisibleSamples.push(
        await page.evaluate(() => performance.now())
      );
      ttfbSamples.push(navigation.responseStart);
      spreadSamples.push(metrics.spreadMs);
      layoutShiftSamples.push(metrics.layoutShift);
    }

    expect(firstHtml).not.toContain(messages[0].content);
    const expectedRequests = Array.from({ length: 10 }, () => [
      'GET /rest/v1/conversation_branches',
      'GET /rest/v1/message_attachments',
      'GET /rest/v1/messages',
      'GET /rest/v1/threads',
    ]).flat();
    expect(browserDataRequests.sort()).toEqual(expectedRequests.sort());
    console.log(
      `home-hard-routed-metrics ${JSON.stringify({
        samples: transcriptVisibleSamples.length,
        transcriptVisibleP50Ms: percentile(transcriptVisibleSamples, 0.5),
        transcriptVisibleP95Ms: percentile(transcriptVisibleSamples, 0.95),
        ttfbP50Ms: percentile(ttfbSamples, 0.5),
        ttfbP95Ms: percentile(ttfbSamples, 0.95),
        regionSpreadP95Ms: percentile(spreadSamples, 0.95),
        layoutShiftP95: percentile(layoutShiftSamples, 0.95),
        browserDataRequests,
        transferredJavaScript,
      })}`
    );
  });

  test('map, thread, and upload first-intent JavaScript costs are reported separately', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const userId = `home-optional-js-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({ userId }),
    ]);
    await mockHomeDataRoutes(page, {});

    await page.goto('/home?e2e=conversation-map-temporary');
    await expect(page.getByTestId('conversation-map-toggle')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const mapBefore = await readTransferredJavaScript(page);
    await page.getByTestId('conversation-map-toggle').click();
    await expect(page.getByTestId('conversation-map-desktop')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const mapAfter = await readTransferredJavaScript(page);

    await page.addInitScript(() => {
      window.localStorage.setItem('learningMode', 'true');
    });
    await page.goto('/home?e2e=inline-threads');
    await page.waitForSelector(
      '[data-message-id="assistant-inline-threads-fixture"]'
    );
    await page.waitForLoadState('networkidle');
    const threadBefore = await readTransferredJavaScript(page);
    await selectTextInMessage(
      page,
      'assistant-inline-threads-fixture',
      'microtasks run before the browser paints the next frame'
    );
    await expect(page.getByTestId('selection-popover')).toBeVisible();
    await page
      .getByTestId('selection-popover-input')
      .fill('Measure thread intent.');
    await page.keyboard.press('Control+L');
    await expect(page.getByTestId('thread-panel')).toHaveAttribute(
      'data-state',
      'open'
    );
    await page.waitForLoadState('networkidle');
    const threadAfter = await readTransferredJavaScript(page);

    await page.goto('/home');
    await expect(page.getByLabel('Message composer')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const uploadBefore = await readTransferredJavaScript(page);
    await pasteTinyImage(page);
    await expect(
      page.getByRole('button', { name: 'Remove home-performance.png' })
    ).toBeVisible();
    await page.waitForLoadState('networkidle');
    const uploadAfter = await readTransferredJavaScript(page);

    const result = {
      map: incrementalJavaScript(mapAfter, mapBefore),
      thread: incrementalJavaScript(threadAfter, threadBefore),
      upload: incrementalJavaScript(uploadAfter, uploadBefore),
    };
    expect(result.map.buildGzipBytes).toBeGreaterThanOrEqual(0);
    expect(result.thread.buildGzipBytes).toBeGreaterThanOrEqual(0);
    expect(result.upload.buildGzipBytes).toBeGreaterThanOrEqual(0);
    console.log(`home-first-intent-javascript ${JSON.stringify(result)}`);
  });

  test('workspace to empty home reuses the shared shell without browser data requests', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const workspace = createWorkspace('home-warm-workspace', 'Biology');
    const userId = `home-warm-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        workspaces: [workspace],
      }),
    ]);
    await installHomePerformanceObserver(page);
    await emulateFast4GWithCpuSlowdown(page);
    const browserDataRequests = recordBrowserDataRequests(page);
    const readySamples = [];
    const pageSpreadSamples = [];
    const transitionSpreadSamples = [];

    for (let sample = 0; sample < 10; sample += 1) {
      await page.goto(`/workspaces/${workspace.id}?sample=${sample}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByRole('heading', { name: workspace.name }))
        .toBeVisible();
      const sidePanel = await ensureConversationsOpen(page);
      await page.evaluate(() => window.__beginHomeTransition());
      await sidePanel
        .locator('#side-panel-section-new')
        .getByRole('button', { name: 'New chat with Orchard' })
        .click();
      await expect(page).toHaveURL('/home');
      const metrics = await waitForHomeRegions(page);
      readySamples.push(metrics.readyMs);
      pageSpreadSamples.push(metrics.pageSpreadMs);
      transitionSpreadSamples.push(metrics.transitionSpreadMs);
    }

    expect(browserDataRequests).toEqual([]);
    const fixtureState = await getFixtureState(userId);
    expect(fixtureState.counters).toMatchObject({
      authUser: 0,
      refreshes: 0,
      profileReads: 10,
      mentorReads: 10,
      workspaceListReads: 10,
      workspaceDetailReads: 10,
      conversationReads: 10,
    });
    console.log(
      `home-warm-navigation-metrics ${JSON.stringify({
        samples: readySamples.length,
        readyP50Ms: percentile(readySamples, 0.5),
        readyP95Ms: percentile(readySamples, 0.95),
        pageSpreadP95Ms: percentile(pageSpreadSamples, 0.95),
        transitionSpreadP95Ms: percentile(transitionSpreadSamples, 0.95),
      })}`
    );
  });

  test('returning to a cached conversation performs no duplicate transcript reads', async ({
    page,
  }, testInfo) => {
    const first = createConversation('home-cache-a', 'Cached A');
    const second = createConversation('home-cache-b', 'Cached B');
    const messagesByConversationId = {
      [first.id]: createMessages(first.id),
      [second.id]: createMessages(second.id),
    };
    const userId = `home-cache-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        conversations: [first, second],
      }),
    ]);
    await mockHomeDataRoutes(page, {
      conversations: [first, second],
      messagesByConversationId,
    });
    await installHomePerformanceObserver(page);
    const browserDataRequests = recordBrowserDataRequests(page);

    await page.goto(`/home/${first.id}`);
    await expect(page.getByText(messagesByConversationId[first.id][0].content))
      .toBeVisible();
    const sidePanel = await ensureConversationsOpen(page);
    await sidePanel.getByTestId(`conversation-row-${second.id}`).click();
    await expect(page.getByText(messagesByConversationId[second.id][0].content))
      .toBeVisible();
    const requestsBeforeReturn = browserDataRequests.length;
    await sidePanel.getByTestId(`conversation-row-${first.id}`).click();
    await expect(page.getByText(messagesByConversationId[first.id][0].content))
      .toBeVisible();

    expect(browserDataRequests.length).toBe(requestsBeforeReturn);
    expect(
      browserDataRequests.filter((request) =>
        request.startsWith('GET /rest/v1/')
      )
    ).toHaveLength(8);
  });

  test('completed send records the current duplicate reconciliation request graph', async ({
    page,
  }, testInfo) => {
    const conversation = createConversation('home-send', 'Send baseline');
    const messages = createMessages(conversation.id);
    const userId = `home-send-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        conversations: [conversation],
      }),
    ]);
    await mockHomeDataRoutes(page, {
      conversations: [conversation],
      messagesByConversationId: {
        [conversation.id]: messages,
      },
    });
    await mockChatRoute(page, async () => ({
      message: 'Completed baseline response',
      conversationId: conversation.id,
      userMessageId: 'home-send-user',
      assistantMessageId: 'home-send-assistant',
    }));
    const browserDataRequests = recordBrowserDataRequests(page);

    await page.goto(`/home/${conversation.id}`);
    await expect(page.getByText(messages[0].content)).toBeVisible();
    browserDataRequests.length = 0;
    const composer = page.getByLabel('Message composer');
    await composer.fill('Measure completion reconciliation.');
    await composer.press('Enter');
    await expect(page.getByText('Completed baseline response')).toBeVisible();
    await page.waitForTimeout(750);

    console.log(
      `home-completed-send-requests ${JSON.stringify(browserDataRequests)}`
    );
    expect(browserDataRequests.sort()).toEqual([
      'GET /api/mentors',
      'GET /api/mentors',
      'GET /api/workspaces',
      'GET /api/workspaces',
      'GET /rest/v1/conversation_branches',
      'GET /rest/v1/conversation_branches',
      'GET /rest/v1/conversations',
      'GET /rest/v1/conversations',
      'GET /rest/v1/message_attachments',
      'GET /rest/v1/message_attachments',
      'GET /rest/v1/messages',
      'GET /rest/v1/messages',
      'GET /rest/v1/threads',
      'GET /rest/v1/threads',
      'POST /api/chat',
    ]);
  });

  test('conversation move records the current broad navigation refresh', async ({
    page,
  }, testInfo) => {
    const source = createWorkspace('home-move-source', 'Source');
    const target = createWorkspace('home-move-target', 'Target');
    const conversation = {
      ...createConversation('home-move-conversation', 'Move baseline'),
      workspace_id: source.id,
    };
    const messages = createMessages(conversation.id);
    const userId = `home-move-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        workspaces: [source, target],
        conversations: [conversation],
      }),
    ]);
    await mockHomeDataRoutes(page, {
      workspaces: [source, target],
      conversations: [conversation],
      messagesByConversationId: {
        [conversation.id]: messages,
      },
    });
    const browserDataRequests = recordBrowserDataRequests(page);

    await page.goto(`/home/${conversation.id}`);
    await expect(page.getByText(messages[0].content)).toBeVisible();
    const sidePanel = await ensureConversationsOpen(page);
    if (
      (await sidePanel
        .getByRole('button', { name: `Expand ${source.name}` })
        .count()) > 0
    ) {
      await sidePanel
        .getByRole('button', { name: `Expand ${source.name}` })
        .click();
    }
    browserDataRequests.length = 0;
    await sidePanel
      .getByTestId(`conversation-row-${conversation.id}`)
      .dragTo(sidePanel.getByTestId(`workspace-drop-target-${target.id}`));
    await expect(
      sidePanel.getByTestId(`conversation-row-${conversation.id}`)
    ).toBeVisible();
    await page.waitForTimeout(250);

    expect(browserDataRequests.sort()).toEqual([
      'GET /api/mentors',
      'GET /api/workspaces',
      'GET /rest/v1/conversations',
      `PATCH /api/conversations/${conversation.id}/context`,
    ]);
  });

  test('one ordinary stream delta isolates publication, render, storage, and closed-map work', async ({
    page,
  }, testInfo) => {
    const userId = `home-stream-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({ userId }),
    ]);
    await mockHomeDataRoutes(page, {});
    await installControlledChatStream(page, {
      userMessageId: 'home-stream-user',
      assistantMessageId: 'home-stream-assistant',
    });
    await installHomePerformanceObserver(page);

    await page.goto('/home?e2e=conversation-map-temporary');
    await expect(
      page.getByText('Give me two ways to explain delayed browser paint.')
    ).toBeVisible();
    const composer = page.getByLabel('Message composer');
    await composer.fill('Measure this stream.');
    await composer.press('Enter');
    await expect(
      page.getByTestId('home-scroll-container').getByText('Measure this stream.')
    ).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__homeChatStreamController));
    await page.evaluate(() => window.__resetHomePerformance());
    await page.evaluate(() => window.__emitHomeChatDelta('isolated-delta'));
    await expect(page.getByText('isolated-delta')).toBeVisible();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
    const metrics = await page.evaluate(() => window.__readHomePerformance());

    expect(metrics.counters['visible-stream-publication']).toBe(1);
    expect(metrics.counters['temporary-chat-storage-write']).toBeGreaterThan(0);
    expect(metrics.counters['side-panel-render']).toBeGreaterThan(0);
    expect(metrics.counters['finalized-message-row-render']).toBeGreaterThan(0);
    expect(metrics.counters['conversation-map-model-build']).toBeGreaterThan(0);
    console.log(`home-ordinary-delta-baseline ${JSON.stringify(metrics)}`);

    const burstChunks = Array.from(
      { length: 20 },
      (_, index) => ` burst-${index + 1}`
    );
    await page.evaluate(() => window.__resetHomePerformance());
    await page.evaluate((chunks) => {
      for (const chunk of chunks) {
        window.__emitHomeChatDelta(chunk);
      }
    }, burstChunks);
    await expect(page.getByTestId('home-scroll-container')).toContainText(
      'burst-20'
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
    const burstMetrics = await page.evaluate(
      () => window.__readHomePerformance()
    );
    expect(burstMetrics.counters['visible-stream-publication']).toBe(
      burstChunks.length
    );
    console.log(`home-same-frame-burst-baseline ${JSON.stringify(burstMetrics)}`);

    await page.evaluate(
      (message) => window.__finishHomeChatStream(message),
      `isolated-delta${burstChunks.join('')}`
    );
    await expect(page.getByText('isolated-delta')).toBeVisible();
  });

  test('representative transcript cache cardinality and retained heap are recorded', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const conversations = Array.from({ length: 25 }, (_, index) =>
      createConversation(
        `home-cache-cardinality-${index + 1}`,
        `Cached conversation ${index + 1}`
      )
    );
    const messagesByConversationId = Object.fromEntries(
      conversations.map((conversation) => [
        conversation.id,
        createMessages(conversation.id, 12),
      ])
    );
    const userId = `home-cache-cardinality-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        conversations,
      }),
    ]);
    const state = await mockHomeDataRoutes(page, {
      conversations,
      messagesByConversationId,
    });
    await installHomePerformanceObserver(page);
    const session = await page.context().newCDPSession(page);

    await page.goto(`/home/${conversations[0].id}`);
    await expect(
      page.getByText(messagesByConversationId[conversations[0].id][0].content)
    ).toBeVisible();
    const sidePanel = await ensureConversationsOpen(page);
    await session.send('HeapProfiler.collectGarbage');
    const before = await session.send('Runtime.getHeapUsage');

    for (let index = 1; index < conversations.length; index += 1) {
      if (index === 10 || index === 20) {
        await sidePanel.getByRole('button', { name: 'Show more' }).click();
      }
      const conversation = conversations[index];
      await sidePanel
        .getByTestId(`conversation-row-${conversation.id}`)
        .click();
      await expect(
        page.getByText(messagesByConversationId[conversation.id][0].content)
      ).toBeVisible();
    }

    await session.send('HeapProfiler.collectGarbage');
    const after = await session.send('Runtime.getHeapUsage');
    const metrics = await page.evaluate(() => window.__readHomePerformance());
    expect(metrics.gauges['persistent-conversation-cache-size']).toBe(
      conversations.length
    );
    const populatedDeltaUsedBytes = after.usedSize - before.usedSize;

    state.messagesByConversationId = Object.fromEntries(
      conversations.map((conversation) => [conversation.id, []])
    );
    await page.goto(`/home/${conversations[0].id}?heap-control=1`);
    await waitForHomeRegions(page);
    const controlSidePanel = await ensureConversationsOpen(page);
    await session.send('HeapProfiler.collectGarbage');
    const controlBefore = await session.send('Runtime.getHeapUsage');
    for (let index = 1; index < conversations.length; index += 1) {
      if (index === 10 || index === 20) {
        await controlSidePanel
          .getByRole('button', { name: 'Show more' })
          .click();
      }
      const conversation = conversations[index];
      await controlSidePanel
        .getByTestId(`conversation-row-${conversation.id}`)
        .click();
      await expect(page).toHaveURL(`/home/${conversation.id}`);
    }
    await session.send('HeapProfiler.collectGarbage');
    const controlAfter = await session.send('Runtime.getHeapUsage');
    const controlDeltaUsedBytes =
      controlAfter.usedSize - controlBefore.usedSize;

    console.log(
      `home-cache-retained-heap ${JSON.stringify({
        conversations: conversations.length,
        messagesPerConversation: 12,
        populatedDeltaUsedBytes,
        emptyControlDeltaUsedBytes: controlDeltaUsedBytes,
        attributedDifferenceBytes:
          populatedDeltaUsedBytes - controlDeltaUsedBytes,
      })}`
    );
  });

  test('empty-home animation CPU and reduced-motion baselines are recorded', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const userId = `home-cpu-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({ userId }),
    ]);
    const session = await page.context().newCDPSession(page);
    await session.send('Performance.enable');

    const measureTaskDuration = async (reducedMotion) => {
      await page.emulateMedia({
        reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
      });
      await page.goto(`/home?motion=${reducedMotion ? 'reduced' : 'normal'}`);
      await expect(page.getByTestId('ascii-tesseract')).toBeVisible();
      const before = await session.send('Performance.getMetrics');
      await page.waitForTimeout(10_000);
      const after = await session.send('Performance.getMetrics');
      const read = (sample, name) =>
        sample.metrics.find((metric) => metric.name === name)?.value ?? 0;
      return {
        taskDurationMs:
          (read(after, 'TaskDuration') - read(before, 'TaskDuration')) * 1_000,
        scriptDurationMs:
          (read(after, 'ScriptDuration') - read(before, 'ScriptDuration')) * 1_000,
      };
    };

    const normal = await measureTaskDuration(false);
    const reduced = await measureTaskDuration(true);
    console.log(
      `home-empty-animation-cpu ${JSON.stringify({
        durationMs: 10_000,
        normal,
        reduced,
      })}`
    );
  });
});
