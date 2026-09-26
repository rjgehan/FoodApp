import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import NoHousehold from '../components/NoHousehold';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Recipe, RecipeCategory, RecipeSection } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { ActionMenu, Button, Card, Chip, EmptyState, ErrorText, Field, Input, Sheet } from '../components/ui';
import { ChevronLeftIcon, PlusIcon } from '../components/icons';
import RecipeGrid from '../components/RecipeGrid';
import { PageTitle } from '../components/PageTitle';
import { SHARED_KEY, sectionFromSlug, sectionLabel } from '../utils/recipeMeta';
import { iconByKey } from '../components/FoodIcons';
import { buildTree, isIn, suggestGroup, suggestSplit, type CategoryTree } from '../utils/categoryTree';
import GroupTree, { groupDetail } from '../components/GroupTree';
import EditGroupsSheet from '../components/EditGroupsSheet';
import IconPicker from '../components/IconPicker';

function errorMessage(err: unknown, fallback: string): string {
  return (err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null) ?? fallback;
}

/**
 * One drawer of the catalog. Dinner shows every group nested inside it at once — Main dish, and
 * Chicken indented under it, and so on — rather than one level per screen, and recipes only
 * appear once there is nothing smaller to open. The current group is in the URL (?group=), so
 * opening one re-roots the tree there and Back walks back up to where you came from.
 */
