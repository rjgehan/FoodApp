import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import {
  animateSpring,
  prefersReducedMotion,
  project,
  rubberband,
  trimSamples,
  velocityOf,
  type Animation,
} from '../utils/spring';
import { ChevronRightIcon, MoreIcon } from './icons';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * A titled section of a page — deliberately not a box. A heading and some space do the grouping;
 * dividers are kept for rows in a list.
 */
/** Inside a sheet the sheet already names the section, so cards there drop their own title. */
const CardInSheet = createContext(false);
export const CardInSheetProvider = CardInSheet.Provider;

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
        <header className="mb-1.5 flex min-h-9 items-center justify-between gap-3">
          {title && <h2 className="title-3">{title}</h2>}
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A quiet heading inside a section or sheet — the aisle names on the grocery list, say. */
export function SubHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cx('group-label px-4 pb-1.5 pt-5 first:pt-0', className)}>{children}</h3>;
}

/*
 * Filled rather than outlined — an outlined button is one more box. Every one answers the finger
 * the moment it lands (`press`), not when it lifts.
 */
const BUTTON_VARIANTS = {
  primary: 'bg-accent text-accent-ink active:brightness-95',
  secondary: 'bg-elevated text-ink active:bg-line',
  // Text buttons are tinted, the way iOS marks "this is tappable" without drawing a box.
  ghost: 'text-accent active:bg-elevated',
  // Icons in rows stay grey: a column of orange bins would be the loudest thing on the page.
  quiet: 'text-muted active:bg-elevated',
  danger: 'bg-danger-soft text-danger active:brightness-95',
};

const TEXT_COLOR = /(^|\s)text-(ink|muted|subtle|accent|danger|success)(\s|$)/;

/**
 * A caller's own text colour replaces the variant's, rather than racing it: which of two
 * `text-*` classes wins is decided by stylesheet order, not by the order they are written in.
 */
function variantClass(variant: keyof typeof BUTTON_VARIANTS, className?: string) {
  const base = BUTTON_VARIANTS[variant];
  if (!className || !TEXT_COLOR.test(className)) return base;
  return base.replace(/(^|\s)text-[\w-]+/, '');
}

