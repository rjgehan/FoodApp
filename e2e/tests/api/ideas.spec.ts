import { expect, test } from '@playwright/test';
import {
  admin,
  adminByPassword,
  call,
  newHousehold,
  newMember,
  statusOf,
  unique,
  type Member,
  type Session,
} from '../../lib/api';

/*
 * The beta's ideas board: one board for the whole app, not one per house. Anyone signed in
 * suggests ideas and upvotes them (once each); the author rewords or takes back their own; the
 * admin — signed in with a password, as for the admin pages — says where an idea is up to and can
 * take down anybody's. Switching the board off (IDEAS_BOARD=false) is covered by the backend's
 * IdeasSwitchedOffDatabaseTest, since it needs the server restarted.
 *
 * The board is shared by every test and every run, so each test takes down what it put up.
 */

const made: string[] = [];

test.afterEach(async () => {
  const boss = await adminByPassword();
  while (made.length) await statusOf('DELETE', `/api/ideas/${made.pop()}`, { token: boss.token });
});

async function suggest(who: Session, title = unique('Idea'), details?: string) {
  const idea = await call('POST', '/api/ideas', { token: who.token, body: { title, details } });
  made.push(idea.id);
  return idea;
}

async function board(who: Session, sort?: 'top' | 'new') {
  return call('GET', `/api/ideas${sort ? `?sort=${sort}` : ''}`, { token: who.token });
}

/** Where each of these ideas sits on the board, in order, ignoring everybody else's. */
async function orderOf(who: Session, sort: 'top' | 'new', ids: string[]) {
  return (await board(who, sort)).map((i: any) => i.id).filter((id: string) => ids.includes(id));
}

async function twoPeople(): Promise<[Member, Member]> {
  const hh = await newHousehold();
  return [await newMember(hh.id), await newMember(hh.id)];
}

test('the board is open, and a new idea shows to everyone with who suggested it', async () => {
  const [author, reader] = await twoPeople();
  expect((await call('GET', '/api/users/me', { token: author.token })).ideasBoard).toBe(true);
  // A household is no part of it: somebody in another house sees the same board.
  const stranger = await newMember((await newHousehold()).id);

  const idea = await suggest(author, `  ${unique('Dark mode')}  `, '  For cooking late.  ');
  expect(idea).toMatchObject({ status: 'OPEN', mine: true, voteCount: 0, votedByMe: false, details: 'For cooking late.' });
  expect(idea.title).toBe(idea.title.trim());
  expect(idea.authorName).toBe(author.displayName);

  for (const who of [reader, stranger]) {
    const seen = (await board(who)).find((i: any) => i.id === idea.id);
    expect(seen).toMatchObject({ title: idea.title, authorName: author.displayName, mine: false });
  }
  expect((await board(author, 'new')).some((i: any) => i.id === idea.id)).toBe(true);
});

test('every field the phone decodes is there', async () => {
  const [author] = await twoPeople();
  const idea = await suggest(author);
  const seen = (await board(author)).find((i: any) => i.id === idea.id);
  for (const key of ['id', 'title', 'details', 'status', 'authorName', 'mine', 'voteCount', 'votedByMe', 'createdAt', 'updatedAt']) {
    expect(seen).toHaveProperty(key);
  }
  const me = await call('GET', '/api/users/me', { token: author.token });
  expect(me).toMatchObject({ admin: false, ideasBoard: true });
});

test('a vote is one per person however often it is sent, and your own idea can have yours', async () => {
  const [author, fan] = await twoPeople();
  const idea = await suggest(author);
  const vote = (who: Session, method: 'PUT' | 'DELETE') => call(method, `/api/ideas/${idea.id}/vote`, { token: who.token });

  expect(await vote(author, 'PUT')).toMatchObject({ voteCount: 1, votedByMe: true });
  expect(await vote(author, 'PUT')).toMatchObject({ voteCount: 1, votedByMe: true });
  expect(await vote(fan, 'PUT')).toMatchObject({ voteCount: 2, votedByMe: true, mine: false });

  // A double tap sends two at once; still one vote.
  await Promise.all([vote(fan, 'PUT'), vote(fan, 'PUT')]);
  expect((await board(author)).find((i: any) => i.id === idea.id)).toMatchObject({ voteCount: 2, votedByMe: true });

  expect(await vote(fan, 'DELETE')).toMatchObject({ voteCount: 1, votedByMe: false });
  expect(await vote(fan, 'DELETE')).toMatchObject({ voteCount: 1, votedByMe: false });
  expect((await board(fan)).find((i: any) => i.id === idea.id)).toMatchObject({ voteCount: 1, votedByMe: false });
});

test('top is most votes first with settled ideas last; new is newest first', async () => {
  const [author, fan] = await twoPeople();
  const quiet = await suggest(author, unique('Quiet'));
  const popular = await suggest(author, unique('Popular'));
  const liked = await suggest(author, unique('Liked'));
  const ids = [quiet.id, popular.id, liked.id];
  for (const who of [author, fan]) await call('PUT', `/api/ideas/${popular.id}/vote`, { token: who.token });
  await call('PUT', `/api/ideas/${liked.id}/vote`, { token: fan.token });

  expect(await orderOf(author, 'top', ids)).toEqual([popular.id, liked.id, quiet.id]);
  expect(await orderOf(author, 'new', ids)).toEqual([liked.id, popular.id, quiet.id]);
  // Top is what you get without asking.
  expect((await board(author)).map((i: any) => i.id).filter((id: string) => ids.includes(id))).toEqual([popular.id, liked.id, quiet.id]);

  // Done: no longer asking for votes, so below the ones that are.
  const boss = await adminByPassword();
  await call('PATCH', `/api/ideas/${popular.id}/status`, { token: boss.token, body: { status: 'DONE' } });
  expect(await orderOf(author, 'top', ids)).toEqual([liked.id, quiet.id, popular.id]);
  expect(await orderOf(author, 'new', ids)).toEqual([liked.id, popular.id, quiet.id]);
});

