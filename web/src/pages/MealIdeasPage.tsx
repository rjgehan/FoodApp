import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import type { MealType, Recipe } from '../api/types';
import { fetchMealIdeas, IDEA_MEALS, type MealIdeas } from '../api/mealIdeas';
import { useHousehold } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import NoHousehold from '../components/NoHousehold';
import { RecipePicture } from '../components/catalogue/CatalogueParts';
import { LoadFailed, MealRow, SwapButton } from '../components/mealplans/MealPlanParts';
import { NutritionBottomBar } from '../components/nutrition/NutritionParts';
import { ServingsStepper } from '../components/plan/PlanBits';
import { addRecipeToGroceries } from '../components/recipe/recipeApi';
import { toast } from '../components/toast';
import { Button, CheckCircle, Chip, ErrorText, NavBar, Tile } from '../components/ui';
import { kitchenOf } from '../utils/features';
import { orderedMachines } from '../utils/machines';
import { formatMinutes, totalMinutes } from '../utils/recipeFormat';

/** How many ideas the page offers at once. */
const COUNT = 5;

/**
 * Meal ideas: Explore's third door for a household that doesn't plan ahead, where Meal plans
 * would be. A handful of recipes the kitchen can make — the household's own first, then what other
 * households have published — each ticked to go on the grocery list. Swap one for another, Shuffle
 * for five new ones, then Add puts every ticked one's ingredients on Groceries, as the recipe
 * page's Add to groceries does, for the household's usual number of people.
 *
 * What the kitchen can make is the server's call (KitchenMachines.missing): a recipe that needs a
 * slow cooker never comes up in a house without one. Ideas already seen are not offered again
 * until Shuffle has run out of new ones.
 */
