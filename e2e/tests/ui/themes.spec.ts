import { expect, test, type Page } from '@playwright/test';
import { adminByPassword, call, newHousehold, newMember, newRecipe, unique } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/**
 * The Theme screen, at iPhone size: picking a theme repaints the whole app at once (colours and
 * the title font), survives a reload before the server has even answered, follows you to the
 * server, and shows up on the admin's Themes tab.
 */

/** A CSS variable on the page, as the "r g b" the stylesheet writes it in. */
const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

const mode = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);

/** The page's large title's font, as the browser resolved it. */
const titleFont = (page: Page) =>
  page.locator('h1').first().evaluate((h) => getComputedStyle(h).fontFamily);

async function openTheme(page: Page) {
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: /^Theme/ }).click();
  await expect(page).toHaveURL(/\/settings\/theme$/);
  await expect(page.getByRole('heading', { name: 'Theme', exact: true })).toBeVisible();
}

test('a theme repaints the app, is saved to your account, and survives a reload', async ({ page }) => {
  const hh = await newHousehold(unique('Colours'));
  const me = await newMember(hh.id);
  await newRecipe(hh.id, unique('Leek soup'), [{ name: 'leek', qty: 2 }]);
  await signIn(page, me, hh.id);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/meal-plan');
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  // Tomato, the default: its tomato red, and Fraunces for titles.
  expect(await cssVar(page, '--accent')).toBe('212 81 46');
  expect(await mode(page)).toBe('light');
  expect(await titleFont(page)).toContain('Fraunces');

  await openTheme(page);
  await expect(page.getByRole('radio', { name: 'Tomato' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'Matcha' }).click();
  await expect(page.getByRole('radio', { name: 'Matcha' })).toHaveAttribute('aria-checked', 'true');
  // The whole palette changes, not only the accent: Matcha's sage paper and its terracotta plum.
  await expect.poll(() => cssVar(page, '--accent')).toBe('61 107 57');
  expect(await cssVar(page, '--bg')).toBe('244 244 236');
  expect(await cssVar(page, '--plum')).toBe('176 85 62');
  expect(await cssVar(page, '--title-w')).toBe('500');
  await expect(page.getByText('Saved to your account.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('matcha-light-theme.png') });
  expect((await call('GET', '/api/users/me', { token: me.token })).theme).toMatchObject({ preset: 'matcha' });

  // Dark, pinned — whatever the phone says.
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect.poll(() => mode(page)).toBe('dark');
  expect(await cssVar(page, '--accent')).toBe('140 196 126');
  await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('matcha-dark-theme.png') });
  await expect.poll(async () => (await call('GET', '/api/users/me', { token: me.token })).theme.mode).toBe('DARK');

  // Back goes to where Settings was opened, with Settings open again, saying what is on.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/meal-plan$/);
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: /^Theme/ })).toContainText(
    'Matcha · Dark',
  );
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).click();

  // A reload paints it straight away, before /me is back: the server is held up to prove it.
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/users/me', async (route) => {
    await held;
    await route.continue();
  });
  await page.reload();
  expect(await mode(page)).toBe('dark');
  expect(await cssVar(page, '--accent')).toBe('140 196 126');
  release();
  await page.unroute('**/api/users/me');
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('matcha-dark-plan.png') });

  await page.goto('/recipes');
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('matcha-dark-recipes.png') });

  // Signing out hands the next person the default.
  await page.getByRole('button', { name: 'Your account' }).click();
  await sheet(page).getByRole('button', { name: 'Sign out' }).click();
  await expect.poll(() => cssVar(page, '--accent')).toBe('212 81 46');
  expect(await mode(page)).toBe('light');
});

test('each theme brings its own title font', async ({ page }) => {
  const hh = await newHousehold(unique('Fonts'));
  const me = await newMember(hh.id);
  await signIn(page, me, hh.id);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings/theme');
  await expect(page.getByRole('heading', { name: 'Theme', exact: true })).toBeVisible();

  await page.getByRole('radio', { name: 'Blueberry' }).click();
  await expect.poll(() => cssVar(page, '--accent')).toBe('79 70 216');
  await page.goto('/recipes');
  await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
  expect(await titleFont(page)).toContain('Nunito');

  await page.goto('/settings/theme');
  await page.getByRole('radio', { name: 'Nordic' }).click();
  await expect.poll(() => cssVar(page, '--accent')).toBe('26 26 25');
  await page.goto('/recipes');
  expect(await titleFont(page)).toContain('Inter');

  // Brunch's egg-yolk buttons carry dark text, not white.
  await page.goto('/settings/theme');
  await page.getByRole('radio', { name: 'Brunch' }).click();
  await expect.poll(() => cssVar(page, '--on-accent')).toBe('42 33 18');
  await expect(page.getByRole('button', { name: 'Button', exact: true })).toHaveCSS('color', 'rgb(42, 33, 18)');
  await expect
    .poll(async () => (await call('GET', '/api/users/me', { token: me.token })).theme.preset)
    .toBe('brunch');
});

