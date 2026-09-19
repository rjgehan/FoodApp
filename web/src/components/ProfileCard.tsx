import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorText, Field, Input, usernameInputProps } from './ui';

/**
 * Renaming yourself. Two different things: the name everyone sees, and the username you sign in
 * with — which also changes which name you tap on the login screen, so it says so.
 */
export default function ProfileCard() {
  const { session, setDisplayName, logout } = useAuth();
  const [displayName, setName] = useState(session?.displayName ?? '');
  const [username, setUsername] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The session carries the display name but not the username, so ask who we are.
  useEffect(() => {
    if (!session) return;
    api<{ username: string; displayName: string }>('GET', '/api/users/me')
      .then((me) => {
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
        <Field label="Username" hint="What you sign in with, and the name you tap on the sign-in screen.">
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
      <Button variant="ghost" full className="mt-4 text-danger" onClick={logout}>
        Sign out
      </Button>
    </Card>
  );
}

