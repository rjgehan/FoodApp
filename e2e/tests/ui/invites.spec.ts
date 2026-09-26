import { expect, test, type Browser } from '@playwright/test';
import { call, inviteToken, legacyMember, loginWithEmail, newHousehold, newMember, unique } from '../../lib/api';
import { headerHousehold, sheet, signIn } from '../../lib/ui';

/**
 * Invite links at iPhone size: the owner hands one out, a new person makes an account from it, a
 * person with an account signs in through it, and the owner takes somebody out again.
 */

const address = (who: string) => `${unique(who).toLowerCase()}@example.com`;

/** Somebody else's phone, signed out: a fresh browser context at iPhone size. */
async function anotherPhone(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    baseURL: process.env.WEB_URL ?? 'http://localhost:5173',
  });
  return { context, page: await context.newPage() };
}


test('the owner hands out the link, and somebody new makes an account from it and is in', async ({ page, browser }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/household');

  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Invite someone' }) });
  const link = card.getByLabel('Link', { exact: true });
  await expect(link).toHaveText(/\/invite\/[A-Za-z0-9_-]{43}$/);
  const url = (await link.textContent())!.trim();
  // The QR code is there for somebody in the room, behind a toggle so the link leads.
  await expect(card.getByRole('img', { name: 'QR code of the link' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Show QR code' }).click();
  await expect(card.getByRole('img', { name: 'QR code of the link' })).toBeVisible();
  await expect(card.getByText(/Works until/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('invite-card.png'), fullPage: true });

  const { context, page: phone } = await anotherPhone(browser);
  await phone.goto(url);
  await expect(phone.getByRole('heading', { name: `Join ${hh.name}` })).toBeVisible();
  await expect(phone.getByText('E2E Admin invited you')).toBeVisible();
  // No app around it: a guest sees the invitation, not a tab bar.
  await expect(phone.getByRole('link', { name: 'Plan', exact: true })).toHaveCount(0);
  await phone.screenshot({ path: test.info().outputPath('invite-signed-out.png'), fullPage: true });

  const email = address('newbie');
  await phone.getByLabel('Your name').fill('Newbie');
  await phone.getByLabel('Email').fill(email);
  await phone.getByLabel('Password', { exact: true }).fill('newbie-password');
  await phone.getByLabel('Confirm password').fill('newbie-password');
  await phone.getByRole('button', { name: 'Create an account and join' }).click();
  await expect(phone.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect.poll(() => headerHousehold(phone)).toBe(hh.name);
  // A new account already has its email and password, so nothing asks for them.
  await expect(phone.getByText('Add an email and password')).toHaveCount(0);
  await context.close();

  const members = await call('GET', `/api/households/${hh.id}/members`, { token: hh.owner.token });
  expect(members.map((m: { displayName: string }) => m.displayName)).toContain('Newbie');
  expect((await loginWithEmail(email, 'newbie-password')).lastHouseholdId).toBe(hh.id);
});

test('an email that already has an account turns the form into signing in, and then joins', async ({ browser }) => {
  const hh = await newHousehold();
  const existing = await newMember((await newHousehold()).id);
  const url = `/invite/${await inviteToken(hh.id)}`;

  const { context, page: phone } = await anotherPhone(browser);
  await phone.goto(url);
  await phone.getByLabel('Your name').fill('Me Again');
  await phone.getByLabel('Email').fill(existing.email.toUpperCase());
  await phone.getByLabel('Password', { exact: true }).fill('whatever-password');
  await phone.getByLabel('Confirm password').fill('whatever-password');
  await phone.getByRole('button', { name: 'Create an account and join' }).click();

  await expect(phone.getByText('That email already has an account')).toBeVisible();
  await expect(phone.getByLabel('Email')).toHaveValue(existing.email.toUpperCase());
  await phone.getByLabel('Password').fill(existing.password);
  await phone.getByRole('button', { name: 'Sign in and join' }).click();

  await expect(phone.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect.poll(() => headerHousehold(phone)).toBe(hh.name);
  await context.close();
  const mine = await call('GET', '/api/households', { token: existing.token });
  expect(mine.map((h: { id: string }) => h.id)).toContain(hh.id);
});

test('somebody still on a PIN signs in through the old screens and joins as they arrive', async ({ browser }) => {
  const hh = await newHousehold();
  const home = await newHousehold();
  const pinOnly = await legacyMember(home.id, '2580');
  const url = `/invite/${await inviteToken(hh.id)}`;

  const { context, page: phone } = await anotherPhone(browser);
  await phone.goto(url);
  await phone.getByText('I already have an account').click();
  await phone.getByText('Sign in with your name and PIN').click();
  await expect(phone.getByText(`Sign in to join ${hh.name}`)).toBeVisible();
  // Tapped the wrong way in: back goes to the invite's own sign-in, not a different page.
  await phone.getByRole('button', { name: 'Back to the invite' }).click();
  await expect(phone.getByRole('button', { name: 'Sign in and join' })).toBeVisible();
  await phone.getByText('Sign in with your name and PIN').click();
  await phone.getByRole('button', { name: new RegExp(home.name) }).click();
  await phone.getByRole('button', { name: pinOnly.displayName }).click();
  for (const d of '2580') await phone.getByRole('button', { name: d, exact: true }).click();

  await expect(phone.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect.poll(() => headerHousehold(phone)).toBe(hh.name);
  await context.close();
});

test('signed in, the link is one button', async ({ page }) => {
  const hh = await newHousehold();
  const home = await newHousehold();
  const m = await newMember(home.id);
  await signIn(page, m, home.id);
  await page.goto(`/invite/${await inviteToken(hh.id)}`);

  await expect(page.getByRole('heading', { name: `Join ${hh.name}` })).toBeVisible();
  await page.getByRole('button', { name: `Join ${hh.name}` }).click();
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect.poll(() => headerHousehold(page)).toBe(hh.name);
  // Both houses are there to switch between.
  await expect(page.getByLabel('Active household').locator('option')).toHaveCount(2);
});

test('somebody already in the house is told so, not invited into it', async ({ page }) => {
  const hh = await newHousehold();
  const home = await newHousehold();
  const m = await newMember(hh.id);
  await call('POST', `/api/invites/${await inviteToken(home.id)}/accept`, { token: m.token });
  await signIn(page, m, home.id);
  await page.goto(`/invite/${await inviteToken(hh.id)}`);

  await expect(page.getByText(`You're already in ${hh.name}`)).toBeVisible();
  await expect(page.getByRole('button', { name: `Join ${hh.name}` })).toHaveCount(0);
  await page.getByRole('button', { name: `Open ${hh.name}` }).click();
  await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
  await expect.poll(() => headerHousehold(page)).toBe(hh.name);
});

test('a server it cannot reach is not mistaken for a dead link', async ({ browser }) => {
  const hh = await newHousehold();
  const token = await inviteToken(hh.id);
  const { context, page: phone } = await anotherPhone(browser);
  let offline = true;
  await phone.route('**/api/public/invites/**', (route) => (offline ? route.abort('internetdisconnected') : route.continue()));
  await phone.goto(`/invite/${token}`);
  await expect(phone.getByText("Couldn't reach Meal Planner")).toBeVisible();
  await expect(phone.getByText("This invite doesn't work any more")).toHaveCount(0);
  offline = false;
  await phone.getByRole('button', { name: 'Try again' }).click();
  await expect(phone.getByRole('heading', { name: `Join ${hh.name}` })).toBeVisible();
  await context.close();
});

test('a link that was replaced says so, instead of an error', async ({ browser }) => {
  const hh = await newHousehold();
  const token = await inviteToken(hh.id);
  await call('DELETE', `/api/households/${hh.id}/invite`, { token: hh.owner.token });

  const { context, page: phone } = await anotherPhone(browser);
  await phone.goto(`/invite/${token}`);
  await expect(phone.getByText("This invite doesn't work any more")).toBeVisible();
  await expect(phone.getByLabel('Your name')).toHaveCount(0);
  await context.close();
});

test('Join a household takes a pasted link to the invitation', async ({ page }) => {
  const hh = await newHousehold();
  const home = await newHousehold();
  const m = await newMember(home.id);
  const token = await inviteToken(hh.id);
  await signIn(page, m, home.id);
  await page.goto('/household');

  await page.getByRole('button', { name: 'Join a household' }).click();
  const join = sheet(page);
  await expect(join.getByRole('button', { name: 'Scan a QR code' })).toBeVisible();
  await join.getByLabel('Invite link').fill('https://example.com/not-an-invite');
  await join.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(join.getByText("That isn't a Meal Planner invite link")).toBeVisible();

  await join.getByLabel('Invite link').fill(`  https://meals.example/invite/${token}  `);
  await join.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Join ${hh.name}` })).toBeVisible();
});

test('only the owner can make a new link, and the old one stops working', async ({ page }) => {
  const hh = await newHousehold();
  const m = await newMember(hh.id);
  const before = await inviteToken(hh.id);

  await signIn(page, m, hh.id);
  await page.goto('/household');
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Invite someone' }) });
  await expect(card.getByLabel('Link', { exact: true })).toHaveText(new RegExp(`${before}$`));
  await expect(card.getByRole('button', { name: 'Make a new link' })).toHaveCount(0);

  await signIn(page, hh.owner, hh.id);
  await page.goto('/household');
  await card.getByRole('button', { name: 'Make a new link' }).click();
  await expect(card.getByText('The link you have now stops working')).toBeVisible();
  await card.getByRole('button', { name: 'Make a new link' }).click();
  await expect(card.getByLabel('Link', { exact: true })).not.toHaveText(new RegExp(`${before}$`));
  expect((await call('GET', `/api/public/invites/${before}`)).valid).toBe(false);
});

test('the owner removes someone, after asking, and their phone moves on to another house', async ({ page, browser }) => {
  const hh = await newHousehold();
  const other = await newHousehold();
  const m = await newMember(hh.id);
  await call('POST', `/api/invites/${await inviteToken(other.id)}/accept`, { token: m.token });

  // Their phone, open on the house they are about to be taken out of.
  const { context, page: theirs } = await anotherPhone(browser);
  await signIn(theirs, m, hh.id);
  await theirs.goto('/recipes');
  await expect.poll(() => headerHousehold(theirs)).toBe(hh.name);

  await signIn(page, hh.owner, hh.id);
  await page.goto('/household');
  const row = page.getByRole('listitem').filter({ hasText: m.displayName });
  await row.getByRole('button', { name: `More for ${m.displayName}` }).click();
  await sheet(page).getByRole('button', { name: 'Remove from household' }).click();
  const confirm = sheet(page);
  await expect(confirm.getByRole('heading', { name: `Remove ${m.displayName}?` })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('remove-member.png') });
  // Cancel really cancels.
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(row).toBeVisible();

  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Invite someone' }) });
  const before = await inviteToken(hh.id);
  await expect(card.getByLabel('Link', { exact: true })).toHaveText(new RegExp(`${before}$`));

  await row.getByRole('button', { name: `More for ${m.displayName}` }).click();
  await sheet(page).getByRole('button', { name: 'Remove from household' }).click();
  await expect(sheet(page).getByText('The invite link is replaced too')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: m.displayName })).toHaveCount(0);
  expect((await call('GET', '/api/households', { token: m.token })).map((h: { id: string }) => h.id)).toEqual([other.id]);
  // The link they had seen is gone, and the card shows the new one.
  await expect(card.getByLabel('Link', { exact: true })).not.toHaveText(new RegExp(`${before}$`));
  expect((await call('GET', `/api/public/invites/${before}`)).valid).toBe(false);

  // Their next request there is turned away, and the app falls back to the house they still have
  // — saying why, so the switch does not look like the app losing its place.
  await theirs.getByRole('link', { name: 'Groceries', exact: true }).last().click();
  await expect.poll(() => headerHousehold(theirs)).toBe(other.name);
  await expect(theirs.getByText(`You're no longer in “${hh.name}”`)).toBeVisible();
  await theirs.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(theirs.getByText(`You're no longer in “${hh.name}”`)).toHaveCount(0);
  await context.close();
});

test('somebody taken out of their only house is told so, not that they have none yet', async ({ page }) => {
  const hh = await newHousehold();
  const m = await newMember(hh.id);
  await signIn(page, m, hh.id);
  await page.goto('/recipes');
  await expect.poll(() => headerHousehold(page)).toBe(hh.name);

  await call('DELETE', `/api/households/${hh.id}/members/${m.userId}`, { token: hh.owner.token });
  await page.getByRole('link', { name: 'Groceries', exact: true }).last().click();
  await expect(page.getByText(`You're no longer in “${hh.name}”.`)).toBeVisible();
  await expect(page.getByText("You aren't in a household any more.")).toBeVisible();
});
