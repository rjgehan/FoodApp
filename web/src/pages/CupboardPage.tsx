import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { CupboardItem, GroceryCategory } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useOnResume } from '../utils/useOnResume';
import { groupByCategory } from '../utils/storeSections';
import { Button, Card, CheckCircle, cx, EmptyState, ErrorText, Field, Input, Select, Sheet } from '../components/ui';
import { PlusIcon } from '../components/icons';
import { PageTitle } from '../components/PageTitle';
import SwipeRow from '../components/SwipeRow';

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

      {/* One box: type to check whether you have something, and if you don't, add it. */}
      <form onSubmit={add} className="space-y-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Do we have… ?"
          aria-label="Search the cupboard, or add something"
        />
        {q && !exact && (
          <Button type="submit" full variant="secondary" disabled={busy}>
            <PlusIcon className="h-5 w-5" />
            Add “{query.trim()}” — we have it
          </Button>
        )}
      </form>

      {items === null ? (
        <p className="py-6 text-center text-[0.9375rem] text-muted">Loading…</p>
      ) : all.length === 0 ? (
        <EmptyState>
          Nothing here yet. Tap <span className="font-medium text-ink">Done shopping</span> on the{' '}
          <Link to="/grocery-list" className="font-medium text-accent">
            grocery list
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
                        <HaveOrLow low={item.runningLow} onChange={(v) => setRunningLow(item, v)} />
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
          Swipe an item left to buy it again or remove it — all the way across removes it. Tap it to rename it, move
          it to another aisle, or mark it “Always have”.
        </p>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renamed = name.trim() !== item.name;
  const changed = renamed || categoryId !== item.categoryId || staple !== item.staple;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !changed) return;
    setBusy(true);
    setError(null);
    try {
      let updated = item;
      if (renamed || staple !== item.staple) {
        updated = await api<CupboardItem>('PATCH', `/api/households/${householdId}/cupboard/${item.id}`, {
          name: renamed ? name.trim() : null,
          staple: staple !== item.staple ? staple : null,
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
            <span className="block text-[0.8125rem] text-muted">For things like salt and oil — meals leave them off the grocery list.</span>
          </span>
        </button>
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
