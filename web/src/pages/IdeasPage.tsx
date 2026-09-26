import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Idea, IdeaStatus, Me } from '../api/types';
import { PageTitle } from '../components/PageTitle';
import {
  ActionMenu,
  Badge,
  Button,
  cx,
  ErrorText,
  Field,
  Input,
  Textarea,
  type MenuItem,
} from '../components/ui';
import { LightbulbIcon, PlusIcon, UpvoteIcon } from '../components/icons';
import { useOnResume } from '../utils/useOnResume';

/** The server's Idea.MAX_TITLE and MAX_DETAILS. */
const MAX_TITLE = 80;
const MAX_DETAILS = 1000;

type Sort = 'top' | 'new';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'new', label: 'New' },
];

const STATUSES: IdeaStatus[] = ['OPEN', 'PLANNED', 'DONE', 'NOT_DOING'];

const STATUS: Record<IdeaStatus, { badge: string | null; tone: 'accent' | 'success' | 'neutral'; action: string }> = {
  // Open is where everything starts, so it wears no badge: a badge on every card says nothing.
  OPEN: { badge: null, tone: 'neutral', action: 'Mark as open' },
  PLANNED: { badge: 'Planned', tone: 'accent', action: 'Mark as planned' },
  DONE: { badge: 'Done', tone: 'success', action: 'Mark as done' },
  NOT_DOING: { badge: 'Not doing', tone: 'neutral', action: 'Mark as not doing' },
};

/**
 * The beta's ideas board: anyone signed in suggests what would make the app better, and upvotes
 * the ideas they want — theirs included. One board for the whole app, not one per house.
 *
 * Top is most votes first, with the ones done or decided against at the bottom (the server
 * sorts); New is newest first. Which one is in the address, so it survives a reload.
 */
export default function IdeasPage() {
  const [params, setParams] = useSearchParams();
  const sort: Sort = params.get('sort') === 'new' ? 'new' : 'top';
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  /** The last vote sent for each idea, so an answer overtaken by a newer tap is ignored. */
  const voteSent = useRef(new Map<string, number>());

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
    // At the top whichever way the board is sorted, so whoever posted it sees it land. Its
    // proper place comes with the next load.
    setIdeas((list) => [made, ...(list ?? [])]);
    setSuggesting(false);
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

  return (
    <div className="space-y-4">
      {/* No Beta badge of its own: the lightbulb in the bar says it, right above. */}
      <PageTitle
        title="Ideas"
        subtitle="What would make the app better? Suggest it, and upvote the ideas you want most. The board is here for the beta."
      />

      {closed ? (
        <div className="card px-4 py-8 text-center">
          <p className="font-semibold">The ideas board has closed</p>
          <p className="mt-1 text-[0.9375rem] text-muted">It was here for the beta. Thank you for every idea.</p>
        </div>
      ) : (
        <>
          {suggesting ? (
            <div className="card p-4">
              <IdeaForm submitLabel="Post idea" busyLabel="Posting…" onSubmit={suggest} onCancel={() => setSuggesting(false)} />
            </div>
          ) : (
            <Button full size="lg" onClick={() => setSuggesting(true)}>
              <PlusIcon className="h-5 w-5" />
              Suggest an idea
            </Button>
          )}

          <div className="flex rounded-xl bg-elevated p-0.5" role="tablist" aria-label="Sort ideas">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="tab"
                aria-selected={sort === s.value}
                onClick={() => setParams(s.value === 'top' ? {} : { sort: s.value }, { replace: true })}
                className={cx(
                  'h-9 flex-1 rounded-lg px-2 text-sm font-medium transition-colors',
                  sort === s.value ? 'bg-surface text-ink shadow-sm' : 'text-muted',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {error && <ErrorText>{error}</ErrorText>}

          {ideas === null ? (
            !error && <p className="py-8 text-center text-sm text-muted">Loading…</p>
          ) : ideas.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
                <LightbulbIcon className="h-7 w-7" />
              </span>
              <p className="mt-3 font-semibold">No ideas yet</p>
              <p className="mt-1 max-w-xs text-[0.9375rem] text-muted">
                Yours could be the first. What would make planning, shopping or cooking easier?
              </p>
            </div>
          ) : (
            <ul className="space-y-3" aria-label="Ideas">
              {ideas.map((idea) => (
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
        </>
      )}
    </div>
  );
}

/**
 * One idea: the vote on the left where a thumb finds it, what it is, who suggested it and when.
 * Your own can be reworded or taken back from its •••; the admin's ••• also says where it is up
 * to, and can take down anybody's.
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

  if (editing) {
    return (
      <li className="card p-4">
        <IdeaForm initial={idea} submitLabel="Save" busyLabel="Saving…" onSubmit={save} onCancel={() => setEditing(false)} />
      </li>
    );
  }

  const votes = `${idea.voteCount} ${idea.voteCount === 1 ? 'vote' : 'votes'}`;

  return (
    <li className="card flex gap-3 p-3">
      <button
        type="button"
        aria-pressed={idea.votedByMe}
        onClick={onVote}
        className={cx(
          'press flex min-h-[3.25rem] w-12 shrink-0 flex-col items-center justify-center self-start rounded-xl py-1.5',
          idea.votedByMe ? 'bg-accent text-accent-ink' : 'bg-elevated text-ink',
        )}
      >
        <UpvoteIcon
          className={cx('h-5 w-5', !idea.votedByMe && 'text-accent')}
          fill={idea.votedByMe ? 'currentColor' : 'none'}
        />
        <span className="sr-only">Upvote “{idea.title}”, </span>
        <span className="text-[0.9375rem] font-semibold leading-tight tabular-nums">{idea.voteCount}</span>
        <span className="sr-only">{idea.voteCount === 1 ? ' vote' : ' votes'}</span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <p className="min-w-0 flex-1 break-words pt-0.5 font-semibold leading-snug">{idea.title}</p>
          {/* Pulled into the corner, so its 44px of target does not push the text down. */}
          <ActionMenu label="Idea actions" title={idea.title} items={menu} className="-mr-2 -my-3" />
        </div>
        {idea.details && (
          <p className="mt-1 whitespace-pre-line break-words text-[0.9375rem] leading-relaxed text-muted">{idea.details}</p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] text-muted">
          {status.badge && <Badge tone={status.tone}>{status.badge}</Badge>}
          <span>{idea.mine ? 'You' : idea.authorName}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={idea.createdAt} title={new Date(idea.createdAt).toLocaleString()}>
            {ago(idea.createdAt)}
          </time>
        </p>

        {/* Two taps, not a browser confirm(), like every delete in the app. */}
        {confirming && (
          <div className="mt-3 space-y-2.5 border-t border-line pt-3">
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
        {error && (
          <div className="mt-2">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
      </div>
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
    <form onSubmit={submit} className="space-y-3">
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
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy || !title.trim()}>
          {busy ? busyLabel : submitLabel}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
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
