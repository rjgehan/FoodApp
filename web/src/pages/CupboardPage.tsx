import { useCallback, useEffect, useState, type FormEvent } from 'react';
import NoHousehold from '../components/NoHousehold';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { CupboardItem } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useOnResume } from '../utils/useOnResume';
import { groupByCategory } from '../utils/storeSections';
import { ActionMenu, Button, Chip, EmptyState, IconButton, SearchField, SectionLabel, Tile } from '../components/ui';
import { Icon } from '../components/icons';
import { PageTitle } from '../components/PageTitle';
import { toast } from '../components/toast';
import ScanToCupboard from '../components/ScanToCupboard';
import StartCupboardSheet from '../components/StartCupboardSheet';
import CopyCupboardSheet from '../components/CopyCupboardSheet';
import { useRestockReminders } from '../components/Restock';
import { CupboardRow } from '../components/cupboard/CupboardParts';
import CupboardItemSheet from '../components/cupboard/CupboardItemSheet';

type Filter = 'all' | 'low' | 'always' | 'reminders';

function byName(a: CupboardItem, b: CupboardItem) {
  return a.name.localeCompare(b.name);
}

/**
 * What is in the house, so you can check without going to look (mockup 4.5). Filled mostly by
 * "Done shopping" on the grocery list. One box does both jobs: type to see whether you have
 * something, and if you don't, it offers to add it (4.6). The chips narrow it to what is low,
 * what you always have, or what has a restock reminder.
 *
 * Each row shows the one thing you check at a glance — Have or Low, or an exact count — and keeps
 * the rest a swipe away. Tapping an item opens it for editing.
 */
