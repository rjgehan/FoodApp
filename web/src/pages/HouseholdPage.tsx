import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { HouseholdMember, Recipe, RecipeVisibility } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Button, Card, Input, Label } from '../components/Card';

export default function HouseholdPage() {
  const { households, activeHousehold, createHousehold } = useHousehold();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const name = newName.trim();
      await createHousehold(name);
      setNewName('');
      setJustCreated(name);
      setTimeout(() => setJustCreated(null), 4000);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {justCreated && (
        <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 text-sm px-4 py-2">
          "{justCreated}" created — you're now in it.
        </div>
      )}

      {households.length === 0 && (
        <Card title="Create a household">
          <form onSubmit={onCreate} className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Gehan House" />
            </div>
            <Button type="submit" disabled={creating}>
              Create
            </Button>
          </form>
          <p className="text-sm text-slate-500 mt-3">
            You're not in a household yet — create one above to start planning meals.
          </p>
        </Card>
      )}

      {activeHousehold && <SettingsCard />}
      {activeHousehold && <RecipesCard householdId={activeHousehold.id} />}
      {activeHousehold && <MembersCard householdId={activeHousehold.id} />}
    </div>
  );
}

function RecipesCard({ householdId }: { householdId: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    api<Recipe[]>('GET', `/api/households/${householdId}/recipes`).then(setRecipes);
  }, [householdId]);

  const mine = recipes.filter((r) => r.householdId === householdId);

  return (
    <Card title="Recipes">
      {mine.length === 0 ? (
        <p className="text-sm text-slate-500">No recipes yet — add some from the Recipes page.</p>
      ) : (
        <ul className="text-sm grid sm:grid-cols-2 gap-x-4 gap-y-1">
          {mine.map((r) => (
            <li key={r.id} className="truncate">
              {r.name}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SettingsCard() {
  const { activeHousehold, updateSettings } = useHousehold();
  const [servings, setServings] = useState(activeHousehold?.defaultServings ?? 1);
  const [visibility, setVisibility] = useState<RecipeVisibility>(activeHousehold?.defaultRecipeVisibility ?? 'PRIVATE');
  const [horizonDays, setHorizonDays] = useState(activeHousehold?.planningHorizonDays ?? 7);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (activeHousehold) {
      setServings(activeHousehold.defaultServings);
      setVisibility(activeHousehold.defaultRecipeVisibility);
      setHorizonDays(activeHousehold.planningHorizonDays);
    }
  }, [activeHousehold]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSettings({ defaultServings: servings, defaultRecipeVisibility: visibility, planningHorizonDays: horizonDays });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Settings">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label>Default servings for new meal plan slots</Label>
          <Input
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(parseInt(e.target.value, 10) || 1)}
          />
        </div>
        <div>
          <Label>Days ahead to plan (spotlighted on the meal plan calendar)</Label>
          <Input
            type="number"
            min={1}
            value={horizonDays}
            onChange={(e) => setHorizonDays(parseInt(e.target.value, 10) || 1)}
          />
        </div>
        <div>
          <Label>Default visibility for new recipes</Label>
          <select
            className="w-full text-sm border border-slate-300 dark:border-slate-700 bg-transparent rounded-md px-3 py-1.5"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as RecipeVisibility)}
          >
            <option value="PRIVATE">Private — only this household can see it</option>
            <option value="GLOBAL">Global — every household can see it</option>
          </select>
        </div>
        <Button type="submit" disabled={saving}>
          {saved ? 'Saved!' : 'Save'}
        </Button>
      </form>
    </Card>
  );
}

function MembersCard({ householdId }: { householdId: string }) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setMembers(await api<HouseholdMember[]>('GET', `/api/households/${householdId}/members`));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('POST', `/api/households/${householdId}/members`, { username });
      setUsername('');
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.body as { message?: string })?.message ?? 'Could not add member'
          : 'Could not add member',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Members">
      <ul className="mb-4 space-y-1 text-sm">
        {members.map((m) => (
          <li key={m.userId} className="flex justify-between">
            <span>
              {m.displayName} <span className="text-slate-400">({m.username})</span>
            </span>
            <span className="text-slate-400">{m.role}</span>
          </li>
        ))}
      </ul>

      <form onSubmit={onInvite} className="flex gap-2 items-end">
        <div className="flex-1">
          <Label>Invite by username (must already have an account)</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
        </div>
        <Button type="submit" disabled={busy}>
          Add member
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}
