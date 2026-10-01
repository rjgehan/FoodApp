import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { HouseholdMember, Place, RecipeSection } from '../api/types';
import { useHousehold } from '../household/HouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { usePushedScreen } from '../components/Layout';
import { DEFAULT_SECTION_ICONS, iconByKey } from '../components/FoodIcons';
import IconPicker from '../components/IconPicker';
import { SECTION_OPTIONS } from '../utils/recipeMeta';
import {
  Avatar,
  Button,
  ErrorText,
  Field,
  Input,
  List,
  NavBar,
  Row,
  SectionLabel,
  Sheet,
  Tile,
} from '../components/ui';
import { InviteCard, InviteQrSheet, useInviteLink } from '../components/household/Invite';
import { MemberSheet } from '../components/household/MemberSheet';
import { JoinHouseholdForm } from '../components/household/JoinHousehold';
import { personTone, SignInPill, type HouseholdScreenState } from '../components/household/HouseholdParts';

type Open = 'qr' | 'icons' | 'join' | 'new' | 'leave' | null;

/**
 * The household (mockup 6.2): the way to invite somebody, who is here and how each of them signs
 * in, and the house's own setup — places, name and servings, aisles. Reached from Settings, which
 * is where its back button goes. The owner can tap anybody else for their actions.
 */
export default function HouseholdPage() {
  usePushedScreen();
  const { households, activeHousehold } = useHousehold();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as HouseholdScreenState | null)?.from;
  const back = () => navigate(from ?? '/meal-plan', { state: { openSettings: true } });

  return (
    <div className="mx-auto max-w-2xl pb-6 lg:max-w-5xl">
      <NavBar
        title={activeHousehold?.name ?? 'Household'}
        backLabel="Settings"
        back={back}
        className="-mx-1 mb-1.5"
        sides="w-24"
      />
      {activeHousehold ? (
        <HouseholdHome key={activeHousehold.id} />
      ) : (
        // Nobody in a household yet: join one somebody sent, or make your own.
        households.length === 0 && (
          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="title-section">Join a household</h2>
              <JoinHouseholdForm />
            </section>
            <section className="space-y-3">
              <h2 className="title-section">Or start your own</h2>
              <NewHouseholdForm onCreated={() => undefined} />
            </section>
          </div>
        )
      )}
    </div>
  );
}

