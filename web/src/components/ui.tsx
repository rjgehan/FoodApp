import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  RefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import {
  animateSpring,
  prefersReducedMotion,
  project,
  rubberband,
  trimSamples,
  velocityOf,
  type Animation,
} from '../utils/spring';
import { Icon, type IconName } from './icons';

/*
 The design system's building blocks — the mockup's components (its CSS lines 44–173), one each.
 Everything reads the tokens in index.css, so every theme and both modes come for free.

   Page        PageTitle (PageTitle.tsx), NavBar, SectionHead, SectionLabel, Card
   Actions     Button (primary · secondary · soft · ghost · dark · danger · quiet), IconButton
   Lists       List + Row (grouped rows in a card), ActionMenu, SheetRow
   Forms       Field, Label, Input, NumberInput, Select, Textarea, SearchField, Segmented, Toggle
   Marks       Pill (Badge), Chip, CheckCircle, CheckBox, Avatar, Tile, Photo, NoteBox, StepNumber
   Overlays    Sheet, Alert (and ConfirmAlert), Toast (toast.tsx)
*/

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** The five colours that carry meaning (themes.ts), for anything that takes a tone. */
export type Tone = 'accent' | 'herb' | 'mustard' | 'plum' | 'sky';

/** A tone's soft fill with its own ink on it — the mockup's pill, tile and avatar colouring. */
export const TONE_SOFT: Record<Tone, string> = {
  accent: 'bg-accent-soft text-accent-ink',
  herb: 'bg-herb-soft text-herb',
  mustard: 'bg-mustard-soft text-mustard',
  plum: 'bg-plum-soft text-plum',
  sky: 'bg-sky-soft text-sky',
};

/** A tone's colour for text and icons on the page. */
export const TONE_TEXT: Record<Tone, string> = {
  accent: 'text-accent-ink',
  herb: 'text-herb',
  mustard: 'text-mustard',
  plum: 'text-plum',
  sky: 'text-sky',
};

// --- Sections -------------------------------------------------------------------------------

/** Inside a sheet the sheet already names the section, so cards there drop their own title. */
const CardInSheet = createContext(false);
export const CardInSheetProvider = CardInSheet.Provider;

/**
 * A titled section of a page — deliberately not a box. The serif section head and some space do
 * the grouping; boxes are for the rows inside it (List, or `card`).
 */
