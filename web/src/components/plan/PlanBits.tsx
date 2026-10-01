import { useEffect, useState } from 'react';
import type { RecipeIngredient } from '../../api/types';
import { formatQuantity } from '../../utils/recipeFormat';
import { Icon } from '../icons';
import { Button, CheckBox, cx, Input, List, NoteBox, Row, Sheet } from '../ui';

/**
 * The mockup's servings stepper: a pill on the quiet fill with round − and + either side of
 * the number. `label` turns 4 into "4 servings" where there is room to say so.
 */
export function ServingsStepper({
  value,
  onChange,
  disabled,
  label = false,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: boolean;
  className?: string;
}) {
  const btn =
    'press relative flex h-[26px] w-[26px] items-center justify-center rounded-full bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)] disabled:opacity-40 after:absolute after:-inset-2 after:content-[""]';
  return (
    <span
      role="group"
      aria-label="Servings"
      className={cx('flex shrink-0 items-center gap-2 rounded-full bg-surface2 p-[3px]', className)}
    >
      <button type="button" aria-label="Fewer servings" className={btn} disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}>
        <Icon name="minus" size={13} strokeWidth={2.4} />
      </button>
      <span className="min-w-[1rem] text-center text-[0.8125rem] font-semibold tabular-nums">
        {value}
        {label && ` ${value === 1 ? 'serving' : 'servings'}`}
      </span>
      <button type="button" aria-label="More servings" className={btn} disabled={disabled || value >= 50} onClick={() => onChange(value + 1)}>
        <Icon name="plus" size={13} strokeWidth={2.4} />
      </button>
    </span>
  );
}

/**
 * Servings as they are being stepped, saved once the tapping stops. Going from 4 to 10 is six
 * taps, and six requests racing each other can land out of order and leave it at 7.
 */
export function useDraftServings(saved: number, save: (value: number) => Promise<void>) {
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => {
    if (draft == null) return;
    // Stepped up and back down again: nothing to save.
    const t0 = draft === saved ? window.setTimeout(() => setDraft(null), 500) : null;
    if (t0) return () => window.clearTimeout(t0);
    const t = window.setTimeout(() => {
      save(draft).finally(() => setDraft(null));
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  return [draft ?? saved, setDraft] as const;
}

/** "½ cup", "2 tbsp", or the note when there is no amount ("to garnish"). */
export function amountOf(ing: RecipeIngredient): string | null {
  const amount = [formatQuantity(ing.quantity), ing.unit].filter(Boolean).join(' ');
  return amount || ing.notes || null;
}

/**
 * "Include the extras?" (the mockup's 2.8). Asked once, when a recipe with optional ingredients
 * is planned — not every time something later puts the meal on the list. Unticked ones are
 * skipped for this meal only. Opened again from the meal's options to change it.
 */
export function ExtrasSheet({
  recipeName,
  ingredients,
  initial,
  busy,
  editing = false,
  onDone,
  onClose,
}: {
  recipeName: string;
  ingredients: RecipeIngredient[];
  initial: string[];
  busy: boolean;
  /** From the meal's options: the button saves rather than plans. */
  editing?: boolean;
  onDone: (selected: string[]) => void;
  onClose: () => void;
}) {
  const optional = ingredients.filter((i) => i.optional);
  const [selected, setSelected] = useState(() => new Set(initial));
  const n = selected.size;
  return (
    <Sheet
      title="Include the extras?"
      subtitle={`${recipeName} has ${optional.length} optional ${optional.length === 1 ? 'ingredient' : 'ingredients'}.`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <List label="Optional ingredients">
          {optional.map((ing) => {
            const on = selected.has(ing.id);
            return (
              <Row
                key={ing.id}
                role="checkbox"
                aria-checked={on}
                lead={<CheckBox checked={on} />}
                // Stored as typed, usually lower case; a list of choices reads better capitalised.
                title={ing.ingredientName.charAt(0).toUpperCase() + ing.ingredientName.slice(1)}
                subtitle={amountOf(ing)}
                onClick={() =>
                  setSelected((all) => {
                    const next = new Set(all);
                    if (next.has(ing.id)) next.delete(ing.id);
                    else next.add(ing.id);
                    return next;
                  })
                }
              />
            );
          })}
        </List>
        {!editing && (
          <NoteBox tone="sky" icon="info">
            You can change this later from the meal's options.
          </NoteBox>
        )}
        <Button size="lg" full disabled={busy} onClick={() => onDone([...selected])}>
          {editing
            ? 'Save'
            : n === 0
              ? 'Plan without extras'
              : `Plan with ${n} ${n === 1 ? 'extra' : 'extras'}`}
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * A meal's time — a booking, a pickup, or just when you sit down. Optional: "No time" takes it
 * off. The plan shows it as "Dinner · 6:30 pm".
 */
export function TimeSheet({
  title,
  initial,
  busy,
  onSave,
  onClose,
}: {
  title: string;
  initial: string | null;
  busy: boolean;
  onSave: (time: string | null) => void;
  onClose: () => void;
}) {
  // The server sends "17:00:00"; a time input wants "17:00".
  const [time, setTime] = useState(initial?.slice(0, 5) ?? '18:30');
  return (
    <Sheet title={title} subtitle="For a booking, a pickup, or when you sit down." onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          type="time"
          aria-label="Time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="text-center text-[1.375rem] font-semibold"
        />
        <Button size="lg" full disabled={busy || !time} onClick={() => onSave(time)}>
          Save
        </Button>
        {initial && (
          <Button full variant="ghost" disabled={busy} onClick={() => onSave(null)}>
            No time
          </Button>
        )}
      </div>
    </Sheet>
  );
}
