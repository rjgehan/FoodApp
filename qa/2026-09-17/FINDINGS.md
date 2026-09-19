# Meal Planner: overnight QA, 17 Sep 2026

A local build of `main` plus your uncommitted work (cupboard amounts, optional ingredients, the Today
redesign, recipe groups), tested on a wiped database at iPhone size (390×844, touch, no hover),
light and dark. Covered: every screen, the dashboard API, and permissions between households.
Gemini features were not pressed (daily quota).

## Verdict for tomorrow's deploy

**Ship it, but apply at least patches 0001, 0002 and 0010 first.** The new features work. Three
problems would surface right away:

| # | Problem | Why it matters tomorrow | Patch |
|---|---|---|---|
| 1 | **Any signed-in account can listen to any household's grocery list live.** The websocket checks your token but not which household you subscribe to, and household ids are on the public sign-in screen. | A privacy leak. Only family has accounts today, but it has to be closed before outside households join. | 0001 |
| 2 | **Recipes can't be saved from a phone still running yesterday's app.** The new `optional` flag is required, so the old build's requests get a 400. | Home-screen apps keep the old JavaScript until they're fully closed. Mum taps Save and gets "Could not save". | 0010 |
| 3 | **Typing "lb" and tapping Return saves "cup".** A unit typed in full brings back the whole list with "cup" highlighted; "l" + Return gives "lb". | iPhone users tap Return. Recipe and cupboard amounts come out wrong without anyone noticing. | 0002 |

The other nine patches are low-risk improvements, described below. All twelve apply cleanly to your
current working tree:

```bash
git apply --check qa/2026-09-17/all-fixes.diff   # dry run
git am qa/2026-09-17/patches/*.patch            # or one at a time: git apply qa/2026-09-17/patches/0001-*.patch
```

`git am` needs your uncommitted work committed first, because the patches were made on top of it.
`git apply` works on the working tree as it is now.

**How the patches were checked:** the patched copy ran on ports 8081/5174 against its own database.
The new test suite (82 tests) ran against both builds: 20 tests went from failing to passing and
none went the other way. Backend unit tests (11, including a new `WebLinksTest`), the TypeScript check and
`vite build` all pass.

---

## The inventory problem (your #1): what testing showed

This part should shape the inventory redesign. The current behaviour, confirmed in the app:

1. **"Add this week to Groceries" adds everything again on every press.** Press it twice and steak
   goes 4 lb → 8 lb, garlic 14 → 28 cloves. Adding the week, planning one more meal, then adding
   again inflates everything. This is the biggest trust problem in the app today.
   *Not patched:* the right fix (remember which planned meals are already on the list) belongs in
   the inventory redesign.
2. **"Add this week" means the week on screen, not the days you're shopping for.** On a Thursday
   the Plan tab opens on Sun–Sat, which is mostly past. The page says "Planning 7 days ahead —
   through Sep 23" while the button finds "Nothing planned to add" and ignores Mon–Wed of next week.
3. **Done shopping records that you have something, never how much.** You buy 6 lb of steak and
   the cupboard says "have steak". If the item is counted, the count doesn't change (tested: still
   0 lb after buying).
4. **A counted item at 0 still counted as "have it".** The grocery list said "Cupboard says you
   have this" for 0 lb of steak, and Today said "Stocked". *Patched (0004).*
5. **Nothing happens when a meal is cooked.** There's no "Cooked" action anywhere, not even on the
   expanded meal row, which has Change / View recipe / servings / delete. The loop has no
   "used it" step yet.
6. **The same food ends up with several names, so it never matches.** "grated parmesan" and
   "parmesan" are separate lines; "mozzarella, shredded" keeps the note in the name; "chicken
   breasts" vs "chicken breast". The paste parser keeps whatever text it's given. Inventory can
   only be as good as this matching.
7. **A blank amount is saved as 1.** "Salt and pepper to taste" becomes "1 Salt and pepper to
   taste" on the recipe, the index card, the share link and the grocery list.
   (`RecipeForm.tsx:136`, `quantity ?? 1`.)
