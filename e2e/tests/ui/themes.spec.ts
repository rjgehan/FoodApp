import { expect, test, type Page } from '@playwright/test';
import { adminByPassword, call, newHousehold, newMember, newRecipe, unique } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/**
 * Appearance, at iPhone size: picking colours repaints the whole app at once, survives a reload
 * before the server has even answered, follows you to the server, and shows up on the admin's
 * Themes tab.
 */

/** A CSS variable on the page, as the "r g b" the stylesheet writes it in. */
const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

const mode = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);

async function openAppearance(page: Page) {
  await page.getByRole('button', { name: 'Your account' }).click();
  await sheet(page).getByRole('button', { name: /^Appearance/ }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Appearance' })).toBeVisible();
}

test('a preset repaints the app, is saved to your account, and survives a reload', async ({ page }) => {
  const hh = await newHousehold(unique('Colours'));
  const me = await newMember(hh.id);
  await newRecipe(hh.id, unique('Leek soup'), [{ name: 'leek', qty: 2 }]);
  await signIn(page, me, hh.id);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/meal-plan');
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  // Classic: the orange the stylesheet has always had.
  expect(await cssVar(page, '--accent')).toBe('234 88 12');
  expect(await mode(page)).toBe('light');

  await openAppearance(page);
  await sheet(page).getByRole('radio', { name: 'Ocean' }).click();
  await expect(sheet(page).getByRole('radio', { name: 'Ocean' })).toHaveAttribute('aria-checked', 'true');
  // #0369A1, and a teal tint for the highlights.
  await expect.poll(() => cssVar(page, '--accent')).toBe('3 105 161');
  expect(await cssVar(page, '--secondary-soft')).toBe('218 251 247');
  await expect(sheet(page).getByText('Saved to your account.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('ocean-light-settings.png') });
  expect((await call('GET', '/api/users/me', { token: me.token })).theme).toMatchObject({ preset: 'ocean' });

  // Dark, pinned — whatever the phone says.
  await sheet(page).getByRole('radio', { name: 'Dark' }).click();
  await expect.poll(() => mode(page)).toBe('dark');
  expect(await cssVar(page, '--accent')).toBe('5 161 246');
  await expect(sheet(page).getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  // Let the controls' colour transitions finish before the picture.
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('ocean-dark-settings.png') });
  await expect.poll(async () => (await call('GET', '/api/users/me', { token: me.token })).theme.mode).toBe('DARK');

  // A reload paints it straight away, before /me is back: the server is held up to prove it.
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/users/me', async (route) => {
    await held;
    await route.continue();
  });
  await page.reload();
  expect(await mode(page)).toBe('dark');
  expect(await cssVar(page, '--accent')).toBe('5 161 246');
  release();
  await page.unroute('**/api/users/me');
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('ocean-dark-plan.png') });

  await page.goto('/recipes');
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('ocean-dark-recipes.png') });

  // Signing out hands the next person the app's own colours.
  await openAppearance(page);
  await sheet(page).getByRole('button', { name: 'Close' }).click();
  await sheet(page).getByRole('button', { name: 'Sign out' }).click();
  await expect.poll(() => cssVar(page, '--accent')).toBe('234 88 12');
  expect(await mode(page)).toBe('light');
});

test('your own colours: picked by hex, kept readable, shown in light and dark', async ({ page }) => {
  const hh = await newHousehold(unique('Custom'));
  const me = await newMember(hh.id);
  await signIn(page, me, hh.id);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/meal-plan');
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  // Auto follows the system, which here says dark.
  expect(await mode(page)).toBe('dark');

  await openAppearance(page);
  await sheet(page).getByRole('radio', { name: 'Your own colours' }).click();
  // Starts from what was on screen: Classic's pair.
  await expect(sheet(page).getByLabel('Main colour hex')).toHaveValue('#EA580C');

  // Pale yellow would be unreadable on white, so the light accent is darkened; dark keeps it.
  await sheet(page).getByLabel('Main colour hex').fill('#ffd60a');
  await sheet(page).getByLabel('Second colour hex').fill('#7E22CE');
  await expect.poll(() => cssVar(page, '--accent')).toBe('255 214 10');
  await expect(sheet(page).getByText('Saved to your account.')).toBeVisible();
  await expect
    .poll(async () => (await call('GET', '/api/users/me', { token: me.token })).theme)
    .toEqual({ preset: 'custom', primary: '#FFD60A', secondary: '#7E22CE', mode: null });
  const preview = sheet(page).getByRole('img', { name: 'Light preview' });
  await expect(preview.getByText('Add to plan')).toHaveCSS('background-color', 'rgb(158, 131, 0)');
  await sheet(page).getByRole('img', { name: 'Light preview' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('custom-dark-settings.png') });

  // Half-typed is left alone rather than fought.
  await sheet(page).getByLabel('Main colour hex').fill('#12');
  await expect(sheet(page).getByLabel('Main colour hex')).toHaveAttribute('aria-invalid', 'true');
  expect(await cssVar(page, '--accent')).toBe('255 214 10');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => mode(page)).toBe('light');
  expect(await cssVar(page, '--accent')).toBe('158 131 0');
});

test('the admin sees which colours people pick, and each person\'s beside their name', async ({ page }) => {
  const hh = await newHousehold(unique('Admin colours'));
  const m = await newMember(hh.id);
  await call('PUT', '/api/users/me/theme', { token: m.token, body: { preset: 'basil', mode: 'LIGHT' } });
  const odd = await newMember(hh.id);
  await call('PUT', '/api/users/me/theme', {
    token: odd.token,
    body: { preset: 'custom', primary: '#0F766E', secondary: '#E11D48' },
  });

  await signIn(page, await adminByPassword(), hh.id);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Themes' }).click();
  await expect(page).toHaveURL(/tab=themes/);
  const colours = page.getByRole('list', { name: 'Colours in use' });
  await expect(colours.getByText('Basil')).toBeVisible();
  await expect(colours.getByText('Graphite')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Custom colours in use' }).getByText('#0F766E · #E11D48')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Light or dark' }).getByText('Light')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('admin-themes.png'), fullPage: true });

  await page.goto(`/admin?tab=people&q=${encodeURIComponent(m.email)}`);
  await expect(page.getByRole('img', { name: 'Colours: Basil, light' })).toBeVisible();
});
