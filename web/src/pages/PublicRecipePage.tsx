import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../api/client';
import type { Household, PublicRecipe, Recipe } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Avatar, Button, CheckCircle, cx, ErrorText, List, Photo, Pill, Row, SectionHead, Sheet, StepNumber, type Tone } from '../components/ui';
import { Icon } from '../components/icons';
import { MessageScreen } from '../components/welcome';
import { toast, Toaster } from '../components/toast';
import { formatMinutes, formatQuantity, instructionSteps } from '../utils/recipeFormat';
import { isSafeLink, isVideoLink, linkName, videoHostLabel } from '../utils/videoLink';
import LoginPage from './LoginPage';

/** Each household's colour in the picker, as in the app's switcher. */
const HOUSE_TONES: Tone[] = ['herb', 'sky', 'plum', 'mustard', 'accent'];

/**
 * The line under a house in "Save a copy to…": how many recipes it has, which is what tells two
 * houses apart when the question is where a recipe goes. People, from a server too old to count.
 * (The mockup adds "· Dinner drawer" to the ticked one; a public link does not say how the
 * recipe was filed, so that part is left out.)
 */
function houseFacts(h: Household): string {
  if (h.recipeCount != null) return `${h.recipeCount} ${h.recipeCount === 1 ? 'recipe' : 'recipes'}`;
  return `${h.memberCount} ${h.memberCount === 1 ? 'person' : 'people'}`;
}

