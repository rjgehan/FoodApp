import { Link, useParams } from 'react-router-dom';
import { imageUrl } from '../api/client';
import type { AdminRecipeDetail } from '../api/types';
import { AdminBack, formatDay, LoadError, RecipeBadges, useAdminData } from '../components/AdminParts';
import LinkList from '../components/LinkList';
import { PageTitle } from '../components/PageTitle';
import { Card, cx, EmptyState } from '../components/ui';
import { formatMinutes, formatQuantity, instructionSteps } from '../utils/recipeFormat';
import { sectionLabel } from '../utils/recipeMeta';

/**
 * Any recipe on the server, as its own household sees it — and only to read. The recipe page in
 * the app is built around acting on a recipe from inside your house (plan it, file it, edit it),
 * none of which applies to somebody else's, so this is its own, plainer page.
 */
export default function AdminRecipePage() {
  const { recipeId } = useParams();
  const { data, error, reload } = useAdminData<AdminRecipeDetail>(recipeId ? `/api/admin/recipes/${recipeId}` : null);
  const recipe = data?.recipe;
  const steps = recipe ? instructionSteps(recipe.instructions) : [];
  const photos = recipe ? recipe.photoIds.filter((id) => id !== recipe.coverImageId) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <AdminBack />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <p className="py-8 text-center text-sm text-muted">Loading…</p>}
      {data && recipe && (
        <>
          {recipe.coverImageId && (
            <img
              src={imageUrl(recipe.coverImageId)}
              alt={recipe.name}
              className="aspect-[4/3] w-full rounded-2xl object-cover md:aspect-[16/7]"
            />
          )}

          <div>
            <PageTitle title={recipe.name} />
            <p className="mt-1.5 text-[0.9375rem]">
              From{' '}
              <Link to={`/admin/households/${recipe.householdId}`} className="font-medium text-accent hover:underline">
                {data.householdName}
              </Link>
              <span className="text-muted"> · added {formatDay(data.createdAt)}</span>
            </p>
            {recipe.description && <p className="mt-1.5 text-muted">{recipe.description}</p>}
            <p className="mt-2 text-sm text-muted">
              {[
                `Serves ${recipe.servings}`,
                recipe.prepTimeMinutes ? `Prep ${formatMinutes(recipe.prepTimeMinutes)}` : null,
                recipe.cookTimeMinutes ? `Cook ${formatMinutes(recipe.cookTimeMinutes)}` : null,
                recipe.section ? sectionLabel(recipe.section) : 'Not filed',
                ...recipe.categories,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="mt-2">
              <RecipeBadges
                recipe={{ published: recipe.published, sharedWith: data.sharedWith, hasPublicLink: data.hasPublicLink }}
              />
            </div>
          </div>

          <Card title={`Ingredients · ${recipe.ingredients.length}`}>
            {recipe.ingredients.length === 0 ? (
              <EmptyState>No ingredients.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {recipe.ingredients.map((i) => (
                  <li key={i.id} className="flex items-baseline gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="w-24 shrink-0 font-medium tabular-nums">
                      {formatQuantity(i.quantity)} {i.unit}
                    </span>
                    <span className="min-w-0">
                      {i.ingredientName}
                      {i.notes && <span className="text-muted">, {i.notes}</span>}
                      {i.optional && <span className="text-muted"> · optional</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {steps.length > 0 && (
            <Card title="Method">
              <ol className="space-y-3">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className={cx(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                        'bg-accent-soft text-sm font-semibold text-accent',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {recipe.links.length > 0 && (
            <Card title="Links">
              <LinkList links={recipe.links} />
            </Card>
          )}

          {photos.length > 0 && (
            <Card title="Photos">
              <ul className="grid grid-cols-3 gap-2 md:grid-cols-4">
                {photos.map((id) => (
                  <li key={id}>
                    <img src={imageUrl(id)} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
