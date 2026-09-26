import { Link, useParams } from 'react-router-dom';
import type { AdminHouseholdDetail } from '../api/types';
import { AdminBack, AdminTable, formatDay, LoadError, RecipeBadges, useAdminData, Yes } from '../components/AdminParts';
import { PageTitle } from '../components/PageTitle';
import { Badge, Card, EmptyState } from '../components/ui';
import { sectionLabel } from '../utils/recipeMeta';

/** One household as its owner never sees it: everybody in it, how they sign in, and every recipe. */
export default function AdminHouseholdPage() {
  const { householdId } = useParams();
  const { data: h, error, reload } = useAdminData<AdminHouseholdDetail>(householdId ? `/api/admin/households/${householdId}` : null);

  return (
    <div className="space-y-4">
      <AdminBack />
      {error && <LoadError error={error} onRetry={reload} />}
      {!h && !error && <p className="py-8 text-center text-sm text-muted">Loading…</p>}
      {h && (
        <>
          <PageTitle
            title={h.name}
            subtitle={[
              `Created ${formatDay(h.createdAt)}`,
              `serves ${h.defaultServings} by default`,
              `plans ${h.planningHorizonDays} days ahead`,
              h.inviteLive ? 'invite link live' : 'no live invite link',
            ].join(' · ')}
          />

          <Card title={`People · ${h.members.length}`}>
            <AdminTable
              label="People in this household"
              rows={h.members}
              rowKey={(m) => m.userId}
              empty="Nobody is in this household."
              columns={[
                {
                  label: 'Name',
                  cell: (m) => (
                    <span className="block">
                      <span className="block font-medium">{m.displayName}</span>
                      <span className="block text-sm text-muted">{m.username}</span>
                    </span>
                  ),
                },
                { label: 'Email', cell: (m) => m.email ?? <Badge tone="accent">No email yet</Badge>, className: 'break-words' },
                { label: 'Role', cell: (m) => (m.role === 'OWNER' ? 'Owner' : 'Member') },
                { label: 'Joined', cell: (m) => formatDay(m.joinedAt), className: 'whitespace-nowrap' },
                { label: 'Password', cell: (m) => <Yes value={m.hasPassword} label="Password" /> },
                { label: 'PIN', cell: (m) => <Yes value={m.hasPin} label="PIN" /> },
                { label: 'Opens here', cell: (m) => <Yes value={m.lastHousehold} label="Signing in opens this household" /> },
              ]}
              card={(m) => (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{m.displayName}</span>
                    {m.role === 'OWNER' && <Badge>Owner</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    {m.username} · joined {formatDay(m.joinedAt)}
                  </p>
                  <p className="break-all text-sm">{m.email ?? <span className="text-muted">No email yet</span>}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={m.hasPassword ? 'success' : 'neutral'}>{m.hasPassword ? 'Password' : 'No password'}</Badge>
                    {m.hasPin && <Badge>PIN</Badge>}
                    {m.lastHousehold && <Badge>Opens here</Badge>}
                  </div>
                </div>
              )}
            />
          </Card>

          <Card title={`Recipes · ${h.recipes.length}`}>
            {h.recipes.length === 0 ? (
              <EmptyState>No recipes of its own yet.</EmptyState>
            ) : (
              <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
                {h.recipes.map((r) => (
                  <li key={r.id}>
                    <Link to={`/admin/recipes/${r.id}`} className="press flex min-h-touch flex-col gap-1 py-3 md:flex-row md:items-center md:gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-accent">{r.name}</span>
                        <span className="block text-sm text-muted">
                          {r.section ? sectionLabel(r.section) : 'Not filed'} · added {formatDay(r.createdAt)}
                        </span>
                      </span>
                      <RecipeBadges recipe={r} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