function HouseholdHome() {
  const { activeHousehold, groceryCategories } = useHousehold();
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const household = activeHousehold!;
  const isOwner = household.role === 'OWNER';
  const [open, setOpen] = useState<Open>(null);
  const [members, setMembers] = useState<HouseholdMember[] | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [actionsFor, setActionsFor] = useState<HouseholdMember | null>(null);
  // Taking somebody out, or replacing the link, makes a new invite link; this fetches it again.
  const [linkGeneration, setLinkGeneration] = useState(0);
  const invite = useInviteLink(household.id, linkGeneration);

  const loadMembers = useCallback(async () => {
    const all = await api<HouseholdMember[]>('GET', `/api/households/${household.id}/members`).catch(() => []);
    // You first, then whoever owns the place, then everyone else as the server lists them.
    const rank = (m: HouseholdMember) => (m.userId === session?.userId ? 0 : m.role === 'OWNER' ? 1 : 2);
    setMembers([...all].sort((a, b) => rank(a) - rank(b)));
  }, [household.id, session?.userId]);

  useEffect(() => {
    loadMembers();
    api<Place[]>('GET', `/api/households/${household.id}/places`)
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, [household.id, loadMembers]);

  // The pages under this one come back here, and Household's own back button still goes home.
  const go = (path: string) => navigate(path, { state: location.state });
  const toneOf = (m: HouseholdMember) => personTone(Math.max(0, (members ?? []).indexOf(m)));
  const alone = household.memberCount <= 1;

  return (
    <>
      {/* Two columns on a wide screen: the people on the left, the house's setup on the right. */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="space-y-3.5">
          <InviteCard name={household.name} link={invite.link} error={invite.error} onShowQr={() => setOpen('qr')} />

          <section aria-labelledby="whos-here" className="pt-1">
            <SectionLabel>
              <span id="whos-here">Who's here{members ? ` · ${members.length}` : ''}</span>
            </SectionLabel>
            <List label="People" inset={0}>
              {(members ?? []).map((m) => {
                const you = m.userId === session?.userId;
                const canAct = isOwner && !you;
                return (
                  <Row
                    key={m.userId}
                    lead={<Avatar name={m.displayName} tone={toneOf(m)} size={38} />}
                    title={you ? `${m.displayName} (you)` : m.displayName}
                    subtitle={m.role === 'OWNER' ? 'Owner' : m.username}
                    end={<SignInPill member={m} />}
                    chevron={canAct}
                    onClick={canAct ? () => setActionsFor(m) : undefined}
                  />
                );
              })}
              {members === null && <Row title={<span className="text-muted">Loading…</span>} />}
            </List>
          </section>
        </div>

        <div className="space-y-3.5 max-lg:mt-3.5">
          <section aria-label="Household setup" className="pt-1 lg:pt-0">
            <SectionLabel>Household setup</SectionLabel>
            <List>
              <Row
                onClick={() => go('/household/places')}
                lead={<Tile icon="store" tone="plum" size={34} />}
                title="Places we eat"
                detail={places ? String(places.length) : undefined}
                chevron
              />
              <Row
                onClick={() => go('/household/setup')}
                lead={<Tile icon="home" tone="herb" size={34} />}
                title="Name, servings & planning"
                detail={`${household.defaultServings} · ${household.planningHorizonDays} ${household.planningHorizonDays === 1 ? 'day' : 'days'}`}
                chevron
              />
              <Row
                onClick={() => go('/household/aisles')}
                lead={<Tile icon="list" tone="sky" size={34} />}
                title="Store aisles"
                detail={String(groceryCategories.length)}
                chevron
              />
              <Row
                onClick={() => setOpen('icons')}
                lead={<Tile icon="image" tone="mustard" size={34} />}
                title="Recipe icons"
                chevron
              />
            </List>
          </section>

          <section aria-label="Other households" className="space-y-3.5 pt-3.5">
            <List>
              <Row onClick={() => setOpen('join')} lead={<Tile icon="link" tone="sky" size={34} />} title="Join a household" chevron />
              <Row
                onClick={() => setOpen('new')}
                lead={<Tile icon="plus" tone="herb" size={34} />}
                title="Start another household"
                chevron
              />
            </List>
            {/* Alone in a household, leaving is not a thing you can do — there would be nobody left
                to let you back in — so the row offers the only exit that exists. */}
            <List>
              <Row
                onClick={() => setOpen('leave')}
                lead={<Tile icon={alone ? 'trash' : 'door'} tone="accent" size={34} />}
                title={`${alone ? 'Delete' : 'Leave'} “${household.name}”`}
                titleClassName="text-accent-ink"
                subtitle={alone ? "You're the only one here" : 'Everything stays here for everyone else'}
              />
            </List>
          </section>
        </div>
      </div>

      {/* Not inside the columns: a sheet is fixed to the screen, but it would still take their spacing. */}
      {open === 'qr' && invite.link && (
        <InviteQrSheet
          householdId={household.id}
          name={household.name}
          people={members?.length ?? household.memberCount}
          link={invite.link}
          isOwner={isOwner}
          onReplaced={async () => setLinkGeneration((n) => n + 1)}
          onClose={() => setOpen(null)}
        />
      )}
      {actionsFor && (
        <MemberSheet
          householdId={household.id}
          householdName={household.name}
          member={actionsFor}
          tone={toneOf(actionsFor)}
          onClose={() => setActionsFor(null)}
          onRemoved={async () => {
            setLinkGeneration((n) => n + 1);
            await loadMembers();
          }}
        />
      )}
      {open === 'icons' && (
        <Sheet title="Recipe icons" subtitle="The picture on each drawer in Recipes" onClose={() => setOpen(null)}>
          <CatalogIcons householdId={household.id} />
        </Sheet>
      )}
      {open === 'join' && (
        <Sheet title="Join a household" onClose={() => setOpen(null)}>
          <JoinHouseholdForm onOpened={() => setOpen(null)} />
        </Sheet>
      )}
      {open === 'new' && (
        <Sheet title="Start another household" onClose={() => setOpen(null)}>
          <NewHouseholdForm onCreated={() => setOpen(null)} />
        </Sheet>
      )}
      {open === 'leave' && (
        <Sheet title={alone ? 'Delete this household' : 'Leave this household'} onClose={() => setOpen(null)}>
          <LeaveHousehold householdId={household.id} name={household.name} alone={alone} />
        </Sheet>
      )}
    </>
  );
}

/**
 * You can belong to several households — one for your own place, one for your parents' — and
 * either lets you start another. Its cupboard is offered the starter list once it exists.
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
      <Field label="Name" hint="You own it, and it starts empty. Nothing moves across from here.">
        <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Gehan House" maxLength={60} />
      </Field>
      <Button type="submit" full size="lg" disabled={creating || !newName.trim()}>
        Create
      </Button>
    </form>
  );
}

/** Picks which built-in illustration each catalog drawer wears, for everyone in the house. */
function CatalogIcons({ householdId }: { householdId: string }) {
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
        await api<Partial<Record<RecipeSection, string>>>('PUT', `/api/households/${householdId}/section-icons/${section}`, {
          iconKey,
        }),
      );
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <List>
      {SECTION_OPTIONS.map((s) => {
        const current = icons[s.value] ?? DEFAULT_SECTION_ICONS[s.value];
        const Drawing = iconByKey(current)?.Icon;
        const open = editing === s.value;
        return (
          <li key={s.value}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setEditing(open ? null : s.value)}
              className="press flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface2"
            >
              {Drawing && <Drawing className="h-8 w-8 shrink-0 text-accent-ink" />}
              <span className="flex-1 font-medium">{s.label}</span>
              <span className="text-[0.9375rem] text-accent-ink">{open ? 'Close' : 'Change'}</span>
            </button>
            {open && (
              <div className="px-4 pb-4">
                <IconPicker value={current} onChange={(key) => key && choose(s.value, key)} disabled={busy} />
              </div>
            )}
          </li>
        );
      })}
    </List>
  );
}

