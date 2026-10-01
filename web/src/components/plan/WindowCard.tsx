import type { MealPlanEntry } from '../../api/types';
import { isPlanned } from '../../utils/planEntry';
import { Button, cx, Pill } from '../ui';
import { addDays, isoDate, slotMark, slotsOf, type ShoppingMap } from './planModel';

/**
 * The top of Upcoming (the mockup's 2.2): the planning window at a glance — how many of its days
 * have something planned, how many meals are still not on the grocery list, a strip of the days
 * themselves — and the one big action, putting it all on the list.
 */
export default function WindowCard({
  today,
  horizonDays,
  byDate,
  shopping,
  onPick,
  onAdd,
}: {
  today: Date;
  horizonDays: number;
  byDate: Map<string, MealPlanEntry[]>;
  shopping: ShoppingMap | null;
  onPick: (key: string) => void;
  onAdd: () => void;
}) {
  const days = Array.from({ length: horizonDays }, (_, i) => addDays(today, i));
  const planned = days.filter((d) => (byDate.get(isoDate(d)) ?? []).some(isPlanned));
  // Counted by meal, as the plan shows them: a dinner with a side still to buy is one.
  const notOnList = shopping
    ? days.flatMap((d) => slotsOf(byDate.get(isoDate(d)) ?? [])).filter((s) => slotMark(s.dishes, shopping)?.canAdd).length
    : 0;
  const what = horizonDays === 7 ? 'week' : `${horizonDays} days`;

  return (
    <div className="card flex flex-col gap-3.5 p-4 shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="group-label">Next {horizonDays === 1 ? 'day' : `${horizonDays} days`}</p>
          <p className="text-[1.0625rem] font-semibold">
            {planned.length} of {horizonDays} {horizonDays === 1 ? 'day' : 'days'} planned
          </p>
        </div>
        {notOnList > 0 && (
          <Pill tone="mustard" icon="alert" className="mt-1">
            {notOnList} not on list
          </Pill>
        )}
        {shopping && notOnList === 0 && planned.length > 0 && (
          <Pill tone="herb" icon="check" className="mt-1">
            All on the list
          </Pill>
        )}
      </div>

      {/* Seven fit across a phone; a longer window scrolls sideways. */}
      <div className={cx('-mx-1 flex gap-1 overflow-x-auto px-1', horizonDays <= 7 ? 'justify-between' : '')}>
        {days.map((d, i) => {
          const isToday = i === 0;
          const has = (byDate.get(isoDate(d)) ?? []).some(isPlanned);
          return (
            <button
              key={isoDate(d)}
              type="button"
              onClick={() => onPick(isoDate(d))}
              aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${has ? ', planned' : ''}`}
              className={cx(
                'press flex w-[38px] shrink-0 flex-col items-center gap-1 rounded-xl py-2',
                isToday ? 'bg-accent text-on-accent' : 'active:bg-surface2',
              )}
            >
              <span className={cx('text-[0.6875rem] font-semibold', !isToday && 'text-muted')}>
                {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
              <span className="text-base font-semibold leading-none">{d.getDate()}</span>
              <span
                aria-hidden="true"
                className={cx('h-1.5 w-1.5 rounded-full', has ? (isToday ? 'bg-on-accent' : 'bg-herb') : 'bg-line')}
              />
            </button>
          );
        })}
      </div>

      <Button size="lg" full icon="cart" onClick={onAdd}>
        Add {what} to groceries
      </Button>
    </div>
  );
}
