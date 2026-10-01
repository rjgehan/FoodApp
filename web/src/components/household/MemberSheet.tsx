import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { HouseholdMember } from '../../api/types';
import { Avatar, Button, ConfirmAlert, ErrorText, List, Pill, Row, Sheet, Tile, type Tone } from '../ui';
import { LinkWell, QrCode, sendLink, signInSentence } from './HouseholdParts';

/**
 * What the owner can do for somebody else in the house (mockup 6.4): make them a password-reset
 * link, or take them out.
 *
 * A forgotten password, without email: the owner makes a one-time link and hands it over — a
 * text, or the QR code held up in the kitchen. Each new link cancels the one before, so the link
 * is made when asked for rather than when the sheet opens.
 *
 * Taking somebody out asks first: it is quick to do and it cannot be undone from here. The
 * invite link is replaced at the same time — they have seen it, as everyone in the house has —
 * so getting back in takes a new link somebody chooses to send.
 */
export function MemberSheet({
  householdId,
  householdName,
  member,
  tone,
  onClose,
  onRemoved,
}: {
  householdId: string;
  householdName: string;
  member: HouseholdMember;
  tone: Tone;
  onClose: () => void;
  onRemoved: () => Promise<void>;
}) {
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = member.displayName;

  async function makeResetLink() {
    if (making) return;
    setMaking(true);
    setError(null);
    try {
      const link = await api<{ token: string; expiresAt: string }>(
        'POST',
        `/api/households/${householdId}/members/${member.userId}/password-reset`,
      );
      setResetUrl(`${window.location.origin}/reset/${link.token}`);
      setShowQr(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not make a reset link.');
    } finally {
      setMaking(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', `/api/households/${householdId}/members/${member.userId}`);
      await onRemoved();
      setRemoving(false);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove them.');
      setRemoving(false);
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={name}
      subtitle={`${signInSentence(member)} · ${member.username}`}
      lead={<Avatar name={name} tone={tone} size={52} />}
      onClose={onClose}
    >
      <div className="space-y-3.5">
        <List>
          <Row
            onClick={makeResetLink}
            disabled={making}
            lead={<Tile icon="key" tone="accent" size={34} />}
            title={making ? 'Making a link…' : 'Create password-reset link'}
            subtitle="Cancels any earlier link"
            chevron
          />
        </List>

        {resetUrl && (
          <section aria-label="Reset link" className="card space-y-2.5 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[0.875rem] font-semibold">Reset link ready</h3>
              <Pill tone="herb">Works once</Pill>
            </div>
            <LinkWell url={resetUrl} />
            <p className="text-xs leading-snug text-muted">
              It lets {name} choose a new password{member.hasEmail === false ? ' and add their email' : ''}, then signs
              them in. It works once, for 24 hours.
            </p>
            <Button variant="soft" size="sm" full icon="send" onClick={() => sendLink(resetUrl, 'Reset your Meal Planner password')}>
              Send to {name}
            </Button>
            {showQr ? (
              <div className="flex justify-center pt-1">
                <QrCode url={resetUrl} size={200} />
              </div>
            ) : (
              <Button variant="ghost" size="sm" full icon="qr" onClick={() => setShowQr(true)}>
                Show QR code
              </Button>
            )}
          </section>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <List>
          <Row
            onClick={() => setRemoving(true)}
            lead={<Tile icon="trash" tone="accent" size={34} />}
            title="Remove from household"
            titleClassName="text-accent-ink"
            subtitle="Also replaces the invite link"
          />
        </List>
      </div>

      {removing && (
        <ConfirmAlert
          title={`Remove ${name}?`}
          icon="trash"
          confirmLabel={busy ? 'Removing…' : 'Remove'}
          busy={busy}
          onConfirm={remove}
          onCancel={() => setRemoving(false)}
        >
          {name} loses access to “{householdName}” straight away. Everything they added stays here. The invite link is
          replaced too, so the one they have stops working — they can only come back if somebody sends them the new one.
        </ConfirmAlert>
      )}
    </Sheet>
  );
}
