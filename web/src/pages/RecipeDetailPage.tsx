import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../api/client';
import type { Recipe, ShareTarget } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { ActionMenu, Button, Card, cx, EmptyState, ErrorText, IconButton, Sheet, SwitchKnob } from '../components/ui';
import LinkHandout from '../components/LinkHandout';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, PlusIcon, TrashIcon } from '../components/icons';
import PlanRecipeSheet from '../components/PlanRecipeSheet';
import RecipeIndexCard from '../components/RecipeIndexCard';
import { PageTitle } from '../components/PageTitle';
import RecipeClassifier from '../components/RecipeClassifier';
import ImagePicker from '../components/ImagePicker';
import LinksEditor, { fromDraftLinks, toDraftLinks, type DraftLink } from '../components/LinksEditor';
import { formatMinutes, formatQuantity, instructionSteps, totalMinutes } from '../utils/recipeFormat';
import { sectionLabel, type Filing } from '../utils/recipeMeta';
import { isSafeLink, isVideoLink } from '../utils/videoLink';
import LinkList, { FeaturedVideoName } from '../components/LinkList';

export default function RecipeDetailPage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const { activeHouseholdId, activeHousehold, households } = useHousehold();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [siblings, setSiblings] = useState<Recipe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asCard, setAsCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  /** "Turn off the link" pressed once: it asks before breaking every copy already sent. */
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [draft, setDraft] = useState<Filing | null>(null);
  const [photosBusy, setPhotosBusy] = useState(false);
  const [linkDrafts, setLinkDrafts] = useState<DraftLink[]>([]);
  const [linksError, setLinksError] = useState<string | null>(null);
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
    setShareError(null);
    setConfirmingRevoke(false);
    try {
      const [houses, link] = await Promise.all([
        api<ShareTarget[]>('GET', `/api/recipes/${recipe.id}/share-targets`),
        api<{ token: string | null }>('GET', `/api/recipes/${recipe.id}/link`),
      ]);
      setTargets(houses);
      setLinkToken(link.token);
      setSharing(true);
    } catch (err) {
      // Said under the header, not in place of the page: the recipe they were reading is fine.
      setShareError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
    }
  }

  function publicUrl(token: string): string {
    return `${window.location.origin}/r/${token}`;
  }

  async function createLink() {
    if (!recipe) return;
    setBusy(true);
    setShareError(null);
    try {
      const { token } = await api<{ token: string }>('POST', `/api/recipes/${recipe.id}/link`);
      setLinkToken(token);
    } catch (err) {
      setShareError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeLink() {
    if (!recipe) return;
    setBusy(true);
    setShareError(null);
    try {
      await api('DELETE', `/api/recipes/${recipe.id}/link`);
      setLinkToken(null);
      setConfirmingRevoke(false);
    } catch (err) {
      setShareError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Flips one of your own households. Only yours are sent: the server leaves a share somebody
   * else made — into a house you are not in — exactly where it is.
   */
  async function toggleShare(target: ShareTarget) {
    if (!recipe) return;
    const next = targets.map((t) => (t.householdId === target.householdId ? { ...t, shared: !t.shared } : t));
    setTargets(next);
    setBusy(true);
    setShareError(null);
    try {
      setRecipe(
        await api<Recipe>('PUT', `/api/recipes/${recipe.id}/shares`, {
          householdIds: next.filter((t) => t.shared).map((t) => t.householdId),
        }),
      );
    } catch (err) {
      setTargets(targets);
      setShareError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
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

  /** Opens photos and links for editing, starting from the links the recipe has now. */
  function startEditingMedia() {
    if (!recipe) return;
    setLinkDrafts(toDraftLinks(recipe.links));
    setLinksError(null);
    setEditingMedia(true);
  }

  /** True when they are saved, so Done knows it can close. */
  async function saveLinks(): Promise<boolean> {
    if (!recipe) return false;
    setPhotosBusy(true);
    setLinksError(null);
    try {
      const saved = await api<Recipe>('PUT', `/api/recipes/${recipe.id}/links`, { links: fromDraftLinks(linkDrafts) });
      setRecipe(saved);
      // Back as the server keeps them — https:// added, repeats gone — so what is on screen is what was saved.
      setLinkDrafts(toDraftLinks(saved.links));
      return true;
    } catch (err) {
      // Said next to the field. Setting the page error here replaced the whole recipe with it.
      setLinksError(err instanceof Error ? err.message : 'Could not save those links.');
      return false;
    } finally {
      setPhotosBusy(false);
    }
  }

  async function setPublished(published: boolean) {
    if (!recipe) return;
    setBusy(true);
    setShareError(null);
    try {
      // Only the switch is taken from the answer: the rest of the page — its drawer, its
      // groups — is already right, and is what Organize and Edit start from.
      const saved = await api<Recipe>('PUT', `/api/recipes/${recipe.id}/published`, { published });
      setRecipe((current) => (current ? { ...current, published: saved.published } : saved));
    } catch (err) {
      setShareError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
    } finally {
      setBusy(false);
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
  // Counted among your own houses only — the ones the Share sheet shows. A share somebody else
  // in this house made into a house you are not in is theirs, and would be a number with no
  // switch behind it.
  const sharedWithMine = recipe.sharedWith.filter((id) => households.some((h) => h.id === id)).length;
  const total = totalMinutes(recipe);
  const steps = instructionSteps(recipe.instructions);

  // The first video gets the big "Watch on …" button; every other link is listed underneath.
  const featuredVideo = recipe.links.find((l) => isVideoLink(l.url) && isSafeLink(l.url)) ?? null;
  const otherLinks = recipe.links.filter((l) => l !== featuredVideo && isSafeLink(l.url));
  const linksChanged =
    JSON.stringify(fromDraftLinks(linkDrafts)) !== JSON.stringify(recipe.links.map((l) => ({ url: l.url, label: l.label })));

  const photoManager = mine && (
    <Card title="Photos & links">
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
        <h3 className="font-semibold">Links</h3>
        <p className="text-sm text-muted">Where it came from, a video of it being made — as many as you like.</p>
        <LinksEditor value={linkDrafts} onChange={setLinkDrafts} />
        {linksError && <ErrorText>{linksError}</ErrorText>}
      </div>

      {/* One button: with links changed it saves them and closes, so there is never a "Done"
          beside a "Save" leaving people to wonder whether Done throws their edits away. */}
      <Button
        full
        variant={linksChanged ? 'primary' : 'secondary'}
        className="mt-4"
        disabled={photosBusy}
        onClick={async () => {
          if (!linksChanged || (await saveLinks())) setEditingMedia(false);
        }}
      >
        {linksChanged ? 'Save links' : 'Done'}
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
                    label: recipe.published
                      ? 'Share · in Explore'
                      : sharedWithMine
                        ? `Share · with ${sharedWithMine}`
                        : 'Share',
                    onSelect: openSharing,
                  },
                  { label: recipe.section ? 'Organize' : 'Save to my recipes', onSelect: startOrganizing },
                  mine && { label: 'Photos & links', onSelect: startEditingMedia },
                  { label: 'Index card', onSelect: () => setAsCard(true) },
                ]}
              />
            </>
          )}
        </div>
      </div>
      {shareError && !sharing && <ErrorText>{shareError}</ErrorText>}

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
              {[
                sectionLabel(recipe.section),
                ...recipe.categories,
                recipe.shared ? `from ${recipe.ownerName ?? 'another household'}` : null,
                !recipe.shared && recipe.published ? 'in Explore' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
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
              {recipe.shared && !recipe.section && (
                <Button full size="lg" variant="secondary" disabled={busy} onClick={startOrganizing}>
                  Save to my recipes
                </Button>
              )}
              {featuredVideo && (
                <a
                  href={featuredVideo.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="press flex min-h-touch items-center justify-center gap-2 rounded-xl bg-elevated px-4
                             font-semibold text-ink"
                >
                  <PlayIcon className="h-5 w-5" />
                  <FeaturedVideoName link={featuredVideo} />
                </a>
              )}
            </div>
          )}

          {!editingMedia && otherLinks.length > 0 && (
            <Card
              title="Links"
              actions={
                mine && (
                  <Button size="sm" variant="ghost" onClick={startEditingMedia}>
                    Edit
                  </Button>
                )
              }
            >
              <LinkList links={otherLinks} />
            </Card>
          )}

          {/* With no list to put an Edit on, the way in to adding one would be behind •••. */}
          {!editingMedia && mine && otherLinks.length === 0 && (
            <Button size="sm" variant="ghost" className="-ml-3" onClick={startEditingMedia}>
              <PlusIcon className="h-4 w-4" />
              Add link
            </Button>
          )}

          {organizing && draft && activeHouseholdId && (
            <Card title={recipe.section ? 'Organize' : 'Save to my recipes'}>
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
              <p className="mt-0.5 text-sm text-muted">
                Opens the recipe on its own — no account needed. Anyone with an account can save
                a copy to their own recipes.
              </p>
              {linkToken ? (
                <div className="mt-3 space-y-3">
                  <LinkHandout url={publicUrl(linkToken)} shareTitle={recipe.name} qr="toggle" />
                  {/* Asks first, as the phone does: a new link is a different address, so every
                      one already sent is gone for good. */}
                  {confirmingRevoke ? (
                    <div className="space-y-3 rounded-xl bg-elevated p-3">
                      <p className="text-sm">
                        Anyone you sent it to won't be able to open it any more. Copies people
                        already saved stay theirs.
                      </p>
                      <div className="flex gap-2">
                        <Button variant="danger" size="sm" className="flex-1" disabled={busy} onClick={revokeLink}>
                          {busy ? 'Turning off…' : 'Turn off the link'}
                        </Button>
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmingRevoke(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 text-danger"
                      disabled={busy}
                      onClick={() => setConfirmingRevoke(true)}
                    >
                      Turn off the link
                    </Button>
                  )}
                </div>
              ) : (
                <Button className="mt-3" full variant="secondary" disabled={busy} onClick={createLink}>
                  Create a link
                </Button>
              )}
            </section>

            {/* Only the other houses you are in — none at all for somebody in just this one. */}
            {targets.length > 0 && (
              <section className="border-t border-line pt-4">
                <h3 className="font-semibold">Your other households</h3>
                <p className="mt-0.5 text-sm text-muted">
                  It shows up in their recipes too. Only this household can change it.
                </p>
                <ul className="mt-1 divide-y divide-line">
                  {targets.map((t) => (
                    <li key={t.householdId}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={t.shared}
                        disabled={busy}
                        onClick={() => toggleShare(t)}
                        className="flex min-h-touch w-full items-center gap-3 py-3 text-left"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                        <SwitchKnob on={t.shared} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="border-t border-line pt-4">
              <h3 className="font-semibold">Explore</h3>
              <p className="mt-0.5 text-sm text-muted">
                {recipe.published
                  ? 'Anyone signed in here can read this and keep it in their own recipes.'
                  : 'Put it where every household on this server can find it.'}
              </p>
              {/* A switch, like the households above and the phone's: it takes effect when flipped. */}
              <button
                type="button"
                role="switch"
                aria-checked={recipe.published}
                disabled={busy}
                onClick={() => setPublished(!recipe.published)}
                className="mt-1 flex min-h-touch w-full items-center gap-3 py-3 text-left"
              >
                <span className="min-w-0 flex-1 font-medium">In Explore</span>
                <SwitchKnob on={recipe.published} />
              </button>
            </section>

            {shareError && <ErrorText>{shareError}</ErrorText>}
          </div>
        </Sheet>
      )}

    </div>
  );
}
