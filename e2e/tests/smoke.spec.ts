import { expect, test } from '@playwright/test';
import { expectAccessible, openMenu, signInAs } from './helpers.ts';

test('the sign-in page loads and is accessible', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'IWApp' })).toBeVisible();
  await expectAccessible(page);
});

test('a member signs in and sees the shell with only their own profile', async ({ page }) => {
  await signInAs(page, 'Member (Dwarka BV)');
  await expect(page.getByRole('heading', { name: 'Member' })).toBeVisible();
  await openMenu(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveText(['My profile']);
  await expectAccessible(page);
});

test('journey 5: a member corrects their own phone number', async ({ page }) => {
  await signInAs(page, 'Member (Dwarka BV)');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Phone').fill('98765 43210');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('+919876543210')).toBeVisible(); // normalised by the API
});

test("a BV leader sees Members, scoped to their BV, but can't edit others", async ({ page }) => {
  await signInAs(page, 'BV leader (Dwarka)');
  await openMenu(page);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Members' })
    .click();
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
  const rows = page.getByRole('listitem');
  await expect(rows.first()).toBeVisible();
  for (const bv of await rows.getByText(/Bhakti Vriksha|No BV/).allTextContents()) {
    expect(bv).toBe('Dwarka Bhakti Vriksha');
  }
  await page
    .getByRole('link', { name: /^Member\b/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Member' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0); // Q2: leaders can't
});

test('signing out returns to the sign-in page, and the session is gone', async ({ page }) => {
  await signInAs(page, 'Admin');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/sign-in$/);
});
