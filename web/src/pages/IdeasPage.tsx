import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Idea, IdeaStatus, Me } from '../api/types';
import { usePushedScreen } from '../components/Layout';
import { Icon, type IconName } from '../components/icons';
import {
  ActionMenu,
  Button,
  Chip,
  cx,
  ErrorText,
  Field,
  Input,
  NavBar,
  Pill,
  Sheet,
  Textarea,
  Tile,
  type MenuItem,
  type PillTone,
} from '../components/ui';
import { useOnResume } from '../utils/useOnResume';

/** The server's Idea.MAX_TITLE and MAX_DETAILS. */
const MAX_TITLE = 80;
const MAX_DETAILS = 1000;

/*
 The four chips over the board (mockup 7.5). Top and New are orders — the server sorts Top by
 votes with the ones done or decided against at the bottom, New newest first. Planned and Done
 are the ideas at that stage, most wanted first. Which one is in the address, so it survives a
 reload: ?sort=new, ?show=planned, ?show=done.
*/
type View = 'top' | 'new' | 'planned' | 'done';

const VIEWS: { value: View; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'new', label: 'New' },
  { value: 'planned', label: 'Planned' },
  { value: 'done', label: 'Done' },
];

function viewFrom(params: URLSearchParams): View {
  const show = params.get('show');
  if (show === 'planned' || show === 'done') return show;
  return params.get('sort') === 'new' ? 'new' : 'top';
}

function paramsFor(view: View): Record<string, string> {
  if (view === 'new') return { sort: 'new' };
  if (view === 'planned' || view === 'done') return { show: view };
  return {};
}

const STATUSES: IdeaStatus[] = ['OPEN', 'PLANNED', 'DONE', 'NOT_DOING'];

/*
 Every card says where its idea is up to, in the mockup's colours: new in plum, planned in sky,
 done in herb with a tick. Not doing stays grey — decided, and nothing more to see.
*/
const STATUS: Record<IdeaStatus, { pill: string; tone: PillTone; icon?: IconName; action: string }> = {
  OPEN: { pill: 'New', tone: 'plum', action: 'Mark as open' },
  PLANNED: { pill: 'Planned', tone: 'sky', action: 'Mark as planned' },
  DONE: { pill: 'Done', tone: 'herb', icon: 'check', action: 'Mark as done' },
  NOT_DOING: { pill: 'Not doing', tone: 'neutral', action: 'Mark as not doing' },
};

/**
 * The beta's ideas board: anyone signed in suggests what would make the app better, and upvotes
 * the ideas they want — theirs included. One board for the whole app, not one per house.
 */
