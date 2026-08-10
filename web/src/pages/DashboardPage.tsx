import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { GroceryListItem, MealPlanEntry } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Card } from '../components/Card';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const { activeHouseholdId, households } = useHousehold();
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [items, setItems] = useState<GroceryListItem[]>([]);

  useEffect(() => {
    if (!activeHouseholdId) return;
    const today = new Date();
    const weekOut = new Date(today.getTime() + 6 * 86400000);
    api<MealPlanEntry[]>(
      'GET',
      `/api/households/${activeHouseholdId}/meal-plan?start=${isoDate(today)}&end=${isoDate(weekOut)}`,
    ).then(setEntries);
    api<GroceryListItem[]>('GET', `/api/households/${activeHouseholdId}/grocery-list`).then(setItems);
  }, [activeHouseholdId]);

  if (households.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No household yet —{' '}
        <Link to="/household" className="underline">
          create one
        </Link>{' '}
        to get started.
      </p>
    );
  }

  const byDate = groupByDate(entries);
  const unchecked = items.filter((i) => !i.checked);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card title="This week">
        {byDate.length === 0 && <p className="text-sm text-slate-500">Nothing planned yet.</p>}
        <ul className="space-y-3">
          {byDate.map(([date, dayEntries]) => (
            <li key={date}>
              <div className="text-xs font-semibold text-slate-500 mb-1">{date}</div>
              <ul className="text-sm space-y-0.5">
                {dayEntries.map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span className="text-slate-500">{e.mealType}</span>
                    <span>{e.recipeName ?? '(empty)'}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={`Grocery list (${unchecked.length} left)`}>
        {unchecked.length === 0 && <p className="text-sm text-slate-500">Nothing left to buy.</p>}
        <ul className="text-sm space-y-1">
          {unchecked.slice(0, 10).map((i) => (
            <li key={i.id}>
              {i.name} <span className="text-slate-400">{i.quantity ?? ''} {i.unit ?? ''}</span>
            </li>
          ))}
        </ul>
        {unchecked.length > 10 && <p className="text-xs text-slate-400 mt-2">+{unchecked.length - 10} more</p>}
      </Card>
    </div>
  );
}

function groupByDate(entries: MealPlanEntry[]): [string, MealPlanEntry[]][] {
  const map = new Map<string, MealPlanEntry[]>();
  for (const e of entries) {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date)!.push(e);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
