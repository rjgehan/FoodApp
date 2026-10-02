import { expect, test, type Page } from '@playwright/test';
import { admin, call, groceries, isoDate, newHousehold, newMember, newRecipe, unique } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/**
 * Meal plans on the web (the mockup's 5.7–5.11): cooking from the cupboard (setup, draft, swap,
 * apply), and a private plan for a health target (create, set a target by hand, apply), plus a
 * ready-made plan kept as your own. Which recipes the server picks, and why, is checked by
 * tests/api/meal-plans.spec.ts; these check that the screens show it and do what they say.
 */

const owner = () => admin();

async function cupboardAdd(householdId: string, name: string) {
  return call('POST', `/api/households/${householdId}/cupboard`, { token: (await owner()).token, body: { name } });
}

/** A kitchen with a curry's worth in the cupboard, and salmon and spinach that want using. */
async function stockedKitchen() {
  const hh = await newHousehold();
  for (const name of ['chickpeas (tin)', 'baby spinach', 'onions', 'salmon fillets', 'potatoes']) await cupboardAdd(hh.id, name);
  const curry = await newRecipe(hh.id, unique('Chickpea curry'), [
    { name: 'chickpeas', qty: 2, unit: 'tins' },
    { name: 'spinach', qty: 200, unit: 'g' },
    { name: 'onions', qty: 1 },
    { name: 'salt', qty: null },
  ]);
  const traybake = await newRecipe(hh.id, unique('Salmon traybake'), [
    { name: 'salmon fillets', qty: 4 },
    { name: 'potatoes', qty: 800, unit: 'g' },
    { name: 'lemon', qty: 1 },
  ]);
  const stew = await newRecipe(hh.id, unique('Beef stew'), [
    { name: 'beef', qty: 800, unit: 'g' },
    { name: 'carrots', qty: 3 },
    { name: 'beef stock', qty: 500, unit: 'ml' },
    { name: 'red wine', qty: 250, unit: 'ml' },
    { name: 'onions', qty: 1 },
  ]);
  return { hh, curry, traybake, stew };
}

/** "Thursday 3": how a day tile names itself. */
function dayName(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.toLocaleDateString('en-GB', { weekday: 'long' })} ${d.getDate()}`;
}

/** Leaves exactly these days chosen on the setup's tiles. */
async function chooseDays(page: Page, wanted: number[]) {
  const days = page.getByRole('region', { name: 'Days and meals' });
  for (let i = 0; i < 7; i++) {
    const tile = days.getByRole('button', { name: new RegExp(`^${dayName(i)}\\b`) });
    const on = (await tile.getAttribute('aria-pressed')) === 'true';
    if (on !== wanted.includes(i)) await tile.click();
  }
}

test('cook from the cupboard: choose days and meals, swap a meal, add what is missing, and apply it to the Plan', async ({ page }) => {
  const { hh, curry, traybake, stew } = await stockedKitchen();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/explore/meal-plans');

  const card = page.getByRole('region', { name: 'Cook from your cupboard' });
  await expect(card.getByText('Build the next few days around the 5 things you already have. 2 need using soon.')).toBeVisible();
  // The things that want using first lead the chips.
  await expect(card.getByText('Salmon fillets')).toBeVisible();
  await card.getByRole('link', { name: 'Generate a plan' }).click();
  await expect(page).toHaveURL(/\/explore\/meal-plans\/cupboard$/);

  // The setup starts from the server's suggestions: what goes off first is picked to use up.
  const useFirst = page.getByRole('region', { name: 'Use these up first' });
  await expect(useFirst.getByText('Salmon fillets')).toBeVisible();
  await expect(useFirst.getByText('Baby spinach')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate 8 meals' })).toBeVisible();

  // Dinner tomorrow and the day after, within five things to buy, from our own recipes.
  await chooseDays(page, [1, 2]);
  await page.getByRole('button', { name: 'Lunch', exact: true }).click();
  await expect(page.getByRole('radio', { name: '5' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: 'Only my recipes' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Generate 2 meals' }).click();

  await expect(page).toHaveURL(/\/explore\/meal-plans\/cupboard\/plan$/);
  await expect(page.getByRole('heading', { name: 'Cupboard plan' })).toBeVisible();
  await expect(page.getByText('83% from your cupboard')).toBeVisible();
  await expect(page.getByText('Uses 5 items, 1 to buy. Baby spinach and salmon fillets get used before they go off.')).toBeVisible();
  const first = page.getByRole('listitem', { name: `Dinner: ${curry.name}` });
  await expect(first.getByText('100%')).toBeVisible();
  await expect(page.getByRole('listitem', { name: `Dinner: ${traybake.name}` }).getByText('67%')).toBeVisible();
  const toBuy = page.getByRole('region', { name: 'Things to buy' });
  await expect(toBuy.getByText('1 thing to buy')).toBeVisible();
  await expect(toBuy.getByText('Lemon')).toBeVisible();

  // Swap the curry: the stew is the next best dinner, and needs four more things.
  await first.getByRole('button', { name: `Swap ${curry.name}` }).click();
  const swapped = page.getByRole('listitem', { name: `Dinner: ${stew.name}` });
  await expect(swapped).toBeVisible();
  await expect(toBuy.getByText('5 things to buy')).toBeVisible();
  // Again: nothing else is a dinner, so it says so and the stew stays.
  await swapped.getByRole('button', { name: `Swap ${stew.name}` }).click();
  await expect(page.getByText(/^Nothing else fits dinner on /)).toBeVisible();
  await expect(swapped).toBeVisible();

  // Back to the setup finds it as it was left, and forward finds the same draft.
  await page.getByRole('button', { name: 'Setup' }).click();
  await expect(page.getByRole('button', { name: 'Generate 2 meals' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('listitem', { name: `Dinner: ${stew.name}` })).toBeVisible();

  // The missing things go on the grocery list with the plan.
  await toBuy.getByRole('button', { name: 'Add' }).click();
  await expect(toBuy.getByText('Going on the grocery list with the plan')).toBeVisible();
  await page.getByRole('button', { name: /^Apply to Plan · / }).click();
  await expect(page).toHaveURL(/\/meal-plan$/);
  await expect(page.getByText('Planned 2 meals and 5 things to buy')).toBeVisible();

  const planned = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(1)}&end=${isoDate(2)}`, { token: hh.owner.token });
  expect(planned.map((e: any) => [e.date, e.mealType, e.recipeId, e.servings])).toEqual([
    [isoDate(1), 'DINNER', stew.id, 4],
    [isoDate(2), 'DINNER', traybake.id, 4],
  ]);
  expect((await groceries(hh.id)).map((g: any) => g.name.toLowerCase()).sort()).toEqual(
    ['beef', 'beef stock', 'carrots', 'lemon', 'red wine'],
  );
});

