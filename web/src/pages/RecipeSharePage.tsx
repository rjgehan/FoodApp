import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, ApiError } from '../api/client';
import type { Recipe, ShareTarget } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import { Icon } from '../components/icons';
import { toast } from '../components/toast';
import { Alert, Avatar, Button, Card, cx, EmptyState, ErrorText, List, NavBar, SectionLabel, SwitchKnob, Tile, type Tone } from '../components/ui';

/** Each household's colour, as in the switcher. */
const HOUSE_TONES: Tone[] = ['sky', 'plum', 'herb', 'mustard', 'accent'];

/**
 * Handing a recipe on (the mockup's 3.12), from the widest to the narrowest: a public link that
 * anyone can open without an account (and anyone with one can save a copy from), your other
 * households, and Explore. Every switch takes effect when it is flipped; the two that break
 * links already sent — turning the link off, making a new one — ask first.
 *
 * Only the household that owns a recipe gets here: the server refuses anyone else.
 */
export default function RecipeSharePage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const { activeHouseholdId } = useHousehold();
  usePushedScreen();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<'off' | 'new' | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (!recipeId) return;
    const scope = activeHouseholdId ? `?householdId=${activeHouseholdId}` : '';
    Promise.all([
      api<Recipe>('GET', `/api/recipes/${recipeId}${scope}`),
      api<ShareTarget[]>('GET', `/api/recipes/${recipeId}/share-targets`),
      api<{ token: string | null }>('GET', `/api/recipes/${recipeId}/link`),
    ])
      .then(([r, houses, link]) => {
        setRecipe(r);
        setTargets(houses);
        setToken(link.token);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Cannot reach the server.'));
  }, [recipeId, activeHouseholdId]);

  function back() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(`/recipes/${recipeId}`);
  }

  /** Runs one change, saying in a sentence what went wrong if it does. */
  async function run(change: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await change();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const createLink = () =>
    run(async () => {
      setToken((await api<{ token: string }>('POST', `/api/recipes/${recipeId}/link`)).token);
    });

  const turnOff = () =>
    run(async () => {
      await api('DELETE', `/api/recipes/${recipeId}/link`);
      setToken(null);
      setShowQr(false);
      setAsking(null);
    });

  /** A different address: the old one is turned off, and a fresh one made. */
  const newLink = () =>
    run(async () => {
      await api('DELETE', `/api/recipes/${recipeId}/link`);
      setToken(null);
      setToken((await api<{ token: string }>('POST', `/api/recipes/${recipeId}/link`)).token);
      setAsking(null);
      toast('New link made. The old one no longer works.', { icon: 'check' });
    });

  /**
   * Flips one of your own households. Only yours are sent: the server leaves a share somebody
   * else made — into a house you are not in — exactly where it is.
   */
  const toggleShare = (target: ShareTarget) => {
    const before = targets;
    const next = targets.map((t) => (t.householdId === target.householdId ? { ...t, shared: !t.shared } : t));
    setTargets(next);
    return run(async () => {
      try {
        await api<Recipe>('PUT', `/api/recipes/${recipeId}/shares`, {
          householdIds: next.filter((t) => t.shared).map((t) => t.householdId),
        });
      } catch (err) {
        setTargets(before);
        throw err;
      }
    });
  };

  const setPublished = (published: boolean) =>
    run(async () => {
      // Only the switch is taken from the answer: the recipe's drawer and groups are already right.
      const saved = await api<Recipe>('PUT', `/api/recipes/${recipeId}/published`, { published });
      setRecipe((current) => (current ? { ...current, published: saved.published } : saved));
    });

  const url = token ? `${window.location.origin}/r/${token}` : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied', { icon: 'check' });
    } catch {
      // No clipboard on a plain-http address: the link is on screen to select by hand.
      toast('Couldn’t copy it here — select the link and copy it yourself.');
    }
  }

  async function shareLink() {
    if (!url) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: recipe?.name, url });
      } catch {
        // Closed the share sheet, which is an answer rather than an error.
      }
      return;
    }
    await copy();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8">
      <NavBar title="Share" back={back} backLabel="Recipe" />

      {loadError ? (
        <Card>
          <EmptyState>{loadError}</EmptyState>
        </Card>
      ) : !recipe ? (
        <p className="py-16 text-center text-sm text-muted">Loading…</p>
      ) : (
        <>
          <section className="card flex flex-col gap-3 p-4" aria-label="Public link">
            <SwitchRow
              lead={<Tile icon="link" tone="accent" size={36} />}
              title="Public link"
              subtitle="Anyone with it can view"
              on={!!token}
              disabled={busy}
              onToggle={() => (token ? setAsking('off') : createLink())}
              bare
            />
            {url && (
              <>
                <div className="flex items-center gap-2 rounded-xl bg-surface2 py-1 pl-3 pr-1">
                  <span className="min-w-0 flex-1 select-all truncate text-sm text-muted" aria-label="Link">
                    {url.replace(/^https?:\/\//, '')}
                  </span>
                  <button
                    type="button"
                    onClick={copy}
                    aria-label="Copy link"
                    title="Copy link"
                    className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-accent-ink active:bg-surface"
                  >
                    <Icon name="copy" size={18} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" icon="share" className="h-11 flex-1" onClick={shareLink}>
                    Share link
                  </Button>
                  <Button size="sm" variant="secondary" icon="refresh" className="h-11 flex-1" disabled={busy} onClick={() => setAsking('new')}>
                    New link
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  className="press flex items-center gap-1.5 self-start text-sm font-medium text-accent-ink"
                >
                  <Icon name="qr" size={16} />
                  {showQr ? 'Hide QR code' : 'Show QR code'}
                </button>
                {showQr && <QrCode url={url} />}
              </>
            )}
          </section>

          {/* Only the other houses you are in — none at all for somebody in just this one. */}
          {targets.length > 0 && (
            <section className="flex flex-col gap-0.5">
              <SectionLabel>Share into your other households</SectionLabel>
              <List label="Your other households" inset={0}>
                {targets.map((t, i) => (
                  <li key={t.householdId}>
                    <SwitchRow
                      lead={<Avatar name={t.name} tone={HOUSE_TONES[i % HOUSE_TONES.length]} size={36} />}
                      title={t.name}
                      subtitle={t.shared ? 'Shows in their Shared with you' : undefined}
                      on={t.shared}
                      disabled={busy}
                      onToggle={() => toggleShare(t)}
                    />
                  </li>
                ))}
              </List>
            </section>
          )}

          <List label="Explore">
            <li>
              <SwitchRow
                lead={<Tile icon="globe" tone="herb" size={36} />}
                title="Publish to Explore"
                subtitle="Any household on this server can find it"
                on={recipe.published}
                disabled={busy}
                onToggle={() => setPublished(!recipe.published)}
              />
            </li>
          </List>

          {error && <ErrorText>{error}</ErrorText>}
        </>
      )}

      {asking === 'new' && (
        <Alert
          centered
          title="Make a new link?"
          onDismiss={() => setAsking(null)}
          actions={
            <div className="flex gap-2">
              <Button className="h-11 flex-1" variant="secondary" disabled={busy} onClick={() => setAsking(null)}>
                Cancel
              </Button>
              <Button className="h-11 flex-1" disabled={busy} onClick={newLink}>
                New link
              </Button>
            </div>
          }
        >
          The old link will stop working for anyone you've sent it to.
        </Alert>
      )}
      {asking === 'off' && (
        <Alert
          centered
          title="Turn off the link?"
          onDismiss={() => setAsking(null)}
          actions={
            <div className="flex gap-2">
              <Button className="h-11 flex-1" variant="secondary" disabled={busy} onClick={() => setAsking(null)}>
                Cancel
              </Button>
              <Button className="h-11 flex-1" disabled={busy} onClick={turnOff}>
                Turn off
              </Button>
            </div>
          }
        >
          Anyone you sent it to won't be able to open it any more. Copies people already saved stay theirs.
        </Alert>
      )}
    </div>
  );
}

/**
 * A row that is its own switch: the whole row is what you tap, with the switch drawn at the end,
 * so a setting is never a small target at the edge of a big row.
 */
function SwitchRow({
  lead,
  title,
  subtitle,
  on,
  disabled,
  onToggle,
  bare = false,
}: {
  lead: ReactNode;
  title: string;
  subtitle?: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
  /** Inside a card that already has its padding. */
  bare?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={title}
      disabled={disabled}
      onClick={onToggle}
      className={cx('flex w-full items-center gap-3 text-left disabled:opacity-60', bare ? '' : 'min-h-[60px] px-4 py-3 active:bg-surface2')}
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-semibold">{title}</span>
        {subtitle && <span className="block truncate text-[0.8125rem] text-muted">{subtitle}</span>}
      </span>
      <SwitchKnob on={on} />
    </button>
  );
}

/** Black on white in both themes: a camera reads contrast, and some scanners refuse light-on-dark. */
function QrCode({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((markup) => live && setSvg(markup))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [url]);
  if (!svg) return null;
  return (
    <div
      role="img"
      aria-label="QR code of the link"
      className="mx-auto w-full max-w-[14rem] overflow-hidden rounded-xl bg-white p-1 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
