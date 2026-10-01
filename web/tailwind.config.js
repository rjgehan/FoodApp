/** @type {import('tailwindcss').Config} */

/** A token from index.css, which keeps colours as "r g b" so an alpha can be added. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // The Theme screen can force light or dark, so dark is the attribute index.html sets, not the media query.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      // The design system's colours (index.css and src/theme/themes.ts say what each is for).
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        surface2: token('surface2'),
        ink: token('text'),
        muted: token('muted'),
        faint: token('faint'),
        line: token('border'),
        accent: token('accent'),
        'accent-soft': token('accent-soft'),
        'on-accent': token('on-accent'),
        'accent-ink': token('accent-ink'),
        herb: token('herb'),
        'herb-soft': token('herb-soft'),
        mustard: token('mustard'),
        'mustard-soft': token('mustard-soft'),
        plum: token('plum'),
        'plum-soft': token('plum-soft'),
        sky: token('sky'),
        'sky-soft': token('sky-soft'),
        danger: token('danger'),
        'danger-soft': token('danger-soft'),
        tab: 'var(--tab)',
        scrim: 'var(--scrim)',
      },
      fontFamily: {
        // UI text. Titles use the theme's own font: the `serif` class (index.css) sets its axes,
        // tracking and weight too, so prefer it to `font-serif` for anything that is a title.
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        serif: ['var(--title-font)'],
      },
      borderRadius: {
        // Cards and grouped lists, sheets, and the 14/15px of inputs and big buttons.
        card: '18px',
        sheet: '28px',
        field: '14px',
        btn: '15px',
      },
      boxShadow: {
        card: 'var(--shadow)',
        lift: 'var(--shadow2)',
        // The focused field's ring.
        focus: '0 0 0 4px rgb(var(--accent-soft))',
      },
      spacing: {
        // Minimum comfortable touch target.
        touch: '2.75rem',
      },
      keyframes: {
        // Wrong-PIN feedback on the login keypad.
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
        // An indeterminate bar: it sweeps rather than fills, because there is no percentage to
        // report on a single request that either answers or does not.
        slide: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        // A toast arriving from below.
        rise: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        shake: 'shake 0.4s ease-in-out',
        slide: 'slide 1.4s ease-in-out infinite',
        rise: 'rise 200ms ease-out',
      },
    },
  },
  plugins: [],
};
