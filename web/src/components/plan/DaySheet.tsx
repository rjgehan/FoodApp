import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { CupboardItem, MealPlanEntry, MealType, Place, Recipe, SavedLink } from '../../api/types';
import { entryLabel } from '../../utils/planEntry';
import { Icon } from '../icons';
import { toast } from '../toast';
import { Button, ConfirmAlert, cx, ErrorText, NoteBox, Pill, Sheet } from '../ui';
import PlaceActions from '../PlaceActions';
import FillSlot, { type SlotChoice } from './FillSlot';
import MealOptionsSheet from './MealOptionsSheet';
import MealPicture from './MealPicture';
import NewRecipeSheet from './NewRecipeSheet';
import { ExtrasSheet, ServingsStepper, TimeSheet, useDraftServings } from './PlanBits';
import { addMealToGroceries, fillSlot, patchEntry, removeEntry, type Filling } from './planApi';
import {
  BASE_MEALS,
  contributes,
  dishCount,
  dishDetail,
  fromIso,
  mealTitle,
  SECTION_FOR_MEAL,
  shortDay,
  slotMark,
  slotTime,
  startOfDay,
  takesSides,
  timeOf,
  type ShoppingMap,
} from './planModel';

type Fill = { meal: MealType; replacing: MealPlanEntry | null; role: 'Main' | 'Side' };
type Extras = { recipe: Recipe; initial: string[]; editing: MealPlanEntry | null };

/**
 * A day (the mockup's 2.4): pick a meal along the top — Breakfast, Lunch, Dinner, each saying
 * what is in it — and work on that one meal underneath. Its main and sides with their roles, the
 * servings, the optional extras being skipped, Swap, Time and Delete, and the one big action:
 * putting this meal on the grocery list.
 *
 * Everything that happens to a meal starts here and stacks on top: filling a slot, making a
 * recipe for it, the extras question, a dish's options. `optionsOnly` opens straight onto one
 * dish's options (a long-press on the plan) and closes when they do.
 */
