import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { imageUrl } from '../../api/client';
import type { Recipe, RecipeSection } from '../../api/types';
import { iconByKey } from '../FoodIcons';
import { Icon, type IconName } from '../icons';
import { useHiddenTabBar, usePushedScreen } from '../Layout';
import { MachineIcon } from '../MachineIcons';
import { Button, CheckBox, Chip, cx, IconButton, Photo, TONE_SOFT, type Tone } from '../ui';
import { dishIcon } from '../plan/planModel';
import { formatMinutes, totalMinutes } from '../../utils/recipeFormat';
import type { Machine } from '../../utils/machines';

/*
 The catalogue's own pieces (the mockup's 3.1–3.6, with tags in place of nested groups): the
 drawer cards, a drawer's tag and machine chips, the quick-tag card, a recipe as a photo card
 (pickable in select mode), and a search result row. Built from the design system in ui.tsx;
 nothing here restyles it.
*/

/** Each drawer's colour, as the mockup paints them. */
export const DRAWER_TONES: Record<RecipeSection, Tone> = {
  BREAKFAST: 'mustard',
  LUNCH: 'herb',
  DINNER: 'accent',
  SNACKS: 'plum',
  DRINKS: 'sky',
  OTHER: 'mustard',
};

const TAG_TONES: Tone[] = ['accent', 'mustard', 'herb', 'sky', 'plum'];

/** A tag's colour: the same tag, the same colour, wherever it is drawn. */
export function tagTone(id: string): Tone {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_TONES[hash % TAG_TONES.length];
}

/**
 * The mockup's icon tile with one of the hand-drawn food icons on it. The drawings are on a
 * 48-unit grid, so they are stroked heavier than usual to come out the weight of the mockup's
 * line icons at tile size. A tag with no picture wears the tag mark.
 */
export function FoodTile({
  iconKey,
  tone,
  size = 40,
  fallback = 'tag',
  className,
}: {
  iconKey?: string | null;
  tone: Tone;
  size?: number;
  fallback?: IconName;
  className?: string;
}) {
  const Food = iconByKey(iconKey)?.Icon;
  return (
    <span
      aria-hidden="true"
      className={cx('flex shrink-0 items-center justify-center', TONE_SOFT[tone], className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      {Food ? (
        <Food data-icon={iconKey ?? undefined} strokeWidth={3.4} style={{ width: size * 0.62, height: size * 0.62 }} />
      ) : (
        <Icon name={fallback} size={Math.round(size * 0.5)} />
      )}
    </span>
  );
}

/** A drawer on the front of Recipes: its tile, its name in the title face, and how many. */
export function DrawerCard({
  to,
  name,
  count,
  iconKey,
  tone,
}: {
  to: string;
  name: string;
  count: number;
  iconKey: string;
  tone: Tone;
}) {
  return (
    <Link to={to} className="card press flex flex-col gap-2.5 p-3.5 active:bg-surface2">
      <FoodTile iconKey={iconKey} tone={tone} />
      <span className="flex flex-col gap-0.5">
        <span className="serif truncate text-[1.25rem] leading-tight">{name}</span>
        <span className="text-[0.8125rem] text-muted">
          {count} {count === 1 ? 'recipe' : 'recipes'}
        </span>
      </span>
    </Link>
  );
}

/** How many, after a chip's label: quiet beside it, and readable on the filled chip too. */
function ChipCount({ n, active }: { n: number; active?: boolean }) {
  return <span className={cx('tabular-nums', active ? 'text-bg/70' : 'text-muted')}>{n}</span>;
}

/**
 * A tag as a filter chip: its little drawing if it has one, its name and how many recipes wear
 * it. On, it fills with ink like every chip — tap two and you see what wears both.
 */
export function TagChip({
  label,
  count,
  iconKey,
  active,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  count?: number;
  iconKey?: string | null;
  active: boolean;
}) {
  const Food = iconByKey(iconKey)?.Icon;
  return (
    <Chip active={active} {...props}>
      {Food && <Food aria-hidden="true" strokeWidth={3.6} className="-my-0.5 -ml-0.5 h-[18px] w-[18px] shrink-0" />}
      {label}
      {count !== undefined && <ChipCount n={count} active={active} />}
    </Chip>
  );
}

/** The dashed "+ Tag" at the end of the chips: make one here, without leaving the drawer. */
export function AddTagChip({ onClick, label = 'Tag' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-label="New tag"
      onClick={onClick}
      className="press inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-[1.5px] border-dashed border-faint px-3 py-[6.5px] text-[0.8125rem] font-semibold text-accent-ink active:bg-surface2"
    >
      <Icon name="plus" size={14} strokeWidth={2.4} />
      {label}
    </button>
  );
}

/**
 * "+ Tag" once tapped: a chip you type in. Return makes the tag; Escape, the ×, or leaving it
 * empty puts the chip back. In a form, where nothing is made until Save, leaving it with a name
 * typed (`submitOnBlur`) keeps the name rather than dropping it unseen.
 */
export function NewTagField({
  onSubmit,
  onCancel,
  placeholder = 'New tag',
  submitOnBlur = false,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
  placeholder?: string;
  submitOnBlur?: boolean;
}) {
  const [name, setName] = useState('');
  function submit() {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return onCancel();
    onSubmit(clean);
    setName('');
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border-[1.5px] border-accent bg-surface py-[2.5px] pl-3 pr-[3px] shadow-focus">
      <input
        autoFocus
        value={name}
        maxLength={100}
        enterKeyHint="done"
        aria-label="New tag name"
        placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          // In a form (the recipe form) Return would otherwise submit the whole recipe.
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!name.trim()) onCancel();
          else if (submitOnBlur) submit();
        }}
        className="w-28 min-w-0 bg-transparent text-[0.8125rem] font-medium text-ink outline-none placeholder:text-faint"
      />
      <button
        type="button"
        aria-label="Cancel the new tag"
        // Keeps the field focused until the tap lands, so leaving it empty is not taken as Cancel twice.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted"
      >
        <Icon name="x" size={13} strokeWidth={2.4} />
      </button>
    </span>
  );
}

