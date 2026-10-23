import { expect, test } from '@playwright/test';
import { ApiError, admin, call, find, isoDate, newHousehold, newMember, statusOf, unique } from '../../lib/api';

/**
 * Receipt prices: the phone sends the text it read off a receipt, gets back a draft to check,
 * saves what was confirmed, and the grocery list then shows what each thing cost last time.
 * A price can also be typed in on a row. The receipt reader's rules have their own unit tests in
 * the backend (ReceiptReaderTest); these are about the round trip and what comes back.
 */

const KINGS = [
  'KINGS',
  'FOOD MARKETS',
  '1 Hudson Pl',
  'Hoboken, NJ 07030',
  'KNGS BABY SPINACH 5OZ 3.99 F',
  'ORGANIC BANANAS',
  '2.04 lb @ 0.69 /lb 1.41 F',
  'LEMONS',
  '3 @ 0.79 2.37 F',
  'SC KINGS CARD SAVINGS 0.50-',
  'PAPER BAG 0.10 T',
  'SUBTOTAL 7.37',
  'NJ SALES TAX 6.625% 0.01',
  '**** BALANCE 7.38',
  'VISA 7.38',
  '10/18/26 5:42 PM',
];

async function add(householdId: string, token: string, ingredientName: string) {
  return call('POST', `/api/households/${householdId}/grocery-list/items`, { token, body: { ingredientName } });
}

test('scan, check and save a receipt: the list then shows what things cost', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const base = `/api/households/${hh.id}`;
  const spinach = await add(hh.id, token, 'baby spinach');
  const bananas = await add(hh.id, token, 'bananas');
  expect(spinach.lastPrice).toBeNull();

  // Read: nothing saved, a draft back.
  const draft = await call('POST', `${base}/receipts/read`, { token, body: { lines: KINGS, barcode: null } });
  expect(draft).toMatchObject({
    storeName: 'Kings Food Markets', storeId: null, purchasedOn: '2026-10-18',
    subtotal: 7.37, tax: 0.01, total: 7.38, sumMatches: true, duplicateOf: null, unreadLines: [],
  });
  expect(draft.lines.map((l: any) => [l.text, l.kind, l.price, l.onSale, l.ingredientName])).toEqual([
    ['KNGS BABY SPINACH 5OZ', 'ITEM', 3.99, false, 'baby spinach'],
    ['ORGANIC BANANAS', 'ITEM', 1.41, false, 'bananas'],
    ['LEMONS', 'ITEM', 1.87, true, null],
    ['PAPER BAG', 'NOT_FOOD', 0.1, false, null],
  ]);
  expect(draft.lines[1]).toMatchObject({ quantity: 2.04, unit: 'lb', unitPrice: 0.69, ingredientId: bananas.ingredientId });
  // The size in a name is how much the price was for.
  expect(draft.lines[0]).toMatchObject({ quantity: 5, unit: 'oz', unitPrice: null });
  expect(await call('GET', `${base}/receipts`, { token })).toEqual([]);

  // Save, with the lemons named on the review screen.
  const lemons = unique('lemons').toLowerCase();
  const lines = draft.lines.map((l: any) => (l.text === 'LEMONS' ? { ...l, ingredientName: lemons } : l));
  const saved = await call('POST', `${base}/receipts`, {
    token,
    body: { storeName: draft.storeName, purchasedOn: draft.purchasedOn, subtotal: draft.subtotal, tax: draft.tax,
      total: draft.total, barcode: null, rawText: KINGS.join('\n'), lines },
  });
  expect(saved).toMatchObject({ storeName: 'Kings Food Markets', purchasedOn: '2026-10-18', total: 7.38, itemCount: 3, pricedCount: 3 });
  expect(saved.lines.find((l: any) => l.text === 'LEMONS').ingredientName).toBe(lemons);

  // The list says what each cost; the new lemons are not on it, but the price is kept.
  const list = await call('GET', `${base}/grocery-list`, { token });
  // Its brand is whatever the draft remembered for the line — anybody's, so not fixed here.
  expect(find(list, 'baby spinach').lastPrice).toEqual({
    price: 3.99, quantity: 5, unit: 'oz', storeName: 'Kings Food Markets', observedOn: '2026-10-18', onSale: false, source: 'RECEIPT',
    brand: draft.lines[0].brand,
  });
  expect(find(list, 'bananas').lastPrice).toMatchObject({ price: 1.41, quantity: 2.04, unit: 'lb' });
  const lemonRow = await add(hh.id, token, lemons);
  expect(lemonRow.lastPrice).toMatchObject({ price: 1.87, onSale: true });

  // The shop is the household's now, and the next read of a Kings receipt knows it.
  const stores = await call('GET', `${base}/stores`, { token });
  expect(stores).toEqual([{ id: saved.storeId, name: 'Kings Food Markets', place: null }]);
  expect((await call('POST', `${base}/receipts/read`, { token, body: { lines: KINGS } })).storeId).toBe(saved.storeId);

  // The receipts list and one receipt.
  const receipts = await call('GET', `${base}/receipts`, { token });
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({ id: saved.id, storeName: 'Kings Food Markets', purchasedOn: '2026-10-18', total: 7.38,
    itemCount: 3, pricedCount: 3, createdAt: expect.any(String) });
  expect((await call('GET', `${base}/receipts/${saved.id}`, { token })).lines).toHaveLength(4);

  // Deleted: gone, and so are its prices.
  await call('DELETE', `${base}/receipts/${saved.id}`, { token });
  expect(await statusOf('GET', `${base}/receipts/${saved.id}`, { token })).toBe(404);
  expect(find(await call('GET', `${base}/grocery-list`, { token }), 'baby spinach').lastPrice).toBeNull();
});

