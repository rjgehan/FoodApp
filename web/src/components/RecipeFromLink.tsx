import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../api/client';
import type { Recipe, RecipeSection, SavedLink } from '../api/types';
import type { RecipeDraft } from './RecipeForm';
import { DraftToCheck } from './RecipePaste';
import { Button, ErrorText, Photo, Pill } from './ui';
import { Icon } from './icons';
import { SAVED_LINKS_PATH, saveLink, sourceLabel } from '../utils/savedLinks';
import { photoClass } from '../utils/recipeFormat';
import { isVideoLink } from '../utils/videoLink';
import { instructionSteps } from '../utils/recipeFormat';

/** What the server read: a draft, and whether its steps were written down or only said. */
type ImportedRecipe = RecipeDraft & { methodSource?: 'PUBLISHED' | 'SPOKEN' | null };

/** What to check first in a draft read off a link, when there is something in particular. */
export function draftNote(draft: ImportedRecipe): string | undefined {
  return draft.methodSource === 'SPOKEN'
    ? 'The steps were pieced together from what’s said in the video. Give them a read, then save.'
    : undefined;
}

/**
 * A link in, a recipe out (the mockup's 3.14). The server does the reading: a website's own
 * schema.org recipe, which is exact, or the caption (and, failing that, what is said) of a
 * TikTok or an Instagram Reel. None of it spends an AI request. What comes back is a draft —
 * its name, its picture, how much was found — and the form to check it in, with the link already
 * in its Links, so nothing is saved until it has been looked at.
 *
 * A link that cannot be read is still worth keeping: the recipe is in the video, or behind a
 * bio. So the way on — keep it as a saved link, or type it out — is right under the reason.
 */
