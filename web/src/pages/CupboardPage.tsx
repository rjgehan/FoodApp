import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { CupboardItem, StockStatus, StoreSection } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useOnResume } from '../utils/useOnResume';
import { DEFAULT_SECTION_ORDER, groupBySection, STORE_SECTION_LABELS } from '../utils/storeSections';
import { Button, Card, cx, EmptyState, IconButton, Input, Select } from '../components/ui';
import { PlusIcon, TrashIcon } from '../components/icons';

const STATUSES: { value: StockStatus; label: string; active: string }[] = [
  { value: 'HAVE', label: 'Have', active: 'bg-success-soft text-success' },
  { value: 'LOW', label: 'Low', active: 'bg-accent-soft text-accent' },
  { value: 'OUT', label: 'Out', active: 'bg-danger-soft text-danger' },
];

/**
 * What is in the house, so you can check without going to look. Filled mostly by "Done
 * shopping" on the grocery list; the search box doubles as the way to add something by hand.
 */
export default function CupboardPage() {
  const { activeHouseholdId, activeHousehold } = useHousehold();
  const [items, setItems] = useState<CupboardItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3000);
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

  async function setStatus(item: CupboardItem, status: StockStatus) {
    if (item.status === status) return;
    replace({ ...item, status });
    const updated = await api<CupboardItem>('PATCH', `/api/households/${activeHouseholdId}/cupboard/${item.id}`, {
      status,
    });
    replace(updated);
    // Said out loud, because a change on this page landing on another one is otherwise invisible.
    if (status !== 'HAVE' && !item.onList) flash(`${item.name} is on the grocery list.`);
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

  async function remove(item: CupboardItem) {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    setOpen(null);
    await api('DELETE', `/api/households/${activeHouseholdId}/cupboard/${item.id}`);
  }

  const all = items ?? [];
  const q = query.trim().toLowerCase();
  const shown = all.filter((i) => !q || i.name.toLowerCase().includes(q));
  const exact = all.some((i) => i.name.toLowerCase() === q);
  const groups = groupBySection(shown, activeHousehold?.storeSectionOrder ?? DEFAULT_SECTION_ORDER);
  const low = all.filter((i) => i.status === 'LOW').length;
  const out = all.filter((i) => i.status === 'OUT').length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold leading-tight">Cupboard</h1>
        <p className="text-muted">
          {all.length === 0
            ? 'What’s in the house.'
            : [`${all.length} ${all.length === 1 ? 'thing' : 'things'}`, low && `${low} running low`, out && `${out} out`]
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

      {notice && (
        <div className="rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">{notice}</div>
      )}

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
                  <li key={item.id} className="py-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : item.id)}
                        className="flex min-h-touch min-w-0 flex-1 flex-col justify-center text-left"
                      >
                        <span className={cx('block truncate font-medium', item.status === 'OUT' && 'text-muted')}>
                          {item.name}
                        </span>
                        {detail && <span className="block truncate text-sm text-muted">{detail}</span>}
                      </button>
                      <StatusPicker value={item.status} onChange={(s) => setStatus(item, s)} />
                    </div>

                    {expanded && (
                      <div className="space-y-2 pb-2 pt-1">
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
                          <IconButton label={`Remove ${item.name}`} onClick={() => remove(item)}>
                            <TrashIcon className="h-5 w-5" />
                          </IconButton>
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
    </div>
  );
}

/** Three states and one tap each. A count would be wrong within a week; these stay true. */
function StatusPicker({ value, onChange }: { value: StockStatus; onChange: (status: StockStatus) => void }) {
  return (
    <div className="flex shrink-0 rounded-xl border border-line p-0.5" role="group" aria-label="How much is left">
      {STATUSES.map((s) => (
        <button
          key={s.value}
          type="button"
          aria-pressed={value === s.value}
          onClick={() => onChange(s.value)}
          className={cx(
            'h-9 rounded-lg px-2.5 text-sm font-medium transition-colors',
            value === s.value ? s.active : 'text-muted',
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
