import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import NoHousehold from '../components/NoHousehold';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Recipe, RecipeCategory, RecipeSection } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import {
  ActionMenu,
  Button,
  Card,
  CheckBox,
  Chip,
  EmptyState,
  ErrorText,
  Field,
  Input,
  List,
  MenuList,
  NavBar,
  Row,
  SearchField,
  SectionLabel,
  Sheet,
} from '../components/ui';
import { Icon } from '../components/icons';
import { SHARED_KEY, sectionFromSlug, sectionLabel } from '../utils/recipeMeta';
import { iconByKey } from '../components/FoodIcons';
import { buildTree, isIn, suggestGroup, suggestSplit, type CategoryTree } from '../utils/categoryTree';
import { formatMinutes, totalMinutes } from '../utils/recipeFormat';
import IconPicker from '../components/IconPicker';
import EditGroupsScreen from '../components/catalogue/EditGroupsScreen';
import {
  Breadcrumbs,
  CARD_GRID,
  FloatingAddRecipe,
  GroupCard,
  groupDetail,
  NewGroupTile,
  RecipePicture,
  RecipePhotoGrid,
  RecipeResultRow,
  filingTrail,
} from '../components/catalogue/CatalogueParts';

function errorMessage(err: unknown, fallback: string): string {
  return (err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null) ?? fallback;
}

/**
 * One drawer of the catalogue, a level at a time (the mockup's 3.3 and 3.4). A drawer or a group
 * shows the groups directly inside it as cards; once there is nothing smaller to open, it shows
 * its recipes as photo cards. The current group is in the URL (?group=), so opening one moves
 * down a level and Back walks back up the way you came. Recipes at a level that are in none of
 * the groups below get a card of one-tap suggestions for where they go, likely group first.
 *
 * Edit groups (?edit=1) is its own screen over the same level (3.6); a big group with nothing
 * inside it offers to split itself up (3.5).
 */
