import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../api/client';
import type { Recipe, RecipeSection, SavedLink } from '../api/types';
import type { RecipeDraft } from './RecipeForm';
import { DraftToCheck } from './RecipePaste';
import { Button, Card, ErrorText, Input } from './ui';
import { LinkIcon } from './icons';
import { SAVED_LINKS_PATH, saveLink, sourceLabel } from '../utils/savedLinks';
import { coverClass } from '../utils/recipeFormat';

/** What the server read: a draft, and whether its steps were written down or only said. */
type ImportedRecipe = RecipeDraft & { methodSource?: 'PUBLISHED' | 'SPOKEN' | null };

/**
 * A link in, a recipe out. The server does the reading: a website's own schema.org recipe, which
 * is exact, or the caption (and, failing that, what is said) of a TikTok or an Instagram Reel.
 * None of it spends an AI request. What comes back is a draft in the ordinary form, with the
 * link already in its Links, so nothing is saved until it has been looked at.
 */
export function FromALink({
  householdId,
  link: handed,
  initialServings,
  section,
  groups,
  onSaved,
  onLinkSaved,
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
}) {
  const navigate = useNavigate();
  const [link, setLink] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportedRecipe | null>(null);
  const [keeping, setKeeping] = useState(false);
  const [keepError, setKeepError] = useState<string | null>(null);
  const [kept, setKept] = useState<SavedLink | null>(null);

  useEffect(() => {
    if (handed) {
      setLink(handed);
      setError(null);
      setDraft(null);
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

  if (kept) {
    return (
      <Card>
        <div className="flex items-center gap-3" role="status">
          <span className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl ${coverClass(kept.id)}`}>
            {kept.coverImageId ? (
              <img src={imageUrl(kept.coverImageId)} alt="" className="h-full w-full object-cover" />
            ) : (
              <LinkIcon className="h-6 w-6 text-ink/50" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {kept.alreadySaved ? 'Already in Saved links' : 'Saved to Saved links'}
            </span>
            <span className="block truncate text-[0.9375rem]">{kept.name}</span>
            <span className="block text-sm text-muted">{sourceLabel(kept)}</span>
          </span>
        </div>
        <div className="mt-4 flex gap-2">
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
      </Card>
    );
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

  if (draft) {
    return (
      <DraftToCheck
        householdId={householdId}
        draft={draft}
        section={section}
        groups={groups}
        again="Try another link"
        note={
          draft.methodSource === 'SPOKEN'
            ? 'The steps were pieced together from what’s said in the video. Give them a read, then save.'
            : undefined
        }
        aside={
          <Button variant="ghost" size="sm" disabled={keeping} onClick={() => keep(draft)}>
            {keeping ? 'Saving…' : 'Just save the link'}
          </Button>
        }
        onAgain={() => setDraft(null)}
        onSaved={onSaved}
      />
    );
  }

  return (
    <form onSubmit={read}>
      <Card>
        <div className="space-y-3">
          <Input
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
            }}
            placeholder="https://…"
            aria-label="A link to a recipe"
          />
          <p className="text-sm font-medium text-ink">Works with TikTok, Instagram and recipe websites.</p>
          {error && (
            // A link that cannot be read is still a link worth keeping — the recipe is in the
            // video, or behind a bio — so the way on is right under the reason.
            <div className="space-y-2.5 rounded-xl bg-elevated p-3">
              <ErrorText>{error}</ErrorText>
              <p className="text-sm text-muted">
                Keep it in Saved links instead, with its name and picture, and make it a recipe whenever you like.
              </p>
              <Button type="button" full disabled={keeping} onClick={() => keep()}>
                <LinkIcon className="h-5 w-5" />
                {keeping ? 'Saving…' : 'Save the link instead'}
              </Button>
            </div>
          )}
          {keepError && <ErrorText>{keepError}</ErrorText>}
          {reading ? <Reading /> : (
            <Button type="submit" full variant={error ? 'secondary' : 'primary'} disabled={!link.trim() || keeping}>
              Get the recipe
            </Button>
          )}
          {!reading && !error && (
            <Button type="button" variant="ghost" full disabled={!link.trim() || keeping} onClick={() => keep()}>
              {keeping ? 'Saving…' : 'Just save the link'}
            </Button>
          )}
          <p className="text-sm text-muted">
            A website’s own recipe comes through exactly as they wrote it. A video’s is read from its caption or what’s
            said in it, so give it a look before you save. Either way it opens in the form first.
          </p>
        </div>
      </Card>
    </form>
  );
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
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div className="h-full w-1/3 animate-slide rounded-full bg-accent" />
      </div>
    </div>
  );
}
