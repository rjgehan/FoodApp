import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { MealType, Recipe, RecipeSection } from '../../api/types';
import { kcalText } from '../../api/nutrition';
import { MEAL_PLANS, planHue, planIcon, planPath, planTone, type MealPlansHome, type TargetPlanCard } from '../../api/mealPlans';
import { RecipePicture } from '../catalogue/CatalogueParts';
import { Icon } from '../icons';
import { Avatar, Button, Chip, cx, Photo, Pill, SwitchKnob, Tile } from '../ui';

/*
 Meal plans' own pieces (the mockup's 5.1 door and 5.7–5.11): the cupboard card, a plan's card,
 the ring for how much comes from the cupboard, a meal's picture, and the day tiles. Built on
 ui.tsx and the theme's tokens, so every theme and both modes come for free.
*/

export const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
};

/** The setup's meal chips say "Snacks", as the mockup does: it is a kind of meal, not one. */
export const MEAL_CHIP: Record<MealType, string> = { ...MEAL_LABEL, SNACK: 'Snacks' };

export const MEAL_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

/** "Build the next few days around the 64 things you already have. 5 need using soon." */
export function cupboardLine(items: number, useSoon: number): string {
  if (items === 0) return 'Your cupboard is empty. Add what you have, and plans can be built around it.';
  const things = `${items} ${items === 1 ? 'thing' : 'things'}`;
  const soon = useSoon === 0 ? '' : useSoon === 1 ? ' 1 needs using soon.' : ` ${useSoon} need using soon.`;
  return `Build the next few days around the ${things} you already have.${soon}`;
}

/**
 * Cook from your cupboard (5.7): the tomato card at the top of Meal plans, with how much is in
 * the cupboard, a few of the things (those wanting using first), and the way in.
 */
export function CupboardCard({ cupboard }: { cupboard: MealPlansHome['cupboard'] | null }) {
  const chips = cupboard?.highlights.slice(0, 4) ?? [];
  const more = cupboard ? cupboard.items - chips.length : 0;
  return (
    <section
      aria-label="Cook from your cupboard"
      className="card flex flex-col gap-3 !border-transparent !bg-accent p-[18px] text-on-accent md:p-6"
    >
      <div className="flex items-center gap-2.5">
        <Icon name="cupboard" size={22} className="shrink-0" />
        <h2 className="serif min-w-0 flex-1 text-[1.375rem] leading-tight">Cook from your cupboard</h2>
      </div>
      <p className="text-[0.875rem] leading-[1.4] opacity-[0.92] md:max-w-xl">
        {cupboard ? cupboardLine(cupboard.items, cupboard.useSoon) : ' '}
      </p>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((name) => (
            <span key={name} className="rounded-full bg-white/20 px-2.5 py-[3px] text-xs font-semibold">
              {name}
            </span>
          ))}
          {more > 0 && <span className="rounded-full bg-white/20 px-2.5 py-[3px] text-xs font-semibold">+ {more}</span>}
        </div>
      )}
      <Link
        to={`${MEAL_PLANS}/cupboard`}
        className="press flex h-[3.25rem] items-center justify-center gap-2 rounded-btn bg-surface text-[1.0625rem] font-semibold text-accent-ink md:max-w-sm"
      >
        <Icon name="sparkles" size={19} />
        Generate a plan
      </Link>
    </section>
  );
}

/** Protein is worth showing on a card when the plan is about muscle or losing fat. */
const showsProtein = (card: TargetPlanCard) => card.tags.includes('build-muscle') || card.tags.includes('lose-fat');

/** A plan for a health target as a card (5.7): its colour and mark, name, goal and length, its numbers. */
export function PlanCard({ card }: { card: TargetPlanCard }) {
  const tone = planTone(card.hue);
  return (
    <Link to={planPath(card)} className="card press flex w-full min-w-0 flex-col gap-2.5 overflow-hidden !p-0">
      <Photo hue={planHue(card.hue)} icon={planIcon(card.icon)} className="h-[90px] w-full md:h-[110px]" />
      <span className="flex flex-col gap-2 px-3.5 pb-3.5">
        <span className="flex flex-col gap-0.5">
          <span className="text-base font-semibold leading-[1.25]">{card.name}</span>
          <span className="text-xs text-muted">{card.subtitle}</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          <Pill tone={tone}>{kcalText(card.kcal)} kcal</Pill>
          {showsProtein(card) && <Pill tone={tone}>{card.protein}g P</Pill>}
        </span>
      </span>
    </Link>
  );
}

/** One of your own plans in "Made by you": your initial, its name and its numbers. */
export function MinePlanRow({ card, who }: { card: TargetPlanCard; who: string | null }) {
  return (
    <li>
      <Link to={planPath(card)} className="press flex min-h-[52px] w-full items-center gap-3 px-4 py-3 active:bg-surface2">
        <Avatar name={who ?? card.name} tone="accent" size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{card.name}</span>
          <span className="mt-px block truncate text-[0.8125rem] text-muted">
            {kcalText(card.kcal)} kcal · {card.protein}g protein · {card.length} {card.length === 1 ? 'day' : 'days'}
          </span>
        </span>
        <Icon name="chevR" size={16} className="shrink-0 text-faint" />
      </Link>
    </li>
  );
}

