import { useState, type FormEvent, type ReactNode } from 'react';
import type { Recipe, RecipeSection } from '../api/types';
import RecipeForm, { type RecipeDraft } from './RecipeForm';
import { Button, cx, ErrorText, Input, NoteBox, StepNumber, Textarea } from './ui';
import { ServingsStepper } from './plan/PlanBits';
import { buildRecipePrompt, parseRecipeText, RecipeParseError } from '../utils/recipeParser';

/**
 * The AI round trip (the mockup's 3.15), as three numbered steps: copy a question, ask whichever
 * AI you already use, paste the answer back. It costs the app nothing, and no one is tied to a
 * particular chatbot — the question works in any of them.
 *
 * The reader is rules, not a model, so it needs the layout the question asks for; the box says
 * so up front rather than after a paste of a whole web page has failed. What it reads goes into
 * the ordinary form to be checked, not straight into the catalog.
 */
export function PasteFromAi({
  householdId,
  initialName = '',
  initialServings = 4,
  section,
  groups,
  onLink,
  onSaved,
  onDraft,
}: {
  householdId: string;
  initialName?: string;
  initialServings?: number;
  /** Where the finished recipe is filed to begin with. */
  section?: RecipeSection;
  /** Groups the recipe starts in — see RecipeForm. */
  groups?: string[];
  /** A paste that is only a link, for From a link to read. Without it, the paste is told where to go. */
  onLink?: (link: string) => void;
  onSaved: (recipe: Recipe) => void;
  /** Hands what was read to the screen around this one, for its own "Check recipe" page. */
  onDraft?: (draft: RecipeDraft) => void;
}) {
  const [dish, setDish] = useState(initialName);
  const [servings, setServings] = useState(initialServings);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  const prompt = buildRecipePrompt(dish.trim(), servings);

  /** The clipboard is refused on a plain-http address, so there is a fallback to copy by hand. */
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied('yes');
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied('failed');
    }
  }

  function read(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // A link on its own is not a recipe to read, but it is one to fetch — the same as the phone.
    const pasted = text.trim();
    if (/^https?:\/\/\S+$/i.test(pasted)) {
      if (onLink) onLink(pasted);
      else setError('That’s a link — use From a link to read it.');
      return;
    }
    try {
      const parsed = parseRecipeText(text);
      // The serving count you asked for wins over whatever the reply claims.
      const read = { ...parsed, servings };
      if (onDraft) onDraft(read);
      else setDraft(read);
    } catch (err) {
      setError(err instanceof RecipeParseError ? err.message : 'Couldn’t read that.');
    }
  }

  if (draft) {
    return (
      <DraftToCheck
        householdId={householdId}
        draft={draft}
        section={section}
        groups={groups}
        again="Paste again"
        onAgain={() => setDraft(null)}
        onSaved={onSaved}
      />
    );
  }

  return (
    <form onSubmit={read} className="flex flex-col gap-4">
      <Step n={1} title="Copy this question">
        <div className="flex items-center gap-2">
          <Input
            value={dish}
            onChange={(e) => setDish(e.target.value)}
            placeholder="Dish (optional)"
            aria-label="What do you want to make?"
            className="h-10 min-w-0 flex-1 text-[0.9375rem]"
          />
          <ServingsStepper value={servings} onChange={setServings} label />
        </div>
        {/* A glimpse of the question, run together; Copy takes it whole, line breaks and all. */}
        <p
          aria-label="The question"
          className="rounded-[14px] bg-surface2 p-3 font-mono text-[0.8125rem] leading-normal text-muted"
        >
          <span className="line-clamp-5">{prompt.replace(/\s*\n+\s*/g, ' ')}</span>
        </p>
        <Button type="button" variant="soft" size="sm" icon={copied === 'yes' ? 'check' : 'copy'} className="h-11" onClick={copyPrompt}>
          {copied === 'yes' ? 'Copied' : 'Copy question'}
        </Button>
        {copied === 'failed' && (
          <div className="space-y-1">
            <p className="text-sm text-muted">Couldn’t copy it on this connection — select the text and copy it yourself.</p>
            <Textarea readOnly rows={6} value={prompt} onFocus={(e) => e.target.select()} aria-label="The question to copy" />
          </div>
        )}
      </Step>

      <Step n={2} title="Ask an AI — any chatbot you use" />

      <Step n={3} title="Paste the answer">
        <Textarea
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Name: …\nIngredients:\n- 1 | lb | …\nInstructions:\n1. …'}
          aria-label="The recipe to read"
          className="rounded-card text-[0.9375rem]"
        />
        <FormatWarning />
      </Step>

      {error && <ErrorText>{error}</ErrorText>}
      <Button type="submit" size="lg" full icon="sparkles" disabled={!text.trim()}>
        Read into form
      </Button>
      <p className="text-center text-[0.8125rem] text-muted">You’ll see it in the form before anything is saved.</p>
    </form>
  );
}

