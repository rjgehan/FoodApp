import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
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
  const [link, setLink] = useState('');
  const [importing, setImporting] = useState(false);

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

  /**
   * A link needs no reading at all. Nearly every recipe site publishes its own ingredient and
   * step lists as structured data, and the server reads that — instantly, exactly, and without
   * spending one of the twenty AI requests a day.
   */
  async function importLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setImporting(true);
    try {
      const imported = await api<RecipeDraft>('POST', `/api/households/${householdId}/recipes/import`, {
        url: link.trim(),
      });
      setDraft({ ...imported, servings: imported.servings || servings || 4 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t read that page.');
    } finally {
      setImporting(false);
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
      <form onSubmit={importLink}>
        <Card title="From a link">
          <div className="space-y-3">
            <Input
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              aria-label="A link to a recipe"
            />
            <Button type="submit" full disabled={!link.trim() || importing}>
              {importing ? 'Reading the page…' : 'Get the recipe'}
            </Button>
            <p className="text-sm text-muted">
              Reads the recipe the site publishes about itself, so the amounts are exactly theirs. Costs
              none of the day’s AI requests.
            </p>
          </div>
        </Card>
      </form>

      <Card title="Or ask ChatGPT">
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
        <Card title="Or paste a recipe">
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
