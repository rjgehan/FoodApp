import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GroceryListItem, Recipe } from '../../api/types';
import { OptionalExtras } from '../PlanRecipeSheet';
import { ServingsStepper } from '../plan/PlanBits';
import { Button, ConfirmAlert, ErrorText, List, NoteBox, Row, Sheet, Tile } from '../ui';
import { addRecipeToGroceries } from './recipeApi';

/**
 * Recipe → Groceries without the Plan: how many servings — the page's own number to start with —
 * then, if the recipe has any, which optional extras to buy, then "Add 9 items". The amounts are
 * worked out on the server, as for a planned meal, and land on the one list everybody sees.
 *
 * Pressing it for a recipe already on the list asks first ("Already on the list — add again?"),
 * because saying yes puts the amounts on top of the ones there.
 */
export default function AddToGroceriesSheet({
  householdId,
  recipe,
  servings: startAt,
  mine,
  onAdded,
  onClose,
}: {
  householdId: string;
  recipe: Recipe;
  /** How many the page is showing the amounts for. */
  servings: number;
  /** The household owns it, so the way to put ingredients in is Edit. */
  mine: boolean;
  /** The rows of the list it touched. */
  onAdded: (rows: GroceryListItem[]) => void;
  onClose: () => void;
}) {
  const [servings, setServings] = useState(Math.max(1, startAt));
  // Which optional ingredients to buy this time. None, unless somebody ticks them.
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askingAgain, setAskingAgain] = useState(false);

  // What Add puts on the list: every ingredient that is not optional, and the extras ticked.
  const adding = recipe.ingredients.filter((i) => !i.optional || extras.has(i.id)).length;

  async function add(again: boolean) {
    setBusy(true);
    setError(null);
    setAskingAgain(false);
    try {
      const result = await addRecipeToGroceries(householdId, recipe.id, { servings, extras: [...extras], again });
      if ('alreadyOnList' in result) {
        setBusy(false);
        setAskingAgain(true);
        return;
      }
      onAdded(result.added);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that to Groceries.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Add to groceries" subtitle={recipe.name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Servings scale amounts, so a recipe with no ingredients has nothing to step. */}
        {recipe.ingredients.length > 0 && (
          <List label="Servings">
            <Row
              lead={<Tile icon="users" tone="sky" size={34} />}
              title="Servings"
              subtitle="The amounts are worked out for this many"
              wrap
              end={<ServingsStepper value={servings} onChange={setServings} disabled={busy} />}
            />
          </List>
        )}

        <OptionalExtras ingredients={recipe.ingredients} chosen={extras} onChange={setExtras} />

        {recipe.ingredients.length === 0 && (
          // Only the household that owns it can put them in.
          <NoteBox tone="mustard" icon="alert">
            No ingredients yet, so there's nothing to add.
            {mine && (
              <>
                {' '}
                Put them in with{' '}
                <Link to={`/recipes/${recipe.id}/edit`} className="font-semibold underline">
                  Edit
                </Link>
                .
              </>
            )}
          </NoteBox>
        )}

        {error && <ErrorText>{error}</ErrorText>}
        <Button full size="lg" icon="cart" disabled={busy || adding === 0} onClick={() => add(false)}>
          {busy ? 'Adding…' : adding === 0 ? 'Nothing to add' : `Add ${adding} ${adding === 1 ? 'item' : 'items'}`}
        </Button>
      </div>

      {askingAgain && (
        <ConfirmAlert
          title="Already on the list — add again?"
          icon="cart"
          tone="accent"
          confirmLabel="Add again"
          busy={busy}
          onConfirm={() => add(true)}
          onCancel={() => setAskingAgain(false)}
        >
          {/* Named in quotes, as the server names it: "wings's ingredients" reads badly. */}
          “{recipe.name}” is on Groceries already. Adding again puts these amounts on top.
        </ConfirmAlert>
      )}
    </Sheet>
  );
}