export default function RecipeSectionPage() {
  const { section: slug } = useParams<{ section: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeHouseholdId } = useHousehold();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [sorting, setSorting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingGroups, setEditingGroups] = useState(false);
  // Remembered on this phone: "Not now" that comes back on the next visit is just nagging.
  const [splitDismissed, setSplitDismissed] = useState<string[]>(readDismissedSplits);

  const isShared = slug === SHARED_KEY;
  const section = sectionFromSlug(slug);
  const groupId = params.get('group');

  const load = useCallback(async () => {
    if (!activeHouseholdId) return;
    const [all, groups] = await Promise.all([
      api<Recipe[]>('GET', `/api/households/${activeHouseholdId}/recipes`),
      api<RecipeCategory[]>('GET', `/api/households/${activeHouseholdId}/recipe-categories`),
    ]);
    setRecipes(all);
    setCategories(groups);
  }, [activeHouseholdId]);

  useEffect(() => {
    setRecipes(null);
    load();
  }, [load, slug]);

  // Another level is another screen: whatever you were doing on the last one stays there.
  useEffect(() => {
    setSorting(false);
    setAdding(false);
    setEditing(false);
    setEditingGroups(false);
  }, [groupId, slug]);

  // A drawer shows its own groups, plus any group that belongs to every drawer.
  const tree = useMemo(
    () => buildTree(categories.filter((c) => c.section === null || c.section === section)),
    [categories, section],
  );

  const inSection = useMemo(
    () =>
      (recipes ?? [])
        .filter((r) => (isShared ? r.section === null : r.section === section))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [recipes, section, isShared],
  );

  if (!activeHouseholdId) {
    return (
      <Card>
        <NoHousehold />
      </Card>
    );
  }

  if (!isShared && !section) {
    return (
      <Card>
        <EmptyState>
          No such section.{' '}
          <Link to="/recipes" className="font-medium text-accent underline">
            Back to recipes
          </Link>
        </EmptyState>
      </Card>
    );
  }

  const drawerName = isShared ? 'Shared with you' : sectionLabel(section);
  // A recipe started from in here is filed in here — the drawer, and the group you are in.
  const addHere = `/recipes/new?${new URLSearchParams({ section: section ?? '', ...(groupId ? { group: groupId } : {}) })}`;

  function goTo(id: string | null) {
    setParams(id ? { group: id } : {});
  }

  // Shared recipes have no filing of yours yet, so there is nothing to open — just the recipes.
  if (isShared) {
    return (
      <div className="space-y-4">
        <Header backLabel="Recipes" onBack={() => navigate('/recipes')} title={drawerName} />
        {inSection.length > 0 && (
          <p className="text-sm text-muted">
            From other households. Open one and choose Save to my recipes to keep it.
          </p>
        )}
        {recipes === null ? <Loading /> : inSection.length === 0 ? <Empty text="Nothing shared with you." /> : <RecipeGrid recipes={inSection} />}
      </div>
    );
  }

  const group = groupId ? tree.byId.get(groupId) ?? null : null;
  const parent = group?.parentId ? tree.byId.get(group.parentId) ?? null : null;
  const here = group ? inSection.filter((r) => isIn(r, group.id, tree)) : inSection;

  // Every group one level down — shown whether or not it holds a recipe from this drawer.
  const allChildren = tree.children(group?.id ?? null);
  // Here, but in none of the groups below: filed on this group itself, or on nothing at all.
  const loose = here.filter((r) => !allChildren.some((c) => isIn(r, c.id, tree)));
  const countFor = (id: string) => here.filter((r) => isIn(r, id, tree)).length;

  // Names a split-up group cannot take: this group and the ones above it.
  const taken = new Set((group ? tree.path(group.id) : []).map((c) => c.name.toLowerCase()));
  const splits =
    group && allChildren.length === 0 && here.length >= 3 && !splitDismissed.includes(group.id)
      ? suggestSplit(here, taken)
      : [];

  return (
    <div className="space-y-4">
      <Header
        backLabel={group ? parent?.name ?? drawerName : 'Recipes'}
        onBack={() => (group ? goTo(parent?.id ?? null) : navigate('/recipes'))}
        title={group?.name ?? drawerName}
        action={
          <div className="flex items-center gap-1">
            <Link
              to={addHere}
              className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-accent pl-2.5 pr-3.5 text-sm font-medium text-accent-ink active:opacity-80"
            >
              <PlusIcon className="h-4 w-4" />
              Add recipe
            </Link>
            <ActionMenu
              label={group ? `Options for ${group.name}` : `Options for ${drawerName}`}
              title={group?.name ?? drawerName}
              items={[
                { label: group ? `Add a group inside ${group.name}` : 'Add a group', onSelect: () => setAdding(true) },
                // The groups on this screen, all in one list — where their pictures are given.
                allChildren.length > 0 && {
                  label: group ? `Edit groups inside ${group.name}` : 'Edit groups',
                  onSelect: () => setEditingGroups(true),
                },
                group && { label: 'Edit group', onSelect: () => setEditing(true) },
              ]}
            />
          </div>
        }
      />

      {adding && (
        <AddGroup
          householdId={activeHouseholdId}
          parent={group}
          section={section}
          onCancel={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await load();
            // A new group is empty until something goes in it, so go straight to filling it.
            if (loose.length > 0 || (allChildren.length === 0 && here.length > 0)) setSorting(true);
          }}
        />
      )}

      {recipes === null ? (
        <Loading />
      ) : here.length === 0 && allChildren.length === 0 ? (
        <Card>
          <EmptyState>
            {group ? `Nothing from ${drawerName} in ${group.name} yet.` : 'Nothing filed here yet.'}{' '}
            <Link to={addHere} className="font-medium text-accent underline">
              Add a recipe
            </Link>
          </EmptyState>
        </Card>
      ) : sorting ? (
        <SortList
          householdId={activeHouseholdId}
          recipes={loose}
          groups={allChildren}
          from={group}
          onFiled={load}
          onDone={() => setSorting(false)}
        />
      ) : (
        <>
          {/* Groups but no recipes yet — a new household. The groups are what there is to see. */}
          {here.length === 0 && (
            <p className="text-[0.9375rem] text-muted">
              Nothing filed in {group?.name ?? drawerName} yet.{' '}
              <Link to={addHere} className="font-medium text-accent underline">
                Add a recipe
              </Link>
              , or open a group.
            </p>
          )}
          {splits.length > 0 && (
            <SplitSuggestion
              householdId={activeHouseholdId}
              group={group!}
              total={here.length}
              suggestions={splits}
              tree={tree}
              onDone={load}
              onDismiss={() =>
                setSplitDismissed((ids) => {
                  const next = [...ids, group!.id];
                  saveDismissedSplits(next);
                  return next;
                })
              }
            />
          )}

          {allChildren.length === 0 ? (
            // Nothing smaller to open: this is where the recipes are.
            <RecipeGrid recipes={here} />
          ) : (
            <>
              <GroupTree
                householdId={activeHouseholdId}
                tree={tree}
                rootId={group?.id ?? null}
                countFor={countFor}
                drawerName={drawerName}
                onNavigate={goTo}
                onChanged={load}
              />

              {loose.length > 0 && (
                <section className="space-y-3 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold">
                      {group ? `Everything else in ${group.name}` : 'Not in a group yet'}
                    </h2>
                    <Button size="sm" variant="ghost" onClick={() => setSorting(true)}>
                      Put in groups
                    </Button>
                  </div>
                  <RecipeGrid recipes={loose} />
                </section>
              )}
            </>
          )}
        </>
      )}

      {editingGroups && (
        <EditGroupsSheet
          householdId={activeHouseholdId}
          place={group?.name ?? drawerName}
          groups={allChildren}
          detailFor={(g) => groupDetail(countFor(g.id), tree.children(g.id).length)}
          onClose={() => setEditingGroups(false)}
          onChanged={load}
        />
      )}

      {editing && group && (
        <EditGroup
          householdId={activeHouseholdId}
          group={group}
          upTo={parent?.name ?? drawerName}
          onClose={() => setEditing(false)}
          onRenamed={async () => {
            setEditing(false);
            await load();
          }}
          onIconChanged={load}
          onDeleted={async () => {
            setEditing(false);
            goTo(parent?.id ?? null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Header({
  backLabel,
  onBack,
  title,
  action,
}: {
  backLabel: string;
  onBack: () => void;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div>
      {/* The back label gives way to the actions: a long parent's name is cut short on one line
          rather than wrapping into the title, and "Add recipe" never folds in half. */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-3 min-w-0" onClick={onBack}>
          <ChevronLeftIcon className="h-5 w-5 shrink-0" />
          <span className="truncate">{backLabel}</span>
        </Button>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <PageTitle title={title} />
    </div>
  );
}

function Loading() {
  return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
}

function Empty({ text }: { text: string }) {
  return (
    <Card>
      <EmptyState>{text}</EmptyState>
    </Card>
  );
}

/**
 * Offered once, on a group big enough to be worth it and with nothing inside it yet: "your
 * Main dish looks like Chicken, Beef and Seafood — make those?" Read from the recipes' names and
 * ingredients, so it costs nothing, and every group can be unticked before anything happens.
 */
const DISMISSED_SPLITS_KEY = 'mp_dismissedSplits';

function readDismissedSplits(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(DISMISSED_SPLITS_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveDismissedSplits(ids: string[]) {
  try {
    localStorage.setItem(DISMISSED_SPLITS_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // Private browsing and the like: it just won't be remembered.
  }
}

function SplitSuggestion({
  householdId,
  group,
  total,
  suggestions,
  tree,
  onDone,
  onDismiss,
}: {
  householdId: string;
  group: RecipeCategory;
  total: number;
  suggestions: { name: string; recipeIds: string[] }[];
  tree: CategoryTree;
  onDone: () => Promise<void>;
  onDismiss: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(suggestions.map((s) => s.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = suggestions.filter((s) => chosen.includes(s.name));
  const sorted = picked.reduce((n, s) => n + s.recipeIds.length, 0);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      for (const s of picked) {
        // A group with that name may exist already — an unused "Vegetarian", say. Move it in
        // rather than failing on the name.
        const existing = tree.byName.get(s.name.toLowerCase());
        const target = existing
          ? existing.parentId === group.id
            ? existing
            : await api<RecipeCategory>('PATCH', `/api/households/${householdId}/recipe-categories/${existing.id}`, {
                parentId: group.id,
              })
          : await api<RecipeCategory>('POST', `/api/households/${householdId}/recipe-categories`, {
              name: s.name,
              parentId: group.id,
            });
        await api('POST', `/api/households/${householdId}/recipe-categories/${target.id}/recipes`, {
          recipeIds: s.recipeIds,
          fromCategoryId: group.id,
        });
      }
      await onDone();
    } catch (err) {
      setError(errorMessage(err, 'Could not make those groups.'));
      setBusy(false);
    }
  }

  return (
    <Card title={`Split ${group.name} up?`}>
      <p className="text-sm text-muted">Going by names and ingredients. Untick any you don't want.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Chip
            key={s.name}
            active={chosen.includes(s.name)}
            onClick={() =>
              setChosen((names) => (names.includes(s.name) ? names.filter((n) => n !== s.name) : [...names, s.name]))
            }
          >
            {s.name} · {s.recipeIds.length}
          </Chip>
        ))}
      </div>
      {total - sorted > 0 && (
        <p className="mt-2 text-sm text-muted">
          {total - sorted} {total - sorted === 1 ? 'recipe stays' : 'recipes stay'} in {group.name} to put in a group yourself.
        </p>
      )}
      {error && (
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {/* A suggestion, not the page's job — so it is not the filled button on the page. */}
        <Button variant="secondary" className="flex-1" disabled={busy || picked.length === 0} onClick={apply}>
          {busy ? 'Making…' : `Make ${picked.length} ${picked.length === 1 ? 'group' : 'groups'}`}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </Card>
  );
}

/**
 * The recipes at this level that are in none of the groups below, each with the groups as
 * chips — one tap files it and it drops off the list. The likely group is offered first.
 */
function SortList({
  householdId,
  recipes,
  groups,
  from,
  onFiled,
  onDone,
}: {
  householdId: string;
  recipes: Recipe[];
  groups: RecipeCategory[];
  from: RecipeCategory | null;
  onFiled: () => Promise<void>;
  onDone: () => void;
}) {
  const [filed, setFiled] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const left = recipes.filter((r) => !filed.includes(r.id));

  async function file(recipe: Recipe, target: RecipeCategory) {
    setError(null);
    setFiled((ids) => [...ids, recipe.id]);
    try {
      await api('POST', `/api/households/${householdId}/recipe-categories/${target.id}/recipes`, {
        recipeIds: [recipe.id],
        fromCategoryId: from?.id ?? null,
      });
    } catch (err) {
      setFiled((ids) => ids.filter((id) => id !== recipe.id));
      setError(errorMessage(err, `Could not file ${recipe.name}.`));
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{left.length ? `Put ${left.length} in a group` : 'All in groups'}</h2>
        <Button
          size="sm"
          onClick={async () => {
            await onFiled();
            onDone();
          }}
        >
          Done
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <ul className="divide-y divide-line">
        {left.map((recipe) => {
          const likely = suggestGroup(recipe, groups);
          const ordered = likely ? [likely, ...groups.filter((g) => g.id !== likely.id)] : groups;
          return (
            <li key={recipe.id} className="py-3">
              <p className="font-medium">{recipe.name}</p>
              {likely && <p className="text-sm text-muted">Looks like {likely.name}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {ordered.map((g) => (
                  <Chip key={g.id} onClick={() => file(recipe, g)}>
                    {g.name}
                  </Chip>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {groups.length === 0 && <p className="text-sm text-muted">Add a group first (••• above), then put recipes in it.</p>}
    </section>
  );
}

export function AddGroup({
  householdId,
  parent,
  section = null,
  onAdded,
  onCancel,
}: {
  householdId: string;
  parent: RecipeCategory | null;
  /** The drawer a new top-level group joins. Ignored when it goes inside another group. */
  section?: RecipeSection | null;
  onAdded: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [iconKey, setIconKey] = useState<string | null>(null);
  const [choosingIcon, setChoosingIcon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Chosen = iconByKey(iconKey)?.Icon;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/api/households/${householdId}/recipe-categories`, {
        name: name.trim(),
        parentId: parent?.id ?? null,
        // A group inside another joins its drawer; a top-level one joins the drawer it is made in.
        section: parent ? null : section,
        iconKey,
      });
      await onAdded();
    } catch (err) {
      setError(errorMessage(err, 'Could not add that group.'));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Field label={parent ? `New group inside ${parent.name}` : 'New group'}>
        <div className="flex gap-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={parent ? 'A kind of ' + parent.name.toLowerCase() + '…' : 'Main dish, Side…'}
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            Add
          </Button>
        </div>
      </Field>
      {/* Optional, and folded away so a quick "Add" is still just a name. */}
      {choosingIcon ? (
        <IconPicker
          allowNone
          value={iconKey}
          onChange={(key) => {
            setIconKey(key);
            setChoosingIcon(false);
          }}
        />
      ) : (
        <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={() => setChoosingIcon(true)}>
          {Chosen ? <Chosen className="h-5 w-5" /> : <PlusIcon className="h-4 w-4" />}
          {Chosen ? 'Change icon' : 'Pick an icon'}
        </Button>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

/**
 * Rename, pick its icon, or delete — which moves everything in it up a level rather than losing
 * it. An icon is saved the moment it is tapped and the sheet stays open, so you can see it on
 * the tile behind and try another.
 */
export function EditGroup({
  householdId,
  group,
  upTo,
  onClose,
  onAddInside,
  onRenamed,
  onIconChanged,
  onDeleted,
}: {
  householdId: string;
  group: RecipeCategory;
  upTo: string;
  onClose: () => void;
  /** Offered when the sheet was opened from a group card. */
  onAddInside?: () => void;
  onRenamed: () => Promise<void>;
  /** Reload whatever draws the tile, without closing the sheet. */
  onIconChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [name, setName] = useState(group.name);
  const [iconKey, setIconKey] = useState<string | null>(group.iconKey ?? null);
  // One icon at a time: two taps racing could leave the ring on one and the server on the other.
  const [savingIcon, setSavingIcon] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === group.name) return;
    setBusy(true);
    setError(null);
    try {
      await api('PATCH', `/api/households/${householdId}/recipe-categories/${group.id}`, { name: name.trim() });
      await onRenamed();
    } catch (err) {
      setError(errorMessage(err, 'Could not rename it.'));
      setBusy(false);
    }
  }

  async function chooseIcon(key: string | null) {
    const before = iconKey;
    setIconKey(key);
    setSavingIcon(true);
    setError(null);
    try {
      // An empty string is how the server is told to take it off; null would mean "unchanged".
      await api('PATCH', `/api/households/${householdId}/recipe-categories/${group.id}`, { iconKey: key ?? '' });
    } catch (err) {
      setIconKey(before);
      setError(errorMessage(err, 'Could not change the icon.'));
      return;
    } finally {
      setSavingIcon(false);
    }
    // Saved by now, so a reload that fails only leaves the tile behind a moment — not an error
    // about an icon that did change.
    await onIconChanged().catch(() => undefined);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', `/api/households/${householdId}/recipe-categories/${group.id}`);
      await onDeleted();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete it.'));
      setBusy(false);
    }
  }

  return (
    <Sheet title={group.name} onClose={onClose}>
      <div className="space-y-5">
        <form onSubmit={rename} className="space-y-2">
          <Field label="Name">
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={busy || !name.trim() || name.trim() === group.name}>
                Rename
              </Button>
            </div>
          </Field>
        </form>

        <Field label="Icon">
          <IconPicker allowNone value={iconKey} onChange={chooseIcon} disabled={busy || savingIcon} />
        </Field>

        {onAddInside && (
          <Button variant="secondary" full onClick={onAddInside}>
            Add a group inside {group.name}
          </Button>
        )}

        {confirming ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              Its recipes and groups move up into {upTo}. Nothing is deleted but the group itself.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" disabled={busy} onClick={remove}>
                Delete {group.name}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="-ml-4 text-danger" onClick={() => setConfirming(true)}>
            Delete this group
          </Button>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </Sheet>
  );
}
