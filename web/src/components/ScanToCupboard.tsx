import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../api/client';
import type { CupboardItem } from '../api/types';
import { Button, ErrorText, IconButton, Photo } from '../components/ui';
import { Icon } from './icons';
import { toast } from './toast';
import BarcodeScanner from './BarcodeScanner';
import { prefersReducedMotion } from '../utils/spring';

/** What the catalogue knows about a barcode. Mirrors BarcodeLookup.Product on the server. */
interface Product {
  barcode: string;
  name: string;
  brand: string;
  size: string;
}

type Stage =
  | { at: 'scanning' }
  | { at: 'asking'; barcode: string }
  | { at: 'found'; product: Product; already: CupboardItem | null }
  | { at: 'unknown'; barcode: string };

/**
 * The barcode scanner (mockup 4.8): the whole screen is the camera, and what it read rises in a
 * card at the bottom with the two places it can go — the cupboard, or the grocery list.
 *
 * Both halves matter. Standing in the kitchen you are stocking up; standing in a shop you are
 * asking "do we have this already" — and that second question is the one a written list is
 * worst at answering. So a scan that matches something you already own is a result, not a
 * dead end, and it says so instead of quietly offering to add a duplicate.
 *
 * The name always stays editable before it is saved. The catalogue is volunteer-maintained and
 * sometimes answers in French, or with a marketing name nobody would ever write on a list.
 */
