import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { RestockReminder } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useOnResume } from '../utils/useOnResume';
import { everyTitle, lastBoughtLabel, RESTOCK_PRESETS } from '../utils/restock';
import { PROMPT_WAY_OUT, PromptHead } from './prompts';
import { Button, CheckBox, cx, ErrorText, Field, List, NumberInput, Select, Sheet } from './ui';

/**
 * The household's restock reminders by ingredient, so the grocery list and the cupboard can say
 * "every 3 weeks" beside the things that have one.
 */
export function useRestockReminders(householdId: string | null) {
  const [reminders, setReminders] = useState<Map<string, RestockReminder>>(() => new Map());

  const reload = useCallback(async () => {
    if (!householdId) return;
    const list = await api<RestockReminder[]>('GET', `/api/households/${householdId}/restock`);
    setReminders(new Map(list.map((r) => [r.ingredientId, r])));
  }, [householdId]);

  useEffect(() => {
    setReminders(new Map());
    reload().catch(() => {});
  }, [reload]);

  useOnResume(() => {
    reload().catch(() => {});
  });

  /** After a save: the new reminder, or null for one turned off. */
  const saved = useCallback((ingredientId: string, reminder: RestockReminder | null) => {
    setReminders((prev) => {
      const next = new Map(prev);
      if (reminder) next.set(ingredientId, reminder);
      else next.delete(ingredientId);
      return next;
    });
  }, []);

  return { reminders, reload, saved };
}

/** A number of days sets it (or changes it); null turns it off. */
export async function saveRestock(
  householdId: string,
  ingredientId: string,
  everyDays: number | null,
): Promise<RestockReminder | null> {
  if (everyDays === null) {
    await api('DELETE', `/api/households/${householdId}/restock/${ingredientId}`);
    return null;
  }
  return api<RestockReminder>('PUT', `/api/households/${householdId}/restock/${ingredientId}`, { everyDays });
}

/**
 * Off, the four lengths most things run to, or a number of days for the rest. A number that is
 * not one of the four opens as "Every … days" with it filled in.
 */
export function RestockField({
  value,
  onChange,
  label = 'Remind me to buy it',
  withOff = true,
}: {
  value: number | null;
  onChange: (everyDays: number | null) => void;
  /** What the select is called to assistive tech. */
  label?: string;
  /** Without "Off", for a field under a switch that already turns it off. */
  withOff?: boolean;
}) {
  const [custom, setCustom] = useState(value !== null && !RESTOCK_PRESETS.includes(value));
  const [days, setDays] = useState<number | null>(value);
  const chosen = value === null ? 'off' : custom ? 'custom' : String(value);

  return (
    <div className="space-y-2">
      <Select
        value={chosen}
        aria-label={label}
        onChange={(e) => {
          const picked = e.target.value;
          if (picked === 'off') {
            setCustom(false);
            onChange(null);
          } else if (picked === 'custom') {
            setCustom(true);
            // Starts from what was chosen already, so switching to typing it changes nothing yet.
            const start = value ?? 10;
            setDays(start);
            onChange(start);
          } else {
            setCustom(false);
            onChange(Number(picked));
          }
        }}
      >
        {withOff && <option value="off">Off</option>}
        {RESTOCK_PRESETS.map((d) => (
          <option key={d} value={String(d)}>
            {everyTitle(d)}
          </option>
        ))}
        <option value="custom">Every … days</option>
      </Select>
      {custom && (
        <label className="flex items-center gap-2 text-[0.9375rem]">
          <span className="text-muted">Every</span>
          <NumberInput
            className="w-20 text-center"
            min={1}
            max={365}
            value={days}
            aria-label="Days between"
            onChange={(v) => {
              setDays(v);
              // Half-typed or out of range keeps the last good number rather than turning it off.
              if (v !== null && v >= 1 && v <= 365) onChange(Math.round(v));
            }}
          />
          <span className="text-muted">days</span>
        </label>
      )}
    </div>
  );
}

/**
 * "Remind me to buy it" for one grocery list item — the list's way in. The cupboard has the same
 * choice in its item sheet.
 */
