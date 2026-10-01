import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import NoHousehold from '../components/NoHousehold';
import { Link } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { absoluteUrl, api, ApiError, getToken } from '../api/client';
import type { CupboardItem, GroceryListEvent, GroceryListItem as Item } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useOnResume } from '../utils/useOnResume';
import { useAiAvailable } from '../utils/useAiAvailable';
import { splitAmount } from '../utils/amount';
import { groupByCategory } from '../utils/storeSections';
import { copyText, listAsText } from '../utils/exportList';
import { Button, EmptyState, ErrorText, NoteBox, SectionLabel, Sheet } from '../components/ui';
import { Icon } from '../components/icons';
import { PageTitle } from '../components/PageTitle';
import { toast } from '../components/toast';
import { useRestockReminders } from '../components/Restock';
import { everyLabel } from '../utils/restock';
import GroceriesMenu from '../components/groceries/GroceriesMenu';
import GroceryRow from '../components/groceries/GroceryRow';
import GroceryItemSheet from '../components/groceries/GroceryItemSheet';
import DoneShoppingSheet from '../components/groceries/DoneShoppingSheet';

/* Separators start where the text does: 14px padding + 24px circle + 12px gap. */
const ROW_INSET = { '--row-inset': '50px' } as CSSProperties;

/**
 * The shared list (mockup 4.1): one box to add to it, then everything grouped by aisle in the
 * order the household walks the store, each aisle with its count. Ticked things stay where they
 * are, struck through at the bottom of their aisle, until Done shopping takes them off — so
 * nothing jumps away from under a thumb mid-shop, and a second person can see what is already in
 * the basket. Live: a tick on one phone shows on every other one.
 */
