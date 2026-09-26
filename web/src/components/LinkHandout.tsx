import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button, cx } from './ui';

/**
 * A link meant for one other person: shown in full, copyable, shareable through the phone's own
 * share sheet where there is one, and as a QR code for somebody standing in the same room — who
 * can point their camera at it rather than wait for a text.
 */
export default function LinkHandout({
  url,
  shareTitle,
  qr = 'shown',
}: {
  url: string;
  /** What the share sheet calls it — "Reset your Meal Planner password". */
  shareTitle: string;
  /** 'toggle' keeps the code behind a button, for places where the link is the main event. */
  qr?: 'shown' | 'toggle';
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(qr === 'shown');
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    let cancelled = false;
    // Black on white in both themes: a camera reads contrast, and a light-on-dark code is one
    // some scanners refuse.
    QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (an http page, an old browser): the link is on screen to select by hand.
    }
  }

  async function share() {
    try {
      await navigator.share({ title: shareTitle, url });
    } catch {
      // Cancelled, which is an answer rather than an error.
    }
  }

  return (
    <div className="space-y-3">
      <p
        className="select-all break-all rounded-xl bg-elevated px-4 py-3 font-mono text-[0.8125rem] text-ink"
        aria-label="Link"
      >
        {url}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        {canShare && (
          <Button variant="secondary" className="flex-1" onClick={share}>
            Share
          </Button>
        )}
      </div>
      {qr === 'toggle' && (
        <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'Hide QR code' : 'Show QR code'}
        </Button>
      )}
      {showQr && svg && (
        <div
          role="img"
          aria-label="QR code of the link"
          className={cx('mx-auto w-full max-w-[14rem] overflow-hidden rounded-xl bg-white p-1', '[&>svg]:block [&>svg]:h-auto [&>svg]:w-full')}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}
