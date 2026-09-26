import { useState } from 'react';
import type { RecipeCategory } from '../api/types';
import { api, ApiError } from '../api/client';
import { EditGroup } from '../pages/RecipeSectionPage';
import { coverClass } from '../utils/recipeFormat';
import { iconByKey } from './FoodIcons';
import IconPicker from './IconPicker';
import { PlusIcon } from './icons';
import { Button, ErrorText, Sheet, cx } from './ui';

/**
 * The groups on this screen, each with the picture it wears — from the page's ••• menu, so that
 * standing in Dinner and wanting Main, Full meal, Side and Veggie drawn is one list to go down
 * rather than four tiles to open one at a time. The same list as the phone's Edit groups.
 *
 * Tap a group's square and the pictures open under it; a pick is saved straight away and the
 * tile behind the sheet changes with it. Renaming and deleting stay in the group's own sheet,
 * which each row's Edit opens on top of this one.
 */
export default function EditGroupsSheet({
  householdId,
  place,
  groups,
  detailFor,
  onClose,
  onChanged,
}: {
  householdId: string;
  /** Where these groups sit: the drawer, or the group they are inside. */
  place: string;
  groups: RecipeCategory[];
  detailFor: (group: RecipeCategory) => string;
  onClose: () => void;
  /** Reload whatever draws the tiles. */
  onChanged: () => Promise<void>;
}) {
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecipeCategory | null>(null);
  // Picks shown straight away, rather than after the reload brings them back.
  const [picked, setPicked] = useState<Record<string, string | null>>({});
  // One icon at a time: two taps racing could leave the row on one and the server on the other.
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iconOf = (group: RecipeCategory) => (group.id in picked ? picked[group.id] : group.iconKey ?? null);

  async function chooseIcon(group: RecipeCategory, key: string | null) {
    setPicked((p) => ({ ...p, [group.id]: key }));
    setSaving(true);
    setError(null);
    try {
      // An empty string is how the server is told to take it off; null would mean "unchanged".
      await api('PATCH', `/api/households/${householdId}/recipe-categories/${group.id}`, { iconKey: key ?? '' });
    } catch (err) {
      setPicked(({ [group.id]: _, ...rest }) => rest);
      setError(
        (err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null) ??
          `Could not change the icon on ${group.name}.`,
      );
      return;
    } finally {
      setSaving(false);
    }
    setChoosingFor(null);
    // Saved by now, so a reload that fails only leaves the tile behind a moment. Once it lands
    // the group itself says what it wears, and the pick here can go — otherwise a later change
    // from the group's own sheet would be hidden behind it.
    await onChanged().then(
      () => setPicked(({ [group.id]: _, ...rest }) => rest),
      () => undefined,
    );
  }

  return (
    <>
      <Sheet title={`Groups in ${place}`} onClose={onClose}>
        {groups.length === 0 ? (
          <p className="py-4 text-[0.9375rem] text-muted">No groups in {place} yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {groups.map((group) => {
              const key = iconOf(group);
              const Icon = iconByKey(key)?.Icon;
              const open = choosingFor === group.id;

              return (
                <li key={group.id} className="py-2">
                  <div className="flex items-center gap-3">
                    {/* The tile in small: its colour, and its picture or a place for one. */}
                    <button
                      type="button"
                      aria-label={`Icon for ${group.name}`}
                      aria-expanded={open}
                      title={iconByKey(key)?.label ?? 'No icon'}
                      disabled={saving}
                      onClick={() => setChoosingFor(open ? null : group.id)}
                      className={cx(
                        'press flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl disabled:opacity-60',
                        coverClass(group.id),
                        Icon ? 'text-ink' : 'border border-dashed border-subtle text-muted',
                        open && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                      )}
                    >
                      {Icon ? (
                        <Icon className="h-9 w-9 opacity-70" />
                      ) : (
                        <>
                          <PlusIcon className="h-4 w-4" />
                          <span className="text-[0.625rem] font-medium leading-none">icon</span>
                        </>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{group.name}</p>
                      <p className="truncate text-sm text-muted">{detailFor(group)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-mr-2"
                      aria-label={`Edit ${group.name}`}
                      onClick={() => {
                        setChoosingFor(null);
                        setEditing(group);
                      }}
                    >
                      Edit
                    </Button>
                  </div>

                  {open && (
                    <div className="pb-2 pt-3">
                      <IconPicker allowNone value={key} onChange={(k) => chooseIcon(group, k)} disabled={saving} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {error && (
          <div className="mt-2">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        {groups.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Tap a square to give a group a picture. Edit renames or deletes one — the recipes in it move up into{' '}
            {place} rather than going with it.
          </p>
        )}
      </Sheet>

      {/* Beside the list, not inside it: a sheet inside another would move with it as it is dragged. */}
      {editing && (
        <EditGroup
          householdId={householdId}
          group={editing}
          upTo={place}
          onClose={() => setEditing(null)}
          onRenamed={async () => {
            setEditing(null);
            await onChanged();
          }}
          onIconChanged={onChanged}
          onDeleted={async () => {
            setEditing(null);
            await onChanged();
          }}
        />
      )}
    </>
  );
}