export function Card({
  title: ownTitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const title = useContext(CardInSheet) ? null : ownTitle;
  return (
    <section className={cx('py-2', className)}>
      {(title || actions) && (
        <header className="mb-2.5 flex min-h-9 items-center justify-between gap-3">
          {title && <h2 className="title-section">{title}</h2>}
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/**
 * A section head: serif title on the left, a quiet accent action on the right ("See all").
 * Pass `to` for a link or `onAction` for a button.
 */
export function SectionHead({
  title,
  action,
  to,
  onAction,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  to?: string;
  onAction?: () => void;
  className?: string;
}) {
  const cls = 'press shrink-0 text-[0.9375rem] font-medium text-accent-ink';
  return (
    <div className={cx('flex items-baseline justify-between gap-3', className)}>
      <h2 className="title-section min-w-0">{title}</h2>
      {action &&
        (to ? (
          <Link to={to} className={cls}>
            {action}
          </Link>
        ) : (
          <button type="button" onClick={onAction} className={cls}>
            {action}
          </button>
        ))}
    </div>
  );
}

/** The small capitals above a group of rows ("COLOUR", "PRODUCE"), with an optional count. */
export function SectionLabel({ children, end, className }: { children: ReactNode; end?: ReactNode; className?: string }) {
  return (
    <div className={cx('group-label flex items-baseline justify-between gap-3 px-1 pb-1.5', className)}>
      <span className="min-w-0 truncate">{children}</span>
      {end != null && <span className="shrink-0 tracking-normal">{end}</span>}
    </div>
  );
}

/** A quiet heading inside a section or sheet — the aisle names on the grocery list, say. */
export function SubHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cx('group-label px-4 pb-1.5 pt-5 first:pt-0', className)}>{children}</h3>;
}

/**
 * The centred bar at the top of a pushed screen: back on the left in the accent ink, the title in
 * the middle, an action or two on the right. `back` is a path, or a function for history.
 *
 * The title is centred on the screen while both sides leave it room, and slides over to use an
 * empty side rather than cut itself short — "Shared with you" beside "‹ Recipes" fits on a phone
 * only because nothing is on the right. Neither side is ever squeezed.
 */
export function NavBar({
  title,
  back,
  backLabel = 'Back',
  left,
  right,
  className,
}: {
  title?: ReactNode;
  back?: string | (() => void);
  backLabel?: ReactNode;
  /** Replaces the back button, e.g. a "Cancel". */
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  const backCls = 'press -ml-1.5 flex h-11 items-center gap-0.5 whitespace-nowrap text-[1.0625rem] text-accent-ink';
  const backInner = (
    <>
      <Icon name="chevL" size={26} />
      <span>{backLabel}</span>
    </>
  );
  return (
    <div
      className={cx(
        'grid h-12 grid-cols-[minmax(max-content,1fr)_minmax(0,max-content)_minmax(max-content,1fr)] items-center gap-2',
        className,
      )}
    >
      <div className="flex items-center">
        {left ??
          (typeof back === 'string' ? (
            <Link to={back} className={backCls}>
              {backInner}
            </Link>
          ) : back ? (
            <button type="button" onClick={back} className={backCls}>
              {backInner}
            </button>
          ) : null)}
      </div>
      <h1 className="min-w-0 truncate text-center text-[1.0625rem] font-semibold">{title}</h1>
      <div className="flex items-center justify-end gap-4 text-[1.0625rem] text-accent-ink">{right}</div>
    </div>
  );
}

// --- Buttons --------------------------------------------------------------------------------

/*
 The mockup's buttons. Filled rather than outlined, except `secondary` and `danger`, which sit on
 the surface with a hairline. Every one answers the finger the moment it lands (`press`).
*/
const BUTTON_VARIANTS = {
  primary: 'bg-accent text-on-accent active:brightness-95',
  secondary: 'border border-line bg-surface text-ink active:bg-surface2',
  soft: 'bg-accent-soft text-accent-ink active:brightness-95',
  ghost: 'text-accent-ink active:bg-surface2',
  dark: 'bg-ink text-bg active:opacity-90',
  danger: 'border border-line bg-surface text-danger active:bg-surface2',
  // Icons in rows stay grey: a column of tomato bins would be the loudest thing on the page.
  quiet: 'text-muted active:bg-surface2',
};

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

const TEXT_COLOR = /(^|\s)text-(ink|muted|faint|accent|accent-ink|on-accent|danger|herb|mustard|plum|sky|bg)(\s|$)/;

/**
 * A caller's own text colour replaces the variant's, rather than racing it: which of two
 * `text-*` classes wins is decided by stylesheet order, not by the order they are written in.
 */
function variantClass(variant: ButtonVariant, className?: string) {
  const base = BUTTON_VARIANTS[variant];
  if (!className || !TEXT_COLOR.test(className)) return base;
  return base.replace(/(^|\s)text-[\w-]+/, '');
}

const BUTTON_SIZES = {
  // `sm` is for rows and toolbars; `md` for most buttons; `lg` is the mockup's 52px main action.
  sm: 'h-9 px-3.5 text-[0.875rem] rounded-[11px] gap-1.5',
  md: 'h-11 px-4 text-[1rem] rounded-[13px] gap-2',
  lg: 'h-[3.25rem] px-5 text-[1.0625rem] rounded-btn gap-2',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  full = false,
  icon,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
  full?: boolean;
  /** An icon before the label. */
  icon?: IconName;
}) {
  return (
    <button
      className={cx(
        'press inline-flex items-center justify-center font-semibold select-none',
        'disabled:opacity-45 disabled:pointer-events-none',
        variantClass(variant, className),
        BUTTON_SIZES[size],
        full && 'w-full',
        className,
      )}
      {...props}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 19} className="shrink-0" />}
      {children}
    </button>
  );
}

const ICON_SHAPES = {
  // A 44px target with no box: icons in rows and bars.
  bare: 'h-11 w-11 rounded-xl',
  // The mockup's round buttons: on the surface with a hairline, or (plain) a quiet fill.
  round: 'h-[2.375rem] w-[2.375rem] rounded-full border border-line bg-surface text-ink',
  plain: 'h-[2.375rem] w-[2.375rem] rounded-full bg-surface2 text-ink',
};

/**
 * A bare icon you can tap. `shape="round"` is the mockup's 38px round button (top bar, ••• on a
 * page); `plain` is the same without the edge, as a sheet's close button. Round ones are smaller
 * than a thumb, so their tap target is padded out invisibly.
 */
export function IconButton({
  children,
  label,
  variant = 'quiet',
  shape = 'bare',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: ButtonVariant;
  shape?: keyof typeof ICON_SHAPES;
}) {
  const round = shape !== 'bare';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'press relative inline-flex shrink-0 items-center justify-center',
        'disabled:opacity-40 disabled:pointer-events-none',
        round ? ICON_SHAPES[shape] : cx(ICON_SHAPES.bare, variantClass(variant, className)),
        // The invisible part of a round button's target.
        round && 'after:absolute after:-inset-[3px] after:content-[""]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// --- Fields ---------------------------------------------------------------------------------

/*
 The mockup's inputs: 52px tall, 14px corners, on the surface with a hairline; focused, the edge
 turns accent and a soft ring of the accent's tint grows round it.
*/
const CONTROL =
  'rounded-field border border-line bg-surface px-3.5 text-ink placeholder:text-faint outline-none ' +
  'transition-[border-color,box-shadow] focus:border-accent focus:shadow-focus disabled:opacity-50';

/**
 * Controls fill their container and stand 52px tall unless the caller sets a width or height.
 * Tailwind emits `w-full` after `w-24`, so baking `w-full` into the base would silently win over
 * any caller override; the same goes for heights.
 */
function controlClass(extra?: string, className?: string, height = 'h-[3.25rem]') {
  const merged = cx(extra, className);
  return cx(CONTROL, !/(^|\s)w-/.test(merged) && 'w-full', !/(^|\s)h-/.test(merged) && height, merged);
}

/**
 * For any field that takes a username. iOS capitalises the first letter and "corrects" names
 * unless told not to, and a username is neither a sentence nor a word.
 */
export const usernameInputProps = {
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={controlClass(undefined, className)} {...props} />;
}

/**
 * A number field you can actually clear. Binding a number straight to an <input> means an empty
 * box parses to NaN and gets snapped back to a default, so deleting the "1" in order to type "2"
 * is impossible — you end up typing "12" and deleting the 1. This keeps the raw text while you
 * edit and only reports a number when there is one.
 */
export function NumberInput({
  value,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));

  useEffect(() => {
    // Re-sync only when the outside value genuinely disagrees, so typing is never interrupted.
    const parsed = text.trim() === '' ? null : Number(text);
    if (parsed !== value) {
      setText(value === null ? '' : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      {...props}
      type="number"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === '') {
          onChange(null);
          return;
        }
        const parsed = Number(raw);
        onChange(Number.isNaN(parsed) ? null : parsed);
      }}
      className={controlClass(undefined, className)}
    />
  );
}

/** A native select (the best picker on a phone), drawn as a field with a chevron. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx('relative block', /(^|\s)w-/.test(className ?? '') ? undefined : 'w-full', 'min-w-0')}>
      <select className={controlClass('appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <Icon
        name="chevD"
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </span>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={controlClass('py-3 leading-relaxed', className, 'h-auto')} {...props} />;
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-[7px] block text-[0.8125rem] font-semibold text-muted">
      {children}
    </label>
  );
}

/** Label + control + optional hint, so forms line up without repeating wrappers. */
export function Field({ label, hint, children }: { label?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/**
 * The search box: a quiet well rather than a field, with the magnifier in it. Everything an
 * <input> takes passes through; `end` sits at the right (a clear button, a count).
 */
export function SearchField({
  className,
  end,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { end?: ReactNode }) {
  return (
    <label
      className={cx(
        'flex h-[2.625rem] min-w-0 items-center gap-2 rounded-xl bg-surface2 px-3 text-muted',
        'focus-within:shadow-focus',
        className,
      )}
    >
      <Icon name="search" size={17} className="shrink-0" />
      <input
        type="search"
        className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {end}
    </label>
  );
}

/**
 * The segmented control: two to four choices on a quiet tray, the chosen one lifted onto the
 * surface. A radio group to assistive tech.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex rounded-[11px] bg-surface2 p-[3px]', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-w-0 flex-1 truncate rounded-[9px] px-2 py-[7px] text-[0.875rem] transition-colors',
              on ? 'bg-surface font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'font-medium text-muted',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Marks ----------------------------------------------------------------------------------

const PILL_TONES = {
  neutral: 'bg-surface2 text-muted',
  accent: TONE_SOFT.accent,
  herb: TONE_SOFT.herb,
  mustard: TONE_SOFT.mustard,
  plum: TONE_SOFT.plum,
  sky: TONE_SOFT.sky,
  danger: 'bg-danger-soft text-danger',
  // Names from before the redesign.
  success: TONE_SOFT.herb,
};

export type PillTone = keyof typeof PILL_TONES;

/**
 * A small status mark: "On grocery list", "Beta", "2 new". The tone says what kind of thing it
 * is (herb good, mustard warning, plum eating out, sky cupboard), never decoration.
 */
export function Pill({
  children,
  tone = 'neutral',
  icon,
  className,
}: {
  children: ReactNode;
  tone?: PillTone;
  icon?: IconName;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-[0.6875rem] font-semibold leading-[1.35]',
        PILL_TONES[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={12} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

/** The old name for a Pill. */
export const Badge = Pill;

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[0.9375rem] text-muted">{children}</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-danger">{children}</p>;
}

/**
 * The round tick for "done" (a bought grocery, a picked household). Herb green when ticked; it
 * settles in as it appears, so ticking something off registers.
 */
export function CheckCircle({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.6px] transition-colors duration-150',
        checked ? 'border-herb bg-herb text-white' : 'border-faint',
        className,
      )}
    >
      {checked && <Icon name="check" size={14} strokeWidth={3} className="pop" />}
    </span>
  );
}

/** The square tick for choosing things in a list ("include this"), in the accent. */
export function CheckBox({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.6px] transition-colors duration-150',
        checked ? 'border-accent bg-accent text-on-accent' : 'border-faint',
        className,
      )}
    >
      {checked && <Icon name="check" size={14} strokeWidth={3} className="pop" />}
    </span>
  );
}

