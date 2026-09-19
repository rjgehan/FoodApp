import { useEffect, useRef, useState } from 'react';
import { Input, cx } from './ui';
import { ChevronDownIcon } from './icons';

/**
 * Common cooking units, roughly in the order a home cook reaches for them. Lowercase on purpose:
 * the recipes already contain both "cup" and "Cup", and picking from a list is what stops that
 * from getting worse.
 */
export const COMMON_UNITS = [
  'cup', 'tbsp', 'tsp', 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'fl oz',
  'pint', 'quart', 'gallon',
  'ct', 'clove', 'can', 'stick', 'bunch', 'head', 'slice', 'package',
  'pinch', 'dash', 'sprig',
];

/**
 * A unit field you can pick from or just type into.
 *
 * Built rather than using <datalist> because that renders as an unstyleable native popup that
 * behaves differently in every browser and is nearly invisible on iOS — the place this app is
 * mostly used. Typed text is always kept as-is: the list is a shortcut, never a restriction.
 */
export default function UnitInput({
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
  placeholder = 'unit',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Near the bottom of a sheet the list has no room below the field, so it opens upward instead.
  const [dropUp, setDropUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Typing narrows the list, with an exact match first so Return keeps what was typed ("l" stays
  // "l", not "lb"). A unit typed in full needs no list at all.
  const query = value.trim().toLowerCase();
  const matches = COMMON_UNITS.filter((u) => u.startsWith(query)).sort(
    (a, b) => Number(b === query) - Number(a === query),
  );
  const options = !query ? COMMON_UNITS : matches.length === 1 && matches[0] === query ? [] : matches;

  function openList() {
    const rect = wrapRef.current?.getBoundingClientRect();
    const viewportBottom = window.visualViewport
      ? window.visualViewport.offsetTop + window.visualViewport.height
      : window.innerHeight;
    // 14rem is the list's max height, plus its margin.
    setDropUp(!!rect && rect.bottom + 232 > viewportBottom && rect.top > 232);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function choose(unit: string) {
    onChange(unit);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      setHighlight((h) => {
        const next = e.key === 'ArrowDown' ? h + 1 : h - 1;
        return (next + options.length) % options.length;
      });
      return;
    }
    if (e.key === 'Enter' && open && options[highlight]) {
      e.preventDefault();
      choose(options[highlight]);
    }
  }

  return (
    <div ref={wrapRef} className={cx('relative', className)}>
      <Input
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full pr-9"
        onChange={(e) => {
          onChange(e.target.value);
          setHighlight(0);
          openList();
        }}
        onFocus={openList}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show units"
        onClick={() => (open ? setOpen(false) : openList())}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted"
      >
        <ChevronDownIcon className="h-4 w-4" />
      </button>

      {open && options.length > 0 && (
        <ul
          role="listbox"
          className={cx(
            'absolute z-20 max-h-56 w-full overflow-auto rounded-xl border border-line bg-elevated py-1 shadow-lg',
            dropUp ? 'bottom-full mb-1' : 'mt-1',
          )}
        >
          {options.map((unit, i) => (
            <li key={unit}>
              <button
                type="button"
                role="option"
                aria-selected={unit === value}
                // Pointer-down, not click: a plain click fires after blur has already closed this.
                onPointerDown={(e) => {
                  e.preventDefault();
                  choose(unit);
                }}
                className={cx(
                  'flex min-h-touch w-full items-center px-3 text-left',
                  i === highlight ? 'bg-accent-soft text-accent' : 'text-ink',
                )}
              >
                {unit}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
