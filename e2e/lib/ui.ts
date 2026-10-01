import { expect, type Locator, type Page } from '@playwright/test';
import type { Session } from './api';

/**
 * Signs a page in by writing the same keys the app itself stores after signing in, so UI tests
 * that are not about signing in skip it.
 *
 * Most accounts the suite makes have only a PIN, so the app would open on its "add an email and
 * password" prompt. That is answered "Not now" up front unless a test is about the prompt.
 */
export async function signIn(
  page: Page,
  session: Session,
  householdId: string,
  { credentialsPrompt = false }: { credentialsPrompt?: boolean } = {},
) {
  await page.goto('/');
  await page.evaluate(
    ([s, hh, prompt]) => {
      localStorage.setItem('mp_token', s.token);
      localStorage.setItem('mp_userId', s.userId);
      localStorage.setItem('mp_displayName', s.displayName);
      localStorage.setItem('mp_activeHouseholdId', hh);
      if (prompt) sessionStorage.removeItem('mp_credentialsPromptDismissed');
      else sessionStorage.setItem('mp_credentialsPromptDismissed', '1');
    },
    [session, householdId, credentialsPrompt] as const,
  );
}

/** The household name in the header's household pill, top left. */
export async function headerHousehold(page: Page): Promise<string> {
  return page.locator('header').first().evaluate((header) => header.querySelector('[data-household-name]')?.textContent ?? '');
}

/** The household pill opens the switcher; this picks a household in it. */
export async function switchHousehold(page: Page, name: string) {
  await page.getByRole('button', { name: /Switch household$/ }).click();
  const switcher = page.getByRole('dialog', { name: 'Switch household' });
  await switcher.getByRole('radio', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) }).click();
  await expect(switcher).toHaveCount(0);
}

/** The households in the switcher, as their names. Leaves the switcher open. */
export async function householdsInSwitcher(page: Page) {
  await page.getByRole('button', { name: /Switch household$/ }).click();
  return page.getByRole('dialog').last().getByRole('radio');
}

/** The bottom tab bar. `.last()` because the header on wide screens has the same links. */
export const tab = (page: Page, name: string) => page.getByRole('link', { name, exact: true }).last();

/** The sheet on top, if any. */
export const sheet = (page: Page) => page.getByRole('dialog').last();

/**
 * Taps a row's check circle. Rows can sit under the fixed tab bar, where a tap lands on the tab
 * instead, so the row is centred first.
 */
export async function tapRowStart(page: Page, row: Locator) {
  await row.waitFor({ state: 'visible' });
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  // The list re-renders as it loads; a tap at a position measured mid-render lands on air.
  await page.waitForTimeout(150);
  const box = await row.boundingBox();
  if (!box) throw new Error('row is not visible');
  await page.mouse.click(28, box.y + Math.min(12, box.height / 2));
}

/** Opens a ••• menu by its label and picks an item from it. */
export async function fromMenu(page: Page, menu: string | RegExp, item: string | RegExp) {
  await page.getByRole('button', { name: menu }).first().click();
  await sheet(page).getByRole('button', { name: item }).click();
}

/** A left swipe, the way a thumb does it: pointer events in small steps. */
export async function swipeLeft(page: Page, row: Locator, distance = 160) {
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await row.boundingBox();
  if (!box) throw new Error('row is not visible');
  const y = box.y + box.height / 2;
  const startX = Math.min(box.x + box.width - 20, 360);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let x = startX; x >= startX - distance; x -= 12) {
    await page.mouse.move(x, y);
  }
  await page.mouse.up();
}

/**
 * A day on the Plan page's month calendar. The grid always shows the month around today, so a
 * date in the next month needs one page forward first.
 */
export async function calendarDay(page: Page, date: Date) {
  const today = new Date();
  const monthsAhead =
    (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth());
  for (let i = 0; i < monthsAhead; i++) await page.getByRole('button', { name: 'Next month' }).click();
  const label = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return page.getByRole('button', { name: new RegExp(`^${label}(,|$)`) });
}

/**
 * In an open day sheet: picks a meal along the top and presses "Plan dinner" (or, with something
 * already in it, "Add a side"), which opens the screen for filling the slot. Returns that screen.
 */
export async function fillSlot(page: Page, meal: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack', { side = false } = {}) {
  const day = sheet(page);
  await day.getByRole('tab', { name: new RegExp(`^${meal}`) }).click();
  await day.getByRole('button', { name: side ? 'Add a side' : `Plan ${meal.toLowerCase()}` }).click();
  return page.getByRole('dialog', { name: new RegExp(`^${meal} · `) });
}