export default function RecipeSectionPage() {
  const { section: slug } = useParams<{ section: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeHouseholdId } = useHousehold();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  // Remembered on this phone: a suggestion closed once that comes back on the next visit is nagging.
  const [splitDismissed, setSplitDismissed] = useState<string[]>(readDismissedSplits);
  usePushedScreen();

  const isShared = slug === SHARED_KEY;
  const section = sectionFromSlug(slug);
  const groupId = params.get('group');
  const editingGroups = params.get('edit') === '1';

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
    setQuery('');
    setAdding(false);
    setEditing(false);
    setSplitting(false);
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

  const group = groupId ? (tree.byId.get(groupId) ?? null) : null;
  const here = useMemo(
    () => (group ? inSection.filter((r) => isIn(r, group.id, tree)) : inSection),
    [group, inSection, tree],
  );
  // Every group one level down — shown whether or not it holds a recipe from this drawer.
  const allChildren = tree.children(group?.id ?? null);
  // Here, but in none of the groups below: filed on this group itself, or on nothing at all.
  const loose = here.filter((r) => !allChildren.some((c) => isIn(r, c.id, tree)));

  // Names a split-up group cannot take: this group and the ones above it.
  const splits = useMemo(() => {
    if (!group || allChildren.length > 0 || here.length < 3) return [];
    const taken = new Set(tree.path(group.id).map((c) => c.name.toLowerCase()));
    return suggestSplit(here, taken);
  }, [group, allChildren.length, here, tree]);

  // Offered once, by itself, the first time the group is opened — when it would really split, into
  // two groups or more; after that (or for a single group) it is in the •••.
  const offerSplit = splits.length > 1 && group !== null && !splitDismissed.includes(group.id);
  useEffect(() => {
    if (offerSplit && recipes !== null) setSplitting(true);
  }, [offerSplit, recipes]);

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
          <Link to="/recipes" className="font-medium text-accent-ink underline">
            Back to recipes
          </Link>
        </EmptyState>
      </Card>
    );
  }

  if (isShared) {
    return <SharedWithYou recipes={recipes === null ? null : inSection} onBack={() => navigate('/recipes')} />;
  }

  const drawerName = sectionLabel(section);
  const place = group?.name ?? drawerName;
  const parent = group?.parentId ? (tree.byId.get(group.parentId) ?? null) : null;
  // A recipe started from in here is filed in here — the drawer, and the group you are in.
  const addHere = `/recipes/new?${new URLSearchParams({ section: section ?? '', ...(groupId ? { group: groupId } : {}) })}`;
  const countFor = (id: string) => here.filter((r) => isIn(r, id, tree)).length;

  function goTo(id: string | null) {
    setParams(id ? { group: id } : {});
  }

  function setEditingGroups(on: boolean) {
    const next = new URLSearchParams(params);
    if (on) next.set('edit', '1');
    else next.delete('edit');
    setParams(next, { replace: !on });
  }

  function dismissSplit() {
    setSplitting(false);
    if (!group) return;
    setSplitDismissed((ids) => {
      if (ids.includes(group.id)) return ids;
      const next = [...ids, group.id];
      saveDismissedSplits(next);
      return next;
    });
  }

  if (editingGroups) {
    return (
      <EditGroupsScreen
        householdId={activeHouseholdId}
        place={place}
        groups={allChildren}
        onClose={() => setEditingGroups(false)}
        onSaved={async () => {
          await load();
          setEditingGroups(false);
        }}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const found = q
    ? here.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.categories.some((c) => c.toLowerCase().includes(q)) ||
          r.ingredients.some((i) => i.ingredientName.toLowerCase().includes(q)),
      )
    : [];
  const recipesLevel = allChildren.length === 0;

  return (
    <>
      <div className="space-y-4">
        <NavBar
          className="-mx-2.5"
          title={place}
          back={() => (group ? goTo(parent?.id ?? null) : navigate('/recipes'))}
          backLabel={group ? (parent?.name ?? drawerName) : 'Recipes'}
          right={
            group ? (
              <ActionMenu
                label={`Options for ${group.name}`}
                title={group.name}
                className="-mr-2.5 text-accent-ink"
                items={[
                  allChildren.length > 0 && {
                    label: `Edit groups inside ${group.name}`,
                    icon: 'pen',
                    iconTone: 'plum',
                    onSelect: () => setEditingGroups(true),
                  },
                  {
                    label: `Add a group inside ${group.name}`,
                    icon: 'plus',
                    iconTone: 'herb',
                    onSelect: () => setAdding(true),
                  },
                  splits.length > 0 && {
                    label: `Split ${group.name} into groups`,
                    icon: 'sparkles',
                    iconTone: 'mustard',
                    onSelect: () => setSplitting(true),
                  },
                  {
                    label: 'Edit group',
                    icon: 'folder',
                    iconTone: 'sky',
                    onSelect: () => setEditing(true),
                  },
                ]}
              />
            ) : (
              <>
                <button
                  type="button"
                  aria-label="Edit groups"
                  title="Edit groups"
                  className="press"
                  onClick={() => setEditingGroups(true)}
                >
                  <Icon name="pen" size={20} />
                </button>
                <Link to={addHere} aria-label="Add recipe" title="Add recipe" className="press">
                  <Icon name="plus" size={22} />
                </Link>
              </>
            )
          }
        />

        {group && (
          <Breadcrumbs
            steps={[
              { label: drawerName, onClick: () => goTo(null) },
              ...tree.path(group.id).map((g) => ({
                label: g.name,
                onClick: g.id === group.id ? undefined : () => goTo(g.id),
              })),
            ]}
          />
        )}

        {/* A group that opens further can be searched; a shelf of recipes is short enough to see. */}
        {!recipesLevel && here.length > 0 && (
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${place}`}
            aria-label={`Search ${place}`}
          />
        )}

        {recipes === null ? (
          <Loading />
        ) : q ? (
          found.length === 0 ? (
            <Card>
              <EmptyState>Nothing in {place} matches that.</EmptyState>
            </Card>
          ) : (
            <div>
              <SectionLabel>Recipes · {found.length}</SectionLabel>
              <List label="Recipes found">
                {found.map((r) => (
                  <RecipeResultRow key={r.id} recipe={r} subtitle={filingTrail(r, tree)} />
                ))}
              </List>
            </div>
          )
        ) : here.length === 0 && recipesLevel ? (
          <Card>
            <EmptyState>
              {group ? `Nothing from ${drawerName} in ${group.name} yet.` : 'Nothing filed here yet.'}{' '}
              <Link to={addHere} className="font-medium text-accent-ink underline">
                Add a recipe
              </Link>
            </EmptyState>
          </Card>
        ) : recipesLevel ? (
          // Nothing smaller to open: this is where the recipes are.
          <RecipePhotoGrid recipes={here} />
        ) : (
          <>
            <ul className={CARD_GRID}>
              {allChildren.map((child) => (
                <li key={child.id}>
                  <GroupCard
                    group={child}
                    detail={groupDetail(countFor(child.id), tree.children(child.id).length)}
                    onOpen={() => goTo(child.id)}
                  />
                </li>
              ))}
              <li>
                <NewGroupTile onClick={() => setAdding(true)} />
              </li>
            </ul>

            {/* Groups but no recipes yet — a new household. The groups are what there is to see. */}
            {here.length === 0 && (
              <p className="text-[0.9375rem] text-muted">
                Nothing filed in {place} yet.{' '}
                <Link to={addHere} className="font-medium text-accent-ink underline">
                  Add a recipe
                </Link>
                , or open a group.
              </p>
            )}

            {loose.length > 0 && (
              <UnfiledCard
                householdId={activeHouseholdId}
                recipes={loose}
                groups={allChildren}
                from={group}
                onFiled={load}
              />
            )}
          </>
        )}
      </div>

      {/* Overlays sit outside the stack of sections, so its spacing does not push them down. */}
      {group && <FloatingAddRecipe to={addHere} />}

      {adding && (
        <Sheet title={group ? `New group inside ${group.name}` : 'New group'} onClose={() => setAdding(false)}>
          <AddGroup
            householdId={activeHouseholdId}
            parent={group}
            section={section}
            onCancel={() => setAdding(false)}
            onAdded={async () => {
              setAdding(false);
              await load();
            }}
          />
        </Sheet>
      )}

      {splitting && group && (
        <SplitSheet
          householdId={activeHouseholdId}
          group={group}
          total={here.length}
          suggestions={splits}
          examples={(ids) => here.find((r) => r.id === ids[0])?.name ?? ''}
          tree={tree}
          onDone={async () => {
            setSplitting(false);
            await load();
          }}
          onDismiss={dismissSplit}
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
    </>
  );
}

function Loading() {
  return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
}

/**
 * Recipes other households shared into yours, by the household they came from (3.19). Read-only
 * until you open one and save it to your own recipes, which files it in a drawer of yours.
 */
function SharedWithYou({ recipes, onBack }: { recipes: Recipe[] | null; onBack: () => void }) {
  const byHousehold = useMemo(() => {
    const groups = new Map<string, Recipe[]>();
    for (const r of recipes ?? []) {
      const from = r.ownerName ?? 'another household';
      groups.set(from, [...(groups.get(from) ?? []), r]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [recipes]);

  return (
    <div className="space-y-3.5">
      <NavBar className="-mx-2.5" title="Shared with you" back={onBack} backLabel="Recipes" />
      {recipes === null ? (
        <Loading />
      ) : recipes.length === 0 ? (
        <Card>
          <EmptyState>Nothing shared with you.</EmptyState>
        </Card>
      ) : (
        <>
          {byHousehold.map(([from, list]) => (
            <section key={from} className="space-y-0">
              <SectionLabel>From {from}</SectionLabel>
              <List label={`From ${from}`}>
                {list.map((r) => {
                  const total = totalMinutes(r);
                  return (
                    <Row
                      key={r.id}
                      to={`/recipes/${r.id}`}
                      lead={<RecipePicture recipe={r} className="h-12 w-12 rounded-xl" />}
                      title={r.name}
                      subtitle={`Serves ${r.servings}${total ? ` · ${formatMinutes(total)}` : ''}`}
                    />
                  );
                })}
              </List>
            </section>
          ))}
          <p className="px-1 text-[0.8125rem] text-muted">
            Open one and choose Move into my recipes to keep it in a drawer of yours.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The recipes at this level that are in none of the groups below, each with where it most likely
 * goes as the first, filled chip (3.3) — one tap files it and it drops off the card. Every other
 * group is a tap further, under More. A long list starts folded to the first few.
 */
function UnfiledCard({
  householdId,
  recipes,
  groups,
  from,
  onFiled,
}: {
  householdId: string;
  recipes: Recipe[];
  groups: RecipeCategory[];
  from: RecipeCategory | null;
  onFiled: () => Promise<void>;
}) {
  const [filed, setFiled] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [choosingFor, setChoosingFor] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const left = recipes.filter((r) => !filed.includes(r.id));
  if (left.length === 0 && !error) return null;
  const shown = showAll ? left : left.slice(0, 5);

  async function file(recipe: Recipe, target: RecipeCategory) {
    setError(null);
    setFiled((ids) => [...ids, recipe.id]);
    try {
      await api('POST', `/api/households/${householdId}/recipe-categories/${target.id}/recipes`, {
        recipeIds: [recipe.id],
        fromCategoryId: from?.id ?? null,
      });
      await onFiled();
    } catch (err) {
      setFiled((ids) => ids.filter((id) => id !== recipe.id));
      setError(errorMessage(err, `Could not file ${recipe.name}.`));
    }
  }

  return (
    <section
      aria-label="Unfiled recipes"
      className="flex flex-col gap-2.5 rounded-[18px] border border-mustard bg-mustard-soft p-4 shadow-card"
    >
      <h2 className="flex items-center gap-2 text-mustard">
        <Icon name="folder" size={16} />
        <span className="text-sm font-semibold">
          {left.length} unfiled {left.length === 1 ? 'recipe' : 'recipes'}
        </span>
      </h2>
      <ul className="flex flex-col gap-2">
        {shown.map((recipe) => {
          const likely = suggestGroup(recipe, groups);
          const ordered = likely ? [likely, ...groups.filter((g) => g.id !== likely.id)] : groups;
          return (
            <li key={recipe.id} className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
              <Link to={`/recipes/${recipe.id}`} className="min-w-0 flex-1 basis-32 truncate text-sm font-medium">
                {recipe.name}
              </Link>
              <span className="flex shrink-0 items-center gap-1.5">
                {ordered.slice(0, 2).map((g, i) => (
                  <Chip
                    key={g.id}
                    aria-label={`Put ${recipe.name} in ${g.name}`}
                    // The likely one is filled; a guess that is only alphabetical is not.
                    active={i === 0 && likely !== null}
                    aria-pressed={undefined}
                    className="!px-[9px] !py-1 !text-xs"
                    onClick={() => file(recipe, g)}
                  >
                    {g.name}
                  </Chip>
                ))}
                {ordered.length > 2 && (
                  <Chip
                    aria-label={`Other groups for ${recipe.name}`}
                    aria-pressed={undefined}
                    className="!px-[9px] !py-1 !text-xs"
                    onClick={() => setChoosingFor(recipe)}
                  >
                    More
                  </Chip>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {left.length > shown.length && (
        <button
          type="button"
          className="press self-start text-sm font-semibold text-mustard"
          onClick={() => setShowAll(true)}
        >
          Show all {left.length}
        </button>
      )}
      {error && <ErrorText>{error}</ErrorText>}

      {choosingFor && (
        <Sheet title={`Put ${choosingFor.name} in…`} onClose={() => setChoosingFor(null)}>
          <MenuList
            items={groups.map((g) => ({
              label: g.name,
              onSelect: () => file(choosingFor, g),
            }))}
            onPicked={(item) => {
              setChoosingFor(null);
              item.onSelect();
            }}
          />
        </Sheet>
      )}
    </section>
  );
}

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

/**
 * "Your Main dish looks like Chicken, Beef and Seafood — make those?" (3.5). Read from the
 * recipes' names and ingredients, so it costs nothing, and every group can be unticked before
 * anything happens. Closing it is "not now", remembered on this phone.
 */
function SplitSheet({
  householdId,
  group,
  total,
  suggestions,
  examples,
  tree,
  onDone,
  onDismiss,
}: {
  householdId: string;
  group: RecipeCategory;
  total: number;
  suggestions: { name: string; recipeIds: string[] }[];
  /** A recipe from a suggestion, to say what it would hold. */
  examples: (recipeIds: string[]) => string;
  tree: CategoryTree;
  onDone: () => Promise<void>;
  onDismiss: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(suggestions.map((s) => s.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = suggestions.filter((s) => chosen.includes(s.name));
  const stay = total - picked.reduce((n, s) => n + s.recipeIds.length, 0);

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
    <Sheet
      title={`Split "${group.name}"?`}
      subtitle={`${total} ${total === 1 ? 'recipe' : 'recipes'}, no subgroups yet. We found these:`}
      onClose={onDismiss}
    >
      <div className="space-y-4">
        <List label="Groups to make">
          {suggestions.map((s) => {
            const on = chosen.includes(s.name);
            const example = examples(s.recipeIds);
            return (
              <Row
                key={s.name}
                role="checkbox"
                aria-checked={on}
                aria-label={s.name}
                onClick={() => setChosen((names) => (on ? names.filter((n) => n !== s.name) : [...names, s.name]))}
                lead={<CheckBox checked={on} />}
                title={s.name}
                subtitle={`${s.recipeIds.length} ${s.recipeIds.length === 1 ? 'recipe' : 'recipes'}`}
                end={
                  example ? (
                    <span className="max-w-[40%] shrink-0 truncate text-[0.8125rem] text-muted">{example}…</span>
                  ) : undefined
                }
              />
            );
          })}
        </List>
        {stay > 0 && (
          <p className="text-[0.8125rem] text-muted">
            {stay} {stay === 1 ? "recipe doesn't match and stays" : "recipes don't match and stay"} in {group.name}.
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <Button size="lg" full disabled={busy || picked.length === 0} onClick={apply}>
          {busy ? 'Making…' : `Create ${picked.length} ${picked.length === 1 ? 'group' : 'groups'}`}
        </Button>
      </div>
    </Sheet>
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
    <form onSubmit={submit} className="space-y-3">
      <Field label="Name">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={parent ? 'A kind of ' + parent.name.toLowerCase() + '…' : 'Main dish, Side…'}
        />
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
          {Chosen ? <Chosen className="h-5 w-5" /> : <Icon name="plus" size={16} />}
          {Chosen ? 'Change icon' : 'Pick an icon'}
        </Button>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={busy || !name.trim()}>
          Add
        </Button>
        <Button type="button" size="lg" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Rename, pick its icon, or delete — which moves everything in it up a level rather than losing
 * it. An icon is saved the moment it is tapped and the sheet stays open, so you can see it take.
 */
export function EditGroup({
  householdId,
  group,
  upTo,
  onClose,
  onRenamed,
  onIconChanged,
  onDeleted,
}: {
  householdId: string;
  group: RecipeCategory;
  upTo: string;
  onClose: () => void;
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
              <Button
                type="submit"
                variant="secondary"
                className="h-[3.25rem]"
                disabled={busy || !name.trim() || name.trim() === group.name}
              >
                Rename
              </Button>
            </div>
          </Field>
        </form>

        <Field label="Icon">
          <IconPicker allowNone value={iconKey} onChange={chooseIcon} disabled={busy || savingIcon} />
        </Field>

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
