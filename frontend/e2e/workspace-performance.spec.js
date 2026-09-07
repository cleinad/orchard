const { test, expect } = require('@playwright/test');
const {
  createAuthenticatedCookie,
  getFixtureState,
} = require('./helpers/supabaseAuthFixture');

const SERVER_DATA_MODE = process.env.PLAYWRIGHT_E2E_SERVER_DATA === '1';
const REQUIRED_REGIONS = [
  'identity',
  'conversations',
  'composer',
  'instructions',
];

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function createWorkspace(id, name) {
  return {
    id,
    name,
    description: `${name} workspace description`,
    context: `Use ${name.toLowerCase()} workspace instructions.`,
    icon: name.slice(0, 1),
    accent_color: '#2563eb',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
  };
}

function createConversation(id, workspaceId) {
  return {
    id,
    title: `Session for ${workspaceId}`,
    mentor_id: null,
    workspace_id: workspaceId,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T01:00:00.000Z',
  };
}

async function installWorkspaceVisualObserver(page) {
  await page.addInitScript((requiredRegions) => {
    const createMetrics = (start) => ({
      start,
      regionTimes: {},
      layoutShift: 0,
    });
    // performance.now() is relative to navigation start in a new document.
    // The initial hard-load sample must keep that origin instead of starting
    // after the response has already reached the browser.
    let metrics = createMetrics(0);

    const recordRegions = () => {
      const now = performance.now();
      for (const region of requiredRegions) {
        if (
          metrics.regionTimes[region] === undefined
          && document.querySelector(`[data-workspace-region="${region}"]`)
        ) {
          metrics.regionTimes[region] = now - metrics.start;
        }
      }
    };

    new MutationObserver(recordRegions).observe(document, {
      childList: true,
      subtree: true,
    });
    document.addEventListener('readystatechange', recordRegions);

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
        // Layout-shift entries are not available in every browser build.
      }
    }

    window.__beginWorkspaceTransition = () => {
      metrics = createMetrics(performance.now());
      recordRegions();
    };
    window.__readWorkspaceMetrics = () => {
      recordRegions();
      const times = requiredRegions
        .map((region) => metrics.regionTimes[region])
        .filter((value) => typeof value === 'number');
      return {
        regionTimes: { ...metrics.regionTimes },
        readyMs: times.length === requiredRegions.length
          ? Math.max(...times)
          : null,
        spreadMs: times.length === requiredRegions.length
          ? Math.max(...times) - Math.min(...times)
          : null,
        layoutShift: metrics.layoutShift,
      };
    };
  }, REQUIRED_REGIONS);
}

async function waitForWorkspaceRegions(page) {
  await expect(page.locator('[data-workspace-region]')).toHaveCount(
    REQUIRED_REGIONS.length
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
  return page.evaluate(() => window.__readWorkspaceMetrics());
}

function recordBrowserDataRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === '/auth/v1/user'
      || url.pathname.startsWith('/rest/v1/')
      || url.pathname === '/api/mentors'
      || url.pathname === '/api/workspaces'
      || url.pathname.startsWith('/api/workspaces/')
      || url.pathname === '/api/chat/models'
    ) {
      requests.push(`${request.method()} ${url.pathname}`);
    }
  });
  return requests;
}

