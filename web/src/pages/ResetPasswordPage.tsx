import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { AuthResponse, PasswordResetInfo } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_RULE } from '../auth/password';
import { Button, ErrorText, Field, Input, usernameInputProps } from '../components/ui';

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

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10 pb-safe pt-safe">
      <div className="w-full max-w-xs">
        <h1 className="mb-1 text-center text-3xl font-semibold tracking-tight">Meal Planner</h1>

        {info === null && <p className="mt-6 text-center text-sm text-muted">Loading…</p>}

        {info && !info.valid && (
          <div className="mt-6 space-y-4 text-center">
            <p className="text-lg font-semibold">This link doesn't work any more</p>
            <p className="text-sm text-muted">
              Reset links work once, for a day. Ask the owner of your household to make you a new one.
            </p>
            {/* Opened again after it was used, they are usually signed in already. */}
            <Button variant="secondary" full onClick={() => navigate('/', { replace: true })}>
              {session ? 'Open Meal Planner' : 'Go to sign in'}
            </Button>
          </div>
        )}

        {info?.valid && (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <div className="mb-4 space-y-1 text-center">
              <p className="text-lg font-semibold">Hi, {info.displayName}</p>
              <p className="text-sm text-muted">
                {info.hasEmail ? 'Choose a new password.' : 'Add your email and choose a password.'}
              </p>
            </div>
            {!info.hasEmail && (
              <Field label="Email" hint="What you'll sign in with from now on.">
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
            )}
            <Field label="New password" hint={PASSWORD_RULE}>
              <Input
                aria-label="New password"
                required
                autoFocus={info.hasEmail}
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
              {busy ? 'Saving…' : 'Set password and sign in'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
