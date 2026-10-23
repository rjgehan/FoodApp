import { expect, test, type Page } from '@playwright/test';
import { call, groceries, newHousehold } from '../../lib/api';
import { sheet, signIn, swipeLeft } from '../../lib/ui';

/**
 * The Plan and the Cupboard are a household's to turn off (Household → Kitchen & features).
 * Off, they are gone rather than greyed: their tabs, every way into them, and every line that
 * talks about them — and a link to one of their screens lands on Recipes instead. Recipes and
 * the grocery list are always there.
 */

const tabBar = (page: Page) => page.getByRole('navigation', { name: 'Tabs' }).last().getByRole('link');

const household = async (id: string, token: string) =>
  (await call('GET', '/api/households', { token })).find((h: any) => h.id === id);

test('with the Plan and the Cupboard off, their tabs go and their screens send you to Recipes', async ({ page }) => {
  const hh = await newHousehold({ plan: false, cupboard: false });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes');
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
  await expect(tabBar(page)).toHaveText(['Recipes', 'Groceries', 'Explore']);
  await page.screenshot({ path: test.info().outputPath('recipes-just-the-core.png') });

  // Old bookmarks, links from another phone: home, not a screen for something the house has not got.
  for (const path of ['/meal-plan', '/cupboard', '/explore/meal-plans', '/explore/meal-plans/cupboard', '/explore/meal-plans/new']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/recipes$/);
  }

  // Explore: Meal ideas where the Meal plans door was (every plan goes on the Plan), and Nutrition
  // without the week.
  await page.goto('/explore');
  await expect(page.getByRole('link', { name: 'Nutrition facts' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Meal plans' })).toHaveCount(0);
  await expect(page.getByText('kcal / day')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Meal ideas' })).toBeVisible();
  await page.goto('/explore/nutrition');
  await expect(page.getByText('Recent lookups', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: "This week's plan" })).toHaveCount(0);

  // An empty list says where else ingredients come from.
  await page.goto('/grocery-list');
  await expect(page.getByText("Nothing on the list. Add a recipe's ingredients from its page, or type an item.")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Plan', exact: true })).toHaveCount(0);

  // The household's own setup has no planning window to set.
  await page.goto('/household');
  await expect(page.getByRole('button', { name: /^Name & servings/ })).toBeVisible();
  await page.getByRole('button', { name: /^Name & servings/ }).click();
  await expect(page.getByText('How many you usually cook for')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Days to plan ahead' })).toHaveCount(0);
});

test('Done shopping with no cupboard just clears the ticked things, sending them all as bought', async ({ page }) => {
  const hh = await newHousehold({ cupboard: false });
  const T = hh.owner.token;
  for (const name of ['milk', 'bread', 'apples']) {
    const item = await call('POST', `/api/households/${hh.id}/grocery-list/items`, { token: T, body: { ingredientName: name } });
    if (name !== 'apples') await call('PATCH', `/api/households/${hh.id}/grocery-list/items/${item.id}`, { token: T, body: { checked: true } });
  }
  await signIn(page, hh.owner, hh.id);
  await page.goto('/grocery-list');
  await expect(tabBar(page)).toHaveText(['Recipes', 'Groceries', 'Plan', 'Explore']);

  // The item sheet has no Cupboard row to send anyone to.
  await swipeLeft(page, page.getByText('apples', { exact: true }));
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(sheet(page).getByRole('switch', { name: 'Remind me to buy it' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: /^Cupboard/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: /^Done shopping · 2 ticked/ }).click();
  const done = sheet(page);
  await expect(done.getByText('2 ticked items leave the list.')).toBeVisible();
  // Nothing to put away, so nothing to untick and no switch.
  await expect(done.getByRole('switch')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('done-shopping-no-cupboard.png') });
  const sent = page.waitForRequest((r) => r.url().endsWith('/grocery-list/put-away'));
  await done.getByRole('button', { name: 'Clear 2 ticked' }).click();
  // Everything goes as bought (put away), so its restock reminder starts again; nothing is left out.
  const body = (await sent).postDataJSON();
  expect(body.putAway).toHaveLength(2);
  expect(body.leaveOut).toEqual([]);

  await expect(page.getByRole('status')).toHaveText('Cleared 2 ticked items.');
  await expect.poll(async () => (await groceries(hh.id)).map((i) => i.name)).toEqual(['apples']);
  expect(await call('GET', `/api/households/${hh.id}/cupboard`, { token: T })).toEqual([]);
});

test('with the Cupboard off and the Plan on, meal plans stay but cooking from the cupboard goes', async ({ page }) => {
  const hh = await newHousehold({ cupboard: false });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/explore');
  const door = page.getByRole('link', { name: 'Meal plans' });
  await expect(door).toBeVisible();
  await expect(page.getByText('Built for a health goal')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cook from cupboard' })).toHaveCount(0);
  // Planning households have Meal plans; Meal ideas are for the ones that don't plan.
  await expect(page.getByRole('link', { name: 'Meal ideas' })).toHaveCount(0);
  await door.click();
  await expect(page).toHaveURL(/\/explore\/meal-plans$/);
  await expect(page.getByText('Plans for health targets')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cook from your cupboard' })).toHaveCount(0);
  await page.goto('/explore/meal-plans/cupboard');
  await expect(page).toHaveURL(/\/recipes$/);
});

test('Kitchen & features turns the Plan and the Cupboard off and on, and saves the machines, at once', async ({ page }) => {
  const hh = await newHousehold({ cupboard: false });
  const T = hh.owner.token;
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household');
  await page.getByRole('button', { name: /^Kitchen & features/ }).click();
  await expect(page).toHaveURL(/\/household\/kitchen$/);

  // A machine: one tap, saved.
  await page.getByRole('checkbox', { name: 'Slow cooker' }).click();
  await expect(page.getByRole('checkbox', { name: 'Slow cooker' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await household(hh.id, T)).machines).toEqual(['slow-cooker']);

  // The Plan off: the tab goes before the server has even answered, and the switch says what stays.
  const planning = page.getByRole('switch', { name: 'Meal planning' });
  await expect(planning).toHaveAttribute('aria-checked', 'true');
  await planning.click();
  await expect(planning).toHaveAttribute('aria-checked', 'false');
  await expect(tabBar(page)).toHaveText(['Recipes', 'Groceries', 'Explore']);
  await expect(planning).toContainText('Off.');
  await expect.poll(async () => (await household(hh.id, T)).planEnabled).toBe(false);

  // The Cupboard on, empty: the tab comes back, and the starter list is offered.
  const cupboard = page.getByRole('switch', { name: 'Cupboard' });
  await expect(cupboard).toContainText('Always have');
  await cupboard.click();
  await expect(tabBar(page)).toHaveText(['Recipes', 'Groceries', 'Cupboard', 'Explore']);
  await expect(sheet(page).getByRole('heading', { name: 'Stock your cupboard' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await household(hh.id, T)).toMatchObject({ planEnabled: false, cupboardEnabled: true, machines: ['slow-cooker'] });

  // Back: Household says how many machines there are now.
  await page.getByRole('button', { name: 'Household', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Kitchen & features/ })).toContainText('1 machine');
});

test('opening with no household list kept from before waits for it, rather than showing the Plan and taking it away', async ({ page }) => {
  const hh = await newHousehold({ plan: false, cupboard: false });
  const planFetches: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes(`/api/households/${hh.id}/meal-plan`)) planFetches.push(r.url());
  });
  // Every tab that is ever drawn, watched from the moment the page starts.
  await page.addInitScript(() => {
    const seen = ((window as any).__tabsSeen = new Set<string>());
    new MutationObserver(() => {
      document.querySelectorAll('nav[aria-label="Tabs"] a').forEach((a) => seen.add(a.textContent ?? ''));
    }).observe(document, { childList: true, subtree: true });
  });
  await signIn(page, hh.owner, hh.id);
  // The first visit after an update, or a new phone: no list of households kept from last time.
  await page.evaluate(() => localStorage.removeItem('mp_households'));
  // And a slow network, so a flash would have time to show.
  await page.route('**/api/households', async (route) => {
    await new Promise((done) => setTimeout(done, 800));
    await route.continue();
  });

  await page.goto('/meal-plan');
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(tabBar(page)).toHaveText(['Recipes', 'Groceries', 'Explore']);
  const seen: string[] = await page.evaluate(() => [...(window as any).__tabsSeen]);
  expect(seen).not.toContain('Plan');
  expect(seen).not.toContain('Cupboard');
  // The Plan screen was never drawn, so it never asked for the plan.
  expect(planFetches).toEqual([]);
});
