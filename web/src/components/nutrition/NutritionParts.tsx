import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BARCODE,
  dayLetter,
  detailText,
  gramsText,
  kcalText,
  weekday,
  type Attribution,
  type LabelBadge,
  type LabelDetail,
  type LookupKind,
  type MacroSplit,
  type NutrientValues,
  type PlanDay,
} from '../../api/nutrition';
import BarcodeScanner from '../BarcodeScanner';
import { Icon, type IconName } from '../icons';
import { Button, cx, IconButton, List, Photo, Pill, Row, Segmented, Tile, type PillTone, type Tone } from '../ui';

/*
 The Nutrition screens' own pieces (the mockup's 5.4–5.6, and the teaser on Explore's door): the
 number tiles, the kcal ring and macro donut, the bars against a day's targets, the week chart,
 a label's body, the source line, and the camera for a packet's barcode. Built on ui.tsx and the
 theme's tokens, so every theme and both modes come for free.
*/

/** Protein herb, carbs sky, fat mustard: the same three colours everywhere a macro is drawn. */
export const MACROS: { key: 'protein' | 'carbs' | 'fat'; label: string; tone: Tone }[] = [
  { key: 'protein', label: 'Protein', tone: 'herb' },
  { key: 'carbs', label: 'Carbs', tone: 'sky' },
  { key: 'fat', label: 'Fat', tone: 'mustard' },
];

const STROKE: Record<Tone, string> = {
  accent: 'stroke-accent',
  herb: 'stroke-herb',
  mustard: 'stroke-mustard',
  plum: 'stroke-plum',
  sky: 'stroke-sky',
};

const FILL: Record<Tone, string> = {
  accent: 'bg-accent',
  herb: 'bg-herb',
  mustard: 'bg-mustard',
  plum: 'bg-plum',
  sky: 'bg-sky',
};

const INK: Record<Tone | 'text', string> = {
  text: 'text-ink',
  accent: 'text-accent-ink',
  herb: 'text-herb',
  mustard: 'text-mustard',
  plum: 'text-plum',
  sky: 'text-sky',
};

/** One number in a bordered tile: "118g / PROTEIN" (the mockup's `stat`). */
export function Stat({ value, label, tone = 'text' }: { value: ReactNode; label: string; tone?: Tone | 'text' }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[14px] border border-line bg-surface py-3">
      <span className={cx('serif text-[1.375rem] leading-tight tabular-nums', INK[tone])}>{value}</span>
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-muted">{label}</span>
    </div>
  );
}

/** The kcal in the middle of a ring or donut: a serif number over small capitals. */
function Centre({ kcal }: { kcal: number | null }) {
  return (
    <>
      <span className="serif text-[1.625rem] leading-none tabular-nums">{kcalText(kcal)}</span>
      <span className="mt-1 text-[0.6875rem] font-semibold text-muted">KCAL</span>
    </>
  );
}

/** How much of a day one thing is: an arc of the accent on a quiet track, the kcal inside. */
export function KcalRing({ share, kcal, size = 108, stroke = 11 }: { share: number; kcal: number | null; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const part = Math.max(0, Math.min(share, 1));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface2" />
        {part > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * part} ${c}`}
            className="stroke-accent"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Centre kcal={kcal} />
      </div>
    </div>
  );
}

/** Where the calories come from: protein, carbs and fat as three arcs round the kcal. */
export function MacroDonut({ split, kcal, size = 124, stroke = 14 }: { split: MacroSplit; kcal: number | null; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const empty = split.protein + split.carbs + split.fat === 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        {empty ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface2" />
        ) : (
          MACROS.map(({ key, tone }) => {
            const part = split[key] / 100;
            // A 3px gap between the arcs, as the mockup draws them.
            const arc = (
              <circle
                key={key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(c * part - 3, 0)} ${c}`}
                strokeDashoffset={-offset}
                className={STROKE[tone]}
              />
            );
            offset += c * part;
            return arc;
          })
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Centre kcal={kcal} />
      </div>
    </div>
  );
}

