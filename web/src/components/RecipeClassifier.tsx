import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { RecipeCategory, RecipeSection } from '../api/types';
import { Button, Chip, Field, Input } from './ui';
import { PlusIcon } from './icons';
import { SECTION_OPTIONS, type Filing } from '../utils/recipeMeta';

/**
 * Files a recipe: which drawer it goes in, and which of this household's sub-categories it
 * carries. Typing a name that does not exist yet is how new sub-categories get created — the
 * backend find-or-creates by name, so there is no "manage categories" screen to visit first.
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

  function toggleCategory(name: string) {
    const has = value.categories.some((c) => c.toLowerCase() === name.toLowerCase());
    onChange({
      ...value,
      categories: has
        ? value.categories.filter((c) => c.toLowerCase() !== name.toLowerCase())
        : [...value.categories, name],
    });
  }

  function addDraft(e?: { preventDefault: () => void }) {
    // Called from a button and from Enter — preventDefault stops the surrounding form submitting.
    e?.preventDefault();
    const name = draft.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (!value.categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      onChange({ ...value, categories: [...value.categories, name] });
    }
    setDraft('');
  }

  // Anything picked that the household does not know about yet is brand new.
  const unknownPicked = value.categories.filter(
    (c) => !known.some((k) => k.name.toLowerCase() === c.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      {!sectionsHidden && (
      <Field label="Which drawer?">
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

      <Field label="Sub-categories" hint="Type a new name to create one.">
        {(known.length > 0 || unknownPicked.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {known.map((k) => (
              <Chip
                key={k.id}
                active={value.categories.some((c) => c.toLowerCase() === k.name.toLowerCase())}
                onClick={() => toggleCategory(k.name)}
              >
                {k.name}
              </Chip>
            ))}
            {unknownPicked.map((name) => (
              <Chip key={name} active onClick={() => toggleCategory(name)}>
                {name} · new
              </Chip>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addDraft(e);
            }}
            placeholder="Veggie, Full meal, Grandma's…"
            aria-label="New sub-category name"
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