/**
 * An on/off switch, for a setting that takes effect the moment it is flipped — no Save to hunt
 * for. Only the drawing: the row it sits in is the button (with role="switch"), so the whole row
 * is the thing to tap rather than a small pill at its end.
 */
export function SwitchKnob({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative inline-flex h-[31px] w-[51px] shrink-0 rounded-full p-[2px] transition-colors duration-150',
        on ? 'bg-herb' : 'bg-line',
        className,
      )}
    >
      <span
        className={cx(
          'h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform duration-150',
          on && 'translate-x-5',
        )}
      />
    </span>
  );
}

/** The mockup's name for the same switch. */
export const Toggle = SwitchKnob;

/** A filter or choice chip. On, it fills with the text colour — the loudest a chip gets. */
export function Chip({
  active,
  icon,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: IconName }) {
  return (
    <button
      type="button"
      // A chip that can be on or off says which, so a screen reader hears "selected" too.
      aria-pressed={active}
      className={cx(
        'press inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-[7px] text-[0.8125rem]',
        active ? 'border-ink bg-ink font-semibold text-bg' : 'border-line bg-surface font-medium text-ink',
        className,
      )}
      {...props}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

/** Someone's (or a household's) initial in a tinted circle. */
export function Avatar({
  name,
  tone = 'accent',
  size = 36,
  className,
}: {
  name: string | null | undefined;
  tone?: Tone;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx('flex shrink-0 items-center justify-center rounded-full font-semibold', TONE_SOFT[tone], className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {(name ?? '').trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** An icon on a soft square of a tone — what leads a settings row or a category card. */
export function Tile({
  icon,
  tone = 'accent',
  size = 40,
  radius,
  className,
}: {
  icon: IconName;
  tone?: Tone;
  size?: number;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx('flex shrink-0 items-center justify-center', TONE_SOFT[tone], className)}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.3) }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** The mockup's food colours for a photo that is not there (index.css `.hue-*`). */
export const HUES = ['tomato', 'herb', 'mustard', 'plum', 'sky', 'bread', 'choc', 'green', 'berry', 'cream'] as const;
export type Hue = (typeof HUES)[number];

/** The same hue for the same id, every time. */
export function hueFor(id: string): Hue {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return HUES[Math.abs(hash) % HUES.length];
}

/**
 * A recipe's picture when it has no photo: a gradient of a food colour with a faint icon. Give
 * it a `seed` (the recipe's id) to pick the colour, and a size with className. Big ones (a hero,
 * `large`) set the icon low and to the side, the way the mockup does.
 */
export function Photo({
  seed,
  hue,
  icon = 'utensils',
  large = false,
  className,
  style,
  children,
}: {
  seed?: string;
  hue?: Hue;
  icon?: IconName | null;
  large?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const h = hue ?? hueFor(seed ?? '');
  return (
    <span
      aria-hidden={children ? undefined : true}
      className={cx('photo flex shrink-0 items-center justify-center', `hue-${h}`, className)}
      style={style}
    >
      {icon &&
        (large ? (
          <Icon name={icon} strokeWidth={1.4} className="absolute -bottom-[8%] -right-[6%] h-1/2 w-auto opacity-[0.18]" />
        ) : (
          <Icon name={icon} strokeWidth={1.6} className="h-[36%] w-[36%] opacity-90" />
        ))}
      {children}
    </span>
  );
}

/** A tinted box with an icon and a sentence: a warning, a tip, what happens next. */
export function NoteBox({
  children,
  tone = 'mustard',
  icon = 'info',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={cx('flex items-start gap-2 rounded-[14px] px-3 py-2.5 text-[0.8125rem] leading-[1.35]', TONE_SOFT[tone], className)}>
      <Icon name={icon} size={16} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A numbered step's number. */
export function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-[0.8125rem] font-bold text-accent-ink">
      {n}
    </span>
  );
}

// --- Grouped lists --------------------------------------------------------------------------

/**
 * A grouped list: rows in one card, hairlines between them. `inset` starts the hairlines where
 * the row's text starts (the width of what leads each row, plus its padding) — 0 runs them edge
 * to edge, as the mockup's settings lists do.
 */
export function List({
  children,
  label,
  inset = 0,
  className,
}: {
  children: ReactNode;
  /** Names the list for assistive tech. */
  label?: string;
  inset?: number;
  className?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cx('card card-rows inset-rows', className)}
      style={{ '--row-inset': `${inset}px` } as CSSProperties}
    >
      {children}
    </ul>
  );
}

/**
 * One row of a List: something leading it (a Tile, an Avatar, a CheckCircle), a title with an
 * optional line under it, a quiet detail and whatever else at the end, and a chevron if it goes
 * somewhere. It is a link with `to`, a button with `onClick`, or plain.
 */
export function Row({
  lead,
  title,
  subtitle,
  detail,
  end,
  chevron,
  to,
  onClick,
  tone,
  disabled,
  wrap = false,
  className,
  titleClassName,
  ...aria
}: {
  lead?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  end?: ReactNode;
  chevron?: boolean;
  to?: string;
  onClick?: () => void;
  /** `danger` sets the title in the destructive ink (Delete, Sign out). */
  tone?: 'danger';
  disabled?: boolean;
  /** Let the subtitle wrap instead of truncating. */
  wrap?: boolean;
  className?: string;
  titleClassName?: string;
  role?: string;
  'aria-checked'?: boolean;
  'aria-label'?: string;
}) {
  const body = (
    <>
      {lead}
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-base font-medium', tone === 'danger' && 'text-danger', titleClassName)}>{title}</span>
        {subtitle && (
          <span className={cx('mt-px block text-[0.8125rem] text-muted', !wrap && 'truncate')}>{subtitle}</span>
        )}
      </span>
      {detail != null && <span className="shrink-0 text-[0.9375rem] text-muted">{detail}</span>}
      {end}
      {chevron && <Icon name="chevR" size={16} className="shrink-0 text-faint" />}
    </>
  );
  const cls = cx(
    'flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left',
    (to || onClick) && 'press active:bg-surface2 disabled:opacity-45',
    className,
  );
  return (
    <li>
      {to ? (
        <Link to={to} onClick={onClick} className={cls} {...aria}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} disabled={disabled} className={cls} {...aria}>
          {body}
        </button>
      ) : (
        <div className={cls} {...aria}>
          {body}
        </div>
      )}
    </li>
  );
}

// --- Sheets ---------------------------------------------------------------------------------

/**
 * The part of the window the on-screen keyboard is not covering. iOS does not shrink the page
 * when the keyboard opens — it slides over the bottom of it — so anything pinned to the bottom
 * of the screen ends up underneath. The visual viewport is the only honest measure of what can
 * actually be seen.
 */
function useVisibleViewport() {
  const [viewport, setViewport] = useState(() => ({
    top: 0,
    height: window.visualViewport?.height ?? window.innerHeight,
  }));

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return viewport;
}

/** Locks the page behind an overlay from scrolling, and closes the top overlay on Escape. */
function useOverlay(panel: RefObject<HTMLElement>, onEscape: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // With one sheet over another, Escape closes the top one — not both at once.
      const open = document.querySelectorAll('[role="dialog"],[role="alertdialog"]');
      if (open.length > 0 && open[open.length - 1] !== panel.current) return;
      onEscape();
    }
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onEscape, panel]);
}

/**
 * A bottom sheet on phones, a centred dialog on wider screens: the page's paper with 28px top
 * corners and a grab handle, its title set in the title font.
 *
 * On a phone it behaves like a physical card. It rises from the bottom on a spring and leaves
 * the same way it came. Grab the top of it and it follows the finger exactly; pull it upward
 * and it resists; let go and where it ends up depends on where the flick was heading — a quick
 * flick down dismisses it even from near the top, a slow drag has to go half-way. It can be
 * grabbed again mid-animation and carries on from where it is. The dimmed page behind lightens
 * as it goes, so it is always clear what a release will do.
 *
 * With Reduce Motion on it simply fades. It sits above the on-screen keyboard, and `tall` keeps
 * one height for sheets you search in, so they do not shrink and drop out of sight as results
 * narrow.
 */
export function Sheet({
  title,
  subtitle,
  lead,
  label,
  onClose,
  children,
  tall = false,
  head,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Something before the title, such as your avatar on Settings. */
  lead?: ReactNode;
  /** What the dialog is called to assistive tech, when the visible title is not its name. */
  label?: string;
  onClose: () => void;
  children: ReactNode;
  tall?: boolean;
  /**
   * The sheet's own heading in place of the title row and its close button — for a prompt
   * (mockup 7.1–7.3) that leads with a tile and ends in its own "Not now". It is still the part
   * you pull. `title` then only names the dialog to assistive tech.
   */
  head?: ReactNode;
}) {
  const viewport = useVisibleViewport();
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const animation = useRef<Animation | null>(null);
  const drag = useRef<{ y: number; from: number; samples: { t: number; v: number }[] } | null>(null);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  // Decided once: a sheet does not change kind while it is open.
  const [docked] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  const [reduced] = useState(prefersReducedMotion);
  const physical = docked && !reduced;

  const paint = useCallback((value: number) => {
    offset.current = value;
    const el = panel.current;
    if (!el) return;
    el.style.transform = `translate3d(0, ${value}px, 0)`;
    if (scrim.current) scrim.current.style.opacity = String(Math.min(1, Math.max(0, 1 - value / (el.offsetHeight || 1))));
  }, []);

  const springTo = useCallback(
    (target: number, velocity = 0, damping = 1, then?: () => void) => {
      animation.current?.stop();
      animation.current = animateSpring(offset.current, target, paint, { damping, response: 0.32, velocity }, then);
    },
    [paint],
  );

  // Arrive: from below on a phone, a quick fade (and a hint of scale) otherwise.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (physical) {
      paint(el.offsetHeight);
      springTo(0);
    } else {
      const keyframes = reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }];
      el.animate(keyframes, { duration: reduced ? 150 : 200, easing: 'ease-out' });
      scrim.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    }
    return () => animation.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Leave the way it came, then tell the page. */
  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const el = panel.current;
    if (!el) {
      onCloseRef.current();
      return;
    }
    if (physical) {
      springTo(el.offsetHeight, 0, 1, () => onCloseRef.current());
    } else {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in' }).onfinish = () => onCloseRef.current();
      scrim.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
    }
  }, [physical, springTo]);

  useOverlay(panel, dismiss);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!physical || closing.current || (e.target as HTMLElement).closest('button')) return;
    // Grabbed mid-flight: carry on from where it is on screen.
    animation.current?.stop();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone; the drag simply ends with it.
    }
    drag.current = { y: e.clientY, from: offset.current, samples: [{ t: e.timeStamp, v: e.clientY }] };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = panel.current;
    if (!d || !el) return;
    let value = d.from + (e.clientY - d.y);
    if (value < 0) value = -rubberband(-value, el.offsetHeight);
    paint(value);
    d.samples.push({ t: e.timeStamp, v: e.clientY });
    trimSamples(d.samples, e.timeStamp);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = panel.current;
    drag.current = null;
    if (!d || !el) return;
    // The release is a sample too: a finger that stopped before lifting has no speed left.
    d.samples.push({ t: e.timeStamp, v: e.clientY });
    trimSamples(d.samples, e.timeStamp);
    const velocity = velocityOf(d.samples);
    const height = el.offsetHeight;
    if (offset.current + project(velocity) > height / 2) {
      closing.current = true;
      springTo(height, velocity, 1, () => onCloseRef.current());
    } else {
      // Flung back up: the momentum earns a little overshoot.
      springTo(0, velocity, Math.abs(velocity) > 300 ? 0.8 : 1);
    }
  }

  return (
    <div
      // Back to the page's own text: a sheet opened from a nav bar's ••• is drawn inside that bar,
      // and would otherwise take on its tomato ink and 17px type.
      className="fixed inset-x-0 z-40 flex items-end justify-center text-left text-base font-normal leading-[1.45] text-ink sm:items-center sm:p-6"
      style={{ top: viewport.top, height: viewport.height }}
    >
      <div ref={scrim} className="absolute inset-0 bg-scrim" onClick={dismiss} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (head && typeof title === 'string' ? title : undefined)}
        aria-labelledby={label || head ? undefined : titleId}
        className={cx(
          'relative flex w-full flex-col rounded-t-sheet bg-bg pb-safe shadow-[0_-6px_30px_rgba(0,0,0,0.18)] will-change-transform',
          'sm:max-w-lg sm:rounded-sheet sm:shadow-lift',
          tall ? 'h-[calc(100%-1.5rem)] sm:h-[min(44rem,88vh)]' : 'max-h-[calc(100%-1.5rem)] sm:max-h-[88vh]',
        )}
      >
        {/* The handle: the grabber and title are what you pull, so the content below still scrolls. */}
        <div
          className="touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
            <span className="h-[5px] w-[38px] rounded-full bg-faint opacity-70" />
          </div>
          {head ? (
            <header className="px-5 pb-1 pt-4 sm:pt-6">{head}</header>
          ) : (
          <header className="flex items-start justify-between gap-3 px-5 pb-1 pt-3 sm:pt-5">
            {lead}
            <div className="min-w-0 flex-1 self-center">
              <h2 id={titleId} className="title-sheet break-words">
                {title}
              </h2>
              {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            </div>
            <IconButton label="Close" shape="plain" onClick={dismiss} className="!h-8 !w-8 shrink-0 text-ink">
              <Icon name="x" size={16} strokeWidth={2.4} />
            </IconButton>
          </header>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-3">{children}</div>
      </div>
    </div>
  );
}

/**
 * A centred alert over a dimmed page: an icon tile, a serif question, a sentence, and stacked
 * buttons — for the decisions that deserve a stop ("Delete Lemon herb chicken?"). Never
 * window.confirm. Escape and the scrim count as the last (cancelling) action.
 */
export function Alert({
  title,
  icon,
  tone = 'accent',
  children,
  actions,
  onDismiss,
  centered = false,
}: {
  title: ReactNode;
  icon?: IconName;
  tone?: Tone;
  children?: ReactNode;
  /** The buttons, top to bottom: the main one first. */
  actions: ReactNode;
  onDismiss: () => void;
  /** Centre everything — for a notice with a single OK. */
  centered?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(panel, onDismiss);
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    panel.current?.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], {
      duration: 180,
      easing: 'ease-out',
    });
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-9">
      <div className="absolute inset-0 bg-scrim" onClick={onDismiss} aria-hidden="true" />
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'relative flex w-full max-w-sm flex-col gap-3.5 rounded-[22px] bg-surface px-5 pb-4 pt-[22px] shadow-lift',
          centered && 'items-center text-center',
        )}
      >
        {icon && <Tile icon={icon} tone={tone} size={centered ? 56 : 48} />}
        <h2 id={titleId} className="title-section !text-[1.25rem]">
          {title}
        </h2>
        {children && <div className="text-sm leading-[1.45] text-muted">{children}</div>}
        <div className={cx('flex flex-col gap-2', centered && 'self-stretch')}>{actions}</div>
      </div>
    </div>
  );
}

