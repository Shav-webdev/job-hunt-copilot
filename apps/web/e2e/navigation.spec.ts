import { test, expect } from '@playwright/test';

const PROTECTED_ROUTES = [
  '/dashboard',
  '/jobs',
  '/applications',
  '/chat',
  '/profile',
];

for (const route of PROTECTED_ROUTES) {
  test(`unauthenticated visit to ${route} redirects to /login`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  });
}
