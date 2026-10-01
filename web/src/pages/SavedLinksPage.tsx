import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import NoHousehold from '../components/NoHousehold';
import { api, ApiError, imageUrl } from '../api/client';
import type { RecipeSection, SavedLink, SavedLinkSource } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import type { RecipeDraft } from '../components/RecipeForm';
import type { FromSavedLink } from './NewRecipePage';
import PlanRecipeSheet from '../components/PlanRecipeSheet';
import { Reading } from '../components/RecipeFromLink';
import { PageTitle } from '../components/PageTitle';
import { SavedLinksArt } from '../components/FoodIcons';
import {
  Button,
  Card,
  CheckCircle,
  Chip,
  cx,
  EmptyState,
  ErrorText,
  Input,
  Sheet,
  SwitchKnob,
} from '../components/ui';
import { ChevronLeftIcon, GlobeIcon, MoreIcon, PlayIcon, PlusIcon } from '../components/icons';
import { photoClass } from '../utils/recipeFormat';
import { SECTION_OPTIONS, sectionLabel } from '../utils/recipeMeta';
import { isSafeLink } from '../utils/videoLink';
import { saveLink, sourceLabel } from '../utils/savedLinks';

type Action = 'menu' | 'rename' | 'move' | 'delete' | 'plan' | 'import';

const SOURCES: { value: SavedLinkSource; label: string }[] = [
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'WEB', label: 'Websites' },
];

/**
 * The recipes that are still only links — the TikToks and Reels and pages you mean to make —
 * as a wall of their pictures, the way you remember them. Tapping one opens it where it lives
 * (the TikTok app, if the phone has it). Everything else — planning it, making it a recipe,
 * tidying it — is behind its •••.
 */
