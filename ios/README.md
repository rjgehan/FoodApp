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

## Looking at every screen

Two ways, both without a backend:

- **Xcode canvas** — every view file ends in a `#Preview`, so ⌥⌘↩ draws it from `SampleData`.
- **The Gallery tab** — a debug-only tab listing every screen, with a light/dark switch. It is
  the app's version of the screen-inventory PDF the web has. It never calls the network.

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

`-mp_debug_screen edit|detail|settings|household` opens that sheet on top, and `-mp_debug_screen
day` (with `-mp_debug_tab plan`) opens today's day sheet; add `-mp_debug_expand 1` to show the
first dish's actions. With `-mp_debug_screen edit`, `-mp_debug_scroll links` scrolls the editor
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

`-mp_debug_screen household -mp_debug_scroll people` opens Who's here, with the Invite someone
section; add `-mp_debug_expand 1` to open a password reset link for the first other person, or
`-mp_debug_expand remove` to ask to remove them (sign in as the owner).

Signed out, `-mp_debug_screen scan` opens the Scan screen (the simulator has no camera, so it
shows the paste-a-link fallback); add `-mp_debug_invite <token>` to open that invite as though it
had just been scanned. A debug launch
never shows the "add an email and password" prompt on top of a `-mp_debug_screen`, except
`-mp_debug_screen credentials`, which shows just the prompt.

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
`/invite/<token>` natively — join if signed in, or make an account; "I already have an account"
goes back to sign-in and joins on the way in, by email or PIN — and `/reset/<token>` as a native
set-a-new-password form.

Universal links (tapping an invite link in Messages and landing in the app) need an Associated
Domains entitlement, which a free personal team cannot sign. Until the paid account arrives, a
tapped link opens the web, which handles it completely; scanning the code in the app works today.

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
  Preview/                 SampleData and the Gallery
```

The project uses a synchronized folder group, so a new `.swift` file under `MealPlanner/` is
picked up with no project edit and nothing to merge.

## Where the phone still differs from the web

- **Change on the day sheet** swaps a dish for a recipe. On the web it can also swap to a single
  cupboard item or a place; on the phone that is Remove, then Add. Only recipes can be added from
  the phone's day sheet so far, so Change matches what Add can do.
