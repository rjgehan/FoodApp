import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { RecipeCategory } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import RecipeForm from '../components/RecipeForm';
import { WriteForMe } from '../components/RecipeWriter';
import { PasteFromChatGpt } from '../components/RecipePaste';
import { useAiAvailable } from '../utils/useAiAvailable';
import { Button, Card, cx, EmptyState } from '../components/ui';
import { ChevronLeftIcon } from '../components/icons';
import { PageTitle } from '../components/PageTitle';
import { SECTION_OPTIONS, sectionSlug } from '../utils/recipeMeta';

type Mode = 'type' | 'paste' | 'write';

/**
 * Three ways in: type it out yourself (the normal one), paste a recipe from ChatGPT or anywhere
 * else, or have it written. All three end in the same form, checked before it is saved.
 *
 * Opened from inside a drawer or a group (`?section=DINNER&group=<id>`), every way in starts
 * filed there — the drawer picked and the group ticked, and both still yours to change.
 */
export default function NewRecipePage() {
  const { activeHouseholdId } = useHousehold();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>('type');
  const writerAvailable = useAiAvailable();

  const section = SECTION_OPTIONS.find((s) => s.value === params.get('section'))?.value;
  const groupId = params.get('group');
  // The filing is read once, when the form starts, so the group's name has to be known first.
  // Undefined while it is looked up; an empty list if the group is not there any more.
  const [groups, setGroups] = useState<string[] | undefined>(groupId ? undefined : []);

  useEffect(() => {
    if (!groupId || !activeHouseholdId) return;
    let live = true;
    api<RecipeCategory[]>('GET', `/api/households/${activeHouseholdId}/recipe-categories`)
      .then((all) => all.find((c) => c.id === groupId))
      .catch(() => undefined)
      .then((group) => live && setGroups(group ? [group.name] : []));
    return () => {
      live = false;
    };
  }, [groupId, activeHouseholdId]);

  if (!activeHouseholdId) {
    return (
      <Card>
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  const done = (id: string) => navigate(`/recipes/${id}`, { replace: true });
  // Back to the drawer or group it was started from, not to the front of the catalog.
  const backTo = section
    ? `/recipes/section/${sectionSlug(section)}${groupId ? `?group=${encodeURIComponent(groupId)}` : ''}`
    : '/recipes';
  const modes: { value: Mode; label: string }[] = [
    { value: 'type', label: 'Type it out' },
    { value: 'paste', label: 'Paste' },
    // Only when a key is set up — a button that can only fail is worse than none.
    ...(writerAvailable ? [{ value: 'write' as Mode, label: '✨ Write it for me' }] : []),
  ];

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-3" onClick={() => navigate(backTo)}>
        <ChevronLeftIcon className="h-5 w-5" />
        {section ? 'Back' : 'Recipes'}
      </Button>

      <PageTitle title="New recipe" />

      <div className="flex rounded-xl bg-elevated p-0.5" role="tablist" aria-label="How to add it">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={mode === m.value}
            onClick={() => setMode(m.value)}
            className={cx(
              'h-9 flex-1 rounded-lg px-2 text-sm font-medium transition-colors',
              mode === m.value ? 'bg-surface text-ink shadow-sm' : 'text-muted',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {groups === undefined ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : mode === 'write' ? (
        <WriteForMe householdId={activeHouseholdId} section={section} groups={groups} onSaved={(r) => done(r.id)} />
      ) : mode === 'paste' ? (
        <PasteFromChatGpt householdId={activeHouseholdId} section={section} groups={groups} onSaved={(r) => done(r.id)} />
      ) : (
        <RecipeForm householdId={activeHouseholdId} section={section} groups={groups} onSaved={(r) => done(r.id)} />
      )}
    </div>
  );
}
