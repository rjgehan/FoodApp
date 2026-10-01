import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { InviteLink } from '../../api/types';
import { inviteUrl } from '../../utils/appLinks';
import { Icon } from '../icons';
import { Button, ConfirmAlert, ErrorText, Sheet } from '../ui';
import { LinkWell, QrCode, sendLink } from './HouseholdParts';

/*
 How anybody new gets in: the household's invite link, sent as a message or held up as a QR code
 for someone across the room. Whoever opens it makes an account (or signs in) and joins — nobody
 is put in a house without saying yes. Anyone here can hand it out; only the owner can throw it
 away and make a new one, since that breaks it for everyone who already has it.
*/

/** The household's invite link, and a way to fetch it again once it has been replaced. */
export function useInviteLink(householdId: string, generation: number) {
  const [link, setLink] = useState<InviteLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLink(await api<InviteLink>('GET', `/api/households/${householdId}/invite`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not get the invite link.');
    }
  }, [householdId]);

  // A replaced link keeps showing until its successor arrives, so the QR sheet stays open across it.
  useEffect(() => {
    load();
  }, [load, generation]);

  return { link, error, reload: load };
}

const shareTitle = (name: string) => `Join ${name} on Meal Planner`;

/**
 * The tomato card at the top of Household (mockup 6.2): who can join, and the two ways to hand
 * the link over — Share link, or Show QR for somebody in the room.
 */
export function InviteCard({
  name,
  link,
  error,
  onShowQr,
}: {
  name: string;
  link: InviteLink | null;
  error: string | null;
  onShowQr: () => void;
}) {
  return (
    <section
      aria-labelledby="invite-someone"
      className="space-y-3 rounded-card bg-accent p-4 text-on-accent shadow-card"
    >
      <div className="flex items-center gap-2.5">
        <Icon name="users" size={20} />
        <h2 id="invite-someone" className="flex-1 text-[1.0625rem] font-semibold">
          Invite someone
        </h2>
      </div>
      <p className="text-[0.8125rem] opacity-90">Anyone with the link can join {name}.</p>
      {error ? (
        <p className="rounded-xl bg-white/20 px-3 py-2 text-sm">{error}</p>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            icon="share"
            variant="ghost"
            className="flex-1 bg-white text-accent-ink active:bg-white"
            disabled={!link}
            onClick={() => link && sendLink(inviteUrl(link.token), shareTitle(name))}
          >
            Share link
          </Button>
          <Button
            size="sm"
            icon="qr"
            variant="ghost"
            className="flex-1 bg-white/20 text-on-accent active:bg-white/25"
            disabled={!link}
            onClick={onShowQr}
          >
            Show QR
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * Scan to join (mockup 6.3): the code, the link under it with its copy button, Share link, and
 * — for the owner only — Replace link, which asks first because it stops the old one working.
 */
export function InviteQrSheet({
  householdId,
  name,
  people,
  link,
  isOwner,
  onReplaced,
  onClose,
}: {
  householdId: string;
  name: string;
  people: number;
  link: InviteLink;
  isOwner: boolean;
  onReplaced: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = inviteUrl(link.token);
  const until = new Date(link.expiresAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  async function replace() {
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', `/api/households/${householdId}/invite`);
      await onReplaced();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not make a new link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Scan to join" subtitle={`${name} · ${people} ${people === 1 ? 'person' : 'people'}`} onClose={onClose}>
      <div className="space-y-3.5">
        <div className="flex flex-col items-center gap-3.5 py-1.5">
          <QrCode url={url} />
          <LinkWell url={url} className="max-w-[18rem]" />
          <p className="-mt-1.5 text-xs text-muted">Works until {until}.</p>
        </div>
        <Button size="lg" full icon="share" onClick={() => sendLink(url, shareTitle(name))}>
          Share link
        </Button>
        {isOwner && (
          <>
            <Button size="lg" variant="danger" full icon="refresh" onClick={() => setConfirming(true)}>
              Replace link
            </Button>
            <p className="-mt-1.5 text-center text-xs text-muted">Replacing stops the old link and QR working.</p>
          </>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
      {confirming && (
        <ConfirmAlert
          title="Replace the invite link?"
          icon="refresh"
          confirmLabel={busy ? 'Replacing…' : 'Replace link'}
          busy={busy}
          onConfirm={replace}
          onCancel={() => setConfirming(false)}
        >
          The link you have now stops working, for everyone it was sent to. Nobody already in the house is affected.
        </ConfirmAlert>
      )}
    </Sheet>
  );
}