export function RestockSheet({
  householdId,
  ingredientId,
  name,
  current,
  onSaved,
  onClose,
}: {
  householdId: string;
  ingredientId: string;
  name: string;
  current: RestockReminder | null;
  onSaved: (reminder: RestockReminder | null) => void;
  onClose: () => void;
}) {
  const [everyDays, setEveryDays] = useState<number | null>(current?.everyDays ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = everyDays !== (current?.everyDays ?? null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveRestock(householdId, ingredientId, everyDays));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={name} onClose={onClose}>
      <div className="space-y-4">
        <Field
          label="Remind me to buy it"
          hint="Counted from the last time it was put away. When it's time, the app asks whether to add it to the list."
        >
          <RestockField value={everyDays} onChange={setEveryDays} />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy || !changed} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

const ASKED = 'mp_restockAsked:';

function askedAlready(householdId: string): boolean {
  try {
    return sessionStorage.getItem(ASKED + householdId) === '1';
  } catch {
    return false;
  }
}

function rememberAsked(householdId: string) {
  try {
    sessionStorage.setItem(ASKED + householdId, '1');
  } catch {
    // Private browsing with storage off: it may ask again on the next load, which is harmless.
  }
}

/**
 * "Time to restock?" — asked once per app open for each household, when the app loads or the
 * household changes, and only when something's time has come. Everything starts ticked, since
 * the question is usually "yes"; untick what you still have. Anything not added — unticked, or
 * the whole sheet waved away — is not asked about again for three days.
 */
export function RestockPrompt() {
  const { activeHouseholdId } = useHousehold();
  const [due, setDue] = useState<{ householdId: string; items: RestockReminder[] } | null>(null);

  useEffect(() => {
    if (!activeHouseholdId || askedAlready(activeHouseholdId)) return;
    let cancelled = false;
    api<RestockReminder[]>('GET', `/api/households/${activeHouseholdId}/restock/due`)
      .then((items) => {
        if (cancelled) return;
        rememberAsked(activeHouseholdId);
        if (items.length) setDue({ householdId: activeHouseholdId, items });
      })
      .catch(() => {
        // Offline, or taken out of the house: nothing to ask, and the next load tries again.
      });
    return () => {
      cancelled = true;
    };
  }, [activeHouseholdId]);

  if (!due || due.householdId !== activeHouseholdId) return null;
  return <RestockPromptSheet householdId={due.householdId} items={due.items} onDone={() => setDue(null)} />;
}

function RestockPromptSheet({
  householdId,
  items,
  onDone,
}: {
  householdId: string;
  items: RestockReminder[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.ingredientId)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = useRef(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function add() {
    setBusy(true);
    setError(null);
    const add = items.filter((i) => selected.has(i.ingredientId)).map((i) => i.ingredientId);
    const snooze = items.filter((i) => !selected.has(i.ingredientId)).map((i) => i.ingredientId);
    try {
      await api('POST', `/api/households/${householdId}/restock/add-due`, { add, snooze });
      answered.current = true;
      onDone();
    } catch {
      setError('Could not add those to the list.');
      setBusy(false);
    }
  }

  /** "Not now", the close button and a tap outside all mean the same: ask again in a few days. */
  function notNow() {
    if (answered.current) return;
    answered.current = true;
    api('POST', `/api/households/${householdId}/restock/snooze`, {
      ingredientIds: items.map((i) => i.ingredientId),
    }).catch(() => {});
    onDone();
  }

  const count = selected.size;

  // The mockup's 7.2: the bell on mustard beside the question and how many are due, the due
  // things as a ticked list in a card, then "Add 3 to groceries" and the way to put it all off.
  // An unticked row says what will happen to it, so leaving one out is not a guess.
  return (
    <Sheet
      title="Time to restock?"
      onClose={notNow}
      head={
        <PromptHead
          icon="bell"
          tone="mustard"
          title="Time to restock?"
          line={items.length === 1 ? '1 reminder is due' : `${items.length} reminders are due`}
        />
      }
    >
      <div className="space-y-4">
        <List label="Due to restock" inset={0}>
          {items.map((item) => {
            const on = selected.has(item.ingredientId);
            return (
              <li key={item.ingredientId}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(item.ingredientId)}
                  className="press flex min-h-[3.875rem] w-full items-center gap-3.5 px-4 py-[9px] text-left active:bg-surface2"
                >
                  <CheckBox checked={on} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-base font-medium first-letter:uppercase', !on && 'text-muted')}>{item.name}</span>
                    <span className="mt-px block truncate text-[0.8125rem] text-muted">
                      {on
                        ? `${everyTitle(item.everyDays)} · ${lastBoughtLabel(item.lastBoughtAt)}`
                        : `Skip · ask again in ${SNOOZE_DAYS} days`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </List>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex flex-col gap-1">
          <Button size="lg" full icon="cart" disabled={busy || count === 0} onClick={add}>
            {busy ? 'Adding…' : count === 0 ? 'Add to groceries' : `Add ${count} to groceries`}
          </Button>
          <Button variant="ghost" size="lg" full className={PROMPT_WAY_OUT} disabled={busy} onClick={notNow}>
            Skip all for {SNOOZE_DAYS} days
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** How long a skipped reminder is left alone — the server's snooze. */
const SNOOZE_DAYS = 3;
