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

  useEffect(() => {
    if (!recipeId || !activeHouseholdId) return;
    api<Recipe>('GET', `/api/recipes/${recipeId}?householdId=${activeHouseholdId}`)
      .then(setRecipe)
      .catch(() => setError('Could not load that recipe.'));
  }, [recipeId, activeHouseholdId]);

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
    </div>
  );
}