test('the same receipt twice: the draft says so, saving is a 409, and Save anyway leaves out the barcode', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const base = `/api/households/${hh.id}`;
  const barcode = unique('9912');
  const body = { storeName: 'Kings Food Markets', purchasedOn: isoDate(0), barcode,
    lines: [{ text: 'BREAD', kind: 'ITEM', price: 4, onSale: false }] };
  const first = await call('POST', `${base}/receipts`, { token, body });

  const draft = await call('POST', `${base}/receipts/read`, { token, body: { lines: ['BREAD 4.00'], barcode } });
  expect(draft.duplicateOf).toBe(first.id);
  try {
    await call('POST', `${base}/receipts`, { token, body });
    throw new Error('should have been refused');
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(409);
    expect(JSON.parse((e as ApiError).body)).toMatchObject({ duplicateOf: first.id, message: expect.any(String) });
  }
  await call('POST', `${base}/receipts`, { token, body: { ...body, barcode: null } });
  expect(await call('GET', `${base}/receipts`, { token })).toHaveLength(2);
});

test('a saved receipt put right: its lines, shop and day change and its prices with them; its barcode stays', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const base = `/api/households/${hh.id}`;
  const eggs = await add(hh.id, token, unique('eggs').toLowerCase());
  const milk = await add(hh.id, token, unique('milk').toLowerCase());
  const barcode = unique('9913');
  const saved = await call('POST', `${base}/receipts`, {
    token,
    body: { storeName: 'Kings Food Markets', purchasedOn: '2026-10-18', total: 9.28, barcode, rawText: 'EGGS 4.99\nMILK 4.29',
      lines: [
        { text: 'EGGS', kind: 'ITEM', price: 4.99, onSale: false, ingredientId: eggs.ingredientId },
        { text: 'MILK', kind: 'ITEM', price: 4.29, onSale: false, ingredientId: milk.ingredientId },
      ] },
  });

  // The same body as a save; the barcode and raw text sent here are not the receipt's to change.
  const shop = unique('Corner Shop');
  const edited = await call('PUT', `${base}/receipts/${saved.id}`, {
    token,
    body: { storeName: shop, purchasedOn: '2026-10-19', total: 5.59, barcode: 'something else', rawText: 'something else',
      lines: [
        { text: 'EGGS LG', kind: 'ITEM', quantity: 12, unit: 'ct', price: 5.49, onSale: true, ingredientId: eggs.ingredientId,
          brand: 'Vital Farms' },
        { text: 'MILK', kind: 'NOT_FOOD', price: 0.1, onSale: false },
      ] },
  });
  expect(edited).toMatchObject({ id: saved.id, storeName: shop, purchasedOn: '2026-10-19', total: 5.59, itemCount: 1,
    pricedCount: 1, photoIds: [] });
  expect(edited.lines.map((l: any) => [l.text, l.kind, l.price, l.ingredientName, l.brand])).toEqual([
    ['EGGS LG', 'ITEM', 5.49, eggs.name, 'Vital Farms'],
    ['MILK', 'NOT_FOOD', 0.1, null, null],
  ]);
  expect(await call('GET', `${base}/receipts/${saved.id}`, { token })).toEqual(edited);
  expect((await call('GET', `${base}/receipts`, { token })).map((r: any) => [r.id, r.storeName, r.itemCount, r.pricedCount]))
    .toEqual([[saved.id, shop, 1, 1]]);

  // The list: eggs at the new shop, on the new day, at the new price; milk no longer priced at all.
  const list = await call('GET', `${base}/grocery-list`, { token });
  expect(find(list, eggs.name).lastPrice).toEqual({
    price: 5.49, quantity: 12, unit: 'ct', storeName: shop, observedOn: '2026-10-19', onSale: true, source: 'RECEIPT', brand: 'Vital Farms',
  });
  expect(find(list, milk.name).lastPrice).toBeNull();

  // Still the receipt that was scanned: its barcode still finds it.
  expect((await call('POST', `${base}/receipts/read`, { token, body: { lines: ['BREAD 4.00'], barcode } })).duplicateOf).toBe(saved.id);

  // What a save refuses, an edit refuses; somebody else's receipt, or none, is not there.
  expect(await statusOf('PUT', `${base}/receipts/${saved.id}`, { token, body: { storeName: shop, lines: [] } })).toBe(400);
  expect(await statusOf('PUT', `${base}/receipts/${saved.id}`, { token,
    body: { storeName: shop, lines: [{ text: 'X', kind: 'SNACK', price: 1, onSale: false }] } })).toBe(400);
  expect(await statusOf('PUT', `${base}/receipts/${crypto.randomUUID()}`, { token,
    body: { storeName: shop, lines: [{ text: 'X', kind: 'ITEM', price: 1, onSale: false }] } })).toBe(404);
  expect((await call('GET', `${base}/receipts/${saved.id}`, { token })).lines).toHaveLength(2);
});

