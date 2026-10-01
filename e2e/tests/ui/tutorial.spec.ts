import { expect, test, type Page } from '@playwright/test';
import { call, inviteToken, newHousehold, newMember, unique } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';
import { FRESH_DEVICE } from '../../lib/device';

/**
 * The first-run tutorial (web/src/tutorial), on a phone that has never opened the app: two
 * slides, "Light or dark?", then the sign-in screen — or, for somebody who came through an
 * invite, the invite first and the tutorial after joining. Once per device, and never for
 * somebody who was already signed in when it arrived.
 */
test.use({ storageState: FRESH_DEVICE });

const mode = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test('a new phone gets two slides and "Light or dark?" before signing in, and the choice goes on the account', async ({
  page,
}) => {
  const hh = await newHousehold(unique('Tutorial'));
  const cook = await newMember(hh.id);
  // Phones in this test are in light mode; the choice has to change something visible.
  await page.emulateMedia({ colorScheme: 'light' });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Plan the week together' })).toBeVisible();
  await expect(page.getByRole('img', { name: /The Plan screen/ })).toBeVisible();
  // Nothing to sign in to yet: the tutorial comes first.
  await expect(page.getByLabel('Email')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('tutorial-1.png') });

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'One list for the shop' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Light or dark?' })).toBeVisible();
  // Nothing chosen yet means following the phone.
  await expect(page.getByRole('radio', { name: /Match my phone/ })).toHaveAttribute('aria-checked', 'true');
  expect(await mode(page)).toBe('light');
  await page.getByRole('radio', { name: /Dark/ }).click();
  // On the page at once, not after Continue.
  await expect.poll(() => mode(page)).toBe('dark');
  await page.screenshot({ path: test.info().outputPath('tutorial-3-dark.png') });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByLabel('Email')).toBeVisible();
  expect(await mode(page)).toBe('dark');
  expect(await stored(page, 'mp_tutorialSeen')).toBe('1');

  // Never twice: the next visit opens on the sign-in screen, still dark.
  await page.reload();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  expect(await mode(page)).toBe('dark');

  // The account had no light or dark of its own, so it takes the one chosen here.
  expect((await call('GET', '/api/users/me', { token: cook.token })).theme.mode ?? null).toBeNull();
  await page.getByLabel('Email').fill(cook.email);
  await page.getByLabel('Password').fill(cook.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect.poll(async () => (await call('GET', '/api/users/me', { token: cook.token })).theme.mode).toBe('DARK');
  expect(await mode(page)).toBe('dark');
});

test('an account that already chose keeps its own light or dark', async ({ page }) => {
  const hh = await newHousehold(unique('Tutorial'));
  const cook = await newMember(hh.id);
  await call('PUT', '/api/users/me/theme', { token: cook.token, body: { preset: null, primary: null, secondary: null, mode: 'LIGHT' } });
  await page.emulateMedia({ colorScheme: 'light' });

  await page.goto('/');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: /Dark/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Email').fill(cook.email);
  await page.getByLabel('Password').fill(cook.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect.poll(() => mode(page)).toBe('light');
  expect((await call('GET', '/api/users/me', { token: cook.token })).theme.mode).toBe('LIGHT');
});

test('Skip goes straight to signing in, and the tutorial does not come back', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Plan the week together' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  // Skipping says nothing about light or dark: nothing is kept to put on an account.
  expect(await stored(page, 'mp_deviceThemeMode')).toBeNull();

  await page.goto('/');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan the week together' })).toHaveCount(0);
});

test('somebody invited sees the invite first, and the tutorial once they have joined', async ({ page }) => {
  const hh = await newHousehold(unique('Invited'));
  const token = await inviteToken(hh.id);
  await page.emulateMedia({ colorScheme: 'light' });

  await page.goto(`/invite/${token}`);
  // Straight to who invited them: no slides in front of the invitation.
  await expect(page.getByRole('heading', { name: hh.name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);

  const email = `${unique('invited').toLowerCase()}@example.com`;
  await page.getByLabel('Your name').fill('Invited Ivy');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('invited-password');
  await page.getByLabel('Confirm password').fill('invited-password');
  await page.getByRole('button', { name: 'Create account & join' }).click();

  // Joined: now the tutorial, ending in the app rather than at a sign-in screen.
  await expect(page.getByRole('heading', { name: 'Plan the week together' })).toBeVisible();
  const members = await call('GET', `/api/households/${hh.id}/members`, { token: hh.owner.token });
  expect(members.map((m: { displayName: string }) => m.displayName)).toContain('Invited Ivy');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: /Dark/ }).click();
  await page.getByRole('button', { name: 'Start planning' }).click();

  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  expect(await mode(page)).toBe('dark');
  const auth = await call('POST', '/api/auth/login/email', { body: { email, password: 'invited-password' } });
  await expect.poll(async () => (await call('GET', '/api/users/me', { token: auth.token })).theme.mode).toBe('DARK');

  // And once is enough.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
});

test('somebody already signed in when the tutorial arrives never sees it, even after signing out', async ({ page }) => {
  const hh = await newHousehold();
  // A phone that was signed in before this update: a session, and no record of the tutorial.
  await signIn(page, hh.owner, hh.id);
  await page.evaluate(() => localStorage.removeItem('mp_tutorialSeen'));

  await page.goto('/meal-plan');
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Your account' }).click();
  await sheet(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan the week together' })).toHaveCount(0);
});
