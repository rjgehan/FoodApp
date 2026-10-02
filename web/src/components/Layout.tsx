import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Me } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useHousehold } from '../household/HouseholdContext';
import { Alert, Avatar, Button, CardInSheetProvider, CheckCircle, cx, IconButton, List, Pill, Row, Sheet, Tile, type Tone } from './ui';
import ProfileCard from './ProfileCard';
import { useThemeSync, useTheme } from '../theme/sync';
import { themeSummary } from '../theme/theme';
import CredentialsPrompt from './CredentialsPrompt';
import StartCupboardSheet from './StartCupboardSheet';
import { RestockPrompt } from './Restock';
import { CompactTitleProvider } from './PageTitle';
import { Icon, type IconName } from './icons';
import { Toaster } from './toast';
import type { ThemeScreenState } from '../pages/ThemePage';
import { JoinHouseholdSheet } from './household/JoinHousehold';
import type { HouseholdScreenState } from './household/HouseholdParts';

/*
 Named for what is behind each tab. Five, the most a phone tab bar should hold.

 Household used to have the last one and does not any more: it is where you go once, to set
 the place up, and it was spending a fifth of the app's navigation on that. It lives behind
 your own face in the corner now, with the rest of the settings.
*/
const navItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/meal-plan', label: 'Plan', icon: 'calendar' },
  { to: '/recipes', label: 'Recipes', icon: 'book' },
  { to: '/grocery-list', label: 'Groceries', icon: 'cart' },
  { to: '/cupboard', label: 'Cupboard', icon: 'cupboard' },
  { to: '/explore', label: 'Explore', icon: 'compass' },
];

/** Each household's colour in the pill and the switcher: the same house, the same colour. */
const HOUSE_TONES: Tone[] = ['herb', 'sky', 'plum', 'mustard', 'accent'];
const houseTone = (index: number) => HOUSE_TONES[Math.max(0, index) % HOUSE_TONES.length];

/**
 * A pushed screen — one with its own NavBar and a way back, like Theme — hides the phone's top
 * bar while it is up, as iOS does. Wide screens keep the header: it holds the tabs there.
 */
const PushedScreen = createContext<(pushed: boolean) => void>(() => {});

export function usePushedScreen() {
  const set = useContext(PushedScreen);
  useEffect(() => {
    set(true);
    return () => set(false);
  }, [set]);
}

/**
 * A screen you finish or back out of — Share, New recipe and its ways in, Edit — hides the phone's
 * tab bar too, as the mockup draws them (3.12–3.16, 3.20): only the home indicator below, and the
 * long forms' last buttons are not under the tabs.
 */
const TablessScreen = createContext<(tabless: boolean) => void>(() => {});

export function useTablessScreen() {
  usePushedScreen();
  const set = useContext(TablessScreen);
  useEffect(() => {
    set(true);
    return () => set(false);
  }, [set]);
}

/**
 * The app's frame. On a phone: the mockup's top bar (household pill on the left; ideas and your
 * initial on the right) over the page, and the tab bar pinned to the bottom. On a wide screen the
 * tabs move up into the header and the page gets more room.
 *
 * The bars float over content that scrolls underneath them. At the top of a page the top bar is
 * simply the page; once something scrolls under it, it turns to frosted paper with a hairline
 * edge, and the page's title shrinks into the middle of it.
 */
