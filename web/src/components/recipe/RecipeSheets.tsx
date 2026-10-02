import { useState } from 'react';
import { api, ApiError, imageUrl } from '../../api/client';
import type { Household, Recipe } from '../../api/types';
import type { Filing } from '../../utils/recipeMeta';
import ImagePicker from '../ImagePicker';
import LinksEditor, { fromDraftLinks, toDraftLinks, type DraftLink } from '../LinksEditor';
import RecipeClassifier from '../RecipeClassifier';
import { Icon } from '../icons';
import { Alert, Button, ErrorText, List, Row, SectionLabel, Sheet, Tile } from '../ui';

/*
 What the recipe page's ••• opens (the mockup's 3.11), and the sheets and the one alert behind
 its rows: organising it, its photos and links, and deleting it (3.20).
*/

export type RecipeOption = 'organise' | 'media' | 'share' | 'card' | 'edit' | 'delete' | 'move';

/**
 * The recipe's options, as grouped rows. Changing a recipe — editing, deleting, its photos,
 * sharing it on — is for the household that owns it; a recipe shared with you can be filed in
 * your own drawers ("Move into my recipes"), and organised once it is.
 */
export function RecipeOptionsSheet({
  recipe,
  mine,
  sharedWithMine,
  onPick,
  onClose,
}: {
  recipe: Recipe;
  mine: boolean;
  /** How many of your other households it is shared into. */
  sharedWithMine: number;
  onPick: (option: RecipeOption) => void;
  onClose: () => void;
}) {
  const moving = recipe.shared && !recipe.section;
  // The cover is named on its own, so the count is the other photos (the mockup's "Cover photo,
  // 4 photos"), not the cover twice.
  const pictures = new Set(recipe.photoIds.filter((id) => id !== recipe.coverImageId)).size;
  const media = [
    recipe.coverImageId ? 'Cover photo' : null,
    pictures ? `${pictures} ${pictures === 1 ? 'photo' : 'photos'}` : null,
    recipe.links.length ? `${recipe.links.length} ${recipe.links.length === 1 ? 'link' : 'links'}` : null,
  ].filter(Boolean);
  const shareState = [
    recipe.published ? 'In Explore' : null,
    sharedWithMine ? `shared with ${sharedWithMine} ${sharedWithMine === 1 ? 'household' : 'households'}` : null,
  ].filter(Boolean);

  return (
    // No title row, as in the mockup's 3.11: the rows are the whole sheet, under its handle.
    <Sheet title={recipe.name} label="Recipe options" head={<></>} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <List label="Recipe" inset={0}>
          {!moving && (
            <Row
              onClick={() => onPick('organise')}
              lead={<Tile icon="folder" tone="mustard" size={34} />}
              title="Organise"
              subtitle="Drawer and groups"
              chevron
            />
          )}
          {mine && (
            <Row
              onClick={() => onPick('media')}
              lead={<Tile icon="image" tone="sky" size={34} />}
              title="Photos & links"
              subtitle={media.length ? media.join(', ') : 'No photos or links yet'}
              chevron
            />
          )}
          {mine && (
            <Row
              onClick={() => onPick('share')}
              lead={<Tile icon="share" tone="herb" size={34} />}
              title="Share"
              subtitle={shareState.length ? capitalise(shareState.join(' · ')) : 'Link, other households, Explore'}
              chevron
            />
          )}
          <Row
            onClick={() => onPick('card')}
            lead={<Tile icon="book" tone="plum" size={34} />}
            title="Index card"
            subtitle="The recipe on a kitchen card"
          />
        </List>

        {mine && (
          <List label="Change it" inset={0}>
            <Row onClick={() => onPick('edit')} lead={<Tile icon="pen" tone="accent" size={34} />} title="Edit recipe" />
            <Row
              onClick={() => onPick('delete')}
              lead={<Tile icon="trash" tone="accent" size={34} />}
              title="Delete"
              titleClassName="text-accent-ink"
              subtitle="Asks first"
            />
          </List>
        )}

        {moving && (
          <List label="Shared with you" inset={0}>
            <Row
              onClick={() => onPick('move')}
              lead={<Tile icon="arrowR" tone="plum" size={34} />}
              title="Move into my recipes"
              subtitle={`Shared by ${recipe.ownerName ?? 'another household'}: pick a drawer for it`}
            />
          </List>
        )}
      </div>
    </Sheet>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The drawer and groups this household keeps the recipe in. For a recipe shared with you and not
 * filed yet, the same thing is "Move into my recipes": once it has a drawer it is one of yours to
 * find, though still the other household's to change.
 */
export function OrganiseSheet({
  recipe,
  householdId,
  onSaved,
  onClose,
}: {
  recipe: Recipe;
  householdId: string;
  onSaved: (recipe: Recipe) => void;
  onClose: () => void;
}) {
  const moving = recipe.shared && !recipe.section;
  // An unfiled shared recipe has no drawer yet; Dinner is the least surprising place to start.
  const [draft, setDraft] = useState<Filing>({ section: recipe.section ?? 'DINNER', categories: recipe.categories });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api<Recipe>('PUT', `/api/households/${householdId}/recipes/${recipe.id}/filing`, draft));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cannot reach the server.');
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={moving ? 'Move into my recipes' : 'Organise'}
      subtitle={moving ? `Shared by ${recipe.ownerName ?? 'another household'}. Only they can change it.` : recipe.name}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <RecipeClassifier householdId={householdId} value={draft} onChange={setDraft} />
        {error && <ErrorText>{error}</ErrorText>}
        <Button size="lg" full disabled={busy} onClick={save}>
          {busy ? 'Saving…' : moving ? 'Move into my recipes' : 'Save'}
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * The recipe's pictures — which one is the cover, adding more, taking one away — and its links.
 * Pictures save the moment they change; links have one button that saves them and closes, so
 * there is never a Done beside a Save leaving people to wonder whether Done throws edits away.
 */
export function PhotosLinksSheet({
  recipe,
  householdId,
  onChange,
  onClose,
}: {
  recipe: Recipe;
  householdId: string;
  onChange: (recipe: Recipe) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<DraftLink[]>(() => toDraftLinks(recipe.links));
  const [error, setError] = useState<string | null>(null);
  const linksChanged =
    JSON.stringify(fromDraftLinks(links)) !== JSON.stringify(recipe.links.map((l) => ({ url: l.url, label: l.label })));

  /** One call sets both cover and strip, so every change goes through the same endpoint. */
  async function saveImages(coverImageId: string | null, photoIds: string[]) {
    setBusy(true);
    setError(null);
    try {
      onChange(await api<Recipe>('PUT', `/api/recipes/${recipe.id}/images`, { coverImageId, photoIds }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the photos.');
    } finally {
      setBusy(false);
    }
  }

  async function saveLinksAndClose() {
    if (!linksChanged) return onClose();
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Recipe>('PUT', `/api/recipes/${recipe.id}/links`, { links: fromDraftLinks(links) });
      onChange(saved);
      onClose();
    } catch (err) {
      // Said next to the field: the recipe behind the sheet is fine.
      setError(err instanceof Error ? err.message : 'Could not save those links.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Photos & links" subtitle={recipe.name} onClose={onClose} tall>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2.5">
          <SectionLabel className="!px-0">Photos</SectionLabel>
          {recipe.photoIds.length === 0 ? (
            <p className="text-sm text-muted">No photos yet. The first one you add becomes the cover.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {recipe.photoIds.map((id) => {
                const cover = recipe.coverImageId === id;
                return (
                  <li key={id} className="flex flex-col gap-1">
                    <div className="relative">
                      <img src={imageUrl(id)} alt="" className="aspect-square w-full rounded-xl object-cover" />
                      {cover && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[0.6875rem] font-semibold text-[#2B211A]">
                          Cover
                        </span>
                      )}
                    </div>
                    <div className="flex items-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 flex-1 px-1"
                        disabled={busy || cover}
                        onClick={() => saveImages(id, recipe.photoIds)}
                      >
                        {cover ? 'Cover' : 'Make cover'}
                      </Button>
                      <button
                        type="button"
                        aria-label="Remove photo"
                        title="Remove photo"
                        disabled={busy}
                        onClick={() =>
                          saveImages(cover ? null : recipe.coverImageId, recipe.photoIds.filter((p) => p !== id))
                        }
                        className="press flex h-8 w-8 items-center justify-center rounded-lg text-muted active:bg-surface2 disabled:opacity-40"
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <ImagePicker
            householdId={householdId}
            multiple
            onUploaded={(ids) => saveImages(recipe.coverImageId ?? ids[0] ?? null, [...recipe.photoIds, ...ids])}
          >
            Add photos
          </ImagePicker>
        </section>

        <section className="flex flex-col gap-1">
          <SectionLabel className="!px-0">Links</SectionLabel>
          <p className="text-sm text-muted">Where it came from, a video of it being made — as many as you like.</p>
          <LinksEditor value={links} onChange={setLinks} />
        </section>

        {error && <ErrorText>{error}</ErrorText>}
        <Button size="lg" full variant={linksChanged ? 'primary' : 'secondary'} disabled={busy} onClick={saveLinksAndClose}>
          {linksChanged ? 'Save links' : 'Done'}
        </Button>
      </div>
    </Sheet>
  );
}

/**
 * "Delete Lemon herb chicken?" (3.20). The other households it was shared into are named, from
 * what this household already knows — their plan keeps the meal under its name, as text, rather
 * than losing a day. The server does not say whose plans it is on, so it says "if".
 */
export function DeleteRecipeAlert({
  recipe,
  households,
  onDeleted,
  onCancel,
}: {
  recipe: Recipe;
  /** Your households, to name the ones it is shared into. */
  households: Household[];
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const named = households.filter((h) => h.id !== recipe.householdId && recipe.sharedWith.includes(h.id));
  const elsewhere = recipe.sharedWith.length > named.length || recipe.published;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', `/api/recipes/${recipe.id}`);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that.');
      setBusy(false);
    }
  }

  return (
    <Alert
      icon="trash"
      tone="accent"
      title={`Delete ${recipe.name}?`}
      onDismiss={busy ? () => undefined : onCancel}
      actions={
        <>
          <Button className="h-[2.875rem]" full disabled={busy} onClick={remove}>
            {busy ? 'Deleting…' : 'Delete recipe'}
          </Button>
          <Button className="h-[2.875rem]" variant="secondary" full disabled={busy} onClick={onCancel}>
            Keep it
          </Button>
        </>
      }
    >
      {/* One short paragraph, as the mockup's 3.20. The server does not say whose plans it is
          on, or when, so it names who it is shared with and says "if". */}
      <div className="flex flex-col gap-2">
        {named.length > 0 ? (
          <p>
            It's shared with <NameList names={named.map((h) => h.name)} />: if it's on their plan, it stays there as
            text. This can't be undone.
          </p>
        ) : elsewhere ? (
          <p>Anyone who planned it keeps the name on their plan as text. This can't be undone.</p>
        ) : (
          <p>It comes off your plan and any share link stops working. This can't be undone.</p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </Alert>
  );
}

/** "Beach crew", "Beach crew and Uni flat", "A, B and C" — each name in bold. */
function NameList({ names }: { names: string[] }) {
  return (
    <>
      {names.map((n, i) => (
        <span key={n}>
          {i > 0 && (i === names.length - 1 ? ' and ' : ', ')}
          <b className="font-semibold text-ink">{n}</b>
        </span>
      ))}
    </>
  );
}