export function FromALink({
  householdId,
  link: handed,
  initialServings,
  section,
  groups,
  onSaved,
  onLinkSaved,
  onDraft,
  onTypeInstead,
}: {
  householdId: string;
  /** A link handed over from Paste, to fill the box with. */
  link?: string;
  /** From the planner: the serving count to assume when the page gives none. */
  initialServings?: number;
  /** Where the finished recipe is filed to begin with. */
  section?: RecipeSection;
  /** Groups the recipe starts in — see RecipeForm. */
  groups?: string[];
  onSaved: (recipe: Recipe) => void;
  /**
   * What to do with a link kept in Saved links instead of read. Without it, this says where it
   * went and offers the way there; the planner passes one to put the link straight on the plan.
   */
  onLinkSaved?: (link: SavedLink) => void;
  /**
   * "Review draft" hands the draft to the screen around this one, which shows it in its own
   * "Check recipe" page. Without it, the form opens here, in place.
   */
  onDraft?: (draft: RecipeDraft, note?: string) => void;
  /** "Type it out" under a link that could not be read. Without it, the button is not offered. */
  onTypeInstead?: () => void;
}) {
  const navigate = useNavigate();
  const [link, setLink] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportedRecipe | null>(null);
  const [checking, setChecking] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [keepError, setKeepError] = useState<string | null>(null);
  const [kept, setKept] = useState<SavedLink | null>(null);

  useEffect(() => {
    if (handed) {
      setLink(handed);
      setError(null);
      setDraft(null);
      setChecking(false);
      setKept(null);
    }
  }, [handed]);

  /**
   * Keeps the link rather than reading it — because it could not be read, or because a link is
   * all that is wanted. From a draft, the name and picture already read go with it, so the page
   * is not fetched a second time.
   */
  async function keep(from?: ImportedRecipe) {
    setKeepError(null);
    setKeeping(true);
    try {
      const saved = await saveLink(householdId, {
        url: link.trim(),
        name: from?.name || null,
        coverImageId: from?.coverImageId ?? null,
        section: section ?? null,
      });
      setDraft(null);
      setError(null);
      if (onLinkSaved) onLinkSaved(saved);
      else setKept(saved);
    } catch (err) {
      setKeepError(err instanceof ApiError ? err.message : 'Couldn’t save that link.');
    } finally {
      setKeeping(false);
    }
  }

  async function read(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setReading(true);
    try {
      const imported = await api<ImportedRecipe>('POST', `/api/households/${householdId}/recipes/import`, {
        // As typed: the server finds the link in a pasted share-sheet sentence and puts https://
        // on "tiktok.com/…", so neither needs doing twice here.
        url: link.trim(),
      });
      // The page's own count comes first: its amounts are written for that many, and the
      // planner's number is only a fallback for a page that never said.
      setDraft({ ...imported, servings: imported.servings || initialServings || 4 });
    } catch (err) {
      // The server says why in a sentence — a private post, a page with no recipe on it.
      setError(err instanceof ApiError ? err.message : 'Couldn’t read that link.');
    } finally {
      setReading(false);
    }
  }

  if (kept) {
    return (
      <div className="card flex flex-col gap-4 p-4">
        <div className="flex items-center gap-3" role="status">
          <span className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[14px] ${kept.coverImageId ? '' : photoClass(kept.id)}`}>
            {kept.coverImageId ? (
              <img src={imageUrl(kept.coverImageId)} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name="link" size={24} className="opacity-90" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-semibold">
              <Icon name="check" size={16} strokeWidth={2.6} className="text-herb" />
              {kept.alreadySaved ? 'Already in Saved links' : 'Saved to Saved links'}
            </span>
            <span className="block truncate text-[0.9375rem]">{kept.name}</span>
            <span className="block text-sm text-muted">{sourceLabel(kept)}</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => navigate(SAVED_LINKS_PATH)}>
            See saved links
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setKept(null);
              setLink('');
            }}
          >
            Another link
          </Button>
        </div>
      </div>
    );
  }

  if (draft && checking) {
    return (
      <DraftToCheck
        householdId={householdId}
        draft={draft}
        section={section}
        groups={groups}
        again="Try another link"
        note={draftNote(draft)}
        aside={
          <Button variant="ghost" size="sm" disabled={keeping} onClick={() => keep(draft)}>
            {keeping ? 'Saving…' : 'Just save the link'}
          </Button>
        }
        onAgain={() => {
          setDraft(null);
          setChecking(false);
        }}
        onSaved={onSaved}
      />
    );
  }

  const video = isVideoLink(link);
  const steps = draft ? instructionSteps(draft.instructions).length : 0;

  return (
    <form onSubmit={read} className="flex flex-col gap-4">
      <label className="flex h-[3.25rem] items-center gap-2.5 rounded-field border border-line bg-surface px-3.5 transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-focus">
        <Icon name="link" size={19} className="shrink-0 text-muted" />
        <input
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError(null);
            setKeepError(null);
            setDraft(null);
          }}
          placeholder="Paste a link — https://…"
          aria-label="A link to a recipe"
          className="h-full min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint"
        />
        {draft && <Icon name="check" size={18} strokeWidth={2.6} className="shrink-0 text-herb" aria-label="Read" />}
      </label>

      {draft ? (
        <>
          {/* The draft, before the form: what was found, so the next page holds no surprises. */}
          <div className="card flex flex-col overflow-hidden">
            {draft.coverImageId ? (
              <img src={imageUrl(draft.coverImageId)} alt="" className="h-[10.625rem] w-full object-cover" />
            ) : (
              <Photo seed={draft.name} icon={video ? 'play' : 'utensils'} large className="h-[10.625rem] w-full" />
            )}
            <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3">
              <div className="flex flex-wrap gap-1.5">
                <Pill tone="herb" icon="check">
                  {draft.methodSource === 'SPOKEN'
                    ? 'Read from what’s said in the video'
                    : video
                      ? 'Read from video caption'
                      : 'Read from the page'}
                </Pill>
                <Pill tone="mustard">Draft</Pill>
              </div>
              <h2 className="serif text-[1.375rem] leading-tight">{draft.name || 'Untitled recipe'}</h2>
              <p className="text-[0.8125rem] text-muted">
                Found {count(draft.ingredients.length, 'ingredient')} and {count(steps, 'step')}. You'll check them on the
                next page.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            full
            icon="arrowR"
            onClick={() => (onDraft ? onDraft(draft, draftNote(draft)) : setChecking(true))}
          >
            Review draft
          </Button>
          <div className="flex flex-wrap justify-center gap-x-2">
            <Button type="button" variant="ghost" size="sm" disabled={keeping} onClick={() => keep(draft)}>
              {keeping ? 'Saving…' : 'Just save the link'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <Icon name="check" size={15} strokeWidth={2.4} className="text-herb" />
            Works with TikTok, Instagram and recipe websites.
          </p>
          {error && (
            <div className="card flex flex-col gap-2.5 p-4" role="alert">
              <div className="flex items-center gap-2">
                <Icon name="alert" size={16} className="shrink-0 text-mustard" />
                <span className="text-[0.9375rem] font-semibold">This link can’t be read</span>
              </div>
              <p className="text-[0.8125rem] text-muted">{error}</p>
              <p className="text-[0.8125rem] text-muted">
                Keep it in Saved links instead, with its name and picture, and make it a recipe whenever you like.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" icon="bookmark" className="h-11 flex-1" disabled={keeping} onClick={() => keep()}>
                  {keeping ? 'Saving…' : 'Keep as saved link'}
                </Button>
                {onTypeInstead && (
                  <Button type="button" variant="secondary" size="sm" icon="pen" className="h-11 flex-1" onClick={onTypeInstead}>
                    Type it out
                  </Button>
                )}
              </div>
            </div>
          )}
          {keepError && <ErrorText>{keepError}</ErrorText>}
          {reading ? (
            <Reading />
          ) : (
            <Button type="submit" size="lg" full variant={error ? 'secondary' : 'primary'} disabled={!link.trim() || keeping}>
              Get the recipe
            </Button>
          )}
          {!reading && !error && (
            <Button type="button" variant="ghost" full disabled={!link.trim() || keeping} onClick={() => keep()}>
              {keeping ? 'Saving…' : 'Just save the link'}
            </Button>
          )}
          <p className="text-[0.8125rem] leading-normal text-muted">
            A website’s own recipe comes through exactly as they wrote it. A video’s is read from its caption or what’s
            said in it, so give it a look before you save. Either way it opens in the form first. No AI.
          </p>
        </>
      )}
    </form>
  );
}

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * A video can take a while — the server may be working through its caption or its transcript — so
 * the wait shows a moving bar and the real seconds rather than a button that looks stuck.
 */
export function Reading() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-2 py-1" role="status">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">Reading the link…</span>
        <span className="tabular-nums text-muted">{seconds}s</span>
      </div>
      {/* Indeterminate on purpose: there is no percentage to report on one request. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
        <div className="h-full w-1/3 animate-slide rounded-full bg-accent" />
      </div>
    </div>
  );
}
