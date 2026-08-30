import { useEffect, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({
  title,
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
  return (
    <section className={cx('rounded-2xl border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
          {title && <h2 className="font-semibold leading-tight">{title}</h2>}
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cx('px-4 pb-4', !title && !actions && 'pt-4', bodyClassName)}>{children}</div>
    </section>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-accent-ink active:brightness-95',
  secondary: 'border border-line bg-surface text-ink active:bg-elevated',
  ghost: 'text-muted active:bg-elevated',
  danger: 'border border-line text-danger active:bg-danger-soft',
};

const BUTTON_SIZES = {
  // Every size clears 44px of touch target except `sm`, which is for dense desktop rows.
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-[0.95rem] rounded-xl gap-2',
  lg: 'h-12 px-5 text-base rounded-xl gap-2',
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
        'inline-flex items-center justify-center font-medium transition-colors select-none',
        'disabled:opacity-40 disabled:pointer-events-none',
        BUTTON_VARIANTS[variant],
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
  variant = 'ghost',
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
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
        'disabled:opacity-40 disabled:pointer-events-none',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const CONTROL =
  'h-11 rounded-xl border border-line bg-surface px-3 text-ink placeholder:text-subtle ' +
  'outline-none transition-colors focus:border-accent disabled:opacity-50';

/**
 * Controls fill their container unless the caller sets a width. Tailwind emits `w-full` after
 * `w-24`, so baking `w-full` into the base would silently win over any caller override.
 */
function controlClass(extra?: string, className?: string) {
  const merged = cx(extra, className);
  return cx(CONTROL, !/(^|\s)w-/.test(merged) && 'w-full', merged);
}

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
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-muted">
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
      {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

/**
 * A bottom sheet on phones, a centred dialog on wider screens. Used for the meal-plan day
 * editor so planning happens where you tapped instead of in a panel far below the calendar.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    // Stop the page behind from scrolling while the sheet is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-line bg-bg
                   pb-safe sm:max-w-md sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="min-w-0 truncate font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}
                 strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
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
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-danger">{children}</p>;
}

/** Large, obviously-tappable checkbox — the 16px native one is far too small on a phone. */
export function CheckCircle({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        checked ? 'border-accent bg-accent text-accent-ink' : 'border-line',
        className,
      )}
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3.5}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      )}
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
      className={cx(
        'shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
        active ? 'bg-accent text-accent-ink' : 'bg-elevated text-muted',
      )}
      {...props}
    >
      {children}
    </button>
  );
}
