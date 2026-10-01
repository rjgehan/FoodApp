import { useEffect, useMemo, useState } from 'react';
import NoHousehold from '../components/NoHousehold';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Recipe, RecipeSection, SavedLink } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Card, EmptyState, Input } from '../components/ui';
import { PlusIcon } from '../components/icons';
import { coverClass } from '../utils/recipeFormat';
import { SECTION_OPTIONS, SHARED_KEY, sectionSlug } from '../utils/recipeMeta';
import { DEFAULT_SECTION_ICONS, SavedLinksArt } from '../components/FoodIcons';
import { SAVED_LINKS_PATH } from '../utils/savedLinks';
import { CATALOG_GRID, CatalogTileFace, catalogTileClass } from '../components/CatalogTile';
import RecipeGrid from '../components/RecipeGrid';
import { PageTitle } from '../components/PageTitle';

/**
 * The front of the catalog: pick a drawer first. Searching skips straight to results, because
 * when you already know what you want, browsing is in the way.
 */
export default function RecipesPage() {
  const { activeHouseholdId } = useHousehold();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [icons, setIcons] = useState<Partial<Record<RecipeSection, string>>>({});
  // Null until loaded, and left null by an older server that has none, so no tile flashes a 0.
  const [savedLinks, setSavedLinks] = useState<SavedLink[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!activeHouseholdId) return;
    setRecipes(null);
    setSavedLinks(null);
    api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`).then(setRecipes);
    api<Partial<Record<RecipeSection, string>>>('GET', `/api/households/${activeHouseholdId}/section-icons`)
      .then(setIcons)
      .catch(() => setIcons({}));
    api<SavedLink[]>('GET', `/api/households/${activeHouseholdId}/saved-links`)
      .then(setSavedLinks)
      .catch(() => setSavedLinks(null));
  }, [activeHouseholdId]);

  // A search reaches the saved links too: "that pasta TikTok" is still what you are looking for.
  const linkResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (savedLinks ?? []).filter((l) => l.name.toLowerCase().includes(q));
  }, [savedLinks, query]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (recipes ?? [])
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q) ||
          r.categories.some((c) => c.toLowerCase().includes(q)) ||
          r.ingredients.some((i) => i.ingredientName.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, query]);

  if (!activeHouseholdId) {
    return (
      <Card>
        <NoHousehold />
      </Card>
    );
  }

  const all = recipes ?? [];
  const sharedCount = all.filter((r) => r.section === null).length;

  return (
    <div className="space-y-4">
      <PageTitle title="Recipes" />
      <div className="flex gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes and ingredients"
          aria-label="Search recipes"
        />
        <Link
          to="/recipes/new"
          aria-label="Add a recipe"
          title="Add a recipe"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

      {recipes === null ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : query.trim() ? (
        results.length === 0 && linkResults.length === 0 ? (
          <Card>
            <EmptyState>Nothing matches that.</EmptyState>
          </Card>
        ) : (
          <>
            {results.length > 0 && <RecipeGrid recipes={results} />}
            {linkResults.length > 0 && (
              <Link
                to={`${SAVED_LINKS_PATH}?q=${encodeURIComponent(query.trim())}`}
                className="flex min-h-touch items-center gap-3 rounded-2xl bg-surface2 p-4 transition-transform active:scale-[0.98]"
              >
                <SavedLinksArt className="h-9 w-9 shrink-0 text-ink opacity-70" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {linkResults.length} in Saved links
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {linkResults.slice(0, 3).map((l) => l.name).join(' · ')}
                  </span>
                </span>
              </Link>
            )}
          </>
        )
      ) : (
        <>
          <ul className={CATALOG_GRID}>
            {SECTION_OPTIONS.map((s, i) => {
              const count = all.filter((r) => r.section === s.value).length;
              return (
                <li key={s.value}>
                  <Link to={`/recipes/section/${sectionSlug(s.value)}`} className={catalogTileClass(coverClass(String(i)))}>
                    <CatalogTileFace
                      name={s.label}
                      detail={`${count} ${count === 1 ? 'recipe' : 'recipes'}`}
                      iconKey={icons[s.value] ?? DEFAULT_SECTION_ICONS[s.value]}
                    />
                  </Link>
                </li>
              );
            })}
            {/* After the drawers and looking like one, because it is where the rest of what you
                mean to cook is kept — just not as recipes yet. */}
            {savedLinks !== null && (
              <li>
                {/* Six tints for seven tiles: this one repeats Dinner's, two rows away rather than next door. */}
                <Link to={SAVED_LINKS_PATH} className={catalogTileClass(coverClass('2'))}>
                  <CatalogTileFace
                    name="Saved links"
                    detail={`${savedLinks.length} ${savedLinks.length === 1 ? 'link' : 'links'}`}
                    iconKey="saved-links"
                    art={SavedLinksArt}
                  />
                </Link>
              </li>
            )}
          </ul>

          {/* Not a drawer of yours, so it keeps the long plain tile rather than looking like one. */}
          {sharedCount > 0 && (
            <Link
              to={`/recipes/section/${SHARED_KEY}`}
              className="block min-h-[4.5rem] rounded-2xl bg-surface2 p-4 transition-transform active:scale-[0.98]"
            >
              <p className="text-lg font-semibold leading-tight">Shared with you</p>
              <p className="text-sm text-muted">
                {sharedCount} {sharedCount === 1 ? 'recipe' : 'recipes'}
              </p>
              <p className="mt-1 text-xs text-faint">From other households</p>
            </Link>
          )}

          {all.length === 0 && (
            <Card>
              <EmptyState>
                No recipes yet —{' '}
                <Link to="/recipes/new" className="font-medium text-accent-ink underline">
                  add your first
                </Link>
                .
              </EmptyState>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
