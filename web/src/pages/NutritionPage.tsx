import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  averageWords,
  BARCODE,
  foodTitle,
  gramsText,
  isoDay,
  kcalText,
  USDA,
  type PlanNutrition,
  type RecentLookup,
  type SearchAnswer,
} from '../api/nutrition';
import { useHousehold } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import { Icon } from '../components/icons';
import { EmptyState, List, NavBar, Pill, Row, SearchField, SectionLabel, Tile } from '../components/ui';
import { LookupMark, NutritionScanner, SourceNote, Stat, WeekChart } from '../components/nutrition/NutritionParts';

/** Typing settles for this long before the server is asked: it is a lookup, not a race. */
const TYPING_MS = 250;

/** Packets are asked for when you press search, never as you type: Open Food Facts bans busy addresses. */
type Packets = { at: 'not-asked' } | { at: 'asking' } | { at: 'answered'; answer: SearchAnswer };

/**
 * Nutrition facts (the mockup's 5.4): look up any ingredient, packet or recipe of yours, or scan
 * a packet's barcode; and see how the coming week's plan adds up, a day at a time, for one
 * person. Underneath, what you looked at last.
 *
 * Ingredients and recipes are found as you type — they are the server's own data. Packets come
 * from Open Food Facts, a charity that turns away addresses that ask too often, so they are only
 * asked for when you press search (or Enter), and the server keeps its own count as well.
 */
export default function NutritionPage() {
  usePushedScreen();
  const navigate = useNavigate();
  const { activeHouseholdId } = useHousehold();
  const [week, setWeek] = useState<PlanNutrition | null>(null);
  const [weekFailed, setWeekFailed] = useState(false);
  const [recent, setRecent] = useState<RecentLookup[] | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<SearchAnswer | null>(null);
  const [packets, setPackets] = useState<Packets>({ at: 'not-asked' });
  const [scanning, setScanning] = useState(false);
  const asked = useRef(0);
  const today = isoDay(0);
  const q = query.trim();

  useEffect(() => {
    if (!activeHouseholdId) return;
    let live = true;
    setWeekFailed(false);
    // The next seven days from today, so the chart is always a week whatever the planning window.
    api<PlanNutrition>('GET', `/api/nutrition/households/${activeHouseholdId}/plan?start=${isoDay(0)}&end=${isoDay(6)}`)
      .then((w) => live && setWeek(w))
      .catch(() => live && setWeekFailed(true));
    return () => {
      live = false;
    };
  }, [activeHouseholdId]);

  // Only recipes this household can open: one looked up in another house stays there.
  useEffect(() => {
    if (!activeHouseholdId) return;
    let live = true;
    api<RecentLookup[]>('GET', `/api/nutrition/recent?householdId=${activeHouseholdId}`)
      .then((r) => live && setRecent(r))
      .catch(() => live && setRecent([]));
    return () => {
      live = false;
    };
  }, [activeHouseholdId]);

  // Ingredients and recipes as you type.
  useEffect(() => {
    setPackets({ at: 'not-asked' });
    if (!q) {
      setFound(null);
      return;
    }
    const mine = ++asked.current;
    const timer = window.setTimeout(() => {
      api<SearchAnswer>('GET', searchPath(q, activeHouseholdId, false))
        .then((answer) => mine === asked.current && setFound(answer))
        .catch(() => mine === asked.current && setFound({ query: q, ingredients: [], products: [], productsStatus: 'skipped', recipes: [] }));
    }, TYPING_MS);
    return () => window.clearTimeout(timer);
  }, [q, activeHouseholdId]);

  async function searchPackets() {
    if (q.length < 3 || BARCODE.test(q)) return;
    setPackets({ at: 'asking' });
    try {
      let answer = await api<SearchAnswer>('GET', searchPath(q, activeHouseholdId, true));
      // Too soon after the last one: the server says so rather than asking. Once more, a moment later.
      if (answer.productsStatus === 'debounced') {
        await new Promise((r) => window.setTimeout(r, 1300));
        answer = await api<SearchAnswer>('GET', searchPath(q, activeHouseholdId, true));
      }
      setPackets({ at: 'answered', answer });
    } catch {
      setPackets({ at: 'answered', answer: { query: q, ingredients: [], products: [], productsStatus: 'unavailable', recipes: [] } });
    }
  }

  function openProduct(barcode: string, scanned = false) {
    navigate(`/explore/nutrition/products/${barcode}`, { state: { scanned } });
  }

  const searching = q.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <NavBar back="/explore" backLabel="Explore" title="Nutrition facts" />

      <form
        role="search"
        className="-mt-1 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (BARCODE.test(q)) openProduct(q);
          else searchPackets();
        }}
      >
        <SearchField
          className="flex-1"
          placeholder="Search an ingredient or product"
          aria-label="Search an ingredient or product"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
          end={
            query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="press -mr-1 flex h-8 w-8 items-center justify-center text-faint">
                <Icon name="x" size={16} />
              </button>
            )
          }
        />
        <button
          type="button"
          aria-label="Scan a barcode"
          title="Scan a barcode"
          onClick={() => setScanning(true)}
          className="press flex h-[2.625rem] w-[2.625rem] shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent"
        >
          <Icon name="barcode" size={20} />
        </button>
      </form>

      {searching ? (
        <SearchResults
          q={q}
          found={found}
          packets={packets}
          onSearchPackets={searchPackets}
          onOpenProduct={(b) => openProduct(b)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start md:gap-6">
          <WeekCard week={week} failed={weekFailed} today={today} />
          <div className="flex flex-col">
            <SectionLabel>Recent lookups</SectionLabel>
            {recent == null ? null : recent.length === 0 ? (
              <div className="card px-4">
                <EmptyState>Things you look up or scan show here.</EmptyState>
              </div>
            ) : (
              <List label="Recent lookups" inset={68}>
                {recent.slice(0, 6).map((r) => (
                  <Row
                    key={`${r.kind}:${r.ref}`}
                    to={lookupPath(r.kind, r.ref)}
                    state={r.kind === 'RECIPE' ? { from: 'nutrition' } : undefined}
                    lead={<LookupMark kind={r.kind} seed={r.ref} />}
                    title={r.kind === 'FOOD' ? plainFoodName(r.label) : r.label}
                    subtitle={`${KIND_WORD[r.kind]} · ${kcalText(r.kcal)} kcal per ${r.per}`}
                    chevron
                  />
                ))}
              </List>
            )}
          </div>
        </div>
      )}

      <SourceNote attribution={USDA} className="mt-2" />

      {scanning && (
        <NutritionScanner
          onClose={() => setScanning(false)}
          onFound={(barcode) => {
            setScanning(false);
            openProduct(barcode, true);
          }}
        />
      )}
    </div>
  );
}

