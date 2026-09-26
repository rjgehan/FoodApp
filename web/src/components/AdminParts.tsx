import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon } from './icons';
import { Badge, Button, cx, EmptyState, ErrorText, Select } from './ui';

/*
 * The pieces the admin pages (pages/Admin*.tsx) are built from: loading an admin address, the
 * table that turns into cards on a phone, paging, and the small marks that go in its cells.
 */

export type SortDir = 'asc' | 'desc';

export type Column<T> = {
  label: string;
  cell: (row: T) => ReactNode;
  /** Set on a column the server can sort by; the header becomes a button. */
  sortKey?: string;
  /** Numbers line up on the right, the way a column of figures is read. */
  numeric?: boolean;
  className?: string;
};

/**
 * The admin pages' lists: a real table where there is room for one, and a stack of cards on a
 * phone, where six columns would each be a word wide. Every row goes somewhere when `href`
 * says where — the whole card on a phone, the whole row on a computer (its first cell is also a
 * real link, for the keyboard, screen readers and opening in a new tab). A sortable list sorts
 * from its headers on a computer and from a "Sort by" menu above the cards on a phone.
 */
export function AdminTable<T>({
  rows,
  columns,
  rowKey,
  href,
  card,
  empty,
  sort,
  onSort,
  label,
}: {
  rows: T[] | null;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  href?: (row: T) => string;
  /** What a row says on a phone. */
  card: (row: T) => ReactNode;
  empty: ReactNode;
  sort?: { key: string; dir: SortDir };
  onSort?: (key: string) => void;
  /** Names the table for screen readers. */
  label: string;
}) {
  const navigate = useNavigate();
  if (rows === null) return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  const sortable = sort && onSort ? columns.filter((c) => c.sortKey) : [];

  return (
    <>
      {sortable.length > 0 && sort && onSort && (
        <div className="mb-3 flex items-center gap-2 md:hidden">
          <div className="relative flex-1">
            <Select
              aria-label="Sort by"
              value={sort.key}
              // A different column starts in its own natural order; see the page's onSort.
              onChange={(e) => onSort(e.target.value)}
            >
              {sortable.map((c) => (
                <option key={c.sortKey} value={c.sortKey}>
                  Sort by {c.label.toLowerCase()}
                </option>
              ))}
            </Select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">▾</span>
          </div>
          <Button
            variant="secondary"
            onClick={() => onSort(sort.key)}
            aria-label={sort.dir === 'asc' ? 'Ascending — switch to descending' : 'Descending — switch to ascending'}
          >
            {sort.dir === 'asc' ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            {sort.dir === 'asc' ? 'Ascending' : 'Descending'}
          </Button>
        </div>
      )}

      <div className="hidden overflow-x-auto rounded-2xl bg-surface md:block">
        <table className="w-full text-left text-[0.9375rem]" aria-label={label}>
          <thead>
            <tr className="border-b border-line text-[0.8125rem] text-muted">
              {columns.map((c) => {
                const active = sort && c.sortKey === sort.key;
                return (
                  <th
                    key={c.label}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cx('px-4 py-2.5 font-medium', c.numeric && 'text-right', c.className)}
                  >
                    {c.sortKey && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.sortKey!)}
                        className={cx(
                          'press -mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5',
                          active ? 'text-ink' : 'hover:text-ink',
                        )}
                      >
                        {c.label}
                        {active &&
                          (sort.dir === 'asc' ? (
                            <ChevronUpIcon className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDownIcon className="h-3.5 w-3.5" />
                          ))}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cx(href && 'cursor-pointer hover:bg-elevated/60')}
                onClick={
                  href &&
                  ((e) => {
                    // A link or button inside the row does its own thing; so does selecting text.
                    if ((e.target as HTMLElement).closest('a, button') || window.getSelection()?.toString()) return;
                    navigate(href(row));
                  })
                }
              >
                {columns.map((c, i) => (
                  <td key={c.label} className={cx('px-4 py-2.5 align-top', c.numeric && 'text-right tabular-nums', c.className)}>
                    {i === 0 && href ? (
                      <Link to={href(row)} className="font-medium text-accent hover:underline">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line rounded-2xl bg-surface px-4 md:hidden" aria-label={label}>
        {rows.map((row) => (
          <li key={rowKey(row)}>
            {href ? (
              <Link to={href(row)} className="press flex min-h-touch items-center gap-3 py-3">
                <div className="min-w-0 flex-1">{card(row)}</div>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-subtle" />
              </Link>
            ) : (
              <div className="py-3">{card(row)}</div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** "1–50 of 120" and the way to the next fifty. Nothing at all when everything fits on one page. */
export function Pager({
  page,
  size,
  total,
  onPage,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total <= size && page === 0) return null;
  const from = Math.min(total, page * size + 1);
  const to = Math.min(total, (page + 1) * size);
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <span className="text-sm text-muted tabular-nums">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="secondary" disabled={to >= total} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/** A yes/no cell: a tick when there is one, a quiet dash when there is not. */
export function Yes({ value, label }: { value: boolean; label: string }) {
  return value ? (
    <span className="font-medium text-success" aria-label={`${label}: yes`}>
      ✓
    </span>
  ) : (
    <span className="text-subtle" aria-label={`${label}: no`}>
      —
    </span>
  );
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Loads an admin address, and leaves for home if it answers 404 — which is what it says the
 * moment this account stops being the admin (the server's config changed, or they renamed
 * themselves), as well as for a household or recipe that has since been deleted.
 */
export function useAdminData<T>(path: string | null): {
  data: T | null;
  error: string | null;
  reload: () => void;
} {
  const navigate = useNavigate();
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({
    path: null,
    data: null,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>('GET', path)
      .then((data) => !cancelled && setState({ path, data, error: null }))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          navigate(path.startsWith('/api/admin/households/') || path.startsWith('/api/admin/recipes/') ? '/admin' : '/', {
            replace: true,
          });
          return;
        }
        setState({ path, data: null, error: err instanceof Error ? err.message : 'Could not load that.' });
      });
    return () => {
      cancelled = true;
    };
  }, [path, navigate, attempt]);

  const reload = () => {
    setState({ path: null, data: null, error: null });
    setAttempt((n) => n + 1);
  };
  // Only what belongs to the address being asked for: a new search shows Loading, not old rows.
  return state.path === path ? { data: state.data, error: state.error, reload } : { data: null, error: null, reload };
}

/** A list or page that did not load: what went wrong, and a way to ask again without reloading. */
export function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <ErrorText>{error}</ErrorText>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Where a recipe has gone beyond its own house, and how many links it keeps. */
export function RecipeBadges({
  recipe: r,
}: {
  recipe: { published: boolean; sharedWith: string[]; hasPublicLink: boolean; linkCount?: number };
}) {
  const badges = [
    r.published && <Badge key="explore" tone="accent">In Explore</Badge>,
    r.sharedWith.length > 0 && (
      <Badge key="shared">
        Shared with {r.sharedWith.length <= 2 ? r.sharedWith.join(', ') : plural(r.sharedWith.length, 'household')}
      </Badge>
    ),
    r.hasPublicLink && <Badge key="link">Public link</Badge>,
    !!r.linkCount && <Badge key="links">{plural(r.linkCount, 'link')}</Badge>,
  ].filter(Boolean);
  return badges.length ? <span className="flex flex-wrap gap-1.5">{badges}</span> : null;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Back to where the admin came from — the list, with its sort and page — or to the admin home
 * when this page was opened on its own.
 */
export function AdminBack({ fallback = '/admin' }: { fallback?: string }) {
  const navigate = useNavigate();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3"
      onClick={() => (canGoBack ? navigate(-1) : navigate(fallback))}
    >
      <ChevronLeftIcon className="h-5 w-5" />
      Back
    </Button>
  );
}
