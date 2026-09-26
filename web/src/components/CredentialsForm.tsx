import { useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { Me } from '../api/types';
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_RULE } from '../auth/password';
import { Button, ErrorText, Field, Input, usernameInputProps } from './ui';

/**
 * Adding or changing the email and password you sign in with. One form for both the first time
 * (the "add an email" prompt, where being signed in with your PIN is proof enough) and every time
 * after, when it asks for the current password before changing anything.
 */
export default function CredentialsForm({
  me,
  onSaved,
  submitLabel = 'Save',
  secondary,
}: {
  me: Me;
  onSaved: (me: Me) => void;
  submitLabel?: string;
  /** Another button beside Save — "Not now" on the prompt, "Cancel" in Settings. */
  secondary?: ReactNode;
}) {
  const [email, setEmail] = useState(me.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Before there is a password, a password is the point; after, leaving it blank keeps it.
  const needsPassword = !me.hasPassword;
  const emailChanged = email.trim().toLowerCase() !== (me.email ?? '');
  const nothingToSave = !emailChanged && !password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim()) {
      setError('Add your email.');
      return;
    }
    if ((needsPassword || password) && password.length < PASSWORD_MIN) {
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
      const saved = await api<Me>('PUT', '/api/users/me/credentials', {
        email: email.trim(),
        password: password || null,
        currentPassword: me.hasPassword ? current : null,
      });
      setPassword('');
      setConfirm('');
      setCurrent('');
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Email">
        <Input
          aria-label="Email"
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
      <Field
        label={needsPassword ? 'Password' : 'New password'}
        hint={needsPassword ? PASSWORD_RULE : 'Leave blank to keep the one you have.'}
      >
        <Input
          aria-label={needsPassword ? 'Password' : 'New password'}
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
      {(needsPassword || password) && (
        <Field label="Confirm password">
          <Input
            aria-label="Confirm password"
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
      )}
      {me.hasPassword && (
        <Field label="Current password" hint="Needed to change either one.">
          <Input
            aria-label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
            setCurrent(e.target.value);
            setError(null);
          }}
          />
        </Field>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <Button
          type="submit"
          className="flex-1"
          disabled={busy || nothingToSave || (me.hasPassword && !current)}
        >
          {busy ? 'Saving…' : submitLabel}
        </Button>
        {secondary}
      </div>
    </form>
  );
}
