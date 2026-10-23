import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ApiError, admin, call, newHousehold, newMember, setKitchen, statusOf } from '../../lib/api';

/*
 * A household's kitchen: the machines it has, and the two parts of the app it can do without —
 * the Plan and the Cupboard (PATCH /api/households/{id}/kitchen, any member). And the machine
 * list itself, which lives three times — on the server, in the web app and in the iPhone app —
 * and is checked here against all three, like the food icons in icons.spec.
 */

/** [key, label] pairs, in the order a file lists them. */
const pairs = (path: string, pattern: RegExp) =>
  [...readFileSync(new URL(path, import.meta.url), 'utf8').matchAll(pattern)].map((m) => [m[1], m[2]]);

/** The server's list: `new Machine(OVEN, "Oven")`, where OVEN is a constant named above it. */
function serverMachines(): string[][] {
  const java = readFileSync(
    new URL('../../../backend/src/main/java/com/gehan/mealplanner/service/KitchenMachines.java', import.meta.url),
    'utf8',
  );
  const constants = new Map([...java.matchAll(/String ([A-Z_]+) = "([a-z-]+)";/g)].map((m) => [m[1], m[2]]));
  return [...java.matchAll(/new Machine\(([A-Z_]+|"[a-z-]+"), "([^"]+)"\)/g)].map((m) => [
    m[1].startsWith('"') ? m[1].slice(1, -1) : constants.get(m[1]) ?? `unknown constant ${m[1]}`,
    m[2],
  ]);
}

const IOS_MACHINES = '../../../ios/MealPlanner/Features/KitchenMachines.swift';

