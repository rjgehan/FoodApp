import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHousehold } from '../household/HouseholdContext';
import RecipeForm from '../components/RecipeForm';
import { WriteForMe } from '../components/RecipeWriter';
import { PasteFromChatGpt } from '../components/RecipePaste';
import { useAiAvailable } from '../utils/useAiAvailable';
import { Button, Card, cx, EmptyState } from '../components/ui';
import { ChevronLeftIcon } from '../components/icons';
import { PageTitle } from '../components/PageTitle';

type Mode = 'type' | 'paste' | 'write';

/**
 * Three ways in: type it out yourself (the normal one), paste a recipe from ChatGPT or anywhere
 * else, or have it written. All three end in the same form, checked before it is saved.
 */
export default function NewRecipePage() {
  const { activeHouseholdId } = useHousehold();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('type');
  const writerAvailable = useAiAvailable();

  if (!activeHouseholdId) {
    return (
      <Card>
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  const done = (id: string) => navigate(`/recipes/${id}`, { replace: true });
  const modes: { value: Mode; label: string }[] = [
    { value: 'type', label: 'Type it out' },
    { value: 'paste', label: 'Paste' },
    // Only when a key is set up — a button that can only fail is worse than none.
    ...(writerAvailable ? [{ value: 'write' as Mode, label: '✨ Write it for me' }] : []),
  ];

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-3" onClick={() => navigate('/recipes')}>
        <ChevronLeftIcon className="h-5 w-5" />
        Recipes
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

      {mode === 'write' ? (
        <WriteForMe householdId={activeHouseholdId} onSaved={(r) => done(r.id)} />
      ) : mode === 'paste' ? (
        <PasteFromChatGpt householdId={activeHouseholdId} onSaved={(r) => done(r.id)} />
      ) : (
        <RecipeForm householdId={activeHouseholdId} onSaved={(r) => done(r.id)} />
      )}
    </div>
  );
}
