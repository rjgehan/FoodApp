import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imageUrl } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  Input,
  NumberInput,
  Textarea,
} from '../components/ui';
import { ChevronLeftIcon, PlusIcon, TrashIcon } from '../components/icons';
import ImagePicker from '../components/ImagePicker';
import RecipeClassifier from '../components/RecipeClassifier';
import { SECTION_OPTIONS, DEFAULT_FILING, type Filing } from '../utils/recipeMeta';
import { buildRecipePrompt, parseRecipeText, RecipeParseError } from '../utils/recipeParser';

interface DraftIngredient {
  ingredientName: string;
  quantity: number | null;
  unit: string;
}

const emptyIngredient: DraftIngredient = { ingredientName: '', quantity: null, unit: '' };

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
        <WriteRecipe householdId={activeHouseholdId} onCreated={(r) => navigate(`/recipes/${r.id}`, { replace: true })} />
      )}
    </div>
  );
}

function WriteRecipe({
  householdId,
  onCreated,
}: {
  householdId: string;
  onCreated: (recipe: Recipe) => void;
}) {
  const [name, setName] = useState('');
  const [servings, setServings] = useState<number | null>(4);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([{ ...emptyIngredient }]);
  const [instructions, setInstructions] = useState('');
  const [filing, setFiling] = useState<Filing>(DEFAULT_FILING);

  // Everything optional lives behind this, so the first screen is just the recipe.
  const [showExtras, setShowExtras] = useState(false);
  const [description, setDescription] = useState('');
  const [prep, setPrep] = useState<number | null>(null);
  const [cook, setCook] = useState<number | null>(null);
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');

  const [saving, setSaving] = useState(false);

  function updateIngredient(index: number, patch: Partial<DraftIngredient>) {
    setIngredients((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      onCreated(
        await api<Recipe>('POST', `/api/households/${householdId}/recipes`, {
          name: name.trim(),
          description: description.trim() || null,
          instructions: instructions.trim() || null,
          prepTimeMinutes: prep,
          cookTimeMinutes: cook,
          servings: servings ?? 1,
          coverImageId,
          videoUrl: videoUrl.trim() || null,
          ...filing,
          ingredients: ingredients
            .filter((i) => i.ingredientName.trim())
            .map((i) => ({ ...i, quantity: i.quantity ?? 1 })),
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <div className="space-y-3">
          <Field label="Name">
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Spaghetti Bolognese" />
          </Field>
          <Field label="Serves">
            <NumberInput min={1} className="w-24" value={servings} onChange={setServings} />
          </Field>
        </div>
      </Card>

      <Card title="Ingredients">
        <div className="space-y-3">
          {ingredients.map((row, i) => (
            <div key={i} className="rounded-xl border border-line p-2">
              <Input
                placeholder="ingredient"
                value={row.ingredientName}
                onChange={(e) => updateIngredient(i, { ingredientName: e.target.value })}
                aria-label={`Ingredient ${i + 1}`}
              />
              <div className="mt-2 flex gap-2">
                <NumberInput
                  className="w-24"
                  placeholder="qty"
                  value={row.quantity}
                  onChange={(v) => updateIngredient(i, { quantity: v })}
                  aria-label={`Ingredient ${i + 1} quantity`}
                />
                <Input
                  className="flex-1"
                  placeholder="unit"
                  value={row.unit}
                  onChange={(e) => updateIngredient(i, { unit: e.target.value })}
                  aria-label={`Ingredient ${i + 1} unit`}
                />
                <IconButton
                  label={`Remove ingredient ${i + 1}`}
                  disabled={ingredients.length === 1}
                  onClick={() => setIngredients((rows) => rows.filter((_, idx) => idx !== i))}
                >
                  <TrashIcon className="h-5 w-5" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          full
          className="mt-3"
          onClick={() => setIngredients((rows) => [...rows, { ...emptyIngredient }])}
        >
          <PlusIcon className="h-5 w-5" />
          Add ingredient
        </Button>
      </Card>

      <Card title="Method">
        <Textarea
          rows={6}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={'One step per line.'}
          aria-label="Method"
        />
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

      <Card
        title="Extras"
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowExtras((v) => !v)}>
            {showExtras ? 'Hide' : 'Show'}
          </Button>
        }
      >
        {!showExtras ? (
          <p className="text-sm text-muted">Photo, times, sub-categories.</p>
        ) : (
          <div className="space-y-4">
            {coverImageId && (
              <img
                src={imageUrl(coverImageId)}
                alt=""
                className="aspect-[4/3] w-full rounded-xl border border-line object-cover"
              />
            )}
            <ImagePicker householdId={householdId} onUploaded={(ids) => setCoverImageId(ids[0] ?? null)}>
              {coverImageId ? 'Replace photo' : 'Add a photo'}
            </ImagePicker>

            <Field label="A line about it">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Video link" hint="A TikTok of it being made, say.">
              <Input
                type="url"
                inputMode="url"
                placeholder="https://www.tiktok.com/..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Field label="Prep (min)">
                <NumberInput min={0} className="w-24" value={prep} onChange={setPrep} />
              </Field>
              <Field label="Cook (min)">
                <NumberInput min={0} className="w-24" value={cook} onChange={setCook} />
              </Field>
            </div>

            <RecipeClassifier
              householdId={householdId}
              value={filing}
              onChange={setFiling}
              sectionsHidden
            />
          </div>
        )}
      </Card>

      <Button type="submit" full size="lg" disabled={saving || !name.trim()}>
        Create recipe
      </Button>
    </form>
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
