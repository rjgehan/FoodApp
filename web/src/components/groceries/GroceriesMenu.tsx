import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../icons';
import { cx, IconButton } from '../ui';
import { prefersReducedMotion } from '../../utils/spring';

export interface GroceriesMenuItem {
  label: string;
  detail: string;
  icon: IconName;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * The list's ••• (mockup 4.3): a small menu that drops from the button rather than a sheet, since
 * it holds only three things and the list behind it should stay in view. Each choice says what it
 * will do underneath ("9 ticked items"), so nothing in it needs a second look.
 *
 * Built as a non-modal dialog of buttons: Escape or a tap anywhere else puts it away.
 */
export default function GroceriesMenu({ label, items }: { label: string; items: (GroceriesMenuItem | false | null)[] }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const shown = items.filter(Boolean) as GroceriesMenuItem[];

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || prefersReducedMotion()) return;
    panel.current?.animate(
      [
        { opacity: 0, transform: 'scale(0.92)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 160, easing: 'ease-out' },
    );
  }, [open]);

  return (
    <div className="relative">
      <IconButton
        label={label}
        shape="round"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        // Open, the button fills with the text colour: it is what the menu hangs from.
        className={cx(open && '!border-ink !bg-ink !text-bg')}
      >
        <Icon name="more" size={18} />
      </IconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-30" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            ref={panel}
            role="dialog"
            aria-label={label}
            className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[270px] origin-top-right overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
          >
            {shown.map((item, i) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cx(
                  'flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface2 disabled:opacity-45',
                  i > 0 && 'border-t border-line',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base">{item.label}</span>
                  <span className="block truncate text-xs text-muted">{item.detail}</span>
                </span>
                <Icon name={item.icon} size={19} className="shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