export default function IdeasPage() {
  usePushedScreen();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = viewFrom(params);
  const sort = view === 'new' ? 'new' : 'top';
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  /** The last vote sent for each idea, so an answer overtaken by a newer tap is ignored. */
  const voteSent = useRef(new Map<string, number>());

  // Reached from the lightbulb on any page, or from Settings: back is wherever that was.
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/meal-plan');
  };

  const load = useCallback(async () => {
    try {
      setIdeas(await api<Idea[]>('GET', `/api/ideas?sort=${sort}`));
      setError(null);
    } catch (err) {
      // Switched off on the server while this page was open: say so rather than show an error.
      if (err instanceof ApiError && err.status === 404) setClosed(true);
      else setError(err instanceof Error ? err.message : 'Could not load the ideas.');
    }
  }, [sort]);

  useEffect(() => {
    load();
  }, [load]);
  // Other people vote while the phone is in a pocket.
  useOnResume(load);

  // Only whether to offer the admin's menu hangs on this; the server decides who may use it.
  useEffect(() => {
    let cancelled = false;
    api<Me>('GET', '/api/users/me')
      .then((me) => !cancelled && setAdmin(me.admin === true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function replace(idea: Idea) {
    setIdeas((list) => list?.map((i) => (i.id === idea.id ? idea : i)) ?? null);
  }

  async function suggest(title: string, details: string) {
    const made = await api<Idea>('POST', '/api/ideas', { title, details: details || null });
    // At the top of the list, so whoever posted it sees it land — on Top or New, where a new idea
    // belongs. Its proper place comes with the next load.
    setIdeas((list) => [made, ...(list ?? [])]);
    setSuggesting(false);
    if (view === 'planned' || view === 'done') setParams({}, { replace: true });
  }

  /**
   * On the card at once, then whatever the server counted. The card does not move: jumping out
   * from under the finger that tapped it is worse than being a place out of order until the
   * next load.
   */
  async function vote(idea: Idea) {
    const up = !idea.votedByMe;
    const sent = (voteSent.current.get(idea.id) ?? 0) + 1;
    voteSent.current.set(idea.id, sent);
    replace({ ...idea, votedByMe: up, voteCount: Math.max(0, idea.voteCount + (up ? 1 : -1)) });
    try {
      const counted = await api<Idea>(up ? 'PUT' : 'DELETE', `/api/ideas/${idea.id}/vote`);
      if (voteSent.current.get(idea.id) === sent) replace(counted);
    } catch (err) {
      if (voteSent.current.get(idea.id) !== sent) return;
      replace(idea);
      setError(err instanceof Error ? err.message : 'Could not count that vote.');
    }
  }

  const shown =
    ideas === null
      ? null
      : view === 'planned'
        ? ideas.filter((i) => i.status === 'PLANNED')
        : view === 'done'
          ? ideas.filter((i) => i.status === 'DONE')
          : ideas;

  return (
    <div className="mx-auto max-w-2xl pb-6">
      <NavBar
        title="Ideas"
        back={back}
        className="-mx-1"
       
        right={
          !closed && (
            <button
              type="button"
              aria-label="Suggest an idea"
              title="Suggest an idea"
              onClick={() => setSuggesting(true)}
              className="press -mr-2 flex h-11 w-11 items-center justify-center text-accent-ink"
            >
              <Icon name="plus" size={24} />
            </button>
          )
        }
      />

      <div className="space-y-2.5 pb-2.5 pt-1">
        <p className="flex items-center gap-2">
          <Pill tone="mustard" icon="bulb" className="!px-2.5 !py-1 !text-[0.75rem]">
            Beta
          </Pill>
          <span className="text-[0.8125rem] text-muted">Shared by everyone on this server</span>
        </p>
        {!closed && (
          <div role="tablist" aria-label="Sort ideas" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 md:mx-0 md:px-0">
            {VIEWS.map((v) => (
              <Chip
                key={v.value}
                role="tab"
                aria-pressed={undefined}
                aria-selected={view === v.value}
                active={view === v.value}
                onClick={() => setParams(paramsFor(v.value), { replace: true })}
                className="!px-[15px] !py-2 !text-[0.875rem]"
              >
                {v.label}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {closed ? (
        <div className="card mt-2 flex flex-col items-center px-6 py-10 text-center">
          <Tile icon="bulb" tone="mustard" size={56} />
          <p className="mt-3 font-semibold">The ideas board has closed</p>
          <p className="mt-1 text-[0.9375rem] text-muted">It was here for the beta. Thank you for every idea.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {error && <ErrorText>{error}</ErrorText>}

          {shown === null ? (
            !error && <p className="py-8 text-center text-sm text-muted">Loading…</p>
          ) : shown.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-10 text-center">
              <Tile icon="bulb" tone={view === 'done' ? 'herb' : view === 'planned' ? 'sky' : 'accent'} size={56} />
              <p className="mt-3 font-semibold">
                {view === 'planned' ? 'Nothing planned yet' : view === 'done' ? 'Nothing done yet' : 'No ideas yet'}
              </p>
              <p className="mt-1 max-w-xs text-[0.9375rem] text-muted">
                {view === 'planned' || view === 'done'
                  ? 'Vote for the ideas you want most — those are the ones that get planned.'
                  : 'Yours could be the first. What would make planning, shopping or cooking easier?'}
              </p>
              {(view === 'top' || view === 'new') && (
                <Button className="mt-4" icon="plus" onClick={() => setSuggesting(true)}>
                  Suggest the first idea
                </Button>
              )}
            </div>
          ) : (
            <ul className="space-y-2.5" aria-label="Ideas">
              {shown.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  admin={admin}
                  onVote={() => vote(idea)}
                  onChanged={replace}
                  onDeleted={() => setIdeas((list) => list?.filter((i) => i.id !== idea.id) ?? null)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {suggesting && (
        <Sheet title="Suggest an idea" onClose={() => setSuggesting(false)}>
          <IdeaForm submitLabel="Post idea" busyLabel="Posting…" onSubmit={suggest} onCancel={() => setSuggesting(false)} />
        </Sheet>
      )}
    </div>
  );
}

/**
 * One idea (mockup 7.5): the vote on the left where a thumb finds it — tomato once it is yours —
 * then what it is, where it is up to and who suggested it. Your own can be reworded or taken back
 * from its •••; the admin's ••• also says where it is up to, and can take down anybody's.
 */
function IdeaCard({
  idea,
  admin,
  onVote,
  onChanged,
  onDeleted,
}: {
  idea: Idea;
  admin: boolean;
  onVote: () => void;
  onChanged: (idea: Idea) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = STATUS[idea.status];

  async function save(title: string, details: string) {
    onChanged(await api<Idea>('PUT', `/api/ideas/${idea.id}`, { title, details: details || null }));
    setEditing(false);
  }

  async function setStatus(next: IdeaStatus) {
    setError(null);
    try {
      onChanged(await api<Idea>('PATCH', `/api/ideas/${idea.id}/status`, { status: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change that.');
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', `/api/ideas/${idea.id}`);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that.');
      setBusy(false);
    }
  }

  const menu: (MenuItem | false)[] = [
    idea.mine && { label: 'Edit', onSelect: () => setEditing(true) },
    ...(admin
      ? STATUSES.filter((s) => s !== idea.status).map((s) => ({ label: STATUS[s].action, onSelect: () => setStatus(s) }))
      : []),
    (idea.mine || admin) && { label: 'Delete', tone: 'danger' as const, onSelect: () => setConfirming(true) },
  ];

  const votes = `${idea.voteCount} ${idea.voteCount === 1 ? 'vote' : 'votes'}`;

  return (
    <li className="card flex items-start gap-3 p-3.5">
      <button
        type="button"
        aria-pressed={idea.votedByMe}
        onClick={onVote}
        className={cx(
          'press flex w-10 shrink-0 flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors',
          idea.votedByMe ? 'bg-accent-soft text-accent-ink' : 'bg-surface2 text-muted',
        )}
      >
        <Icon name="chevU" size={18} strokeWidth={2.6} />
        <span className="sr-only">Upvote “{idea.title}”, </span>
        <span className="text-[0.875rem] font-bold leading-tight tabular-nums">{idea.voteCount}</span>
        <span className="sr-only">{idea.voteCount === 1 ? ' vote' : ' votes'}</span>
      </button>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start gap-1">
          <p className="min-w-0 flex-1 break-words text-[0.9375rem] font-semibold leading-[1.3]">{idea.title}</p>
          {/* Pulled into the corner, so its 44px of target does not push the text down. */}
          <ActionMenu label="Idea actions" title={idea.title} items={menu} className="-my-3 -mr-3 !text-muted" />
        </div>
        {idea.details && (
          <p className="whitespace-pre-line break-words text-[0.8125rem] leading-[1.35] text-muted">{idea.details}</p>
        )}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <Pill tone={status.tone} icon={status.icon} className="!px-2.5 !py-1 !text-[0.75rem]">
            {status.pill}
          </Pill>
          <span>
            {idea.mine ? 'You' : idea.authorName}
            <span aria-hidden="true"> · </span>
            <time dateTime={idea.createdAt} title={new Date(idea.createdAt).toLocaleString()}>
              {ago(idea.createdAt)}
            </time>
          </span>
        </p>

        {/* Two taps, not a browser confirm(), like every delete in the app. */}
        {confirming && (
          <div className="mt-1.5 space-y-2.5 border-t border-line pt-3">
            <p className="text-sm">
              {idea.mine ? 'Delete your idea?' : 'Delete this idea for everyone?'}
              {idea.voteCount > 0 && ` Its ${votes} go with it.`}
            </p>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" className="flex-1" disabled={busy} onClick={remove}>
                {busy ? 'Deleting…' : 'Delete idea'}
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>

      {editing && (
        <Sheet title="Edit idea" onClose={() => setEditing(false)}>
          <IdeaForm initial={idea} submitLabel="Save" busyLabel="Saving…" onSubmit={save} onCancel={() => setEditing(false)} />
        </Sheet>
      )}
    </li>
  );
}

/** Suggesting an idea, or rewording your own: a title, and details if there is more to say. */
function IdeaForm({
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Idea;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (title: string, details: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [details, setDetails] = useState(initial?.details ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = MAX_TITLE - title.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(title.trim(), details.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Field label="Your idea" hint={left <= 15 ? `${left} ${left === 1 ? 'character' : 'characters'} left` : undefined}>
        <Input
          aria-label="Your idea"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE}
          placeholder="In a few words"
          enterKeyHint="next"
          autoFocus
        />
      </Field>
      <Field label="Details (optional)">
        <Textarea
          aria-label="Details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={MAX_DETAILS}
          rows={3}
          placeholder="What would it help with? How might it work?"
        />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex flex-col gap-1 pt-1">
        <Button type="submit" size="lg" full disabled={busy || !title.trim()}>
          {busy ? busyLabel : submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="lg" full className="!h-10 -mt-1" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** How long an idea has been up, at a glance: "just now", "5m", "3h", "2d", then the date. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