export default function CupboardPage() {
  const { activeHouseholdId, activeHousehold, households, groceryCategories } = useHousehold();
  const [params] = useSearchParams();
  const [items, setItems] = useState<CupboardItem[] | null>(null);
  // Arriving from a grocery item's sheet looks that item up straight away.
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<CupboardItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState<'starters' | 'copy' | null>(null);
  const restock = useRestockReminders(activeHouseholdId);

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
    return <NoHousehold />;
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

  async function add(e?: FormEvent) {
    e?.preventDefault();
    const name = query.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      replace(await api<CupboardItem>('POST', `/api/households/${activeHouseholdId}/cupboard`, { name }));
      setQuery('');
      toast(`Added ${name} to the cupboard.`, { icon: 'check' });
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
    toast(`${item.name} is on the list.`, { icon: 'cart' });
  }

  const all = items ?? [];
  const q = query.trim().toLowerCase();
  const counts = {
    low: all.filter((i) => i.runningLow && !i.staple).length,
    always: all.filter((i) => i.staple).length,
    reminders: all.filter((i) => restock.reminders.has(i.ingredientId)).length,
  };
  const filtered = all.filter((i) =>
    filter === 'low'
      ? i.runningLow && !i.staple
      : filter === 'always'
        ? i.staple
        : filter === 'reminders'
          ? restock.reminders.has(i.ingredientId)
          : true,
  );
  // A search looks through the whole cupboard, whichever chip is on: "do we have…?" means anywhere.
  const shown = q ? all.filter((i) => i.name.toLowerCase().includes(q)) : filtered;
  const exact = all.some((i) => i.name.toLowerCase() === q);
  const groups = groupByCategory(shown, groceryCategories);
  const otherHouseholds = households.filter((h) => h.id !== activeHouseholdId);

  return (
    <div className="space-y-3.5">
      <PageTitle title="Cupboard">
        <ActionMenu
          label="Cupboard options"
          shape="round"
          items={[
            { label: 'Start with the basics…', onSelect: () => setFilling('starters') },
            // Only for somebody with a second house to fill, which is almost nobody — so it is
            // not even offered otherwise.
            otherHouseholds.length > 0 && { label: 'Copy from another household…', onSelect: () => setFilling('copy') },
          ]}
        />
        {/* The camera answers "do we have this?" without the typing — the question that matters
            when you are standing in a shop holding the tin. */}
        <IconButton label="Scan a barcode" shape="round" onClick={() => setScanning(true)}>
          <Icon name="barcode" size={18} />
        </IconButton>
      </PageTitle>

      <form onSubmit={add}>
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or add to cupboard"
          aria-label="Search the cupboard, or add something"
          enterKeyHint="search"
          className="!h-[2.625rem]"
          end={
            query && (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => setQuery('')}
                className="press -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted"
              >
                <Icon name="x" size={15} strokeWidth={2.4} />
              </button>
            )
          }
        />
      </form>

      {!q && all.length > 0 && (
        // Bleeds to the screen's edges so the last chip scrolls out of sight rather than wrapping.
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] md:-mx-0 md:px-0">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All · {all.length}
          </Chip>
          <Chip active={filter === 'low'} onClick={() => setFilter('low')}>
            Low · {counts.low}
          </Chip>
          <Chip active={filter === 'always'} onClick={() => setFilter('always')}>
            Always have · {counts.always}
          </Chip>
          <Chip active={filter === 'reminders'} onClick={() => setFilter('reminders')}>
            Reminders{counts.reminders ? ` · ${counts.reminders}` : ''}
          </Chip>
        </div>
      )}

      {q && !exact && (
        // The search missed (or only nearly hit): the box offers to add what was typed.
        <div className="dash flex items-center gap-3 p-3.5">
          <Tile icon="plus" tone="accent" size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-semibold">Add “{query.trim()}”</p>
            <p className="text-xs text-muted">Not in the cupboard yet</p>
          </div>
          <Button size="sm" disabled={busy} onClick={() => add()}>
            Add
          </Button>
        </div>
      )}

      {items === null ? (
        <p className="py-6 text-center text-[0.9375rem] text-muted">Loading…</p>
      ) : all.length === 0 ? (
        !q && (
          <div>
            <EmptyState>
              Nothing here yet. Tap <span className="font-medium text-ink">Done shopping</span> in{' '}
              <Link to="/grocery-list" className="font-medium text-accent-ink">
                Groceries
              </Link>{' '}
              and what you bought lands here — or add things above.
            </EmptyState>
            {/* A new house's cupboard is the one that is empty, and ticking a list beats typing it. */}
            <div className="-mt-2 flex justify-center">
              <Button variant="secondary" onClick={() => setFilling('starters')}>
                Start with the basics
              </Button>
            </div>
          </div>
        )
      ) : shown.length === 0 ? (
        !q && <EmptyState>{filter === 'low' ? 'Nothing is running low.' : 'Nothing here.'}</EmptyState>
      ) : (
        <div className="gap-x-5 lg:columns-2">
          {q && !exact && <SectionLabel className="!px-0.5">Similar</SectionLabel>}
          {groups.map(({ category, items: rows }) => (
            <section key={category?.id ?? 'unsorted'} className="break-inside-avoid pb-3.5">
              {!(q && !exact) && (
                <SectionLabel className="!pb-1.5 !pt-1 !text-xs !font-bold">{category?.name ?? 'Unsorted'}</SectionLabel>
              )}
              <ul className="card card-rows inset-rows">
                {rows.map((item) => (
                  <li key={item.id}>
                    <CupboardRow
                      item={item}
                      reminder={restock.reminders.get(item.ingredientId)}
                      onEdit={() => setEditing(item)}
                      onLow={(low) => setRunningLow(item, low)}
                      onAdjust={(delta) => adjustQuantity(item, delta)}
                      onBuyAgain={() => buyAgain(item)}
                      onRemove={() => remove(item)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {all.length > 0 && !q && (
        <p className="px-1 text-[0.8125rem] text-faint">
          Swipe an item left to buy it again or remove it. Tap it to edit.
        </p>
      )}

      {scanning && (
        <ScanToCupboard
          householdId={activeHouseholdId}
          items={all}
          onAdded={replace}
          onClose={() => setScanning(false)}
        />
      )}

      {filling === 'starters' && (
        <StartCupboardSheet
          householdId={activeHouseholdId}
          onAdded={(added) => {
            toast(added === 0 ? 'All of those were here already.' : `Added ${added} to the cupboard.`, { duration: 5000 });
            load().catch(() => {});
          }}
          onClose={() => setFilling(null)}
        />
      )}

      {filling === 'copy' && (
        <CopyCupboardSheet
          householdId={activeHouseholdId}
          householdName={activeHousehold?.name ?? 'this household'}
          others={otherHouseholds}
          items={all}
          onCopied={(copied, skipped) => {
            toast(
              `Copied ${copied} ${copied === 1 ? 'item' : 'items'}` +
                (skipped ? `; ${skipped} ${skipped === 1 ? 'was' : 'were'} already here.` : '.'),
              { duration: 5000 },
            );
            load().catch(() => {});
          }}
          onClose={() => setFilling(null)}
        />
      )}

      {editing && (
        <CupboardItemSheet
          householdId={activeHouseholdId}
          item={editing}
          others={all}
          categories={groceryCategories}
          reminder={restock.reminders.get(editing.ingredientId) ?? null}
          onClose={() => setEditing(null)}
          onRemove={() => remove(editing)}
          onSaved={(updated) => {
            // A rename takes its reminder along to the new name, and may have changed it too.
            restock.reload().catch(() => {});
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
