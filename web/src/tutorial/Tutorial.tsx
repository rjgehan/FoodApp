import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, cx } from '../components/ui';
import { Icon } from '../components/icons';
import { pickTheme, useTheme } from '../theme/sync';
import type { ThemeMode } from '../theme/theme';
import { setDeviceMode } from '../theme/deviceMode';
import { markTutorialSeen } from './seen';

/*
 The first-run tutorial: two slides showing the app, then "Light or dark?", then wherever the
 person was going — the sign-in screen, or (somebody who arrived through an invite and has just
 joined) straight into the app.

 Each slide is a picture of the real app in a phone's frame, a title and one line. The pictures
 are placeholders until the redesign's own screenshots are taken: public/tutorial/README.md says
 how to swap them.
*/

const SLIDES = [
  {
    title: 'Plan the week together',
    line: 'Everyone in the house sees the same plan, and fills it in from their own phone.',
    light: '/tutorial/placeholder-plan-light.png',
    dark: '/tutorial/placeholder-plan-dark.png',
    alt: 'The Plan screen: a month calendar with the planning week tinted, and the next meals under it.',
  },
  {
    title: 'One list for the shop',
    line: 'Planned meals become one grocery list, sorted by aisle and ticked off live as you shop.',
    light: '/tutorial/placeholder-groceries-light.png',
    dark: '/tutorial/placeholder-groceries-dark.png',
    alt: 'The Groceries screen: one shared list grouped by aisle, with items ticked off.',
  },
] as const;

const STEPS = SLIDES.length + 1;

export default function Tutorial({ onDone, finish }: { onDone: () => void; finish: 'sign-in' | 'app' }) {
  const [step, setStep] = useState(0);
  const theme = useTheme();
  const [mode, setMode] = useState<ThemeMode>(theme.mode ?? 'SYSTEM');
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const atTheme = step === SLIDES.length;

  function go(next: number) {
    setStep(Math.max(0, Math.min(STEPS - 1, next)));
  }

  function choose(next: ThemeMode) {
    setMode(next);
    // On the page at once, so the choice is made by looking rather than imagining.
    pickTheme({ ...theme, mode: next });
  }

  function done(answered: boolean) {
    // Passing the question is an answer too: "Match my phone" is the one already showing.
    if (answered) {
      setDeviceMode(mode);
      pickTheme({ ...theme, mode });
    }
    markTutorialSeen();
    onDone();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-bg pb-safe pt-safe"
      // A flick sideways turns the page, as it would anywhere else on a phone.
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = swipe.current;
        swipe.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - start.y) * 1.5) go(step + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-5">
        <header className="flex h-12 shrink-0 items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="press -ml-1.5 flex h-11 items-center gap-0.5 text-[1.0625rem] text-accent-ink"
            >
              <Icon name="chevL" size={26} />
              <span>Back</span>
            </button>
          ) : (
            <span />
          )}
          {!atTheme && (
            <button
              type="button"
              onClick={() => done(false)}
              className="press flex h-11 items-center px-1 text-[1.0625rem] font-medium text-accent-ink"
            >
              Skip
            </button>
          )}
        </header>

        <section
          key={step}
          aria-roledescription="slide"
          aria-label={`${step + 1} of ${STEPS}`}
          className="flex min-h-0 flex-1 animate-rise flex-col"
        >
          {atTheme ? (
            <LightOrDark mode={mode} onChoose={choose} />
          ) : (
            <Slide slide={SLIDES[step]} />
          )}
        </section>

        <footer className="flex shrink-0 flex-col items-center gap-5 pb-5 pt-4">
          <Dots step={step} onGo={go} />
          <Button
            full
            size="lg"
            onClick={() => (atTheme ? done(true) : go(step + 1))}
          >
            {atTheme ? (finish === 'sign-in' ? 'Continue' : 'Start planning') : 'Next'}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Slide({ slide }: { slide: (typeof SLIDES)[number] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
      <PhoneFrame light={slide.light} dark={slide.dark} alt={slide.alt} />
      <h1 className="serif mt-7 text-[1.75rem] leading-tight">{slide.title}</h1>
      <p className="mt-2 max-w-[320px] text-base leading-normal text-muted">{slide.line}</p>
    </div>
  );
}

