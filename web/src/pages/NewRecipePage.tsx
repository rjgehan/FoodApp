import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHousehold } from '../household/HouseholdContext';
import RecipeForm from '../components/RecipeForm';
import { WriteForMe } from '../components/RecipeWriter';
import { useAiAvailable } from '../utils/useAiAvailable';
import { Button, Card, EmptyState } from '../components/ui';
import { ChevronLeftIcon } from '../components/icons';

export default function NewRecipePage() {
  const { activeHouseholdId } = useHousehold();
  const navigate = useNavigate();
  // Writing it out yourself is the normal way in; having it written is the shortcut.
  const [assisted, setAssisted] = useState(false);
  const writerAvailable = useAiAvailable();

  if (!activeHouseholdId) {
    return (
      <Card>
        <EmptyState>Create or select a household first.</EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/recipes')}>
          <ChevronLeftIcon className="h-5 w-5" />
          Recipes
        </Button>
        {writerAvailable && (
          <Button variant="secondary" size="sm" onClick={() => setAssisted((v) => !v)}>
            {assisted ? 'Write it out' : '✨ Write it for me'}
          </Button>
        )}
      </div>

      {assisted ? (
        <WriteForMe householdId={activeHouseholdId} onSaved={(r) => navigate(`/recipes/${r.id}`, { replace: true })} />
      ) : (
        <RecipeForm householdId={activeHouseholdId} onSaved={(r) => navigate(`/recipes/${r.id}`, { replace: true })} />
      )}
    </div>
  );
}
