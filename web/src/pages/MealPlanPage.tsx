import { useCallback, useEffect, useMemo, useState } from 'react';
import NoHousehold from '../components/NoHousehold';
import { api } from '../api/client';
import type { MealPlanEntry, MealType, Place, Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { isPlanned } from '../utils/planEntry';
import { useMediaQuery } from '../utils/useMediaQuery';
import { useOnResume } from '../utils/useOnResume';
import { PageTitle } from '../components/PageTitle';
import { toast } from '../components/toast';
import { Button, Card, EmptyState, Segmented } from '../components/ui';
import AddToGroceriesSheet from '../components/plan/AddToGroceriesSheet';
import DaySheet from '../components/plan/DaySheet';
import PlanCalendar from '../components/plan/PlanCalendar';
import { DayBlock } from '../components/plan/PlanDays';
import WindowCard from '../components/plan/WindowCard';
import { addDaysToGroceries, addMealToGroceries, planRange, shoppingFor } from '../components/plan/planApi';
import {
  addDays,
  contributes,
  isoDate,
  startOfDay,
  startOfMonth,
  type ShoppingMap,
  type Slot,
} from '../components/plan/planModel';

type View = 'calendar' | 'upcoming';

/** Which view was open last, so coming back to the tab lands where you were. */
const VIEW_KEY = 'mp_planView';

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'upcoming' ? 'upcoming' : 'calendar';
  } catch {
    return 'calendar';
  }
}

/**
 * The Plan, the app's home (the mockup's 2.1 and 2.2). Two views of the same meals:
 *
 * Calendar comes first — the month with the planning window tinted and a dot on every planned
 * day, then the next few planned days underneath ("Coming up"). Upcoming is the shopping view —
 * the planning window as one card with the one big action, putting it on the grocery list, then
 * only the days that have something planned, each meal saying where it stands with the shopping.
 *
 * Tapping a day, on either, opens the day sheet; long-pressing a meal opens its options.
 */