test.describe('workspace production performance', () => {
  test.skip(!SERVER_DATA_MODE, 'requires PLAYWRIGHT_E2E_SERVER_DATA=1');
  test.describe.configure({ mode: 'serial' });

  test('hard loads render all required regions without browser data waterfalls', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const workspace = createWorkspace('workspace-hard-load', 'Health');
    const userId = `workspace-hard-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        workspaces: [workspace],
        conversations: [
          createConversation('conversation-hard-load', workspace.id),
        ],
      }),
    ]);
    await installWorkspaceVisualObserver(page);
    const browserDataRequests = recordBrowserDataRequests(page);
    const readySamples = [];
    const spreadSamples = [];
    const ttfbSamples = [];
    const layoutShiftSamples = [];
    let firstHtml = '';

    for (let sample = 0; sample < 20; sample += 1) {
      const response = await page.goto(
        `/workspaces/${workspace.id}?sample=${sample}`,
        { waitUntil: 'domcontentloaded' }
      );
      expect(response?.ok()).toBe(true);
      if (sample === 0) {
        firstHtml = await response.text();
      }

      const metrics = await waitForWorkspaceRegions(page);
      const navigation = await page.evaluate(() => {
        const entry = performance.getEntriesByType('navigation')[0];
        return entry
          ? {
              responseStart: entry.responseStart,
              domContentLoaded: entry.domContentLoadedEventEnd,
            }
          : null;
      });

      expect(metrics.readyMs).not.toBeNull();
      expect(metrics.spreadMs).not.toBeNull();
      expect(navigation).not.toBeNull();
      expect(metrics.readyMs).toBeGreaterThanOrEqual(navigation.responseStart);
      readySamples.push(metrics.readyMs);
      spreadSamples.push(metrics.spreadMs);
      ttfbSamples.push(navigation.responseStart);
      layoutShiftSamples.push(metrics.layoutShift);
    }

    expect(firstHtml).toContain('data-workspace-region="identity"');
    expect(firstHtml).toContain('data-workspace-region="conversations"');
    expect(firstHtml).toContain('data-workspace-region="composer"');
    expect(firstHtml).toContain('data-workspace-region="instructions"');
    expect(firstHtml).toContain('Health workspace description');
    expect(firstHtml).toContain('Use health workspace instructions.');
    expect(firstHtml).not.toContain('Loading workspace...');
    expect(browserDataRequests).toEqual([]);

    const fixtureState = await getFixtureState(userId);
    expect(fixtureState.counters).toMatchObject({
      authUser: 0,
      profileReads: 20,
      mentorReads: 20,
      workspaceListReads: 20,
      workspaceDetailReads: 20,
      conversationReads: 20,
    });

    const result = {
      samples: readySamples.length,
      readyP50Ms: percentile(readySamples, 0.5),
      readyP95Ms: percentile(readySamples, 0.95),
      ttfbP50Ms: percentile(ttfbSamples, 0.5),
      ttfbP95Ms: percentile(ttfbSamples, 0.95),
      regionSpreadP95Ms: percentile(spreadSamples, 0.95),
      layoutShiftP95: percentile(layoutShiftSamples, 0.95),
    };

    expect(result.readyP50Ms).toBeLessThanOrEqual(800);
    expect(result.readyP95Ms).toBeLessThanOrEqual(1_500);
    expect(result.ttfbP50Ms).toBeLessThanOrEqual(300);
    expect(result.ttfbP95Ms).toBeLessThanOrEqual(600);
    expect(result.regionSpreadP95Ms).toBeLessThanOrEqual(50);
    expect(result.layoutShiftP95).toBeLessThan(0.02);
    console.log(`workspace-hard-load-metrics ${JSON.stringify(result)}`);
  });

  test('prefetched home navigation meets the warm visual-completion target', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const workspaces = Array.from({ length: 30 }, (_, index) =>
      createWorkspace(`workspace-warm-${index + 1}`, `Topic ${index + 1}`)
    );
    const userId = `workspace-warm-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        workspaces,
        conversations: [],
      }),
    ]);
    await installWorkspaceVisualObserver(page);
    const browserDataRequests = recordBrowserDataRequests(page);
    const readySamples = [];
    const spreadSamples = [];

    for (let sample = 0; sample < workspaces.length; sample += 1) {
      const workspace = workspaces[sample];
      await page.goto(`/home?sample=${sample}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.getByRole('button', { name: 'Open conversations' }).click();
      const link = page
        .getByTestId(`workspace-drop-target-${workspace.id}`)
        .getByRole('link');
      const prefetchResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === `/workspaces/${workspace.id}`
          && response.request().resourceType() === 'fetch'
        );
      });
      await link.hover();
      await prefetchResponse;
      await expect.poll(async () => {
        const state = await getFixtureState(userId);
        return state.counters.workspaceDetailReads;
      }).toBe(sample + 1);

      await page.evaluate(() => window.__beginWorkspaceTransition());
      await link.click();
      await expect(page).toHaveURL(`/workspaces/${workspace.id}`);
      const metrics = await waitForWorkspaceRegions(page);
      expect(metrics.readyMs).not.toBeNull();
      expect(metrics.spreadMs).not.toBeNull();
      readySamples.push(metrics.readyMs);
      spreadSamples.push(metrics.spreadMs);
    }

    expect(browserDataRequests).toEqual([]);
    const fixtureState = await getFixtureState(userId);
    expect(fixtureState.counters).toMatchObject({
      authUser: 0,
      profileReads: 30,
      mentorReads: 30,
      workspaceListReads: 30,
      workspaceDetailReads: 30,
      conversationReads: 30,
    });

    const result = {
      samples: readySamples.length,
      readyP50Ms: percentile(readySamples, 0.5),
      readyP95Ms: percentile(readySamples, 0.95),
      regionSpreadP95Ms: percentile(spreadSamples, 0.95),
    };
    expect(result.readyP50Ms).toBeLessThanOrEqual(50);
    expect(result.readyP95Ms).toBeLessThanOrEqual(100);
    expect(result.regionSpreadP95Ms).toBeLessThanOrEqual(50);
    console.log(`workspace-warm-navigation-metrics ${JSON.stringify(result)}`);
  });

  test('missing or unowned workspace ids return not found without a browser fallback', async ({
    page,
  }, testInfo) => {
    const userId = `workspace-not-found-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        workspaces: [createWorkspace('workspace-owned', 'Owned')],
        conversations: [],
      }),
    ]);
    const browserDataRequests = recordBrowserDataRequests(page);

    await page.goto('/workspaces/workspace-unowned');

    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
    await expect(page.locator('[data-workspace-region]')).toHaveCount(0);
    expect(browserDataRequests).toEqual([]);
    const fixtureState = await getFixtureState(userId);
    expect(fixtureState.counters).toMatchObject({
      authUser: 0,
      profileReads: 1,
      workspaceDetailReads: 1,
    });
  });

  test('workspace updates invalidate prefetched detail before return navigation', async ({
    page,
  }, testInfo) => {
    const workspace = createWorkspace('workspace-update-cache', 'Original');
    const userId = `workspace-update-cache-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        workspaces: [workspace],
        conversations: [],
      }),
    ]);

    await page.goto('/home');
    await page.getByRole('button', { name: 'Open conversations' }).click();
    const workspaceLink = page
      .getByTestId(`workspace-drop-target-${workspace.id}`)
      .getByRole('link');
    await workspaceLink.hover();
    await workspaceLink.click();
    await expect(page).toHaveURL(`/workspaces/${workspace.id}`);

    await page.getByRole('button', { name: 'Rename workspace' }).click();
    const nameInput = page.getByRole('textbox', { name: 'Workspace name' });
    await nameInput.fill('Updated');
    await nameInput.press('Enter');
    await expect(page.getByRole('heading', { name: 'Updated' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL('/home');
    await page
      .getByTestId(`workspace-drop-target-${workspace.id}`)
      .getByRole('link')
      .click();

    await expect(page).toHaveURL(`/workspaces/${workspace.id}`);
    await expect(page.getByRole('heading', { name: 'Updated' })).toBeVisible();
    const fixtureState = await getFixtureState(userId);
    expect(fixtureState.counters.workspaceWrites).toBe(1);
    expect(fixtureState.counters.workspaceDetailReads).toBeGreaterThanOrEqual(2);
  });

  test('deleted workspaces cannot be restored with browser back navigation', async ({
    page,
  }, testInfo) => {
    const workspace = createWorkspace('workspace-delete-cache', 'Delete me');
    const userId = `workspace-delete-cache-${testInfo.workerIndex}`;
    await page.context().addCookies([
      await createAuthenticatedCookie({
        userId,
        workspaces: [workspace],
        conversations: [],
      }),
    ]);

    await page.goto('/home');
    await page.getByRole('button', { name: 'Open conversations' }).click();
    const workspaceLink = page
      .getByTestId(`workspace-drop-target-${workspace.id}`)
      .getByRole('link');
    await workspaceLink.hover();
    await workspaceLink.click();
    await expect(page).toHaveURL(`/workspaces/${workspace.id}`);

    await page.getByRole('button', { name: 'Workspace actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete workspace' }).click();
    await page
      .getByRole('button', { name: 'Delete workspace and chats' })
      .click();

    await expect(page).toHaveURL('/home');
    await expect(
      page.getByTestId(`workspace-drop-target-${workspace.id}`)
    ).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL('/home');
    await expect(page.getByRole('heading', { name: 'Delete me' })).toHaveCount(0);

    const fixtureState = await getFixtureState(userId);
    expect(fixtureState.counters.workspaceDeletes).toBe(1);
  });
});
