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

const Pancakes = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <ellipse cx="24" cy="30" rx="15" ry="6" />
    <path d="M9 30v4c0 3.3 6.7 6 15 6s15-2.7 15-6v-4" />
    <ellipse cx="24" cy="22" rx="13" ry="5" />
    <path d="M24 12v4M20 14l4-5 4 5" />
  </Art>
);

const Sandwich = (p: SVGProps<SVGSVGElement>) => (
  <Art {...p}>
    <path d="M8 20c0-5 7-9 16-9s16 4 16 9z" />
    <path d="M8 24h32M8 30h32" />
    <path d="M10 34h28c0 3-2 5-5 5H15c-3 0-5-2-5-5z" />
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
