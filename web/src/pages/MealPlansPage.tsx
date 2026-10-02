import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { MEAL_PLANS, type MealPlansHome } from '../api/mealPlans';
import { useAuth } from '../auth/AuthContext';
import { useHousehold } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import { Icon } from '../components/icons';
import { EmptyState, NavBar, SectionHead, SectionLabel } from '../components/ui';
import { CupboardCard, FilterChips, LoadFailed, MinePlanRow, PlanCard } from '../components/mealplans/MealPlanParts';

/**
 * Meal plans (the mockup's 5.7). On top, the tomato card that builds the next few days from what
 * is already in the cupboard. Below, plans for health targets: the ready-made ones as picture
 * cards, and your own under "Made by you" — those are private, so only you ever see them here.
 *
 * The whole page is one request, so the cupboard's count and the cards always agree.
 */
export default function MealPlansPage() {
  usePushedScreen();
  const { session } = useAuth();
  const { activeHouseholdId } = useHousehold();
  const [home, setHome] = useState<MealPlansHome | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    if (!activeHouseholdId) return () => {};
    let live = true;
    setFailed(false);
    api<MealPlansHome>('GET', `/api/households/${activeHouseholdId}/meal-plans`)
      .then((h) => live && setHome(h))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [activeHouseholdId]);

  useEffect(() => load(), [load]);

  const shown = home?.plans.filter((p) => filter === 'all' || p.tags.includes(filter)) ?? [];
  const readyMade = shown.filter((p) => !p.mine);
  const mine = shown.filter((p) => p.mine);
  const create = `${MEAL_PLANS}/new`;

  return (
    <div className="flex flex-col gap-4">
      <NavBar
        back="/explore"
        backLabel="Explore"
        title="Meal plans"
        right={
          <Link
            to={create}
            aria-label="New meal plan"
            title="New meal plan"
            className="press -mr-1 flex h-11 w-11 items-center justify-center"
          >
            <Icon name="plus" size={22} />
          </Link>
        }
      />
      {failed && !home ? (
        <LoadFailed message="Could not load meal plans." onRetry={load} />
      ) : (
        <>
          <CupboardCard cupboard={home?.cupboard ?? null} />
          <SectionHead title="Plans for health targets" action="Create" to={create} className="mt-1" />
          {home && <FilterChips filters={home.filters} value={filter} onChange={setFilter} />}
          {!home ? (
            <p className="py-10 text-center text-sm text-muted">Loading plans…</p>
          ) : (
            <>
              {readyMade.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Ready-made plans" role="list">
                  {readyMade.map((card) => (
                    <div role="listitem" key={card.preset ?? card.id} className="flex min-w-0">
                      <PlanCard card={card} />
                    </div>
                  ))}
                </div>
              )}
              {mine.length > 0 && (
                <div>
                  <SectionLabel>Made by you</SectionLabel>
                  <ul aria-label="Made by you" className="card card-rows inset-rows" style={{ '--row-inset': '68px' } as CSSProperties}>
                    {mine.map((card) => (
                      <MinePlanRow key={card.id} card={card} who={session?.displayName ?? null} />
                    ))}
                  </ul>
                </div>
              )}
              {shown.length === 0 && (
                <div className="card px-4">
                  <EmptyState>No plans for that yet.</EmptyState>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
