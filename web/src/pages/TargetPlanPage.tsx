import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import {
  addDaysIso,
  dateRange,
  portionText,
  MEAL_PLANS,
  planHue,
  planIcon,
  planTone,
  type ApplyResult,
  type PlanMeal,
  type TargetPlan,
} from '../api/mealPlans';
import { gramsText, isoDay, kcalText, weekday } from '../api/nutrition';
import { useHousehold } from '../household/HouseholdContext';
import { useTablessScreen } from '../components/Layout';
import { Icon } from '../components/icons';
import { toast } from '../components/toast';
import { HeroButton } from '../components/recipe/RecipeHero';
import { ServingsStepper } from '../components/plan/PlanBits';
import { NutritionBottomBar, Stat } from '../components/nutrition/NutritionParts';
import { Button, ConfirmAlert, cx, ErrorText, Input, MenuList, NavBar, Photo, Pill, Sheet } from '../components/ui';
import {
  DayTile,
  LoadFailed,
  MEAL_LABEL,
  MEAL_ORDER,
  MealPicture,
  MealRow,
  PlanNotFound,
  SwapButton,
} from '../components/mealplans/MealPlanParts';

/**
 * A plan for a health target (the mockup's 5.10): its picture and goal on top, the day's targets
 * as four numbers, a day at a time of meals chosen from existing recipes — your own marked
 * Yours — and Apply to my Plan.
 *
 * Two kinds open here. A ready-made plan (`/ready-made/:key`) is a filled-in create form whose
 * meals are chosen from your recipes as it opens; the bookmark keeps it, exactly as shown, as a
 * plan of your own. A plan of your own (`/plans/:id`) is private: nobody else in the house can
 * open it, and only its meals go on the shared Plan when you apply it.
 */
