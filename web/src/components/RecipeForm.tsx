import { useEffect, useState, type FormEvent } from 'react';
import { api, imageUrl } from '../api/client';
import type { Recipe, RecipeCategory, RecipeSection, SourceLink } from '../api/types';
import UnitInput from './UnitInput';
import { Button, Chip, ErrorText, Field, IconButton, Input, NumberInput, Textarea } from './ui';
import { PlusIcon, TrashIcon } from './icons';
import ImagePicker from './ImagePicker';
import RecipeClassifier from './RecipeClassifier';
import LinksEditor, { fromDraftLinks, toDraftLinks, type DraftLink } from './LinksEditor';
import { SECTION_OPTIONS, DEFAULT_FILING, moveToDrawer, type Filing } from '../utils/recipeMeta';
import { splitAmount } from '../utils/amount';

export interface DraftIngredient {
  ingredientName: string;
  quantity: number | null;
  unit: string;
  /** Something a cook might skip — chosen per occasion when the recipe is planned. */
  optional?: boolean;
}

export const emptyIngredient: DraftIngredient = { ingredientName: '', quantity: null, unit: '', optional: false };

/** What the recipe writer hands back: fields to start from, with no saved recipe behind them. */
export interface RecipeDraft {
  name: string;
  description: string | null;
  instructions: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number;
  ingredients: { ingredientName: string; quantity: number | null; unit: string }[];
  /** Where it was read from, when it came off a link. */
  links?: SourceLink[] | null;
}

/**
 * The recipe form, used to write a new one and to fix an existing one. Passing `recipe` seeds
 * every field from it and switches the save to a PUT, so create and edit can never drift apart
 * — a field added here shows up in both.
 *
 * Laid out as one page of plain sections rather than a stack of cards, and each ingredient is a
 * single line — amount, unit, name — the way a recipe is written, so a list of twelve fits on
 * a phone screen instead of three.
 */
