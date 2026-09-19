import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { RecipeCategory, RecipeSection } from '../api/types';
import { Button, Chip, Field, Input } from './ui';
import { PlusIcon } from './icons';
import { SECTION_OPTIONS, type Filing } from '../utils/recipeMeta';
import { buildTree } from '../utils/categoryTree';

/**
 * Files a recipe: which drawer it goes in, and which of this household's groups it carries.
 * Groups are laid out as they nest — each top group on its own line, with the groups inside it
 * after it — so picking Chicken reads as "Main dish, then Chicken". Typing a name that does not
 * exist yet creates a top-level group; making one inside another happens in the drawer itself.
 */
export default function RecipeClassifier({
  householdId,
  value,
  onChange,
  sectionsHidden = false,
}: {
  householdId: string;
  value: Filing;
  onChange: (next: Filing) => void;
  /** The add-recipe form shows its own drawer picker, so it suppresses this one. */
  sectionsHidden?: boolean;
}) {
  const [known, setKnown] = useState<RecipeCategory[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    api<RecipeCategory[]>('GET', `/api/households/${householdId}/recipe-categories`)
      .then(setKnown)
      .catch(() => setKnown([]));
  }, [householdId]);

  // Only this drawer's groups, plus any that belong to every drawer.
  const inSection = useMemo(
    () => known.filter((c) => c.section === null || c.section === value.section),
    [known, value.section],
  );
  const tree = useMemo(() => buildTree(inSection), [inSection]);

  function isPicked(name: string) {
    return value.categories.some((c) => c.toLowerCase() === name.toLowerCase());
  }

  function toggleCategory(name: string) {
    onChange({
      ...value,
      categories: isPicked(name)
        ? value.categories.filter((c) => c.toLowerCase() !== name.toLowerCase())
        : [...value.categories, name],
    });
  }

  function addDraft(e?: { preventDefault: () => void }) {
    // Called from a button and from Enter — preventDefault stops the surrounding form submitting.
    e?.preventDefault();
    const name = draft.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (!isPicked(name)) {
      onChange({ ...value, categories: [...value.categories, name] });
    }
    setDraft('');
  }

  /** A top group and everything inside it, depth-first, with how deep each one sits. */
  function family(root: RecipeCategory): { category: RecipeCategory; depth: number }[] {
    const out: { category: RecipeCategory; depth: number }[] = [];
    const walk = (c: RecipeCategory, depth: number) => {
      out.push({ category: c, depth });
      tree.children(c.id).forEach((child) => walk(child, depth + 1));
    };
    walk(root, 0);
    return out;
  }

  // Anything picked that the household does not know about yet is brand new.
  const unknownPicked = value.categories.filter((c) => !tree.byName.has(c.toLowerCase()));

  return (
    <div className="space-y-4">
      {!sectionsHidden && (
      <Field label="Filed under">
        <div className="flex flex-wrap gap-2">
          {SECTION_OPTIONS.map((s) => (
            <Chip
              key={s.value}
              active={value.section === s.value}
              onClick={() => onChange({ ...value, section: s.value as RecipeSection })}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </Field>
      )}

      <Field label="Groups" hint="Pick the most specific one — Chicken rather than Main dish.">
        {(inSection.length > 0 || unknownPicked.length > 0) && (
          <div className="mb-2 space-y-2">
            {tree.children(null).map((root) => (
              <div key={root.id} className="flex flex-wrap gap-2">
                {family(root).map(({ category, depth }) => (
                  <Chip key={category.id} active={isPicked(category.name)} onClick={() => toggleCategory(category.name)}>
                    {depth > 0 ? `${'›'.repeat(depth)} ${category.name}` : category.name}
                  </Chip>
                ))}
              </div>
            ))}
            {unknownPicked.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {unknownPicked.map((name) => (
                  <Chip key={name} active onClick={() => toggleCategory(name)}>
                    {name} · new
                  </Chip>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addDraft(e);
            }}
            placeholder="A new group…"
            aria-label="New group name"
          />
          <Button type="button" variant="secondary" disabled={!draft.trim()} onClick={() => addDraft()}>
            <PlusIcon className="h-5 w-5" />
            Add
          </Button>
        </div>
      </Field>
    </div>
  );
}
