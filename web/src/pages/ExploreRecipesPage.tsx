import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Button, Card, EmptyState, Input } from '../components/ui';
import { ChevronLeftIcon } from '../components/icons';
import RecipeGrid from '../components/RecipeGrid';
import { PageTitle } from '../components/PageTitle';

/**
 * Everything every household here has published — the one place recipes travel between houses
 * without anyone sending a link. Opening one is the ordinary recipe page; keeping one is the
 * same "Move to my recipes" that a recipe shared with you uses, so nothing new to learn.
 *
 * One of the things Explore explores. Recipes is what this house cooks; this is what every
 * other house on the server has decided to share.
 */
export default function ExploreRecipesPage() {
  const navigate = useNavigate();
  const { activeHouseholdId } = useHousehold();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!activeHouseholdId) return;
    setRecipes(await api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/explore`).catch(() => []));
  }, [activeHouseholdId]);

  useEffect(() => {
    load();
  }, [load]);

  // Searching here is over what is already loaded: a family server's Explore is small, and
  // filtering as you type beats a round trip per keystroke.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes ?? [];
    return (recipes ?? []).filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.ownerName ?? '').toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.ingredientName.toLowerCase().includes(q)),
    );
  }, [recipes, query]);

  if (!activeHouseholdId) {
    return (
      <Card>
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  const mine = shown.filter((r) => !r.shared);
  const theirs = shown.filter((r) => r.shared);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-3" onClick={() => navigate('/explore')}>
        <ChevronLeftIcon className="h-5 w-5" />
        Explore
      </Button>
      <PageTitle title="Global recipes" subtitle="Recipes other households here have published." />

      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search published recipes"
        aria-label="Search published recipes"
      />

      {recipes === null ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState>
            {query.trim() ? (
              'Nothing matches that.'
            ) : (
              <>
                Nothing published yet. Open one of your recipes and choose ••• → Share →{' '}
                <span className="font-medium text-ink">Publish to Explore</span> to put the first one here.
              </>
            )}
          </EmptyState>
        </Card>
      ) : (
        <>
          {theirs.length > 0 && <RecipeGrid recipes={theirs} />}
          {mine.length > 0 && (
            <section className="space-y-3 pt-2">
              <h2 className="font-semibold">Published by you</h2>
              <RecipeGrid recipes={mine} />
            </section>
          )}
        </>
      )}

      <p className="pt-2 text-[0.8125rem] text-subtle">
        Anyone signed in here can read a published recipe and keep it. Take one back out any time from{' '}
        <Link to="/recipes" className="font-medium text-accent">
          your recipes
        </Link>
        .
      </p>
    </div>
  );
}
