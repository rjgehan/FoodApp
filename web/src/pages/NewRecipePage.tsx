import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import RecipeForm, { type RecipeDraft } from '../components/RecipeForm';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Input,
  NumberInput,
} from '../components/ui';
import { ChevronLeftIcon } from '../components/icons';

export default function NewRecipePage() {
  const { activeHouseholdId } = useHousehold();
  const navigate = useNavigate();
  // Writing it out yourself is the normal way in; having it written is the shortcut.
  const [assisted, setAssisted] = useState(false);
  const [writerAvailable, setWriterAvailable] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean }>('GET', '/api/recipe-writer')
      .then((r) => setWriterAvailable(r.enabled))
      .catch(() => setWriterAvailable(false));
  }, []);

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
          <Button variant="ghost" size="sm" onClick={() => setAssisted((v) => !v)}>
            {assisted ? 'Write it out' : 'Write it for me'}
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

/**
 * Give it a name and a serving count and it writes the recipe, then drops it into the ordinary
 * form. Nothing is saved until you press the button yourself: a written recipe gets quantities
 * wrong often enough that you want a look at it first.
 */
function WriteForMe({
  householdId,
  onSaved,
}: {
  householdId: string;
  onSaved: (recipe: Recipe) => void;
}) {
  const [name, setName] = useState('');
  const [servings, setServings] = useState<number | null>(4);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setDraft(
        await api<RecipeDraft>('POST', `/api/households/${householdId}/recipes/generate`, {
          name: name.trim(),
          servings: servings ?? 4,
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 503
          ? 'Recipe writing is not switched on for this server.'
          : "Couldn't write that one. Try again, or write it out yourself.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (draft) {
    return (
      <div className="space-y-4">
        <Card>
          <p className="text-sm text-muted">
            Here's a draft — check the amounts, change anything, then save it.
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setDraft(null)}>
            Start over
          </Button>
        </Card>
        {/* Keyed on the name so asking twice really does replace the fields. */}
        <RecipeForm key={draft.name} householdId={householdId} draft={draft} onSaved={onSaved} />
      </div>
    );
  }

  return (
    <form onSubmit={generate} className="space-y-4">
      <Card>
        <div className="space-y-3">
          <Field label="What do you want to make?">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Chicken parmesan"
            />
          </Field>
          <Field label="Serves">
            <NumberInput min={1} className="w-24" value={servings} onChange={setServings} />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" full size="lg" disabled={busy || !name.trim()}>
            {busy ? 'Writing…' : 'Write it for me'}
          </Button>
          <p className="text-sm text-muted">
            It makes the recipe up rather than looking one up, so it's for ideas — not for
            getting a family recipe back.
          </p>
        </div>
      </Card>
    </form>
  );
}