8. **Planned servings default to the household size, not the recipe's.** Steak Frites serves 2;
   planned for a household of 4 it doubles to 2 lb steak and 4 lb potatoes. That may be what you
   want, but people won't expect it, and optional garnishes scale too (2 bunches of parsley).
9. **Adding the same item by hand twice makes two lines.** "milk" then "Milk" appear as two rows.

What works well: aggregation across recipes (unit-aware), scaling, optional extras chosen per
meal, "Always have" staples left off, and live sync across phones (checked with two devices; ticks
arrive with no refresh).

---

## The twelve patches

| Patch | What changes |
|---|---|
| **0001** | Websocket SUBSCRIBE only allowed for households you're in. |
| **0002** | Unit field: Return keeps what you typed; an exact match sorts first ("l" stays "l"); the list opens upward when there's no room below (the cupboard editor's list ran off the screen). |
| **0003** | Sign-in finds "Ryan" as "ryan" (exact match first, then an unambiguous case-insensitive one). The PIN lockout counts per lowercased name, so changing case doesn't earn extra tries. New usernames can't clash by case. Username fields set `autocapitalize="none"`, `autocorrect="off"`, `spellcheck=false`. |
| **0004** | A counted item at 0 is treated as not in the house: grocery flag, planned-item flag, and Today's "Stocked". |
| **0005** | Validation: no negative amounts; no 0-serving meals; names capped at 200 and units at 40 (a 5,000-character name was a 500 error); dashboard `/plan` limited to 366 days (`?days=100000` returned 3.3 MB). |
| **0006** | Links typed without `https://` ("tiktok.com/@cook/…", "tonys.com/menu") get it added. `javascript:` and other schemes are still refused. When a link is refused, the reason shows under the field. Before, the recipe page was replaced by an error, and the place sheet did nothing while the error went to the console. |
| **0007** | Group cards: the 24pt + and ✏︎ are replaced by one 44pt ••• button that opens the group sheet, which gains "Add a group inside…". The collapse chevron gets a 44pt target. "Not now" on "Split … up?" is remembered on the device; it used to come back on every reload. |
| **0008** | Optional ingredients are marked as optional on the recipe, share link and index card. The dashboard API gets `"optional": true` and "(optional)" on the pre-rendered line; INTEGRATION.md is updated. The field is additive, so the kiosk won't break. |
| **0009** | Today's "Not made in a while": tonight's dinner no longer shows as "made yesterday", recipes already on the plan aren't suggested, and "days ago" counts calendar days. |
| **0010** | Recipes save fine when `optional` is left out (old clients). |
| **0011** | Planned meals come back in eating order (breakfast → lunch → dinner → snack), with a main before the sides added to it. Meal types are stored as text, so the database sorted Dinner before Lunch: Plan's week summary read "Breakfast, Dinner, Dinner, Lunch". A main and its side also came back in random order, in the app and the dashboard API. |
| **0012** | Household names capped at 60 (a 5,000-character name was a 500). Settings capped at 1–50 servings and 1–60 days ahead (100,000 days was accepted, and Today and Plan load that many days). The settings form now shows an error instead of failing silently. |

---

## Everything else found, by screen

### Sign-in
- **The sign-in screen lists every household and member to anyone who loads the site**, including
  which accounts still need a PIN (`/api/auth/landing`, `/api/auth/households/{id}/users`). With
  that, someone could:
  - **Claim a new account.** A new member chooses their PIN the first time anyone taps their name.
    Whoever finds the site first can take it.
  - **Lock anyone out on purpose.** Five wrong PINs = 15 minutes, per account.
  - **Guess a PIN.** Five tries every 15 minutes gets through all 10,000 PINs in about 3 weeks;
    on average one account falls in about 10 days.

  Fine for the beta, but it's the reason to move to email/password (or at least invite links)
  before strangers join.
- A member can add any existing username into their household without that person agreeing.
- On a brand-new database, the "You were signed out" banner shows on the first-run form.
- Keypad sign-in works with a hardware keyboard too, and mismatched PINs are caught.

