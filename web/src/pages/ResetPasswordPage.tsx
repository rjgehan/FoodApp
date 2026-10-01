import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AuthResponse, PasswordResetInfo } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PASSWORD_MAX, PASSWORD_MIN } from '../auth/password';
import { Button, ErrorText, Pill, Tile, usernameInputProps } from '../components/ui';
import { Icon } from '../components/icons';
import { IconField, MessageScreen, PasswordField, WelcomePage } from '../components/welcome';

/**
 * Where an owner's reset link lands. Works signed out — that is the whole point — and signs the
 * person straight in once the new password is set, so the link is the last thing they need.
 * Someone who never added an email is asked for one here too; a password is no use without it.
 */
export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const { session, signInWith } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<PasswordResetInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<PasswordResetInfo>('GET', `/api/public/password-resets/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch(() => setInfo({ valid: false, displayName: null, hasEmail: false }));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || busy) return;
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
      const auth = await api<AuthResponse>('POST', '/api/auth/password-reset', {
        token,
        password,
        email: info?.hasEmail ? null : email.trim(),
      });
      signInWith(auth);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
      setBusy(false);
    }
  }

  if (info === null) {
    return (
      <WelcomePage className="pt-6">
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      </WelcomePage>
    );
  }

  if (!info.valid) {
    return (
      <MessageScreen
        icon="broken"
        title="This link doesn't work any more"
        actions={
          // Opened again after it was used, they are usually signed in already.
          <Button variant="secondary" full size="lg" onClick={() => navigate('/', { replace: true })}>
            {session ? 'Open Meal Planner' : 'Go to sign in'}
          </Button>
        }
      >
        Reset links work once, for a day. Ask the owner of your household to make you a new one.
      </MessageScreen>
    );
  }

  const matches = confirm.length > 0 && confirm === password;

  return (
    <WelcomePage className="pt-6 sm:pt-0">
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-5 sm:flex-none">
        <div className="flex flex-col gap-3">
          <Tile icon="key" tone="accent" size={56} />
          <h1 className="serif text-[1.75rem] leading-tight">New password for {info.displayName}</h1>
          <p className="text-[0.9375rem] leading-normal text-muted">
            This link works once. After saving you'll be signed straight in.
          </p>
        </div>

        <div className="flex flex-col gap-3.5">
          <PasswordField
            label="New password"
            required
            autoFocus={info.hasEmail}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            hint={password && password.length < PASSWORD_MIN ? `At least ${PASSWORD_MIN} characters.` : undefined}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
          <IconField
            label="Confirm password"
            icon="lock"
            required
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            value={confirm}
            end={
              matches ? (
                <span className="flex h-10 w-10 items-center justify-center text-herb" aria-label="They match">
                  <Icon name="check" size={18} strokeWidth={2.6} />
                </span>
              ) : undefined
            }
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
            }}
          />
        </div>

        {!info.hasEmail && (
          <section className="card flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <Icon name="mail" size={16} className="text-sky" />
              <h2 className="text-sm font-semibold">Add an email</h2>
              <Pill tone="sky">Needed</Pill>
            </div>
            <p className="text-[0.8125rem] text-muted">
              Your account doesn't have one yet. You'll use it to sign in from now on.
            </p>
            <IconField
              icon="mail"
              aria-label="Email"
              placeholder="you@example.com"
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
          </section>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <div className="mt-auto pt-4 sm:mt-0">
          <Button type="submit" full size="lg" disabled={busy}>
            {busy ? 'Saving…' : 'Save and sign in'}
          </Button>
        </div>
      </form>
    </WelcomePage>
  );
}