export default function GroceryListPage() {
  const { activeHouseholdId, groceryCategories } = useHousehold();
  const aiAvailable = useAiAvailable();
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  // What the cupboard holds, by ingredient, for "Cupboard says you have 1" and the item sheet.
  const [cupboard, setCupboard] = useState<Map<string, CupboardItem>>(() => new Map());
  const [sheet, setSheet] = useState<'sort' | 'done' | null>(null);
  // Set only when the clipboard refused, so the text can be copied by hand instead.
  const [exported, setExported] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  // The item whose sheet is open, by id, so a live update to it shows in the sheet too.
  const [openId, setOpenId] = useState<string | null>(null);
  const restock = useRestockReminders(activeHouseholdId);

  const clientRef = useRef<Client | null>(null);

  const refreshItems = useCallback(async () => {
    if (!activeHouseholdId) return;
    setItems(await api<Item[]>('GET', `/api/households/${activeHouseholdId}/grocery-list`));
    setLoaded(true);
  }, [activeHouseholdId]);

  const refreshCupboard = useCallback(async () => {
    if (!activeHouseholdId) return;
    const list = await api<CupboardItem[]>('GET', `/api/households/${activeHouseholdId}/cupboard`);
    setCupboard(new Map(list.map((c) => [c.ingredientId, c])));
  }, [activeHouseholdId]);

  useEffect(() => {
    refreshItems();
    refreshCupboard().catch(() => {});
  }, [refreshItems, refreshCupboard]);

  useOnResume(() => {
    refreshItems().catch(() => {});
    refreshCupboard().catch(() => {});
  });

  // Realtime: connect once per household and keep the socket open while this page mounts.
  useEffect(() => {
    if (!activeHouseholdId) return;
    if (!getToken()) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(absoluteUrl('/ws')),
      // Read at every connect rather than once: the token is swapped for a fresh one daily, and a
      // reconnect hours later must not present the old one.
      beforeConnect: () => {
        client.connectHeaders = { Authorization: `Bearer ${getToken()}` };
      },
      reconnectDelay: 3000,
      onConnect: () => {
        // Nothing is replayed after a drop, so whatever changed while the socket was down —
        // a phone asleep in a pocket — has to be fetched. Subscribe first, then fetch: fetching
        // first left a gap where a tick from another phone was in neither.
        client.subscribe(`/topic/households/${activeHouseholdId}/grocery-list`, (message) => {
          const event = JSON.parse(message.body) as GroceryListEvent;
          if (event.type === 'REMOVED') {
            setItems((prev) => prev.filter((i) => i.id !== event.removedItemId));
          } else {
            setItems((prev) => {
              const exists = prev.some((i) => i.id === event.item.id);
              return exists ? prev.map((i) => (i.id === event.item.id ? event.item : i)) : [...prev, event.item];
            });
          }
        });
        refreshItems().catch(() => {});
        setConnected(true);
      },
      onDisconnect: () => setConnected(false),
      onWebSocketClose: () => setConnected(false),
    });
    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
      clientRef.current = null;
      setConnected(false);
    };
  }, [activeHouseholdId, refreshItems]);

  /*
   * The list as plain lines, in aisle order, ready to paste. Built from what is already on
   * screen and copied in the same tick as the tap: an await before the copy loses the user
   * gesture that Safari requires.
   */
  async function copyForNotes() {
    const lines = listAsText(groupByCategory(items.filter((i) => !i.checked), groceryCategories).flatMap((g) => g.items));
    if (!lines) {
      toast('Nothing left to buy.');
      return;
    }
    const count = lines.split('\n').length;
    if (await copyText(lines)) {
      toast(
        `Copied ${count} ${count === 1 ? 'item' : 'items'}. In Notes: paste, select the lines, then tap ✓ to turn them into checkboxes.`,
        { icon: 'check', duration: 5000 },
      );
    } else {
      setExported(lines);
    }
  }

  /** One box: "2 lb chicken" becomes 2, lb, chicken; "milk" is just milk. */
  async function onAddItem(e: FormEvent) {
    e.preventDefault();
    if (!activeHouseholdId || !draft.trim() || adding) return;
    const { quantity, unit, name } = splitAmount(draft);
    setAdding(true);
    try {
      await api('POST', `/api/households/${activeHouseholdId}/grocery-list/items`, {
        ingredientName: name,
        quantity,
        unit,
      });
      setDraft('');
      await refreshItems();
    } finally {
      setAdding(false);
    }
  }

  async function toggleItem(item: Item) {
    if (!activeHouseholdId) return;
    // Optimistic update — the WS push will reconcile shortly after.
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, checked: !item.checked } : i)));
    await api('PATCH', `/api/households/${activeHouseholdId}/grocery-list/items/${item.id}`, {
      checked: !item.checked,
    });
  }

  async function removeItem(itemId: string) {
    if (!activeHouseholdId) return;
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    await api('DELETE', `/api/households/${activeHouseholdId}/grocery-list/items/${itemId}`);
  }

  /** The category belongs to the ingredient, so every row of it moves — and stays moved next time. */
  async function moveItem(item: Item, categoryId: string) {
    if (!activeHouseholdId || !item.ingredientId) return;
    setItems((prev) =>
      prev.map((i) => (i.ingredientId === item.ingredientId ? { ...i, categoryId, sorted: true } : i)),
    );
    await api('PUT', `/api/households/${activeHouseholdId}/ingredients/${item.ingredientId}/category`, { categoryId });
  }

  if (!activeHouseholdId) {
    return <NoHousehold />;
  }

  const ticked = items.filter((i) => i.checked);
  // Within an aisle, what is still to buy comes first and the basket sinks to the bottom.
  const ordered = [...items.filter((i) => !i.checked), ...ticked];
  const groups = groupByCategory(ordered, groceryCategories);
  const unsorted = new Set(items.filter((i) => !i.sorted && i.ingredientId).map((i) => i.ingredientId)).size;
  const open = openId ? items.find((i) => i.id === openId) : undefined;

  return (
    <div className="space-y-3.5">
      <PageTitle title="Groceries">
        {/* Ticking things off is the job here; the rest waits behind •••. */}
        <GroceriesMenu
          label="List options"
          items={[
            { label: 'Copy for Notes', detail: 'Plain text in aisle order', icon: 'copy', onSelect: copyForNotes },
            aiAvailable && {
              label: 'Sort into aisles',
              detail: unsorted
                ? `${unsorted} ${unsorted === 1 ? 'item has' : 'items have'} no aisle yet`
                : 'Everything has an aisle',
              icon: 'sparkles',
              disabled: unsorted === 0,
              onSelect: () => setSheet('sort'),
            },
            {
              label: 'Done shopping',
              detail: ticked.length ? `${ticked.length} ticked ${ticked.length === 1 ? 'item' : 'items'}` : 'Nothing ticked yet',
              icon: 'check',
              disabled: ticked.length === 0,
              onSelect: () => setSheet('done'),
            },
          ]}
        />
      </PageTitle>

      {/* Only worth mentioning when it is not working. */}
      {loaded && !connected && (
        <NoteBox tone="mustard" icon="cloudOff">
          You're offline, so changes from others may be missing.
        </NoteBox>
      )}

      <form onSubmit={onAddItem}>
        <label className="flex h-12 items-center gap-2.5 rounded-field border border-line bg-surface pl-3.5 pr-1.5 transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-focus">
          <Icon name="plus" size={19} className="shrink-0 text-accent-ink" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder='Add an item, e.g. "2 lb chicken"'
            aria-label="Add to the list"
            enterKeyHint="done"
            className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-faint"
          />
          {draft.trim() && (
            <Button type="submit" size="sm" disabled={adding}>
              Add
            </Button>
          )}
        </label>
      </form>

      {!loaded ? null : items.length === 0 ? (
        <EmptyState>
          Nothing on the list. Add planned meals from{' '}
          <Link to="/meal-plan" className="font-medium text-accent-ink">
            Plan
          </Link>
          , or type something above.
        </EmptyState>
      ) : (
        // Two columns of aisles on a wide screen, rather than one long stretched list.
        <div className="gap-x-5 lg:columns-2">
          {groups.map(({ category, items: rows }) => (
            <section key={category?.id ?? 'unsorted'} className="break-inside-avoid pb-3.5">
              <SectionLabel end={rows.length} className="!pb-1.5 !text-xs !font-bold">
                {category?.name ?? 'Unsorted'}
              </SectionLabel>
              <ul className="card card-rows inset-rows" style={ROW_INSET}>
                {rows.map((item) => (
                  <li key={item.id}>
                    <GroceryRow
                      item={item}
                      reminder={item.ingredientId ? restock.reminders.get(item.ingredientId) : undefined}
                      stock={item.ingredientId ? cupboard.get(item.ingredientId) : undefined}
                      onToggle={() => toggleItem(item)}
                      onOpen={() => setOpenId(item.id)}
                      onRemove={() => removeItem(item.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {ticked.length > 0 && (
        <Button variant="secondary" size="lg" full icon="check" onClick={() => setSheet('done')}>
          Done shopping · {ticked.length} ticked
        </Button>
      )}

      {items.length > 0 && (
        <p className="px-1 pt-1 text-[0.8125rem] text-faint">
          Tap an item to tick it off.{' '}
          <span className="[@media(hover:hover)]:hidden">Swipe it left for its aisle and a reminder, or to remove it.</span>
          <span className="hidden [@media(hover:hover)]:inline">Its ••• has its aisle, a reminder, and Remove.</span>
        </p>
      )}

      {open && (
        <GroceryItemSheet
          householdId={activeHouseholdId}
          item={open}
          categories={groceryCategories}
          reminder={open.ingredientId ? restock.reminders.get(open.ingredientId) ?? null : null}
          stock={open.ingredientId ? cupboard.get(open.ingredientId) : undefined}
          onMove={(categoryId) => moveItem(open, categoryId)}
          onReminder={(reminder) => {
            restock.saved(open.ingredientId!, reminder);
            toast(
              reminder ? `We'll ask about ${open.name} ${everyLabel(reminder.everyDays)}.` : `No more reminders for ${open.name}.`,
            );
          }}
          onRemove={() => {
            setOpenId(null);
            removeItem(open.id);
          }}
          onClose={() => setOpenId(null)}
        />
      )}

      {exported !== null && (
        <Sheet title="Copy for Notes" onClose={() => setExported(null)}>
          <p className="text-[0.9375rem] text-muted">
            This browser would not let the app reach the clipboard. Select all of this and copy it,
            then in Notes paste, select the lines, and tap ✓ to turn them into checkboxes.
          </p>
          <textarea
            readOnly
            value={exported}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-3 h-64 w-full rounded-xl border border-line bg-surface p-3 font-mono text-[0.8125rem] text-ink"
          />
        </Sheet>
      )}

      {sheet === 'sort' && (
        <SortSheet
          householdId={activeHouseholdId}
          count={unsorted}
          onClose={() => setSheet(null)}
          onDone={async ({ sorted, left }) => {
            setSheet(null);
            await refreshItems();
            toast(
              (sorted ? `Sorted ${sorted} ${sorted === 1 ? 'item' : 'items'}.` : 'Nothing new to sort.') +
                (left ? ` ${left} couldn't be placed — swipe one left to pick its aisle.` : ''),
              { duration: 5000 },
            );
          }}
        />
      )}

      {sheet === 'done' && (
        <DoneShoppingSheet
          householdId={activeHouseholdId}
          items={ticked}
          onClose={() => setSheet(null)}
          onDone={(cleared, stocked) => {
            setSheet(null);
            setItems((prev) => prev.filter((i) => !cleared.includes(i.id)));
            refreshCupboard().catch(() => {});
            toast(stocked ? `Put ${stocked} ${stocked === 1 ? 'thing' : 'things'} in the cupboard.` : 'Cleared.', {
              icon: 'check',
            });
          }}
        />
      )}
    </div>
  );
}

/**
 * The one place the app spends an AI request, so it asks first. The key allows twenty a day — and
 * sorting a half-written list means paying again for whatever gets added after, so the question
 * is about timing as much as cost.
 */
function SortSheet({
  householdId,
  count,
  onDone,
  onClose,
}: {
  householdId: string;
  count: number;
  onDone: (result: { sorted: number; left: number }) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sort() {
    setBusy(true);
    setError(null);
    try {
      onDone(await api<{ sorted: number; left: number }>('POST', `/api/households/${householdId}/grocery-list/sort`));
    } catch (err) {
      const message = err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null;
      setError(message ?? 'Could not sort the list.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Is the list finished?" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-muted">
          Sorting puts the {count} {count === 1 ? 'item' : 'items'} the app couldn't place into aisles, using one of
          your 20 AI requests for today. Add everything first and sort once:
          anything added afterwards would need another request.
        </p>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={sort}>
            {busy ? 'Sorting…' : 'Sort now'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Not yet
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