const KIND_WORD = { FOOD: 'Ingredient', PRODUCT: 'Product', RECIPE: 'Recipe' } as const;

function searchPath(q: string, householdId: string | null, products: boolean) {
  const params = new URLSearchParams({ q });
  if (householdId) params.set('householdId', householdId);
  if (products) params.set('products', 'true');
  return `/api/nutrition/search?${params}`;
}

export function lookupPath(kind: RecentLookup['kind'], ref: string) {
  if (kind === 'FOOD') return `/explore/nutrition/foods/${ref}`;
  if (kind === 'PRODUCT') return `/explore/nutrition/products/${ref}`;
  return `/recipes/${ref}/nutrition`;
}

/** "Chickpeas, mature seeds, canned": the USDA name without its bracketed other names. */
function plainFoodName(name: string) {
  const { title, detail } = foodTitle(name);
  return detail ? `${title}, ${detail}` : title;
}

/**
 * This week's plan (5.4): the average day for one person, a bar a day, and the day's protein,
 * carbs and fat on average. The average is of the days with two or more meals counted, when
 * there are any (a day with only its dinner planned is a third of a day, and is drawn faint);
 * the pill and the line under it say which days and how many meals the numbers stand on.
 */
function WeekCard({ week, failed, today }: { week: PlanNutrition | null; failed: boolean; today: string }) {
  if (failed) {
    return (
      <div className="card p-4">
        <EmptyState>Could not add up this week's plan.</EmptyState>
      </div>
    );
  }
  const counted = week ? week.daysCounted : 0;
  const over = week ? week.averageDays ?? counted : 0;
  const partly = week?.averageOver === 'partial';
  return (
    <section aria-label="This week's plan" className="card flex flex-col gap-3.5 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="group-label">This week's plan</p>
          <p className="mt-0.5 text-[1.0625rem] font-semibold">
            {!week ? ' ' : counted > 0 ? `${kcalText(week.average.kcal)} kcal a day on average` : 'Nothing counted yet'}
          </p>
        </div>
        {week && counted > 0 && (
          <Pill tone={partly ? 'mustard' : 'sky'} icon="calendar" className="mt-0.5 shrink-0 !px-2.5 !py-1 !text-[0.75rem]">
            {over} {partly ? 'partly planned' : over === 1 ? 'day' : 'days'}
          </Pill>
        )}
      </div>
      {week ? <WeekChart days={week.days} today={today} /> : <div className="h-[110px] md:h-[140px]" />}
      <div className="flex gap-2">
        <Stat value={week && counted > 0 ? gramsText(week.average.protein) : '–'} label="Protein" tone="herb" />
        <Stat value={week && counted > 0 ? gramsText(week.average.carbs) : '–'} label="Carbs" tone="sky" />
        <Stat value={week && counted > 0 ? gramsText(week.average.fat) : '–'} label="Fat" tone="mustard" />
      </div>
      {week && (
        <p className="text-xs leading-snug text-muted">
          {week.mealsPlanned === 0 ? (
            <>
              Nothing planned for the next seven days.{' '}
              <Link to="/meal-plan" className="font-medium text-accent-ink">
                Plan a meal
              </Link>
            </>
          ) : (
            `One person's share: a serving of each meal. ${
              week.mealsCounted === week.mealsPlanned
                ? `All ${week.mealsPlanned} planned ${week.mealsPlanned === 1 ? 'meal' : 'meals'} counted.`
                : `${week.mealsCounted} of ${week.mealsPlanned} planned meals counted — places, links and foods without data aren't.`
            }${counted > 0 && averageWords(week) ? ` ${averageWords(week)}` : ''}`
          )}
        </p>
      )}
    </section>
  );
}

function SearchResults({
  q,
  found,
  packets,
  onSearchPackets,
  onOpenProduct,
}: {
  q: string;
  found: SearchAnswer | null;
  packets: Packets;
  onSearchPackets: () => void;
  onOpenProduct: (barcode: string) => void;
}) {
  const current = found && found.query === q ? found : null;
  const barcode = BARCODE.test(q);
  const packetAnswer = packets.at === 'answered' ? packets.answer : null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-6">
      <div className="flex flex-col gap-4">
        {barcode && (
          <List label="Barcode">
            <Row
              onClick={() => onOpenProduct(q)}
              lead={<Tile icon="barcode" tone="sky" size={40} radius={12} />}
              title={`Look up barcode ${q}`}
              subtitle="A packet, from Open Food Facts"
              chevron
            />
          </List>
        )}

        {current && current.recipes.length > 0 && (
          <div>
            <SectionLabel>Your recipes</SectionLabel>
            <List label="Your recipes" inset={68}>
              {current.recipes.map((r) => (
                <Row
                  key={r.id}
                  to={`/recipes/${r.id}/nutrition`}
                  state={{ from: 'nutrition' }}
                  lead={<LookupMark kind="RECIPE" seed={r.id} />}
                  title={r.name}
                  subtitle={r.kcalPerServing != null ? `Recipe · ${kcalText(r.kcalPerServing)} kcal per serving` : 'Recipe'}
                  chevron
                />
              ))}
            </List>
          </div>
        )}

        {!barcode && (
          <div>
            <SectionLabel>Ingredients</SectionLabel>
            {!current ? (
              <p className="px-1 py-3 text-sm text-muted">Looking…</p>
            ) : current.ingredients.length === 0 ? (
              <div className="card px-4">
                <EmptyState>No ingredient called “{q}” in the food data.</EmptyState>
              </div>
            ) : (
              <List label="Ingredients" inset={68}>
                {current.ingredients.map((f) => {
                  const { title, detail } = foodTitle(f.name);
                  return (
                    <Row
                      key={f.fdcId}
                      to={`/explore/nutrition/foods/${f.fdcId}`}
                      lead={<LookupMark kind="FOOD" seed={String(f.fdcId)} />}
                      title={detail ? `${title}, ${detail}` : title}
                      subtitle={`${kcalText(f.kcal)} kcal · ${gramsText(f.protein)} protein per 100g`}
                      chevron
                    />
                  );
                })}
              </List>
            )}
          </div>
        )}
      </div>

      {!barcode && (
        <div className="flex flex-col">
          <SectionLabel>Products</SectionLabel>
          {packets.at === 'not-asked' ? (
            <List label="Products">
              <Row
                onClick={onSearchPackets}
                disabled={q.length < 3}
                lead={<Tile icon="box" tone="sky" size={40} radius={12} />}
                title={q.length < 3 ? 'Type a little more to search packets' : `Search packets for “${q}”`}
                subtitle="From Open Food Facts"
                chevron={q.length >= 3}
              />
            </List>
          ) : packets.at === 'asking' ? (
            <p className="px-1 py-3 text-sm text-muted">Asking Open Food Facts…</p>
          ) : packetAnswer && packetAnswer.products.length > 0 ? (
            <>
              <List label="Products" inset={68}>
                {packetAnswer.products.map((p) => (
                  <Row
                    key={p.barcode}
                    onClick={() => onOpenProduct(p.barcode)}
                    lead={<LookupMark kind="PRODUCT" seed={p.barcode} />}
                    title={p.name}
                    subtitle={[p.brand, p.size, p.kcal != null ? `${kcalText(p.kcal)} kcal per 100g` : null].filter(Boolean).join(' · ')}
                    chevron
                  />
                ))}
              </List>
              <SourceNote
                className="mt-2"
                attribution={{ text: 'Data from Open Food Facts (ODbL)', url: 'https://world.openfoodfacts.org/', licence: 'ODbL 1.0' }}
              />
            </>
          ) : (
            <div className="card px-4">
              <EmptyState>{packetProblem(packetAnswer?.productsStatus)}</EmptyState>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function packetProblem(status: string | undefined) {
  if (status === 'busy') return 'Open Food Facts has had a lot of questions from us this minute. Try again in a moment.';
  if (status === 'unavailable') return "Can't reach Open Food Facts just now.";
  if (status === 'debounced') return 'One moment — try again.';
  return 'No packets found. Scanning the barcode finds more.';
}
