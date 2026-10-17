import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Recipe } from '../api/types';
import { isoDay, type PlanNutrition } from '../api/nutrition';
import { useHousehold } from '../household/HouseholdContext';
import { PageTitle } from '../components/PageTitle';
import type { MealPlansHome } from '../api/mealPlans';
import { GlobalRecipesDoor, MealPlansDoor, NutritionDoor } from '../components/explore/ExploreParts';
import { useFeatures } from '../utils/features';
import { cx } from '../components/ui';

/**
 * The front door of Explore (the mockup's 5.1): three doors.
 *
 * The other four tabs each hold one thing this household owns — its plan, its recipes, its
 * list, its cupboard. Explore is the opposite: everything here is bigger than the house, and
 * there is more than one kind of it. So the tab opens on a choice rather than on a list,
 * which also means a new kind can arrive without anything having to move.
 *
 * Global recipes is first and biggest, with how many there are on it. Nutrition facts shows what
 * the coming week's plan adds up to, a day on average. Meal plans leads straight into cooking
 * from the cupboard or into a plan, and says what the cupboard has to cook from.
 *
 * A household that does not plan meals has no Meal plans door (every plan is put on the Plan)
 * and no week on Nutrition's; one without a cupboard has no cupboard on the Meal plans door.
 */
export default function ExplorePage() {
  const { activeHouseholdId } = useHousehold();
  const features = useFeatures();
  const [count, setCount] = useState<number | null>(null);
  const [week, setWeek] = useState<PlanNutrition | null>(null);
  const [plans, setPlans] = useState<MealPlansHome | null>(null);

  useEffect(() => {
    if (!activeHouseholdId) return;
    let live = true;
    api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/explore`)
      .then((all) => live && setCount(all.length))
      .catch(() => live && setCount(null));
    if (features.plan) {
      // The same seven days Nutrition's chart adds up, so the door and the page agree.
      api<PlanNutrition>('GET', `/api/nutrition/households/${activeHouseholdId}/plan?start=${isoDay(0)}&end=${isoDay(6)}`)
        .then((w) => live && setWeek(w))
        .catch(() => live && setWeek(null));
      // The same answer the Meal plans page opens with, so the door's count and the page agree.
      api<MealPlansHome>('GET', `/api/households/${activeHouseholdId}/meal-plans`)
        .then((h) => live && setPlans(h))
        .catch(() => live && setPlans(null));
    }
    return () => {
      live = false;
    };
  }, [activeHouseholdId, features.plan]);

  return (
    <div>
      <PageTitle title="Explore" />
      <div className={cx('grid gap-3.5 md:grid-cols-[3fr_2fr]', features.plan && 'md:grid-rows-[auto_auto]')}>
        <GlobalRecipesDoor count={count} besideTwo={features.plan} />
        <NutritionDoor week={week} showsWeek={features.plan} />
        {features.plan && <MealPlansDoor home={plans} cupboard={features.cupboard} />}
      </div>
    </div>
  );
}
