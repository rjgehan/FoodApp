import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { GroceryListItem, MealPlanEntry, MealType, Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { entryLabel, formatTime, isPlanned } from '../utils/planEntry';
import { Card, EmptyState } from '../components/ui';
import { imageUrl } from '../api/client';

const MEAL_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** How long ago, in the roughest terms that are still true. */
function agoLabel(iso: string | null): string {
  if (!iso) return 'never made';
  const days = Math.round((Date.now() - new Date(`${iso}T00:00:00`).getTime()) / 86400000);
  if (days <= 1) return 'made yesterday';
  if (days < 14) return `made ${days} days ago`;
  if (days < 60) return `made ${Math.round(days / 7)} weeks ago`;
  return `made ${Math.round(days / 30)} months ago`;
}

/** Deliberately only today: what's for dinner, and how much is left to buy. */
export default function DashboardPage() {
  const { activeHouseholdId, activeHousehold, households } = useHousehold();
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [history, setHistory] = useState<MealPlanEntry[]>([]);

  useEffect(() => {
    if (!activeHouseholdId) return;
    const now = new Date();
    const today = isoDate(now);
    api<MealPlanEntry[]>('GET', `/api/households/${activeHouseholdId}/meal-plan?start=${today}&end=${today}`)
      .then(setEntries);
    api<GroceryListItem[]>('GET', `/api/households/${activeHouseholdId}/grocery-list`).then(setItems);
    api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`).then(setRecipes).catch(() => setRecipes([]));
    // Six months back for "when did we last have this", and the planning window forward for the
    // gaps. One request rather than two, since it is one continuous range.
    api<MealPlanEntry[]>(
      'GET',
      `/api/households/${activeHouseholdId}/meal-plan?start=${isoDate(addDays(now, -180))}&end=${isoDate(addDays(now, 30))}`,
    )
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [activeHouseholdId]);

  if (households.length === 0) {
    return (
      <Card>
        <EmptyState>
          No household yet —{' '}
          <Link to="/household" className="font-medium text-accent underline">
            create one
          </Link>
          .
        </EmptyState>
      </Card>
    );
  }

  const today = entries
    .filter(isPlanned)
    .sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));
  const left = items.filter((i) => !i.checked).length;

  const now = new Date();
  const horizon = activeHousehold?.planningHorizonDays ?? 7;

  // Days inside the planning window with nothing on them. The window is the household's own
  // setting, so this says "you have gaps" in exactly the terms they chose.
  const emptyDays = Array.from({ length: horizon }, (_, i) => addDays(now, i))
    .filter((d) => !history.some((e) => e.date === isoDate(d) && isPlanned(e)));

  /*
   * The recipe you have not cooked in longest. A recipe box grows faster than anyone's memory,
   * and the failure mode is cooking the same six things while forty sit unread — so this is
   * drawn from what the household has actually planned, not invented.
   */
  const lastMade = new Map<string, string>();
  for (const e of history) {
    if (!e.recipeId || e.date > isoDate(now)) continue;
    const seen = lastMade.get(e.recipeId);
    if (!seen || e.date > seen) lastMade.set(e.recipeId, e.date);
  }
  const neglected = recipes
    .filter((r) => !r.shared && r.section)
    .map((r) => ({ recipe: r, last: lastMade.get(r.id) ?? null }))
    .sort((a, b) => (a.last ?? '').localeCompare(b.last ?? ''));
  // Rotate through the five most neglected by day, so it changes daily without being random on
  // every render — which would make it impossible to come back to.
  const suggestion = neglected.length
    ? neglected[Math.floor(now.getTime() / 86400000) % Math.min(5, neglected.length)]
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold leading-tight">Today</h1>
        <p className="text-muted">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {today.length === 0 ? (
        <Card>
          <EmptyState>
            Nothing planned today —{' '}
            <Link to="/meal-plan" className="font-medium text-accent underline">
              plan something
            </Link>
            .
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3">
          {today.map((e) => (
            <li key={e.id}>
              <Link
                to={e.recipeId ? `/recipes/${e.recipeId}` : '/meal-plan'}
                className="block rounded-2xl border border-line bg-surface p-4 transition-transform active:scale-[0.99]"
              >
                <p className="text-sm font-medium text-accent">{titleCase(e.mealType)}</p>
                <p className="mt-0.5 text-lg font-semibold leading-tight">
                  {entryLabel(e)}
                  {e.time && <span className="font-normal text-muted"> · {formatTime(e.time)}</span>}
                </p>
                {e.servings ? <p className="mt-0.5 text-sm text-muted">Serves {e.servings}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {emptyDays.length > 0 && (
        <Link
          to="/meal-plan"
          className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4"
        >
          <span className="min-w-0">
            <span className="block font-medium">
              {emptyDays.length} {emptyDays.length === 1 ? 'day' : 'days'} with nothing planned
            </span>
            <span className="block truncate text-sm text-muted">
              {emptyDays
                .slice(0, 4)
                .map((d) => d.toLocaleDateString(undefined, { weekday: 'short' }))
                .join(', ')}
              {emptyDays.length > 4 ? ` and ${emptyDays.length - 4} more` : ''}
            </span>
          </span>
          <span className="shrink-0 text-sm text-accent">Plan</span>
        </Link>
      )}

      {suggestion && (
        <Card title="Not made in a while">
          <Link to={`/recipes/${suggestion.recipe.id}`} className="flex items-center gap-3">
            {suggestion.recipe.coverImageId ? (
              <img
                src={imageUrl(suggestion.recipe.coverImageId)}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="h-14 w-14 shrink-0 rounded-xl bg-accent-soft" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{suggestion.recipe.name}</span>
              <span className="block text-sm text-muted">{agoLabel(suggestion.last)}</span>
            </span>
          </Link>
        </Card>
      )}

      <Link
        to="/grocery-list"
        className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4"
      >
        <span className="font-medium">Grocery list</span>
        <span className="text-muted">{left ? `${left} to buy` : 'All done'}</span>
      </Link>
    </div>
  );
}
