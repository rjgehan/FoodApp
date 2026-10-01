import type { AdminThemeUsage } from '../api/types';
import { CUSTOM, themeName, THEMES, type Theme } from '../theme/theme';
import { themeNamed } from '../theme/themes';
import { LoadError, plural, useAdminData } from './AdminParts';
import { swatchColor, ThemeSwatch } from './ThemeSwatch';
import { EmptyState } from './ui';

/**
 * Which themes people pick: every one of the five with how many use it (the ones nobody picks
 * included — that is an answer too), the accents people chose for Custom, and how many pin light
 * or dark. Read-only, like the rest of admin.
 */
export default function AdminThemes() {
  const { data, error, reload } = useAdminData<AdminThemeUsage>('/api/admin/themes');
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <p className="py-8 text-center text-sm text-muted">Loading…</p>;

  const share = (n: number) => (data.people ? Math.round((n / data.people) * 100) : 0);
  // Most popular first; equal counts keep the order the apps show them in.
  const order: string[] = [...THEMES.map((t) => t.key), CUSTOM];
  const presets = [...data.presets].sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));
  const top = Math.max(1, ...presets.map((p) => p.count));
  const mode = (m: string) => data.modes.find((x) => x.mode === m)?.count ?? 0;

  return (
    <div className="space-y-6">
      <p className="text-[0.9375rem] text-muted">
        {plural(data.people, 'person', 'people')} · {data.untouched} never changed anything, and see Tomato.
      </p>

      <section aria-labelledby="theme-presets" className="md:max-w-2xl">
        <h2 id="theme-presets" className="group-label mb-2 px-1">
          Themes
        </h2>
        <ul className="card card-rows inset-rows [--row-inset:3.75rem]" aria-label="Themes in use">
          {presets.map((p) => {
            const preset = themeNamed(p.key);
            return (
              <li key={p.key} className="flex items-center gap-3 px-4 py-2.5">
                <ThemeSwatch color={preset?.light.accent ?? ''} rainbow={!preset} className="h-7 w-7" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{preset?.name ?? 'Custom'}</span>
                    <span className="shrink-0 text-[0.9375rem] tabular-nums">
                      {p.count}
                      <span className="ml-1.5 text-[0.8125rem] text-muted">{share(p.count)}%</span>
                    </span>
                  </div>
                  {/* How it compares with the most-picked one, in the one colour so the
                      swatch alone says which is which. */}
                  <div className="mt-1.5 h-1.5 rounded-full bg-surface2" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(p.count / top) * 100}%`, minWidth: p.count ? '0.375rem' : 0 }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="theme-modes" className="md:max-w-2xl">
        <h2 id="theme-modes" className="group-label mb-2 px-1">
          Light or dark
        </h2>
        <ul className="grid grid-cols-3 gap-3" aria-label="Light or dark">
          {[
            { label: 'System', value: mode('SYSTEM') },
            { label: 'Light', value: mode('LIGHT') },
            { label: 'Dark', value: mode('DARK') },
          ].map((m) => (
            <li key={m.label} className="card px-4 py-3">
              <p className="text-[0.8125rem] font-medium text-muted">{m.label}</p>
              <p className="serif text-[1.75rem] leading-tight tabular-nums">{m.value}</p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">{share(m.value)}%</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="theme-custom">
        <h2 id="theme-custom" className="group-label mb-2 px-1">
          Custom accents
        </h2>
        {data.custom.length === 0 ? (
          <EmptyState>Nobody has picked their own yet.</EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Custom colours in use">
            {data.custom.map((c) => (
              <li key={c.primary + c.secondary} className="card p-3">
                {/* One colour today; a second only when an old iPhone build picked a pair. */}
                <div className="flex h-12 overflow-hidden rounded-xl" aria-hidden="true">
                  <span className="flex-[3]" style={{ backgroundColor: c.primary }} />
                  {c.secondary !== c.primary && <span className="flex-[2]" style={{ backgroundColor: c.secondary }} />}
                </div>
                <p className="mt-2 font-mono text-[0.8125rem]">
                  {c.secondary === c.primary ? c.primary : `${c.primary} · ${c.secondary}`}
                </p>
                <p className="text-[0.8125rem] text-muted">{plural(c.count, 'person', 'people')}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A person's theme, small, beside their name on the People tab. */
export function ThemeDot({ theme }: { theme: Theme | undefined }) {
  const t = theme ?? { preset: null, primary: null, secondary: null, mode: null };
  const pinned = t.mode === 'LIGHT' ? ', light' : t.mode === 'DARK' ? ', dark' : '';
  const label = `Colours: ${themeName(t)}${pinned}`;
  return (
    <span title={label} aria-label={label} role="img" className="inline-flex">
      <ThemeSwatch color={swatchColor(t)} className="h-3.5 w-3.5" />
    </span>
  );
}
