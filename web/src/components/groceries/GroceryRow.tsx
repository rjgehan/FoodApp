import type { CupboardItem, GroceryListItem, RestockReminder } from '../../api/types';
import { everyTitle } from '../../utils/restock';
import { Icon } from '../icons';
import SwipeRow from '../SwipeRow';
import { CheckCircle, cx, IconButton } from '../ui';
import { amountOf, cupboardSays, rowDetail } from './groceryParts';
import { useAuth } from '../../auth/AuthContext';

/**
 * One row of the list (mockup 4.1): the amount in bold before the name, the recipes it is for
 * underneath, and the two things worth knowing before buying it — the cupboard says you have
 * some (sky), or a restock reminder is set on it (the mustard bell).
 *
 * The whole row ticks it off: in a shop, with a basket on one arm, the circle alone is too small
 * a target. Swiping it left offers More (its aisle, a reminder, the cupboard) and Remove. A mouse
 * cannot swipe, so a pointer that can hover gets a ••• button for the same sheet.
 */
export default function GroceryRow({
  item,
  reminder,
  stock,
  onToggle,
  onOpen,
  onRemove,
}: {
  item: GroceryListItem;
  reminder?: RestockReminder;
  stock?: CupboardItem;
  onToggle: () => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const amount = amountOf(item);
  const { session } = useAuth();
  const detail = rowDetail(item, session?.userId);
  // A meal put it here, but the cupboard says you have some. Worth a look before buying a third jar.
  const have = item.inCupboard && !item.checked;

  return (
    <SwipeRow
      actions={[
        { label: 'More', tone: 'accent', icon: 'more', onAction: onOpen },
        { label: 'Remove', tone: 'danger', icon: 'trash', onAction: onRemove },
      ]}
    >
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={item.checked}
          className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-[11px] pl-[14px] pr-[14px] text-left [@media(hover:hover)]:pr-1"
        >
          <CheckCircle checked={item.checked} />
          <span className="min-w-0 flex-1">
            <span
              className={cx(
                'block text-base transition-colors',
                item.checked ? 'text-muted line-through' : 'font-medium',
              )}
            >
              {amount && <b className="font-semibold">{amount} </b>}
              <span>{item.name}</span>
            </span>
            {detail && <span className="mt-0.5 block truncate text-xs text-muted">{detail}</span>}
            {have && (
              <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-sky">
                <Icon name="cupboard" size={12} className="shrink-0" />
                {cupboardSays(stock)}
              </span>
            )}
          </span>
          {reminder && (
            <span role="img" aria-label={everyTitle(reminder.everyDays)} title={everyTitle(reminder.everyDays)} className="shrink-0 text-mustard">
              <Icon name="bell" size={16} />
            </span>
          )}
        </button>
        <span className="mr-2 hidden [@media(hover:hover)]:flex">
          <IconButton label={`More for ${item.name}`} className="text-faint" onClick={onOpen}>
            <Icon name="more" size={18} />
          </IconButton>
        </span>
      </div>
    </SwipeRow>
  );
}
