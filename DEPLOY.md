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

## Two ways to lock yourself out

**Use hex secrets, not base64.** Docker Compose treats `$` in a value as a variable reference
and silently drops it plus the following word, so `openssl rand -base64 48` can arrive at the
container shorter than you wrote it. `openssl rand -hex 32` has no special characters at all.
If you must keep a `$`, escape it as `$$`.

**`DB_PASSWORD` is fixed the first time the database starts.** Postgres writes it into the data
directory and never reads the variable again. Changing it later means the backend gets
`password authentication failed` while Postgres itself looks perfectly healthy. Either wipe the
data directory, or change it inside the database:

```bash
docker exec -it mealplanner-postgres psql -U mealplanner -d mealplanner \
  -c "ALTER USER mealplanner WITH PASSWORD '<the value compose actually passes>';"
```

To see what the container really received (rather than what you typed):

```bash
docker exec mealplanner-backend printenv DB_PASSWORD | tr -d '\n' | md5sum
```

## Optional: sort the grocery list into aisles

Set `GEMINI_API_KEY` and the grocery list gains a **✨ Sort into aisles** action: one request
places everything the built-in keyword list could not. Leave it unset and the action never
appears; nothing else changes.

(The same key used to power a "Write it for me" recipe writer. That is gone — the Paste tab
takes a recipe from whatever AI you already use — but the variable names below keep their
`RECIPE_AI_` prefix so an existing `.env` still works.)

```yaml
services:
  backend:
    environment:
      GEMINI_API_KEY: ${GEMINI_API_KEY}
```

Get a key from aistudio.google.com. Gemini's free tier is twenty requests a day, which covers
sorting comfortably. The call is made by the backend, never the browser: a key in the frontend
bundle is readable by anyone who opens devtools, and the key goes in the `x-goog-api-key` header
rather than the query string so it stays out of access logs.

| Variable | Default | |
|---|---|---|
| `GEMINI_API_KEY` | *(unset — feature hidden)* | turns it on |
| `RECIPE_AI_MODEL` | `gemini-3.6-flash` | any model your key can reach |
| `RECIPE_AI_MAX_TOKENS` | `2000` | the floor; a long list is given more |
| `RECIPE_AI_BASE_URL` | Google's endpoint | only for pointing at a stub |

If a call fails the app answers 502 and the items stay where they were, to be moved by hand — a
wrong key, a model your account cannot reach, or a reply that ignored the schema all land there.
The backend log carries the actual reason.

## Signing in: email and password, and retiring the PIN screens

Everyone signs in with an email and a password. Accounts from before that still have a PIN, and
the app asks each of them for an email and password the next time they open it ("Not now" puts
it off until the app is next opened). Until everyone has moved over, the old way in — pick the
house, tap your name, type the PIN — is still there as a link under the sign-in form.

Household settings → Who's here shows **No email yet** beside anyone who has not added one, and
**Hasn't signed in yet** beside an account nobody has ever got into.
When nobody shows either any more, turn the PIN screens off — `LEGACY_PIN_LOGIN=false` in `.env`
(docker-compose.prod.yml passes it through), then `docker compose up -d backend`.

With it off, the sign-in page stops listing households and people to anyone who loads it, the
"Sign in with your name and PIN" link disappears from the web and the phone, and the PIN
endpoints (`/api/auth/login`, `/api/auth/pin`, `/api/auth/households/{id}/users`,
`/api/auth/users/{username}`) answer **410 Gone**. Nothing is deleted — set it back to `true`
(the default) and they return.

| Variable | Default | |
|---|---|---|
| `LEGACY_PIN_LOGIN` | `true` | `false` retires the name-and-PIN sign-in |
| `AUTH_MAX_PIN_ATTEMPTS` | `5` | wrong PINs or passwords before a lockout (per name / per email) |
| `AUTH_LOCKOUT_MINUTES` | `15` | how long the lockout lasts |

**Forgotten passwords** are reset by the household's owner — there is no email sending. Owner →
Household settings → Who's here → ••• → Reset password makes a one-time link (with a QR code) that
works for 24 hours; opening it sets a new password and signs them in. An owner can only do this for
someone whose every household is one they own (and who owns none), and never for an account that
came into the house already made — pulled in by the old add-by-username, or joining by accepting
an invite with an account they already had. Only accounts made through that house's own invite
(or before any of this was recorded) can be reset by its owner. Someone in two
families' houses changes their own password from Settings. Emails are one account each, enforced
by a unique index on `lower(email)`.

**Getting people in.** The only way into somebody else's household is its invite link:
Household settings → Invite someone shows `<site>/invite/<token>` (and a QR code), which any
member can hand out. Whoever opens it makes an account there — name, email, password — or signs
in to the one they have, and joins. There is no other sign-up, and nobody can be added to a house
without opening the link themselves (adding an existing account by username, and making accounts
on somebody's behalf, are gone). A link lasts 7 days; the owner can replace it at any time, which
kills the old one. The owner can also remove somebody from ••• beside their name; they keep their
account, and the invite link is replaced at the same moment — they had seen it, as everyone in
the house has — so they can only come back if somebody sends them the new one. A removed person's
open grocery list stops getting live updates straight away. Accounts that only ever had an email
and password are left off the public name-and-PIN screens.

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
  your name, email, password and a household name. After that, accounts are made from inside
  the app.