/** The donut's key: each macro's dot, name, grams and share. */
export function MacroLegend({ values, split }: { values: NutrientValues; split: MacroSplit }) {
  return (
    <dl className="flex min-w-0 flex-1 flex-col gap-2.5">
      {MACROS.map(({ key, label, tone }) => (
        <div key={key} className="flex items-center gap-2">
          <span aria-hidden="true" className={cx('h-2.5 w-2.5 shrink-0 rounded-full', FILL[tone])} />
          <dt className="min-w-0 flex-1 text-[0.875rem]">{label}</dt>
          <dd className="text-[0.875rem] font-semibold tabular-nums">{gramsText(values[key])}</dd>
          <dd className="w-8 text-right text-xs tabular-nums text-muted">{split[key]}%</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Protein 41g / 160g" with a bar of how far along the day's target that is. */
export function MacroBar({ label, value, goal, tone }: { label: string; value: number | null; goal: number; tone: Tone }) {
  const part = value == null || goal <= 0 ? 0 : Math.min(value / goal, 1);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[0.875rem]">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          <b className="font-semibold">{gramsText(value)}</b>
          <span className="text-muted"> / {gramsText(goal)}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${label}, of a day's ${gramsText(goal)}`}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={value ?? 0}
        className="h-2 overflow-hidden rounded-[3px] bg-surface2"
      >
        <i className={cx('block h-full rounded-[3px]', FILL[tone])} style={{ width: `${part * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * The week as bars, a day each (5.4): today in the accent, the rest herb, a day with nothing
 * counted as a flat stub. Tall enough to compare days, not to read numbers off — those are in
 * each bar's label for anyone who asks.
 */
export function WeekChart({ days, today }: { days: PlanDay[]; today: string }) {
  const top = Math.max(2600, ...days.map((d) => d.totals.kcal ?? 0));
  // A day with one meal counted is a part of a day, drawn faint and hatched, when the week has
  // fuller days to average (an older server says nothing of fuller days: every bar is solid).
  const anyFuller = days.some((d) => d.fuller);
  return (
    <ol aria-label="Calories each day" className="flex h-[110px] items-end justify-between px-1 md:h-[140px]">
      {days.map((d) => {
        const kcal = d.totals.kcal ?? 0;
        const counted = d.mealsCounted > 0 && kcal > 0;
        const meals = d.mealsPlanned === 0 ? 'nothing planned' : `${d.mealsCounted} of ${d.mealsPlanned} ${d.mealsPlanned === 1 ? 'meal' : 'meals'} counted`;
        const part = counted && anyFuller && d.fuller === false;
        const said = `${weekday(d.date, 'long')}: ${counted ? `${kcalText(kcal)} kcal` : 'no calories counted'}, ${meals}${part ? ', not in the average' : ''}`;
        return (
          <li key={d.date} aria-label={said} title={said} className="flex w-8 flex-col items-center gap-1.5 md:w-12">
            <span
              aria-hidden="true"
              className={cx(
                'w-[22px] rounded-[7px] md:w-7',
                !counted ? 'bg-line' : d.date === today ? 'bg-accent' : 'bg-herb',
                part && 'opacity-40',
              )}
              style={{
                height: counted ? Math.max(6, (kcal / top) * 88) : 4,
                backgroundImage: part
                  ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.55) 0 3px, transparent 3px 7px)'
                  : undefined,
              }}
            />
            <span aria-hidden="true" className="text-[0.6875rem] font-semibold text-muted">
              <span className="md:hidden">{dayLetter(d.date)}</span>
              <span className="max-md:hidden">{weekday(d.date)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The line that says where the numbers come from, small at the foot of a page: the USDA's
 * citation for ingredient data, Open Food Facts' ODbL notice for a packet's. Each links to its
 * source, as both ask.
 */
export function SourceNote({ attribution, className }: { attribution: Attribution; className?: string }) {
  return (
    <p className={cx('px-1 text-[0.75rem] leading-snug text-faint', className)}>
      <a href={attribution.url} target="_blank" rel="noreferrer" className="underline decoration-faint/50 underline-offset-2">
        {attribution.text}
      </a>
      {/* "Data from Open Food Facts (ODbL)" names its licence already. */}
      {!attribution.text.includes(attribution.licence.split(' ')[0]) && ` ${attribution.licence}.`}
    </p>
  );
}

/** A recent lookup's mark: a packet (sky box), an ingredient (herb leaf), or the recipe's own colour. */
export function LookupMark({ kind, seed, size = 40 }: { kind: LookupKind; seed: string; size?: number }) {
  if (kind === 'RECIPE') return <Photo seed={seed} icon="chef" className="rounded-xl" style={{ width: size, height: size }} />;
  return <Tile icon={kind === 'PRODUCT' ? 'box' : 'leaf'} tone={kind === 'PRODUCT' ? 'sky' : 'herb'} size={size} radius={12} />;
}

const BADGE_TONES: Record<LabelBadge['tone'], { tone: PillTone; icon: IconName }> = {
  good: { tone: 'herb', icon: 'check' },
  info: { tone: 'sky', icon: 'check' },
  warn: { tone: 'mustard', icon: 'triangleAlert' },
};

/**
 * The body of a label (5.5), for a packet or an ingredient alike: per 100 g or per serving, the
 * macro donut with its key, the details people check, and the claims it can make. Two columns on
 * a wide screen: the switch and donut on the left, the details and claims on the right.
 */
export function LabelBody({
  per100g,
  split,
  details,
  badges,
  liquid = false,
  serving,
  start = 'serving',
  extraBadges,
  aside,
}: {
  per100g: NutrientValues;
  split: MacroSplit;
  details: LabelDetail[];
  badges: LabelBadge[];
  liquid?: boolean;
  /** The other choice on the switch: a packet's serving, or a food's household measure. */
  serving?: { label: string; grams: number; values?: NutrientValues | null } | null;
  /** Which side of the switch it opens on, when there is a switch. */
  start?: '100' | 'serving';
  /** More pills after the claims: the source, a Nutri-Score. */
  extraBadges?: ReactNode;
  /** Under the details on a wide screen, under everything on a phone. */
  aside?: ReactNode;
}) {
  const [per, setPer] = useState<'100' | 'serving'>(serving ? start : '100');
  const scale = per === 'serving' && serving ? serving.grams / 100 : 1;
  const values = per === 'serving' && serving ? serving.values ?? scaled(per100g, scale) : per100g;
  const unit = liquid ? 'ml' : 'g';
  // The details come per 100 g; a serving's are the same food in a different amount.
  const shownDetails = details.map((d) => ({ ...d, text: detailText(d, scale) }));

  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:items-start md:gap-5">
      <div className="flex flex-col gap-3.5">
        {serving && (
          <Segmented
            label="Show the label"
            value={per}
            onChange={setPer}
            options={[
              { value: '100', label: `Per 100${unit}` },
              { value: 'serving', label: serving.label },
            ]}
          />
        )}
        <div className="card flex items-center gap-4 p-4">
          <MacroDonut split={split} kcal={values.kcal} />
          <MacroLegend values={values} split={split} />
        </div>
      </div>
      <div className="flex flex-col gap-3.5">
        {shownDetails.length > 0 && (
          <List label="Details">
            {shownDetails.map((d) => (
              <Row key={d.key} title={d.label} detail={d.text} className="!min-h-[44px] !py-2" />
            ))}
          </List>
        )}
        {(badges.length > 0 || extraBadges) && (
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <Pill key={b.key} tone={BADGE_TONES[b.tone].tone} icon={BADGE_TONES[b.tone].icon} className="!px-2.5 !py-1 !text-[0.75rem]">
                {b.label}
              </Pill>
            ))}
            {extraBadges}
          </div>
        )}
        {aside}
      </div>
    </div>
  );
}

function scaled(v: NutrientValues, by: number): NutrientValues {
  const out = {} as NutrientValues;
  for (const [k, x] of Object.entries(v) as [keyof NutrientValues, number | null][]) out[k] = x == null ? null : x * by;
  return out;
}

/**
 * The scan button's camera (5.4): the whole screen is the viewfinder until it reads a barcode,
 * then hands it on. If the camera will not open it says why, and the barcode can be typed.
 */
export function NutritionScanner({ onFound, onClose }: { onFound: (barcode: string) => void; onClose: () => void }) {
  const [cameraOff, setCameraOff] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const digits = typed.replace(/\s+/g, '');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan a product"
      className="fixed inset-0 z-[60] flex flex-col bg-[linear-gradient(160deg,#3b3029,#15100d)] text-white"
    >
      {!cameraOff && <BarcodeScanner variant="fill" onFound={onFound} onError={(m) => setCameraOff(m)} />}
      <div className="relative flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <IconButton label="Close" shape="plain" onClick={onClose} className="!bg-white/20 !text-white">
          <Icon name="x" size={18} />
        </IconButton>
      </div>
      <div className="flex-1" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (BARCODE.test(digits)) onFound(digits);
        }}
        className="relative mx-2.5 mb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-3 self-stretch rounded-[30px] bg-bg p-5 text-ink shadow-lift sm:mx-auto sm:w-full sm:max-w-md"
      >
        <p className="text-[0.9375rem] font-semibold">{cameraOff ? 'Type the barcode instead' : 'Point it at the barcode on the packet'}</p>
        {cameraOff && <p className="text-[0.8125rem] text-muted">{cameraOff}</p>}
        <div className="flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="5000112637922"
            aria-label="Barcode"
            className="h-11 min-w-0 flex-1 rounded-field border border-line bg-surface px-3.5 tabular-nums text-ink outline-none placeholder:text-faint focus:border-accent focus:shadow-focus"
          />
          <Button type="submit" disabled={!BARCODE.test(digits)} className="h-11">
            Look up
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** The two things to do with a packet or an ingredient once you know what is in it (5.5). */
export function NutritionBottomBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className="h-24 md:h-20" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2.5">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-5 md:px-8 lg:max-w-5xl">{children}</div>
      </div>
    </>
  );
}
