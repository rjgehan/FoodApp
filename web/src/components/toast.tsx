import { useEffect, useSyncExternalStore } from 'react';
import { Icon, type IconName } from './icons';

/*
 The mockup's toast: a dark (in dark mode, light) bar above the tab bar for a few seconds, for
 "it worked" that needs no answer — optionally with one action, usually Undo. One at a time; a
 new one replaces the last. Call toast() from anywhere; Layout draws it.
*/

export interface ToastOptions {
  icon?: IconName;
  action?: { label: string; onClick: () => void };
  /** How long it stays, in ms. */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
  message: string;
}

let current: ToastState | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, options: ToastOptions = {}) {
  current = { id: nextId++, message, ...options };
  emit();
}

export function dismissToast() {
  current = null;
  emit();
}

function useToast() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Where toasts appear. Above the tab bar on a phone, bottom centre on a wide screen. */
export function Toaster() {
  const t = useToast();
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => {
      if (current?.id === t.id) dismissToast();
    }, t.duration ?? (t.action ? 5000 : 3000));
    return () => clearTimeout(timer);
  }, [t]);
  if (!t) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-50 flex justify-center md:bottom-8">
      <div
        key={t.id}
        role="status"
        className="pointer-events-auto flex w-full max-w-md animate-rise items-center gap-2.5 rounded-2xl bg-ink px-3.5 py-3 text-sm font-medium text-bg shadow-lift"
      >
        {t.icon && <Icon name={t.icon} size={18} strokeWidth={2.6} className="shrink-0 text-herb" />}
        <span className="min-w-0 flex-1">{t.message}</span>
        {t.action && (
          <button
            type="button"
            onClick={() => {
              t.action!.onClick();
              dismissToast();
            }}
            className="press shrink-0 font-semibold text-accent-ink"
          >
            {t.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