export default function ScanToCupboard({
  householdId,
  items,
  onAdded,
  onClose,
}: {
  householdId: string;
  items: CupboardItem[];
  onAdded: (item: CupboardItem) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ at: 'scanning' });
  const [error, setError] = useState<string | null>(null);
  // The camera would not open: the viewfinder says why, and the way on is typing the name.
  const [cameraOff, setCameraOff] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // The result card rises into place each time there is a new one.
  useLayoutEffect(() => {
    if (stage.at === 'scanning' || prefersReducedMotion()) return;
    card.current?.animate([{ transform: 'translateY(24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
      duration: 220,
      easing: 'ease-out',
    });
  }, [stage.at]);

  async function lookUp(barcode: string) {
    setStage({ at: 'asking', barcode });
    setError(null);
    try {
      const product = await api<Product>('GET', `/api/barcodes/${encodeURIComponent(barcode)}`);
      setName(product.name);
      setStage({ at: 'found', product, already: alreadyHave(items, product.name) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setName('');
        setStage({ at: 'unknown', barcode });
        return;
      }
      setError('Could not look that barcode up.');
      setStage({ at: 'scanning' });
    }
  }

  async function addToCupboard() {
    const wanted = name.trim();
    if (!wanted || busy) return;
    setBusy(true);
    setError(null);
    try {
      onAdded(await api<CupboardItem>('POST', `/api/households/${householdId}/cupboard`, { name: wanted }));
      toast(`Added ${wanted} to the cupboard.`, { icon: 'check' });
      onClose();
    } catch {
      setError('Could not add that.');
      setBusy(false);
    }
  }

  async function addToList(wanted: string) {
    if (!wanted || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/api/households/${householdId}/grocery-list/items`, { ingredientName: wanted });
      toast(`Added ${wanted} to the list.`, { icon: 'cart' });
      onClose();
    } catch {
      setError('Could not add that to the list.');
      setBusy(false);
    }
  }

  const barcode = stage.at === 'found' ? stage.product.barcode : stage.at === 'unknown' || stage.at === 'asking' ? stage.barcode : '';

  // On the body, so nothing on the page that moves (a page's own transition) can carry it along.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan a barcode"
      className="fixed inset-0 z-[60] flex flex-col bg-[linear-gradient(160deg,#3b3029,#15100d)] text-white"
    >
      {stage.at === 'scanning' && <BarcodeScanner variant="fill" onFound={lookUp} onError={() => setCameraOff(true)} />}

      <div className="relative flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <IconButton label="Close" shape="plain" onClick={onClose} className="!bg-white/20 !text-white">
          <Icon name="x" size={18} />
        </IconButton>
      </div>

      <div className="flex-1" />

      {stage.at === 'scanning' && error && !cameraOff && (
        <p className="relative mx-6 mb-6 rounded-2xl bg-black/50 px-4 py-3 text-center text-sm text-white">{error}</p>
      )}

      {stage.at === 'scanning' && cameraOff && (
        <div className="relative mx-6 mb-[max(1.5rem,env(safe-area-inset-bottom))] flex justify-center">
          <Button
            variant="secondary"
            icon="pencil"
            onClick={() => {
              setName('');
              setStage({ at: 'unknown', barcode: '' });
            }}
          >
            Type it instead
          </Button>
        </div>
      )}

      {stage.at !== 'scanning' && (
        <div
          ref={card}
          className="relative mx-2.5 mb-[max(0.75rem,env(safe-area-inset-bottom))] w-auto max-w-md space-y-3.5 self-stretch rounded-[30px] bg-bg p-5 text-ink shadow-lift sm:mx-auto sm:w-full"
        >
          {stage.at === 'asking' ? (
            <p className="py-4 text-center text-sm text-muted">Looking up {stage.barcode}…</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Photo hue="sky" icon="box" className="h-[52px] w-[52px] rounded-xl" />
                <div className="min-w-0 flex-1">
                  {stage.at === 'found' && !stage.already ? (
                    <label className="flex items-center gap-1.5">
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        aria-label="Call it"
                        className="min-w-0 flex-1 bg-transparent text-base font-semibold text-ink outline-none"
                      />
                      <Icon name="pencil" size={14} className="shrink-0 text-faint" />
                    </label>
                  ) : stage.at === 'found' ? (
                    <p className="truncate text-base font-semibold">{stage.product.name}</p>
                  ) : barcode ? (
                    <p className="text-base font-semibold">Not in the catalogue.</p>
                  ) : (
                    <p className="text-base font-semibold">What is it?</p>
                  )}
                  <p className="truncate text-xs text-muted">
                    {[stage.at === 'found' ? describe(stage.product) : '', barcode].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>

              {stage.at === 'found' && stage.already && (
                <div className="rounded-[14px] bg-sky-soft px-3.5 py-2.5 text-sky">
                  <p className="text-[0.9375rem] font-semibold">You already have this.</p>
                  <p className="text-[0.8125rem]">
                    It is in the cupboard as “{stage.already.name}”
                    {stage.already.runningLow ? ', and it is marked running low.' : '.'}
                  </p>
                </div>
              )}

              {stage.at === 'unknown' && (
                <div className="space-y-2">
                  <p className="text-[0.8125rem] text-muted">
                    {barcode
                      ? 'Nothing is published under that barcode. Give it a name and it still goes in the cupboard.'
                      : 'Give it a name and it goes in the cupboard, or on the list.'}
                  </p>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Baked beans"
                    aria-label="Call it"
                    autoFocus
                    className="h-11 w-full rounded-field border border-line bg-surface px-3.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:shadow-focus"
                  />
                </div>
              )}

              {error && <ErrorText>{error}</ErrorText>}

              <div className="flex gap-2">
                {!(stage.at === 'found' && stage.already) && (
                  <Button
                    icon="cupboard"
                    className="h-11 flex-1"
                    aria-label="Add to the cupboard"
                    disabled={busy || !name.trim()}
                    onClick={addToCupboard}
                  >
                    Cupboard
                  </Button>
                )}
                <Button
                  icon="cart"
                  variant="secondary"
                  className="h-11 flex-1"
                  aria-label="Add to the list"
                  disabled={busy || !(stage.at === 'found' && stage.already ? stage.already.name : name.trim())}
                  onClick={() => addToList(stage.at === 'found' && stage.already ? stage.already.name : name.trim())}
                >
                  Add to list
                </Button>
              </div>
              {!cameraOff && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStage({ at: 'scanning' });
                  }}
                  className="press block w-full text-center text-sm font-semibold text-accent-ink"
                >
                  Scan another
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * Whether this is something the house already has. Loose on purpose — the cupboard says
 * "Nutella" and the catalogue says "Nutella", but it might equally say "Ferrero Nutella
 * Hazelnut Spread", and a false "you already have it" is cheaper than a duplicate row.
 */
function alreadyHave(items: CupboardItem[], productName: string): CupboardItem | null {
  const product = plain(productName);
  if (!product) return null;
  return (
    items.find((item) => {
      const mine = plain(item.name);
      return mine.length > 2 && (mine === product || product.includes(mine));
    }) ?? null
  );
}

/**
 * The line under the name. The brand is usually already in the name — the server puts it there
 * when it is missing — so repeating it gives "Nutella · Nutella".
 */
function describe({ name, brand, size }: Product) {
  const worthSaying = brand && !plain(name).includes(plain(brand));
  return [worthSaying ? brand : '', size].filter(Boolean).join(' · ');
}

function plain(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
