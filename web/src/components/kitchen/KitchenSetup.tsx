import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import type { CupboardItem, Household } from '../../api/types';
import { useHousehold, type KitchenChange } from '../../household/HouseholdContext';
import { cupboardOn, planOn } from '../../utils/features';
import { MACHINES, orderedMachines } from '../../utils/machines';
import { Icon, type IconName } from '../icons';
import { MachineIcon } from '../MachineIcons';
import { toast } from '../toast';
import { Button, CheckBox, cx, IconButton, NoteBox, Pill, Sheet, Tile, type Tone } from '../ui';

/*
 The kitchen questions: which machines the house has, whether it plans meals ahead, and whether
 it keeps track of its cupboard. Recipes and the grocery list are the app; the Plan and the
 Cupboard are the two parts a household can do without, and this is where it first says so.

 Asked of whoever made the house (the first-run setup, Start another household) and of somebody
 joining a house nobody has answered them for, from Layout's one prompt slot; any time after,
 from the card at the top of Recipes. Household → Kitchen & features changes the answers later.
 The iPhone asks the same three (Features/Welcome/KitchenSetup.swift), word for word.
*/

const STEPS = 3;

/**
 * Three short steps in a full-height sheet, each with Back and Skip: the machines as tiles to
 * tick, then Plan as two choices, then the cupboard as two. Every step starts on what the house
 * already says — its saved machines (Oven and Stovetop for a house with none), its Plan, its
 * cupboard — so the questions never quietly change an answer somebody gave before. Done saves
 * all three; Skip only what was actually answered, and marks the questions done either way.
 *
 * Either closes the sheet at once — the tabs change as it goes — and the answers are saved behind
 * it. Turning on a cupboard with nothing in it goes on to the starter list. Waving the sheet away
 * (the scrim, Escape, a pull down) saves nothing: the card on Recipes still asks.
 */
