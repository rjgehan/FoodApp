import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Recipe, RecipeIngredientInput } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Button, Card, Input, Label } from '../components/Card';
import { parseRecipeText, RecipeParseError, buildRecipePrompt } from '../utils/recipeParser';

const emptyIngredient: RecipeIngredientInput = { ingredientName: '', quantity: 1, unit: '' };

export default function RecipesPage() {
  const { activeHouseholdId } = useHousehold();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [name, setName] = useState('');
  const [servings, setServings] = useState(4);
  const [ingredients, setIngredients] = useState<RecipeIngredientInput[]>([{ ...emptyIngredient }]);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    if (!activeHouseholdId) return;
    setRecipes(await api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHouseholdId]);

  function updateIngredient(index: number, patch: Partial<RecipeIngredientInput>) {
    setIngredients((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function togglePublish(recipe: Recipe) {
    const visibility = recipe.visibility === 'GLOBAL' ? 'PRIVATE' : 'GLOBAL';
    await api('PATCH', `/api/recipes/${recipe.id}/visibility`, { visibility });
    await refresh();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeHouseholdId || !name.trim()) return;
    setSaving(true);
    try {
      await api('POST', `/api/households/${activeHouseholdId}/recipes`, {
        name: name.trim(),
        servings,
        ingredients: ingredients.filter((i) => i.ingredientName.trim()),
      });
      setName('');
      setServings(4);
      setIngredients([{ ...emptyIngredient }]);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!activeHouseholdId) {
    return <p className="text-sm text-slate-500">Create or select a household first.</p>;
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-6">
        <PasteRecipeCard householdId={activeHouseholdId} onCreated={refresh} />
        <Card title="Recipes">
          <ul className="space-y-2 text-sm">
            {recipes.map((r) => {
              const isMine = r.householdId === activeHouseholdId;
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {r.name}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.visibility === 'GLOBAL'
                            ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        }`}
                      >
                        {r.visibility === 'GLOBAL' ? 'Global' : 'Private'}
                      </span>
                    </div>
                    <div className="text-slate-500">
                      {r.ingredients.length} ingredients · serves {r.servings}
                      {!isMine && ' · from another household'}
                    </div>
                  </div>
                  {isMine && (
                    <Button variant="secondary" onClick={() => togglePublish(r)}>
                      {r.visibility === 'GLOBAL' ? 'Unpublish' : 'Publish'}
                    </Button>
                  )}
                </li>
              );
            })}
            {recipes.length === 0 && <p className="text-slate-500">No recipes yet.</p>}
          </ul>
        </Card>
      </div>

      <Card title="New recipe">
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Spaghetti Bolognese" />
          </div>
          <div>
            <Label>Servings (what these ingredient amounts actually make)</Label>
            <Input
              type="number"
              min={1}
              value={servings}
              onChange={(e) => setServings(parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div>
            <Label>Ingredients</Label>
            <div className="space-y-2">
              {ingredients.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="ingredient"
                    value={row.ingredientName}
                    onChange={(e) => updateIngredient(i, { ingredientName: e.target.value })}
                  />
                  <Input
                    type="number"
                    className="max-w-20"
                    value={row.quantity}
                    onChange={(e) => updateIngredient(i, { quantity: parseFloat(e.target.value) || 0 })}
                  />
                  <Input
                    className="max-w-24"
                    placeholder="unit"
                    value={row.unit}
                    onChange={(e) => updateIngredient(i, { unit: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIngredients((rows) => rows.filter((_, idx) => idx !== i))}
                  >
                    x
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-2"
              onClick={() => setIngredients((rows) => [...rows, { ...emptyIngredient }])}
            >
              + ingredient
            </Button>
          </div>

          <Button type="submit" disabled={saving}>
            Create recipe
          </Button>
        </form>
      </Card>
    </div>
  );
}

function PasteRecipeCard({ householdId, onCreated }: { householdId: string; onCreated: () => Promise<void> }) {
  const [promptServings, setPromptServings] = useState<number | ''>('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const canCopy = typeof promptServings === 'number' && promptServings >= 1;

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
      // The servings you told ChatGPT to target is authoritative — use it even if the reply's
      // "Servings:" line doesn't match (or is missing), so the recipe is never scaled off a
      // guess.
      await api('POST', `/api/households/${householdId}/recipes`, {
        ...parsed,
        servings: canCopy ? promptServings : parsed.servings,
      });
      setText('');
      await onCreated();
    } catch (err) {
      setError(err instanceof RecipeParseError ? err.message : 'Could not create recipe.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Paste a recipe">
      <div className="flex gap-2 items-end mb-3">
        <div className="flex-1">
          <Label>How many servings should this recipe make?</Label>
          <Input
            type="number"
            min={1}
            placeholder="e.g. 8"
            value={promptServings}
            onChange={(e) => setPromptServings(e.target.value ? parseInt(e.target.value, 10) : '')}
          />
        </div>
        <Button type="button" variant="secondary" disabled={!canCopy} onClick={copyPrompt}>
          {copied ? 'Copied!' : 'Copy ChatGPT prompt'}
        </Button>
      </div>
      <p className="text-xs text-slate-500 mb-2">
        Set servings first so ChatGPT writes ingredient amounts that actually make sense (e.g. "1 egg" instead of a
        fraction of one). Paste its reply below — or paste a recipe from anywhere else, as long as you set the
        matching servings count above.
      </p>
      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          className="w-full text-sm border border-slate-300 dark:border-slate-700 bg-transparent rounded-md px-3 py-2 font-mono"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Name: ...\nServings: ...\nIngredients:\n- 1 | lb | ...\nInstructions:\n1. ...'}
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{error}</p>}
        <Button type="submit" disabled={saving || !text.trim() || !canCopy}>
          Parse & create
        </Button>
      </form>
    </Card>
  );
}
