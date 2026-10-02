import { expect, test, type Page } from '@playwright/test';
import { call, newHousehold } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';
import { cameraShowing, NUTELLA, ON_THE_JAR } from '../../lib/camera';

/**
 * Scanning a barcode into the cupboard.
 *
 * Two things are faked and one is real. The camera is a canvas showing a barcode, handed over
 * as a MediaStream — that is genuinely what `getUserMedia` returns, so everything downstream of
 * it is the real code path. The catalogue is stubbed, because a test suite that phones Open
 * Food Facts is a test suite that fails on a train. What is real is the decoding: the picture
 * goes in as pixels and the product comes out.
 *
 * `BarcodeDetector` is deleted first. Chrome has one and Safari does not, and the fallback —
 * a WebAssembly build of ZXing — is the path that most of this household's phones will take,
 * so it is the one worth testing.
 */

/**
 * The catalogue, without the catalogue. Answers only for the barcode actually printed on the
 * fixture — otherwise a misread would be handed the right product anyway and the test would
 * pass while the decoder was wrong.
 */
async function catalogueSays(page: Page, body: object | null) {
  await page.route('**/api/barcodes/*', (route) => {
    const asked = route.request().url().split('/').pop();
    if (asked !== ON_THE_JAR) {
      return route.fulfill({ status: 404, json: { status: 404, message: `read ${asked}, expected ${ON_THE_JAR}` } });
    }
    return body
      ? route.fulfill({ json: body })
      : route.fulfill({ status: 404, json: { status: 404, message: 'Nothing in the catalogue has that barcode.' } });
  });
}

const nutella = { barcode: '3017620422003', name: 'Nutella', brand: 'Nutella', size: '400 g' };

test('scan a barcode and the thing it names goes in the cupboard', async ({ page, context }) => {
  const hh = await newHousehold();
  await context.grantPermissions(['camera']);
  await cameraShowing(page, NUTELLA);
  await catalogueSays(page, nutella);

  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');
  await page.getByRole('button', { name: 'Scan a barcode' }).click();

  // Reading it involves fetching a megabyte of WebAssembly the first time. The name it found is
  // ready to save, and can still be changed first.
  await expect(sheet(page).getByLabel('Call it')).toHaveValue('Nutella', { timeout: 30_000 });
  await expect(sheet(page).getByText('400 g')).toBeVisible();

  await sheet(page).getByRole('button', { name: 'Add to the cupboard' }).click();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token }))
      .some((item: { name: string }) => item.name.toLowerCase() === 'nutella')).toBe(true);
});

test('scanning something you already have says so instead of adding it twice', async ({ page, context }) => {
  const hh = await newHousehold();
  await call('POST', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token, body: { name: 'Nutella' } });
  await context.grantPermissions(['camera']);
  await cameraShowing(page, NUTELLA);
  await catalogueSays(page, nutella);

  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');
  await page.getByRole('button', { name: 'Scan a barcode' }).click();

  await expect(sheet(page).getByText('You already have this.')).toBeVisible({ timeout: 30_000 });
  // The point of saying so is that it does not then offer to add a second one.
  await expect(sheet(page).getByRole('button', { name: 'Add to the cupboard' })).toHaveCount(0);
});

test('a barcode nobody has published still gets you a cupboard item', async ({ page, context }) => {
  const hh = await newHousehold();
  await context.grantPermissions(['camera']);
  await cameraShowing(page, NUTELLA);
  await catalogueSays(page, null);

  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');
  await page.getByRole('button', { name: 'Scan a barcode' }).click();

  await expect(sheet(page).getByText('Not in the catalogue.')).toBeVisible({ timeout: 30_000 });
  await sheet(page).getByLabel('Call it').fill('Chocolate spread');
  await sheet(page).getByRole('button', { name: 'Add to the cupboard' }).click();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token }))
      .some((item: { name: string }) => item.name === 'Chocolate spread')).toBe(true);
});

test('a scan can go on the grocery list instead', async ({ page, context }) => {
  const hh = await newHousehold();
  await context.grantPermissions(['camera']);
  await cameraShowing(page, NUTELLA);
  await catalogueSays(page, nutella);

  await signIn(page, hh.owner, hh.id);
  await page.goto('/cupboard');
  await page.getByRole('button', { name: 'Scan a barcode' }).click();

  await expect(sheet(page).getByLabel('Call it')).toHaveValue('Nutella', { timeout: 30_000 });
  await sheet(page).getByRole('button', { name: 'Add to the list' }).click();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/grocery-list`, { token: hh.owner.token }))
      .some((item: { name: string }) => item.name.toLowerCase() === 'nutella')).toBe(true);
  // The list, not the cupboard: it is something to buy.
  expect(await call('GET', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token })).toEqual([]);
});
