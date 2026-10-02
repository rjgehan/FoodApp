import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { capitalised, gramsText, kcalText, type Contributor, type NotCounted, type RecipeNutrition } from '../api/nutrition';
import { useHousehold } from '../household/HouseholdContext';
import { useTablessScreen } from '../components/Layout';
import { EmptyState, List, NavBar, NoteBox, Row, SectionLabel } from '../components/ui';
import { ServingsStepper } from '../components/plan/PlanBits';
import { KcalRing, MACROS, MacroBar, SourceNote } from '../components/nutrition/NutritionParts';

/** Rows of contributors shown before "All N ingredients". */
const FIRST = 5;

/**
 * A recipe's nutrition (the mockup's 5.6): per serving, worked out on the server from the
 * ingredients. How much of a day one serving is, protein, carbs and fat against a day's worth,
 * which ingredients the calories come from, and what was left out — an optional side can be
 * counted in with a tap, and the note says which figures are estimates.
 *
 * Opened from the recipe page (back says "Recipe") or from Nutrition's search and recent
 * lookups (back says "Nutrition").
 */
export default function RecipeNutritionPage() {
  useTablessScreen();
  const { recipeId = '' } = useParams<{ recipeId: string }>();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const navigate = useNavigate();
  const { activeHouseholdId } = useHousehold();
  const [servings, setServings] = useState(1);
  const [include, setInclude] = useState<string[]>([]);
  const [n, setN] = useState<RecipeNutrition | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const remembered = useRef(false);

  useEffect(() => {
    setServings(1);
    setInclude([]);
    setN(null);
    setAll(false);
    remembered.current = false;
  }, [recipeId]);

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ servings: String(servings) });
    if (activeHouseholdId) params.set('householdId', activeHouseholdId);
    include.forEach((id) => params.append('include', id));
    // The last answer stays up while the next one comes, so stepping servings does not flash.
    api<RecipeNutrition>('GET', `/api/nutrition/recipes/${recipeId}?${params}`)
      .then((answer) => {
        if (!live) return;
        setN(answer);
        setFailed(null);
        if (!remembered.current) {
          remembered.current = true;
          api('POST', '/api/nutrition/recent', { kind: 'RECIPE', ref: recipeId, householdId: activeHouseholdId }).catch(() => {});
        }
      })
      .catch((err) => {
        if (!live) return;
        const status = err instanceof ApiError ? err.status : 0;
        setFailed(status === 404 || status === 403 ? 'That recipe is gone.' : 'Could not work out its nutrition.');
      });
    return () => {
      live = false;
    };
  }, [recipeId, activeHouseholdId, servings, include]);

  function back() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(from === 'nutrition' ? '/explore/nutrition' : `/recipes/${recipeId}`);
  }

  const toggle = (id: string) => setInclude((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  const nav = <NavBar back={back} backLabel={from === 'nutrition' ? 'Nutrition' : 'Recipe'} title={n?.name} />;

  if (failed && !n) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {nav}
        <div className="card px-4">
          <EmptyState>{failed}</EmptyState>
        </div>
      </div>
    );
  }
  if (!n) {
    return (
      <div className="flex flex-col gap-4">
        {nav}
        <p className="py-16 text-center text-sm text-muted">Working it out…</p>
      </div>
    );
  }

  const shown = n.forServings;
  const pct = n.percentOfReference.kcal;
  const contributors = all ? n.contributors : n.contributors.slice(0, FIRST);
  const hidden = n.contributors.length - contributors.length;
  const optionalOut = n.notCounted.filter((x) => x.reason === 'OPTIONAL');
  const otherOut = n.notCounted.filter((x) => x.reason !== 'OPTIONAL');

  return (
    <div className="flex flex-col gap-3.5">
      {nav}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:items-start md:gap-6">
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.875rem] text-muted">
              {n.recipeServings} {n.recipeServings === 1 ? 'serving' : 'servings'} in the recipe
            </span>
            <ServingsStepper value={servings} onChange={setServings} label />
          </div>
          <section aria-label="Per serving" className="card flex flex-col gap-3.5 p-4 md:p-5">
            <div className="flex items-center gap-3.5">
              <KcalRing share={(pct ?? 0) / 100} kcal={shown.kcal} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-[0.9375rem] font-semibold">
                  {pct != null ? `${pct}% of ${n.reference.label}` : 'No calories counted'}
                </p>
                {n.summary && <p className="text-[0.8125rem] leading-[1.4] text-muted">{n.summary}</p>}
              </div>
            </div>
            {MACROS.map((m) => (
              <MacroBar key={m.key} label={m.label} value={shown[m.key]} goal={n.reference[m.key]} tone={m.tone} />
            ))}
          </section>
        </div>

        <div className="flex flex-col gap-3.5">
          <div>
            <SectionLabel>Biggest contributors</SectionLabel>
            {n.contributors.length === 0 && n.notCounted.length === 0 ? (
              <div className="card px-4">
                <EmptyState>No ingredients to count yet.</EmptyState>
              </div>
            ) : (
              <List label="Biggest contributors" inset={0}>
                {contributors.map((c) => (
                  <ContributorRow key={c.recipeIngredientId} c={c} included={include.includes(c.recipeIngredientId)} onToggle={toggle} />
                ))}
                {hidden > 0 && (
                  <Row
                    onClick={() => setAll(true)}
                    lead={<Lead>…</Lead>}
                    title={`All ${n.contributors.length} ingredients`}
                    titleClassName="text-accent-ink"
                  />
                )}
                {optionalOut.map((x) => (
                  <Row
                    key={x.recipeIngredientId}
                    onClick={() => toggle(x.recipeIngredientId)}
                    aria-label={`Count ${x.name} in`}
                    lead={<Lead>+</Lead>}
                    title={`${capitalised(x.name)} (optional)`}
                    titleClassName="text-muted"
                    subtitle="Not included · tap to add"
                  />
                ))}
                {otherOut.map((x) => (
                  <Row
                    key={x.recipeIngredientId}
                    lead={<Lead>–</Lead>}
                    title={capitalised(x.name)}
                    titleClassName="text-muted"
                    subtitle={WHY[x.reason]}
                  />
                ))}
              </List>
            )}
          </div>
          <NoteBox tone="sky" icon="info">
            {n.note}
          </NoteBox>
          <SourceNote attribution={n.attribution} />
        </div>
      </div>
    </div>
  );
}

