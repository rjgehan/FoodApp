# Meal Planner for iOS

A native client for the same backend the web app uses. No new API: it signs in with an email
and password (or the older PIN flow), reads the plan, the groceries and the recipes, and ticks
things off.

## Running it

Once, after installing Xcode:

```bash
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch
```

Then, with the dev backend up (`./dev.sh start` at the repo root):

```bash
cd ios
./preview.sh                  # build, boot a simulator, install, launch
./preview.sh --shot look.png  # ...and save a screenshot
```

Or open `MealPlanner.xcodeproj` in Xcode and press ⌘R.

## TestFlight

```bash
cd ios && ./release.sh        # archive a Release build and upload it to App Store Connect
```

The app is "Gehan Meal Planner" in App Store Connect (bundle id cloud.gehan.mealplanner, team
5TCCXKJ243). The build number is the commit count, so every upload is higher than the last.
The internal group "Family" has automatic distribution on: a build reaches everyone in it a few
minutes after upload, once Apple has processed it — no review for internal testers. To add
someone: App Store Connect → Users and Access → + (they accept the email invite), then
TestFlight → Family → Testers → +. Each build works for 90 days; any newer upload replaces it.

## Updating everybody's phone

```bash
cd ios
./update-phones.sh            # every phone paired with this Mac
./update-phones.sh jen        # just the ones whose names contain "jen"
```

It finds every paired iPhone, reaches each one over Wi-Fi if it can (or the cable if it is
plugged in), builds once and installs on all of them without opening the app. Anything it could
not reach is listed at the end with the reason — plug those in, unlock them, and run it again.

A free personal team's builds stop opening after seven days, so run it at least once a week.
Wi-Fi needs the phone on the same network as this Mac and to have been plugged in once since it
was paired. A phone new to the team has to be plugged in the first time, with
`./preview.sh --phone <name>`, so it gets registered.

## Looking at every screen

Two ways, both without a backend:

- **Xcode canvas** — every view file ends in a `#Preview`, so ⌥⌘↩ draws it from `SampleData`.
- **The Gallery tab** — a debug-only tab listing every screen, with a light/dark switch. It is
  the app's version of the screen-inventory PDF the web has. It never calls the network.

## The design system

Every screen is drawn from `MealPlanner/Features/Design` — the "Tomato Kitchen" redesign — so a
screen never spells out a colour, a corner or a font of its own:

- **Colours** — `Palette.bg`, `.surface`, `.text`, `.muted`, `.accent`, `.accentInk`, `.herb`…:
  the 21 tokens of the theme in force, light or dark as the screen is (ThemeTokens.swift has the
  five themes). `Tone` (.accent, .herb, .mustard, .plum, .sky) pairs a soft fill with its ink, for
  pills, tiles and notes. Herb is good / done / have it, mustard a warning, plum eating out, sky
  the cupboard.
- **Type** — UI text is SF Pro; titles are the theme's title face (Fraunces, or Nunito for
  Blueberry and Inter for Nordic, bundled in `MealPlanner/Fonts`): `Text("Plan").titleFont(34)`,
  26 for a sheet, 20 for a section head. Large navigation titles already use it.
- **Components** — `.buttonStyle(.primary / .secondary / .soft / .ghost / .dark / .danger)` and
  `.kitchen(_:size:.small)`, `IconButton`, `Card`, `ListGroup` + `ListRow`, `KitchenSection` and
  `.kitchenList()` for a system List, `FieldBox`, `SearchBox`, `Pill`, `Chip`, `SegmentedControl`,
  `CheckCircle`, `CheckBox`, `NoteBox`, `Tile`, `Avatar`, `LargeTitle`, `SectionHead`,
  `SectionLabel`, `SheetHeader` + `.kitchenSheet()`, `RecipePhotoPlaceholder` (a recipe without a
  photo, in one of the `Hue`s), and `TopBar` / `householdHeader()` for the row along every tab.
- **Seeing them** — each file has light and dark `#Preview`s, and Gallery → Design system shows
  them all in the theme in force (`-mp_debug_screen design`).

Settings → Theme picks Light / Dark / System and Tomato, Matcha, Blueberry, Brunch, Nordic or a
custom accent, saved to the account with the keys `tomato`, `matcha`, `blueberry`, `brunch`,
`nordic`, `custom`. The old keys an account may still carry (`classic`, `basil`, `ocean`…) are read
as the theme that replaced them.

## Landing straight in a household (debug builds)

Command-line arguments become UserDefaults, so a screenshot or automation run can skip the PIN
pad and pick a tab:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'content-type: application/json' -d '{"username":"ryan","pin":"1234"}' | jq -r .token)

