import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Recipe, RecipeCategory, RecipeSection } from '../../api/types';
import { DEFAULT_SECTION_ICONS } from '../FoodIcons';
import { Icon } from '../icons';
import { toast } from '../toast';
import { Button, CheckBox, CheckCircle, IconButton, Input, List, NoteBox, Row, Sheet } from '../ui';
import { SECTION_OPTIONS, sectionLabel } from '../../utils/recipeMeta';
import { sameName, tagNamed, wears } from '../../utils/tags';
import { DRAWER_TONES, FoodTile, tagTone } from './CatalogueParts';
import { createTag, moveRecipes, tagRecipes } from './catalogueStore';

/*
 Select mode's two sheets: Tag, which puts tags on (and takes them off) every picked recipe at
 once, and Move, which files them all in another drawer. Both close the moment they are saved —
 the drawer shows the change straight away — and say so if the server then refuses any of it.
*/

type Mark = 'all' | 'some' | 'off';

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Cannot reach the server.';
}

/** "Chicken and Quick", "Chicken, Quick and Veggie". */
function listOf(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
}

/**
 * The drawer's tags, each ticked if every picked recipe wears it, a dash if some do, empty if
 * none — tap to cycle through what it will be. New tags can be typed in. Save sends one request
 * per tag that changed, all at once.
 */