export default function Layout({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const closeSettings = () => {
    setShowSettings(false);
    setShowAccount(false);
  };
  const [joining, setJoining] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [tabless, setTabless] = useState(false);
  const {
    households,
    activeHouseholdId,
    activeHousehold,
    setActiveHouseholdId,
    lostHousehold,
    dismissLostHousehold,
    starterCupboardFor,
    dismissStarterCupboard,
  } = useHousehold();
  const activeName = households.find((h) => h.id === activeHouseholdId)?.name;
  const activeIndex = households.findIndex((h) => h.id === activeHouseholdId);
  const [compactTitle, setCompactTitle] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const isAdmin = me?.admin === true;
  const ideasBoard = me?.ideasBoard === true;
  const meChecked = useRef<string | null>(null);
  // The admin pages are tables that want the width of a computer screen, and the bar widens
  // with them so its tabs still line up with the page.
  const wide = location.pathname.startsWith('/admin');
  useThemeSync(session?.userId);

  // Only the way in to the admin pages hangs on this; the server decides who gets through them.
  // Asked again each time Settings opens: adding the admin's email, or renaming yourself, is
  // done from in there and changes the answer without changing who is signed in. The same
  // answer says whether the beta's ideas board is open, which decides the lightbulb.
  //
  // Counted as checked only once an answer lands: marked at the start, a first ask that was
  // called off (React runs effects twice in development) left nothing asking again, and the
  // lightbulb never appeared until Settings was opened.
  useEffect(() => {
    if (!session) return;
    if (showSettings === false && meChecked.current === session.userId) return;
    let cancelled = false;
    api<Me>('GET', '/api/users/me')
      .then((answer) => {
        if (cancelled) return;
        meChecked.current = session.userId;
        setMe(answer);
      })
      .catch(() => {
        // Offline: no Admin row this time, which is the safe way to be wrong.
      });
    return () => {
      cancelled = true;
    };
  }, [session?.userId, showSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Coming back from the Theme screen: Settings is where it was opened from, so open it again.
  useEffect(() => {
    const state = location.state as { openSettings?: boolean } | null;
    if (state?.openSettings) {
      setShowSettings(true);
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [location, navigate]);

  const container = cx('mx-auto w-full', wide ? 'max-w-6xl' : 'max-w-3xl lg:max-w-5xl');

  const householdPill = (
    <button
      type="button"
      onClick={() => setShowSwitcher(true)}
      aria-label={`Household: ${activeName ?? 'none'}. Switch household`}
      className="press flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full bg-surface2 py-1 pl-[5px] pr-2.5"
    >
      <Avatar name={activeName ?? 'M'} tone={houseTone(activeIndex)} size={22} />
      <span data-household-name className="min-w-0 truncate text-[0.8125rem] font-semibold">
        {activeName ?? 'Meal Planner'}
      </span>
      <Icon name="chevD" size={14} className="shrink-0 text-muted" />
    </button>
  );

  const rightButtons = (
    <div className="ml-auto flex shrink-0 items-center gap-2.5">
      {/* The beta's ideas board, on every screen. */}
      {ideasBoard && (
        <NavLink
          to="/ideas"
          aria-label="Ideas (beta)"
          title="Ideas (beta)"
          className={({ isActive }) =>
            cx(
              'press relative flex h-9 w-9 items-center justify-center rounded-full border',
              'after:absolute after:-inset-1 after:content-[""]',
              isActive ? 'border-accent-soft bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink',
            )
          }
        >
          <Icon name="bulb" size={17} />
        </NavLink>
      )}
      {/* Who is signed in, and the way to Settings. */}
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        aria-label="Your account"
        className="press relative flex items-center gap-2 rounded-full after:absolute after:-inset-1 after:content-['']"
      >
        <span className="hidden text-sm text-muted lg:inline">{session?.displayName}</span>
        <Avatar name={session?.displayName} size={36} />
      </button>
    </div>
  );

  return (
    <PushedScreen.Provider value={setPushed}>
      <TablessScreen.Provider value={setTabless}>
      <CompactTitleProvider value={setCompactTitle}>
        <div className="min-h-screen">
          <header
            className={cx(
              'sticky top-0 z-20 pt-safe transition-[background-color,box-shadow] duration-200',
              scrolled ? 'material-bar edge-bottom' : 'bg-bg',
              pushed && 'max-md:hidden',
            )}
          >
            <div className={cx(container, 'relative flex h-14 items-center gap-3 px-5 md:h-16')}>
              {/* Makes way for the page title once it has shrunk into the bar (phones only). */}
              <div
                className={cx(
                  'min-w-0 shrink transition-opacity duration-200 md:w-56 md:shrink-0',
                  compactTitle && 'max-md:pointer-events-none max-md:opacity-0',
                )}
              >
                {householdPill}
              </div>

              <span
                aria-hidden="true"
                className={cx(
                  'pointer-events-none absolute inset-x-24 truncate text-center text-[1.0625rem] font-semibold md:hidden',
                  'transition-[opacity,transform] duration-200',
                  compactTitle ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
                )}
              >
                {compactTitle}
              </span>

              {/* Wide screens: the tabs live up here, in the middle of the bar. */}
              <nav aria-label="Tabs" className="hidden flex-1 items-center justify-center gap-1 md:flex">
                {navItems.map(({ to, label, icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      cx(
                        'press flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.9375rem] font-medium lg:px-4',
                        isActive ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-muted hover:bg-surface2 hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon name={icon} size={19} strokeWidth={isActive ? 2.2 : 1.8} className="max-lg:hidden" />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>

              <div className="ml-auto flex shrink-0 justify-end md:ml-0 md:w-56">{rightButtons}</div>
            </div>
          </header>

          {/* Password & sign-in opens inside this same sheet, with "‹ Settings" to come back,
              rather than as a second sheet stacked on it (two handles, a doubled scrim). */}
          {showSettings && (
            <Sheet
              label={showAccount ? 'Password & sign-in' : 'Settings'}
              title={session?.displayName ?? 'Settings'}
              subtitle={[me?.email, activeHousehold?.role === 'OWNER' ? 'Owner' : activeHousehold ? 'Member' : null]
                .filter(Boolean)
                .join(' · ')}
              lead={<Avatar name={session?.displayName} size={56} />}
              head={
                showAccount ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowAccount(false)}
                        className="press -ml-1.5 flex h-9 items-center gap-0.5 text-[1.0625rem] text-accent-ink"
                      >
                        <Icon name="chevL" size={24} />
                        <span>Settings</span>
                      </button>
                      <IconButton label="Close" shape="plain" onClick={closeSettings} className="!h-8 !w-8 shrink-0 text-ink">
                        <Icon name="x" size={16} strokeWidth={2.4} />
                      </IconButton>
                    </div>
                    <h2 className="title-sheet mt-1">Password &amp; sign-in</h2>
                  </div>
                ) : undefined
              }
              onClose={closeSettings}
            >
              {showAccount ? (
                <CardInSheetProvider value={true}>
                  <ProfileCard showSignOut={false} />
                </CardInSheetProvider>
              ) : (
              <div className="space-y-4">
                <List label="Your household">
                  {/* Everything about the house itself — aisles, places, who is here — is a page
                      rather than a sheet: there is a lot of it. */}
                  <Row
                    onClick={() => {
                      setShowSettings(false);
                      navigate('/household', { state: { from: location.pathname + location.search } satisfies HouseholdScreenState });
                    }}
                    lead={<Tile icon="home" tone="herb" size={34} />}
                    title="Household settings"
                    subtitle={activeName}
                    chevron
                  />
                  {households.length > 1 && (
                    <Row
                      onClick={() => {
                        setShowSettings(false);
                        setShowSwitcher(true);
                      }}
                      lead={<Tile icon="swap" tone="sky" size={34} />}
                      title="Switch household"
                      subtitle={`${households.length} households`}
                      chevron
                    />
                  )}
                  {ideasBoard && (
                    <Row
                      to="/ideas"
                      onClick={() => setShowSettings(false)}
                      lead={<Tile icon="bulb" tone="mustard" size={34} />}
                      title="Ideas board"
                      end={<Pill tone="mustard">Beta</Pill>}
                      chevron
                    />
                  )}
                  {isAdmin && (
                    <Row
                      to="/admin"
                      onClick={() => setShowSettings(false)}
                      lead={<Tile icon="shield" tone="plum" size={34} />}
                      title="Admin"
                      subtitle="Every household, person and recipe"
                      chevron
                    />
                  )}
                </List>

                <List label="You">
                  <Row
                    onClick={() => {
                      setShowSettings(false);
                      navigate('/settings/theme', { state: { from: location.pathname + location.search } satisfies ThemeScreenState });
                    }}
                    lead={<Tile icon="palette" tone="plum" size={34} />}
                    title="Theme"
                    detail={themeSummary(theme)}
                    chevron
                  />
                  <Row
                    onClick={() => setShowAccount(true)}
                    lead={<Tile icon="key" tone="accent" size={34} />}
                    title="Password & sign-in"
                    chevron
                  />
                </List>

                <List>
                  <Row onClick={logout} lead={<Tile icon="logout" tone="accent" size={34} />} title="Sign out" tone="danger" />
                </List>
              </div>
              )}
            </Sheet>
          )}

          {showSwitcher && (
            <Sheet title={households.length > 1 ? 'Switch household' : 'Your household'} onClose={() => setShowSwitcher(false)}>
              <div className="space-y-4">
                <List label="Households">
                  {households.map((h, i) => (
                    <Row
                      key={h.id}
                      role="radio"
                      aria-checked={h.id === activeHouseholdId}
                      onClick={() => {
                        setActiveHouseholdId(h.id);
                        setShowSwitcher(false);
                      }}
                      lead={<Avatar name={h.name} tone={houseTone(i)} size={44} />}
                      title={h.name}
                      subtitle={`${h.memberCount} ${h.memberCount === 1 ? 'person' : 'people'}${h.role === 'OWNER' ? ' · owner' : ''}`}
                      end={<CheckCircle checked={h.id === activeHouseholdId} />}
                    />
                  ))}
                </List>
                {/* Somebody else's house: paste or scan the link they sent. */}
                <Button
                  variant="secondary"
                  size="lg"
                  full
                  icon="link"
                  onClick={() => {
                    setShowSwitcher(false);
                    setJoining(true);
                  }}
                >
                  Join with an invite link
                </Button>
              </div>
            </Sheet>
          )}

          {joining && <JoinHouseholdSheet onClose={() => setJoining(false)} />}

          <CredentialsPrompt />
          {/* "Time to restock?" — here so it asks whichever page the app opens on. */}
          <RestockPrompt />

          {/* A household made a moment ago, wherever it was made: fill its cupboard before anything
              else. Here rather than on the page that made it, because the first-run setup has no
              page to come back to. */}
          {starterCupboardFor && households.some((h) => h.id === starterCupboardFor) && (
            <StartCupboardSheet householdId={starterCupboardFor} first onClose={dismissStarterCupboard} />
          )}

          {/* Taken out of the house they were in, and moved to another of theirs: said once, so
              the switch does not look like the app losing its place. With no house left, the
              pages' own empty state says it instead. */}
          {lostHousehold && activeName && (
            <Alert
              centered
              icon="door"
              tone="plum"
              title={`You've been removed from ${lostHousehold}`}
              onDismiss={dismissLostHousehold}
              actions={
                <Button className="h-[2.875rem]" full onClick={dismissLostHousehold}>
                  OK
                </Button>
              }
            >
              We've moved you to <b className="font-semibold text-ink">{activeName}</b>, another of your households.
            </Alert>
          )}

          {/* Bottom padding clears the tab bar plus the home indicator. */}
          <main
            className={cx(
              container,
              'px-5 pt-1 md:px-8 md:pb-12 md:pt-4',
              tabless ? 'pb-[max(env(safe-area-inset-bottom),1.5rem)]' : 'pb-32',
            )}
          >
            {children}
          </main>

          <Toaster />

          {/* The tab bar (phones): 84px with the home indicator, tomato for the tab you're on. */}
          <nav
            aria-label="Tabs"
            className={cx('tab-bar fixed inset-x-0 bottom-0 z-20 border-t border-line pb-safe md:hidden', tabless && 'hidden')}
          >
            <div className="mx-auto flex max-w-xl justify-around px-1.5 pb-2 pt-2">
              {navItems.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cx(
                      'press flex w-[4.5rem] flex-col items-center gap-[3px] text-[0.65625rem]',
                      isActive ? 'font-semibold text-accent-ink' : 'font-medium text-muted',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon name={icon} size={24} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? undefined : 'text-faint'} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </CompactTitleProvider>
      </TablessScreen.Provider>
    </PushedScreen.Provider>
  );
}
