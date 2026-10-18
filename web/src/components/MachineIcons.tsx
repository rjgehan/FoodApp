import type { SVGProps } from 'react';
import { MACHINES, type Machine } from '../utils/machines';

/*
 The kitchen machines as line drawings, one per key in utils/machines.ts: on the recipe page's
 machine pills, the drawer's machine filter and the kitchen setup's tiles. Drawn like icons.tsx —
 24x24, stroked with currentColor at 2, round ends — so a machine sits beside the app's other
 icons as one of them, and takes its colour and size from the text around it.

 Each is the silhouette you would point at in a shop: the oven's door window, the hob's rings,
 the air fryer's basket. They stay simple because they are drawn at 15px on a chip.
*/

// Path data written here, never user input.
const DRAWINGS: Record<Machine['key'], string> = {
  // A cooker seen from the front: knobs along the top, the door with its window.
  oven: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M7 5.5h.01M10.5 5.5h.01M14 5.5h3"/><rect x="7" y="11.5" width="10" height="6" rx="1"/>',
  // The hob from above: two big rings and two small.
  stovetop: '<rect x="2" y="2" width="20" height="20" rx="2.5"/><circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="7.5" r="2"/><circle cx="7.5" cy="16.5" r="2"/><circle cx="16" cy="16" r="3"/>',
  // Wider than tall: the window, and the buttons beside it.
  microwave: '<rect x="2" y="4" width="20" height="15" rx="2"/><rect x="5" y="7.5" width="10" height="8" rx="1"/><path d="M18.5 8.5h.01M18.5 11.5h.01M18.5 14.5h.01M6 19v1.5M18 19v1.5"/>',
  // The pod: a dial on top, the basket drawer below with its handle standing out.
  'air-fryer': '<rect x="4" y="2.5" width="16" height="19" rx="4"/><path d="M4 11.5h16"/><circle cx="12" cy="7" r="1.8"/><rect x="8.5" y="14.5" width="7" height="3" rx="1.5"/>',
  // A low pot: the glass lid's dome and knob, a handle each side.
  'slow-cooker': '<path d="M4 11h16v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M5 11a7 4 0 0 1 14 0M12 7V5.5M10.5 5.5h3M2 13.5h2M20 13.5h2M10.5 15.5h3"/>',
  // Taller: the locking lid with its steam valve, and the panel on the front.
  'pressure-cooker': '<path d="M5 10h14v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M3.5 10h17M6 10a6 4 0 0 1 12 0M15 6.5V5M13.5 5h3"/><rect x="9" y="13" width="6" height="4" rx="1"/>',
  // A kettle barbecue: heat over the grate, the bowl, three legs.
  grill: '<path d="M3 10h18"/><path d="M4 10a8 6.5 0 0 0 16 0"/><path d="M8 15.5 6.5 21M16 15.5l1.5 5.5M12 16.5V21M8.5 3.5c-.8 1 .8 2 0 3M12 3c-.8 1 .8 2 0 3M15.5 3.5c-.8 1 .8 2 0 3"/>',
  // The jug on its base, wider at the top, with a handle.
  blender: '<path d="M6.5 3h10l-1.5 10h-7z"/><path d="M16.2 5.5h2.3v4.5h-3"/><path d="M6 21v-4.5A2.5 2.5 0 0 1 8.5 14h7a2.5 2.5 0 0 1 2.5 2.5V21z"/><path d="M12 17.5h.01"/>',
  // The bowl with its feed tube and handle, the blade inside it, the base under it.
  'food-processor': '<path d="M6 16V9h12v7M4.5 9h15M13 9V3.5h3V9M18 10.5h1a1.5 1.5 0 0 1 1.5 1.5v1.5A1.5 1.5 0 0 1 19 15h-1M8.5 13.2c1.2-1.4 2.3-1.4 3.5 0s2.3 1.4 3.5 0"/><rect x="4" y="16" width="16" height="5" rx="1.5"/>',
  // A stand mixer: the head over the bowl, the whisk hanging into it.
  mixer: '<path d="M3.5 21h17M5.5 21V8a4 4 0 0 1 4-4h8.5a2.5 2.5 0 0 1 0 5H9.5v12"/><path d="M15.5 9v3.5M14 11.5l1.5 1.5 1.5-1.5M12 14h7l-.5 3.2a2.5 2.5 0 0 1-2.5 2.1h-1.5a2.5 2.5 0 0 1-2.5-2.1z"/>',
  // Wide and round-bottomed, a dome lid with its steam vent, the button in front.
  'rice-cooker': '<path d="M3 12h18v2.5a6.5 6.5 0 0 1-6.5 6.5h-5A6.5 6.5 0 0 1 3 14.5z"/><path d="M3.5 12a8.5 6 0 0 1 17 0M15 8.5h.01M9.5 16h5M14.5 2.5c-.6.7.6 1.6 0 2.5"/>',
};

export type MachineIconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  /** A key from utils/machines.ts. One this build does not know draws nothing. */
  machine: string;
  /** Width and height in px. Leave it out to size it with a className instead. */
  size?: number;
};

export function MachineIcon({ machine, size, strokeWidth = 2, ...props }: MachineIconProps) {
  const drawing = DRAWINGS[machine as Machine['key']];
  if (!drawing) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-machine={machine}
      {...props}
      dangerouslySetInnerHTML={{ __html: drawing }}
    />
  );
}

/**
 * Every machine with its drawing as a component, in the catalogue's order — for a gallery, and
 * for exporting the drawings to the iPhone's asset catalog the way FoodIcons are.
 */
export const MACHINE_ICONS = MACHINES.map((m) => ({
  key: m.key,
  label: m.label,
  Icon: (props: Omit<SVGProps<SVGSVGElement>, 'name'>) => <MachineIcon machine={m.key} {...props} />,
}));
