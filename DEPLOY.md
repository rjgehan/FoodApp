# Deploying

GitHub Actions builds two images and pushes them to GHCR. The server pulls them and runs
Docker Compose. Actions never touches the server — deploys happen when you run `./deploy.sh`.

```
push to main  →  Actions builds  →  ghcr.io/<you>/foodapp-{backend,frontend}
                                              │
                              server: ./deploy.sh (pull + up -d)
```

## One-time setup

### 1. Push, and let the images build

```bash
git push origin main
```

Watch the **Actions** tab. Two workflows run (`Build backend image`, `Build frontend image`)
and push `:latest` plus a commit-SHA tag. They only run when their own directory changes —
use **Run workflow** on the Actions tab to force a build.

### 2. Decide how the server authenticates to GHCR

Packages are **private by default**. Pick one:

- **Public** (simplest for a family app): repo → Packages → each package → Package settings →
  Change visibility → Public. No login needed on the server.
- **Private**: create a classic PAT with `read:packages`, then on the server:
  ```bash
  echo "$GITHUB_PAT" | docker login ghcr.io -u <your-github-username> --password-stdin
  ```

### 3. Set it up on the server

```bash
git clone https://github.com/rjgehan/FoodApp.git
cd FoodApp
cp .env.prod.example .env
$EDITOR .env          # set JWT_SECRET and DB_PASSWORD at minimum
./deploy.sh
```

`deploy.sh` pulls, starts, and waits for `/actuator/health` before reporting success.

The app is then at `http://<server>` — and that is the only port it needs.

## Deploying again

```bash
git pull            # only needed if compose/env changed
./deploy.sh
```

`IMAGE_TAG=latest` picks up whatever Actions built most recently. To roll back, set
`IMAGE_TAG` in `.env` to a specific commit SHA and re-run `./deploy.sh`.

## One port, no API URL to configure

The frontend's nginx proxies `/api` and `/ws` to the backend over the compose network, so the
browser only ever talks to one origin. Consequences worth knowing:

- **Only `WEB_PORT` is published.** The backend has no host port at all.
- **Nothing is baked into the bundle**, so the app works from `localhost`, a LAN IP, a
  hostname or a domain without rebuilding.
- **No CORS involved**, since the API is same-origin.

`VITE_API_URL` stays unset unless the API genuinely lives on another origin.

## Data

Postgres lives in the `mealplanner_postgres-data` Docker volume, and **recipe photos are
stored in Postgres**, so one dump captures everything.

```bash
# Back up
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U mealplanner mealplanner > backup-$(date +%F).sql

# Restore into an empty database
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U mealplanner -d mealplanner < backup-2026-09-02.sql
```

`docker compose down` leaves the volume alone. `docker compose down -v` destroys it.

## Things worth knowing

- **The schema updates itself.** `ddl-auto: update` means Hibernate adds new tables and
  columns on startup. It never drops or rewrites anything, so it is safe for the changes made
  so far — but it will not migrate data, and there is no rollback. Take a dump before
  deploying a release that changes the model.
- **CORS is wide open.** `SecurityConfig` allows any origin. Fine on a home network; tighten
  it to real hostnames before exposing this to the internet.
- **Recipe images are served unauthenticated** at `/api/images/{uuid}`. An `<img>` tag cannot
  send a bearer token, so the random UUID is what keeps them private — like an unlisted link.
- **First run creates the first account.** Open the app and it offers first-time setup:
  a household and its owner. After that, accounts are made from inside the app.
