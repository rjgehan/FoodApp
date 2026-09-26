import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type {
  AdminAccountDeletion,
  AdminHouseholdRow,
  AdminOverview,
  AdminPage as Page,
  AdminRecipeRow,
  AdminUserRow,
  Me,
} from '../api/types';
import {
  AdminTable,
  formatDay,
  LoadError,
  Pager,
  plural,
  RecipeBadges,
  useAdminData,
  Yes,
  type SortDir,
} from '../components/AdminParts';
import { PageTitle } from '../components/PageTitle';
import { Badge, Button, cx, ErrorText, Input, Select, Sheet } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { sectionLabel } from '../utils/recipeMeta';
import AdminHouseholdPage from './AdminHouseholdPage';
import AdminRecipePage from './AdminRecipePage';

/**
 * /admin and everything under it. The server is the real gate — every admin address answers 404
 * to anyone else — so this only saves a non-admin who types the address from staring at an
 * empty page: they are sent home, the same as any address the app does not have.
 */
export default function AdminRoutes() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<Me>('GET', '/api/users/me')
      .then((me) => !cancelled && setAdmin(me.admin === true))
      .catch((err) => {
        if (cancelled) return;
        // Only the server saying "not you" sends them home. A dropped connection or a hiccup is
        // not an answer, and bouncing the admin out of the page for it would look like one.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) setAdmin(false);
        else setError(err instanceof Error ? err.message : 'Could not load that.');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error)
    return (
      <LoadError
        error={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  if (admin === null) return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
  if (!admin) return <Navigate to="/" replace />;

  return (
    <Routes>
      <Route index element={<AdminHome />} />
      <Route path="households/:householdId" element={<AdminHouseholdPage />} />
      <Route path="recipes/:recipeId" element={<AdminRecipePage />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

type Tab = 'households' | 'people' | 'recipes';

const TABS: { value: Tab; label: string }[] = [
  { value: 'households', label: 'Households' },
  { value: 'people', label: 'People' },
  { value: 'recipes', label: 'Recipes' },
];

/**
 * The whole server at a glance, then its households, people and recipes. Which tab, search and
 * page are in the address, so coming back from a household or a recipe lands where you were.
 */
function AdminHome() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.value === params.get('tab')) ? (params.get('tab') as Tab) : 'households';
  const { data: overview } = useAdminData<AdminOverview>('/api/admin/overview');

  /** Changes some of the address's settings; anything set to null or '' is dropped. */
  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Admin" subtitle="Everything on this server. Read-only — nothing here changes anything." />

      <Overview overview={overview} />

      <div className="flex rounded-xl bg-elevated p-0.5 md:max-w-md" role="tablist" aria-label="What to look at">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            // A new tab starts at its own first page, with its own search.
            onClick={() => setParams(t.value === 'households' ? {} : { tab: t.value }, { replace: true })}
            className={cx(
              'h-9 flex-1 rounded-lg px-2 text-sm font-medium transition-colors',
              tab === t.value ? 'bg-surface text-ink shadow-sm' : 'text-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label}>
        {tab === 'households' && <HouseholdsTab params={params} update={update} />}
        {tab === 'people' && <PeopleTab params={params} update={update} />}
        {tab === 'recipes' && <RecipesTab params={params} update={update} />}
      </div>
    </div>
  );
}

function Overview({ overview: o }: { overview: AdminOverview | null }) {
  const tiles: { label: string; value: number | undefined; detail?: ReactNode }[] = [
    {
      label: 'People',
      value: o?.users,
      detail: o && `${o.usersWithEmail} with an email · ${o.usersWithPin} with a PIN`,
    },
    {
      // The number that says when the PIN screens can go: at zero, everyone can sign in without one.
      label: 'Without a password',
      value: o ? o.users - o.usersWithPassword : undefined,
      detail: o && (o.users === o.usersWithPassword ? 'Everyone has one' : `${o.usersWithPassword} of ${o.users} have one`),
    },
    { label: 'Households', value: o?.households, detail: o && `${o.liveInvites} with a live invite link` },
    { label: 'Recipes', value: o?.recipes, detail: o && `${o.publishedRecipes} in Explore` },
    { label: 'Shared', value: o?.shares, detail: o && `${o.publicLinks} public links` },
  ];

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Overview">
      {tiles.map((t) => (
        <li key={t.label} className="rounded-2xl bg-surface px-4 py-3">
          <p className="text-[0.8125rem] font-medium text-muted">{t.label}</p>
          <p className="text-[1.75rem] font-bold leading-tight tracking-[-0.02em] tabular-nums">
            {t.value ?? '–'}
          </p>
          {t.detail && <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{t.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

type TabProps = { params: URLSearchParams; update: (changes: Record<string, string | null>) => void };

const pageOf = (params: URLSearchParams) => Math.max(0, Number(params.get('page')) || 0);

/**
 * A search box that asks the server once typing stops, not on every letter. What it sends is
 * trimmed, but the box keeps what was typed: a space typed before a pause is the start of the
 * next word, not something to tidy away under the cursor.
 */
function SearchBox({
  value,
  onSearch,
  placeholder,
  label,
}: {
  value: string;
  onSearch: (q: string) => void;
  placeholder: string;
  label: string;
}) {
  const [text, setText] = useState(value);
  // The last search this box sent. The address changing to anything else (Back, say) was not
  // this box's doing, so the box follows it.
  const sent = useRef(value);
  useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    setText(value);
  }, [value]);
  useEffect(() => {
    const q = text.trim();
    if (q === sent.current) return;
    const t = setTimeout(() => {
      sent.current = q;
      onSearch(q);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <Input
      type="search"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}

function HouseholdsTab({ params, update }: TabProps) {
  const sort = params.get('sort') ?? 'name';
  const dir: SortDir = params.get('dir') === 'desc' ? 'desc' : 'asc';
  const page = pageOf(params);
  const { data, error, reload } = useAdminData<Page<AdminHouseholdRow>>(
    `/api/admin/households?sort=${sort}&dir=${dir}&page=${page}`,
  );

  function onSort(key: string) {
    // Names read A–Z first; counts and dates are more use biggest and newest first.
    const firstDir = key === 'name' || key === 'owner' ? 'asc' : 'desc';
    const nextDir = key === sort ? (dir === 'asc' ? 'desc' : 'asc') : firstDir;
    update({ sort: key, dir: nextDir, page: null });
  }

  if (error) return <LoadError error={error} onRetry={reload} />;
  return (
    <>
      <AdminTable
        label="Households"
        rows={data?.items ?? null}
        rowKey={(h) => h.id}
        href={(h) => `/admin/households/${h.id}`}
        sort={{ key: sort, dir }}
        onSort={onSort}
        empty="No households yet."
        columns={[
          { label: 'Household', cell: (h) => h.name, sortKey: 'name' },
          { label: 'Owner', cell: (h) => h.ownerName ?? <span className="text-muted">No owner</span>, sortKey: 'owner' },
          { label: 'People', cell: (h) => h.memberCount, sortKey: 'members', numeric: true },
          { label: 'Recipes', cell: (h) => h.recipeCount, sortKey: 'recipes', numeric: true },
          { label: 'Created', cell: (h) => formatDay(h.createdAt), sortKey: 'created', className: 'whitespace-nowrap' },
        ]}
        card={(h) => (
          <>
            <p className="truncate font-medium">{h.name}</p>
            <p className="text-sm text-muted">
              {[h.ownerName, plural(h.memberCount, 'person', 'people'), plural(h.recipeCount, 'recipe'), formatDay(h.createdAt)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </>
        )}
      />
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => update({ page: String(p) })} />}
    </>
  );
}

function PeopleTab({ params, update }: TabProps) {
  const q = params.get('q') ?? '';
  const page = pageOf(params);
  const { data, error, reload } = useAdminData<Page<AdminUserRow>>(
    `/api/admin/users?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
  );
  const { session } = useAuth();
  const [deleting, setDeleting] = useState<AdminUserRow | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);

  // Not on your own row: the server refuses it anyway, and a button that can only fail is a trap.
  const deleteButton = (u: AdminUserRow) =>
    u.userId === session?.userId ? null : (
      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeleting(u)} aria-label={`Delete ${u.displayName}`}>
        Delete
      </Button>
    );

  return (
    <div className="space-y-3">
      <SearchBox
        label="Search people"
        placeholder="Name, username or email"
        value={q}
        onSearch={(text) => update({ q: text, page: null })}
      />
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <AdminTable
          label="People"
          rows={data?.items ?? null}
          rowKey={(u) => u.userId}
          empty={q ? 'Nobody matches that.' : 'No accounts yet.'}
          columns={[
            { label: 'Name', cell: (u) => <PersonName user={u} /> },
            // break-words, not break-all: an address wraps only if it truly cannot fit, rather than
            // letting the table squeeze its column to a few letters and split every one of them.
            { label: 'Email', cell: (u) => u.email ?? <Badge tone="accent">No email yet</Badge>, className: 'break-words' },
            { label: 'Password', cell: (u) => <Yes value={u.hasPassword} label="Password" /> },
            { label: 'PIN', cell: (u) => <Yes value={u.hasPin} label="PIN" /> },
            { label: 'Households', cell: (u) => <Memberships user={u} /> },
            { label: 'Joined', cell: (u) => formatDay(u.createdAt), className: 'whitespace-nowrap' },
            { label: '', cell: deleteButton, className: 'text-right' },
          ]}
          card={(u) => (
            <div className="space-y-1">
              <PersonName user={u} />
              <p className="break-all text-sm">{u.email ?? <span className="text-muted">No email yet</span>}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={u.hasPassword ? 'success' : 'neutral'}>{u.hasPassword ? 'Password' : 'No password'}</Badge>
                {u.hasPin && <Badge>PIN</Badge>}
              </div>
              <div className="text-sm">
                <Memberships user={u} />
              </div>
              <div className="-ml-3">{deleteButton(u)}</div>
            </div>
          )}
        />
      )}
      {deleted && <p className="text-sm text-muted" role="status">{deleted}</p>}
      {deleting && (
        <DeleteAccountSheet
          user={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(name) => {
            setDeleting(null);
            setDeleted(`Deleted ${name}.`);
            reload();
          }}
        />
      )}
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => update({ page: String(p) })} />}
    </div>
  );
}

/**
 * Asks before deleting an account, saying first what happens to each house it is in — the
 * server works that out by the same rule the delete follows, so the list is what will happen.
 */
function DeleteAccountSheet({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  const [plan, setPlan] = useState<AdminAccountDeletion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<AdminAccountDeletion>('GET', `/api/admin/users/${user.userId}/deletion-preview`)
      .then((p) => !cancelled && setPlan(p))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load that.'));
    return () => {
      cancelled = true;
    };
  }, [user.userId]);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', `/api/admin/users/${user.userId}`);
      onDeleted(user.displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that account.');
      setBusy(false);
    }
  }

  const losing = plan?.households.filter((h) => h.outcome === 'DELETES_HOUSEHOLD') ?? [];

  return (
    <Sheet title={`Delete ${user.displayName}?`} onClose={busy ? () => undefined : onClose}>
      <div className="space-y-3">
        <p className="text-[0.9375rem]">
          {user.username}
          {user.email && <> · {user.email}</>} will be gone for good, and can't sign in again.
        </p>
        {!plan && !error && <p className="text-sm text-muted">Checking their households…</p>}
        {plan && plan.households.length === 0 && <p className="text-sm text-muted">They're in no household.</p>}
        {plan && plan.households.length > 0 && (
          <ul className="space-y-1.5 text-[0.9375rem]">
            {plan.households.map((h) => (
              <li key={h.householdId}>
                <span className="font-medium">{h.name}</span>
                {': '}
                {h.outcome === 'LEAVES' && <span className="text-muted">they leave; everyone else stays.</span>}
                {h.outcome === 'HANDS_OVER' && (
                  <span className="text-muted">they own it, so it passes to {h.newOwnerName}.</span>
                )}
                {h.outcome === 'DELETES_HOUSEHOLD' && (
                  <span className="text-danger">
                    nobody else is in it, so it's deleted too — {plural(h.recipes, 'recipe')},{' '}
                    {plural(h.plannedMeals, 'planned meal')}.
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2 pt-1">
          <Button variant="danger" className="flex-1" disabled={!plan || busy} onClick={go}>
            {busy ? 'Deleting…' : losing.length > 0 ? 'Delete account and household' : 'Delete account'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function PersonName({ user: u }: { user: AdminUserRow }) {
  return (
    <span className="block min-w-0">
      <span className="flex items-center gap-1.5">
        <span className="truncate font-medium">{u.displayName}</span>
        {u.admin && <Badge tone="accent">Admin</Badge>}
      </span>
      <span className="block truncate text-sm text-muted">{u.username}</span>
    </span>
  );
}

function Memberships({ user: u }: { user: AdminUserRow }) {
  if (u.households.length === 0) return <span className="text-muted">In no household</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {u.households.map((h, i) => (
        <span key={h.householdId}>
          <Link to={`/admin/households/${h.householdId}`} className="text-accent hover:underline">
            {h.name}
          </Link>
          {h.role === 'OWNER' && <span className="text-muted"> (owner)</span>}
          {i < u.households.length - 1 && <span className="text-muted">,</span>}
        </span>
      ))}
    </span>
  );
}

function RecipesTab({ params, update }: TabProps) {
  const q = params.get('q') ?? '';
  const householdId = params.get('household') ?? '';
  const page = pageOf(params);
  const { data, error, reload } = useAdminData<Page<AdminRecipeRow>>(
    `/api/admin/recipes?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}${householdId ? `&householdId=${householdId}` : ''}`,
  );
  const households = useEveryHousehold();
  // A household the address names but the menu does not have (yet, or at all) is still the
  // filter in force, so the menu says so rather than showing "Every household".
  const unlisted = householdId && households && !households.some((h) => h.id === householdId);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="sm:flex-1">
          <SearchBox
            label="Search recipes"
            placeholder="Recipe name"
            value={q}
            onSearch={(text) => update({ q: text, page: null })}
          />
        </div>
        <div className="relative sm:w-64">
          <Select
            aria-label="Household"
            value={householdId}
            onChange={(e) => update({ household: e.target.value, page: null })}
          >
            <option value="">Every household</option>
            {unlisted && <option value={householdId}>This household</option>}
            {households?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">▾</span>
        </div>
      </div>
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <AdminTable
          label="Recipes"
          rows={data?.items ?? null}
          rowKey={(r) => r.id}
          href={(r) => `/admin/recipes/${r.id}`}
          empty={q || householdId ? 'No recipes match that.' : 'No recipes yet.'}
          columns={[
            { label: 'Recipe', cell: (r) => r.name },
            { label: 'Household', cell: (r) => r.householdName },
            {
              label: 'Filed under',
              cell: (r) => [r.section ? sectionLabel(r.section) : null, ...r.groups].filter(Boolean).join(' · ') || '—',
            },
            { label: 'Added', cell: (r) => formatDay(r.createdAt), className: 'whitespace-nowrap' },
            { label: '', cell: (r) => <RecipeBadges recipe={r} /> },
          ]}
          card={(r) => (
            <div className="space-y-1">
              <p className="truncate font-medium">{r.name}</p>
              <p className="text-sm text-muted">
                {[r.householdName, r.section ? sectionLabel(r.section) : null, ...r.groups, formatDay(r.createdAt)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <RecipeBadges recipe={r} />
            </div>
          )}
        />
      )}
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => update({ page: String(p) })} />}
    </div>
  );
}

/**
 * Every household, for the Recipes filter: page after page of the server's largest page, so a
 * server with more houses than one page holds still lists them all. Null until they are in.
 */
function useEveryHousehold(): AdminHouseholdRow[] | null {
  const [all, setAll] = useState<AdminHouseholdRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows: AdminHouseholdRow[] = [];
      for (let page = 0; ; page++) {
        const got = await api<Page<AdminHouseholdRow>>('GET', `/api/admin/households?sort=name&size=200&page=${page}`);
        rows.push(...got.items);
        if (got.items.length === 0 || rows.length >= got.total) break;
      }
      if (!cancelled) setAll(rows);
    })().catch(() => {
      // The filter is a convenience; the list and the search work without it.
      if (!cancelled) setAll([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return all;
}
