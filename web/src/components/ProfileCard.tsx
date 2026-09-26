import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Me } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import CredentialsForm from './CredentialsForm';
import { Button, Card, ErrorText, Field, Input, usernameInputProps } from './ui';

/**
 * Renaming yourself. Two different things: the name everyone sees, and the username you sign in
 * with — which also changes which name you tap on the login screen, so it says so. Below them,
 * the email and password you sign in with now.
 */
export default function ProfileCard() {
  const { session, setDisplayName, logout } = useAuth();
  const [displayName, setName] = useState(session?.displayName ?? '');
  const [username, setUsername] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [editingSignIn, setEditingSignIn] = useState(false);
  const [signInSaved, setSignInSaved] = useState(false);

  // The session carries the display name but not the username, so ask who we are.
  useEffect(() => {
    if (!session) return;
    api<Me>('GET', '/api/users/me')
      .then((me) => {
        setMe(me);
        setUsername(me.username);
        setName(me.displayName);
      })
      .finally(() => setLoaded(true));
  }, [session]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await api<{ username: string; displayName: string }>('PATCH', '/api/users/me', {
        username: username.trim() || null,
        displayName: displayName.trim() || null,
      });
      setDisplayName(updated.displayName);
      setUsername(updated.username);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Someone already uses that name.'
          : 'Could not save that.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="You">
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Name" hint="What everyone sees.">
          <Input value={displayName} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Username" hint="The name you tap on the name-and-PIN sign-in screen.">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={loaded ? '' : 'Loading…'}
            {...usernameInputProps}
          />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="secondary" full disabled={busy || !displayName.trim()}>
          {saved ? 'Saved' : 'Save'}
        </Button>
      </form>

      {/* How you sign in. Inline rather than another sheet: this card already lives in one. */}
      {me && (
        <section className="mt-6 space-y-3 border-t border-line pt-4">
          <h3 className="font-semibold">Email and password</h3>
          {/* The form shows the address itself while it is open; saying it twice is noise. */}
          {!editingSignIn && (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-medium text-muted">Sign in with</p>
                <p className="truncate">{me.email ?? 'No email yet'}</p>
              </div>
              <Button variant="ghost" size="sm" className="-mr-3 shrink-0" onClick={() => setEditingSignIn(true)}>
                {me.email && me.hasPassword ? 'Change' : 'Add email and password'}
              </Button>
            </div>
          )}
          {signInSaved && !editingSignIn && (
            <p className="rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
              Saved. Use them next time you sign in.
            </p>
          )}
          {editingSignIn && (
            <CredentialsForm
              me={me}
              submitLabel="Update sign-in"
              onSaved={(updated) => {
                setMe(updated);
                setEditingSignIn(false);
                setSignInSaved(true);
                setTimeout(() => setSignInSaved(false), 4000);
              }}
              secondary={
                <Button type="button" variant="secondary" onClick={() => setEditingSignIn(false)}>
                  Cancel
                </Button>
              }
            />
          )}
        </section>
      )}
      <Button variant="ghost" full className="mt-4 text-danger" onClick={logout}>
        Sign out
      </Button>
    </Card>
  );
}

