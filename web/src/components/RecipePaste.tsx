import { useState, type FormEvent } from 'react';
import type { Recipe, RecipeSection } from '../api/types';
import RecipeForm, { type RecipeDraft } from './RecipeForm';
import { Button, Card, ErrorText, Field, Input, NumberInput, Textarea } from './ui';
import { AlertIcon } from './icons';
import { buildRecipePrompt, parseRecipeText, RecipeParseError } from '../utils/recipeParser';

/**
 * The AI round trip: copy a question, ask whichever AI you already use, paste the answer back.
 * It costs the app nothing, and no one is tied to a particular chatbot — the question works in
 * any of them.
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
}) {
  const [dish, setDish] = useState(initialName);
  const [servings, setServings] = useState<number | null>(initialServings);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  const prompt = buildRecipePrompt(dish.trim(), servings ?? 4);

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
      setDraft({ ...parsed, servings: servings ?? parsed.servings });
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
    <div className="space-y-4">
      <Card title="Ask an AI">
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Copy this question into whichever AI you use, then paste its answer below.
          </p>
          <Field label="What do you want to make?" hint="Optional — leave it blank and name it in the AI chat.">
            {/* Field's label is only a caption, so the box names itself. */}
            <Input
              value={dish}
              onChange={(e) => setDish(e.target.value)}
              placeholder="Chicken parmesan"
              aria-label="What do you want to make?"
            />
          </Field>
          <Field label="Serves">
            <NumberInput min={1} className="w-24" value={servings} onChange={setServings} />
          </Field>
          <Button type="button" variant="secondary" full onClick={copyPrompt}>
            {copied === 'yes' ? 'Copied' : 'Copy the question'}
          </Button>
          {copied === 'failed' && (
            <div className="space-y-1">
              <p className="text-sm text-muted">Couldn’t copy it on this connection — select the text and copy it yourself.</p>
              <Textarea readOnly rows={6} value={prompt} onFocus={(e) => e.target.select()} aria-label="The question" />
            </div>
          )}
        </div>
      </Card>

      <form onSubmit={read}>
        <Card title="Paste the answer">
          <div className="space-y-3">
            <FormatWarning />
            <Textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Name: …\nIngredients:\n- 1 | lb | …\nInstructions:\n1. …'}
              aria-label="The recipe to read"
            />
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" full disabled={!text.trim()}>
              Read it
            </Button>
            <p className="text-sm text-muted">You’ll see it in the form before anything is saved.</p>
          </div>
        </Card>
      </form>
    </div>
  );
}

/**
 * What `parseRecipeText` really needs, said before the paste rather than after it fails: a name
 * at the top, an "Ingredients" heading on a line of its own, and the steps under an
 * "Instructions" (or Method, Steps, Directions) heading. Bullets, numbering and bold are fine.
 */
function FormatWarning() {
  return (
    <div role="note" className="flex gap-2.5 rounded-xl bg-accent-soft px-3 py-2.5 text-sm text-ink">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="space-y-1">
        <p className="font-medium">You can’t paste just anything here.</p>
        <p>
          It only reads a recipe laid out the way the question asks: the name at the top, a line saying
          “Ingredients” with one ingredient per line under it, then a line saying “Instructions” with the steps.
          A recipe written as a paragraph won’t come through, and one copied off a website needs those two
          headings — or use From a link for the website itself.
        </p>
      </div>
    </div>
  );
}

/**
 * A recipe read from somewhere, in the ordinary form to be checked before it is saved. Shared by
 * Paste and From a link, so both end on the same screen.
 */
export function DraftToCheck({
  householdId,
  draft,
  section,
  groups,
  again,
  note,
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
  onAgain: () => void;
  onSaved: (recipe: Recipe) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted">
          {note ?? 'Here’s what came through — check the amounts, change anything, then save it.'}
        </p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={onAgain}>
          {again}
        </Button>
      </Card>
      {/* Keyed on the name so reading a second one really does replace the fields. */}
      <RecipeForm key={draft.name} householdId={householdId} draft={draft} section={section} groups={groups} onSaved={onSaved} />
    </div>
  );
}
