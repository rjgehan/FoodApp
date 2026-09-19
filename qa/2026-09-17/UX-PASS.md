# Meal Planner: UX pass, 17 Sep 2026

A pass over every screen at iPhone size (390×844, touch). The rules: one obvious primary action per
screen, rare actions behind •••, fewer competing buttons, the same words everywhere, and moving
people along Recipe → Plan → Groceries → Cook → Inventory. The visual style is unchanged; the only
new pieces are a ••• menu and a settings row, both built from the existing bottom sheet.

The screens follow. The Today page was already removed; `/` now opens Plan.

## Whole app

| | Before | After |
|---|---|---|
| Tabs | 6 (Today, Plan, Recipes, Groceries, Cupboard, Household) | **5**: Plan, Recipes, Groceries, Cupboard, Household |
| Header | Household picker · avatar · **sign-out button** | Household picker · avatar. Sign out moved to Household → You, so it's no longer one mis-tap away on every screen. |
| Words | "grocery list" / "Groceries"; "catalog" / "drawer" / "Filed under"; "Sort" meaning two different things; "sub-categories" / "groups"; "Store layout" / "aisles" | **Groceries** · **Recipes** · **Filed under** · **groups** · **Store aisles**. The recipe-side "Sort" is now **Put in groups**; ✨ Sort is only the AI aisle sort. |

## Plan

- **Goal:** fill the coming days, then shop for them.
- **Primary action:** tap a day → **Add**.
- **Secondary:** **Add Sep 17 – Sep 23 to Groceries** (the Plan → Groceries step); week/month switch.
- **Moved or hidden:**
  - In an expanded meal, **Change** and **Remove** are now two quiet text buttons on one line (before: a grey button, a lone trash icon on its own row).
- **Removed or consolidated:**
  - The "Planning 7 days ahead — through Sep 23" caption is gone. Its dates are now the groceries button's label.
  - **The button now covers those days** (today onward), not the week on screen. On a Thursday it used to find nothing.
  - Servings was an unlabelled box plus **Set**. It's now **Serves − 4 +**, which saves on each tap, in the same style as the cupboard's stepper.
  - The optional-extras prompt is one line: "Buying the optional extras this time?"
- **Navigation removed:**
  - **Add a snack** opens the picker straight away (before: add the row, then tap its Add).
  - **Add side** only appears on a meal with something cooked in it, not on a restaurant or a single food.

## Recipes (the list and its sections)

- **Goal:** find a recipe.
- **Primary action:** search, or open a section. The orange **+** makes a new recipe.
- **Secondary:** **Put in groups** for recipes not in a group yet.
- **Moved or hidden:** **Edit group** and **Add a group** moved into the header's **•••**, as "Add a group (inside …)" and "Rename or delete". The add form now opens right under the header, and it also works on an empty section.
- **Removed or consolidated:**
  - The **Split … up?** suggestion uses a grey button with a text "Not now", so it no longer outshouts the recipes.
  - The "Shared with you" hint shortened to "From other households".
  - The new-group placeholder inside Beef reads "A kind of beef…" instead of "Chicken, Seafood, Pasta…".
- **Navigation removed:** none; group cards already had one ••• each.

## Recipe

- **Goal:** cook it, or put it on the plan.
- **Primary action:** **Add to plan**. This is new, and the one addition that needed some code: it's the only way to go Recipe → Plan without switching tabs. The sheet shows day chips across the planning window, meal chips (preset from where the recipe is filed), and the optional extras. After adding, the page says "On the plan for Tomorrow · Breakfast · See Plan".
- **Secondary:** **Watch on TikTok**, now a grey button under the primary (before: the biggest orange thing on the page); ‹ › to flip through recipes.
- **Moved or hidden:**
  - Edit, Share, Organize (or **Move to my recipes** for shared ones), **Photos & video**, and Index card all moved behind **•••**. Before, they were four text links in a row.
  - Index card view shows a single **Done**.
- **Removed or consolidated:**
  - Photo and video editing (Make cover, remove, video link, Add photos) no longer sits between Ingredients and Method. It opens from ••• → Photos & video.
  - While reading, extra photos appear as a plain grid after Method.

## Groceries

- **Goal:** tick things off in the shop, then finish.
- **Primary actions:** tap a row; **Done shopping** (the one filled button).
- **Secondary:** the add box.
- **Moved or hidden:** **Move** and **✨ Sort** moved behind **•••**, as "Change aisles" and "✨ Sort N items into aisles". While changing aisles, the header shows a single **Done**.
- **Removed or consolidated:**
  - The two-sentence footer is now "Swipe an item left to remove it."
  - The aisle-mode help is one sentence.
  - "Cupboard says you have this" is now **In the cupboard**, the same words Plan uses.
- **Navigation:** the empty list points to **Plan**, the step before it.

## Cupboard

- **Goal:** check what's in the house, and mark things Low.
- **Primary action:** the **Do we have…?** box, then Have/Low on the row.
- **Secondary:** tap a row to edit it; swipe for Buy again or Remove.
- **Moved or hidden:** "Always have" items no longer show a Have/Low toggle (it meant nothing for them).
- **Removed or consolidated:**
  - "Add “gar” — we have it" is quiet (a text button) when something already matches, and only a full button when nothing does.
  - The footer is one line.
  - "grocery list" is now "Groceries".

## Household

- **Goal:** see who's here and where you eat.
- **Primary actions:** **Add someone** and add a place.
- **Secondary:** a **Settings** list: Household (name, servings, days ahead) · Store aisles · Recipe icons · You (name, username, **Sign out**) · Start another household · Leave. Each row opens its own sheet.
- **Moved or hidden:** everything set once. Before, these were seven stacked cards and the page was about 3,000pt tall; now it fits on about one screen.
- **Removed or consolidated:**
  - The household name had its own Rename button and the numbers had Save settings; now there is **one Save**.
  - "Our recipes" (a list of recipe names) is gone; that's what the Recipes tab is for.
- **Navigation:** one sheet deep for rare settings, instead of scrolling past them every visit.

## Checked

- `tsc`, `vite build` and the backend tests pass.
- The e2e suite: **84 passed** on a reset database, with tests updated for the new controls, plus new ones: Add to plan from a recipe; the recipe page has one filled button with the rest behind •••; sign out lives under You; Plan → Groceries covers the planning window. **9 known issues remain**; the planning-window one is fixed by this pass. The screens that follow come from a clean capture after that run.
