import { useCallback, useEffect, useMemo, useState } from 'react';
import NoHousehold from '../components/NoHousehold';
import { Link } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../api/client';
import type { CupboardItem, MealPlanEntry, MealType, Place, Recipe, RecipeSection } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { entryLabel, formatTime, isPlanned } from '../utils/planEntry';
import { coverClass } from '../utils/recipeFormat';
import { useMediaQuery } from '../utils/useMediaQuery';
import { useOnResume } from '../utils/useOnResume';
import PlaceActions from '../components/PlaceActions';
import { PageTitle } from '../components/PageTitle';
import RecipeForm from '../components/RecipeForm';
import { FromALink } from '../components/RecipeFromLink';
import { PasteFromAi } from '../components/RecipePaste';
import { Button, Card, CheckCircle, Chip, cx, EmptyState, ErrorText, Field, IconButton, Input, Sheet } from '../components/ui';
import { BookIcon, CartIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, StoreIcon } from '../components/icons';

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
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function titleCase(v: string): string {
  return v.charAt(0) + v.slice(1).toLowerCase();
}

export default function MealPlanPage() {
  const { activeHouseholdId, activeHousehold } = useHousehold();
  // The meals in the planning window, loaded when "Add … to Groceries" is pressed. That window runs
  // from today, so on a Thursday it reaches past the end of this month's grid.
  const [windowEntries, setWindowEntries] = useState<MealPlanEntry[] | null>(null);
  const [addingWeek, setAddingWeek] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [openDay, setOpenDay] = useState<string | null>(null);

  /*
   * One load covers both halves of the page: the month on screen, and the planning window that
   * runs from today — which can start before this month's grid or end after it.
   */
  const range = useMemo(() => {
    const first = startOfMonth(monthCursor);
    const gridStart = addDays(first, -first.getDay());
    const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const gridEnd = addDays(last, 6 - last.getDay());
    const from = startOfDay(new Date());
    const to = addDays(from, (activeHousehold?.planningHorizonDays ?? 7) - 1);
    return { start: gridStart < from ? gridStart : from, end: gridEnd > to ? gridEnd : to };
  }, [monthCursor, activeHousehold?.planningHorizonDays]);

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

  /*
   * Tailwind's lg: — a computer, or a tablet on its side. Not md:, because most phones turned
   * sideways are wider than 768px, and a phone keeps the text-only plan (and downloads no photos)
   * however it is held.
   */
  const photos = useMediaQuery('(min-width: 1024px)');

  // Restaurants can have a photo too. Only fetched where it will be shown.
  const [places, setPlaces] = useState<Place[]>([]);
  const loadPlaces = useCallback(async () => {
    if (!activeHouseholdId || !photos) return;
    setPlaces(await api<Place[]>('GET', `/api/households/${activeHouseholdId}/places`));
  }, [activeHouseholdId, photos]);

  useEffect(() => {
    loadPlaces().catch(() => setPlaces([]));
  }, [loadPlaces]);

  // Someone may have planned from another phone while this tab sat in the background.
  useOnResume(() => {
    refresh().catch(() => {});
    loadRecipes().catch(() => {});
    loadPlaces().catch(() => {});
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

  /*
   * A plan entry names its recipe or restaurant but not its picture. The recipe list this page
   * already loads for the picker has the covers; the places list has the rest. Keyed by either id
   * (both are UUIDs, so they cannot collide).
   */
  const pictures = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of recipes) if (r.coverImageId) map.set(r.id, r.coverImageId);
    for (const p of places) if (p.imageId) map.set(p.id, p.imageId);
    return map;
  }, [recipes, places]);

  if (!activeHouseholdId) {
    return (
      <Card>
        <NoHousehold />
      </Card>
    );
  }

  const today = startOfDay(new Date());

  async function addRangeToList(start: Date, end: Date) {
    await api('POST', `/api/households/${activeHouseholdId}/grocery-list/add-all?start=${isoDate(start)}&end=${isoDate(end)}`);
  }

  /*
   * The planning window from Settings, drawn on the calendar so "how far ahead do we plan" is
   * something you can see rather than a number buried in a form.
   */
  const horizonDays = activeHousehold?.planningHorizonDays ?? 7;
  const horizonEnd = addDays(today, horizonDays - 1);
  const windowLabel = `${today.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${horizonEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  /*
   * The top of the page is the plan itself — only the days that have something on them. A fixed
   * Sunday-to-Saturday strip spent most of its width on empty days; this spends it on the meals,
   * and the month below is where you go to fill a day that is not here yet.
   *
   * On the current month that means today forward: what you still have to cook. On any other
   * month it is that whole month, which is how you look back at what you ate.
   */
  const viewingThisMonth =
    monthCursor.getMonth() === today.getMonth() && monthCursor.getFullYear() === today.getFullYear();
  const planDays: { day: Date; planned: MealPlanEntry[] }[] = [];
  {
    const first = startOfMonth(monthCursor);
    const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const from = viewingThisMonth && today > first ? today : first;
    const to = viewingThisMonth && horizonEnd > last ? horizonEnd : last;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const planned = (byDate.get(isoDate(d)) ?? []).filter(isPlanned);
      if (planned.length > 0) planDays.push({ day: d, planned });
    }
  }

  async function confirmWindow() {
    setWindowEntries(
      await api<MealPlanEntry[]>(
        'GET',
        `/api/households/${activeHouseholdId}/meal-plan?start=${isoDate(today)}&end=${isoDate(horizonEnd)}`,
      ),
    );
  }

  return (
    /* Full height on purpose: the month below stretches into whatever the plan does not use,
       instead of leaving half a phone screen of black. */
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-4">
      <PageTitle title="Plan" />
      {windowEntries && (
        <ConfirmAddToGroceries
          dates={contributingDates(windowEntries)}
          missing={missingIngredients(windowEntries)}
          items={singleItems(windowEntries)}
          busy={addingWeek}
          onCancel={() => setWindowEntries(null)}
          onConfirm={async () => {
            setAddingWeek(true);
            try {
              await addRangeToList(today, horizonEnd);
              setWindowEntries(null);
            } finally {
              setAddingWeek(false);
            }
          }}
        />
      )}

      {/* The plan itself: only the days with something on them, as wide as they need to be
          readable. Scrolls sideways when the month is full. */}
      {planDays.length === 0 ? (
        <Card>
          <EmptyState>
            {viewingThisMonth
              ? 'Nothing planned from today on. Pick a day below to start.'
              : monthCursor < today
                ? `Nothing was planned in ${monthCursor.toLocaleDateString(undefined, { month: 'long' })}.`
                : `Nothing planned in ${monthCursor.toLocaleDateString(undefined, { month: 'long' })} yet. Pick a day below.`}
          </EmptyState>
        </Card>
      ) : (
        /* With photos, each card is only as tall as its own meals: stretched to the busiest day, a
           Saturday out would be mostly empty card. */
        <div
          className={cx(
            '-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1',
            photos && 'items-start',
          )}
        >
          {planDays.map(({ day, planned }) => {
            const key = isoDate(day);
            const isToday = key === isoDate(today);

            return (
              <button
                key={key}
                type="button"
                aria-label={`Plan for ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                onClick={() => setOpenDay(key)}
                className={cx(
                  'flex shrink-0 snap-start flex-col rounded-2xl border p-3 text-left transition-colors',
                  photos ? 'w-48' : 'w-36',
                  isToday ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface active:bg-elevated',
                )}
              >
                <span className={cx('text-[0.8125rem] font-medium', isToday ? 'text-accent' : 'text-muted')}>
                  {isToday ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span className="text-2xl font-semibold leading-tight">{day.getDate()}</span>
                <span className={cx('mt-2 flex min-w-0 flex-col', photos ? 'gap-2' : 'gap-1')}>
                  {planned.slice(0, 3).map((e) =>
                    photos ? (
                      /* A thumbnail beside each meal rather than a photo above it, so a busy day
                         is not twice as tall and the month below stays on the first screen. */
                      <span key={e.id} className="flex min-w-0 items-center gap-2 text-[0.8125rem] leading-tight">
                        <MealPhoto entry={e} pictures={pictures} className="h-11 w-11 shrink-0 rounded-lg" />
                        <span className="min-w-0 flex-1">
                          <span className="text-muted">{titleCase(e.mealType)}</span>
                          <span className="block truncate">{entryLabel(e)}</span>
                        </span>
                      </span>
                    ) : (
                      <span key={e.id} className="truncate text-[0.8125rem] leading-tight">
                        <span className="text-muted">{titleCase(e.mealType)}</span>
                        <span className="block truncate">{entryLabel(e)}</span>
                      </span>
                    ),
                  )}
                  {planned.length > 3 && (
                    <span className="text-[0.8125rem] text-muted">+{planned.length - 3} more</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Plan → Groceries. It covers the planning window — the days being shopped for — not
          whichever month is on screen. Secondary, not filled: a filled button at the bottom of a
          screen reads as "save", and this one changes a different page. */}
      <Button full variant="secondary" onClick={confirmWindow}>
        <CartIcon className="h-5 w-5" />
        Add {windowLabel} to Groceries
      </Button>

      {/* The whole picture, in the space this page used to leave empty. Every day is tappable,
          including the empty ones — that is how a day that is not in the rail above gets filled. */}
      <MonthCalendar
        monthCursor={monthCursor}
        byDate={byDate}
        pictures={photos ? pictures : null}
        today={today}
        horizonEnd={horizonEnd}
        onMonth={(delta) => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))}
        onToday={() => setMonthCursor(startOfMonth(new Date()))}
        onPick={(key) => setOpenDay(key)}
      />

      {openDay && (
        <DaySheet
          date={openDay}
          householdId={activeHouseholdId}
          recipes={recipes}
          pictures={photos ? pictures : null}
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

/**
 * The month, and the second half of this page. It is the date picker as much as the overview:
 * tapping any square opens that day, so an empty Thursday is one tap from having dinner on it.
 * Days inside the planning window carry a soft ring, which is what "we plan a week ahead" looks
 * like when it is a setting you can see.
 */
function MonthCalendar({
  monthCursor,
  byDate,
  pictures,
  today,
  horizonEnd,
  onMonth,
  onToday,
  onPick,
}: {
  monthCursor: Date;
  byDate: Map<string, MealPlanEntry[]>;
  /** Recipe or place id → image id, or null where there is no room for pictures. */
  pictures: Map<string, string> | null;
  today: Date;
  horizonEnd: Date;
  onMonth: (delta: number) => void;
  onToday: () => void;
  onPick: (key: string) => void;
}) {
  const first = startOfMonth(monthCursor);
  const gridStart = addDays(first, -first.getDay());
  const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const gridEnd = addDays(last, 6 - last.getDay());
  const away = monthCursor.getMonth() !== today.getMonth() || monthCursor.getFullYear() !== today.getFullYear();

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  // The month sits on a card like everything else, so it reads as one thing.
  return (
    <div className="card flex flex-1 flex-col p-2 pt-1">
      <div className="flex items-center gap-1 pb-1">
        <IconButton label="Previous month" onClick={() => onMonth(-1)}>
          <ChevronLeftIcon className="h-5 w-5" />
        </IconButton>
        <h2 className="flex-1 text-center font-semibold">
          {monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        {/* Only offered once you have paged away — on this month it would do nothing. */}
        {away && (
          <Button size="sm" variant="ghost" onClick={onToday}>
            Today
          </Button>
        )}
        <IconButton label="Next month" onClick={() => onMonth(1)}>
          <ChevronRightIcon className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className="py-1 text-center text-xs font-semibold text-subtle">
            {w}
          </div>
        ))}
      </div>
      <div
        className="grid flex-1 grid-cols-7 gap-1"
        style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(3rem, 1fr))` }}
      >
        {days.map((day) => {
          const key = isoDate(day);
          const planned = (byDate.get(key) ?? []).filter(isPlanned);
          const inMonth = day.getMonth() === monthCursor.getMonth();
          const isToday = key === isoDate(today);
          const inWindow = day >= today && day <= horizonEnd;

          return (
            <button
              key={key}
              type="button"
              aria-label={`${day.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}${planned.length ? `, ${planned.length} planned` : ''}`}
              onClick={() => onPick(key)}
              className={cx(
                'flex flex-col items-center justify-center rounded-xl border p-1 transition-colors active:bg-elevated',
                inWindow ? 'border-accent/30' : 'border-transparent',
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
              {/* On a computer each square is wide enough to show what is for dinner rather
                  than only that something is. */}
              {pictures ? (
                planned.length > 0 && (
                  <span className="mt-1 flex items-center justify-center gap-0.5">
                    {/* Three fit; a fourth meal turns the third tile into a count, so a busy day
                        still says it is busier than it looks. */}
                    {planned.slice(0, planned.length > 3 ? 2 : 3).map((e) => (
                      <MealPhoto key={e.id} entry={e} pictures={pictures} className="h-7 w-7 rounded-md" small />
                    ))}
                    {planned.length > 3 && (
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-elevated text-[0.6875rem] font-semibold text-muted">
                        +{planned.length - 2}
                      </span>
                    )}
                  </span>
                )
              ) : (
                <span className="mt-1 flex flex-wrap items-center justify-center gap-0.5">
                  {planned.slice(0, 4).map((e) => (
                    <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-accent" />
                  ))}
                </span>
              )}
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
  pictures,
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
  /** Recipe or place id → image id, or null where there is no room for pictures. */
  pictures: Map<string, string> | null;
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
  // A recipe with optional ingredients was just picked — choosing which of them to buy this time,
  // before the entry is actually saved.
  const [choosingOptionals, setChoosingOptionals] = useState<{ recipe: Recipe; selected: Set<string> } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [cupboard, setCupboard] = useState<CupboardItem[]>([]);
  // Lives here, not in the picker, so it survives switching tabs while deciding.
  const [outTime, setOutTime] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
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
    (m) => BASE_MEALS.includes(m) || entries.some((e) => e.mealType === m),
  );
  const missing = ALL_MEALS.filter((m) => !slots.includes(m));

  /** Puts a recipe or a single item in the slot being picked for — or swaps the dish being changed. */
  async function fill(what: { recipeId: string; includedOptionalIngredientIds?: string[] } | { itemName: string }) {
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
      setChoosingOptionals(null);
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

  /**
   * A recipe with no optional ingredients goes straight in, same as always. One with some pauses
   * on a checklist first — asked once, here, rather than every time something later puts this
   * meal's ingredients on the grocery list.
   */
  function pickRecipe(recipe: Recipe) {
    const optionalIngredients = recipe.ingredients.filter((i) => i.optional);
    if (optionalIngredients.length === 0) {
      fill({ recipeId: recipe.id });
      return;
    }
    // Re-picking the same recipe you're already swapping keeps whatever was chosen last time.
    const current = picking?.entryId ? entries.find((e) => e.id === picking.entryId) : null;
    const selected = new Set(
      current?.recipeId === recipe.id ? current.includedOptionalIngredientIds : [],
    );
    setChoosingOptionals({ recipe, selected });
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

  if (picking && choosingOptionals) {
    const optionalIngredients = choosingOptionals.recipe.ingredients.filter((i) => i.optional);
    return (
      <Sheet title={choosingOptionals.recipe.name} onClose={() => setChoosingOptionals(null)}>
        {error && <div className="mb-3"><ErrorText>{error}</ErrorText></div>}
        <p className="mb-2 text-sm text-muted">Buying the optional extras this time?</p>
        <ul className="divide-y divide-line">
          {optionalIngredients.map((ing) => {
            const checked = choosingOptionals.selected.has(ing.id);
            return (
              <li key={ing.id}>
                <button
                  type="button"
                  aria-pressed={checked}
                  onClick={() =>
                    setChoosingOptionals((prev) => {
                      if (!prev) return prev;
                      const next = new Set(prev.selected);
                      if (next.has(ing.id)) next.delete(ing.id);
                      else next.add(ing.id);
                      return { ...prev, selected: next };
                    })
                  }
                  className="flex min-h-touch w-full items-center gap-3 py-2.5 text-left"
                >
                  <CheckCircle checked={checked} />
                  <span>{ing.ingredientName}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <Button
          full
          className="mt-3"
          disabled={busy}
          onClick={() => {
            const recipe = choosingOptionals.recipe;
            fill({ recipeId: recipe.id, includedOptionalIngredientIds: [...choosingOptionals.selected] });
          }}
        >
          Add to {titleCase(picking.meal)}
        </Button>
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
          onPickRecipe={pickRecipe}
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
                {/* A side goes with something cooked; a night out or a single food takes none. */}
                {(dishes.length === 0 || dishes.some((d) => d.recipeId)) && (
                  <Button size="sm" variant="ghost" onClick={() => setPicking({ meal, entryId: null })}>
                    <PlusIcon className="h-4 w-4" />
                    {dishes.length ? 'Add side' : 'Add'}
                  </Button>
                )}
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
                          {pictures && <MealPhoto entry={entry} pictures={pictures} className="h-12 w-12 shrink-0 rounded-lg" />}
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
                          <div className="space-y-1 pb-3">
                          <div className="flex flex-wrap items-center gap-2">
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
                                {listed.includes(entry.id) ? 'In Groceries' : 'Add to Groceries'}
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
                          </div>
                          {/* The rare two, quiet and together. */}
                          <div className="-ml-3 flex items-center">
                            <Button size="sm" variant="ghost" onClick={() => setPicking({ meal, entryId: entry.id })}>
                              Change
                            </Button>
                            <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => remove(entry)}>
                              Remove
                            </Button>
                          </div>
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
        <Button variant="ghost" full className="mt-2" onClick={() => setPicking({ meal: missing[0], entryId: null })}>
          <PlusIcon className="h-5 w-5" />
          Add a {missing[0].toLowerCase()}
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

/**
 * A planned meal's picture on the desktop plan: the recipe's cover or the restaurant's photo when
 * there is one; otherwise the same tinted plate the recipe grid uses, so a day with one
 * photographed dinner and one without still lines up. Only rendered where there is room (see
 * `photos`), so a phone never downloads one; lazy, so a long month on a computer fetches what is
 * on screen first.
 */
function MealPhoto({
  entry,
  pictures,
  className,
  small = false,
}: {
  entry: MealPlanEntry;
  pictures: Map<string, string>;
  className: string;
  /** A calendar square: the letter and icon are drawn smaller, and the plate gets an edge. */
  small?: boolean;
}) {
  const imageId = pictures.get(entry.recipeId ?? entry.placeId ?? '');
  // A cover that was deleted, or a server that is briefly away, falls back to the plate rather
  // than the browser's broken-image box. Remembered by id, so a new cover gets its own try.
  const [failedId, setFailedId] = useState<string | null>(null);
  const label = entryLabel(entry) ?? '';

  if (imageId && failedId !== imageId) {
    return (
      <span className={cx('flex overflow-hidden bg-elevated', className)}>
        <img
          src={imageUrl(imageId)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedId(imageId)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cx(
        'flex items-center justify-center overflow-hidden',
        coverClass(entry.recipeId ?? entry.placeId ?? label),
        // In a calendar square a bare pastel tile next to a photo reads as one still loading, and
        // nearly vanishes on a white card, so it gets an edge and a darker mark.
        small ? 'text-ink/60 ring-1 ring-inset ring-line' : 'text-ink/40',
        className,
      )}
    >
      {entry.placeId ? (
        <StoreIcon className={small ? 'h-3.5 w-3.5' : 'h-6 w-6'} />
      ) : (
        <span className={cx('select-none font-serif font-semibold', small ? 'text-xs' : 'text-2xl')}>
          {label.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
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
  // Same shape as the cupboard's amount stepper, labelled, and saved on each tap.
  return (
    <span className="flex items-center gap-2">
      <span className="text-sm text-muted">Serves</span>
      <span className="flex items-center gap-1.5 rounded-[9px] bg-elevated px-1 py-0.5" role="group" aria-label="Servings">
        <button
          type="button"
          aria-label="Fewer servings"
          disabled={disabled || value <= 1}
          onClick={() => onChange(value - 1)}
          className="flex h-9 w-9 items-center justify-center rounded-[7px] text-base font-semibold text-muted active:bg-surface disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-[1.5rem] text-center text-[0.9375rem] font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label="More servings"
          disabled={disabled || value >= 50}
          onClick={() => onChange(value + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-[7px] text-base font-semibold text-muted active:bg-surface disabled:opacity-40"
        >
          +
        </button>
      </span>
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
            : `Add the meals from ${listed} to Groceries?`}
        </p>
        {missing.length > 0 && (
          <p className="text-sm text-muted">
            {missing.join(', ')} {missing.length === 1 ? "has no ingredients yet, so it won't" : "have no ingredients yet, so they won't"}{' '}
            add anything.
          </p>
        )}
        {items > 0 && (
          <p className="text-sm text-muted">
            Single foods aren't included — tap one on its day to add it to Groceries.
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy || dates.length === 0} onClick={onConfirm}>
            <CartIcon className="h-5 w-5" />
            {busy ? 'Adding…' : 'Add to Groceries'}
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
  const [mode, setMode] = useState<'choose' | 'write' | 'link' | 'paste'>('choose');
  const [name, setName] = useState(initialName);
  /** A link pasted into the AI paste, carried over to From a link. */
  const [handedLink, setHandedLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (mode !== 'choose') {
    return (
      <div className="space-y-3">
        {/* A mis-tap on the choices should not mean closing the sheet and finding the dish again. */}
        <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setMode('choose')}>
          <ChevronLeftIcon className="h-5 w-5" />
          Back
        </Button>
        {mode === 'write' ? (
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
        ) : mode === 'link' ? (
          <FromALink
            householdId={householdId}
            link={handedLink}
            initialServings={servings}
            section={section}
            onSaved={onSaved}
          />
        ) : (
          <PasteFromAi
            householdId={householdId}
            initialName={name.trim()}
            initialServings={servings}
            section={section}
            onLink={(link) => {
              setHandedLink(link);
              setMode('link');
            }}
            onSaved={onSaved}
          />
        )}
      </div>
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
          It goes on the plan now. Until it has ingredients, it won't add anything to Groceries.
        </p>
      </div>
      <Button full variant="secondary" disabled={busy || !name.trim()} onClick={() => setMode('write')}>
        Write out the recipe
      </Button>
      <Button full variant="secondary" disabled={busy} onClick={() => setMode('link')}>
        From a link
      </Button>
      <Button full variant="secondary" disabled={busy} onClick={() => setMode('paste')}>
        Paste from an AI
      </Button>
    </div>
  );
}
