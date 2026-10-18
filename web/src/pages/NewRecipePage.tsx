import { useEffect, useState } from 'react';
import NoHousehold from '../components/NoHousehold';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useHousehold } from '../household/HouseholdContext';
import { useTags } from '../components/catalogue/catalogueStore';
import { useTablessScreen } from '../components/Layout';
import RecipeForm, { type RecipeDraft } from '../components/RecipeForm';
import { FromALink } from '../components/RecipeFromLink';
import { PasteFromAi } from '../components/RecipePaste';
import { Card, NavBar, NoteBox, Tile, type Tone } from '../components/ui';
import { Icon, type IconName } from '../components/icons';
import { SECTION_OPTIONS, sectionLabel, sectionSlug } from '../utils/recipeMeta';
import { SAVED_LINKS_PATH } from '../utils/savedLinks';
import { readTagNames, tagsIn } from '../utils/tags';
import { APP_NAME } from '../brand';

type Way = 'type' | 'link' | 'paste';

const WAYS: { way: Way; icon: IconName; tone: Tone; title: string; detail: string }[] = [
  { way: 'type', icon: 'pen', tone: 'accent', title: 'Type it out', detail: 'Ingredients and method, line by line. "2 cups flour" splits itself.' },
  {
    way: 'link',
    icon: 'link',
    tone: 'sky',
    title: 'From a link',
    detail: "Recipe websites, TikTok, YouTube or Instagram. Reads the site's own recipe data or the video caption. No AI.",
  },
  { way: 'paste', icon: 'sparkles', tone: 'plum', title: 'Paste from an AI', detail: 'We give you a ready-made question for any chatbot. Paste its answer back.' },
];

/**
 * Handed over by Saved links: the link being made into a recipe, and what to start the form
 * from — what an import read off it, or just its name, the link and its picture.
 */
export interface FromSavedLink {
  savedLinkId: string;
  name: string;
  draft: RecipeDraft;
  /** The steps were pieced together from what is said in the video. */
  spoken?: boolean;
}

/** A link or a paste that has been read, open in "Check recipe" before it is saved. */
interface Checking {
  draft: RecipeDraft;
  note?: string;
}

/**
 * New recipe (the mockup's 3.13): three ways in, as cards — type it out yourself, read it off a
 * link (a TikTok, a Reel or a recipe site), or paste one an AI wrote in the layout the app can
 * read. All three end in the same form, "Check recipe" (3.16), looked at before it is saved.
 *
 * Opened from a drawer (`?section=DINNER&tags=Chicken,Quick`, the tags that were chosen there),
 * every way in starts filed there — the drawer picked and the tags ticked, all still yours to
 * change — and the page says where. A link from before tags (`?group=<id>`) starts with that
 * group's name ticked.
 */
