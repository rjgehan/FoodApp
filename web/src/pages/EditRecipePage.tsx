import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Button, Card, EmptyState } from '../components/ui';
import { ChevronLeftIcon } from '../components/icons';
import RecipeForm from '../components/RecipeForm';

/** The same form as writing a new one, seeded from the recipe and saving over it. */
export default function EditRecipePage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const { activeHouseholdId } = useHousehold();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!recipeId || !activeHouseholdId) return;
    api<Recipe>('GET', `/api/recipes/${recipeId}?householdId=${activeHouseholdId}`)
      .then(setRecipe)
      .catch(() => setError('Could not load that recipe.'));
  }, [recipeId, activeHouseholdId]);

  async function remove() {
    if (!recipe) return;
    setDeleting(true);
    try {
      await api('DELETE', `/api/recipes/${recipe.id}`);
      navigate('/recipes', { replace: true });
    } catch {
      setError('Could not delete that.');
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <Card>
        <EmptyState>{error}</EmptyState>
      </Card>
    );
  }
  if (!activeHouseholdId || !recipe) {
    return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
  }
  // Sharing a recipe does not hand over the pencil; the owner household edits it.
  if (recipe.shared) {
    return (
      <Card>
        <EmptyState>This recipe belongs to another household, so you can't edit it.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(`/recipes/${recipe.id}`)}>
        <ChevronLeftIcon className="h-5 w-5" />
        Back
      </Button>
      <RecipeForm
        householdId={activeHouseholdId}
        recipe={recipe}
        onSaved={(r) => navigate(`/recipes/${r.id}`, { replace: true })}
      />

      {/*
       * Two taps, not a browser confirm(): a native dialog is ugly on a phone and easy to
       * dismiss by accident. Deleting a recipe cannot be undone, so it asks first.
       */}
      <Card title="Delete this recipe">
        {confirming ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              This removes “{recipe.name}” for good, takes it off any planned meals, and stops any
              share link working. It can't be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" disabled={deleting} onClick={remove}>
                {deleting ? 'Deleting…' : 'Delete forever'}
              </Button>
              <Button variant="secondary" disabled={deleting} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" full onClick={() => setConfirming(true)}>
            Delete recipe
          </Button>
        )}
      </Card>
    </div>
  );
}
