import { useEffect, useRef, useState } from 'react';
import { normalizeHex, type ModeColors } from '../theme/colors';
import {
  activeKey,
  CLASSIC_COLORS,
  colorsOf,
  CUSTOM,
  pairOf,
  PRESETS,
  presetNamed,
  type Theme,
  type ThemeMode,
} from '../theme/theme';
import { pickTheme, saveTheme, useTheme } from '../theme/sync';
import { CheckIcon } from './icons';
import { cx, ErrorText, Sheet } from './ui';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'LIGHT', label: 'Light' },
  { value: 'DARK', label: 'Dark' },
  { value: 'SYSTEM', label: 'Auto' },
];

/** What the Settings row says: the colours' name, and light or dark if that is pinned. */
export function appearanceSummary(theme: Theme): string {
  const key = activeKey(theme);
  const name = key === CUSTOM ? 'Custom' : presetNamed(key)!.name;
  if (theme.mode === 'LIGHT') return `${name}, light`;
  if (theme.mode === 'DARK') return `${name}, dark`;
  return name;
}

/** Two colours as one round swatch: the main one, with the second as a crescent on its edge. */
export function PairSwatch({ primary, secondary, className }: { primary: string; secondary: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('block shrink-0 rounded-full', className)}
      style={{ background: `linear-gradient(135deg, ${primary} 0 58%, ${secondary} 58% 100%)` }}
    />
  );
}

/**
 * The Settings row for Appearance, and the sheet behind it. A row of its own, like Household
 * settings, rather than more of the Settings sheet: the swatches want the room.
 */
export function AppearanceRow() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const { primary, secondary } = pairOf(theme);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press -mt-1 mb-3 flex min-h-touch w-full items-center gap-3 rounded-xl bg-elevated px-4 py-3
                   text-left text-ink"
      >
        <span className="flex-1 font-medium">Appearance</span>
        <span className="truncate text-[0.9375rem] text-muted">{appearanceSummary(theme)}</span>
        <PairSwatch primary={primary} secondary={secondary} className="h-5 w-5" />
      </button>
      {open && (
        <Sheet title="Appearance" onClose={() => setOpen(false)}>
          <AppearanceSettings />
        </Sheet>
      )}
    </>
  );
}

/**
 * Light or dark, and the app's colours: eight pairs chosen to read well, or your own. Every tap
 * takes effect at once, across the whole app, and is saved to your account so your other
 * devices follow — there is no Save to hunt for. Dragging a colour picker saves once it settles.
 */
