import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../api/client';
import type { HouseholdSummary, LandingResponse, UserSummary } from '../api/types';
import { Button, ErrorText, Field, Input } from '../components/ui';
import Keypad, { PinDots } from '../components/Keypad';
import { PIN_LENGTH } from '../auth/pin';

type Step = 'household' | 'user' | 'username' | 'setup-form' | 'pin' | 'pin-confirm';

/** What finishing the keypad actually does. 'claim' is a first-ever sign-in choosing a PIN. */
type Mode = 'login' | 'claim' | 'setup';

export default function LoginPage() {
  const { login, setInitialPin, setup } = useAuth();

  const [landing, setLanding] = useState<LandingResponse | null>(null);
  const [step, setStep] = useState<Step>('household');
  const [mode, setMode] = useState<Mode>('login');

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

  useEffect(() => {
    api<LandingResponse>('GET', '/api/auth/landing')
      .then((data) => {
        setLanding(data);
        // An empty install has nothing to tap, so go straight to making the first account.
        if (data.needsSetup) {
          setMode('setup');
          setStep('setup-form');
        }
      })
      .catch(() => setLanding({ needsSetup: false, households: [] }));
  }, []);

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
      mode === 'login'
        ? login(username, pin)
        : mode === 'claim'
          ? setInitialPin(username, pin)
          : setup({ householdName, username, pin });

    request
      .catch((err) => {
        if (mode !== 'login') {
          setFirstPin('');
          setStep('pin');
        }
        reject(describeError(err));
      })
      .finally(() => {
        submitting.current = false;
        setBusy(false);
      });
  }, [pin, step, mode, username, householdName, firstPin, shake, login, setInitialPin, setup]);

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
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function onSetupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!householdName.trim() || !username.trim()) return;
    setHouseholdName(householdName.trim());
    setUsername(username.trim());
    setLabel(username.trim());
    setMode('setup');
    setPin('');
    setFirstPin('');
    setError(null);
    setStep('pin');
  }

  function back() {
    setPin('');
    setFirstPin('');
    setError(null);
    setShake(false);

    if (step === 'pin' || step === 'pin-confirm') {
      if (mode === 'setup') setStep('setup-form');
      else if (household) setStep('user');
      else setStep('username');
      return;
    }
    setUsername('');
    setHousehold(null);
    setMode('login');
    setStep('household');
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10 pb-safe pt-safe">
      <div className="w-full max-w-xs">
        <h1 className="mb-1 text-center text-3xl font-semibold tracking-tight">Meal Planner</h1>
        <p className="mb-7 text-center text-sm text-muted">Who’s cooking?</p>

        {landing === null && <p className="text-center text-sm text-muted">Loading…</p>}

        {landing !== null && step === 'household' && (
          <HouseholdStep
            households={landing.households}
            onPick={openHousehold}
            onUseUsername={() => {
              setUsername('');
              setError(null);
              setStep('username');
            }}
            error={error}
          />
        )}

        {step === 'user' && (
          <UserStep household={household} users={users} onPick={chooseUser} onBack={back} error={error} />
        )}

        {step === 'username' && (
          <form onSubmit={onUsernameSubmit} className="space-y-3">
            <p className="text-center text-sm text-muted">What's your username?</p>
            <Input
              autoFocus
              required
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="text-center"
            />
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" disabled={busy} full size="lg">
              Continue
            </Button>
            <TextLink onClick={back}>Back</TextLink>
          </form>
        )}

        {step === 'setup-form' && (
          <form onSubmit={onSetupSubmit} className="space-y-3">
            <p className="text-center text-sm text-muted">
              Nobody's here yet. Make the first household and your own account.
            </p>
            <Field label="Household name">
              <Input
                autoFocus
                required
                placeholder="Gehan House"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
              />
            </Field>
            <Field label="Your name">
              <Input
                required
                placeholder="ryan"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" full size="lg">
              Continue
            </Button>
          </form>
        )}

        {(step === 'pin' || step === 'pin-confirm') && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <p className="text-lg font-semibold">{pinTitle(mode, step, label)}</p>
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
      </div>
    </div>
  );
}

function HouseholdStep({
  households,
  onPick,
  onUseUsername,
  error,
}: {
  households: HouseholdSummary[];
  onPick: (h: HouseholdSummary) => void;
  onUseUsername: () => void;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted">
        {households.length ? 'Which house?' : 'No households yet.'}
      </p>

      <div className="space-y-2">
        {households.map((h) => (
          <Tile key={h.id} onClick={() => onPick(h)} initial={h.name} title={h.name}>
            <span className="text-sm text-muted">
              {h.memberCount} {h.memberCount === 1 ? 'person' : 'people'}
            </span>
          </Tile>
        ))}
      </div>

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
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <p className="text-lg font-semibold">{household?.name}</p>
        <p className="text-sm text-slate-500">Tap your name</p>
      </div>

      {users === null ? (
        <p className="text-center text-sm text-muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-center text-sm text-muted">Nobody's in this household yet.</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Tile key={u.username} onClick={() => onPick(u)} initial={u.displayName} title={u.displayName}>
              {!u.pinSet && <span className="text-sm text-muted">Set up a PIN</span>}
            </Tile>
          ))}
        </div>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <TextLink onClick={onBack}>Back</TextLink>
    </div>
  );
}

function Tile({
  onClick,
  initial,
  title,
  children,
}: {
  onClick: () => void;
  initial: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5
                 text-left transition-colors active:bg-accent-soft"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft
                   text-lg font-semibold text-accent"
      >
        {initial.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {children}
      </span>
    </button>
  );
}

function pinTitle(mode: Mode, step: Step, label: string): string {
  if (mode === 'login') return label;
  if (step === 'pin-confirm') return 'Enter it again';
  return mode === 'setup' ? 'Choose a PIN' : `Welcome, ${label}`;
}

function pinSubtitle(mode: Mode, step: Step): string {
  if (mode === 'login') return 'Enter your PIN';
  if (step === 'pin-confirm') return 'Just to be sure';
  return mode === 'setup' ? `${PIN_LENGTH} digits, that's it` : `Pick a ${PIN_LENGTH}-digit PIN to use from now on`;
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block min-h-touch w-full text-sm font-medium text-muted">
      {children}
    </button>
  );
}

function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Cannot reach the server.';
  const body = err.body as { message?: string } | null;
  if (err.status === 401) return 'That PIN is not right.';
  if (err.status === 404) return 'No account with that name.';
  return body?.message ?? 'Something went wrong.';
}
