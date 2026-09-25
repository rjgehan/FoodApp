import type { SVGProps } from 'react';
import type { RecipeSection } from '../api/types';

/**
 * The built-in illustration set. Drawn rather than uploaded, so category art costs a few KB of
 * markup instead of rows in the database, and stays crisp at any size.
 */
function Art({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

/** A stack with a pat of butter on top and syrup running over the edge. */
const Pancakes = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <ellipse cx="24" cy="30" rx="15" ry="6" />
    <path d="M9 30v4c0 3.3 6.7 6 15 6s15-2.7 15-6v-4" />
    <ellipse cx="24" cy="22" rx="13" ry="5" />
    <path d="M18.5 21.5 24 19l5.5 2.5L24 24z" />
    <path d="M33 25.6v4.4a1.5 1.5 0 0 0 3 0v-6.1" />
  </Art>
);

/**
 * A sandwich cut corner to corner and seen from the cut: a triangle of bread with its crust, and
 * the filling showing along the cut edge. Drawn as a wedge so it cannot be taken for the burger.
 */
const Sandwich = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M8 38h28L8 12z" />
    <path d="M11.5 20v14.5h15.6z" />
    <path d="M8 12l5-4 28 25-5 5" />
    <path d="M10.5 10q1.33 3.2 4.67 4.17t4.67 4.17 4.67 4.17 4.67 4.17 4.67 4.17 4.67 4.17" />
  </Art>
);

const Pot = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M9 20h30v11a8 8 0 0 1-8 8H17a8 8 0 0 1-8-8z" />
    <path d="M6 20h36M9 25H5M39 25h4" />
    <path d="M19 13c0-3 3-3 3-6M27 13c0-3 3-3 3-6" />
  </Art>
);

const Cookie = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <circle cx="24" cy="24" r="15" />
    <circle cx="19" cy="19" r="1.8" fill="currentColor" />
    <circle cx="29" cy="22" r="1.8" fill="currentColor" />
    <circle cx="22" cy="30" r="1.8" fill="currentColor" />
    <circle cx="31" cy="31" r="1.8" fill="currentColor" />
  </Art>
);

const Cup = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M11 16h24v12a12 12 0 0 1-12 12A12 12 0 0 1 11 28z" />
    <path d="M35 20h4a5 5 0 0 1 0 10h-4" />
    <path d="M18 10c0-2 2-2 2-4M26 10c0-2 2-2 2-4" />
  </Art>
);

const Salad = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M7 24h34a17 17 0 0 1-34 0z" />
    <path d="M14 24c0-6 4-10 10-10M24 24c2-7 7-9 12-8M20 24c-1-4-4-6-8-6" />
  </Art>
);

const Fish = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M6 24c6-9 15-11 22-11s12 5 14 11c-2 6-7 11-14 11S12 33 6 24z" />
    <path d="M6 24c-1-4-1-7 0-10 3 1 5 3 6 5M6 24c-1 4-1 7 0 10 3-1 5-3 6-5" />
    <circle cx="33" cy="21" r="1.8" fill="currentColor" />
  </Art>
);

const Bread = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M10 22c0-6 6-9 14-9s14 3 14 9v12a5 5 0 0 1-5 5H15a5 5 0 0 1-5-5z" />
    <path d="M17 15c0 4-2 6-2 9M24 14c0 4-2 6-2 9M31 15c0 4-2 6-2 9" />
  </Art>
);

const Apple = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M24 16c-3-3-9-3-12 1s-2 12 2 17 7 5 10 3c3 2 6 2 10-3s5-13 2-17-9-4-12-1z" />
    <path d="M24 16v-5M24 11c3 0 5-2 6-4-3-1-6 1-6 4z" />
  </Art>
);

const Pizza = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M24 8 42 38a3 3 0 0 1-3 4H9a3 3 0 0 1-3-4z" />
    <circle cx="24" cy="26" r="2" fill="currentColor" />
    <circle cx="18" cy="34" r="2" fill="currentColor" />
    <circle cx="30" cy="34" r="2" fill="currentColor" />
  </Art>
);

const Cake = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M9 26c0-3 3-5 15-5s15 2 15 5v10a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z" />
    <path d="M9 31c3 2 6 2 7.5 0s4.5-2 7.5 0 6 2 7.5 0 4.5-2 7.5 0" />
    <path d="M24 21v-6M24 12a2 2 0 1 1 2 2" />
  </Art>
);