/** A machine as a filter chip: its drawing, its short name and how many recipes need it. */
export function MachineChip({
  machine,
  count,
  active,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { machine: Machine; count: number; active: boolean }) {
  return (
    <Chip active={active} title={machine.label} {...props}>
      <MachineIcon machine={machine.key} size={16} className="-ml-0.5 shrink-0" />
      {machine.short}
      <ChipCount n={count} active={active} />
    </Chip>
  );
}

/**
 * A row of chips that scrolls sideways on a phone — five rows of wrapped tags would push the
 * recipes off the screen — and wraps once there is room for them. On a phone its right edge
 * fades, so a row that runs off the screen looks like one, rather than looking complete.
 *
 * `end` (the drawer's "+ Tag") comes last but is held at the right edge while the rest scrolls
 * under it, so it is always in reach; it brings its own fade, the chips going under it.
 */
export function ChipRow({ label, children, end }: { label: string; children: ReactNode; end?: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        '-mx-5 flex gap-2 overflow-x-auto py-px pl-5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden',
        end ? 'pr-0' : 'pr-5 max-md:[mask-image:linear-gradient(to_left,transparent,black_1.5rem)]',
      )}
    >
      {children}
      {end && (
        <span className="sticky right-0 -ml-2 flex shrink-0 bg-[linear-gradient(to_right,rgb(var(--bg)/0),rgb(var(--bg))_1.125rem)] pl-5 pr-5 md:static md:ml-0 md:bg-none md:p-0">
          {end}
        </span>
      )}
    </div>
  );
}

/**
 * "4 untagged recipes look like Chicken", and one button that tags them all. Only ever a card in
 * the page — it never opens anything by itself — and × is "not now", remembered on this device.
 */
export function QuickTagCard({
  name,
  count,
  busy,
  onTag,
  onDismiss,
}: {
  name: string;
  count: number;
  busy: boolean;
  onTag: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="Tag suggestion"
      className="flex items-center gap-2.5 rounded-[18px] border border-mustard bg-mustard-soft py-2.5 pl-3.5 pr-1.5 shadow-card"
    >
      <Icon name="sparkles" size={17} className="shrink-0 text-mustard" />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        {count} untagged recipes look like <b className="font-semibold">{name}</b>
      </p>
      <Button size="sm" variant="dark" disabled={busy} onClick={onTag}>
        {busy ? 'Tagging…' : 'Tag them'}
      </Button>
      <IconButton label="Not now" onClick={onDismiss} className="!h-9 !w-9 text-mustard">
        <Icon name="x" size={16} strokeWidth={2.4} />
      </IconButton>
    </section>
  );
}