test('the server, the web and the phone list the same machines, in the same order, under the same names', async () => {
  const server = serverMachines();
  const web = pairs('../../../web/src/utils/machines.ts', /\{ key: '([a-z-]+)', label: '([^']+)'/g);
  expect(server.length).toBe(11);
  expect(server[0]).toEqual(['oven', 'Oven']);
  expect(web).toEqual(server);
  // The phone's copy, once it has one (it is written on another machine and may arrive later).
  if (existsSync(new URL(IOS_MACHINES, import.meta.url))) {
    const ios = pairs(IOS_MACHINES, /KitchenMachine\(key: "([a-z-]+)", label: "([^"]+)"/g);
    expect(ios).toEqual(server);
    // And the short names the chips and the recipe hero wear, word for word, so a recipe says
    // "Instant Pot" on both.
    const webShort = pairs('../../../web/src/utils/machines.ts', /\{ key: '([a-z-]+)', label: '[^']+', short: '([^']+)'/g);
    const iosShort = pairs(IOS_MACHINES, /KitchenMachine\(key: "([a-z-]+)", label: "[^"]+", short: "([^"]+)"/g);
    expect(webShort.length).toBe(server.length);
    expect(iosShort).toEqual(webShort);
  }

  // And what the server says over the wire is the same list again.
  const { token } = await admin();
  const listed = await call('GET', '/api/kitchen-machines', { token });
  expect(listed.map((m: { key: string; label: string }) => [m.key, m.label])).toEqual(server);
});

test('the server, the web and the phone agree on which machines stand in for each other', async () => {
  // "Bake, or air fry": a recipe naming two of one family needs only one of them. Each copy
  // decides what a kitchen can make, so they have to say the same.
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const block = (text: string, start: RegExp) => {
    const at = text.search(start);
    expect(at, `${start} not found`).toBeGreaterThan(-1);
    return text.slice(at, text.indexOf(';', at) === -1 ? undefined : text.indexOf(';', at));
  };
  const java = read('../../../backend/src/main/java/com/gehan/mealplanner/service/KitchenMachines.java');
  const constants = new Map([...java.matchAll(/String ([A-Z_]+) = "([a-z-]+)";/g)].map((m) => [m[1], m[2]]));
  const server = [...block(java, /STAND_INS = List\.of\(/).matchAll(/List\.of\(([A-Z_]+), ([A-Z_]+)\)/g)].map((m) => [
    constants.get(m[1]),
    constants.get(m[2]),
  ]);
  expect(server).toEqual([['oven', 'air-fryer'], ['slow-cooker', 'pressure-cooker'], ['blender', 'food-processor']]);

  const web = [...block(read('../../../web/src/utils/machines.ts'), /export const STAND_INS/).matchAll(/\['([a-z-]+)', '([a-z-]+)'\]/g)]
    .map((m) => [m[1], m[2]]);
  expect(web).toEqual(server);

  if (existsSync(new URL(IOS_MACHINES, import.meta.url))) {
    const swift = read(IOS_MACHINES);
    const at = swift.search(/static let standIns/);
    expect(at, 'KitchenMachine.standIns').toBeGreaterThan(-1);
    // Up to the blank line after the declaration.
    const declared = swift.slice(at);
    const end = declared.search(/\r?\n\s*\r?\n/);
    const ios = [...declared.slice(0, end === -1 ? undefined : end).matchAll(/\["([a-z-]+)", "([a-z-]+)"\]/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(ios).toEqual(server);
  }
});

test('the phone draws every machine with the web’s own drawing, exported into its asset catalog', async () => {
  // web/scripts/export-machine-icons.mjs writes one template imageset per machine. A drawing
  // changed on the web and not exported again shows here as a mismatch.
  const catalog = new URL('../../../ios/MealPlanner/Assets.xcassets/MachineIcons/', import.meta.url);
  const folder = JSON.parse(readFileSync(new URL('Contents.json', catalog), 'utf8'));
  // The phone asks for "MachineIcons/<key>", which only works when the folder names its space.
  expect(folder.properties['provides-namespace']).toBe(true);

  const drawings = new Map(
    [...readFileSync(new URL('../../../web/src/components/MachineIcons.tsx', import.meta.url), 'utf8')
      .matchAll(/^\s+'?([a-z-]+)'?: '(<[^']*)',\r?$/gm)].map((m) => [m[1], m[2]]),
  );
  const keys = serverMachines().map(([key]) => key);
  expect([...drawings.keys()]).toEqual(keys);
  const exported = readdirSync(catalog).filter((f) => f.endsWith('.imageset')).map((f) => f.replace(/\.imageset$/, ''));
  expect(exported.sort()).toEqual([...keys].sort());

  for (const key of keys) {
    const set = new URL(`${key}.imageset/`, catalog);
    const contents = JSON.parse(readFileSync(new URL('Contents.json', set), 'utf8'));
    expect(contents.images).toEqual([{ filename: `${key}.svg`, idiom: 'universal' }]);
    expect(contents.properties).toMatchObject({ 'template-rendering-intent': 'template', 'preserves-vector-representation': true });
    const svg = readFileSync(new URL(`${key}.svg`, set), 'utf8');
    expect(svg).not.toContain('currentColor');
    expect(svg.match(/^<svg[^>]*>(.*)<\/svg>\s*$/s)?.[1], key).toBe(drawings.get(key));
  }
});

test('a new household starts with the cupboard off, the Plan on, no machines and its questions to answer', async () => {
  const hh = await newHousehold({ setUp: false });
  expect(hh.household).toMatchObject({ cupboardEnabled: false, planEnabled: true, machines: [], kitchenSetUp: false });
  // The same in the list the apps load at start.
  const { token } = await admin();
  const listed = (await call('GET', '/api/households', { token })).find((h: any) => h.id === hh.id);
  expect(listed).toMatchObject({ cupboardEnabled: false, planEnabled: true, machines: [], kitchenSetUp: false });
});

test('the kitchen changes only what is sent, and setUp is a stamp that can be taken back', async () => {
  const hh = await newHousehold({ setUp: false });

  // Machines alone: the whole list, in catalogue order, each once, whatever order it came in.
  const machines = await setKitchen(hh.id, { machines: ['blender', ' oven ', 'oven', ''] });
  expect(machines).toMatchObject({ machines: ['oven', 'blender'], cupboardEnabled: false, planEnabled: true, kitchenSetUp: false });

  // One switch: the other and the machines stay as they were.
  const planOff = await setKitchen(hh.id, { planEnabled: false });
  expect(planOff).toMatchObject({ planEnabled: false, cupboardEnabled: false, machines: ['oven', 'blender'] });
  const cupboardOn = await setKitchen(hh.id, { cupboardEnabled: true });
  expect(cupboardOn).toMatchObject({ planEnabled: false, cupboardEnabled: true });

  // Nothing at all changes nothing.
  expect(await setKitchen(hh.id, {})).toMatchObject({ planEnabled: false, cupboardEnabled: true, machines: ['oven', 'blender'] });

  // Skip, as the apps send it: just the stamp.
  expect(await setKitchen(hh.id, { setUp: true })).toMatchObject({ kitchenSetUp: true, planEnabled: false });
  expect(await setKitchen(hh.id, { setUp: true })).toMatchObject({ kitchenSetUp: true });
  // false asks again (the suite's own way back to a household nobody has set up).
  expect(await setKitchen(hh.id, { setUp: false })).toMatchObject({ kitchenSetUp: false });

  // An empty list takes them all off.
  expect(await setKitchen(hh.id, { machines: [] })).toMatchObject({ machines: [] });
});

test('a machine the server does not know is refused by name, and nothing changes', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  try {
    await call('PATCH', `/api/households/${hh.id}/kitchen`, { token, body: { machines: ['oven', 'sous-vide'], planEnabled: false } });
    throw new Error('should have been refused');
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(400);
    expect(JSON.parse((e as ApiError).body).message).toBe("There's no machine called sous-vide.");
  }
  const after = (await call('GET', '/api/households', { token })).find((h: any) => h.id === hh.id);
  expect(after).toMatchObject({ machines: [], planEnabled: true });
});

test('any member may change the kitchen; somebody outside the household may not', async () => {
  const hh = await newHousehold();
  const member = await newMember(hh.id);
  // Members are equal here, as with servings: it is the household's kitchen, not the owner's.
  expect(await setKitchen(hh.id, { planEnabled: false, machines: ['microwave'] }, member)).toMatchObject({
    planEnabled: false,
    machines: ['microwave'],
    role: 'MEMBER',
  });

  const elsewhere = await newHousehold();
  const outsider = await newMember(elsewhere.id);
  expect(
    await statusOf('PATCH', `/api/households/${hh.id}/kitchen`, { token: outsider.token, body: { cupboardEnabled: false } }),
  ).toBe(403);
  expect((await call('GET', '/api/households', { token: member.token })).find((h: any) => h.id === hh.id)).toMatchObject({
    cupboardEnabled: true,
  });
});

test('joining a household brings its kitchen with it: a set-up house is not asked again', async () => {
  const done = await newHousehold({ plan: false });
  const joiner = await newMember(done.id);
  const seen = (await call('GET', '/api/households', { token: joiner.token })).find((h: any) => h.id === done.id);
  expect(seen).toMatchObject({ kitchenSetUp: true, planEnabled: false, cupboardEnabled: true });
});
