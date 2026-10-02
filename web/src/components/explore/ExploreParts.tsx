import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, imageUrl } from '../../api/client';
import type { Recipe } from '../../api/types';
import { useHousehold } from '../../household/HouseholdContext';
import { formatMinutes, totalMinutes } from '../../utils/recipeFormat';
import { sectionLabel, type Filing } from '../../utils/recipeMeta';
import { RecipePicture } from '../catalogue/CatalogueParts';
import { mealIcon } from '../plan/planModel';
import { HeroButton } from '../recipe/RecipeHero';
import RecipeClassifier from '../RecipeClassifier';
import { Icon, type IconName } from '../icons';
import { gramsText, kcalText, type PlanNutrition } from '../../api/nutrition';
import { Stat } from '../nutrition/NutritionParts';
import { toast } from '../toast';
import { Avatar, Button, CheckCircle, ErrorText, List, Photo, Pill, Row, SectionLabel, Sheet, Tile, type Tone } from '../ui';

/*
 Explore's own pieces (the mockup's 5.1–5.3): the three doors on Explore's front page, a published
 recipe as a card in Global recipes, the top of a published recipe opened on its own, and the
 sheet that moves one into your recipes. Built from the design system in ui.tsx; nothing here
 restyles it.
*/

// --- The doors -------------------------------------------------------------------------------

/** One of the things Explore leads to that is not built yet, and what it will do once it is. */
export interface SoonDestination {
  to: string;
  title: string;
  /** The line under the title on its door. */
  blurb: string;
  icon: IconName;
  tone: Tone;
  /** Its door's one line about what is coming, where the finished one shows a teaser of your own data. */
  teaser: string;
  /** What it is for, in a sentence, on the page behind the door. */
  plan: string;
  /** What it will do, a row each, on the page behind the door. */
  will: { icon: IconName; title: string; detail: string }[];
}

/**
 * Meal plans: the mockup's 5.7–5.11, still to be built. Its door is on Explore now and opens on a
 * page that says what is coming, so the place the work lands already exists. The words come from
 * the designer's notes for those screens.
 */
export const SOON: SoonDestination[] = [
  {
    to: '/explore/meal-plans',
    title: 'Meal plans',
    blurb: 'From your cupboard, or built for a goal',
    icon: 'target',
    tone: 'plum',
    teaser: 'A week made for you',
    plan: 'A week of meals made for you, from your own recipes first, ready to put on the Plan in one go.',
    will: [
      { icon: 'cupboard', title: 'Cook from cupboard', detail: 'Meals that use what you already have, and the few things to buy for them.' },
      { icon: 'heart', title: 'Plans for a health target', detail: 'Ready-made or your own, with daily targets worked out for you.' },
      { icon: 'calendar', title: 'Apply it to your Plan', detail: 'Every meal goes on the Plan; swap any you do not fancy first.' },
    ],
  },
];

/**
 * Global recipes' door (5.1): a big green picture with how many there are on it, set first and
 * largest because it is the one of the three that is open.
 */
export function GlobalRecipesDoor({ count }: { count: number | null }) {
  return (
    <Link
      to="/explore/recipes"
      aria-label={`Global recipes${count != null ? `, ${count} published` : ''}`}
      className="press relative block h-[12.25rem] overflow-hidden rounded-[24px] md:row-span-2 md:h-auto md:min-h-[19rem]"
    >
      <Photo hue="green" icon="globe" large className="absolute inset-0 h-full w-full" />
      <span className="absolute inset-0 flex flex-col p-[18px] text-white md:p-6">
        <span className="min-h-[22px]">
          {count != null && (
            <Pill tone="herb" icon="globe" className="!text-[0.75rem]">
              {count} {count === 1 ? 'recipe' : 'recipes'}
            </Pill>
          )}
        </span>
        <span className="flex-1" />
        <span className="serif text-[1.75rem] leading-[1.15] md:text-[2.125rem]">Global recipes</span>
        <span className="text-[0.875rem] opacity-[0.92]">Published by households on this server</span>
      </span>
    </Link>
  );
}

/**
 * Nutrition facts' door (5.1): its tile, name and line, then the week's plan as three numbers —
 * a day's calories, protein and fibre on average, for one person. Until something on the plan
 * can be counted it says how to get some numbers, rather than showing noughts.
 */
