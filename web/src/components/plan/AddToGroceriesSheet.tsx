import { useMemo, useState } from 'react';
import type { MealPlanEntry } from '../../api/types';
import { entryLabel } from '../../utils/planEntry';
import { Button, CheckBox, EmptyState, List, NoteBox, Row, Sheet } from '../ui';
import { contributes, fromIso, mealTitle, shortDay, slotsOf, type ShoppingMap } from './planModel';

interface DayLine {
  date: string;
  slots: string;
  dishes: string;
  ingredients: Set<string>;
  allInCupboard: boolean;
}

/**
 * "Add 5 days to groceries?" (the mockup's 2.3). People were flooding their list by catching the
 * old button in passing, and undoing that means ticking off each item by hand. So it asks first,
 * and names the days that will put something on the list — each with its meals and how many
 * things it adds — so it is obvious at a glance whether you meant one day or seven. A day the
 * list already has is shown, unticked, so you can see why it is not counted.
 *
 * Counted by ingredient, as the list is: garlic for Tuesday and garlic for Thursday is one row.
 * What adds nothing is said underneath — eating out, a recipe that is only a name, a saved link,
 * a single food — so nobody wonders where Wednesday went.
 */
export default function AddToGroceriesSheet({
  entries,
  shopping,
  busy,
  onConfirm,
  onClose,
}: {
  /** Every meal planned in the days on offer. */
  entries: MealPlanEntry[];
  shopping: ShoppingMap | null;
  busy: boolean;
  /** The days ticked, as ISO dates. */
  onConfirm: (dates: string[]) => void;
  onClose: () => void;
}) {
  const lines = useMemo<DayLine[]>(() => {
    const byDate = new Map<string, MealPlanEntry[]>();
    for (const e of entries.filter(contributes)) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
    return [...byDate.keys()].sort().map((date) => {
      const dishes = byDate.get(date)!;
      const meals = slotsOf(dishes);
      const ingredients = new Set(dishes.flatMap((d) => shopping?.get(d.id)?.toAdd ?? []));
      return {
        date,
        slots: meals.map((s) => mealTitle(s.meal)).join(' + '),
        dishes: dishes.map((d) => entryLabel(d)).join(', '),
        ingredients,
        allInCupboard: dishes.every((d) => shopping?.get(d.id)?.status === 'IN_CUPBOARD'),
      };
    });
  }, [entries, shopping]);

  // A day that would add nothing starts unticked: the list already has it.
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(lines.filter((l) => !shopping || l.ingredients.size > 0).map((l) => l.date)),
  );
  const count = new Set(lines.filter((l) => ticked.has(l.date)).flatMap((l) => [...l.ingredients])).size;
  const days = ticked.size;

  const eatingOut = entries.filter((e) => e.placeId).map((e) => `${shortDay(fromIso(e.date))} ${e.mealType.toLowerCase()}`);
  const nameOnly = [...new Set(entries.filter((e) => e.needsIngredients && e.recipeName).map((e) => e.recipeName!))];
  const singles = entries.filter((e) => e.itemName).map((e) => e.itemName!);
  const links = entries.filter((e) => e.savedLinkId && !e.recipeDeleted).length;

  return (
    <Sheet
      title={days === 0 ? 'Add to groceries' : `Add ${days} ${days === 1 ? 'day' : 'days'} to groceries?`}
      subtitle="Ingredients are combined by item and sorted into aisles."
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {lines.length === 0 ? (
          <EmptyState>Nothing planned here has anything to buy.</EmptyState>
        ) : (
          <List label="Days to add">
            {lines.map((line) => {
              const on = ticked.has(line.date);
              const nothing = shopping && line.ingredients.size === 0;
              return (
                <Row
                  key={line.date}
                  role="checkbox"
                  aria-checked={on}
                  lead={<CheckBox checked={on} />}
                  title={`${shortDay(fromIso(line.date))} · ${line.slots}`}
                  titleClassName={nothing && !on ? 'text-muted' : undefined}
                  subtitle={nothing ? 'Already on the list' : line.allInCupboard ? `${line.dishes} · all in cupboard` : line.dishes}
                  detail={shopping && !nothing ? line.ingredients.size : undefined}
                  onClick={() =>
                    setTicked((all) => {
                      const next = new Set(all);
                      if (next.has(line.date)) next.delete(line.date);
                      else next.add(line.date);
                      return next;
                    })
                  }
                />
              );
            })}
          </List>
        )}

        {eatingOut.length > 0 && (
          <NoteBox tone="plum" icon="utensils">
            {listOf(eatingOut)} {eatingOut.length === 1 ? 'is' : 'are'} eat out, so nothing to buy.
          </NoteBox>
        )}
        {nameOnly.length > 0 && (
          <NoteBox tone="mustard" icon="pen">
            {listOf(nameOnly)} {nameOnly.length === 1 ? 'has' : 'have'} no ingredients yet, so{' '}
            {nameOnly.length === 1 ? 'it adds' : 'they add'} nothing.
          </NoteBox>
        )}
        {singles.length > 0 && (
          <NoteBox tone="sky" icon="cupboard">
            Single foods like {singles[0]} aren't included. Add one from its meal's options.
          </NoteBox>
        )}
        {links > 0 && (
          <NoteBox tone="sky" icon="link">
            Saved links have no ingredients, so they add nothing. Make one a recipe to shop for it.
          </NoteBox>
        )}

        <Button size="lg" full disabled={busy || days === 0} onClick={() => onConfirm([...ticked].sort())}>
          {busy
            ? 'Adding…'
            : days === 0
              ? 'Nothing to add'
              : shopping
                ? `Add ${count} ${count === 1 ? 'item' : 'items'}`
                : 'Add to groceries'}
        </Button>
      </div>
    </Sheet>
  );
}

/** "Wed 30 dinner, Fri 2 lunch and Sat 3 dinner" */
function listOf(things: string[]): string {
  const first = things[0].charAt(0).toUpperCase() + things[0].slice(1);
  const all = [first, ...things.slice(1)];
  return all.length === 1 ? all[0] : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
}