/**
 * The usual yes-or-no Alert: a main action (destructive by default, as most confirmations are)
 * and a way out.
 */
export function ConfirmAlert({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  icon,
  tone,
  busy,
  onConfirm,
  onCancel,
}: {
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  icon?: IconName;
  tone?: Tone;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Alert
      title={title}
      icon={icon}
      tone={tone}
      onDismiss={onCancel}
      actions={
        <>
          <Button className="h-[2.875rem]" full disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button className="h-[2.875rem]" variant="secondary" full onClick={onCancel}>
            {cancelLabel}
          </Button>
        </>
      }
    >
      {children}
    </Alert>
  );
}

// --- Menus ----------------------------------------------------------------------------------

export type MenuItem = {
  label: ReactNode;
  onSelect: () => void;
  tone?: 'danger';
  disabled?: boolean;
  /** An icon on a tile, leading the row. */
  icon?: IconName;
  iconTone?: Tone;
  /** A line under the label. */
  detail?: ReactNode;
};

/**
 * The ••• for a screen's or a row's less-common actions. Opens as a sheet of large rows — the
 * iOS action sheet — so every choice is a full-width target rather than another small button
 * competing with the one that matters.
 */
export function ActionMenu({
  label,
  title,
  items,
  className,
  shape = 'bare',
}: {
  label: string;
  title?: ReactNode;
  items: (MenuItem | false | null | undefined)[];
  className?: string;
  /** `round` for the mockup's ••• beside a page title. */
  shape?: 'bare' | 'round';
}) {
  const [open, setOpen] = useState(false);
  const shown = items.filter(Boolean) as MenuItem[];
  if (shown.length === 0) return null;

  return (
    <>
      <IconButton
        label={label}
        variant={shape === 'bare' ? 'ghost' : undefined}
        shape={shape}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Icon name="more" className="h-5 w-5" />
      </IconButton>
      {open && (
        <Sheet title={title ?? label} onClose={() => setOpen(false)}>
          <MenuList
            items={shown}
            onPicked={(item) => {
              setOpen(false);
              item.onSelect();
            }}
          />
        </Sheet>
      )}
    </>
  );
}

