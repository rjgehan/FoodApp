import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Recipe, RecipeCategory, RecipeSection, SourceLink } from '../api/types';
import UnitInput from './UnitInput';
import { Button, Chip, cx, ErrorText, Input, NumberInput, Pill, SectionLabel, Textarea } from './ui';
import { Icon, type IconName } from './icons';
import CoverPicker from './recipe/CoverPicker';
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

/** A recipe read off a link or a paste: fields to start from, with no saved recipe behind them. */
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
  /** The picture the link came with — a video's cover, a page's photo — already saved. */
  coverImageId?: string | null;
}

/**
 * The recipe form, used to write a new one and to fix an existing one. Passing `recipe` seeds
 * every field from it and switches the save to a PUT, so create and edit can never drift apart
 * — a field added here shows up in both.
 *
 * Laid out as the mockup's "Check recipe" (3.16): the picture beside the name, the times and
 * servings in a row, then each ingredient as one line — the amount and unit as small chips, the
 * name, and a leaf that makes it optional — the way a recipe is written, so a list of twelve
 * fits on a phone screen instead of three. Filing comes last, as chips.
 *
 * `id` names the form, so a Save in the screen's top bar can submit it from outside.
 */
export default function RecipeForm({
  id,
  householdId,
  recipe,
  draft,
  section,
  groups,
  savedLinkId,
  onSaved,
}: {
  id?: string;
  householdId: string;
  recipe?: Recipe;
  /** Starting values with nothing saved behind them — a recipe read off a link, say. */
  draft?: RecipeDraft;
  /** Where a new recipe is filed to begin with — Breakfast, when made from the breakfast slot. */
  section?: RecipeSection;
  /** Groups a new recipe starts in — the one you were looking at when you pressed Add recipe. */
  groups?: string[];
  /**
   * The saved link this new recipe is being made from. Saving takes the link off Saved links,
   * and moves any meal planned with it over to the recipe.
   */
  savedLinkId?: string;
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

  const [description, setDescription] = useState(seed?.description ?? '');
  const [prep, setPrep] = useState<number | null>(seed?.prepTimeMinutes ?? null);
  const [cook, setCook] = useState<number | null>(seed?.cookTimeMinutes ?? null);
  // An imported draft can bring the video's cover or the page's photo, already saved — it
  // stays the picture until somebody chooses their own.
  const [coverImageId, setCoverImageId] = useState<string | null>(seed?.coverImageId ?? null);
  const [links, setLinks] = useState<DraftLink[]>(() => toDraftLinks(seed?.links));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

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
    await save(false);
  }

  /** `anotherCopy`: the household already has it and a second one is meant. */
  async function save(anotherCopy: boolean) {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setDuplicate(null);
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
        // A blank amount goes as none — "salt and pepper" is "some", not 1 of it.
        ingredients: ingredients.filter((i) => i.ingredientName.trim()),
        ...(savedLinkId && !editing ? { savedLinkId } : {}),
      };
      onSaved(
        editing
          ? await api<Recipe>('PUT', `/api/recipes/${recipe.id}`, payload)
          : await api<Recipe>(
              'POST',
              `/api/households/${householdId}/recipes${anotherCopy ? '?allowDuplicate=true' : ''}`,
              payload,
            ),
      );
    } catch (err) {
      // Already in the catalog — the same link or the same name. Say which, rather than a bare
      // refusal, and let a second copy through when that is what's meant.
      const body = err instanceof ApiError ? (err.body as { existingRecipeId?: string; existingName?: string }) : null;
      if (err instanceof ApiError && err.status === 409 && body?.existingRecipeId) {
        setDuplicate({ id: body.existingRecipeId, name: body.existingName ?? name.trim() });
        return;
      }
      // A link the server will not keep is the likeliest reason, and it says which in a sentence.
      setError(err instanceof Error ? err.message : 'Could not save the recipe.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id={id} onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <CoverPicker
          householdId={householdId}
          coverImageId={coverImageId}
          seed={recipe?.id ?? name}
          onChange={setCoverImageId}
          onError={setError}
        />
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Recipe name"
          aria-label="Recipe name"
          className="h-11 min-w-0 flex-1 text-[1.0625rem]"
        />
      </div>

      {/* The quick facts the recipe page shows on its photo, in the same order. */}
      <div className="flex gap-2">
        <FactField icon="clock" label="Prep (min)" suffix="min prep" value={prep} onChange={setPrep} min={0} />
        <FactField icon="flame" label="Cook (min)" suffix="cook" value={cook} onChange={setCook} min={0} />
        <FactField icon="users" label="Serves" value={servings} onChange={setServings} min={1} narrow />
      </div>

      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="A line about it (optional)"
        aria-label="A line about it"
        className="h-11 text-[0.9375rem]"
      />

      <section className="flex flex-col gap-1.5 pt-1.5">
        <SectionLabel className="!px-0" end={<span className="font-medium normal-case">Leaf = optional</span>}>
          Ingredients
        </SectionLabel>
        <p className="-mt-1 pb-1 text-[0.8125rem] text-muted">Type a line like “2 cups flour” — the amount fills itself in.</p>
        <ul className="flex flex-col gap-1.5">
          {ingredients.map((row, i) => (
            <li
              key={i}
              className={cx(
                'flex min-h-[2.75rem] items-center gap-1.5 rounded-xl border border-line bg-surface py-1 pl-2.5 pr-1',
                'focus-within:border-accent focus-within:shadow-[inset_0_0_0_0.5px_rgb(var(--accent))]',
              )}
            >
              <NumberInput
                placeholder="qty"
                value={row.quantity}
                onChange={(v) => updateIngredient(i, { quantity: v })}
                aria-label={`Ingredient ${i + 1} amount`}
                style={{ width: `calc(${row.quantity == null ? 3 : String(row.quantity).length}ch + 1.1rem)` }}
                className={cx(CHIP, '!bg-sky-soft !text-sky placeholder:!text-sky/50')}
              />
              <UnitInput
                value={row.unit}
                onChange={(unit) => updateIngredient(i, { unit })}
                aria-label={`Ingredient ${i + 1} unit`}
                chevron={false}
                className="shrink-0"
                style={{ width: `calc(${row.unit ? row.unit.length : 4}ch + 1.1rem)` }}
                inputClassName={cx(CHIP, '!bg-herb-soft !text-herb placeholder:!text-herb/50')}
              />
              <input
                className="h-9 min-w-0 flex-1 bg-transparent px-1 text-[0.9375rem] text-ink outline-none placeholder:text-faint"
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
              {/* The leaf: something a cook might skip, chosen each time the meal is planned. */}
              <button
                type="button"
                aria-pressed={Boolean(row.optional)}
                aria-label={`Ingredient ${i + 1} optional`}
                title={row.optional ? 'Optional — tap to require it' : 'Tap to mark optional'}
                onClick={() => updateIngredient(i, { optional: !row.optional })}
                className="press flex h-9 shrink-0 items-center justify-center rounded-lg px-1.5"
              >
                {row.optional ? <Pill tone="mustard">Opt.</Pill> : <Icon name="leaf" size={16} className="text-faint" />}
              </button>
              <button
                type="button"
                aria-label={`Remove ingredient ${i + 1}`}
                title="Remove"
                disabled={ingredients.length === 1}
                onClick={() => setIngredients((rows) => rows.filter((_, idx) => idx !== i))}
                className="press flex h-9 w-7 shrink-0 items-center justify-center rounded-lg text-faint disabled:opacity-30"
              >
                <Icon name="x" size={15} />
              </button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" icon="plus" className="-ml-2 self-start" onClick={addRow}>
          Add ingredient
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel className="!px-0">Method</SectionLabel>
        <Textarea
          rows={6}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="One step per line."
          aria-label="Method"
        />
      </section>

      <section className="flex flex-col gap-1">
        <SectionLabel className="!px-0">Links</SectionLabel>
        <p className="text-[0.8125rem] text-muted">Where it came from, a video of it being made — as many as you like.</p>
        <LinksEditor value={links} onChange={setLinks} />
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel className="!px-0">Filing</SectionLabel>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Drawer">
          {SECTION_OPTIONS.map((s) => (
            <Chip key={s.value} active={filing.section === s.value} onClick={() => chooseSection(s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
        {showGroups ? (
          <div className="mt-2">
            <RecipeClassifier householdId={householdId} value={filing} onChange={setFiling} groups={known} sectionsHidden />
          </div>
        ) : (
          <Button type="button" variant="ghost" size="sm" icon="plus" className="-ml-2 self-start" onClick={() => setShowGroups(true)}>
            Put it in a group
          </Button>
        )}
      </section>

      {error && <ErrorText>{error}</ErrorText>}
      {duplicate && (
        <div role="alert" className="space-y-3 rounded-xl bg-accent-soft p-4 text-[0.9375rem]">
          <p>
            You already have <span className="font-medium">“{duplicate.name}”</span> in your recipes.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/recipes/${duplicate.id}`}
              className="flex h-9 items-center rounded-[10px] bg-accent px-3 text-[0.9375rem] font-medium text-on-accent"
            >
              Open it
            </Link>
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => save(true)}>
              Save another copy
            </Button>
          </div>
        </div>
      )}
      <Button type="submit" full size="lg" className="mt-1" disabled={saving || !name.trim()}>
        {saving ? 'Saving…' : editing ? 'Save changes' : 'Save recipe'}
      </Button>
    </form>
  );
}

/** The ingredient line's amount and unit, drawn as the mockup's small chips. */
const CHIP =
  '!h-[26px] shrink-0 !rounded-full !border-0 !px-2 text-center !text-xs !font-semibold !shadow-none ' +
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** "⏱ 10 min prep": a small number field with its icon and what the number means. */
function FactField({
  icon,
  label,
  suffix,
  value,
  onChange,
  min,
  narrow = false,
}: {
  icon: IconName;
  label: string;
  suffix?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  narrow?: boolean;
}) {
  return (
    <label
      className={cx(
        'flex h-[2.625rem] min-w-0 items-center gap-1.5 rounded-field border border-line bg-surface px-3 text-sm',
        'transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-focus',
        narrow ? 'w-[4.5rem] shrink-0' : suffix && suffix.length > 5 ? 'flex-[1.25]' : 'flex-1',
      )}
    >
      <Icon name={icon} size={18} className="mr-0.5 shrink-0 text-muted" />
      <NumberInput
        min={min}
        value={value}
        onChange={onChange}
        aria-label={label}
        placeholder="–"
        style={narrow ? undefined : { width: `calc(${value == null ? 1 : String(value).length}ch + 2px)` }}
        className={cx(
          '!h-auto min-w-0 shrink-0 !border-0 !bg-transparent !px-0 !shadow-none text-sm',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
          narrow && '!w-full',
        )}
      />
      {suffix && <span className="min-w-0 truncate text-muted">{suffix}</span>}
    </label>
  );
}