export default function NewRecipePage() {
  const { activeHouseholdId } = useHousehold();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  useTablessScreen();
  // Read once, when the page opens: it is where this recipe started, not something to follow.
  const [fromLink] = useState<FromSavedLink | null>(() => {
    const state = location.state as { fromSavedLink?: FromSavedLink } | null;
    return state?.fromSavedLink ?? null;
  });
  const [way, setWay] = useState<Way | null>(null);
  /**
   * Every way opened so far stays alive behind the others, so going back to the choices and
   * into another way does not throw away a half-typed recipe, a paste, or a link's draft.
   */
  const [opened, setOpened] = useState<Way[]>([]);
  const [checking, setChecking] = useState<Checking | null>(null);
  /** A link pasted into Paste, carried over to From a link. */
  const [handedLink, setHandedLink] = useState('');

  const section = SECTION_OPTIONS.find((s) => s.value === params.get('section'))?.value;
  // The tags the drawer had chosen. The household's tags are kept from the drawer, so they are
  // known at once; they are only needed for a name with a comma in it, or an old ?group= link.
  const known = useTags(activeHouseholdId);
  const groupId = params.get('group');
  const tags = params.get('tags')
    ? readTagNames(params.get('tags'), section && known ? tagsIn(known, section).map((t) => t.name) : [])
    : groupId
      ? (known?.filter((t) => t.id === groupId).map((t) => t.name) ?? [])
      : [];
  // The form reads its filing once, when it starts: a name that arrives later starts it again.
  const tagsKey = tags.join('\n');

  // Each step is a page of its own: "Read into form" lands on the top of the form, with the bar
  // and its Save in view, not wherever the paste page had been scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [way, checking]);

  if (!activeHouseholdId) {
    return (
      <Card>
        <NoHousehold />
      </Card>
    );
  }

  const done = (id: string) => navigate(`/recipes/${id}`, { replace: true });
  // Back to the drawer it was started from, with its tags still chosen — not to the front.
  const backTo = fromLink
    ? SAVED_LINKS_PATH
    : section
      ? `/recipes/section/${sectionSlug(section)}${tags.length ? `?${new URLSearchParams({ tags: tags.join(',') })}` : ''}`
      : '/recipes';

  const saveButton = (form: string) => (
    <button type="submit" form={form} className="press font-semibold">
      Save
    </button>
  );

  if (fromLink) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 pb-6">
        <NavBar title="Check recipe" back={() => navigate(backTo)} backLabel="Saved links" right={saveButton('check-recipe')} />
        <div role="note">
          <NoteBox tone={fromLink.spoken ? 'mustard' : 'herb'} icon={fromLink.spoken ? 'alert' : 'check'}>
            {fromLink.spoken
              ? 'The steps were pieced together from what’s said in the video. Give them a read, then save — '
              : 'Made from your saved link. Fill in what it needs, then save — '}
            “{fromLink.name}” comes off Saved links once it’s a recipe.
          </NoteBox>
        </div>
        <RecipeForm
          id="check-recipe"
          householdId={activeHouseholdId}
          draft={fromLink.draft}
          section={section}
          savedLinkId={fromLink.savedLinkId}
          onSaved={(r) => done(r.id)}
        />
      </div>
    );
  }

  function open(next: Way) {
    setOpened((list) => (list.includes(next) ? list : [...list, next]));
    setWay(next);
  }

  // "Dinner · Chicken, Quick", as the recipe's own filing reads everywhere else.
  const filedIn = section ? [sectionLabel(section), tags.join(', ')].filter(Boolean).join(' · ') : null;
  const titles: Record<Way, string> = { type: 'New recipe', link: 'From a link', paste: 'Paste from an AI' };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 pb-6">
      {checking ? (
        <NavBar
          title="Check recipe"
          left={
            <button type="button" className="press text-[1.0625rem] text-accent-ink" onClick={() => setChecking(null)}>
              Cancel
            </button>
          }
          right={saveButton('check-recipe')}
        />
      ) : way ? (
        <NavBar
          title={titles[way]}
          back={() => setWay(null)}
          backLabel="New"
         
          right={way === 'type' ? saveButton('type-recipe') : undefined}
        />
      ) : (
        <NavBar
          title="New recipe"
          left={
            <button type="button" className="press text-[1.0625rem] text-accent-ink" onClick={() => navigate(backTo)}>
              Cancel
            </button>
          }
        />
      )}

      {checking && (
        <>
          {checking.note && (
            <NoteBox tone="mustard" icon="alert">
              {checking.note}
            </NoteBox>
          )}
          {/* Keyed on the name so reading a second one really does replace the fields. */}
          <RecipeForm
            key={checking.draft.name}
            id="check-recipe"
            householdId={activeHouseholdId}
            draft={checking.draft}
            section={section}
            tags={tags}
            onSaved={(r) => done(r.id)}
          />
        </>
      )}

      {!checking && !way && (
        <div className="flex flex-col gap-3.5">
          {filedIn && (
            <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
              <Icon name="folder" size={14} className="shrink-0" />
              <span>
                Will be filed in <b className="font-semibold text-ink">{filedIn}</b>
              </span>
            </p>
          )}
          {WAYS.map((w) => (
            <button
              key={w.way}
              type="button"
              onClick={() => open(w.way)}
              className="card press flex items-start gap-3.5 p-[18px] text-left active:bg-surface2"
            >
              <Tile icon={w.icon} tone={w.tone} size={48} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="serif text-[1.25rem] leading-tight">{w.title}</span>
                <span className="text-sm leading-[1.45] text-muted">{w.detail}</span>
              </span>
              <Icon name="chevR" size={18} className="mt-3.5 shrink-0 text-faint" />
            </button>
          ))}
          <div className="flex items-center gap-3 rounded-card bg-surface2 p-4">
            <Tile icon="share" tone="herb" size={36} />
            <p className="min-w-0 flex-1 text-[0.8125rem] text-muted">
              On iPhone you can also share a page or TikTok straight into {APP_NAME} from any app.
            </p>
          </div>
        </div>
      )}

      {opened.map((w) => (
        <div key={`${w}:${tagsKey}`} hidden={!!checking || way !== w}>
          {w === 'link' ? (
            <FromALink
              householdId={activeHouseholdId}
              link={handedLink}
              section={section}
              tags={tags}
              onSaved={(r) => done(r.id)}
              onDraft={(draft, note) => setChecking({ draft, note })}
              onTypeInstead={() => open('type')}
            />
          ) : w === 'paste' ? (
            <PasteFromAi
              householdId={activeHouseholdId}
              section={section}
              tags={tags}
              onLink={(link) => {
                setHandedLink(link);
                open('link');
              }}
              onSaved={(r) => done(r.id)}
              onDraft={(draft) => setChecking({ draft })}
            />
          ) : (
            <RecipeForm id="type-recipe" householdId={activeHouseholdId} section={section} tags={tags} onSaved={(r) => done(r.id)} />
          )}
        </div>
      ))}
    </div>
  );
}
