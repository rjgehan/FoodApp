import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import {
  BARCODE,
  capitalised,
  foodTitle,
  gramsText,
  kcalText,
  type Attribution,
  type FoodLabel,
  type ProductLabel,
} from '../api/nutrition';
import { useHousehold } from '../household/HouseholdContext';
import { useTablessScreen } from '../components/Layout';
import { Icon } from '../components/icons';
import { toast } from '../components/toast';
import { Button, EmptyState, NavBar, NoteBox, Photo, Pill, type Hue, type PillTone } from '../components/ui';
import { LabelBody, NutritionBottomBar, SourceNote } from '../components/nutrition/NutritionParts';
import type { IconName } from '../components/icons';

/*
 A label (the mockup's 5.5): a packet from its barcode, or an ingredient from the USDA's table,
 drawn the same way — per 100 g or per serving, where the calories come from, the details people
 check, and the claims it can make — with the cupboard and the grocery list one tap away.
*/

/** Back to wherever the label was opened from, or Nutrition's front page. */
function useBack() {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/explore/nutrition');
  };
}

/** A packet, from a scan or a search. */
export function NutritionProductPage() {
  useTablessScreen();
  const { barcode = '' } = useParams<{ barcode: string }>();
  const scanned = (useLocation().state as { scanned?: boolean } | null)?.scanned ?? false;
  const back = useBack();
  const [product, setProduct] = useState<ProductLabel | null>(null);
  const [problem, setProblem] = useState<'missing' | 'busy' | 'failed' | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setProduct(null);
    setProblem(null);
    if (!BARCODE.test(barcode)) {
      setProblem('missing');
      return;
    }
    let live = true;
    api<ProductLabel>('GET', `/api/nutrition/products/${barcode}`)
      .then((p) => {
        if (!live) return;
        setProduct(p);
        if (p.hasNutrition) {
          api('POST', '/api/nutrition/recent', { kind: 'PRODUCT', ref: p.barcode, label: p.name, kcal: p.per100g.kcal, protein: p.per100g.protein }).catch(() => {});
        }
      })
      .catch((err) => {
        if (!live) return;
        const status = err instanceof ApiError ? err.status : 0;
        setProblem(status === 404 ? 'missing' : status === 429 ? 'busy' : 'failed');
      });
    return () => {
      live = false;
    };
  }, [barcode, attempt]);

  const nav = (
    <NavBar
      back={back}
      backLabel="Nutrition"
      right={product && <ShareButton name={product.name} kcal={product.per100g.kcal} unit={product.liquid ? 'ml' : 'g'} url={product.attribution.url} />}
    />
  );

  if (problem) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {nav}
        <div className="card flex flex-col items-center gap-3 px-5 pb-6 pt-7 text-center">
          <Photo hue="sky" icon="box" className="h-16 w-16 rounded-2xl" />
          <h2 className="title-sheet">{problem === 'missing' ? 'Not in Open Food Facts' : problem === 'busy' ? 'One moment' : "Couldn't look it up"}</h2>
          <p className="max-w-md text-[0.9375rem] leading-normal text-muted">
            {problem === 'missing'
              ? `Nobody has added ${barcode || 'that barcode'} to Open Food Facts yet. Search for the ingredient instead.`
              : problem === 'busy'
                ? 'Open Food Facts has had a lot of questions from us this minute. Try again in a moment.'
                : "Can't reach Open Food Facts just now."}
          </p>
          {problem === 'missing' ? (
            <Button variant="secondary" icon="search" onClick={back}>
              Search instead
            </Button>
          ) : (
            <Button variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!product) return <Loading nav={nav} />;

  const unit = product.liquid ? 'ml' : 'g';
  const brandSays = product.brand && !product.name.toLowerCase().includes(product.brand.toLowerCase()) ? product.brand : null;
  const about = [product.size, brandSays, scanned ? 'scanned' : null].filter(Boolean).join(' · ');
  const off = product.attribution;

  return (
    <div className="flex flex-col gap-3.5">
      {nav}
      <Header hue="sky" icon="box" title={product.name} subtitle={about || `Barcode ${product.barcode}`} />
      {product.hasNutrition ? (
        <LabelBody
          per100g={product.per100g}
          split={product.split}
          details={product.details}
          badges={product.badges}
          liquid={product.liquid}
          serving={
            product.servingGrams
              ? { label: `Per serving (${gramsText(product.servingGrams, unit)})`, grams: product.servingGrams, values: product.perServing }
              : null
          }
          extraBadges={
            <>
              {product.nutriScore && (
                <Pill tone={NUTRI_TONE[product.nutriScore] ?? 'neutral'} className="!px-2.5 !py-1 !text-[0.75rem]">
                  Nutri-Score {product.nutriScore.toUpperCase()}
                </Pill>
              )}
              <SourcePill attribution={off} label="Open Food Facts" />
            </>
          }
          aside={<SourceNote attribution={off} className="max-md:hidden" />}
        />
      ) : (
        <>
          <NoteBox tone="mustard">This packet is in Open Food Facts, but nobody has added its nutrition facts yet.</NoteBox>
          <div className="flex">
            <SourcePill attribution={off} label="Open Food Facts" />
          </div>
        </>
      )}
      <SourceNote attribution={off} className={product.hasNutrition ? 'md:hidden' : undefined} />
      <KeepIt name={product.name} />
    </div>
  );
}

