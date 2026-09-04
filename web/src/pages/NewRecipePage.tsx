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
      // The server already worked out what went wrong — out of credit, busy, a model this key
      // cannot use — so show that rather than a shrug. Falling back only when it said nothing.
      const fromServer = err instanceof ApiError
        ? (err.body as { message?: string } | null)?.message
        : null;
      setError(fromServer ?? "Couldn't write that one. Try again, or write it out yourself.");
    } finally {
      setBusy(false);
    }
  }

  if (busy) {
    return <Writing name={name.trim()} />;
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

/**
 * Twenty seconds is a long time to look at a disabled button. This shows the name being written,
 * a real elapsed count, and a line about what is happening — and says so plainly when Google is
 * taking longer than usual, rather than leaving you wondering whether it worked.
 *
 * The stages are reassurance, not telemetry: the API is a single request that either answers or
 * does not, and there is no progress to report. So nothing here claims a percentage, and the one
 * genuinely factual number — the seconds — is the one shown.
 */
function Writing({ name }: { name: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const stages = [
    'Thinking about what goes in it…',
    'Working out the quantities…',
    'Writing the method…',
    'Tidying it up…',
  ];
  // Slower than the stages are numerous, so the last one holds rather than looping back around
  // and implying it has started over.
  const stage = stages[Math.min(Math.floor(seconds / 5), stages.length - 1)];
  const slow = seconds >= 40;

  return (
    <Card>
      <div className="space-y-4 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate font-medium">
            Writing {name ? <span className="text-accent">{name}</span> : 'your recipe'}…
          </p>
          <span className="shrink-0 text-sm tabular-nums text-muted">{seconds}s</span>
        </div>

        {/* Indeterminate on purpose: a bar that filled to a percentage would be making it up. */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
          <div className="h-full w-1/3 animate-slide rounded-full bg-accent" />
        </div>

        <p className="text-sm text-muted">{slow ? "Still going — it's being slow today." : stage}</p>
      </div>
    </Card>
  );
}