export default function MealIdeasPage() {
  usePushedScreen();
  const navigate = useNavigate();
  const { activeHouseholdId, activeHousehold } = useHousehold();
  const kitchen = kitchenOf(activeHousehold);
  const [params, setParams] = useSearchParams();
  // The meal is in the address (?meal=lunch), so Explore's chips open straight onto one.
  const meal = IDEA_MEALS.find((m) => m.value === params.get('meal')?.toUpperCase())?.value ?? 'DINNER';
  const setMeal = (next: MealType) => setParams(next === 'DINNER' ? {} : { meal: next.toLowerCase() }, { replace: true });
  const [ideas, setIdeas] = useState<MealIdeas | null>(null);
  const [failed, setFailed] = useState(false);
  /** Ticked to go on the list: every new idea starts ticked. */
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  /** Every idea shown since the meal was chosen, so Shuffle and swaps bring new ones. */
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [servings, setServings] = useState(() => Math.max(1, activeHousehold?.defaultServings ?? 2));

  const label = IDEA_MEALS.find((m) => m.value === meal)!;

  /** Ideas leaving out `exclude`; how many came, or null when they could not be loaded. */
  const load = useCallback(
    async (exclude: Set<string>): Promise<number | null> => {
      if (!activeHouseholdId) return null;
      setFailed(false);
      setError(null);
      try {
        const next = await fetchMealIdeas(activeHouseholdId, { meal, count: COUNT, exclude: [...exclude] });
        setIdeas(next);
        setTicked(new Set(next.ideas.map((r) => r.id)));
        setSeen(new Set([...exclude, ...next.ideas.map((r) => r.id)]));
        return next.ideas.length;
      } catch {
        setFailed(true);
        return null;
      }
    },
    [activeHouseholdId, meal],
  );

  useEffect(() => {
    setIdeas(null);
    load(new Set());
  }, [load]);

  if (!activeHouseholdId) return <NoHousehold />;

  async function shuffle() {
    setBusy('shuffle');
    // Nothing new left: start again from the top rather than showing nothing.
    if ((await load(seen)) === 0) await load(new Set());
    setBusy(null);
  }

  async function swap(old: Recipe) {
    if (!activeHouseholdId || !ideas) return;
    setBusy(old.id);
    setError(null);
    try {
      const next = await fetchMealIdeas(activeHouseholdId, { meal, count: 1, exclude: [...seen] });
      const idea = next.ideas[0];
      if (!idea) {
        toast(`No other ${label.plural} to suggest.`, { icon: 'info' });
        return;
      }
      setIdeas({ ...next, ideas: ideas.ideas.map((r) => (r.id === old.id ? idea : r)) });
      setSeen((s) => new Set(s).add(idea.id));
      setTicked((t) => {
        const n = new Set(t);
        n.delete(old.id);
        n.add(idea.id);
        return n;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't find another idea. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setTicked((t) => {
      const n = new Set(t);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function add() {
    if (!activeHouseholdId || !ideas) return;
    const chosen = ideas.ideas.filter((r) => ticked.has(r.id));
    setBusy('add');
    setError(null);
    let added = 0;
    try {
      // One recipe at a time, as its page would: one already on the list is left as it is.
      for (const r of chosen) {
        const result = await addRecipeToGroceries(activeHouseholdId, r.id, { servings, extras: [] });
        if ('added' in result) added++;
      }
      toast(added > 0 ? `Added ${added} ${added === 1 ? 'recipe' : 'recipes'} to Groceries` : 'Those are on Groceries already', {
        icon: 'cart',
      });
      navigate('/grocery-list');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Couldn't add ${added > 0 ? 'the rest' : 'them'} to Groceries. Try again.`,
      );
    } finally {
      setBusy(null);
    }
  }

  const n = ideas?.ideas.filter((r) => ticked.has(r.id)).length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <NavBar back="/explore" backLabel="Explore" title="Meal ideas" />
      <p className="-mt-1 text-[0.9375rem] leading-[1.45] text-muted">
        {kitchen
          ? `${label.label} ideas your kitchen can make. Swap any you don't fancy, then put them on Groceries.`
          : `${label.label} ideas from your recipes and Explore. Swap any you don't fancy, then put them on Groceries.`}
      </p>

      <div role="group" aria-label="Which meal" className="flex gap-2">
        {IDEA_MEALS.map((m) => (
          <Chip key={m.value} active={meal === m.value} onClick={() => setMeal(m.value)}>
            {m.label}
          </Chip>
        ))}
      </div>

      {failed && !ideas ? (
        <LoadFailed message="Couldn't load meal ideas." onRetry={() => load(new Set())} />
      ) : !ideas ? (
        <p className="py-10 text-center text-sm text-muted">Finding ideas…</p>
      ) : ideas.ideas.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-5 py-8 text-center">
          <Tile icon="utensils" tone="mustard" size={48} />
          <p className="text-[0.9375rem] text-muted">
            {ideas.canMake === 0
              ? `No ${label.plural} your kitchen can make yet.`
              : `Every ${label.label.toLowerCase()} your kitchen can make is on Groceries already.`}
          </p>
          <Button variant="secondary" size="sm" onClick={() => navigate('/recipes/new')}>
            Add a recipe
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="group-label">
              {ideas.ideas.length} {ideas.ideas.length === 1 ? 'idea' : 'ideas'}
            </span>
            <Button variant="ghost" size="sm" icon="refresh" disabled={busy !== null} onClick={shuffle}>
              {busy === 'shuffle' ? 'Shuffling…' : 'Shuffle'}
            </Button>
          </div>
          <ul aria-label="Meal ideas" className="card card-rows inset-rows -mt-2" style={{ '--row-inset': '68px' } as CSSProperties}>
            {ideas.ideas.map((r) => (
              <MealRow
                key={r.id}
                aria-label={r.name}
                to={!r.shared || r.section ? `/recipes/${r.id}` : `/explore/recipes/${r.id}`}
                picture={<RecipePicture recipe={r} className="rounded-[10px]" style={{ width: 44, height: 44 }} />}
                title={r.name}
                subtitle={ideaLine(r)}
                end={
                  <>
                    <SwapButton label={`Another instead of ${r.name}`} busy={busy === r.id} onClick={() => swap(r)} />
                    <button
                      type="button"
                      aria-pressed={ticked.has(r.id)}
                      aria-label={`Add ${r.name} to Groceries`}
                      onClick={() => toggle(r.id)}
                      className="press relative flex h-9 w-9 shrink-0 items-center justify-center"
                    >
                      <CheckCircle checked={ticked.has(r.id)} />
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        </>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <p className="px-1 text-[0.8125rem] leading-[1.45] text-muted">
        {kitchen ? (
          <>
            Only recipes your kitchen can make
            {ideas && ideas.leftOut > 0
              ? `: ${ideas.leftOut} ${ideas.leftOut === 1 ? 'needs a machine' : 'need machines'} you don't have.`
              : '.'}{' '}
            <Link to="/household/kitchen" className="font-medium text-accent-ink underline">
              Your kitchen
            </Link>
          </>
        ) : (
          <>
            Say what's in your kitchen and ideas will only be what you can make.{' '}
            <Link to="/household/kitchen" className="font-medium text-accent-ink underline">
              Set up your kitchen
            </Link>
          </>
        )}
      </p>

      <NutritionBottomBar>
        <ServingsStepper value={servings} onChange={setServings} disabled={busy !== null} />
        <Button size="lg" full icon="cart" disabled={busy !== null || n === 0} onClick={add}>
          {busy === 'add' ? 'Adding…' : n === 0 ? 'Add to Groceries' : `Add ${n} to Groceries`}
        </Button>
      </NutritionBottomBar>
    </div>
  );
}

/** "Yours · 25 min", "From the Smiths · Air fryer": whose it is, and what there is to know. */
function ideaLine(r: Recipe): string {
  const whose = !r.shared ? 'Yours' : r.section ? 'In your recipes' : `From ${r.ownerName ?? 'Explore'}`;
  const total = totalMinutes(r);
  const machines = orderedMachines(r.appliances ?? []).map((m) => m.short);
  return [whose, total ? formatMinutes(total) : null, machines.join(', ') || null].filter(Boolean).join(' · ');
}