/** One of the three steps: its number, what to do, and whatever it needs underneath. */
function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <section className="flex items-start gap-3" aria-label={`Step ${n}: ${title}`}>
      <StepNumber n={n} />
      <div className={cx('flex min-w-0 flex-1 flex-col', children ? 'gap-2' : '')}>
        <h3 className="pt-0.5 text-base font-semibold">{title}</h3>
        {children}
      </div>
    </section>
  );
}

/**
 * What `parseRecipeText` really needs, said before the paste rather than after it fails: a name
 * at the top, an "Ingredients" heading on a line of its own, and the steps under an
 * "Instructions" (or Method, Steps, Directions) heading. Bullets, numbering and bold are fine.
 */
function FormatWarning() {
  return (
    <div role="note">
      <NoteBox tone="mustard" icon="alert">
        <b className="font-semibold">You can’t paste just anything here.</b> It reads a recipe laid out the way the
        question asks: the name at the top, a line saying “Ingredients” with one per line under it, then “Instructions”
        with the steps. For a recipe website, use From a link.
      </NoteBox>
    </div>
  );
}

/**
 * A recipe read from somewhere, in the ordinary form to be checked before it is saved — the
 * mockup's "Check recipe". Shared by Paste and From a link where there is no screen around them
 * to show it (the planner's New recipe), so both end on the same thing.
 */
export function DraftToCheck({
  householdId,
  draft,
  section,
  groups,
  again,
  note,
  aside,
  savedLinkId,
  onAgain,
  onSaved,
}: {
  householdId: string;
  draft: RecipeDraft;
  section?: RecipeSection;
  groups?: string[];
  /** The button that goes back for another try: "Paste again", "Try another link". */
  again: string;
  /** What to check first, when there is something in particular; otherwise the usual line. */
  note?: string;
  /** Another way out beside `again` — From a link's "Just save the link". */
  aside?: ReactNode;
  /** The saved link this is being made from; see RecipeForm. */
  savedLinkId?: string;
  onAgain: () => void;
  onSaved: (recipe: Recipe) => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <NoteBox tone={note ? 'mustard' : 'herb'} icon={note ? 'alert' : 'check'}>
        {note ?? 'Here’s what came through — check the amounts, change anything, then save it.'}
      </NoteBox>
      <div className="-mt-1.5 flex flex-wrap items-center gap-x-1">
        <Button variant="ghost" size="sm" icon="chevL" className="-ml-2" onClick={onAgain}>
          {again}
        </Button>
        {aside}
      </div>
      {/* Keyed on the name so reading a second one really does replace the fields. */}
      <RecipeForm
        key={draft.name}
        householdId={householdId}
        draft={draft}
        section={section}
        groups={groups}
        savedLinkId={savedLinkId}
        onSaved={onSaved}
      />
    </div>
  );
}
