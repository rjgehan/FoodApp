import { useRef } from 'react';
import type { MealPlanEntry, Place, Recipe } from '../../api/types';
import { entryLabel } from '../../utils/planEntry';
import { Icon } from '../icons';
import { Pill } from '../ui';
import MealPicture from './MealPicture';
import { isoDate, mealTitle, sidesLine, slotMark, slotsOf, slotTime, timeOf, type ShoppingMap, type Slot } from './planModel';

/**
 * One planned day in a list (the mockup's dayBlock): the day on the left — "TODAY 29", "WED
 * 30" — and its meals in one card on the right, each with its picture, its sides and what it
 * means for the shopping. Only days with something on them are drawn; the calendar is where an
 * empty day gets filled.
 */
export function DayBlock({
  day,
  today,
  entries,
  recipes,
  places,
  pictures,
  shopping,
  onOpen,
  onOptions,
  onAdd,
}: {
  day: Date;
  today: Date;
  entries: MealPlanEntry[];
  recipes: Map<string, Recipe>;
  places: Map<string, Place>;
  pictures: Map<string, string> | null;
  shopping: ShoppingMap | null;
  /** Opens the day sheet on this slot. */
  onOpen: (slot: Slot) => void;
  /** Long-press: the main dish's options. */
  onOptions: (slot: Slot) => void;
  /** "+ Add" beside "Not on list". */
  onAdd: (slot: Slot) => void;
}) {
  const slots = slotsOf(entries);
  const isToday = isoDate(day) === isoDate(today);
  return (
    <section
      className="flex items-start gap-2"
      aria-label={day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
    >
      <div className="flex w-11 shrink-0 flex-col items-center pt-2.5">
        <span className="text-[0.6875rem] font-semibold uppercase text-muted">
          {isToday ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' })}
        </span>
        <span className="serif text-[1.375rem] leading-tight">{day.getDate()}</span>
      </div>
      <ul className="card card-rows min-w-0 flex-1">
        {slots.map((slot, i) => (
          <li key={slot.meal} className="relative">
            {/* The hairline between meals starts where the words do, as the mockup's does. */}
            {i > 0 && <span aria-hidden="true" className="absolute left-[76px] right-0 top-0 border-t border-line" />}
            <SlotRow
              slot={slot}
              recipes={recipes}
              places={places}
              pictures={pictures}
              shopping={shopping}
              onOpen={() => onOpen(slot)}
              onOptions={() => onOptions(slot)}
              onAdd={() => onAdd(slot)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SlotRow({
  slot,
  recipes,
  places,
  pictures,
  shopping,
  onOpen,
  onOptions,
  onAdd,
}: {
  slot: Slot;
  recipes: Map<string, Recipe>;
  places: Map<string, Place>;
  pictures: Map<string, string> | null;
  shopping: ShoppingMap | null;
  onOpen: () => void;
  onOptions: () => void;
  onAdd: () => void;
}) {
  const main = slot.dishes[0];
  const time = slotTime(timeOf(slot.dishes));
  const mark = slotMark(slot.dishes, shopping);
  const place = main.placeId ? places.get(main.placeId) : undefined;
  const second = main.placeId ? place?.notes || null : sidesLine(slot.dishes);
  const press = useLongPress(onOptions);

  return (
    // The whole row opens the day; the "+ Add" beside "Not on list" sits above that button, so
    // the two are siblings rather than a button inside a button.
    <div className="relative flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={() => {
          if (press.fired()) return;
          onOpen();
        }}
        onContextMenu={(e) => {
          // A right click on a computer is the long-press of a phone.
          e.preventDefault();
          onOptions();
        }}
        {...press.handlers}
        aria-label={`${mealTitle(slot.meal)}: ${entryLabel(main)}`}
        className="press absolute inset-0 [-webkit-touch-callout:none] active:bg-surface2"
      />
      <MealPicture
        entry={main}
        recipe={main.recipeId ? recipes.get(main.recipeId) : undefined}
        pictures={pictures}
        size={52}
        className="pointer-events-none relative"
      />
      <span className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-muted">
          {mealTitle(slot.meal)}
          {time && ` · ${time}`}
        </span>
        <span className="truncate text-[0.9375rem] font-semibold">{entryLabel(main)}</span>
        {second && <span className="truncate text-[0.8125rem] text-muted">{second}</span>}
        {mark && (
          <span className="flex items-center gap-1.5 pt-1">
            <Pill tone={mark.tone} icon={mark.icon}>
              {mark.label}
            </Pill>
            {mark.canAdd && (
              <button
                type="button"
                onClick={onAdd}
                aria-label={`Add ${mealTitle(slot.meal).toLowerCase()} to groceries`}
                className="press pointer-events-auto -my-1 flex h-7 items-center gap-0.5 rounded-full px-1.5 text-xs font-semibold text-accent-ink active:bg-surface2"
              >
                <Icon name="plus" size={12} strokeWidth={2.6} />
                Add
              </button>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Half a second's hold opens a meal's options, as the mockup asks ("long-press or …"). The tap
 * that ends a hold is swallowed, so letting go does not also open the day.
 */
function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    fired: () => {
      const was = fired.current;
      fired.current = false;
      return was;
    },
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(10);
          onLongPress();
        }, 500);
      },
      onPointerMove: (e: React.PointerEvent) => {
        // A scroll is not a hold.
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
    },
  };
}
