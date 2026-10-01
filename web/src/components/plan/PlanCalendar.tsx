import type { MealPlanEntry, Recipe } from '../../api/types';
import { isPlanned } from '../../utils/planEntry';
import { Icon } from '../icons';
import { Button, cx, IconButton } from '../ui';
import MealPicture from './MealPicture';
import { addDays, isoDate, mondayIndex, startOfMonth } from './planModel';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The month on a card (the mockup's 2.1): the planning window tinted green so "we plan a week
 * ahead" is something you can see, a dot under every day with something on it, today in tomato.
 * Every day is a button — that is how an empty Thursday gets its dinner.
 *
 * The weeks start on Monday, as the mockup's do. Days before the 1st are left blank; the grid
 * runs on past the end of the month as far as the planning window does, so the window is never
 * cut off at a month's edge. On a computer each square is wide enough to show what is for
 * dinner rather than only that something is.
 */
export default function PlanCalendar({
  monthCursor,
  byDate,
  today,
  horizonDays,
  recipes,
  pictures,
  onMonth,
  onToday,
  onPick,
}: {
  monthCursor: Date;
  byDate: Map<string, MealPlanEntry[]>;
  today: Date;
  horizonDays: number;
  recipes: Map<string, Recipe>;
  /** Recipe or place id → image id, or null where there is no room for pictures. */
  pictures: Map<string, string> | null;
  onMonth: (delta: number) => void;
  onToday: () => void;
  onPick: (key: string) => void;
}) {
  const first = startOfMonth(monthCursor);
  const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const horizonEnd = addDays(today, horizonDays - 1);
  const lead = mondayIndex(first);
  // To the end of the week the month ends in — or of the week the window ends in, if later.
  const runTo = horizonEnd > last && horizonEnd.getTime() - last.getTime() < 40 * 86_400_000 ? horizonEnd : last;
  const end = addDays(runTo, 6 - mondayIndex(runTo));
  const days: Date[] = [];
  for (let d = first; d <= end; d = addDays(d, 1)) days.push(d);
  const thisMonth = monthCursor.getMonth() === today.getMonth() && monthCursor.getFullYear() === today.getFullYear();

  return (
    <div className="card flex flex-col gap-2 px-3 py-3.5">
      <div className="flex items-center justify-between gap-2 pl-1">
        <h2 className="title-section truncate" aria-live="polite">
          {monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="soft"
            onClick={onToday}
            aria-pressed={thisMonth}
            className="!h-auto !rounded-full !px-2.5 !py-[5px] !text-[0.8125rem] !font-semibold"
          >
            Today
          </Button>
          <IconButton label="Previous month" shape="round" className="!h-8 !w-8" onClick={() => onMonth(-1)}>
            <Icon name="chevL" size={15} />
          </IconButton>
          <IconButton label="Next month" shape="round" className="!h-8 !w-8" onClick={() => onMonth(1)}>
            <Icon name="chevR" size={15} />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="pb-1 text-center text-xs font-semibold text-faint" aria-hidden="true">
            {w}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {days.map((day) => {
          const key = isoDate(day);
          const planned = (byDate.get(key) ?? []).filter(isPlanned);
          const isToday = key === isoDate(today);
          const past = day < today;
          const inWindow = day >= today && day <= horizonEnd;
          const inMonth = day.getMonth() === monthCursor.getMonth();
          return (
            <button
              key={key}
              type="button"
              aria-label={`${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${planned.length ? `, ${planned.length} planned` : ''}`}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onPick(key)}
              className={cx(
                'press flex flex-col items-center justify-center gap-[3px] rounded-xl text-[0.9375rem] transition-colors',
                pictures ? 'min-h-[4.75rem] py-1.5' : 'h-[2.375rem]',
                isToday
                  ? 'bg-accent font-semibold text-on-accent'
                  : inWindow
                    ? 'bg-herb-soft font-semibold text-ink'
                    : cx('active:bg-surface2', past || !inMonth ? 'text-muted' : 'text-ink'),
              )}
            >
              <span className="leading-none">{day.getDate()}</span>
              {pictures && planned.length > 0 ? (
                // Three fit; a fourth meal turns the third into a count, so a busy day still
                // says it is busier than it looks.
                <span className="flex items-center justify-center gap-0.5">
                  {planned.slice(0, planned.length > 3 ? 2 : 3).map((e) => (
                    <MealPicture
                      key={e.id}
                      entry={e}
                      recipe={e.recipeId ? recipes.get(e.recipeId) : undefined}
                      pictures={pictures}
                      size={24}
                      radius={6}
                    />
                  ))}
                  {planned.length > 3 && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-surface2 text-[0.6875rem] font-semibold text-muted">
                      +{planned.length - 2}
                    </span>
                  )}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={cx(
                    'h-[5px] w-[5px] rounded-full',
                    planned.length === 0 ? 'bg-transparent' : isToday ? 'bg-on-accent' : past ? 'bg-faint' : 'bg-herb',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-1 pt-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded bg-herb-soft" />
          Planning window · {horizonDays} {horizonDays === 1 ? 'day' : 'days'}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-herb" />
          Planned
        </span>
      </div>
    </div>
  );
}
