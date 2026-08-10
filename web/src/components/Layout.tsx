import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useHousehold } from '../household/HouseholdContext';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/meal-plan', label: 'Meal Plan' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/grocery-list', label: 'Grocery List' },
  { to: '/household', label: 'Household' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const { households, activeHouseholdId, setActiveHouseholdId } = useHousehold();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
          <span className="font-semibold text-lg">Meal Planner</span>

          <nav className="flex gap-1 flex-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {households.length > 1 && (
            <select
              className="text-sm border border-slate-300 dark:border-slate-700 bg-transparent rounded-md px-2 py-1"
              value={activeHouseholdId ?? ''}
              onChange={(e) => setActiveHouseholdId(e.target.value)}
            >
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}

          <span className="text-sm text-slate-500">{session?.displayName}</span>
          <button
            onClick={logout}
            className="text-sm px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
