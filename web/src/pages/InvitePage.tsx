import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AuthResponse, Household, InviteInfo, InviteStanding, LandingResponse } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_RULE } from '../auth/password';
import { useHousehold } from '../household/HouseholdContext';
import { Button, Card, ErrorText, Field, Input, usernameInputProps } from '../components/ui';
import LoginPage from './LoginPage';

/**
 * Remembers, across signing in, that the person came here to join this house. Set when they
 * choose "I already have an account"; the signed-in page finds it and joins without asking a
 * second time. sessionStorage, so an abandoned sign-in does not join anybody days later.
 */
const JOIN_AFTER_SIGN_IN = 'mp_joinInvite';

function pendingJoin(): string | null {
  try {
    return sessionStorage.getItem(JOIN_AFTER_SIGN_IN);
  } catch {
    return null;
  }
}

function setPendingJoin(token: string | null) {
  try {
    if (token) sessionStorage.setItem(JOIN_AFTER_SIGN_IN, token);
    else sessionStorage.removeItem(JOIN_AFTER_SIGN_IN);
  } catch {
    // Storage blocked: they are simply asked to press Join once signed in.
  }
}

/**
 * Where an invite link lands — /invite/<token>, sent as a message or scanned off somebody's
 * screen. Works signed out, when it is also where a new person makes their account, and signed
 * in, when it is one button. Either way nobody is in a household until they have said so here.
 */
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { session } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setUnreachable(false);
    setInfo(null);
    // Only the server saying so makes a link dead. A phone on a bad connection is told that
    // instead — or they would ask for a new link, and the owner would break the one everyone has.
    api<InviteInfo>('GET', `/api/public/invites/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch(() => setUnreachable(true));
  }, [token]);

  useEffect(load, [load]);

  if (!token) return null;
  if (unreachable) return <Unreachable signedIn={Boolean(session)} onRetry={load} />;
  return session ? <SignedIn token={token} info={info} /> : <SignedOut token={token} info={info} />;
}

function Unreachable({ signedIn, onRetry }: { signedIn: boolean; onRetry: () => void }) {
  const body = (
    <div className="space-y-4 text-center">
      <p className="text-lg font-semibold">Couldn't reach Meal Planner</p>
      <p className="text-sm text-muted">Check your connection, then try again. The invite link itself is fine.</p>
      <Button full onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
  return signedIn ? (
    <Card>
      <div className="mx-auto max-w-sm py-6">{body}</div>
    </Card>
  ) : (
    <div className="flex min-h-screen items-center justify-center px-5 py-10 pb-safe pt-safe">
      <div className="w-full max-w-xs space-y-6">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Meal Planner</h1>
        {body}
      </div>
    </div>
  );
}

/** Who is asking, in one line: "Maya invited you · 3 people". */
function Invitation({ info }: { info: InviteInfo }) {
  const people = info.memberCount ?? 0;
  return (
    <div className="space-y-1 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-muted">You're invited</p>
      <h2 className="text-2xl font-semibold tracking-tight">Join {info.householdName}</h2>
      <p className="text-[0.9375rem] text-muted">
        {info.invitedByName ? `${info.invitedByName} invited you` : 'Someone there invited you'}
        {people > 0 && ` · ${people} ${people === 1 ? 'person' : 'people'}`}
      </p>
    </div>
  );
}

function DeadLink({ action, onAction }: { action: string; onAction: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <p className="text-lg font-semibold">This invite doesn't work any more</p>
      <p className="text-sm text-muted">
        Invite links last a week, and the household's owner can swap one for a new one. Ask
        whoever sent it for a fresh link.
      </p>
      <Button variant="secondary" full onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

/**
 * Signed in: one button, or none at all if they came here through "I already have an account".
 * Somebody already in the house — checking the link they just sent, or scanning their own code —
 * is told so, and offered the house instead of an invitation into it.
 */
function SignedIn({ token, info }: { token: string; info: InviteInfo | null }) {
  const { refresh, setActiveHouseholdId } = useHousehold();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standing, setStanding] = useState<InviteStanding | null>(null);
  const autoJoined = useRef(false);

  useEffect(() => {
    if (!info?.valid) return;
    api<InviteStanding>('GET', `/api/invites/${encodeURIComponent(token)}`)
      .then(setStanding)
      // Not knowing is no reason to hold them up: Join is harmless for somebody already in.
      .catch(() => setStanding({ alreadyMember: false, householdId: null }));
  }, [info, token]);

  function openHouse(id: string) {
    setPendingJoin(null);
    setActiveHouseholdId(id);
    navigate('/meal-plan', { replace: true });
  }

  async function join() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPendingJoin(null);
    try {
      const joined = await api<Household>('POST', `/api/invites/${encodeURIComponent(token)}/accept`);
      await refresh();
      setActiveHouseholdId(joined.id);
      navigate('/meal-plan', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
      setBusy(false);
    }
  }

  // They said yes on the signed-out page and then signed in: that yes still stands — unless it
  // turns out they were in the house all along, when there is nothing to join.
  useEffect(() => {
    if (info?.valid && standing && pendingJoin() === token && !autoJoined.current) {
      autoJoined.current = true;
      if (standing.alreadyMember && standing.householdId) openHouse(standing.householdId);
      else join();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, standing, token]);

  return (
    <Card>
      <div className="mx-auto max-w-sm space-y-6 py-6">
        {(info === null || (info.valid && standing === null)) && (
          <p className="text-center text-sm text-muted">Loading…</p>
        )}
        {info && !info.valid && (
          <DeadLink action="Open Meal Planner" onAction={() => navigate('/meal-plan', { replace: true })} />
        )}
        {info?.valid && standing?.alreadyMember && standing.householdId && (
          <div className="space-y-4 text-center">
            <p className="text-lg font-semibold">You're already in {info.householdName}</p>
            <p className="text-sm text-muted">
              This is its invite link — it works. Send it to whoever you want to join.
            </p>
            <Button full size="lg" onClick={() => openHouse(standing.householdId!)}>
              Open {info.householdName}
            </Button>
          </div>
        )}
        {info?.valid && standing && !standing.alreadyMember && (
          <>
            <Invitation info={info} />
            <p className="text-center text-sm text-muted">
              You'll see its plan, recipes and grocery list alongside your other households, and
              can switch between them at the top of the screen.
            </p>
            {error && <ErrorText>{error}</ErrorText>}
            <div className="space-y-2">
              <Button full size="lg" disabled={busy} onClick={join}>
                {busy ? 'Joining…' : `Join ${info.householdName}`}
              </Button>
              <Button variant="ghost" full disabled={busy} onClick={() => navigate('/meal-plan', { replace: true })}>
                Not now
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

type Mode = 'create' | 'sign-in' | 'pin';

/**
 * Signed out: make an account here — which joins the house in the same step — or sign in to one
 * you already have and join as you arrive.
 */
function SignedOut({ token, info }: { token: string; info: InviteInfo | null }) {
  const { signInWith, loginWithEmail } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('create');
  const [legacyPinLogin, setLegacyPinLogin] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<LandingResponse>('GET', '/api/auth/landing')
      .then((landing) => setLegacyPinLogin(landing.legacyPinLogin !== false))
      .catch(() => setLegacyPinLogin(false));
  }, []);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !email.trim()) {
      setError('Add your name and email.');
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Passwords need at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const auth = await api<AuthResponse>('POST', '/api/auth/signup', {
        inviteToken: token,
        displayName: name.trim(),
        email: email.trim(),
        password,
      });
      setPendingJoin(null);
      // Already in the house, and it is the one the sign-in opens.
      signInWith(auth);
      navigate('/meal-plan', { replace: true });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 409) {
        // The address has an account: this is somebody who forgot they had one.
        switchTo('sign-in');
        setNotice('That email already has an account. Sign in, and you will join straight away.');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
    }
  }

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    setPendingJoin(token);
    try {
      // Signing in swaps this page for its signed-in self, which finds the pending join.
      await loginWithEmail(email.trim(), password);
    } catch (err) {
      setPendingJoin(null);
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Incorrect email or password.'
          : err instanceof ApiError
            ? err.message
            : 'Cannot reach the server.',
      );
      setBusy(false);
    }
  }

  // The older way in, whole — it has several steps of its own — with the join waiting at the end.
  if (mode === 'pin' && info?.valid) {
    return (
      <LoginPage
        startWithPin
        notice={`Sign in to join ${info.householdName}`}
        exit={{
          label: 'Back to the invite',
          onBack: () => {
            setPendingJoin(null);
            switchTo('sign-in');
          },
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10 pb-safe pt-safe">
      <div className="w-full max-w-xs space-y-6">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Meal Planner</h1>

        {info === null && <p className="text-center text-sm text-muted">Loading…</p>}
        {info && !info.valid && <DeadLink action="Go to sign in" onAction={() => navigate('/', { replace: true })} />}

        {info?.valid && (
          <>
            <Invitation info={info} />

            {mode === 'create' && (
              <form onSubmit={onCreate} className="space-y-3">
                <p className="text-center text-sm text-muted">Make your account — it takes a moment.</p>
                <Field label="Your name">
                  <Input
                    aria-label="Your name"
                    required
                    autoComplete="name"
                    maxLength={50}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError(null);
                    }}
                  />
                </Field>
                <Field label="Email" hint="What you'll sign in with.">
                  <Input
                    aria-label="Email"
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
                </Field>
                <Field label="Password" hint={PASSWORD_RULE}>
                  <Input
                    aria-label="Password"
                    required
                    type="password"
                    autoComplete="new-password"
                    maxLength={PASSWORD_MAX}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                  />
                </Field>
                <Field label="Confirm password">
                  <Input
                    aria-label="Confirm password"
                    required
                    type="password"
                    autoComplete="new-password"
                    maxLength={PASSWORD_MAX}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setError(null);
                    }}
                  />
                </Field>
                {error && <ErrorText>{error}</ErrorText>}
                <Button type="submit" full size="lg" disabled={busy}>
                  {busy ? 'Joining…' : 'Create an account and join'}
                </Button>
                <TextLink onClick={() => switchTo('sign-in')}>I already have an account</TextLink>
              </form>
            )}

            {mode === 'sign-in' && (
              <form onSubmit={onSignIn} className="space-y-3">
                {notice ? (
                  <p className="rounded-xl bg-accent-soft px-4 py-3 text-center text-sm font-medium text-accent">
                    {notice}
                  </p>
                ) : (
                  <p className="text-center text-sm text-muted">Sign in, and you'll join straight away.</p>
                )}
                <Field label="Email">
                  <Input
                    aria-label="Email"
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
                </Field>
                <Field label="Password">
                  <Input
                    aria-label="Password"
                    required
                    autoFocus={Boolean(notice)}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                  />
                </Field>
                {error && <ErrorText>{error}</ErrorText>}
                <Button type="submit" full size="lg" disabled={busy || !email.trim() || !password}>
                  {busy ? 'Signing in…' : 'Sign in and join'}
                </Button>
                <TextLink
                  onClick={() => {
                    setNotice(null);
                    switchTo('create');
                  }}
                >
                  I'm new — create an account
                </TextLink>
                {legacyPinLogin && (
                  <TextLink
                    onClick={() => {
                      setPendingJoin(token);
                      switchTo('pin');
                    }}
                  >
                    Sign in with your name and PIN
                  </TextLink>
                )}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TextLink({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block min-h-touch w-full text-sm font-medium text-muted">
      {children}
    </button>
  );
}
