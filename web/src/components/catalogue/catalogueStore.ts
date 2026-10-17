import { useEffect, useSyncExternalStore } from 'react';
import { api, ApiError } from '../../api/client';
import type { Recipe, RecipeCategory, RecipeSection } from '../../api/types';
import { byName, sameName, tagNamed, wears } from '../../utils/tags';

/*
 The catalogue — a household's recipes and its tags — kept for as long as the app is open, and
 shared by every screen that shows it: the front of Recipes, a drawer, the recipe form, the plan
 picker. A screen draws what is kept straight away and asks the server again behind it, so going
 back into a drawer never sits on "Loading…".

 Tag changes are made here. Each one shows the moment it is asked for, goes to the server as one
 request, and is put back — with the server's reason — if it is refused. Nothing reloads the
 catalogue after a change: what the server answers is what goes on screen. A load that comes
 back across a change cannot tell which is newer, so it is set aside and asked for again once
 the change has been answered — what other phones did still arrives, just a moment later.
*/

interface Entry {
  recipes: Recipe[] | null;
  tags: RecipeCategory[] | null;
  /** Loading the recipes failed, and there was nothing kept to show instead. */
  failed: boolean;
}

const EMPTY: Entry = { recipes: null, tags: null, failed: false };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
/** Counts the changes made here, so a load that set off before one cannot quietly undo it. */
const edits = new Map<string, number>();
const loading = new Map<string, Promise<void>>();
/** Changes sent to the server and not answered yet, per household. */
const sending = new Map<string, number>();
/** Loads set aside because a change was still on its way, asked for again once none is. */
const owed = new Map<string, Set<'recipes' | 'tags'>>();

function read(householdId: string | null): Entry {
  return (householdId && entries.get(householdId)) || EMPTY;
}