/** An ingredient from the USDA's FoodData Central. */
export function NutritionFoodPage() {
  useTablessScreen();
  const { fdcId = '' } = useParams<{ fdcId: string }>();
  const back = useBack();
  const [food, setFood] = useState<FoodLabel | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    setFood(null);
    setFailed(null);
    let live = true;
    api<FoodLabel>('GET', `/api/nutrition/foods/${encodeURIComponent(fdcId)}`)
      .then((f) => {
        if (!live) return;
        setFood(f);
        api('POST', '/api/nutrition/recent', { kind: 'FOOD', ref: String(f.fdcId) }).catch(() => {});
      })
      .catch((err) => live && setFailed(err instanceof ApiError && err.status === 404 ? 'That ingredient is not in the food data.' : 'Could not look that up.'));
    return () => {
      live = false;
    };
  }, [fdcId]);

  const named = food ? foodTitle(food.name) : null;
  const nav = (
    <NavBar back={back} backLabel="Nutrition" right={food && named && <ShareButton name={named.title} kcal={food.per100g.kcal} unit="g" url={`https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`} />} />
  );

  if (failed) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {nav}
        <div className="card px-4">
          <EmptyState>{failed}</EmptyState>
        </div>
      </div>
    );
  }
  if (!food || !named) return <Loading nav={nav} />;

  const portion = food.portions[0];
  return (
    <div className="flex flex-col gap-3.5">
      {nav}
      <Header hue="herb" icon="leaf" title={named.title} subtitle={capitalised(named.detail) || food.category} />
      <LabelBody
        per100g={food.per100g}
        split={food.split}
        details={food.details}
        badges={food.badges}
        serving={portion ? { label: `${portion.label} (${gramsText(portion.grams)})`, grams: portion.grams } : null}
        start="100"
        extraBadges={<SourcePill attribution={food.attribution} label="USDA FoodData Central" />}
        aside={<SourceNote attribution={food.attribution} className="max-md:hidden" />}
      />
      <SourceNote attribution={food.attribution} className="md:hidden" />
      <KeepIt name={named.title} />
    </div>
  );
}

const NUTRI_TONE: Record<string, PillTone> = { a: 'herb', b: 'herb', c: 'mustard', d: 'accent', e: 'accent' };

/** The picture, name and one line about it: "500g tub · scanned". */
function Header({ hue, icon, title, subtitle }: { hue: Hue; icon: IconName; title: string; subtitle: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Photo hue={hue} icon={icon} className="h-16 w-16 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <h1 className="serif text-2xl leading-tight [text-wrap:balance] md:text-[1.75rem]">{title}</h1>
        <p className="mt-0.5 text-[0.8125rem] text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

/** The source as a pill among the claims (5.5's "Open Food Facts"), linking to where it came from. */
function SourcePill({ attribution, label }: { attribution: Attribution; label: string }) {
  return (
    <a href={attribution.url} target="_blank" rel="noreferrer" aria-label={`${attribution.text} — open the source`} className="press">
      <Pill tone="mustard" icon="info" className="!px-2.5 !py-1 !text-[0.75rem]">
        {label}
      </Pill>
    </a>
  );
}

function Loading({ nav }: { nav: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      {nav}
      <p className="py-16 text-center text-sm text-muted">Loading…</p>
    </div>
  );
}

/** The top right's share: the system sheet where there is one, the clipboard where not. */
function ShareButton({ name, kcal, unit, url }: { name: string; kcal: number | null; unit: string; url: string }) {
  async function share() {
    const text = `${name}: ${kcalText(kcal)} kcal per 100${unit}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} — ${url}`);
      toast('Copied', { icon: 'check' });
    } catch {
      // Closing the share sheet is not a failure.
    }
  }
  return (
    <button type="button" aria-label="Share" title="Share" onClick={share} className="press -mr-1 flex h-11 w-11 items-center justify-center text-accent-ink">
      <Icon name="share" size={20} />
    </button>
  );
}

/**
 * The cupboard and the grocery list (5.5's bottom bar): the two places a thing you have just
 * looked up can go. Both take the name as the list would say it.
 */
function KeepIt({ name }: { name: string }) {
  const { activeHouseholdId } = useHousehold();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!activeHouseholdId) return null;

  async function add(where: 'cupboard' | 'list') {
    if (busy) return;
    setBusy(true);
    try {
      if (where === 'cupboard') {
        await api('POST', `/api/households/${activeHouseholdId}/cupboard`, { name });
        toast(`Added ${name} to the cupboard`, { icon: 'check', action: { label: 'See it', onClick: () => navigate('/cupboard') } });
      } else {
        await api('POST', `/api/households/${activeHouseholdId}/grocery-list/items`, { ingredientName: name });
        toast(`Added ${name} to the list`, { icon: 'cart', action: { label: 'See it', onClick: () => navigate('/grocery-list') } });
      }
    } catch {
      toast(where === 'cupboard' ? 'Could not add that to the cupboard.' : 'Could not add that to the list.', { icon: 'alert' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <NutritionBottomBar>
      <Button size="lg" variant="secondary" icon="cupboard" className="min-w-0 flex-1" disabled={busy} onClick={() => add('cupboard')} aria-label="Add to the cupboard">
        Cupboard
      </Button>
      <Button size="lg" icon="cart" className="min-w-0 flex-1" disabled={busy} onClick={() => add('list')} aria-label="Add to the grocery list">
        Add to list
      </Button>
    </NutritionBottomBar>
  );
}
