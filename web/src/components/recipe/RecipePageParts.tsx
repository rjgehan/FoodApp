import { useEffect, useRef, useState, type ReactNode } from 'react';
import { imageUrl } from '../../api/client';
import type { RecipeIngredient, SourceLink } from '../../api/types';
import { formatQuantity } from '../../utils/recipeFormat';
import { unitFor } from '../groceries/groceryParts';
import { isSafeLink, isVideoLink, linkName, videoHostLabel } from '../../utils/videoLink';
import { Icon } from '../icons';
import { cx, EmptyState, Pill, StepNumber } from '../ui';

/*
 The pieces of the recipe page under its hero (the mockup's 3.7): the tabs that stick to the top
 as you scroll, what each tab holds, and the bar along the bottom with Add to plan.
*/

export type RecipeTab = 'ingredients' | 'method' | 'photos';

/**
 * Ingredients · Method · Photos, each with its count, the chosen one underlined in the accent.
 * Sticks to the top of the screen once the hero has scrolled away — under the header on a wide
 * screen, where the header stays.
 */
export function RecipeTabs({
  value,
  onChange,
  counts,
  bar,
}: {
  value: RecipeTab;
  onChange: (tab: RecipeTab) => void;
  counts: Record<RecipeTab, number>;
  /**
   * On a phone, once the tabs pin, the hero's back and ••• have scrolled away: a compact bar
   * comes in above the tabs with them and the recipe's name, so a long method still has a way out.
   */
  bar?: { title: string; onBack: () => void; backLabel: string; actions?: ReactNode };
}) {
  const tabs: { value: RecipeTab; label: string }[] = [
    { value: 'ingredients', label: 'Ingredients' },
    { value: 'method', label: 'Method' },
    { value: 'photos', label: 'Photos' },
  ];
  const sentinel = useRef<HTMLDivElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    // Pinned is when the tabs have left the place they sit in the page: the marker just above
    // them carries on scrolling up while they stay put.
    const check = () => {
      const mark = sentinel.current?.getBoundingClientRect().top;
      const tabsTop = sticky.current?.getBoundingClientRect().top;
      if (mark !== undefined && tabsTop !== undefined) setPinned(mark < tabsTop - 1);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  return (
    <>
      {bar && pinned && (
        <div className="material-bar fixed inset-x-0 top-0 z-20 pt-safe md:hidden">
          <div className="mx-auto flex h-11 max-w-3xl items-center gap-2 px-3">
            <button
              type="button"
              onClick={bar.onBack}
              aria-label={bar.backLabel}
              className="press flex h-9 w-9 shrink-0 items-center justify-center text-accent-ink"
            >
              <Icon name="chevL" size={22} strokeWidth={2.2} />
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-[1.0625rem] font-semibold">{bar.title}</p>
            <div className="flex shrink-0 items-center gap-1 text-ink">{bar.actions}</div>
          </div>
        </div>
      )}
      <div ref={sentinel} aria-hidden="true" />
      <div
        ref={sticky}
        className={cx(
          'sticky z-10 -mx-5 bg-bg px-5 md:top-16 md:mx-0 md:px-0',
          // Pinned under the compact bar, which covers the status bar too.
          bar ? 'top-[calc(2.75rem+env(safe-area-inset-top))]' : 'top-0 pt-safe md:pt-0',
        )}
      >
      <div role="tablist" aria-label="Recipe" className="flex border-b border-line">
        {tabs.map((t) => {
          const on = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              id={`recipe-tab-${t.value}`}
              aria-selected={on}
              aria-controls={`recipe-panel-${t.value}`}
              onClick={() => onChange(t.value)}
              className={cx(
                '-mb-px flex-1 border-b-[2.5px] pb-[11px] pt-3 text-center text-[0.9375rem] transition-colors',
                on ? 'border-accent font-semibold text-ink' : 'border-transparent font-medium text-muted',
              )}
            >
              {t.label}
              <span className="text-xs font-medium text-muted"> {counts[t.value]}</span>
            </button>
          );
        })}
      </div>
      </div>
    </>
  );
}

/** A tab's content, named by its tab. */
export function TabPanel({ tab, children }: { tab: RecipeTab; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`recipe-panel-${tab}`} aria-labelledby={`recipe-tab-${tab}`} className="flex flex-col gap-3.5 pt-3.5">
      {children}
    </div>
  );
}

