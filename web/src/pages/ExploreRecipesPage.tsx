import { useCallback, useEffect, useMemo, useState } from 'react';
import NoHousehold from '../components/NoHousehold';
import { api } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Chip, EmptyState, NavBar, SearchField } from '../components/ui';
import { usePushedScreen } from '../components/Layout';
import { GlobalRecipeCard, isKept, useMoveIntoMine } from '../components/explore/ExploreParts';

type Filter = 'newest' | 'not-kept' | 'yours';

/**
 * Global recipes (the mockup's 5.2): everything every household here has published — the one
 * place recipes travel between houses without anyone sending a link. Search it, open one, or
 * move it straight into your own recipes with its +.
 *
 * Recipes is what this house cooks; this is what every other house on the server has decided to
 * share. The chips narrow it to what is newest (all of it, as the server sends it), what you have
 * not kept yet, and what this house published itself.
 */
export default function ExploreRecipesPage() {
  const { activeHouseholdId, activeHousehold } = useHousehold();
  usePushedScreen();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('newest');

  const load = useCallback(async () => {
    if (!activeHouseholdId) return;
    setRecipes(await api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/explore`).catch(() => []));
  }, [activeHouseholdId]);

  useEffect(() => {
    load();
  }, [load]);

  // Moved in from its +: it now says which drawer it is in, without fetching the list again.
  const move = useMoveIntoMine((saved) =>
    setRecipes((all) => all?.map((r) => (r.id === saved.id ? saved : r)) ?? all),
  );

  // Searching here is over what is already loaded: a family server's Explore is small, and
  // filtering as you type beats a round trip per keystroke.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recipes ?? []).filter((r) => {
      if (filter === 'not-kept' && (!r.shared || isKept(r))) return false;
      if (filter === 'yours' && r.shared) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.ownerName ?? '').toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.ingredientName.toLowerCase().includes(q))
      );
    });
  }, [recipes, query, filter]);

  if (!activeHouseholdId) {
    return <NoHousehold />;
  }

  const count = recipes?.length ?? 0;
  const anyYours = (recipes ?? []).some((r) => !r.shared);
  const chips: { value: Filter; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'not-kept', label: 'Not kept yet' },
    ...(anyYours ? [{ value: 'yours' as const, label: 'Published by you' }] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col">
      <NavBar back="/explore" backLabel="Explore" title="Global recipes" />

      <div className="flex flex-col gap-2.5 pb-3 pt-1">
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={recipes ? `Search ${count} ${count === 1 ? 'recipe' : 'recipes'}` : 'Search published recipes'}
          aria-label="Search published recipes"
        />
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] md:mx-0 md:px-0">
          {chips.map((c) => (
            <Chip
              key={c.value}
              active={filter === c.value}
              onClick={() => setFilter(c.value)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {recipes === null ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="card">
          <EmptyState>
            {query.trim() ? (
              'Nothing matches that.'
            ) : filter === 'not-kept' && count > 0 ? (
              'You keep every one of them already.'
            ) : (
              <>
                Nothing published yet. Open one of your recipes and choose Share →{' '}
                <span className="font-medium text-ink">Publish to Explore</span> to put the first one here.
              </>
            )}
          </EmptyState>
        </div>
      ) : (
        <ul aria-label="Published recipes" className="grid gap-3 md:grid-cols-2">
          {shown.map((r) => (
            <GlobalRecipeCard
              key={r.id}
              recipe={r}
              householdName={activeHousehold?.name ?? null}
              onMove={() => move.start(r)}
            />
          ))}
        </ul>
      )}

      <p className="px-1 pt-5 text-[0.8125rem] text-faint">
        Anyone signed in here can read a published recipe and move it into their own recipes. It stays the
        publisher's to change.
      </p>

      {move.sheet}
    </div>
  );
}