export function NutritionDoor({ week }: { week: PlanNutrition | null }) {
  const avg = week != null && week.daysCounted > 0 ? week.average : null;
  return (
    <Link
      to="/explore/nutrition"
      aria-label="Nutrition facts"
      className="card press flex flex-col gap-3 p-4 active:bg-surface2"
    >
      <span className="flex items-center gap-3">
        <Tile icon="leaf" tone="herb" size={44} />
        <span className="min-w-0 flex-1">
          <span className="title-section block">Nutrition facts</span>
          <span className="block text-[0.8125rem] leading-snug text-muted">Ingredients, scanned products and your recipes</span>
        </span>
        <Icon name="chevR" size={18} className="shrink-0 text-faint" />
      </span>
      <span className="flex gap-2">
        <Stat value={avg ? kcalText(avg.kcal) : '–'} label="kcal / day" />
        <Stat value={avg ? gramsText(avg.protein) : '–'} label="Protein" tone="herb" />
        <Stat value={avg ? gramsText(avg.fibre) : '–'} label="Fibre" tone="mustard" />
      </span>
      <span className="text-xs text-muted">
        {week == null ? '\u00a0' : avg ? "Daily average of this week's plan" : 'Plan some meals and see what your week adds up to'}
      </span>
    </Link>
  );
}

/**
 * A door that is not open yet (5.1's Meal plans card): its tile, name and
 * line, and in place of the teaser of your own numbers, a plain note that it is coming.
 */
export function SoonDoor({ destination }: { destination: SoonDestination }) {
  const { to, title, blurb, icon, tone, teaser } = destination;
  return (
    <Link to={to} className="card press flex flex-col gap-3 p-4 active:bg-surface2">
      <span className="flex items-center gap-3">
        <Tile icon={icon} tone={tone} size={44} />
        <span className="min-w-0 flex-1">
          <span className="title-section block">{title}</span>
          <span className="block text-[0.8125rem] leading-snug text-muted">{blurb}</span>
        </span>
        <Icon name="chevR" size={18} className="shrink-0 text-faint" />
      </span>
      <span className="flex items-center gap-2.5 rounded-[14px] bg-surface2 px-3 py-2.5">
        <Pill tone={tone} icon="clock">
          Coming soon
        </Pill>
        <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-muted">{teaser}</span>
      </span>
    </Link>
  );
}

// --- Global recipes -------------------------------------------------------------------------

/**
 * The faint mark on a published recipe's picture. Which drawer its publisher keeps it in is theirs
 * to know, so until you file it yourself it gets the chef's hat, as the recipe page's hero does.
 */
function exploreIcon(recipe: Recipe): IconName {
  return recipe.section ? mealIcon(recipe.section) : 'chef';
}

/** A published recipe's picture: its cover, or its colour with the mark above. */
function ExplorePicture({ recipe, className }: { recipe: Recipe; className?: string }) {
  if (recipe.coverImageId) return <RecipePicture recipe={recipe} className={className} />;
  return <Photo seed={recipe.id} icon={exploreIcon(recipe)} className={className} />;
}

/** Kept already: it is in one of this household's drawers. */
export function isKept(recipe: Recipe) {
  return recipe.shared && recipe.section != null;
}

/** "25 min · Serves 2": what there is to say about a recipe before opening it. */
function Facts({ recipe }: { recipe: Recipe }) {
  const total = totalMinutes(recipe);
  return (
    <span className="flex min-w-0 items-center gap-2.5 text-xs text-muted">
      {total && (
        <span className="flex items-center gap-1">
          <Icon name="clock" size={12} />
          {formatMinutes(total)}
        </span>
      )}
      <span className="flex items-center gap-1">
        <Icon name="users" size={12} />
        Serves {recipe.servings}
      </span>
    </span>
  );
}

/**
 * A published recipe in Global recipes (5.2): its picture, its name, the household that published
 * it, and the round + that moves it into your recipes without opening it. One you keep already
 * says so instead, and one of your own needs neither.
 */
export function GlobalRecipeCard({
  recipe,
  householdName,
  onMove,
}: {
  recipe: Recipe;
  /** Yours, for one this household published. */
  householdName: string | null;
  onMove: () => void;
}) {
  const kept = isKept(recipe);
  const owner = recipe.shared ? recipe.ownerName ?? 'Another household' : householdName ?? 'You';
  return (
    // min-w-0 lets a long name truncate: a grid item otherwise grows to its unwrapped text and pushes the + off screen.
    <li className="card flex min-w-0 items-center gap-3 !p-2.5">
      <Link
        to={recipe.shared ? `/explore/recipes/${recipe.id}` : `/recipes/${recipe.id}`}
        className="press flex min-w-0 flex-1 items-center gap-3"
      >
        <ExplorePicture recipe={recipe} className="h-[84px] w-[84px] rounded-[14px]" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-base font-semibold">{recipe.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <Avatar name={owner} tone="sky" size={18} />
            <span className="truncate">{owner}</span>
          </span>
          {kept ? (
            <span className="flex items-center gap-1 text-xs font-medium text-herb">
              <Icon name="check" size={12} strokeWidth={2.6} />
              In your {sectionLabel(recipe.section)} drawer
            </span>
          ) : (
            <Facts recipe={recipe} />
          )}
        </span>
      </Link>
      {recipe.shared && !kept && (
        <button
          type="button"
          onClick={onMove}
          aria-label={`Move ${recipe.name} into my recipes`}
          title="Move into my recipes"
          className="press relative mr-1 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink after:absolute after:-inset-[5px] after:content-['']"
        >
          <Icon name="plus" size={16} strokeWidth={2.4} />
        </button>
      )}
    </li>
  );
}

