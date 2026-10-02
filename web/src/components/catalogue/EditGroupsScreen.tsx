import { useState } from 'react';
import type { RecipeCategory } from '../../api/types';
import { api, ApiError } from '../../api/client';
import { FOOD_ICONS, iconByKey } from '../FoodIcons';
import { Icon } from '../icons';
import { cx, ErrorText, NavBar, NoteBox, Pill } from '../ui';
import { FoodTile, groupTone } from './CatalogueParts';

/**
 * Edit groups (the mockup's 3.6): every group on the screen you came from in one list, so that
 * standing in Dinner and wanting Main, Soups, Sides and Batch cook drawn is one list to go down
 * rather than four groups to open. Tap a row to choose its icon from the grid under the list;
 * rename it where it stands; the bin takes it away, and its recipes move up a level.
 *
 * Nothing is sent until Done, so Cancel really is cancel.
 */
export default function EditGroupsScreen({
  householdId,
  place,
  groups,
  onClose,
  onSaved,
}: {
  householdId: string;
  /** Where these groups sit: the drawer, or the group they are inside. */
  place: string;
  groups: RecipeCategory[];
  onClose: () => void;
  /** Reload and leave, once every change is in. */
  onSaved: () => Promise<void>;
}) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  // Null until a row is tapped: the first group is the one being edited until then, which also
  // covers groups that arrive after the screen opens (straight from a link, or a reload).
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kept = groups.filter((g) => !removed.includes(g.id));
  const current = kept.find((g) => g.id === selected) ?? kept[0] ?? null;
  const nameOf = (g: RecipeCategory) => names[g.id] ?? g.name;
  const iconOf = (g: RecipeCategory) => (g.id in icons ? icons[g.id] : g.iconKey ?? null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Deleting first, so a rename cannot collide with a name that is on its way out.
      for (const id of removed) {
        await api('DELETE', `/api/households/${householdId}/recipe-categories/${id}`);
      }
      for (const g of kept) {
        const body: Record<string, string> = {};
        const name = nameOf(g).trim();
        if (name && name !== g.name) body.name = name;
        // An empty string is how the server is told to take an icon off; absent means unchanged.
        if (g.id in icons && icons[g.id] !== (g.iconKey ?? null)) body.iconKey = icons[g.id] ?? '';
        if (Object.keys(body).length > 0) {
          await api('PATCH', `/api/households/${householdId}/recipe-categories/${g.id}`, body);
        }
      }
      await onSaved();
    } catch (err) {
      setError(
        (err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null) ?? 'Could not save those changes.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3.5">
      <NavBar
        className="-mx-2.5"
        title="Edit groups"
        left={
          // Words rather than a chevron sit in from the edge, as every bar's back text does.
          <button type="button" className="press h-11 pl-0.5 text-[1.0625rem] text-accent-ink" onClick={onClose}>
            Cancel
          </button>
        }
        right={
          <button type="button" className="press h-11 pr-0.5 font-semibold disabled:opacity-45" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Done'}
          </button>
        }
      />

      {kept.length === 0 ? (
        <p className="py-4 text-center text-[0.9375rem] text-muted">
          {groups.length === 0 ? `No groups in ${place} yet.` : `Done takes every group out of ${place}.`}
        </p>
      ) : (
        <ul aria-label={`Groups in ${place}`} className="card card-rows inset-rows">
          {kept.map((g) => {
            const on = g.id === current?.id;
            return (
              <li key={g.id} className={cx('flex min-h-[3.75rem] items-center gap-3 py-3 pl-4 pr-3', on && 'bg-surface2/50')}>
                <button
                  type="button"
                  aria-label={`Icon for ${g.name}`}
                  aria-pressed={on}
                  title={iconByKey(iconOf(g))?.label ?? 'No icon'}
                  onClick={() => setSelected(g.id)}
                  className="press shrink-0"
                >
                  <FoodTile iconKey={iconOf(g)} tone={groupTone(g.id)} size={36} />
                </button>
                <input
                  aria-label={`Name of ${g.name}`}
                  value={nameOf(g)}
                  maxLength={100}
                  onFocus={() => setSelected(g.id)}
                  onChange={(e) => setNames((n) => ({ ...n, [g.id]: e.target.value }))}
                  className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none"
                />
                {on ? (
                  <Pill tone="accent">Editing</Pill>
                ) : (
                  <button
                    type="button"
                    aria-label={`Delete ${g.name}`}
                    title={`Delete ${g.name}`}
                    onClick={() => {
                      setRemoved((r) => [...r, g.id]);
                    }}
                    className="press flex h-9 w-9 shrink-0 items-center justify-center text-faint"
                  >
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {current && (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="group-label">Icon for {nameOf(current) || current.name}</h2>
          <div role="group" aria-label="Icon" className="grid grid-cols-7 gap-2 sm:grid-cols-[repeat(13,minmax(0,1fr))]">
            {[{ key: null as string | null, label: 'No icon' }, ...FOOD_ICONS].map((option) => {
              const chosen = (iconOf(current) ?? null) === option.key;
              const Food = option.key ? iconByKey(option.key)?.Icon : null;
              return (
                <button
                  key={option.key ?? 'none'}
                  type="button"
                  title={option.label}
                  aria-label={option.label}
                  aria-pressed={chosen}
                  onClick={() => setIcons((i) => ({ ...i, [current.id]: option.key }))}
                  className={cx(
                    'press flex h-10 items-center justify-center rounded-xl',
                    chosen ? 'bg-accent text-on-accent' : 'bg-surface2 text-muted',
                  )}
                >
                  {Food ? <Food strokeWidth={3.4} className="h-6 w-6" /> : <Icon name="ban" size={18} />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {removed.length > 0 && (
        <button type="button" className="press px-1 text-sm font-semibold text-accent-ink" onClick={() => setRemoved([])}>
          Undo {removed.length === 1 ? 'the delete' : `${removed.length} deletes`}
        </button>
      )}

      <NoteBox tone="sky" icon="info">
        Deleting a group moves its recipes up a level. Nothing is lost.
      </NoteBox>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
