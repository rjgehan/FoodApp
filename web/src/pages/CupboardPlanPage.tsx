import { useEffect, useState, type CSSProperties } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import {
  dateRange,
  dayAndDate,
  MEAL_PLANS,
  type ApplyResult,
  type CupboardPlan,
  type CupboardPlanRequest,
  type CupboardSetup,
  type DraftMeal,
} from '../api/mealPlans';
import { weekday } from '../api/nutrition';
import type { MealType } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useTablessScreen } from '../components/Layout';
import { Icon } from '../components/icons';
import { toast } from '../components/toast';
import { Button, CheckBox, Chip, cx, ErrorText, List, NavBar, Pill, Row, Sheet, Tile } from '../components/ui';
import { ServingsStepper } from '../components/plan/PlanBits';
import { NutritionBottomBar } from '../components/nutrition/NutritionParts';
import {
  ChoiceTiles,
  CupboardPill,
  DayTile,
  LoadFailed,
  MEAL_CHIP,
  MEAL_LABEL,
  MEAL_ORDER,
  MealPicture,
  MealRow,
  PercentRing,
  SwapButton,
  SwitchRow,
} from '../components/mealplans/MealPlanParts';

/*
 Cook from your cupboard (the mockup's 5.8 and 5.9): choose the days, the meals, what to use up
 first and how much you are willing to buy; the server builds a draft from your existing recipes;
 swap any meal, put the few missing things on the grocery list, and apply it to the Plan.

 The draft is never saved until it is applied, so it travels in the browser's history: the
 setup's choices on the setup's entry, the draft on the result's. Back from the result finds
 the setup as you left it, and forward finds the same draft again.
*/

const SETUP = `${MEAL_PLANS}/cupboard`;
const RESULT = `${MEAL_PLANS}/cupboard/plan`;

const BUY_OPTIONS: { value: number | null; label: string }[] = [
  { value: 0, label: 'None' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: null, label: 'Any' },
];

const buyText = (limit: number | null) => (limit === 0 ? 'None' : limit == null ? 'Any' : `Up to ${limit}`);

interface ResultState {
  request: CupboardPlanRequest;
  plan: CupboardPlan;
  /** Recipes each slot has shown, so swapping again keeps moving on. */
  seen?: Record<string, string[]>;
  adding?: boolean;
}

const slotKey = (date: string, meal: MealType) => `${date}|${meal}`;

/** What went wrong, in the server's words when it said any. */
const problem = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

// --- 5.8 Setup ---------------------------------------------------------------------------------

