import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useHousehold } from '../household/HouseholdContext';
import { CardInSheetProvider, cx, Sheet } from './ui';
import ProfileCard from './ProfileCard';
import CredentialsPrompt from './CredentialsPrompt';
import { CompactTitleProvider } from './PageTitle';
import {
  BookIcon,
  CalendarIcon,
  CartIcon,
  ChevronRightIcon,
  CompassIcon,
  CupboardIcon,
} from './icons';

/*
 Named for what is behind each tab. Five, the most a phone tab bar should hold.

 Household used to have the last one and does not any more: it is where you go once, to set
 the place up, and it was spending a fifth of the app's navigation on that. It lives behind
 your own face in the corner now, with the rest of the settings.
*/
const navItems = [
  { to: '/meal-plan', label: 'Plan', Icon: CalendarIcon },
  { to: '/recipes', label: 'Recipes', Icon: BookIcon },
  { to: '/grocery-list', label: 'Groceries', Icon: CartIcon },
  { to: '/cupboard', label: 'Cupboard', Icon: CupboardIcon },
  { to: '/explore', label: 'Explore', Icon: CompassIcon },
];

/**
 * Translucent bars over content that scrolls underneath them, rather than opaque strips. At the
 * top of a page the top bar is simply the page; once something scrolls under it, it turns into
 * frosted glass with a hairline edge, and the page's title shrinks into the middle of it.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const { households, activeHouseholdId, setActiveHouseholdId, lostHousehold, dismissLostHousehold } = useHousehold();
  const activeName = households.find((h) => h.id === activeHouseholdId)?.name;
  const [compactTitle, setCompactTitle] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <CompactTitleProvider value={setCompactTitle}>
      <div className="min-h-screen">
        <header
          className={cx(
            'sticky top-0 z-20 pt-safe transition-[background-color,box-shadow] duration-200',
            scrolled ? 'material-bar edge-bottom' : 'bg-bg',
          )}
        >
          <div className="relative mx-auto flex h-12 max-w-3xl items-center gap-2 px-3">
            {/* Makes way for the page title once it has shrunk into the bar. */}
            <div className={cx('min-w-0 transition-opacity duration-200', compactTitle && 'pointer-events-none opacity-0')}>
              {households.length > 1 ? (
                // A bare select is the one control every mobile browser renders as a native
                // picker, which beats anything custom for one-handed use.
                <div className="relative min-w-0">
                  <select
                    aria-label="Active household"
                    className="press max-w-[60vw] appearance-none truncate rounded-full bg-elevated py-1.5 pl-3 pr-7
                               text-[0.9375rem] font-semibold text-ink outline-none"
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
                <span className="truncate text-[0.9375rem] font-semibold text-muted">{activeName ?? 'Meal Planner'}</span>
              )}
            </div>

            <span
              aria-hidden="true"
              className={cx(
                'pointer-events-none absolute inset-x-20 truncate text-center text-[1.0625rem] font-semibold tracking-[-0.01em]',
                'transition-[opacity,transform] duration-200',
                compactTitle ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
              )}
            >
              {compactTitle}
            </span>

            {/* Who is signed in, and the way to your own account — the same sheet as Household → You. */}
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              aria-label="Your account"
              className="press ml-auto flex h-11 items-center gap-2 rounded-xl pl-2"
            >
              <span className="hidden text-sm text-muted sm:inline">{session?.displayName}</span>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm
                           font-semibold text-accent"
                aria-hidden="true"
              >
                {session?.displayName?.charAt(0).toUpperCase()}
              </span>
            </button>
          </div>

          {/* Wide screens get the tabs up here instead of pinned to the bottom. */}
          <nav className="mx-auto hidden max-w-3xl gap-1 px-3 pb-2 md:flex">
            {navItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cx(
                    'press flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium',
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

        {showProfile && (
          <Sheet title="Settings" onClose={() => setShowProfile(false)}>
            <CardInSheetProvider value={true}>
              {/* Above the account card, because that card ends in Sign out and nothing
                  should sit under the way out. Everything about the house itself — aisles,
                  places, who is here — is a page rather than a sheet: there is a lot of it. */}
              <NavLink
                to="/household"
                onClick={() => setShowProfile(false)}
                className="press mb-3 flex min-h-touch items-center justify-between gap-3 rounded-xl
                           bg-elevated px-4 py-3 text-ink"
              >
                <span className="font-medium">Household settings</span>
                <ChevronRightIcon className="h-5 w-5 shrink-0 text-subtle" />
              </NavLink>
              <ProfileCard />
            </CardInSheetProvider>
          </Sheet>
        )}

        <CredentialsPrompt />

        {/* Bottom padding clears the tab bar plus the home indicator. */}
        <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-1 md:pb-10">
          {/* Taken out of the house they were in, and moved to another of theirs: said once, so
              the switch does not look like the app losing its place. With no house left, the
              pages' own empty state says it instead. */}
          {lostHousehold && activeName && (
            <div role="status" className="mb-3 flex items-start gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
              <p className="flex-1 font-medium">
                You're no longer in “{lostHousehold}”, so you're looking at “{activeName}”.
              </p>
              <button type="button" onClick={dismissLostHousehold} className="-my-1 font-semibold">
                OK
              </button>
            </div>
          )}
          {children}
        </main>

        <nav className="material-bar edge-top fixed inset-x-0 bottom-0 z-20 pb-safe md:hidden">
          <div className="mx-auto flex max-w-3xl">
            {navItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cx(
                    'press flex flex-1 flex-col items-center gap-0.5 pb-1 pt-1.5 text-[0.625rem] font-medium tracking-[0.01em]',
                    isActive ? 'text-accent' : 'text-muted',
                  )
                }
              >
                <Icon className="h-6 w-6" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </CompactTitleProvider>
  );
}