const WHY: Record<NotCounted['reason'], string> = {
  OPTIONAL: 'Not included · tap to add',
  NO_AMOUNT: 'Not counted · no amount',
  NO_MATCH: 'Not counted · not in the food data yet',
  NO_WEIGHT: "Not counted · couldn't weigh the amount",
};

/** The left column: a share, a + for something left out. */
function Lead({ children }: { children: string }) {
  return <span className="w-[38px] shrink-0 text-[0.875rem] font-bold tabular-nums">{children}</span>;
}

/**
 * "62% · Chicken thighs · 318 kcal · 38g protein": its share of the recipe's calories, and the
 * macro that brings the most of them. An optional one that was counted in can be taken out again.
 */
function ContributorRow({ c, included, onToggle }: { c: Contributor; included: boolean; onToggle: (id: string) => void }) {
  const main = [
    { kcal: 4 * c.protein, text: `${gramsText(c.protein)} protein` },
    { kcal: 4 * c.carbs, text: `${gramsText(c.carbs)} carbs` },
    { kcal: 9 * c.fat, text: `${gramsText(c.fat)} fat` },
  ].sort((a, b) => b.kcal - a.kcal)[0];
  const subtitle = `${kcalText(c.kcal)} kcal · ${main.text}${included ? ' · optional, tap to leave out' : ''}`;
  return (
    <Row
      onClick={included ? () => onToggle(c.recipeIngredientId) : undefined}
      aria-label={included ? `Leave ${c.name} out` : undefined}
      lead={<Lead>{`${Math.round(c.share * 100)}%`}</Lead>}
      title={capitalised(c.name)}
      subtitle={subtitle}
    />
  );
}
