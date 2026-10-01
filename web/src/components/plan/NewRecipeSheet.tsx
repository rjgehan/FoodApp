import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Recipe, RecipeSection, SavedLink } from '../../api/types';
import RecipeForm from '../RecipeForm';
import { FromALink } from '../RecipeFromLink';
import { PasteFromAi } from '../RecipePaste';
import type { IconName } from '../icons';
import { Button, cx, ErrorText, Field, Input, Sheet, Tile, type Tone } from '../ui';

type Way = 'name' | 'write' | 'link' | 'paste';

const WAYS: { way: Way; icon: IconName; tone: Tone; title: string; detail: string }[] = [
  { way: 'name', icon: 'pen', tone: 'accent', title: 'Just the name', detail: 'Fill it in later' },
  { way: 'write', icon: 'list', tone: 'herb', title: 'Type it out', detail: 'Ingredients + method' },
  { way: 'link', icon: 'link', tone: 'sky', title: 'From a link', detail: 'Site, TikTok, YouTube' },
  { way: 'paste', icon: 'clipboard', tone: 'plum', title: 'Paste from an AI', detail: 'We give you the prompt' },
];

/**
 * Making the recipe you were about to plan without leaving the plan (the mockup's 2.6). The four
 * ways in as cards; just the name is the quick one — mid-planning you rarely want to type a whole
 * recipe — at the cost of it adding nothing to Groceries until the ingredients go in, which the
 * plan then points out. Whichever way, the new recipe goes straight into the slot.
 */
export default function NewRecipeSheet({
  householdId,
  initialName,
  section,
  servings,
  slotLabel,
  onSaved,
  onLinkSaved,
  onClose,
}: {
  householdId: string;
  initialName: string;
  section: RecipeSection;
  servings: number;
  /** "Thursday dinner" */
  slotLabel: string;
  onSaved: (recipe: Recipe) => void;
  /** A link kept in Saved links rather than read — it goes into the slot all the same. */
  onLinkSaved: (link: SavedLink) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [way, setWay] = useState<Way>('name');
  const [going, setGoing] = useState(false);
  /** A link pasted into Paste from an AI, handed on to From a link. */
  const [handedLink, setHandedLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveNameOnly() {
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await api<Recipe>('POST', `/api/households/${householdId}/recipes`, {
          name: name.trim(),
          servings,
          section,
          categories: [],
          ingredients: [],
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? 'There is already a recipe called that.' : 'Could not save that.');
      setBusy(false);
    }
  }

  if (going && way !== 'name') {
    const back = (
      // A mis-tap on the choices should not mean closing the sheet and finding the dish again.
      <Button variant="ghost" size="sm" icon="chevL" className="-ml-3 mb-2" onClick={() => setGoing(false)}>
        Back
      </Button>
    );
    return (
      <Sheet title={WAYS.find((w) => w.way === way)!.title} subtitle={`It goes straight into ${slotLabel}.`} onClose={onClose} tall>
        {back}
        {way === 'write' ? (
          <RecipeForm
            householdId={householdId}
            section={section}
            draft={{
              name: name.trim(),
              description: null,
              instructions: null,
              prepTimeMinutes: null,
              cookTimeMinutes: null,
              servings,
              ingredients: [],
            }}
            onSaved={onSaved}
          />
        ) : way === 'link' ? (
          <FromALink
            householdId={householdId}
            link={handedLink}
            initialServings={servings}
            section={section}
            onSaved={onSaved}
            onLinkSaved={onLinkSaved}
          />
        ) : (
          <PasteFromAi
            householdId={householdId}
            initialName={name.trim()}
            initialServings={servings}
            section={section}
            onLink={(link) => {
              setHandedLink(link);
              setWay('link');
            }}
            onSaved={onSaved}
          />
        )}
      </Sheet>
    );
  }

  // Only the name and typing it out need a name to start from; a link or a paste brings its own.
  const needsName = way === 'name' || way === 'write';
  return (
    <Sheet title="New recipe" subtitle={`It goes straight into ${slotLabel}.`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Chicken pot pie" />
        </Field>
        <div role="radiogroup" aria-label="How to make it" className="grid grid-cols-2 gap-2.5">
          {WAYS.map((w) => {
            const on = way === w.way;
            return (
              <button
                key={w.way}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setWay(w.way)}
                className={cx(
                  'card press flex flex-col items-start gap-2 p-3.5 text-left',
                  on && '!border-[1.5px] !border-accent',
                )}
              >
                <Tile icon={w.icon} tone={w.tone} size={36} />
                <span className="text-[0.9375rem] font-semibold">{w.title}</span>
                <span className="text-xs text-muted">{w.detail}</span>
              </button>
            );
          })}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <Button
          size="lg"
          full
          disabled={busy || (needsName && !name.trim())}
          onClick={() => (way === 'name' ? saveNameOnly() : setGoing(true))}
        >
          {busy ? 'Saving…' : way === 'name' ? `Add to ${slotLabel}` : 'Continue'}
        </Button>
      </div>
    </Sheet>
  );
}
