import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Button, Card, Chip, EmptyState } from '../components/ui';
import { ChevronLeftIcon } from '../components/icons';
import RecipeGrid from '../components/RecipeGrid';
import { SHARED_KEY, sectionFromSlug, sectionLabel } from '../utils/recipeMeta';

/** One drawer of the catalog, with this household's sub-categories as the second level. */
export default function RecipeSectionPage() {
  const { section: slug } = useParams<{ section: string }>();
  const { activeHouseholdId } = useHousehold();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const isShared = slug === SHARED_KEY;
  const section = sectionFromSlug(slug);

  useEffect(() => {
    if (!activeHouseholdId) return;
    setRecipes(null);
    setCategory(null);
    api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`).then(setRecipes);
  }, [activeHouseholdId, slug]);

  const inSection = useMemo(
    () =>
      (recipes ?? [])
        .filter((r) => (isShared ? r.section === null : r.section === section))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [recipes, section, isShared],
  );

  // Only offer sub-categories that actually appear in this drawer.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of inSection) {
      for (const c of r.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [inSection]);

  const shown = category ? inSection.filter((r) => r.categories.includes(category)) : inSection;

  if (!activeHouseholdId) {
    return (
      <Card>
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  if (!isShared && !section) {
    return (
      <Card>
        <EmptyState>
          No such section.{' '}
          <Link to="/recipes" className="font-medium text-accent underline">
            Back to the catalog
          </Link>
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/recipes">
          <Button variant="ghost" size="sm">
            <ChevronLeftIcon className="h-5 w-5" />
            Catalog
          </Button>
        </Link>
        <h1 className="ml-auto text-lg font-semibold">{isShared ? 'Shared with you' : sectionLabel(section)}</h1>
      </div>

      {isShared && inSection.length > 0 && (
        <p className="text-sm text-muted">
          Recipes other households published. Open one and hit Organize to move it into your own catalog.
        </p>
      )}

      {categories.length > 0 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
          <Chip active={!category} onClick={() => setCategory(null)}>
            All · {inSection.length}
          </Chip>
          {categories.map(([name, count]) => (
            <Chip key={name} active={category === name} onClick={() => setCategory(category === name ? null : name)}>
              {name} · {count}
            </Chip>
          ))}
        </div>
      )}

      {recipes === null ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState>
            {inSection.length === 0 ? 'Nothing filed here yet.' : 'Nothing in that sub-category.'}
          </EmptyState>
        </Card>
      ) : (
        <RecipeGrid recipes={shown} />
      )}
    </div>
  );
}
