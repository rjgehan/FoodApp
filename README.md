# Meal Planner

A small meal-planning app for one family and their friends: a shared recipe catalog, a weekly
plan, and a grocery list that updates live across everyone's phones.

- **Sign in** with an email and a password (older accounts still have a name-and-PIN keypad until
  the server turns it off). New people join through a household's **invite link** or its QR code;
  the owner can take someone out again.
- **Recipes** are filed into Breakfast / Lunch / Dinner / Snacks / Drinks / Other, with
  sub-categories you invent yourself, cover photos, and an index-card view.
- **Plan** a week at a time; a meal can be a main plus its sides.
- **Groceries** are generated from the plan, aggregated by ingredient, and sync in real time.

## Running it locally

Needs Docker, JDK 21, and Node 22.

```bash
./dev.sh start     # Postgres + Redis in Docker, the Spring backend, and Vite
./dev.sh status
./dev.sh stop
```

Then open the URL it prints. On first run the app walks you through creating the first
household and account.

## Layout

| Path | What |
| --- | --- |
| `backend/` | Spring Boot 3 / Java 21 API — JWT auth, JPA, WebSocket grocery sync |
| `web/` | React + Vite + Tailwind, mobile-first |
| `ios/` | Native SwiftUI app and share extension (built locally in Xcode, not by CI) |
| `e2e/` | Playwright API and UI tests |
| `docker-compose.dev.yml` | Postgres + Redis for local development |
| `docker-compose.prod.yml` | The production stack, from prebuilt GHCR images |
| `deploy.sh` | Pull and restart on the server |
| `k8s/` | An unused Kubernetes alternative to the Compose deployment |

## Deploying

See **[DEPLOY.md](DEPLOY.md)**. Short version: push to `main`, GitHub Actions builds both
images to GHCR, then run `./deploy.sh` on the server.
