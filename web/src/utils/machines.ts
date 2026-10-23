/*
 * The kitchen machines a household can have and a recipe can need. The server keeps the same
 * list (KitchenMachines.java) and stores only the key, refusing one it does not know, and the
 * iPhone has it too (KitchenMachines.swift) — so the three move together, in this order, and an
 * e2e test reads all three and fails if they disagree.
 *
 * `short` is what fits on a chip: "Instant Pot" beside a count reads, the full label wraps.
 */
export const MACHINES = [
  { key: 'oven', label: 'Oven', short: 'Oven' },
  { key: 'stovetop', label: 'Stovetop', short: 'Stovetop' },
  { key: 'microwave', label: 'Microwave', short: 'Microwave' },
  { key: 'air-fryer', label: 'Air fryer', short: 'Air fryer' },
  { key: 'slow-cooker', label: 'Slow cooker', short: 'Slow cooker' },
  { key: 'pressure-cooker', label: 'Instant Pot / pressure cooker', short: 'Instant Pot' },
  { key: 'grill', label: 'Grill / BBQ', short: 'Grill' },
  { key: 'blender', label: 'Blender', short: 'Blender' },
  { key: 'food-processor', label: 'Food processor', short: 'Processor' },
  { key: 'mixer', label: 'Stand or hand mixer', short: 'Mixer' },
  { key: 'rice-cooker', label: 'Rice cooker', short: 'Rice cooker' },
] as const;

export type MachineKey = (typeof MACHINES)[number]['key'];
export type Machine = (typeof MACHINES)[number];

/** The machine with that key, or undefined for one this build has never heard of (a newer server's). */
export function machineByKey(key: string): Machine | undefined {
  return MACHINES.find((m) => m.key === key);
}

/** The machines among `keys`, in the catalogue's order, with any unknown key left out. */
export function orderedMachines(keys: Iterable<string>): Machine[] {
  const wanted = new Set(keys);
  return MACHINES.filter((m) => wanted.has(m.key));
}

/**
 * Machines that do the same job, so a recipe naming two of one family is asking for either:
 * "bake, or air fry at 180C". The server's KitchenMachines.STAND_INS and the iPhone's
 * KitchenMachine.standIns say the same, and the e2e suite fails if the three drift apart.
 */
export const STAND_INS: readonly (readonly MachineKey[])[] = [
  ['oven', 'air-fryer'],
  ['slow-cooker', 'pressure-cooker'],
  ['blender', 'food-processor'],
];

/**
 * What a kitchen lacks to make a recipe needing these machines, as the server's
 * KitchenMachines.missing works it out — empty when it can make it. Each entry is one thing to
 * get: a single machine, or two stand-ins either of which would do (the recipe said "oven or air
 * fryer" and the kitchen has neither). A kitchen with no machines saved has never said what is in
 * it and lacks nothing; the stovetop is taken to be in every kitchen, ticked or not.
 */
export function missingMachines(needs: Iterable<string>, kitchen: readonly string[] | null | undefined): Machine[][] {
  const have = new Set(kitchen ?? []);
  const wanted = new Set(needs);
  if (have.size === 0 || wanted.size === 0) return [];
  wanted.delete('stovetop');
  const missing: Machine[][] = [];
  for (const family of STAND_INS) {
    const named = family.filter((key) => wanted.has(key));
    if (named.length < 2) continue;
    named.forEach((key) => wanted.delete(key));
    if (!named.some((key) => have.has(key))) missing.push(orderedMachines(named));
  }
  for (const machine of orderedMachines(wanted)) if (!have.has(machine.key)) missing.push([machine]);
  return missing.sort((a, b) => MACHINES.indexOf(a[0]) - MACHINES.indexOf(b[0]));
}

/** Whether a kitchen with these machines can make a recipe that needs those; see missingMachines. */
export function canMake(needs: Iterable<string> | null | undefined, kitchen: readonly string[] | null | undefined): boolean {
  return missingMachines(needs ?? [], kitchen).length === 0;
}

/**
 * "slow cooker", "oven or air fryer", "slow cooker or blender": what a kitchen lacks, as "Your
 * kitchen has no …" says it.
 */
export function missingWords(missing: Machine[][]): string {
  const say = (m: Machine) => (m.key === 'pressure-cooker' ? m.short : m.short.toLowerCase());
  const words = missing.flat().map(say);
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}` : (words[0] ?? '');
}
