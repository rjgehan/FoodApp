import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Recipe, RecipeSection } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Card, cx, EmptyState, Input } from '../components/ui';
import { PlusIcon } from '../components/icons';
import { coverClass } from '../utils/recipeFormat';
import { SECTION_OPTIONS, SHARED_KEY, sectionSlug } from '../utils/recipeMeta';
import { DEFAULT_SECTION_ICONS, iconByKey } from '../components/FoodIcons';
import RecipeGrid from '../components/RecipeGrid';

/**
 * The front of the catalog: pick a drawer first. Searching skips straight to results, because
 * when you already know what you want, browsing is in the way.
 */
export default function RecipesPage() {
  const { activeHouseholdId } = useHousehold();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [icons, setIcons] = useState<Partial<Record<RecipeSection, string>>>({});
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!activeHouseholdId) return;
    setRecipes(null);
    api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`).then(setRecipes);
    api<Partial<Record<RecipeSection, string>>>('GET', `/api/households/${activeHouseholdId}/section-icons`)
      .then(setIcons)
      .catch(() => setIcons({}));
  }, [activeHouseholdId]);

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
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  const all = recipes ?? [];
  const sharedCount = all.filter((r) => r.section === null).length;

  return (
    <div className="space-y-4">
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
      </div>

      {recipes === null ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : query.trim() ? (
        results.length === 0 ? (
          <Card>
            <EmptyState>Nothing matches that.</EmptyState>
          </Card>
        ) : (
          <RecipeGrid recipes={results} />
        )
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3">
            {SECTION_OPTIONS.map((s, i) => (
              <li key={s.value}>
                <SectionTile
                  to={`/recipes/section/${sectionSlug(s.value)}`}
                  label={s.label}
                  count={all.filter((r) => r.section === s.value).length}
                  tint={coverClass(String(i))}
                  iconKey={icons[s.value] ?? DEFAULT_SECTION_ICONS[s.value]}
                />
              </li>
            ))}
          </ul>

          {sharedCount > 0 && (
            <SectionTile
              to={`/recipes/section/${SHARED_KEY}`}
              label="Shared with you"
              count={sharedCount}
              hint="From other households — move them into your own catalog"
              wide
            />
          )}

          {all.length === 0 && (
            <Card>
              <EmptyState>
                No recipes yet —{' '}
                <Link to="/recipes/new" className="font-medium text-accent underline">
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

function SectionTile({
  to,
  label,
  count,
  tint,
  hint,
  iconKey,
  wide = false,
}: {
  to: string;
  label: string;
  count: number;
  tint?: string;
  hint?: string;
  iconKey?: string;
  wide?: boolean;
}) {
  const Icon = iconByKey(iconKey)?.Icon;

  return (
    <Link
      to={to}
      className={cx(
        'block overflow-hidden rounded-2xl border border-line transition-transform active:scale-[0.98]',
        tint ?? 'bg-surface',
      )}
    >
      <div className={cx('flex flex-col justify-end p-4', wide ? 'min-h-[4.5rem]' : 'aspect-[3/2]')}>
        {Icon && !wide && <Icon className="mb-auto h-9 w-9 text-ink/55" />}
        <p className="text-lg font-semibold leading-tight">{label}</p>
        <p className="text-sm text-muted">
          {count} {count === 1 ? 'recipe' : 'recipes'}
        </p>
        {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
      </div>
    </Link>
  );
}
