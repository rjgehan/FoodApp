import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import RecipeForm from '../components/RecipeForm';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorText,
  Field,
  NumberInput,
  Textarea,
} from '../components/ui';
import { ChevronLeftIcon } from '../components/icons';
import { SECTION_OPTIONS, DEFAULT_FILING, type Filing } from '../utils/recipeMeta';
import { buildRecipePrompt, parseRecipeText, RecipeParseError } from '../utils/recipeParser';

export default function NewRecipePage() {
  const { activeHouseholdId } = useHousehold();
  const navigate = useNavigate();
  // Writing it out is the normal way in; pasting is the shortcut you opt into.
  const [pasting, setPasting] = useState(false);

  if (!activeHouseholdId) {
    return (
      <Card>
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/recipes')}>
          <ChevronLeftIcon className="h-5 w-5" />
          Recipes
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPasting((v) => !v)}>
          {pasting ? 'Write it out' : 'Paste from ChatGPT'}
        </Button>
      </div>

      {pasting ? (
        <PasteRecipe householdId={activeHouseholdId} onCreated={(r) => navigate(`/recipes/${r.id}`, { replace: true })} />
      ) : (
        <RecipeForm householdId={activeHouseholdId} onSaved={(r) => navigate(`/recipes/${r.id}`, { replace: true })} />
      )}
    </div>
  );
}


function PasteRecipe({
  householdId,
  onCreated,
}: {
  householdId: string;
  onCreated: (recipe: Recipe) => void;
}) {
  const [promptServings, setPromptServings] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [filing, setFiling] = useState<Filing>(DEFAULT_FILING);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const canCopy = promptServings !== null && promptServings >= 1;

  async function copyPrompt() {
    if (!canCopy) return;
    await navigator.clipboard.writeText(buildRecipePrompt(promptServings));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const parsed = parseRecipeText(text);
      setSaving(true);
      // The servings you asked for wins over whatever the reply claims, so nothing is scaled off a guess.
      onCreated(
        await api<Recipe>('POST', `/api/households/${householdId}/recipes`, {
          ...parsed,
          servings: canCopy ? promptServings : parsed.servings,
          ...filing,
        }),
      );
    } catch (err) {
      setError(err instanceof RecipeParseError ? err.message : 'Could not create recipe.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card title="1. Get the recipe">
        <Field label="How many should it serve?">
          <div className="flex gap-2">
            <NumberInput min={1} placeholder="8" className="w-24" value={promptServings} onChange={setPromptServings} />
            <Button type="button" variant="secondary" className="flex-1" disabled={!canCopy} onClick={copyPrompt}>
              {copied ? 'Copied!' : 'Copy prompt'}
            </Button>
          </div>
        </Field>
      </Card>

      <Card title="2. Paste the reply">
        <Textarea
          rows={8}
          className="font-mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Name: ...\nServings: ...\nIngredients:\n- 1 | lb | ...'}
          aria-label="Recipe text"
        />
        {error && <div className="mt-2"><ErrorText>{error}</ErrorText></div>}
      </Card>

      <Card title="Where does it go?">
        <div className="flex flex-wrap gap-2">
          {SECTION_OPTIONS.map((s) => (
            <Chip key={s.value} active={filing.section === s.value} onClick={() => setFiling({ ...filing, section: s.value })}>
              {s.label}
            </Chip>
          ))}
        </div>
      </Card>

      <Button type="submit" full size="lg" disabled={saving || !text.trim() || !canCopy}>
        Add recipe
      </Button>
    </form>
  );
}
