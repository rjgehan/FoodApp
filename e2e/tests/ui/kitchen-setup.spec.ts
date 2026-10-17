import { expect, test, type Page } from '@playwright/test';
import { call, inviteToken, legacyMember, newHousehold, newMember, setKitchen, unique } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/**
 * The kitchen questions (web/src/components/kitchen/KitchenSetup.tsx): which machines the house
 * has, whether it plans meals ahead, and whether it keeps a cupboard. Asked of whoever makes a
 * household and of whoever joins one nobody has answered them for; offered any time after by a
 * card on Recipes. They start from the household's own answers and never change one unasked.
 */

const household = async (id: string, token: string) =>
  (await call('GET', '/api/households', { token })).find((h: any) => h.id === id);

/** Start another household from the Household page; its kitchen questions open straight after. */
async function startAnother(page: Page, name: string) {
  await page.goto('/household');
  await page.getByRole('button', { name: 'Start another household' }).click();
  await sheet(page).getByPlaceholder('Gehan House').fill(name);
  await sheet(page).getByRole('button', { name: 'Create' }).click();
  await expect(sheet(page).getByRole('heading', { name: "What's in your kitchen?" })).toBeVisible();
}

const tabBar = (page: Page) => page.getByRole('navigation', { name: 'Tabs' }).last().getByRole('link');

test('a household made in the app asks its three questions, and the answers are saved', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  const name = unique('Cottage');
  await startAnother(page, name);
  const kitchen = sheet(page);

  // 1. Machines: Oven and Stovetop already ticked for a house with none saved.
  await expect(kitchen.getByRole('checkbox', { name: 'Oven' })).toHaveAttribute('aria-checked', 'true');
  await expect(kitchen.getByRole('checkbox', { name: 'Stovetop' })).toHaveAttribute('aria-checked', 'true');
  await expect(kitchen.getByRole('checkbox', { name: 'Air fryer' })).toHaveAttribute('aria-checked', 'false');
  await kitchen.getByRole('checkbox', { name: 'Air fryer' }).click();
  await kitchen.getByRole('checkbox', { name: 'Stovetop' }).click();
  // Says only what the machines do today: recipes show them. Nothing is hidden for want of one.
  await expect(kitchen.getByText('Tap everything you have. Recipes show which machines they need.')).toBeVisible();
  await expect(kitchen.getByText('You can change this any time in Household settings.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('kitchen-1-machines.png') });
  await kitchen.getByRole('button', { name: 'Next' }).click();

  // 2. Plan: on unless somebody says otherwise.
  await expect(kitchen.getByRole('heading', { name: 'Plan meals ahead?' })).toBeVisible();
  await expect(kitchen.getByRole('radio', { name: /Yes, show Plan/ })).toHaveAttribute('aria-checked', 'true');
  await kitchen.getByRole('radio', { name: /Not now/ }).click();
  await kitchen.getByRole('button', { name: 'Next' }).click();

  // 3. The cupboard: a new house has none, and most people start there.
  await expect(kitchen.getByRole('heading', { name: 'Keep track of your cupboard?' })).toBeVisible();
  await expect(kitchen.getByRole('radio', { name: /No thanks — just the list/ })).toHaveAttribute('aria-checked', 'true');
  await expect(kitchen.getByText('Most people start here')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('kitchen-3-cupboard.png') });
  await kitchen.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const made = (await call('GET', '/api/households', { token: hh.owner.token })).find((h: any) => h.name === name);
  await expect
    .poll(async () => household(made.id, hh.owner.token))
    .toMatchObject({ machines: ['oven', 'air-fryer'], planEnabled: false, cupboardEnabled: false, kitchenSetUp: true });
  // The tabs follow at once: no Plan, no Cupboard.
  await expect(tabBar(page)).toHaveText(['Recipes', 'Groceries', 'Explore']);

  // Answered once: neither the questions nor the card on Recipes come back.
  await page.goto('/recipes');
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Set up your kitchen')).toHaveCount(0);
});

