import type { Locator, Page } from '@playwright/test';
import type { Session } from './api';

/**
 * Signs a page in by writing the same keys the app itself stores after the PIN pad, so UI tests
 * that are not about signing in skip it.
 */
export async function signIn(page: Page, session: Session, householdId: string) {
  await page.goto('/');
  await page.evaluate(
    ([s, hh]) => {
      localStorage.setItem('mp_token', s.token);
      localStorage.setItem('mp_userId', s.userId);
      localStorage.setItem('mp_displayName', s.displayName);
      localStorage.setItem('mp_activeHouseholdId', hh);
    },
    [session, householdId] as const,
  );
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
