import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { CupboardItem, StoreSection } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useOnResume } from '../utils/useOnResume';
import { DEFAULT_SECTION_ORDER, groupBySection, STORE_SECTION_LABELS } from '../utils/storeSections';
import { Button, Card, cx, EmptyState, Input, Select } from '../components/ui';
import { PlusIcon } from '../components/icons';

/**
 * What is in the house, so you can check without going to look. Filled mostly by "Done
 * shopping" on the grocery list; the search box doubles as the way to add something by hand.
 *
 * Every row says the same four things. Have and Low are how much is left, for whoever checks.
 * Remove and Buy again are for when it is used up — most of the time it just goes, and when you
 * want another, Buy again moves it to the grocery list. Nothing here adds to the list by itself,
 * and nothing asks a follow-up question.
 */
export default function CupboardPage() {
  const { activeHouseholdId, activeHousehold } = useHousehold();
  const [items, setItems] = useState<CupboardItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
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
        : [...list, updated].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  function drop(item: CupboardItem) {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    setOpen(null);
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

  async function setStaple(item: CupboardItem, staple: boolean) {
    replace({ ...item, staple });
    replace(
      await api<CupboardItem>('PATCH', `/api/households/${activeHouseholdId}/cupboard/${item.id}`, { staple }),
    );
  }

  async function move(item: CupboardItem, section: StoreSection) {
    replace({ ...item, section, sorted: true });
    await api('PUT', `/api/households/${activeHouseholdId}/ingredients/${item.ingredientId}/section`, { section });
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
          <Card key={section} title={STORE_SECTION_LABELS[section]} bodyClassName="px-4 pb-2">
            <ul className="divide-y divide-line">
              {rows.map((item) => {
                const expanded = open === item.id;
                const detail = [item.staple && 'Always have', item.onList && 'On the list'].filter(Boolean).join(' · ');
                return (
                  <li key={item.id} className="py-2.5">
                    {/* Name above the buttons on a phone, beside them once there is room. */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : item.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate font-medium">{item.name}</span>
                        {detail && <span className="block truncate text-sm text-muted">{detail}</span>}
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <HaveOrLow low={item.runningLow} onChange={(v) => setRunningLow(item, v)} />
                        <Button size="sm" variant="secondary" onClick={() => remove(item)} aria-label={`Remove ${item.name}`}>
                          Remove
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => buyAgain(item)}
                          aria-label={`Buy ${item.name} again — moves it to the grocery list`}
                        >
                          Buy again
                        </Button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="space-y-2 pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant={item.staple ? 'primary' : 'secondary'}
                            onClick={() => setStaple(item, !item.staple)}
                            aria-pressed={item.staple}
                          >
                            Always have
                          </Button>
                          <Select
                            className="h-9 w-40 text-sm"
                            value={item.section}
                            onChange={(e) => move(item, e.target.value as StoreSection)}
                            aria-label={`Aisle for ${item.name}`}
                          >
                            {DEFAULT_SECTION_ORDER.map((s) => (
                              <option key={s} value={s}>
                                {STORE_SECTION_LABELS[s]}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <p className="text-xs text-muted">
                          “Always have” is for things like salt and oil — meals leave them off the grocery list.
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}

      {all.length > 0 && (
        <p className="px-1 text-sm text-muted">
          Used something up? Remove takes it out. Buy again takes it out and puts it on the grocery list.
        </p>
      )}
    </div>
  );
}

/** How much is left, in the two answers that stay true without anyone counting. */
function HaveOrLow({ low, onChange }: { low: boolean; onChange: (low: boolean) => void }) {
  return (
    <div className="flex shrink-0 rounded-xl border border-line p-0.5" role="group" aria-label="How much is left">
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
