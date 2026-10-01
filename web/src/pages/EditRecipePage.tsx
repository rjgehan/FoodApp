import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import { Button, Card, EmptyState, NavBar } from '../components/ui';
import RecipeForm from '../components/RecipeForm';
import { DeleteRecipeAlert } from '../components/recipe/RecipeSheets';

/**
 * The same form as writing a new one, seeded from the recipe and saving over it: Cancel, "Edit
 * recipe" and Save along the top, as the mockup's 3.20 has it, and Delete at the very foot.
 */
export default function EditRecipePage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const { activeHouseholdId, households } = useHousehold();
  const navigate = useNavigate();
  usePushedScreen();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!recipeId || !activeHouseholdId) return;
    api<Recipe>('GET', `/api/recipes/${recipeId}?householdId=${activeHouseholdId}`)
      .then(setRecipe)
      .catch(() => setError('Could not load that recipe.'));
  }, [recipeId, activeHouseholdId]);

  /** Back to the recipe — the way it came, when it came from there. */
  function leave() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(`/recipes/${recipeId}`, { replace: true });
  }

  const cancel = (
    <button type="button" className="press text-[1.0625rem] text-accent-ink" onClick={leave}>
      Cancel
    </button>
  );

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <NavBar title="Edit recipe" left={cancel} />
        <Card>
          <EmptyState>{error}</EmptyState>
        </Card>
      </div>
    );
  }
  if (!activeHouseholdId || !recipe) {
    return <p className="py-16 text-center text-sm text-muted">Loading…</p>;
  }
  // Sharing a recipe does not hand over the pencil; the owner household edits it.
  if (recipe.shared) {
    return (
      <div className="flex flex-col gap-2">
        <NavBar title="Edit recipe" left={cancel} />
        <Card>
          <EmptyState>This recipe belongs to another household, so you can't edit it.</EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 pb-6">
      <NavBar
        title="Edit recipe"
        left={cancel}
        right={
          <button type="submit" form="edit-recipe" className="press font-semibold">
            Save
          </button>
        }
      />
      <RecipeForm
        id="edit-recipe"
        householdId={activeHouseholdId}
        recipe={recipe}
        onSaved={(r) => navigate(`/recipes/${r.id}`, { replace: true })}
      />

      {/* A red word, not a red slab: it is the rarest thing on the page, and the last. It asks
          first, in an alert rather than a browser confirm(), and cannot be undone. */}
      <Button variant="ghost" icon="trash" className="mt-2 self-center text-danger" onClick={() => setDeleting(true)}>
        Delete this recipe
      </Button>

      {deleting && (
        <DeleteRecipeAlert
          recipe={recipe}
          households={households}
          onCancel={() => setDeleting(false)}
          onDeleted={() => navigate('/recipes', { replace: true })}
        />
      )}
    </div>
  );
}