export default function KitchenSetup({ household: given, onClose }: { household: Household; onClose: () => void }) {
  const { updateKitchen, setStarterCupboardPending } = useHousehold();
  const offerStarter = useStarterOffer();
  // The house as it stood when the questions opened: what they start from, and what "turned the
  // cupboard on" is measured against — not each fresh copy of it that arrives while they are up.
  const [household] = useState(given);
  const [step, setStep] = useState(0);
  const [machines, setMachines] = useState<Set<string>>(() => {
    const saved = household.machines ?? [];
    return new Set(saved.length ? saved : ['oven', 'stovetop']);
  });
  const [plan, setPlan] = useState(() => planOn(household));
  const [cupboard, setCupboard] = useState(() => cupboardOn(household));
  // The steps somebody answered — moved on from, or changed — which are all that Skip sends.
  const [answered, setAnswered] = useState<Set<number>>(() => new Set());
  // What the cupboard holds now, when it is on: step 3 says so before anyone turns it off.
  const [cupboardCount, setCupboardCount] = useState<number | null>(null);
  const last = step === STEPS - 1;

  useEffect(() => {
    if (!cupboardOn(household)) return;
    let live = true;
    api<CupboardItem[]>('GET', `/api/households/${household.id}/cupboard`)
      .then((items) => live && setCupboardCount(items.length))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [household]);

  function answer(which: number) {
    setAnswered((prev) => (prev.has(which) ? prev : new Set(prev).add(which)));
  }

  function toggleMachine(key: string) {
    answer(0);
    setMachines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function next() {
    answer(step);
    setStep((s) => Math.min(STEPS - 1, s + 1));
  }

  function finish(skipping: boolean) {
    const sending = skipping ? answered : new Set([0, 1, 2]);
    const change: KitchenChange = { setUp: true };
    if (sending.has(0)) change.machines = orderedMachines(machines).map((m) => m.key);
    if (sending.has(1)) change.planEnabled = plan;
    if (sending.has(2)) change.cupboardEnabled = cupboard;
    // Turning the cupboard on may bring the starter list next, a save and a look in the cupboard
    // from now: the prompts after it are held for that moment, or the add-an-email sheet would
    // slide up between the two and be pulled away again, with whatever was typed in it.
    const turningOn = sending.has(2) && cupboard && !cupboardOn(household);
    if (turningOn) setStarterCupboardPending(household.id);
    onClose();
    updateKitchen(household.id, change)
      .then((saved) => {
        // Turned on just now, rather than left on: a cupboard that starts empty gets the basics.
        if (cupboardOn(saved) && !cupboardOn(household)) return offerStarter(household.id);
      })
      .catch((err) => {
        toast(
          err instanceof ApiError ? err.message : "Couldn't save your kitchen. Try again from the card on Recipes.",
          { icon: 'alert', duration: 5000 },
        );
      })
      .finally(() => {
        if (turningOn) setStarterCupboardPending(null);
      });
  }

  return (
    <Sheet
      title="Set up your kitchen"
      tall
      onClose={onClose}
      head={
        <div className="-mt-1 flex h-10 items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="press -ml-1.5 flex h-10 items-center gap-0.5 text-[1.0625rem] text-accent-ink"
            >
              <Icon name="chevL" size={24} />
              <span>Back</span>
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => finish(true)}
            className="press -mr-1 flex h-10 items-center px-1 text-[1.0625rem] font-medium text-accent-ink"
          >
            Skip
          </button>
        </div>
      }
    >
      <div className="flex min-h-full flex-col">
        <section key={step} aria-label={`Question ${step + 1} of ${STEPS}`} className="animate-rise space-y-4">
          {step === 0 && (
            <>
              <Heading title="What's in your kitchen?">
                Tap everything you have. Waxwing only suggests recipes you can make with them.
              </Heading>
              <MachineGrid selected={machines} onToggle={toggleMachine} />
              <p className="px-1 text-[0.8125rem] text-muted">You can change this any time in Household settings.</p>
            </>
          )}
          {step === 1 && (
            <>
              <Heading title="Plan meals ahead?">
                Plan the week together and add the whole week to Groceries in one tap. You can always add a single
                recipe straight to the list.
              </Heading>
              <div role="radiogroup" aria-label="Plan meals ahead?" className="space-y-3">
                <ChoiceCard
                  title="Yes, show Plan"
                  line="A Plan tab for the days ahead, shared by everyone in the house"
                  icon="calendar"
                  tone="accent"
                  on={plan}
                  onPick={() => {
                    answer(1);
                    setPlan(true);
                  }}
                />
                <ChoiceCard
                  title="Not now"
                  line="Just recipes and the list. Turn Plan on any time."
                  icon="book"
                  tone="herb"
                  on={!plan}
                  onPick={() => {
                    answer(1);
                    setPlan(false);
                  }}
                />
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <Heading title="Keep track of your cupboard?">
                The cupboard remembers what's at home so the list can skip it. It only works if someone updates it
                after shopping and cooking.
              </Heading>
              {cupboardCount !== null && cupboardCount > 0 && (
                <NoteBox tone="sky" icon="cupboard">
                  Your cupboard has {cupboardCount} {cupboardCount === 1 ? 'thing' : 'things'} in it.
                </NoteBox>
              )}
              <div role="radiogroup" aria-label="Keep track of your cupboard?" className="space-y-3">
                <ChoiceCard
                  title="No thanks — just the list"
                  badge="Most people start here"
                  icon="cart"
                  tone="herb"
                  on={!cupboard}
                  onPick={() => {
                    answer(2);
                    setCupboard(false);
                  }}
                />
                <ChoiceCard
                  title="Yes, track my cupboard"
                  line="Put the shopping away with a tap after each shop"
                  icon="cupboard"
                  tone="sky"
                  on={cupboard}
                  onPick={() => {
                    answer(2);
                    setCupboard(true);
                  }}
                />
              </div>
            </>
          )}
        </section>

        {/* At the bottom of the sheet however short the question, and in reach however long. */}
        <div className="sticky -bottom-6 -mx-5 -mb-6 mt-auto flex flex-col items-center gap-4 bg-bg px-5 pb-4 pt-6">
          <Dots step={step} />
          <Button full size="lg" onClick={() => (last ? finish(false) : next())}>
            {last ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function Heading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 pt-1">
      <h2 className="serif title-sheet">{title}</h2>
      <p className="text-[0.9375rem] leading-[1.45] text-muted">{children}</p>
    </div>
  );
}

function Dots({ step }: { step: number }) {
  return (
    <div className="flex h-1.5 items-center gap-1.5" role="img" aria-label={`Question ${step + 1} of ${STEPS}`}>
      {Array.from({ length: STEPS }, (_, i) => (
        <span
          key={i}
          className={cx('block h-1.5 rounded-full transition-all duration-200', i === step ? 'w-[18px] bg-accent' : 'w-1.5 bg-faint')}
        />
      ))}
    </div>
  );
}

/**
 * Every machine as a tile to tick, two to a row, in the catalogue's order — the kitchen questions'
 * first step and Household → Kitchen & features. A tile is a checkbox: several can be on.
 * `roomy` is for a page, which spreads to three to a row once the screen has the width; a sheet
 * stays at two whatever the screen, since it is never wider than a phone.
 */
export function MachineGrid({
  selected,
  onToggle,
  roomy = false,
  disabled = false,
}: {
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  roomy?: boolean;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label="Kitchen machines" className={cx('grid grid-cols-2 gap-2.5', roomy && 'sm:grid-cols-3')}>
      {MACHINES.map((m) => {
        const on = selected.has(m.key);
        return (
          <button
            key={m.key}
            type="button"
            role="checkbox"
            aria-checked={on}
            aria-label={m.label}
            disabled={disabled}
            onClick={() => onToggle(m.key)}
            className={cx(
              'press flex min-h-[58px] items-center gap-2.5 rounded-[14px] border px-3 py-2 text-left transition-colors duration-150',
              'disabled:opacity-45',
              on ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
            )}
          >
            <MachineIcon machine={m.key} size={24} className={cx('shrink-0', on ? 'text-accent-ink' : 'text-muted')} />
            <span className={cx('min-w-0 flex-1 text-[0.875rem] leading-[1.2]', on ? 'font-semibold' : 'font-medium')}>
              {m.label}
            </span>
            <CheckBox checked={on} className="!h-5 !w-5 !rounded-[6px]" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * A big answer to tap (the Plan and cupboard steps): a tile, what it means, and the accent ring
 * with a tick on the chosen one — drawn as the tutorial's Light or dark? draws its cards.
 */
function ChoiceCard({
  title,
  line,
  badge,
  icon,
  tone,
  on,
  onPick,
}: {
  title: string;
  line?: string;
  badge?: string;
  icon: IconName;
  tone: Tone;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cx('press card flex w-full items-center gap-3.5 p-4 text-left outline-none', on && 'border-accent ring-2 ring-accent')}
    >
      <Tile icon={icon} tone={tone} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block text-[1.0625rem] font-semibold leading-snug">{title}</span>
        {line && <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">{line}</span>}
        {badge && (
          <Pill tone="herb" className="mt-1.5">
            {badge}
          </Pill>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.6px]',
          on ? 'border-accent bg-accent text-on-accent' : 'border-faint',
        )}
      >
        {on && <Icon name="check" size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

/**
 * Offers the starter list (StartCupboardSheet, through Layout's prompt slot) to a household
 * whose cupboard has just been turned on — if there is nothing in it yet. One that already has
 * things from before it was turned off is left as it is.
 */
export function useStarterOffer() {
  const { offerStarterCupboard } = useHousehold();
  return useCallback(
    async (householdId: string) => {
      const stock = await api<CupboardItem[]>('GET', `/api/households/${householdId}/cupboard`).catch(() => null);
      if (stock && stock.length === 0) offerStarterCupboard(householdId);
    },
    [offerStarterCupboard],
  );
}

const CARD_CLOSED = 'mp_kitchenCardClosed_';

/** The card on Recipes was put away in this browser, for this household. */
export function kitchenCardClosed(householdId: string): boolean {
  try {
    return localStorage.getItem(CARD_CLOSED + householdId) === '1';
  } catch {
    return false;
  }
}

function closeKitchenCard(householdId: string) {
  try {
    localStorage.setItem(CARD_CLOSED + householdId, '1');
  } catch {
    // Storage blocked: the card is back next visit, which is a nudge rather than a nuisance.
  }
}

/**
 * The quiet way in, at the top of Recipes, for a household nobody has answered the kitchen
 * questions for: Start asks them; the cross puts the card away in this browser for this house,
 * and Household → Kitchen & features still has every answer. Never in the way of the recipes.
 */
export function KitchenSetupCard({ householdId, onStart }: { householdId: string; onStart: () => void }) {
  const [closed, setClosed] = useState(() => kitchenCardClosed(householdId));
  if (closed) return null;
  return (
    <section aria-label="Set up your kitchen" className="card flex items-start gap-3 p-3.5">
      <Tile icon="chef" tone="herb" size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold leading-snug">Set up your kitchen</p>
        <p className="text-[0.8125rem] text-muted">3 quick questions</p>
        <Button size="sm" variant="soft" className="mt-2.5" onClick={onStart}>
          Start
        </Button>
      </div>
      <IconButton
        label="Not now"
        shape="plain"
        className="!h-8 !w-8 text-muted"
        onClick={() => {
          closeKitchenCard(householdId);
          setClosed(true);
        }}
      >
        <Icon name="x" size={15} strokeWidth={2.4} />
      </IconButton>
    </section>
  );
}
