import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import type { GroceryCategory } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import NoHousehold from '../components/NoHousehold';
import { Icon } from '../components/icons';
import { Button, ConfirmAlert, cx, ErrorText, Field, Input, NavBar, Sheet } from '../components/ui';
import { useBackToHousehold } from '../components/household/HouseholdParts';

interface Drag {
  id: string;
  pointer: number;
  from: number;
  startY: number;
  dy: number;
  /** Each row's top and height when the drag began, in the order they were in. */
  rows: { top: number; height: number }[];
  to: number;
}

/**
 * Store aisles (mockup 6.7): the household's own aisles in the order you walk the shop, which is
 * the order the grocery list is grouped in. Drag a row by its grip to move it — the grip only, so
 * dragging never fights scrolling the page — or focus the grip and use the arrow keys. Tap a name
 * to rename or delete it.
 */
export default function HouseholdAislesPage() {
  usePushedScreen();
  const {
    activeHouseholdId,
    groceryCategories,
    createGroceryCategory,
    renameGroceryCategory,
    reorderGroceryCategories,
    deleteGroceryCategory,
  } = useHousehold();
  const back = useBackToHousehold();
  const sorted = [...groceryCategories].sort((a, b) => a.position - b.position);
  // The order on screen. Moves show at once and are saved behind them; the server's answer
  // replaces this whenever nothing is being dragged or saved.
  const [order, setOrder] = useState<string[]>(sorted.map((c) => c.id));
  const [saving, setSaving] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState<GroceryCategory | null>(null);
  const [adding, setAdding] = useState(false);
  const rowEls = useRef(new Map<string, HTMLLIElement>());
  const grips = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);

  const serverOrder = sorted.map((c) => c.id).join(',');
  useEffect(() => {
    if (!drag && saving === 0) setOrder(serverOrder ? serverOrder.split(',') : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverOrder, saving]);

  // Moving a row moves its grip in the page, which can take the keyboard's focus with it.
  useLayoutEffect(() => {
    if (refocus.current) {
      grips.current.get(refocus.current)?.focus();
      refocus.current = null;
    }
  });

  if (!activeHouseholdId) return <NoHousehold />;

  const byId = new Map(groceryCategories.map((c) => [c.id, c]));
  const shown = order.map((id) => byId.get(id)).filter((c): c is GroceryCategory => !!c);

  async function commit(next: string[]) {
    setOrder(next);
    setSaving((n) => n + 1);
    setError(null);
    try {
      await reorderGroceryCategories(next);
    } catch {
      setError('Could not save the new order.');
    } finally {
      setSaving((n) => n - 1);
    }
  }

  function moved(ids: string[], from: number, to: number) {
    const next = [...ids];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    return next;
  }

  function onGripDown(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone; the drag simply ends with it.
    }
    const rows = shown.map((c) => {
      const el = rowEls.current.get(c.id);
      return { top: el?.offsetTop ?? 0, height: el?.offsetHeight ?? 46 };
    });
    const from = shown.findIndex((c) => c.id === id);
    setDrag({ id, pointer: e.pointerId, from, startY: e.clientY, dy: 0, rows, to: from });
  }

  function onGripMove(e: PointerEvent<HTMLButtonElement>) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const dy = e.clientY - drag.startY;
    const me = drag.rows[drag.from];
    const centre = me.top + dy + me.height / 2;
    let to = drag.from;
    drag.rows.forEach((r, i) => {
      const mid = r.top + r.height / 2;
      if (i > drag.from && centre > mid) to = i;
      if (i < drag.from && centre < mid && to >= drag.from) to = i;
    });
    setDrag({ ...drag, dy, to });
  }

  function onGripUp(e: PointerEvent<HTMLButtonElement>) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const { from, to } = drag;
    setDrag(null);
    if (from !== to) commit(moved(order, from, to));
  }

  function onGripKey(e: KeyboardEvent<HTMLButtonElement>, index: number, id: string) {
    const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    const to = index + step;
    if (to < 0 || to >= order.length) return;
    refocus.current = id;
    commit(moved(order, index, to));
  }

  /** Where a row sits while another is dragged past it. */
  function shift(i: number): number {
    if (!drag || i === drag.from) return 0;
    const h = drag.rows[drag.from].height;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -h;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return h;
    return 0;
  }

  return (
    <div className="mx-auto max-w-xl pb-6">
      <NavBar
        title="Store aisles"
        backLabel="Household"
        back={back}
        className="-mx-1 mb-1.5"
        right={
          <button type="button" className="press font-semibold" onClick={back}>
            Done
          </button>
        }
      />

      <div className="space-y-3">
        <p className="text-[0.875rem] text-muted">Drag into the order you walk the store. Groceries follow this order.</p>

        <ol aria-label="Store aisles" className={cx('card inset-rows relative', drag && 'select-none')}>
          {shown.map((category, i) => {
            const lifted = drag?.id === category.id;
            return (
              <li
                key={category.id}
                ref={(el) => {
                  if (el) rowEls.current.set(category.id, el);
                  else rowEls.current.delete(category.id);
                }}
                style={{ transform: lifted ? `translateY(${drag!.dy}px) scale(1.02)` : `translateY(${shift(i)}px)` }}
                className={cx(
                  'flex min-h-[46px] items-center gap-3 pl-4 pr-1.5',
                  lifted ? 'z-10 rounded-xl bg-surface shadow-lift before:hidden' : drag && 'transition-transform duration-150 ease-out',
                )}
              >
                <span className="w-[18px] shrink-0 text-[0.8125rem] font-semibold tabular-nums text-faint">{i + 1}</span>
                <button
                  type="button"
                  onClick={() => setManaging(category)}
                  className="press min-w-0 flex-1 truncate py-2.5 text-left text-base font-medium"
                  aria-label={`Rename or delete ${category.name}`}
                >
                  {category.name}
                </button>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) grips.current.set(category.id, el);
                    else grips.current.delete(category.id);
                  }}
                  aria-label={`Move ${category.name}`}
                  aria-description="Drag, or use the up and down arrow keys"
                  title="Drag to move"
                  onPointerDown={(e) => onGripDown(e, category.id)}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onPointerCancel={onGripUp}
                  onKeyDown={(e) => onGripKey(e, i, category.id)}
                  className={cx(
                    'flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-xl text-faint',
                    lifted ? 'cursor-grabbing' : 'cursor-grab',
                  )}
                >
                  <Icon name="grip" size={18} />
                </button>
              </li>
            );
          })}
        </ol>

        {error && <ErrorText>{error}</ErrorText>}

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="dash press flex w-full items-center justify-center gap-2 py-3 text-[0.875rem] font-semibold text-accent-ink"
        >
          <Icon name="plus" size={16} />
          Add aisle
        </button>
      </div>

      {adding && (
        <AddAisleSheet
          onClose={() => setAdding(false)}
          onAdd={async (name) => {
            await createGroceryCategory(name);
            setAdding(false);
          }}
        />
      )}
      {managing && (
        <ManageAisleSheet
          aisle={managing}
          onClose={() => setManaging(null)}
          onRename={async (name) => {
            await renameGroceryCategory(managing.id, name);
            setManaging(null);
          }}
          onDelete={async () => {
            await deleteGroceryCategory(managing.id);
            setManaging(null);
          }}
        />
      )}
    </div>
  );
}

function AddAisleSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(name.trim());
    } catch {
      setError('Could not add that aisle.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Add aisle" subtitle="It goes at the end; drag it where it belongs." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Pharmacy, say" aria-label="New aisle name" />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" size="lg" full disabled={busy || !name.trim()}>
          Add aisle
        </Button>
      </form>
    </Sheet>
  );
}

function ManageAisleSheet({
  aisle,
  onClose,
  onRename,
  onDelete,
}: {
  aisle: GroceryCategory;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(aisle.name);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim() !== '' && name.trim() !== aisle.name;

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (!changed) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(name.trim());
    } catch {
      setError('Could not rename it.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={aisle.name} onClose={onClose}>
      <form onSubmit={rename} className="space-y-4">
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Aisle name" />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" size="lg" full disabled={busy || !changed}>
          Rename
        </Button>
        <Button type="button" size="lg" variant="danger" full icon="trash" disabled={busy} onClick={() => setConfirming(true)}>
          Delete aisle
        </Button>
      </form>
      {confirming && (
        <ConfirmAlert
          title={`Delete ${aisle.name}?`}
          icon="trash"
          confirmLabel={`Delete ${aisle.name}`}
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              await onDelete();
            } catch {
              setError('Could not delete it.');
              setConfirming(false);
              setBusy(false);
            }
          }}
          onCancel={() => setConfirming(false)}
        >
          Anything filed under {aisle.name} becomes unsorted — one tap to place it again, or Sort will pick it up.
        </ConfirmAlert>
      )}
    </Sheet>
  );
}
