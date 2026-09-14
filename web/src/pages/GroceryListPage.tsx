import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { absoluteUrl, api, ApiError, getToken } from '../api/client';
import type { GroceryCategory, GroceryListEvent, GroceryListItem as Item } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useOnResume } from '../utils/useOnResume';
import { useAiAvailable } from '../utils/useAiAvailable';
import { splitAmount } from '../utils/amount';
import { groupByCategory } from '../utils/storeSections';
import {
  Button,
  CheckCircle,
  cx,
  EmptyState,
  ErrorText,
  IconButton,
  Input,
  Select,
  Sheet,
  SubHeading,
} from '../components/ui';
import { PlusIcon, TrashIcon } from '../components/icons';
import { PageTitle } from '../components/PageTitle';
import SwipeRow from '../components/SwipeRow';

/* Separators start after the checkbox: 24px circle + 12px gap. */
const ROW_INSET = { '--row-inset': '2.25rem' } as CSSProperties;

export default function GroceryListPage() {
  const { activeHouseholdId, groceryCategories } = useHousehold();
  const aiAvailable = useAiAvailable();
  const [items, setItems] = useState<Item[]>([]);
  const [connected, setConnected] = useState(false);
  const [moving, setMoving] = useState(false);
  const [sheet, setSheet] = useState<'sort' | 'putAway' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const clientRef = useRef<Client | null>(null);

  const refreshItems = useCallback(async () => {
    if (!activeHouseholdId) return;
    setItems(await api<Item[]>('GET', `/api/households/${activeHouseholdId}/grocery-list`));
  }, [activeHouseholdId]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  useOnResume(() => {
    refreshItems().catch(() => {});
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
        setConnected(true);
        // Nothing is replayed after a drop, so whatever changed while the socket was down —
        // a phone asleep in a pocket — has to be fetched.
        refreshItems().catch(() => {});
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

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  }

  /** One box: "2 lb chicken" becomes 2, lb, chicken; "milk" is just milk. */
  async function onAddItem(e: FormEvent) {
    e.preventDefault();
    if (!activeHouseholdId || !draft.trim()) return;
    const { quantity, unit, name } = splitAmount(draft);
    await api('POST', `/api/households/${activeHouseholdId}/grocery-list/items`, {
      ingredientName: name,
      quantity,
      unit,
    });
    setDraft('');
    await refreshItems();
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
    return <EmptyState>Create or select a household first.</EmptyState>;
  }

  const toBuy = items.filter((i) => !i.checked);
  const inCart = items.filter((i) => i.checked);
  const groups = groupByCategory(toBuy, groceryCategories);
  const unsorted = new Set(items.filter((i) => !i.sorted && i.ingredientId).map((i) => i.ingredientId)).size;

  return (
    <div className="space-y-3">
      <PageTitle
        title="Groceries"
        subtitle={
          <>
            {toBuy.length ? `${toBuy.length} to buy` : 'Nothing to buy'}
            {/* Only worth mentioning when it is not working. */}
            {!connected && ' · offline, changes from others may be missing'}
          </>
        }
      >
        {toBuy.length > 0 && (
          <>
            {aiAvailable && unsorted > 0 && !moving && (
              <Button size="sm" variant="ghost" onClick={() => setSheet('sort')}>
                ✨ Sort
              </Button>
            )}
            <Button size="sm" variant={moving ? 'primary' : 'ghost'} onClick={() => setMoving((m) => !m)}>
              {moving ? 'Done' : 'Move'}
            </Button>
          </>
        )}
      </PageTitle>

      <form onSubmit={onAddItem} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add something — 2 lb chicken, milk…"
          aria-label="Add to the list"
          enterKeyHint="done"
        />
        <IconButton type="submit" label="Add" variant="primary" disabled={!draft.trim()}>
          <PlusIcon className="h-5 w-5" />
        </IconButton>
      </form>

      {notice && <p className="rounded-xl bg-success-soft px-4 py-3 text-[0.9375rem] font-medium text-success">{notice}</p>}

      {moving && (
        <p className="text-[0.9375rem] text-muted">
          Pick the aisle each item is in at your store — it sticks for next time. The order of the aisles is on the{' '}
          <Link to="/household" className="font-medium text-accent">
            Household
          </Link>{' '}
          page.
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState>Nothing on the list yet.</EmptyState>
      ) : (
        <div>
          {groups.map(({ category, items: rows }) => (
            <section key={category?.id ?? 'unsorted'}>
              <SubHeading>{category?.name ?? 'Unsorted'}</SubHeading>
              <ul className="inset-rows" style={ROW_INSET}>
                {rows.map((item) => (
                  <li key={item.id}>
                    <ItemRow
                      item={item}
                      categories={groceryCategories}
                      moving={moving}
                      onToggle={toggleItem}
                      onRemove={removeItem}
                      onMove={moveItem}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {inCart.length > 0 && (
            <section className={cx(toBuy.length > 0 && 'mt-4')}>
              <div className="flex items-center justify-between gap-2 pb-1">
                <SubHeading className="pt-0">In the cart · {inCart.length}</SubHeading>
                <Button size="sm" onClick={() => setSheet('putAway')}>
                  Done shopping
                </Button>
              </div>
              <ul className="inset-rows" style={ROW_INSET}>
                {inCart.map((item) => (
                  <li key={item.id}>
                    <ItemRow
                      item={item}
                      categories={groceryCategories}
                      moving={false}
                      onToggle={toggleItem}
                      onRemove={removeItem}
                      onMove={moveItem}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <p className="pt-2 text-[0.8125rem] text-subtle">
        Swipe an item left to remove it. Salt, oil and other things you always have are marked “Always have” in the{' '}
        <Link to="/cupboard" className="font-medium text-accent">
          Cupboard
        </Link>
        , so meals leave them off.
      </p>

      {sheet === 'sort' && (
        <SortSheet
          householdId={activeHouseholdId}
          count={unsorted}
          onClose={() => setSheet(null)}
          onDone={async ({ sorted, left }) => {
            setSheet(null);
            await refreshItems();
            flash(
              (sorted ? `Sorted ${sorted} ${sorted === 1 ? 'item' : 'items'}.` : 'Nothing new to sort.') +
                (left ? ` ${left} couldn't be placed — use Move for those.` : ''),
            );
          }}
        />
      )}

      {sheet === 'putAway' && (
        <PutAwaySheet
          householdId={activeHouseholdId}
          items={inCart}
          onClose={() => setSheet(null)}
          onDone={(cleared, stocked) => {
            setSheet(null);
            setItems((prev) => prev.filter((i) => !cleared.includes(i.id)));
            flash(stocked ? `Put ${stocked} ${stocked === 1 ? 'thing' : 'things'} in the cupboard.` : 'Cleared.');
          }}
        />
      )}
    </div>
  );
}

/**
 * One item: tap to tick it off, swipe it left to remove it. A mouse cannot swipe, so a pointer
 * that can hover gets the bin button as well — nothing is only reachable by gesture.
 */
function ItemRow({
  item,
  categories,
  moving,
  onToggle,
  onRemove,
  onMove,
}: {
  item: Item;
  categories: GroceryCategory[];
  moving: boolean;
  onToggle: (item: Item) => void;
  onRemove: (itemId: string) => void;
  onMove: (item: Item, categoryId: string) => void;
}) {
  const amount = [item.quantity, item.unit].filter(Boolean).join(' ');
  const detail = [amount, item.checked && item.checkedByName ? `got by ${item.checkedByName}` : null]
    .filter(Boolean)
    .join(' · ');
  // A meal put it here, but the cupboard says you have some. Worth a look before buying a third jar.
  const have = item.inCupboard && !item.checked;

  const row = (
    <div className="flex items-center gap-1">
      {/* The whole row toggles — a 16px checkbox is not a real target on a phone. */}
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-pressed={item.checked}
        className="flex min-h-touch min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
      >
        <CheckCircle checked={item.checked} />
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate transition-colors', item.checked && 'text-muted line-through')}>{item.name}</span>
          {(detail || have) && (
            <span className="block truncate text-[0.9375rem] text-muted">
              {detail}
              {have && <span className="text-success">{detail ? ' · ' : ''}Cupboard says you have this</span>}
            </span>
          )}
        </span>
      </button>
      {moving && item.ingredientId ? (
        <Select
          className="h-9 w-36 shrink-0 text-sm"
          value={item.categoryId ?? ''}
          onChange={(e) => onMove(item, e.target.value)}
          aria-label={`Aisle for ${item.name}`}
        >
          {!item.categoryId && (
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
      ) : (
        <IconButton
          label={`Remove ${item.name}`}
          className="hidden text-subtle [@media(hover:hover)]:inline-flex"
          onClick={() => onRemove(item.id)}
        >
          <TrashIcon className="h-5 w-5" />
        </IconButton>
      )}
    </div>
  );

  // While picking aisles the row stays put, so a sideways nudge on the picker is not a swipe.
  if (moving) return row;
  return <SwipeRow actions={[{ label: 'Remove', tone: 'danger', onAction: () => onRemove(item.id) }]}>{row}</SwipeRow>;
}

/**
 * The one place the app spends an AI request on the list, so it asks first. The key allows twenty
 * a day, shared with the recipe writer — and sorting a half-written list means paying again for
 * whatever gets added after, so the question is about timing as much as cost.
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
          your 20 AI requests for today — the same ones “Write it for me” uses. Add everything first and sort once:
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

/**
 * "Done shopping". Everything ticked comes off the list, and what is for the house goes in the
 * cupboard. All pre-selected because most of a shop is for the house — you untick the milk you
 * picked up for someone else, rather than ticking everything else.
 */
function PutAwaySheet({
  householdId,
  items,
  onDone,
  onClose,
}: {
  householdId: string;
  items: Item[];
  onDone: (clearedIds: string[], stocked: number) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function putAway() {
    setBusy(true);
    setError(null);
    const putAwayIds = items.filter((i) => selected.has(i.id)).map((i) => i.id);
    const leaveOutIds = items.filter((i) => !selected.has(i.id)).map((i) => i.id);
    try {
      await api('POST', `/api/households/${householdId}/grocery-list/put-away`, {
        putAway: putAwayIds,
        leaveOut: leaveOutIds,
      });
      onDone([...putAwayIds, ...leaveOutIds], putAwayIds.length);
    } catch {
      setError('Could not put that away.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Done shopping" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[0.9375rem] text-muted">
          Untick anything that isn't for the house. The rest goes in the cupboard, and all of it comes off the list.
        </p>
        <ul className="inset-rows" style={ROW_INSET}>
          {items.map((item) => {
            const on = selected.has(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(item.id)}
                  className="flex min-h-touch w-full items-center gap-3 py-2.5 text-left"
                >
                  <CheckCircle checked={on} />
                  <span className={cx('min-w-0 flex-1 truncate', !on && 'text-muted')}>{item.name}</span>
                  {!on && <span className="shrink-0 text-[0.9375rem] text-muted">Not for us</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" disabled={busy} onClick={putAway}>
            {busy ? 'Putting away…' : selected.size ? `Put away ${selected.size}` : 'Just clear them'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