const Egg = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M12 34c-4-8 2-24 12-24s16 16 12 24c-3 6-21 6-24 0z" />
    <circle cx="24" cy="27" r="6" />
  </Art>
);

/*
 * The ones below were drawn for groups rather than drawers — "Veggie", "Side", "Full meal" —
 * and are also drawn big, filling a tile, so each is a single clear shape first and detail
 * second. Same pen as the rest: 48×48, a 2px line, round ends.
 */

/** A plate from above, split three ways: the meat, a veggie and a side. */
const FullMeal = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <circle cx="24" cy="24" r="19.5" />
    <circle cx="24" cy="24" r="15.5" />
    <path d="M24 8.5V24l-13.4 7.75M24 24l13.4 7.75" />
    <path d="M17 24v-3.5M13.3 20.5a2.2 2.2 0 0 1 .4-4 2.8 2.8 0 0 1 5.1-.9 2.2 2.2 0 0 1 1.9 4.9z" />
    <circle cx="28.8" cy="16" r="2" />
    <circle cx="33" cy="18.5" r="2" />
    <circle cx="29.3" cy="21" r="2" />
    <path d="M18.22 33.07c0-2.72 2.38-4.76 5.78-4.76 3.06 0 5.78 1.7 5.78 4.08 0 1.7-1.36 2.72-3.06 3.06-1.36 .34-2.04 1.02-3.06 1.7-1.02 .68-2.72 .68-3.74 0-1.02-.68-1.7-2.04-1.7-4.08z" />
    <path d="M19.92 33.41c.34-1.7 2.04-3.06 4.08-3.06" />
  </Art>
);

/** A steak, bone in. */
const Meat = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M7 26c0-8 7-14 17-14 9 0 17 5 17 12 0 5-4 8-9 9-4 1-6 3-9 5-3 2-8 2-11 0-3-2-5-6-5-12z" />
    <circle cx="30" cy="24" r="3.5" />
    <path d="M12 27c1-5 6-9 12-9" />
  </Art>
);

const Drumstick = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M27.5 27.5c5-4 6.5-12 2-16.5s-12.5-3.5-17 1-5 12.5-1 16.5 11 4 16-1z" />
    <path d="M26.5 29.5l5 5" />
    <circle cx="35.3" cy="33.2" r="2.6" />
    <circle cx="32.8" cy="37.7" r="2.6" />
    <path d="M16 16c2-2 5-3 8-2" />
  </Art>
);

/** Broccoli — the one that reads as "vegetables" at any size. */
const Veggie = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M13 26a6 6 0 0 1 1-11 7 7 0 0 1 11-5 7 7 0 0 1 10 5 6 6 0 0 1 0 11z" />
    <path d="M19 26c1.5 4 2 8 2 13h6c0-5 .5-9 2-13" />
    <path d="M24 26v5M21 29l3 2 3-2" />
  </Art>
);

const Carrot = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M28 14c3-1 7 2 6 6L13 40c-1.5 1-3.5-1-2.5-2.5z" />
    <path d="M20 24l3 3M16 30l2.5 2.5M25 19l2 2" />
    <path d="M31 13c-1-3 0-6 2-8M33 15c2-2 5-3 9-2M32 14c2-3 5-4 8-4" />
  </Art>
);

/** Fries in a carton — a side dish, at a glance. */
const Side = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M12 21h24l-3.5 19h-17z" />
    <path d="M12 21c4 4 20 4 24 0" />
    <path d="M16 21 14 9M20.5 22.5 20 7M25 22.5 26 8M29.5 22 32 10M33 21l4-9" />
  </Art>
);

const RiceBowl = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M7 25h34a17 17 0 0 1-34 0z" />
    <path d="M11 25c0-6 6-10 13-10s13 4 13 10" />
    <path d="M18 20.5l1 .5M24 18.5h1M29.5 20.5l.5-1M22 23h1" />
    <path d="M30 13 39 4M34 15l9-7" />
  </Art>
);

const Noodles = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M7 25h34a17 17 0 0 1-34 0z" />
    <path d="M9 9l30 4M9 13l30 2" />
    <path d="M19 25c-2-3 2-6 0-9M24 25c-2-3 2-6 0-9M29 25c-2-3 2-6 0-9" />
  </Art>
);

