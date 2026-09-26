import { expect, test } from '@playwright/test';
import { call, newHousehold } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/*
 * The three ways into a new recipe — Type it out, From a link, Paste — and the promise they all
 * keep: whatever comes in opens in the form, to be checked before it is saved.
 */

const TIKTOK = 'https://www.tiktok.com/@cook/video/7';

/** What the server hands back for a TikTok, without the suite reaching out to TikTok. */
const IMPORTED = {
  name: 'Crispy chickpeas',
  description: null,
  prepTimeMinutes: 5,
  cookTimeMinutes: 25,
  servings: 2,
  ingredients: [
    { ingredientName: 'chickpeas', quantity: 1, unit: 'can' },
    { ingredientName: 'olive oil', quantity: 2, unit: 'tbsp' },
  ],
  instructions: 'Dry the chickpeas.\nRoast them.',
  methodSource: 'PUBLISHED',
  spokenLines: [],
  links: [{ url: TIKTOK, label: null }],
};

test('a new recipe has three ways in, in order, and none of them writes it for you', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new');
  await expect(page.getByRole('tab')).toHaveText(['Type it out', 'From a link', 'Paste']);
  await expect(page.getByRole('tab', { name: 'Type it out' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Write it for me/)).toHaveCount(0);
});

test('Paste asks "an AI", not ChatGPT, and warns that it cannot read just anything', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new');
  await page.getByRole('tab', { name: 'Paste' }).click();
  // Only the chosen way in is on screen; the others wait, hidden, with whatever was in them.
  const paste = page.getByRole('tabpanel');

  await expect(paste.getByRole('heading', { name: 'Ask an AI' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy the question' })).toBeVisible();
  await expect(page.getByText(/ChatGPT/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Open/ })).toHaveCount(0);
  // The link card moved to its own tab.
  await expect(paste.getByLabel('A link to a recipe')).toHaveCount(0);

  const warning = page.getByRole('note');
  await expect(warning).toContainText('You can’t paste just anything here.');
  await expect(warning).toContainText('Ingredients');

  // A paragraph with no Ingredients heading is refused, with the reason, and nothing is made up.
  await page.getByLabel('The recipe to read').fill('Just fry an egg in some butter and eat it on toast.');
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByText(/Couldn’t find any ingredients/)).toBeVisible();
  await expect(paste.getByPlaceholder('Recipe name')).toHaveCount(0);
});

test('switching ways in keeps what was typed, and a link pasted into Paste goes to From a link', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new');

  await page.getByRole('tabpanel').getByPlaceholder('Recipe name').fill('Half typed lasagne');
  await page.getByRole('tab', { name: 'Paste' }).click();
  await page.getByRole('tabpanel').getByLabel('The recipe to read').fill(TIKTOK);
  await page.getByRole('tab', { name: 'Type it out' }).click();
  await expect(page.getByRole('tabpanel').getByPlaceholder('Recipe name')).toHaveValue('Half typed lasagne');

  // A link on its own is not a recipe to read, but it is one to fetch — the same as the phone.
  await page.getByRole('tab', { name: 'Paste' }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByRole('tab', { name: 'From a link' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel').getByLabel('A link to a recipe')).toHaveValue(TIKTOK);
});

test('From a link opens what it read in the form, with the link already in Links', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);

  let sent: { url?: string } | undefined;
  await page.route('**/recipes/import', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: IMPORTED });
  });

  await page.goto('/recipes/new?section=LUNCH');
  await page.getByRole('tab', { name: 'From a link' }).click();
  const link = page.getByRole('tabpanel');
  await expect(link.getByText('Works with TikTok, Instagram and recipe websites.')).toBeVisible();

  await link.getByLabel('A link to a recipe').fill(`Look at this! ${TIKTOK}`);
  await link.getByRole('button', { name: 'Get the recipe' }).click();
  // Sent as pasted: the server is the one that finds the link in the sentence.
  expect(sent?.url).toBe(`Look at this! ${TIKTOK}`);

  // In the form for checking, not saved yet.
  await expect(link.getByPlaceholder('Recipe name')).toHaveValue('Crispy chickpeas');
  await expect(link.getByPlaceholder('ingredient').nth(1)).toHaveValue('olive oil');
  await expect(link.getByLabel('Link 1', { exact: true })).toHaveValue(TIKTOK);
  await expect(link.getByRole('button', { name: 'Lunch', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await call('GET', `/api/households/${hh.id}/recipes`, { token: hh.owner.token })).toHaveLength(0);

  await link.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Crispy chickpeas' })).toBeVisible();
  const [saved] = await call('GET', `/api/households/${hh.id}/recipes`, { token: hh.owner.token });
  expect(saved).toMatchObject({ name: 'Crispy chickpeas', section: 'LUNCH', links: [{ url: TIKTOK, label: null }] });
});

test('From a link says why when a link cannot be read, and lets you try another', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new');
  await page.getByRole('tab', { name: 'From a link' }).click();
  // Refused by the real server before it fetches anything.
  const link = page.getByRole('tabpanel');
  await link.getByLabel('A link to a recipe').fill('javascript:alert(1)');
  await link.getByRole('button', { name: 'Get the recipe' }).click();
  await expect(link.getByText('Only web links can be imported.')).toBeVisible();
  await expect(link.getByRole('button', { name: 'Get the recipe' })).toBeEnabled();
});

test('a new recipe from the planner offers a link and an AI paste, not the writer', async ({ page }) => {
  const hh = await newHousehold();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');
  const today = new Date().getDate();
  await page.getByText(String(today), { exact: true }).first().click();
  await sheet(page).getByRole('button', { name: /^\+?\s*Add$/ }).nth(2).click();
  await page.getByLabel('Search recipes, or type something to add').fill('Chickpea curry');
  await page.getByRole('button', { name: 'New recipe “Chickpea curry”' }).click();

  const newRecipe = sheet(page);
  await expect(newRecipe.getByRole('button', { name: 'From a link' })).toBeVisible();
  await expect(newRecipe.getByRole('button', { name: 'Paste from an AI' })).toBeVisible();
  await expect(newRecipe.getByText(/ChatGPT|Write it for me/)).toHaveCount(0);

  await newRecipe.getByRole('button', { name: 'Paste from an AI' }).click();
  // The dish typed in the planner is already in the question.
  await expect(sheet(page).getByLabel('What do you want to make?')).toHaveValue('Chickpea curry');

  // A mis-tap is one Back away from the choices, not a closed sheet.
  await sheet(page).getByRole('button', { name: 'Back' }).click();
  await expect(sheet(page).getByRole('button', { name: 'From a link' })).toBeVisible();
});
