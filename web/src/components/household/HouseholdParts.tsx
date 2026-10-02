import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import type { HouseholdMember } from '../../api/types';
import { Icon } from '../icons';
import { toast } from '../toast';
import { cx, Pill, type Tone } from '../ui';

/*
 Small pieces the Household pages share (mockup 6.2–6.7): the link in a quiet well with its copy
 button, the QR code, sending a link on, how somebody signs in, and getting back to Household.
*/

/** Where Household's back button goes: the page Settings was opened over, with Settings open again. */
export interface HouseholdScreenState {
  from?: string;
}

/**
 * Back to the Household page from one of its own (Places, Store aisles, Name & servings),
 * carrying where Household itself goes back to.
 */
export function useBackToHousehold() {
  const navigate = useNavigate();
  const state = useLocation().state as HouseholdScreenState | null;
  return () => navigate('/household', { state });
}

/** Everyone's own colour in Who's here and on the member sheet: the same person, the same colour. */
const PERSON_TONES: Tone[] = ['accent', 'herb', 'sky', 'plum', 'mustard'];
export const personTone = (index: number) => PERSON_TONES[Math.max(0, index) % PERSON_TONES.length];

/** Someone who has never got in at all: no PIN, no password. A different job for the owner. */
export const neverSignedIn = (m: HouseholdMember) => !m.pinSet && !m.hasPassword;

/**
 * How someone signs in, as the mockup's pill: email (herb), a PIN only (mustard) — the owner's cue
 * that the PIN screens cannot go yet — or not at all so far.
 */
export function SignInPill({ member }: { member: HouseholdMember }) {
  if (neverSignedIn(member)) return <Pill tone="accent">Hasn't signed in yet</Pill>;
  if (member.hasEmail === false)
    return (
      <Pill tone="mustard" icon="key">
        PIN
      </Pill>
    );
  return (
    <Pill tone="herb" icon="mail">
      Email
    </Pill>
  );
}

/** The same thing in words, under their name on the member sheet. */
export function signInSentence(m: HouseholdMember): string {
  if (neverSignedIn(m)) return "Hasn't signed in yet";
  return m.hasEmail === false ? 'Signs in with a PIN' : 'Signs in with email';
}

/** A link as people read it: no scheme in front. */
export const shownLink = (url: string) => url.replace(/^https?:\/\//, '');

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard (an http page, an old browser): the link is on screen to select by hand.
    return false;
  }
}

/**
 * Sends a link on: the phone's own share sheet where there is one, so it goes by text or
 * WhatsApp; a computer has none, so there the link is copied, and says so.
 */
export async function sendLink(url: string, title: string) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
    } catch {
      // Cancelled, which is an answer rather than an error.
    }
    return;
  }
  if (await copyText(url)) toast('Link copied', { icon: 'copy' });
}

/**
 * The link in a quiet well, cut short with an ellipsis, and the copy button at its end (mockup
 * `meals.gehan.home/invite/h7Qm2x ⧉`). The whole link is in its title, and the copy takes all of it.
 */
export function LinkWell({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <div className={cx('flex min-w-0 items-center gap-2 rounded-xl bg-surface2 py-2 pl-3 pr-1.5', className)}>
      <span aria-label="Link" title={url} className="min-w-0 flex-1 select-all truncate text-[0.8125rem] text-muted">
        {shownLink(url)}
      </span>
      <button
        type="button"
        aria-label={copied ? 'Copied' : 'Copy link'}
        title={copied ? 'Copied' : 'Copy link'}
        onClick={async () => setCopied(await copyText(url))}
        className="press relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-accent-ink after:absolute after:-inset-2 after:content-['']"
      >
        <Icon name={copied ? 'check' : 'copy'} size={16} strokeWidth={copied ? 2.6 : 2} />
      </button>
    </div>
  );
}

/**
 * A QR code of a link, on a white tile with rounded corners. Black on white in both themes: a
 * camera reads contrast, and a light-on-dark code is one some scanners refuse.
 */
export function QrCode({ url, size = 220 }: { url: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#2B211A', light: '#FFFFFF' } })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div
      role="img"
      aria-label="QR code of the link"
      className="flex shrink-0 items-center justify-center rounded-[18px] bg-white p-3 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

/**
 * Their username, where it says something their name does not. For most people it is just their
 * name in lower case ("Sam" / "sam"), and saying it twice reads like a mistake.
 */
export function distinctUsername(m: HouseholdMember): string | undefined {
  const username = m.username?.trim();
  if (!username || username.toLowerCase() === m.displayName.trim().toLowerCase()) return undefined;
  return username;
}
