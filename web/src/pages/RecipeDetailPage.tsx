import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Button, Card, EmptyState, List, NavBar, Row, Tile } from '../components/ui';
import { kcalText, type RecipeNutrition } from '../api/nutrition';
import { Icon } from '../components/icons';
import { usePushedScreen } from '../components/Layout';
import PlanRecipeSheet from '../components/PlanRecipeSheet';
import RecipeIndexCard from '../components/RecipeIndexCard';
import ImagePicker from '../components/ImagePicker';
import { toast } from '../components/toast';
import { ServingsStepper } from '../components/plan/PlanBits';
import RecipeHero, { HeroButton } from '../components/recipe/RecipeHero';
import {
  IngredientList,
  LinkButtons,
  MethodSteps,
  PhotoGrid,
  RecipeBottomBar,
  RecipeTabs,
  StepButton,
  TabEmpty,
  TabPanel,
  type RecipeTab,
} from '../components/recipe/RecipePageParts';
import {
  DeleteRecipeAlert,
  OrganiseSheet,
  PhotosLinksSheet,
  RecipeOptionsSheet,
  type RecipeOption,
} from '../components/recipe/RecipeSheets';
import { instructionSteps } from '../utils/recipeFormat';

/**
 * A recipe (the mockup's 3.7, Option 1): the photo hero with its name on it, then Ingredients,
 * Method and Photos as tabs that stick to the top as you scroll, and Add to plan along the
 * bottom between the previous and next recipe. Everything else — organising it, its photos and
 * links, sharing, editing, deleting — waits behind the ••• on the photo.
 */
