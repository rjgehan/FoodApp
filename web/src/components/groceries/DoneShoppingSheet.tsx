import { useState } from 'react';
import { api } from '../../api/client';
import type { GroceryListItem } from '../../api/types';
import { Button, CheckBox, cx, ErrorText, Sheet, Tile, Toggle } from '../ui';
import { amountOf } from './groceryParts';

/**
 * "Done shopping?" (mockup 4.4). Everything ticked comes off the list, and what is for the house
 * goes in the cupboard. All of it starts ticked because most of a shop is for the house — you
 * untick the birthday card, rather than ticking everything else. The switch at the top is for a
 * shop that was not for the house at all.
 */
export default function DoneShoppingSheet({
  householdId,
  items,
  onDone,
  onClose,
}: {
  householdId: string;
  items: GroceryListItem[];
  onDone: (clearedIds: string[], stocked: number) => void;
  onClose: () => void;
}) {
  const [toCupboard, setToCupboard] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stocking = toCupboard ? items.filter((i) => selected.has(i.id)) : [];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const putAway = stocking.map((i) => i.id);
    const leaveOut = items.filter((i) => !putAway.includes(i.id)).map((i) => i.id);
    try {
      await api('POST', `/api/households/${householdId}/grocery-list/put-away`, { putAway, leaveOut });
      onDone([...putAway, ...leaveOut], putAway.length);
    } catch {
      setError('Could not finish the shop.');
      setBusy(false);
    }
  }

  const count = items.length;

  return (
    <Sheet
      title="Done shopping?"
      subtitle={`${count} ticked ${count === 1 ? 'item leaves' : 'items leave'} the list.`}
      onClose={onClose}
    >
      <div className="space-y-3.5">
        <button
          type="button"
          role="switch"
          aria-checked={toCupboard}
          onClick={() => setToCupboard((v) => !v)}
          className="card press flex w-full items-center gap-3 px-3.5 py-3 text-left"
        >
          <Tile icon="cupboard" tone="sky" size={36} />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-semibold">Put them in the cupboard</span>
            <span className="block text-xs text-muted">Untick anything that isn't for the house</span>
          </span>
          <Toggle on={toCupboard} />
        </button>

        <ul className={cx('card card-rows inset-rows transition-opacity', !toCupboard && 'opacity-50')} aria-label="Ticked items">
          {items.map((item) => {
            const on = selected.has(item.id);
            const amount = amountOf(item);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!toCupboard}
                  onClick={() => toggle(item.id)}
                  className="flex min-h-[46px] w-full items-center gap-3 px-4 py-2 text-left"
                >
                  <CheckBox checked={on && toCupboard} />
                  <span className={cx('min-w-0 flex-1 truncate text-base font-medium', !on && 'text-muted')}>
                    {amount && <b className="font-semibold">{amount} </b>}
                    <span>{item.name}</span>
                  </span>
                  {!on && toCupboard && <span className="shrink-0 text-xs text-muted">Not for the house</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {error && <ErrorText>{error}</ErrorText>}
        <Button size="lg" full disabled={busy} onClick={finish}>
          {busy ? 'Finishing…' : stocking.length ? `Finish · ${stocking.length} to cupboard` : 'Finish'}
        </Button>
      </div>
    </Sheet>
  );
}
