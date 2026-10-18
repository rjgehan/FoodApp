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