### Today
- The hero shows a plain coloured block with "Dinner" in it, then "Dinner" again right below.
  Recipes with no photo need a better empty state.
- A dinner's side (Caesar Salad) shows as a separate "Dinner" row below instead of with the main.
- The main action is "+ Add to grocery list". On the day, "View recipe" (or later "Cooked ✓") is
  what's needed; by dinner time, adding to the list is too late.
- "3 open / Plan" is unclear. It means days with nothing planned; "3 days to plan" would say so.
- On an empty account the tiles say "All done" and "Stocked", which reads as if things are fine.
- The hero always picks dinner, even at 7 am.
- The "plan something" link opens Plan but not today's day sheet.

### Plan
- Adding a meal takes four taps (next week → Tuesday → Add → recipe) and nobody should get lost.
  It's the best flow in the app.
- The recipe picker lists every recipe for every meal, with no dinner-first sorting when adding a
  dinner.
- A restaurant lunch and a single food ("eggs") both offer "Add side".
- "Add Snack" only adds an empty row; you then tap that row's own Add. That's one more tap than
  needed.
- The expanded meal row has an unlabelled number box with a "Set" button (it's the servings), and
  the trash icon sits alone on its own line.
- The optional-extras prompt is wordy and never uses the word "optional". Suggestion: "Buying the
  extras this time?" Once planned, the choice can't be seen or changed.
- "eggs — Not in the cupboard" offers no one-tap "add to list".

### Recipes
- A recipe page has four equal text links (Edit · Share · Organize · Index card) and no main
  action. The most prominent button is "Watch on TikTok". **There's no "Plan this"**; going from a
  recipe to the plan means switching tabs.
- Photo and video editing sit between Ingredients and Method, splitting the part you cook from.
- "Drawer", "Filed under", "Groups" and "sub-categories" all name related things. Pick one
  vocabulary.
- A drawer shows only group cards. To see a recipe you drill in, or use search.
- Nested groups render as an indented row that's hard to tie to its parent (Beef/Chicken appear
  under Full meal/Italian).
- "Split Main dish up?" appears with just 3 recipes, as a big orange primary button above the
  recipes.
- "Sort 1 into a group" only offers top-level groups: the chili can't go straight into Beef, and
  nothing suggested Beef.
