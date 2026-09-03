import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../api/client';
import type { Recipe, ShareTarget } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Badge, Button, Card, CheckCircle, cx, EmptyState, Field, IconButton, Input, Sheet } from '../components/ui';
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon, TrashIcon } from '../components/icons';
import RecipeIndexCard from '../components/RecipeIndexCard';
import RecipeClassifier from '../components/RecipeClassifier';
import ImagePicker from '../components/ImagePicker';
import { formatMinutes, formatQuantity, instructionSteps, totalMinutes } from '../utils/recipeFormat';
import { sectionLabel, type Filing } from '../utils/recipeMeta';
import { isSafeLink, videoHostLabel } from '../utils/videoLink';

export default function RecipeDetailPage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const { activeHouseholdId } = useHousehold();

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

  useEffect(() => {
    if (!recipeId) return;
    setRecipe(null);
    setError(null);
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
    try {
      setRecipe(await api<Recipe>('PUT', `/api/recipes/${recipe.id}/video`, { videoUrl: url }));
    } catch (err) {
      setError(err instanceof ApiError ? 'That link needs to start with http:// or https://' : 'Could not save that link.');
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => navigate('/recipes')}>
          <ChevronLeftIcon className="h-5 w-5" />
          Recipes
        </Button>
        <div className="ml-auto flex items-center gap-1">
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
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={asCard ? 'primary' : 'secondary'} onClick={() => setAsCard((v) => !v)}>
          {asCard ? 'Normal view' : 'Index card'}
        </Button>
        {!asCard && (
          <Button
            variant={organizing ? 'primary' : 'secondary'}
            onClick={() => (organizing ? setOrganizing(false) : startOrganizing())}
          >
            {organizing ? 'Done' : recipe.section ? 'Organize' : 'Move to my catalog'}
          </Button>
        )}
        {mine && !asCard && (
          <Button variant="secondary" onClick={() => navigate(`/recipes/${recipe.id}/edit`)}>
            Edit
          </Button>
        )}
        {mine && !asCard && (
          <Button variant="secondary" onClick={openSharing}>
            {recipe.sharedWith.length ? `Shared · ${recipe.sharedWith.length}` : 'Share'}
          </Button>
        )}
      </div>

      {asCard ? (
        <RecipeIndexCard recipe={recipe} />
      ) : (
        <>
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
              {total ? <Badge tone="accent">Total {formatMinutes(total)}</Badge> : null}
              {recipe.shared && <Badge>From another household</Badge>}
              {mine && recipe.sharedWith.length > 0 && (
                <Badge tone="success">Shared with {recipe.sharedWith.length}</Badge>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={recipe.section ? 'accent' : 'neutral'}>{sectionLabel(recipe.section)}</Badge>
              {recipe.categories.map((c) => (
                <Badge key={c}>{c}</Badge>
              ))}
            </div>

            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block break-all text-sm font-medium text-accent underline"
              >
                {recipe.sourceUrl}
              </a>
            )}
          </Card>

          {organizing && draft && activeHouseholdId && (
            <Card title={recipe.section ? 'Organize' : 'Move to my catalog'}>
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

          {isSafeLink(recipe.videoUrl) && (
            <a
              href={recipe.videoUrl!}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-h-touch items-center justify-center gap-2 rounded-2xl bg-accent px-4
                         font-medium text-accent-ink"
            >
              <PlayIcon className="h-5 w-5" />
              Watch on {videoHostLabel(recipe.videoUrl!)}
            </a>
          )}

          <Card title={`Ingredients · ${recipe.ingredients.length}`}>
            {recipe.ingredients.length === 0 ? (
              <EmptyState>No ingredients listed.</EmptyState>
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
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(mine || recipe.photoIds.length > 0 || recipe.videoUrl) && (
            <Card title={`Photos${recipe.photoIds.length ? ` · ${recipe.photoIds.length}` : ''}`}>
              {recipe.photoIds.length === 0 ? (
                <p className="mb-3 text-sm text-muted">No photos yet.</p>
              ) : (
                <ul className="mb-3 grid grid-cols-3 gap-2">
                  {recipe.photoIds.map((id) => (
                    <li key={id} className="relative">
                      <img
                        src={imageUrl(id)}
                        alt=""
                        className="aspect-square w-full rounded-xl border border-line object-cover"
                      />
                      {mine && (
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
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {mine && (
                <div className="mb-3 border-b border-line pb-3">
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
                      <Button
                        variant="secondary"
                        disabled={photosBusy}
                        onClick={() => saveVideo(videoDraft.trim())}
                      >
                        Save
                      </Button>
                    </div>
                  </Field>
                  {recipe.videoUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1"
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
              )}

              {mine && (
                <ImagePicker
                  householdId={activeHouseholdId!}
                  multiple
                  onUploaded={(ids) =>
                    saveImages(recipe.coverImageId ?? ids[0] ?? null, [...recipe.photoIds, ...ids])
                  }
                >
                  Add photos
                </ImagePicker>
              )}
            </Card>
          )}

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
        </>
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
