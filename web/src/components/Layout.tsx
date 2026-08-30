import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useHousehold } from '../household/HouseholdContext';
import { cx, IconButton } from './ui';
import {
  BookIcon,
  CalendarIcon,
  CartIcon,
  HomeIcon,
  HouseholdIcon,
  LogOutIcon,
} from './icons';

const navItems = [
  { to: '/', label: 'Home', Icon: HomeIcon },
  { to: '/meal-plan', label: 'Plan', Icon: CalendarIcon },
  { to: '/recipes', label: 'Recipes', Icon: BookIcon },
  { to: '/grocery-list', label: 'Groceries', Icon: CartIcon },
  { to: '/household', label: 'House', Icon: HouseholdIcon },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const { households, activeHouseholdId, setActiveHouseholdId } = useHousehold();
  const activeName = households.find((h) => h.id === activeHouseholdId)?.name;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 pt-safe backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3">
          {households.length > 1 ? (
            // A bare select is the one control every mobile browser renders as a native
            // picker, which beats anything custom for one-handed use.
            <div className="relative min-w-0">
              <select
                aria-label="Active household"
                className="max-w-[60vw] appearance-none truncate rounded-full bg-elevated py-1.5 pl-3 pr-7
                           text-base font-semibold text-ink outline-none"
                value={activeHouseholdId ?? ''}
                onChange={(e) => setActiveHouseholdId(e.target.value)}
              >
                {households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted">▾</span>
            </div>
          ) : (
            <span className="truncate text-lg font-semibold">{activeName ?? 'Meal Planner'}</span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <span className="hidden text-sm text-muted sm:inline">{session?.displayName}</span>
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm
                         font-semibold text-accent sm:hidden"
              aria-hidden="true"
            >
              {session?.displayName?.charAt(0).toUpperCase()}
            </span>
            <IconButton label="Log out" onClick={logout}>
              <LogOutIcon className="h-5 w-5" />
            </IconButton>
          </div>
        </div>

        {/* Wide screens get the tabs up here instead of pinned to the bottom. */}
        <nav className="mx-auto hidden max-w-3xl gap-1 px-3 pb-2 md:flex">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-elevated',
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Bottom padding clears the fixed tab bar plus the home indicator. */}
      <main className="mx-auto w-full max-w-3xl px-3 pb-28 pt-4 md:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-safe backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-3xl">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex flex-1 flex-col items-center gap-1 py-2 text-[0.7rem] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cx(
                      'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-accent-soft',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
