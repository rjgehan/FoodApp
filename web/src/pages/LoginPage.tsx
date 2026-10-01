import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import type { HouseholdSummary, LandingResponse, UserSummary } from '../api/types';
import { Avatar, Button, ErrorText, List, NoteBox, Row, usernameInputProps } from '../components/ui';
import { AppMark, IconField, PasswordField, WelcomePage } from '../components/welcome';
import Keypad, { PinDots } from '../components/Keypad';
import { PIN_LENGTH } from '../auth/pin';
import { PASSWORD_MIN, PASSWORD_RULE } from '../auth/password';

/*
 * Email and password first. The name-and-PIN screens are the older way in, kept behind a link
 * while everyone adds an email, and gone entirely once the server turns them off.
 */
type Step = 'email' | 'household' | 'user' | 'username' | 'setup-form' | 'pin' | 'pin-confirm';

/** What finishing the keypad actually does. 'claim' is a first-ever sign-in choosing a PIN. */
type Mode = 'login' | 'claim';

export default function LoginPage({
  startWithPin = false,
  notice,
  exit,
  leave,
}: {
  /** Straight to the name-and-PIN screens — an invite page's "Sign in with your name and PIN". */
  startWithPin?: boolean;
  /** Said above everything else: "Sign in to join Gehan House". */
  notice?: ReactNode;
  /**
   * Where back from the first PIN screen goes, when that is not this page's own email sign-in —
   * an invite page, whose other ways in are what somebody who tapped the wrong one wants.
   */
  exit?: { label: string; onBack: () => void };
  /**
   * A way back out from the email screen, for a page that asked somebody to sign in on the way
   * to something — a shared recipe's "Save to my recipes" — rather than to open the app.
   */
  leave?: { label: string; onLeave: () => void };
} = {}) {
  const { login, loginWithEmail, setInitialPin, setup, expired } = useAuth();

  const [landing, setLanding] = useState<LandingResponse | null>(null);
  const [step, setStep] = useState<Step>(startWithPin ? 'household' : 'email');
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [household, setHousehold] = useState<HouseholdSummary | null>(null);
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [username, setUsername] = useState('');
  const [label, setLabel] = useState('');
  const [householdName, setHouseholdName] = useState('');

  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  /** When the server's lockout on this address ends (epoch ms), or null when there is none. */
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const lockSeconds = useCountdown(lockedUntil);

  useEffect(() => {
    api<LandingResponse>('GET', '/api/auth/landing')
      .then((data) => {
        setLanding(data);
        // An empty install has nobody to sign in as, so go straight to making the first account.
        if (data.needsSetup) setStep('setup-form');
      })
      .catch(() => setLanding({ needsSetup: false, households: [], unassigned: [], legacyPinLogin: true }));
  }, []);

  // The lockout is per address: another address is somebody else, who may try at once.
  useEffect(() => setLockedUntil(null), [email]);

  /** Clear the entered PIN with a bit of visible feedback before the dots empty out. */
  function reject(message: string) {
    setError(message);
    setShake(true);
    window.setTimeout(() => {
      setPin('');
      setShake(false);
    }, 450);
  }

  // A PIN submits itself the moment the last digit lands — no confirm button to hunt for.
  // The ref, not `busy`, guards re-entry: setBusy re-runs this effect before the request settles.
  useEffect(() => {
    if (pin.length !== PIN_LENGTH || submitting.current || shake) return;

    // Choosing a new PIN always asks for it twice before anything is saved.
    if (mode !== 'login' && step === 'pin') {
      setFirstPin(pin);
      setPin('');
      setError(null);
      setStep('pin-confirm');
      return;
    }
    if (mode !== 'login' && pin !== firstPin) {
      setFirstPin('');
      setStep('pin');
      reject("Those PINs didn't match — pick one again.");
      return;
    }

    submitting.current = true;
    setBusy(true);
    const request =
      mode === 'login' ? login(username, pin, household?.id) : setInitialPin(username, pin, household?.id);

    request
      .catch((err) => {
        if (mode !== 'login') {
          setFirstPin('');
          setStep('pin');
        }
        reject(describeError(err, 'pin'));
      })
      .finally(() => {
        submitting.current = false;
        setBusy(false);
      });
  }, [pin, step, mode, username, household, firstPin, shake, login, setInitialPin]);

  async function onEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || busy || lockSeconds > 0) return;
    setBusy(true);
    setError(null);
    try {
      await loginWithEmail(email.trim(), password);
    } catch (err) {
      const wait = lockoutSeconds(err);
      if (wait) {
        // Too many tries: the mockup's locked state says so and counts down instead.
        setLockedUntil(Date.now() + wait * 1000);
      } else {
        setError(describeError(err, 'email'));
      }
      setBusy(false);
    }
  }

  async function openHousehold(picked: HouseholdSummary) {
    setHousehold(picked);
    setUsers(null);
    setError(null);
    setStep('user');
    try {
      setUsers(await api<UserSummary[]>('GET', `/api/auth/households/${picked.id}/users`));
    } catch {
      setUsers([]);
      setError('Could not load that household.');
    }
  }

  function chooseUser(user: UserSummary) {
    setUsername(user.username);
    setLabel(user.displayName);
    setMode(user.pinSet ? 'login' : 'claim');
    setPin('');
    setFirstPin('');
    setError(null);
    setStep('pin');
  }

  /** The escape hatch: look the name up so we know whether they still need to pick a PIN. */
  async function onUsernameSubmit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      chooseUser(await api<UserSummary>('GET', `/api/auth/users/${encodeURIComponent(name)}`));
    } catch (err) {
      setError(describeError(err, 'pin'));
    } finally {
      setBusy(false);
    }
  }

  async function onSetupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!householdName.trim() || !displayName.trim() || !email.trim() || busy) return;
    if (password.length < PASSWORD_MIN) {
      setError(PASSWORD_RULE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setup({
        householdName: householdName.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
        password,
      });
    } catch (err) {
      setError(describeError(err, 'email'));
      setBusy(false);
    }
  }

  function back() {
    setPin('');
    setFirstPin('');
    setError(null);
    setShake(false);

    if (step === 'pin' || step === 'pin-confirm') {
      if (household) setStep('user');
      else setStep('username');
      return;
    }
    if (step === 'household' && exit) {
      exit.onBack();
      return;
    }
    setUsername('');
    setHousehold(null);
    setMode('login');
    // Back from the first PIN screen is back to email and password, where everyone starts.
    setStep(step === 'household' ? 'email' : 'household');
  }

  const locked = lockSeconds > 0;
  // The mockup's welcome — the mark, the name, what it is for — heads the email screen; the PIN
  // screens and first-time setup have titles of their own.
  const brand = step === 'email' || landing === null;

  return (
    <WelcomePage className={brand ? 'pt-10 sm:pt-0' : 'pt-4 sm:pt-0'}>
      {brand ? (
        <div className="flex flex-col gap-3.5">
          <AppMark />
          <div className="flex flex-col gap-1.5">
            <h1 className="serif text-[2rem] leading-tight">Meal Planner</h1>
            <p className="text-base text-muted">Plan the week together. One list, everyone's phone.</p>
          </div>
        </div>
      ) : (
        step !== 'setup-form' && (
          <div className="mb-6 flex items-center gap-3">
            <AppMark size={40} />
            <span className="serif text-[1.375rem]">Meal Planner</span>
          </div>
        )
      )}

      {(notice || expired) && (
        <div className={brand ? 'mt-6 flex flex-col gap-2' : 'mb-5 flex flex-col gap-2'}>
          {notice && (
            <NoteBox tone="accent" icon="info">
              <span className="font-medium">{notice}</span>
            </NoteBox>
          )}
          {/* Said out loud, so being bounced here does not look like the app forgot you at random. */}
          {expired && (
            <NoteBox tone="accent" icon="lock">
              You were signed out. Sign in again to carry on.
            </NoteBox>
          )}
        </div>
      )}

      {landing === null && <p className="mt-6 text-sm text-muted">Loading…</p>}

      {landing !== null && step === 'email' && (
        <form onSubmit={onEmailSubmit} className="mt-6 flex flex-1 flex-col sm:flex-none">
          {/* The locked state: why, and for how long, before the fields it is about. */}
          {locked && (
            <div role="status" className="mb-6">
              <NoteBox tone="accent" icon="lock">
                <b className="font-semibold">Too many sign-in attempts.</b>
                <br />
                For safety, try again in {clock(lockSeconds)}.
              </NoteBox>
            </div>
          )}
          <div className="flex flex-col gap-3.5">
            <IconField
              label="Email"
              icon="mail"
              autoFocus
              required
              type="email"
              inputMode="email"
              autoComplete="username"
              {...usernameInputProps}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
            />
            <PasswordField
              label="Password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          </div>
          {error && (
            <div className="mt-3">
              <ErrorText>{error}</ErrorText>
            </div>
          )}
          <Button type="submit" disabled={busy || locked || !email.trim() || !password} full size="lg" className="mt-6">
            {locked ? `Try again in ${clock(lockSeconds)}` : busy ? 'Signing in…' : 'Sign in'}
          </Button>

          {leave && (
            <div className="mt-2">
              <TextLink onClick={leave.onLeave}>{leave.label}</TextLink>
            </div>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-10 sm:mt-0">
            {landing.legacyPinLogin !== false && (
              <TextLink
                onClick={() => {
                  setError(null);
                  setStep('household');
                }}
              >
                Sign in with your name and PIN
              </TextLink>
            )}
            {/* There is no email sending, so the way back in is a person, not a link. No open
                sign-up either: a new account starts from somebody's invite link. */}
            {!locked && (
              <p className="text-center text-[0.8125rem] leading-normal text-muted">
                Forgot your password? Ask your household owner
                <br />
                for a reset link. New here? Ask them for an invite.
              </p>
            )}
          </div>
        </form>
      )}

      {landing !== null && step === 'household' && (
        <HouseholdStep
          households={landing.households}
          unassigned={landing.unassigned}
          onPickUser={chooseUser}
          onPick={openHousehold}
          onUseUsername={() => {
            setUsername('');
            setError(null);
            setStep('username');
          }}
          onBack={back}
          backLabel={exit?.label}
          error={error}
        />
      )}

      {step === 'user' && (
        <UserStep household={household} users={users} onPick={chooseUser} onBack={back} error={error} />
      )}

      {step === 'username' && (
        <form onSubmit={onUsernameSubmit} className="flex flex-col gap-3">
          <p className="text-center text-sm text-muted">What's your username?</p>
          <IconField
            icon="user"
            aria-label="Username"
            autoFocus
            required
            placeholder="username"
            autoComplete="username"
            {...usernameInputProps}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" disabled={busy} full size="lg">
            Continue
          </Button>
          <TextLink onClick={back}>Back</TextLink>
        </form>
      )}

      {step === 'setup-form' && (
        <form onSubmit={onSetupSubmit} className="flex flex-col gap-5 pt-[22px] sm:pt-0">
          <div className="flex flex-col gap-2.5">
            <h1 className="serif text-[1.75rem] leading-[1.15]">
              Let's set up
              <br />
              your kitchen
            </h1>
            <p className="text-[0.9375rem] text-muted">You'll be the owner. Invite everyone else after.</p>
          </div>
          <section className="card flex flex-col gap-3.5 p-4" aria-label="You">
            <h2 className="group-label">You</h2>
            <IconField
              label="Your name"
              icon="user"
              autoFocus
              required
              autoComplete="name"
              placeholder="Ryan"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <IconField
              label="Email"
              icon="mail"
              required
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="you@example.com"
              {...usernameInputProps}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
            />
            <PasswordField
              label="Password"
              required
              autoComplete="new-password"
              hint={PASSWORD_RULE.replace(/\.$/, '')}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          </section>
          <section className="card flex flex-col gap-3.5 p-4" aria-label="Household">
            <h2 className="group-label">Household</h2>
            <IconField
              label="Household name"
              icon="home"
              required
              placeholder="Gehan house"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
            />
          </section>
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" disabled={busy} full size="lg" icon={busy ? undefined : 'arrowR'}>
            {busy ? 'Setting up…' : 'Create household'}
          </Button>
        </form>
      )}

      {(step === 'pin' || step === 'pin-confirm') && (
        <div className="flex flex-col gap-6">
          <div className="space-y-1 text-center">
            <p className="title-sheet">{pinTitle(mode, step, label)}</p>
            <p className="text-sm text-muted">{pinSubtitle(mode, step)}</p>
          </div>

          <PinDots length={pin.length} error={shake} />

          <div className="h-5 text-center">
            {error && <ErrorText>{error}</ErrorText>}
            {busy && !error && <p className="text-sm text-muted">Just a sec…</p>}
          </div>

          <Keypad value={pin} onChange={setPin} disabled={busy || shake} />

          <TextLink onClick={back}>Back</TextLink>
        </div>
      )}
    </WelcomePage>
  );
}

/** Seconds left until `until`, ticking down once a second; 0 once it has passed (or there is none). */
function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** 292 seconds → "4:52", the way the mockup counts down. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * How long the server says to wait, from a 429. A server that sends the exact number says so in
 * `retryAfterSeconds`; an older one only words it ("Try again in 12 min."), which is read instead.
 */
function lockoutSeconds(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.status !== 429) return null;
  const body = err.body as { retryAfterSeconds?: number; message?: string } | null;
  if (typeof body?.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0) return body.retryAfterSeconds;
  const minutes = /(\d+)\s*min/.exec(body?.message ?? '');
  return minutes ? Number(minutes[1]) * 60 : 60;
}

