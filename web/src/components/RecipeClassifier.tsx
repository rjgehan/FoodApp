import { useState, type ReactNode } from 'react';
import type { RecipeCategory, RecipeSection } from '../api/types';
import { Chip, Field, SectionLabel } from './ui';
import { SECTION_OPTIONS, moveToDrawer, type Filing } from '../utils/recipeMeta';
import { sameName, tagsIn } from '../utils/tags';
import { AddTagChip, NewTagField } from './catalogue/CatalogueParts';
import { useTags } from './catalogue/catalogueStore';

/**
 * Files a recipe: which drawer it goes in, and which of that drawer's tags it wears — as many as
 * fit, "Chicken" and "Quick" both. Every tag is a chip, flat and A to Z. "+ New tag" types one the
 * drawer does not have yet; the server makes it in the recipe's drawer when the recipe is saved.
 */
export default function RecipeClassifier({
  householdId,
  value,
  onChange,
  sectionsHidden = false,
  tags,
  sectionLabels = false,
}: {
  householdId: string;
  value: Filing;
  onChange: (next: Filing) => void;
  /** The add-recipe form shows its own drawer picker, so it suppresses this one. */
  sectionsHidden?: boolean;
  /** The household's tags, when the caller already has them; otherwise the kept ones are used. */
  tags?: RecipeCategory[];
  /**
   * Head the two parts "Drawer" and "Tags" in the sheet's own section labels, for a sheet whose
   * other parts are headed that way ("Which household" in Move into my recipes).
   */
  sectionLabels?: boolean;
}) {
  const kept = useTags(tags ? null : householdId);
  const known = tags ?? kept ?? [];
  const [parked, setParked] = useState<string[]>([]);
  const [naming, setNaming] = useState(false);

  function chooseSection(section: RecipeSection) {
    const moved = moveToDrawer(value, section, known, parked);
    setParked(moved.parked);
    onChange(moved.filing);
  }

  const inDrawer = tagsIn(known, value.section);
  const isPicked = (name: string) => value.categories.some((c) => sameName(c, name));

  function toggle(name: string) {
    onChange({
      ...value,
      categories: isPicked(name) ? value.categories.filter((c) => !sameName(c, name)) : [...value.categories, name],
    });
  }

  function addNew(name: string) {
    setNaming(false);
    const existing = inDrawer.find((t) => sameName(t.name, name));
    if (!isPicked(name)) onChange({ ...value, categories: [...value.categories, existing?.name ?? name] });
  }

  // Anything ticked that this drawer has no tag for yet is brand new.
  const typedNew = value.categories.filter((c) => !inDrawer.some((t) => sameName(t.name, c)));

  return (
    <div className="space-y-4">
      {!sectionsHidden && (
        <Part label={sectionLabels ? 'Drawer' : 'Filed under'} asSection={sectionLabels}>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Drawer">
            {SECTION_OPTIONS.map((s) => (
              <Chip key={s.value} active={value.section === s.value} onClick={() => chooseSection(s.value)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </Part>
      )}

      <Part label="Tags" asSection={sectionLabels} hint="As many as fit — Chicken and Quick, say.">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">
          {inDrawer.map((tag) => (
            <Chip key={tag.id} active={isPicked(tag.name)} onClick={() => toggle(tag.name)}>
              {tag.name}
            </Chip>
          ))}
          {typedNew.map((name) => (
            <Chip key={name} active onClick={() => toggle(name)}>
              {name} · new
            </Chip>
          ))}
          {naming ? (
            <NewTagField onSubmit={addNew} onCancel={() => setNaming(false)} submitOnBlur />
          ) : (
            <AddTagChip label="New tag" onClick={() => setNaming(true)} />
          )}
        </div>
      </Part>
    </div>
  );
}

/** One part of the classifier, headed as a form field or as a sheet section. */
function Part({ label, hint, asSection, children }: { label: string; hint?: string; asSection: boolean; children: ReactNode }) {
  if (!asSection) return <Field label={label} hint={hint}>{children}</Field>;
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