- A drawer shows every default group even when empty (Full meal / Side / Veggie, 0 recipes).
- Inside Beef, the new-group placeholder still says "Chicken, Seafood, Pasta…".
- The paste parser handles an ordinary recipe well (fractions, units, steps). It keeps notes in
  names (see inventory #6), and "Salt and pepper to taste" becomes one ingredient.
- "Opt" on the ingredient row is cryptic. "Optional" or a toggle would be clearer.
- Deleting a shared recipe silently removes it from the other household's plan. Their Tuesday
  lunch just disappears. The confirmation mentions planned meals and share links, but not that
  other households lose it too.
- A shared recipe says "from another household" without saying which one.
- The share sheet has "Copy link" but not the iOS share sheet (`navigator.share`).
- The public recipe page has no "Get the app" / "Save this recipe", a missed acquisition hook.
- "Normal view" on the index card sits outside the page gutter.

### Groceries
- On a real phone there's no trash icon (swipe only), which is right. (In a desktop browser they
  show; that's the `hover` media query.)
- Units aren't pluralised or tidied: "14 clove", "1.5 cup" (the recipe says "1½ cup").
- No line says which meal it's for.
- The "✨ Sort" (Gemini) button appears whenever anything is unsorted. It's easy to spend quota
  by accident.
- The "Done shopping" sheet shows names only, not amounts.

### Cupboard
- There's no Add button: you add by typing into "Do we have…?". It works but isn't discoverable.
- Typing part of a word offers to add that fragment ("Add 'gar' — we have it") even when garlic
  already matches.
- "Always have" items still show a Have/Low toggle, which means nothing for them.
- Switching an item to exact amounts starts at "1", with no unit, even right after buying 4 lb.
- The −/+ buttons step by 1 whatever the unit (fine for cans, odd for cups).

### Household
- The page is about 3,000pt tall with three separate save buttons (Rename, Save settings, Save).
  Settings, profile, catalog icons, store layout and "Our recipes" would fit better as separate
  rows that each open their own screen.
- After creating a household, the "Add someone" form from before stays open.

### Whole app
- **Six tabs** in the bottom bar. Apple's guideline is at most five; Cupboard or Household could move.
- The sign-out button sits right next to the avatar, on every screen.
- No `apple-touch-icon` or favicon, so "Add to Home Screen" uses a screenshot as the icon.
- Dark mode looks right on every main tab.
- The console shows only React Router v7 "future flag" warnings, no errors.

### Dashboard API (INTEGRATION.md)
- Shapes match the docs; key checks, 404s and 400s are right; each household only sees its own
  data; grocery writes reach phones live.
- **Filtering by a parent group misses recipes in its sub-groups.** After "Split Main dish up?",
  `?category=Main dish` no longer returns the steak recipes, and a recipe's `categories` shows only
  the leaf ("Beef"). A kiosk that filters by "Main dish" silently loses recipes. *Not patched* —
  it's a design choice whether categories should include ancestors.
- A main and its side came back in no fixed order (`/plan` listed Caesar Salad before Garlic Butter Pasta, `/today` the other way round). *Patched (0011).*
- Your local `.env` has `INTEGRATION_API_KEY` commented out, so it's off locally unless you start
  the backend with it.

### Two phones at once
- **Both phones pressing "Done shopping" at the same moment:** one of them gets a 500.
- **Double-tapping "Add" for something brand new** (grocery item or cupboard): the extra taps get
  500s. Both requests try to create the same new ingredient and hit a unique constraint.

These are rare in a family, but they show as "Something went wrong". *Not patched:* the fix is a
retry on conflict in the ingredient/cupboard create path, which needs more care than tonight
allowed. Tests are in place (`household.spec.ts`).

### Checked and fine
- Changing a planned meal's recipe or servings; clearing and setting a time; "Add this day to
  Groceries".
- Eat-out places created from the picker; deleting a place clears its planned nights; adding a
  place that exists (any case) returns it.
- Month view; search by ingredient; the recipe page's ‹ › arrows.
- Cupboard: Low toggle (Today counts it), Buy again, Always have.
- Move mode aisles stick; reordering aisles reorders the list.
- The last member can't leave; a member who leaves loses access.
- Tampered or unsigned tokens are refused.
- SVG, HTML and oversized uploads are refused. (A non-image labelled PNG is accepted, but it's
  served as `image/png` with `nosniff`, so it's harmless.)
- Photos are cached for a year (immutable ids).

### Server
- On a fresh database, two startup steps log "bad SQL grammar" warnings (`StartupBackfills`,
  `SchemaTouchUps`). They're harmless there because the old column doesn't exist, but they look
  alarming.
- `MealplannerApplicationTests` runs against your real dev database, not a test one.

## Not covered
- **AI**: "Write it for me" and ✨ Sort (quota).
- **Real iPhone Safari**: keyboard behaviour, the home-screen app, safe areas on a notched phone.
  All of this was Chrome emulating a phone.
- **Production-only pieces**: nginx, Cloudflare, backups, deploy.
- **Big photos**: image uploads over 4 MB and slow networks.

---

## What's in this folder / what was added to the repo

- `qa/2026-09-17/FINDINGS.md`: this file.
- `qa/2026-09-17/Meal Planner QA 2026-09-17.pdf`: these findings plus the screen inventory
  (every screen and sheet, light and dark).
- `qa/2026-09-17/patches/`: the twelve fixes, one per file; `all-fixes.diff` is all of them together.
- `e2e/`: the new Playwright suite (82 tests: API and iPhone UI; 11 still marked as known issues after the patches), reset and seed scripts, the
  screen-inventory generator, and a README with the hallway-test script. Known bugs are marked
  `test.fail`, so a run is green today and flags each bug when it's fixed.
- `.claude/skills/test-app/`: how a future Claude session runs all of this.

**Nothing was committed or pushed.** Your uncommitted work is untouched; the patches were made in a
separate scratch copy.
