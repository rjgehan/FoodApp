import { expect, test, type Page } from '@playwright/test';
import { call, loginWithEmail, newHousehold, newMember, unique } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/**
 * Email and password sign-in at iPhone size: the new front door, the prompt that moves PIN
 * accounts over, the household you land in, and an owner handing out a reset link.
 */

const address = (who: string) => `${unique(who).toLowerCase()}@example.com`;

/** The household name in the header, top left. A select when there are several. */
async function headerHousehold(page: Page): Promise<string> {
  const picker = page.getByLabel('Active household');
  if (await picker.count()) {
    return picker.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent ?? '');
  }
  return (await page.locator('header span.truncate').first().textContent()) ?? '';
}

test('email and password sign in, landing in the household you were last in', async ({ page }) => {
  const first = await newHousehold();
  const second = await newHousehold();
  const m = await newMember(first.id);
  await call('POST', `/api/households/${second.id}/members`, { token: second.owner.token, body: { username: m.username } });
  const email = address('front');
  await call('PUT', '/api/users/me/credentials', { token: m.token, body: { email, password: 'front-door-pw' } });
  await call('PUT', '/api/users/me/active-household', { token: m.token, body: { householdId: second.id } });

  await page.goto('/');
  await page.getByLabel('Email').fill(email.toUpperCase());
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Incorrect email or password')).toBeVisible();

  await page.getByLabel('Password').fill('front-door-pw');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect.poll(() => headerHousehold(page)).toBe(second.name);
  // They have both already, so nothing asks for them.
  await expect(page.getByText('Add an email and password')).toHaveCount(0);

  // Switching is remembered for the next sign-in, on any device.
  await page.getByLabel('Active household').selectOption(first.id);
  await expect.poll(async () => (await loginWithEmail(email, 'front-door-pw')).lastHouseholdId).toBe(first.id);
});

test('the name-and-PIN screens open the household you tapped, not the first you joined', async ({ page }) => {
  const first = await newHousehold();
  const second = await newHousehold();
  const m = await newMember(first.id, '1357');
  await call('POST', `/api/households/${second.id}/members`, { token: second.owner.token, body: { username: m.username } });

  await page.goto('/');
  await page.getByText('Sign in with your name and PIN').click();
  await page.getByRole('button', { name: new RegExp(second.name) }).click();
  await page.getByRole('button', { name: m.displayName }).click();
  for (const d of '1357') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect.poll(() => headerHousehold(page)).toBe(second.name);
});

test('a PIN account is asked for an email and password, and can put it off until next time', async ({ page, browser }) => {
  const hh = await newHousehold();
  const m = await newMember(hh.id);
  await signIn(page, m, hh.id, { credentialsPrompt: true });
  await page.goto('/meal-plan');

  const prompt = sheet(page);
  await expect(prompt.getByText("Next time you'll sign in with these instead of your PIN")).toBeVisible();
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Not again this session…
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect(page.getByText('Add an email and password')).toHaveCount(0);

  // …but the next time the app is opened, it asks again — and this time they fill it in.
  const next = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const again = await next.newPage();
  await signIn(again, m, hh.id, { credentialsPrompt: true });
  await again.goto('/meal-plan');
  const form = sheet(again);
  const email = address('prompt');
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Password', { exact: true }).fill('prompted-pw');
  await form.getByLabel('Confirm password').fill('different-pw');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByText("Those passwords don't match.")).toBeVisible();
  await form.getByLabel('Confirm password').fill('prompted-pw');
  await form.getByRole('button', { name: 'Save' }).click();
  // It says it worked, rather than just vanishing the way "Not now" does.
  await expect(form.getByText(email)).toBeVisible();
  await form.getByRole('button', { name: 'Done' }).click();
  await expect(again.getByRole('dialog')).toHaveCount(0);
  await next.close();

  expect((await loginWithEmail(email, 'prompted-pw')).userId).toBe(m.userId);
});

