import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { MealType, Recipe, RecipeSection } from '../api/types';
import { Button, CheckCircle, Chip, ErrorText, Sheet } from './ui';

const MEALS: { value: MealType; label: string }[] = [
  { value: 'BREAKFAST', label: 'Breakfast' },
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'DINNER', label: 'Dinner' },
  { value: 'SNACK', label: 'Snack' },
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

function dayLabel(d: Date, offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

/**
 * Recipe → Plan without leaving the recipe: pick a day in the planning window and a meal, then
 * add. The same thing the Plan tab's day sheet does, in the direction people actually arrive from.
 */
export default function PlanRecipeSheet({
  householdId,
  recipe,
  days,
  servings,
  onPlanned,
  onClose,
}: {
  householdId: string;
  recipe: Recipe;
  /** How many days ahead to offer — the household's planning window. */
  days: number;
  servings: number;
  onPlanned: (summary: string) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const dates = Array.from({ length: Math.max(days, 1) }, (_, i) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + i),
  );
  const [dayIndex, setDayIndex] = useState(0);
  const [meal, setMeal] = useState<MealType>(recipe.section ? MEAL_FOR_SECTION[recipe.section] : 'DINNER');
  const optional = recipe.ingredients.filter((i) => i.optional);
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const when = `${dayLabel(dates[dayIndex], dayIndex)} · ${MEALS.find((m) => m.value === meal)!.label}`;

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/api/households/${householdId}/meal-plan/entries`, {
        date: isoDate(dates[dayIndex]),
        mealType: meal,
        recipeId: recipe.id,
        servings,
        includedOptionalIngredientIds: [...extras],
      });
      onPlanned(when);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "That's already on this meal." : 'Could not add that.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Add to plan" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="pb-1.5 text-[0.8125rem] font-semibold text-muted">Day</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {dates.map((d, i) => (
              <Chip key={isoDate(d)} active={i === dayIndex} onClick={() => setDayIndex(i)}>
                {dayLabel(d, i)}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="pb-1.5 text-[0.8125rem] font-semibold text-muted">Meal</p>
          <div className="flex flex-wrap gap-2">
            {MEALS.map((m) => (
              <Chip key={m.value} active={m.value === meal} onClick={() => setMeal(m.value)}>
                {m.label}
              </Chip>
            ))}
          </div>
        </div>

        {optional.length > 0 && (
          <div>
            <p className="text-[0.8125rem] font-semibold text-muted">Buying the optional extras?</p>
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
        <Button full size="lg" disabled={busy} onClick={add}>
          {busy ? 'Adding…' : `Add to ${when}`}
        </Button>
      </div>
    </Sheet>
  );
}
