import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../api/client';
import type { MealPlanEntry, MealType, Place, Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { entryLabel, formatTime, isPlanned } from '../utils/planEntry';
import PlaceActions from '../components/PlaceActions';
import { Button, Card, Chip, cx, EmptyState, ErrorText, Field, IconButton, Input, NumberInput, Sheet } from '../components/ui';
import { CalendarIcon, CartIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, StoreIcon, TrashIcon } from '../components/icons';

const BASE_MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER'];
const ALL_MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}
function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -d.getDay());
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function titleCase(v: string): string {
  return v.charAt(0) + v.slice(1).toLowerCase();
}

export default function MealPlanPage() {
  const { activeHouseholdId, activeHousehold } = useHousehold();
  // The week is the working view; the calendar is for looking back over what you ate.
  const [mode, setMode] = useState<'week' | 'calendar'>('week');
  const [confirmingWeek, setConfirmingWeek] = useState(false);
  const [addingWeek, setAddingWeek] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const range = useMemo(() => {
    if (mode === 'week') return { start: weekStart, end: addDays(weekStart, 6) };
    const first = startOfMonth(monthCursor);
    const gridStart = addDays(first, -first.getDay());
    const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    return { start: gridStart, end: addDays(last, 6 - last.getDay()) };
  }, [mode, weekStart, monthCursor]);

  const refresh = useCallback(async () => {
    if (!activeHouseholdId) return;
    setEntries(
      await api<MealPlanEntry[]>(
        'GET',
        `/api/households/${activeHouseholdId}/meal-plan?start=${isoDate(range.start)}&end=${isoDate(range.end)}`,
      ),
    );
  }, [activeHouseholdId, range.start, range.end]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeHouseholdId) return;
    api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`).then(setRecipes);
  }, [activeHouseholdId]);

  const byDate = useMemo(() => {
    const map = new Map<string, MealPlanEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [entries]);

  if (!activeHouseholdId) {
    return (
      <Card>
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  const today = startOfDay(new Date());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  async function addRangeToList(start: Date, end: Date) {
    await api('POST', `/api/households/${activeHouseholdId}/grocery-list/add-all?start=${isoDate(start)}&end=${isoDate(end)}`);
  }

  const weekEnd = addDays(weekStart, 6);
  const weekWeight = weigh(
    entries.filter((e) => e.date >= isoDate(weekStart) && e.date <= isoDate(weekEnd)),
    recipes,
  );

  return (
    <div className="space-y-4">
      {confirmingWeek && (
        <ConfirmAddToGroceries
          what="this week"
          meals={weekWeight.meals}
          ingredients={weekWeight.ingredients}
          busy={addingWeek}
          onCancel={() => setConfirmingWeek(false)}
          onConfirm={async () => {
            setAddingWeek(true);
            try {
              await addRangeToList(weekStart, weekEnd);
              setConfirmingWeek(false);
            } finally {
              setAddingWeek(false);
            }
          }}
        />
      )}

      <div className="flex items-center gap-1">
        <IconButton
          label={mode === 'week' ? 'Previous week' : 'Previous month'}
          onClick={() =>
            mode === 'week'
              ? setWeekStart((w) => addDays(w, -7))
              : setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
          }
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </IconButton>

        <h1 className="flex-1 text-center font-semibold">
          {mode === 'week'
            ? `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h1>

        <IconButton
          label={mode === 'week' ? 'Next week' : 'Next month'}
          onClick={() =>
            mode === 'week'
              ? setWeekStart((w) => addDays(w, 7))
              : setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
          }
        >
          <ChevronRightIcon className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setWeekStart(startOfWeek(new Date()));
            setMonthCursor(startOfMonth(new Date()));
            setMode('week');
          }}
        >
          This week
        </Button>
        <Button
          variant={mode === 'calendar' ? 'primary' : 'secondary'}
          className="flex-1"
          onClick={() => setMode(mode === 'calendar' ? 'week' : 'calendar')}
        >
          <CalendarIcon className="h-5 w-5" />
          Calendar
        </Button>
      </div>

      {mode === 'week' ? (
        <>
          {/* Seven across, so the week reads as a week. Detail lives in the day sheet. */}
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const key = isoDate(day);
              const planned = (byDate.get(key) ?? []).filter(isPlanned);
              const isToday = key === isoDate(today);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOpenDay(key)}
                  className={cx(
                    'flex min-h-28 flex-col items-center rounded-xl border p-1.5 text-left transition-colors',
                    isToday ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface hover:bg-elevated',
                  )}
                >
                  <span className={cx('text-[0.7rem] font-medium', isToday ? 'text-accent' : 'text-muted')}>
                    {WEEKDAY_LABELS[day.getDay()]}
                  </span>
                  <span
                    className={cx(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                      isToday ? 'bg-accent text-accent-ink' : 'text-ink',
                    )}
                  >
                    {day.getDate()}
                  </span>

                  {/* Phones get dots — a recipe name is unreadable in a seventh of the screen. */}
                  <span className="mt-1.5 flex flex-wrap items-center justify-center gap-0.5 sm:hidden">
                    {planned.slice(0, 4).map((e) => (
                      <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-accent" />
                    ))}
                  </span>

                  <span className="mt-1 hidden min-w-0 flex-1 flex-col gap-0.5 self-stretch sm:flex">
                    {planned.slice(0, 3).map((e) => (
                      <span key={e.id} className="truncate text-[11px] leading-tight text-muted">
                        {entryLabel(e)}
                        {e.time && <span className="text-muted"> · {formatTime(e.time)}</span>}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {/* The names the strip can no longer show, for the days that have any. */}
          <ul className="space-y-2 sm:hidden">
            {weekDays
              .map((day) => ({ day, planned: (byDate.get(isoDate(day)) ?? []).filter(isPlanned) }))
              .filter(({ planned }) => planned.length > 0)
              .map(({ day, planned }) => (
                <li key={isoDate(day)}>
                  <button
                    type="button"
                    onClick={() => setOpenDay(isoDate(day))}
                    className="flex w-full items-baseline gap-3 rounded-xl border border-line bg-surface p-3 text-left"
                  >
                    <span className="w-10 shrink-0 text-sm font-medium text-muted">
                      {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                    <span className="min-w-0 flex-1">
                      {planned.map((e) => (
                        <span key={e.id} className="block truncate text-sm">
                          <span className="text-muted">{titleCase(e.mealType)}</span> · {entryLabel(e)}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
          </ul>

          {/* Secondary, not filled: a filled button at the bottom of a screen reads as "save",
              and this one has a side effect on a different page entirely. */}
          <Button full variant="secondary" onClick={() => setConfirmingWeek(true)}>
            <CartIcon className="h-5 w-5" />
            Add this week to Groceries
          </Button>
        </>
      ) : (
        <CalendarGrid
          monthCursor={monthCursor}
          byDate={byDate}
          today={today}
          onPick={(key) => setOpenDay(key)}
        />
      )}

      {openDay && (
        <DaySheet
          date={openDay}
          householdId={activeHouseholdId}
          recipes={recipes}
          entries={byDate.get(openDay) ?? []}
          defaultServings={activeHousehold?.defaultServings ?? 4}
          onChanged={refresh}
          onAddToList={() => addRangeToList(new Date(`${openDay}T00:00:00`), new Date(`${openDay}T00:00:00`))}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  );
}

/** Read-only overview: which days have meals on them. Tapping still opens the day. */
function CalendarGrid({
  monthCursor,
  byDate,
  today,
  onPick,
}: {
  monthCursor: Date;
  byDate: Map<string, MealPlanEntry[]>;
  today: Date;
  onPick: (key: string) => void;
}) {
  const first = startOfMonth(monthCursor);
  const gridStart = addDays(first, -first.getDay());
  const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const gridEnd = addDays(last, 6 - last.getDay());

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  return (
    <Card bodyClassName="px-2 pb-2 sm:px-4 sm:pb-4">
      <div className="mb-1 grid grid-cols-7">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className="py-1 text-center text-xs font-semibold text-subtle">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = isoDate(day);
          const planned = (byDate.get(key) ?? []).filter(isPlanned);
          const inMonth = day.getMonth() === monthCursor.getMonth();
          const isToday = key === isoDate(today);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              className={cx(
                'flex aspect-square flex-col items-center rounded-xl p-1 transition-colors hover:bg-elevated',
                !inMonth && 'opacity-35',
              )}
            >
              <span
                className={cx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium',
                  isToday ? 'bg-accent text-accent-ink' : 'text-ink',
                )}
              >
                {day.getDate()}
              </span>
              <span className="mt-1 flex flex-wrap items-center justify-center gap-0.5">
                {planned.slice(0, 4).map((e) => (
                  <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-accent" />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function DaySheet({
  date,
  householdId,
  recipes,
  entries,
  defaultServings,
  onChanged,
  onAddToList,
  onClose,
}: {
  date: string;
  householdId: string;
  recipes: Recipe[];
  entries: MealPlanEntry[];
  defaultServings: number;
  onChanged: () => Promise<void>;
  onAddToList: () => Promise<void>;
  onClose: () => void;
}) {
  // entryId set => swapping that dish; null => adding another one alongside.
  const [picking, setPicking] = useState<{ meal: MealType; entryId: string | null } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  // Lives here, not in the picker, so it survives switching tabs while deciding.
  const [outTime, setOutTime] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [extraMeals, setExtraMeals] = useState<MealType[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const label = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    api<Place[]>('GET', `/api/households/${householdId}/places`).then(setPlaces).catch(() => setPlaces([]));
  }, [householdId]);

  // The three staples, plus any other slot that already has something in it.
  const slots = ALL_MEALS.filter(
    (m) => BASE_MEALS.includes(m) || extraMeals.includes(m) || entries.some((e) => e.mealType === m),
  );
  const missing = ALL_MEALS.filter((m) => !slots.includes(m));

  async function choose(recipe: Recipe) {
    if (!picking) return;
    setBusy(true);
    setError(null);
    try {
      if (picking.entryId) {
        await api('PATCH', `/api/households/${householdId}/meal-plan/entries/${picking.entryId}`, {
          recipeId: recipe.id,
        });
      } else {
        await api('POST', `/api/households/${householdId}/meal-plan/entries`, {
          date,
          mealType: picking.meal,
          recipeId: recipe.id,
          servings: defaultServings,
        });
      }
      await onChanged();
      setPicking(null);
      setExpanded(null);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "That's already on this meal."
          : 'Could not add that.',
      );
    } finally {
      setBusy(false);
    }
  }

  /** Typing a name that is not saved yet creates the place, the way a new category works. */
  async function choosePlace(place: Place | { name: string }) {
    if (!picking) return;
    setBusy(true);
    setError(null);
    try {
      const saved =
        'id' in place
          ? place
          : await api<Place>('POST', `/api/households/${householdId}/places`, { name: place.name });
      if (!('id' in place)) {
        setPlaces((all) => (all.some((p) => p.id === saved.id) ? all : [...all, saved].sort((a, b) => a.name.localeCompare(b.name))));
      }
      if (picking.entryId) {
        await api('PATCH', `/api/households/${householdId}/meal-plan/entries/${picking.entryId}`, {
          placeId: saved.id,
          time: outTime || null,
          clearTime: !outTime,
        });
      } else {
        await api('POST', `/api/households/${householdId}/meal-plan/entries`, {
          date,
          mealType: picking.meal,
          placeId: saved.id,
          time: outTime || null,
        });
      }
      await onChanged();
      setPicking(null);
      setExpanded(null);
      setOutTime('');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409 ? "That's already on this meal." : 'Could not add that.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function setTime(entry: MealPlanEntry, time: string) {
    setBusy(true);
    try {
      await api('PATCH', `/api/households/${householdId}/meal-plan/entries/${entry.id}`, {
        time: time || null,
        clearTime: !time,
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function setServings(entry: MealPlanEntry, servings: number) {
    setBusy(true);
    try {
      await api('PATCH', `/api/households/${householdId}/meal-plan/entries/${entry.id}`, { servings });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: MealPlanEntry) {
    setBusy(true);
    try {
      await api('DELETE', `/api/households/${householdId}/meal-plan/${entry.id}`);
      await onChanged();
      setExpanded(null);
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    const w = weigh(entries, recipes);
    return (
      <ConfirmAddToGroceries
        what={`on ${label}`}
        meals={w.meals}
        ingredients={w.ingredients}
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await onAddToList();
            setConfirming(false);
            setAdded(true);
            setTimeout(() => setAdded(false), 2000);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  if (picking) {
    return (
      <Sheet title={`${titleCase(picking.meal)} · ${label}`} onClose={() => setPicking(null)}>
        {error && <div className="mb-3"><ErrorText>{error}</ErrorText></div>}
        <PickerTabs
          recipes={recipes}
          places={places}
          disabled={busy}
          time={outTime}
          onTimeChange={setOutTime}
          onPickRecipe={choose}
          onPickPlace={choosePlace}
        />
      </Sheet>
    );
  }

  return (
    <Sheet title={label} onClose={onClose}>
      <ul className="space-y-2">
        {slots.map((meal) => {
          // A slot is a whole meal: a main, its sides, or just the one side you fancied.
          const dishes = entries.filter((e) => e.mealType === meal && isPlanned(e));

          return (
            <li key={meal} className="rounded-xl border border-line">
              <div className="flex items-center justify-between gap-2 px-3 pt-2">
                <span className="text-sm font-medium text-muted">{titleCase(meal)}</span>
                <Button size="sm" variant="ghost" onClick={() => setPicking({ meal, entryId: null })}>
                  <PlusIcon className="h-4 w-4" />
                  {dishes.length ? 'Add side' : 'Add'}
                </Button>
              </div>

              {dishes.length === 0 ? (
                <p className="px-3 pb-3 text-sm text-subtle">Nothing yet</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {dishes.map((entry) => {
                    const open = expanded === entry.id;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : entry.id)}
                          className="flex min-h-touch w-full items-center gap-3 px-3 py-2.5 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {entryLabel(entry)}
                              {entry.time && (
                                <span className="font-normal text-muted"> · {formatTime(entry.time)}</span>
                              )}
                            </span>
                            {entry.recipeId && entry.servings ? (
                              <span className="block text-sm text-muted">Serves {entry.servings}</span>
                            ) : null}
                          </span>
                        </button>

                        {open && (
                          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
                            <Button size="sm" variant="secondary" onClick={() => setPicking({ meal, entryId: entry.id })}>
                              Change
                            </Button>
                            {entry.recipeId && (
                              <Link to={`/recipes/${entry.recipeId}`}>
                                <Button size="sm" variant="secondary">
                                  View recipe
                                </Button>
                              </Link>
                            )}
                            {entry.placeId && <PlaceActions place={places.find((p) => p.id === entry.placeId)} />}
                            {entry.placeId && (
                              <Input
                                type="time"
                                className="w-32"
                                // The server sends "17:00:00"; a time input wants "17:00".
                                value={entry.time?.slice(0, 5) ?? ''}
                                disabled={busy}
                                onChange={(e) => setTime(entry, e.target.value)}
                                aria-label="Time"
                              />
                            )}
                            {/* Servings are about cooking; nobody portions a takeaway in the app. */}
                            {entry.recipeId && (
                              <ServingsControl
                                value={entry.servings ?? defaultServings}
                                disabled={busy}
                                onChange={(v) => setServings(entry, v)}
                              />
                            )}
                            <IconButton label="Remove dish" disabled={busy} onClick={() => remove(entry)}>
                              <TrashIcon className="h-5 w-5" />
                            </IconButton>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {missing.length > 0 && (
        <Button variant="ghost" full className="mt-2" onClick={() => setExtraMeals((m) => [...m, missing[0]])}>
          <PlusIcon className="h-5 w-5" />
          Add {titleCase(missing[0])}
        </Button>
      )}

      {/* The bottom of a sheet is where "done" lives, so this cannot look like the filled
          primary action — people press it reflexively on the way out. It is a side trip to
          another page, and it is labelled and weighted as one. */}
      <Button full variant="secondary" className="mt-4" disabled={busy} onClick={() => setConfirming(true)}>
        <CartIcon className="h-5 w-5" />
        {added ? 'Added to Groceries' : 'Add this day to Groceries'}
      </Button>
    </Sheet>
  );
}

function ServingsControl({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(value);

  return (
    <span className="flex items-center gap-1">
      <NumberInput
        min={1}
        className="w-16"
        value={draft}
        onChange={setDraft}
        aria-label="Servings"
        disabled={disabled}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || draft === null || draft === value}
        onClick={() => draft !== null && onChange(draft)}
      >
        Set
      </Button>
    </span>
  );
}

/**
 * Cook something, or go out. Two tabs rather than one merged list: when you have decided you are
 * not cooking tonight, scrolling past forty recipes to reach "Chinese" is the wrong shape.
 */
/**
 * Adding a week of meals writes a lot of rows to a page you are not looking at, and undoing it
 * means ticking or deleting each item by hand. People were flooding their list by catching the
 * button on the way past, so it asks first — and says how much is about to arrive.
 */
function ConfirmAddToGroceries({
  what,
  meals,
  ingredients,
  busy,
  onConfirm,
  onCancel,
}: {
  what: string;
  meals: number;
  ingredients: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet title="Add to Groceries" onClose={onCancel}>
      <div className="space-y-4">
        {meals === 0 ? (
          <EmptyState>Nothing is planned {what}, so there is nothing to add.</EmptyState>
        ) : (
          <p className="text-muted">
            This puts the ingredients from{' '}
            <span className="font-medium text-ink">
              {meals} {meals === 1 ? 'meal' : 'meals'}
            </span>{' '}
            {what} into your grocery list — up to{' '}
            <span className="font-medium text-ink">{ingredients}</span>{' '}
            {ingredients === 1 ? 'item' : 'items'}. Fewer, where they merge with something already
            on the list or you have marked them as always in.
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy || meals === 0} onClick={onConfirm}>
            <CartIcon className="h-5 w-5" />
            {busy ? 'Adding…' : 'Add them'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** How much a set of planned meals would put on the list, for the confirmation to quote. */
function weigh(entries: MealPlanEntry[], recipes: Recipe[]): { meals: number; ingredients: number } {
  // Places contribute nothing — there is no shopping to do for a restaurant.
  const cooked = entries.filter((e) => e.recipeId);
  const count = cooked.reduce(
    (n, e) => n + (recipes.find((r) => r.id === e.recipeId)?.ingredients.length ?? 0),
    0,
  );
  return { meals: cooked.length, ingredients: count };
}

function PickerTabs({
  recipes,
  places,
  disabled,
  time,
  onTimeChange,
  onPickRecipe,
  onPickPlace,
}: {
  recipes: Recipe[];
  places: Place[];
  disabled: boolean;
  time: string;
  onTimeChange: (time: string) => void;
  onPickRecipe: (recipe: Recipe) => void;
  onPickPlace: (place: Place | { name: string }) => void;
}) {
  const [tab, setTab] = useState<'cook' | 'out'>('cook');

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          variant={tab === 'cook' ? 'primary' : 'secondary'}
          className="flex-1"
          onClick={() => setTab('cook')}
        >
          Cook something
        </Button>
        <Button
          variant={tab === 'out' ? 'primary' : 'secondary'}
          className="flex-1"
          onClick={() => setTab('out')}
        >
          Eat out
        </Button>
      </div>

      {tab === 'cook' ? (
        <RecipePicker recipes={recipes} onPick={onPickRecipe} disabled={disabled} />
      ) : (
        <PlacePicker
          places={places}
          onPick={onPickPlace}
          disabled={disabled}
          time={time}
          onTimeChange={onTimeChange}
        />
      )}
    </div>
  );
}

function PlacePicker({
  places,
  onPick,
  disabled,
  time,
  onTimeChange,
}: {
  places: Place[];
  onPick: (place: Place | { name: string }) => void;
  disabled: boolean;
  time: string;
  onTimeChange: (time: string) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim();
  const shown = places.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  // Only offer to create when nothing already has that exact name.
  const canCreate = q.length > 0 && !places.some((p) => p.name.toLowerCase() === q.toLowerCase());

  return (
    <div className="space-y-3">
      <Input
        type="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Tony's, Chinese, pizza…"
        aria-label="Search places"
      />

      {/* Filled in before picking, so booking a table is one screen and not an extra step. */}
      <Field label="Time" hint="Optional — for a booking or a pickup slot.">
        <div className="flex gap-2">
          <Input
            type="time"
            className="w-40"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            aria-label="Time"
          />
          {time && (
            <Button type="button" variant="ghost" onClick={() => onTimeChange('')}>
              Clear
            </Button>
          )}
        </div>
      </Field>

      {canCreate && (
        <Button full disabled={disabled} onClick={() => onPick({ name: q })}>
          <PlusIcon className="h-5 w-5" />
          Add “{q}”
        </Button>
      )}

      {shown.length === 0 && !canCreate ? (
        <EmptyState>Nowhere saved yet — type a name to add one.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(place)}
                className="flex min-h-touch w-full items-center gap-3 py-2.5 text-left"
              >
                {place.imageId ? (
                  <img src={imageUrl(place.imageId)} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <StoreIcon className="h-5 w-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{place.name}</span>
                  {place.notes && <span className="block truncate text-sm text-muted">{place.notes}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecipePicker({
  recipes,
  onPick,
  disabled,
}: {
  recipes: Recipe[];
  onPick: (recipe: Recipe) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  // Filing categories double as the "mains vs sides" filter — no separate concept needed.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) for (const c of r.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.keys()].sort((a, b) => a.localeCompare(b));
  }, [recipes]);

  const q = query.trim().toLowerCase();
  const shown = recipes
    .filter((r) => (!category || r.categories.includes(category)) && (!q || r.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      <Input
        type="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search recipes"
        aria-label="Search recipes"
      />

      {categories.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip active={!category} onClick={() => setCategory(null)}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {c}
            </Chip>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState>No recipes match.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(r)}
                className="flex min-h-touch w-full items-center justify-between gap-3 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.name}</span>
                  {r.categories.length > 0 && (
                    <span className="block truncate text-sm text-muted">{r.categories.join(' · ')}</span>
                  )}
                </span>
                <span className="shrink-0 text-sm text-muted">Serves {r.servings}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
