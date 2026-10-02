import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { StarterGroup } from '../api/types';
import { Icon } from './icons';
import { PROMPT_WAY_OUT, PromptHead } from './prompts';
import { Button, cx, ErrorText, Sheet } from './ui';

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
  /** Straight after making the household: it is a prompt, and offers Skip. */
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
  const haveSome = groups?.some((g) => g.items.some((i) => i.have)) ?? false;
  const line = (
    <>
      Tick what you already have. You can change it anytime.
      {haveSome && ' The pale green ones are in the cupboard already.'}
    </>
  );

  // The mockup's 7.3: chips to tick, green with a tick once chosen and plain with a + until then,
  // and one button at the bottom. Straight after making the house it is a prompt (its own
  // heading, Skip under the button); from the Cupboard's ••• it is an ordinary sheet.
  return (
    <Sheet
      title={first ? 'Stock your cupboard' : 'Start with the basics'}
      subtitle={first ? undefined : line}
      onClose={onClose}
      tall
      head={first ? <PromptHead title="Stock your cupboard" line={line} /> : undefined}
    >
      {groups === null ? (
        <p className="py-6 text-center text-[0.9375rem] text-muted">Loading…</p>
      ) : (
        groups.map((group, index) => {
          const open = group.items.filter((i) => !i.have).map((i) => i.name);
          const allOn = open.length > 0 && open.every((name) => chosen.has(name));
          return (
            <section key={group.name} aria-label={group.name} className={index === 0 ? undefined : 'pt-3'}>
              <div className="flex min-h-8 items-center justify-between gap-3 pb-1">
                <h3 className="group-label">{group.name}</h3>
                {open.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="-my-1 -mr-3"
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
                          // The mockup's chip: 32px tall, 14px words.
                          'press inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
                          'transition-colors duration-150',
                          item.have
                            ? 'border-herb-soft bg-herb-soft text-herb'
                            : on
                              ? 'border-herb bg-herb text-white'
                              : 'border-line bg-surface text-ink',
                        )}
                      >
                        {on ? (
                          <Icon name="check" size={13} strokeWidth={3} className="pop -ml-0.5 shrink-0" />
                        ) : (
                          <Icon name="plus" size={13} className="-ml-0.5 shrink-0" />
                        )}
                        {/* Named as recipes name them, lower case; shown the way the mockup writes them. */}
                        <span className="inline-block first-letter:uppercase">{item.name}</span>
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
      <div className="sticky -bottom-6 -mx-5 -mb-6 mt-6 flex flex-col gap-1 bg-bg px-5 pb-4 pt-3">
        {error && <ErrorText>{error}</ErrorText>}
        <Button full size="lg" onClick={add} disabled={busy || count === 0}>
          {busy ? 'Adding…' : count === 0 ? 'Add to cupboard' : `Add ${count} to cupboard`}
        </Button>
        {first && (
          <Button full size="lg" variant="ghost" className={PROMPT_WAY_OUT} onClick={onClose} disabled={busy}>
            Skip
          </Button>
        )}
      </div>
    </Sheet>
  );
}