export default function TargetPlanPage() {
  useTablessScreen();
  const { planId, preset } = useParams<{ planId?: string; preset?: string }>();
  const navigate = useNavigate();
  const { activeHouseholdId } = useHousehold();
  const [plan, setPlan] = useState<TargetPlan | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [day, setDay] = useState(0);
  const [swapping, setSwapping] = useState(false);
  const [seen, setSeen] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const base = activeHouseholdId ? `/api/households/${activeHouseholdId}/meal-plans` : null;
  const path = planId ? `${base}/targets/${planId}` : `${base}/presets/${preset}`;

  const load = useCallback(() => {
    if (!base) return () => {};
    let live = true;
    setFailed(null);
    setNotFound(false);
    api<TargetPlan>('GET', path)
      .then((p) => live && setPlan(p))
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setFailed('Could not load this plan.');
      });
    return () => {
      live = false;
    };
  }, [base, path]);

  useEffect(() => {
    setPlan(null);
    setDay(0);
    setSeen({});
    setSwapping(false);
    return load();
  }, [load]);

  function back() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(MEAL_PLANS);
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        <NavBar back={back} backLabel="Plans" />
        {notFound ? (
          <PlanNotFound onBack={() => navigate(MEAL_PLANS, { replace: true })} />
        ) : failed ? (
          <LoadFailed message={failed} onRetry={load} />
        ) : (
          <p className="py-16 text-center text-sm text-muted">Choosing meals from your recipes…</p>
        )}
      </div>
    );
  }

  const start = isoDay(0);
  const today = plan.days[day] ?? plan.days[0];
  const meals = [...(today?.meals ?? [])].sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));
  const total = plan.days.reduce((n, d) => n + d.meals.filter((m) => !m.missing).length, 0);

  async function swap(meal: PlanMeal) {
    if (!base || !plan) return;
    const key = `${meal.day}|${meal.mealType}`;
    const shown = [...new Set([...(seen[key] ?? []), meal.recipeId])];
    setBusy(key);
    try {
      const next = plan.id
        ? await api<TargetPlan>('POST', `${base}/targets/${plan.id}/swap`, { day: meal.day, mealType: meal.mealType, exclude: shown })
        : await api<TargetPlan>('POST', `${base}/targets/preview/swap`, {
            name: plan.name,
            details: plan.details,
            meals: plan.days.flatMap((d) =>
              d.meals.map((m) => ({ day: m.day, mealType: m.mealType, recipeId: m.recipeId, portion: m.portion })),
            ),
            day: meal.day,
            mealType: meal.mealType,
            exclude: shown,
          });
      const now = next.days[meal.day]?.meals.find((m) => m.mealType === meal.mealType);
      if (!now || now.recipeId === meal.recipeId)
        toast(`Nothing else fits ${MEAL_LABEL[meal.mealType].toLowerCase()} here.`, { icon: 'info' });
      // A ready-made plan keeps its name and picture: the preview answer is the same plan, swapped.
      setPlan(plan.id ? next : { ...next, preset: plan.preset, icon: plan.icon, hue: plan.hue, tags: plan.tags });
      setSeen((s) => ({ ...s, [key]: shown }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not swap that meal.', { icon: 'alert' });
    } finally {
      setBusy(null);
    }
  }

  async function keep() {
    if (!base || !plan) return;
    setBusy('keep');
    try {
      const kept = await api<TargetPlan>('POST', `${base}/targets`, {
        name: plan.name,
        details: plan.details,
        meals: plan.days.flatMap((d) =>
          d.meals.filter((m) => !m.missing).map((m) => ({ day: m.day, mealType: m.mealType, recipeId: m.recipeId, portion: m.portion })),
        ),
      });
      toast('Kept in Made by you. Only you can see it.', { icon: 'bookmark' });
      navigate(`${MEAL_PLANS}/plans/${kept.id}`, { replace: true });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not keep this plan.', { icon: 'alert' });
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    if (!base || !plan?.id) return;
    setBusy('all');
    try {
      setPlan(await api<TargetPlan>('POST', `${base}/targets/${plan.id}/regenerate`));
      setSeen({});
      toast('Every meal chosen again', { icon: 'refresh' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not choose again.', { icon: 'alert' });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!base || !plan?.id) return;
    setBusy('delete');
    try {
      await api('DELETE', `${base}/targets/${plan.id}`);
      toast(`Deleted ${plan.name}`, { icon: 'trash' });
      navigate(MEAL_PLANS, { replace: true });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete it.', { icon: 'alert' });
      setBusy(null);
      setDeleting(false);
    }
  }

  const tone = planTone(plan.hue);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative -mx-5 -mt-1 h-[max(15.625rem,calc(12.75rem+env(safe-area-inset-top)))] overflow-hidden text-white md:mx-0 md:mt-0 md:h-[17rem] md:rounded-card">
        <Photo hue={planHue(plan.hue)} icon={planIcon(plan.icon)} large className="absolute inset-0 h-full w-full" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          // White on the pale mustard needs more shade behind it than on tomato or herb.
          style={{
            background: `linear-gradient(180deg, transparent ${plan.hue === 'mustard' ? '25%' : '40%'}, rgba(0,0,0,${plan.hue === 'mustard' ? '.5' : '.3'}))`,
          }}
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)] md:pt-4">
          <HeroButton icon="chevL" label="Back" onClick={back} />
          {plan.mine ? (
            <HeroButton icon="more" label="Plan options" onClick={() => setMenu(true)} expanded={menu} />
          ) : (
            <HeroButton icon="bookmark" label="Keep as my plan" onClick={busy ? () => {} : keep} />
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-5 pb-4 md:px-6 md:pb-5">
          <div>
            <Pill tone={tone} icon={planIcon(plan.icon)} className="!px-2.5 !py-1 !text-[0.75rem]">
              {plan.goalLabel} · {plan.length} {plan.length === 1 ? 'day' : 'days'}
            </Pill>
          </div>
          <h1 className="serif text-[1.75rem] leading-[1.1] [text-wrap:balance] md:text-[2.25rem]">{plan.name}</h1>
          {plan.description && <p className="text-[0.8125rem] opacity-[0.92] md:text-[0.9375rem]">{plan.description}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-5">
        <div className="flex flex-col gap-3.5">
          <div className="flex gap-2" role="group" aria-label="Daily targets">
            <Stat value={kcalText(plan.targets.kcal)} label="kcal" tone="accent" />
            <Stat value={gramsText(plan.targets.protein)} label="Protein" tone="herb" />
            <Stat value={gramsText(plan.targets.carbs)} label="Carbs" tone="sky" />
            <Stat value={gramsText(plan.targets.fat)} label="Fat" tone="mustard" />
          </div>
          <p className="hidden text-[0.8125rem] leading-[1.45] text-muted md:block">{plan.summary}</p>
        </div>

        <div className="flex flex-col gap-3.5">
          <div role="tablist" aria-label="Days" className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:px-0">
            {plan.days.map((d) => {
              const date = addDaysIso(start, d.day);
              const on = d.day === day;
              return (
                <button
                  key={d.day}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={`Day ${d.day + 1}, ${weekday(date, 'long')}`}
                  onClick={() => setDay(d.day)}
                  className={cx(
                    'press min-w-[2.5rem] flex-1 rounded-[11px] py-2 text-center text-[0.8125rem] font-semibold transition-colors',
                    on ? 'bg-ink text-bg' : 'bg-surface2 text-muted',
                  )}
                >
                  {weekday(date).charAt(0)}
                </button>
              );
            })}
          </div>

          {meals.length === 0 ? (
            <div className="card px-4 py-6 text-center text-[0.9375rem] text-muted">{plan.summary}</div>
          ) : (
            <ul aria-label={`Day ${day + 1}`} className="card card-rows inset-rows" style={{ '--row-inset': '0px' } as CSSProperties}>
              {meals.map((m) => (
                <MealRow
                  key={m.mealType}
                  wrap
                  aria-label={`${MEAL_LABEL[m.mealType]}: ${m.name}`}
                  to={m.missing ? undefined : m.yours ? `/recipes/${m.recipeId}` : `/explore/recipes/${m.recipeId}`}
                  muted={m.missing}
                  picture={<MealPicture meal={m} />}
                  title={m.name}
                  subtitle={
                    m.missing
                      ? `${MEAL_LABEL[m.mealType]} · swap it for another`
                      : [
                          MEAL_LABEL[m.mealType],
                          // The numbers are for this much of the recipe: say so, or 738 kcal reads as one bowl.
                          portionText(m.portion),
                          `${kcalText(m.kcal)} kcal`,
                          `${m.protein}g P`,
                          m.partial ? 'not all counted' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                  }
                  end={
                    <>
                      {m.yours && !m.missing && !swapping && (
                        <Pill tone="herb" icon="check" className="!px-2.5 !py-1 !text-[0.75rem]">
                          Yours
                        </Pill>
                      )}
                      {swapping && <SwapButton label={`Swap ${m.name}`} busy={busy === `${m.day}|${m.mealType}`} onClick={() => swap(m)} />}
                    </>
                  }
                />
              ))}
            </ul>
          )}
          {today && today.meals.length > 0 && (
            <p className="px-1 text-xs text-muted">
              This day: {kcalText(today.kcal)} kcal · {today.protein}g protein · {today.carbs}g carbs · {today.fat}g fat
            </p>
          )}
          <p className="px-1 text-[0.8125rem] leading-[1.45] text-muted md:hidden">{plan.summary}</p>
        </div>
      </div>

      <NutritionBottomBar>
        <button
          type="button"
          aria-pressed={swapping}
          aria-label={swapping ? 'Done swapping' : 'Swap meals'}
          title={swapping ? 'Done swapping' : 'Swap meals'}
          onClick={() => setSwapping((s) => !s)}
          className={cx(
            'press flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-btn border',
            swapping ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink',
          )}
        >
          <Icon name={swapping ? 'check' : 'swap'} size={19} />
        </button>
        <Button size="lg" icon="calendar" className="flex-1" disabled={total === 0 || busy != null} onClick={() => setApplying(true)}>
          Apply to my Plan
        </Button>
      </NutritionBottomBar>

      {applying && base && <ApplySheet plan={plan} base={base} onClose={() => setApplying(false)} />}

      {menu && (
        <Sheet title="Plan options" onClose={() => setMenu(false)}>
          <MenuList
            onPicked={(item) => {
              setMenu(false);
              item.onSelect();
            }}
            items={[
              { label: 'Rename', icon: 'pencil', onSelect: () => setRenaming(true) },
              { label: 'Change who it is for', icon: 'sliders', onSelect: () => navigate(`${MEAL_PLANS}/plans/${plan.id}/edit`) },
              { label: 'Choose every meal again', icon: 'refresh', onSelect: regenerate },
              { label: 'Delete plan', icon: 'trash', tone: 'danger', onSelect: () => setDeleting(true) },
            ]}
          />
        </Sheet>
      )}
      {renaming && base && (
        <RenameSheet
          plan={plan}
          base={base}
          onClose={() => setRenaming(false)}
          onRenamed={(p) => {
            setPlan(p);
            setRenaming(false);
          }}
        />
      )}
      {deleting && (
        <ConfirmAlert
          title={`Delete ${plan.name}?`}
          confirmLabel="Delete"
          busy={busy === 'delete'}
          onConfirm={remove}
          onCancel={() => setDeleting(false)}
        >
          Meals already on the Plan stay there.
        </ConfirmAlert>
      )}
    </div>
  );
}

/**
 * Apply to my Plan: which day the plan starts on, and how many people each meal is cooked for.
 * Only the meals go on the shared Plan — never over a meal that is there already. Each meal cooks
 * the plan's portion plus a serving for everyone else (as the server does for a saved plan), so
 * what is on your plate is what the plan's numbers say.
 */
function ApplySheet({ plan, base, onClose }: { plan: TargetPlan; base: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { activeHousehold } = useHousehold();
  const [start, setStart] = useState(isoDay(0));
  const [servings, setServings] = useState(activeHousehold?.defaultServings ?? 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const starts = Array.from({ length: 7 }, (_, i) => isoDay(i));
  const meals = plan.days.flatMap((d) => d.meals.filter((m) => !m.missing));
  const dates = [...new Set(meals.map((m) => addDaysIso(start, m.day)))];
  // A portion other than one, to give as the example (the largest says it most plainly).
  const portions = meals.reduce<number | null>((most, m) => (m.portion !== 1 && m.portion > (most ?? 0) ? m.portion : most), null);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const result = plan.id
        ? await api<ApplyResult>('POST', `${base}/targets/${plan.id}/apply`, { start, servings })
        : await api<ApplyResult>('POST', `${base}/apply`, {
            meals: meals.map((m) => ({
              date: addDaysIso(start, m.day),
              mealType: m.mealType,
              recipeId: m.recipeId,
              servings: servingsToCook(m.portion, servings),
            })),
          });
      const skipped = result.skipped.length > 0 ? ` (${result.skipped.length} already planned)` : '';
      toast(
        result.added > 0
          ? `Planned ${result.added} ${result.added === 1 ? 'meal' : 'meals'}${skipped}`
          : 'Those meals were planned already',
        { icon: 'check' },
      );
      navigate('/meal-plan');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not put it on the Plan.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Apply to my Plan" subtitle="Its meals go on the household's Plan. Anything planned already stays." onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <div className="group-label pb-2">Start on</div>
          <div className="flex gap-1.5" role="group" aria-label="Start on">
            {starts.map((d) => (
              <DayTile
                key={d}
                label={weekday(d)}
                date={String(Number(d.slice(8, 10)))}
                on={d === start}
                aria-label={`Start on ${weekday(d, 'long')} ${Number(d.slice(8, 10))}`}
                onClick={() => setStart(d)}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.9375rem] font-semibold">People eating, you included</span>
            <ServingsStepper value={servings} onChange={setServings} />
          </div>
          {portions && (
            <p className="text-[0.8125rem] leading-[1.45] text-muted">
              The plan's numbers are for the servings it shows, like {portionText(portions)} at a meal. Each meal is
              cooked with your servings plus one for everyone else.
            </p>
          )}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <Button size="lg" full icon="calendar" disabled={busy || meals.length === 0} onClick={apply}>
          {busy ? 'Planning…' : `Apply ${meals.length} ${meals.length === 1 ? 'meal' : 'meals'} · ${dateRange(dates)}`}
        </Button>
      </div>
    </Sheet>
  );
}

/** The plan's portion for you, plus one serving for each other person — nobody cooks half a serving. */
function servingsToCook(portion: number, people: number): number {
  return Math.max(1, Math.min(50, Math.max(0, people - 1) + Math.max(1, Math.ceil(portion - 1e-9))));
}

function RenameSheet({
  plan,
  base,
  onClose,
  onRenamed,
}: {
  plan: TargetPlan;
  base: string;
  onClose: () => void;
  onRenamed: (plan: TargetPlan) => void;
}) {
  const [name, setName] = useState(plan.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      onRenamed(await api<TargetPlan>('PUT', `${base}/targets/${plan.id}`, { name: trimmed }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not rename it.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Rename plan" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input aria-label="Plan name" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" size="lg" full disabled={busy || !name.trim()}>
          Save
        </Button>
      </form>
    </Sheet>
  );
}