function write(householdId: string, change: (entry: Entry) => Partial<Entry>, isEdit = true) {
  const before = read(householdId);
  entries.set(householdId, { ...before, ...change(before) });
  if (isEdit) edits.set(householdId, (edits.get(householdId) ?? 0) + 1);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function load(householdId: string, what: 'recipes' | 'tags'): Promise<void> {
  const key = `${householdId}:${what}`;
  const running = loading.get(key);
  if (running) return running;
  const since = edits.get(householdId) ?? 0;
  let again = false;
  const path =
    what === 'recipes' ? `/api/households/${householdId}/recipes` : `/api/households/${householdId}/recipe-categories`;
  const done = api<Recipe[] | RecipeCategory[]>('GET', path)
    .then(
      (answer) =>
        write(
          householdId,
          (entry) => {
            // A change made while this was on its way, or still on its way now, may be newer than
            // the answer: keep what is on screen, unless there was nothing at all to show before,
            // and ask again once the change has been answered — so the rest of the answer (what
            // other phones did meanwhile) is not lost with it.
            const changed = (edits.get(householdId) ?? 0) !== since;
            const out = (sending.get(householdId) ?? 0) > 0;
            if ((changed || out) && entry[what] !== null) {
              if (out) owed.set(householdId, (owed.get(householdId) ?? new Set()).add(what));
              else again = true;
              return {};
            }
            return what === 'recipes' ? { recipes: answer as Recipe[], failed: false } : { tags: answer as RecipeCategory[] };
          },
          false,
        ),
      // Refused when you have just been taken out of this house (the switch to another loads
      // that one), or offline: whatever was kept stays on screen.
      () =>
        write(householdId, (entry) => (what === 'recipes' ? { failed: entry.recipes === null } : { tags: entry.tags ?? [] }), false),
    )
    .finally(() => {
      loading.delete(key);
      if (again) load(householdId, what);
    });
  loading.set(key, done);
  return done;
}

/** A load that sets off after the one on its way, if there is one — for news that one predates. */
function loadAfter(householdId: string, what: 'recipes' | 'tags'): Promise<void> {
  const running = loading.get(`${householdId}:${what}`);
  return running ? running.then(() => load(householdId, what)) : load(householdId, what);
}

/**
 * Counts a change in as it is sent. What it gives back counts it out, called once the change's
 * answer (or its undoing) is on screen; the last one out asks for any loads set aside meanwhile.
 */
function sendingChange(householdId: string): () => void {
  sending.set(householdId, (sending.get(householdId) ?? 0) + 1);
  let counted = false;
  return () => {
    if (counted) return;
    counted = true;
    const left = (sending.get(householdId) ?? 1) - 1;
    sending.set(householdId, left);
    if (left > 0) return;
    const due = owed.get(householdId);
    owed.delete(householdId);
    due?.forEach((what) => load(householdId, what));
  };
}

/**
 * After the server says no to a tag change — often because another phone changed the same tags
 * first, making one by that name or deleting this one — the tags are asked for again, so what
 * the refusal is about is on screen. Being offline is not that, and keeps what is there.
 */
function recheckTags(householdId: string, err: unknown): Promise<void> {
  return err instanceof ApiError ? loadAfter(householdId, 'tags') : Promise.resolve();
}

/** The household's recipes and tags, as kept, fetched again whenever a screen using them opens. */
export function useCatalogue(householdId: string | null): Entry & { retry: () => void } {
  const entry = useSyncExternalStore(subscribe, () => read(householdId));
  useEffect(() => {
    if (!householdId) return;
    load(householdId, 'recipes');
    load(householdId, 'tags');
  }, [householdId]);
  return {
    ...entry,
    retry: () => {
      if (!householdId) return;
      write(householdId, () => ({ failed: false }), false);
      load(householdId, 'recipes');
    },
  };
}

/** Just the household's tags — for a form or a picker that has no use for every recipe. */
export function useTags(householdId: string | null): RecipeCategory[] | null {
  const entry = useSyncExternalStore(subscribe, () => read(householdId));
  useEffect(() => {
    if (householdId) load(householdId, 'tags');
  }, [householdId]);
  return entry.tags;
}

/** A recipe as last seen in a list, to draw while its own page loads. */
export function cachedRecipe(householdId: string | null, recipeId: string | undefined): Recipe | null {
  return read(householdId).recipes?.find((r) => r.id === recipeId) ?? null;
}

/**
 * A recipe just saved somewhere else — the form, Organise — so the lists show it as saved. One
 * filed under a tag name its drawer did not have made that tag, so the tags are asked for again.
 */
export function rememberRecipe(householdId: string, recipe: Recipe) {
  const entry = read(householdId);
  if (entry.recipes) {
    write(householdId, (e) => ({
      recipes: e.recipes!.some((r) => r.id === recipe.id)
        ? e.recipes!.map((r) => (r.id === recipe.id ? recipe : r))
        : [...e.recipes!, recipe],
    }));
  }
  const section = recipe.section;
  if (entry.tags && section && recipe.categories.some((name) => !tagNamed(entry.tags!, section, name))) {
    load(householdId, 'tags');
  }
}

/** A recipe deleted, off every list at once. */
export function forgetRecipe(householdId: string, recipeId: string) {
  if (!read(householdId).recipes) return;
  write(householdId, (e) => ({ recipes: e.recipes!.filter((r) => r.id !== recipeId) }));
}

// --- Changing tags --------------------------------------------------------------------------

const TEMP = 'new-';
/** Tags still being made, by the id they wear until the server gives them theirs. */
const making = new Map<string, Promise<RecipeCategory>>();

/** Not saved yet: shown, but nothing can be done to it until the server has it. */
export function isUnsaved(tag: RecipeCategory): boolean {
  return tag.id.startsWith(TEMP);
}

/** The tag as the server knows it, waiting for one that is still being made. */
async function saved(tag: RecipeCategory): Promise<RecipeCategory> {
  if (!isUnsaved(tag)) return tag;
  const made = making.get(tag.id);
  if (!made) throw new Error(`${tag.name} was not made.`);
  return made;
}

const withTag = (name: string) => (categories: string[]) =>
  categories.some((c) => sameName(c, name)) ? categories : [...categories, name].sort(byName);
const withoutTag = (name: string) => (categories: string[]) => categories.filter((c) => !sameName(c, name));

/** Changes the tag names on these recipes, where they are filed in that drawer. */
function retag(householdId: string, section: RecipeSection, ids: Set<string>, change: (categories: string[]) => string[]) {
  if (ids.size === 0) return;
  write(householdId, (e) => ({
    recipes:
      e.recipes?.map((r) => (ids.has(r.id) && r.section === section ? { ...r, categories: change(r.categories) } : r)) ?? null,
  }));
}

function replaceTag(householdId: string, id: string, tag: RecipeCategory) {
  write(householdId, (e) => ({ tags: (e.tags ?? []).map((t) => (t.id === id ? tag : t)) }));
}

/** The ids among `ids` of recipes that do, or do not, wear the tag now. */
function whichWear(householdId: string, tag: Pick<RecipeCategory, 'name' | 'section'>, ids: string[], wearing: boolean) {
  const wanted = new Set(ids);
  return new Set(
    (read(householdId).recipes ?? []).filter((r) => wanted.has(r.id) && wears(r, tag) === wearing).map((r) => r.id),
  );
}

/**
 * Makes a tag in a drawer, on these recipes too if any are given — in one request. The tag is on
 * screen at once, under an id of its own until the server answers; `saved` is the tag as made.
 *
 * A name another phone has made since these tags were fetched is refused as a copy. Rather than
 * leave you stuck on a tag you cannot see, the tags are fetched again and that one is used —
 * on these recipes too — so `saved` is the tag that was already there.
 */
export function createTag(
  householdId: string,
  section: RecipeSection,
  name: string,
  recipeIds: string[] = [],
): { tag: RecipeCategory; saved: Promise<RecipeCategory> } {
  const tag: RecipeCategory = {
    id: TEMP + Math.random().toString(36).slice(2),
    name: name.trim(),
    section,
    recipeCount: recipeIds.length,
    parentId: null,
    iconKey: null,
  };
  const tagged = whichWear(householdId, tag, recipeIds, false);
  write(householdId, (e) => ({ tags: [...(e.tags ?? []), tag] }));
  retag(householdId, section, tagged, withTag(tag.name));
  const finished = sendingChange(householdId);
  const made = api<RecipeCategory>('POST', `/api/households/${householdId}/recipe-categories`, {
    name: tag.name,
    section,
    recipeIds,
  }).then(
    (answer) => {
      replaceTag(householdId, tag.id, answer);
      finished();
      return answer;
    },
    async (err) => {
      write(householdId, (e) => ({ tags: (e.tags ?? []).filter((t) => t.id !== tag.id) }));
      retag(householdId, section, tagged, withoutTag(tag.name));
      finished();
      await recheckTags(householdId, err);
      const there =
        err instanceof ApiError && err.status === 409 ? tagNamed(read(householdId).tags ?? [], section, tag.name) : undefined;
      if (!there) throw err;
      if (recipeIds.length) await tagRecipes(householdId, there, recipeIds, []);
      return tagNamed(read(householdId).tags ?? [], section, tag.name) ?? there;
    },
  );
  making.set(tag.id, made);
  return { tag, saved: made };
}

/** Puts a tag on some recipes and takes it off others, in one request. */
export async function tagRecipes(householdId: string, tag: RecipeCategory, add: string[], remove: string[]) {
  const adding = whichWear(householdId, tag, add, false);
  const removing = whichWear(householdId, tag, remove.filter((id) => !add.includes(id)), true);
  retag(householdId, tag.section, adding, withTag(tag.name));
  retag(householdId, tag.section, removing, withoutTag(tag.name));
  const finished = sendingChange(householdId);
  try {
    const real = await saved(tag);
    const answer = await api<RecipeCategory>('PUT', `/api/households/${householdId}/recipe-categories/${real.id}/recipes`, {
      add: [...adding],
      remove: [...removing],
    });
    replaceTag(householdId, real.id, answer);
  } catch (err) {
    retag(householdId, tag.section, adding, withoutTag(tag.name));
    retag(householdId, tag.section, removing, withTag(tag.name));
    finished();
    void recheckTags(householdId, err);
    throw err;
  } finally {
    finished();
  }
}

/** Renames a tag, on every recipe that wears it too. */
export async function renameTag(householdId: string, tag: RecipeCategory, name: string) {
  const wearing = new Set((read(householdId).recipes ?? []).filter((r) => wears(r, tag)).map((r) => r.id));
  const rename = (from: string, to: string) => {
    replaceTag(householdId, tag.id, { ...tag, name: to });
    retag(householdId, tag.section, wearing, (categories) => withTag(to)(withoutTag(from)(categories)));
  };
  rename(tag.name, name);
  const finished = sendingChange(householdId);
  try {
    replaceTag(
      householdId,
      tag.id,
      await api<RecipeCategory>('PATCH', `/api/households/${householdId}/recipe-categories/${tag.id}`, { name }),
    );
  } catch (err) {
    rename(name, tag.name);
    finished();
    void recheckTags(householdId, err);
    throw err;
  } finally {
    finished();
  }
}

/** Gives a tag one of the food drawings, or (null) takes its drawing off. */
export async function setTagIcon(householdId: string, tag: RecipeCategory, iconKey: string | null) {
  replaceTag(householdId, tag.id, { ...tag, iconKey });
  const finished = sendingChange(householdId);
  try {
    replaceTag(
      householdId,
      tag.id,
      // An empty string is how the server is told to take it off; null would mean "unchanged".
      await api<RecipeCategory>('PATCH', `/api/households/${householdId}/recipe-categories/${tag.id}`, {
        iconKey: iconKey ?? '',
      }),
    );
  } catch (err) {
    replaceTag(householdId, tag.id, tag);
    finished();
    void recheckTags(householdId, err);
    throw err;
  } finally {
    finished();
  }
}

/** Deletes a tag: it comes off its recipes, and the recipes stay where they are. */
export async function deleteTag(householdId: string, tag: RecipeCategory) {
  const wearing = new Set((read(householdId).recipes ?? []).filter((r) => wears(r, tag)).map((r) => r.id));
  write(householdId, (e) => ({ tags: (e.tags ?? []).filter((t) => t.id !== tag.id) }));
  retag(householdId, tag.section, wearing, withoutTag(tag.name));
  const finished = sendingChange(householdId);
  try {
    await api('DELETE', `/api/households/${householdId}/recipe-categories/${tag.id}`);
  } catch (err) {
    write(householdId, (e) => ({ tags: [...(e.tags ?? []), tag] }));
    retag(householdId, tag.section, wearing, withTag(tag.name));
    finished();
    void recheckTags(householdId, err);
    throw err;
  } finally {
    finished();
  }
}

export interface Moved {
  moved: number;
  failed: number;
  /** Tag names that came off because the new drawer has no tag called that. */
  dropped: string[];
}

/**
 * Moves recipes to another drawer, a request each, all at once. Tags belong to a drawer, so each
 * keeps only the ones the new drawer already has — never a new, empty copy made there.
 */
export async function moveRecipes(householdId: string, recipes: Recipe[], to: RecipeSection): Promise<Moved> {
  const tags = read(householdId).tags ?? [];
  const dropped: string[] = [];
  const filings = recipes.map((r) => {
    const keep: string[] = [];
    for (const name of r.categories) {
      const there = tagNamed(tags, to, name);
      if (there) keep.push(there.name);
      else if (!dropped.some((d) => sameName(d, name))) dropped.push(name);
    }
    return { recipe: r, filing: { section: to, categories: keep } };
  });
  const before = new Map(recipes.map((r) => [r.id, r]));
  const moving = new Map(filings.map(({ recipe, filing }) => [recipe.id, { ...recipe, ...filing }]));
  write(householdId, (e) => ({ recipes: e.recipes?.map((r) => moving.get(r.id) ?? r) ?? null }));

  const finished = sendingChange(householdId);
  const answers = await Promise.allSettled(
    filings.map(({ recipe, filing }) =>
      api<Recipe>('PUT', `/api/households/${householdId}/recipes/${recipe.id}/filing`, filing),
    ),
  );
  const settled = new Map<string, Recipe>();
  answers.forEach((answer, i) => {
    const id = filings[i].recipe.id;
    settled.set(id, answer.status === 'fulfilled' ? answer.value : before.get(id)!);
  });
  write(householdId, (e) => ({ recipes: e.recipes?.map((r) => settled.get(r.id) ?? r) ?? null }));
  finished();
  const failed = answers.filter((a) => a.status === 'rejected').length;
  return { moved: answers.length - failed, failed, dropped: failed === answers.length ? [] : dropped };
}
