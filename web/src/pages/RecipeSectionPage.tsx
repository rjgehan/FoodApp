import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Recipe, RecipeCategory } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { Button, Card, Chip, cx, EmptyState, ErrorText, Field, Input, Sheet } from '../components/ui';
import { ChevronLeftIcon, PlusIcon } from '../components/icons';
import RecipeGrid from '../components/RecipeGrid';
import { coverClass } from '../utils/recipeFormat';
import { SHARED_KEY, sectionFromSlug, sectionLabel } from '../utils/recipeMeta';
import { buildTree, isIn, suggestGroup, suggestSplit, type CategoryTree } from '../utils/categoryTree';

function errorMessage(err: unknown, fallback: string): string {
  return (err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null) ?? fallback;
}

/**
 * One drawer of the catalog, opened a level at a time. Dinner shows its groups — Main dish,
 * Side — and Main dish shows its own — Chicken, Seafood — and recipes only appear once there is
 * nothing smaller to open, instead of every recipe in the drawer at once.
 *
 * The level is in the URL (?group=), so Back walks up the levels the way you came down.
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
  const [splitDismissed, setSplitDismissed] = useState<string[]>([]);

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
  }, [groupId, slug]);

  const tree = useMemo(() => buildTree(categories), [categories]);

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
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  if (!isShared && !section) {
    return (
      <Card>
        <EmptyState>
          No such section.{' '}
          <Link to="/recipes" className="font-medium text-accent underline">
            Back to the catalog
          </Link>
        </EmptyState>
      </Card>
    );
  }

  const drawerName = isShared ? 'Shared with you' : sectionLabel(section);

  function goTo(id: string | null) {
    setParams(id ? { group: id } : {});
  }

  // Shared recipes have no filing of yours yet, so there is nothing to open — just the recipes.
  if (isShared) {
    return (
      <div className="space-y-4">
        <Header backLabel="Catalog" onBack={() => navigate('/recipes')} title={drawerName} />
        {inSection.length > 0 && (
          <p className="text-sm text-muted">
            Recipes other households published. Open one and hit Organize to move it into your own catalog.
          </p>
        )}
        {recipes === null ? <Loading /> : inSection.length === 0 ? <Empty text="Nothing shared with you." /> : <RecipeGrid recipes={inSection} />}
      </div>
    );
  }

  const group = groupId ? tree.byId.get(groupId) ?? null : null;
  const parent = group?.parentId ? tree.byId.get(group.parentId) ?? null : null;
  const here = group ? inSection.filter((r) => isIn(r, group.id, tree)) : inSection;

  // Every group one level down, and the ones that have something from this drawer in them.
  const allChildren = tree.children(group?.id ?? null);
  const childGroups = allChildren
    .map((c) => ({ group: c, recipes: here.filter((r) => isIn(r, c.id, tree)) }))
    .filter((c) => c.recipes.length > 0);
  // Here, but in none of the groups below: filed on this group itself, or on nothing at all.
  const loose = here.filter((r) => !allChildren.some((c) => isIn(r, c.id, tree)));

  // Names a split-up group cannot take: this group and the ones above it.
  const taken = new Set((group ? tree.path(group.id) : []).map((c) => c.name.toLowerCase()));
  const splits =
    group && allChildren.length === 0 && here.length >= 3 && !splitDismissed.includes(group.id)
      ? suggestSplit(here, taken)
      : [];

  return (
    <div className="space-y-4">
      <Header
        backLabel={group ? parent?.name ?? drawerName : 'Catalog'}
        onBack={() => (group ? goTo(parent?.id ?? null) : navigate('/recipes'))}
        title={group?.name ?? drawerName}
        action={
          group && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit group
            </Button>
          )
        }
      />

      {recipes === null ? (
        <Loading />
      ) : here.length === 0 ? (
        <Empty text={group ? `Nothing from ${drawerName} in ${group.name} yet.` : 'Nothing filed here yet.'} />
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
          {splits.length > 0 && (
            <SplitSuggestion
              householdId={activeHouseholdId}
              group={group!}
              total={here.length}
              suggestions={splits}
              tree={tree}
              onDone={load}
              onDismiss={() => setSplitDismissed((ids) => [...ids, group!.id])}
            />
          )}

          {childGroups.length === 0 ? (
            // Nothing smaller to open: this is where the recipes are.
            <RecipeGrid recipes={here} />
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-3">
                {childGroups.map(({ group: c, recipes: inGroup }) => (
                  <li key={c.id}>
                    <GroupTile group={c} count={inGroup.length} tree={tree} onOpen={() => goTo(c.id)} />
                  </li>
                ))}
              </ul>

              {loose.length > 0 && (
                <section className="space-y-3 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold">
                      {group ? `Everything else in ${group.name}` : 'Not in a group yet'}
                    </h2>
                    <Button size="sm" variant="ghost" onClick={() => setSorting(true)}>
                      Sort {loose.length}
                    </Button>
                  </div>
                  <RecipeGrid recipes={loose} />
                </section>
              )}
            </>
          )}

          {adding ? (
            <AddGroup
              householdId={activeHouseholdId}
              parent={group}
              onCancel={() => setAdding(false)}
              onAdded={async () => {
                setAdding(false);
                await load();
                // A new group is empty until something goes in it, so go straight to filling it.
                if (loose.length > 0 || (childGroups.length === 0 && here.length > 0)) setSorting(true);
              }}
            />
          ) : (
            <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setAdding(true)}>
              <PlusIcon className="h-4 w-4" />
              {group ? `Add a group inside ${group.name}` : 'Add a group'}
            </Button>
          )}
        </>
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
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
          <ChevronLeftIcon className="h-5 w-5" />
          {backLabel}
        </Button>
        {action}
      </div>
      <h1 className="mt-1 text-2xl font-semibold leading-tight">{title}</h1>
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

function GroupTile({
  group,
  count,
  tree,
  onOpen,
}: {
  group: RecipeCategory;
  count: number;
  tree: CategoryTree;
  onOpen: () => void;
}) {
  // What is inside, so you know whether it opens onto more groups or onto recipes.
  const inside = tree.children(group.id).map((c) => c.name);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'flex min-h-[6.5rem] w-full flex-col justify-end rounded-2xl p-4 text-left transition-transform active:scale-[0.98]',
        coverClass(group.id),
      )}
    >
      <span className="text-lg font-semibold leading-tight">{group.name}</span>
      <span className="text-sm text-muted">
        {count} {count === 1 ? 'recipe' : 'recipes'}
      </span>
      {inside.length > 0 && <span className="mt-0.5 truncate text-xs text-ink/50">{inside.join(', ')}</span>}
    </button>
  );
}

/**
 * Offered once, on a group big enough to be worth it and with nothing inside it yet: "your
 * Main dish looks like Chicken, Beef and Seafood — make those?" Read from the recipes' names and
 * ingredients, so it costs nothing, and every group can be unticked before anything happens.
 */
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
          {total - sorted} {total - sorted === 1 ? 'recipe stays' : 'recipes stay'} in {group.name} for you to sort.
        </p>
      )}
      {error && (
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" disabled={busy || picked.length === 0} onClick={apply}>
          {busy ? 'Sorting…' : `Make ${picked.length} ${picked.length === 1 ? 'group' : 'groups'}`}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onDismiss}>
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
        <h2 className="font-semibold">{left.length ? `Sort ${left.length} into a group` : 'All sorted'}</h2>
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
      {groups.length === 0 && <p className="text-sm text-muted">Add a group first, then sort into it.</p>}
    </section>
  );
}

function AddGroup({
  householdId,
  parent,
  onAdded,
  onCancel,
}: {
  householdId: string;
  parent: RecipeCategory | null;
  onAdded: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/api/households/${householdId}/recipe-categories`, {
        name: name.trim(),
        parentId: parent?.id ?? null,
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
            placeholder={parent ? 'Chicken, Seafood, Pasta…' : 'Main dish, Side…'}
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            Add
          </Button>
        </div>
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

/** Rename, or delete — which moves everything in it up a level rather than losing it. */
function EditGroup({
  householdId,
  group,
  upTo,
  onClose,
  onRenamed,
  onDeleted,
}: {
  householdId: string;
  group: RecipeCategory;
  upTo: string;
  onClose: () => void;
  onRenamed: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [name, setName] = useState(group.name);
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
