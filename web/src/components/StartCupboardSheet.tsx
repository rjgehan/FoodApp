import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { StarterGroup } from '../api/types';
import { Button, cx, ErrorText, Sheet } from './ui';
import { CheckIcon } from './icons';

/**
 * The common things a kitchen already has — flour, salt, oil, ketchup — to tick through in one
 * go, so a new household's cupboard does not start empty and get filled a name at a time.
 * Offered once, straight after a household is made, and any time after from the Cupboard's
 * •••. What is in the cupboard already shows ticked and stays as it is.
 *
 * The list comes from the server, so the phone offers exactly the same one.
 */
export default function StartCupboardSheet({
  householdId,
  first = false,
  onAdded,
  onClose,
}: {
  householdId: string;
  /** Straight after making the household: it says hello, and offers Skip. */
  first?: boolean;
  onAdded?: (added: number) => void;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<StarterGroup[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<StarterGroup[]>('GET', `/api/households/${householdId}/cupboard/starters`)
      .then(setGroups)
      .catch(() => {
        setGroups([]);
        setError('Could not load the list.');
      });
  }, [householdId]);

  function toggle(name: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  /** All of a group on, or — when it already is — all of it off again. */
  function toggleGroup(names: string[], on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      for (const name of names) {
        if (on) next.add(name);
        else next.delete(name);
      }
      return next;
    });
  }

  async function add() {
    if (chosen.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ added: number; skipped: number }>(
        'POST',
        `/api/households/${householdId}/cupboard/starters`,
        { names: [...chosen] },
      );
      onAdded?.(result.added);
      onClose();
    } catch {
      setError('Could not add those. Try again?');
      setBusy(false);
    }
  }

  const count = chosen.size;

  return (
    <Sheet title={first ? 'Let’s start your cupboard' : 'Start with the basics'} onClose={onClose} tall>
      <p className="text-[0.9375rem] text-muted">
        Tap what’s already in the house. Each lands in its aisle, and you can change any of it later.
        {groups?.some((g) => g.items.some((i) => i.have)) && ' The green ones are in the cupboard already.'}
      </p>

      {groups === null ? (
        <p className="py-6 text-center text-[0.9375rem] text-muted">Loading…</p>
      ) : (
        groups.map((group) => {
          const open = group.items.filter((i) => !i.have).map((i) => i.name);
          const allOn = open.length > 0 && open.every((name) => chosen.has(name));
          return (
            <section key={group.name} aria-label={group.name} className="pt-5">
              <div className="flex min-h-9 items-center justify-between gap-3 pb-1.5">
                <h3 className="group-label">{group.name}</h3>
                {open.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="-mr-3"
                    onClick={() => toggleGroup(open, !allOn)}
                    aria-label={`${allOn ? 'Clear' : 'Select all in'} ${group.name}`}
                  >
                    {allOn ? 'Clear' : 'Select all'}
                  </Button>
                )}
              </div>
              <ul className="flex flex-wrap gap-2">
                {group.items.map((item) => {
                  const on = item.have || chosen.has(item.name);
                  return (
                    <li key={item.name}>
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={item.have}
                        title={item.have ? 'Already in the cupboard' : undefined}
                        onClick={() => toggle(item.name)}
                        className={cx(
                          'press inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.9375rem] font-medium',
                          'transition-colors duration-150',
                          item.have
                            ? 'bg-herb-soft text-herb'
                            : on
                              ? 'bg-accent text-on-accent'
                              : 'bg-surface2 text-ink',
                        )}
                      >
                        {on && <CheckIcon className="pop -ml-0.5 h-3.5 w-3.5" />}
                        {item.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      {/* Stays in reach at the bottom however far down the list you are. */}
      <div className="sticky -bottom-4 -mx-4 -mb-4 mt-6 space-y-1 bg-surface px-4 pb-3 pt-3 edge-top">
        {error && <ErrorText>{error}</ErrorText>}
        <Button full size="lg" onClick={add} disabled={busy || count === 0}>
          {busy ? 'Adding…' : count === 0 ? 'Add to cupboard' : `Add ${count} to cupboard`}
        </Button>
        {first && (
          <Button full variant="ghost" onClick={onClose} disabled={busy}>
            Skip
          </Button>
        )}
      </div>
    </Sheet>
  );
}
