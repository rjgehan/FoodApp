import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseAppLink } from '../../utils/appLinks';
import BarcodeScanner from '../BarcodeScanner';
import { Button, ErrorText, Input, Sheet, usernameInputProps } from '../ui';

/**
 * Joining somebody else's house: paste the link they sent, or scan the code on their screen
 * where the browser allows the camera. Either way it goes to the invite page, which says whose
 * house it is before anything happens. From Household, and from the switcher's "Join with an
 * invite link" (mockup 6.8).
 */
export function JoinHouseholdForm({ onOpened }: { onOpened?: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(value: string) {
    const link = parseAppLink(value);
    if (!link) {
      setError("That isn't a Meal Planner invite link. It looks like …/invite/ followed by a long code.");
      return false;
    }
    onOpened?.();
    navigate(`/${link.kind}/${link.token}`);
    return true;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) open(text);
  }

  return (
    <div className="space-y-3">
      <p className="text-[0.9375rem] text-muted">
        Someone sent you an invite link, or has the code on their screen? Paste it here, or scan it.
      </p>
      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          aria-label="Invite link"
          placeholder="https://…/invite/…"
          inputMode="url"
          {...usernameInputProps}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        <Button type="submit" variant="secondary" className="h-[3.25rem]" disabled={!text.trim()}>
          Open
        </Button>
      </form>
      <Button
        variant="secondary"
        icon="qr"
        full
        onClick={() => {
          setError(null);
          setScanning(true);
        }}
      >
        Scan a QR code
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
      {scanning && (
        <Sheet title="Scan an invite" onClose={() => setScanning(false)}>
          <ScanInvite
            onFound={(value) => {
              if (open(value)) setScanning(false);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

/** The same, as a sheet of its own. */
export function JoinHouseholdSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Join a household" onClose={onClose}>
      <JoinHouseholdForm onOpened={onClose} />
    </Sheet>
  );
}

/**
 * The camera, looking for an invite QR code. A code that is something else — a menu, a Wi-Fi
 * password — is said so, and the camera starts again rather than leaving a dead end.
 */
function ScanInvite({ onFound }: { onFound: (value: string) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  if (cameraError) {
    return (
      <div className="space-y-3 py-2">
        <ErrorText>{cameraError}</ErrorText>
        <p className="text-sm text-muted">You can still paste the link instead.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <BarcodeScanner
        key={attempt}
        kind="qr"
        onError={setCameraError}
        onFound={(value) => {
          if (parseAppLink(value)) {
            onFound(value);
          } else {
            setProblem("That QR code isn't a Meal Planner invite. Point at the code on the Invite card.");
            setAttempt((n) => n + 1);
          }
        }}
      />
      {problem ? (
        <ErrorText>{problem}</ErrorText>
      ) : (
        <p className="text-center text-sm text-muted">Point your camera at an invite QR code.</p>
      )}
    </div>
  );
}
