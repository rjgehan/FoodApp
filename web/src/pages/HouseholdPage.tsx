import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, imageUrl } from '../api/client';
import type { RecipeSection } from '../api/types';
import type { HouseholdMember, Place } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { DEFAULT_SECTION_ICONS, FOOD_ICONS, iconByKey } from '../components/FoodIcons';
import { SECTION_OPTIONS } from '../utils/recipeMeta';
import {
  Badge,
  Button,
  Card,
  Chip,
  cx,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  Input,
  NumberInput,
  Sheet,
  SheetRow,
  usernameInputProps,
} from '../components/ui';
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, StoreIcon, TrashIcon } from '../components/icons';
import PlaceActions from '../components/PlaceActions';
import { PageTitle } from '../components/PageTitle';
import ImagePicker from '../components/ImagePicker';
import ProfileCard from '../components/ProfileCard';

export default function HouseholdPage() {
  const { households, activeHousehold } = useHousehold();
  const { session } = useAuth();
  const [justCreated, setJustCreated] = useState<string | null>(null);

  function announce(name: string) {
    setJustCreated(name);
    setTimeout(() => setJustCreated(null), 4000);
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Household" />
      {justCreated && (
        <div className="rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
          “{justCreated}” created — you're in it.
        </div>
      )}

      {/* Nobody in a household yet: making one is the only thing to do here. */}
      {households.length === 0 && (
        <Card title="Create a household">
          <NewHouseholdForm onCreated={announce} />
        </Card>
      )}

      {/* The two things people come here for stay on the page… */}
      {activeHousehold && <MembersCard householdId={activeHousehold.id} />}
      {activeHousehold && <PlacesCard householdId={activeHousehold.id} />}

      {/* …and everything set once and rarely touched is a row that opens on its own. */}
      <Card title="Settings">
        <div className="divide-y divide-line">
          {activeHousehold && (
            <SheetRow
              label="Household"
              detail={`Serves ${activeHousehold.defaultServings} · ${activeHousehold.planningHorizonDays} days ahead`}
            >
              {() => <SettingsCard />}
            </SheetRow>
          )}
          {activeHousehold && <SheetRow label="Store aisles">{() => <StoreLayoutCard />}</SheetRow>}
          {activeHousehold && (
            <SheetRow label="Recipe icons">{() => <CatalogIconsCard householdId={activeHousehold.id} />}</SheetRow>
          )}
          <SheetRow label="You" detail={session?.displayName}>
            {() => <ProfileCard />}
          </SheetRow>
          {households.length > 0 && (
            <SheetRow label="Start another household">
              {(close) => (
                <NewHouseholdForm
                  onCreated={(name) => {
                    close();
                    announce(name);
                  }}
                />
              )}
            </SheetRow>
          )}
          {activeHousehold && (
            <SheetRow label={`Leave “${activeHousehold.name}”`} tone="danger">
              {() => <LeaveCard householdId={activeHousehold.id} name={activeHousehold.name} />}
            </SheetRow>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * You can belong to several households — one for your own place, one for your parents' — and
 * either lets you start another.
 */
function NewHouseholdForm({ onCreated }: { onCreated: (name: string) => void }) {
  const { createHousehold } = useHousehold();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createHousehold(name);
      setNewName('');
      onCreated(name);
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={onCreate} className="space-y-3">
      <Field label="Name">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Gehan House"
          maxLength={60}
        />
      </Field>
      <Button type="submit" full size="lg" disabled={creating || !newName.trim()}>
        Create
      </Button>
    </form>
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
    <Card title="Recipe icons">
      <ul className="divide-y divide-line">
        {SECTION_OPTIONS.map((s) => {
          const current = icons[s.value] ?? DEFAULT_SECTION_ICONS[s.value];
          const Icon = iconByKey(current)?.Icon;
          const open = editing === s.value;

          return (
            <li key={s.value} className="py-1">
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

/**
 * The places you eat when you are not cooking. Created on the fly from the meal planner, so this
 * card exists to fill in the details afterwards — the menu link and the phone number.
 */
/**
 * An account that joins no household — for someone who will have their own, or who you just
 * want to be able to share recipes with. They pick a PIN the first time they sign in, and until
 * then they show on the login screen under "Not in a house yet".
 */
function LooseAccountForm() {
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
    <div>
      {made && (
        <div className="mb-3 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
          “{made}” added. They'll see their name on the sign-in screen.
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted">
          An account that isn't in any household. They can start their own, or you can invite
          them to yours later.
        </p>
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="grandad" {...usernameInputProps} />
        </Field>
        <Field label="Name" hint="Optional — what they're called on screen.">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Grandad" />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" variant="secondary" full disabled={busy || !username.trim()}>
          Add them
        </Button>
      </form>
    </div>
  );
}

/**
 * Three ways to get someone in, behind one button. They used to be three forms open on the page
 * at once — a lot of boxes for something done a few times a year.
 */
function AddSomeone({ householdId, onDone }: { householdId: string; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<'new' | 'invite' | 'loose' | null>(null);

  if (!mode) {
    return (
      <Button variant="ghost" size="sm" className="-ml-3 mt-1" onClick={() => setMode('new')}>
        <PlusIcon className="h-4 w-4" />
        Add someone
      </Button>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={mode === 'new'} onClick={() => setMode('new')}>
          New to the app
        </Chip>
        <Chip active={mode === 'invite'} onClick={() => setMode('invite')}>
          Has an account
        </Chip>
        <Chip active={mode === 'loose'} onClick={() => setMode('loose')}>
          Account only
        </Chip>
        <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
          Cancel
        </Button>
      </div>
      {mode === 'new' && (
        <AddPersonForm
          householdId={householdId}
          onDone={onDone}
          path="users"
          label="Their username"
          hint="They join this household and pick a PIN the first time they sign in."
          action="Create"
          fallbackError="Could not create that account"
        />
      )}
      {mode === 'invite' && (
        <AddPersonForm
          householdId={householdId}
          onDone={onDone}
          path="members"
          label="Their username"
          hint="Anyone who already has an account, including people in another household."
          action="Invite"
          fallbackError="Could not add member"
        />
      )}
      {mode === 'loose' && <LooseAccountForm />}
    </div>
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
  const [sheetError, setSheetError] = useState<string | null>(null);
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
    setSheetError(null);
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
    } catch (err) {
      const message = err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null;
      setSheetError(message ?? 'Could not save that.');
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
          error={sheetError}
          onSave={save}
          onDelete={remove}
          onClose={() => {
            setEditing(null);
            setSheetError(null);
          }}
        />
      )}
    </Card>
  );
}

function PlaceSheet({
  householdId,
  place,
  busy,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  householdId: string;
  place: Place;
  busy: boolean;
  error: string | null;
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
            className="aspect-[4/3] w-full rounded-xl object-cover"
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

        {error && <ErrorText>{error}</ErrorText>}
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
  const [servings, setServings] = useState<number | null>(activeHousehold?.defaultServings ?? 1);
  const [horizonDays, setHorizonDays] = useState<number | null>(activeHousehold?.planningHorizonDays ?? 7);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    if (activeHousehold) {
      setName(activeHousehold.name);
      setServings(activeHousehold.defaultServings);
      setHorizonDays(activeHousehold.planningHorizonDays);
    }
  }, [activeHousehold]);

  const isOwner = activeHousehold?.role === 'OWNER';
  const renamed = isOwner && name.trim() !== '' && name.trim() !== activeHousehold?.name;

  /** One Save for the whole sheet: the rename (owners only) and the numbers. */
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSettingsError(null);
    try {
      if (renamed) await renameHousehold(name.trim());
      await updateSettings({
        defaultServings: servings ?? 1,
        planningHorizonDays: horizonDays ?? 7,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setSettingsError('Names can be up to 60 characters, servings 1–50, and days ahead 1–60.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Household">
      <form onSubmit={onSubmit} className="space-y-3">
        {isOwner && (
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
        )}
        <Field label="Default servings">
          <NumberInput min={1} max={50} value={servings} onChange={setServings} />
        </Field>
        <Field label="Days ahead to plan">
          <NumberInput min={1} max={60} value={horizonDays} onChange={setHorizonDays} />
        </Field>
        {settingsError && <ErrorText>{settingsError}</ErrorText>}
        <Button type="submit" full size="lg" disabled={saving}>
          {saved ? 'Saved' : 'Save'}
        </Button>
      </form>
    </Card>
  );
}

/**
 * The aisles in the order you walk your store — your own, not a fixed list. Arrows rather than
 * dragging: dragging a list on a phone fights the page scroll, and a dozen rows is few enough
 * that a tap per step is quick. Renaming and deleting live behind a "..." sheet per row so the
 * everyday case (just reordering) stays a single row of controls.
 */
function StoreLayoutCard() {
  const {
    groceryCategories,
    createGroceryCategory,
    renameGroceryCategory,
    reorderGroceryCategories,
    deleteGroceryCategory,
  } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<{ id: string; name: string } | null>(null);

  const ordered = [...groceryCategories].sort((a, b) => a.position - b.position);

  async function move(index: number, delta: -1 | 1) {
    const next = [...ordered];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setBusy(true);
    try {
      await reorderGroceryCategories(next.map((c) => c.id));
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await createGroceryCategory(newName.trim());
      setNewName('');
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card title="Store aisles">
      <p className="mb-2 text-sm text-muted">
        The order you walk your store, and what you call each aisle. Groceries are listed in this
        order, top to bottom.
      </p>
      <ol className="divide-y divide-line">
        {ordered.map((category, i) => (
          <li key={category.id} className="flex items-center gap-1 py-0.5">
            <span className="w-6 shrink-0 text-sm tabular-nums text-subtle">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{category.name}</span>
            <IconButton
              label={`Move ${category.name} earlier`}
              disabled={busy || i === 0}
              onClick={() => move(i, -1)}
            >
              <ChevronUpIcon className="h-5 w-5" />
            </IconButton>
            <IconButton
              label={`Move ${category.name} later`}
              disabled={busy || i === ordered.length - 1}
              onClick={() => move(i, 1)}
            >
              <ChevronDownIcon className="h-5 w-5" />
            </IconButton>
            <IconButton label={`Edit ${category.name}`} onClick={() => setManaging(category)}>
              <span className="text-lg leading-none">⋯</span>
            </IconButton>
          </li>
        ))}
      </ol>

      <form onSubmit={onAdd} className="mt-3 flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a category — Pharmacy, say"
          aria-label="New category name"
        />
        <Button type="submit" variant="secondary" disabled={adding || !newName.trim()}>
          <PlusIcon className="h-5 w-5" />
        </Button>
      </form>

      {managing && (
        <ManageCategorySheet
          category={managing}
          onClose={() => setManaging(null)}
          onRename={async (name) => {
            await renameGroceryCategory(managing.id, name);
            setManaging(null);
          }}
          onDelete={async () => {
            await deleteGroceryCategory(managing.id);
            setManaging(null);
          }}
        />
      )}
    </Card>
  );
}

function ManageCategorySheet({
  category,
  onClose,
  onRename,
  onDelete,
}: {
  category: { id: string; name: string };
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <Sheet title={category.name} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              variant="secondary"
              disabled={saving || !name.trim() || name.trim() === category.name}
              onClick={async () => {
                setSaving(true);
                try {
                  await onRename(name.trim());
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save
            </Button>
          </div>
        </Field>

        {confirmingDelete ? (
          <div className="space-y-2 rounded-xl bg-elevated p-3">
            <p className="text-sm text-muted">
              Anything filed under {category.name} becomes unsorted — one tap to place it again, or
              Sort will pick it up.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" full disabled={saving} onClick={onDelete}>
                Delete {category.name}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" full onClick={() => setConfirmingDelete(true)}>
            <TrashIcon className="h-5 w-5" />
            Delete category
          </Button>
        )}
      </div>
    </Sheet>
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

      <AddSomeone householdId={householdId} onDone={refresh} />
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
            {...usernameInputProps}
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
