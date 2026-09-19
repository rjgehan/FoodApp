import { useState } from 'react';
import type { RecipeCategory } from '../api/types';
import type { CategoryTree } from '../utils/categoryTree';
import { AddGroup, EditGroup } from '../pages/RecipeSectionPage';
import { cx } from './ui';
import { coverClass } from '../utils/recipeFormat';
import { MoreIcon } from './icons';

/**
 * One level at a time: the groups directly inside the current one, as the same two-up tiles the
 * catalog uses for Breakfast and Dinner. Tapping one opens it — Dinner, then Full meal, then
 * Chicken — and Back walks out the way you came.
 *
 * The whole tree used to be drawn at once, indented. Three levels of that on a phone is a wall
 * of tiles where a group and the groups inside it look alike, and which belongs to which is left
 * to the indentation to explain.
 *
 * A group shows here whether or not it holds a recipe from this drawer, so an empty one you just
 * made never looks like it disappeared. Add and remove groups from a tile's ••• menu; deleting
 * one moves its recipes and groups up to its own parent, so nothing filed in it is lost.
 */
export default function GroupTree({
  householdId,
  tree,
  rootId,
  countFor,
  drawerName,
  onNavigate,
  onChanged,
}: {
  householdId: string;
  tree: CategoryTree;
  rootId: string | null;
  countFor: (id: string) => number;
  drawerName: string;
  onNavigate: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [addingChildOf, setAddingChildOf] = useState<RecipeCategory | null>(null);
  const [editingGroup, setEditingGroup] = useState<RecipeCategory | null>(null);

  const groups = tree.children(rootId);
  if (groups.length === 0) return null;

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3">
        {groups.map((node) => {
          const recipes = countFor(node.id);
          const inside = tree.children(node.id).length;

          return (
            <li key={node.id} className="relative">
              <button
                type="button"
                onClick={() => onNavigate(node.id)}
                className={cx(
                  'flex aspect-[3/2] w-full flex-col justify-end overflow-hidden rounded-2xl p-3 text-left',
                  'transition-transform active:scale-[0.98]',
                  coverClass(node.id),
                )}
              >
                <span className="pr-8 text-lg font-semibold leading-tight">{node.name}</span>
                <span className="text-sm text-muted">
                  {/* What is inside, in the order you care: the recipes, then whether it opens further. */}
                  {recipes} {recipes === 1 ? 'recipe' : 'recipes'}
                  {inside > 0 && ` · ${inside} ${inside === 1 ? 'group' : 'groups'}`}
                </span>
              </button>

              {/* A 44pt target in the corner, drawn as a small dot. */}
              <button
                type="button"
                aria-label={`More for ${node.name}`}
                onClick={() => setEditingGroup(node)}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg/60 text-ink backdrop-blur-sm active:bg-bg/80">
                  <MoreIcon className="h-3.5 w-3.5" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {addingChildOf && (
        <div className="mt-3">
          <AddGroup
            householdId={householdId}
            parent={addingChildOf}
            onCancel={() => setAddingChildOf(null)}
            onAdded={async () => {
              setAddingChildOf(null);
              await onChanged();
            }}
          />
        </div>
      )}

      {editingGroup && (
        <EditGroup
          householdId={householdId}
          group={editingGroup}
          upTo={(editingGroup.parentId && tree.byId.get(editingGroup.parentId)?.name) || drawerName}
          onClose={() => setEditingGroup(null)}
          onAddInside={() => {
            setAddingChildOf(editingGroup);
            setEditingGroup(null);
          }}
          onRenamed={async () => {
            setEditingGroup(null);
            await onChanged();
          }}
          onDeleted={async () => {
            setEditingGroup(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}