/**
 * A screenshot in the shape of a phone: a dark bezel round the screen, the screen's own rounded
 * corners, and the mockup's soft shadow. Sized by height, so it fits the screen it is shown on.
 */
function PhoneFrame({ light, dark, alt }: { light: string; dark: string; alt: string }) {
  // The screen's corners are 13% of its width, as on the phone the pictures were taken from.
  const style = { '--ph': 'min(52dvh, 470px)' } as CSSProperties;
  return (
    <div
      style={style}
      className="rounded-[calc(var(--ph)*0.061+6px)] bg-[#1F1915] p-[6px] shadow-lift ring-1 ring-ink/10"
    >
      <div className="relative h-[var(--ph)] overflow-hidden rounded-[calc(var(--ph)*0.061)]" style={{ aspectRatio: '786 / 1706' }}>
        <img src={light} alt={alt} className="h-full w-full object-cover dark:hidden" draggable={false} />
        <img src={dark} alt={alt} className="hidden h-full w-full object-cover dark:block" draggable={false} />
      </div>
    </div>
  );
}

const PREVIEW = { LIGHT: '/tutorial/placeholder-plan-light.png', DARK: '/tutorial/placeholder-plan-dark.png' };

/** The third step: two big cards showing the app each way, and "Match my phone". */
function LightOrDark({ mode, onChoose }: { mode: ThemeMode; onChoose: (mode: ThemeMode) => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="pt-4 text-center">
        <h1 className="serif text-[1.75rem] leading-tight">Light or dark?</h1>
        <p className="mx-auto mt-2 max-w-[320px] text-base leading-normal text-muted">
          Pick how Meal Planner looks. You can change it any time in Settings.
        </p>
      </div>
      <div role="radiogroup" aria-label="Light or dark" className="mt-6 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {(['LIGHT', 'DARK'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onChoose(m)}
              className={cx(
                'press card flex flex-col gap-2.5 p-2.5 text-left outline-none',
                mode === m && 'border-accent ring-2 ring-accent',
              )}
            >
              <span className="block overflow-hidden rounded-[12px] border border-line" style={{ aspectRatio: '1 / 1.05' }}>
                {/* From below the screenshot's own rounded corners and clock: the app itself. */}
                <img src={PREVIEW[m]} alt="" className="h-full w-full object-cover object-[50%_13%]" draggable={false} />
              </span>
              <span className="flex items-center justify-between px-1 pb-0.5">
                <span className="text-base font-semibold">{m === 'LIGHT' ? 'Light' : 'Dark'}</span>
                <Choice on={mode === m} />
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'SYSTEM'}
          onClick={() => onChoose('SYSTEM')}
          className={cx(
            'press card flex min-h-[60px] items-center gap-3 px-4 py-3 text-left outline-none',
            mode === 'SYSTEM' && 'border-accent ring-2 ring-accent',
          )}
        >
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-soft text-sky">
            <Icon name="phone" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Match my phone</span>
            <span className="block text-[0.8125rem] text-muted">Light by day, dark at night — as your phone is set</span>
          </span>
          <Choice on={mode === 'SYSTEM'} />
        </button>
      </div>
    </div>
  );
}

/** The chosen card's mark: the accent with a tick, as on the Theme screen. */
function Choice({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.6px]',
        on ? 'border-accent bg-accent text-on-accent' : 'border-faint',
      )}
    >
      {on && <Icon name="check" size={14} strokeWidth={3} />}
    </span>
  );
}

function Dots({ step, onGo }: { step: number; onGo: (step: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: STEPS }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onGo(i)}
          aria-label={`Page ${i + 1} of ${STEPS}`}
          aria-current={i === step ? 'step' : undefined}
          // A finger-sized target round a small dot.
          className="flex h-6 items-center"
        >
          <span
            className={cx(
              'block h-1.5 rounded-full transition-all duration-200',
              i === step ? 'w-[18px] bg-accent' : 'w-1.5 bg-faint',
            )}
          />
        </button>
      ))}
    </div>
  );
}
