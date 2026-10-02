import { useEffect, useMemo, useState } from 'react';
import NoHousehold from '../components/NoHousehold';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Recipe, RecipeCategory, RecipeSection, SavedLink } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Card, cx, EmptyState, List, Pill, Row, SearchField, SectionLabel, Tile } from '../components/ui';
import { Icon } from '../components/icons';
import { isNewShare, SECTION_OPTIONS, SHARED_KEY, sectionSlug, sharedSeenAt } from '../utils/recipeMeta';
import { DEFAULT_SECTION_ICONS } from '../components/FoodIcons';
import { SAVED_LINKS_PATH, sourceLabel } from '../utils/savedLinks';
import { buildTree } from '../utils/categoryTree';
import { PageTitle } from '../components/PageTitle';
import {
  DRAWER_TONES,
  DrawerCard,
  filingTrail,
  HideTopBar,
  RecipeResultRow,
} from '../components/catalogue/CatalogueParts';

/**
 * The front of the catalogue (the mockup's 3.1): six drawers with their counts, then Saved links
 * and Shared with you. Searching skips straight to results (3.2) — the recipes, with where each
 * is filed, and any saved links that match gathered into one row — because when you already
 * know what you want, browsing is in the way.
 */
export default function RecipesPage() {
  const { activeHouseholdId } = useHousehold();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [icons, setIcons] = useState<Partial<Record<RecipeSection, string>>>({});
  // Null until loaded, and left null by an older server that has none, so no row flashes a 0.
  const [savedLinks, setSavedLinks] = useState<SavedLink[] | null>(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!activeHouseholdId) return;
    setRecipes(null);
    setSavedLinks(null);
    // Refused when you have just been taken out of this house: the switch to another of yours
    // loads that one's, so this one is let go rather than left as an uncaught error.
    api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`)
      .then(setRecipes)
      .catch(() => {});
    api<RecipeCategory[]>('GET', `/api/households/${activeHouseholdId}/recipe-categories`)
      .then(setCategories)
      .catch(() => setCategories([]));
    api<Partial<Record<RecipeSection, string>>>('GET', `/api/households/${activeHouseholdId}/section-icons`)
      .then(setIcons)
      .catch(() => setIcons({}));
    api<SavedLink[]>('GET', `/api/households/${activeHouseholdId}/saved-links`)
      .then(setSavedLinks)
      .catch(() => setSavedLinks(null));
  }, [activeHouseholdId]);

  const q = query.trim().toLowerCase();
  const tree = useMemo(() => buildTree(categories), [categories]);

  // A search reaches the saved links too: "that pasta TikTok" is still what you are looking for.
  const linkResults = useMemo(
    () => (q ? (savedLinks ?? []).filter((l) => l.name.toLowerCase().includes(q)) : []),
    [savedLinks, q],
  );

  const results = useMemo(() => {
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
  }, [recipes, q]);

  if (!activeHouseholdId) {
    return (
      <Card>
        <NoHousehold />
      </Card>
    );
  }

  const all = recipes ?? [];
  const shared = all.filter((r) => r.section === null);
  const seenAt = sharedSeenAt(activeHouseholdId);
  const newShares = shared.filter((r) => isNewShare(r, seenAt)).length;
  const searching = q !== '' || focused;

  function cancelSearch() {
    setQuery('');
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  return (
    <div className="space-y-4">
      {/* Searching takes the top of the screen, as it does on iOS; a computer keeps its title. */}
      {searching && <HideTopBar />}
      <div className={cx(searching && 'hidden md:block')}>
        {/* The search sits close under the title, as in the mockup: the page's own gap is enough. */}
        <PageTitle title="Recipes" className="max-md:pb-0">
          <Link
            to="/recipes/new"
            aria-label="Add a recipe"
            title="Add a recipe"
            className="press flex h-9 w-9 items-center justify-center rounded-full bg-accent text-on-accent active:brightness-95"
          >
            <Icon name="plus" size={16} />
          </Link>
        </PageTitle>
      </div>

      <div className={cx('flex items-center gap-2.5', searching && 'pt-1.5 md:pt-0')}>
        <SearchField
          className="flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search recipes and saved links"
          aria-label="Search recipes"
          end={
            query ? (
              <button
                type="button"
                aria-label="Clear search"
                // Keep the field focused: clearing is for typing something else.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuery('')}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-muted"
              >
                <Icon name="x" size={11} strokeWidth={2.6} />
              </button>
            ) : null
          }
        />
        {searching && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelSearch}
            className="press shrink-0 text-[1.0625rem] text-accent-ink"
          >
            Cancel
          </button>
        )}
      </div>

      {recipes === null ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : q ? (
        results.length === 0 && linkResults.length === 0 ? (
          <Card>
            <EmptyState>Nothing matches that.</EmptyState>
          </Card>
        ) : (
          <div className="space-y-3.5">
            {results.length > 0 && (
              <div>
                <SectionLabel>Recipes · {results.length}</SectionLabel>
                <List label="Recipes found">
                  {results.map((r) => (
                    <RecipeResultRow key={r.id} recipe={r} subtitle={filingTrail(r, tree)} />
                  ))}
                </List>
              </div>
            )}
            {linkResults.length > 0 && (
              <List label="Saved links found">
                <Row
                  to={`${SAVED_LINKS_PATH}?q=${encodeURIComponent(query.trim())}`}
                  lead={<Tile icon="link" tone="plum" size={44} radius={12} />}
                  title={`${linkResults.length} saved ${linkResults.length === 1 ? 'link matches' : 'links match'} "${query.trim()}"`}
                  subtitle={countBySource(linkResults)}
                  chevron
                />
              </List>
            )}
          </div>
        )
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SECTION_OPTIONS.map((s) => (
              <li key={s.value}>
                <DrawerCard
                  to={`/recipes/section/${sectionSlug(s.value)}`}
                  name={s.label}
                  count={all.filter((r) => r.section === s.value).length}
                  iconKey={icons[s.value] ?? DEFAULT_SECTION_ICONS[s.value]}
                  tone={DRAWER_TONES[s.value]}
                />
              </li>
            ))}
          </ul>

          {/* Not drawers of yours: what you mean to cook that is not a recipe yet, and what other
              households sent over. Rows rather than cards, so they never pass for a drawer. */}
          {(savedLinks !== null || shared.length > 0) && (
            <List label="More recipes" inset={0}>
              {savedLinks !== null && (
                <Row
                  to={SAVED_LINKS_PATH}
                  lead={
                    <span data-icon="saved-links">
                      <Tile icon="link" tone="plum" size={36} />
                    </span>
                  }
                  title="Saved links"
                  subtitle="Recipes to try later"
                  detail={savedLinks.length}
                  chevron
                />
              )}
              {shared.length > 0 && (
                <Row
                  to={`/recipes/section/${SHARED_KEY}`}
                  lead={<Tile icon="users" tone="sky" size={36} />}
                  title="Shared with you"
                  subtitle={fromWhom(shared)}
                  detail={shared.length}
                  end={newShares > 0 ? <Pill tone="accent">{newShares} new</Pill> : undefined}
                  chevron
                />
              )}
            </List>
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

/** "TikTok · 2, BBC Good Food · 1" — where the matching links are from, most first. */
function countBySource(links: SavedLink[]): string {
  const counts = new Map<string, number>();
  for (const link of links) counts.set(sourceLabel(link), (counts.get(sourceLabel(link)) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, n]) => `${source} · ${n}`)
    .join(', ');
}

/** "From Beach crew and 1 other" — the households that shared them. */
function fromWhom(recipes: Recipe[]): string {
  const names = [...new Set(recipes.map((r) => r.ownerName).filter((n): n is string => !!n))];
  if (names.length === 0) return 'From other households';
  if (names.length === 1) return `From ${names[0]}`;
  return `From ${names[0]} and ${names.length - 1} ${names.length === 2 ? 'other' : 'others'}`;
}