export function TagRecipesSheet({
  householdId,
  section,
  tags,
  recipes,
  onClose,
  onSaved,
}: {
  householdId: string;
  section: RecipeSection;
  /** The drawer's tags. */
  tags: RecipeCategory[];
  /** The picked recipes. */
  recipes: Recipe[];
  onClose: () => void;
  onSaved: (said: string) => void;
}) {
  const n = recipes.length;
  const drawerName = sectionLabel(section);
  /** What each changed tag becomes: true, on every one of them; false, on none. */
  const [wanted, setWanted] = useState<Record<string, boolean>>({});
  const [newTags, setNewTags] = useState<string[]>([]);
  const [typed, setTyped] = useState('');

  const wearing = (tag: RecipeCategory) => recipes.filter((r) => wears(r, tag)).length;
  const worn = (tag: RecipeCategory): Mark => {
    const k = wearing(tag);
    return k === 0 ? 'off' : k === n ? 'all' : 'some';
  };
  const mark = (tag: RecipeCategory): Mark => (tag.id in wanted ? (wanted[tag.id] ? 'all' : 'off') : worn(tag));

  function setTo(id: string, value: boolean | null) {
    setWanted((w) => {
      const next = { ...w };
      if (value === null) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  /** Some → all → none → some again; a tag that started on all or on none just flips. */
  function tap(tag: RecipeCategory) {
    const was = worn(tag);
    const now = mark(tag);
    if (now === 'some') setTo(tag.id, true);
    else if (now === 'all') setTo(tag.id, was === 'off' ? null : false);
    else setTo(tag.id, was === 'off' ? true : null);
  }

  function subtitle(tag: RecipeCategory): string | undefined {
    if (wanted[tag.id] === true) return n === 1 ? 'Goes on' : `Goes on all ${n}`;
    if (wanted[tag.id] === false) return n === 1 ? 'Comes off' : `Comes off all ${n}`;
    if (worn(tag) === 'some') return `On ${wearing(tag)} of ${n}`;
    return undefined;
  }

  /**
   * The sheet with what is typed in New tag taken in. A name the drawer already has ticks that
   * tag, rather than making a second one. Worked out here rather than through state, so Save
   * straight after typing sends it too: a state change would not land until after Save had read.
   */
  function withTyped(): { want: Record<string, boolean>; making: string[] } {
    const name = typed.trim().replace(/\s+/g, ' ');
    if (!name) return { want: wanted, making: newTags };
    const existing = tagNamed(tags, section, name);
    if (existing) {
      const want = { ...wanted };
      if (worn(existing) === 'all') delete want[existing.id];
      else want[existing.id] = true;
      return { want, making: newTags };
    }
    if (newTags.some((t) => sameName(t, name))) return { want: wanted, making: newTags };
    return { want: wanted, making: [...newTags, name] };
  }

  function addTyped() {
    const { want, making } = withTyped();
    setTyped('');
    setWanted(want);
    setNewTags(making);
  }

  function save() {
    const { want, making } = withTyped();
    setTyped('');
    const changed = Object.entries(want);
    if (changed.length === 0 && making.length === 0) return onClose();
    const ids = recipes.map((r) => r.id);
    const onlyAdding = changed.every(([, on]) => on);
    const jobs: Promise<string | null>[] = [
      ...changed.map(([id, on]) => {
        const tag = tags.find((t) => t.id === id)!;
        return tagRecipes(householdId, tag, on ? ids : [], on ? [] : ids).then(
          () => null,
          (err) => `${tag.name}: ${errorMessage(err)}`,
        );
      }),
      ...making.map((name) =>
        createTag(householdId, section, name, ids).saved.then(
          () => null,
          (err) => `${name}: ${errorMessage(err)}`,
        ),
      ),
    ];
    // Already on screen; what the server refuses is put back, and said.
    onSaved(onlyAdding ? `Tagged ${n} ${n === 1 ? 'recipe' : 'recipes'}` : `Changed the tags on ${n} ${n === 1 ? 'recipe' : 'recipes'}`);
    Promise.all(jobs).then((answers) => {
      const failures = answers.filter((a): a is string => a !== null);
      if (failures.length) toast(`Could not save every tag. ${failures.join(' ')}`, { icon: 'alert', duration: 6000 });
    });
  }

  const changes = Object.keys(wanted).length + newTags.length;

  return (
    <Sheet title={`Tag ${n} ${n === 1 ? 'recipe' : 'recipes'}`} subtitle={`Tags in ${drawerName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {tags.length === 0 && newTags.length === 0 ? (
          <p className="text-[0.9375rem] text-muted">No tags in {drawerName} yet — type one below.</p>
        ) : (
          <List label={`Tags in ${drawerName}`} inset={62}>
            {tags.map((tag) => {
              const m = mark(tag);
              return (
                <Row
                  key={tag.id}
                  role="checkbox"
                  aria-checked={m === 'all' ? true : m === 'some' ? 'mixed' : false}
                  aria-label={tag.name}
                  onClick={() => tap(tag)}
                  lead={<FoodTile iconKey={tag.iconKey} tone={tagTone(tag.id)} size={34} />}
                  title={tag.name}
                  subtitle={subtitle(tag)}
                  end={<CheckBox checked={m === 'all'} mixed={m === 'some'} />}
                />
              );
            })}
            {newTags.map((name) => (
              <Row
                key={name}
                lead={<FoodTile tone="herb" size={34} fallback="plus" />}
                title={name}
                subtitle={n === 1 ? 'New tag, goes on' : `New tag, goes on all ${n}`}
                end={
                  <>
                    <IconButton label={`Don’t make ${name}`} onClick={() => setNewTags((t) => t.filter((x) => x !== name))} className="!h-8 !w-8">
                      <Icon name="x" size={15} />
                    </IconButton>
                    <CheckBox checked />
                  </>
                }
              />
            ))}
          </List>
        )}
        <div className="flex gap-2">
          <Input
            value={typed}
            maxLength={100}
            enterKeyHint="done"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTyped();
              }
            }}
            placeholder="New tag"
            aria-label="New tag name"
            className="h-11"
          />
          <Button type="button" variant="secondary" icon="plus" disabled={!typed.trim()} onClick={addTyped}>
            Add
          </Button>
        </div>
        {/* Stays in reach at the bottom however long the drawer's list of tags is. */}
        <div className="sticky -bottom-6 -mx-5 -mb-6 bg-bg px-5 pb-4 pt-2">
          <Button size="lg" full disabled={changes === 0 && !typed.trim()} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * The other drawers, and the button that moves every picked recipe there at once. Tags belong to
 * a drawer, so a recipe keeps only the ones its new drawer already has — and the sheet says which
 * come off before anything moves.
 */
export function MoveRecipesSheet({
  householdId,
  section,
  recipes,
  tags,
  counts,
  onClose,
  onMoved,
}: {
  householdId: string;
  section: RecipeSection;
  /** The picked recipes. */
  recipes: Recipe[];
  /** Every tag the household has, in every drawer. */
  tags: RecipeCategory[];
  /** How many recipes each drawer holds now. */
  counts: Partial<Record<RecipeSection, number>>;
  onClose: () => void;
  onMoved: (said: string) => void;
}) {
  const n = recipes.length;
  const [target, setTarget] = useState<RecipeSection | null>(null);
  const [icons, setIcons] = useState<Partial<Record<RecipeSection, string>>>({});
  useEffect(() => {
    let live = true;
    api<Partial<Record<RecipeSection, string>>>('GET', `/api/households/${householdId}/section-icons`)
      .then((answer) => live && setIcons(answer))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [householdId]);

  const dropped = (to: RecipeSection) => {
    const names: string[] = [];
    for (const name of recipes.flatMap((r) => r.categories)) {
      if (!tagNamed(tags, to, name) && !names.some((d) => sameName(d, name))) names.push(name);
    }
    return names;
  };
  const off = target ? dropped(target) : [];

  async function move() {
    if (!target) return;
    const label = sectionLabel(target);
    const moving = moveRecipes(householdId, recipes, target);
    // They leave the drawer at once; a refusal puts them back and says so.
    onMoved(`Moved ${n} to ${label}${off.length ? ` · took off ${listOf(off)}` : ''}`);
    const result = await moving;
    if (result.failed > 0) {
      toast(
        result.moved === 0
          ? `Could not move ${n === 1 ? 'it' : 'them'}. Try again.`
          : `${result.failed} could not move to ${label}. Try again.`,
        { icon: 'alert' },
      );
    }
  }

  return (
    <Sheet title={`Move ${n} ${n === 1 ? 'recipe' : 'recipes'}`} subtitle={`From ${sectionLabel(section)} to…`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <List label="Drawers" inset={64}>
          {SECTION_OPTIONS.filter((s) => s.value !== section).map((s) => {
            const count = counts[s.value] ?? 0;
            return (
              <Row
                key={s.value}
                role="radio"
                aria-checked={target === s.value}
                aria-label={s.label}
                onClick={() => setTarget(s.value)}
                lead={<FoodTile iconKey={icons[s.value] ?? DEFAULT_SECTION_ICONS[s.value]} tone={DRAWER_TONES[s.value]} size={36} />}
                title={s.label}
                subtitle={`${count} ${count === 1 ? 'recipe' : 'recipes'}`}
                end={<CheckCircle checked={target === s.value} />}
              />
            );
          })}
        </List>
        {target && off.length > 0 && (
          <NoteBox tone="mustard" icon="tag">
            {listOf(off)} {off.length === 1 ? 'isn’t a tag' : 'aren’t tags'} in {sectionLabel(target)}, so{' '}
            {off.length === 1 ? 'it comes' : 'they come'} off.
          </NoteBox>
        )}
        <Button size="lg" full icon={target ? 'arrowR' : undefined} disabled={!target} onClick={move}>
          {target ? `Move to ${sectionLabel(target)}` : 'Pick a drawer'}
        </Button>
      </div>
    </Sheet>
  );
}
