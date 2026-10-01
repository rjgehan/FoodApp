import { expect, test } from '@playwright/test';
import { call, inviteToken, newHousehold, newMember, unique } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/**
 * The household's own pages at iPhone size (mockup 6.2–6.8): its setup rows, Places we eat,
 * Name, servings & planning, Store aisles, and joining another house from the switcher.
 */

const aisleNames = async (householdId: string, token: string): Promise<string[]> =>
  (await call('GET', `/api/households/${householdId}/categories`, { token }))
    .sort((a: any, b: any) => a.position - b.position)
    .map((a: any) => a.name);

test('the setup rows say what is behind them, and each comes back to Household', async ({ page }) => {
  const hh = await newHousehold();
  await call('POST', `/api/households/${hh.id}/places`, { token: hh.owner.token, body: { name: 'Diner' } });
  const aisles = await aisleNames(hh.id, hh.owner.token);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household');

  const setup = page.getByRole('region', { name: 'Household setup' });
  await expect(setup.getByRole('button', { name: /^Places we eat/ })).toContainText('1');
  await expect(setup.getByRole('button', { name: /^Name, servings & planning/ })).toContainText('4 · 7 days');
  await expect(setup.getByRole('button', { name: /^Store aisles/ })).toContainText(String(aisles.length));

  await setup.getByRole('button', { name: /^Places we eat/ }).click();
  await expect(page.getByRole('heading', { name: 'Places we eat', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Household', exact: true }).click();
  await expect(page).toHaveURL(/\/household$/);
  await expect(page.getByRole('heading', { name: hh.name, level: 1 })).toBeVisible();
});

test('places we eat: add one, fill in its menu, phone and notes, then find it', async ({ page }) => {
  const hh = await newHousehold();
  await call('POST', `/api/households/${hh.id}/places`, { token: hh.owner.token, body: { name: 'Golden Wok' } });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household/places');

  // Nothing saved yet to open or call: the buttons stay, faded, so the card keeps its shape.
  const wok = page.getByRole('listitem').filter({ hasText: 'Golden Wok' });
  await expect(wok.getByText('No notes')).toBeVisible();
  await expect(wok.getByLabel('Call Golden Wok: not saved yet')).toBeVisible();

  await page.getByRole('button', { name: 'Add a place' }).click();
  await sheet(page).getByLabel('Name').fill('Sakura Sushi');
  await sheet(page).getByRole('button', { name: 'Add place' }).click();
  // Straight into its details, since a name alone is never the point.
  const details = page.getByRole('dialog', { name: 'Sakura Sushi' });
  await details.getByLabel('Menu link').fill('https://example.com/sakura');
  await details.getByLabel('Phone').fill('(555) 010-1010');
  await details.getByLabel('Notes').fill('Salmon set for Jo, no wasabi');
  await details.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const sakura = page.getByRole('listitem').filter({ hasText: 'Sakura Sushi' });
  await expect(sakura.getByText('Salmon set for Jo, no wasabi')).toBeVisible();
  await expect(sakura.getByRole('link', { name: 'Menu for Sakura Sushi' })).toHaveAttribute('href', 'https://example.com/sakura');
  await expect(sakura.getByRole('link', { name: 'Call Sakura Sushi' })).toHaveAttribute('href', 'tel:5550101010');

  // Search matches what to order as well as the name.
  await page.getByLabel('Search places').fill('wasabi');
  await expect(page.getByRole('listitem').filter({ hasText: 'Golden Wok' })).toHaveCount(0);
  await expect(sakura).toBeVisible();

  const [saved] = (await call('GET', `/api/households/${hh.id}/places`, { token: hh.owner.token })).filter(
    (p: any) => p.name === 'Sakura Sushi',
  );
  expect(saved).toMatchObject({ menuUrl: 'https://example.com/sakura', phone: '(555) 010-1010', notes: 'Salmon set for Jo, no wasabi' });

  // Deleting asks first.
  await page.getByLabel('Search places').fill('');
  await page.getByText('Golden Wok', { exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Delete place' }).click();
  await page.getByRole('alertdialog', { name: 'Delete Golden Wok?' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Golden Wok' })).toHaveCount(0);
});

test('name, servings & planning: one Save for all three; only the owner renames', async ({ page }) => {
  const hh = await newHousehold();
  const m = await newMember(hh.id);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household/setup');

  const renamed = unique('Home');
  await page.getByLabel('Household name').fill(renamed);
  await page.getByRole('group', { name: 'Servings' }).getByRole('button', { name: 'More servings' }).click();
  const days = page.getByRole('radiogroup', { name: 'Days to plan ahead' });
  await expect(days.getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
  await days.getByRole('radio', { name: '10 days' }).click();
  await expect(page.getByText('10 days', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/household$/);
  await expect(page.getByRole('heading', { name: renamed, level: 1 })).toBeVisible();

  const mine = (await call('GET', '/api/households', { token: hh.owner.token })).find((h: any) => h.id === hh.id);
  expect(mine).toMatchObject({ name: renamed, defaultServings: 5, planningHorizonDays: 10 });

  // Anyone else sees the name, but cannot change it.
  await signIn(page, m, hh.id);
  await page.goto('/household/setup');
  await expect(page.getByLabel('Household name')).toBeDisabled();
  await expect(page.getByText('Only the owner can change this')).toBeVisible();
});

test('store aisles: drag one by its grip, rename one, add one, delete one', async ({ page }) => {
  const hh = await newHousehold();
  const T = hh.owner.token;
  const before = await aisleNames(hh.id, T);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household/aisles');

  // Drag the third aisle up above the first, by its grip.
  const list = page.getByRole('list', { name: 'Store aisles' });
  const third = before[2];
  const grip = page.getByRole('button', { name: `Move ${third}`, exact: true });
  const from = (await grip.boundingBox())!;
  const top = (await list.getByRole('listitem').first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - ((from.y - top.y + 10) * step) / 8);
  }
  await page.mouse.up();
  await expect.poll(() => aisleNames(hh.id, T)).toEqual([third, ...before.filter((n) => n !== third)]);
  await expect(list.getByRole('listitem').first()).toContainText(third);

  // Tap a name to rename it.
  await page.getByRole('button', { name: `Rename or delete ${third}` }).click();
  await sheet(page).getByLabel('Aisle name').fill('Bakery corner');
  await sheet(page).getByRole('button', { name: 'Rename' }).click();
  await expect.poll(async () => (await aisleNames(hh.id, T))[0]).toBe('Bakery corner');

  // Add one: it goes on the end.
  await page.getByRole('button', { name: 'Add aisle' }).click();
  await sheet(page).getByLabel('New aisle name').fill('Pharmacy');
  await sheet(page).getByRole('button', { name: 'Add aisle' }).click();
  await expect(list.getByRole('listitem').last()).toContainText('Pharmacy');

  // Delete asks first.
  await page.getByRole('button', { name: 'Rename or delete Pharmacy' }).click();
  await sheet(page).getByRole('button', { name: 'Delete aisle' }).click();
  await page.getByRole('alertdialog', { name: 'Delete Pharmacy?' }).getByRole('button', { name: 'Delete Pharmacy' }).click();
  await expect.poll(() => aisleNames(hh.id, T)).not.toContain('Pharmacy');

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/household$/);
});

test('the switcher joins another house with an invite link', async ({ page }) => {
  const hh = await newHousehold();
  const theirs = await newHousehold();
  const m = await newMember(hh.id);
  await signIn(page, m, hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('button', { name: /Switch household$/ }).click();
  await page.getByRole('button', { name: 'Join with an invite link' }).click();
  const join = page.getByRole('dialog', { name: 'Join a household' });
  await join.getByLabel('Invite link').fill(`https://meals.example/invite/${await inviteToken(theirs.id)}`);
  await join.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('heading', { name: theirs.name, exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
