import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../api/client';
import type { CupboardItem, MealPlanEntry, MealType, Place, Recipe, RecipeSection } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { entryLabel, formatTime, isPlanned } from '../utils/planEntry';
import { useOnResume } from '../utils/useOnResume';
import { useAiAvailable } from '../utils/useAiAvailable';
import PlaceActions from '../components/PlaceActions';
import RecipeForm from '../components/RecipeForm';
import { WriteForMe } from '../components/RecipeWriter';
import { PasteFromChatGpt } from '../components/RecipePaste';
import { Button, Card, Chip, cx, EmptyState, ErrorText, Field, IconButton, Input, NumberInput, Sheet } from '../components/ui';
import { BookIcon, CalendarIcon, CartIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, StoreIcon, TrashIcon } from '../components/icons';

const BASE_MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER'];
const ALL_MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A recipe made from a slot is filed where you would go looking for it. */
const SECTION_FOR_MEAL: Record<MealType, RecipeSection> = {
  BREAKFAST: 'BREAKFAST',
  LUNCH: 'LUNCH',
  DINNER: 'DINNER',
  SNACK: 'SNACKS',
};

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

  const loadRecipes = useCallback(async () => {
    if (!activeHouseholdId) return;
    setRecipes(await api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`));
  }, [activeHouseholdId]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  // Someone may have planned from another phone while this tab sat in the background.
  useOnResume(() => {
    refresh().catch(() => {});
    loadRecipes().catch(() => {});
  });

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

  /*
   * The planning window from Settings, drawn on the week so "how far ahead do we plan" is
   * something you can see rather than a number buried in a form. It runs from today, so it
   * slides out of view as you page back and shrinks as the week runs out.
   */
  const horizonDays = activeHousehold?.planningHorizonDays ?? 7;
  const horizonEnd = addDays(today, horizonDays - 1);
  const inWindow = weekDays.map((d) => d >= today && d <= horizonEnd);
  const windowStart = inWindow.indexOf(true);
  const windowLength = inWindow.filter(Boolean).length;
  const weekEntries = entries.filter((e) => e.date >= isoDate(weekStart) && e.date <= isoDate(weekEnd));
  const awayFromToday =
    mode === 'week'
      ? isoDate(weekStart) !== isoDate(startOfWeek(today))
      : monthCursor.getMonth() !== today.getMonth() || monthCursor.getFullYear() !== today.getFullYear();

  return (
    <div className="space-y-4">
      {confirmingWeek && (
        <ConfirmAddToGroceries
          dates={contributingDates(weekEntries)}
          missing={missingIngredients(weekEntries)}
          items={singleItems(weekEntries)}
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
        {/* Only offered once you have paged away — on this week it would do nothing. */}
        {awayFromToday && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setWeekStart(startOfWeek(new Date()));
              setMonthCursor(startOfMonth(new Date()));
            }}
          >
            Today
          </Button>
        )}
        <IconButton
          label={mode === 'calendar' ? 'Show the week' : 'Show the month'}
          variant={mode === 'calendar' ? 'secondary' : 'ghost'}
          onClick={() => setMode(mode === 'calendar' ? 'week' : 'calendar')}
        >
          <CalendarIcon className="h-5 w-5" />
        </IconButton>
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

          {windowLength > 0 && (
            <div className="-mt-2">
              {/* The same seven-column grid, so the bracket lines up under the tiles.
                  gridColumn is inline because Tailwind cannot see a class it has to compute. */}
              <div className="grid grid-cols-7 gap-1">
                <div
                  style={{ gridColumn: `${windowStart + 1} / span ${windowLength}` }}
                  className="h-2 rounded-b-md border-x-2 border-b-2 border-accent/50"
                />
              </div>
              <p className="mt-1.5 text-center text-xs text-subtle">
                Planning {horizonDays} {horizonDays === 1 ? 'day' : 'days'} ahead — through{' '}
                {horizonEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            </div>
          )}

          {/* The names the strip can no longer show, for the days that have any. */}
          <ul className="divide-y divide-line sm:hidden">
            {weekDays
              .map((day) => ({ day, planned: (byDate.get(isoDate(day)) ?? []).filter(isPlanned) }))
              .filter(({ planned }) => planned.length > 0)
              .map(({ day, planned }) => (
                <li key={isoDate(day)}>
                  <button
                    type="button"
                    onClick={() => setOpenDay(isoDate(day))}
                    className="flex w-full items-baseline gap-3 py-2.5 text-left"
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
          <Button full variant="ghost" onClick={() => setConfirmingWeek(true)}>
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
          onRecipeCreated={(recipe) => setRecipes((all) => [...all, recipe])}
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
    <div>
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
    </div>
  );
}

function DaySheet({
  date,
  householdId,
  recipes,
  entries,
  defaultServings,
  onChanged,
  onRecipeCreated,
  onAddToList,
  onClose,
}: {
  date: string;
  householdId: string;
  recipes: Recipe[];
  entries: MealPlanEntry[];
  defaultServings: number;
  onChanged: () => Promise<void>;
  onRecipeCreated: (recipe: Recipe) => void;
  onAddToList: () => Promise<void>;
  onClose: () => void;
}) {
  // entryId set => swapping that dish; null => adding another one alongside.
  const [picking, setPicking] = useState<{ meal: MealType; entryId: string | null } | null>(null);
  // The name typed into the picker, while a new recipe for it is being made.
  const [creating, setCreating] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [cupboard, setCupboard] = useState<CupboardItem[]>([]);
  // Lives here, not in the picker, so it survives switching tabs while deciding.
  const [outTime, setOutTime] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [extraMeals, setExtraMeals] = useState<MealType[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Single items put on the list from this sheet, so their button can say so.
  const [listed, setListed] = useState<string[]>([]);

  const label = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    api<Place[]>('GET', `/api/households/${householdId}/places`).then(setPlaces).catch(() => setPlaces([]));
    api<CupboardItem[]>('GET', `/api/households/${householdId}/cupboard`).then(setCupboard).catch(() => setCupboard([]));
  }, [householdId]);

  // The three staples, plus any other slot that already has something in it.
  const slots = ALL_MEALS.filter(
    (m) => BASE_MEALS.includes(m) || extraMeals.includes(m) || entries.some((e) => e.mealType === m),
  );
  const missing = ALL_MEALS.filter((m) => !slots.includes(m));

  /** Puts a recipe or a single item in the slot being picked for — or swaps the dish being changed. */
  async function fill(what: { recipeId: string } | { itemName: string }) {
    if (!picking) return;
    setBusy(true);
    setError(null);
    try {
      if (picking.entryId) {
        await api('PATCH', `/api/households/${householdId}/meal-plan/entries/${picking.entryId}`, what);
      } else {
        await api('POST', `/api/households/${householdId}/meal-plan/entries`, {
          date,
          mealType: picking.meal,
          ...what,
          servings: 'recipeId' in what ? defaultServings : null,
        });
      }
      await onChanged();
      setPicking(null);
      setCreating(null);
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

  /** A recipe made from the picker goes straight into the slot it was made for. */
  async function recipeMade(recipe: Recipe) {
    onRecipeCreated(recipe);
    await fill({ recipeId: recipe.id });
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

  /** The only way a single item reaches the list — the day and week buttons add meals. */
  async function addItemToList(entry: MealPlanEntry) {
    setBusy(true);
    try {
      await api('POST', `/api/households/${householdId}/grocery-list/add-meal/${entry.id}`);
      setListed((ids) => [...ids, entry.id]);
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
    return (
      <ConfirmAddToGroceries
        dates={contributingDates(entries)}
        missing={missingIngredients(entries)}
        items={singleItems(entries)}
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

  if (picking && creating !== null) {
    return (
      <Sheet title={`New recipe · ${titleCase(picking.meal)}`} onClose={() => setCreating(null)} tall>
        {error && <div className="mb-3"><ErrorText>{error}</ErrorText></div>}
        <NewRecipeFromPlan
          householdId={householdId}
          initialName={creating}
          section={SECTION_FOR_MEAL[picking.meal]}
          servings={defaultServings}
          onSaved={recipeMade}
        />
      </Sheet>
    );
  }

  if (picking) {
    return (
      <Sheet title={`${titleCase(picking.meal)} · ${label}`} onClose={() => setPicking(null)} tall>
        {error && <div className="mb-3"><ErrorText>{error}</ErrorText></div>}
        <PickerTabs
          recipes={recipes}
          places={places}
          cupboard={cupboard}
          disabled={busy}
          time={outTime}
          onTimeChange={setOutTime}
          onPickRecipe={(recipe) => fill({ recipeId: recipe.id })}
          onPickItem={(name) => fill({ itemName: name })}
          onNewRecipe={(name) => {
            setError(null);
            setCreating(name);
          }}
          onPickPlace={choosePlace}
        />
      </Sheet>
    );
  }

  return (
    <Sheet title={label} onClose={onClose}>
      <ul className="divide-y divide-line">
        {slots.map((meal) => {
          // A slot is a whole meal: a main, its sides, or just the one side you fancied.
          const dishes = entries.filter((e) => e.mealType === meal && isPlanned(e));

          return (
            <li key={meal} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-muted">{titleCase(meal)}</span>
                <Button size="sm" variant="ghost" onClick={() => setPicking({ meal, entryId: null })}>
                  <PlusIcon className="h-4 w-4" />
                  {dishes.length ? 'Add side' : 'Add'}
                </Button>
              </div>

              {dishes.length === 0 ? (
                <p className="pb-1 text-sm text-subtle">Nothing yet</p>
              ) : (
                <ul className="divide-y divide-line">
                  {dishes.map((entry) => {
                    const open = expanded === entry.id;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : entry.id)}
                          className="flex min-h-touch w-full items-center gap-3 py-2 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {entryLabel(entry)}
                              {entry.time && (
                                <span className="font-normal text-muted"> · {formatTime(entry.time)}</span>
                              )}
                            </span>
                            <EntryDetail entry={entry} />
                          </span>
                        </button>

                        {open && (
                          <div className="flex flex-wrap items-center gap-2 pb-3">
                            <Button size="sm" variant="secondary" onClick={() => setPicking({ meal, entryId: entry.id })}>
                              Change
                            </Button>
                            {entry.recipeId && (
                              <Link to={entry.needsIngredients ? `/recipes/${entry.recipeId}/edit` : `/recipes/${entry.recipeId}`}>
                                <Button size="sm" variant="secondary">
                                  {entry.needsIngredients ? 'Add ingredients' : 'View recipe'}
                                </Button>
                              </Link>
                            )}
                            {entry.itemName && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busy || listed.includes(entry.id)}
                                onClick={() => addItemToList(entry)}
                              >
                                <CartIcon className="h-4 w-4" />
                                {listed.includes(entry.id) ? 'On the list' : 'Add to grocery list'}
                              </Button>
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
      <Button full variant="ghost" className="mt-2" disabled={busy} onClick={() => setConfirming(true)}>
        <CartIcon className="h-5 w-5" />
        {added ? 'Added to Groceries' : 'Add this day to Groceries'}
      </Button>
    </Sheet>
  );
}

/** The second line under a planned dish: what it means for the shopping. */
function EntryDetail({ entry }: { entry: MealPlanEntry }) {
  if (entry.recipeId && entry.needsIngredients) {
    return <span className="block text-sm text-accent">No ingredients yet</span>;
  }
  if (entry.recipeId && entry.servings) {
    return <span className="block text-sm text-muted">Serves {entry.servings}</span>;
  }
  if (entry.itemName) {
    return (
      <span className="block text-sm text-muted">
        {entry.runningLow ? 'Running low' : entry.inCupboard ? 'In the cupboard' : 'Not in the cupboard'}
      </span>
    );
  }
  return null;
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
 * People were flooding their list by catching the button in passing, and undoing that means
 * ticking or deleting each item by hand. One question, naming the days that will contribute,
 * so it is obvious at a glance whether you meant one day or seven.
 */
function ConfirmAddToGroceries({
  dates,
  missing,
  items,
  busy,
  onConfirm,
  onCancel,
}: {
  dates: string[];
  /** Recipes saved with just a name — planned, but with nothing to add. */
  missing: string[];
  /** How many single items are planned here, which this deliberately leaves out. */
  items: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const listed = dates
    .map((d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
    .join(', ');

  return (
    <Sheet title="Add to Groceries" onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-lg">
          {dates.length === 0
            ? 'Nothing planned to add.'
            : `Confirm adding ${listed} meals to grocery list?`}
        </p>
        {missing.length > 0 && (
          <p className="text-sm text-muted">
            {missing.join(', ')} {missing.length === 1 ? "has no ingredients yet, so it won't" : "have no ingredients yet, so they won't"}{' '}
            add anything.
          </p>
        )}
        {items > 0 && (
          <p className="text-sm text-muted">
            Single items aren't included — tap one on its day to add it to the list.
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy || dates.length === 0} onClick={onConfirm}>
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

/**
 * Whether the week and day buttons put anything on the list for an entry. Meals only: a place has
 * nothing to buy, a name-only recipe has nothing to give yet, and a single item goes on only from
 * its own button — planning eggs does not mean needing eggs.
 */
function contributes(entry: MealPlanEntry): boolean {
  return Boolean(entry.recipeId) && !entry.needsIngredients;
}

function singleItems(entries: MealPlanEntry[]): number {
  return entries.filter((e) => e.itemName).length;
}

/** The days in a set of entries that would actually put something on the list. */
function contributingDates(entries: MealPlanEntry[]): string[] {
  return [...new Set(entries.filter(contributes).map((e) => e.date))].sort();
}

function missingIngredients(entries: MealPlanEntry[]): string[] {
  return [...new Set(entries.filter((e) => e.needsIngredients && e.recipeName).map((e) => e.recipeName!))];
}

/**
 * Eat in, or go out. Two tabs rather than one merged list: when you have decided you are not
 * cooking tonight, scrolling past forty recipes to reach "Chinese" is the wrong shape.
 */
function PickerTabs({
  recipes,
  places,
  cupboard,
  disabled,
  time,
  onTimeChange,
  onPickRecipe,
  onPickItem,
  onNewRecipe,
  onPickPlace,
}: {
  recipes: Recipe[];
  places: Place[];
  cupboard: CupboardItem[];
  disabled: boolean;
  time: string;
  onTimeChange: (time: string) => void;
  onPickRecipe: (recipe: Recipe) => void;
  onPickItem: (name: string) => void;
  onNewRecipe: (name: string) => void;
  onPickPlace: (place: Place | { name: string }) => void;
}) {
  const [tab, setTab] = useState<'home' | 'out'>('home');

  return (
    <div className="space-y-3">
      {/* A two-way switch, sized like one — not two big buttons competing with the results. */}
      <div className="flex rounded-xl bg-elevated p-0.5" role="tablist">
        {(['home', 'out'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              'h-9 flex-1 rounded-lg text-sm font-medium transition-colors',
              tab === t ? 'bg-surface text-ink shadow-sm' : 'text-muted',
            )}
          >
            {t === 'home' ? 'At home' : 'Eat out'}
          </button>
        ))}
      </div>

      {tab === 'home' ? (
        <HomePicker
          recipes={recipes}
          cupboard={cupboard}
          disabled={disabled}
          onPickRecipe={onPickRecipe}
          onPickItem={onPickItem}
          onNewRecipe={onNewRecipe}
        />
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

/**
 * Everything eaten at home in one search: a recipe, something from the cupboard, or anything you
 * type. A name nothing matches offers both ways forward — plan it on its own, or make it a
 * recipe — so the meal you had in mind never means a trip to the Recipes tab and back.
 */
function HomePicker({
  recipes,
  cupboard,
  onPickRecipe,
  onPickItem,
  onNewRecipe,
  disabled,
}: {
  recipes: Recipe[];
  cupboard: CupboardItem[];
  onPickRecipe: (recipe: Recipe) => void;
  onPickItem: (name: string) => void;
  onNewRecipe: (name: string) => void;
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

  const typed = query.trim();
  const q = typed.toLowerCase();
  const shown = recipes
    .filter((r) => (!category || r.categories.includes(category)) && (!q || r.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Only while searching: the cupboard is long, and "eggs" is something you type, not scroll to.
  const stocked = q
    ? cupboard
        .filter((c) => c.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 5)
    : [];
  const exactRecipe = recipes.some((r) => r.name.toLowerCase() === q);
  const exactItem = cupboard.some((c) => c.name.toLowerCase() === q);

  return (
    <div className="space-y-3">
      <Input
        type="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search, or type anything — eggs, toast…"
        aria-label="Search recipes, or type something to add"
      />

      {typed && !exactRecipe && (
        <div className="grid gap-2">
          {!exactItem && (
            <Button full variant="secondary" disabled={disabled} onClick={() => onPickItem(typed)}>
              <PlusIcon className="h-5 w-5" />
              Just “{typed}”
            </Button>
          )}
          <Button full variant="secondary" disabled={disabled} onClick={() => onNewRecipe(typed)}>
            <BookIcon className="h-5 w-5" />
            New recipe “{typed}”
          </Button>
        </div>
      )}

      {stocked.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">In the cupboard</p>
          <ul className="divide-y divide-line">
            {stocked.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPickItem(c.name)}
                  className="flex min-h-touch w-full items-center justify-between gap-3 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  {(c.runningLow || c.staple) && (
                    <span className="shrink-0 text-sm text-muted">{c.runningLow ? 'Running low' : 'Always have'}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
        !typed && (
          <EmptyState>
            No recipes yet.{' '}
            <button type="button" className="font-medium text-accent underline" onClick={() => onNewRecipe('')}>
              Make one
            </button>
          </EmptyState>
        )
      ) : (
        <>
          {stocked.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Recipes</p>
          )}
          <ul className="divide-y divide-line">
            {shown.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPickRecipe(r)}
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
        </>
      )}
    </div>
  );
}

/**
 * Making the recipe you were about to plan without leaving the plan. Saving just the name is the
 * quick way — mid-planning you rarely want to type a whole recipe — at the cost of it adding
 * nothing to the grocery list until the ingredients go in, which the planner then points out.
 */
function NewRecipeFromPlan({
  householdId,
  initialName,
  section,
  servings,
  onSaved,
}: {
  householdId: string;
  initialName: string;
  section: RecipeSection;
  servings: number;
  onSaved: (recipe: Recipe) => void;
}) {
  const [mode, setMode] = useState<'choose' | 'write' | 'paste' | 'assisted'>('choose');
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writerAvailable = useAiAvailable();

  async function saveNameOnly() {
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await api<Recipe>('POST', `/api/households/${householdId}/recipes`, {
          name: name.trim(),
          servings,
          section,
          categories: [],
          ingredients: [],
        }),
      );
    } catch {
      setError('Could not save that.');
      setBusy(false);
    }
  }

  if (mode === 'write') {
    return (
      <RecipeForm
        householdId={householdId}
        section={section}
        draft={{
          name: name.trim(),
          description: null,
          instructions: null,
          prepTimeMinutes: null,
          cookTimeMinutes: null,
          servings,
          ingredients: [],
        }}
        onSaved={onSaved}
      />
    );
  }

  if (mode === 'paste') {
    return (
      <PasteFromChatGpt
        householdId={householdId}
        initialName={name.trim()}
        initialServings={servings}
        section={section}
        onSaved={onSaved}
      />
    );
  }

  if (mode === 'assisted') {
    return (
      <WriteForMe
        householdId={householdId}
        initialName={name.trim()}
        initialServings={servings}
        section={section}
        onSaved={onSaved}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Chicken tikka" />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="space-y-1.5">
        <Button full disabled={busy || !name.trim()} onClick={saveNameOnly}>
          {busy ? 'Saving…' : 'Save the name, fill it in later'}
        </Button>
        <p className="text-sm text-muted">
          It goes on the plan now. Until it has ingredients, it won't add anything to the grocery list.
        </p>
      </div>
      <Button full variant="secondary" disabled={busy || !name.trim()} onClick={() => setMode('write')}>
        Write out the recipe
      </Button>
      <Button full variant="secondary" disabled={busy} onClick={() => setMode('paste')}>
        Paste from ChatGPT
      </Button>
      {writerAvailable && (
        <Button full variant="secondary" disabled={busy || !name.trim()} onClick={() => setMode('assisted')}>
          ✨ Write it for me
        </Button>
      )}
    </div>
  );
}
