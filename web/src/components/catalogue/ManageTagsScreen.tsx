import { useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import type { RecipeCategory, RecipeSection } from '../../api/types';
import { iconByKey } from '../FoodIcons';
import { Icon } from '../icons';
import IconPicker from '../IconPicker';
import { ConfirmAlert, cx, ErrorText, NavBar, NoteBox, Sheet } from '../ui';
import { sectionLabel } from '../../utils/recipeMeta';
import { tagNamed } from '../../utils/tags';
import { FoodTile, tagTone } from './CatalogueParts';
import { createTag, deleteTag, isUnsaved, renameTag, setTagIcon } from './catalogueStore';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Manage tags (the mockup's 3.6, for tags): every tag in a drawer in one list — its drawing, its
 * name to rename where it stands, how many recipes wear it, and a bin on every row, so deleting
 * the first tag is as easy as deleting the last. "+ New tag" adds one at the foot.
 *
 * Each change is saved as it is made and shows at once; if the server says no, it goes back,
 * with why. Nothing waits for a Done, so there is no Done to forget. Deleting a tag only takes
 * it off its recipes — a tag is a sticker, not a shelf — so it asks first, saying how many.
 */
export default function ManageTagsScreen({
  householdId,
  section,
  tags,
  counts,
  loaded,
  onClose,
}: {
  householdId: string;
  section: RecipeSection;
  /** The drawer's tags, A to Z. */
  tags: RecipeCategory[];
  /** How many recipes wear each, by id. */
  counts: Map<string, number>;
  loaded: boolean;
  onClose: () => void;
}) {
  const drawerName = sectionLabel(section);
  /** Names being typed, saved when the field is left or Return is pressed. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [choosingIcon, setChoosingIcon] = useState<RecipeCategory | null>(null);
  const [deleting, setDeleting] = useState<RecipeCategory | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The tag whose rename Escape has just called off. Leaving the field is what saves, and
  // Escape leaves it too — at once, while this render still has the draft it means to drop.
  const cancelled = useRef<string | null>(null);

  function commit(tag: RecipeCategory) {
    const draft = drafts[tag.id];
    if (cancelled.current === tag.id) {
      cancelled.current = null;
      setDrafts(({ [tag.id]: _, ...rest }) => rest);
      return;
    }
    if (draft === undefined) return;
    setDrafts(({ [tag.id]: _, ...rest }) => rest);
    const wanted = draft.trim().replace(/\s+/g, ' ');
    // An emptied name goes back to what it was, rather than leaving a tag with no name.
    if (!wanted || wanted === tag.name) return;
    const other = tagNamed(tags, section, wanted);
    if (other && other.id !== tag.id) {
      setError(`There's already a tag called ${other.name} in ${drawerName}.`);
      return;
    }
    setError(null);
    renameTag(householdId, tag, wanted).catch((err) => setError(errorMessage(err, `Could not rename ${tag.name}.`)));
  }

  function add() {
    const name = newName.trim().replace(/\s+/g, ' ');
    if (!name) return setAdding(false);
    const existing = tagNamed(tags, section, name);
    if (existing) {
      setError(`There's already a tag called ${existing.name} in ${drawerName}.`);
      return;
    }
    setError(null);
    setNewName('');
    // The field stays open for the next one; leaving it empty closes it.
    createTag(householdId, section, name).saved.catch((err) => setError(errorMessage(err, `Could not make ${name}.`)));
  }

  function chooseIcon(tag: RecipeCategory, key: string | null) {
    setChoosingIcon(null);
    if ((tag.iconKey ?? null) === key) return;
    setError(null);
    setTagIcon(householdId, tag, key).catch((err) => setError(errorMessage(err, `Could not change ${tag.name}'s icon.`)));
  }

  function remove(tag: RecipeCategory) {
    setDeleting(null);
    setError(null);
    deleteTag(householdId, tag).catch((err) => setError(errorMessage(err, `Could not delete ${tag.name}.`)));
  }

  const untags = (tag: RecipeCategory) => {
    const n = counts.get(tag.id) ?? 0;
    if (n === 0) return 'No recipe wears it.';
    return n === 1 ? 'Untags 1 recipe. The recipe stays.' : `Untags ${n} recipes. The recipes stay.`;
  };

  return (
    <div className="space-y-3.5">
      <NavBar className="-mx-2.5" title={`Tags in ${drawerName}`} back={onClose} backLabel={drawerName} />

      {!loaded ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : tags.length === 0 && !adding ? (
        <p className="py-3 text-[0.9375rem] text-muted">
          No tags in {drawerName} yet. A tag is a word a recipe wears — “Chicken”, “Quick” — and a recipe can wear several.
        </p>
      ) : (
        <ul aria-label={`Tags in ${drawerName}`} className="card card-rows inset-rows" style={{ '--row-inset': '64px' } as React.CSSProperties}>
          {tags.map((tag) => {
            const unsaved = isUnsaved(tag);
            const n = counts.get(tag.id) ?? 0;
            return (
              <li key={tag.id} className={cx('flex min-h-[3.75rem] items-center gap-3 py-2.5 pl-4 pr-2', unsaved && 'opacity-60')}>
                <button
                  type="button"
                  aria-label={`Icon for ${tag.name}`}
                  title={iconByKey(tag.iconKey)?.label ?? 'No icon'}
                  disabled={unsaved}
                  onClick={() => setChoosingIcon(tag)}
                  className="press shrink-0"
                >
                  <FoodTile iconKey={tag.iconKey} tone={tagTone(tag.id)} size={36} />
                </button>
                <span className="min-w-0 flex-1">
                  <input
                    aria-label={`Name of ${tag.name}`}
                    value={drafts[tag.id] ?? tag.name}
                    disabled={unsaved}
                    maxLength={100}
                    enterKeyHint="done"
                    onChange={(e) => setDrafts((d) => ({ ...d, [tag.id]: e.target.value }))}
                    onBlur={() => commit(tag)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') {
                        cancelled.current = tag.id;
                        e.currentTarget.blur();
                      }
                    }}
                    className="-mx-1 block w-[calc(100%+0.5rem)] rounded-md bg-transparent px-1 text-base font-medium text-ink outline-none focus:bg-surface2"
                  />
                  <span className="block text-xs text-muted">
                    {unsaved ? 'Saving…' : `${n} ${n === 1 ? 'recipe' : 'recipes'}`}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${tag.name}`}
                  title={`Delete ${tag.name}`}
                  disabled={unsaved}
                  onClick={() => setDeleting(tag)}
                  className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-faint active:bg-surface2"
                >
                  <Icon name="trash" size={18} />
                </button>
              </li>
            );
          })}
          {adding && (
            <li className="flex min-h-[3.75rem] items-center gap-3 py-2.5 pl-4 pr-3">
              <FoodTile tone="herb" size={36} fallback="plus" />
              <input
                autoFocus
                aria-label="New tag name"
                placeholder={`New tag in ${drawerName}`}
                value={newName}
                maxLength={100}
                enterKeyHint="done"
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => {
                  if (!newName.trim()) setAdding(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') add();
                  if (e.key === 'Escape') {
                    setNewName('');
                    setAdding(false);
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none placeholder:text-faint"
              />
              <button
                type="button"
                // Taps before the field loses focus, so an empty-looking blur cannot close it first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={add}
                disabled={!newName.trim()}
                className="press h-9 shrink-0 rounded-[11px] border border-line bg-surface px-3.5 text-[0.875rem] font-semibold text-ink disabled:opacity-45"
              >
                Add
              </button>
            </li>
          )}
        </ul>
      )}

      {loaded && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="dash press flex min-h-[3.25rem] w-full items-center justify-center gap-2 text-sm font-semibold text-accent-ink active:bg-surface2"
        >
          <Icon name="plus" size={16} />
          New tag
        </button>
      )}

      {error && <ErrorText>{error}</ErrorText>}
      <NoteBox tone="sky" icon="info">
        Deleting a tag only takes it off its recipes. The recipes stay.
      </NoteBox>

      {choosingIcon && (
        <Sheet title={choosingIcon.name} subtitle="Its picture, on the chip and here." onClose={() => setChoosingIcon(null)}>
          <IconPicker allowNone value={choosingIcon.iconKey ?? null} onChange={(key) => chooseIcon(choosingIcon, key)} />
        </Sheet>
      )}

      {deleting && (
        <ConfirmAlert
          icon="trash"
          title={`Delete ${deleting.name}?`}
          confirmLabel={`Delete ${deleting.name}`}
          onConfirm={() => remove(deleting)}
          onCancel={() => setDeleting(null)}
        >
          {untags(deleting)}
        </ConfirmAlert>
      )}
    </div>
  );
}
