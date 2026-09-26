import type { Locator, Page } from '@playwright/test';
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

/**
 * The household name in the header, top left — a select when there are several, plain text when
 * there is one. Read in one go: checking for the select and then reading it could straddle the
 * moment the list changes (being removed from a house, say), and then wait on a select that is gone.
 */
export async function headerHousehold(page: Page): Promise<string> {
  return page.locator('header').first().evaluate((header) => {
    const picker = header.querySelector<HTMLSelectElement>('select[aria-label="Active household"]');
    if (picker) return picker.selectedOptions[0]?.textContent ?? '';
    return header.querySelector('span.truncate')?.textContent ?? '';
  });
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