/** A share as a ring of a tone with its number in the middle (5.9's "87%"). */
export function PercentRing({
  percent,
  size = 76,
  stroke = 9,
  tone = 'herb',
}: {
  percent: number;
  size?: number;
  stroke?: number;
  tone?: 'herb' | 'mustard' | 'accent';
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const part = Math.max(0, Math.min(percent / 100, 1));
  const ink = { herb: 'stroke-herb', mustard: 'stroke-mustard', accent: 'stroke-accent' }[tone];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface2" />
        {part > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * part} ${c}`}
            className={ink}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[1.0625rem] font-bold tabular-nums">{percent}%</div>
    </div>
  );
}

/** A meal's picture: the recipe's cover, or its colour with a mark for the kind of dish. */
export function MealPicture({
  meal,
  size = 44,
}: {
  meal: { recipeId: string; name: string; section: RecipeSection | null; coverImageId: string | null };
  size?: number;
}) {
  const recipe = { id: meal.recipeId, name: meal.name, section: meal.section, coverImageId: meal.coverImageId } as Recipe;
  return <RecipePicture recipe={recipe} className="rounded-[10px]" style={{ width: size, height: size }} />;
}

/** "3 in the cupboard": a meal's share already in, herb when it is all there. */
export function CupboardPill({ percent }: { percent: number }) {
  return (
    <Pill tone={percent >= 100 ? 'herb' : 'mustard'} icon="cupboard" className="!px-2.5 !py-1 !text-[0.75rem]">
      {percent}%
    </Pill>
  );
}

/** The round swap at the end of a meal's row (5.9). */
export function SwapButton({ label, busy, onClick }: { label: string; busy?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={onClick}
      className="press relative -mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-faint active:bg-surface2 disabled:opacity-40"
    >
      <Icon name={busy ? 'refresh' : 'swap'} size={17} className={busy ? 'animate-spin' : undefined} />
    </button>
  );
}

/** A meal row in a grouped list: picture, name, a line under it, and whatever ends it. */
export function MealRow({
  picture,
  title,
  subtitle,
  end,
  to,
  muted,
  wrap,
  ...aria
}: {
  picture: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  end?: ReactNode;
  to?: string;
  muted?: boolean;
  /** Let the line under the name wrap: a target plan's portion and numbers are all needed. */
  wrap?: boolean;
  'aria-label'?: string;
}) {
  const body = (
    <>
      {picture}
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-[0.9375rem] font-semibold', muted && 'text-muted')}>{title}</span>
        <span className={cx('mt-0.5 block text-xs text-muted', wrap ? 'leading-[1.4]' : 'truncate')}>{subtitle}</span>
      </span>
    </>
  );
  return (
    <li className="flex items-center gap-2.5 px-3 py-2.5" {...aria}>
      {to ? (
        <Link to={to} className="press flex min-w-0 flex-1 items-center gap-2.5">
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">{body}</span>
      )}
      {end}
    </li>
  );
}

/** A day tile for choosing days (5.8): weekday over date, tomato when chosen. */
export function DayTile({
  label,
  date,
  on,
  planned,
  onClick,
  ...aria
}: {
  label: string;
  date: string;
  on: boolean;
  planned?: boolean;
  onClick: () => void;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'press flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-2 transition-colors',
        on ? 'bg-accent text-on-accent' : 'bg-surface2 text-muted',
      )}
      {...aria}
    >
      <span className="text-[0.6875rem] font-semibold">{label}</span>
      <span className="text-[0.9375rem] font-semibold tabular-nums">{date}</span>
      <span aria-hidden="true" className={cx('h-1 w-1 rounded-full', planned ? (on ? 'bg-on-accent' : 'bg-faint') : 'bg-transparent')} />
    </button>
  );
}

/** The mockup's four-way choice in quiet tiles, the chosen one in the text colour (5.8). */
export function ChoiceTiles<T extends string | number | null>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'press min-w-0 flex-1 rounded-[11px] py-[9px] text-center text-[0.875rem] font-semibold transition-colors',
              on ? 'bg-ink text-bg' : 'bg-surface2 text-muted',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A row that is a switch: the whole row is the thing to tap (5.8's "Only my recipes"). */
export function SwitchRow({
  title,
  subtitle,
  on,
  onChange,
  className,
}: {
  title: string;
  subtitle: string;
  on: boolean;
  onChange: (on: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={title}
      onClick={() => onChange(!on)}
      className={cx('press flex w-full items-center justify-between gap-3 text-left', className)}
    >
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-semibold">{title}</span>
        <span className="block text-xs text-muted">{subtitle}</span>
      </span>
      <SwitchKnob on={on} />
    </button>
  );
}

/** The plan filter chips (5.7), in one row that scrolls sideways on a phone. */
export function FilterChips({
  filters,
  value,
  onChange,
}: {
  filters: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter plans"
      className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
    >
      {filters.map((f) => (
        <Chip key={f.key} active={f.key === value} onClick={() => onChange(f.key)}>
          {f.label}
        </Chip>
      ))}
    </div>
  );
}

/** The quiet note when a page could not load, with a way to try again. */
/**
 * A plan that isn't there for you — deleted, or somebody else's private one. Not a network
 * problem, so no "Try again": it would never work.
 */
export function PlanNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-5 py-8 text-center">
      <Tile icon="search" tone="sky" size={48} />
      <p className="text-[0.9375rem] font-semibold">This plan isn't available</p>
      <p className="text-[0.8125rem] text-muted">It may have been deleted, or it's someone else's own plan.</p>
      <Button variant="secondary" size="sm" onClick={onBack}>
        Back to Meal plans
      </Button>
    </div>
  );
}

export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-5 py-8 text-center">
      <Tile icon="cloudOff" tone="mustard" size={48} />
      <p className="text-[0.9375rem] text-muted">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
