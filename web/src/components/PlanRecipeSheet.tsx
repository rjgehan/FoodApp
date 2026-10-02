import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { MealPlanEntry, MealType, Recipe, RecipeSection, SavedLink } from '../api/types';
import { Icon, type IconName } from './icons';
import { planRange } from './plan/planApi';
import { Button, CheckCircle, cx, ErrorText, NoteBox, Sheet } from './ui';

const MEALS: { value: MealType; label: string; icon: IconName }[] = [
  { value: 'BREAKFAST', label: 'Breakfast', icon: 'coffee' },
  { value: 'LUNCH', label: 'Lunch', icon: 'sandwich' },
  { value: 'DINNER', label: 'Dinner', icon: 'soup' },
  { value: 'SNACK', label: 'Snack', icon: 'cookie' },
];

/** The meal a recipe most likely goes on, from where it is filed. */
const MEAL_FOR_SECTION: Record<RecipeSection, MealType> = {
  BREAKFAST: 'BREAKFAST',
  LUNCH: 'LUNCH',
  DINNER: 'DINNER',
  SNACKS: 'SNACK',
  DRINKS: 'SNACK',
  OTHER: 'DINNER',
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** What a planned dish is called, whatever it is. */
function entryName(e: MealPlanEntry): string {
  return e.recipeName ?? e.placeName ?? e.itemName ?? 'something';
}

/**
 * Recipe → Plan without leaving the recipe (the mockup's 3.10): a day inside the planning
 * window and a meal, then add. The same thing the Plan tab's day sheet does, in the direction
 * people actually arrive from. If the meal already has something in it, it says so first — the
 * recipe goes in beside it as a side.
 *
 * A saved link plans the same way — it is a recipe that is still only a link — minus the
 * servings and extras, which it has no ingredients for.
 */
export default function PlanRecipeSheet({
  householdId,
  recipe,
  savedLink,
  days,
  servings,
  onPlanned,
  onClose,
}: {
  householdId: string;
  /** One of this or `savedLink`. */
  recipe?: Recipe;
  savedLink?: SavedLink;
  /** How many days ahead to offer — the household's planning window. */
  days: number;
  servings?: number;
  onPlanned: (summary: string) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const dates = Array.from({ length: Math.max(days, 1) }, (_, i) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + i),
  );
  // A window longer than a week has two of some weekdays, so the date goes with the name.
  const withDate = dates.length > 7;
  const [dayIndex, setDayIndex] = useState(0);
  const section = recipe?.section ?? savedLink?.section ?? null;
  const [meal, setMeal] = useState<MealType>(section ? MEAL_FOR_SECTION[section] : 'DINNER');
  const optional = (recipe?.ingredients ?? []).filter((i) => i.optional);
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [planned, setPlanned] = useState<MealPlanEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What is already planned in the window, so the sheet can say what a meal has in it.
  useEffect(() => {
    let live = true;
    planRange(householdId, dates[0], dates[dates.length - 1])
      .then((entries) => live && setPlanned(entries))
      .catch(() => live && setPlanned(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, days]);

  const day = dates[dayIndex];
  const dayName = day.toLocaleDateString(undefined, { weekday: 'short' }) + (withDate ? ` ${day.getDate()}` : '');
  const mealLabel = MEALS.find((m) => m.value === meal)!.label;
  const when = `${dayName} · ${mealLabel}`;

  const inSlot = (planned ?? []).filter((e) => e.date === isoDate(day) && e.mealType === meal && !e.recipeDeleted);
  const already = inSlot.some((e) =>
    recipe ? e.recipeId === recipe.id : savedLink ? e.savedLinkId === savedLink.id : false,
  );
  const ownName = recipe?.name ?? savedLink?.name ?? 'This';
  const others = inSlot.filter((e) => !(recipe ? e.recipeId === recipe.id : e.savedLinkId === savedLink?.id));

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/api/households/${householdId}/meal-plan/entries`, {
        date: isoDate(day),
        mealType: meal,
        ...(recipe
          ? { recipeId: recipe.id, servings, includedOptionalIngredientIds: [...extras] }
          : { savedLinkId: savedLink?.id }),
      });
      onPlanned(when);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "That's already on this meal." : 'Could not add that.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Add to plan" subtitle={ownName} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="group-label pb-2">Day</p>
          <div role="radiogroup" aria-label="Day" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {dates.map((d, i) => {
              const on = i === dayIndex;
              return (
                <button
                  key={isoDate(d)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  onClick={() => setDayIndex(i)}
                  className={cx(
                    'press flex w-[3.125rem] shrink-0 flex-col items-center gap-0.5 rounded-[14px] py-2.5',
                    on ? 'bg-accent text-on-accent' : 'border border-line bg-surface text-ink',
                  )}
                >
                  <span className="text-[0.6875rem] font-semibold opacity-80">
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <span className="text-[1.0625rem] font-semibold tabular-nums">{d.getDate()}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="group-label pb-2">Meal</p>
          <div role="radiogroup" aria-label="Meal" className="grid grid-cols-4 gap-2">
            {MEALS.map((m) => {
              const on = m.value === meal;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMeal(m.value)}
                  className={cx(
                    'press flex flex-col items-center gap-1.5 rounded-[14px] py-3',
                    on ? 'bg-ink text-bg' : 'border border-line bg-surface text-ink',
                  )}
                >
                  <Icon name={m.icon} size={20} />
                  <span className="text-xs font-semibold">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {already ? (
          // A meal can hold a recipe only once (the server says 409), so say what to do instead.
          <NoteBox tone="mustard" icon="alert">
            Already on {dayName} {mealLabel.toLowerCase()}. Pick another day or meal.
          </NoteBox>
        ) : others.length > 0 ? (
          <NoteBox tone="mustard" icon="alert">
            {dayName} {mealLabel.toLowerCase()} already has {entryName(others[0])}
            {others.length > 1 ? ` and ${others.length - 1} more` : ''} planned. This will be added as a side.
          </NoteBox>
        ) : null}

        {optional.length > 0 && (
          <div>
            <p className="group-label pb-1">Buying the optional extras?</p>
            <ul className="divide-y divide-line">
              {optional.map((ing) => {
                const on = extras.has(ing.id);
                return (
                  <li key={ing.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setExtras((prev) => {
                          const next = new Set(prev);
                          if (next.has(ing.id)) next.delete(ing.id);
                          else next.add(ing.id);
                          return next;
                        })
                      }
                      className="flex min-h-touch w-full items-center gap-3 py-2.5 text-left"
                    >
                      <CheckCircle checked={on} />
                      <span>{ing.ingredientName}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && <ErrorText>{error}</ErrorText>}
        <Button full size="lg" disabled={busy || already} onClick={add}>
          {busy ? 'Adding…' : `Add to ${when}`}
        </Button>
      </div>
    </Sheet>
  );
}
