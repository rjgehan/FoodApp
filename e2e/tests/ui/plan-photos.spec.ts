import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { admin, call, isoDate, newHousehold, newRecipe, plan, uploadImage } from '../../lib/api';
import { sheet, signIn } from '../../lib/ui';

/*
 * On a computer the plan shows each meal's photo; on a phone it stays text, and the photos are
 * not even downloaded — including a phone turned sideways, which is wider than a small tablet.
 */

const COVER_JPEG = readFileSync(new URL('../fixtures/cover-8px.jpg', import.meta.url));

/**
 * Today: a dinner with a cover photo and a lunch without one. Tomorrow: dinner out, at a
 * restaurant with its own photo.
 */
async function planWithPhotos() {
  const hh = await newHousehold();
  const cover = await uploadImage(hh.id, COVER_JPEG);
  const shopFront = await uploadImage(hh.id, COVER_JPEG);
  const pictured = await newRecipe(hh.id, 'Shepherds pie', [{ name: 'lamb mince', qty: 500, unit: 'g' }], {
    coverImageId: cover,
  });
  const plain = await newRecipe(hh.id, 'Tomato soup', [{ name: 'tomatoes', qty: 6 }]);
  const owner = await admin();
  const place = await call('POST', `/api/households/${hh.id}/places`, {
    token: owner.token,
    body: { name: 'Tonys Pizzeria', imageId: shopFront },
  });
  await plan(hh.id, isoDate(0), 'DINNER', { recipeId: pictured.id });
  await plan(hh.id, isoDate(0), 'LUNCH', { recipeId: plain.id });
  await plan(hh.id, isoDate(1), 'DINNER', { placeId: place.id });
  return { hh, cover, shopFront };
}

const dayCards = (page: Page) => page.getByRole('button', { name: /^Plan for / });

test.describe('on a computer', () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test('each planned meal shows its photo, and a meal without one gets a plain tile', async ({ page }, info) => {
    const { hh, cover, shopFront } = await planWithPhotos();
    await signIn(page, hh.owner, hh.id);
    await page.goto('/meal-plan');

    // Today's card: one real photo (the dinner), and a plate for the soup instead of a broken image.
    const today = dayCards(page).first();
    await expect(today).toContainText('Shepherds pie');
    const photo = today.locator(`img[src$="/api/images/${cover}"]`);
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute('loading', 'lazy');
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(today.locator('img')).toHaveCount(1);

    // Tomorrow's dinner out shows the restaurant's own photo, not just a shop icon.
    const tomorrow = dayCards(page).nth(1);
    await expect(tomorrow).toContainText('Tonys Pizzeria');
    await expect(tomorrow.locator(`img[src$="/api/images/${shopFront}"]`)).toBeVisible();

    // Each card is only as tall as its own meals, and the photos leave the month on the first screen.
    const [todayBox, tomorrowBox] = [await today.boundingBox(), await tomorrow.boundingBox()];
    expect(tomorrowBox!.height).toBeLessThan(todayBox!.height);
    await expect(page.getByRole('button', { name: 'Next month' })).toBeInViewport();

    // The month square for today shows the photo too.
    const day = page.getByRole('button', { name: /, 2 planned$/ });
    await expect(day.locator(`img[src$="/api/images/${cover}"]`)).toBeVisible();

    await info.attach('plan-desktop', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // And the day sheet, next to the dish.
    await today.click();
    await expect(sheet(page).locator(`img[src$="/api/images/${cover}"]`)).toBeVisible();
    await info.attach('day-sheet-desktop', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('a month square with more meals than fit says how many more', async ({ page }) => {
    const hh = await newHousehold();
    for (const [meal, item] of [
      ['BREAKFAST', 'Porridge'],
      ['LUNCH', 'Sandwiches'],
      ['DINNER', 'Leftovers'],
      ['SNACK', 'Apples'],
    ] as const) {
      await plan(hh.id, isoDate(0), meal, { itemName: item });
    }
    await signIn(page, hh.owner, hh.id);
    await page.goto('/meal-plan');

    const day = page.getByRole('button', { name: /, 4 planned$/ });
    await expect(day).toContainText('+2');
    await expect(dayCards(page).first()).toContainText('+1 more');
  });
});

async function expectNoPhotos(page: Page) {
  const { hh } = await planWithPhotos();
  const photoRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/images/')) photoRequests.push(req.url());
  });
  await signIn(page, hh.owner, hh.id);
  await page.goto('/meal-plan');

  const card = dayCards(page).first();
  await expect(card).toContainText('Shepherds pie');
  await expect(dayCards(page).nth(1)).toContainText('Tonys Pizzeria');
  await expect(page.locator('main img')).toHaveCount(0);
  await card.click();
  await expect(sheet(page).getByText('Shepherds pie')).toBeVisible();
  await expect(sheet(page).locator('img')).toBeHidden();
  expect(photoRequests).toEqual([]);
}

test('on a phone the plan stays text and downloads no photos', async ({ page }) => {
  await expectNoPhotos(page);
});

test.describe('on a phone turned sideways', () => {
  // An iPhone Pro Max on its side: wider than md:, still a phone.
  test.use({ viewport: { width: 932, height: 430 } });

  test('the plan still stays text and downloads no photos', async ({ page }) => {
    await expectNoPhotos(page);
  });
});
