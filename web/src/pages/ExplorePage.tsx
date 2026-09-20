import { Link } from 'react-router-dom';
import { GlobeIcon, LeafIcon, TargetIcon } from '../components/icons';
import { PageTitle } from '../components/PageTitle';
import type { SVGProps } from 'react';

/**
 * The front door of Explore: pick what you want to look into.
 *
 * The other four tabs each hold one thing this household owns — its plan, its recipes, its
 * list, its cupboard. Explore is the opposite: everything here is bigger than the house, and
 * there is more than one kind of it. So the tab opens on a choice rather than on a list,
 * which also means a new kind can arrive without anything having to move.
 *
 * Two of the three are not built yet, and they say so rather than pretending. A door marked
 * with what is behind it is worth more than no door, because it is where the work will land.
 */

export interface Destination {
  to: string;
  title: string;
  blurb: string;
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
  tint: string;
  ready: boolean;
  /** What it will do, for the page behind a door that is not open yet. */
  plan?: string;
}

export const DESTINATIONS: Destination[] = [
  {
    to: '/explore/recipes',
    title: 'Global recipes',
    blurb: 'What every other household on this server has published.',
    Icon: GlobeIcon,
    tint: 'cover-0',
    ready: true,
  },
  {
    to: '/explore/nutrition',
    title: 'Nutrition facts',
    blurb: 'What is actually in the food you cook and keep.',
    plan: 'Look up any ingredient or scanned product and see what is in it — calories, protein, '
        + 'and the vitamins and minerals a label does not bother printing.',
    Icon: LeafIcon,
    tint: 'cover-2',
    ready: false,
  },
  {
    to: '/explore/meal-plans',
    title: 'Custom meal plans',
    blurb: 'A week built around what you are short of.',
    plan: 'Say what you want more of — iron, fibre, whatever a doctor mentioned — and get a '
        + 'week of real meals from recipes this house already cooks that adds up to it.',
    Icon: TargetIcon,
    tint: 'cover-4',
    ready: false,
  },
];

export default function ExplorePage() {
  return (
    <div className="space-y-4">
      <PageTitle title="Explore" subtitle="Beyond this kitchen." />

      <div className="space-y-3">
        {DESTINATIONS.map(({ to, title, blurb, Icon, tint, ready }) => (
          <Link
            key={to}
            to={to}
            className={`press block rounded-2xl p-4 transition-transform active:scale-[0.98] ${tint}`}
          >
            <div className="flex items-start gap-4">
              <Icon className="mt-0.5 h-8 w-8 shrink-0 text-ink/55" />
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-tight">{title}</p>
                <p className="mt-0.5 text-sm text-ink/70">{blurb}</p>
                {!ready && (
                  <p className="mt-2 inline-block rounded-full bg-ink/10 px-2 py-0.5 text-xs font-medium text-ink/60">
                    Being built
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