const Taco = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M8 36a16 16 0 0 1 32 0z" />
    <path d="M13.5 36a10.5 10.5 0 0 1 21 0" />
    <path d="M5.6 31.1a3.9 3.9 0 0 1 2.6-5.7 3.9 3.9 0 0 1 4.2-4.5 3.9 3.9 0 0 1 5.5-2.9A3.9 3.9 0 0 1 24 17a3.9 3.9 0 0 1 6.1 1 3.9 3.9 0 0 1 5.5 2.9 3.9 3.9 0 0 1 4.2 4.5 3.9 3.9 0 0 1 2.6 5.7" />
  </Art>
);

const Burger = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M8 22c0-7 7-12 16-12s16 5 16 12z" />
    <path d="M19 15.5l1 .5M24 14h1M28.5 16l.5-1" />
    <path d="M7 26c2.3-1.5 4.3 1.5 6.6 0s4.3 1.5 6.6 0 4.3 1.5 6.6 0 4.3 1.5 6.6 0 4.3 1.5 6.6 0" />
    <rect x="8" y="29" width="32" height="5" rx="2.5" />
    <path d="M9 37h30c0 2-2 3.5-4 3.5H13c-2 0-4-1.5-4-3.5z" />
  </Art>
);

const IceCream = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M14 24c-1.5-8 3.5-15 10-15s11.5 7 10 15z" />
    <path d="M15 24l9 18 9-18" />
    <path d="M18.5 30h11M21.5 36h5" />
  </Art>
);

/** A cold drink: a tumbler with ice and a straw. */
const Glass = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M12 12h24l-3 28H15z" />
    <path d="M13 19h22" />
    <path d="M27 12l3-8h5" />
    <path d="M18 24l5 1-1 5-5-1zM25 28l4.5 2-2 4.5-4.5-2z" />
  </Art>
);

export interface FoodIcon {
  key: string;
  label: string;
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
}

export const FOOD_ICONS: FoodIcon[] = [
  { key: 'pancakes', label: 'Pancakes', Icon: Pancakes },
  { key: 'egg', label: 'Egg', Icon: Egg },
  { key: 'sandwich', label: 'Sandwich', Icon: Sandwich },
  { key: 'salad', label: 'Salad', Icon: Salad },
  { key: 'pot', label: 'Pot', Icon: Pot },
  { key: 'fish', label: 'Fish', Icon: Fish },
  { key: 'pizza', label: 'Pizza', Icon: Pizza },
  { key: 'bread', label: 'Bread', Icon: Bread },
  { key: 'cookie', label: 'Cookie', Icon: Cookie },
  { key: 'cake', label: 'Cake', Icon: Cake },
  { key: 'apple', label: 'Apple', Icon: Apple },
  { key: 'cup', label: 'Cup', Icon: Cup },
  { key: 'full-meal', label: 'Full meal', Icon: FullMeal },
  { key: 'meat', label: 'Meat', Icon: Meat },
  { key: 'drumstick', label: 'Chicken', Icon: Drumstick },
  { key: 'veggie', label: 'Veggie', Icon: Veggie },
  { key: 'carrot', label: 'Carrot', Icon: Carrot },
  { key: 'side', label: 'Side', Icon: Side },
  { key: 'rice-bowl', label: 'Rice bowl', Icon: RiceBowl },
  { key: 'noodles', label: 'Noodles', Icon: Noodles },
  { key: 'taco', label: 'Taco', Icon: Taco },
  { key: 'burger', label: 'Burger', Icon: Burger },
  { key: 'ice-cream', label: 'Ice cream', Icon: IceCream },
  { key: 'glass', label: 'Cold drink', Icon: Glass },
];

/** What each drawer shows until somebody picks something else. */
export const DEFAULT_SECTION_ICONS: Record<RecipeSection, string> = {
  BREAKFAST: 'pancakes',
  LUNCH: 'sandwich',
  DINNER: 'pot',
  SNACKS: 'cookie',
  DRINKS: 'cup',
  OTHER: 'apple',
};

export function iconByKey(key: string | undefined | null): FoodIcon | undefined {
  return FOOD_ICONS.find((i) => i.key === key);
}
