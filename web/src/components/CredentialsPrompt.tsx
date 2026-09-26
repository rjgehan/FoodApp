import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Me } from '../api/types';
import { CREDENTIALS_PROMPT_DISMISSED, useAuth } from '../auth/AuthContext';
import CredentialsForm from './CredentialsForm';
import { Button, Sheet } from './ui';

function dismissed(): boolean {
  try {
    return sessionStorage.getItem(CREDENTIALS_PROMPT_DISMISSED) === '1';
  } catch {
    return false;
  }
}

/**
 * The move from PINs to email sign-in. Anyone signed in without an email or a password is asked
 * for them once per app open — right after signing in, and whenever the app is opened again —
 * until they have both. Once everybody has, the owner can switch the PIN screens off.
 *
 * "Not now" is honoured until the next open rather than for good: the whole point is that
 * everyone gets there eventually.
 */
export default function CredentialsPrompt() {
  const { session } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  // Kept open after Save to say it worked; otherwise saving and "Not now" look the same.
  const [savedEmail, setSavedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!session || dismissed()) return;
    let cancelled = false;
    api<Me>('GET', '/api/users/me')
      .then((fetched) => {
        if (cancelled) return;
        setMe(fetched);
        setOpen(!fetched.email || !fetched.hasPassword);
      })
      .catch(() => {
        // Offline or signed out: nothing to ask about right now.
      });
    return () => {
      cancelled = true;
    };
  }, [session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  function notNow() {
    try {
      sessionStorage.setItem(CREDENTIALS_PROMPT_DISMISSED, '1');
    } catch {
      // Blocked storage: it just asks again next time the page loads.
    }
    setOpen(false);
  }

  if (!open || !me) return null;

  if (savedEmail) {
    return (
      <Sheet title="You're all set" onClose={() => setOpen(false)}>
        <p className="mb-4 text-[0.9375rem]">
          Saved. Next time, sign in with <span className="font-semibold break-all">{savedEmail}</span> and
          your new password.
        </p>
        <Button type="button" full onClick={() => setOpen(false)}>
          Done
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Add an email and password" onClose={notNow}>
      <p className="mb-4 text-[0.9375rem] text-muted">
        Next time you'll sign in with these instead of your PIN.
      </p>
      <CredentialsForm
        me={me}
        submitLabel="Save"
        onSaved={(updated) => setSavedEmail(updated.email ?? '')}
        secondary={
          <Button type="button" variant="secondary" onClick={notNow}>
            Not now
          </Button>
        }
      />
    </Sheet>
  );
}