export default function MealPlanPage() {
  const { activeHouseholdId, activeHousehold } = useHousehold();
  const [view, setViewState] = useState<View>(savedView);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [shopping, setShopping] = useState<ShoppingMap | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState<{ date: string; meal?: MealType; options?: string } | null>(null);
  // The planning window's meals, loaded fresh when "Add … to groceries" is pressed.
  const [adding, setAdding] = useState<{ entries: MealPlanEntry[]; shopping: ShoppingMap | null } | null>(null);
  const [addingBusy, setAddingBusy] = useState(false);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // A private window: it just opens on Calendar next time.
    }
  };

  const horizonDays = activeHousehold?.planningHorizonDays ?? 7;
  const defaultServings = activeHousehold?.defaultServings ?? 4;
  const today = startOfDay(new Date());
  const horizonEnd = addDays(today, horizonDays - 1);

  /*
   * One load covers the whole page: the month on screen (Monday-first, and run on to the end
   * of the planning window when it spills into next month), and the window itself, which runs
   * from today and can start before this month's grid or end after it.
   */
  const range = useMemo(() => {
    const first = startOfMonth(monthCursor);
    const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const from = startOfDay(new Date());
    const to = addDays(from, horizonDays - 1);
    const gridEnd = addDays(to > last ? to : last, 6);
    return { start: first < from ? first : from, end: gridEnd > to ? gridEnd : to };
  }, [monthCursor, horizonDays]);

  const refresh = useCallback(async () => {
    if (!activeHouseholdId) return;
    const [list, status] = await Promise.all([
      planRange(activeHouseholdId, range.start, range.end),
      shoppingFor(activeHouseholdId, range.start, range.end),
    ]);
    setEntries(list);
    setShopping(status);
    setLoaded(true);
  }, [activeHouseholdId, range.start, range.end]);

  useEffect(() => {
    refresh().catch(() => setLoaded(true));
  }, [refresh]);

  const loadRecipes = useCallback(async () => {
    if (!activeHouseholdId) return;
    setRecipes(await api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`));
  }, [activeHouseholdId]);

  const loadPlaces = useCallback(async () => {
    if (!activeHouseholdId) return;
    setPlaces(await api<Place[]>('GET', `/api/households/${activeHouseholdId}/places`));
  }, [activeHouseholdId]);

  useEffect(() => {
    loadRecipes().catch(() => setRecipes([]));
    loadPlaces().catch(() => setPlaces([]));
  }, [loadRecipes, loadPlaces]);

  // Someone may have planned from another phone while this tab sat in the background.
  useOnResume(() => {
    refresh().catch(() => {});
    loadRecipes().catch(() => {});
    loadPlaces().catch(() => {});
  });

  /*
   * Tailwind's lg: — a computer, or a tablet on its side, where each month square has room for
   * what is planned on it rather than only a dot. Not md:, because most phones turned sideways
   * are wider than 768px and their squares are still a phone's.
   */
  const wide = useMediaQuery('(min-width: 1024px)');

  const byDate = useMemo(() => {
    const map = new Map<string, MealPlanEntry[]>();
    for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [entries]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  /*
   * A plan entry names its recipe or restaurant but not its picture. The recipe and place lists
   * this page already loads have the covers; a planned saved link brings its own. Keyed by
   * either id (all UUIDs, so they cannot collide). A phone shows them too: the same recipe
   * wearing its photo in Fill a slot and a drawn plate on the plan read as two different dinners.
   * They are lazy, so only the rows on screen fetch theirs.
   */
  const pictures = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of recipes) if (r.coverImageId) map.set(r.id, r.coverImageId);
    for (const p of places) if (p.imageId) map.set(p.id, p.imageId);
    for (const e of entries) if (e.savedLinkId && e.savedLinkImageId) map.set(e.savedLinkId, e.savedLinkImageId);
    return map;
  }, [recipes, places, entries]);

  if (!activeHouseholdId) {
    return (
      <Card>
        <NoHousehold />
      </Card>
    );
  }

  const viewingThisMonth = monthCursor.getMonth() === today.getMonth() && monthCursor.getFullYear() === today.getFullYear();

  /*
   * The days with something on them. From today on — what you still have to cook — when looking
   * at this month or Upcoming; on any other month, that whole month, which is how you look back
   * at what you ate (or ahead at what is booked).
   */
  const plannedDays = (from: Date, to: Date) => {
    const days: Date[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if ((byDate.get(isoDate(d)) ?? []).some(isPlanned)) days.push(d);
    }
    return days;
  };
  const monthLast = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const comingUp = viewingThisMonth
    ? plannedDays(today, horizonEnd > monthLast ? horizonEnd : monthLast)
    : plannedDays(startOfMonth(monthCursor), monthLast);
  const upcoming = plannedDays(today, range.end);

  async function openAddWindow() {
    if (!activeHouseholdId) return;
    const [list, status] = await Promise.all([
      planRange(activeHouseholdId, today, horizonEnd),
      shoppingFor(activeHouseholdId, today, horizonEnd),
    ]);
    setAdding({ entries: list, shopping: status });
  }

  /** "+ Add" beside "Not on list": just that meal's cooking, the way its own button does it. */
  async function addSlot(slot: Slot) {
    if (!activeHouseholdId) return;
    try {
      for (const d of slot.dishes.filter(contributes)) await addMealToGroceries(activeHouseholdId, d.id);
      await refresh();
      toast(`${slot.meal.charAt(0)}${slot.meal.slice(1).toLowerCase()} added to groceries`, { icon: 'cart' });
    } catch {
      toast('Could not add that to Groceries.');
    }
  }

  const dayBlock = (d: Date) => (
    <DayBlock
      key={isoDate(d)}
      day={d}
      today={today}
      entries={byDate.get(isoDate(d)) ?? []}
      recipes={recipeById}
      places={placeById}
      pictures={pictures}
      shopping={shopping}
      onOpen={(slot) => setOpen({ date: isoDate(d), meal: slot.meal })}
      onOptions={(slot) => setOpen({ date: isoDate(d), meal: slot.meal, options: slot.dishes[0].id })}
      onAdd={addSlot}
    />
  );

  const windowWord = horizonDays === 7 ? '7 days' : `${horizonDays} ${horizonDays === 1 ? 'day' : 'days'}`;

  return (
    <div className="flex flex-col gap-3.5">
      {/* The views' switch sits right under the title (its 12px and 2px more), not a full gap
          further down, so more of the month and Coming up fits on a phone. */}
      <div>
        <PageTitle
          title="Plan"
          over={today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        />
        <Segmented
          label="Plan view"
          value={view}
          onChange={setView}
          options={[
            { value: 'calendar', label: 'Calendar' },
            { value: 'upcoming', label: 'Upcoming' },
          ]}
          className="mt-0.5 lg:max-w-sm"
        />
      </div>

      {view === 'calendar' ? (
        <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <PlanCalendar
            monthCursor={monthCursor}
            byDate={byDate}
            today={today}
            horizonDays={horizonDays}
            recipes={recipeById}
            pictures={wide ? pictures : null}
            onMonth={(delta) => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))}
            onToday={() => setMonthCursor(startOfMonth(new Date()))}
            onPick={(key) => setOpen({ date: key })}
          />
          <section className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-3 pt-2 lg:pt-0">
              <h2 className="title-section">
                {viewingThisMonth
                  ? 'Coming up'
                  : monthCursor.toLocaleDateString(undefined, { month: 'long', year: monthCursor.getFullYear() === today.getFullYear() ? undefined : 'numeric' })}
              </h2>
              {/* Plan → Groceries. It covers the planning window — the days being shopped for —
                  not whichever month is on screen. */}
              <Button size="sm" variant="soft" icon="cart" onClick={openAddWindow} aria-label={`Add the next ${windowWord} to groceries`}>
                Add {windowWord}
              </Button>
            </div>
            {comingUp.length === 0 ? (
              <EmptyState>
                {!loaded
                  ? 'Loading…'
                  : viewingThisMonth
                    ? 'Nothing planned from today on. Tap a day to start.'
                    : monthCursor < today
                      ? `Nothing was planned in ${monthCursor.toLocaleDateString(undefined, { month: 'long' })}.`
                      : `Nothing planned in ${monthCursor.toLocaleDateString(undefined, { month: 'long' })} yet. Tap a day to start.`}
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-3.5">{comingUp.map(dayBlock)}</div>
            )}
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          <div className="lg:sticky lg:top-24">
            <WindowCard
              today={today}
              horizonDays={horizonDays}
              byDate={byDate}
              shopping={shopping}
              onPick={(key) => setOpen({ date: key })}
              onAdd={openAddWindow}
            />
          </div>
          <div className="flex flex-col gap-4">
            {upcoming.length === 0 ? (
              <EmptyState>{loaded ? 'Nothing planned from today on. Tap a day above to start.' : 'Loading…'}</EmptyState>
            ) : (
              upcoming.map(dayBlock)
            )}
          </div>
        </div>
      )}

      {open && (
        <DaySheet
          key={`${open.date}:${open.options ?? ''}`}
          date={open.date}
          householdId={activeHouseholdId}
          entries={byDate.get(open.date) ?? []}
          recipes={recipes}
          places={places}
          pictures={pictures}
          shopping={shopping}
          defaultServings={defaultServings}
          initialMeal={open.meal}
          optionsOnly={open.options}
          onChanged={refresh}
          onRecipeCreated={(recipe) => setRecipes((all) => [...all, recipe])}
          onPlacesChanged={setPlaces}
          onClose={() => setOpen(null)}
        />
      )}

      {adding && (
        <AddToGroceriesSheet
          entries={adding.entries}
          shopping={adding.shopping}
          busy={addingBusy}
          onClose={() => setAdding(null)}
          onConfirm={async (dates) => {
            setAddingBusy(true);
            try {
              await addDaysToGroceries(activeHouseholdId, dates);
              setAdding(null);
              await refresh();
              toast(`Added ${dates.length} ${dates.length === 1 ? 'day' : 'days'} to groceries`, { icon: 'cart' });
            } catch {
              toast('Could not add that to Groceries.');
            } finally {
              setAddingBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
