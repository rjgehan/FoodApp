import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../api/client';
import type { Household, PublicRecipe, Recipe } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, Card, EmptyState, ErrorText, Sheet } from '../components/ui';
import { PlayIcon } from '../components/icons';
import { formatMinutes, formatQuantity, instructionSteps, totalMinutes } from '../utils/recipeFormat';
import { isSafeLink, isVideoLink } from '../utils/videoLink';
import LinkList, { FeaturedVideoName } from '../components/LinkList';
import LoginPage from './LoginPage';

/**
 * A recipe opened from a share link — most often by someone with no account.
 *
 * Read-only and self-contained on purpose: no navigation, and nothing inviting the reader to
 * make an account. They were sent a recipe, so they get a recipe. The one thing added is a
 * quiet "Save to my recipes" at the end, for somebody who does have an account here: it signs
 * them in if they need it, comes straight back, and keeps a copy in one of their households.
 */
export default function PublicRecipePage() {
  const { token } = useParams<{ token: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<PublicRecipe | null>(null);
  const [missing, setMissing] = useState(false);
  /** They pressed Save while signed out, and are signing in to carry on with it. */
  const [signingIn, setSigningIn] = useState(false);
  /** More than one household to choose from: the picker is open with these in it. */
  const [choices, setChoices] = useState<Household[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wantsSave = useRef(false);

  useEffect(() => {
    if (!token) return;
    api<PublicRecipe>('GET', `/api/public/recipes/${encodeURIComponent(token)}`)
      .then(setRecipe)
      .catch(() => setMissing(true));
  }, [token]);

  async function saveInto(householdId: string) {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api<Recipe>('POST', `/api/public/recipes/${encodeURIComponent(token)}/save`, {
        householdId,
      });
      // The app opens on the house the copy went into, so the recipe it lands on is there.
      localStorage.setItem('mp_activeHouseholdId', householdId);
      api('PUT', '/api/users/me/active-household', { householdId }).catch(() => {});
      navigate(`/recipes/${saved.id}`);
    } catch (err) {
      // The recipe is still on screen, so "isn't valid" would read as nonsense: it was, a
      // moment ago, until the person who sent it turned it off.
      setSaveError(
        err instanceof ApiError && err.status === 404
          ? 'This link has been turned off, so it can’t be saved any more.'
          : err instanceof ApiError
            ? err.message
            : 'Cannot reach the server.',
      );
      setSaving(false);
    }
  }

  /** One household: straight in. Several: they pick. None: they are told why nothing happened. */
  async function startSave() {
    if (saving) return;
    setSaveError(null);
    setSaving(true);
    let households: Household[];
    try {
      households = await api<Household[]>('GET', '/api/households');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
      setSaving(false);
      return;
    }
    if (households.length === 1) {
      await saveInto(households[0].id);
      return;
    }
    setSaving(false);
    if (households.length === 0) {
      setSaveError("You're not in a household yet, so there's nowhere to keep it. Join one with an invite link first.");
      return;
    }
    // The one they were last looking at first — the likeliest answer.
    const current = localStorage.getItem('mp_activeHouseholdId');
    setChoices([...households].sort((a, b) => Number(b.id === current) - Number(a.id === current)));
  }

  function onSave() {
    if (session) {
      startSave();
    } else {
      wantsSave.current = true;
      setSigningIn(true);
    }
  }

  // Signed in from here: carry on with the save they asked for, on the same page.
  useEffect(() => {
    if (session && wantsSave.current) {
      wantsSave.current = false;
      setSigningIn(false);
      startSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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

  if (signingIn && !session) {
    return (
      <LoginPage
        notice={`Sign in to save ${recipe.name} to your recipes`}
        leave={{
          label: 'Back to the recipe',
          onLeave: () => {
            wantsSave.current = false;
            setSigningIn(false);
          },
        }}
      />
    );
  }

  const total = totalMinutes(recipe);
  const steps = instructionSteps(recipe.instructions);
  // The first video gets the big button, as in the app; the rest are listed at the end.
  const links = (recipe.links ?? []).filter((l) => isSafeLink(l.url));
  const featuredVideo = links.find((l) => isVideoLink(l.url)) ?? null;
  const otherLinks = links.filter((l) => l !== featuredVideo);

  return (
    <Shell>
      {recipe.coverImageId && (
        <img
          src={imageUrl(recipe.coverImageId)}
          alt={recipe.name}
          className="aspect-[4/3] w-full rounded-2xl object-cover"
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

        {featuredVideo && (
          <a
            href={featuredVideo.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 flex min-h-touch items-center gap-2 rounded-xl bg-accent-soft px-4 font-medium text-accent"
          >
            <PlayIcon className="h-5 w-5" />
            <FeaturedVideoName link={featuredVideo} />
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
                {i.optional && <span className="text-muted"> · optional</span>}
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
                className="aspect-square w-full rounded-xl object-cover"
              />
            ))}
          </div>
        </Card>
      )}

      {otherLinks.length > 0 && (
        <Card title="Links">
          <LinkList links={otherLinks} />
        </Card>
      )}

      {/* Quiet, and last: the page is for reading, and most people who open it have no account. */}
      <div className="space-y-2 pb-4 text-center">
        <Button variant="secondary" disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save to my recipes'}
        </Button>
        {!session && <p className="text-xs text-muted">For people with a Meal Planner account.</p>}
        {saveError && <ErrorText>{saveError}</ErrorText>}
      </div>

      {choices && (
        <Sheet title="Save to which household?" onClose={() => setChoices(null)}>
          <ul className="divide-y divide-line">
            {choices.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setChoices(null);
                    saveInto(h.id);
                  }}
                  className="press flex min-h-touch w-full items-center py-3 text-left font-medium"
                >
                  {h.name}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
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
