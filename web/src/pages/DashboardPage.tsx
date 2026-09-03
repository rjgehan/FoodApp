import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { GroceryListItem, MealPlanEntry, MealType } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { entryLabel, formatTime, isPlanned } from '../utils/planEntry';
import { Card, EmptyState } from '../components/ui';

const MEAL_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** Deliberately only today: what's for dinner, and how much is left to buy. */
export default function DashboardPage() {
  const { activeHouseholdId, households } = useHousehold();
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [items, setItems] = useState<GroceryListItem[]>([]);

  useEffect(() => {
    if (!activeHouseholdId) return;
    const today = isoDate(new Date());
    api<MealPlanEntry[]>('GET', `/api/households/${activeHouseholdId}/meal-plan?start=${today}&end=${today}`)
      .then(setEntries);
    api<GroceryListItem[]>('GET', `/api/households/${activeHouseholdId}/grocery-list`).then(setItems);
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