test('a price typed on a row: kept as today, shown at once, and only for a row that is a thing', async () => {
  const hh = await newHousehold();
  const member = await newMember(hh.id);
  const base = `/api/households/${hh.id}`;
  const coffee = await add(hh.id, member.token, unique('coffee').toLowerCase());

  const priced = await call('PUT', `${base}/grocery-list/items/${coffee.id}/price`, {
    token: member.token, body: { price: 11.99, quantity: 2, unit: 'bag', storeName: 'Corner Shop', brand: 'Lavazza' },
  });
  expect(priced.id).toBe(coffee.id);
  expect(priced.lastPrice).toEqual({
    price: 11.99, quantity: 2, unit: 'bag', storeName: 'Corner Shop', observedOn: isoDate(0), onSale: false, source: 'MANUAL',
    brand: 'Lavazza',
  });
  // Only the price is needed.
  const plain = await call('PUT', `${base}/grocery-list/items/${coffee.id}/price`, { token: member.token, body: { price: 9.5 } });
  expect(plain.lastPrice).toMatchObject({ price: 9.5, quantity: null, unit: null, storeName: null, brand: null, source: 'MANUAL' });

  // The item sheet's "last paid at each shop": the newest per shop, one with no shop as its own.
  const byShop = await call('GET', `${base}/ingredients/${coffee.ingredientId}/prices`, { token: member.token });
  expect(byShop.map((p: any) => [p.storeName, p.price])).toEqual(
    expect.arrayContaining([['Corner Shop', 11.99], [null, 9.5]]),
  );
  expect(byShop).toHaveLength(2);

  const nameless = await call('POST', `${base}/grocery-list/items`, { token: member.token, body: { quantity: 1 } });
  expect(await statusOf('PUT', `${base}/grocery-list/items/${nameless.id}/price`, { token: member.token, body: { price: 1 } })).toBe(400);
});

