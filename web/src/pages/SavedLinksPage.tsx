import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import NoHousehold from '../components/NoHousehold';
import { api, ApiError, imageUrl } from '../api/client';
import type { RecipeSection, SavedLink } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import type { RecipeDraft } from '../components/RecipeForm';
import type { FromSavedLink } from './NewRecipePage';
import PlanRecipeSheet from '../components/PlanRecipeSheet';
import { Reading } from '../components/RecipeFromLink';
import {
  Button,
  Card,
  CheckCircle,
  Chip,
  cx,
  EmptyState,
  ErrorText,
  Input,
  List,
  NavBar,
  NoteBox,
  Photo,
  Row,
  SearchField,
  Sheet,
  SwitchKnob,
  Tile,
} from '../components/ui';
import { Icon } from '../components/icons';
import { usePushedScreen } from '../components/Layout';
import { SECTION_OPTIONS, sectionLabel } from '../utils/recipeMeta';
import { isSafeLink } from '../utils/videoLink';
import { isVideo, linkKind, saveLink, sourceLabel, timeAgo, type LinkKind } from '../utils/savedLinks';

type Action = 'menu' | 'rename' | 'move' | 'delete' | 'plan' | 'import';

const SOURCES: { value: LinkKind; label: string }[] = [
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'YOUTUBE', label: 'YouTube' },
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
  const [source, setSource] = useState<LinkKind | null>(null);
  const [drawer, setDrawer] = useState<RecipeSection | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<{ action: Action; link: SavedLink } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  usePushedScreen();

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
  const sources = SOURCES.filter((s) => all.some((l) => linkKind(l) === s.value));
  const drawers = SECTION_OPTIONS.filter((s) => all.some((l) => l.section === s.value));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (links ?? []).filter(
      (l) =>
        (!source || linkKind(l) === source) &&
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

  /**
   * Paste: whatever link is on the clipboard is saved straight away. A browser that will not
   * hand the clipboard over (or has nothing on it) opens the box to paste it into instead.
   */
  async function pasteLink() {
    let text = '';
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      // Not allowed here, or refused: the box below does the same job by hand.
    }
    if (!/^https?:\/\/\S+$/i.test(text)) {
      setAdding(true);
      return;
    }
    try {
      const saved = await saveLink(householdId, { url: text });
      setLinks((current) => [saved, ...(current ?? []).filter((l) => l.id !== saved.id)]);
      setNotice(saved.alreadySaved ? `“${saved.name}” was already saved.` : `Saved “${saved.name}”.`);
    } catch {
      setAdding(true);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <NavBar
          className="-mx-2.5"
          title="Saved links"
          backLabel="Recipes"
          back={() => navigate('/recipes')}
          right={
            <button type="button" aria-label="Save a link" title="Save a link" className="press" onClick={() => setAdding(true)}>
              <Icon name="plus" size={22} />
            </button>
          }
        />

        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search saved links"
          aria-label="Search saved links"
        />

        {/* One row: where it is from, then the drawer as a menu, and All to clear both. */}
        {(sources.length > 1 || drawers.length > 0) && (
          <div className="-mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-0.5 md:-mx-8 md:px-8" role="group" aria-label="Filters">
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
            {drawers.length > 0 && (
              <label
                className={cx(
                  'press relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-[7px] text-[0.8125rem]',
                  drawer ? 'border-ink bg-ink font-semibold text-bg' : 'border-line bg-surface font-medium text-ink',
                )}
              >
                <Icon name="chevD" size={14} />
                {drawer ? sectionLabel(drawer) : 'Drawer'}
                {/* The phone's own picker, laid over the chip. */}
                <select
                  aria-label="Drawer"
                  value={drawer ?? ''}
                  onChange={(e) => setDrawer((e.target.value || null) as RecipeSection | null)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  <option value="">Every drawer</option>
                  {drawers.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="dash flex items-center gap-2.5 px-3.5 py-3">
          <Icon name="clipboard" size={18} className="shrink-0 text-accent-ink" />
          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm text-muted" onClick={() => setAdding(true)}>
            Paste a link to save it
          </button>
          <button type="button" className="press shrink-0 text-sm font-semibold text-accent-ink" onClick={pasteLink}>
            Paste
          </button>
        </div>

        {notice && (
          <div role="status">
            <NoteBox tone="herb" icon="check">
              {notice}
            </NoteBox>
          </div>
        )}

        {failed ? (
          <Card>
            <EmptyState>Couldn’t load your saved links.</EmptyState>
          </Card>
        ) : links === null ? (
          <p className="py-8 text-center text-sm text-muted">Loading…</p>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <Tile icon="link" tone="plum" size={64} />
            <p className="title-section mt-4">Nothing saved yet</p>
            <p className="mt-1 max-w-sm text-[0.9375rem] text-muted">
              Keep the TikToks, Reels and recipe pages you mean to make. When a link won’t come through as a recipe, save
              it here instead — and make it a recipe later.
            </p>
            <Button className="mt-5" icon="plus" onClick={() => setAdding(true)}>
              Save a link
            </Button>
          </div>
        ) : shown.length === 0 ? (
          <Card>
            <EmptyState>Nothing matches that.</EmptyState>
          </Card>
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-3.5 pt-0.5 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((link) => (
              <li key={link.id}>
                <SavedLinkTile link={link} onMenu={() => setOpen({ action: 'menu', link })} />
              </li>
            ))}
          </ul>
        )}
      </div>

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
        <Sheet
          label={open.link.name}
          title={<span className="font-sans text-[1.0625rem] font-semibold tracking-normal">{open.link.name}</span>}
          subtitle={linkMeta(open.link)}
          lead={<LinkPicture link={open.link} className="h-[60px] w-[60px] rounded-[14px]" small />}
          onClose={close}
        >
          <LinkActions
            link={open.link}
            onPlan={() => setOpen({ action: 'plan', link: open.link })}
            onMakeRecipe={() => makeRecipe(open.link)}
            onImport={() => setOpen({ action: 'import', link: open.link })}
            onMove={() => setOpen({ action: 'move', link: open.link })}
            onRename={() => setOpen({ action: 'rename', link: open.link })}
            onDelete={() => setOpen({ action: 'delete', link: open.link })}
            onJustMe={async () => {
              const link = open.link;
              close();
              const updated = await update(link, { personal: !link.personal });
              setNotice(updated.personal ? 'Only you can see it now.' : 'Everyone in the household can see it now.');
            }}
          />
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
          <List label="Drawers">
            {[{ value: null, label: 'No drawer' }, ...SECTION_OPTIONS].map((s) => {
              const on = open.link.section === s.value;
              return (
                <Row
                  key={s.label}
                  aria-checked={on}
                  role="radio"
                  lead={<CheckCircle checked={on} />}
                  title={s.label}
                  onClick={async () => {
                    close();
                    await update(open.link, s.value ? { section: s.value } : { clearSection: true });
                  }}
                />
              );
            })}
          </List>
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
    </>
  );
}

/** "TikTok · saved by Jo · 3 days ago" — where it is from, who kept it, and when. */
function linkMeta(link: SavedLink): string {
  const by = link.mine ? 'saved by you' : link.savedByName ? `saved by ${link.savedByName}` : null;
  return [sourceLabel(link), by, timeAgo(link.createdAt)].filter(Boolean).join(' · ');
}

/**
 * Everything a saved link can do (3.18): the ways on first — plan it, make it a recipe, read it
 * again — then tidying it, then the one that cannot be undone. Just me is only for whoever saved
 * it: hiding somebody else's link would hide it from you too.
 */
function LinkActions({
  link,
  onPlan,
  onMakeRecipe,
  onImport,
  onMove,
  onRename,
  onJustMe,
  onDelete,
}: {
  link: SavedLink;
  onPlan: () => void;
  onMakeRecipe: () => void;
  onImport: () => void;
  onMove: () => void;
  onRename: () => void;
  onJustMe: () => void;
  onDelete: () => void;
}) {
  return (
    <List label="Saved link actions">
      <Row lead={<Tile icon="calendar" tone="accent" size={34} />} title="Add to plan" onClick={onPlan} />
      <Row
        lead={<Tile icon="book" tone="herb" size={34} />}
        title="Turn into a recipe"
        subtitle="Moves any planned meals over to the new recipe"
        onClick={onMakeRecipe}
      />
      <Row lead={<Tile icon="refresh" tone="sky" size={34} />} title="Try importing again" onClick={onImport} />
      <Row
        lead={<Tile icon="folder" tone="mustard" size={34} />}
        title="Move to a drawer"
        detail={link.section ? sectionLabel(link.section) : 'None'}
        chevron
        onClick={onMove}
      />
      <Row lead={<Tile icon="pen" tone="plum" size={34} />} title="Rename" onClick={onRename} />
      {link.mine && (
        <Row
          role="switch"
          aria-checked={link.personal}
          lead={<Tile icon="lock" tone="sky" size={34} />}
          title="Just me"
          subtitle={link.personal ? 'Only you can see it' : 'Everyone in the household can see it'}
          end={<SwitchKnob on={link.personal} />}
          onClick={onJustMe}
        />
      )}
      {/* Only whoever saved it can delete it (the server says so in canDelete; an older one
          lets anyone). For someone else's it says whose call it is, rather than vanishing. */}
      {(link.canDelete ?? true) ? (
        <Row lead={<Tile icon="trash" tone="accent" size={34} />} title="Delete" tone="danger" onClick={onDelete} />
      ) : (
        <Row
          lead={<Tile icon="trash" tone="accent" size={34} />}
          title="Delete"
          tone="danger"
          titleClassName="opacity-55"
          subtitle={`Only ${link.savedByName ?? 'whoever saved it'} can delete this`}
          aria-label={`Delete — only ${link.savedByName ?? 'whoever saved it'} can delete this`}
        />
      )}
    </List>
  );
}

/** A saved link's picture: the video's cover or the page's photo, or a gradient with what kind it is. */
function LinkPicture({ link, className, small = false }: { link: SavedLink; className?: string; small?: boolean }) {
  const [broken, setBroken] = useState(false);
  const picture = link.coverImageId && !broken ? link.coverImageId : null;
  if (picture) {
    return (
      <span className={cx('flex shrink-0 overflow-hidden bg-surface2', className)} aria-hidden="true">
        <img
          src={imageUrl(picture)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <Photo seed={link.id} icon={null} className={className}>
      {/* What kind of link it is, drawn big: the line under it says where from. */}
      <Icon
        name={isVideo(link) ? 'play' : 'globe'}
        strokeWidth={small ? 2 : 1.6}
        className={cx('relative opacity-90', small ? 'h-[40%] w-[40%]' : 'h-[34%] w-[34%]')}
      />
    </Photo>
  );
}

/**
 * One link as its picture (3.17): the cover, what it is called under it, and where it is from
 * and which drawer. The whole tile opens the link where it lives; its ••• sits on the picture.
 */
function SavedLinkTile({ link, onMenu }: { link: SavedLink; onMenu: () => void }) {
  const from = !link.mine && link.savedByName ? `from ${link.savedByName}` : null;

  return (
    <div className="group relative">
      <a
        href={isSafeLink(link.url) ? link.url : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="press flex flex-col gap-1.5"
      >
        <span className="relative block">
          <LinkPicture link={link} className="aspect-[171/110] w-full rounded-[14px]" />
          {link.personal && (
            <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[0.6875rem] font-semibold text-black">
              Just me
            </span>
          )}
        </span>
        <span className="block truncate text-sm font-semibold">{link.name}</span>
        <span className="-mt-1 block truncate text-xs text-muted">
          <span>{sourceLabel(link)}</span>
          {link.section && ` · ${sectionLabel(link.section)}`}
          {from && ` · ${from}`}
        </span>
      </a>
      <button
        type="button"
        aria-label={`More for ${link.name}`}
        title="More"
        onClick={onMenu}
        // Small and see-through, so it does not fight the picture; with a mouse it only shows
        // on the card you point at.
        className="press absolute right-0.5 top-0.5 flex h-9 w-9 items-center justify-center transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm">
          <Icon name="more" size={14} />
        </span>
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