/**
 * A recipe's picture: its cover if it has one, otherwise the mockup's food-coloured gradient with
 * a faint mark for the kind of meal. A cover that will not load falls back to the gradient.
 */
export function RecipePicture({ recipe, className, style }: { recipe: Recipe; className?: string; style?: React.CSSProperties }) {
  const [broken, setBroken] = useState(false);
  if (recipe.coverImageId && !broken) {
    return (
      <span className={cx('flex shrink-0 overflow-hidden bg-surface2', className)} style={style} aria-hidden="true">
        <img
          src={imageUrl(recipe.coverImageId)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  // A shared recipe has no drawer here yet; the one it is in at home picks its picture.
  return (
    <Photo
      seed={recipe.id}
      icon={dishIcon({ ...recipe, section: recipe.section ?? recipe.ownerSection ?? null })}
      className={className}
      style={style}
    />
  );
}

/**
 * A recipe as a photo card (3.4): the picture, the name under it, and how long it takes. One
 * that came from another household says so, since it cannot be changed from here. Given
 * `onPick` it is a tick-box instead of a link — select mode — with the tick on the picture.
 */
export function RecipePhotoCard({ recipe, picked, onPick }: { recipe: Recipe; picked?: boolean; onPick?: () => void }) {
  const total = totalMinutes(recipe);
  const body = (
    <>
      <span className="relative block">
        <RecipePicture
          recipe={recipe}
          className={cx(
            'aspect-[171/124] w-full rounded-2xl transition-shadow',
            picked && 'shadow-[0_0_0_3px_rgb(var(--bg)),0_0_0_5.5px_rgb(var(--accent))]',
          )}
        />
        {onPick && (
          <CheckBox
            checked={!!picked}
            className={cx('absolute right-2 top-2', !picked && '!border-white bg-black/20 shadow-[0_1px_3px_rgba(0,0,0,0.25)]')}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[0.9375rem] font-semibold">{recipe.name}</span>
        <span className="flex items-center gap-1 text-xs text-muted">
          {total ? (
            <>
              <Icon name="clock" size={12} />
              {formatMinutes(total)}
            </>
          ) : (
            `Serves ${recipe.servings}`
          )}
        </span>
        {recipe.shared && recipe.ownerName && (
          <span className="truncate text-xs text-faint">from {recipe.ownerName}</span>
        )}
      </span>
    </>
  );
  if (onPick) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={!!picked}
        aria-label={recipe.name}
        onClick={onPick}
        className="press flex w-full flex-col gap-2 text-left"
      >
        {body}
      </button>
    );
  }
  return (
    <Link to={`/recipes/${recipe.id}`} className="press flex flex-col gap-2">
      {body}
    </Link>
  );
}

/** Two across on a phone, three once there is room, four on a computer. */
export function RecipePhotoGrid({
  recipes,
  picked,
  onPick,
}: {
  recipes: Recipe[];
  /** Select mode: which are ticked, and what a tap does. */
  picked?: Set<string>;
  onPick?: (recipe: Recipe) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
      {recipes.map((r) => (
        <li key={r.id}>
          <RecipePhotoCard recipe={r} picked={picked?.has(r.id)} onPick={onPick && (() => onPick(r))} />
        </li>
      ))}
    </ul>
  );
}

/** One search result: the picture small, the name, and where it is filed. */
export function RecipeResultRow({ recipe, subtitle }: { recipe: Recipe; subtitle: ReactNode }) {
  return (
    <li>
      <Link to={`/recipes/${recipe.id}`} className="press flex min-h-[52px] items-center gap-3 px-4 py-3 active:bg-surface2">
        <RecipePicture recipe={recipe} className="h-11 w-11 rounded-[10px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{recipe.name}</span>
          <span className="mt-px block truncate text-[0.8125rem] text-muted">{subtitle}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Hides the phone's top bar while it is drawn — for the catalogue's search, which takes the
 * whole top of the screen the way iOS search does.
 */
export function HideTopBar() {
  usePushedScreen();
  return null;
}

/** Hides the phone's tab bar while it is drawn — select mode has its own bar down there. */
export function HideTabBar() {
  useHiddenTabBar();
  return null;
}
