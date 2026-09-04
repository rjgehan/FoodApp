import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, imageUrl } from '../api/client';
import type { RecipeSection } from '../api/types';
import type { HouseholdMember, Place, Recipe } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { DEFAULT_SECTION_ICONS, FOOD_ICONS, iconByKey } from '../components/FoodIcons';
import { SECTION_OPTIONS } from '../utils/recipeMeta';
import {
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  ErrorText,
  Field,
  Input,
  NumberInput,
  Sheet,
} from '../components/ui';
import { PlusIcon, StoreIcon } from '../components/icons';
import PlaceActions from '../components/PlaceActions';
import ImagePicker from '../components/ImagePicker';

export default function HouseholdPage() {
  const { households, activeHousehold, createHousehold } = useHousehold();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const name = newName.trim();
      await createHousehold(name);
      setNewName('');
      setOpen(false);
      setJustCreated(name);
      setTimeout(() => setJustCreated(null), 4000);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {justCreated && (
        <div className="rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
          “{justCreated}” created — you're in it.
        </div>
      )}

      {activeHousehold && <MembersCard householdId={activeHousehold.id} />}
      {activeHousehold && <CatalogIconsCard householdId={activeHousehold.id} />}
      {activeHousehold && <PlacesCard householdId={activeHousehold.id} />}
      <ProfileCard />
      {activeHousehold && <SettingsCard />}
      <AddPersonCard />
      {activeHousehold && <LeaveCard householdId={activeHousehold.id} name={activeHousehold.name} />}
      {activeHousehold && <RecipesCard householdId={activeHousehold.id} />}

      {/*
       * Always available, not just to people with no household. You can belong to several —
       * one for your own place, one for your parents' — and either lets you start another.
       * Opens expanded only when there is nothing else on the page to look at.
       */}
      <Card title={households.length === 0 ? 'Create a household' : 'New household'}>
        {open || households.length === 0 ? (
          <form onSubmit={onCreate} className="space-y-3">
            <Field label="Name">
              <Input
                autoFocus={households.length > 0}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Gehan House"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" full size="lg" disabled={creating || !newName.trim()}>
                Create
              </Button>
              {households.length > 0 && (
                <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        ) : (
          <Button type="button" variant="secondary" full size="lg" onClick={() => setOpen(true)}>
            Start another household
          </Button>
        )}
      </Card>
    </div>
  );
}

/** Picks which built-in illustration each catalog drawer wears. */
function CatalogIconsCard({ householdId }: { householdId: string }) {
  const [icons, setIcons] = useState<Partial<Record<RecipeSection, string>>>({});
  const [editing, setEditing] = useState<RecipeSection | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Partial<Record<RecipeSection, string>>>('GET', `/api/households/${householdId}/section-icons`)
      .then(setIcons)
      .catch(() => setIcons({}));
  }, [householdId]);

  async function choose(section: RecipeSection, iconKey: string) {
    setBusy(true);
    try {
      setIcons(
        await api<Partial<Record<RecipeSection, string>>>(
          'PUT',
          `/api/households/${householdId}/section-icons/${section}`,
          { iconKey },
        ),
      );
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Catalog icons">
      <ul className="space-y-2">
        {SECTION_OPTIONS.map((s) => {
          const current = icons[s.value] ?? DEFAULT_SECTION_ICONS[s.value];
          const Icon = iconByKey(current)?.Icon;
          const open = editing === s.value;

          return (
            <li key={s.value} className="rounded-xl border border-line p-2">
              <button
                type="button"
                onClick={() => setEditing(open ? null : s.value)}
                className="flex min-h-touch w-full items-center gap-3 px-1 text-left"
              >
                {Icon && <Icon className="h-7 w-7 shrink-0 text-accent" />}
                <span className="flex-1 font-medium">{s.label}</span>
                <span className="text-sm text-muted">{open ? 'Close' : 'Change'}</span>
              </button>

              {open && (
                <div className="mt-2 grid grid-cols-6 gap-2">
                  {FOOD_ICONS.map(({ key, label, Icon: Option }) => (
                    <button
                      key={key}
                      type="button"
                      title={label}
                      aria-label={label}
                      disabled={busy}
                      onClick={() => choose(s.value, key)}
                      className={cx(
                        'flex aspect-square items-center justify-center rounded-xl border transition-colors',
                        key === current ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted',
                      )}
                    >
                      <Option className="h-6 w-6" />
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RecipesCard({ householdId }: { householdId: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    api<Recipe[]>('GET', `/api/households/${householdId}/recipes`).then(setRecipes);
  }, [householdId]);

  const mine = recipes.filter((r) => r.householdId === householdId);

  return (
    <Card title={`Our recipes${mine.length ? ` · ${mine.length}` : ''}`}>
      {mine.length === 0 ? (
        <EmptyState>No recipes yet — add some from the Recipes tab.</EmptyState>
      ) : (
        <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {mine.map((r) => (
            <li key={r.id} className="truncate">
              {r.name}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * The places you eat when you are not cooking. Created on the fly from the meal planner, so this
 * card exists to fill in the details afterwards — the menu link and the phone number.
 */
/**
 * Renaming yourself. Two different things: the name everyone sees, and the username you sign in
 * with — which also changes which name you tap on the login screen, so it says so.
 */
function ProfileCard() {
  const { session, setDisplayName } = useAuth();
  const [displayName, setName] = useState(session?.displayName ?? '');
  const [username, setUsername] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The session carries the display name but not the username, so ask who we are.
  useEffect(() => {
    if (!session) return;
    api<{ username: string; displayName: string }>('GET', '/api/users/me')
      .then((me) => {
        setUsername(me.username);
        setName(me.displayName);
      })
      .finally(() => setLoaded(true));
  }, [session]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await api<{ username: string; displayName: string }>('PATCH', '/api/users/me', {
        username: username.trim() || null,
        displayName: displayName.trim() || null,
      });
      setDisplayName(updated.displayName);
      setUsername(updated.username);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Someone already uses that name.'
          : 'Could not save that.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="You">
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Name" hint="What everyone sees.">
          <Input value={displayName} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Username" hint="What you sign in with, and the name you tap on the sign-in screen.">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={loaded ? '' : 'Loading…'}
          />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="secondary" full disabled={busy || !displayName.trim()}>
          {saved ? 'Saved' : 'Save'}
        </Button>
      </form>
    </Card>
  );
}

/**
 * An account that joins no household — for someone who will have their own, or who you just
 * want to be able to share recipes with. They pick a PIN the first time they sign in, and until
 * then they show on the login screen under "Not in a house yet".
 */
function AddPersonCard() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/users', { username: name, displayName: displayName.trim() || null });
      setMade(displayName.trim() || name);
      setUsername('');
      setDisplayName('');
      setTimeout(() => setMade(null), 4000);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Someone already uses that name.'
          : 'Could not add them.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Add someone to the app">
      {made && (
        <div className="mb-3 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
          “{made}” added. They'll see their name on the sign-in screen.
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted">
          Makes an account that isn't in any household. They can start their own, or you can
          invite them to yours later.
        </p>
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="grandad" />
        </Field>
        <Field label="Name" hint="Optional — what they're called on screen.">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Grandad" />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="secondary" full disabled={busy || !username.trim()}>
          Add them
        </Button>
      </form>
    </Card>
  );
}

/** Walking out. Blocked when you are the last one in, because the recipes would go with you. */
function LeaveCard({ householdId, name }: { householdId: string; name: string }) {
  const { refresh, setActiveHouseholdId, households } = useHousehold();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', `/api/households/${householdId}/members/me`);
      const other = households.find((h) => h.id !== householdId);
      if (other) setActiveHouseholdId(other.id);
      await refresh();
    } catch (err) {
      const message = err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null;
      setError(message ?? 'Could not leave.');
      setBusy(false);
    }
  }

  return (
    <Card title="Leave this household">
      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            You'll lose access to “{name}” — its recipes, plan and grocery list stay with everyone
            else. You can be invited back.
          </p>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex gap-2">
            <Button variant="danger" className="flex-1" disabled={busy} onClick={leave}>
              {busy ? 'Leaving…' : 'Leave'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" full onClick={() => setConfirming(true)}>
          Leave “{name}”
        </Button>
      )}
    </Card>
  );
}

function PlacesCard({ householdId }: { householdId: string }) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [editing, setEditing] = useState<Place | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setPlaces(await api<Place[]>('GET', `/api/households/${householdId}/places`).catch(() => []));
  }, [householdId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await api<Place>('POST', `/api/households/${householdId}/places`, { name });
      setNewName('');
      await load();
      // Straight into the details, since adding a name is never the actual goal.
      setEditing(created);
    } finally {
      setBusy(false);
    }
  }

  async function save(place: Place) {
    setBusy(true);
    try {
      await api('PUT', `/api/places/${place.id}`, {
        name: place.name,
        menuUrl: place.menuUrl,
        phone: place.phone,
        notes: place.notes,
        imageId: place.imageId,
      });
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(place: Place) {
    setBusy(true);
    try {
      await api('DELETE', `/api/places/${place.id}`);
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Places we eat">
      {places === null ? (
        <p className="py-2 text-sm text-muted">Loading…</p>
      ) : places.length === 0 ? (
        <EmptyState>Nowhere saved yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {places.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => setEditing(place)}
                className="flex min-h-touch w-full items-center gap-3 py-2.5 text-left"
              >
                {place.imageId ? (
                  <img src={imageUrl(place.imageId)} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <StoreIcon className="h-5 w-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{place.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {[place.phone, place.menuUrl ? 'menu saved' : null].filter(Boolean).join(' · ') || 'Add details'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Tony's, Chinese, pizza…"
          aria-label="New place"
        />
        <Button type="submit" variant="secondary" disabled={busy || !newName.trim()}>
          <PlusIcon className="h-5 w-5" />
          Add
        </Button>
      </form>

      {editing && (
        <PlaceSheet
          householdId={householdId}
          place={editing}
          busy={busy}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function PlaceSheet({
  householdId,
  place,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  householdId: string;
  place: Place;
  busy: boolean;
  onSave: (place: Place) => void;
  onDelete: (place: Place) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Place>(place);

  return (
    <Sheet title={place.name} onClose={onClose}>
      <div className="space-y-4">
        {/* The saved values, not the draft: these open things, so unsaved edits must not. */}
        <div className="flex gap-2">
          <PlaceActions place={place} size="md" />
        </div>

        {draft.imageId && (
          <img
            src={imageUrl(draft.imageId)}
            alt=""
            className="aspect-[4/3] w-full rounded-xl border border-line object-cover"
          />
        )}
        <ImagePicker householdId={householdId} onUploaded={(ids) => setDraft({ ...draft, imageId: ids[0] ?? null })}>
          {draft.imageId ? 'Replace photo' : 'Add a photo'}
        </ImagePicker>

        <Field label="Name">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Menu link">
          <Input
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={draft.menuUrl ?? ''}
            onChange={(e) => setDraft({ ...draft, menuUrl: e.target.value || null })}
          />
        </Field>
        <Field label="Phone">
          <Input
            type="tel"
            inputMode="tel"
            placeholder="(555) 123-4567"
            value={draft.phone ?? ''}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value || null })}
          />
        </Field>
        <Field label="Notes" hint="What to order, where to park.">
          <Input value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })} />
        </Field>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy || !draft.name.trim()} onClick={() => onSave(draft)}>
            Save
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => onDelete(place)}>
            Delete
          </Button>
        </div>
        <p className="text-sm text-muted">Deleting also clears any planned nights at this place.</p>
      </div>
    </Sheet>
  );
}

function SettingsCard() {
  const { activeHousehold, updateSettings, renameHousehold } = useHousehold();
  const [name, setName] = useState(activeHousehold?.name ?? '');
  const [renaming, setRenaming] = useState(false);
  const [renamed, setRenamed] = useState(false);
  const [servings, setServings] = useState<number | null>(activeHousehold?.defaultServings ?? 1);
  const [horizonDays, setHorizonDays] = useState<number | null>(activeHousehold?.planningHorizonDays ?? 7);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (activeHousehold) {
      setName(activeHousehold.name);
      setServings(activeHousehold.defaultServings);
      setHorizonDays(activeHousehold.planningHorizonDays);
    }
  }, [activeHousehold]);

  async function onRename(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === activeHousehold?.name) return;
    setRenaming(true);
    try {
      await renameHousehold(trimmed);
      setRenamed(true);
      setTimeout(() => setRenamed(false), 1500);
    } finally {
      setRenaming(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSettings({
        defaultServings: servings ?? 1,
        planningHorizonDays: horizonDays ?? 7,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  const isOwner = activeHousehold?.role === 'OWNER';

  return (
    <Card title="Settings">
      {isOwner && (
        <form onSubmit={onRename} className="mb-4 border-b border-line pb-4">
          <Field label="Household name">
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Button
                type="submit"
                variant="secondary"
                disabled={renaming || !name.trim() || name.trim() === activeHousehold?.name}
              >
                {renamed ? 'Saved' : 'Rename'}
              </Button>
            </div>
          </Field>
        </form>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Default servings">
          <NumberInput min={1} value={servings} onChange={setServings} />
        </Field>
        <Field label="Days ahead to plan">
          <NumberInput min={1} value={horizonDays} onChange={setHorizonDays} />
        </Field>
        <Button type="submit" full size="lg" disabled={saving}>
          {saved ? 'Saved' : 'Save settings'}
        </Button>
      </form>
    </Card>
  );
}

function MembersCard({ householdId }: { householdId: string }) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);

  async function refresh() {
    setMembers(await api<HouseholdMember[]>('GET', `/api/households/${householdId}/members`));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  return (
    <Card title="Who's here">
      <ul className="divide-y divide-line">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-2.5 first:pt-0">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft
                         font-semibold text-accent"
              aria-hidden="true"
            >
              {m.displayName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{m.displayName}</span>
              <span className="block truncate text-sm text-muted">{m.username}</span>
            </span>
            {m.pinSet ? (
              m.role === 'OWNER' && <Badge>Owner</Badge>
            ) : (
              <Badge tone="accent">Needs a PIN</Badge>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-4 border-t border-line pt-4">
        <AddPersonForm
          householdId={householdId}
          onDone={refresh}
          path="users"
          label="Add someone new"
          hint="They pick a PIN the first time they sign in."
          action="Create"
          fallbackError="Could not create that account"
        />
        <AddPersonForm
          householdId={householdId}
          onDone={refresh}
          path="members"
          label="Invite someone who already has an account"
          hint="Including people in another household."
          action="Invite"
          fallbackError="Could not add member"
        />
      </div>
    </Card>
  );
}

/**
 * Both ways of gaining a member take just a username, so they share a form. "users" creates a
 * brand new account here; "members" pulls in one that already exists, including from another house.
 */
function AddPersonForm({
  householdId,
  onDone,
  path,
  label,
  hint,
  action,
  fallbackError,
}: {
  householdId: string;
  onDone: () => Promise<void>;
  path: 'users' | 'members';
  label: string;
  hint: string;
  action: string;
  fallbackError: string;
}) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api('POST', `/api/households/${householdId}/${path}`, { username: username.trim() });
      setUsername('');
      await onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.body as { message?: string })?.message ?? fallbackError : fallbackError,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label={label} hint={hint}>
        <div className="flex gap-2">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            aria-label={label}
          />
          <Button type="submit" variant="secondary" disabled={busy || !username.trim()}>
            {action}
          </Button>
        </div>
      </Field>
      {error && <div className="mt-2"><ErrorText>{error}</ErrorText></div>}
    </form>
  );
}
