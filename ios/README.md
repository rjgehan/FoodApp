# Waxwing for iOS

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

The app is still "Gehan Meal Planner" in App Store Connect until it is renamed there by hand
to "Waxwing" (App Information → Name; see BRAND.md); on the phone it is already Waxwing. The
bundle id stays cloud.gehan.mealplanner (team 5TCCXKJ243). The build number is the commit
count, so every upload is higher than the last.
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
  -mp_debug_tab groceries          # recipes (the default) | groceries | plan | cupboard | explore
```

`plan` and `cupboard` only land there for a household that uses them; otherwise it is Recipes.

`-mp_debug_screen edit|detail|settings|household|ideas` opens that sheet on top, and `-mp_debug_screen
day` (with `-mp_debug_tab plan`) opens today's day sheet; add `-mp_debug_expand 1` to open the
first dish's options. On the Plan tab, `-mp_debug_plan upcoming` opens on Upcoming, and
`-mp_debug_screen options|addweek|fill|fillout|create|extras` opens a planned meal's options, the
add-the-week sheet, filling a later dinner (eat in, or the night out on eat out), a new recipe
from a slot, or the optional-extras question. With `-mp_debug_screen edit`, `-mp_debug_scroll links` scrolls the editor
down to its Links section, and `-mp_debug_scroll machines` to its Machines.

On the Groceries tab, `-mp_debug_screen grocery-item|done-shopping` opens an item's sheet (one with
a restock reminder, if there is one) or Done shopping; `receipts` opens Receipts and
`receipt-review` the check-the-receipt screen, both on sample data (no camera, nothing sent). On the Cupboard tab (`-mp_debug_tab
cupboard`), `-mp_debug_screen cupboard-edit` opens the first counted item's sheet,
`cupboard-search` types `-mp_debug_query` (or "tahini") into the box, `barcode` opens the scanner,
and `barcode-found` opens it on a sample result, since a simulator has no camera.

`-mp_debug_drawer dinner` opens that drawer on the Recipes tab, and `-mp_debug_tag Chicken` opens
it with that tag chosen. With the drawer, `-mp_debug_screen add` opens the new-recipe form from it
(`-mp_debug_tag Veggie` ticks that tag, and `-mp_debug_scroll filing` scrolls to the drawer and
tags), `tags` opens Manage tags (`-mp_debug_expand 1` its first tag's icon picker), `newtag` the
"+ Tag" box, `select` select mode, `tag-sheet` and `move-sheet` the Tag and Move sheets for the
drawer's first two recipes, and `pick` picking the recipes for `-mp_debug_tag` (or the first
tag), as "+ Tag" does after making one. On the Recipes tab, `-mp_debug_query pasta` searches, and
`-mp_debug_screen savedlinks|shared|linkactions` opens Saved links, Shared with you, or the first
saved link's actions. `-mp_debug_screen household -mp_debug_scroll icons` opens Recipe icons,
and `-mp_debug_expand 1` its picker for Dinner.

`-mp_debug_tab recipes -mp_debug_screen new` opens New recipe; add `-mp_debug_new link` or
`-mp_debug_new paste` to open it on that way in. `-mp_debug_link "<url>"` fills From a link and
reads it; `-mp_debug_paste "<text>"` fills Paste (and `-mp_debug_autoparse 1` reads it).
`-mp_debug_rules 1` shows Paste as a phone without Apple Intelligence sees it: the format
warning and the rules-only reader.

`-mp_debug_screen share -mp_debug_recipe <recipe-uuid>` opens that recipe from the server with its
Share screen pushed (the public link, your other households, Explore). `-mp_debug_screen recipe`
(with `-mp_debug_recipe <uuid>`) opens that recipe's page full screen as it is pushed;
`recipe-options`, `recipe-plan`, `recipe-groceries`, `recipe-delete` and `recipe-method` open it
with its ••• menu, Add to plan, Add to groceries, the delete question or the Method tab. `-mp_debug_new link -mp_debug_link "<url>"
-mp_debug_draft 1` shows From a link's draft card with a sample draft, without reading anything.

`-mp_debug_screen household` opens the household page (the Invite card, Who's here, its setup);
with `-mp_debug_scroll places|setup|kitchen|aisles|icons|new` it opens that page on top (`kitchen` is
Kitchen & features), `qr` the invite's
Scan to join sheet, and `member` the first other person's owner actions (sign in as the owner) —
add `-mp_debug_expand 1` to make them a password-reset link there. `-mp_debug_screen settings`
opens Settings; with any of those `-mp_debug_scroll` values it goes on into the household page.

On the Explore tab (`-mp_debug_tab explore`), `-mp_debug_screen explore-recipes` opens Global
recipes, `explore-recipe` its first published recipe from another household, `explore-move` that
recipe's Move into my recipes, and `explore-meal-plans` Meal plans (or, against a server from before
them, the door's coming-soon page), and `explore-nutrition` Nutrition facts (below).
`meal-plans-cupboard` opens Cook from your cupboard's setup, `meal-plans-result` generates its
plan straight away, `meal-plans-new` the create form (`-mp_debug_fill 1` fills it in as the
mockup has it), `meal-plans-preset -mp_debug_ref <key>` a ready-made plan (`build-muscle`,
`heart-healthy`…) and `meal-plans-plan -mp_debug_ref <uuid>` one of yours.

Nutrition facts (Explore, the mockup's 5.4–5.6): `-mp_debug_tab explore -mp_debug_screen
explore-nutrition` opens it (`nutrition-search` with `-mp_debug_query chicken` searches,
`nutrition-scan` opens the barcode camera, which in the Simulator is the type-it-in card);
`nutrition-food -mp_debug_ref <fdcId>`, `nutrition-product -mp_debug_ref <barcode>` and
`nutrition-recipe -mp_debug_recipe <uuid>` go on to an ingredient's label, a packet's and a
recipe's nutrition. From a recipe page, `-mp_debug_screen recipe-nutrition -mp_debug_recipe <uuid>`
pushes its nutrition with back reading "Recipe". `-mp_debug_ai off` is a phone without Apple
Intelligence, `-mp_debug_ai fake` a stand-in model that always answers the same way;
`-mp_debug_label_photo <path>` reads that picture as a packet's label where the screen offers to.

`-mp_debug_screen prompt-email|prompt-restock|prompt-starter|prompt-removed|prompt-ideas|prompt-share|prompt-rewritten`
shows the prompts, the ideas board and the share and rewrite screens (the mockup's section 07) from
sample data, as the Gallery's "Prompts & extras" does.

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
as though it had been shared into the app, and `-mp_debug_screen kitchen` asks the open household's
kitchen questions as a new house gets them (`-mp_debug_kitchen_step 1|2` opens the Plan or the
cupboard question).

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
title, a line) — "Your family's recipes, together" and "One list for the shop", the web's words —
then "Light or dark?" with Match my phone, then the sign-in screen (or "Get started" into the app).
Somebody who opens the app with an invite link sees the invite first, and the tutorial once they
have joined. Never twice (UserDefaults `mp_tutorialSeen`), and never for somebody already signed
in when the update arrives. The light or dark answer stays with the phone across sign-outs, and
goes on the first account signed in afterwards if it has none of its own.

The pictures are screenshots shared with the web (`web/public/tutorial`, whose README says
how they were taken): `TutorialRecipes` (Recipes, open at Dinner) and `TutorialGroceries`. For
now both are captures of the web app at iPhone size — the web's tab bar and type, not this app's —
standing in until native ones are taken on a Mac. **Replace them with iPhone captures before this
build ships**: the same household and screens in the iPhone 18 Pro simulator, light and dark, as that
README describes. Don't put back the old native Groceries capture from git history: it shows the
old tab bar, Plan first and a Cupboard tab. Without `TutorialRecipes` the first slide falls back
to `TutorialPlan`, which can go from the catalog once the native captures are in.

## The kitchen, and the optional Plan and Cupboard

Recipes and the grocery list are the app; the Plan and the Cupboard are each household's to use
or not (`planEnabled`, `cupboardEnabled` on `/api/households`, nil meaning on). The tabs follow —
Recipes, Groceries, Plan, Cupboard, Explore, the web's order — and so does everything that would
lead to a hidden one: a recipe's Add to plan (Add to groceries becomes its one filled button, the
cart marked "Groceries" beside Add to plan otherwise, and ••• has it in full either way), a saved
link's Add to plan, Explore's Meal plans door and
Nutrition's week, the Plan ahead window; and for the cupboard, the grocery list's "Cupboard says"
lines, Done shopping's cupboard question, the fill screen's Cupboard chip, and a label's Cupboard
button. A tab turned off goes at once and lands you on Recipes — except while Settings is open over
it, since Settings hangs off that tab's header and would go with it; closing Settings takes the tab
away then. Households are fetched again whenever the app comes to the front, so a tab turned off on
the web or another phone goes the same way. Any change on Household → Kitchen & features also counts
as answering the kitchen questions, so the Recipes card stops asking and joiners are not asked.

The kitchen questions (`Features/Welcome/KitchenSetup.swift`) — which machines, Plan or not,
cupboard or not — come straight after first-time setup and Start another household, and after
joining a house nobody has answered them for; any time after, from the card at the top of Recipes,
and Household → Kitchen & features changes the answers. They go through RootView's one prompt
slot, ahead of the add-an-email prompt and "Time to restock?", so no two of them ever stack.

A recipe's machines (`appliances` on the wire) are spotted in its method by the server. The
recipe page shows them on its picture after the quick facts, and the recipe form's Machines chips
set them by hand — sent only when somebody changed them, since a list tells the server to stop
spotting them; a new recipe says it will spot them when it is saved. The household's own machines
are only kept for now: nothing hides or narrows recipes by them yet, and the kitchen's words say
no more than that (recipes show their machines, and a drawer can be filtered by machine).

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

## Nutrition facts and Apple Intelligence

Explore → Nutrition facts is the web's page on the same `/api/nutrition` answers: search an
ingredient (USDA FoodData Central) or a packet (Open Food Facts, only when you press search), scan
a barcode, the coming week's plan a day at a time, recent lookups, a label per 100 g or per
serving with Cupboard and Add to list, and a recipe's nutrition (also from the recipe page, under
the ingredients). The door on Explore and the row on the recipe page only appear once the server
has answered `GET /api/nutrition`; an older server's 404 hides them until the app is next opened.

Every number comes from the server. On a phone with Apple Intelligence (FoundationModels, iOS 26+)
the model only chooses and estimates, and only where the server was unsure
(`Features/Nutrition/NutritionAssist.swift` has the rules):

- **Which food** an ingredient is, picked from the server's own shortlist with a guided `.anyOf`
  (or "none of these"), for lines the matcher only guessed or could not count. Sent back as
  `PUT /api/nutrition/ingredients/{id}/match {"fdcId", "source": "ai"}`, which the server takes
  only from the shortlist and never over a person's choice — so it improves everybody's numbers.
- **What one weighs** for a knob, a handful or a count ("2 chicken breasts"), as grams inside a
  range for that unit (a guided `.range`, checked again), sent as `PUT …/grams {"unit", "grams",
  "source": "ai"}`. Tins and packs are left to the server's packaging sizes.
- **A few words** about a serving under the ring. It is given words, never figures, and an answer
  with a digit in it is thrown away; without the model the server's rule-made words show.
- **A packet's label from a photo** (iOS 27, a model with vision): for a barcode Open Food Facts
  does not know. Its figures are checked to add up (energy against the macros) before they are
  shown, marked as read by Apple Intelligence, and are not saved anywhere.

Whatever the model chose wears a small ✨ Apple Intelligence mark. Each line is asked about once
per phone (UserDefaults `mp_nutrition_asked`). A Simulator lends the Mac's own model when the Mac
has Apple Intelligence on. The rules are checked without any of that by `./checks/run.sh`, which
compiles the Foundation-only files with a scripted stand-in on this Mac.

## Meal plans and Apple Intelligence

Explore → Meal plans is the web's page on the same `/api/households/{id}/meal-plans` answers: cook
from your cupboard (days, meals, what to use up first, how much to buy; then the draft with each
meal's share in the cupboard, swaps, the things to buy and Apply to Plan), and plans for health
targets (ready-made ones, and your own private ones: the targets worked out from who it is for,
a day at a time, swaps, keep, rename, choose again, delete, Apply to my Plan from a chosen day).
Applying a plan brings the Plan tab to the front. The door only opens once the server has
answered `GET /api/meal-plans`; an older server's 404 leaves the old "coming soon" door.

Every recipe is an existing one and every number is the server's. On a phone with Apple
Intelligence the model chooses, never counts (`Features/MealPlans/MealPlanAssist.swift` has the
rules), and only when the server lists `candidates` in its features:

- **The week** — a cupboard plan, a ready-made plan as it opens, a new plan, "choose every meal
  again": the server's candidates (`POST …/cupboard/candidates`, `POST …/targets/candidates`)
  a day at a time, each meal a guided `.anyOf` of the recipes that fit it, told what wants using
  up or what the day aims at and what earlier days have. Picks are checked here (offered for
  that meal, no repeats, inside the buy limit, no lunch or dinner two days running) and sent as
  `chosen`; the server checks them again, portions them and fills anything refused with its own.
- **Swaps** — one meal from the server's candidates for that slot, sent as `recipeId`.
- **Use soon** — cupboard things with no date that the server's rule has no view on (the setup's
  `unsure`): how many days each keeps (a guided `.range`, once per name, UserDefaults
  `mp_shelf_days`), counted from when it came in; within three days it is a "soon" chip.
- **A few words** about a plan, from words only; an answer with a digit in it is thrown away. The
  server's own summary is always there.

Whatever the model chose wears ✨ (your own plans remember which meals on the phone,
`mp_model_picks_<id>`). Any failure leaves the server's plan, exactly as the web and a phone
without Apple Intelligence see it. `./checks/run.sh` checks the rules with a scripted stand-in.

## Drawers and tags

Recipes has six drawers (Breakfast, Lunch, Dinner, Snacks, Drinks, Other), and inside a drawer
no nesting: a recipe wears any number of flat tags ("Chicken", "Quick"), each tag belonging to
one drawer. A drawer (`Features/Catalogue/DrawerView.swift`) is its recipes under a row of tag
chips — All and Untagged first, then the tags, with "+ Tag" held at the row's end so it never
scrolls away; tap two to see what wears both — then the machines its recipes need, a card
offering the obvious tag for untagged recipes (the drawer's own spelling when it has one:
"Veggie", not a new Vegetarian), and select mode's Tag and Move. "+ Tag" makes a tag and goes
straight to picking its recipes, with the search still there to find them; the pen opens Manage
tags (`EditTags.swift`). The API
still calls tags "recipe categories", so older phones keep working against the same server.
`CatalogueStore` loads once and then follows each change's answer — no reload after a tap.

## Receipts and prices

Prices come from the household's own receipts — there is no shop to ask. Groceries ••• → Scan a
receipt (or Scan on the "Got the receipt?" toast after Done shopping, which never opens anything
by itself) opens VisionKit's document camera: it finds the paper, flattens it and takes as many
pages as a long receipt needs. Vision reads the words on the phone
(`Features/Receipts/ReceiptText.swift`: accurate, no language correction, then the pieces put back
into rows by how much they overlap up and down, each row left to right), and the first barcode on
it is kept only to spot a receipt scanned twice. No model and nothing but the words leave the phone.

The words go to `POST …/receipts/read`, and the server's rules (`ReceiptReader`, unit-tested in
Java) make the draft: shop, date, subtotal/tax/total, each line's price after its discounts, how
it was weighed, Not food for bags and deposits, and the ingredient each line probably is. The
check screen (`ReceiptReviewView`) shows it to be put right — the shop name, the date, a line's
name, price, sale or kind — warns when the lines do not add up to the subtotal or the receipt was
scanned before (Open / Save anyway, which saves without the barcode), and keeps what it could not
read folded at the bottom. Save (`POST …/receipts`) gives every food line with a name a price for
that day. ••• → Receipts lists them, opens one read-only, and swipe deletes one with its prices.

A grocery row shows what it last cost (`lastPrice`, "≈ $3.49"), the list's title "≈ $86 · 3 not
priced" for what is still to buy, and an item's sheet "Last paid $3.49 at Kings Food Markets ·
Oct 18 (on sale)" with Add / Change to type one in (`PUT …/items/{id}/price`, today's price).
Money is written in the phone's own currency (`Money`). The whole flow is one full-screen cover,
each step replacing the last, so nothing stacks on the prompt slot. In the Simulator, which has no
document camera, a debug build offers "Read a sample receipt": the sample's words sent to the real
server, the whole flow minus the camera. Not yet: tidying abbreviations with Apple Intelligence,
per-shop aliases, matching receipt lines to the ticks of Done shopping, recipe costs, price history.

## The app icon and mark

`AppIcon.appiconset/AppIcon.png` (1024, opaque RGB; Xcode makes the smaller sizes) is rendered
from `web/scripts/brand/app-icon.svg` by `node web/scripts/brand/render-icons.mjs`, which writes
the web's icons in the same run — don't edit the PNG by hand. The one-colour waxwing inside the
app (`AppMark` on the sign-in screen, the share sheet's title) is `AppGlyph.imageset`, a template
SVG copied from `web/scripts/brand/glyph.svg`. The share extension cannot see the app's asset
catalog, so it carries its own copy in `ShareExtension/Assets.xcassets`; change both together.
`ChefHat.imageset` stays: it is the recipe-photo placeholder, not the logo.

## Food icons

The drawer and tag pictures are the web's hand-drawn set (`web/src/components/FoodIcons.tsx`),
copied into `Assets.xcassets/FoodIcons` as template SVGs so they tint and scale like SF Symbols.
Don't edit them here: change or add one on the web, run `node web/scripts/export-food-icons.mjs`
from the repo root, add the key to `FoodIcon.all` and to the backend's `FoodIcons.KEYS`. The e2e
suite fails if the web and the asset catalog disagree.

Kitchen machines (`Features/KitchenMachines.swift`, the same keys and order as the backend's
`KitchenMachines` and the web's `utils/machines.ts`, and the web's `short` names on chips and pills —
"Instant Pot", not "Instant Pot / pressure cooker") are drawn the same way, from
`Assets.xcassets/MachineIcons`; `KitchenMachine.image` is the one place that picks the drawing,
and falls back to an SF Symbol for a machine whose drawing is not in the catalog yet.

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
