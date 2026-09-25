import { expect, test } from '@playwright/test';
import { ApiError, INTEGRATION_KEY, admin, call, newHousehold, newMember, newRecipe, statusOf } from '../../lib/api';

/*
 * A recipe keeps any number of links. Phones already installed only know the old single
 * sourceUrl / videoUrl — and until this, every save from one wiped both — so the old shapes are
 * pinned here alongside the new one.
 */

const BLOG = 'https://www.bbcgoodfood.com/recipes/ragu';
const TIKTOK = 'https://www.tiktok.com/@cook/video/1';

/** The body the phone's editor sent before it knew about links: no links, no sourceUrl, no videoUrl. */
function oldPhoneBody(recipe: any) {
  return {
    name: recipe.name,
    servings: recipe.servings,
    section: 'DINNER',
    categories: [],
    coverImageId: null,
    photoIds: [],
    ingredients: recipe.ingredients.map((i: any) => ({
      ingredientName: i.ingredientName, quantity: i.quantity, optional: i.optional,
    })),
  };
}

test('links round-trip: normalized, named, in order, repeats dropped', async () => {
  const hh = await newHousehold();
  const r = await newRecipe(hh.id, 'Ragu', [{ name: 'mince', qty: 1, unit: 'kg' }], {
    links: [
      { url: 'tiktok.com/@cook/video/1', label: '  The video ' },
      { url: BLOG, label: null },
      { url: '', label: 'an empty row left in the form' },
      { url: `${BLOG}/`, label: 'the same page again' },
    ],
  });
  expect(r.links).toEqual([
    { url: 'https://tiktok.com/@cook/video/1', label: 'The video' },
    { url: BLOG, label: null },
  ]);
  // Old clients still get their two fields, taken from the list.
  expect(r.videoUrl).toBe('https://tiktok.com/@cook/video/1');
  expect(r.sourceUrl).toBe(BLOG);
  // The description is left alone — links never go in there.
  expect(r.description ?? null).toBeNull();

  const { token } = await admin();
  const again = await call('GET', `/api/recipes/${r.id}?householdId=${hh.id}`, { token });
  expect(again.links).toEqual(r.links);
  const listed = (await call('GET', `/api/households/${hh.id}/recipes`, { token })).find((x: any) => x.id === r.id);
  expect(listed.links).toEqual(r.links);
});

test('an old phone saving a recipe no longer wipes its links', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Ragu', [{ name: 'mince', qty: 1, unit: 'kg' }], {
    links: [{ url: BLOG, label: 'Blog' }, { url: TIKTOK, label: null }],
  });

  const saved = await call('PUT', `/api/recipes/${r.id}`, { token, body: { ...oldPhoneBody(r), name: 'Ragu alla bolognese' } });
  expect(saved.name).toBe('Ragu alla bolognese');
  expect(saved.links).toEqual(r.links);

  // Explicit nulls mean the same as leaving them out.
  const nulls = await call('PUT', `/api/recipes/${r.id}`, {
    token, body: { ...oldPhoneBody(r), sourceUrl: null, videoUrl: null, links: null },
  });
  expect(nulls.links).toEqual(r.links);
});

test('an old client that does send sourceUrl / videoUrl has them merged in, never doubled', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Ragu', [{ name: 'mince', qty: 1, unit: 'kg' }], { videoUrl: TIKTOK });
  // Made the old way, it still ends up in the list.
  expect(r.links).toEqual([{ url: TIKTOK, label: null }]);

  // The old web form sent back the videoUrl it was given.
  const same = await call('PUT', `/api/recipes/${r.id}`, { token, body: { ...oldPhoneBody(r), videoUrl: TIKTOK } });
  expect(same.links).toEqual([{ url: TIKTOK, label: null }]);

  const more = await call('PUT', `/api/recipes/${r.id}`, {
    token, body: { ...oldPhoneBody(r), sourceUrl: 'seriouseats.com/ragu', videoUrl: TIKTOK },
  });
  expect(more.links.map((l: any) => l.url)).toEqual([TIKTOK, 'https://seriouseats.com/ragu']);
  expect(more.sourceUrl).toBe('https://seriouseats.com/ragu');
  expect(more.videoUrl).toBe(TIKTOK);
});

test('a new client sending links sets the whole list, and an empty one clears it', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Ragu', [{ name: 'mince', qty: 1, unit: 'kg' }], {
    links: [{ url: BLOG, label: null }, { url: TIKTOK, label: null }],
  });
  const reordered = await call('PUT', `/api/recipes/${r.id}`, {
    token, body: { ...oldPhoneBody(r), links: [{ url: TIKTOK, label: 'Watch' }, { url: BLOG, label: null }] },
  });
  expect(reordered.links).toEqual([{ url: TIKTOK, label: 'Watch' }, { url: BLOG, label: null }]);

  const cleared = await call('PUT', `/api/recipes/${r.id}`, { token, body: { ...oldPhoneBody(r), links: [] } });
  expect(cleared.links).toEqual([]);
  expect(cleared.sourceUrl).toBeNull();
  expect(cleared.videoUrl).toBeNull();
});

