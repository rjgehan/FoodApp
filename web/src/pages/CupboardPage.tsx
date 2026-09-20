import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { CupboardItem, GroceryCategory } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useOnResume } from '../utils/useOnResume';
import { groupByCategory } from '../utils/storeSections';
import { Button, Card, CheckCircle, cx, EmptyState, ErrorText, Field, Input, NumberInput, Select, Sheet } from '../components/ui';
import { BarcodeIcon, PlusIcon } from '../components/icons';
import { PageTitle } from '../components/PageTitle';
import SwipeRow from '../components/SwipeRow';
import UnitInput from '../components/UnitInput';
import ScanToCupboard from '../components/ScanToCupboard';

function byName(a: CupboardItem, b: CupboardItem) {
  return a.name.localeCompare(b.name);
}

/**
 * What is in the house, so you can check without going to look. Filled mostly by "Done
 * shopping" on the grocery list; the search box doubles as the way to add something by hand.
 *
 * Each row shows the one thing you check at a glance — Have or Low — and keeps the rest a swipe
 * away: slide it left for Buy again and Remove, or fling it all the way to remove it outright,
 * which is what you do most. Tapping an item opens it for editing.
 */
export default function CupboardPage() {
  const { activeHouseholdId, groceryCategories } = useHousehold();
  const [items, setItems] = useState<CupboardItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<CupboardItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeHouseholdId) return;
    setItems(await api<CupboardItem[]>('GET', `/api/households/${activeHouseholdId}/cupboard`));
  }, [activeHouseholdId]);

  useEffect(() => {
    load().catch(() => setItems([]));
  }, [load]);

  useOnResume(() => {
    load().catch(() => {});
  });

  if (!activeHouseholdId) {
    return (
      <Card>
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  function replace(updated: CupboardItem) {
    setItems((prev) => {
      const list = prev ?? [];
      return list.some((i) => i.id === updated.id)
        ? list.map((i) => (i.id === updated.id ? updated : i))
        : [...list, updated].sort(byName);
    });
  }

  function drop(item: CupboardItem) {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    setEditing(null);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = query.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      replace(await api<CupboardItem>('POST', `/api/households/${activeHouseholdId}/cupboard`, { name }));
      setQuery('');
    } finally {
      setBusy(false);
    }
  }

  async function setRunningLow(item: CupboardItem, runningLow: boolean) {
    if (item.runningLow === runningLow) return;
    replace({ ...item, runningLow });
    replace(
      await api<CupboardItem>('PATCH', `/api/households/${activeHouseholdId}/cupboard/${item.id}`, { runningLow }),
    );
  }

  async function adjustQuantity(item: CupboardItem, delta: number) {
    const optimistic = Math.max(0, (item.quantity ?? 0) + delta);
    replace({ ...item, quantity: optimistic });
    replace(
      await api<CupboardItem>('POST', `/api/households/${activeHouseholdId}/cupboard/${item.id}/adjust`, { delta }),
    );
  }

  async function remove(item: CupboardItem) {
    drop(item);
    await api('DELETE', `/api/households/${activeHouseholdId}/cupboard/${item.id}`);
  }

  async function buyAgain(item: CupboardItem) {
    drop(item);
    await api('POST', `/api/households/${activeHouseholdId}/cupboard/${item.id}/buy-again`);
  }

  const all = items ?? [];
  const q = query.trim().toLowerCase();
  const shown = all.filter((i) => !q || i.name.toLowerCase().includes(q));
  const exact = all.some((i) => i.name.toLowerCase() === q);
  const groups = groupByCategory(shown, groceryCategories);
  const low = all.filter((i) => i.runningLow).length;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Cupboard"
        subtitle={
          all.length === 0
            ? 'What’s in the house.'
            : [`${all.length} ${all.length === 1 ? 'thing' : 'things'}`, low && `${low} running low`]
                .filter(Boolean)
                .join(' · ')
        }
      />

      {/* One box: type to check whether you have something, and if you don't, add it. The
          camera answers the same question without the typing, which is the one that matters
          when you are standing in a shop holding the tin. */}
      <form onSubmit={add} className="space-y-2">
        <div className="flex gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Do we have… ?"
            aria-label="Search the cupboard, or add something"
          />
          <Button
            type="button"
            variant="secondary"
            className="w-11 shrink-0 px-0"
            aria-label="Scan a barcode"
            onClick={() => setScanning(true)}
          >
            <BarcodeIcon className="h-5 w-5" />
          </Button>
        </div>
        {/* Loud only when nothing matched — a partial match ("gar" → garlic) is usually the answer. */}
        {q && !exact && (
          <Button type="submit" full variant={shown.length ? 'ghost' : 'secondary'} disabled={busy}>
            <PlusIcon className="h-5 w-5" />
            Add “{query.trim()}” — we have it
          </Button>
        )}
      </form>

      {items === null ? (
        <p className="py-6 text-center text-[0.9375rem] text-muted">Loading…</p>
      ) : all.length === 0 ? (
        <EmptyState>
          Nothing here yet. Tap <span className="font-medium text-ink">Done shopping</span> in{' '}
          <Link to="/grocery-list" className="font-medium text-accent">
            Groceries
          </Link>{' '}
          and what you bought lands here — or add things above.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>Not in the cupboard.</EmptyState>
      ) : (
        groups.map(({ category, items: rows }) => (
          <Card key={category?.id ?? 'unsorted'} title={category?.name ?? 'Unsorted'}>
            <ul className="inset-rows">
              {rows.map((item) => {
                const detail = [item.staple && 'Always have', item.onList && 'On the list'].filter(Boolean).join(' · ');
                return (
                  <li key={item.id}>
                    <SwipeRow
                      actions={[
                        { label: 'Buy again', tone: 'accent', onAction: () => buyAgain(item) },
                        { label: 'Remove', tone: 'danger', onAction: () => remove(item) },
                      ]}
                    >
                      <div className="flex items-center gap-2 py-2">
                        <button
                          type="button"
                          onClick={() => setEditing(item)}
                          className="flex min-h-touch min-w-0 flex-1 flex-col justify-center text-left transition-colors active:bg-elevated/60"
                          aria-label={`Edit ${item.name}`}
                        >
                          <span className="block truncate">{item.name}</span>
                          {detail && <span className="block truncate text-[0.8125rem] text-muted">{detail}</span>}
                        </button>
                        {item.quantity != null ? (
                          <QuantityStepper
                            quantity={item.quantity}
                            unit={item.unit}
                            onAdjust={(delta) => adjustQuantity(item, delta)}
                          />
                        ) : (
                          // "Always have" means it is never low, so there is nothing to toggle.
                          !item.staple && <HaveOrLow low={item.runningLow} onChange={(v) => setRunningLow(item, v)} />
                        )}
                        {/*
                          * Swiping needs a finger, so a wide screen with a mouse gets the actions as buttons too.
                          * (A narrow window can still drag a row with the mouse; there is no room for both.)
                          */}
                        <span className="hidden items-center sm:[@media(hover:hover)]:flex">
                          <Button size="sm" variant="ghost" onClick={() => buyAgain(item)}>
                            Buy again
                          </Button>
                          <Button size="sm" variant="ghost" className="text-danger" onClick={() => remove(item)}>
                            Remove
                          </Button>
                        </span>
                      </div>
                    </SwipeRow>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}

      {all.length > 0 && (
        <p className="px-1 text-[0.8125rem] text-subtle">
          Swipe an item left to buy it again or remove it. Tap it to edit.
        </p>
      )}

      {scanning && activeHouseholdId && (
        <ScanToCupboard
          householdId={activeHouseholdId}
          items={all}
          onAdded={replace}
          onClose={() => setScanning(false)}
        />
      )}

      {editing && (
        <EditItemSheet
          householdId={activeHouseholdId}
          item={editing}
          categories={groceryCategories}
          onClose={() => setEditing(null)}
          onRemove={() => remove(editing)}
          onSaved={(updated) => {
            // A rename into something already here merges the two, so the old row may be gone.
            setItems((prev) =>
              [...(prev ?? []).filter((i) => i.id !== editing.id && i.id !== updated.id), updated].sort(byName),
            );
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** An exact count instead of Have/Low — tap +/- to adjust without opening the editor. */
function QuantityStepper({
  quantity,
  unit,
  onAdjust,
}: {
  quantity: number;
  unit: string | null;
  onAdjust: (delta: number) => void;
}) {
  // Trims "3.00" down to "3", but keeps "2.5" as written.
  const shown = Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 100) / 100);
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-[9px] bg-elevated px-1 py-0.5" role="group" aria-label="Amount on hand">
      <button
        type="button"
        aria-label="One less"
        onClick={() => onAdjust(-1)}
        className="flex h-7 w-7 items-center justify-center rounded-[7px] text-base font-semibold text-muted active:bg-surface"
      >
        −
      </button>
      <span className="min-w-[2.5rem] text-center text-[0.8125rem] font-semibold tabular-nums">
        {shown}
        {unit ? ` ${unit}` : ''}
      </span>
      <button
        type="button"
        aria-label="One more"
        onClick={() => onAdjust(1)}
        className="flex h-7 w-7 items-center justify-center rounded-[7px] text-base font-semibold text-muted active:bg-surface"
      >
        +
      </button>
    </div>
  );
}

/** How much is left, in the two answers that stay true without anyone counting. */
function HaveOrLow({ low, onChange }: { low: boolean; onChange: (low: boolean) => void }) {
  return (
    <div className="flex shrink-0 rounded-[9px] bg-elevated p-0.5" role="group" aria-label="How much is left">
      {[false, true].map((isLow) => (
        <button
          key={String(isLow)}
          type="button"
          aria-pressed={low === isLow}
          onClick={() => onChange(isLow)}
          className={cx(
            'h-7 rounded-[7px] px-3 text-[0.8125rem] font-semibold transition-all duration-150',
            low === isLow ? 'bg-surface shadow-sm ' + (isLow ? 'text-accent' : 'text-success') : 'text-muted',
          )}
        >
          {isLow ? 'Low' : 'Have'}
        </button>
      ))}
    </div>
  );
}

/**
 * Everything about one item in one place: its name, its aisle, and whether you always have it.
 * Renaming it to something already in the cupboard merges the two rather than keeping both.
 */
function EditItemSheet({
  householdId,
  item,
  categories,
  onSaved,
  onRemove,
  onClose,
}: {
  householdId: string;
  item: CupboardItem;
  categories: GroceryCategory[];
  onSaved: (updated: CupboardItem) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState(item.categoryId ?? categories[0]?.id ?? '');
  const [staple, setStaple] = useState(item.staple);
  const [trackQuantity, setTrackQuantity] = useState(item.quantity != null);
  const [quantity, setQuantity] = useState(item.quantity ?? 1);
  const [unit, setUnit] = useState(item.unit ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renamed = name.trim() !== item.name;
  const quantityModeChanged = trackQuantity !== (item.quantity != null);
  const quantityValueChanged = trackQuantity && (quantity !== (item.quantity ?? quantity) || unit !== (item.unit ?? ''));
  const changed = renamed || categoryId !== item.categoryId || staple !== item.staple
    || quantityModeChanged || quantityValueChanged;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !changed) return;
    setBusy(true);
    setError(null);
    try {
      let updated = item;
      if (renamed || staple !== item.staple || quantityModeChanged || quantityValueChanged) {
        updated = await api<CupboardItem>('PATCH', `/api/households/${householdId}/cupboard/${item.id}`, {
          name: renamed ? name.trim() : null,
          staple: staple !== item.staple ? staple : null,
          trackQuantity: quantityModeChanged ? trackQuantity : null,
          quantity: trackQuantity && (quantityModeChanged || quantityValueChanged) ? quantity : null,
          unit: trackQuantity ? unit.trim() || null : null,
        });
      }
      // The aisle belongs to the ingredient — the new one, after a rename — so it goes last.
      if (categoryId !== item.categoryId) {
        await api('PUT', `/api/households/${householdId}/ingredients/${updated.ingredientId}/category`, { categoryId });
        updated = { ...updated, categoryId, sorted: true };
      }
      onSaved(updated);
    } catch (err) {
      const message = err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null;
      setError(message ?? 'Could not save that.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Edit ${item.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Aisle">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {!categoryId && (
              <option value="" disabled>
                Unsorted
              </option>
            )}
            {[...categories]
              .sort((a, b) => a.position - b.position)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <button
          type="button"
          aria-pressed={staple}
          onClick={() => setStaple((v) => !v)}
          className="flex w-full items-start gap-3 text-left"
        >
          <CheckCircle checked={staple} className="mt-0.5" />
          <span>
            <span className="block font-medium">Always have</span>
            <span className="block text-[0.8125rem] text-muted">For things like salt and oil — planned meals leave them off Groceries.</span>
          </span>
        </button>
        <button
          type="button"
          aria-pressed={trackQuantity}
          onClick={() => setTrackQuantity((v) => !v)}
          className="flex w-full items-start gap-3 text-left"
        >
          <CheckCircle checked={trackQuantity} className="mt-0.5" />
          <span>
            <span className="block font-medium">Track an exact amount</span>
            <span className="block text-[0.8125rem] text-muted">
              A count instead of Have/Low — "3 cans", say.
            </span>
          </span>
        </button>
        {trackQuantity && (
          <Field label="Amount">
            <div className="flex gap-2">
              <NumberInput
                className="w-20"
                min={0}
                value={quantity}
                onChange={(v) => setQuantity(v ?? 0)}
                aria-label="Amount"
              />
              <UnitInput className="flex-1" value={unit} onChange={setUnit} aria-label="Unit" />
            </div>
          </Field>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={busy || !name.trim() || !changed}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={onRemove}>
            Remove
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
