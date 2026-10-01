import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AuthResponse, Household, InviteInfo, InviteStanding, LandingResponse, Me } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PASSWORD_MAX, PASSWORD_MIN } from '../auth/password';
import { useHousehold } from '../household/HouseholdContext';
import { Avatar, Button, ErrorText, List, NoteBox, Row, Segmented, usernameInputProps } from '../components/ui';
import { Icon } from '../components/icons';
import { IconField, InviteHeader, MessageScreen, PasswordField, WelcomePage } from '../components/welcome';
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
  const navigate = useNavigate();
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

  if (unreachable) {
    return (
      <MessageScreen
        icon="wifi"
        tone="mustard"
        title="Connection problem"
        actions={
          <Button full size="lg" icon="refresh" onClick={load}>
            Retry
          </Button>
        }
      >
        Couldn't reach Meal Planner. Your link may be fine: check your connection and try again.
      </MessageScreen>
    );
  }

  if (info && !info.valid) {
    return (
      <MessageScreen
        icon="broken"
        title="This invite has expired"
        actions={
          <Button
            variant="secondary"
            full
            size="lg"
            onClick={() => navigate(session ? '/meal-plan' : '/', { replace: true })}
          >
            {session ? 'Open Meal Planner' : 'Go to sign in'}
          </Button>
        }
      >
        Invite links last a week, and the owner can make a new one, which stops the old one working.
        Ask them to send you the new one.
      </MessageScreen>
    );
  }

  return session ? <SignedIn token={token} info={info} /> : <SignedOut token={token} info={info} />;
}

/** The invite's card, from what the link says about its house. */
function Header({ info }: { info: InviteInfo }) {
  return (
    <InviteHeader
      household={info.householdName ?? 'the household'}
      invitedBy={info.invitedByName}
      memberCount={info.memberCount}
    />
  );
}

function Loading() {
  return (
    <WelcomePage className="pt-4">
      <p className="py-10 text-center text-sm text-muted">Loading…</p>
    </WelcomePage>
  );
}

/**
 * Signed in: one button, or none at all if they came here through "I already have an account".
 * Somebody already in the house — checking the link they just sent, or scanning their own code —
 * is told so, and offered the house instead of an invitation into it.
 */
