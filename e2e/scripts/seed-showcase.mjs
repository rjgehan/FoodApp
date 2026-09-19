// A household that looks like a real one in use — for demos, screenshots and video.
// Recipes, photos and method text come from TheMealDB's free API, so nothing on screen is
// invented: real dishes, real ingredients, real food photography.
//
//   npm run seed:showcase              # after npm run reset
//   SHOWCASE_HOUSEHOLD="Gehan House" npm run seed:showcase
//
// Needs network for the first run; images are cached under /tmp so re-runs are offline.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:8080';
const HOUSEHOLD = process.env.SHOWCASE_HOUSEHOLD ?? 'Gehan House';
const CACHE = '/tmp/mealplanner-showcase-images';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Sunday of the week Plan opens on, so a seeded week is the week you actually see. */
const weekDay = (n) => day(n - new Date().getDay());

/**
 * TheMealDB writes the amount as one string: "1 tbsp", "1.5kg", "1/2 cup", "3 chopped", "Handful".
 * Only a word this app would print as a unit becomes one; anything else ("chopped", "sticks")
 * stays in notes, where the cook reads it, rather than pretending to be a measurement.
 */
const UNITS = new Set([
  'g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'lbs', 'cup', 'cups', 'tsp', 'tsps', 'tbsp', 'tbsps',
  'tbs', 'tbls', 'tblsp', 'teaspoon', 'teaspoons', 'tablespoon', 'tablespoons', 'pinch', 'dash',
  'clove', 'cloves', 'slice', 'slices', 'can', 'cans', 'tin', 'tins', 'bunch', 'sprig', 'sprigs',
  'head', 'packet', 'pint', 'litre', 'liter', 'quart',
]);

function splitMeasure(measure) {
  const raw = (measure ?? '').trim();
  if (!raw) return { quantity: 1, unit: null, notes: null };
  // Mixed number and plain fraction first, or "1.5kg" parses as a bare 1 with ".5kg" left over.
  const m = raw.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)\s*([a-zA-Z]+)?\s*(.*)$/);
  if (!m) return { quantity: 1, unit: null, notes: raw };
  const [, amount, word, tail] = m;
  const quantity = amount
    .split(/\s+/)
    .reduce((sum, part) => sum + (part.includes('/') ? Number(part.split('/')[0]) / Number(part.split('/')[1]) : Number(part)), 0);
  const isUnit = word && UNITS.has(word.toLowerCase());
  const notes = [isUnit ? '' : word ?? '', tail].filter(Boolean).join(' ').trim();
  return {
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity * 100) / 100 : 1,
    unit: isUnit ? word.toLowerCase() : null,
    notes: notes || null,
  };
}

function ingredientsOf(meal) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] ?? '').trim();
    if (!name) continue;
    const { quantity, unit, notes } = splitMeasure(meal[`strMeasure${i}`]);
    out.push({ ingredientName: name.toLowerCase(), quantity, unit, notes, optional: false });
  }
  return out;
}

