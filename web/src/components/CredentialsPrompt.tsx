import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Me } from '../api/types';
import { CREDENTIALS_PROMPT_DISMISSED, useAuth } from '../auth/AuthContext';
import CredentialsForm from './CredentialsForm';
import { PROMPT_WAY_OUT, PromptHead } from './prompts';
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
      <Sheet
        title="You're all set"
        onClose={() => setOpen(false)}
        head={
          <PromptHead
            stacked
            icon="check"
            tone="herb"
            title="You're all set"
            // Wrapped anywhere only when it must: a short address moves whole to the next line.
            line={
              <>
                Saved. Next time, sign in with <span className="break-words font-semibold text-ink">{savedEmail}</span>{' '}
                and your new password.
              </>
            }
          />
        }
      >
        <Button type="button" size="lg" full onClick={() => setOpen(false)}>
          Done
        </Button>
      </Sheet>
    );
  }

  // The mockup's 7.1: the envelope on a sky tile, the question, why it is asked, two fields and
  // Save — with "Not now" under it instead of a close button, since that is what closing means.
  return (
    <Sheet
      title="Add an email and password"
      onClose={notNow}
      head={
        <PromptHead
          stacked
          icon="mail"
          tone="sky"
          title="Add an email and password"
          line="PIN sign-in is being retired. Add these once and you'll use them from now on."
        />
      }
    >
      <CredentialsForm
        me={me}
        look="prompt"
        submitLabel="Save"
        onSaved={(updated) => setSavedEmail(updated.email ?? '')}
        secondary={
          <Button type="button" variant="ghost" size="lg" full className={PROMPT_WAY_OUT} onClick={notNow}>
            Not now
          </Button>
        }
      />
    </Sheet>
  );
}
