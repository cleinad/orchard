const { test, expect } = require('@playwright/test');
const { createAuthenticatedCookie } = require('./helpers/supabaseAuthFixture');

test.describe('admin access boundary', () => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_AUTH_STORAGE_STATE),
    'Managed auth-fixture assertions do not apply to an external signed-in session.'
  );

  test('redirects a signed-out user to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin$/);
  });

  test('returns not found for an authenticated non-admin', async ({ page }) => {
    await page.context().addCookies([createAuthenticatedCookie()]);
    const response = await page.goto('/admin');

    expect(response).not.toBeNull();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', {
      name: 'This page could not be found.',
    })).toBeVisible();
    await expect(page.getByRole('heading', {
      name: 'Usage telemetry',
    })).toHaveCount(0);
  });
});