/** Instructions come as one blob; the app wants a step per line. */
function stepsOf(meal) {
  return (meal.strInstructions ?? '')
    .split(/\r?\n+/)
    .flatMap((para) => para.split(/(?<=\.)\s+(?=[A-Z])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .slice(0, 8)
    .join('\n');
}

async function lookup(name) {
  const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(name)}`);
  const meals = (await res.json()).meals ?? [];
  return meals[0] ?? null;
}

/** Downloaded once, then read from /tmp so a re-run needs no network. */
async function photo(url) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, url.split('/').pop());
  if (!existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) return null;
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(file);
}

async function uploadPhoto(householdId, token, bytes, name) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), name);
  const res = await fetch(`${API}/api/households/${householdId}/images`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) return null;
  return (await res.json()).id;
}

// --- the household ------------------------------------------------------------------------------
const landing = await call('GET', '/api/auth/landing');
if (landing.needsSetup) {
  await call('POST', '/api/auth/setup', {
    body: { householdName: 'E2E Home', username: 'e2e-admin', displayName: 'E2E Admin', pin: '1234' },
  });
}
const { token } = await call('POST', '/api/auth/login', { body: { username: 'e2e-admin', pin: '1234' } });
const home = await call('POST', '/api/households', { token, body: { name: HOUSEHOLD } });
const H = home.id;

for (const [username, displayName] of [['ryan', 'Ryan'], ['maya', 'Maya']]) {
  await call('POST', `/api/households/${H}/users`, { token, body: { username, displayName } }).catch(() =>
    call('POST', `/api/households/${H}/members`, { token, body: { username } }),
  );
  await call('POST', '/api/auth/pin', { body: { username, pin: username === 'ryan' ? '1234' : '5678' } }).catch(() => {});
}

// Dish -> where it is filed. Names are what TheMealDB calls them.
const WANTED = [
  ['Chicken Parmentier', 'DINNER', ['Chicken']],
  ['Beef Wellington', 'DINNER', ['Beef']],
  ['Honey Teriyaki Salmon', 'DINNER', ['Seafood']],
  ['Lasagne', 'DINNER', ['Full meal']],
  ['Pork Cassoulet', 'DINNER', ['Pork']],
  ['Roasted Eggplant With Tahini', 'DINNER', ['Veggie']],
  ['Pancakes', 'BREAKFAST', ['Main']],
  ['Full English Breakfast', 'BREAKFAST', ['Main']],
  ['Fruit and Cream Cheese Breakfast Pastries', 'BREAKFAST', ['Fruit']],
  ['Tuna Nicoise', 'LUNCH', ['Main']],
  ['Grilled Mac and Cheese Sandwich', 'LUNCH', ['Sandwiches']],
  ['Carrot Cake', 'SNACKS', ['Sweet']],
];

const saved = [];
for (const [name, section, categories] of WANTED) {
  const meal = await lookup(name);
  if (!meal) {
    console.warn(`skipped (not found): ${name}`);
    continue;
  }
  const bytes = meal.strMealThumb ? await photo(meal.strMealThumb) : null;
  const imageId = bytes ? await uploadPhoto(H, token, bytes, `${meal.idMeal}.jpg`) : null;
  const recipe = await call('POST', `/api/households/${H}/recipes`, {
    token,
    body: {
      name: meal.strMeal,
      description: [meal.strArea, meal.strCategory].filter(Boolean).join(' · '),
      instructions: stepsOf(meal),
      servings: 4,
      prepTimeMinutes: 15 + ((meal.strMeal.length * 3) % 20),
      cookTimeMinutes: 20 + ((meal.strMeal.length * 7) % 40),
      section,
      categories,
      sourceUrl: meal.strSource || null,
      videoUrl: meal.strYoutube || null,
      coverImageId: imageId,
      photoIds: imageId ? [imageId] : [],
      ingredients: ingredientsOf(meal),
    },
  });
  saved.push({ ...recipe, photo: Boolean(imageId) });
  console.log(`  ${meal.strMeal}${imageId ? ' (with photo)' : ''}`);
}

const byName = (needle) => saved.find((r) => r.name.toLowerCase().includes(needle.toLowerCase()));

// --- where they eat out --------------------------------------------------------------------------
const place = await call('POST', `/api/households/${H}/places`, {
  token,
  body: { name: 'Golden Dragon', menuUrl: 'https://example.com/menu', phone: '555-0100', notes: 'Order the dumplings.' },
});

// --- the week --------------------------------------------------------------------------------------
const plan = (date, mealType, what) =>
  call('POST', `/api/households/${H}/meal-plan/entries`, { token, body: { date, mealType, ...what } });
const pick = (needle) => byName(needle)?.id;

// Sun–Sat of the week Plan opens on, so it looks lived in the moment you land.
await plan(weekDay(0), 'BREAKFAST', { recipeId: pick('Pancakes') });
await plan(weekDay(0), 'DINNER', { recipeId: pick('Lasagne') });
await plan(weekDay(1), 'DINNER', { recipeId: pick('Teriyaki Salmon') });
await plan(weekDay(2), 'LUNCH', { placeId: place.id, time: '12:30' });
await plan(weekDay(2), 'DINNER', { recipeId: pick('Parmentier') });
await plan(weekDay(3), 'DINNER', { recipeId: pick('Eggplant') });
await plan(weekDay(4), 'BREAKFAST', { itemName: 'eggs' });
await plan(weekDay(4), 'DINNER', { recipeId: pick('Wellington') });
await plan(weekDay(5), 'LUNCH', { recipeId: pick('Mac and Cheese') });
await plan(weekDay(5), 'DINNER', { recipeId: pick('Cassoulet') });
await plan(weekDay(6), 'BREAKFAST', { recipeId: pick('Full English') });
await plan(weekDay(6), 'DINNER', { recipeId: pick('Tuna Nicoise') });

// And a few days into the week after, so stepping forward is not a wall of empty days.
await plan(weekDay(7), 'DINNER', { recipeId: pick('Lasagne') });
await plan(weekDay(8), 'DINNER', { recipeId: pick('Parmentier') });
await plan(weekDay(9), 'DINNER', { recipeId: pick('Teriyaki Salmon') });

// --- the shopping ------------------------------------------------------------------------------------
await call('POST', `/api/households/${H}/grocery-list/add-all?start=${day(0)}&end=${day(6)}`, { token });
for (const extra of ['paper towels', '2 lb coffee', 'olive oil']) {
  const [qty, unit, ...rest] = extra.split(' ');
  const isAmount = !Number.isNaN(Number(qty));
  await call('POST', `/api/households/${H}/grocery-list/items`, {
    token,
    body: isAmount
      ? { ingredientName: rest.join(' '), quantity: Number(qty), unit }
      : { ingredientName: extra },
  });
}
const list = await call('GET', `/api/households/${H}/grocery-list`, { token });
for (const item of list.slice(0, 3)) {
  await call('PATCH', `/api/households/${H}/grocery-list/items/${item.id}`, { token, body: { checked: true } });
}

// --- the cupboard ---------------------------------------------------------------------------------------
for (const [name, staple] of [['olive oil', true], ['salt', true], ['black pepper', true], ['plain flour', false], ['rice', false], ['butter', false], ['parmesan', false]]) {
  await call('POST', `/api/households/${H}/cupboard`, { token, body: { name, staple } });
}
const cupboard = await call('GET', `/api/households/${H}/cupboard`, { token });
const low = cupboard.find((c) => c.name === 'butter');
if (low) await call('PATCH', `/api/households/${H}/cupboard/${low.id}`, { token, body: { runningLow: true } });
const counted = cupboard.find((c) => c.name === 'rice');
if (counted) await call('PATCH', `/api/households/${H}/cupboard/${counted.id}`, { token, body: { trackQuantity: true, quantity: 3, unit: 'kg' } });

// --- somebody else's recipes, for Explore ------------------------------------------------------------------
const neighbours = await call('POST', '/api/households', { token, body: { name: 'The Wilsons' } });
for (const [name, section] of [['Katsu Chicken curry', 'DINNER'], ['Banana Pancakes', 'BREAKFAST'], ['Fish pie', 'DINNER']]) {
  const meal = await lookup(name);
  if (!meal) continue;
  const bytes = meal.strMealThumb ? await photo(meal.strMealThumb) : null;
  const imageId = bytes ? await uploadPhoto(neighbours.id, token, bytes, `${meal.idMeal}.jpg`) : null;
  const r = await call('POST', `/api/households/${neighbours.id}/recipes`, {
    token,
    body: {
      name: meal.strMeal,
      description: [meal.strArea, meal.strCategory].filter(Boolean).join(' · '),
      instructions: stepsOf(meal),
      servings: 4,
      section,
      categories: [],
      coverImageId: imageId,
      photoIds: imageId ? [imageId] : [],
      ingredients: ingredientsOf(meal),
    },
  });
  await call('PUT', `/api/recipes/${r.id}/published`, { token, body: { published: true } });
  console.log(`published to Explore: ${meal.strMeal}`);
}

console.log(`\n"${HOUSEHOLD}" (${H}) — ${saved.length} recipes, ${saved.filter((r) => r.photo).length} with photos.`);
console.log('Sign in as ryan / 1234 or maya / 5678.');
