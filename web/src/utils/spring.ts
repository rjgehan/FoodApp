/**
 * Motion the way Apple's fluid interfaces describe it, for the few things a finger moves directly
 * (sheets, swipeable rows).
 *
 * A spring has a damping ratio — 1 settles without overshoot, lower overshoots — and a response
 * in seconds: roughly how quickly it gets there. It is not a duration; the settle time falls out
 * of the two. Every animation starts from the value on screen now and carries the finger's speed
 * at release, so a gesture can grab an animation mid-flight and nothing jumps.
 */

export interface SpringOptions {
  /** 1 = no overshoot (the default for anything not thrown); ~0.8 when a flick carried momentum. */
  damping?: number;
  /** Seconds. Lower is snappier. */
  response?: number;
  /** px/s at the start — the finger's speed when it let go. */
  velocity?: number;
}

export interface Animation {
  stop: () => void;
}

/** Animates `from` to `to`, calling `onFrame` with each value; stop() leaves it where it is. */
export function animateSpring(
  from: number,
  to: number,
  onFrame: (value: number) => void,
  { damping = 1, response = 0.35, velocity = 0 }: SpringOptions = {},
  onDone?: () => void,
): Animation {
  const omega = (2 * Math.PI) / response;
  const x0 = from - to;

  // The closed-form solution, so each frame is exact rather than accumulated error.
  const position = (t: number) => {
    if (damping < 1) {
      const wd = omega * Math.sqrt(1 - damping * damping);
      return (
        to +
        Math.exp(-damping * omega * t) * (x0 * Math.cos(wd * t) + ((velocity + damping * omega * x0) / wd) * Math.sin(wd * t))
      );
    }
    return to + (x0 + (velocity + omega * x0) * t) * Math.exp(-omega * t);
  };

  let stopped = false;
  let frame = 0;
  const start = performance.now();
  const tick = (now: number) => {
    if (stopped) return;
    const t = (now - start) / 1000;
    const value = position(t);
    const speed = (position(t + 0.001) - value) / 0.001;
    if (Math.abs(value - to) < 0.5 && Math.abs(speed) < 10) {
      onFrame(to);
      onDone?.();
      return;
    }
    onFrame(value);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
    },
  };
}

/**
 * Where a flick would come to rest, the way scrolling decelerates — decide the outcome from
 * this, not from where the finger happened to lift. (Apple's projection, not v²/2a.)
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Past an edge, follow the finger less and less — soft resistance rather than a wall. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** px/s from the last ~100ms of pointer samples. */
export function velocityOf(samples: { t: number; v: number }[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? (last.v - first.v) / dt : 0;
}

/** Keeps only the samples from the last 100ms (and always at least two). */
export function trimSamples(samples: { t: number; v: number }[], now: number) {
  while (samples.length > 2 && now - samples[0].t > 100) samples.shift();
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
