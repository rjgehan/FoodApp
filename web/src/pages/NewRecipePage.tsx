import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { RecipeCategory } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import RecipeForm from '../components/RecipeForm';
import { FromALink } from '../components/RecipeFromLink';
import { PasteFromAi } from '../components/RecipePaste';
import { Button, Card, cx, EmptyState } from '../components/ui';
import { ChevronLeftIcon } from '../components/icons';
import { PageTitle } from '../components/PageTitle';
import { SECTION_OPTIONS, sectionSlug } from '../utils/recipeMeta';

type Mode = 'type' | 'link' | 'paste';

/**
 * Three ways in: type it out yourself (the normal one), read it off a link — a TikTok, a Reel or
 * a recipe site — or paste one an AI wrote in the layout the app can read. All three end in the
 * same form, checked before it is saved.
 *
 * Opened from inside a drawer or a group (`?section=DINNER&group=<id>`), every way in starts
 * filed there — the drawer picked and the group ticked, and both still yours to change.
 */
export default function NewRecipePage() {
  const { activeHouseholdId } = useHousehold();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>('type');
  /** A link pasted into Paste, carried over to From a link. */
  const [handedLink, setHandedLink] = useState('');

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
    { value: 'link', label: 'From a link' },
    { value: 'paste', label: 'Paste' },
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
      ) : (
        /*
         * All three stay mounted and only the chosen one shows, so a stray tap on another tab
         * does not throw away a half-typed recipe, a paste, or a link's draft not saved yet.
         */
        modes.map((m) => (
          <div key={m.value} role="tabpanel" aria-label={m.label} hidden={mode !== m.value}>
            {m.value === 'link' ? (
              <FromALink
                householdId={activeHouseholdId}
                link={handedLink}
                section={section}
                groups={groups}
                onSaved={(r) => done(r.id)}
              />
            ) : m.value === 'paste' ? (
              <PasteFromAi
                householdId={activeHouseholdId}
                section={section}
                groups={groups}
                onLink={(link) => {
                  setHandedLink(link);
                  setMode('link');
                }}
                onSaved={(r) => done(r.id)}
              />
            ) : (
              <RecipeForm householdId={activeHouseholdId} section={section} groups={groups} onSaved={(r) => done(r.id)} />
            )}
          </div>
        ))
      )}
    </div>
  );
}