xcrun simctl launch <udid> cloud.gehan.mealplanner \
  -mp_debug_token "$TOKEN" \
  -mp_debug_household "<household-uuid>" \
  -mp_debug_household_name "Gehan House" \
  -mp_debug_tab groceries          # plan | recipes | groceries | household | gallery
```

`-mp_debug_screen edit|detail|settings|household|ideas` opens that sheet on top, and `-mp_debug_screen
day` (with `-mp_debug_tab plan`) opens today's day sheet; add `-mp_debug_expand 1` to open the
first dish's options. On the Plan tab, `-mp_debug_plan upcoming` opens on Upcoming, and
`-mp_debug_screen options|addweek|fill|fillout|create|extras` opens a planned meal's options, the
add-the-week sheet, filling a later dinner (eat in, or the night out on eat out), a new recipe
from a slot, or the optional-extras question. With `-mp_debug_screen edit`, `-mp_debug_scroll links` scrolls the editor
down to its Links section.

`-mp_debug_drawer dinner` opens that drawer on the Recipes tab; with it, `-mp_debug_screen add`
opens the new-recipe form from the drawer (add `-mp_debug_group Veggie` to start it in that
group, and `-mp_debug_scroll filing` to scroll to the drawer and groups), and `-mp_debug_screen
groups` its group editor. `-mp_debug_screen household -mp_debug_scroll icons` opens Recipe icons,
and `-mp_debug_expand 1` its picker for Dinner.

`-mp_debug_tab recipes -mp_debug_screen new` opens New recipe; add `-mp_debug_new link` or
`-mp_debug_new paste` to open it on that way in. `-mp_debug_link "<url>"` fills From a link and
reads it; `-mp_debug_paste "<text>"` fills Paste (and `-mp_debug_autoparse 1` reads it).
`-mp_debug_rules 1` shows Paste as a phone without Apple Intelligence sees it: the format
warning and the rules-only reader.

`-mp_debug_screen share -mp_debug_recipe <recipe-uuid>` opens that recipe from the server with its
Share sheet up (the public link, your other households, Explore).

`-mp_debug_screen household -mp_debug_scroll people` opens Who's here, with the Invite someone
section; add `-mp_debug_expand 1` to open a password reset link for the first other person, or
`-mp_debug_expand remove` to ask to remove them (sign in as the owner).

`-mp_debug_screen theme` opens Settings → Theme, `theme-sheet` the same inside a sheet (as Settings
shows it), `design` the design system's catalogue, `gallery` the Gallery and `switch` the
household switcher.

Signed out, `-mp_debug_screen scan` opens the Scan screen (the simulator has no camera, so it
shows the paste-a-link fallback); add `-mp_debug_invite <token>` to open that invite as though it
had just been scanned. A debug launch
never shows the "add an email and password" prompt on top of a `-mp_debug_screen`, except
`-mp_debug_screen credentials`, which shows just the prompt.

The welcome screens: `-mp_debug_first_run 1` is a phone that has never opened the app (the
first-run tutorial; `-mp_debug_tutorial_step 2` opens it on "Light or dark?"), and
`-mp_tutorialSeen 1` one that has. `-mp_debug_link "mealplanner://invite/<token>"` (or
`…/reset/<token>`) launches as though opened with that link. Signed out, `-mp_debug_screen setup`
shows first-time setup and `-mp_debug_locked 292` the locked sign-in with that many seconds left.
Signed in, `-mp_debug_screen public -mp_debug_share_token <token>` opens a recipe's public link
as though it had been shared into the app.

Both hooks are inside `#if DEBUG`, so a release build has neither.

## Signing in

Email and password, as on the web. The name-and-PIN screens are behind "Sign in with your name
and PIN" until the server turns them off (`LEGACY_PIN_LOGIN=false`, see DEPLOY.md). After a
sign-in, and on each launch, someone without an email or password is asked for them; "Not now"
lasts until the next launch. Settings → Email and password changes them later.

An owner resets a forgotten password from Household → Who's here → ••• → Reset password: a
one-time link and QR code for `<server>/reset/<token>`, which the person opens on the web. The
token stays in the Keychain as before; email sign-in adds nothing to what the phone keeps (the
display name and the open household in UserDefaults, as they always were). The password is
never stored.

## Invites, the Scan screen, and removing people

Nobody joins a household without opening its invite link themselves. Household → Who's here →
Invite someone shows the house's link (`<server>/invite/<token>`, built from the configured server
address — the same origin as the web in production), with Copy, Share and a QR code; the owner
can make a new link, which kills the old one. The same ••• that resets a password removes somebody
(after a confirmation, and replacing the invite link so the one they had stops working); their phone notices on its next 403 from that house, reloads the household
list and moves to another house, or back to the sign-in screen saying why.

