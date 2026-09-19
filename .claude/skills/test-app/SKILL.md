---
name: test-app
description: Run, drive, and regression-test the Meal Planner locally at iPhone size — reset the dev database, run the Playwright API/UI suite in e2e/, capture the screen-inventory PDF, and test a patched copy side by side on other ports.
---

# Testing the Meal Planner

Everything runs against the **local** stack. Never point any of this at meals.gehan.cloud.

## Stack

- `./dev.sh start` — Postgres + Redis (Docker), Spring backend on :8080, Vite on :5173.
- The backend is `./mvnw spring-boot:run` with no hot reload: after a backend change, kill :8080
  and start it again or you are testing the old code.
- `ddl-auto: update`; a fresh schema logs two harmless `StartupBackfills` / `SchemaTouchUps`
  warnings.

## The suite (`e2e/`)

```bash
cd e2e && npm install
npm run reset -- --yes   # wipe LOCAL db, restart backend with INTEGRATION_API_KEY=e2e-integration-key and GEMINI_API_KEY empty
npm test                 # api + iphone projects, ~2 min, must be all green
npm run screens          # screens-output/screens.pdf
```

- `test.fail(true, 'KNOWN BUG: …')` marks a bug that exists today. "Expected to fail, but passed"
  means it got fixed — remove the marker. Never "fix" a red run by adding one without saying so.
- `npm run reset` replaces the backend the user started with `./dev.sh`, and it blanks the
  Gemini key. When finished, restore their normal backend: kill :8080 and run `./dev.sh start`.
- **Gemini has a 20-requests/day quota.** Never press ✨ Sort or "Write it for me", and never
  run the backend with the key during tests.

## Phone size

The user tests on iPhones. Desktop Chrome (claude-in-chrome) will not shrink below ~500px, so
use Playwright at 390×844 with touch and with Chrome told it has no hover:

```
--blink-settings=primaryHoverType=1,availableHoverTypes=1,primaryPointerType=2,availablePointerTypes=2
```

Without that flag, buttons the app hides behind `@media (hover: hover)` (the trash cans on
grocery rows) appear in screenshots but never on a phone. `e2e/playwright.config.ts` already sets
it for the `iphone` and `screens` projects.

## Gotchas

- Rows can sit under the fixed bottom tab bar; a tap there lands on a tab. Scroll the row to the
  centre first (`lib/ui.ts`).
- `UnitInput` options select on `pointerdown`, not click.
- Sign in without the keypad by setting `mp_token`, `mp_userId`, `mp_displayName`,
  `mp_activeHouseholdId` in localStorage.
- Seed data: after a reset the only account is `e2e-admin` / 1234; each test makes its own
  household. Use a separate account in another household to test outsiders.

## Testing a patched copy side by side

```bash
git worktree add --detach <scratch>/wt HEAD      # then apply the working-tree diff
docker exec foodapp-postgres-1 psql -U mealplanner -d mealplanner -c "CREATE DATABASE mealplanner_fix;"
(cd <scratch>/wt/backend && SERVER_PORT=8081 DB_NAME=mealplanner_fix INTEGRATION_API_KEY=e2e-integration-key GEMINI_API_KEY= ./mvnw -q spring-boot:run &)
# a vite config with port 5174 proxying /api and /ws to 8081, then:
API_URL=http://localhost:8081 WEB_URL=http://localhost:5174 npm test
```

Diff the ✓/✘ columns of the two runs: fixes flip ✘→✓, regressions flip ✓→✘.
