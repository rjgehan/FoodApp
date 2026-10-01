import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, imageUrl } from '../api/client';
import type { Place } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { usePushedScreen } from '../components/Layout';
import { Icon, type IconName } from '../components/icons';
import ImagePicker from '../components/ImagePicker';
import NoHousehold from '../components/NoHousehold';
import {
  Button,
  ConfirmAlert,
  cx,
  EmptyState,
  ErrorText,
  Field,
  Input,
  NavBar,
  SearchField,
  Sheet,
  Textarea,
  Tile,
  type Tone,
} from '../components/ui';
import { useBackToHousehold } from '../components/household/HouseholdParts';
import { isSafeLink } from '../utils/videoLink';

/** Each place its own colour, in the order they are listed — the mockup's plum, tomato, mustard, sky. */
const PLACE_TONES: Tone[] = ['plum', 'accent', 'mustard', 'sky', 'herb'];

/**
 * Places we eat (mockup 6.5): the restaurants and takeaways a night off is planned at, each with
 * what to order, and the two things you want from one at dinner time — its menu and its phone.
 * Places are also made on the fly from the Plan; this is where their details are filled in.
 */
export default function HouseholdPlacesPage() {
  usePushedScreen();
  const { activeHouseholdId } = useHousehold();
  const back = useBackToHousehold();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Place | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!activeHouseholdId) return;
    setPlaces(await api<Place[]>('GET', `/api/households/${activeHouseholdId}/places`).catch(() => []));
  }, [activeHouseholdId]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = (places ?? []).map((place, i) => ({ place, tone: PLACE_TONES[i % PLACE_TONES.length] }));
    if (!q) return all;
    return all.filter(({ place }) => `${place.name} ${place.notes ?? ''}`.toLowerCase().includes(q));
  }, [places, query]);

  if (!activeHouseholdId) return <NoHousehold />;

  return (
    <div className="mx-auto max-w-3xl pb-6">
      <NavBar
        title="Places we eat"
        backLabel="Household"
        back={back}
        className="-mx-1 mb-1.5"
        right={
          <button type="button" aria-label="Add a place" title="Add a place" className="press" onClick={() => setAdding(true)}>
            <Icon name="plus" size={22} />
          </button>
        }
      />

      <div className="space-y-3">
        <SearchField
          placeholder="Search places"
          aria-label="Search places"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-[2.75rem]"
        />

        {places === null ? (
          <p className="py-6 text-center text-sm text-muted">Loading…</p>
        ) : places.length === 0 ? (
          <div className="space-y-3 pt-4 text-center">
            <EmptyState>Nowhere saved yet.</EmptyState>
            <p className="-mt-4 text-sm text-muted">
              A night out is planned like a meal — pick the place instead of a recipe, and nothing goes on the grocery
              list.
            </p>
            <Button variant="secondary" icon="plus" onClick={() => setAdding(true)}>
              Add a place
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <EmptyState>Nothing called “{query.trim()}”.</EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Places">
            {shown.map(({ place, tone }) => (
              <PlaceCard key={place.id} place={place} tone={tone} onOpen={() => setEditing(place)} />
            ))}
          </ul>
        )}
      </div>

      {adding && activeHouseholdId && (
        <NewPlaceSheet
          householdId={activeHouseholdId}
          onClose={() => setAdding(false)}
          onCreated={async (created) => {
            setAdding(false);
            await load();
            // Straight into the details, since adding a name is never the actual goal.
            setEditing(created);
          }}
        />
      )}
      {editing && activeHouseholdId && (
        <PlaceSheet
          householdId={activeHouseholdId}
          place={editing}
          onClose={() => setEditing(null)}
          onChanged={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/** One place as the mockup's card: its tile, name and notes, then Menu and Call. Tap it to edit. */
function PlaceCard({ place, tone, onOpen }: { place: Place; tone: Tone; onOpen: () => void }) {
  const hasMenu = isSafeLink(place.menuUrl);
  return (
    <li className="card flex flex-col gap-2.5 p-3.5">
      <button type="button" onClick={onOpen} className="press flex w-full items-center gap-3 text-left">
        {place.imageId ? (
          <img src={imageUrl(place.imageId)} alt="" className="h-[42px] w-[42px] shrink-0 rounded-[13px] object-cover" />
        ) : (
          <Tile icon="store" tone={tone} size={42} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{place.name}</span>
          {place.notes ? (
            <span className="block text-[0.8125rem] leading-[1.35] text-muted">{place.notes}</span>
          ) : (
            <span className="block text-[0.8125rem] text-faint">No notes</span>
          )}
        </span>
      </button>
      <div className="mt-auto flex gap-2">
        <PlaceLink icon="globe" href={hasMenu ? place.menuUrl! : null} label={`Menu for ${place.name}`} external>
          Menu
        </PlaceLink>
        {/* Strip formatting: tel: wants digits, not "(555) 123-4567". */}
        <PlaceLink icon="phone" href={place.phone ? `tel:${place.phone.replace(/[^+\d]/g, '')}` : null} label={`Call ${place.name}`}>
          Call
        </PlaceLink>
      </div>
    </li>
  );
}

/**
 * Menu or Call: a link that looks like the mockup's small secondary button. With nothing to open
 * it stays where it is, faded, so the card keeps its shape and says what is missing.
 */
function PlaceLink({
  icon,
  href,
  label,
  external = false,
  children,
}: {
  icon: IconName;
  href: string | null;
  label: string;
  external?: boolean;
  children: ReactNode;
}) {
  const cls =
    'press inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[11px] border border-line bg-surface text-[0.875rem] font-semibold text-ink';
  if (!href)
    return (
      <span aria-disabled="true" aria-label={`${label}: not saved yet`} className={cx(cls, 'opacity-45')}>
        <Icon name={icon} size={16} />
        {children}
      </span>
    );
  return (
    <a
      href={href}
      aria-label={label}
      className={cx(cls, 'active:bg-surface2')}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >
      <Icon name={icon} size={16} />
      {children}
    </a>
  );
}

function NewPlaceSheet({
  householdId,
  onClose,
  onCreated,
}: {
  householdId: string;
  onClose: () => void;
  onCreated: (place: Place) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await api<Place>('POST', `/api/households/${householdId}/places`, { name: name.trim() }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="New place" onClose={onClose}>
      <form onSubmit={add} className="space-y-4">
        <Field label="Name">
          <Input
            autoFocus
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tony's, Chinese, pizza…"
          />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" size="lg" full disabled={busy || !name.trim()}>
          Add place
        </Button>
      </form>
    </Sheet>
  );
}

/** A place's details: its photo, name, menu link, phone and what to order. */
function PlaceSheet({
  householdId,
  place,
  onClose,
  onChanged,
}: {
  householdId: string;
  place: Place;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Place>(place);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api('PUT', `/api/places/${place.id}`, {
        name: draft.name,
        menuUrl: draft.menuUrl,
        phone: draft.phone,
        notes: draft.notes,
        imageId: draft.imageId,
      });
      await onChanged();
    } catch (err) {
      const message = err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null;
      setError(message ?? 'Could not save that.');
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api('DELETE', `/api/places/${place.id}`);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete it.');
      setDeleting(false);
      setBusy(false);
    }
  }

  return (
    <Sheet title={place.name} onClose={onClose}>
      <div className="space-y-4">
        {draft.imageId && <img src={imageUrl(draft.imageId)} alt="" className="aspect-[4/3] w-full rounded-card object-cover" />}
        <ImagePicker householdId={householdId} onUploaded={(ids) => setDraft({ ...draft, imageId: ids[0] ?? null })}>
          {draft.imageId ? 'Replace photo' : 'Add a photo'}
        </ImagePicker>

        <Field label="Name">
          <Input aria-label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Menu link">
          <Input
            aria-label="Menu link"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={draft.menuUrl ?? ''}
            onChange={(e) => setDraft({ ...draft, menuUrl: e.target.value || null })}
          />
        </Field>
        <Field label="Phone">
          <Input
            aria-label="Phone"
            type="tel"
            inputMode="tel"
            placeholder="(555) 123-4567"
            value={draft.phone ?? ''}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value || null })}
          />
        </Field>
        <Field label="Notes" hint="What to order, where to park.">
          <Textarea aria-label="Notes" rows={2} value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })} />
        </Field>

        {error && <ErrorText>{error}</ErrorText>}
        <Button size="lg" full disabled={busy || !draft.name.trim()} onClick={save}>
          Save
        </Button>
        <Button size="lg" variant="danger" full icon="trash" disabled={busy} onClick={() => setDeleting(true)}>
          Delete place
        </Button>
      </div>
      {deleting && (
        <ConfirmAlert
          title={`Delete ${place.name}?`}
          icon="trash"
          confirmLabel="Delete"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setDeleting(false)}
        >
          Deleting also clears any planned nights at this place.
        </ConfirmAlert>
      )}
    </Sheet>
  );
}