/**
 * A recipe opened from a share link — most often by someone with no account.
 *
 * Read-only and self-contained on purpose: no navigation, and nothing inviting the reader to
 * make an account. They were sent a recipe, so they get a recipe. The one thing added is "Save
 * to my recipes", pinned along the bottom, for somebody who does have an account here: it signs
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
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** How many the ingredients are shown for: the recipe's own number until somebody changes it. */
  const [servings, setServings] = useState<number | null>(null);
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
    // The one they were last looking at first — the likeliest answer, and ticked to begin with.
    const current = localStorage.getItem('mp_activeHouseholdId');
    const sorted = [...households].sort((a, b) => Number(b.id === current) - Number(a.id === current));
    setPicked(sorted[0].id);
    setChoices(sorted);
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

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: recipe?.name, url });
      } catch {
        // Closed the share sheet: nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('Couldn’t copy the link');
    }
  }

  if (missing) {
    // A way on, like the other dead links: into the app for somebody with an account here.
    return (
      <MessageScreen
        icon="broken"
        title="This recipe is no longer shared"
        actions={
          <Button variant="secondary" full size="lg" onClick={() => navigate(session ? '/recipes' : '/', { replace: true })}>
            {session ? 'Open Meal Planner' : 'Go to sign in'}
          </Button>
        }
      >
        Whoever sent it has turned its link off, so there is nothing to see here any more.
      </MessageScreen>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-[100dvh] bg-bg">
        <p className="py-16 text-center text-sm text-muted">Loading…</p>
      </div>
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

  const steps = instructionSteps(recipe.instructions);
  const links = (recipe.links ?? []).filter((l) => isSafeLink(l.url));
  const pictures = [recipe.coverImageId, ...recipe.photoIds].filter((id, i, all): id is string => !!id && all.indexOf(id) === i);
  const shown = servings ?? recipe.servings;
  const scale = recipe.servings > 0 ? shown / recipe.servings : 1;
  const choice = choices?.find((h) => h.id === picked) ?? null;

  return (
    <div className="min-h-[100dvh] bg-bg">
      <div className="mx-auto w-full max-w-2xl sm:px-5 sm:pt-6">
        <Hero pictures={pictures} name={recipe.name} onShare={share} />

        <main className="flex flex-col gap-4 px-5 pb-36 pt-[18px] sm:px-0">
          <div className="flex flex-col gap-1.5">
            <h1 className="serif text-[1.75rem] leading-tight">{recipe.name}</h1>
            {(recipe.prepTimeMinutes || recipe.cookTimeMinutes) && (
              <div className="flex flex-wrap gap-3 text-[0.8125rem] text-muted">
                {recipe.prepTimeMinutes ? (
                  <span className="flex items-center gap-1">
                    <Icon name="clock" size={14} />
                    {formatMinutes(recipe.prepTimeMinutes)} prep
                  </span>
                ) : null}
                {recipe.cookTimeMinutes ? (
                  <span className="flex items-center gap-1">
                    <Icon name="flame" size={14} />
                    {formatMinutes(recipe.cookTimeMinutes)} cook
                  </span>
                ) : null}
              </div>
            )}
            {recipe.description && <p className="mt-1 text-[0.9375rem] text-muted">{recipe.description}</p>}
          </div>

          {links.length > 0 && (
            <div className="flex flex-wrap gap-2.5">
              {links.map((link, i) => {
                const video = isVideoLink(link.url);
                const named = link.label?.trim();
                // As in the app: a named video still says where it plays.
                const label = named
                  ? video
                    ? `${named} · ${videoHostLabel(link.url)}`
                    : named
                  : video
                    ? `Watch on ${videoHostLabel(link.url)}`
                    : linkName(link);
                return (
                  <a
                    key={`${link.url}-${i}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="press inline-flex h-9 max-w-full items-center gap-1.5 rounded-[11px] border border-line bg-surface px-3.5 text-[0.875rem] font-semibold"
                  >
                    <Icon name={video ? 'play' : 'link'} size={16} className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </a>
                );
              })}
            </div>
          )}

          <div className="mt-1 flex items-center justify-between gap-3">
            <h2 className="title-section">Ingredients</h2>
            <Servings value={shown} onChange={setServings} />
          </div>
          <List label="Ingredients">
            {recipe.ingredients.map((i, idx) => {
              const amount = [formatQuantity(i.quantity == null ? null : i.quantity * scale), i.unit].filter(Boolean).join(' ');
              return (
                <li key={idx} className="flex min-h-[44px] items-center gap-3 px-4 py-2.5 text-base">
                  <span className="min-w-0 flex-1">
                    {amount && <b className="font-bold">{amount} </b>}
                    {i.ingredientName}
                    {i.notes && <span className="text-muted">, {i.notes}</span>}
                  </span>
                  {i.optional && <Pill tone="neutral">Optional</Pill>}
                </li>
              );
            })}
          </List>

          {steps.length > 0 && (
            <>
              <SectionHead title="Method" className="mt-2" />
              <ol className="card flex flex-col gap-4 p-4">
                {steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3">
                    <StepNumber n={idx + 1} />
                    <span className="flex-1 pt-0.5 leading-normal">{step}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </main>
      </div>

      {/* Pinned along the bottom, as the mockup has it: the one thing to do here. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg pb-safe">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-5 pb-3 pt-3">
          {saveError && <ErrorText>{saveError}</ErrorText>}
          <Button full size="lg" icon="bookmark" disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : 'Save to my recipes'}
          </Button>
        </div>
      </div>

      {choices && (
        <Sheet title="Save a copy to…" subtitle={recipe.name} onClose={() => setChoices(null)}>
          <div className="flex flex-col gap-4">
            <List label="Your households">
              {choices.map((h, i) => (
                <Row
                  key={h.id}
                  role="radio"
                  aria-checked={h.id === picked}
                  aria-label={h.name}
                  onClick={() => setPicked(h.id)}
                  lead={<Avatar name={h.name} tone={HOUSE_TONES[i % HOUSE_TONES.length]} size={40} />}
                  title={h.name}
                  subtitle={houseFacts(h)}
                  end={<CheckCircle checked={h.id === picked} />}
                />
              ))}
            </List>
            <Button
              full
              size="lg"
              disabled={saving || !choice}
              onClick={() => {
                if (!choice) return;
                setChoices(null);
                saveInto(choice.id);
              }}
            >
              {choice ? `Save to ${choice.name}` : 'Save'}
            </Button>
            <p className="text-center text-[0.8125rem] text-muted">
              It's your own copy: changes to it don't touch the one that was shared.
            </p>
          </div>
        </Sheet>
      )}
      <Toaster />
    </div>
  );
}

/**
 * The top of the page: the recipe's pictures (swipe through them when there are several), or its
 * colour when it has none, with the share button over it.
 */
function Hero({ pictures, name, onShare }: { pictures: string[]; name: string; onShare: () => void }) {
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  return (
    <div className="relative h-[300px] overflow-hidden sm:rounded-card">
      {pictures.length === 0 ? (
        <Photo seed={name} icon="chef" large className="absolute inset-0 h-full w-full" />
      ) : (
        <div
          ref={strip}
          className="absolute inset-0 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
          }}
        >
          {pictures.map((id, i) => (
            <img
              key={id}
              src={imageUrl(id)}
              alt={i === 0 ? name : ''}
              className="h-full w-full shrink-0 snap-start object-cover"
            />
          ))}
        </div>
      )}
      {/* A real photo gets shading at the top for the pill and the button, and at the bottom for
          the dots; the colour of a recipe with no photo is light enough without. */}
      {pictures.length > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.3), transparent 30%, transparent 60%, rgba(0,0,0,.35))' }}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
        {/* The mockup says "Shared by Gehan house". A public link says nothing about the house
            that owns the recipe (RecipeLinkService.view), so the pill says what it is instead. */}
        <span className="pointer-events-auto">
          <Pill tone="mustard" icon="link">
            Shared recipe
          </Pill>
        </span>
        <button
          type="button"
          aria-label="Share"
          onClick={onShare}
          className="press pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#2B211A]"
        >
          <Icon name="share" size={17} />
        </button>
      </div>
      {pictures.length > 1 && (
        <div className="absolute bottom-3 left-4 flex gap-1.5" aria-hidden="true">
          {pictures.map((id, i) => (
            <i
              key={id}
              className={cx('block h-1.5 rounded-full bg-white transition-all', i === index ? 'w-[18px]' : 'w-1.5 opacity-60')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** − 4 servings +, the mockup's stepper: the amounts follow it, nothing is saved. */
function Servings({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const step = (by: number) => onChange(Math.max(1, Math.min(99, value + by)));
  const knob = 'press flex h-[26px] w-[26px] items-center justify-center rounded-full border border-line bg-surface text-ink disabled:opacity-40';
  return (
    <div className="flex items-center gap-2 rounded-full bg-surface2 p-[3px]">
      <button type="button" className={knob} onClick={() => step(-1)} disabled={value <= 1} aria-label="Fewer servings">
        <Icon name="minus" size={13} />
      </button>
      <span className="min-w-[5.5rem] text-center text-sm font-semibold" aria-live="polite">
        {value} {value === 1 ? 'serving' : 'servings'}
      </span>
      <button type="button" className={knob} onClick={() => step(1)} aria-label="More servings">
        <Icon name="plus" size={13} />
      </button>
    </div>
  );
}
