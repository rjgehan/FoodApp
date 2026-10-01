import { useState } from 'react';
import { api } from '../api/client';
import type { CupboardItem, Household } from '../api/types';
import { Button, ErrorText, Sheet } from './ui';
import { ChevronRightIcon } from './icons';

type Stage =
  | { at: 'picking' }
  | { at: 'counting'; from: Household }
  | { at: 'confirming'; from: Household; total: number; missing: number };

/**
 * A one-time copy of another of your households' cupboards into this one — for somebody with
 * two houses setting up the second. Pick the house, see how much would come across, say yes.
 * What is here already stays as it is, so saying yes twice only brings what is new.
 */
export default function CopyCupboardSheet({
  householdId,
  householdName,
  others,
  items,
  onCopied,
  onClose,
}: {
  householdId: string;
  householdName: string;
  /** The other households you are in. */
  others: Household[];
  /** What is in this cupboard now, to say how much of theirs is new. */
  items: CupboardItem[];
  onCopied: (copied: number, skipped: number) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ at: 'picking' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(from: Household) {
    setStage({ at: 'counting', from });
    setError(null);
    try {
      const theirs = await api<CupboardItem[]>('GET', `/api/households/${from.id}/cupboard`);
      const here = new Set(items.map((i) => i.ingredientId));
      setStage({
        at: 'confirming',
        from,
        total: theirs.length,
        missing: theirs.filter((i) => !here.has(i.ingredientId)).length,
      });
    } catch {
      setError(`Could not open “${from.name}”’s cupboard.`);
      setStage({ at: 'picking' });
    }
  }

  async function copy(from: Household) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ copied: number; skipped: number }>(
        'POST',
        `/api/households/${householdId}/cupboard/copy-from/${from.id}`,
      );
      onCopied(result.copied, result.skipped);
      onClose();
    } catch {
      setError('Could not copy the cupboard. Try again?');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Copy from another household" onClose={onClose}>
      {stage.at === 'confirming' ? (
        <div className="space-y-4">
          <p className="text-[0.9375rem]">{summary(stage.from.name, householdName, stage.total, stage.missing)}</p>
          {stage.missing > 0 && (
            <p className="text-[0.8125rem] text-muted">
              Amounts, Low and Always have come across too. Nothing changes in “{stage.from.name}”.
            </p>
          )}
          {error && <ErrorText>{error}</ErrorText>}
          <div className="space-y-2">
            {stage.missing > 0 && (
              <Button full size="lg" onClick={() => copy(stage.from)} disabled={busy}>
                {busy ? 'Copying…' : `Copy ${things(stage.missing)}`}
              </Button>
            )}
            <Button full variant="ghost" onClick={() => setStage({ at: 'picking' })} disabled={busy}>
              Pick another household
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[0.9375rem] text-muted">
            Copies what’s in another house of yours into this cupboard. Only what isn’t here yet comes across.
          </p>
          {error && <div className="pt-3"><ErrorText>{error}</ErrorText></div>}
          <ul className="mt-2 divide-y divide-line" aria-label="Copy from">
            {others.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  disabled={stage.at === 'counting'}
                  onClick={() => pick(h)}
                  className="press flex min-h-touch w-full items-center gap-3 py-2.5 text-left disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1 truncate">{h.name}</span>
                  {stage.at === 'counting' && stage.from.id === h.id ? (
                    <span className="shrink-0 text-[0.9375rem] text-muted">Counting…</span>
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

/** What copying would do, in a sentence or two. */
function summary(from: string, into: string, total: number, missing: number) {
  if (total === 0) return `“${from}”’s cupboard is empty, so there’s nothing to copy.`;
  const has = `“${from}” has ${things(total)} in its cupboard.`;
  if (missing === 0) return `${has} ${total === 1 ? 'It’s' : 'All of them are'} in “${into}” already.`;
  if (missing === total) return `${has} ${total === 1 ? 'It' : 'All of them'} will be copied into “${into}”.`;
  const kept = total - missing;
  return `${has} ${capitalized(things(missing))} will be copied into “${into}”; the ${kept} already here ${
    kept === 1 ? 'stays as it is' : 'stay as they are'
  }.`;
}

function things(n: number) {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

function capitalized(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
