# Meal Planner for iOS

A native client for the same backend the web app uses. No new API: it signs in with the PIN
flow, reads the plan, the groceries and the recipes, and ticks things off.

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

Both hooks are inside `#if DEBUG`, so a release build has neither.

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
