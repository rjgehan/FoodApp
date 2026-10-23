# Waxwing

A family recipe box and one shared grocery list for a family and their friends: everyone's
recipes in one place, and a list that updates live on everyone's phones. Planning the week and
keeping track of the cupboard are there for households that want them. (The name and icon are
explained in [BRAND.md](BRAND.md); the app used to be called Meal Planner, and the internal
names, bundle id and domain still say so.)

- **Sign in** with an email and a password (older accounts still have a name-and-PIN keypad until
  the server turns it off). New people join through a household's **invite link** or its QR code;
  the owner can take someone out again.
- **Recipes** live in drawers (Breakfast / Lunch / Dinner / Snacks / Drinks / Other) and wear
  any number of tags the household makes up ("Chicken", "Quick"), with cover photos and an
  index-card view.
- **Groceries** come straight from a recipe or from the week's plan, are added up by ingredient,
  and sync in real time.
- **Plan** a week at a time (a meal can be a main plus its sides) and keep a **Cupboard**, so the
  list skips what is already at home. Both are optional: a household turns them on or off under
  Household → Kitchen & features.
- **The kitchen's machines** (oven, air fryer, slow cooker…) are saved per household, and every
  suggestion respects them: generated meal plans and, for a household that doesn't plan, **Meal
  ideas** in Explore only pick recipes it can make, and **Can make** narrows a drawer or Explore's
  Global recipes to them.

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
