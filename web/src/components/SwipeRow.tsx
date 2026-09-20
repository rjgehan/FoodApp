import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cx } from './ui';
import {
  animateSpring,
  prefersReducedMotion,
  project,
  rubberband,
  trimSamples,
  velocityOf,
  type Animation,
} from '../utils/spring';

export interface SwipeAction {
  label: string;
  tone: 'danger' | 'accent';
  onAction: () => void;
}

const ACTION_WIDTH = 84;

/** Every row's "close yourself", so opening one closes whichever was open — one at a time, like Mail. */
const openRows = new Set<() => void>();

/**
 * A list row that slides left to reveal actions, the way Mail and Reminders do. The row follows
 * the finger exactly, resists being pulled the wrong way, and where it lands is decided by where
 * the flick was heading, not where the finger lifted: a hard flick all the way across does the
 * last action outright. Tapping an open row closes it rather than doing what the row does.
 *
 * Vertical movement is left to the page (touch-action: pan-y), so scrolling a list of these
 * still feels like scrolling. The direction is only decided after 10px, so a slightly diagonal
 * scroll does not catch a row by accident.
 */
export default function SwipeRow({ actions, children }: { actions: SwipeAction[]; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const tray = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const animation = useRef<Animation | null>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    from: number;
    axis: 'x' | 'y' | null;
    samples: { t: number; v: number }[];
  } | null>(null);
  const swallowClick = useRef(false);
  const reveal = actions.length * ACTION_WIDTH;

  const paint = (value: number) => {
    offset.current = value;
    if (content.current) content.current.style.transform = `translate3d(${value}px, 0, 0)`;
    if (tray.current) {
      // Past the buttons the last one stretches to fill: the tell that letting go will do it.
      tray.current.style.width = `${Math.max(reveal, -value)}px`;
      // Hidden at rest, or its colour fringes the row's antialiased edges.
      tray.current.style.visibility = value === 0 ? 'hidden' : 'visible';
    }
  };

  const springTo = (target: number, velocity = 0, damping = 1, then?: () => void) => {
    animation.current?.stop();
    if (prefersReducedMotion()) {
      paint(target);
      then?.();
      return;
    }
    animation.current = animateSpring(offset.current, target, paint, { damping, response: 0.3, velocity }, then);
  };

  const closeSelf = useRef(() => {
    if (offset.current !== 0 && !gesture.current) springTo(0);
  });

  useEffect(() => {
    const close = closeSelf.current;
    openRows.add(close);
    return () => {
      openRows.delete(close);
      animation.current?.stop();
    };
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    swallowClick.current = false;
    // Touching any other row puts away whichever one was open, as in Mail.
    openRows.forEach((close) => close !== closeSelf.current && close());
    // Caught mid-flight: carry on from where it is on screen, not from where it was going.
    animation.current?.stop();
    gesture.current = { x: e.clientX, y: e.clientY, from: offset.current, axis: null, samples: [{ t: e.timeStamp, v: e.clientX }] };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'y') return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone; pointerup/cancel will settle the row.
      }
    }
    if (g.axis !== 'x') return;

    const width = e.currentTarget.offsetWidth;
    let value = g.from + dx;
    if (value > 0) value = rubberband(value, width);
    else if (value < -width) value = -width - rubberband(-width - value, width);
    paint(value);

    g.samples.push({ t: e.timeStamp, v: e.clientX });
    trimSamples(g.samples, e.timeStamp);
  }

  function settle(width: number, velocity: number) {
    const landing = offset.current + project(velocity);
    // A little bounce only when the finger actually threw it.
    const damping = Math.abs(velocity) > 300 ? 0.8 : 1;
    // Doing the action outright needs the row really dragged across — momentum alone only opens
    // it, since a throw can happen by accident and a removal should not. Still heading back
    // right on release means the finger changed its mind.
    if (offset.current < -width * 0.55 && velocity < 300) {
      const commit = actions[actions.length - 1];
      springTo(-width, velocity, 1, () => commit.onAction());
    } else if (landing < -reveal / 2) {
      springTo(-reveal, velocity, damping);
    } else {
      springTo(0, velocity, damping);
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.axis !== 'x') {
      if (g.axis === null && offset.current !== 0) {
        swallowClick.current = true;
        springTo(0);
      }
      return;
    }
    swallowClick.current = true;
    // The release is a sample too: a finger that stopped before lifting has no speed left.
    g.samples.push({ t: e.timeStamp, v: e.clientX });
    trimSamples(g.samples, e.timeStamp);
    settle(e.currentTarget.offsetWidth, velocityOf(g.samples));
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (g?.axis === 'x') settle(e.currentTarget.offsetWidth, 0);
  }

  return (
    <div className="relative overflow-hidden">
      <div ref={tray} className="absolute inset-y-0 right-0 flex" style={{ width: reveal, visibility: 'hidden' }}>
        {actions.map((action, i) => {
          const last = i === actions.length - 1;
          return (
            <button
              key={action.label}
              type="button"
              tabIndex={-1}
              onClick={() => {
                action.onAction();
                springTo(0);
              }}
              style={last ? undefined : { width: ACTION_WIDTH }}
              className={cx(
                'flex items-center justify-center px-3 text-sm font-semibold',
                last ? 'flex-1' : 'shrink-0',
                action.tone === 'danger' ? 'bg-danger text-bg' : 'bg-accent text-accent-ink',
              )}
            >
              {action.label}
            </button>
          );
        })}
      </div>
      <div
        ref={content}
        /*
         * Opaque, because it slides over the delete button behind it — and the colour of
         * whatever it is sitting on, which is a card. It used to be the page colour, which
         * was the same white; now that the page is the well behind the cards, that would
         * paint a grey stripe across every row.
         */
        className="relative bg-surface"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(e) => {
          if (swallowClick.current) {
            swallowClick.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