/**
 * The recipe's links as small buttons — "TikTok" with a play mark, "Website" with a link —
 * that open where they point. The full name stays in the button's label for assistive tech.
 */
export function LinkButtons({ links }: { links: SourceLink[] }) {
  const safe = links.filter((l) => isSafeLink(l.url));
  if (safe.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {safe.map((link, i) => {
        const video = isVideoLink(link.url);
        const named = link.label?.trim();
        const shown = named || (video ? videoHostLabel(link.url) : linkName(link));
        const full = video ? (named ? `${named} · ${videoHostLabel(link.url)}` : `Watch on ${videoHostLabel(link.url)}`) : shown;
        return (
          <a
            key={`${link.url}-${i}`}
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={full}
            title={full}
            className="press inline-flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-[11px] border border-line bg-surface px-3.5 text-[0.875rem] font-semibold text-ink active:bg-surface2"
          >
            <Icon name={video ? 'play' : 'link'} size={16} className="shrink-0" />
            <span className="truncate">{shown}</span>
          </a>
        );
      })}
    </div>
  );
}

/**
 * The ingredients as the mockup lists them: the amount in bold in its own column, the name, and
 * "Optional" for the extras. `scale` follows the servings stepper; nothing is saved by it.
 */
export function IngredientList({ ingredients, scale }: { ingredients: RecipeIngredient[]; scale: number }) {
  return (
    <ul aria-label="Ingredients">
      {ingredients.map((i) => {
        const quantity = i.quantity == null ? null : i.quantity * scale;
        // "2 packs", as the grocery list says it.
        const amount = [formatQuantity(quantity), unitFor(quantity, i.unit)].filter(Boolean).join(' ');
        return (
          <li key={i.id} className="flex items-baseline gap-3 border-b border-line py-[9px] text-[0.9375rem]">
            {amount && <span className="w-[4.625rem] shrink-0 font-semibold tabular-nums">{amount}</span>}
            {!amount && <span className="w-[4.625rem] shrink-0" aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              {i.ingredientName}
              {i.notes && <span className="text-muted">, {i.notes}</span>}
            </span>
            {i.optional && (
              <Pill tone="mustard" className="self-center">
                Optional
              </Pill>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The method, one numbered step at a time. */
export function MethodSteps({ steps }: { steps: string[] }) {
  return (
    <ol aria-label="Method" className="flex flex-col gap-4">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <StepNumber n={i + 1} />
          <span className="flex-1 pt-px text-base leading-normal">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** The recipe's pictures, big enough to see. Each opens on its own. */
export function PhotoGrid({ ids, name }: { ids: string[]; name: string }) {
  return (
    <ul aria-label="Photos" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {ids.map((id, i) => (
        <li key={id}>
          <a href={imageUrl(id)} target="_blank" rel="noreferrer" className="press block">
            <img
              src={imageUrl(id)}
              alt={i === 0 ? name : `${name}, photo ${i + 1}`}
              className="aspect-square w-full rounded-[14px] object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** What a tab says when there is nothing in it. */
export function TabEmpty({ children }: { children: ReactNode }) {
  return <EmptyState>{children}</EmptyState>;
}

/**
 * Along the bottom: the previous and next recipe either side of Add to plan — the one filled
 * button, because the plan is where a recipe goes next. Over the tab bar on a phone, as the
 * mockup draws it: the recipe is a page you pushed into, and leave by going back.
 */
export function RecipeBottomBar({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Keeps the end of the page clear of the bar. */}
      <div aria-hidden="true" className="h-24 md:h-20" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2.5">
        {/* The page's column plus this box's own gutters, so the button lines up with the content above it. */}
        <div className="mx-auto flex w-full max-w-[calc(48rem+2.5rem)] items-center gap-2.5 px-5">{children}</div>
      </div>
    </>
  );
}

/** The bottom bar's square previous and next buttons. */
export function StepButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const label = direction === 'prev' ? 'Previous recipe' : 'Next recipe';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="press flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-btn border border-line bg-surface text-ink active:bg-surface2 disabled:opacity-40"
    >
      <Icon name={direction === 'prev' ? 'chevL' : 'chevR'} size={24} />
    </button>
  );
}