export default function AppearanceSettings() {
  const theme = useTheme();
  const key = activeKey(theme);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  function persist(next: Theme) {
    setError(null);
    saveTheme(next)
      .then(() => {
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1500);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not save that.'));
  }

  /** On the page now; on the server now, or once a drag has stopped for a moment. */
  function choose(next: Theme, { settle = false } = {}) {
    pickTheme(next);
    if (pending.current) clearTimeout(pending.current);
    if (settle) pending.current = setTimeout(() => persist(next), 500);
    else persist(next);
  }

  // A drag still settling when the sheet closes is saved on the way out, not dropped.
  const latest = useRef(theme);
  latest.current = theme;
  useEffect(
    () => () => {
      if (pending.current) {
        clearTimeout(pending.current);
        saveTheme(latest.current).catch(() => undefined);
      }
    },
    [],
  );

  // Custom starts from the colours on screen, so it is a nudge away from what you had.
  const customPair = theme.primary && theme.secondary ? { primary: theme.primary, secondary: theme.secondary } : pairOf(theme);

  return (
    <div className="space-y-6 pb-2">
      <section aria-label="Light or dark">
        <div className="flex rounded-xl bg-elevated p-0.5" role="radiogroup" aria-label="Light or dark">
          {MODES.map((m) => {
            const on = (theme.mode ?? 'SYSTEM') === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose({ ...theme, mode: m.value })}
                className={cx(
                  'h-9 flex-1 rounded-lg px-2 text-[0.9375rem] font-medium transition-colors',
                  on ? 'bg-surface text-ink shadow-sm' : 'text-muted',
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 px-1 text-[0.8125rem] text-muted">Auto follows your phone or computer.</p>
      </section>

      <section aria-label="Colours">
        <h3 className="group-label mb-2 px-1">Colours</h3>
        <div className="grid grid-cols-4 gap-x-2 gap-y-3" role="radiogroup" aria-label="Colours">
          {PRESETS.map((p) => (
            <SwatchButton
              key={p.key}
              name={p.name}
              selected={key === p.key}
              primary={p.primary}
              secondary={p.secondary}
              onClick={() => choose({ ...theme, preset: p.key })}
            />
          ))}
        </div>
        <button
          type="button"
          role="radio"
          aria-checked={key === CUSTOM}
          onClick={() => choose({ ...theme, preset: CUSTOM, ...customPair })}
          className={cx(
            'press mt-3 flex min-h-touch w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left',
            key === CUSTOM ? 'bg-secondary-soft text-secondary' : 'bg-elevated text-ink',
          )}
        >
          <span
            aria-hidden="true"
            className="h-7 w-7 shrink-0 rounded-full"
            style={{ background: 'conic-gradient(#ef4444, #f59e0b, #84cc16, #10b981, #0ea5e9, #6366f1, #d946ef, #ef4444)' }}
          />
          <span className="flex-1 font-medium">Your own colours</span>
          {key === CUSTOM && <CheckIcon className="h-5 w-5" />}
        </button>

        {key === CUSTOM && (
          <div className="mt-3 space-y-3">
            <ColorField
              label="Main colour"
              hint="Buttons, links and the tab you're on."
              value={theme.primary!}
              onChange={(primary) => choose({ ...theme, primary }, { settle: true })}
            />
            <ColorField
              label="Second colour"
              hint="Highlights: your initial, badges, today on the plan."
              value={theme.secondary!}
              onChange={(secondary) => choose({ ...theme, secondary }, { settle: true })}
            />
            <p className="px-1 text-[0.8125rem] text-muted">
              Adjusted where it has to be so text on it stays readable, in light and in dark.
            </p>
          </div>
        )}
      </section>

      <section aria-label="Preview">
        <h3 className="group-label mb-2 px-1">Preview</h3>
        <div className="grid grid-cols-2 gap-2">
          <Preview label="Light" colors={(colorsOf(theme) ?? CLASSIC_COLORS).light} dark={false} />
          <Preview label="Dark" colors={(colorsOf(theme) ?? CLASSIC_COLORS).dark} dark />
        </div>
      </section>

      <div className="min-h-5 px-1" aria-live="polite">
        {error ? <ErrorText>{error}</ErrorText> : saved && <p className="text-sm text-muted">Saved to your account.</p>}
      </div>
    </div>
  );
}

function SwatchButton({
  name,
  selected,
  primary,
  secondary,
  onClick,
}: {
  name: string;
  selected: boolean;
  primary: string;
  secondary: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      onClick={onClick}
      className="press flex flex-col items-center gap-1.5"
    >
      <span
        className={cx(
          'relative flex h-14 w-14 items-center justify-center rounded-full p-[3px] transition-shadow',
          selected ? 'shadow-[0_0_0_2px_rgb(var(--ink))]' : '',
        )}
      >
        <PairSwatch primary={primary} secondary={secondary} className="h-full w-full" />
        {selected && (
          <span className="absolute inset-0 flex items-center justify-center text-white">
            <CheckIcon className="h-5 w-5 drop-shadow" />
          </span>
        )}
      </span>
      <span className={cx('text-[0.8125rem]', selected ? 'font-semibold text-ink' : 'text-muted')}>{name}</span>
    </button>
  );
}

/**
 * A colour, two ways: the system picker behind a swatch, and the hex for anyone who has one in
 * mind. The text box keeps what is typed until it is a colour, rather than fighting each key.
 */
function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    if (normalizeHex(text) !== value) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const id = `color-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const bad = text.trim() !== '' && normalizeHex(text) === null;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-elevated px-3 py-2.5">
      <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
             style={{ backgroundColor: value }}>
        <span className="sr-only">{label}</span>
        <input
          type="color"
          value={value.toLowerCase()}
          onChange={(e) => {
            const hex = normalizeHex(e.target.value);
            if (hex) onChange(hex);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block font-medium">
          {label}
        </label>
        <p className="text-[0.8125rem] leading-snug text-muted">{hint}</p>
      </div>
      <input
        id={id}
        value={text}
        aria-label={`${label} hex`}
        aria-invalid={bad}
        onChange={(e) => {
          setText(e.target.value);
          const hex = normalizeHex(e.target.value);
          if (hex) onChange(hex);
        }}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={7}
        className={cx(
          'h-10 w-[6.5rem] shrink-0 rounded-lg border bg-surface px-2 text-center font-mono uppercase text-ink outline-none',
          bad ? 'border-danger' : 'border-transparent focus:border-accent',
        )}
      />
    </div>
  );
}

/**
 * A corner of the app in the chosen colours, light and dark side by side — so a custom pick
 * can be judged in the mode you are not in as well. Drawn with the colours directly, since the
 * page itself is only ever in one of the two.
 */
function Preview({ label, colors, dark }: { label: string; colors: ModeColors; dark: boolean }) {
  const surface = dark ? '#1C1C1E' : '#FFFFFF';
  const ink = dark ? '#F5F5F7' : '#1D1D1F';
  const muted = dark ? '#98989D' : '#6E6E73';
  const well = dark ? '#000000' : '#F2F2F7';
  return (
    <div className="rounded-2xl p-2" style={{ backgroundColor: well }} aria-label={`${label} preview`} role="img">
      <div className="space-y-2.5 rounded-xl p-3" style={{ backgroundColor: surface, color: ink }}>
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
            style={{ backgroundColor: colors.secondarySoft, color: colors.secondary }}
          >
            R
          </span>
          <span className="text-[0.8125rem] font-medium" style={{ color: muted }}>
            {label}
          </span>
        </div>
        <span
          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: colors.secondarySoft, color: colors.secondary }}
        >
          Today
        </span>
        <p className="text-sm font-semibold" style={{ color: colors.accent }}>
          See recipe
        </p>
        <span
          className="flex h-8 items-center justify-center rounded-lg text-sm font-semibold"
          style={{ backgroundColor: colors.accent, color: colors.accentInk }}
        >
          Add to plan
        </span>
      </div>
    </div>
  );
}