function HouseholdStep({
  households,
  unassigned,
  onPick,
  onPickUser,
  onUseUsername,
  onBack,
  backLabel = 'Use email and password',
  error,
}: {
  households: HouseholdSummary[];
  unassigned: UserSummary[];
  onPick: (h: HouseholdSummary) => void;
  onPickUser: (u: UserSummary) => void;
  onUseUsername: () => void;
  onBack: () => void;
  backLabel?: string;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* At the top, not after the houses: the list is every house on the server, and on a
          phone the way back should not be a scroll away. */}
      <button
        type="button"
        onClick={onBack}
        className="press -ml-1.5 -mt-3 flex h-11 items-center gap-0.5 self-start text-[1.0625rem] text-accent-ink"
      >
        <span aria-hidden="true" className="text-2xl leading-none">‹</span> {backLabel}
      </button>
      <h2 className="title-sheet">{households.length ? 'Which house?' : 'No households yet.'}</h2>

      {households.length > 0 && (
        <List>
          {households.map((h) => (
            <PersonRow
              key={h.id}
              onClick={() => onPick(h)}
              initial={h.name}
              title={h.name}
              subtitle={`${h.memberCount} ${h.memberCount === 1 ? 'person' : 'people'}`}
            />
          ))}
        </List>
      )}

      {unassigned.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          {/* Someone made an account for them before there was a house to put them in. */}
          <h3 className="group-label px-1">Not in a house yet</h3>
          <List>
            {unassigned.map((u) => (
              <PersonRow
                key={u.username}
                onClick={() => onPickUser(u)}
                initial={u.displayName}
                title={u.displayName}
                subtitle={!u.pinSet ? 'Set up a PIN' : undefined}
              />
            ))}
          </List>
        </div>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <div className="pt-2">
        <TextLink onClick={onUseUsername}>Sign in with a username instead</TextLink>
      </div>
    </div>
  );
}

