import { useEffect, useState, type FormEvent } from 'react';
import { useHousehold } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import NoHousehold from '../components/NoHousehold';
import { ServingsStepper } from '../components/plan/PlanBits';
import { toast } from '../components/toast';
import { cx, ErrorText, Field, Input, NavBar } from '../components/ui';
import { useBackToHousehold } from '../components/household/HouseholdParts';

/** The planning windows offered, as the mockup's row of five. */
const WINDOWS = [3, 5, 7, 10, 14];

/**
 * Name, servings & planning (mockup 6.6): what the house is called (the owner's to change), how
 * many a recipe is planned for unless you say otherwise, and how many days ahead the Plan runs.
 * One Save for all three, in the bar.
 */
export default function HouseholdSetupPage() {
  usePushedScreen();
  const { activeHousehold, updateSettings, renameHousehold } = useHousehold();
  const back = useBackToHousehold();
  const [name, setName] = useState(activeHousehold?.name ?? '');
  const [servings, setServings] = useState(activeHousehold?.defaultServings ?? 4);
  const [days, setDays] = useState(activeHousehold?.planningHorizonDays ?? 7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switching house underneath the page starts it again on that house.
  useEffect(() => {
    if (!activeHousehold) return;
    setName(activeHousehold.name);
    setServings(activeHousehold.defaultServings);
    setDays(activeHousehold.planningHorizonDays);
  }, [activeHousehold?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeHousehold) return <NoHousehold />;

  const isOwner = activeHousehold.role === 'OWNER';
  const renamed = isOwner && name.trim() !== '' && name.trim() !== activeHousehold.name;
  // A window set before these five were offered (or on another phone) is kept, and shown with them.
  const windows = WINDOWS.includes(days) ? WINDOWS : [...WINDOWS, days].sort((a, b) => a - b);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (renamed) await renameHousehold(name.trim());
      await updateSettings({ defaultServings: servings, planningHorizonDays: days });
      toast('Saved', { icon: 'check' });
      back();
    } catch {
      setError('Names can be up to 60 characters, servings 1–50, and days ahead 1–60.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-xl pb-6">
      <NavBar
        title="Household"
        back={back}
        className="-mx-1 mb-1.5"
        sides="w-24"
        right={
          <button type="submit" disabled={saving || (isOwner && !name.trim())} className="press font-semibold disabled:opacity-45">
            {saving ? 'Saving…' : 'Save'}
          </button>
        }
      />

      <div className="space-y-4">
        <Field label="Household name" hint="Only the owner can change this">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={!isOwner} aria-label="Household name" />
        </Field>

        <div className="card space-y-3.5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold">Default servings</p>
              <p className="text-[0.8125rem] text-muted">Used when you plan a recipe</p>
            </div>
            <ServingsStepper value={servings} onChange={setServings} className="[&>span]:text-[0.9375rem]" />
          </div>
          <div className="h-px bg-line" />
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold">Plan ahead</p>
                <p className="text-[0.8125rem] text-muted">The planning window on Plan</p>
              </div>
              <span className="shrink-0 text-[1.0625rem] font-semibold">
                {days} {days === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div role="radiogroup" aria-label="Days to plan ahead" className="flex gap-1.5">
              {windows.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={n === days}
                  aria-label={`${n} days`}
                  onClick={() => setDays(n)}
                  className={cx(
                    'press flex-1 rounded-[11px] py-[9px] text-center text-[0.875rem] font-semibold tabular-nums',
                    n === days ? 'bg-ink text-bg' : 'bg-surface2 text-muted',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </form>
  );
}