export default function RecipeDetailPage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const { activeHouseholdId, activeHousehold, households } = useHousehold();
  usePushedScreen();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [siblings, setSiblings] = useState<Recipe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RecipeTab>('ingredients');
  /** How many the amounts are shown for: the recipe's own number until the stepper moves. */
  const [servings, setServings] = useState<number | null>(null);
  const [open, setOpen] = useState<RecipeOption | 'options' | 'plan' | null>(null);
  const [photosBusy, setPhotosBusy] = useState(false);
  /** A serving's calories and its few words, for the way into the recipe's nutrition (5.6). */
  const [nutrition, setNutrition] = useState<Pick<RecipeNutrition, 'perServing' | 'highlights'> | null>(null);

  useEffect(() => {
    if (!recipeId) return;
    setRecipe(null);
    setError(null);
    setOpen(null);
    setTab('ingredients');
    setServings(null);
    // A load that has been replaced is dropped, so a late answer cannot undo a change made since.
    let live = true;
    const scope = activeHouseholdId ? `?householdId=${activeHouseholdId}` : '';
    api<Recipe>('GET', `/api/recipes/${recipeId}${scope}`)
      .then((r) => live && setRecipe(r))
      .catch(
        (err) =>
          live &&
          setError(err instanceof ApiError && err.status === 404 ? 'That recipe is gone.' : 'Could not load that recipe.'),
      );
    return () => {
      live = false;
    };
  }, [recipeId, activeHouseholdId]);

  // Asked once the recipe is here, and again only when its ingredients change.
  const ingredientsKey = recipe ? recipe.ingredients.map((i) => `${i.id}:${i.quantity}:${i.unit}`).join('|') : '';
  useEffect(() => {
    setNutrition(null);
    if (!recipeId || !ingredientsKey) return;
    let live = true;
    const scope = activeHouseholdId ? `?householdId=${activeHouseholdId}` : '';
    api<RecipeNutrition>('GET', `/api/nutrition/recipes/${recipeId}${scope}`)
      .then((n) => live && setNutrition(n))
      .catch(() => live && setNutrition(null));
    return () => {
      live = false;
    };
  }, [recipeId, activeHouseholdId, ingredientsKey]);

  // The catalog order, so the arrows flip through the book rather than jumping around.
  useEffect(() => {
    if (!activeHouseholdId) return;
    api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`)
      .then((all) => setSiblings([...all].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setSiblings([]));
  }, [activeHouseholdId]);

  const { prev, next } = useMemo(() => {
    const i = siblings.findIndex((r) => r.id === recipeId);
    if (i === -1) return { prev: null, next: null };
    return { prev: siblings[i - 1] ?? null, next: siblings[i + 1] ?? null };
  }, [siblings, recipeId]);

  /** Back to wherever the recipe was opened from — a drawer, a search, the plan — or the catalog. */
  function goBack() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/recipes');
  }

  /** Flipping to the next recipe replaces this one, so Back still goes where it came from. */
  function flipTo(target: Recipe | null) {
    if (target) navigate(`/recipes/${target.id}`, { replace: true });
  }

  async function addPhotos(ids: string[]) {
    if (!recipe) return;
    setPhotosBusy(true);
    try {
      setRecipe(
        await api<Recipe>('PUT', `/api/recipes/${recipe.id}/images`, {
          coverImageId: recipe.coverImageId ?? ids[0] ?? null,
          photoIds: [...recipe.photoIds, ...ids],
        }),
      );
    } finally {
      setPhotosBusy(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <NavBar back={goBack} backLabel="Recipes" />
        <Card>
          <EmptyState>
            {error}{' '}
            <Link to="/recipes" className="font-medium text-accent-ink underline">
              Back to recipes
            </Link>
          </EmptyState>
        </Card>
      </div>
    );
  }

  if (!recipe) {
    return <p className="py-16 text-center text-sm text-muted">Loading…</p>;
  }

  const mine = recipe.householdId === activeHouseholdId;
  // Counted among your own houses only — the ones the Share screen shows. A share somebody else
  // in this house made into a house you are not in is theirs, and would be a number with no
  // switch behind it.
  const sharedWithMine = recipe.sharedWith.filter((id) => households.some((h) => h.id === id)).length;
  const steps = instructionSteps(recipe.instructions);
  const pictures = [recipe.coverImageId, ...recipe.photoIds].filter(
    (id, i, all): id is string => !!id && all.indexOf(id) === i,
  );
  const shown = servings ?? recipe.servings;
  const scale = recipe.servings > 0 ? shown / recipe.servings : 1;

  if (open === 'card') {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <NavBar title={recipe.name} left={<span />} right={<button type="button" className="press font-semibold" onClick={() => setOpen(null)}>Done</button>} />
        <RecipeIndexCard recipe={recipe} />
      </div>
    );
  }

  function pick(option: RecipeOption) {
    if (!recipe) return;
    if (option === 'edit') return navigate(`/recipes/${recipe.id}/edit`);
    if (option === 'share') return navigate(`/recipes/${recipe.id}/share`);
    setOpen(option === 'move' ? 'organise' : option);
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <RecipeHero
        recipe={recipe}
        onBack={goBack}
        backLabel="Back"
        actions={
          <>
            {mine && <HeroButton icon="share" label="Share" onClick={() => navigate(`/recipes/${recipe.id}/share`)} />}
            <HeroButton icon="more" label="Recipe options" expanded={open === 'options'} onClick={() => setOpen('options')} />
          </>
        }
      />

      <RecipeTabs
        value={tab}
        onChange={setTab}
        counts={{ ingredients: recipe.ingredients.length, method: steps.length, photos: pictures.length }}
        bar={{
          title: recipe.name,
          onBack: goBack,
          backLabel: 'Back',
          actions: (
            <button
              type="button"
              aria-label="Recipe options"
              onClick={() => setOpen('options')}
              className="press flex h-9 w-9 items-center justify-center"
            >
              <Icon name="more" size={20} />
            </button>
          ),
        }}
      />

      {tab === 'ingredients' && (
        <TabPanel tab="ingredients">
          {/* Somebody else's, and not in a drawer of yours yet: the way to keep it is right here,
              as well as behind •••. */}
          {recipe.shared && !recipe.section && (
            // Stacked, so the action is never squeezed: the hero's pill already says who shared it.
            <div className="flex flex-col gap-2.5 rounded-[14px] bg-plum-soft p-3">
              <p className="text-[0.8125rem] leading-snug text-plum">
                Only {recipe.ownerName ?? 'the household that shared it'} can change it.
              </p>
              <Button size="sm" variant="secondary" icon="arrowR" full onClick={() => setOpen('organise')}>
                Move into my recipes
              </Button>
            </div>
          )}
          {recipe.description && <p className="text-[0.9375rem] leading-normal text-muted">{recipe.description}</p>}
          <div className="flex items-start justify-between gap-3">
            <LinkButtons links={recipe.links} />
            {/* With no links to show, the way to add one would be behind •••; it is here too. */}
            {mine && recipe.links.length === 0 && open !== 'media' && (
              <Button variant="ghost" size="sm" icon="plus" className="-ml-2" onClick={() => setOpen('media')}>
                Add link
              </Button>
            )}
            <ServingsStepper value={shown} onChange={setServings} className="ml-auto mt-[3px]" />
          </div>
          {recipe.ingredients.length === 0 ? (
            <TabEmpty>No ingredients yet — until they're in, planning this adds nothing to Groceries.</TabEmpty>
          ) : (
            <IngredientList ingredients={recipe.ingredients} scale={scale} />
          )}
          {recipe.ingredients.length > 0 && (
            // The way into its nutrition (5.6), worked out from the ingredients above.
            <List label="Nutrition" className="mt-1">
              <Row
                to={`/recipes/${recipe.id}/nutrition`}
                lead={<Tile icon="leaf" tone="herb" size={36} />}
                title="Nutrition facts"
                subtitle={
                  nutrition?.perServing.kcal
                    ? [`${kcalText(nutrition.perServing.kcal)} kcal a serving`, nutrition.highlights.slice(0, 2).join(', ').toLowerCase()]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Per serving, from the ingredients'
                }
                chevron
              />
            </List>
          )}
        </TabPanel>
      )}

      {tab === 'method' && (
        <TabPanel tab="method">
          {steps.length === 0 ? (
            <TabEmpty>
              No method written down yet.
              {mine && (
                <>
                  {' '}
                  <Link to={`/recipes/${recipe.id}/edit`} className="font-medium text-accent-ink">
                    Add the steps
                  </Link>
                </>
              )}
            </TabEmpty>
          ) : (
            <MethodSteps steps={steps} />
          )}
        </TabPanel>
      )}

      {tab === 'photos' && (
        <TabPanel tab="photos">
          {pictures.length === 0 ? <TabEmpty>No photos yet.</TabEmpty> : <PhotoGrid ids={pictures} name={recipe.name} />}
          {mine && activeHouseholdId && (
            <ImagePicker householdId={activeHouseholdId} multiple onUploaded={addPhotos}>
              {photosBusy ? 'Adding…' : 'Add photos'}
            </ImagePicker>
          )}
        </TabPanel>
      )}

      {activeHouseholdId && (
        <RecipeBottomBar>
          <StepButton direction="prev" disabled={!prev} onClick={() => flipTo(prev)} />
          {/* The next step from a recipe is the plan, so that is the one filled button here. */}
          <Button size="lg" icon="calendar" className="min-w-0 flex-1" onClick={() => setOpen('plan')}>
            Add to plan
          </Button>
          <StepButton direction="next" disabled={!next} onClick={() => flipTo(next)} />
        </RecipeBottomBar>
      )}

      {open === 'options' && (
        <RecipeOptionsSheet
          recipe={recipe}
          mine={mine}
          sharedWithMine={sharedWithMine}
          onPick={pick}
          onClose={() => setOpen(null)}
        />
      )}

      {open === 'organise' && activeHouseholdId && (
        <OrganiseSheet
          recipe={recipe}
          householdId={activeHouseholdId}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            const moved = recipe.shared && !recipe.section;
            setRecipe(saved);
            setOpen(null);
            toast(moved ? 'Moved into your recipes' : 'Filed', { icon: 'check' });
          }}
        />
      )}

      {open === 'media' && activeHouseholdId && (
        <PhotosLinksSheet recipe={recipe} householdId={activeHouseholdId} onChange={setRecipe} onClose={() => setOpen(null)} />
      )}

      {open === 'delete' && (
        <DeleteRecipeAlert
          recipe={recipe}
          households={households}
          onCancel={() => setOpen(null)}
          onDeleted={() => navigate('/recipes', { replace: true })}
        />
      )}

      {open === 'plan' && activeHouseholdId && (
        <PlanRecipeSheet
          householdId={activeHouseholdId}
          recipe={recipe}
          days={activeHousehold?.planningHorizonDays ?? 7}
          servings={activeHousehold?.defaultServings ?? recipe.servings}
          onClose={() => setOpen(null)}
          onPlanned={(when) => {
            setOpen(null);
            // The page then confirms with "Tue · Dinner", and the way to see it.
            toast(`On the plan for ${when}`, { icon: 'check', action: { label: 'See Plan', onClick: () => navigate('/meal-plan') } });
          }}
        />
      )}
    </div>
  );
}

