import { useEffect, type ReactNode } from 'react';
import { PIN_LENGTH } from '../auth/pin';
import { cx } from './ui';
import { BackspaceIcon } from './icons';

/** Filled/empty dots showing how much of the PIN has been entered. */
export function PinDots({ length, error }: { length: number; error?: boolean }) {
  return (
    <div className={cx('flex justify-center gap-4', error && 'animate-shake')}>
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <span
          key={i}
          className={cx(
            'h-3.5 w-3.5 rounded-full border-2 transition-colors',
            error ? 'border-danger bg-danger' : i < length ? 'border-accent bg-accent' : 'border-line',
          )}
        />
      ))}
    </div>
  );
}

/**
 * On-screen number pad. Keys are deliberately large — this app is mostly used from a phone or
 * tablet in the kitchen. A physical keyboard works too, for desktop.
 */
export default function Keypad({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  useEffect(() => {
    if (disabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') {
        onChange((value + e.key).slice(0, PIN_LENGTH));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onChange(value.slice(0, -1));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [value, onChange, disabled]);

  const press = (digit: string) => onChange((value + digit).slice(0, PIN_LENGTH));

  return (
    <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <Key key={digit} onClick={() => press(digit)} disabled={disabled}>
          {digit}
        </Key>
      ))}
      <span />
      <Key onClick={() => press('0')} disabled={disabled}>
        0
      </Key>
      <Key onClick={() => onChange(value.slice(0, -1))} disabled={disabled || value.length === 0} label="Delete">
        <BackspaceIcon className="h-6 w-6" />
      </Key>
    </div>
  );
}

function Key({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-[4.25rem] select-none items-center justify-center rounded-2xl border border-line
                 bg-surface text-2xl font-medium text-ink transition-colors
                 active:bg-accent-soft active:text-accent
                 disabled:opacity-30 disabled:active:bg-surface disabled:active:text-ink"
    >
      {children}
    </button>
  );
}
