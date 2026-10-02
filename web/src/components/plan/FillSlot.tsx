import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, imageUrl } from '../../api/client';
import type { CupboardItem, Place, Recipe, RecipeCategory, SavedLink } from '../../api/types';
import { useHousehold } from '../../household/HouseholdContext';
import { buildTree } from '../../utils/categoryTree';
import { isVideo, sourceLabel } from '../../utils/savedLinks';
import { Icon } from '../icons';
import {
  Button,
  CheckCircle,
  Chip,
  EmptyState,
  ErrorText,
  IconButton,
  List,
  NavBar,
  Photo,
  Pill,
  Row,
  SearchField,
  SectionLabel,
  Segmented,
  Tile,
  Toggle,
  type Tone,
} from '../ui';
import { dishIcon, filingLine, slotTime } from './planModel';

const PLACE_TONES: Tone[] = ['plum', 'accent', 'mustard', 'herb', 'sky'];

export type SlotChoice =
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'item'; name: string }
  | { kind: 'link'; link: SavedLink }
  | { kind: 'create'; name: string }
  | { kind: 'place'; place: Place | { name: string }; time: string | null };

/**
 * Filling a slot (the mockup's 2.5 and 2.7): a screen of its own, "Dinner · Thu 1" across the
 * top and Cancel to back out. Eat in or eat out, two tabs rather than one list: when you have
 * decided you are not cooking tonight, scrolling past forty recipes to reach "Chinese" is the
 * wrong shape.
 *
 * On a phone it covers the screen, as the mockup draws it; on a computer it is a dialog.
 */
export default function FillSlot({
  title,
  role,
  recipes,
  savedLinks,
  cupboard,
  places,
  dayName,
  startOut,
  current,
  busy,
  error,
  onChoose,
  onClose,
}: {
  /** "Dinner · Thu 1" */
  title: string;
  /** What a recipe picked here becomes: the slot's main, or a side to it. */
  role: 'Main' | 'Side';
  recipes: Recipe[];
  savedLinks: SavedLink[];
  cupboard: CupboardItem[];
  places: Place[];
  /** "Friday", beside the time when eating out. */
  dayName: string;
  /** Opens on Eat out — swapping a night out keeps you there. */
  startOut?: { placeId: string | null; time: string | null };
  /** What is being swapped, ticked so it is clear what is changing. */
  current?: string | null;
  busy: boolean;
  error: string | null;
  onChoose: (choice: SlotChoice) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'in' | 'out'>(startOut ? 'out' : 'in');
  const panel = useRef<HTMLDivElement>(null);

  // Escape backs out, and the page behind keeps still, as under a sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const open = document.querySelectorAll('[role="dialog"],[role="alertdialog"]');
      if (open.length > 0 && open[open.length - 1] !== panel.current) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 hidden bg-scrim sm:block" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full flex-col bg-bg pt-safe sm:h-[min(48rem,90vh)] sm:max-w-lg sm:rounded-sheet sm:pt-2 sm:shadow-lift"
      >
        <NavBar
          className="shrink-0 px-2.5 pr-4"
          title={title}
          left={
            <button type="button" onClick={onClose} className="press h-11 px-2.5 text-[1.0625rem] text-accent-ink">
              Cancel
            </button>
          }
        />
        <div className="flex shrink-0 flex-col gap-3 px-5 pb-3">
          <Segmented
            label="Eat in or eat out"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'in', label: 'Eat in' },
              { value: 'out', label: 'Eat out' },
            ]}
          />
          {error && <ErrorText>{error}</ErrorText>}
        </div>
        {tab === 'in' ? (
          <EatIn
            role={role}
            recipes={recipes}
            savedLinks={savedLinks}
            cupboard={cupboard}
            current={current ?? null}
            busy={busy}
            onChoose={onChoose}
          />
        ) : (
          <EatOut
            places={places}
            dayName={dayName}
            initial={startOut ?? null}
            busy={busy}
            onChoose={(place, time) => onChoose({ kind: 'place', place, time })}
          />
        )}
      </div>
    </div>
  );
}

type Filter = { kind: 'all' } | { kind: 'mains' } | { kind: 'sides' } | { kind: 'cupboard' } | { kind: 'links' } | { kind: 'group'; name: string };

const MAIN = /\bmain/i;
const SIDE = /\bside/i;

/**
 * Everything eaten at home in one search: a recipe, a saved link, something from the cupboard,
 * or anything you type. A name nothing matches offers both ways forward — plan it as typed, or
 * make it a recipe right here — so the meal you had in mind never means a trip to Recipes and
 * back. The household's own groups are filters too, after the mockup's five.
 */
