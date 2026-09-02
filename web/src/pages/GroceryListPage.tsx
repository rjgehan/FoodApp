import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { absoluteUrl, api, getToken } from '../api/client';
import type { BlacklistEntry, GroceryListEvent, GroceryListItem as Item } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Badge, Button, Card, CheckCircle, cx, EmptyState, IconButton, Input, NumberInput } from '../components/ui';
import { PlusIcon, TrashIcon } from '../components/icons';

export default function GroceryListPage() {
  const { activeHouseholdId } = useHousehold();
  const [items, setItems] = useState<Item[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [showBlacklist, setShowBlacklist] = useState(false);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<number | null>(1);
  const [unit, setUnit] = useState('');
  const [blacklistName, setBlacklistName] = useState('');

  const clientRef = useRef<Client | null>(null);

  const refreshItems = useCallback(async () => {
    if (!activeHouseholdId) return;
    setItems(await api<Item[]>('GET', `/api/households/${activeHouseholdId}/grocery-list`));
  }, [activeHouseholdId]);

  const refreshBlacklist = useCallback(async () => {
    if (!activeHouseholdId) return;
    setBlacklist(await api<BlacklistEntry[]>('GET', `/api/households/${activeHouseholdId}/blacklist`));
  }, [activeHouseholdId]);

  useEffect(() => {
    refreshItems();
    refreshBlacklist();
  }, [refreshItems, refreshBlacklist]);

  // Realtime: connect once per household and keep the socket open while this page mounts.
  useEffect(() => {
    if (!activeHouseholdId) return;
    const token = getToken();
    if (!token) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(absoluteUrl('/ws')),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 3000,
      onConnect: () => {
        setConnected(true);
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
  }, [activeHouseholdId]);

  async function onAddItem(e: FormEvent) {
    e.preventDefault();
    if (!activeHouseholdId || !name.trim()) return;
    await api('POST', `/api/households/${activeHouseholdId}/grocery-list/items`, {
      ingredientName: name.trim(),
      quantity: quantity ?? 1,
      unit,
    });
    setName('');
    setQuantity(1);
    setUnit('');
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

  async function onAddBlacklist(e: FormEvent) {
    e.preventDefault();
    if (!activeHouseholdId || !blacklistName.trim()) return;
    await api('POST', `/api/households/${activeHouseholdId}/blacklist`, { ingredientName: blacklistName.trim() });
    setBlacklistName('');
    await refreshBlacklist();
  }

  async function removeBlacklist(ingredientId: string) {
    if (!activeHouseholdId) return;
    await api('DELETE', `/api/households/${activeHouseholdId}/blacklist/${ingredientId}`);
    await refreshBlacklist();
  }

  if (!activeHouseholdId) {
    return (
      <Card>
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  const remaining = items.filter((i) => !i.checked).length;
  const sorted = [...items].sort((a, b) => Number(a.checked) - Number(b.checked));

  return (
    <div className="space-y-4">
      <Card title="Add to the list">
        <form onSubmit={onAddItem} className="space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="paper towels"
            aria-label="Item name"
          />
          <div className="flex gap-2">
            <NumberInput
              className="w-24"
              value={quantity}
              onChange={setQuantity}
              aria-label="Quantity"
            />
            <Input
              className="w-24"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="ct"
              aria-label="Unit"
            />
            <Button type="submit" className="flex-1" disabled={!name.trim()}>
              <PlusIcon className="h-5 w-5" />
              Add
            </Button>
          </div>
        </form>
      </Card>

      <Card
        title={remaining ? `${remaining} to buy` : 'List'}
        actions={<Badge tone={connected ? 'success' : 'neutral'}>{connected ? 'Live' : 'Offline'}</Badge>}
        bodyClassName="px-2 pb-2 sm:px-4 sm:pb-4"
      >
        {sorted.length === 0 ? (
          <EmptyState>Nothing on the list yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {sorted.map((item) => (
              <li key={item.id} className="flex items-center gap-1">
                {/* The whole row toggles — a 16px checkbox is not a real target on a phone. */}
                <button
                  type="button"
                  onClick={() => toggleItem(item)}
                  aria-pressed={item.checked}
                  className="flex min-h-touch flex-1 items-center gap-3 py-3 pl-2 text-left"
                >
                  <CheckCircle checked={item.checked} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate', item.checked && 'text-muted line-through')}>
                      {item.name}
                    </span>
                    {(item.quantity || item.unit || (item.checked && item.checkedByName)) && (
                      <span className="block truncate text-sm text-muted">
                        {[item.quantity, item.unit].filter(Boolean).join(' ')}
                        {item.checked && item.checkedByName && ` · got by ${item.checkedByName}`}
                      </span>
                    )}
                  </span>
                </button>
                <IconButton label={`Remove ${item.name}`} onClick={() => removeItem(item.id)}>
                  <TrashIcon className="h-5 w-5" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Pantry staples"
        actions={
          <Button size="sm" variant="ghost" onClick={() => setShowBlacklist((v) => !v)}>
            {showBlacklist ? 'Hide' : `Show${blacklist.length ? ` (${blacklist.length})` : ''}`}
          </Button>
        }
      >
        <p className="text-sm text-muted">Things you always have. Meals never add these to the list.</p>

        {showBlacklist && (
          <div className="mt-3 space-y-3">
            <form onSubmit={onAddBlacklist} className="flex gap-2">
              <Input
                value={blacklistName}
                onChange={(e) => setBlacklistName(e.target.value)}
                placeholder="salt"
                aria-label="Pantry staple"
              />
              <Button type="submit" variant="secondary" disabled={!blacklistName.trim()}>
                Add
              </Button>
            </form>
            {blacklist.length === 0 ? (
              <EmptyState>Nothing here yet.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {blacklist.map((b) => (
                  <li key={b.ingredientId} className="flex items-center justify-between gap-2 py-1">
                    <span className="truncate">{b.name}</span>
                    <IconButton label={`Remove ${b.name}`} onClick={() => removeBlacklist(b.ingredientId)}>
                      <TrashIcon className="h-5 w-5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