/** A household with a few days' worth of recipes the USDA data can count. Serves 1 unless said. */
async function kitchenWithNutrition() {
  const hh = await newHousehold();
  const r = (name: string, section: string, servings: number, ingredients: any[]) =>
    newRecipe(hh.id, unique(name), ingredients, { section, servings });
  const recipes = [
    await r('Protein oats', 'BREAKFAST', 1, [
      { name: 'oats', qty: 80, unit: 'g' }, { name: 'milk', qty: 250, unit: 'ml' }, { name: 'banana', qty: 1 }]),
    await r('Eggs on toast', 'BREAKFAST', 1, [{ name: 'eggs', qty: 3 }, { name: 'bread', qty: 2, unit: 'slices' }]),
    await r('Chicken rice bowl', 'LUNCH', 1, [
      { name: 'chicken breast', qty: 200, unit: 'g' }, { name: 'rice', qty: 75, unit: 'g' }, { name: 'olive oil', qty: 1, unit: 'tbsp' }]),
    await r('Lentil soup', 'LUNCH', 2, [
      { name: 'red lentils', qty: 150, unit: 'g' }, { name: 'carrots', qty: 2 }, { name: 'onion', qty: 1 }]),
    await r('Salmon and potatoes', 'DINNER', 1, [
      { name: 'salmon', qty: 180, unit: 'g' }, { name: 'potatoes', qty: 300, unit: 'g' }, { name: 'olive oil', qty: 1, unit: 'tbsp' }]),
    await r('Beef chilli', 'DINNER', 2, [
      { name: 'beef mince', qty: 400, unit: 'g' }, { name: 'kidney beans', qty: 400, unit: 'g' },
      { name: 'chopped tomatoes', qty: 400, unit: 'g' }, { name: 'onion', qty: 1 }]),
    await r('Pork chops', 'DINNER', 2, [{ name: 'pork chops', qty: 400, unit: 'g' }, { name: 'potatoes', qty: 400, unit: 'g' }]),
    await r('Greek yogurt and honey', 'SNACKS', 1, [{ name: 'greek yogurt', qty: 200, unit: 'g' }, { name: 'honey', qty: 1, unit: 'tbsp' }]),
  ];
  return { hh, recipes, pork: recipes[6] };
}