function EatIn({
  role,
  recipes,
  savedLinks,
  cupboard,
  current,
  busy,
  onChoose,
}: {
  role: 'Main' | 'Side';
  recipes: Recipe[];
  savedLinks: SavedLink[];
  cupboard: CupboardItem[];
  current: string | null;
  busy: boolean;
  onChoose: (choice: SlotChoice) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const { activeHouseholdId, groceryCategories } = useHousehold();
  const typed = query.trim();

  // The household's groups, to write each recipe's filing as the path it is nested in. Until
  // they arrive (or if they cannot), the groups are listed as they are.
  const [tree, setTree] = useState<ReturnType<typeof buildTree> | null>(null);
  useEffect(() => {
    if (!activeHouseholdId) return;
    let live = true;
    api<RecipeCategory[]>('GET', `/api/households/${activeHouseholdId}/recipe-categories`)
      .then((groups) => live && setTree(buildTree(groups)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [activeHouseholdId]);
  const aisles = useMemo(() => new Map(groceryCategories.map((c) => [c.id, c.name])), [groceryCategories]);
  const q = typed.toLowerCase();

  const groups = useMemo(() => {
    const names = new Set<string>();
    for (const r of recipes) for (const c of r.categories) names.add(c);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [recipes]);
  // A recipe in Chicken, inside Main, is a main: its groups and every group they sit in.
  const filedUnder = (r: Recipe): string[] =>
    tree
      ? r.categories.flatMap((c) => {
          const g = tree.byName.get(c.toLowerCase());
          return g ? tree.path(g.id).map((p) => p.name) : [c];
        })
      : r.categories;
  const isMain = (r: Recipe) => filedUnder(r).some((c) => MAIN.test(c));
  const isSide = (r: Recipe) => filedUnder(r).some((c) => SIDE.test(c));
  const hasMains = recipes.some(isMain);
  const hasSides = recipes.some(isSide);
  const otherGroups = groups.filter((g) => !MAIN.test(g) && !SIDE.test(g));

  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const k = filter.kind;
  const shownRecipes =
    k === 'cupboard' || k === 'links'
      ? []
      : recipes
          .filter((r) => matches(r.name))
          .filter((r) =>
            k === 'mains'
              ? isMain(r)
              : k === 'sides'
                ? isSide(r)
                : k === 'group'
                  ? r.categories.includes(filter.name)
                  : true,
          )
          .sort((a, b) => a.name.localeCompare(b.name));
  // Links alongside recipes under All; on their own under Links.
  const shownLinks = k === 'all' || k === 'links' ? savedLinks.filter((l) => matches(l.name)) : [];
  // The cupboard is long, and "eggs" is something you type, not scroll to — so under All it
  // only shows while searching.
  const shownCupboard =
    k === 'cupboard' || (k === 'all' && q)
      ? cupboard
          .filter((c) => matches(c.name))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, k === 'cupboard' ? undefined : 5)
      : [];
  const exactRecipe = recipes.some((r) => r.name.toLowerCase() === q);
  const exactItem = cupboard.some((c) => c.name.toLowerCase() === q);
  const nothing = shownRecipes.length + shownLinks.length + shownCupboard.length === 0;

  const chip = (f: Filter, label: string) => {
    const on = filter.kind === f.kind && (f.kind !== 'group' || (filter.kind === 'group' && filter.name === f.name));
    return (
      <Chip key={label} active={on} onClick={() => setFilter(on && f.kind !== 'all' ? { kind: 'all' } : f)}>
        {label}
      </Chip>
    );
  };

  return (
    <>
      <div className="flex shrink-0 flex-col gap-3 px-5 pb-3">
        <SearchField
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search, or type anything — eggs, toast…"
          aria-label="Search recipes, or type something to add"
          end={
            query && (
              <IconButton label="Clear search" shape="plain" className="!h-5 !w-5" onClick={() => setQuery('')}>
                <Icon name="x" size={11} strokeWidth={2.6} />
              </IconButton>
            )
          }
        />
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
          {chip({ kind: 'all' }, 'All')}
          {hasMains && chip({ kind: 'mains' }, 'Mains')}
          {hasSides && chip({ kind: 'sides' }, 'Sides')}
          {cupboard.length > 0 && chip({ kind: 'cupboard' }, 'Cupboard')}
          {savedLinks.length > 0 && chip({ kind: 'links' }, 'Links')}
          {otherGroups.map((g) => chip({ kind: 'group', name: g }, g))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-safe-8">
        <div className="flex flex-col gap-3.5 pb-6">
          {shownRecipes.length > 0 && (
            <Group label="Recipes">
              {shownRecipes.map((r) => (
                <Row
                  key={r.id}
                  disabled={busy}
                  onClick={() => onChoose({ kind: 'recipe', recipe: r })}
                  lead={
                    r.coverImageId ? (
                      <Cover imageId={r.coverImageId} />
                    ) : (
                      <Photo seed={r.id} icon={dishIcon(r)} className="h-10 w-10 rounded-[10px]" />
                    )
                  }
                  title={<Highlight text={r.name} query={q} />}
                  titleClassName="font-medium"
                  subtitle={filingLine(r, tree) || `Serves ${r.servings}`}
                  end={
                    r.id === current ? (
                      <CheckCircle checked />
                    ) : (
                      <Pill tone={role === 'Main' ? 'accent' : 'mustard'}>{role}</Pill>
                    )
                  }
                />
              ))}
            </Group>
          )}

          {shownLinks.length > 0 && (
            <Group label="Saved links">
              {shownLinks.map((link) => (
                <Row
                  key={link.id}
                  disabled={busy}
                  onClick={() => onChoose({ kind: 'link', link })}
                  lead={
                    link.coverImageId ? (
                      <Cover imageId={link.coverImageId} />
                    ) : (
                      <Photo seed={link.id} icon={isVideo(link) ? 'play' : 'globe'} className="h-10 w-10 rounded-[10px]" />
                    )
                  }
                  title={<Highlight text={link.name} query={q} />}
                  subtitle={[sourceLabel(link), link.savedByName && !link.mine ? `saved by ${link.savedByName}` : null, link.personal ? 'Just me' : null]
                    .filter(Boolean)
                    .join(' · ')}
                  end={link.id === current ? <CheckCircle checked /> : undefined}
                />
              ))}
            </Group>
          )}

          {shownCupboard.length > 0 && (
            <Group label="Cupboard">
              {shownCupboard.map((c) => (
                <Row
                  key={c.id}
                  disabled={busy}
                  onClick={() => onChoose({ kind: 'item', name: c.name })}
                  lead={<Tile icon="cupboard" tone="sky" size={40} />}
                  title={<Highlight text={c.name} query={q} />}
                  subtitle={cupboardLine(c, c.categoryId ? aisles.get(c.categoryId) : undefined)}
                />
              ))}
            </Group>
          )}

          {typed && !exactRecipe && (
            <List>
              {!exactItem && (
                <Row
                  disabled={busy}
                  onClick={() => onChoose({ kind: 'item', name: typed })}
                  lead={<Tile icon="pen" tone="mustard" size={40} />}
                  title={`Use “${typed}” as typed`}
                  subtitle="Just text in the slot"
                />
              )}
              <Row
                disabled={busy}
                onClick={() => onChoose({ kind: 'create', name: typed })}
                lead={<Tile icon="plus" tone="accent" size={40} />}
                title={`Create recipe “${typed}”`}
                subtitle="Name only, type it, from a link or paste"
                chevron
              />
            </List>
          )}

          {nothing && !typed && (
            <EmptyState>
              {recipes.length === 0 ? 'No recipes yet.' : 'Nothing here.'}{' '}
              <button type="button" className="font-medium text-accent-ink" onClick={() => onChoose({ kind: 'create', name: '' })}>
                Make one
              </button>
            </EmptyState>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Somewhere to eat (the mockup's 2.7): pick a saved place, or type a new name to make it. A time
 * for a booking or a pickup, if there is one; no servings — nobody portions a takeaway here.
 */
function EatOut({
  places,
  dayName,
  initial,
  busy,
  onChoose,
}: {
  places: Place[];
  dayName: string;
  initial: { placeId: string | null; time: string | null } | null;
  busy: boolean;
  onChoose: (place: Place | { name: string }, time: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(initial?.placeId ?? (places.length === 1 ? places[0].id : null));
  const [timed, setTimed] = useState(Boolean(initial?.time));
  // The server sends "17:00:00"; a time input wants "17:00".
  const [time, setTime] = useState(initial?.time?.slice(0, 5) ?? '19:00');
  const q = query.trim();
  const shown = places.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  // Only offered when nothing already has that exact name.
  const canCreate = q.length > 0 && !places.some((p) => p.name.toLowerCase() === q.toLowerCase());
  /*
   * What the button would plan is always a row you can see ticked. A place the search has hidden
   * is not chosen while it is hidden (clearing the search brings it back, still ticked) — the
   * button said "Plan Sakura Sushi" under a list showing only "Add “Noodle Bar”". And a name
   * nobody has saved, with nothing else matching, is that new place: typing it is the choice.
   */
  const effective =
    picked === NEW
      ? canCreate
        ? NEW
        : null
      : picked && shown.some((p) => p.id === picked)
        ? picked
        : shown.length === 0 && canCreate
          ? NEW
          : null;
  const chosen: Place | { name: string } | null =
    effective === NEW ? { name: q } : places.find((p) => p.id === effective) ?? null;

  return (
    <>
      <div className="shrink-0 px-5 pb-3">
        <SearchField
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (picked === NEW) setPicked(null);
          }}
          placeholder="Search or add a place"
          aria-label="Search or add a place"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
        <div className="flex flex-col gap-3.5 pb-4">
          {shown.length > 0 || canCreate ? (
            <Group label="Places we eat">
              {shown.map((place, i) => (
                <Row
                  key={place.id}
                  role="radio"
                  aria-checked={effective === place.id}
                  onClick={() => setPicked(place.id)}
                  lead={
                    place.imageId ? (
                      <Cover imageId={place.imageId} />
                    ) : (
                      <Tile icon="store" tone={PLACE_TONES[i % PLACE_TONES.length]} size={40} />
                    )
                  }
                  title={place.name}
                  subtitle={place.notes}
                  end={<CheckCircle checked={effective === place.id} />}
                />
              ))}
              {canCreate && (
                <Row
                  role="radio"
                  aria-checked={effective === NEW}
                  onClick={() => setPicked(NEW)}
                  lead={<Tile icon="plus" tone="accent" size={40} />}
                  title={`Add “${q}”`}
                  subtitle="A new place, saved for next time"
                  end={<CheckCircle checked={effective === NEW} />}
                />
              )}
            </Group>
          ) : (
            <EmptyState>Nowhere saved yet — type a name to add one.</EmptyState>
          )}

          <div className="card flex flex-col gap-3 p-4">
            <button
              type="button"
              role="switch"
              aria-checked={timed}
              onClick={() => setTimed(!timed)}
              className="flex items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-2">
                <Icon name="clock" size={18} className="text-muted" />
                <span className="text-[0.9375rem] font-semibold">Time</span>
              </span>
              <Toggle on={timed} />
            </button>
            {timed && (
              // The time reads "7:30 pm", as everywhere on the plan; the browser's own time
              // input ("07:30 PM" and a clock glyph) lies invisibly over the whole row, so a tap
              // anywhere on it still opens the phone's time wheel.
              <label className="relative flex items-center justify-between gap-3 rounded-xl bg-surface2 px-3 py-2.5 focus-within:ring-2 focus-within:ring-accent">
                <span className="text-[0.9375rem]">{dayName}</span>
                <span aria-hidden="true" className="text-[1.0625rem] font-semibold tabular-nums text-ink">
                  {slotTime(time) ?? 'Pick a time'}
                </span>
                <input
                  type="time"
                  aria-label="Time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  onClick={(e) => {
                    // A computer's browser only opens its picker from the clock glyph.
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {
                      // Not allowed here (an iframe): the typed fields still work.
                    }
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            )}
            <p className="text-[0.8125rem] text-muted">For a booking or a pickup. Leave it off if there isn't one.</p>
          </div>
        </div>
      </div>
      <div className="shrink-0 px-5 pt-2 pb-safe-5">
        <Button
          size="lg"
          full
          disabled={busy || !chosen}
          onClick={() => chosen && onChoose(chosen, timed && time ? time : null)}
        >
          {chosen ? `Plan ${chosen.name}` : 'Pick a place'}
        </Button>
      </div>
    </>
  );
}

const NEW = '__new__';

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <SectionLabel>{label}</SectionLabel>
      <List label={label}>{children}</List>
    </section>
  );
}

function Cover({ imageId }: { imageId: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-surface2">
      <img src={imageUrl(imageId)} alt="" loading="lazy" className="h-full w-full object-cover" />
    </span>
  );
}

/** The part of a name that matched the search, in bold — "<b>Chick</b>en tikka traybake". */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <b className="font-bold">{text.slice(at, at + query.length)}</b>
      {text.slice(at + query.length)}
    </>
  );
}

/** "Have 3 · Tins & jars": how much there is, and which aisle it lives in. */
function cupboardLine(c: CupboardItem, aisle: string | undefined): string {
  const stock = c.staple
    ? 'Always have'
    : c.runningLow
      ? 'Running low'
      : c.quantity != null
        ? `Have ${c.quantity}${c.unit ? ` ${c.unit}` : ''}`
        : aisle
          ? 'Have it'
          : 'In the cupboard';
  return aisle ? `${stock} · ${aisle}` : stock;
}
