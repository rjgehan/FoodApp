import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { useHousehold, type KitchenChange } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import NoHousehold from '../components/NoHousehold';
import { MachineGrid, useStarterOffer } from '../components/kitchen/KitchenSetup';
import { planRange } from '../components/plan/planApi';
import { useBackToHousehold } from '../components/household/HouseholdParts';
import { cupboardOn, planOn } from '../utils/features';
import { orderedMachines } from '../utils/machines';
import { List, NavBar, NoteBox, Row, SectionLabel, Tile, Toggle } from '../components/ui';

/**
 * Household → Kitchen & features: the kitchen questions' answers, to change any time. The
 * machines as tiles, then Meal planning and Cupboard as switches, each saying what it is for and
 * what turning it off means. Every tap saves straight away and is the household's, so it changes
 * for everyone in it — and the tabs follow at once, before the server has answered.
 *
 * Turning the cupboard on with nothing in it offers the starter list, as setting up does. The
 * iPhone's Household → Kitchen & features is the same screen (KitchenScreen.swift).
 */
export default function HouseholdKitchenPage() {
  usePushedScreen();
  const { activeHousehold, updateKitchen } = useHousehold();
  const back = useBackToHousehold();
  const offerStarter = useStarterOffer();
  const [error, setError] = useState<string | null>(null);
  // Meals on the Plan from today on: turning planning off keeps them, and says so.
  const [planned, setPlanned] = useState<number | null>(null);
  const householdId = activeHousehold?.id;

  useEffect(() => {
    if (!householdId) return;
    let live = true;
    const today = new Date();
    const later = new Date(today);
    later.setDate(later.getDate() + 90);
    planRange(householdId, today, later)
      .then((entries) => {
        if (live) setPlanned(entries.filter((e) => e.recipeName || e.placeId || e.itemName || e.savedLinkId).length);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [householdId]);

  if (!activeHousehold) return <NoHousehold />;
  const household = activeHousehold;
  const machines = new Set(household.machines ?? []);
  const plan = planOn(household);
  const cupboard = cupboardOn(household);

  /**
   * One answer at a time, as it is changed. A refusal puts it back (the household does) and says
   * why. Any answer given here is the kitchen questions answered, so the card on Recipes goes and
   * nobody joining is asked them again.
   */
  function save(change: KitchenChange) {
    setError(null);
    updateKitchen(household.id, { ...change, setUp: true })
      .then((saved) => {
        // Turned on with nothing in it: the common things a kitchen already has, in one go.
        if (change.cupboardEnabled && cupboardOn(saved)) offerStarter(household.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't save that. Check your connection and try again."));
  }

  function toggleMachine(key: string) {
    const next = new Set(machines);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    save({ machines: orderedMachines(next).map((m) => m.key) });
  }

  const planLine = plan
    ? 'Plan the week together and add it all to Groceries in one tap.'
    : planned
      ? `Off. Your ${planned} planned ${planned === 1 ? 'meal stays' : 'meals stay'} saved, for when it's back on.`
      : 'Off. Add a recipe to Groceries from its page instead.';
  const cupboardLine = cupboard
    ? 'Remembers what’s at home, so the list can skip it. Turning it off puts “Always have” things (salt, oil…) back on lists.'
    : 'Off. “Always have” things like salt and oil go on grocery lists like everything else.';

  return (
    <div className="mx-auto max-w-xl pb-6 lg:max-w-3xl">
      {/* No Done: every tap has saved already, so back is all there is. */}
      <NavBar title="Kitchen & features" backLabel="Household" back={back} className="-mx-1 mb-1.5" />

      <div className="space-y-2">
        <section aria-labelledby="kitchen-machines">
          <SectionLabel>
            <span id="kitchen-machines">Machines</span>
          </SectionLabel>
          <MachineGrid selected={machines} onToggle={toggleMachine} roomy />
          <p className="px-1 pt-2.5 text-[0.8125rem] leading-snug text-muted">
            Saved for your household. Recipes show the machines they need, and a drawer can be filtered by machine.
          </p>
        </section>

        <section aria-labelledby="kitchen-features" className="pt-4">
          <SectionLabel>
            <span id="kitchen-features">Features</span>
          </SectionLabel>
          <List inset={0}>
            <Row
              role="switch"
              aria-checked={plan}
              aria-label="Meal planning"
              lead={<Tile icon="calendar" tone="accent" size={34} />}
              title="Meal planning"
              subtitle={planLine}
              wrap
              end={<Toggle on={plan} />}
              onClick={() => save({ planEnabled: !plan })}
            />
            <Row
              role="switch"
              aria-checked={cupboard}
              aria-label="Cupboard"
              lead={<Tile icon="cupboard" tone="sky" size={34} />}
              title="Cupboard"
              subtitle={cupboardLine}
              wrap
              end={<Toggle on={cupboard} />}
              onClick={() => save({ cupboardEnabled: !cupboard })}
            />
          </List>
          <p className="px-1 pt-2.5 text-[0.8125rem] leading-snug text-muted">
            Recipes and the grocery list are always there. These are the household&rsquo;s, so they change for everyone
            in it.
          </p>
        </section>

        {error && (
          <NoteBox tone="accent" icon="alert" className="mt-2">
            {error}
          </NoteBox>
        )}
      </div>
    </div>
  );
}