/** A menu's items as a grouped list. Used by ActionMenu; on its own for a sheet of choices. */
export function MenuList({ items, onPicked }: { items: MenuItem[]; onPicked: (item: MenuItem) => void }) {
  const anyIcon = items.some((i) => i.icon);
  return (
    <List inset={anyIcon ? 62 : 16}>
      {items.map((item, i) => (
        <Row
          key={i}
          lead={item.icon ? <Tile icon={item.icon} tone={item.iconTone ?? 'accent'} size={34} /> : undefined}
          title={item.label}
          subtitle={item.detail}
          tone={item.tone}
          disabled={item.disabled}
          onClick={() => onPicked(item)}
          // Without icons it is the iOS action sheet: every choice in the accent's ink.
          titleClassName={!item.icon && item.tone !== 'danger' ? 'text-accent-ink' : undefined}
        />
      ))}
    </List>
  );
}

/**
 * A row in a settings-style list that opens its section in a sheet — for the things set once
 * and rarely touched, so they stop filling the page.
 */
export function SheetRow({
  label,
  detail,
  tone,
  children,
}: {
  label: ReactNode;
  detail?: ReactNode;
  tone?: 'danger';
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press flex min-h-touch w-full items-center gap-3 py-2.5 text-left"
      >
        <span className={cx('min-w-0 flex-1 truncate', tone === 'danger' && 'text-danger')}>{label}</span>
        {detail && <span className="shrink-0 text-[0.9375rem] text-muted">{detail}</span>}
        <Icon name="chevR" className="h-4 w-4 shrink-0 text-faint" />
      </button>
      {open && (
        <Sheet title={label} onClose={() => setOpen(false)}>
          <CardInSheet.Provider value={true}>{children(() => setOpen(false))}</CardInSheet.Provider>
        </Sheet>
      )}
    </>
  );
}