function UserStep({
  household,
  users,
  onPick,
  onBack,
  error,
}: {
  household: HouseholdSummary | null;
  users: UserSummary[] | null;
  onPick: (u: UserSummary) => void;
  onBack: () => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h2 className="title-sheet">{household?.name}</h2>
        <p className="text-sm text-muted">Tap your name</p>
      </div>

      {users === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted">Nobody's in this household yet.</p>
      ) : (
        <List>
          {users.map((u) => (
            <PersonRow
              key={u.username}
              onClick={() => onPick(u)}
              initial={u.displayName}
              title={u.displayName}
              subtitle={!u.pinSet ? 'Set up a PIN' : undefined}
            />
          ))}
        </List>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <TextLink onClick={onBack}>Back</TextLink>
    </div>
  );
}

/** A house or a person to tap, on the PIN screens: their initial, the name, and a line. */
function PersonRow({
  onClick,
  initial,
  title,
  subtitle,
}: {
  onClick: () => void;
  initial: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <Row
      onClick={onClick}
      lead={<Avatar name={initial} size={40} />}
      title={title}
      subtitle={subtitle}
      chevron
      aria-label={subtitle ? `${title} ${subtitle}` : title}
    />
  );
}

function pinTitle(mode: Mode, step: Step, label: string): string {
  if (mode === 'login') return label;
  if (step === 'pin-confirm') return 'Enter it again';
  return `Welcome, ${label}`;
}

function pinSubtitle(mode: Mode, step: Step): string {
  if (mode === 'login') return 'Enter your PIN';
  if (step === 'pin-confirm') return 'Just to be sure';
  return `Pick a ${PIN_LENGTH}-digit PIN to use from now on`;
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block min-h-touch w-full text-sm font-medium text-muted">
      {children}
    </button>
  );
}

function describeError(err: unknown, via: 'email' | 'pin'): string {
  if (!(err instanceof ApiError)) return 'Cannot reach the server.';
  const body = err.body as { message?: string } | null;
  if (err.status === 401) return via === 'pin' ? 'That PIN is not right.' : 'Incorrect email or password.';
  if (err.status === 404 && via === 'pin') return 'No account with that name.';
  return body?.message ?? 'Something went wrong.';
}