test('friendly refusals for what does not make sense', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const base = `/api/households/${hh.id}`;
  const coffee = await add(hh.id, token, unique('coffee').toLowerCase());
  const refusal = async (method: string, path: string, body: unknown) => {
    try {
      await call(method, path, { token, body });
    } catch (e) {
      return { status: (e as ApiError).status, message: JSON.parse((e as ApiError).body).message };
    }
    throw new Error(`${method} ${path} should have been refused`);
  };
  const line = { text: 'BREAD', kind: 'ITEM', price: 4, onSale: false };

  expect(await refusal('POST', `${base}/receipts/read`, { lines: [] })).toEqual({ status: 400, message: expect.stringMatching(/no text/) });
  expect(await refusal('POST', `${base}/receipts`, { storeName: 'Kings', lines: [] })).toEqual({ status: 400, message: 'A receipt needs at least one line.' });
  expect(await refusal('POST', `${base}/receipts`, { storeName: 'Kings', total: -1, lines: [line] })).toEqual({ status: 400, message: "The total can't be below zero." });
  expect(await refusal('POST', `${base}/receipts`, { storeName: 'K'.repeat(81), lines: [line] })).toEqual({ status: 400, message: "Keep the store's name to 80 characters." });
  expect(await refusal('POST', `${base}/receipts`, { storeName: 'Kings', lines: [{ ...line, price: null }] })).toEqual({ status: 400, message: 'Every line needs a price.' });
  expect(await refusal('POST', `${base}/receipts`, { storeName: 'Kings', lines: [{ ...line, kind: 'SNACK' }] })).toEqual({ status: 400, message: 'A line is either ITEM or NOT_FOOD.' });
  expect(await refusal('PUT', `${base}/grocery-list/items/${coffee.id}/price`, { price: -2 })).toEqual({ status: 400, message: "A price can't be below zero." });
  expect(await refusal('PUT', `${base}/grocery-list/items/${coffee.id}/price`, {})).toEqual({ status: 400, message: 'Say what it cost.' });
  expect(await refusal('POST', `${base}/receipts`, { storeName: 'Kings', lines: [line], place: { name: 'Kings', latitude: 91, longitude: 0 } }))
    .toEqual({ status: 400, message: "That isn't a latitude." });
  expect(await refusal('POST', `${base}/stores/hidden`, { name: 'Soup Kitchen' })).toEqual({ status: 400, message: 'Say where the place is.' });
  expect(await refusal('POST', `${base}/stores/hidden`, { name: ' ', latitude: 40, longitude: -74 })).toEqual({ status: 400, message: 'Say which place to hide.' });
  expect(await call('GET', `${base}/receipts`, { token })).toEqual([]);
});

test('deleting the household takes its receipts, prices and shops with it', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const base = `/api/households/${hh.id}`;
  const milk = await add(hh.id, token, unique('milk').toLowerCase());
  await call('POST', `${base}/receipts`, { token, body: { storeName: 'Kings Food Markets', barcode: unique('bc'),
    lines: [{ text: 'MILK', kind: 'ITEM', price: 4.49, onSale: false, ingredientId: milk.ingredientId }] } });
  await call('PUT', `${base}/grocery-list/items/${milk.id}/price`, { token, body: { price: 4.29, storeName: 'Corner' } });

  await call('DELETE', `/api/households/${hh.id}`, { token });
  expect(await statusOf('GET', `${base}/receipts`, { token })).toBe(403);
});