test('the recipe page link editor and the old video endpoint', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Ragu', [{ name: 'mince', qty: 1, unit: 'kg' }]);

  const set = await call('PUT', `/api/recipes/${r.id}/links`, {
    token, body: { links: [{ url: BLOG, label: null }, { url: TIKTOK, label: null }] },
  });
  expect(set.links.map((l: any) => l.url)).toEqual([BLOG, TIKTOK]);

  // PUT /video swaps the video in place and leaves the other links where they are.
  const swapped = await call('PUT', `/api/recipes/${r.id}/video`, { token, body: { videoUrl: 'youtu.be/abc' } });
  expect(swapped.links.map((l: any) => l.url)).toEqual([BLOG, 'https://youtu.be/abc']);
  expect(swapped.videoUrl).toBe('https://youtu.be/abc');
  const removed = await call('PUT', `/api/recipes/${r.id}/video`, { token, body: { videoUrl: '' } });
  expect(removed.links.map((l: any) => l.url)).toEqual([BLOG]);
  expect(removed.videoUrl).toBeNull();
  const added = await call('PUT', `/api/recipes/${r.id}/video`, { token, body: { videoUrl: TIKTOK } });
  expect(added.links.map((l: any) => l.url)).toEqual([BLOG, TIKTOK]);

  // The old box took "any" video link. One on a site not known for videos goes beside the
  // TikTok, named as a video, rather than replacing it.
  const beside = await call('PUT', `/api/recipes/${r.id}/video`, { token, body: { videoUrl: 'https://example.com/clip' } });
  expect(beside.links).toEqual([
    { url: BLOG, label: null }, { url: TIKTOK, label: null }, { url: 'https://example.com/clip', label: 'Video' },
  ]);
  expect(beside.videoUrl).toBe(TIKTOK);
});

test('limits are counted after cleaning, and said in a sentence', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Ragu', [{ name: 'mince', qty: 1, unit: 'kg' }]);

  // Twenty links and the empty row the form always has: twenty links, saved.
  const twenty = Array.from({ length: 20 }, (_, i) => ({ url: `https://example.com/${i}`, label: null }));
  const full = await call('PUT', `/api/recipes/${r.id}/links`, { token, body: { links: [...twenty, { url: '', label: null }] } });
  expect(full.links).toHaveLength(20);

  // An old phone adding a link to a full recipe still saves everything else.
  const old = await call('PUT', `/api/recipes/${r.id}`, {
    token, body: { ...oldPhoneBody(full), name: 'Ragu again', videoUrl: TIKTOK },
  });
  expect(old.name).toBe('Ragu again');
  expect(old.links).toHaveLength(20);

  // A name too long is said as such, not as "size must be between 0 and 60".
  const refused = await call('PUT', `/api/recipes/${r.id}/links`, {
    token, body: { links: [{ url: BLOG, label: 'x'.repeat(61) }] },
  }).catch((e) => e);
  expect(refused).toBeInstanceOf(ApiError);
  expect(refused.status).toBe(400);
  expect(refused.body).toContain("Keep a link's name under 60 characters");
});

test('links are refused when they are not links, or not yours to change', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Ragu', [{ name: 'mince', qty: 1, unit: 'kg' }]);

  for (const url of ['javascript:alert(1)', 'not a link']) {
    expect(await statusOf('PUT', `/api/recipes/${r.id}/links`, { token, body: { links: [{ url, label: null }] } })).toBe(400);
  }
  expect(await statusOf('PUT', `/api/recipes/${r.id}/links`, {
    token, body: { links: [{ url: BLOG, label: 'x'.repeat(61) }] },
  })).toBe(400);
  expect(await statusOf('PUT', `/api/recipes/${r.id}/links`, {
    token, body: { links: Array.from({ length: 21 }, (_, i) => ({ url: `https://example.com/${i}`, label: null })) },
  })).toBe(400);

  const elsewhere = await newHousehold();
  const outsider = await newMember(elsewhere.id);
  expect(await statusOf('PUT', `/api/recipes/${r.id}/links`, {
    token: outsider.token, body: { links: [{ url: BLOG, label: null }] },
  })).toBe(403);
});

test('the public link, Explore and the dashboard API all carry the links', async () => {
  const hh = await newHousehold();
  const { token } = await admin();
  const r = await newRecipe(hh.id, 'Ragu', [{ name: 'mince', qty: 1, unit: 'kg' }], {
    links: [{ url: BLOG, label: 'Blog' }, { url: TIKTOK, label: null }],
  });

  const { token: share } = await call('POST', `/api/recipes/${r.id}/link`, { token });
  const pub = await call('GET', `/api/public/recipes/${share}`);
  expect(pub.links).toEqual(r.links);
  expect(pub).toMatchObject({ sourceUrl: BLOG, videoUrl: TIKTOK });

  await call('PUT', `/api/recipes/${r.id}/published`, { token, body: { published: true } });
  const explore = await call('GET', `/api/households/${hh.id}/explore`, { token });
  expect(explore.find((x: any) => x.id === r.id).links).toEqual(r.links);
  await call('PUT', `/api/recipes/${r.id}/published`, { token, body: { published: false } });

  const key = { 'x-api-key': INTEGRATION_KEY };
  if ((await statusOf('GET', '/api/integration/households', { headers: key })) === 200) {
    const detail = await call('GET', `/api/integration/recipes/${r.id}`, { headers: key });
    expect(detail.links).toEqual(r.links);
    expect(detail).toMatchObject({ sourceUrl: BLOG, videoUrl: TIKTOK });
  }
});
