// A household that looks lived in, for trying the app by hand or running the hallway test in
// README.md. Run after `npm run reset` (or on any local db where e2e-admin / 1234 exists).
//
//   npm run seed
//
// Signs in: maya@example.com / maya-password (or e2e-admin, PIN 1234).
const API = process.env.API_URL ?? 'http://localhost:8080';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
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

const landing = await call('GET', '/api/auth/landing');
if (landing.needsSetup) {
  await call('POST', '/api/auth/setup', { body: { householdName: 'E2E Home', username: 'e2e-admin', displayName: 'E2E Admin', pin: '1234' } });
}
const { token } = await call('POST', '/api/auth/login', { body: { username: 'e2e-admin', pin: '1234' } });
const hh = await call('POST', '/api/households', { token, body: { name: 'Test House' } });
const H = hh.id;

// In through the house's invite link, the only way in there is — or, when Maya already has an
// account from an earlier seed, signed in and saying yes to it.
const invite = (await call('GET', `/api/households/${H}/invite`, { token })).token;
await call('POST', '/api/auth/signup', {
  body: { inviteToken: invite, displayName: 'Maya', email: 'maya@example.com', password: 'maya-password' },
}).catch(async () => {
  const maya = await call('POST', '/api/auth/login/email', { body: { email: 'maya@example.com', password: 'maya-password' } });
  await call('POST', `/api/invites/${invite}/accept`, { token: maya.token });
});

const I = (ingredientName, quantity, unit = null, optional = false) => ({ ingredientName, quantity, unit, optional });
const recipe = (name, section, categories, servings, ingredients, extra = {}) =>
  call('POST', `/api/households/${H}/recipes`, {
    token,
    body: { name, section, categories, servings, ingredients, instructions: 'Prep everything.\nCook it.\nServe.', ...extra },
  });

const parm = await recipe('Chicken Parmesan', 'DINNER', ['Main'], 4, [
  I('chicken breast', 2), I('breadcrumbs', 1, 'cup'), I('parmesan', 0.5, 'cup'), I('egg', 2),
  I('marinara sauce', 1.5, 'cup'), I('mozzarella', 8, 'oz'), I('spaghetti', 1, 'lb'), I('basil', 1, 'bunch', true),
], { prepTimeMinutes: 20, cookTimeMinutes: 30, description: 'Crispy, saucy, better than the restaurant.' });
const frites = await recipe('Steak Frites', 'DINNER', ['Main'], 2, [
  I('ribeye steak', 1, 'lb'), I('potatoes', 2, 'lb'), I('butter', 2, 'tbsp'), I('garlic', 3, 'clove'), I('parsley', 1, 'bunch', true),
]);
const tacos = await recipe('Steak Tacos', 'DINNER', ['Main'], 4, [
  I('flank steak', 2, 'lb'), I('tortillas', 8), I('onion', 1), I('cilantro', 1, 'bunch'), I('lime', 2), I('garlic', 2, 'clove'),
]);
await recipe('Garlic Butter Pasta', 'DINNER', [], 4, [I('spaghetti', 1, 'lb'), I('butter', 4, 'tbsp'), I('garlic', 6, 'clove'), I('parmesan', 0.5, 'cup')]);
const salad = await recipe('Caesar Salad', 'LUNCH', ['Side'], 2, [I('romaine', 1, 'head'), I('parmesan', 0.25, 'cup'), I('croutons', 1, 'cup')]);
await recipe('Overnight Oats', 'BREAKFAST', [], 1, [I('rolled oats', 0.5, 'cup'), I('milk', 0.5, 'cup'), I('banana', 1)]);
await recipe('Lemonade', 'DRINKS', [], 6, [I('lemon', 6), I('sugar', 1, 'cup')]);

const place = await call('POST', `/api/households/${H}/places`, {
  token, body: { name: 'Golden Dragon', menuUrl: 'https://example.com/menu', phone: '555-0100' },
});

const plan = (date, mealType, what) => call('POST', `/api/households/${H}/meal-plan/entries`, { token, body: { date, mealType, ...what } });
await plan(day(0), 'DINNER', { recipeId: parm.id });
await plan(day(0), 'DINNER', { recipeId: salad.id });
await plan(day(1), 'LUNCH', { placeId: place.id });
await plan(day(2), 'DINNER', { recipeId: frites.id });
await plan(day(3), 'DINNER', { recipeId: tacos.id });

for (const [name, staple] of [['olive oil', true], ['salt', true], ['rice', false], ['butter', false]]) {
  await call('POST', `/api/households/${H}/cupboard`, { token, body: { name, staple } });
}

console.log(`Seeded "Test House" (${H}). Sign in as maya@example.com / maya-password, or e2e-admin with PIN 1234.`);
