import { Fragment, useState } from 'react';
import type { RecipeCategory } from '../api/types';
import type { CategoryTree } from '../utils/categoryTree';
import { AddGroup, EditGroup } from '../pages/RecipeSectionPage';
import { cx } from './ui';
import { coverClass } from '../utils/recipeFormat';
import { ChevronDownIcon, ChevronRightIcon, MoreIcon } from './icons';

/** A full 44pt tap target in a card corner, drawn as a small dot. */
const cornerButton = (side: string) => cx('absolute top-0 flex h-11 w-11 items-center justify-center', side);
const cornerDot =
  'flex h-7 w-7 items-center justify-center rounded-full bg-bg/60 text-ink backdrop-blur-sm active:bg-bg/80';

/**
 * Every group nested inside the current one, all at once — Sides indented under Dinner, Chicken
 * double-indented under Sides — like a JSON tree rather than one level per screen. A group shows
 * here whether or not it holds a recipe from this drawer, so an empty one you just made (or an
 * empty leaf three levels down) never looks like it disappeared. Tiles read the same as the
 * catalog's own Dinner/Breakfast cards, just smaller — three to a row instead of two. Add and
 * remove groups from the tile's ••• menu; deleting one moves its recipes and groups up to its
 * own parent, so nothing filed in it is lost.
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<RecipeCategory | null>(null);

  const topLevel = tree.children(rootId);
  if (topLevel.length === 0) return null;

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderLevel(nodes: RecipeCategory[], depth: number) {
    return (
      <div className="flex flex-wrap gap-2" style={depth > 0 ? { paddingLeft: `${depth * 1.25}rem` } : undefined}>
        {nodes.map((node) => {
          const children = tree.children(node.id);
          const isCollapsed = collapsed.has(node.id);
          const isAdding = addingChildOf === node.id;

          return (
            <Fragment key={node.id}>
              <div className="relative w-[calc((100%-1rem)/3)]">
                <button
                  type="button"
                  onClick={() => onNavigate(node.id)}
                  className={cx(
                    'flex aspect-[3/2] w-full flex-col justify-end overflow-hidden rounded-2xl p-3 text-left transition-transform active:scale-[0.98]',
                    coverClass(node.id),
                  )}
                >
                  <span className="text-sm font-semibold leading-tight">{node.name}</span>
                  <span className="text-xs text-muted">
                    {countFor(node.id)} {countFor(node.id) === 1 ? 'recipe' : 'recipes'}
                  </span>
                </button>

                {children.length > 0 && (
                  <button
                    type="button"
                    aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
                    onClick={() => toggle(node.id)}
                    className={cornerButton('left-0')}
                  >
                    <span className={cornerDot}>
                      {isCollapsed ? <ChevronRightIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                )}

                {/* One ••• for the rare things — a 44pt target a thumb can hit, where two
                    24pt buttons side by side were easy to miss. */}
                <button
                  type="button"
                  aria-label={`More for ${node.name}`}
                  onClick={() => setEditingGroup(node)}
                  className={cornerButton('right-0')}
                >
                  <span className={cornerDot}>
                    <MoreIcon className="h-3.5 w-3.5" />
                  </span>
                </button>
              </div>

              {isAdding && (
                <div className="w-full">
                  <AddGroup
                    householdId={householdId}
                    parent={node}
                    onCancel={() => setAddingChildOf(null)}
                    onAdded={async () => {
                      setAddingChildOf(null);
                      await onChanged();
                    }}
                  />
                </div>
              )}

              {!isCollapsed && children.length > 0 && (
                <div className="w-full">{renderLevel(children, depth + 1)}</div>
              )}
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {renderLevel(topLevel, 0)}

      {editingGroup && (
        <EditGroup
          householdId={householdId}
          group={editingGroup}
          upTo={(editingGroup.parentId && tree.byId.get(editingGroup.parentId)?.name) || drawerName}
          onClose={() => setEditingGroup(null)}
          onAddInside={() => {
            setAddingChildOf(editingGroup.id);
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
