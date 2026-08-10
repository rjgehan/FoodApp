import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { MealPlanEntry, MealType, Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Button, Card, Input, Label } from '../components/Card';

const MEAL_TYPES: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];
const MEAL_TYPE_ABBR: Record<MealType, string> = { BREAKFAST: 'B', LUNCH: 'L', DINNER: 'D', SNACK: 'S' };
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

function buildMonthGrid(monthCursor: Date): Date[] {
  const firstOfMonth = startOfMonth(monthCursor);
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getDay());
  const lastOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const gridEnd = addDays(lastOfMonth, 6 - lastOfMonth.getDay());

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    days.push(d);
  }
  return days;
}

export default function MealPlanPage() {
  const { activeHouseholdId, activeHousehold } = useHousehold();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => isoDate(new Date()));

  const today = startOfDay(new Date());
  const horizonDays = activeHousehold?.planningHorizonDays ?? 7;
  const horizonEnd = addDays(today, horizonDays - 1);

  const grid = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const gridStart = grid[0];
  const gridEnd = grid[grid.length - 1];

  async function refreshRecipes() {
    if (!activeHouseholdId) return;
    setRecipes(await api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`));
  }

  async function refreshEntries() {
    if (!activeHouseholdId) return;
    setEntries(
      await api<MealPlanEntry[]>(
        'GET',
        `/api/households/${activeHouseholdId}/meal-plan?start=${isoDate(gridStart)}&end=${isoDate(gridEnd)}`,
      ),
    );
  }

  useEffect(() => {
    refreshRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHouseholdId]);

  useEffect(() => {
    refreshEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHouseholdId, monthCursor]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, MealPlanEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [entries]);

  async function addAllHorizonToList() {
    if (!activeHouseholdId) return;
    await api(
      'POST',
      `/api/households/${activeHouseholdId}/grocery-list/add-all?start=${isoDate(today)}&end=${isoDate(horizonEnd)}`,
    );
  }

  if (!activeHouseholdId) {
    return <p className="text-sm text-slate-500">Create or select a household first.</p>;
  }

  return (
    <div className="space-y-6">
      <Card
        title={monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              title="Previous month"
              onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            >
              ‹
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setMonthCursor(startOfMonth(new Date()));
                setSelectedDate(isoDate(new Date()));
              }}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="secondary"
              title="Next month"
              onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            >
              ›
            </Button>
            <Button type="button" onClick={addAllHorizonToList}>
              + Add next {horizonDays}d to list
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-7 text-xs font-medium text-slate-500 mb-1">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="text-center py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((day) => {
            const dateStr = isoDate(day);
            const inMonth = day.getMonth() === monthCursor.getMonth();
            const isToday = dateStr === isoDate(today);
            const inHorizon = day >= today && day <= horizonEnd;
            const dayEntries = (entriesByDate.get(dateStr) ?? []).filter((e) => e.recipeName);
            const isSelected = dateStr === selectedDate;

            return (
              <button
                type="button"
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`min-h-20 text-left rounded-md p-1.5 border transition-colors ${
                  isSelected
                    ? 'border-slate-900 dark:border-slate-100'
                    : inHorizon
                      ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40'
                      : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                } ${!inMonth ? 'opacity-40' : ''}`}
              >
                <div
                  className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-red-500 text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {day.getDate()}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayEntries.slice(0, 3).map((e) => (
                    <div key={e.id} className="text-[10px] leading-tight truncate text-slate-600 dark:text-slate-300">
                      {MEAL_TYPE_ABBR[e.mealType]}: {e.recipeName}
                    </div>
                  ))}
                  {inHorizon && dayEntries.length === 0 && (
                    <div className="text-[10px] leading-tight text-amber-600 dark:text-amber-400">needs meals</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <DayPanel
        date={selectedDate}
        householdId={activeHouseholdId}
        recipes={recipes}
        entries={entriesByDate.get(selectedDate) ?? []}
        defaultServings={activeHousehold?.defaultServings ?? 4}
        onChanged={refreshEntries}
      />
    </div>
  );
}

function DayPanel({
  date,
  householdId,
  recipes,
  entries,
  defaultServings,
  onChanged,
}: {
  date: string;
  householdId: string;
  recipes: Recipe[];
  entries: MealPlanEntry[];
  defaultServings: number;
  onChanged: () => Promise<void>;
}) {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Card title={label}>
      <div className="space-y-3">
        {MEAL_TYPES.map((mt) => (
          <MealSlotRow
            key={mt}
            date={date}
            mealType={mt}
            householdId={householdId}
            recipes={recipes}
            entry={entries.find((e) => e.mealType === mt)}
            defaultServings={defaultServings}
            onChanged={onChanged}
          />
        ))}
      </div>
    </Card>
  );
}

function MealSlotRow({
  date,
  mealType,
  householdId,
  recipes,
  entry,
  defaultServings,
  onChanged,
}: {
  date: string;
  mealType: MealType;
  householdId: string;
  recipes: Recipe[];
  entry?: MealPlanEntry;
  defaultServings: number;
  onChanged: () => Promise<void>;
}) {
  const [recipeId, setRecipeId] = useState(entry?.recipeId ?? '');
  const [servings, setServings] = useState(entry?.servings ?? defaultServings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRecipeId(entry?.recipeId ?? '');
    setServings(entry?.servings ?? defaultServings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, entry?.id, entry?.recipeId, entry?.servings]);

  async function save() {
    setSaving(true);
    try {
      await api('PUT', `/api/households/${householdId}/meal-plan`, {
        date,
        mealType,
        recipeId: recipeId || null,
        servings,
      });
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    if (!entry) return;
    setSaving(true);
    try {
      await api('DELETE', `/api/households/${householdId}/meal-plan/${entry.id}`);
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function addToList() {
    if (!entry) return;
    await api('POST', `/api/households/${householdId}/grocery-list/add-meal/${entry.id}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 last:pb-0">
      <div className="w-20 shrink-0">
        <Label>{mealType[0] + mealType.slice(1).toLowerCase()}</Label>
      </div>
      <div className="flex-1 min-w-40">
        <select
          className="w-full text-sm border border-slate-300 dark:border-slate-700 bg-transparent rounded-md px-3 py-1.5"
          value={recipeId}
          onChange={(e) => setRecipeId(e.target.value)}
        >
          <option value="">(none)</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <Input
        type="number"
        min={1}
        className="w-20"
        value={servings}
        onChange={(e) => setServings(parseInt(e.target.value, 10) || 1)}
      />
      <Button type="button" variant="secondary" disabled={saving} onClick={save}>
        Save
      </Button>
      {entry?.recipeId && (
        <Button type="button" variant="secondary" onClick={addToList}>
          + list
        </Button>
      )}
      {entry && (
        <Button type="button" variant="danger" disabled={saving} onClick={clear}>
          Clear
        </Button>
      )}
    </div>
  );
}
