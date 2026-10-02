import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import {
  cmFrom,
  feetInches,
  kgFrom,
  lbFrom,
  MEAL_PLANS,
  whoLine,
  type FormOptions,
  type Goal,
  type TargetDetails,
  type TargetOverrides,
  type TargetPlan,
  type Targets,
} from '../api/mealPlans';
import { kcalText } from '../api/nutrition';
import { useAuth } from '../auth/AuthContext';
import { useHousehold } from '../household/HouseholdContext';
import { useTablessScreen } from '../components/Layout';
import { Icon } from '../components/icons';
import {
  Button,
  CheckCircle,
  Chip,
  cx,
  ErrorText,
  Input,
  List,
  NavBar,
  NumberInput,
  Row,
  Segmented,
  Sheet,
  SwitchKnob,
} from '../components/ui';
import { LoadFailed } from '../components/mealplans/MealPlanParts';

/** The form waits this long after the last keystroke before asking for the numbers again. */
const SETTLE_MS = 300;

type Macro = 'kcal' | 'protein' | 'fat';

interface Draft {
  units: 'imperial' | 'metric';
  age: number | null;
  sex: string;
  ft: number | null;
  inches: number | null;
  cm: number | null;
  lb: number | null;
  kg: number | null;
  activity: string;
  goal: Goal;
  overrides: TargetOverrides;
  preferences: string[];
  avoid: string[];
  useMyRecipesFirst: boolean;
  days: number;
}

const EMPTY: Draft = {
  units: 'imperial',
  age: null,
  sex: '',
  ft: null,
  inches: null,
  cm: null,
  lb: null,
  kg: null,
  activity: 'moderate',
  goal: 'maintain',
  overrides: {},
  preferences: [],
  avoid: [],
  useMyRecipesFirst: true,
  days: 7,
};

/** A saved plan's details as the form holds them, in the units it was made in. */
function draftOf(d: TargetDetails): Draft {
  const { ft, inches } = feetInches(d.heightCm);
  return {
    units: d.units === 'metric' ? 'metric' : 'imperial',
    age: d.age,
    sex: d.sex === 'male' || d.sex === 'female' ? d.sex : '',
    ft,
    inches,
    cm: Math.round(d.heightCm),
    lb: lbFrom(d.weightKg),
    kg: Math.round(d.weightKg * 10) / 10,
    activity: d.activity ?? 'moderate',
    goal: d.goal ?? 'maintain',
    overrides: d.overrides ?? {},
    preferences: d.preferences ?? [],
    avoid: d.avoid ?? [],
    useMyRecipesFirst: d.useMyRecipesFirst ?? true,
    days: d.days ?? 7,
  };
}

const heightOf = (d: Draft) => (d.units === 'metric' ? d.cm : d.ft != null ? cmFrom(d.ft, d.inches ?? 0) : null);
const weightOf = (d: Draft) => (d.units === 'metric' ? d.kg : d.lb != null ? kgFrom(d.lb) : null);

/** Whether the server will take these: the same bounds as TargetDetails on the server. */
function body(d: Draft) {
  const heightCm = heightOf(d);
  const weightKg = weightOf(d);
  if (d.age == null || d.age < 16 || d.age > 100) return null;
  if (heightCm == null || heightCm < 120 || heightCm > 230) return null;
  if (weightKg == null || weightKg < 35 || weightKg > 250) return null;
  return { age: d.age, sex: d.sex || null, heightCm, weightKg, activity: d.activity, goal: d.goal };
}

/** Which of the details is still missing or out of range, for the line under the tiles. */
function missing(d: Draft): string | null {
  if (d.age == null) return 'Add an age to work out the targets.';
  if (d.age < 16 || d.age > 100) return 'Plans are for ages 16 to 100.';
  const h = heightOf(d);
  if (h == null) return 'Add a height to work out the targets.';
  if (h < 120 || h > 230) return 'That height looks wrong.';
  const w = weightOf(d);
  if (w == null) return 'Add a weight to work out the targets.';
  if (w < 35 || w > 250) return 'That weight looks wrong.';
  return null;
}