test('Skip saves only what was answered, and marks the questions done', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);

  // Straight away: nothing answered, so nothing but the stamp.
  const quick = unique('Bedsit');
  await startAnother(page, quick);
  await sheet(page).getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const first = (await call('GET', '/api/households', { token: hh.owner.token })).find((h: any) => h.name === quick);
  await expect
    .poll(async () => household(first.id, hh.owner.token))
    .toMatchObject({ kitchenSetUp: true, machines: [], planEnabled: true, cupboardEnabled: false });

  // Past the machines, then Skip on the Plan: the machines go, the Plan is left alone.
  const halfway = unique('Studio');
  await startAnother(page, halfway);
  await sheet(page).getByRole('button', { name: 'Next' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Plan meals ahead?' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const second = (await call('GET', '/api/households', { token: hh.owner.token })).find((h: any) => h.name === halfway);
  await expect
    .poll(async () => household(second.id, hh.owner.token))
    .toMatchObject({ kitchenSetUp: true, machines: ['oven', 'stovetop'], planEnabled: true, cupboardEnabled: false });
});

test('the questions start from what the household already says, and never quietly change it', async ({ page }) => {
  const hh = await newHousehold({ setUp: false, cupboard: true, plan: false });
  await setKitchen(hh.id, { machines: ['blender'] });
  for (const name of ['rice', 'lentils']) {
    await call('POST', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token, body: { name } });
  }
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes');

  // Nobody here has answered them: a card offers them, without getting in the way.
  const card = page.getByRole('region', { name: 'Set up your kitchen' });
  await expect(card.getByText('3 quick questions')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await card.getByRole('button', { name: 'Start' }).click();

  const kitchen = sheet(page);
  await expect(kitchen.getByRole('checkbox', { name: 'Blender' })).toHaveAttribute('aria-checked', 'true');
  await expect(kitchen.getByRole('checkbox', { name: 'Oven' })).toHaveAttribute('aria-checked', 'false');
  await kitchen.getByRole('button', { name: 'Next' }).click();
  await expect(kitchen.getByRole('radio', { name: /Not now/ })).toHaveAttribute('aria-checked', 'true');
  await kitchen.getByRole('button', { name: 'Next' }).click();
  // A cupboard with things in it says so, and stays on unless somebody turns it off.
  await expect(kitchen.getByText('Your cupboard has 2 things in it.')).toBeVisible();
  await expect(kitchen.getByRole('radio', { name: /Yes, track my cupboard/ })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: test.info().outputPath('kitchen-cupboard-has-things.png') });
  await kitchen.getByRole('button', { name: 'Done' }).click();

  await expect
    .poll(async () => household(hh.id, hh.owner.token))
    .toMatchObject({ kitchenSetUp: true, machines: ['blender'], planEnabled: false, cupboardEnabled: true });
  await expect(page.getByRole('region', { name: 'Set up your kitchen' })).toHaveCount(0);
  // Left on, not turned on: no starter list for a cupboard that already has things in it.
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the card on Recipes can be put away, and waving the questions away keeps it', async ({ page }) => {
  const hh = await newHousehold({ setUp: false });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes');
  const card = page.getByRole('region', { name: 'Set up your kitchen' });
  await card.getByRole('button', { name: 'Start' }).click();
  await expect(sheet(page).getByRole('heading', { name: "What's in your kitchen?" })).toBeVisible();
  // Escape is not an answer: nothing is saved, and the card still asks.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card).toBeVisible();
  expect(await household(hh.id, hh.owner.token)).toMatchObject({ kitchenSetUp: false });

  // The cross: gone from this browser for this house, even after a reload.
  await card.getByRole('button', { name: 'Not now' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('somebody joining a household that is set up goes straight in; one nobody has set up asks', async ({ page }) => {
  // Set up already: its answers are the household's, so the joiner is not asked them again.
  const ready = await newHousehold();
  await page.goto(`/invite/${await inviteToken(ready.id)}`);
  await page.getByLabel('Your name').fill('Joiner Jo');
  await page.getByLabel('Email').fill(`${unique('joiner').toLowerCase()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('joiner-password');
  await page.getByLabel('Confirm password').fill('joiner-password');
  await page.getByRole('button', { name: 'Create account & join' }).click();
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Set up your kitchen')).toHaveCount(0);

  // Nobody has answered them yet: whoever joins gets asked, as the maker would have been.
  const bare = await newHousehold({ setUp: false });
  const joiner = await newMember(ready.id);
  await signIn(page, joiner, ready.id);
  await page.goto(`/invite/${await inviteToken(bare.id)}`);
  await page.getByRole('button', { name: `Join ${bare.name}` }).click();
  await expect(sheet(page).getByRole('heading', { name: "What's in your kitchen?" })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Skip' }).click();
  await expect.poll(async () => household(bare.id, joiner.token)).toMatchObject({ kitchenSetUp: true });
});

test('an answer given in Household → Kitchen & features counts as setting up, so the card on Recipes goes', async ({ page }) => {
  const hh = await newHousehold({ setUp: false });
  const sent: any[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().endsWith('/kitchen')) sent.push(r.postDataJSON());
  });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes');
  await expect(page.getByRole('region', { name: 'Set up your kitchen' })).toBeVisible();

  await page.goto('/household/kitchen');
  await expect(
    page.getByText('Saved for your household. Recipes show the machines they need, and a drawer can be filtered by machine.'),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: 'Air fryer' }).click();
  await expect.poll(async () => household(hh.id, hh.owner.token)).toMatchObject({ machines: ['air-fryer'], kitchenSetUp: true });
  expect(sent).toEqual([{ machines: ['air-fryer'], setUp: true }]);

  // Answered, so nobody is asked again: not by the card, and not as they join (the joining test above).
  await page.goto('/recipes');
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Set up your kitchen' })).toHaveCount(0);
});

test('turning the cupboard on goes straight on to the starter list, with no other prompt slipping in between', async ({ page }) => {
  const hh = await newHousehold({ setUp: false });
  // Somebody from before email sign-in, so there is an add-an-email prompt waiting its turn.
  const pinOnly = await legacyMember(hh.id);
  // When each prompt first shows, watched from the moment the page starts.
  await page.addInitScript(() => {
    const first: Record<string, number> = ((window as any).__firstShown = {});
    new MutationObserver(() => {
      for (const dialog of document.querySelectorAll('[role="dialog"]')) {
        for (const title of ['Add an email and password', 'Stock your cupboard']) {
          if (!(title in first) && dialog.textContent?.includes(title)) first[title] = performance.now();
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await signIn(page, pinOnly, hh.id, { credentialsPrompt: true });
  // Just joined in this browser, so the kitchen questions are first in the slot.
  await page.evaluate((id) => sessionStorage.setItem('mp_kitchenSetup', id), hh.id);
  // A phone network: the save takes a moment, which is when something used to slip in.
  await page.route('**/kitchen', async (route) => {
    await new Promise((done) => setTimeout(done, 800));
    await route.continue();
  });
  await page.goto('/recipes');

  const kitchen = sheet(page);
  await expect(kitchen.getByRole('heading', { name: "What's in your kitchen?" })).toBeVisible();
  await kitchen.getByRole('button', { name: 'Next' }).click();
  await kitchen.getByRole('button', { name: 'Next' }).click();
  await kitchen.getByRole('radio', { name: /Yes, track my cupboard/ }).click();
  await kitchen.getByRole('button', { name: 'Done' }).click();

  await expect(sheet(page).getByRole('heading', { name: 'Stock your cupboard' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__firstShown)).not.toHaveProperty(['Add an email and password']);
  // Its turn comes once the starter list is dealt with.
  await sheet(page).getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('dialog').getByText('Add an email and password').first()).toBeVisible();
  const shown = await page.evaluate(() => (window as any).__firstShown);
  expect(shown['Add an email and password']).toBeGreaterThan(shown['Stock your cupboard']);
});