export default function SavedLinksPage() {
  const { activeHouseholdId, activeHousehold } = useHousehold();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [links, setLinks] = useState<SavedLink[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [source, setSource] = useState<SavedLinkSource | null>(null);
  const [drawer, setDrawer] = useState<RecipeSection | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<{ action: Action; link: SavedLink } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!activeHouseholdId) return;
    setLinks(null);
    setFailed(false);
    api<SavedLink[]>('GET', `/api/households/${activeHouseholdId}/saved-links`)
      .then(setLinks)
      .catch(() => setFailed(true));
  }, [activeHouseholdId]);

  // Said once, then out of the way.
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const all = links ?? [];
  // Filters only for what there is: one source or no drawers means nothing to choose between.
  const sources = SOURCES.filter((s) => all.some((l) => l.source === s.value));
  const drawers = SECTION_OPTIONS.filter((s) => all.some((l) => l.section === s.value));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (links ?? []).filter(
      (l) =>
        (!source || l.source === source) &&
        (!drawer || l.section === drawer) &&
        (!q || l.name.toLowerCase().includes(q) || sourceLabel(l).toLowerCase().includes(q)),
    );
  }, [links, query, source, drawer]);

  if (!activeHouseholdId) {
    return (
      <Card>
        <NoHousehold />
      </Card>
    );
  }
  const householdId = activeHouseholdId;

  function replace(link: SavedLink) {
    setLinks((current) => (current ?? []).map((l) => (l.id === link.id ? link : l)));
  }

  async function update(link: SavedLink, body: Record<string, unknown>) {
    const updated = await api<SavedLink>('PATCH', `/api/households/${householdId}/saved-links/${link.id}`, body);
    replace(updated);
    return updated;
  }

  /** The New recipe form, started from this link — with whatever an import read, or just the link. */
  function makeRecipe(link: SavedLink, read?: RecipeDraft & { methodSource?: string | null }) {
    const draft: RecipeDraft = read
      ? {
          ...read,
          servings: read.servings || activeHousehold?.defaultServings || 4,
          links: read.links?.length ? read.links : [{ url: link.url, label: null }],
          coverImageId: read.coverImageId ?? link.coverImageId,
        }
      : {
          name: link.name,
          description: null,
          instructions: null,
          prepTimeMinutes: null,
          cookTimeMinutes: null,
          servings: activeHousehold?.defaultServings ?? 4,
          ingredients: [],
          links: [{ url: link.url, label: null }],
          coverImageId: link.coverImageId,
        };
    const fromSavedLink: FromSavedLink = {
      savedLinkId: link.id,
      name: link.name,
      draft,
      spoken: read?.methodSource === 'SPOKEN',
    };
    navigate(`/recipes/new${link.section ? `?section=${link.section}` : ''}`, { state: { fromSavedLink } });
  }

  const close = () => setOpen(null);

  /** The ••• sheet: the ways on first, then tidying, then the one that cannot be undone. */
  function menuFor(link: SavedLink): { label: string; onSelect: () => void; danger?: boolean; on?: boolean }[] {
    return [
      { label: 'Plan it', onSelect: () => setOpen({ action: 'plan', link }) },
      { label: 'Make it a recipe', onSelect: () => makeRecipe(link) },
      { label: 'Try importing again', onSelect: () => setOpen({ action: 'import', link }) },
      { label: 'Rename', onSelect: () => setOpen({ action: 'rename', link }) },
      { label: 'Move to a drawer', onSelect: () => setOpen({ action: 'move', link }) },
      // Only whoever saved it: hiding somebody else's link would hide it from you too.
      ...(link.mine
        ? [
            {
              label: 'Just me',
              on: link.personal,
              onSelect: async () => {
                close();
                const updated = await update(link, { personal: !link.personal });
                setNotice(updated.personal ? 'Only you can see it now.' : 'Everyone in the household can see it now.');
              },
            },
          ]
        : []),
      { label: 'Delete', onSelect: () => setOpen({ action: 'delete', link }), danger: true },
    ];
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-3" onClick={() => navigate('/recipes')}>
        <ChevronLeftIcon className="h-5 w-5" />
        Recipes
      </Button>

      <PageTitle title="Saved links" subtitle="Recipes to try, kept as the link for now." />

      <div className="flex gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search saved links"
          aria-label="Search saved links"
        />
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="Save a link"
          title="Save a link"
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </div>

      {/* One row, not two: where it is from, then which drawer, and All to clear both. */}
      {(sources.length > 1 || drawers.length > 0) && (
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Filters">
          <Chip
            active={!source && !drawer}
            onClick={() => {
              setSource(null);
              setDrawer(null);
            }}
          >
            All
          </Chip>
          {sources.length > 1 &&
            sources.map((s) => (
              <Chip key={s.value} active={source === s.value} onClick={() => setSource(source === s.value ? null : s.value)}>
                {s.label}
              </Chip>
            ))}
          {sources.length > 1 && drawers.length > 0 && <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-line" />}
          {drawers.map((s) => (
            <Chip key={s.value} active={drawer === s.value} onClick={() => setDrawer(drawer === s.value ? null : s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
      )}

      {notice && (
        <p role="status" className="rounded-xl bg-herb-soft px-4 py-3 text-[0.9375rem] font-medium text-herb">
          {notice}
        </p>
      )}

      {failed ? (
        <Card>
          <EmptyState>Couldn’t load your saved links.</EmptyState>
        </Card>
      ) : links === null ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <SavedLinksArt className="h-20 w-20 text-faint" />
          <p className="mt-3 text-lg font-semibold">Nothing saved yet</p>
          <p className="mt-1 max-w-sm text-[0.9375rem] text-muted">
            Keep the TikToks, Reels and recipe pages you mean to make. When a link won’t come through as a recipe, save
            it here instead — and make it a recipe later.
          </p>
          <Button className="mt-5" onClick={() => setAdding(true)}>
            <PlusIcon className="h-5 w-5" />
            Save a link
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState>Nothing matches that.</EmptyState>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((link) => (
            <li key={link.id}>
              <SavedLinkTile link={link} onMenu={() => setOpen({ action: 'menu', link })} />
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddLinkSheet
          householdId={householdId}
          onClose={() => setAdding(false)}
          onSaved={(saved) => {
            setAdding(false);
            setLinks((current) => [saved, ...(current ?? []).filter((l) => l.id !== saved.id)]);
            setNotice(saved.alreadySaved ? `“${saved.name}” was already saved.` : `Saved “${saved.name}”.`);
          }}
        />
      )}

      {open?.action === 'menu' && (
        <Sheet title={open.link.name} onClose={close}>
          <ul className="divide-y divide-line">
            {menuFor(open.link).map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={item.onSelect}
                  className={cx(
                    'press flex min-h-touch w-full items-center justify-between gap-3 py-3 text-left text-[1.0625rem]',
                    item.danger ? 'text-danger' : 'text-accent-ink',
                  )}
                >
                  {item.label}
                  {item.on !== undefined && <SwitchKnob on={item.on} />}
                </button>
              </li>
            ))}
          </ul>
          {!open.link.mine && open.link.savedByName && (
            <p className="pt-2 text-sm text-muted">Saved by {open.link.savedByName}</p>
          )}
        </Sheet>
      )}

      {open?.action === 'rename' && (
        <RenameSheet
          link={open.link}
          onClose={close}
          onSave={async (name) => {
            await update(open.link, { name });
            close();
          }}
        />
      )}

      {open?.action === 'move' && (
        <Sheet title="Move to a drawer" onClose={close}>
          <ul className="divide-y divide-line">
            {[{ value: null, label: 'No drawer' }, ...SECTION_OPTIONS].map((s) => {
              const on = open.link.section === s.value;
              return (
                <li key={s.label}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={async () => {
                      close();
                      await update(open.link, s.value ? { section: s.value } : { clearSection: true });
                    }}
                    className="flex min-h-touch w-full items-center gap-3 py-2.5 text-left"
                  >
                    <CheckCircle checked={on} />
                    <span>{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Sheet>
      )}

      {open?.action === 'delete' && (
        <DeleteSheet
          link={open.link}
          onClose={close}
          onDelete={async () => {
            await api('DELETE', `/api/households/${householdId}/saved-links/${open.link.id}`);
            setLinks((current) => (current ?? []).filter((l) => l.id !== open.link.id));
            close();
          }}
        />
      )}

      {open?.action === 'plan' && (
        <PlanRecipeSheet
          householdId={householdId}
          savedLink={open.link}
          days={activeHousehold?.planningHorizonDays ?? 7}
          onClose={close}
          onPlanned={(when) => {
            close();
            setNotice(`On the plan for ${when}.`);
          }}
        />
      )}

      {open?.action === 'import' && (
        <ImportSheet
          householdId={householdId}
          link={open.link}
          onClose={close}
          onRead={(draft) => makeRecipe(open.link, draft)}
          onTypeItOut={() => makeRecipe(open.link)}
        />
      )}
    </div>
  );
}

/**
 * One link as its picture: the video's cover or the page's photo, what it is called under it,
 * and where it is from on it. The whole tile opens the link; its ••• sits on the picture.
 */
function SavedLinkTile({ link, onMenu }: { link: SavedLink; onMenu: () => void }) {
  const [broken, setBroken] = useState(false);
  const picture = link.coverImageId && !broken ? link.coverImageId : null;
  const detail = [link.section && sectionLabel(link.section), !link.mine && link.savedByName && `from ${link.savedByName}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="relative">
      <a
        href={isSafeLink(link.url) ? link.url : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition-transform active:scale-[0.98]"
      >
        <span
          className={cx(
            'relative flex aspect-[4/5] flex-col items-center justify-center overflow-hidden rounded-[18px]',
            !picture && photoClass(link.id),
          )}
        >
          {picture ? (
            <img
              src={imageUrl(picture)}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              {/* No picture: what kind of link it is, drawn big. The badge below says where. */}
              {link.source === 'WEB' ? (
                <GlobeIcon strokeWidth={1.6} className="h-12 w-12 opacity-90" />
              ) : (
                <PlayIcon strokeWidth={1.6} className="h-12 w-12 opacity-90" />
              )}
            </>
          )}
          {/* On the picture, so they read over any cover: dark glass, white type. */}
          <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] gap-1">
            <span className="truncate rounded-full bg-black/55 px-2 py-0.5 text-[0.6875rem] font-semibold text-white backdrop-blur-sm">
              {sourceLabel(link)}
            </span>
            {link.personal && (
              <span className="shrink-0 rounded-full bg-white/90 px-2 py-0.5 text-[0.6875rem] font-semibold text-black">
                Just me
              </span>
            )}
          </span>
        </span>
        <span className="block px-0.5 pt-2">
          <span className="line-clamp-2 font-medium leading-snug">{link.name}</span>
          {detail && <span className="mt-0.5 block truncate text-xs text-faint">{detail}</span>}
        </span>
      </a>
      <button
        type="button"
        aria-label={`More for ${link.name}`}
        title="More"
        onClick={onMenu}
        className="press absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
      >
        <MoreIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

function AddLinkSheet({
  householdId,
  onClose,
  onSaved,
}: {
  householdId: string;
  onClose: () => void;
  onSaved: (link: SavedLink) => void;
}) {
  const [url, setUrl] = useState('');
  const [personal, setPersonal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveLink(householdId, { url: url.trim(), personal }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t save that link.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Save a link" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Input
          autoFocus
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a TikTok, Reel or recipe link"
          aria-label="Link to save"
        />
        <p className="text-sm text-muted">Its name and picture are filled in from the page.</p>
        <button
          type="button"
          role="switch"
          aria-checked={personal}
          onClick={() => setPersonal((p) => !p)}
          className="flex min-h-touch w-full items-center gap-3 py-1 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block">Just me</span>
            <span className="block text-sm text-muted">Only you will see it. Otherwise everyone in the household can.</span>
          </span>
          <SwitchKnob on={personal} />
        </button>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" full size="lg" disabled={busy || !url.trim()}>
          {busy ? 'Saving…' : 'Save link'}
        </Button>
      </form>
    </Sheet>
  );
}

function RenameSheet({
  link,
  onClose,
  onSave,
}: {
  link: SavedLink;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(link.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(name.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t rename it.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="Rename" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" maxLength={200} />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" full disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Sheet>
  );
}

function DeleteSheet({
  link,
  onClose,
  onDelete,
}: {
  link: SavedLink;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet title="Delete saved link" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-lg">Delete “{link.name}”?</p>
        <p className="text-sm text-muted">
          {link.personal ? 'It’s only yours, so nobody else will notice. ' : 'It comes off Saved links for everyone in the household. '}
          If it’s on the plan, the meal stays there by name.
        </p>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onDelete();
              } catch {
                setError('Couldn’t delete it.');
                setBusy(false);
              }
            }}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Another go at reading it — a caption may have been edited since, or the reader got better.
 * What comes through opens in the New recipe form; what does not says why, with the other way
 * to make it a recipe right there.
 */
function ImportSheet({
  householdId,
  link,
  onClose,
  onRead,
  onTypeItOut,
}: {
  householdId: string;
  link: SavedLink;
  onClose: () => void;
  onRead: (draft: RecipeDraft & { methodSource?: string | null }) => void;
  onTypeItOut: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<RecipeDraft & { methodSource?: string | null }>('POST', `/api/households/${householdId}/recipes/import`, {
      url: link.url,
    })
      .then((draft) => live && onRead(draft))
      .catch((err) => live && setError(err instanceof ApiError ? err.message : 'Couldn’t read that link.'));
    return () => {
      live = false;
    };
    // Once per opening: the sheet is the attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Sheet title="Try importing again" onClose={onClose}>
      {error ? (
        <div className="space-y-4">
          <ErrorText>{error}</ErrorText>
          <p className="text-sm text-muted">
            You can still make it a recipe yourself — the name, the link and its picture go in for you.
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onTypeItOut}>
              Make it a recipe
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Keep the link
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="truncate font-medium">{link.name}</p>
          <Reading />
        </div>
      )}
    </Sheet>
  );
}