/**
 * A plan for a health target (the mockup's 5.11): who it is for, the goal, the daily targets
 * worked out from those (any number can be set by hand), preferences, and how long. "Build the
 * plan" saves it as yours — private to you — with its meals chosen from your recipes first, and
 * opens it. The same form changes a plan you have already (`/plans/:id/edit`), choosing again.
 *
 * Nothing here works a number out itself: the tiles are the server's answer for what is typed.
 */
export default function TargetPlanFormPage() {
  useTablessScreen();
  const { planId } = useParams<{ planId?: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeHouseholdId } = useHousehold();
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [existing, setExisting] = useState<TargetPlan | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [setting, setSetting] = useState<Macro | null>(null);
  const [adding, setAdding] = useState(false);
  const [choosingLength, setChoosingLength] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);
  const base = activeHouseholdId ? `/api/households/${activeHouseholdId}/meal-plans` : null;
  const ready = options != null && (!planId || existing != null);

  useEffect(() => {
    let live = true;
    setFailed(false);
    api<FormOptions>('GET', '/api/meal-plans/options')
      .then((o) => live && setOptions(o))
      .catch(() => live && setFailed(true));
    if (planId && base) {
      api<TargetPlan>('GET', `${base}/targets/${planId}`)
        .then((p) => {
          if (!live) return;
          setExisting(p);
          setDraft(draftOf(p.details));
        })
        .catch(() => live && setFailed(true));
    }
    return () => {
      live = false;
    };
  }, [planId, base, attempt]);

  // The tiles follow the form, a moment after typing stops.
  const sent = body(draft);
  const key = JSON.stringify([sent, draft.overrides]);
  useEffect(() => {
    if (!sent) {
      setTargets(null);
      return;
    }
    const mine = ++asked.current;
    const timer = window.setTimeout(() => {
      api<Targets>('POST', '/api/meal-plans/targets/calculate', { ...sent, overrides: draft.overrides })
        .then((t) => mine === asked.current && setTargets(t))
        .catch(() => mine === asked.current && setTargets(null));
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
    // `key` stands for everything the answer depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = (key: string) =>
    set({ preferences: draft.preferences.includes(key) ? draft.preferences.filter((p) => p !== key) : [...draft.preferences, key] });

  function switchUnits() {
    // The same person in the other units, so nothing typed is lost.
    const h = heightOf(draft);
    const w = weightOf(draft);
    if (draft.units === 'imperial') {
      set({ units: 'metric', cm: h != null ? Math.round(h) : null, kg: w != null ? Math.round(w * 10) / 10 : null });
    } else {
      const fi = h != null ? feetInches(h) : null;
      set({ units: 'imperial', ft: fi?.ft ?? null, inches: fi?.inches ?? null, lb: w != null ? lbFrom(w) : null });
    }
  }

  async function build() {
    if (!base || !sent || !options) return;
    const activityLabel = options.activities.find((a) => a.key === draft.activity)?.label;
    const details: TargetDetails = {
      ...sent,
      goal: draft.goal,
      activity: draft.activity,
      preferences: draft.preferences,
      avoid: draft.avoid,
      useMyRecipesFirst: draft.useMyRecipesFirst,
      onlyMyRecipes: existing?.details.onlyMyRecipes ?? false,
      days: draft.days,
      meals: existing?.details.meals ?? null,
      overrides: Object.values(draft.overrides).some((v) => v != null) ? draft.overrides : null,
      units: draft.units,
      description: '',
    };
    details.description = whoLine(details, activityLabel);
    setBusy(true);
    setError(null);
    try {
      if (existing?.id) {
        await api<TargetPlan>('PUT', `${base}/targets/${existing.id}`, { details });
        navigate(`${MEAL_PLANS}/plans/${existing.id}`, { replace: true });
      } else {
        const first = (session?.displayName ?? '').trim().split(/\s+/)[0];
        const goal = options.goals.find((g) => g.key === draft.goal)?.label.toLowerCase() ?? 'my plan';
        const name = first ? `${first} · ${goal}` : `My plan · ${goal}`;
        const plan = await api<TargetPlan>('POST', `${base}/targets`, { name, details });
        navigate(`${MEAL_PLANS}/plans/${plan.id}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not build the plan.');
      setBusy(false);
    }
  }

  function cancel() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(existing?.id ? `${MEAL_PLANS}/plans/${existing.id}` : MEAL_PLANS);
  }

  const nav = (
    <NavBar
      left={
        <button type="button" onClick={cancel} className="press -ml-1 flex h-11 items-center text-[1.0625rem] text-accent-ink">
          Cancel
        </button>
      }
      title={planId ? 'Change meal plan' : 'New meal plan'}
    />
  );

  if (!ready) {
    return (
      <div className="flex flex-col gap-4">
        {nav}
        {failed ? (
          <LoadFailed message="Could not open the form." onRetry={() => setAttempt((n) => n + 1)} />
        ) : (
          <p className="py-16 text-center text-sm text-muted">Loading…</p>
        )}
      </div>
    );
  }

  const shownPrefs = options.preferences.filter((p) => p.shown || draft.preferences.includes(p.key));
  const activities = options.activities;
  const why = missing(draft);
  const tile = (macro: Macro): { value: string; set: boolean } => ({
    value: targets ? (macro === 'kcal' ? kcalText(targets.kcal) : `${targets[macro]}g`) : '–',
    set: targets?.overridden.includes(macro) ?? false,
  });

  return (
    <div className="flex flex-col gap-3.5">
      {nav}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:items-start md:gap-5">
        <div className="flex flex-col gap-3.5">
          <section aria-label="Who is it for" className="card flex flex-col gap-3 p-4 md:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="group-label">Who is it for</span>
              <button type="button" onClick={switchUnits} className="press text-[0.8125rem] font-semibold text-accent-ink">
                {draft.units === 'imperial' ? 'Use cm and kg' : 'Use ft and lb'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <UnitField prefix="Age" label="Age">
                <BareNumber label="Age" value={draft.age} onChange={(age) => set({ age })} />
              </UnitField>
              <span className="relative block">
                <select
                  aria-label="Sex"
                  value={draft.sex}
                  onChange={(e) => set({ sex: e.target.value })}
                  className="h-11 w-full appearance-none rounded-field border border-line bg-surface pl-3.5 pr-9 text-base text-ink outline-none focus:border-accent focus:shadow-focus"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="">Not saying</option>
                </select>
                <Icon name="chevD" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
              </span>
              {draft.units === 'imperial' ? (
                <UnitField label="Height">
                  <BareNumber label="Feet" value={draft.ft} onChange={(ft) => set({ ft })} className="w-[2ch] text-right" />
                  <span className="text-muted">ft</span>
                  <BareNumber label="Inches" value={draft.inches} onChange={(inches) => set({ inches })} className="w-[2ch] text-right" />
                  <span className="text-muted">in</span>
                </UnitField>
              ) : (
                <UnitField suffix="cm" label="Height">
                  <BareNumber label="Height in cm" value={draft.cm} onChange={(cm) => set({ cm })} />
                </UnitField>
              )}
              <UnitField suffix={draft.units === 'imperial' ? 'lb' : 'kg'} label="Weight">
                <BareNumber
                  label={draft.units === 'imperial' ? 'Weight in lb' : 'Weight in kg'}
                  value={draft.units === 'imperial' ? draft.lb : draft.kg}
                  onChange={(v) => set(draft.units === 'imperial' ? { lb: v } : { kg: v })}
                />
              </UnitField>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[0.875rem] font-medium">Activity</span>
              <span className="relative flex items-center gap-1 text-[0.875rem] font-semibold">
                {activities.find((a) => a.key === draft.activity)?.label}
                <Icon name="chevD" size={14} className="text-muted" />
                <select
                  aria-label="Activity"
                  value={draft.activity}
                  onChange={(e) => set({ activity: e.target.value })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  {activities.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </section>

          <section aria-label="Goal" className="card flex flex-col gap-3 p-4 md:p-5">
            <div className="group-label">Goal</div>
            <Segmented
              label="Goal"
              value={draft.goal}
              onChange={(goal) => set({ goal })}
              options={options.goals.map((g) => ({ value: g.key, label: g.label }))}
            />
            <div className="flex gap-2" role="group" aria-label="Daily targets">
              <TargetTile
                macro="kcal"
                label="kcal"
                tone="text-accent-ink"
                {...tile('kcal')}
                onClick={() => targets && setSetting('kcal')}
              />
              <TargetTile
                macro="protein"
                label="Protein"
                tone="text-herb"
                {...tile('protein')}
                onClick={() => targets && setSetting('protein')}
              />
              <TargetTile macro="fat" label="Fat" tone="text-mustard" {...tile('fat')} onClick={() => targets && setSetting('fat')} />
            </div>
            <p className="text-xs text-muted">{why ?? 'Worked out from the details above. Tap a number to set your own.'}</p>
            {!why &&
              targets?.notes?.map((note) => (
                <p key={note} role="note" className="flex gap-1.5 text-xs font-medium leading-[1.45] text-mustard">
                  <Icon name="info" size={14} className="mt-px shrink-0" />
                  {note}
                </p>
              ))}
          </section>
        </div>

        <div className="flex flex-col gap-3.5">
          <section aria-label="Preferences" className="card flex flex-col gap-2.5 p-4 md:p-5">
            <div className="group-label">Preferences</div>
            <div className="flex flex-wrap gap-1.5">
              {shownPrefs.map((p) => (
                <Chip key={p.key} active={draft.preferences.includes(p.key)} onClick={() => toggle(p.key)}>
                  {p.label}
                </Chip>
              ))}
              {draft.avoid.map((word) => (
                <Chip
                  key={`avoid-${word}`}
                  active
                  aria-label={`No ${word}, tap to remove`}
                  onClick={() => set({ avoid: draft.avoid.filter((w) => w !== word) })}
                >
                  No {word}
                </Chip>
              ))}
              <Chip onClick={() => setAdding(true)}>+ Add</Chip>
            </div>
          </section>

          <ul className="card card-rows inset-rows" style={{ '--row-inset': '0px' } as CSSProperties}>
            <li>
              <button
                type="button"
                role="switch"
                aria-checked={draft.useMyRecipesFirst}
                aria-label="Use my recipes first"
                onClick={() => set({ useMyRecipesFirst: !draft.useMyRecipesFirst })}
                className="press flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left active:bg-surface2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">Use my recipes first</span>
                  <span className="mt-px block text-[0.8125rem] text-muted">Fills gaps from global recipes</span>
                </span>
                <SwitchKnob on={draft.useMyRecipesFirst} />
              </button>
            </li>
            <Row
              onClick={() => setChoosingLength(true)}
              title="Plan length"
              detail={`${draft.days} ${draft.days === 1 ? 'day' : 'days'}`}
              chevron
            />
          </ul>

          {error && <ErrorText>{error}</ErrorText>}
          <Button size="lg" full icon="sparkles" disabled={busy || !sent} onClick={build}>
            {busy ? 'Choosing meals…' : planId ? 'Save and choose again' : 'Build the plan'}
          </Button>
        </div>
      </div>

      {setting && targets && (
        <OverrideSheet
          macro={setting}
          targets={targets}
          onClose={() => setSetting(null)}
          onSet={(value) => {
            set({ overrides: { ...draft.overrides, [setting]: value } });
            setSetting(null);
          }}
        />
      )}
      {adding && (
        <AddPreferenceSheet
          options={options.preferences.filter((p) => !p.shown)}
          chosen={draft.preferences}
          onToggle={toggle}
          onAvoid={(word) => !draft.avoid.includes(word) && set({ avoid: [...draft.avoid, word] })}
          onClose={() => setAdding(false)}
        />
      )}
      {choosingLength && (
        <Sheet title="Plan length" onClose={() => setChoosingLength(false)}>
          <List label="Plan length" inset={16}>
            {options.lengths.map((n) => (
              <Row
                key={n}
                role="radio"
                aria-checked={n === draft.days}
                aria-label={`${n} days`}
                onClick={() => {
                  set({ days: n });
                  setChoosingLength(false);
                }}
                title={`${n} days`}
                end={<CheckCircle checked={n === draft.days} />}
              />
            ))}
          </List>
        </Sheet>
      )}
    </div>
  );
}

/** One of the form's 44px fields with its words inside it: "Age 20", "165 lb", "5 ft 11". */
function UnitField({ prefix, suffix, label, children }: { prefix?: string; suffix?: string; label: string; children: ReactNode }) {
  return (
    <label
      aria-label={label}
      className="flex h-11 min-w-0 items-center gap-1.5 rounded-field border border-line bg-surface px-3.5 text-base transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-focus"
    >
      {prefix && <span className="text-muted">{prefix}</span>}
      {children}
      {suffix && <span className="text-muted">{suffix}</span>}
    </label>
  );
}

/** A number without a box of its own, inside a UnitField. */
function BareNumber({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  className?: string;
}) {
  return (
    <NumberInput
      aria-label={label}
      value={value}
      onChange={onChange}
      className={cx(
        '!h-auto !rounded-none !border-0 !bg-transparent !px-0 !shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
        className ?? 'min-w-0 flex-1',
      )}
    />
  );
}

/** A daily target you can tap to set yourself; one you have set says so. */
function TargetTile({
  macro,
  label,
  tone,
  value,
  set,
  onClick,
}: {
  macro: Macro;
  label: string;
  tone: string;
  value: string;
  set: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value}${set ? ', set by you' : ''}. Set your own`}
      data-macro={macro}
      className="press flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[14px] border border-line bg-surface py-3"
    >
      <span className={cx('serif text-[1.375rem] leading-tight tabular-nums', tone)}>{value}</span>
      <span className="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-muted">
        {label}
        {set && <Icon name="pencil" size={10} strokeWidth={2.4} />}
      </span>
    </button>
  );
}

const MACRO_NAME: Record<Macro, string> = { kcal: 'Calories', protein: 'Protein', fat: 'Fat' };

/** Set one of the targets by hand, or go back to the worked-out one. */
function OverrideSheet({
  macro,
  targets,
  onSet,
  onClose,
}: {
  macro: Macro;
  targets: Targets;
  onSet: (value: number | null) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState<number | null>(targets[macro]);
  const unit = macro === 'kcal' ? 'kcal a day' : 'g a day';
  const computed = targets.computed[macro];
  const bounds = macro === 'kcal' ? [800, 6000] : macro === 'protein' ? [0, 500] : [0, 400];
  const ok = value != null && value >= bounds[0] && value <= bounds[1];
  return (
    <Sheet title={`${MACRO_NAME[macro]} target`} subtitle={`Worked out: ${kcalText(computed)} ${unit}.`} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSet(Math.round(value));
        }}
      >
        <label className="flex items-center gap-2">
          <NumberInput aria-label={`${MACRO_NAME[macro]}, ${unit}`} value={value} onChange={setValue} autoFocus className="flex-1" />
          <span className="shrink-0 text-muted">{unit}</span>
        </label>
        <Button type="submit" size="lg" full disabled={!ok}>
          Use this
        </Button>
        {targets.overridden.includes(macro) && (
          <Button type="button" variant="ghost" full onClick={() => onSet(null)}>
            Back to {kcalText(computed)} worked out
          </Button>
        )}
      </form>
    </Sheet>
  );
}

/** "+ Add": the preferences the form doesn't show at first, and your own things to leave out. */
function AddPreferenceSheet({
  options,
  chosen,
  onToggle,
  onAvoid,
  onClose,
}: {
  options: { key: string; label: string }[];
  chosen: string[];
  onToggle: (key: string) => void;
  onAvoid: (word: string) => void;
  onClose: () => void;
}) {
  const [word, setWord] = useState('');
  return (
    <Sheet title="Add a preference" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {options.map((p) => (
            <Chip key={p.key} active={chosen.includes(p.key)} onClick={() => onToggle(p.key)}>
              {p.label}
            </Chip>
          ))}
        </div>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const w = word.trim().toLowerCase();
            if (!w) return;
            onAvoid(w);
            setWord('');
          }}
        >
          <span className="text-[0.8125rem] font-semibold text-muted">Something to leave out</span>
          <div className="flex gap-2">
            <Input
              aria-label="Something to leave out"
              placeholder="mushrooms"
              maxLength={40}
              value={word}
              onChange={(e) => setWord(e.target.value)}
            />
            <Button type="submit" variant="secondary" className="!h-[3.25rem]" disabled={!word.trim()}>
              Add
            </Button>
          </div>
        </form>
        <Button size="lg" full onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}