const BUTTON_SIZES = {
  // Every size clears 44px of touch target except `sm`, which is for dense rows.
  sm: 'h-9 px-3 text-[0.9375rem] rounded-[10px] gap-1.5',
  md: 'h-11 px-4 text-[1.0625rem] rounded-xl gap-2',
  lg: 'h-[3.125rem] px-5 text-[1.0625rem] rounded-[14px] gap-2',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  full = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  full?: boolean;
}) {
  return (
    <button
      className={cx(
        'press inline-flex items-center justify-center font-semibold select-none',
        'disabled:opacity-40 disabled:pointer-events-none',
        variantClass(variant, className),
        BUTTON_SIZES[size],
        full && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Square tap target for a bare icon. Always 44px so it is thumb-reachable. */
export function IconButton({
  children,
  label,
  variant = 'quiet',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: keyof typeof BUTTON_VARIANTS;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
        'disabled:opacity-40 disabled:pointer-events-none',
        variantClass(variant, className),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* Filled fields, like iOS's: a grey well that turns white with an accent edge while you type. */
const CONTROL =
  'h-11 rounded-xl border border-transparent bg-elevated px-3 text-ink placeholder:text-subtle ' +
  'outline-none transition-colors focus:border-accent focus:bg-surface disabled:opacity-50';

/**
 * Controls fill their container unless the caller sets a width. Tailwind emits `w-full` after
 * `w-24`, so baking `w-full` into the base would silently win over any caller override.
 */
function controlClass(extra?: string, className?: string) {
  const merged = cx(extra, className);
  return cx(CONTROL, !/(^|\s)w-/.test(merged) && 'w-full', merged);
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

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={controlClass('appearance-none pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={controlClass('h-auto py-2.5 leading-relaxed', className)} {...props} />;
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[0.8125rem] font-medium text-muted">
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
      {hint && <p className="mt-1.5 text-[0.8125rem] text-muted">{hint}</p>}
    </div>
  );
}

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

/**
 * A bottom sheet on phones, a centred dialog on wider screens.
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
  onClose,
  children,
  tall = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  tall?: boolean;
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // With one sheet over another, Escape closes the top one — not both at once.
      const open = document.querySelectorAll('[role="dialog"]');
      if (open.length > 0 && open[open.length - 1] !== panel.current) return;
      dismiss();
    }
    window.addEventListener('keydown', onKey);
    // Stop the page behind from scrolling while the sheet is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [dismiss]);

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
      className="fixed inset-x-0 z-40 flex items-end justify-center sm:items-center"
      style={{ top: viewport.top, height: viewport.height }}
    >
      <div ref={scrim} className="absolute inset-0 bg-black/40" onClick={dismiss} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        className={cx(
          // Surface, not page: in dark mode a sheet is lifted by being lighter, as on iOS.
          'relative flex w-full flex-col rounded-t-[14px] bg-surface pb-safe shadow-2xl will-change-transform',
          'sm:max-w-md sm:rounded-[14px]',
          tall ? 'h-[calc(100%-1.5rem)] sm:h-[min(40rem,85vh)]' : 'max-h-[calc(100%-1.5rem)] sm:max-h-[85vh]',
        )}
      >
        {/* The handle: the grabber and title bar are what you pull, so the list below still scrolls. */}
        <div
          className="touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex justify-center pt-1.5 sm:hidden" aria-hidden="true">
            <span className="h-[5px] w-9 rounded-full bg-line" />
          </div>
          <header className="flex items-center justify-between gap-3 pb-1 pl-4 pr-2 pt-1 sm:pt-2">
            <h2 className="min-w-0 truncate text-[1.0625rem] font-semibold">{title}</h2>
            <IconButton label="Close" onClick={dismiss}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-elevated text-muted">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3}
                     strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </span>
            </IconButton>
          </header>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">{children}</div>
      </div>
    </div>
  );
}

const BADGE_TONES = {
  neutral: 'bg-elevated text-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof BADGE_TONES }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[0.9375rem] text-muted">{children}</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-danger">{children}</p>;
}

/**
 * Large, obviously-tappable checkbox — the 16px native one is far too small on a phone. The tick
 * settles in as it appears, so ticking something off registers.
 */
export function CheckCircle({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150',
        checked ? 'border-accent bg-accent text-accent-ink' : 'border-subtle/60',
        className,
      )}
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="pop h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3.5}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      )}
    </span>
  );
}

/**
 * An on/off pill, for a setting that takes effect the moment it is flipped — no Save to hunt
 * for. Only the drawing: the row it sits in is the button (with role="switch"), so the whole row
 * is the thing to tap rather than a small pill at its end.
 */
export function SwitchKnob({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-150',
        on ? 'bg-accent' : 'bg-subtle/40',
        className,
      )}
    >
      <span
        className={cx(
          'absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150',
          on && 'translate-x-5',
        )}
      />
    </span>
  );
}

/** Filter pill for the recipe catalog. */
export function Chip({
  active,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      // A chip that can be on or off says which, so a screen reader hears "selected" too.
      aria-pressed={active}
      className={cx(
        'press shrink-0 rounded-full px-3.5 py-2 text-[0.9375rem] font-medium',
        active ? 'bg-accent text-accent-ink' : 'bg-elevated text-ink',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export type MenuItem = {
  label: ReactNode;
  onSelect: () => void;
  tone?: 'danger';
  disabled?: boolean;
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
}: {
  label: string;
  title?: ReactNode;
  items: (MenuItem | false | null | undefined)[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = items.filter(Boolean) as MenuItem[];
  if (shown.length === 0) return null;

  return (
    <>
      <IconButton label={label} variant="ghost" className={className} onClick={() => setOpen(true)}>
        <MoreIcon className="h-5 w-5" />
      </IconButton>
      {open && (
        <Sheet title={title ?? label} onClose={() => setOpen(false)}>
          <ul className="divide-y divide-line">
            {shown.map((item, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cx(
                    'press flex min-h-touch w-full items-center py-3 text-left text-[1.0625rem] disabled:opacity-40',
                    item.tone === 'danger' ? 'text-danger' : 'text-accent',
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
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
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-subtle" />
      </button>
      {open && (
        <Sheet title={label} onClose={() => setOpen(false)}>
          <CardInSheet.Provider value={true}>{children(() => setOpen(false))}</CardInSheet.Provider>
        </Sheet>
      )}
    </>
  );
}
