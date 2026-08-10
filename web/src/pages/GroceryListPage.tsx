import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { api, apiBaseUrl, getToken } from '../api/client';
import type { BlacklistEntry, GroceryListEvent, GroceryListItem as Item } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Button, Card, Input, Label } from '../components/Card';

export default function GroceryListPage() {
  const { activeHouseholdId } = useHousehold();
  const [items, setItems] = useState<Item[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [connected, setConnected] = useState(false);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
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
      webSocketFactory: () => new SockJS(apiBaseUrl() + '/ws'),
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
      quantity,
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
    return <p className="text-sm text-slate-500">Create or select a household first.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Add item">
          <form onSubmit={onAddItem} className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-32">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="paper towels" />
            </div>
            <div className="w-20">
              <Label>Qty</Label>
              <Input type="number" value={quantity} onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="w-24">
              <Label>Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ct" />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </Card>

        <Card title="Blacklist (never auto-added from meals)">
          <form onSubmit={onAddBlacklist} className="flex gap-2 items-end mb-3">
            <div className="flex-1">
              <Label>Ingredient</Label>
              <Input value={blacklistName} onChange={(e) => setBlacklistName(e.target.value)} placeholder="salt" />
            </div>
            <Button type="submit">Add</Button>
          </form>
          <ul className="text-sm space-y-1">
            {blacklist.map((b) => (
              <li key={b.ingredientId} className="flex justify-between">
                <span>{b.name}</span>
                <button
                  onClick={() => removeBlacklist(b.ingredientId)}
                  className="text-slate-400 hover:text-red-500"
                >
                  x
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Items"
        actions={
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              connected
                ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
            }`}
          >
            {connected ? 'live' : 'offline'}
          </span>
        }
      >
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <input type="checkbox" checked={item.checked} onChange={() => toggleItem(item)} className="h-4 w-4" />
              <div className={`flex-1 ${item.checked ? 'line-through text-slate-400' : ''}`}>
                {item.name}
                <span className="text-slate-400 ml-2">
                  {item.quantity ?? ''} {item.unit ?? ''}
                </span>
              </div>
              {item.checked && item.checkedByName && (
                <span className="text-xs text-slate-400">by {item.checkedByName}</span>
              )}
              <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-red-500 text-sm">
                x
              </button>
            </li>
          ))}
          {items.length === 0 && <p className="text-slate-500 text-sm py-2">Nothing on the list yet.</p>}
        </ul>
      </Card>
    </div>
  );
}
