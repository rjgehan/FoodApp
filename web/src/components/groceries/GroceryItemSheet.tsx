import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CupboardItem, GroceryCategory, GroceryListItem, RestockReminder } from '../../api/types';
import { Chip, ErrorText, List, Row, Sheet, Tile, Toggle } from '../ui';
import { RestockField, saveRestock } from '../Restock';
import { amountOf, cupboardState, reminderLine, titleCase } from './groceryParts';

/**
 * One grocery item (mockup 4.2): which aisle it goes in, a restock reminder, what the cupboard
 * says, and taking it off the list. Everything here takes effect as it is tapped — there is no
 * Save — because each is one decision about one thing.
 *
 * The aisle belongs to the ingredient, not this row, so picking one moves it for good: next
 * week's chicken thighs land in Meat & fish too.
 */
export default function GroceryItemSheet({
  householdId,
  item,
  categories,
  reminder,
  stock,
  onMove,
  onReminder,
  onRemove,
  onClose,
}: {
  householdId: string;
  item: GroceryListItem;
  categories: GroceryCategory[];
  reminder: RestockReminder | null;
  stock: CupboardItem | undefined;
  onMove: (categoryId: string) => void;
  onReminder: (reminder: RestockReminder | null) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Saves one after another, so typing "10" into the days box cannot land as 1.
  const saving = useRef(Promise.resolve());
  const name = titleCase(item.name);
  const amount = amountOf(item);
  const recipes = item.fromRecipes ?? [];
  const subtitle = [amount, recipes.length ? `from ${recipes.join(', ')}` : item.addedByName ? `added by ${item.addedByName}` : null]
    .filter(Boolean)
    .join(' · ');
  const aisles = [...categories].sort((a, b) => a.position - b.position);
  const aisle = aisles.find((c) => c.id === item.categoryId);

  function remind(everyDays: number | null) {
    const ingredientId = item.ingredientId;
    if (!ingredientId) return;
    setError(null);
    saving.current = saving.current.then(async () => {
      try {
        onReminder(await saveRestock(householdId, ingredientId, everyDays));
      } catch {
        setError('Could not save the reminder.');
      }
    });
  }

  return (
    <Sheet title={name} subtitle={subtitle || undefined} onClose={onClose}>
      <div className="space-y-4">
        {item.ingredientId && (
          <div className="space-y-2.5">
            <p className="group-label px-0.5">Aisle</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Aisle">
              {aisles.map((c) => (
                <Chip
                  key={c.id}
                  active={c.id === item.categoryId}
                  onClick={() => c.id !== item.categoryId && onMove(c.id)}
                  className="!px-[13px] !py-2 !text-[0.9375rem]"
                >
                  {c.name}
                </Chip>
              ))}
            </div>
            <p className="px-0.5 text-xs text-muted">
              {aisle ? `${name} will always go in ${aisle.name}.` : `Pick an aisle and ${item.name} will always go there.`}
            </p>
          </div>
        )}

        <List inset={0}>
          {item.ingredientId && (
            <Row
              role="switch"
              aria-checked={!!reminder}
              aria-label="Remind me to buy it"
              lead={<Tile icon="bell" tone="mustard" size={34} />}
              title="Remind me to buy it"
              subtitle={reminder ? reminderLine(reminder) : 'Off'}
              end={<Toggle on={!!reminder} />}
              onClick={() => remind(reminder ? null : 14)}
            />
          )}
          {reminder && (
            <li className="flex items-center gap-3 px-4 pb-3 pt-1">
              <span className="w-[34px] shrink-0" />
              <span className="min-w-0 flex-1">
                <RestockField
                  value={reminder.everyDays}
                  withOff={false}
                  label="How often"
                  onChange={(days) => days !== null && days !== reminder.everyDays && remind(days)}
                />
              </span>
            </li>
          )}
          <Row
            lead={<Tile icon="cupboard" tone="sky" size={34} />}
            title="Cupboard"
            subtitle={cupboardState(stock)}
            chevron
            onClick={() => navigate(`/cupboard?q=${encodeURIComponent(item.name)}`)}
          />
          <Row
            lead={<Tile icon="trash" tone="accent" size={34} />}
            title="Remove from list"
            titleClassName="text-accent-ink"
            onClick={onRemove}
          />
        </List>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </Sheet>
  );
}
