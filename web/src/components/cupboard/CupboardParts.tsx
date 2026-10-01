import type { CupboardItem, RestockReminder } from '../../api/types';
import { formatQuantity } from '../../utils/recipeFormat';
import { everyLabel } from '../../utils/restock';
import { Icon } from '../icons';
import SwipeRow from '../SwipeRow';
import { cx, Pill } from '../ui';

/**
 * How much is left, in the two answers that stay true without anyone counting (mockup 4.5's
 * stock pill): Have lifts onto the surface, Low fills with mustard — the colour of "worth a look".
 */
export function HaveOrLow({ low, onChange }: { low: boolean; onChange: (low: boolean) => void }) {
  return (
    <div className="flex shrink-0 rounded-[9px] bg-surface2 p-[2px]" role="group" aria-label="How much is left">
      {[false, true].map((isLow) => {
        const on = low === isLow;
        return (
          <button
            key={String(isLow)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(isLow)}
            className={cx(
              'relative h-7 rounded-[7px] px-[9px] text-xs font-semibold transition-colors duration-150',
              // A thumb-sized target around a small pill.
              'after:absolute after:-inset-y-2 after:inset-x-0 after:content-[""]',
              on
                ? isLow
                  ? 'bg-mustard text-white'
                  : 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
                : 'text-muted',
            )}
          >
            {isLow ? 'Low' : 'Have'}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The mockup's stepper: round − and + on a quiet pill, with what they change between them.
 * Used for an exact count on a row ("3") and in the item sheet ("3 tins").
 */
export function CountStepper({
  label,
  shown,
  onStep,
  canLower = true,
}: {
  label: string;
  shown?: string;
  onStep: (delta: number) => void;
  canLower?: boolean;
}) {
  const btn =
    'press relative flex h-[22px] w-[22px] items-center justify-center rounded-full bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)] disabled:opacity-40 after:absolute after:-inset-2.5 after:content-[""]';
  return (
    <span role="group" aria-label={label} className="flex shrink-0 items-center gap-2 rounded-full bg-surface2 p-[3px]">
      <button type="button" aria-label="One less" className={btn} disabled={!canLower} onClick={() => onStep(-1)}>
        <Icon name="minus" size={11} strokeWidth={2.4} />
      </button>
      {shown && <span className="min-w-[1.5rem] text-center text-[0.8125rem] font-semibold tabular-nums">{shown}</span>}
      <button type="button" aria-label="One more" className={btn} onClick={() => onStep(1)}>
        <Icon name="plus" size={11} strokeWidth={2.4} />
      </button>
    </span>
  );
}

/** "3", "2.5" — a count as a person would write it. */
export function countOf(quantity: number): string {
  return formatQuantity(quantity) || '0';
}

/** The line under a cupboard row: "Always have", "Restock every 3 weeks", "On the list". */
export function cupboardDetail(item: CupboardItem, reminder?: RestockReminder): string | null {
  const parts = [
    item.staple && 'Always have',
    reminder && `Restock ${everyLabel(reminder.everyDays)}`,
    item.onList && 'On the list',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * One cupboard row (mockup 4.5 / 4.6): the name, a quiet line under it, and on the right the one
 * thing you check at a glance — Have/Low, an exact count with its stepper, or "Always" for the
 * things that are never low. Tap it to edit; swipe it left for Buy again and Remove, or fling it
 * all the way to remove it outright, which is what you do most.
 */
export function CupboardRow({
  item,
  reminder,
  onEdit,
  onLow,
  onAdjust,
  onBuyAgain,
  onRemove,
}: {
  item: CupboardItem;
  reminder?: RestockReminder;
  onEdit: () => void;
  onLow: (low: boolean) => void;
  onAdjust: (delta: number) => void;
  onBuyAgain: () => void;
  onRemove: () => void;
}) {
  const detail = cupboardDetail(item, reminder);
  // "Always have" means it is never low: a pill says so, and the whole row stays one target.
  const control =
    item.staple ? null : item.quantity != null ? (
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums">{countOf(item.quantity)}</span>
        <CountStepper label="Amount on hand" onStep={onAdjust} canLower={item.quantity > 0} />
      </span>
    ) : (
      <HaveOrLow low={item.runningLow} onChange={onLow} />
    );

  return (
    <SwipeRow
      actions={[
        { label: 'Buy again', tone: 'herb', icon: 'cart', onAction: onBuyAgain },
        { label: 'Remove', tone: 'danger', icon: 'trash', onAction: onRemove },
      ]}
    >
      <div className={cx('flex min-h-[54px] items-center gap-2.5', (control || reminder) && 'pr-4')}>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${item.name}`}
          className={cx(
            'flex min-h-[54px] min-w-0 flex-1 items-center gap-3 py-2.5 text-left transition-colors active:bg-surface2/60',
            control || reminder ? 'pl-4' : 'px-4',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium first-letter:uppercase">{item.name}</span>
            {detail && <span className="mt-px block truncate text-[0.8125rem] text-muted">{detail}</span>}
          </span>
          {item.staple && (
            <Pill tone="herb" icon="check" className="!px-2.5 !py-1 !text-xs">
              Always
            </Pill>
          )}
        </button>
        {control}
        {reminder && (
          <span role="img" aria-label={`Restock ${everyLabel(reminder.everyDays)}`} className="-ml-0.5 shrink-0 text-mustard">
            <Icon name="bell" size={15} />
          </span>
        )}
      </div>
    </SwipeRow>
  );
}