test('an email someone else has is refused in the prompt with a sentence', async ({ page }) => {
  const hh = await newHousehold();
  const taken = await newMember(hh.id);
  const email = address('dupe');
  await call('PUT', '/api/users/me/credentials', { token: taken.token, body: { email, password: 'first-owner' } });
  const m = await newMember(hh.id);
  await signIn(page, m, hh.id, { credentialsPrompt: true });
  await page.goto('/meal-plan');
  const form = sheet(page);
  await form.getByLabel('Email').fill(email.toUpperCase());
  await form.getByLabel('Password', { exact: true }).fill('second-owner');
  await form.getByLabel('Confirm password').fill('second-owner');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByText('That email already has an account')).toBeVisible();
});

test('you can change your email and password from Settings', async ({ page }) => {
  const hh = await newHousehold();
  const m = await newMember(hh.id);
  const email = address('settings');
  await call('PUT', '/api/users/me/credentials', { token: m.token, body: { email, password: 'old-password' } });
  await signIn(page, m, hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('button', { name: 'Your account' }).click();
  const settings = sheet(page);
  await expect(settings.getByText(email)).toBeVisible();
  await settings.getByRole('button', { name: 'Change' }).click();
  await settings.getByLabel('New password').fill('new-password');
  await settings.getByLabel('Confirm password').fill('new-password');
  await settings.getByLabel('Current password').fill('old-password');
  await settings.getByRole('button', { name: 'Update sign-in' }).click();
  await expect(settings.getByText('Saved. Use them next time you sign in.')).toBeVisible();
  expect((await loginWithEmail(email, 'new-password')).userId).toBe(m.userId);
});

test('the owner sees who has no email yet, and hands out a reset link that signs them in', async ({ page, browser }) => {
  const hh = await newHousehold();
  const m = await newMember(hh.id);
  const never = await call('POST', `/api/households/${hh.id}/users`, {
    token: hh.owner.token,
    body: { username: unique('never').toLowerCase() },
  });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household');

  // Somebody who has never got in is told apart from somebody who just has no email yet.
  const newcomer = page.getByRole('listitem').filter({ hasText: never.displayName });
  await expect(newcomer.getByText("Hasn't signed in yet")).toBeVisible();
  await expect(newcomer.getByText('No email yet')).toHaveCount(0);
  const row = page.getByRole('listitem').filter({ hasText: m.displayName });
  await expect(row.getByText('No email yet')).toBeVisible();
  await row.getByRole('button', { name: `More for ${m.displayName}` }).click();
  await sheet(page).getByRole('button', { name: 'Reset password' }).click();
  const handout = sheet(page);
  await expect(handout.getByRole('heading', { name: 'Reset password' })).toBeVisible();
  await expect(handout.getByRole('img', { name: 'QR code of the link' })).toBeVisible();
  const url = (await handout.getByLabel('Link', { exact: true }).textContent())!.trim();
  expect(url).toMatch(/\/reset\/[A-Za-z0-9_-]{43}$/);

  // Opened on their own phone, signed out.
  const theirs = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await theirs.newPage();
  await phone.goto(url);
  await expect(phone.getByText(`Hi, ${m.displayName}`)).toBeVisible();
  const email = address('resetui');
  await phone.getByLabel('Email').fill(email);
  await phone.getByLabel('New password').fill('fresh-password');
  await phone.getByLabel('Confirm password').fill('fresh-password');
  await phone.getByRole('button', { name: 'Set password and sign in' }).click();
  await expect(phone.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();

  // The link is spent.
  await phone.goto(url);
  await expect(phone.getByText("This link doesn't work any more")).toBeVisible();
  // They are signed in by now, so the way on is into the app, not to a sign-in screen.
  await expect(phone.getByRole('button', { name: 'Open Meal Planner' })).toBeVisible();
  await theirs.close();
  expect((await loginWithEmail(email, 'fresh-password')).userId).toBe(m.userId);
});

test('sign-out forgets the household, so the next person does not land in it', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('button', { name: 'Your account' }).click();
  await sheet(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('mp_activeHouseholdId'))).toBeNull();
});
