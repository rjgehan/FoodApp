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

The iPhone app has the same pictures in its asset catalog: `TutorialRecipes` and
`TutorialGroceries` (each with a dark appearance). **For now these are the web captures above,
standing in until the iPhone app is captured on a Mac** — so the iPhone's first run shows the web's
tab bar and type. Native captures should replace them before the iPhone build ships: the same
household and screens in the iPhone 18 Pro simulator, status bar at 9:41, launched with
`-mp_debug_token … -mp_debug_household …` and `-mp_debug_drawer dinner` (Recipes) or
`-mp_debug_tab groceries`, in light and dark, then scaled and saved as above, into the two
imagesets (not over the web's files here). Don't restore the old native Groceries capture from git
history instead: it shows the old tab bar, with Plan first and a Cupboard tab. `TutorialPlan` (the
old first picture, from the Plan screen) is still in the catalog: `Tutorial.swift` falls back to it
if `TutorialRecipes` is missing, and it can be deleted once the native captures are in.
