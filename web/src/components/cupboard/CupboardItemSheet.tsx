import { useId, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { CupboardItem, GroceryCategory, RestockReminder } from '../../api/types';
import { cx, ErrorText, Field, Input, List, NoteBox, Row, Segmented, Select, Sheet, Tile, Toggle } from '../ui';
import UnitInput from '../UnitInput';
import { RestockField, saveRestock } from '../Restock';
import { everyLabel } from '../../utils/restock';
import { CountStepper, countOf } from './CupboardParts';
import { titleCase } from '../groceries/groceryParts';
import { Icon } from '../icons';

type Amount = 'have' | 'low' | 'exact';

/**
 * Everything about one cupboard item (mockup 4.7): its name, its aisle, how much there is, whether
 * you always have it, and a restock reminder. Renaming it to something already in the cupboard
 * merges the two rather than keeping both — the sheet says so before Save, not after.
 *
 * Save is the header's text action, as on the iPhone; there is no close button, because the scrim,
 * Escape and a pull down all leave without saving. Remove is a quiet last row.
 */
export default function CupboardItemSheet({
  householdId,
  item,
  others,
  categories,
  reminder,
  onSaved,
  onRemove,
  onClose,
}: {
  householdId: string;
  item: CupboardItem;
  /** The rest of the cupboard, to see a merge coming. */
  others: CupboardItem[];
  categories: GroceryCategory[];
  reminder: RestockReminder | null;
  onSaved: (updated: CupboardItem) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const startAmount: Amount = item.quantity != null ? 'exact' : item.runningLow ? 'low' : 'have';
  const formId = useId();
  // As the row it was opened from says it: "Chickpeas (tin)", not the stored "chickpeas (tin)".
  const [name, setName] = useState(() => titleCase(item.name));
  const [categoryId, setCategoryId] = useState(item.categoryId ?? '');
  const [staple, setStaple] = useState(item.staple);
  const [amount, setAmount] = useState<Amount>(startAmount);
  const [quantity, setQuantity] = useState(item.quantity ?? 1);
  const [unit, setUnit] = useState(item.unit ?? '');
  const [everyDays, setEveryDays] = useState<number | null>(reminder?.everyDays ?? null);
  // Only offered when the server knows about use-by dates (an older one never sends the field).
  const hasUseBy = item.useBy !== undefined;
  const [useBy, setUseBy] = useState(item.useBy ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  // Only a change of letters is a rename: capitalising the first one is how it is shown anyway.
  const renamed = trimmed.toLowerCase() !== item.name.toLowerCase();
  const mergesWith = renamed ? others.find((o) => o.id !== item.id && o.name.toLowerCase() === trimmed.toLowerCase()) : undefined;
  const exact = amount === 'exact';
  const quantityModeChanged = exact !== (item.quantity != null);
  const quantityValueChanged = exact && (quantity !== (item.quantity ?? quantity) || unit !== (item.unit ?? ''));
  const lowChanged = !exact && (amount === 'low') !== item.runningLow;
  const reminderChanged = everyDays !== (reminder?.everyDays ?? null);
  const useByChanged = hasUseBy && useBy !== (item.useBy ?? '');
  const changed =
    renamed || categoryId !== (item.categoryId ?? '') || staple !== item.staple || quantityModeChanged ||
    quantityValueChanged || lowChanged || reminderChanged || useByChanged;

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    // Nothing to send: Save just closes, as it does on the iPhone.
    if (!trimmed || !changed) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let updated = item;
      if (renamed || staple !== item.staple || quantityModeChanged || quantityValueChanged || lowChanged || useByChanged) {
        updated = await api<CupboardItem>('PATCH', `/api/households/${householdId}/cupboard/${item.id}`, {
          name: renamed ? trimmed : null,
          staple: staple !== item.staple ? staple : null,
          trackQuantity: quantityModeChanged ? exact : null,
          quantity: exact && (quantityModeChanged || quantityValueChanged) ? quantity : null,
          unit: exact ? unit.trim() || null : null,
          runningLow: lowChanged ? amount === 'low' : null,
          // "" clears it; left out, the server leaves it alone.
          ...(useByChanged ? { useBy } : {}),
        });
      }
      // The aisle belongs to the ingredient — the new one, after a rename — so it goes last.
      if (categoryId && categoryId !== item.categoryId) {
        await api('PUT', `/api/households/${householdId}/ingredients/${updated.ingredientId}/category`, { categoryId });
        updated = { ...updated, categoryId, sorted: true };
      }
      // Also after the rename, which takes the reminder along to the new ingredient first.
      if (reminderChanged) {
        await saveRestock(householdId, updated.ingredientId, everyDays);
      }
      onSaved(updated);
    } catch (err) {
      const message = err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null;
      setError(message ?? 'Could not save that.');
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Edit item"
      onClose={onClose}
      action={
        <button
          type="submit"
          form={formId}
          disabled={busy}
          className="press -mr-1 shrink-0 self-start px-1 py-1 text-[1.0625rem] font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? 'Saving…' : mergesWith ? 'Merge' : 'Save'}
        </button>
      }
    >
      <form id={formId} onSubmit={save} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        </Field>
        <Field label="Aisle">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Aisle">
            {!categoryId && (
              <option value="" disabled>
                Unsorted
              </option>
            )}
            {[...categories]
              .sort((a, b) => a.position - b.position)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>

        <div className="card space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.9375rem] font-semibold">Amount</span>
            <Segmented<Amount>
              label="Amount"
              className="w-[200px]"
              value={amount}
              onChange={setAmount}
              options={[
                { value: 'have', label: 'Have' },
                { value: 'low', label: 'Low' },
                { value: 'exact', label: 'Exact' },
              ]}
            />
          </div>
          {exact && (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">How many</span>
                <CountStepper
                  label="How many"
                  shown={`${countOf(quantity)}${unit.trim() ? ` ${unit.trim()}` : ''}`}
                  canLower={quantity > 0}
                  onStep={(delta) => setQuantity((q) => Math.max(0, q + delta))}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">Counted in</span>
                <UnitInput className="w-32" inputClassName="!h-10 !text-[0.9375rem]" value={unit} onChange={setUnit} aria-label="Unit" />
              </div>
            </>
          )}
        </div>

        <List>
          <Row
            role="switch"
            aria-checked={staple}
            aria-label="Always have"
            title="Always have"
            subtitle="Never marked low"
            end={<Toggle on={staple} />}
            onClick={() => setStaple((v) => !v)}
          />
          <Row
            role="switch"
            aria-checked={everyDays !== null}
            aria-label="Restock reminder"
            title="Restock reminder"
            subtitle={everyDays !== null ? `Ask me ${everyLabel(everyDays)}` : 'Off'}
            end={<Toggle on={everyDays !== null} />}
            onClick={() => setEveryDays((v) => (v === null ? reminder?.everyDays ?? 21 : null))}
          />
          {everyDays !== null && (
            <li className="px-4 pb-3 pt-1">
              <RestockField value={everyDays} onChange={setEveryDays} withOff={false} label="How often" />
            </li>
          )}
          {hasUseBy && (
            <Row
              title="Use by"
              wrap
              subtitle={
                useBy ? (
                  <span className={cx(useByPast(useBy) && 'font-semibold text-danger')}>
                    {useByPast(useBy) ? 'Past its date: check it' : useByText(useBy)}
                  </span>
                ) : item.useSoonGuess ? (
                  <span className="font-medium text-mustard">No date · we guess it wants using soon</span>
                ) : (
                  'Optional · plans use it by then'
                )
              }
              end={
                <span className="flex shrink-0 items-center gap-1.5">
                  <Input
                    type="date"
                    value={useBy}
                    onChange={(e) => setUseBy(e.target.value)}
                    aria-label="Use by"
                    className="h-10 w-[9.75rem] !rounded-[12px] !px-2.5 !text-[0.9375rem]"
                  />
                  {useBy && (
                    <button
                      type="button"
                      onClick={() => setUseBy('')}
                      aria-label="Clear the use-by date"
                      className="press grid h-8 w-8 place-items-center rounded-full text-muted"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </span>
              }
            />
          )}
        </List>

        {mergesWith && (
          <NoteBox tone="sky" icon="info">
            Renaming this to “{trimmed}” would merge it with the item you already have.
          </NoteBox>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <List inset={0}>
          <Row
            lead={<Tile icon="trash" tone="accent" size={34} />}
            title="Remove from cupboard"
            titleClassName="text-accent-ink"
            onClick={onRemove}
          />
        </List>
      </form>
    </Sheet>
  );
}

function useByPast(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(y, m - 1, d).getTime() < today.getTime();
}

/** "Thu 8 Oct", or "Today" / "Tomorrow" / "Past its date" — the date read the way the cupboard says it. */
function useByText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'Past its date';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
