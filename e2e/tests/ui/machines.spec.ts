import { expect, test, type Page } from '@playwright/test';
import { call, newHousehold, newRecipe } from '../../lib/api';
import { newRecipeWay, signIn } from '../../lib/ui';

/*
 * The kitchen machines a recipe needs: spotted by the server from the method, shown as pills on
 * the recipe page, picked by hand in the form's Machines section, and filtered on in a drawer.
 * The form sends `appliances` only when the choice really changed — a list tells the server
 * they were picked by hand, and it stops spotting them in the method for that recipe.
 */

const machineChip = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Machines' }).getByRole('button', { name: new RegExp(`^${name}`) });

const recipeOf = (id: string, token: string) => call('GET', `/api/recipes/${id}`, { token });

/** The body of each recipe save (create or update) the page sends. */
const saves = (page: Page) => {
  const bodies: any[] = [];
  page.on('request', (r) => {
    const m = r.method();
    if ((m === 'PUT' && /\/api\/recipes\/[^/]+$/.test(r.url())) || (m === 'POST' && /\/recipes(\?|$)/.test(r.url()))) {
      bodies.push(r.postDataJSON());
    }
  });
  return bodies;
};

test('the form starts from the machines a recipe needs, and saving a change sends exactly those', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Crispy wings', [{ name: 'chicken wings', qty: 1, unit: 'kg' }], {
    instructions: 'Air fry at 200C for 20 minutes.',
  });
  expect(r.appliances).toEqual(['air-fryer']);
  const sent = saves(page);
  await signIn(page, hh.owner, hh.id);

  // Spotted from the method, shown on the photo.
  await page.goto(`/recipes/${r.id}`);
  await expect(page.getByRole('list', { name: 'Machines it needs' })).toHaveText('Air fryer');

  // The form: every machine a chip, the ones it needs pressed, and it says what they are for.
  await page.goto(`/recipes/${r.id}/edit`);
  await expect(page.getByRole('group', { name: 'Machines' }).getByRole('button')).toHaveCount(11);
  await expect(machineChip(page, 'Air fryer')).toHaveAttribute('aria-pressed', 'true');
  await expect(machineChip(page, 'Oven')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('What it’s cooked with — your drawers can be filtered by these.')).toBeVisible();

  // Done in the oven at this house, and on the grill in summer.
  await machineChip(page, 'Air fryer').click();
  await machineChip(page, 'Oven').click();
  await machineChip(page, 'Grill').click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Crispy wings' })).toBeVisible();
  expect(sent.at(-1).appliances).toEqual(['oven', 'grill']);
  await expect(page.getByRole('list', { name: 'Machines it needs' }).getByRole('listitem')).toHaveText(['Oven', 'Grill']);
  expect((await recipeOf(r.id, hh.owner.token)).appliances).toEqual(['oven', 'grill']);

  // Picked by hand now: a later edit that leaves the chips alone sends none, and a method that
  // mentions another machine no longer changes them.
  await page.goto(`/recipes/${r.id}/edit`);
  await page.getByLabel('Method').fill('Blend the sauce until smooth, then grill.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Crispy wings' })).toBeVisible();
  expect(sent.at(-1)).not.toHaveProperty('appliances');
  expect((await recipeOf(r.id, hh.owner.token)).appliances).toEqual(['oven', 'grill']);

  // And the drawer can be filtered by the machine that was picked.
  await page.goto('/recipes/section/dinner');
  await machineChip(page, 'Grill').click();
  await expect(page.getByRole('link', { name: /^Crispy wings\b/ })).toBeVisible();
});

test('an edit that leaves the machines alone sends none, so the server keeps spotting them in the method', async ({ page }) => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Lasagne', [{ name: 'pasta sheets', qty: 1, unit: 'pack' }], {
    instructions: 'Bake in the oven for 40 minutes.',
  });
  expect(r.appliances).toEqual(['oven']);
  const sent = saves(page);
  await signIn(page, hh.owner, hh.id);
  await page.goto(`/recipes/${r.id}/edit`);

  // A chip pressed and pressed again is no change.
  await machineChip(page, 'Microwave').click();
  await machineChip(page, 'Microwave').click();
  await page.getByLabel('Method').fill('Cook it in the slow cooker on low for 6 hours.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Lasagne' })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toHaveProperty('appliances');
  // Spotted again from the new method.
  expect((await recipeOf(r.id, hh.owner.token)).appliances).toEqual(['slow-cooker']);
  await expect(page.getByRole('list', { name: 'Machines it needs' })).toHaveText('Slow cooker');
});

test('a new recipe says the machines are spotted on save, and the ones picked are added to them', async ({ page }) => {
  const hh = await newHousehold();
  const sent = saves(page);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new?section=DINNER');
  await newRecipeWay(page, 'Type it out');

  await expect(page.getByText('We’ll spot machines from the method when you save.')).toBeVisible();
  // Nothing pressed to begin with.
  await expect(page.getByRole('group', { name: 'Machines' }).getByRole('button', { pressed: true })).toHaveCount(0);

  await page.getByPlaceholder('Recipe name').fill('Pulled pork');
  await page.getByPlaceholder('ingredient').first().fill('pork shoulder');
  await page.getByLabel('Method').fill('Sear it, then bake in the oven for 5 hours.');
  await machineChip(page, 'Slow cooker').click();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Pulled pork' })).toBeVisible();

  expect(sent.at(-1).appliances).toEqual(['slow-cooker']);
  await expect(page.getByRole('list', { name: 'Machines it needs' }).getByRole('listitem')).toHaveText(['Oven', 'Slow cooker']);
  const [saved] = await call('GET', `/api/households/${hh.id}/recipes`, { token: hh.owner.token });
  expect(saved.appliances).toEqual(['oven', 'slow-cooker']);
});

test('a new recipe with no machines picked sends none at all', async ({ page }) => {
  const hh = await newHousehold();
  const sent = saves(page);
  await signIn(page, hh.owner, hh.id);
  await page.goto('/recipes/new?section=DINNER');
  await newRecipeWay(page, 'Type it out');
  await page.getByPlaceholder('Recipe name').fill('Smoothie');
  await page.getByPlaceholder('ingredient').first().fill('banana');
  await page.getByLabel('Method').fill('Blend until smooth.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Smoothie' })).toBeVisible();
  expect(sent.at(-1)).not.toHaveProperty('appliances');
  await expect(page.getByRole('list', { name: 'Machines it needs' })).toHaveText('Blender');
});
