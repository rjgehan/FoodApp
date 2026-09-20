import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { CupboardItem } from '../api/types';
import { Button, ErrorText, Field, Input, Sheet } from '../components/ui';
import BarcodeScanner from './BarcodeScanner';

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
 * Scan a barcode, then either put it in the cupboard or find out it is already there.
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
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

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

  async function add() {
    const wanted = name.trim();
    if (!wanted || busy) return;
    setBusy(true);
    setError(null);
    try {
      onAdded(await api<CupboardItem>('POST', `/api/households/${householdId}/cupboard`, { name: wanted }));
      onClose();
    } catch {
      setError('Could not add that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Scan a barcode" onClose={onClose} tall>
      <div className="space-y-4">
        {stage.at === 'scanning' && (
          <BarcodeScanner onFound={lookUp} onError={(message) => setError(message)} />
        )}

        {stage.at === 'asking' && (
          <p className="py-10 text-center text-sm text-muted">Looking up {stage.barcode}…</p>
        )}

        {stage.at === 'found' && (
          <>
            <div>
              <p className="text-lg font-semibold leading-tight">{stage.product.name}</p>
              <p className="text-sm text-muted">{describe(stage.product)}</p>
              <p className="mt-1 text-xs text-subtle">{stage.product.barcode}</p>
            </div>

            {stage.already ? (
              <div className="rounded-xl bg-accent-soft px-4 py-3">
                <p className="font-medium text-accent">You already have this.</p>
                <p className="text-sm text-ink">
                  It is in the cupboard as “{stage.already.name}”
                  {stage.already.runningLow ? ', and it is marked running low.' : '.'}
                </p>
              </div>
            ) : (
              <Field label="Call it" hint="What you want to see on the list.">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}

            {error && <ErrorText>{error}</ErrorText>}

            <div className="space-y-2">
              {!stage.already && (
                <Button full variant="secondary" disabled={busy || !name.trim()} onClick={add}>
                  Add to the cupboard
                </Button>
              )}
              <Button full variant="ghost" onClick={() => setStage({ at: 'scanning' })}>
                Scan another
              </Button>
            </div>
          </>
        )}

        {stage.at === 'unknown' && (
          <>
            <div>
              <p className="font-semibold">Not in the catalogue.</p>
              <p className="text-sm text-muted">
                Nothing is published under {stage.barcode}. Give it a name and it still goes in the cupboard.
              </p>
            </div>
            <Field label="Call it">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Baked beans" autoFocus />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <div className="space-y-2">
              <Button full variant="secondary" disabled={busy || !name.trim()} onClick={add}>
                Add to the cupboard
              </Button>
              <Button full variant="ghost" onClick={() => setStage({ at: 'scanning' })}>
                Scan another
              </Button>
            </div>
          </>
        )}

        {stage.at === 'scanning' && error && <ErrorText>{error}</ErrorText>}
      </div>
    </Sheet>
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
