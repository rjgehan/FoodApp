import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { CupboardItem, StoreSection } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useOnResume } from '../utils/useOnResume';
import { DEFAULT_SECTION_ORDER, groupBySection, STORE_SECTION_LABELS } from '../utils/storeSections';
import { Button, Card, CheckCircle, cx, EmptyState, ErrorText, Field, Input, Select, Sheet } from '../components/ui';
import { PlusIcon } from '../components/icons';

function byName(a: CupboardItem, b: CupboardItem) {
  return a.name.localeCompare(b.name);
}

/**
 * What is in the house, so you can check without going to look. Filled mostly by "Done
 * shopping" on the grocery list; the search box doubles as the way to add something by hand.
 *
 * Every row says the same four things. Have and Low are how much is left, for whoever checks.
 * Remove and Buy again are for when it is used up — most of the time it just goes, and when you
 * want another, Buy again moves it to the grocery list. Nothing here adds to the list by itself,
 * and nothing asks a follow-up question. Tapping an item opens it for editing.
 */
export default function CupboardPage() {
  const { activeHouseholdId, activeHousehold } = useHousehold();
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
  const groups = groupBySection(shown, activeHousehold?.storeSectionOrder ?? DEFAULT_SECTION_ORDER);
  const low = all.filter((i) => i.runningLow).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold leading-tight">Cupboard</h1>
        <p className="text-muted">
          {all.length === 0
            ? 'What’s in the house.'
            : [`${all.length} ${all.length === 1 ? 'thing' : 'things'}`, low && `${low} running low`]
                .filter(Boolean)
                .join(' · ')}
        </p>
      </div>

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
        <p className="py-6 text-center text-sm text-muted">Loading…</p>
      ) : all.length === 0 ? (
        <Card>
          <EmptyState>
            Nothing here yet. Tap <span className="font-medium text-ink">Done shopping</span> on the{' '}
            <Link to="/grocery-list" className="font-medium text-accent underline">
              grocery list
            </Link>{' '}
            and what you bought lands here — or add things above.
          </EmptyState>
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState>Not in the cupboard.</EmptyState>
        </Card>
      ) : (
        groups.map(({ section, items: rows }) => (
          <Card key={section} title={STORE_SECTION_LABELS[section]}>
            <ul className="divide-y divide-line">
              {rows.map((item) => {
                const detail = [item.staple && 'Always have', item.onList && 'On the list'].filter(Boolean).join(' · ');
                return (
                  <li key={item.id} className="py-2.5">
                    {/* Name above the buttons on a phone, beside them once there is room. */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => setEditing(item)}
                        className="min-w-0 flex-1 text-left"
                        aria-label={`Edit ${item.name}`}
                      >
                        <span className="block truncate font-medium">{item.name}</span>
                        {detail && <span className="block truncate text-sm text-muted">{detail}</span>}
                      </button>
                      <div className="flex flex-wrap items-center gap-1">
                        <HaveOrLow low={item.runningLow} onChange={(v) => setRunningLow(item, v)} />
                        <Button size="sm" variant="ghost" onClick={() => remove(item)} aria-label={`Remove ${item.name}`}>
                          Remove
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => buyAgain(item)}
                          aria-label={`Buy ${item.name} again — moves it to the grocery list`}
                        >
                          Buy again
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}

      {all.length > 0 && (
        <p className="px-1 text-sm text-muted">
          Tap an item to rename it, move it to another aisle, or mark it “Always have”. Used something up? Remove
          takes it out; Buy again takes it out and puts it on the grocery list.
        </p>
      )}

      {editing && (
        <EditItemSheet
          householdId={activeHouseholdId}
          item={editing}
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
    <div className="flex shrink-0 rounded-xl bg-elevated p-0.5" role="group" aria-label="How much is left">
      {[false, true].map((isLow) => (
        <button
          key={String(isLow)}
          type="button"
          aria-pressed={low === isLow}
          onClick={() => onChange(isLow)}
          className={cx(
            'h-8 rounded-lg px-3 text-sm font-medium transition-colors',
            low === isLow ? (isLow ? 'bg-accent-soft text-accent' : 'bg-success-soft text-success') : 'text-muted',
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
  onSaved,
  onRemove,
  onClose,
}: {
  householdId: string;
  item: CupboardItem;
  onSaved: (updated: CupboardItem) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [section, setSection] = useState<StoreSection>(item.section);
  const [staple, setStaple] = useState(item.staple);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renamed = name.trim() !== item.name;
  const changed = renamed || section !== item.section || staple !== item.staple;

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
      if (section !== item.section) {
        await api('PUT', `/api/households/${householdId}/ingredients/${updated.ingredientId}/section`, { section });
        updated = { ...updated, section, sorted: true };
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
          <Select value={section} onChange={(e) => setSection(e.target.value as StoreSection)}>
            {DEFAULT_SECTION_ORDER.map((s) => (
              <option key={s} value={s}>
                {STORE_SECTION_LABELS[s]}
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
            <span className="block text-sm text-muted">For things like salt and oil — meals leave them off the grocery list.</span>
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
