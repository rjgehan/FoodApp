import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import NoHousehold from '../components/NoHousehold';
import { ApiError } from '../api/client';
import type { Recipe, RecipeCategory, RecipeSection } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import { Button, Card, EmptyState, ErrorText, List, NavBar, Pill, Row, SearchField, SectionLabel } from '../components/ui';
import { Icon } from '../components/icons';
import { toast } from '../components/toast';
import { isNewShare, markSharedSeen, SHARED_KEY, sectionFromSlug, sectionLabel, sharedSeenAt } from '../utils/recipeMeta';
import { timeAgo } from '../utils/savedLinks';
import { formatMinutes, totalMinutes } from '../utils/recipeFormat';
import { canMake, orderedMachines, type Machine } from '../utils/machines';
import { kitchenOf } from '../utils/features';
import { readTagNames, sameName, suggestTags, tagNamed, tagsIn, wears } from '../utils/tags';
import {
  AddTagChip,
  CanMakeChip,
  ChipRow,
  HideTabBar,
  MachineChip,
  NewTagField,
  QuickTagCard,
  RecipePhotoGrid,
  RecipePicture,
  TagChip,
} from '../components/catalogue/CatalogueParts';
import { createTag, tagRecipes, useCatalogue } from '../components/catalogue/catalogueStore';
import ManageTagsScreen from '../components/catalogue/ManageTagsScreen';
import { MoveRecipesSheet, TagRecipesSheet } from '../components/catalogue/TagSheets';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * One drawer of the catalogue (the mockup's 3.3 and 3.4, flattened into tags). Every recipe in
 * the drawer is a photo card, with the drawer's tags as a row of chips over them: tap one to see
 * only those, tap two to see what wears both. The machines its recipes need are a second row,
 * for "what can I make in the air fryer", led by Can make: only what this household's kitchen has
 * the machines for (utils/machines.ts missingMachines). What is chosen is kept in the address (?tags=Chicken),
 * so coming back from a recipe finds the drawer as it was left.
 *
 * Tagging is quick on purpose: "+ Tag" makes one and goes straight to picking its recipes; Select
 * tags or moves several at once; a card offers the obvious tag for recipes that have none. Each
 * change shows at once and is one request — nothing reloads the catalogue. Manage tags (?edit=1)
 * renames, draws and deletes them.
 */
export default function RecipeSectionPage() {
  const { section: slug } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const { activeHouseholdId } = useHousehold();
  const catalogue = useCatalogue(activeHouseholdId);
  usePushedScreen();

  if (!activeHouseholdId) {
    return (
      <Card>
        <NoHousehold />
      </Card>
    );
  }

  if (slug === SHARED_KEY) {
    return <SharedWithYou householdId={activeHouseholdId} recipes={catalogue.recipes} onBack={() => navigate('/recipes')} />;
  }

  const section = sectionFromSlug(slug);
  if (!section) {
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

  // A drawer of its own each time: what you were doing in Dinner stays in Dinner.
  return <Drawer key={`${activeHouseholdId}:${section}`} householdId={activeHouseholdId} section={section} catalogue={catalogue} />;
}

function Drawer({
  householdId,
  section,
  catalogue,
}: {
  householdId: string;
  section: RecipeSection;
  catalogue: ReturnType<typeof useCatalogue>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeHousehold } = useHousehold();
  const kitchen = kitchenOf(activeHousehold);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [naming, setNaming] = useState(false);
  const [selecting, setSelecting] = useState(false);
  /** A tag just made with "+ Tag" (or "Tag recipes"): select mode picks its recipes, Done tags them. */
  const [pickingFor, setPickingFor] = useState<RecipeCategory | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [sheet, setSheet] = useState<'tag' | 'move' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A tag just made or used, whose chip may be off the end of the row: scrolled into view. */
  const [reveal, setReveal] = useState<string | null>(null);
  // Remembered on this device: a suggestion closed once that comes back next visit is nagging.
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const drawerName = sectionLabel(section);
  const tags = useMemo(() => tagsIn(catalogue.tags ?? [], section), [catalogue.tags, section]);
  const all = useMemo(
    () => (catalogue.recipes ?? []).filter((r) => r.section === section).sort((a, b) => a.name.localeCompare(b.name)),
    [catalogue.recipes, section],
  );

  // What is chosen lives in the address, by name. So that a tag renamed — in Manage tags, which
  // Back returns from to the address as it was, or on another phone — stays chosen under its new
  // name, every name each tag has had while the drawer is open is remembered by the tag's id; a
  // tag deleted stops being chosen, rather than coming back chosen the day a new tag takes its name.
  const namesSeen = useRef(new Map<string, string>());
  for (const t of tags) namesSeen.current.set(t.name.trim().toLowerCase(), t.id);
  const askedFor = readTagNames(params.get('tags'), [...namesSeen.current.keys()]);
  const chosenNames = askedFor.flatMap((name) => {
    if (tags.some((t) => sameName(t.name, name))) return [name];
    const id = namesSeen.current.get(name.trim().toLowerCase());
    // Never a tag here (an old link): left in the address, choosing nothing.
    if (!id) return [name];
    const now = tags.find((t) => t.id === id);
    return now ? [now.name] : [];
  });
  const chosen = tags.filter((t) => chosenNames.some((n) => sameName(n, t.name)));
  const untaggedOnly = params.get('untagged') === '1' && chosen.length === 0;
  const machines = (params.get('machines') ?? '').split(',').filter(Boolean);
  // Only what this kitchen can make (?can=1). Says nothing while the kitchen has not said what it has.
  const canOnly = params.get('can') === '1' && kitchen !== null;
  const editing = params.get('edit') === '1';

  // ...and the address follows, so a reload or a copied link says what is on screen. Not from
  // inside Manage tags, whose way out is Back to the address it came from.
  const askedKey = askedFor.join(',');
  const chosenKey = chosenNames.join(',');
  useEffect(() => {
    if (editing || catalogue.tags === null || chosenKey === askedKey) return;
    setFilters({ tags: chosenNames });
  }, [editing, catalogue.tags, chosenKey, askedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // An old link into a group (?group=<id>) opens the drawer with that tag chosen, if it is here.
  const legacyGroup = params.get('group');
  useEffect(() => {
    if (!legacyGroup || catalogue.tags === null) return;
    const tag = catalogue.tags.find((t) => t.id === legacyGroup && t.section === section);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('group');
        if (tag) next.set('tags', tag.name);
        return next;
      },
      { replace: true },
    );
  }, [legacyGroup, catalogue.tags, section, setParams]);

  useEffect(() => {
    if (!reveal) return;
    document
      .querySelector(`[data-tag="${CSS.escape(reveal.trim().toLowerCase())}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    setReveal(null);
  }, [reveal]);

  const tagged = useMemo(() => new Set(tags.map((t) => t.name.trim().toLowerCase())), [tags]);
  const isUntagged = (r: Recipe) => !r.categories.some((c) => tagged.has(c.trim().toLowerCase()));
  const untagged = useMemo(() => all.filter(isUntagged), [all, tagged]); // eslint-disable-line react-hooks/exhaustive-deps
  // Counted from the recipes, so a change shows at once; the server's own count until they arrive.
  const loaded = catalogue.recipes !== null;
  const counts = useMemo(
    () => new Map(tags.map((t) => [t.id, loaded ? all.filter((r) => wears(r, t)).length : t.recipeCount])),
    [tags, all, loaded],
  );

  // The machines this drawer's recipes need, and any still chosen from before (so it can be undone).
  const machineCounts = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of all) for (const key of r.appliances ?? []) n.set(key, (n.get(key) ?? 0) + 1);
    return n;
  }, [all]);
  const machineChips = orderedMachines([...machineCounts.keys(), ...machines]);
  const makeable = useMemo(() => (kitchen ? all.filter((r) => canMake(r.appliances, kitchen)).length : 0), [all, kitchen]);
  // Beside the machines, while there are some: a drawer that needs none can make everything in it.
  const showCanMake = kitchen !== null && (machineChips.length > 0 || canOnly);

  const q = query.trim().toLowerCase();
  // Picking a tag's recipes looks through the whole drawer, whatever the chips said: only the
  // search narrows it, and what is picked stays picked while the search hides it.
  const shown = all.filter(
    (r) =>
      (pickingFor ||
        ((untaggedOnly ? isUntagged(r) : chosen.every((t) => wears(r, t))) &&
          machines.every((m) => (r.appliances ?? []).includes(m)) &&
          (!canOnly || canMake(r.appliances, kitchen)))) &&
      (!q ||
        r.name.toLowerCase().includes(q) ||
        r.categories.some((c) => c.toLowerCase().includes(q)) ||
        r.ingredients.some((i) => i.ingredientName.toLowerCase().includes(q))),
  );

  const suggestion = useMemo(
    () =>
      suggestTags(
        untagged,
        tags.map((t) => t.name),
      ).find((s) => !dismissed.includes(dismissKey(householdId, section, s.name))) ?? null,
    [untagged, tags, dismissed, householdId, section],
  );

  function setFilters(change: { tags?: string[]; untagged?: boolean; machines?: string[]; can?: boolean }) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const put = (key: string, value: string) => (value ? next.set(key, value) : next.delete(key));
        if (change.tags) put('tags', change.tags.join(','));
        if (change.untagged !== undefined) put('untagged', change.untagged ? '1' : '');
        if (change.machines) put('machines', change.machines.join(','));
        if (change.can !== undefined) put('can', change.can ? '1' : '');
        return next;
      },
      { replace: true },
    );
  }

  function toggleTag(tag: RecipeCategory) {
    const on = chosen.some((t) => t.id === tag.id);
    const names = on ? chosen.filter((t) => t.id !== tag.id).map((t) => t.name) : [...chosen.map((t) => t.name), tag.name];
    setFilters({ tags: names, untagged: false });
  }

  function toggleMachine(machine: Machine) {
    setFilters({ machines: machines.includes(machine.key) ? machines.filter((m) => m !== machine.key) : [...machines, machine.key] });
  }

  function setEditing(on: boolean) {
    if (on) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('edit', '1');
          return next;
        },
        { state: { manageTags: true } },
      );
    } else if ((location.state as { manageTags?: boolean } | null)?.manageTags) {
      // Opened from here: closing it is Back, so the drawer is not in the history twice.
      navigate(-1);
    } else {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('edit');
          return next;
        },
        { replace: true },
      );
    }
  }

  function startSelecting() {
    setNaming(false);
    setPickingFor(null);
    setPicked(new Set());
    setSelecting(true);
  }

  function stopSelecting() {
    setSelecting(false);
    setPickingFor(null);
    setPicked(new Set());
    setSheet(null);
  }

  /** Out of picking, by Done or Cancel: its search was for finding the tag's recipes, so it goes too. */
  function stopPicking() {
    setQuery('');
    stopSelecting();
  }

  /** Straight into choosing a tag's recipes: every recipe in the drawer, the ones wearing it ticked. */
  function startPicking(tag: RecipeCategory) {
    setNaming(false);
    setQuery('');
    setPickingFor(tag);
    setPicked(new Set(all.filter((r) => wears(r, tag)).map((r) => r.id)));
    setSelecting(true);
  }

  function togglePicked(recipe: Recipe) {
    setPicked((ids) => {
      const next = new Set(ids);
      if (next.has(recipe.id)) next.delete(recipe.id);
      else next.add(recipe.id);
      return next;
    });
  }

  /** "+ Tag", Return: the tag is there at once, and its recipes are picked next. */
  function makeTag(name: string) {
    setNaming(false);
    setError(null);
    const existing = tagNamed(tags, section, name);
    if (existing) return startPicking(existing);
    const { tag, saved } = createTag(householdId, section, name);
    saved.then(
      // The tag as the server has it — or the one another phone had already made by that name,
      // now fetched and on the chips: either way, the one whose recipes are being picked.
      (made) => setPickingFor((p) => (p?.id === tag.id ? made : p)),
      (err) => {
        setError(errorMessage(err, `Could not make ${name}.`));
        stopPicking();
      },
    );
    startPicking(tag);
  }

  /** Done while picking: one request puts the tag on (and takes it off) the lot, then shows it. */
  async function finishPicking() {
    const tag = pickingFor;
    if (!tag) return;
    const had = new Set(all.filter((r) => wears(r, tag)).map((r) => r.id));
    const add = [...picked].filter((id) => !had.has(id));
    const remove = [...had].filter((id) => !picked.has(id));
    stopPicking();
    setFilters({ tags: [tag.name], untagged: false });
    setReveal(tag.name);
    if (add.length === 0 && remove.length === 0) return;
    try {
      setError(null);
      await tagRecipes(householdId, tag, add, remove);
      if (add.length > 0) toast(`Tagged ${add.length} ${add.length === 1 ? 'recipe' : 'recipes'} ${tag.name}`, { icon: 'check' });
    } catch (err) {
      setError(errorMessage(err, `Could not tag those ${tag.name}.`));
    }
  }

  /** The quick-tag card's one tap: onto the drawer's tag of that name, or a new one — one request. */
  async function quickTag(name: string, recipeIds: string[]) {
    setBusy(true);
    setError(null);
    try {
      const existing = tagNamed(tags, section, name);
      if (existing) await tagRecipes(householdId, existing, recipeIds, []);
      else await createTag(householdId, section, name, recipeIds).saved;
      toast(`Tagged ${recipeIds.length} ${recipeIds.length === 1 ? 'recipe' : 'recipes'} ${name}`, { icon: 'check' });
    } catch (err) {
      setError(errorMessage(err, 'Could not tag those.'));
    } finally {
      setBusy(false);
    }
  }

  function dismiss(name: string) {
    setDismissed((keys) => {
      const next = [...keys, dismissKey(householdId, section, name)];
      saveDismissed(next);
      return next;
    });
  }

  if (editing) {
    return (
      <ManageTagsScreen
        householdId={householdId}
        section={section}
        tags={tags}
        counts={counts}
        loaded={catalogue.tags !== null}
        onClose={() => setEditing(false)}
      />
    );
  }

  // A recipe started from in here starts in here: the drawer, and the tags you were looking at.
  const addHere = `/recipes/new?${new URLSearchParams({
    section,
    ...(chosen.length ? { tags: chosen.map((t) => t.name).join(',') } : {}),
  })}`;
  const pickedRecipes = all.filter((r) => picked.has(r.id));
  const everyPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const title = pickingFor
    ? `Pick recipes for ${pickingFor.name}`
    : selecting
      ? picked.size
        ? `${picked.size} selected`
        : 'Select recipes'
      : drawerName;

  return (
    <>
      {selecting && <HideTabBar />}
      <div className="space-y-4">
        <NavBar
          className="-mx-2.5"
          title={title}
          back="/recipes"
          backLabel="Recipes"
          // Select mode's way out is its own bar (Cancel, Done); the title needs the room.
          left={selecting ? <span /> : undefined}
          right={
            selecting ? (
              <button
                type="button"
                className="press disabled:opacity-45"
                disabled={shown.length === 0}
                onClick={() =>
                  setPicked((ids) => {
                    const next = new Set(ids);
                    for (const r of shown) {
                      if (everyPicked) next.delete(r.id);
                      else next.add(r.id);
                    }
                    return next;
                  })
                }
              >
                {everyPicked ? 'None' : 'All'}
              </button>
            ) : (
              <>
                <button type="button" className="press disabled:opacity-45" disabled={all.length === 0} onClick={startSelecting}>
                  Select
                </button>
                <button type="button" aria-label="Edit tags" title="Edit tags" className="press" onClick={() => setEditing(true)}>
                  <Icon name="pen" size={20} />
                </button>
                <Link to={addHere} aria-label="Add recipe" title="Add recipe" className="press">
                  <Icon name="plus" size={22} />
                </Link>
              </>
            )
          }
        />

        {all.length > 0 && (
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${drawerName}`}
            aria-label={`Search ${drawerName}`}
          />
        )}

        {pickingFor ? (
          <p className="text-[0.9375rem] text-muted">
            Tap every recipe that is <b className="font-semibold text-ink">{pickingFor.name}</b>, then {picked.size ? 'Tag' : 'Done'}.
          </p>
        ) : (
          <>
            {catalogue.tags !== null && (
              // All and Untagged first, and "+ Tag" held at the end of the row however far it
              // scrolls: on a phone a drawer's tags run well off the screen, and the two ways to
              // sort out untagged recipes should not be three swipes away behind them.
              <ChipRow
                label="Tags"
                end={
                  naming ? (
                    <NewTagField onSubmit={makeTag} onCancel={() => setNaming(false)} />
                  ) : (
                    !selecting && <AddTagChip onClick={() => setNaming(true)} />
                  )
                }
              >
                <TagChip
                  label="All"
                  count={all.length}
                  active={chosen.length === 0 && !untaggedOnly}
                  onClick={() => setFilters({ tags: [], untagged: false })}
                />
                {untagged.length > 0 && (
                  <TagChip
                    label="Untagged"
                    count={untagged.length}
                    active={untaggedOnly}
                    onClick={() => setFilters({ untagged: !untaggedOnly, tags: [] })}
                  />
                )}
                {tags.map((tag) => (
                  <TagChip
                    key={tag.id}
                    label={tag.name}
                    iconKey={tag.iconKey}
                    count={counts.get(tag.id) ?? 0}
                    active={chosen.some((t) => t.id === tag.id)}
                    data-tag={tag.name.trim().toLowerCase()}
                    onClick={() => toggleTag(tag)}
                  />
                ))}
              </ChipRow>
            )}

            {(machineChips.length > 0 || showCanMake) && (
              <ChipRow label="Machines">
                {showCanMake && <CanMakeChip count={makeable} active={canOnly} onClick={() => setFilters({ can: !canOnly })} />}
                {machineChips.map((m) => (
                  <MachineChip
                    key={m.key}
                    machine={m}
                    count={machineCounts.get(m.key) ?? 0}
                    active={machines.includes(m.key)}
                    onClick={() => toggleMachine(m)}
                  />
                ))}
              </ChipRow>
            )}

            {/* About the untagged recipes, so not while looking at a tag or a machine. */}
            {!selecting && !q && chosen.length === 0 && machines.length === 0 && !canOnly && suggestion && (
              <QuickTagCard
                name={suggestion.name}
                count={suggestion.recipeIds.length}
                busy={busy}
                onTag={() => quickTag(suggestion.name, suggestion.recipeIds)}
                onDismiss={() => dismiss(suggestion.name)}
              />
            )}
          </>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        {catalogue.recipes === null ? (
          catalogue.failed ? (
            <Card>
              <EmptyState>
                Couldn’t load the recipes.{' '}
                <button type="button" className="font-medium text-accent-ink underline" onClick={catalogue.retry}>
                  Try again
                </button>
              </EmptyState>
            </Card>
          ) : (
            <Loading />
          )
        ) : all.length === 0 ? (
          <Card>
            <EmptyState>
              Nothing filed in {drawerName} yet.{' '}
              <Link to={addHere} className="font-medium text-accent-ink underline">
                Add a recipe
              </Link>
            </EmptyState>
          </Card>
        ) : shown.length === 0 ? (
          <NothingMatches
            drawerName={drawerName}
            searching={!!q}
            untaggedOnly={untaggedOnly}
            chosen={chosen}
            machines={orderedMachines(machines)}
            canMakeOnly={canOnly}
            onTagRecipes={
              !q && machines.length === 0 && !canOnly && chosen.length === 1 ? () => startPicking(chosen[0]) : undefined
            }
          />
        ) : (
          <RecipePhotoGrid recipes={shown} picked={selecting ? picked : undefined} onPick={selecting ? togglePicked : undefined} />
        )}

        {/* Room at the bottom for select mode's bar, so the last row of cards can be reached. */}
        {selecting && <div className="h-20" aria-hidden="true" />}
      </div>

      {selecting && (
        <div className="material-bar edge-top fixed inset-x-0 bottom-0 z-30 pb-safe">
          <div
            role="toolbar"
            aria-label={pickingFor ? `Tagging ${pickingFor.name}` : 'Selected recipes'}
            className="mx-auto flex w-full max-w-3xl items-center gap-2 px-5 py-2.5 md:px-8 lg:max-w-5xl"
          >
            {pickingFor ? (
              <>
                <Button variant="secondary" size="sm" onClick={stopPicking}>
                  Cancel
                </Button>
                <span className="flex-1" />
                {/* A tag's name can be long; the title above has it whole, so here it gives way. */}
                <Button size="sm" className="min-w-0" onClick={finishPicking}>
                  <span className="truncate">{picked.size ? `Tag ${picked.size} ${pickingFor.name}` : 'Done'}</span>
                </Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{picked.size} selected</span>
                <Button variant="secondary" size="sm" icon="tag" disabled={picked.size === 0} onClick={() => setSheet('tag')}>
                  Tag
                </Button>
                <Button variant="secondary" size="sm" icon="arrowR" disabled={picked.size === 0} onClick={() => setSheet('move')}>
                  Move
                </Button>
                <Button size="sm" onClick={stopSelecting}>
                  Done
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {sheet === 'tag' && (
        <TagRecipesSheet
          householdId={householdId}
          section={section}
          tags={tags}
          recipes={pickedRecipes}
          onClose={() => setSheet(null)}
          onSaved={(said) => {
            setSheet(null);
            toast(said, { icon: 'check' });
          }}
        />
      )}
      {sheet === 'move' && (
        <MoveRecipesSheet
          householdId={householdId}
          section={section}
          recipes={pickedRecipes}
          tags={catalogue.tags ?? []}
          counts={drawerCounts(catalogue.recipes ?? [])}
          onClose={() => setSheet(null)}
          onMoved={(said) => {
            stopSelecting();
            toast(said, { icon: 'check' });
          }}
        />
      )}
    </>
  );
}

/** How many recipes each drawer holds. */
function drawerCounts(recipes: Recipe[]): Partial<Record<RecipeSection, number>> {
  const counts: Partial<Record<RecipeSection, number>> = {};
  for (const r of recipes) if (r.section) counts[r.section] = (counts[r.section] ?? 0) + 1;
  return counts;
}

/** "the oven and air fryer": machines as they are said in a sentence. */
function machineWords(machines: Machine[]): string {
  const words = machines.map((m) => (m.key === 'pressure-cooker' ? m.short : m.short.toLowerCase()));
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : (words[0] ?? '');
}

/** Said for what is chosen — "Nothing tagged Chicken + Quick." — with the way to fix it. */
function NothingMatches({
  drawerName,
  searching,
  untaggedOnly,
  chosen,
  machines,
  canMakeOnly,
  onTagRecipes,
}: {
  drawerName: string;
  searching: boolean;
  untaggedOnly: boolean;
  chosen: RecipeCategory[];
  machines: Machine[];
  canMakeOnly: boolean;
  onTagRecipes?: () => void;
}) {
  const machinesNeeded = machines.length ? ` needs the ${machineWords(machines)}` : '';
  const needs = canMakeOnly
    ? machinesNeeded
      ? `${machinesNeeded} and can be made in your kitchen`
      : ' your kitchen can make'
    : machinesNeeded;
  const names = chosen.map((t) => t.name).join(' + ');
  const line = searching
    ? `Nothing in ${drawerName} matches that.`
    : untaggedOnly
      ? needs
        ? `No untagged recipe${needs}.`
        : 'Every recipe here has a tag.'
      : names
        ? `Nothing tagged ${names}${needs}.`
        : `Nothing here${needs}.`;
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-[0.9375rem] text-muted">{line}</p>
      {onTagRecipes && (
        <Button variant="soft" size="sm" icon="tag" onClick={onTagRecipes}>
          Tag recipes
        </Button>
      )}
    </div>
  );
}

function Loading() {
  return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
}

/*
 * Quick-tag suggestions somebody closed, per household, drawer and tag name, kept on this device
 * so "not now" is not asked again next visit. Capped, so it never grows without end.
 */
const DISMISSED_KEY = 'mp_dismissedTagSuggestions';

function dismissKey(householdId: string, section: RecipeSection, name: string): string {
  return `${householdId}:${section}:${name.trim().toLowerCase()}`;
}

function readDismissed(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

function saveDismissed(keys: string[]) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(keys.slice(-200)));
  } catch {
    // Private browsing and the like: it just won't be remembered.
  }
}

/**
 * Recipes other households shared into yours, by the household they came from (3.19). Read-only
 * until you open one and save it to your own recipes, which files it in a drawer of yours.
 */
function SharedWithYou({
  householdId,
  recipes: everything,
  onBack,
}: {
  householdId: string;
  recipes: Recipe[] | null;
  onBack: () => void;
}) {
  // What counted as new when the list opened stays new while you look at it; next time it won't.
  const [seenAt] = useState(() => sharedSeenAt(householdId));
  const loaded = everything !== null;
  useEffect(() => {
    if (loaded) markSharedSeen(householdId);
  }, [loaded, householdId]);

  const recipes = useMemo(
    () => everything?.filter((r) => r.section === null).sort((a, b) => a.name.localeCompare(b.name)) ?? null,
    [everything],
  );
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
                  // Where it lives over there and when it came: "Dinner · shared 2 days ago".
                  const ago = timeAgo(r.sharedAt);
                  const total = totalMinutes(r);
                  const subtitle =
                    [r.ownerSection ? sectionLabel(r.ownerSection) : null, ago ? `shared ${ago}` : null]
                      .filter(Boolean)
                      .join(' · ') || (total ? formatMinutes(total) : undefined);
                  return (
                    <Row
                      key={r.id}
                      to={`/recipes/${r.id}`}
                      lead={<RecipePicture recipe={r} className="h-12 w-12 rounded-xl" />}
                      title={r.name}
                      subtitle={subtitle}
                      end={isNewShare(r, seenAt) ? <Pill tone="accent">New</Pill> : undefined}
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