/**
 * The way out, which is two different doors depending on who else is here.
 *
 * With other people in the house, leaving is small: you lose your access and everything stays
 * where it is for them. Alone, there is nobody to leave it to — the server refuses the walk-out
 * for exactly that reason — so the only exit is to delete the household, and that takes
 * everything in it with no way back. Different enough that it asks you to type the name.
 */
function LeaveHousehold({
  householdId,
  name,
  alone,
}: {
  householdId: string;
  name: string;
  alone: boolean;
}) {
  const { refresh, setActiveHouseholdId, households } = useHousehold();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameMatches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  async function go() {
    setBusy(true);
    setError(null);
    try {
      if (alone) {
        await api('DELETE', `/api/households/${householdId}`);
      } else {
        await api('DELETE', `/api/households/${householdId}/members/me`);
      }
      const other = households.find((h) => h.id !== householdId);
      if (other) setActiveHouseholdId(other.id);
      // With nothing left, refresh clears the active household and the app offers to start one.
      await refresh();
    } catch (err) {
      const message = err instanceof ApiError ? (err.body as { message?: string } | null)?.message : null;
      setError(message ?? (alone ? 'Could not delete it.' : 'Could not leave.'));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {alone ? (
        <>
          <p className="text-[0.9375rem] text-muted">
            You are the only one in “{name}”, so there is nobody to leave it to. Deleting it takes its recipes, plan,
            grocery list, cupboard and photos with it, for good. Anyone who kept one of its published recipes loses that
            too.
          </p>
          <Field label={`Type ${name} to confirm`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoFocus />
          </Field>
        </>
      ) : (
        <p className="text-[0.9375rem] text-muted">
          You'll lose access to “{name}” — its recipes, plan and grocery list stay with everyone else. You can be
          invited back.
        </p>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <Button variant="danger" size="lg" full disabled={busy || (alone && !nameMatches)} onClick={go}>
        {busy ? (alone ? 'Deleting…' : 'Leaving…') : alone ? 'Delete for good' : 'Leave'}
      </Button>
    </div>
  );
}
