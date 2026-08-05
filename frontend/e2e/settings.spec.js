const { test, expect } = require('@playwright/test');
const { mockHomeDataRoutes } = require('./helpers/homeRouteMocks');
const {
  createAuthenticatedCookie,
  getFixtureState,
} = require('./helpers/supabaseAuthFixture');

test.skip(
  Boolean(process.env.PLAYWRIGHT_AUTH_STORAGE_STATE),
  'Settings fixture assertions require the local stateful Supabase fixture.',
);

async function prepareAuthenticatedSettings(page, options = {}) {
  const userId = options.userId || `settings-${test.info().testId}`;
  const fixtureOptions = {
    ...options,
    userId,
  };
  delete fixtureOptions.mockHome;

  await page.context().addCookies([
    await createAuthenticatedCookie(fixtureOptions),
  ]);

  if (options.mockHome) {
    await mockHomeDataRoutes(page, {
      viewer: {
        id: userId,
        email: options.email || 'e2e@example.com',
        fullName: options.fullName || 'E2E User',
        globalInstructions: options.globalInstructions || '',
      },
    });
  }

  return userId;
}

test('hard-loaded Settings uses one profile query and no Auth user request', async ({
  page,
}) => {
  const userId = await prepareAuthenticatedSettings(page, {
    globalInstructions: 'Use examples from biology.',
  });

  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('Global instructions')).toHaveValue(
    'Use examples from biology.',
  );
  const state = await getFixtureState(userId);
  expect(state.counters.profileReads).toBe(1);
  expect(state.counters.authUser).toBe(0);
});

test('global instructions can be discarded and saved from Settings', async ({
  page,
}) => {
  const initialInstructions = 'Use examples from biology.';
  const updatedInstructions = 'Prefer concise TypeScript examples.';
  const userId = await prepareAuthenticatedSettings(page, {
    globalInstructions: initialInstructions,
  });

  await page.goto('/settings');

  const editor = page.getByLabel('Global instructions');
  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  const discardButton = page.getByRole('button', {
    name: 'Discard',
    exact: true,
  });

  await expect(editor).toHaveValue(initialInstructions);
  await expect(editor).toHaveAttribute('maxlength', '4000');
  await expect(saveButton).toBeDisabled();
  await expect(discardButton).toBeDisabled();

  await editor.fill(updatedInstructions);
  await expect(saveButton).toBeEnabled();
  await discardButton.click();
  await expect(editor).toHaveValue(initialInstructions);
  await expect(saveButton).toBeDisabled();

  await editor.fill(updatedInstructions);
  await saveButton.click();

  await expect(page.getByRole('status')).toHaveText('Saved');
  await expect(editor).toHaveValue(updatedInstructions);
  const state = await getFixtureState(userId);
  expect(state.profile.global_instructions).toBe(updatedInstructions);
  expect(state.counters.profileWrites).toBe(1);
  expect(state.counters.authUser).toBe(1);
});

test('a failed global-instructions save preserves the draft', async ({
  page,
}) => {
  const userId = await prepareAuthenticatedSettings(page, {
    profileWriteFailures: 1,
  });
  await page.goto('/settings');

  const editor = page.getByLabel('Global instructions');
  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  await editor.fill('Keep this draft after a failure.');
  await saveButton.click();

  await expect(
    page.getByText('Could not save your instructions. Please try again.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(editor).toHaveValue('Keep this draft after a failure.');
  await expect(saveButton).toBeEnabled();
  const state = await getFixtureState(userId);
  expect(state.profile.global_instructions).toBe('');
  expect(state.counters.profileWrites).toBe(1);
});

test('a rejected save request restores the controls and preserves the draft', async ({
  page,
}) => {
  await prepareAuthenticatedSettings(page);
  await page.goto('/settings');
  await page.route('**/settings', async (route) => {
    if (
      route.request().method() === 'POST'
      && route.request().headers()['next-action']
    ) {
      await route.abort('failed');
      return;
    }

    await route.continue();
  });

  const editor = page.getByLabel('Global instructions');
  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  await editor.fill('Keep this draft after a rejected request.');
  await saveButton.click();

  await expect(
    page.getByText('Could not save your instructions. Please try again.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(editor).toHaveValue(
    'Keep this draft after a rejected request.',
  );
  await expect(saveButton).toBeEnabled();
});

test('a missing profile keeps the settings shell available', async ({
  page,
}) => {
  await prepareAuthenticatedSettings(page, {
    profileExists: false,
  });

  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Your account profile is missing.')).toBeVisible();
  await expect(page.getByLabel('Body font')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByLabel('Global instructions')).toHaveCount(0);
  await expect(page.locator('.animate-spin')).toHaveCount(0);
});

test('a transient profile failure can be retried in place', async ({ page }) => {
  const userId = await prepareAuthenticatedSettings(page, {
    globalInstructions: 'Explain unfamiliar terms.',
    profileReadFailures: 1,
  });

  await page.goto('/settings');

  await expect(
    page.getByText(
      'Your profile could not be loaded. The rest of settings remains available.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(page.getByLabel('Global instructions')).toHaveValue(
    'Explain unfamiliar terms.',
  );
  const state = await getFixtureState(userId);
  expect(state.counters.profileReads).toBe(2);
});

test('the Settings link is eligible for production prefetch and navigates', async ({
  page,
}) => {
  await prepareAuthenticatedSettings(page, {
    globalInstructions: 'Render this from the prefetched payload.',
    mockHome: true,
  });

  await page.goto('/home');
  await page.getByRole('button', { name: 'Open conversations' }).click();

  const settingsLink = page.getByRole('link', { name: 'Open settings' });
  await expect(settingsLink).toHaveAttribute('href', '/settings');
  await settingsLink.click();
  await expect(page.getByLabel('Global instructions')).toHaveValue(
    'Render this from the prefetched payload.',
  );
});

test('an expired session is refreshed and still loads Settings', async ({
  page,
}) => {
  const userId = await prepareAuthenticatedSettings(page, {
    expiresIn: -60,
    globalInstructions: 'Keep the session alive.',
  });

  await page.goto('/settings');

  await expect(page.getByLabel('Global instructions')).toHaveValue(
    'Keep the session alive.',
  );
  const state = await getFixtureState(userId);
  expect(state.counters.refreshes).toBe(1);
  expect(state.counters.profileReads).toBe(1);
});

test('signing out clears the session and redirects to login', async ({ page }) => {
  const userId = await prepareAuthenticatedSettings(page);
  await page.goto('/settings');

  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/login$/);
  const state = await getFixtureState(userId);
  expect(state.counters.logouts).toBe(1);
});