// --- A published recipe, opened -------------------------------------------------------------

/**
 * The top of a published recipe (5.3): its picture edge to edge with the round back button over
 * it, and at its foot where it is from and its name. Sized as the recipe page's hero is, so the
 * two feel like the same kind of page.
 */
export function ExploreHero({ recipe, onBack }: { recipe: Recipe; onBack: () => void }) {
  return (
    <div className="relative -mx-5 -mt-1 h-[max(18.125rem,calc(15.25rem+env(safe-area-inset-top)))] overflow-hidden text-white md:mx-0 md:mt-0 md:h-[22rem] md:rounded-card">
      {recipe.coverImageId ? (
        <>
          <img src={imageUrl(recipe.coverImageId)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {/* A real photo can be any colour: shade it where the button and the name sit. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.32), transparent 28%, transparent 45%, rgba(0,0,0,.62))' }}
          />
        </>
      ) : (
        <>
          <Photo seed={recipe.id} icon={exploreIcon(recipe)} large className="absolute inset-0 h-full w-full" />
          {/* Cream and bread are pale enough to lose the white name: darken the foot, where it sits. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, transparent 35%, rgba(0,0,0,.45))' }}
          />
        </>
      )}
      <div className="absolute inset-x-0 top-0 flex items-center px-4 pt-[max(env(safe-area-inset-top),0.75rem)] md:pt-4">
        <HeroButton icon="chevL" label="Back" onClick={onBack} />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-5 pb-4 md:px-6 md:pb-5">
        <div>
          <Pill tone="sky" icon="globe" className="!text-[0.75rem]">
            From {recipe.ownerName ?? 'another household'}
          </Pill>
        </div>
        <h1 className="serif text-[2rem] leading-[1.05] [text-wrap:balance] md:text-[2.5rem]">{recipe.name}</h1>
      </div>
    </div>
  );
}

/** The quick facts under the hero, as soft pills: how long, how many, and whether you keep it. */
export function ExploreFacts({ recipe }: { recipe: Recipe }) {
  const total = totalMinutes(recipe);
  return (
    <div className="flex flex-wrap gap-2">
      {total && (
        <Pill tone="sky" icon="clock" className="!px-2.5 !py-1 !text-[0.75rem]">
          {formatMinutes(total)}
        </Pill>
      )}
      <Pill tone="herb" icon="users" className="!px-2.5 !py-1 !text-[0.75rem]">
        Serves {recipe.servings}
      </Pill>
      {isKept(recipe) && (
        <Pill tone="mustard" icon="bookmark" className="!px-2.5 !py-1 !text-[0.75rem]">
          In your {sectionLabel(recipe.section)} drawer
        </Pill>
      )}
    </div>
  );
}

// --- Moving one into your recipes -----------------------------------------------------------

/** Each household's colour, in the same order as the header's pill and switcher. */
const HOUSE_TONES: Tone[] = ['herb', 'sky', 'plum', 'mustard', 'accent'];
const houseTone = (index: number) => HOUSE_TONES[Math.max(index, 0) % HOUSE_TONES.length];

/**
 * "Move into my recipes" for a published recipe: which of your households (only asked when you
 * are in more than one, the one you are looking at ticked first), then the drawer and groups it
 * goes in there. It files the recipe rather than copying it, the same as a recipe shared with
 * you: it stays the publisher's to change, and is yours to find and plan.
 */
export function MoveIntoMineSheet({
  recipe,
  onMoved,
  onClose,
}: {
  recipe: Recipe;
  /** With the recipe as the household it went into sees it. */
  onMoved: (saved: Recipe, householdId: string) => void;
  onClose: () => void;
}) {
  const { households, activeHouseholdId } = useHousehold();
  // Not the household that published it: it is already there, and filing it "into" its own home
  // would quietly move it to another drawer there. The one on screen comes first.
  const choices = households
    .filter((h) => h.id !== recipe.householdId)
    .sort((a, b) => Number(b.id === activeHouseholdId) - Number(a.id === activeHouseholdId));
  // What you ticked, else the one on screen: worked out each time, since the list of households
  // can still be arriving when the sheet opens.
  const [picked, setPicked] = useState<string | null>(null);
  const householdId =
    choices.find((h) => h.id === picked)?.id ?? choices.find((h) => h.id === activeHouseholdId)?.id ?? choices[0]?.id ?? null;
  // Dinner is the least surprising drawer to start in, as it is for a recipe shared with you.
  const [draft, setDraft] = useState<Filing>({ section: 'DINNER', categories: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = choices.find((h) => h.id === householdId) ?? null;
  const several = choices.length > 1;

  function pickHousehold(id: string) {
    if (id === householdId) return;
    setPicked(id);
    // Groups belong to a household: the ones ticked for the last one mean nothing in this one.
    setDraft((d) => ({ ...d, categories: [] }));
  }

  async function move() {
    if (!householdId) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Recipe>('PUT', `/api/households/${householdId}/recipes/${recipe.id}/filing`, draft);
      onMoved(saved, householdId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Move into my recipes"
      subtitle={`${recipe.name}, from ${recipe.ownerName ?? 'another household'}. Only they can change it.`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {several && (
          <div>
            <SectionLabel>Which household</SectionLabel>
            <List label="Your households">
              {choices.map((h) => (
                <Row
                  key={h.id}
                  role="radio"
                  aria-checked={h.id === householdId}
                  aria-label={h.name}
                  onClick={() => pickHousehold(h.id)}
                  lead={<Avatar name={h.name} tone={houseTone(households.indexOf(h))} size={40} />}
                  title={h.name}
                  subtitle={`${h.memberCount} ${h.memberCount === 1 ? 'person' : 'people'}${h.id === activeHouseholdId ? ' · open now' : ''}`}
                  end={<CheckCircle checked={h.id === householdId} />}
                />
              ))}
            </List>
          </div>
        )}
        {householdId && <RecipeClassifier key={householdId} householdId={householdId} value={draft} onChange={setDraft} sectionLabels />}
        {error && <ErrorText>{error}</ErrorText>}
        <Button size="lg" full icon="arrowR" disabled={busy || !householdId} onClick={move}>
          {busy ? 'Moving…' : several && chosen ? `Move into ${chosen.name}` : 'Move into my recipes'}
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * The move, from wherever it starts: opens the sheet, and once it is done says so — with the way
 * to the recipe when it went into the household on screen.
 */
export function useMoveIntoMine(onMovedHere: (saved: Recipe) => void) {
  const navigate = useNavigate();
  const { households, activeHouseholdId } = useHousehold();
  const [moving, setMoving] = useState<Recipe | null>(null);

  const sheet: ReactNode = moving ? (
    <MoveIntoMineSheet
      recipe={moving}
      onClose={() => setMoving(null)}
      onMoved={(saved, householdId) => {
        setMoving(null);
        if (householdId === activeHouseholdId) {
          onMovedHere(saved);
          toast('Moved into your recipes', {
            icon: 'check',
            action: { label: 'Open', onClick: () => navigate(`/recipes/${saved.id}`) },
          });
        } else {
          toast(`Moved into ${households.find((h) => h.id === householdId)?.name ?? 'your recipes'}`, { icon: 'check' });
        }
      }}
    />
  ) : null;

  return { start: setMoving, sheet };
}

// --- Behind a door that is not open yet ------------------------------------------------------

/** The page behind Nutrition facts or Meal plans until they are built: what is coming there. */
export function SoonPanel({ destination }: { destination: SoonDestination }) {
  const { title, icon, tone, plan, will } = destination;
  return (
    <div className="flex flex-col gap-5">
      <div className="card flex flex-col items-center gap-3 px-5 pb-6 pt-7 text-center">
        <Tile icon={icon} tone={tone} size={64} />
        <Pill tone={tone} icon="clock">
          Coming soon
        </Pill>
        <h2 className="title-sheet">{title}</h2>
        <p className="max-w-md text-[0.9375rem] leading-normal text-muted">{plan}</p>
      </div>
      <div>
        <SectionLabel>What it will do</SectionLabel>
        <List label="What it will do" inset={66}>
          {will.map((w) => (
            <Row
              key={w.title}
              lead={<Tile icon={w.icon} tone={tone} size={36} />}
              title={w.title}
              subtitle={w.detail}
              wrap
            />
          ))}
        </List>
      </div>
      <p className="px-1 text-[0.8125rem] text-faint">Not built yet. This is where it will go.</p>
    </div>
  );
}
