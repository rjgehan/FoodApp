import { expect, test } from '@playwright/test';
import { ApiError, call, newHousehold, newMember, statusOf } from '../../lib/api';

/*
 * The ways into a new recipe, from the server's side: "Write it for me" is gone, the AI status
 * the grocery sort needs has a name of its own, and "From a link" copes with what people paste.
 */

test('the recipe writer is gone, and the AI status lives at /api/ai', async () => {
  const hh = await newHousehold();
  // The suite runs with no Gemini key, so the grocery sort is off.
  expect(await call('GET', '/api/ai', { token: hh.owner.token })).toEqual({ enabled: false });
  // The old path answers the same, for a tab opened before the deploy.
  expect(await call('GET', '/api/recipe-writer', { token: hh.owner.token })).toEqual({ enabled: false });
  expect([404, 405]).toContain(
    await statusOf('POST', `/api/households/${hh.id}/recipes/generate`, {
      token: hh.owner.token,
      body: { name: 'Chicken parmesan', servings: 4 },
    }),
  );
});

/** The server's sentence for a refused import. */
async function refusal(householdId: string, token: string, url: string): Promise<{ status: number; message: string }> {
  try {
    await call('POST', `/api/households/${householdId}/recipes/import`, { token, body: { url } });
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, message: JSON.parse(e.body).message };
    throw e;
  }
  throw new Error('the import was not refused');
}

test('from a link: the link inside a pasted share-sheet sentence is the one read', async () => {
  const hh = await newHousehold();
  // Nothing outside the machine is fetched: a loopback address is refused before any request,
  // and being refused for *that* reason proves the link was found inside the sentence.
  const shared = await refusal(hh.id, hh.owner.token, 'Check out this recipe! http://127.0.0.1:9/soup #dinner');
  expect(shared).toEqual({ status: 400, message: 'That link points inside the network.' });

  // Typed without https:// — taken as a web address, not refused as "not a link".
  const bare = await refusal(hh.id, hh.owner.token, '127.0.0.1:9/soup');
  expect(bare.message).toBe('That link points inside the network.');
});

test('from a link: anything that is not a web link is refused in a sentence', async () => {
  const hh = await newHousehold();
  expect(await refusal(hh.id, hh.owner.token, 'javascript:alert(1)')).toEqual({
    status: 400,
    message: 'Only web links can be imported.',
  });
  expect((await refusal(hh.id, hh.owner.token, 'chicken soup')).status).toBe(400);
});

test('from a link: only members of the household can import into it', async () => {
  const hh = await newHousehold();
  const outsider = await newMember((await newHousehold()).id);
  expect(
    await statusOf('POST', `/api/households/${hh.id}/recipes/import`, {
      token: outsider.token,
      body: { url: 'https://example.com/soup' },
    }),
  ).toBe(403);
});
