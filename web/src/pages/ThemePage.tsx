import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePushedScreen } from '../components/Layout';
import { Icon } from '../components/icons';
import { ThemeSwatch } from '../components/ThemeSwatch';
import { Button, cx, ErrorText, NavBar, Pill, SectionLabel, Segmented } from '../components/ui';
import { contrast, hexToRgb, normalizeHex } from '../theme/colors';
import { pickTheme, saveTheme, useTheme } from '../theme/sync';
import { accentOf, activeKey, CUSTOM, THEMES, type Theme, type ThemeMode } from '../theme/theme';

const MODES: { value: ThemeMode; label: string }[] = [
  { value: 'LIGHT', label: 'Light' },
  { value: 'DARK', label: 'Dark' },
  { value: 'SYSTEM', label: 'System' },
];

/** Where the Theme screen's back button goes: the page Settings was opened over, with Settings open again. */
export interface ThemeScreenState {
  from?: string;
}

/**
 * The Theme screen (mockup 6.9): light, dark or the system's, and one of five themes or your own
 * accent. Every tap takes effect at once, across the whole app, and is saved to your account so
 * your other devices follow — there is no Save to hunt for. Dragging the colour picker saves once
 * it settles.
 */
export default function ThemePage() {
  usePushedScreen();
  const theme = useTheme();
  const key = activeKey(theme);
  const navigate = useNavigate();
  const from = (useLocation().state as ThemeScreenState | null)?.from;
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

  // A drag still settling when the screen closes is saved on the way out, not dropped.
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

  // Custom starts from the accent on screen, so it is a nudge away from what you had.
  const customAccent = theme.primary ?? accentOf(theme);

  return (
    <div className="mx-auto max-w-xl pb-6">
      <NavBar
        title="Theme"
        backLabel="Settings"
        back={() => navigate(from ?? '/meal-plan', { state: { openSettings: true } })}
        className="-mx-1 mb-1.5"
      />

      <div className="space-y-4">
        <Segmented
          label="Light or dark"
          options={MODES}
          value={theme.mode ?? 'SYSTEM'}
          onChange={(mode) => choose({ ...theme, mode })}
        />

        <section aria-label="Colour">
          <SectionLabel className="pt-1">Colour</SectionLabel>
          <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Colour">
            {THEMES.map((t) => (
              <ThemeTile
                key={t.key}
                name={t.name}
                description={t.tagline}
                swatch={t.light.accent}
                selected={key === t.key}
                onClick={() => choose({ ...theme, preset: t.key })}
              />
            ))}
            <ThemeTile
              name="Custom"
              description="Tomato's paper and ink, with your own accent."
              swatch={customAccent}
              custom
              selected={key === CUSTOM}
              onClick={() => choose({ ...theme, preset: CUSTOM, primary: customAccent, secondary: customAccent })}
            />
          </div>
        </section>

        {key === CUSTOM && (
          <ColorField
            value={theme.primary!}
            onChange={(primary) => choose({ ...theme, primary, secondary: primary }, { settle: true })}
          />
        )}

        <section className="card space-y-2.5 p-4" aria-label="Preview">
          <SectionLabel className="!px-0 !pb-0">Preview</SectionLabel>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button size="sm" tabIndex={-1}>
              Button
            </Button>
            <Pill tone="herb" icon="check">
              On grocery list
            </Pill>
            <Pill tone="mustard" icon="alert">
              Not on list
            </Pill>
          </div>
          <p className="title-section !text-[1.375rem]">Lemon herb chicken</p>
        </section>

        <div className="min-h-5 px-1" aria-live="polite">
          {error ? <ErrorText>{error}</ErrorText> : saved && <p className="text-sm text-muted">Saved to your account.</p>}
        </div>
      </div>
    </div>
  );
}

/** One theme's tile: its accent as a big dot (ticked when on), and its name. */
function ThemeTile({
  name,
  description,
  swatch,
  selected,
  custom = false,
  onClick,
}: {
  name: string;
  description: string;
  swatch: string;
  selected: boolean;
  custom?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      title={description}
      onClick={onClick}
      className={cx(
        'press card flex flex-col items-center gap-2 !rounded-[18px] px-2 py-3 transition-[border-color]',
        selected && '!border-2',
      )}
      style={selected ? { borderColor: swatch, padding: 'calc(0.75rem - 1px) calc(0.5rem - 1px)' } : undefined}
    >
      <ThemeSwatch color={swatch} rainbow={custom && !selected} className="h-[46px] w-[46px]">
        {selected && (
          // White on the dark dots, ink on the light ones (Brunch's yolk, a pale custom pick).
          <Icon
            name="check"
            size={20}
            strokeWidth={3}
            className={contrast(hexToRgb(swatch), [255, 255, 255]) >= 2.2 ? 'text-white' : 'text-[#2B211A]'}
          />
        )}
      </ThemeSwatch>
      <span className="text-[0.8125rem] font-semibold">{name}</span>
    </button>
  );
}

/**
 * The custom accent, two ways: the system picker behind a swatch, and the hex for anyone who has
 * one in mind. The text box keeps what is typed until it is a colour, rather than fighting each key.
 */
function ColorField({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    if (normalizeHex(text) !== value) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bad = text.trim() !== '' && normalizeHex(text) === null;

  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <label
        className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
        style={{ backgroundColor: value }}
      >
        <span className="sr-only">Pick your colour</span>
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
        <label htmlFor="custom-colour" className="block font-medium">
          Your colour
        </label>
        <p className="text-[0.8125rem] leading-snug text-muted">Adjusted where it has to be so text stays readable.</p>
      </div>
      <input
        id="custom-colour"
        value={text}
        aria-label="Your colour hex"
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
          'h-10 w-[6.5rem] shrink-0 rounded-[10px] border bg-surface2 px-2 text-center font-mono uppercase text-ink outline-none',
          bad ? 'border-danger' : 'border-transparent focus:border-accent',
        )}
      />
    </div>
  );
}
