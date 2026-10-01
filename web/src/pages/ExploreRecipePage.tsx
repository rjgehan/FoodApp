import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Button, EmptyState, NavBar } from '../components/ui';
import { usePushedScreen } from '../components/Layout';
import { IngredientList, LinkButtons, MethodSteps, PhotoGrid, RecipeBottomBar } from '../components/recipe/RecipePageParts';
import { ExploreFacts, ExploreHero, isKept, useMoveIntoMine } from '../components/explore/ExploreParts';
import { instructionSteps } from '../utils/recipeFormat';

/**
 * A published recipe opened from Global recipes (the mockup's 5.3): read-only, with one thing to
 * do — move it into your recipes, which asks which household when you are in more than one.
 *
 * Its own page rather than the recipe page, because nothing on that page is yours to use yet: no
 * plan, no editing, no next and previous through your catalogue. Once it is kept, the one button
 * opens it where it now lives, as one of yours.
 */
export default function ExploreRecipePage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const { activeHouseholdId } = useHousehold();
  usePushedScreen();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const move = useMoveIntoMine(setRecipe);

  useEffect(() => {
    if (!recipeId || !activeHouseholdId) return;
    setRecipe(null);
    setError(null);
    let live = true;
    api<Recipe>('GET', `/api/recipes/${recipeId}?householdId=${activeHouseholdId}`)
      .then((r) => live && setRecipe(r))
      .catch(
        (err) =>
          live &&
          setError(
            err instanceof ApiError && (err.status === 404 || err.status === 403)
              ? 'That recipe is not published any more.'
              : 'Could not load that recipe.',
          ),
      );
    return () => {
      live = false;
    };
  }, [recipeId, activeHouseholdId]);

  function goBack() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/explore/recipes');
  }

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <NavBar back="/explore/recipes" backLabel="Global recipes" />
        <div className="card">
          <EmptyState>
            {error}{' '}
            <Link to="/explore/recipes" className="font-medium text-accent-ink underline">
              Back to Global recipes
            </Link>
          </EmptyState>
        </div>
      </div>
    );
  }

  if (!recipe) {
    return <p className="py-16 text-center text-sm text-muted">Loading…</p>;
  }

  // One this household published is simply its own recipe.
  if (!recipe.shared) return <Navigate to={`/recipes/${recipe.id}`} replace />;

  const steps = instructionSteps(recipe.instructions);
  const kept = isKept(recipe);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <ExploreHero recipe={recipe} onBack={goBack} />

      <div className="flex flex-col gap-3.5 pt-4">
        <ExploreFacts recipe={recipe} />
        {recipe.description && <p className="text-[0.9375rem] leading-normal text-muted">{recipe.description}</p>}
        <LinkButtons links={recipe.links} />

        <h2 className="title-section pt-1">Ingredients</h2>
        {recipe.ingredients.length === 0 ? (
          <EmptyState>No ingredients written down.</EmptyState>
        ) : (
          <IngredientList ingredients={recipe.ingredients} scale={1} />
        )}

        {steps.length > 0 && (
          <>
            <h2 className="title-section pt-3">Method</h2>
            <MethodSteps steps={steps} />
          </>
        )}

        {recipe.photoIds.length > 0 && (
          <>
            <h2 className="title-section pt-3">Photos</h2>
            <PhotoGrid ids={recipe.photoIds} name={recipe.name} />
          </>
        )}
      </div>

      <RecipeBottomBar>
        {kept ? (
          <Button size="lg" full variant="secondary" icon="book" onClick={() => navigate(`/recipes/${recipe.id}`)}>
            Open in my recipes
          </Button>
        ) : (
          <Button size="lg" full icon="arrowR" onClick={() => move.start(recipe)}>
            Move into my recipes
          </Button>
        )}
      </RecipeBottomBar>

      {move.sheet}
    </div>
  );
}