The Scan screen (sign-in → "Have an invite? Scan it", or Household → Join a household) is the
camera looking for QR codes only, with the torch, a paste-a-link fallback, a plain message for a
code that is not ours, and an Open Settings button when camera access was refused. It opens
`/invite/<token>` natively — join if signed in (or, already in it, open it), or make an account;
"I have an account" signs in right there and joins on the way in, or by PIN from the sign-in
screen — and `/reset/<token>` as a native set-a-new-password form. A dead link and a server that
cannot be reached say different things. `mealplanner://invite/<token>` and
`mealplanner://reset/<token>` open the same screens from outside the app.

## The first-run tutorial

A phone that has never opened the app gets two slides (a phone-framed picture of the app, a
title, a line), then "Light or dark?" with Match my phone, then the sign-in screen. Somebody who
opens the app with an invite link sees the invite first, and the tutorial once they have joined.
Never twice (UserDefaults `mp_tutorialSeen`), and never for somebody already signed in when the
update arrives. The light or dark answer stays with the phone across sign-outs, and goes on the
first account signed in afterwards if it has none of its own. The pictures are placeholders in the
asset catalog, `TutorialPlanPlaceholder` and `TutorialGroceriesPlaceholder` (light and dark): swap
in real screenshots of the redesigned app under the same names.

## A recipe's public link, shared into the app

A `/r/<token>` link shared in from Safari or Messages opens as the recipe's own page (the
picture, quick facts, links, ingredients with a servings stepper, the method) with Save to my
recipes along the bottom; in more than one household it asks which first ("Save a copy to…").

Universal links (tapping an invite link in Messages and landing in the app) need an Associated
Domains entitlement, which a free personal team cannot sign. Until the paid account arrives, a
tapped link opens the web, which handles it completely; scanning the code in the app works today.

## Sharing a recipe

A recipe's ⋯ Share (owner's household only) mirrors the web sheet: the public link
(`<server>/r/<token>`: create, copy, share, QR, turn off after a confirmation), switches for your
other households, and an In Explore switch. A `/r/<token>` link coming the other way, shared into
the app from Safari or Messages or pasted into New recipe → From a link, is not sent to the
importer (it would find the web app's empty page). Shared in, it opens as the recipe's own page
(see above); pasted into From a link, it is saved as a copy into the open household. Both save
through `POST /api/public/recipes/{token}/save`, the same call as the web page's "Save to my
recipes". Tapping such a link outside the app opens the web page, which does the same.

## The ideas board (beta)

While the server has it open (`IDEAS_BOARD`, see DEPLOY.md — `/api/users/me` says `ideasBoard`),
every tab's header has a lightbulb beside your initial. It opens the same board the web's
`/ideas` shows, for the whole server: Top or New, an upvote button on each idea (tap again to take
it back), Suggest an idea at the bottom, and swipe — or the ••• — to edit or delete your own. The
admin, signed in with the password, also gets Where it's up to (Open, Planned, Done, Not doing)
and Delete on every idea. A build from before the board never asks, and never shows it; if the
board is switched off while the phone has it open, it says so and the lightbulb goes.

## Food icons

The drawer and group pictures are the web's hand-drawn set (`web/src/components/FoodIcons.tsx`),
copied into `Assets.xcassets/FoodIcons` as template SVGs so they tint and scale like SF Symbols.
Don't edit them here: change or add one on the web, run `node web/scripts/export-food-icons.mjs`
from the repo root, add the key to `FoodIcon.all` and to the backend's `FoodIcons.KEYS`. The e2e
suite fails if the web and the asset catalog disagree.

## Where the server is

`Config.baseURL`, default `http://localhost:8080`, which is what the simulator sees on this
Mac. Change it from the sign-in screen (Server, top right) — a phone on the house wifi needs
the LAN address, and off the network it needs `https://meals.gehan.cloud`.

`MealPlanner-Info.plist` allows plain http to local addresses only (`NSAllowsLocalNetworking`),
so the public host still has to be https.

## Layout

```
MealPlanner/
  MealPlannerApp.swift     the app, the tabs, Household
  Networking/              Models, APIClient, Session + Keychain
  Features/                SignIn, Plan, Groceries, Recipes
  Features/Design/         the design system: tokens, type, components, bars
  Fonts/                   the title faces (SIL OFL, licences beside them)
  Preview/                 SampleData and the Gallery
```

The project uses a synchronized folder group, so a new `.swift` file under `MealPlanner/` is
picked up with no project edit and nothing to merge.

## Where the phone still differs from the web

- **Change on the day sheet** swaps a dish for a recipe. On the web it can also swap to a single
  cupboard item or a place; on the phone that is Remove, then Add. Only recipes can be added from
  the phone's day sheet so far, so Change matches what Add can do.
