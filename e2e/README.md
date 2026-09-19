# End-to-end tests

The app driven the way the family uses it: a real backend, a real database, and Chrome at
iPhone size. Nothing here touches production.

## Run it

```bash
cd e2e
npm install            # once
npm run reset          # wipes the LOCAL dev database, restarts the backend with the
                       # integration API on and Gemini off, starts Vite if it isn't running
npm run seed           # optional: a lived-in "Test House" to click around (maya / 5678)
npm test               # API + iPhone UI, ~2 minutes
npm run screens        # screen inventory → screens-output/screens.pdf
npm run report         # open the last HTML report
```

`npm test` on a database that wasn't reset works too, as long as the `e2e-admin` account
(PIN 1234) exists — the first run on an empty database creates it. Point at other ports with
`API_URL=http://localhost:8081 WEB_URL=http://localhost:5174 npm test`.

Uses the Chrome already installed (`channel: 'chrome'`), so there's no Playwright browser download.

## What's covered

| File | What |
| --- | --- |
| `tests/api/auth.spec.ts` | First PIN, lockout, PIN format, setup closed, token refresh, username case |
| `tests/api/authz.spec.ts` | An outsider against every household endpoint; live-update subscriptions |
| `tests/api/groceries.spec.ts` | Plan → list maths, scaling, optional extras, staples, cupboard flags, put-away, validation |
| `tests/api/integration.spec.ts` | The home-dashboard API: key, shapes, ranges, category filter, grocery writes |
| `tests/api/sharing.spec.ts` | Share links, sharing with a household, deleting a shared recipe |
| `tests/ui/core-loop.spec.ts` | Keypad sign-in, plan next Tuesday, optional prompt, shop and put away, two-phone sync, Today |
| `tests/ui/forms.spec.ts` | Paste parser, units, links without https, username field, group cards |
| `tests/screens/inventory.spec.ts` | Not a test — captures every screen and sheet for the PDF |

### Known bugs are tests too

A test for something that's broken today is marked `test.fail(true, 'KNOWN BUG: …')`. It shows
as ✘ but counts as passing. When the bug is fixed, Playwright reports **"Expected to fail, but
passed"** — that's the signal to delete the `test.fail` line. So a green run means "nothing got
worse", and the list of `KNOWN` lines is the bug list.

```bash
grep -rn "KNOWN" tests/
```

## Writing a new test

- Arrange with the API (`lib/api.ts`: `newHousehold`, `newMember`, `newRecipe`, `plan`, …), then
  click only through the part the test is about. Every test makes its own household.
- `signIn(page, session, householdId)` skips the keypad.
- Rows near the bottom sit under the tab bar; use `tapRowStart` / `swipeLeft` from `lib/ui.ts`,
  which scroll first.
- After a tap that saves, poll the API (`expect.poll`) rather than trusting what's on screen —
  the app updates optimistically.
- Before asserting something is *absent* after a reload, assert something else is present, or
  the check passes while the page is still loading.

## The hallway test (people, not Playwright)

Hand the phone to someone who hasn't seen the app, give them one task at a time, and say nothing.
Write down every pause, wrong tap, and "where's the…". Stop a task after two minutes.

Set up with `npm run reset && npm run seed`, then open the app on the phone
(`./dev.sh start` prints the address for other devices).

1. You're in Test House. Sign in as **maya** (PIN 5678).
2. Add **Chicken Parmesan** to dinner **next Tuesday**.
3. Next week you're having friends over on Friday — plan Steak Tacos for **8 people**.
4. Get everything for next week's dinners onto the shopping list.
5. You're at the store: you found the steak and the tortillas. Mark them.
6. You're home. Put the shopping away — except the tortillas, which were for your neighbour.
7. You're out of garlic. Make sure it gets bought next time.
8. You got a recipe link from TikTok. Save it as a new recipe with the link attached.
9. Send the Chicken Parmesan recipe to a friend who doesn't have the app.
10. You're eating at Golden Dragon on Saturday. Put that on the plan, with their menu link.
11. Tonight's dinner is done. What would you tap now? (There's no right answer yet — watch.)

Things to note for each: time taken, first tap, where they got lost, what they said out loud.

Try it with a couple, a roommate pair, a parent, and someone who barely cooks.
