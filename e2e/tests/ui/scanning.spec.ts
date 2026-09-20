import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { call, newHousehold } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

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

const ON_THE_JAR = '3017620422003';
const NUTELLA = readFileSync(new URL('../fixtures/ean13-3017620422003.svg', import.meta.url), 'utf8');

/** A camera permanently pointed at a jar of Nutella. */
async function cameraShowing(page: Page, svg: string) {
  await page.addInitScript((barcode) => {
    delete (window as unknown as Record<string, unknown>).BarcodeDetector;
    const image = new Image();
    image.src = 'data:image/svg+xml;base64,' + btoa(barcode);
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const paper = canvas.getContext('2d')!;
    (function paint() {
      paper.fillStyle = '#fff';
      paper.fillRect(0, 0, 1280, 720);
      if (image.complete && image.naturalWidth) {
        const width = 900;
        const height = width * (image.naturalHeight / image.naturalWidth);
        paper.drawImage(image, (1280 - width) / 2, (720 - height) / 2, width, height);
      }
      requestAnimationFrame(paint);
    })();
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(20);
  }, svg);
}

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

  // Reading it involves fetching a megabyte of WebAssembly the first time.
  await expect(sheet(page).getByText('Nutella', { exact: true })).toBeVisible({ timeout: 30_000 });
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
  await sheet(page).getByRole('textbox').fill('Chocolate spread');
  await sheet(page).getByRole('button', { name: 'Add to the cupboard' }).click();
  await expect.poll(async () =>
    (await call('GET', `/api/households/${hh.id}/cupboard`, { token: hh.owner.token }))
      .some((item: { name: string }) => item.name === 'Chocolate spread')).toBe(true);
});
