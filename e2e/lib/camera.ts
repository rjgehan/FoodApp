import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/**
 * A camera that shows a barcode, for the scanning tests. The picture is a canvas handed over as
 * a MediaStream — genuinely what `getUserMedia` returns — so everything after it, the decoding
 * included, is the real code path.
 *
 * `BarcodeDetector` is deleted first. Chrome has one and Safari does not, and the fallback (a
 * WebAssembly build of ZXing) is the path most of the household's phones take.
 */

/** The barcode printed on the fixture: a jar of Nutella. */
export const ON_THE_JAR = '3017620422003';
export const NUTELLA = readFileSync(new URL('../tests/fixtures/ean13-3017620422003.svg', import.meta.url), 'utf8');

/** A camera permanently pointed at the barcode in `svg`. */
export async function cameraShowing(page: Page, svg: string) {
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

