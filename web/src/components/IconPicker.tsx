import { cx } from './ui';
import { FOOD_ICONS, iconByKey } from './FoodIcons';
import { NoneIcon } from './icons';

/**
 * Every food drawing as a tap target, the chosen one ringed. Used for drawers, which always
 * wear something, and for groups, which can wear nothing — `allowNone` adds that choice first.
 *
 * The chosen one is named under the grid: a phone has no hover to show a title, and a burger
 * and a sandwich are close cousins at this size, so a tap is confirmed in words.
 */
export default function IconPicker({
  value,
  onChange,
  allowNone = false,
  disabled = false,
}: {
  value: string | null | undefined;
  onChange: (key: string | null) => void;
  allowNone?: boolean;
  disabled?: boolean;
}) {
  const option = (selected: boolean) =>
    cx(
      'flex aspect-square items-center justify-center rounded-xl border transition-colors',
      selected ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted',
    );

  const chosen = iconByKey(value)?.label ?? (allowNone ? 'No icon' : null);

  return (
    <div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8" role="group" aria-label="Icon">
        {allowNone && (
          <button
            type="button"
            title="No icon"
            aria-label="No icon"
            aria-pressed={!value}
            disabled={disabled}
            onClick={() => onChange(null)}
            className={option(!value)}
          >
            <NoneIcon className="h-6 w-6" />
          </button>
        )}
        {FOOD_ICONS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={key === value}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={option(key === value)}
          >
            <Icon className="h-8 w-8" />
          </button>
        ))}
      </div>
      {chosen && (
        <p className="mt-2 text-sm text-muted" aria-live="polite">
          {chosen}
        </p>
      )}
    </div>
  );
}
