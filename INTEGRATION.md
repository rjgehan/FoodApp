# Meal Planner integration API

An HTTP API for other services on the home network — a dashboard, a wall display, a script.

Reads cover the meal plan, the recipe box, the grocery list and the places. **The only writes
are to the grocery list**, so a broken consumer can add "milk" but can never touch a recipe or
the meal plan.

Everything is JSON, `UTF-8`, no pagination (a family's recipe box is small).

## Turning it on

Set one environment variable on the Meal Planner server. Unset means the endpoints answer
`503` — off is the default, because this app is reachable from the public internet.

```yaml
# docker-compose.override.yml on the Meal Planner host
services:
  backend:
    environment:
      INTEGRATION_API_KEY: ${INTEGRATION_API_KEY}
```

```bash
openssl rand -hex 32   # use hex, not base64: compose eats `$` in a value
```

## Authentication

Every request needs the key in a header:

```
X-API-Key: <the key>
```

- Missing or wrong key → `401`
- Key not configured on the server → `503`

There is no user behind these calls, so responses are **not** scoped to a household's
membership: the key can read any household on the server. Treat it as an operator credential.

## Base URL

Two options, both fine:

| | URL | Notes |
|---|---|---|
| Over Tailscale | `http://<tailscale-name>:8090` | Stays on the tailnet. Preferred. |
| Public | `https://meals.gehan.cloud` | Goes out through Cloudflare and back. Works anywhere. |

Port `8090` is the frontend's nginx, which proxies `/api` to the backend — so the same paths
work either way. If both machines are on the tailnet, use that: fewer hops, and the key never
leaves the private network.

## Endpoints

### `GET /api/integration/households`

Start here — everything else needs a household id.

```json
[
  { "id": "c55e95cf-…", "name": "Gehan House", "defaultServings": 4 }
]
```

### `GET /api/integration/households/{householdId}/today`

The common case, so it has its own URL. Returns one `Day`.

```json
{
  "date": "2026-09-03",
  "meals": [
    {
      "mealType": "LUNCH",
      "items": [
        {
          "kind": "PLACE",
          "name": "Golden Dragon",
          "time": "17:00:00",
          "servings": null,
          "notes": null,
          "recipeId": null,
          "imageUrl": null,
          "totalTimeMinutes": null,
          "placeId": "85ff3203-…",
          "menuUrl": "https://example.com/menu",
          "phone": "(555) 867-5309"
        }
      ]
    },
    {
      "mealType": "DINNER",
      "items": [
        {
          "kind": "RECIPE",
          "name": "Spaghetti Bolognese",
          "time": null,
          "servings": 4,
          "notes": null,
          "recipeId": "ec2a53d5-…",
          "imageUrl": "/api/images/834a83b9-…",
          "totalTimeMinutes": 55,
          "placeId": null,
          "menuUrl": null,
          "phone": null
        }
      ]
    }
  ]
}
```

**`kind` is the discriminator.** `"RECIPE"` is something being cooked; `"PLACE"` is eating out.
The fields for the other kind are null, so you can switch on one value.

`time` is `"HH:mm:ss"` when the occasion has one — a booking, a pickup slot — and null when it
does not, which is most of the time. It is a wall-clock time with no date or zone attached.

`mealType` is one of `BREAKFAST`, `LUNCH`, `DINNER`, `SNACK`. Meals with nothing in them are
omitted, and they come back in eating order.

A meal can hold **several items** — a main plus its sides is three entries in one `DINNER`.

### `GET /api/integration/households/{householdId}/plan`

A date range. Returns an array of `Day`, same shape as above.

| Param | Default | Meaning |
|---|---|---|
| `start` | today | `YYYY-MM-DD` |
| `end` | `start` + 6 days | `YYYY-MM-DD` |
| `days` | — | Instead of `end`: how many days from `start`, inclusive |

Days with nothing planned are **still returned**, with `"meals": []`, so a week grid always has
seven cells and you never have to fill gaps yourself.

```
GET /api/integration/households/{id}/plan?days=3
GET /api/integration/households/{id}/plan?start=2026-09-07&end=2026-09-13
```

### `GET /api/integration/households/{householdId}/recipes`

Browsable list, sorted by name.

| Param | Meaning |
|---|---|
| `q` | Case-insensitive substring of name or description |
| `section` | `BREAKFAST` `LUNCH` `DINNER` `SNACKS` `DRINKS` `OTHER` |
| `category` | A sub-category name, e.g. `Main dish`, `Side`, `Veggie` |

```json
[
  {
    "id": "ec2a53d5-…",
    "name": "Spaghetti Bolognese",
    "description": "Sunday sauce that reheats well.",
    "section": "DINNER",
    "categories": ["Full meal", "Main dish"],
    "servings": 4,
    "prepTimeMinutes": 10,
    "cookTimeMinutes": 45,
    "totalTimeMinutes": 55,
    "imageUrl": "/api/images/834a83b9-…"
  }
]
```

`section` and `categories` are **per household** — how *that* household filed the recipe. A
recipe shared from another household has `"section": null` until it is filed.

### `GET /api/integration/recipes/{recipeId}`

Full detail. Optional `?householdId=` fills in `section` and `categories` as that household
files it; without it both come back empty.

```json
{
  "id": "…", "name": "better bars", "description": null,
  "section": "SNACKS", "categories": ["Dessert"],
  "servings": 4, "prepTimeMinutes": 15, "cookTimeMinutes": 20, "totalTimeMinutes": 35,
  "imageUrl": null,
  "photoUrls": [],
  "sourceUrl": null,
  "videoUrl": "https://www.tiktok.com/…",
  "ingredients": [
    { "name": "sweetened condensed milk", "quantity": "⅓", "unit": "cup",
      "notes": null, "text": "⅓ cup sweetened condensed milk" }
  ],
  "steps": [
    "Preheat the oven to 350°F and line a small baking dish with parchment paper.",
    "Crush the graham crackers into fine crumbs, mix with the melted butter…"
  ]
}
```

Two things done for you, so you don't reimplement them and drift out of step with the app:

- **`ingredients[].text`** is the whole line pre-rendered — `"⅓ cup sweetened condensed milk"`.
  `quantity` is already a fraction glyph, not `0.333`. The separate fields are there if you want
  to lay out columns instead.
- **`steps`** is the instructions split one per line with any numbering the writer typed
  (`1.`, `-`, `•`) already stripped. Render them in an `<ol>`.

### `GET /api/integration/households/{householdId}/grocery-list`

Unchecked items first, then alphabetical.

```json
[ { "id": "…", "name": "baby potatoes", "quantity": "1½", "unit": "lb", "checked": false } ]
```

### `POST /api/integration/households/{householdId}/grocery-list`

Add an item. `name` is required and is free text — it does not have to match an ingredient the
app already knows. `quantity` and `unit` are optional.

```bash
curl -X POST "$BASE/api/integration/households/$HID/grocery-list" \
  -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"name":"oat milk","quantity":2,"unit":"ct"}'
```

```json
{ "id": "713d70df-…", "name": "oat milk", "quantity": "2", "unit": "ct", "checked": false }
```

A missing or blank `name` is `400`.

**This shows up live.** The write goes through the same service the web app uses, so anyone with
the grocery list open on their phone sees the item appear immediately — no refresh. Verified:
adding through this endpoint took an open list from 29 items to 30 without a reload.

Units are free text but worth keeping consistent — the app suggests `cup, tbsp, tsp, oz, lb, g,
kg, ml, l, ct, clove, can, bunch, head, package`.

### `PATCH /api/integration/households/{householdId}/grocery-list/{itemId}`

Tick an item off, or un-tick it. Broadcasts live the same way.

```json
{ "checked": true }
```

Returns the updated item. Nobody is recorded as having ticked it, unlike the web app where the
list shows who did — a dashboard is not a person.

### `DELETE /api/integration/households/{householdId}/grocery-list/{itemId}`

Removes it. `204`, no body. Broadcasts live.

### `GET /api/integration/households/{householdId}/places`

Somewhere the household eats instead of cooking.

```json
[ { "id": "…", "name": "Golden Dragon", "menuUrl": "https://…",
    "phone": "(555) 867-5309", "notes": "get the garlic knots", "imageUrl": null } ]
```

## Images

`imageUrl`, `photoUrls[]` are **relative paths** like `/api/images/{uuid}`. Prepend whichever
base URL you called:

```
http://<tailscale-name>:8090/api/images/834a83b9-…
```

They are relative on purpose: the server does not know whether you reached it over the tailnet
or the public hostname, and hard-coding either would break the other.

**Image URLs need no API key and no login.** An `<img>` tag cannot send headers, so the random
UUID in the path is what keeps them unlisted. Anyone with the URL can fetch the picture.

## Errors

| Status | Meaning |
|---|---|
| `401` | Missing or wrong `X-API-Key` |
| `404` | No such household or recipe |
| `503` | `INTEGRATION_API_KEY` is not set on the server |

Bodies are `{"status": <int>, "message": "<text>"}`.

## Notes for the consumer

- **Polling is fine.** These are small reads straight out of Postgres. Once a minute for
  `today` is nothing; there is no rate limit and no caching layer, so don't hammer it either.
- **The grocery list is the only writable thing.** No adding meals, no editing recipes. If you
  want either, it needs building — say so and it can be added.
- **No websocket.** The app has live grocery sync over `/ws` for its own UI, but it is bound to
  a signed-in user's token, not this key. Poll instead.
- **Times are the server's local dates.** `today` uses the server clock, not the caller's.
