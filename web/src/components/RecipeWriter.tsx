import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Recipe, RecipeSection } from '../api/types';
import RecipeForm, { type RecipeDraft } from './RecipeForm';
import { Button, Card, ErrorText, Field, Input, NumberInput } from './ui';

/**
 * Give it a name and a serving count and it writes the recipe, then drops it into the ordinary
 * form. Nothing is saved until you press the button yourself: a written recipe gets quantities
 * wrong often enough that you want a look at it first.
 *
 * Used from the Recipes tab and from the meal planner, which passes the name you already typed.
 */
export function WriteForMe({
  householdId,
  initialName = '',
  initialServings = 4,
  section,
  groups,
  onSaved,
}: {
  householdId: string;
  initialName?: string;
  initialServings?: number;
  /** Where the finished recipe is filed to begin with. */
  section?: RecipeSection;
  /** Groups the recipe starts in — see RecipeForm. */
  groups?: string[];
  onSaved: (recipe: Recipe) => void;
}) {
  const [name, setName] = useState(initialName);
  const [servings, setServings] = useState<number | null>(initialServings);
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
        <RecipeForm key={draft.name} householdId={householdId} draft={draft} section={section} groups={groups} onSaved={onSaved} />
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
