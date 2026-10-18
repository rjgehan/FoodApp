# First-run tutorial pictures

The two slides of the first-run tutorial (`src/tutorial/Tutorial.tsx`) each show a phone-framed
picture of the app, in light and dark to match the page. "Light or dark?" crops its two cards
from the first slide's pair.

| Slide | Light | Dark |
| --- | --- | --- |
| 1 · Your family's recipes, together | `recipes-light.jpg` | `recipes-dark.jpg` |
| 2 · One list for the shop | `groceries-light.jpg` | `groceries-dark.jpg` |

Each is 660 × 1435 px (an iPhone 17/18 Pro screen, 402 × 874 pt, scaled to 660 px wide: enough
for the frame's 470 pt height at 3×), a JPEG at quality 80 — about 70 KB for the list, about
150 KB for Recipes because of its photos. The frame clips the corners itself, so a plain
rectangular screenshot works as it is; keep the iPhone's portrait aspect and its status bar at
the top ("Light or dark?" crops just below it).

## How they were taken (October 2026)

Screenshots of the **web app**, at iPhone size, with Playwright (Edge, from `e2e/`): a 402 × 874
viewport at 3× with `isMobile`, `hasTouch` and the no-hover blink flag the e2e iPhone project
uses, a 34 pt home-indicator inset (`Emulation.setSafeAreaInsetsOverride`), and the page moved
down 62 pt under a drawn-in 9:41 status bar on the page's own background — so it reads as the
native app does. Each 1206 × 2622 shot was scaled to 660 wide and saved at quality 80.

Signed in as Ryan in the showcase household (`cd e2e && npm run reset -- --yes && npm run
seed:showcase`; Ryan is `ryan@example.com` / `ryan-password`), with on top of the seed:

- **Recipes** (Recipes → Dinner): more TheMealDB dishes, with their photos, so every drawer has
  some (Breakfast 5, Lunch 4, Dinner 11, Snacks 4, Drinks 3, Other 2) — in Dinner, Spaghetti
  Bolognese, Thai Green Curry, Kung Pao Chicken, Ratatouille and Salmon Prawn Risotto — and
  Dinner tagged Beef, Chicken, Family favourite, Pasta, Pork, Quick, Seafood and Veggie. The
  drawer opens on Beef Wellington, Chicken Parmentier, Honey Teriyaki Salmon and Kung Pao Chicken.
- **Groceries**: the cupboard turned off (a new household's default, so no cupboard hints), the
  list cleared and refilled with Spaghetti Bolognese's and Honey Teriyaki Salmon's ingredients
  (each recipe's Add to list), bananas added by Maya, milk, coffee and paper towels typed in, and
  onions and garlic ticked off by Maya.

The tab bar in both is a household with the Plan on and the Cupboard off: Recipes, Groceries,
Plan, Explore.

## On the iPhone

The iPhone app has its own captures of the same household and screens in its asset catalog:
`TutorialRecipes` and `TutorialGroceries` (each with a dark appearance), so its first run shows its
own tab bar and type. They are not these files; don't copy these over them.

They were taken in October 2026 in the iPhone 18 Pro simulator (iOS 27), on the same seed and
extras as above, the status bar set with `xcrun simctl status_bar <udid> override --time 9:41
--batteryState discharging --batteryLevel 100 --cellularBars 4 --wifiBars 3` and the look with
`xcrun simctl ui <udid> appearance light` (or `dark`), launched as Ryan with `-mp_debug_token …
-mp_debug_household … -mp_debug_name Ryan -mp_tutorialSeen 1` and `-mp_debug_drawer dinner`
(Recipes) or `-mp_debug_tab groceries`. Each 1206 × 2622 `xcrun simctl io <udid> screenshot` was
scaled to 660 wide and saved at quality 80, as above. The list is in the app's own order, so it
reads a little differently from the web's. `TutorialPlan` (the old first picture, from the Plan
screen) is still in the catalog: `Tutorial.swift` falls back to it if `TutorialRecipes` is
missing, and it can be deleted.