test('a private plan for a health target: details in, targets worked out, one set by hand, then onto the Plan', async ({ page }) => {
  const { hh, pork } = await kitchenWithNutrition();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/explore/meal-plans');
  await page.getByRole('link', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/explore\/meal-plans\/new$/);
  await expect(page.getByRole('heading', { name: 'New meal plan' })).toBeVisible();
  await expect(page.getByText('Add an age to work out the targets.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Build the plan' })).toBeDisabled();

  // 20, male, 5 ft 11, 165 lb, active 3–5 times a week, building muscle.
  await page.getByRole('spinbutton', { name: 'Age' }).fill('20');
  await page.getByRole('combobox', { name: 'Sex' }).selectOption('male');
  await page.getByRole('spinbutton', { name: 'Feet' }).fill('5');
  await page.getByRole('spinbutton', { name: 'Inches' }).fill('11');
  await page.getByRole('spinbutton', { name: 'Weight in lb' }).fill('165');
  await page.getByRole('radio', { name: 'Build muscle' }).click();
  const targets = page.getByRole('group', { name: 'Daily targets' });
  // Mifflin–St Jeor 1,780 × 1.55 × 1.15; 1.8 g/kg protein and 1 g/kg fat.
  await expect(targets.getByRole('button', { name: /^kcal: 3,170\./ })).toBeVisible();
  await expect(targets.getByRole('button', { name: /^Protein: 135g\./ })).toBeVisible();
  await expect(targets.getByRole('button', { name: /^Fat: 75g\./ })).toBeVisible();
  await expect(page.getByText('Worked out from the details above. Tap a number to set your own.')).toBeVisible();

  // Set the calories by hand.
  await targets.getByRole('button', { name: /^kcal: / }).click();
  await sheet(page).getByRole('spinbutton', { name: /^Calories/ }).fill('3000');
  await sheet(page).getByRole('button', { name: 'Use this' }).click();
  await expect(targets.getByRole('button', { name: 'kcal: 3,000, set by you. Set your own' })).toBeVisible();

  // No pork, and three days long.
  await page.getByRole('button', { name: 'No pork' }).click();
  await expect(page.getByRole('button', { name: 'No pork' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Plan length/ }).click();
  await sheet(page).getByRole('radio', { name: '3 days' }).click();
  await expect(page.getByRole('button', { name: /^Plan length/ })).toContainText('3 days');
  await expect(page.getByRole('switch', { name: 'Use my recipes first' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Build the plan' }).click();

  await expect(page).toHaveURL(/\/explore\/meal-plans\/plans\/[0-9a-f-]+$/);
  const planId = page.url().split('/').pop()!;
  await expect(page.getByRole('heading', { name: /· build muscle$/ })).toBeVisible();
  await expect(page.getByText('Build muscle · 3 days')).toBeVisible();
  await expect(page.getByText('Age 20 · 5 ft 11 · 165 lb · Active 3–5x a week')).toBeVisible();
  const daily = page.getByRole('group', { name: 'Daily targets' });
  await expect(daily.getByText('3,000', { exact: true })).toBeVisible();
  await expect(daily.getByText('135g', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(3);
  // Four meals a day, none of them the pork, our own recipes marked as ours.
  const day1 = page.getByRole('list', { name: 'Day 1' });
  await expect(day1.getByRole('listitem')).toHaveCount(4);
  await expect(page.getByText(pork.name)).toHaveCount(0);
  await expect(day1.getByText('Yours').first()).toBeVisible();
  await page.getByRole('tab', { name: /^Day 3,/ }).click();
  await expect(page.getByRole('list', { name: 'Day 3' }).getByRole('listitem')).toHaveCount(4);

  // Private: listed under Made by you for its owner, and nowhere for a housemate.
  const housemate = await newMember(hh.id);
  expect(await call('GET', `/api/households/${hh.id}/meal-plans/targets`, { token: housemate.token })).toEqual([]);

  // Onto the shared Plan, from tomorrow, for two.
  await page.getByRole('button', { name: 'Apply to my Plan' }).click();
  const apply = sheet(page);
  await apply.getByRole('button', { name: `Start on ${dayName(1)}` }).click();
  await apply.getByRole('button', { name: 'Fewer servings' }).click();
  await apply.getByRole('button', { name: 'More servings' }).click();
  await apply.getByRole('button', { name: 'More servings' }).click();
  await apply.getByRole('button', { name: /^Apply 12 meals · / }).click();
  await expect(page).toHaveURL(/\/meal-plan$/);
  await expect(page.getByText('Planned 12 meals')).toBeVisible();

  const planned = await call('GET', `/api/households/${hh.id}/meal-plan?start=${isoDate(1)}&end=${isoDate(3)}`, { token: housemate.token });
  expect(planned).toHaveLength(12);
  expect(new Set(planned.map((e: any) => e.date))).toEqual(new Set([isoDate(1), isoDate(2), isoDate(3)]));
  expect(planned.some((e: any) => e.recipeId === pork.id)).toBe(false);
  // The household's servings are 4 by default: one fewer, then two more, so five people. Each meal
  // cooks the plan's portion for its owner plus a serving for each of the other four.
  const kept = await call('GET', `/api/households/${hh.id}/meal-plans/targets/${planId}`, { token: hh.owner.token });
  const portions = new Map<string, number>();
  for (const d of kept.days) for (const m of d.meals) portions.set(`${isoDate(1 + d.day)}|${m.mealType}`, m.portion);
  for (const e of planned) expect(e.servings).toBe(4 + Math.ceil(portions.get(`${e.date}|${e.mealType}`)!));

  await page.goto('/explore/meal-plans');
  const made = page.getByRole('list', { name: 'Made by you' });
  await expect(made.getByRole('link', { name: /· build muscle/ })).toHaveAttribute('href', `/explore/meal-plans/plans/${planId}`);
  await expect(made.getByText('3,000 kcal · 135g protein · 3 days')).toBeVisible();

  await signIn(page, housemate, hh.id);
  await page.goto('/explore/meal-plans');
  await expect(page.getByText('The 20-year-old guy')).toBeVisible();
  await expect(page.getByText('Made by you')).toHaveCount(0);
  await page.goto(`/explore/meal-plans/plans/${planId}`);
  // Not a network problem, so no "Try again": it says the plan isn't there, and leads back.
  await expect(page.getByText("This plan isn't available")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back to Meal plans' })).toBeVisible();
});

test('a ready-made plan is chosen from your recipes; swap a meal, then keep it as your own', async ({ page }) => {
  const { hh } = await kitchenWithNutrition();
  await signIn(page, hh.owner, hh.id);
  await page.goto('/explore/meal-plans');
  // Filters narrow the cards.
  await page.getByRole('group', { name: 'Filter plans' }).getByRole('button', { name: 'Budget' }).click();
  await expect(page.getByRole('link', { name: /^Student budget week/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^The 20-year-old guy/ })).toHaveCount(0);
  await page.getByRole('group', { name: 'Filter plans' }).getByRole('button', { name: 'All' }).click();
  await page.getByRole('link', { name: /^The 20-year-old guy/ }).click();

  await expect(page).toHaveURL(/\/explore\/meal-plans\/ready-made\/build-muscle$/);
  await expect(page.getByRole('heading', { name: 'The 20-year-old guy' })).toBeVisible();
  await expect(page.getByText('Active, 5 ft 11, lifting 4x a week. Lean bulk.')).toBeVisible();
  const breakfast = page.getByRole('list', { name: 'Day 1' }).getByRole('listitem', { name: /^Breakfast: / });
  const before = await breakfast.getAttribute('aria-label');

  // Swap mode shows a swap on every meal; breakfast has another recipe to go to.
  await page.getByRole('button', { name: 'Swap meals' }).click();
  await breakfast.getByRole('button', { name: /^Swap / }).click();
  await expect(breakfast).not.toHaveAttribute('aria-label', before!);
  await page.getByRole('button', { name: 'Done swapping' }).click();
  const after = await breakfast.getAttribute('aria-label');

  await page.getByRole('button', { name: 'Keep as my plan' }).click();
  await expect(page).toHaveURL(/\/explore\/meal-plans\/plans\/[0-9a-f-]+$/);
  await expect(page.getByText('Kept in Made by you. Only you can see it.')).toBeVisible();
  // Kept exactly as it was shown, swap and all.
  await expect(page.getByRole('list', { name: 'Day 1' }).getByRole('listitem', { name: after! })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan options' })).toBeVisible();

  // Renamed, then deleted.
  await page.getByRole('button', { name: 'Plan options' }).click();
  await sheet(page).getByRole('button', { name: 'Rename' }).click();
  await sheet(page).getByRole('textbox', { name: 'Plan name' }).fill('Bulking with eggs');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Bulking with eggs' })).toBeVisible();
  await page.getByRole('button', { name: 'Plan options' }).click();
  await sheet(page).getByRole('button', { name: 'Delete plan' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/explore\/meal-plans$/);
  await expect(page.getByText('Made by you')).toHaveCount(0);
});
