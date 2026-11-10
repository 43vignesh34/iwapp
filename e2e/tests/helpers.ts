import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Signs in through the test-account picker on the real sign-in page. */
export async function signInAs(page: Page, account: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole('combobox', { name: 'Sign in as' }).click();
  await page.getByRole('option', { name: account }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/profile$/);
}

/** Opens the menu on phones (behind the burger); a no-op on desktop. */
export async function openMenu(page: Page) {
  const burger = page.getByRole('button', { name: 'Toggle menu' });
  if (await burger.isVisible()) await burger.click();
}

/** WCAG 2.1 AA check with axe (spec §7). Fails on serious or critical violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