export function CupboardSetupPage() {
  useTablessScreen();
  const navigate = useNavigate();
  const location = useLocation();
  const restored = (location.state as { setup?: CupboardPlanRequest } | null)?.setup ?? null;
  const { activeHouseholdId } = useHousehold();
  const [setup, setSetup] = useState<CupboardSetup | null>(null);
  const [failed, setFailed] = useState(false);
  const [dates, setDates] = useState<string[]>(restored?.dates ?? []);
  const [meals, setMeals] = useState<MealType[]>(restored?.meals ?? []);
  const [useFirst, setUseFirst] = useState<string[]>(restored?.useFirst ?? []);
  const [buyLimit, setBuyLimit] = useState<number | null>(restored ? restored.buyLimit : 5);
  const [onlyMine, setOnlyMine] = useState(restored?.onlyMine ?? true);
  const [servings, setServings] = useState(restored?.servings ?? 4);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!activeHouseholdId) return;
    let live = true;
    setFailed(false);
    api<CupboardSetup>('GET', `/api/households/${activeHouseholdId}/meal-plans/cupboard`)
      .then((s) => {
        if (!live) return;
        setSetup(s);
        // The server's starting point, unless coming back to choices already made.
        if (!restored) {
          setDates(s.days.slice(0, s.defaultDays).map((d) => d.date));
          setMeals(s.defaultMeals);
          setUseFirst(s.useFirst.filter((u) => u.selected).map((u) => u.ingredientId));
          setBuyLimit(s.defaultBuyLimit);
          setOnlyMine(s.defaultOnlyMine);
          setServings(s.defaultServings);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // `restored` is read once, on the way in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHouseholdId, attempt]);

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const count = dates.length * meals.length;
  const chosen = setup?.useFirst.filter((u) => useFirst.includes(u.ingredientId)) ?? [];

  async function generate() {
    if (!activeHouseholdId || count === 0) return;
    const request: CupboardPlanRequest = {
      dates: [...dates].sort(),
      meals: MEAL_ORDER.filter((m) => meals.includes(m)),
      useFirst,
      buyLimit,
      onlyMine,
      servings,
    };
    setBusy(true);
    setError(null);
    try {
      const plan = await api<CupboardPlan>('POST', `/api/households/${activeHouseholdId}/meal-plans/cupboard`, request);
      // Leave the choices on this page's history entry, so Back from the result finds them.
      navigate(SETUP, { replace: true, state: { setup: request } });
      navigate(RESULT, { state: { request, plan } satisfies ResultState });
    } catch (err) {
      setError(problem(err, 'Could not build a plan. Try again.'));
      setBusy(false);
    }
  }

  const nav = <NavBar back={MEAL_PLANS} backLabel="Plans" title="From your cupboard" />;
  if (failed && !setup) {
    return (
      <div className="flex flex-col gap-4">
        {nav}
        <LoadFailed message="Could not open your cupboard." onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  }
  if (!setup) {
    return (
      <div className="flex flex-col gap-4">
        {nav}
        <p className="py-16 text-center text-sm text-muted">Opening your cupboard…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {nav}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:items-start md:gap-5">
        <div className="flex flex-col gap-3.5">
          <section aria-label="Days and meals" className="card flex flex-col gap-3 p-4 md:p-5">
            <div className="group-label">Days</div>
            <div className="flex gap-1.5">
              {setup.days.map((d) => (
                <DayTile
                  key={d.date}
                  label={weekday(d.date)}
                  date={String(Number(d.date.slice(8, 10)))}
                  on={dates.includes(d.date)}
                  planned={d.planned.length > 0}
                  aria-label={`${weekday(d.date, 'long')} ${Number(d.date.slice(8, 10))}${d.planned.length > 0 ? ', something planned already' : ''}`}
                  onClick={() => setDates((now) => toggle(now, d.date))}
                />
              ))}
            </div>
            <div className="group-label mt-1">Meals</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Meals">
              {MEAL_ORDER.map((m) => (
                <Chip key={m} active={meals.includes(m)} onClick={() => setMeals((now) => toggle(now, m))}>
                  {MEAL_CHIP[m]}
                </Chip>
              ))}
            </div>
          </section>

          <section aria-label="Use these up first" className="card flex flex-col gap-3 p-4 md:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="group-label">Use these up first</span>
              {setup.useFirst.length > 0 && (
                <button type="button" onClick={() => setEditing(true)} className="press text-[0.8125rem] font-semibold text-accent-ink">
                  Edit
                </button>
              )}
            </div>
            {chosen.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {chosen.map((u) => (
                  <span
                    key={u.ingredientId}
                    className="inline-flex items-center gap-1.5 rounded-full bg-mustard-soft px-3 py-[7px] text-[0.8125rem] font-semibold text-mustard"
                  >
                    {u.name}
                    <span className="font-medium opacity-75">{u.label}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[0.8125rem] text-muted">
                {setup.useFirst.length > 0
                  ? 'Nothing chosen: the plan just uses whatever is in.'
                  : setup.items === 0
                    ? 'Your cupboard is empty, so every meal will need shopping for.'
                    : 'Nothing needs using up soon.'}
              </p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-3.5">
          <section aria-label="Shopping and servings" className="card flex flex-col gap-3 p-4 md:p-5">
            <div className="flex items-baseline justify-between gap-3 text-[0.9375rem] font-semibold">
              <span>Extra things to buy</span>
              <span>{buyText(buyLimit)}</span>
            </div>
            <ChoiceTiles options={BUY_OPTIONS} value={buyLimit} onChange={setBuyLimit} label="Extra things to buy" />
            <div className="my-0.5 h-px bg-line" />
            <SwitchRow title="Only my recipes" subtitle="Off: may use global recipes too" on={onlyMine} onChange={setOnlyMine} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.9375rem] font-semibold">Servings</span>
              <ServingsStepper value={servings} onChange={setServings} />
            </div>
          </section>
          {error && <ErrorText>{error}</ErrorText>}
          <Button size="lg" full icon="sparkles" disabled={busy || count === 0} onClick={generate}>
            {busy ? 'Building…' : count === 0 ? 'Choose days and meals' : `Generate ${count} ${count === 1 ? 'meal' : 'meals'}`}
          </Button>
        </div>
      </div>

      {editing && (
        <Sheet title="Use these up first" subtitle="Meals that use these are chosen first." onClose={() => setEditing(false)}>
          <List label="Cupboard things" inset={50}>
            {setup.useFirst.map((u) => {
              const on = useFirst.includes(u.ingredientId);
              return (
                <Row
                  key={u.ingredientId}
                  onClick={() => setUseFirst((now) => toggle(now, u.ingredientId))}
                  aria-label={u.name}
                  role="checkbox"
                  aria-checked={on}
                  lead={<CheckBox checked={on} />}
                  title={u.name}
                  end={
                    <Pill tone={u.reason === 'plenty' ? 'sky' : 'mustard'} className="!text-[0.75rem]">
                      {u.label}
                    </Pill>
                  }
                />
              );
            })}
          </List>
          <Button size="lg" full className="mt-4" onClick={() => setEditing(false)}>
            Done
          </Button>
        </Sheet>
      )}
    </div>
  );
}

// --- 5.9 Result --------------------------------------------------------------------------------

export function CupboardResultPage() {
  useTablessScreen();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeHouseholdId } = useHousehold();
  const state = location.state as ResultState | null;
  const [busy, setBusy] = useState<string | null>(null);

  if (!state?.plan || !activeHouseholdId) return <Navigate to={SETUP} replace />;
  const { request, plan, seen = {}, adding = false } = state;
  const base = `/api/households/${activeHouseholdId}/meal-plans`;

  /** Keeps the draft in this history entry, so Back and Forward find it as it is now. */
  const keep = (next: Partial<ResultState>) => navigate(RESULT, { replace: true, state: { ...state, ...next } });

  function back() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(SETUP, { state: { setup: request } });
  }

  async function regenerate() {
    setBusy('all');
    try {
      const fresh = await api<CupboardPlan>('POST', `${base}/cupboard`, request);
      keep({ plan: fresh, seen: {} });
    } catch (err) {
      toast(problem(err, 'Could not build a plan.'), { icon: 'alert' });
    } finally {
      setBusy(null);
    }
  }

  async function swap(meal: DraftMeal) {
    const key = slotKey(meal.date, meal.mealType);
    const shown = [...new Set([...(seen[key] ?? []), meal.recipeId])];
    setBusy(key);
    try {
      const next = await api<CupboardPlan>('POST', `${base}/cupboard/swap`, {
        setup: request,
        meals: plan.meals.map((m) => ({ date: m.date, mealType: m.mealType, recipeId: m.recipeId })),
        date: meal.date,
        mealType: meal.mealType,
        exclude: shown,
      });
      if (next.swapped === false)
        toast(`Nothing else fits ${MEAL_LABEL[meal.mealType].toLowerCase()} on ${dayAndDate(meal.date)}.`, { icon: 'info' });
      keep({ plan: next, seen: { ...seen, [key]: shown } });
    } catch (err) {
      toast(problem(err, 'Could not swap that meal.'), { icon: 'alert' });
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    setBusy('apply');
    try {
      const result = await api<ApplyResult>('POST', `${base}/apply`, {
        meals: plan.meals.map((m) => ({ date: m.date, mealType: m.mealType, recipeId: m.recipeId, servings: m.servings })),
        addToGroceries: adding ? plan.toBuy.map((t) => t.ingredientId) : [],
      });
      const meals = `${result.added} ${result.added === 1 ? 'meal' : 'meals'}`;
      const groceries =
        result.groceriesAdded > 0 ? ` and ${result.groceriesAdded} ${result.groceriesAdded === 1 ? 'thing' : 'things'} to buy` : '';
      toast(result.added > 0 ? `Planned ${meals}${groceries}` : 'Those meals were planned already', { icon: 'check' });
      navigate('/meal-plan');
    } catch (err) {
      toast(problem(err, 'Could not put it on the Plan.'), { icon: 'alert' });
      setBusy(null);
    }
  }

  // The meals and the slots left open, day by day in date order.
  const days = [...new Set([...plan.meals.map((m) => m.date), ...plan.open.map((o) => o.date)])].sort();
  const mealOrder = (m: MealType) => MEAL_ORDER.indexOf(m);
  const toBuyNames = plan.toBuy.map((t) => t.name).join(', ');

  return (
    <div className="flex flex-col gap-3.5">
      <NavBar
        back={back}
        backLabel="Setup"
        title="Cupboard plan"
        right={
          <button
            type="button"
            aria-label="Choose again"
            title="Choose again"
            disabled={busy != null}
            onClick={regenerate}
            className="press -mr-1 flex h-11 w-11 items-center justify-center disabled:opacity-40"
          >
            <Icon name="refresh" size={20} className={busy === 'all' ? 'animate-spin' : undefined} />
          </button>
        }
      />
      {/* On a phone the mockup's order: how much is in, the days, then what to buy. On a wide
          screen the first and last sit together on the left, beside the days. */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-x-5">
        <section aria-label="From your cupboard" className="card flex items-center gap-3.5 p-4 md:col-start-1 md:row-start-1">
          <PercentRing percent={plan.percentFromCupboard} tone={plan.percentFromCupboard >= 50 ? 'herb' : 'mustard'} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-base font-semibold">
              {plan.meals.length > 0 ? `${plan.percentFromCupboard}% from your cupboard` : 'Nothing fits yet'}
            </p>
            <p className="text-[0.8125rem] leading-[1.4] text-muted">
              {plan.meals.length > 0 ? plan.summary : 'Allow more things to buy, or global recipes, and try again.'}
            </p>
          </div>
        </section>
        <div className="flex flex-col gap-3.5 md:col-start-2 md:row-span-3 md:row-start-1">
          {days.map((date) => {
            const rows = [
              ...plan.meals.filter((m) => m.date === date).map((m) => ({ kind: 'meal' as const, meal: m, type: m.mealType })),
              ...plan.open.filter((o) => o.date === date).map((o) => ({ kind: 'open' as const, open: o, type: o.mealType })),
            ].sort((a, b) => mealOrder(a.type) - mealOrder(b.type));
            return (
              <section key={date} aria-label={dayAndDate(date)} className="flex flex-col gap-1.5">
                <div className="group-label">{dayAndDate(date)}</div>
                <ul className="card card-rows inset-rows" style={{ '--row-inset': '68px' } as CSSProperties}>
                  {rows.map((r) =>
                    r.kind === 'meal' ? (
                      <MealRow
                        key={r.type}
                        aria-label={`${MEAL_LABEL[r.type]}: ${r.meal.name}`}
                        to={r.meal.yours ? `/recipes/${r.meal.recipeId}` : `/explore/recipes/${r.meal.recipeId}`}
                        picture={<MealPicture meal={r.meal} />}
                        title={r.meal.name}
                        subtitle={r.meal.yours ? MEAL_LABEL[r.type] : `${MEAL_LABEL[r.type]} · Global recipe`}
                        end={
                          <>
                            <CupboardPill percent={r.meal.percentFromCupboard} />
                            <SwapButton label={`Swap ${r.meal.name}`} busy={busy === slotKey(date, r.type)} onClick={() => swap(r.meal)} />
                          </>
                        }
                      />
                    ) : (
                      <MealRow
                        key={r.type}
                        muted
                        picture={
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-surface2 text-faint">
                            <Icon name={r.open.reason === 'PLANNED' ? 'calendar' : 'ban'} size={18} />
                          </span>
                        }
                        title={r.open.reason === 'PLANNED' ? 'Already planned' : 'Nothing fits'}
                        subtitle={
                          r.open.reason === 'PLANNED'
                            ? `${MEAL_LABEL[r.type]} · left as it is`
                            : `${MEAL_LABEL[r.type]} · allow more to buy for this one`
                        }
                      />
                    ),
                  )}
                </ul>
              </section>
            );
          })}
        </div>
        {plan.toBuy.length > 0 && (
          <section aria-label="Things to buy" className="card flex items-center gap-3 px-3.5 py-3 md:col-start-1 md:row-start-2">
            <Tile icon="cart" tone="mustard" size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-semibold">
                {plan.toBuy.length} {plan.toBuy.length === 1 ? 'thing' : 'things'} to buy
              </p>
              <p className="truncate text-xs text-muted">{adding ? 'Going on the grocery list with the plan' : toBuyNames}</p>
            </div>
            <button
              type="button"
              aria-pressed={adding}
              onClick={() => keep({ adding: !adding })}
              className={cx(
                'press flex shrink-0 items-center gap-1 text-[0.875rem] font-semibold',
                adding ? 'text-herb' : 'text-accent-ink',
              )}
            >
              {adding && <Icon name="check" size={15} strokeWidth={2.6} />}
              {adding ? 'Adding' : 'Add'}
            </button>
          </section>
        )}
      </div>

      <NutritionBottomBar>
        <Button size="lg" full icon="calendar" disabled={busy != null || plan.meals.length === 0} onClick={apply}>
          {busy === 'apply' ? 'Planning…' : `Apply to Plan · ${dateRange(plan.meals.map((m) => m.date))}`}
        </Button>
      </NutritionBottomBar>
    </div>
  );
}