test('only the author rewords or takes back an idea, and the admin can take down anybody’s', async () => {
  const [author, other] = await twoPeople();
  const idea = await suggest(author, unique('Timers'));
  const path = `/api/ideas/${idea.id}`;

  expect(await statusOf('PUT', path, { token: other.token, body: { title: 'Mine now' } })).toBe(403);
  expect(await statusOf('DELETE', path, { token: other.token })).toBe(403);
  // The admin by PIN is anybody; and even signed in properly, rewording is the author's alone.
  expect(await statusOf('DELETE', path, { token: (await admin()).token })).toBe(403);
  expect(await statusOf('PUT', path, { token: (await adminByPassword()).token, body: { title: 'Better' } })).toBe(403);

  const reworded = await call('PUT', path, { token: author.token, body: { title: ' Cooking timers ', details: '' } });
  expect(reworded).toMatchObject({ title: 'Cooking timers', details: null, mine: true });

  expect(await statusOf('DELETE', path, { token: (await adminByPassword()).token })).toBe(200);
  expect((await board(author)).some((i: any) => i.id === idea.id)).toBe(false);
  expect(await statusOf('PUT', `${path}/vote`, { token: author.token })).toBe(404);

  const second = await suggest(author);
  expect(await statusOf('DELETE', `/api/ideas/${second.id}`, { token: author.token })).toBe(200);
  expect(await statusOf('DELETE', `/api/ideas/${second.id}`, { token: author.token })).toBe(404);
});

test('only the admin, signed in with a password, says where an idea is up to', async () => {
  const [author] = await twoPeople();
  const idea = await suggest(author);
  const path = `/api/ideas/${idea.id}/status`;

  expect(await statusOf('PATCH', path, { token: author.token, body: { status: 'PLANNED' } })).toBe(403);
  expect(await statusOf('PATCH', path, { token: (await admin()).token, body: { status: 'PLANNED' } })).toBe(403);

  const boss = await adminByPassword();
  for (const status of ['PLANNED', 'DONE', 'NOT_DOING', 'OPEN'] as const) {
    expect(await call('PATCH', path, { token: boss.token, body: { status } })).toMatchObject({ status, mine: false });
  }
  await call('PATCH', path, { token: boss.token, body: { status: 'PLANNED' } });
  expect((await board(author)).find((i: any) => i.id === idea.id)).toMatchObject({ status: 'PLANNED', mine: true });

  expect(await statusOf('PATCH', path, { token: boss.token, body: { status: 'MAYBE' } })).toBe(400);
  expect(await statusOf('PATCH', path, { token: boss.token, body: {} })).toBe(400);
  expect(await statusOf('PATCH', '/api/ideas/00000000-0000-0000-0000-000000000000/status', {
    token: boss.token, body: { status: 'DONE' },
  })).toBe(404);
});

test('an idea needs a title of 80 characters at most, and details of 1000 at most', async () => {
  const [author] = await twoPeople();
  for (const body of [{ title: '' }, { title: '   ' }, {}, { title: 'x'.repeat(81) }, { title: 'Fine', details: 'x'.repeat(1001) }]) {
    expect(await statusOf('POST', '/api/ideas', { token: author.token, body })).toBe(400);
  }
  const res = await fetch(`${process.env.API_URL ?? 'http://localhost:8080'}/api/ideas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${author.token}` },
    body: JSON.stringify({ title: ' ' }),
  });
  expect(await res.json()).toMatchObject({ status: 400, message: 'Give your idea a title.' });

  const longest = await suggest(author, 'x'.repeat(80), 'y'.repeat(1000));
  expect(longest.title).toHaveLength(80);
  expect(longest.details).toHaveLength(1000);
});

test('ten new ideas a day each, and then a polite no', async () => {
  const [keen, calm] = await twoPeople();
  for (let i = 0; i < 10; i++) await suggest(keen, unique(`Idea ${i}`));
  const res = await fetch(`${process.env.API_URL ?? 'http://localhost:8080'}/api/ideas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${keen.token}` },
    body: JSON.stringify({ title: unique('One too many') }),
  });
  expect(res.status).toBe(429);
  expect((await res.json()).message).toMatch(/tomorrow/);
  // Everybody else carries on.
  expect((await suggest(calm)).mine).toBe(true);
});

test('deleting an account takes its votes and leaves its ideas, from Someone', async () => {
  const [leaving, staying] = await twoPeople();
  const theirs = await suggest(leaving);
  const mine = await suggest(staying);
  await call('PUT', `/api/ideas/${theirs.id}/vote`, { token: staying.token });
  await call('PUT', `/api/ideas/${theirs.id}/vote`, { token: leaving.token });
  await call('PUT', `/api/ideas/${mine.id}/vote`, { token: leaving.token });

  await call('DELETE', `/api/admin/users/${leaving.userId}`, { token: (await adminByPassword()).token });

  const now = await board(staying);
  expect(now.find((i: any) => i.id === theirs.id)).toMatchObject({
    authorName: 'Someone', mine: false, voteCount: 1, votedByMe: true,
  });
  expect(now.find((i: any) => i.id === mine.id)).toMatchObject({ voteCount: 0, mine: true });
});

test('signed out, there is no board', async () => {
  expect(await statusOf('GET', '/api/ideas')).toBe(401);
  expect(await statusOf('POST', '/api/ideas', { body: { title: 'Anonymous' } })).toBe(401);
});