export default function RecipeForm({
  householdId,
  recipe,
  draft,
  section,
  groups,
  onSaved,
}: {
  householdId: string;
  recipe?: Recipe;
  /** Starting values with nothing saved behind them — a written-for-you recipe, say. */
  draft?: RecipeDraft;
  /** Where a new recipe is filed to begin with — Breakfast, when made from the breakfast slot. */
  section?: RecipeSection;
  /** Groups a new recipe starts in — the one you were looking at when you pressed Add recipe. */
  groups?: string[];
  onSaved: (recipe: Recipe) => void;
}) {
  // `recipe` means "this already exists, save over it"; `draft` only seeds the fields.
  const editing = recipe !== undefined;
  const seed = recipe ?? draft;
  const [name, setName] = useState(seed?.name ?? '');
  const [servings, setServings] = useState<number | null>(seed?.servings ?? 4);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>(
    seed?.ingredients.length
      ? seed.ingredients.map((i) => ({
          ingredientName: i.ingredientName,
          quantity: i.quantity,
          unit: i.unit ?? '',
          optional: 'optional' in i ? Boolean(i.optional) : false,
        }))
      : [{ ...emptyIngredient }],
  );
  // The row just added with Enter, so it can take the cursor.
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [instructions, setInstructions] = useState(seed?.instructions ?? '');
  const [filing, setFiling] = useState<Filing>(
    // A recipe you own is normally filed, but an unfiled one still has to land somewhere.
    recipe
      ? { section: recipe.section ?? DEFAULT_FILING.section, categories: recipe.categories }
      : { section: section ?? DEFAULT_FILING.section, categories: groups ?? DEFAULT_FILING.categories },
  );
  // Groups sit with the drawer, and open when there is already one ticked — a recipe started
  // from inside Chicken should show Chicken ticked, not hide it behind a button.
  const [showGroups, setShowGroups] = useState(filing.categories.length > 0);
  // The household's groups, so changing the drawer knows which ticked ones live in the new one.
  const [known, setKnown] = useState<RecipeCategory[]>([]);
  const [parked, setParked] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    api<RecipeCategory[]>('GET', `/api/households/${householdId}/recipe-categories`)
      .then((all) => live && setKnown(all))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [householdId]);

  // Started from inside Veggie and then moved to Lunch: Veggie is a Dinner group, so it is set
  // aside rather than made again, empty, in Lunch — and comes back if Dinner is picked again.
  function chooseSection(section: RecipeSection) {
    const moved = moveToDrawer(filing, section, known, parked);
    setParked(moved.parked);
    setFiling(moved.filing);
  }

  // Everything optional lives behind this, so the first screen is just the recipe.
  // Opened by default when editing: if any of it is already filled in, hiding it would look
  // like the edit form had quietly dropped the values.
  const [showExtras, setShowExtras] = useState(
    Boolean(seed?.description || seed?.prepTimeMinutes || seed?.cookTimeMinutes || recipe?.coverImageId),
  );
  const [description, setDescription] = useState(seed?.description ?? '');
  const [prep, setPrep] = useState<number | null>(seed?.prepTimeMinutes ?? null);
  const [cook, setCook] = useState<number | null>(seed?.cookTimeMinutes ?? null);
  const [coverImageId, setCoverImageId] = useState<string | null>(recipe?.coverImageId ?? null);
  const [links, setLinks] = useState<DraftLink[]>(() => toDraftLinks(seed?.links));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateIngredient(index: number, patch: Partial<DraftIngredient>) {
    setIngredients((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setFocusRow(ingredients.length);
    setIngredients((rows) => [...rows, { ...emptyIngredient }]);
  }

  /**
   * "2 cups flour" typed into the name, with the amount boxes still empty, is split into them.
   * Typing a line the way it is written on the card is faster than hopping between three boxes.
   */
  function splitTyped(index: number) {
    const row = ingredients[index];
    if (!row || row.quantity !== null || row.unit) return;
    const amount = splitAmount(row.ingredientName);
    if (amount.quantity !== null) {
      updateIngredient(index, { quantity: amount.quantity, unit: amount.unit, ingredientName: amount.name });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        prepTimeMinutes: prep,
        cookTimeMinutes: cook,
        servings: servings ?? 1,
        coverImageId,
        // The whole list, every time: sending it is what tells the server this form knows
        // about links, so leaving one out removes it rather than being taken as "unchanged".
        links: fromDraftLinks(links),
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
    } catch (err) {
      // A link the server will not keep is the likeliest reason, and it says which in a sentence.
      setError(err instanceof Error ? err.message : 'Could not save the recipe.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Recipe name"
          aria-label="Recipe name"
          className="h-12 text-lg font-semibold"
        />
        <label className="flex items-center gap-3 text-muted">
          Serves
          <NumberInput min={1} className="w-20" value={servings} onChange={setServings} aria-label="Serves" />
        </label>
      </div>

      <section>
        <h2 className="text-lg font-semibold">Ingredients</h2>
        <p className="mb-1 text-sm text-muted">Type a line like “2 cups flour” — the amount fills itself in. Opt marks an optional extra.</p>
        <ul className="divide-y divide-line">
          {ingredients.map((row, i) => (
            <li key={i} className="flex items-center gap-1.5 py-1.5">
              <NumberInput
                className="w-16 shrink-0"
                placeholder="qty"
                value={row.quantity}
                onChange={(v) => updateIngredient(i, { quantity: v })}
                aria-label={`Ingredient ${i + 1} amount`}
              />
              <UnitInput
                className="w-[5.5rem] shrink-0"
                value={row.unit}
                onChange={(unit) => updateIngredient(i, { unit })}
                aria-label={`Ingredient ${i + 1} unit`}
              />
              <Input
                className="min-w-0 flex-1"
                placeholder="ingredient"
                value={row.ingredientName}
                autoFocus={focusRow === i}
                enterKeyHint="next"
                onChange={(e) => updateIngredient(i, { ingredientName: e.target.value })}
                onBlur={() => splitTyped(i)}
                onKeyDown={(e) => {
                  // Enter moves on to a fresh line rather than submitting half a recipe.
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  splitTyped(i);
                  if (i === ingredients.length - 1 && row.ingredientName.trim()) addRow();
                }}
                aria-label={`Ingredient ${i + 1}`}
              />
              <button
                type="button"
                aria-pressed={Boolean(row.optional)}
                title={row.optional ? 'Optional — tap to require it' : 'Tap to mark optional'}
                onClick={() => updateIngredient(i, { optional: !row.optional })}
                className={
                  'shrink-0 rounded-full px-2 py-1 text-xs font-medium ' +
                  (row.optional ? 'bg-accent-soft text-accent' : 'bg-elevated text-subtle')
                }
              >
                Opt
              </button>
              <IconButton
                label={`Remove ingredient ${i + 1}`}
                className="text-subtle"
                disabled={ingredients.length === 1}
                onClick={() => setIngredients((rows) => rows.filter((_, idx) => idx !== i))}
              >
                <TrashIcon className="h-5 w-5" />
              </IconButton>
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={addRow}>
          <PlusIcon className="h-4 w-4" />
          Add ingredient
        </Button>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Method</h2>
        <Textarea
          rows={6}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="One step per line."
          aria-label="Method"
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Links</h2>
        <p className="mb-1 text-sm text-muted">Where it came from, a video of it being made — as many as you like.</p>
        <LinksEditor value={links} onChange={setLinks} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Filed under</h2>
        <div className="flex flex-wrap gap-2">
          {SECTION_OPTIONS.map((s) => (
            <Chip key={s.value} active={filing.section === s.value} onClick={() => chooseSection(s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
        {showGroups ? (
          <div className="mt-4">
            <RecipeClassifier householdId={householdId} value={filing} onChange={setFiling} groups={known} sectionsHidden />
          </div>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="-ml-3 mt-1" onClick={() => setShowGroups(true)}>
            <PlusIcon className="h-4 w-4" />
            Put it in a group
          </Button>
        )}
      </section>

      <section>
        {!showExtras ? (
          <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={() => setShowExtras(true)}>
            <PlusIcon className="h-4 w-4" />
            Photo and times
          </Button>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">More</h2>
            {coverImageId && (
              <img
                src={imageUrl(coverImageId)}
                alt=""
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
            )}
            <ImagePicker householdId={householdId} onUploaded={(ids) => setCoverImageId(ids[0] ?? null)}>
              {coverImageId ? 'Replace photo' : 'Add a photo'}
            </ImagePicker>

            <Field label="A line about it">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <div className="flex gap-3">
              <Field label="Prep (min)">
                <NumberInput min={0} className="w-24" value={prep} onChange={setPrep} />
              </Field>
              <Field label="Cook (min)">
                <NumberInput min={0} className="w-24" value={cook} onChange={setCook} />
              </Field>
            </div>
          </div>
        )}
      </section>

      {error && <ErrorText>{error}</ErrorText>}
      <Button type="submit" full size="lg" disabled={saving || !name.trim()}>
        {saving ? 'Saving…' : editing ? 'Save changes' : 'Save recipe'}
      </Button>
    </form>
  );
}