export default function DaySheet({
  date,
  householdId,
  entries,
  recipes,
  places,
  pictures,
  shopping,
  defaultServings,
  initialMeal,
  optionsOnly,
  onChanged,
  onRecipeCreated,
  onPlacesChanged,
  onClose,
}: {
  date: string;
  householdId: string;
  entries: MealPlanEntry[];
  recipes: Recipe[];
  places: Place[];
  pictures: Map<string, string> | null;
  shopping: ShoppingMap | null;
  defaultServings: number;
  initialMeal?: MealType;
  /** Open on this dish's options alone. */
  optionsOnly?: string;
  onChanged: () => Promise<void>;
  onRecipeCreated: (recipe: Recipe) => void;
  onPlacesChanged: (places: Place[]) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const day = fromIso(date);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const planned = entries.filter((e) => entryLabel(e));
  const dishesOf = (meal: MealType) => planned.filter((e) => e.mealType === meal);

  const [meal, setMeal] = useState<MealType>(() => {
    if (initialMeal) return initialMeal;
    if (dishesOf('DINNER').length) return 'DINNER';
    return planned[0]?.mealType ?? 'DINNER';
  });
  const [fill, setFill] = useState<Fill | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [options, setOptions] = useState<string | null>(optionsOnly ?? null);
  const [timeFor, setTimeFor] = useState<MealPlanEntry[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [cupboard, setCupboard] = useState<CupboardItem[]>([]);

  useEffect(() => {
    api<CupboardItem[]>('GET', `/api/households/${householdId}/cupboard`).then(setCupboard).catch(() => setCupboard([]));
    api<SavedLink[]>('GET', `/api/households/${householdId}/saved-links`).then(setSavedLinks).catch(() => setSavedLinks([]));
  }, [householdId]);

  // Opened for one dish's options and they have gone, with nothing else on top: done.
  useEffect(() => {
    if (optionsOnly && !options && !fill && !creating && !extras && !timeFor) onClose();
  }, [optionsOnly, options, fill, creating, extras, timeFor, onClose]);

  const dishes = dishesOf(meal);
  const main = dishes[0];
  const slots: MealType[] = [...BASE_MEALS, ...(meal === 'SNACK' || dishesOf('SNACK').length ? (['SNACK'] as MealType[]) : [])];
  const slotName = (m: MealType) => `${fromIso(date).toLocaleDateString(undefined, { weekday: 'long' })} ${m.toLowerCase()}`;
  const cooked = dishes.filter(contributes);
  const recipeServings = dishes.find((d) => d.recipeId)?.servings ?? defaultServings;
  const [servings, setServings] = useDraftServings(recipeServings, async (value) => {
    await Promise.all(dishes.filter((d) => d.recipeId).map((d) => patchEntry(householdId, d.id, { servings: value })));
    await onChanged();
  });

  async function run(work: () => Promise<void>, failure = 'That did not work. Try again.') {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? "That's already on this meal." : failure);
    } finally {
      setBusy(false);
    }
  }

  /** Puts something in the slot being filled, or swaps the dish being changed. */
  function put(what: Filling) {
    if (!fill) return;
    const target = fill;
    return run(async () => {
      await fillSlot(householdId, date, target.meal, what, { replacing: target.replacing, servings: defaultServings });
      await onChanged();
      setMeal(target.meal);
      setFill(null);
      setCreating(null);
      setExtras(null);
    }, 'Could not add that.');
  }

  /**
   * A recipe with optional ingredients pauses on the extras question first — asked once, here,
   * rather than every time something later puts this meal on the list. Re-picking the recipe a
   * dish already has keeps whatever was chosen for it last time.
   */
  function pickRecipe(recipe: Recipe) {
    if (!recipe.ingredients.some((i) => i.optional)) {
      put({ recipeId: recipe.id });
      return;
    }
    const same = fill?.replacing?.recipeId === recipe.id ? fill.replacing.includedOptionalIngredientIds : [];
    setExtras({ recipe, initial: same, editing: null });
  }

  async function choose(choice: SlotChoice) {
    switch (choice.kind) {
      case 'recipe':
        return pickRecipe(choice.recipe);
      case 'item':
        return put({ itemName: choice.name });
      case 'link':
        return put({ savedLinkId: choice.link.id });
      case 'create':
        setError(null);
        return setCreating(choice.name);
      case 'place': {
        // Typing a name that is not saved yet makes the place, the way a new group works.
        const picked = choice.place;
        if ('id' in picked) return put({ placeId: picked.id, time: choice.time });
        return run(async () => {
          const saved = await api<Place>('POST', `/api/households/${householdId}/places`, { name: picked.name });
          onPlacesChanged(
            places.some((p) => p.id === saved.id) ? places : [...places, saved].sort((a, b) => a.name.localeCompare(b.name)),
          );
          await put({ placeId: saved.id, time: choice.time });
        });
      }
    }
  }

  function addToGroceries(list: MealPlanEntry[], what: string) {
    return run(async () => {
      for (const d of list) await addMealToGroceries(householdId, d.id);
      await onChanged();
      toast(`${what} added to groceries`, { icon: 'cart' });
    }, 'Could not add that to Groceries.');
  }

  const optionsEntry = options ? planned.find((e) => e.id === options) : undefined;
  const fillTitle = fill ? `${mealTitle(fill.meal)} · ${shortDay(day)}` : '';
  const skipped = cooked.flatMap((d) => {
    const r = d.recipeId ? recipeById.get(d.recipeId) : undefined;
    return (r?.ingredients ?? []).filter((i) => i.optional && !d.includedOptionalIngredientIds.includes(i.id));
  });
  const today = startOfDay(new Date());
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const subtitle =
    diff === 0
      ? 'Today'
      : diff === 1
        ? 'Tomorrow'
        : diff === -1
          ? 'Yesterday'
          : day.toLocaleDateString(undefined, {
              month: 'long',
              year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric',
            });
  const mark = slotMark(dishes, shopping);
  const allListed = mark?.label === 'On grocery list';

  return (
    <>
      {!optionsOnly && (
        <Sheet
          title={`${day.toLocaleDateString(undefined, { weekday: 'long' })} ${day.getDate()}`}
          subtitle={subtitle}
          label={`Plan for ${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
          onClose={onClose}
        >
          <div className="flex flex-col gap-4">
            {/* The meals of the day, the open one filled in with the text colour. */}
            <div role="tablist" aria-label="Meal" className="flex gap-2">
              {slots.map((m) => {
                const on = m === meal;
                const ds = dishesOf(m);
                return (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setMeal(m)}
                    className={cx(
                      'press flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[14px] py-2.5',
                      on ? 'bg-ink text-bg' : 'border border-line bg-surface',
                    )}
                  >
                    <span className="text-[0.8125rem] font-semibold">{mealTitle(m)}</span>
                    <span className="text-[0.6875rem] opacity-70">{dishCount(ds)}</span>
                  </button>
                );
              })}
            </div>

            {error && <ErrorText>{error}</ErrorText>}

            {dishes.length === 0 ? (
              <div className="dash flex flex-col items-center gap-3 px-4 py-6 text-center">
                <p className="text-[0.9375rem] text-muted">Nothing planned for {meal.toLowerCase()} yet.</p>
                <Button icon="plus" onClick={() => setFill({ meal, replacing: null, role: 'Main' })}>
                  Plan {meal.toLowerCase()}
                </Button>
              </div>
            ) : (
              <div className="card flex flex-col gap-3 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.9375rem] font-semibold">
                    {mealTitle(meal)}
                    {timeOf(dishes) && ` · ${slotTime(timeOf(dishes))}`}
                  </span>
                  {dishes.some((d) => d.recipeId) && (
                    <ServingsStepper value={servings} onChange={setServings} disabled={busy} label />
                  )}
                </div>

                <ul className="flex flex-col gap-3" aria-label={`${mealTitle(meal)} dishes`}>
                  {dishes.map((d, i) => {
                    const recipe = d.recipeId ? recipeById.get(d.recipeId) : undefined;
                    const place = d.placeId ? placeById.get(d.placeId) : undefined;
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => setOptions(d.id)}
                          aria-label={`${entryLabel(d)} options`}
                          className="press -m-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-xl p-1 text-left active:bg-surface2"
                        >
                          <MealPicture entry={d} recipe={recipe} pictures={pictures} size={44} radius={10} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.9375rem] font-semibold">{entryLabel(d)}</span>
                            <span
                              className={cx(
                                'block truncate text-xs',
                                d.needsIngredients || d.recipeDeleted ? 'text-accent-ink' : 'text-muted',
                              )}
                            >
                              {d.placeId ? place?.notes || 'Eat out' : dishDetail(d, recipe)}
                            </span>
                          </span>
                          {!d.placeId && (
                            <Pill tone={i === 0 ? 'accent' : 'mustard'}>{i === 0 ? 'Main' : 'Side'}</Pill>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {takesSides(dishes) && (
                  <button
                    type="button"
                    onClick={() => setFill({ meal, replacing: null, role: 'Side' })}
                    className="press flex items-center gap-1.5 self-start text-[0.8125rem] font-semibold text-accent-ink"
                  >
                    <Icon name="plus" size={15} />
                    Add a side
                  </button>
                )}

                {main?.placeId && (
                  <div className="flex gap-2">
                    <PlaceActions place={placeById.get(main.placeId)} />
                  </div>
                )}

                {skipped.length > 0 && (
                  <NoteBox tone="mustard" icon="leaf">
                    Skipping this time:{' '}
                    {skipped.map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && ', '}
                        <b>{s.ingredientName}</b>
                      </span>
                    ))}{' '}
                    (optional)
                  </NoteBox>
                )}
              </div>
            )}

            {dishes.length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  icon="swap"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => setFill({ meal, replacing: main, role: 'Main' })}
                >
                  Swap
                </Button>
                <Button variant="secondary" icon="clock" className="flex-1" disabled={busy} onClick={() => setTimeFor(dishes)}>
                  Time
                </Button>
                <Button
                  variant="secondary"
                  className="w-[52px] !px-0"
                  aria-label={`Remove ${meal.toLowerCase()}`}
                  disabled={busy}
                  onClick={() => setRemoving(true)}
                >
                  <Icon name="trash" size={18} />
                </Button>
              </div>
            )}

            {cooked.length > 0 && (
              <Button
                size="lg"
                full
                icon={allListed ? 'check' : 'cart'}
                variant={allListed ? 'secondary' : 'primary'}
                disabled={busy}
                onClick={() => addToGroceries(cooked, mealTitle(meal))}
              >
                {allListed ? `${mealTitle(meal)} is on the list` : `Add ${meal.toLowerCase()} to groceries`}
              </Button>
            )}
            {main?.placeId && (
              <NoteBox tone="plum" icon="utensils">
                Eating out, so there is nothing to buy.
              </NoteBox>
            )}

            {!slots.includes('SNACK') && (
              <Button variant="ghost" full icon="plus" onClick={() => setMeal('SNACK')}>
                Add a snack
              </Button>
            )}
          </div>
        </Sheet>
      )}

      {optionsEntry && (
        <MealOptionsSheet
          entry={optionsEntry}
          recipe={optionsEntry.recipeId ? recipeById.get(optionsEntry.recipeId) : undefined}
          place={optionsEntry.placeId ? placeById.get(optionsEntry.placeId) : undefined}
          pictures={pictures}
          shopping={shopping?.get(optionsEntry.id)}
          defaultServings={defaultServings}
          busy={busy}
          onSwap={() => {
            const sameMeal = dishesOf(optionsEntry.mealType);
            setFill({
              meal: optionsEntry.mealType,
              replacing: optionsEntry,
              role: sameMeal[0]?.id === optionsEntry.id ? 'Main' : 'Side',
            });
            setOptions(null);
          }}
          onServings={async (value) => {
            await patchEntry(householdId, optionsEntry.id, { servings: value });
            await onChanged();
          }}
          onTime={() => setTimeFor([optionsEntry])}
          onExtras={() => {
            const r = optionsEntry.recipeId ? recipeById.get(optionsEntry.recipeId) : undefined;
            if (r) setExtras({ recipe: r, initial: optionsEntry.includedOptionalIngredientIds, editing: optionsEntry });
          }}
          onAddToGroceries={() => addToGroceries([optionsEntry], entryLabel(optionsEntry) ?? 'It')}
          onOpenRecipe={() =>
            navigate(
              optionsEntry.needsIngredients ? `/recipes/${optionsEntry.recipeId}/edit` : `/recipes/${optionsEntry.recipeId}`,
            )
          }
          onRemove={() =>
            run(async () => {
              await removeEntry(householdId, optionsEntry.id);
              setOptions(null);
              await onChanged();
              toast(`Took ${entryLabel(optionsEntry)} off the plan`, { icon: 'trash' });
            })
          }
          onClose={() => setOptions(null)}
        />
      )}

      {fill && (
        <FillSlot
          title={fillTitle}
          role={fill.role}
          recipes={recipes}
          savedLinks={savedLinks}
          cupboard={cupboard}
          places={places}
          dayName={day.toLocaleDateString(undefined, { weekday: 'long' })}
          startOut={fill.replacing?.placeId ? { placeId: fill.replacing.placeId, time: fill.replacing.time } : undefined}
          current={fill.replacing ? fill.replacing.recipeId ?? fill.replacing.savedLinkId : null}
          busy={busy}
          error={creating === null && !extras ? error : null}
          onChoose={choose}
          onClose={() => setFill(null)}
        />
      )}

      {fill && creating !== null && (
        <NewRecipeSheet
          householdId={householdId}
          initialName={creating}
          section={SECTION_FOR_MEAL[fill.meal]}
          servings={defaultServings}
          slotLabel={slotName(fill.meal)}
          onSaved={(recipe) => {
            onRecipeCreated(recipe);
            put({ recipeId: recipe.id });
          }}
          onLinkSaved={(link) => {
            setSavedLinks((all) => [link, ...all.filter((l) => l.id !== link.id)]);
            put({ savedLinkId: link.id });
          }}
          onClose={() => setCreating(null)}
        />
      )}

      {extras && (
        <ExtrasSheet
          recipeName={extras.recipe.name}
          ingredients={extras.recipe.ingredients}
          initial={extras.initial}
          busy={busy}
          editing={Boolean(extras.editing)}
          onDone={(selected) => {
            const editing = extras.editing;
            if (editing) {
              run(async () => {
                await patchEntry(householdId, editing.id, { includedOptionalIngredientIds: selected });
                await onChanged();
                setExtras(null);
              });
            } else {
              put({ recipeId: extras.recipe.id, includedOptionalIngredientIds: selected });
            }
          }}
          onClose={() => setExtras(null)}
        />
      )}

      {timeFor && (
        <TimeSheet
          title={`${mealTitle(timeFor[0].mealType)} time`}
          initial={timeOf(timeFor)}
          busy={busy}
          onSave={(time) =>
            run(async () => {
              await Promise.all(
                timeFor.map((d) => patchEntry(householdId, d.id, time ? { time } : { clearTime: true })),
              );
              await onChanged();
              setTimeFor(null);
            })
          }
          onClose={() => setTimeFor(null)}
        />
      )}

      {removing && (
        <ConfirmAlert
          title={`Remove ${meal.toLowerCase()}?`}
          icon="trash"
          confirmLabel="Remove"
          busy={busy}
          onCancel={() => setRemoving(false)}
          onConfirm={() =>
            run(async () => {
              for (const d of dishes) await removeEntry(householdId, d.id);
              setRemoving(false);
              await onChanged();
            })
          }
        >
          {dishes.length === 1
            ? `${entryLabel(dishes[0])} comes off ${slotName(meal).split(' ')[0]}.`
            : `${entryLabel(dishes[0])} and ${dishes.length - 1} ${dishes.length === 2 ? 'side' : 'sides'} come off ${slotName(meal).split(' ')[0]}.`}
        </ConfirmAlert>
      )}
    </>
  );
}
