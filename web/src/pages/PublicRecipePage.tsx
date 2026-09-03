import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, imageUrl } from '../api/client';
import type { PublicRecipe } from '../api/types';
import { Badge, Card, EmptyState } from '../components/ui';
import { PlayIcon } from '../components/icons';
import { formatMinutes, formatQuantity, instructionSteps, totalMinutes } from '../utils/recipeFormat';
import { isSafeLink, videoHostLabel } from '../utils/videoLink';

/**
 * A recipe opened from a share link by someone with no account.
 *
 * Read-only and self-contained on purpose: no navigation, no sign-in prompt, and nothing
 * inviting the reader to make an account. They were sent a recipe, so they get a recipe.
 */
export default function PublicRecipePage() {
  const { token } = useParams<{ token: string }>();
  const [recipe, setRecipe] = useState<PublicRecipe | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<PublicRecipe>('GET', `/api/public/recipes/${encodeURIComponent(token)}`)
      .then(setRecipe)
      .catch(() => setMissing(true));
  }, [token]);

  if (missing) {
    return (
      <Shell>
        <Card>
          <EmptyState>This link isn't valid any more.</EmptyState>
        </Card>
      </Shell>
    );
  }

  if (!recipe) {
    return (
      <Shell>
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      </Shell>
    );
  }

  const total = totalMinutes(recipe);
  const steps = instructionSteps(recipe.instructions);

  return (
    <Shell>
      {recipe.coverImageId && (
        <img
          src={imageUrl(recipe.coverImageId)}
          alt={recipe.name}
          className="aspect-[4/3] w-full rounded-2xl border border-line object-cover"
        />
      )}

      <Card>
        <h1 className="text-2xl font-semibold leading-tight">{recipe.name}</h1>
        {recipe.description && <p className="mt-1.5 text-muted">{recipe.description}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>Serves {recipe.servings}</Badge>
          {recipe.prepTimeMinutes ? <Badge>Prep {formatMinutes(recipe.prepTimeMinutes)}</Badge> : null}
          {recipe.cookTimeMinutes ? <Badge>Cook {formatMinutes(recipe.cookTimeMinutes)}</Badge> : null}
          {total ? <Badge tone="success">{formatMinutes(total)} total</Badge> : null}
        </div>

        {isSafeLink(recipe.videoUrl) && (
          <a
            href={recipe.videoUrl!}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 flex min-h-touch items-center gap-2 rounded-xl bg-accent-soft px-4 font-medium text-accent"
          >
            <PlayIcon className="h-5 w-5" />
            Watch on {videoHostLabel(recipe.videoUrl!)}
          </a>
        )}
      </Card>

      <Card title={`Ingredients${recipe.servings ? ` · serves ${recipe.servings}` : ''}`}>
        <ul className="divide-y divide-line">
          {recipe.ingredients.map((i, idx) => (
            <li key={idx} className="flex gap-3 py-2.5">
              <span className="min-w-16 font-medium tabular-nums">
                {formatQuantity(i.quantity)} {i.unit}
              </span>
              <span className="flex-1">
                {i.ingredientName}
                {i.notes && <span className="text-muted"> — {i.notes}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {steps.length > 0 && (
        <Card title="Steps">
          <ol className="space-y-3">
            {steps.map((step, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                  {idx + 1}
                </span>
                <span className="flex-1 pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {recipe.photoIds.length > 0 && (
        <Card title="Photos">
          <div className="grid grid-cols-2 gap-2">
            {recipe.photoIds.map((id) => (
              <img
                key={id}
                src={imageUrl(id)}
                alt=""
                className="aspect-square w-full rounded-xl border border-line object-cover"
              />
            ))}
          </div>
        </Card>
      )}

      {isSafeLink(recipe.sourceUrl) && (
        <p className="pb-2 text-center text-sm">
          <a href={recipe.sourceUrl!} target="_blank" rel="noreferrer noopener" className="text-muted underline">
            Original recipe
          </a>
        </p>
      )}
    </Shell>
  );
}

/** Its own frame — the app's Layout carries a nav bar, which a guest has no use for. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-lg space-y-4 px-4 py-6 pb-safe pt-safe">{children}</div>
  );
}
