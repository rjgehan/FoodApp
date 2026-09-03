import { useState, type FormEvent } from 'react';
import { api, imageUrl } from '../api/client';
import type { Recipe } from '../api/types';
import UnitInput from './UnitInput';
import {
  Button,
  Card,
  Chip,
  Field,
  IconButton,
  Input,
  NumberInput,
  Textarea,
} from './ui';
import { PlusIcon, TrashIcon } from './icons';
import ImagePicker from './ImagePicker';
import RecipeClassifier from './RecipeClassifier';
import { SECTION_OPTIONS, DEFAULT_FILING, type Filing } from '../utils/recipeMeta';

export interface DraftIngredient {
  ingredientName: string;
  quantity: number | null;
  unit: string;
}

export const emptyIngredient: DraftIngredient = { ingredientName: '', quantity: null, unit: '' };

/**
 * The recipe form, used to write a new one and to fix an existing one. Passing `recipe` seeds
 * every field from it and switches the save to a PUT, so create and edit can never drift apart
 * — a field added here shows up in both.
 */
export default function RecipeForm({
  householdId,
  recipe,
  onSaved,
}: {
  householdId: string;
  recipe?: Recipe;
  onSaved: (recipe: Recipe) => void;
}) {
  const editing = recipe !== undefined;
  const [name, setName] = useState(recipe?.name ?? '');
  const [servings, setServings] = useState<number | null>(recipe?.servings ?? 4);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>(
    recipe?.ingredients.length
      ? recipe.ingredients.map((i) => ({
          ingredientName: i.ingredientName,
          quantity: i.quantity,
          unit: i.unit ?? '',
        }))
      : [{ ...emptyIngredient }],
  );
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '');
  const [filing, setFiling] = useState<Filing>(
    // A recipe you own is normally filed, but an unfiled one still has to land somewhere.
    recipe
      ? { section: recipe.section ?? DEFAULT_FILING.section, categories: recipe.categories }
      : DEFAULT_FILING,
  );

  // Everything optional lives behind this, so the first screen is just the recipe.
  // Opened by default when editing: if any of it is already filled in, hiding it would look
  // like the edit form had quietly dropped the values.
  const [showExtras, setShowExtras] = useState(
    Boolean(recipe?.description || recipe?.prepTimeMinutes || recipe?.cookTimeMinutes
      || recipe?.coverImageId || recipe?.videoUrl),
  );
  const [description, setDescription] = useState(recipe?.description ?? '');
  const [prep, setPrep] = useState<number | null>(recipe?.prepTimeMinutes ?? null);
  const [cook, setCook] = useState<number | null>(recipe?.cookTimeMinutes ?? null);
  const [coverImageId, setCoverImageId] = useState<string | null>(recipe?.coverImageId ?? null);
  const [videoUrl, setVideoUrl] = useState(recipe?.videoUrl ?? '');

  const [saving, setSaving] = useState(false);

  function updateIngredient(index: number, patch: Partial<DraftIngredient>) {
    setIngredients((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
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
      };
      onSaved(
        editing
          ? await api<Recipe>('PUT', `/api/recipes/${recipe.id}`, payload)
          : await api<Recipe>('POST', `/api/households/${householdId}/recipes`, payload),
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
                <UnitInput
                  className="flex-1"
                  value={row.unit}
                  onChange={(unit) => updateIngredient(i, { unit })}
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
        {saving ? 'Saving…' : editing ? 'Save changes' : 'Save recipe'}
      </Button>
    </form>
  );
}
