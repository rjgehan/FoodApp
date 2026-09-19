import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../api/client';
import type { Recipe, ShareTarget } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { ActionMenu, Button, Card, CheckCircle, cx, EmptyState, ErrorText, Field, IconButton, Input, Sheet } from '../components/ui';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, TrashIcon } from '../components/icons';
import PlanRecipeSheet from '../components/PlanRecipeSheet';
import RecipeIndexCard from '../components/RecipeIndexCard';
import { PageTitle } from '../components/PageTitle';
import RecipeClassifier from '../components/RecipeClassifier';
import ImagePicker from '../components/ImagePicker';
import { formatMinutes, formatQuantity, instructionSteps, totalMinutes } from '../utils/recipeFormat';
import { sectionLabel, type Filing } from '../utils/recipeMeta';
import { isSafeLink, videoHostLabel } from '../utils/videoLink';

export default function RecipeDetailPage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const { activeHouseholdId, activeHousehold } = useHousehold();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [siblings, setSiblings] = useState<Recipe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asCard, setAsCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<Filing | null>(null);
  const [photosBusy, setPhotosBusy] = useState(false);
  const [videoDraft, setVideoDraft] = useState('');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [editingMedia, setEditingMedia] = useState(false);
  const [planning, setPlanning] = useState(false);
  // "Tue · Dinner" once this recipe has just been planned, so the page can say so.
  const [planned, setPlanned] = useState<string | null>(null);

  useEffect(() => {
    if (!recipeId) return;
    setRecipe(null);
    setError(null);
    setPlanned(null);
    setEditingMedia(false);
    setOrganizing(false);
    const scope = activeHouseholdId ? `?householdId=${activeHouseholdId}` : '';
    api<Recipe>('GET', `/api/recipes/${recipeId}${scope}`)
      .then(setRecipe)
      .catch((err) =>
        setError(err instanceof ApiError && err.status === 404 ? 'That recipe is gone.' : 'Could not load that recipe.'),
      );
  }, [recipeId, activeHouseholdId]);

  // The catalog order, so the arrows flip through the book rather than jumping around.
  useEffect(() => {
    if (!activeHouseholdId) return;
    api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`)
      .then((all) => setSiblings([...all].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setSiblings([]));
  }, [activeHouseholdId]);

  const { prev, next } = useMemo(() => {
    const i = siblings.findIndex((r) => r.id === recipeId);
    if (i === -1) return { prev: null, next: null };
    return { prev: siblings[i - 1] ?? null, next: siblings[i + 1] ?? null };
  }, [siblings, recipeId]);

  async function openSharing() {
    if (!recipe) return;
    setTargets(await api<ShareTarget[]>('GET', `/api/recipes/${recipe.id}/share-targets`));
    const { token } = await api<{ token: string | null }>('GET', `/api/recipes/${recipe.id}/link`);
    setLinkToken(token);
    setSharing(true);
  }

  function publicUrl(token: string): string {
    return `${window.location.origin}/r/${token}`;
  }

  async function createLink() {
    if (!recipe) return;
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>('POST', `/api/recipes/${recipe.id}/link`);
      setLinkToken(token);
    } finally {
      setBusy(false);
    }
  }

  async function revokeLink() {
    if (!recipe) return;
    setBusy(true);
    try {
      await api('DELETE', `/api/recipes/${recipe.id}/link`);
      setLinkToken(null);
      setCopied(false);
    } finally {
      setBusy(false);
    }
  }

  /** Clipboard writes fail on http origins and when the tab is not focused, so the readonly
   *  input above stays the fallback: the text is already selectable. */
  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function setShares(householdIds: string[]) {
    if (!recipe) return;
    setBusy(true);
    try {
      setRecipe(await api<Recipe>('PUT', `/api/recipes/${recipe.id}/shares`, { householdIds }));
      setTargets((prev) =>
        prev.map((t) => ({ ...t, shared: householdIds.includes(t.householdId) })),
      );
    } finally {
      setBusy(false);
    }
  }

  function startOrganizing() {
    if (!recipe) return;
    // An unfiled shared recipe has no section yet; Dinner is the least surprising landing spot.
    setDraft({ section: recipe.section ?? 'DINNER', categories: recipe.categories });
    setOrganizing(true);
  }

  async function saveClassification() {
    if (!recipe || !draft) return;
    setBusy(true);
    try {
      setRecipe(
        await api<Recipe>('PUT', `/api/households/${activeHouseholdId}/recipes/${recipe.id}/filing`, draft),
      );
      setOrganizing(false);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveVideo(url: string) {
    if (!recipe) return;
    setPhotosBusy(true);
    setVideoError(null);
    try {
      setRecipe(await api<Recipe>('PUT', `/api/recipes/${recipe.id}/video`, { videoUrl: url }));
      setVideoDraft('');
    } catch (err) {
      // Said next to the field. Setting the page error here replaced the whole recipe with it.
      const message = err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null;
      setVideoError(message ?? 'Could not save that link.');
    } finally {
      setPhotosBusy(false);
    }
  }

  /** One call sets both cover and strip, so every change goes through the same endpoint. */
  async function saveImages(coverImageId: string | null, photoIds: string[]) {
    if (!recipe) return;
    setPhotosBusy(true);
    try {
      setRecipe(await api<Recipe>('PUT', `/api/recipes/${recipe.id}/images`, { coverImageId, photoIds }));
    } finally {
      setPhotosBusy(false);
    }
  }

  if (error) {
    return (
      <Card>
        <EmptyState>
          {error}{' '}
          <Link to="/recipes" className="font-medium text-accent underline">
            Back to recipes
          </Link>
        </EmptyState>
      </Card>
    );
  }

  if (!recipe) {
    return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
  }

  const mine = recipe.householdId === activeHouseholdId;
  const total = totalMinutes(recipe);
  const steps = instructionSteps(recipe.instructions);

  const photoManager = mine && (
    <Card title="Photos & video">
      {recipe.photoIds.length === 0 ? (
        <p className="mb-3 text-sm text-muted">No photos yet.</p>
      ) : (
        <ul className="mb-3 grid grid-cols-3 gap-2">
          {recipe.photoIds.map((id) => (
            <li key={id} className="relative">
              <img src={imageUrl(id)} alt="" className="aspect-square w-full rounded-xl object-cover" />
              <div className="mt-1 flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1"
                  disabled={photosBusy || recipe.coverImageId === id}
                  onClick={() => saveImages(id, recipe.photoIds)}
                >
                  {recipe.coverImageId === id ? 'Cover' : 'Make cover'}
                </Button>
                <IconButton
                  label="Remove photo"
                  disabled={photosBusy}
                  onClick={() =>
                    saveImages(
                      recipe.coverImageId === id ? null : recipe.coverImageId,
                      recipe.photoIds.filter((p) => p !== id),
                    )
                  }
                >
                  <TrashIcon className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ImagePicker
        householdId={activeHouseholdId!}
        multiple
        onUploaded={(ids) => saveImages(recipe.coverImageId ?? ids[0] ?? null, [...recipe.photoIds, ...ids])}
      >
        Add photos
      </ImagePicker>

      <div className="mt-4 border-t border-line pt-3">
        <Field label="Video link" hint="Paste a TikTok (or any) video link.">
          <div className="flex gap-2">
            <Input
              type="url"
              inputMode="url"
              placeholder="https://www.tiktok.com/..."
              value={videoDraft || recipe.videoUrl || ''}
              onChange={(e) => setVideoDraft(e.target.value)}
              aria-label="Video link"
            />
            <Button variant="secondary" disabled={photosBusy} onClick={() => saveVideo(videoDraft.trim())}>
              Save
            </Button>
          </div>
        </Field>
        {videoError && <ErrorText>{videoError}</ErrorText>}
        {recipe.videoUrl && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 text-danger"
            disabled={photosBusy}
            onClick={() => {
              setVideoDraft('');
              saveVideo('');
            }}
          >
            Remove video
          </Button>
        )}
      </div>

      <Button full variant="secondary" className="mt-4" onClick={() => setEditingMedia(false)}>
        Done
      </Button>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => navigate('/recipes')}>
          <ChevronLeftIcon className="h-5 w-5" />
          Recipes
        </Button>
        <div className="ml-auto flex items-center">
          {asCard ? (
            <Button size="sm" variant="ghost" onClick={() => setAsCard(false)}>
              Done
            </Button>
          ) : (
            <>
              <IconButton
                label="Previous recipe"
                disabled={!prev}
                onClick={() => prev && navigate(`/recipes/${prev.id}`)}
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </IconButton>
              <IconButton label="Next recipe" disabled={!next} onClick={() => next && navigate(`/recipes/${next.id}`)}>
                <ChevronRightIcon className="h-5 w-5" />
              </IconButton>
              {/* Everything except cooking and planning it waits here. */}
              <ActionMenu
                label="Recipe options"
                title={recipe.name}
                items={[
                  mine && { label: 'Edit', onSelect: () => navigate(`/recipes/${recipe.id}/edit`) },
                  mine && {
                    label: recipe.sharedWith.length ? `Share · with ${recipe.sharedWith.length}` : 'Share',
                    onSelect: openSharing,
                  },
                  { label: recipe.section ? 'Organize' : 'Move to my recipes', onSelect: startOrganizing },
                  mine && { label: 'Photos & video', onSelect: () => setEditingMedia(true) },
                  { label: 'Index card', onSelect: () => setAsCard(true) },
                ]}
              />
            </>
          )}
        </div>
      </div>

      {asCard ? (
        <RecipeIndexCard recipe={recipe} />
      ) : (
        <>
          {recipe.coverImageId && (
            <img
              src={imageUrl(recipe.coverImageId)}
              alt={recipe.name}
              className="aspect-[4/3] w-full rounded-2xl object-cover"
            />
          )}

          {/* Two lines of plain facts where there used to be eight badges. */}
          <div>
            <PageTitle title={recipe.name} />
            {recipe.description && <p className="mt-1.5 text-muted">{recipe.description}</p>}
            <p className="mt-2 text-sm text-muted">
              {[
                `Serves ${recipe.servings}`,
                recipe.prepTimeMinutes ? `Prep ${formatMinutes(recipe.prepTimeMinutes)}` : null,
                recipe.cookTimeMinutes ? `Cook ${formatMinutes(recipe.cookTimeMinutes)}` : null,
                total && recipe.prepTimeMinutes && recipe.cookTimeMinutes ? `${formatMinutes(total)} in all` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="text-sm text-muted">
              {[sectionLabel(recipe.section), ...recipe.categories, recipe.shared ? 'from another household' : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block break-all text-sm font-medium text-accent underline"
              >
                {recipe.sourceUrl}
              </a>
            )}
          </div>

          {planned && (
            <p className="rounded-xl bg-success-soft px-4 py-3 text-[0.9375rem] font-medium text-success">
              On the plan for {planned} ·{' '}
              <Link to="/meal-plan" className="underline">
                See Plan
              </Link>
            </p>
          )}

          {/* The next step from a recipe is the plan, so that is the one filled button here. */}
          {activeHouseholdId && (
            <div className="space-y-2">
              <Button full size="lg" onClick={() => setPlanning(true)}>
                <CalendarIcon className="h-5 w-5" />
                Add to plan
              </Button>
              {isSafeLink(recipe.videoUrl) && (
                <a
                  href={recipe.videoUrl!}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="press flex min-h-touch items-center justify-center gap-2 rounded-xl bg-elevated px-4
                             font-semibold text-ink"
                >
                  <PlayIcon className="h-5 w-5" />
                  Watch on {videoHostLabel(recipe.videoUrl!)}
                </a>
              )}
            </div>
          )}

          {organizing && draft && activeHouseholdId && (
            <Card title={recipe.section ? 'Organize' : 'Move to my recipes'}>
              <RecipeClassifier householdId={activeHouseholdId} value={draft} onChange={setDraft} />
              <div className="mt-4 flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={saveClassification}>
                  Save
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOrganizing(false);
                    setDraft(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          )}

          {editingMedia && photoManager}

          <Card title={`Ingredients · ${recipe.ingredients.length}`}>
            {recipe.ingredients.length === 0 ? (
              <EmptyState>No ingredients yet — until they're in, planning this adds nothing to Groceries.</EmptyState>
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

          {/* Just the pictures while reading; managing them is behind ••• → Photos & video. */}
          {!editingMedia && recipe.photoIds.length > 1 && (
            <Card title="Photos">
              <ul className="grid grid-cols-3 gap-2">
                {recipe.photoIds.map((id) => (
                  <li key={id}>
                    <img src={imageUrl(id)} alt="" className="aspect-square w-full rounded-xl object-cover" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {planning && activeHouseholdId && (
        <PlanRecipeSheet
          householdId={activeHouseholdId}
          recipe={recipe}
          days={activeHousehold?.planningHorizonDays ?? 7}
          servings={activeHousehold?.defaultServings ?? recipe.servings}
          onClose={() => setPlanning(false)}
          onPlanned={(when) => {
            setPlanning(false);
            setPlanned(when);
          }}
        />
      )}

      {sharing && (
        <Sheet title="Share" onClose={() => setSharing(false)}>
          <div className="space-y-5">
            <section>
              <h3 className="font-semibold">Anyone with the link</h3>
              <p className="mt-0.5 text-sm text-muted">Opens the recipe on its own. No account needed.</p>
              {linkToken ? (
                <div className="mt-3 space-y-2">
                  <Input readOnly value={publicUrl(linkToken)} onFocus={(e) => e.target.select()} />
                  <div className="flex gap-2">
                    <Button className="flex-1" disabled={busy} onClick={() => copyLink(linkToken)}>
                      {copied ? 'Copied' : 'Copy link'}
                    </Button>
                    <Button variant="danger" disabled={busy} onClick={revokeLink}>
                      Revoke
                    </Button>
                  </div>
                </div>
              ) : (
                <Button className="mt-3" full disabled={busy} onClick={createLink}>
                  Create a link
                </Button>
              )}
            </section>

            <section className="border-t border-line pt-4">
              <h3 className="font-semibold">Share with a household</h3>
              {targets.length === 0 ? (
                <EmptyState>No other households yet.</EmptyState>
              ) : (
                <ul className="mt-1 divide-y divide-line">
                  {targets.map((t) => (
                    <li key={t.householdId}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setShares(
                            t.shared
                              ? recipe.sharedWith.filter((id) => id !== t.householdId)
                              : [...recipe.sharedWith, t.householdId],
                          )
                        }
                        className="flex min-h-touch w-full items-center gap-3 py-3 text-left"
                      >
                        <CheckCircle checked={t.shared} />
                        <span className="flex-1 font-medium">{t.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Sheet>
      )}

    </div>
  );
}
