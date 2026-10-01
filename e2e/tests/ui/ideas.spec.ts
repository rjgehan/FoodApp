import { expect, test, type Page } from '@playwright/test';
import { adminByPassword, call, newHousehold, newMember, statusOf, unique } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';
import { TUTORIAL_SEEN } from '../../lib/device';

/**
 * The beta's ideas board at iPhone size: found from the lightbulb in the header, an idea
 * suggested, upvoted from somebody else's phone, and Top putting the most wanted first. The board
 * is shared by every test and run, so each takes down what it put up.
 */

const made: string[] = [];

test.afterEach(async () => {
  const boss = await adminByPassword();
  while (made.length) await statusOf('DELETE', `/api/ideas/${made.pop()}`, { token: boss.token });
});

const card = (page: Page, title: string) =>
  page.getByRole('list', { name: 'Ideas', exact: true }).getByRole('listitem').filter({ hasText: title });

/** The titles of these ideas, in the order the board shows them, ignoring everybody else's. */
async function shownOrder(page: Page, titles: string[]) {
  const texts = await page.getByRole('list', { name: 'Ideas', exact: true }).getByRole('listitem').allInnerTexts();
  return texts.map((t) => titles.find((title) => t.includes(title))).filter(Boolean);
}

test('suggest an idea, somebody else upvotes it, and Top puts it first', async ({ page, browser }) => {
  const hh = await newHousehold();
  const author = await newMember(hh.id);
  const fan = await newMember(hh.id);
  const first = unique('Leftovers for lunch');
  const second = unique('Bigger text');

  await signIn(page, author, hh.id);
  await page.goto('/meal-plan');
  await page.getByRole('link', { name: 'Ideas (beta)' }).click();
  await expect(page).toHaveURL(/\/ideas$/);
  await expect(page.getByRole('heading', { name: 'Ideas', level: 1 })).toBeVisible();

  for (const [title, details] of [[first, 'Plan tomorrow’s lunch from tonight’s dinner.'], [second, '']]) {
    await page.getByRole('button', { name: 'Suggest an idea' }).click();
    await page.getByRole('textbox', { name: 'Your idea' }).fill(title);
    if (details) await page.getByRole('textbox', { name: 'Details' }).fill(details);
    await page.getByRole('button', { name: 'Post idea' }).click();
    await expect(card(page, title)).toBeVisible();
  }
  await expect(card(page, first)).toContainText('tonight’s dinner');
  await expect(card(page, first)).toContainText('You');
  for (const idea of await call('GET', '/api/ideas?sort=new', { token: author.token })) {
    if (idea.title === first || idea.title === second) made.push(idea.id);
  }

  // Somebody else, on their own phone, finds it under New and upvotes it.
  const theirs = await browser.newContext({ storageState: TUTORIAL_SEEN,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    baseURL: process.env.WEB_URL ?? 'http://localhost:5173',
  });
  const other = await theirs.newPage();
  await signIn(other, fan, hh.id);
  await other.goto('/ideas');
  await other.getByRole('tab', { name: 'New' }).click();
  await expect(other).toHaveURL(/sort=new/);
  await expect(card(other, first)).toContainText(author.displayName);
  const upvote = card(other, first).getByRole('button', { name: /^Upvote/ });
  await expect(upvote).toHaveAttribute('aria-pressed', 'false');
  await upvote.click();
  await expect(upvote).toHaveAttribute('aria-pressed', 'true');
  await expect(upvote).toHaveAccessibleName(/1 vote$/);
  await other.screenshot({ path: test.info().outputPath('ideas-voted.png') });
  // It stuck: still there after a reload.
  await other.reload();
  await expect(card(other, first).getByRole('button', { name: /^Upvote/ })).toHaveAttribute('aria-pressed', 'true');
  await theirs.close();

  // Back on the author's phone: Top has the upvoted one above the newer one, New the other way round.
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Top' })).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, first).getByRole('button', { name: /^Upvote/ })).toHaveAccessibleName(/1 vote$/);
  await expect(card(page, first).getByRole('button', { name: /^Upvote/ })).toHaveAttribute('aria-pressed', 'false');
  expect(await shownOrder(page, [first, second])).toEqual([first, second]);
  await page.getByRole('tab', { name: 'New' }).click();
  await expect(page.getByRole('tab', { name: 'New' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => shownOrder(page, [first, second])).toEqual([second, first]);
  await page.screenshot({ path: test.info().outputPath('ideas-board.png'), fullPage: true });

  // Their own vote goes on and off from the same button.
  const mine = card(page, second).getByRole('button', { name: /^Upvote/ });
  await mine.click();
  await expect(mine).toHaveAccessibleName(/1 vote$/);
  await mine.click();
  await expect(mine).toHaveAccessibleName(/0 votes$/);

  // Rewording and taking back their own, from its •••.
  const reworded = unique('Much bigger text');
  await card(page, second).getByRole('button', { name: 'Idea actions' }).click();
  await sheet(page).getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'Your idea' }).fill(reworded);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(card(page, reworded)).toBeVisible();
  await card(page, reworded).getByRole('button', { name: 'Idea actions' }).click();
  await sheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect(card(page, reworded)).toContainText('Delete your idea?');
  await card(page, reworded).getByRole('button', { name: 'Delete idea' }).click();
  await expect(card(page, reworded)).toHaveCount(0);
  await expect(card(page, first)).toBeVisible();
});

test('nobody but the author can change an idea, and the admin marks one planned', async ({ page }) => {
  const hh = await newHousehold();
  const author = await newMember(hh.id);
  const reader = await newMember(hh.id);
  const title = unique('Meal ratings');
  const idea = await call('POST', '/api/ideas', { token: author.token, body: { title } });
  made.push(idea.id);

  await signIn(page, reader, hh.id);
  await page.goto('/ideas?sort=new');
  await expect(card(page, title)).toBeVisible();
  await expect(card(page, title).getByRole('button', { name: 'Idea actions' })).toHaveCount(0);

  await signIn(page, await adminByPassword(), hh.id);
  await page.goto('/ideas?sort=new');
  await card(page, title).getByRole('button', { name: 'Idea actions' }).click();
  // The admin says where it is up to, but does not reword somebody else's idea.
  await expect(sheet(page).getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Mark as planned' }).click();
  await expect(card(page, title)).toContainText('Planned');
  // The Planned chip shows it; Done does not, until it is.
  await page.getByRole('tab', { name: 'Planned' }).click();
  await expect(page).toHaveURL(/show=planned/);
  await expect(card(page, title)).toBeVisible();
  await page.getByRole('tab', { name: 'Done' }).click();
  await expect(card(page, title)).toHaveCount(0);
  await page.getByRole('tab', { name: 'New' }).click();
  expect((await call('GET', '/api/ideas', { token: author.token })).find((i: any) => i.id === idea.id).status).toBe('PLANNED');
  await page.screenshot({ path: test.info().outputPath('ideas-admin.png'), fullPage: true });

  await card(page, title).getByRole('button', { name: 'Idea actions' }).click();
  await sheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect(card(page, title)).toContainText('Delete this idea for everyone?');
  await card(page, title).getByRole('button', { name: 'Delete idea' }).click();
  await expect(card(page, title)).toHaveCount(0);
});
