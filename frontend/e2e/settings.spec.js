const { test, expect } = require('@playwright/test');
const { mockHomeDataRoutes } = require('./helpers/homeRouteMocks');
const { createAuthenticatedCookie } = require('./helpers/supabaseAuthFixture');

async function prepareAuthenticatedSettings(page, state = {}) {
  if (!process.env.PLAYWRIGHT_AUTH_STORAGE_STATE) {
    await page.context().addCookies([createAuthenticatedCookie()]);
  }

  return mockHomeDataRoutes(page, state);
}

test('global instructions can be discarded and saved from Settings', async ({ page }) => {
  const initialInstructions = 'Use examples from biology.';
  const updatedInstructions = 'Prefer concise TypeScript examples.';
  const state = await prepareAuthenticatedSettings(page, {
    viewer: {
      id: 'e2e-user-1',
      email: 'e2e@example.com',
      fullName: 'E2E User',
      globalInstructions: initialInstructions,
    },
  });

  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
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
  expect(state.viewer.globalInstructions).toBe(updatedInstructions);
});

test('a failed global-instructions save preserves the draft', async ({ page }) => {
  await prepareAuthenticatedSettings(page);
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Synthetic save failure' }),
      });
      return;
    }

    await route.fallback();
  });

  await page.goto('/settings');

  const editor = page.getByLabel('Global instructions');
  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  await editor.fill('Keep this draft after a failure.');
  await saveButton.click();

  await expect(
    page.getByText('Could not save your instructions. Please try again.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(editor).toHaveValue('Keep this draft after a failure.');
  await expect(saveButton).toBeEnabled();
});

test('a missing profile is treated as an invariant failure', async ({
  page,
}) => {
  const state = await prepareAuthenticatedSettings(page, {
    profileExists: false,
  });

  await page.goto('/settings');

  const editor = page.getByLabel('Global instructions');
  await expect(editor).toHaveValue('');

  await editor.fill('Explain unfamiliar terms before using them.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(
    page.getByText('Could not save your instructions. Please try again.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(editor).toHaveValue(
    'Explain unfamiliar terms before using them.'
  );
  expect(state.profileExists).toBe(false);
  expect(state.viewer.globalInstructions).toBe('');
});