test('your own colour: picked by hex, kept readable, shown in light and dark', async ({ page }) => {
  const hh = await newHousehold(unique('Custom'));
  const me = await newMember(hh.id);
  await signIn(page, me, hh.id);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/meal-plan');
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  // System follows the phone, which here says dark.
  expect(await mode(page)).toBe('dark');

  await openTheme(page);
  await page.getByRole('radio', { name: 'Custom' }).click();
  // Starts from what was on screen: Tomato's accent.
  await expect(page.getByLabel('Your colour hex')).toHaveValue('#D4512E');

  // Pale yellow would be unreadable on white, so the light accent is darkened; dark keeps it.
  await page.getByLabel('Your colour hex').fill('#ffd60a');
  await expect.poll(() => cssVar(page, '--accent')).toBe('255 214 10');
  // And white would not read on it, so its buttons carry the dark page's ink.
  expect(await cssVar(page, '--on-accent')).toBe('23 18 15');
  await expect(page.getByText('Saved to your account.')).toBeVisible();
  await expect
    .poll(async () => (await call('GET', '/api/users/me', { token: me.token })).theme)
    .toEqual({ preset: 'custom', primary: '#FFD60A', secondary: '#FFD60A', mode: null });
  // Everything else is Tomato's.
  expect(await cssVar(page, '--bg')).toBe('23 18 15');
  await page.screenshot({ path: test.info().outputPath('custom-dark-theme.png') });

  // Half-typed is left alone rather than fought.
  await page.getByLabel('Your colour hex').fill('#12');
  await expect(page.getByLabel('Your colour hex')).toHaveAttribute('aria-invalid', 'true');
  expect(await cssVar(page, '--accent')).toBe('255 214 10');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => mode(page)).toBe('light');
  expect(await cssVar(page, '--accent')).toBe('173 144 0');
  await expect(page.getByRole('button', { name: 'Button', exact: true })).toHaveCSS(
    'background-color',
    'rgb(173, 144, 0)',
  );
});

test('a theme cached by the old app is brought up to date', async ({ page }) => {
  const hh = await newHousehold(unique('Old cache'));
  const me = await newMember(hh.id);
  await signIn(page, me, hh.id);
  // What the app before the redesign left in this browser: Ocean, and a stylesheet for it.
  await page.evaluate(() => {
    localStorage.setItem('mp_theme', JSON.stringify({ preset: 'ocean', primary: null, secondary: null, mode: 'LIGHT' }));
    localStorage.setItem('mp_themeCss', "html:root{--accent:3 105 161;--accent-ink:255 255 255;}");
    localStorage.setItem('mp_themeMode', 'LIGHT');
  });
  // The server has not been told anything yet, so only the cache speaks.
  await page.route('**/api/users/me', (route) => route.abort());
  await page.goto('/meal-plan');
  // Ocean became Blueberry.
  await expect.poll(() => cssVar(page, '--accent')).toBe('79 70 216');
  expect(await cssVar(page, '--accent-ink')).toBe('69 61 196');
  expect(await page.evaluate(() => localStorage.getItem('mp_themeCss'))).toBeNull();
});

test('the admin sees which themes people pick, and each person\'s beside their name', async ({ page }) => {
  const hh = await newHousehold(unique('Admin colours'));
  const m = await newMember(hh.id);
  // An old iPhone build's key: counted as the theme it became.
  await call('PUT', '/api/users/me/theme', { token: m.token, body: { preset: 'basil', mode: 'LIGHT' } });
  const odd = await newMember(hh.id);
  await call('PUT', '/api/users/me/theme', {
    token: odd.token,
    body: { preset: 'custom', primary: '#0F766E', secondary: '#E11D48' },
  });
  const one = await newMember(hh.id);
  await call('PUT', '/api/users/me/theme', { token: one.token, body: { preset: 'custom', primary: '#2F6F9F' } });

  await signIn(page, await adminByPassword(), hh.id);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Themes' }).click();
  await expect(page).toHaveURL(/tab=themes/);
  const themes = page.getByRole('list', { name: 'Themes in use' });
  await expect(themes.getByText('Matcha')).toBeVisible();
  await expect(themes.getByText('Nordic')).toBeVisible();
  await expect(themes.getByText('Basil')).toHaveCount(0);
  const custom = page.getByRole('list', { name: 'Custom colours in use' });
  // An old app's pair shows both; today's single colour shows once.
  await expect(custom.getByText('#0F766E · #E11D48')).toBeVisible();
  await expect(custom.getByText('#2F6F9F', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Light or dark' }).getByText('Light')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('admin-themes.png'), fullPage: true });

  await page.goto(`/admin?tab=people&q=${encodeURIComponent(m.email)}`);
  await expect(page.getByRole('img', { name: 'Colours: Matcha, light' })).toBeVisible();
});