function SignedIn({ token, info }: { token: string; info: InviteInfo | null }) {
  const { session, logout } = useAuth();
  const { refresh, setActiveHouseholdId } = useHousehold();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standing, setStanding] = useState<InviteStanding | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const autoJoined = useRef(false);

  useEffect(() => {
    if (!info?.valid) return;
    api<InviteStanding>('GET', `/api/invites/${encodeURIComponent(token)}`)
      .then(setStanding)
      // Not knowing is no reason to hold them up: Join is harmless for somebody already in.
      .catch(() => setStanding({ alreadyMember: false, householdId: null }));
  }, [info, token]);

  // Who they are joining as, with the address, so a shared computer does not join the wrong person.
  useEffect(() => {
    api<Me>('GET', '/api/users/me')
      .then(setMe)
      .catch(() => {
        // The name from the session is enough to go on.
      });
  }, []);

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

  if (!info || standing === null) return <Loading />;

  const name = info.householdName ?? 'the household';
  const you = me?.displayName ?? session?.displayName ?? '';

  return (
    <WelcomePage className="gap-4 pt-4">
      <Header info={info} />

      {standing.alreadyMember && standing.householdId ? (
        <>
          <div className="card flex flex-col gap-2 border-transparent bg-herb-soft p-4 text-herb">
            <div className="flex items-center gap-2">
              <Icon name="check" size={16} strokeWidth={2.6} />
              <p className="text-sm font-semibold">You're already in {name}</p>
            </div>
            <p className="text-[0.8125rem]">
              This is its invite link, and it works. Send it to whoever you want to join.
            </p>
          </div>
          <div className="mt-auto pt-6 sm:mt-2">
            <Button full size="lg" icon="home" onClick={() => openHouse(standing.householdId!)}>
              Open {name}
            </Button>
          </div>
        </>
      ) : (
        <>
          <List>
            <Row
              lead={<Avatar name={you} tone="mustard" size={36} />}
              title={`Joining as ${you}`}
              subtitle={me?.email ?? undefined}
              end={
                <button
                  type="button"
                  onClick={logout}
                  className="press shrink-0 text-[0.875rem] font-medium text-accent-ink"
                >
                  Not you?
                </button>
              }
            />
          </List>
          <p className="px-1 text-[0.8125rem] leading-normal text-muted">
            You'll see its plan, recipes and grocery list alongside your other households, and can
            switch between them at the top of the screen.
          </p>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="mt-auto flex flex-col gap-1 pt-6 sm:mt-2">
            <Button full size="lg" icon={busy ? undefined : 'users'} disabled={busy} onClick={join}>
              {busy ? 'Joining…' : `Join ${name}`}
            </Button>
            <Button variant="ghost" full disabled={busy} onClick={() => navigate('/meal-plan', { replace: true })}>
              Not now
            </Button>
          </div>
        </>
      )}
    </WelcomePage>
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

  if (!info) return <Loading />;

  // The older way in, whole — it has several steps of its own — with the join waiting at the end.
  if (mode === 'pin') {
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

  const clear = () => setError(null);

  return (
    <WelcomePage className="gap-4 pt-4">
      <Header info={info} />

      <Segmented
        label="Do you have an account?"
        value={mode}
        onChange={(next) => {
          setNotice(null);
          switchTo(next);
        }}
        options={[
          { value: 'create', label: 'New account' },
          { value: 'sign-in', label: 'I have an account' },
        ]}
      />

      {mode === 'create' && (
        <form onSubmit={onCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <IconField
              icon="user"
              aria-label="Your name"
              placeholder="Your name"
              required
              autoComplete="name"
              maxLength={50}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clear();
              }}
            />
            <IconField
              icon="mail"
              aria-label="Email"
              placeholder="Email"
              required
              type="email"
              inputMode="email"
              autoComplete="username"
              {...usernameInputProps}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clear();
              }}
            />
            <PasswordField
              aria-label="Password"
              placeholder="Password"
              required
              autoComplete="new-password"
              maxLength={PASSWORD_MAX}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clear();
              }}
            />
            <IconField
              icon="lock"
              aria-label="Confirm password"
              placeholder="Confirm password"
              required
              type="password"
              autoComplete="new-password"
              maxLength={PASSWORD_MAX}
              value={confirm}
              end={
                confirm && confirm === password ? (
                  <span className="flex h-10 w-10 items-center justify-center text-herb">
                    <Icon name="check" size={18} strokeWidth={2.6} />
                  </span>
                ) : undefined
              }
              onChange={(e) => {
                setConfirm(e.target.value);
                clear();
              }}
            />
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" full size="lg" disabled={busy}>
            {busy ? 'Joining…' : 'Create account & join'}
          </Button>
          <p className="text-center text-[0.8125rem] text-muted">
            At least {PASSWORD_MIN} characters. Your email is what you'll sign in with.
          </p>
        </form>
      )}

      {mode === 'sign-in' && (
        <form onSubmit={onSignIn} className="flex flex-col gap-4">
          {notice ? (
            <NoteBox tone="accent" icon="info">
              <span className="font-medium">{notice}</span>
            </NoteBox>
          ) : (
            <p className="px-1 text-[0.9375rem] text-muted">Sign in, and you'll join straight away.</p>
          )}
          <div className="flex flex-col gap-3">
            <IconField
              icon="mail"
              aria-label="Email"
              placeholder="Email"
              required
              type="email"
              inputMode="email"
              autoComplete="username"
              {...usernameInputProps}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clear();
              }}
            />
            <PasswordField
              aria-label="Password"
              placeholder="Password"
              required
              autoFocus={Boolean(notice)}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clear();
              }}
            />
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" full size="lg" disabled={busy || !email.trim() || !password}>
            {busy ? 'Signing in…' : 'Sign in and join'}
          </Button>
          {legacyPinLogin && (
            <button
              type="button"
              onClick={() => {
                setPendingJoin(token);
                switchTo('pin');
              }}
              className="block min-h-touch w-full text-sm font-medium text-muted"
            >
              Sign in with your name and PIN
            </button>
          )}
        </form>
      )}
    </WelcomePage>
  );
}
