import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Recipe, RecipeSection } from '../api/types';
import type { RecipeDraft } from './RecipeForm';
import { DraftToCheck } from './RecipePaste';
import { Button, Card, ErrorText, Input } from './ui';

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
}) {
  const [link, setLink] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImportedRecipe | null>(null);

  useEffect(() => {
    if (handed) {
      setLink(handed);
      setError(null);
      setDraft(null);
    }
  }, [handed]);

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
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            aria-label="A link to a recipe"
          />
          <p className="text-sm font-medium text-ink">Works with TikTok, Instagram and recipe websites.</p>
          {error && <ErrorText>{error}</ErrorText>}
          {reading ? <Reading /> : (
            <Button type="submit" full disabled={!link.trim()}>
              Get the recipe
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
function Reading() {
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
