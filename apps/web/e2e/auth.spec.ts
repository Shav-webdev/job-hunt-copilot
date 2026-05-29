import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
  test('renders the sign-in form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  test('shows a link to the register page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
  });

  test('disables the submit button while the form is pending', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });
});

test.describe('Register page', () => {
  test('renders the registration form', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel(/Password/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  test('shows a link back to the login page', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });
});
