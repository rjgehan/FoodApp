import { useState, type FormEvent } from 'react';
import type { Recipe, RecipeSection } from '../api/types';
import RecipeForm, { type RecipeDraft } from './RecipeForm';
import { Button, Card, ErrorText, Field, Input, NumberInput, Textarea } from './ui';
import { buildRecipePrompt, parseRecipeText, RecipeParseError } from '../utils/recipeParser';

/**
 * The ChatGPT round trip, kept alongside "Write it for me": copy a question, ask ChatGPT, paste
 * the answer back. It costs none of the app's twenty AI requests a day, and it reads any recipe
 * text, not only ChatGPT's — a recipe copied from a website works the same way.
 *
 * What comes back goes into the ordinary form to be checked, the same as a written-for-you
 * recipe, rather than straight into the catalog.
 */
export function PasteFromChatGpt({
  householdId,
  initialName = '',
  initialServings = 4,
  section,
  onSaved,
}: {
  householdId: string;
  initialName?: string;
  initialServings?: number;
  /** Where the finished recipe is filed to begin with. */
  section?: RecipeSection;
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
      <div className="space-y-4">
        <Card>
          <p className="text-sm text-muted">Here’s what came through — check the amounts, change anything, then save it.</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setDraft(null)}>
            Paste again
          </Button>
        </Card>
        {/* Keyed on the name so reading a second paste really does replace the fields. */}
        <RecipeForm key={draft.name} householdId={householdId} draft={draft} section={section} onSaved={onSaved} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="1. Ask ChatGPT">
        <div className="space-y-3">
          <Field label="What do you want to make?" hint="Optional — leave it blank and name it in ChatGPT.">
            <Input value={dish} onChange={(e) => setDish(e.target.value)} placeholder="Chicken parmesan" />
          </Field>
          <Field label="Serves">
            <NumberInput min={1} className="w-24" value={servings} onChange={setServings} />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={copyPrompt}>
              {copied === 'yes' ? 'Copied' : 'Copy the question'}
            </Button>
            <a href={`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`} target="_blank" rel="noreferrer noopener">
              <Button type="button" variant="secondary">
                Open ChatGPT
              </Button>
            </a>
          </div>
          {copied === 'failed' && (
            <div className="space-y-1">
              <p className="text-sm text-muted">Couldn’t copy it on this connection — select the text and copy it yourself.</p>
              <Textarea readOnly rows={6} value={prompt} onFocus={(e) => e.target.select()} aria-label="The question" />
            </div>
          )}
        </div>
      </Card>

      <form onSubmit={read}>
        <Card title="2. Paste the answer">
          <div className="space-y-3">
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
            <p className="text-sm text-muted">
              Any recipe text works, not just ChatGPT’s. You’ll see it in the form before anything is saved.
            </p>
          </div>
        </Card>
      </form>
    </div>
  );
}
