import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { PageTitle } from '../components/PageTitle';
import { GlobalRecipesDoor, SOON, SoonDoor } from '../components/explore/ExploreParts';

/**
 * The front door of Explore (the mockup's 5.1): three doors.
 *
 * The other four tabs each hold one thing this household owns — its plan, its recipes, its
 * list, its cupboard. Explore is the opposite: everything here is bigger than the house, and
 * there is more than one kind of it. So the tab opens on a choice rather than on a list,
 * which also means a new kind can arrive without anything having to move.
 *
 * Global recipes is the open one, so it is first and biggest, with how many there are on it.
 * Nutrition facts and Meal plans are not built yet, and their doors say so rather than showing
 * numbers that are not real — a door marked with what is behind it is worth more than no door,
 * because it is where the work will land.
 */
export default function ExplorePage() {
  const { activeHouseholdId } = useHousehold();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!activeHouseholdId) return;
    let live = true;
    api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/explore`)
      .then((all) => live && setCount(all.length))
      .catch(() => live && setCount(null));
    return () => {
      live = false;
    };
  }, [activeHouseholdId]);

  return (
    <div>
      <PageTitle title="Explore" />
      <div className="grid gap-3.5 md:grid-cols-[3fr_2fr] md:grid-rows-[auto_auto]">
        <GlobalRecipesDoor count={count} />
        {SOON.map((d) => (
          <SoonDoor key={d.to} destination={d} />
        ))}
      </div>
    </div>
  );
}
