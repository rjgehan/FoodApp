# Brag Plan: Meal Planner

## What is this app?
A meal planner built for one family (and their friends) to actually use: sign in with just a
username and a 4-digit PIN tapped on a keypad — no email, no password — then plan a week of
meals and watch the grocery list it generates sync live across everyone's phone as items get
checked off.

## The angle
This isn't a startup pitch — it's a real, self-hosted app one person built for their own family,
and it's polished enough to be mistaken for a "real" product. The angle is playing it exactly
that straight: shoot it like a genuine App Store feature spot, using real screens, so the joke
(if there is one) is that a hobby project for four people got the full treatment. The login flow
— tap your name, punch in a PIN — is the unexpected, disarming hook: no signup form, no password
rules, just a keypad like unlocking a phone.

## Hook (first 2-3 seconds)
Open cold on the real "Who's cooking?" screen: household avatars, then a name tapped, then the
PIN keypad appears. Overlay text arrives a beat behind: "No emails. No passwords." The keypad
itself is the visual — nothing invented.

## Key moments (the middle)
- The PIN keypad taking a 4-digit tap-in and unlocking with a satisfied little scale-bounce,
  landing directly on the Dashboard's hero card (today's dinner, real cover photo, big type).
- The Dashboard hero's "+ Add to grocery list" button tapped — one motion from "what's for
  dinner" to "it's on the list."
- The real payoff: an item checked off on the grocery list on one phone, and the same item
  going checked, live, on a second phone beside it — no refresh, no delay.
- A quick beat on the recipe catalog's group tree (Main dish, Sides, etc.) to show there's real
  depth under the hood, not just one screen.

## Outro / punchline
Wordmark: "Meal Planner." Then, in the app-store CTA cadence but true: "Self-hosted. Family and
friends only. Currently serving four people." Hold, then out.

## User flow worth showing
Sign in (tap your name → 4-digit PIN) → land on today's dinner and add it to groceries → check an
item off and watch it sync live to a second phone. Entry → key action → result, all real screens.

## Tone
- Preset: app-store
- Creative direction: Shoot a genuine hobby project like a polished App Store feature video —
  played completely straight, because the app can actually back it up.
- Interpretation: Clean feature-card pacing, title-case type, no aggression, no bullet dumps —
  one idea held per scene, real UI as the visual every time, restrained slide/wipe transitions.
  The only "joke" is the gap between how serious the presentation is and how small the app's
  actual audience is (outro line carries that, nothing else needs to wink).

## Format: landscape — 1920x1080
## Duration: 19.5s target (sum below)

## Visual identity (from the project)
- Background: `rgb(255 255 255)` light / `rgb(0 0 0)` dark (Apple-style true neutrals)
- Accent: `rgb(234 88 12)` light / `rgb(255 159 64)` dark — the one color that means "you can act"
- Text: `rgb(29 29 31)` light / `rgb(245 245 247)` dark
- Display font: system-ui / SF Pro stack (`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`)
- Body font: same system stack — one font family throughout, weight does the differentiating
- Strongest visual element: the orange accent against stark black/white, and the PIN keypad —
  identical numeral-grid language as an iPhone lock screen

## Share copy (draft)
Built my family a meal planner with no logins — just a name and a PIN — and a grocery list that
syncs live across everyone's phone. Self-hosted, obviously.

## Audio direction
- Role: warm, clean, feature-showcase bed with tasteful UI-motion accents
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` — most energetic bundled track,
  explicitly suited to `app-store`; 120.19 BPM
- Music treatment: fade in under Scene 1 (0-0.4s), steady bed at 0.3-0.35 volume through the
  highlights, gentle fade over the final 1s of the outro
- Music cue guidance: bundled preset read
  (`assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`). Strong
  cues at 16.02s, 17.02s, 18.02s, 20.02s fall inside/near the sync-moment and outro beats —
  target the grocery-sync reveal and the outro wordmark near these. Earlier beat grid
  (3.02s, 3.52s, 4.02s, 4.53s…) available for the PIN-tap ticks in Scenes 1-2.
- Audio-reactive treatment: none — the accent orange and UI motion already carry energy; adding
  reactive glow on top of real UI screens would read as gimmicky
- SFX posture: moderate, motion-matched. Keypad taps get individual keypress sounds; the PIN
  unlock gets a soft positive "unlock" hit; the grocery checkbox toggle gets a light UI click on
  both phones, slightly offset to sell "live"
- Audio-coupled moments: each of the 4 PIN digits gets its own keypress tick; the checkbox
  toggle on phone 1 and its synced echo on phone 2 are two distinct, closely-timed clicks —
  that gap IS the joke/payoff, don't let it land as one simultaneous sound
- Restraint rule: never let SFX or music beat-snapping race ahead of on-screen text — the PIN
  digits and the "No emails. No passwords." line both need their full reading hold regardless of
  nearby beats

## Storyboard

### Scene 1 — Who's cooking — 3.0s
Real "Who's cooking?" screen: household name, a row of member avatars (colored initials, matching
the app's real avatar treatment). A finger/cursor taps one name. Text "No emails. No passwords."
settles in after the tap, title-case, medium weight, accent-orange word ("No emails" in ink,
"passwords" gets the accent underline or color pop).
Sequential/interaction: yes — avatar tap is a simulated interaction (cursor/finger taps one
avatar, it highlights).
Audio intent: inviting, a little surprising — this doesn't look like a login form.
Audio-coupled idea: a single soft UI-tap sound on the avatar selection.
Music: fade-in, mood establishing, low presence under the tap sound.
Transition mood: clean → Scene 2

### Scene 2 — The keypad — 3.0s
Cut to the real PIN keypad (numeral grid, 4 dots above it). Four taps land in sequence, each dot
filling in turn; on the fourth, the screen does its real unlock bounce and slides into the
Dashboard hero card underneath.
Sequential/interaction: yes — 4 sequential keypad taps, each filling one dot, then unlock.
Audio intent: quick, satisfying, mechanical — like unlocking a phone.
Audio-coupled idea: 4 individual keypress ticks (one per digit) landing on the early beat grid
(~3.02s, 3.52s, 4.02s, 4.53s), then a distinct soft "unlock" hit on the bounce — the unlock hit
should not be swallowed by the last keypress tick.
Music: bed continues, steady.
Transition mood: soft slide → Scene 3

### Scene 3 — Tonight's dinner — 3.5s
The real Dashboard hero card: cover photo, meal name in large type, "Serves N," and the
"+ Add to grocery list" button. The button is tapped; it swaps to "Added" with a small check
flourish. Overlay label above, app-store feature-card style: "Tonight's dinner, right up front."
Sequential/interaction: yes — simulated tap on "+ Add to grocery list," button state changes to
"Added."
Audio intent: confident, a little delighted — this is the payoff of opening the app at all.
Audio-coupled idea: one clean UI-click on the button tap, paired with a soft rising confirmation
tone as it flips to "Added."
Music: steady bed.
Transition mood: clean slide → Scene 4

### Scene 4 — It syncs, actually — 4.0s
Two phone frames side by side (or a clean split), both showing the same real grocery list.
On the left, a finger taps an item's row to check it off. A beat later (roughly 0.3-0.5s), the
identical item flips to checked on the right phone, unprompted. Label: "Check it off here."
holds, then "It disappears everywhere." arrives on the right-phone flip.
Sequential/interaction: yes — explicit two-step: (1) tap-to-check on phone 1, (2) automatic
mirrored check on phone 2 a beat later, unattended.
Audio intent: this is the "wait, it actually works" moment — give it room.
Audio-coupled idea: a UI click on the phone-1 tap, then a second, slightly softer/higher click
on phone 2's automatic flip, timed near the 16.02s/17.02s strong cues — the two clicks must stay
audibly distinct and sequential, not stacked.
Music: hits a strong beat around the phone-2 flip; slight bed lift.
Transition mood: clean wipe → Scene 5

### Scene 5 — Real depth underneath — 3.0s
Quick beat on the recipe catalog's group tree (Main dish, Sides, Freezer, etc., nested, some
empty) or the week-view meal plan grid — whichever reads clearest at a glance. Label:
"Recipes, organized your way."
Sequential/interaction: none required — a single settled shot is enough at this pace; a subtle
one-time reveal (list items fading in top-to-bottom, fast) is optional.
Audio intent: a light "and there's more" beat before the outro breathes.
Audio-coupled idea: none, or one soft whoosh on the transition in.
Music: steady, beginning to anticipate the outro.
Transition mood: soft crossfade → Scene 6

### Scene 6 — Outro — 3.0s
Clean background, wordmark "Meal Planner" in large title-case type. Beneath it, smaller: "Self-
hosted. Family and friends only." Beat, then smaller still: "Currently serving four people."
Hold on full composition.
Sequential/interaction: yes — three lines arrive in sequence (wordmark, then line 1, then line 2),
each held enough to read before the next arrives; do not stack them faster than the reading floor.
Audio intent: warm landing, a small private smile on the last line.
Audio-coupled idea: wordmark lands on/near the 20.02s strong cue; music bed begins its fade
under the final line.
Music: fades out over the last ~1s.
Transition mood: soft hold → end

**Music mood for this video:** upbeat, clean, app-store energetic (vol-1)
**Audio summary:** A steady, warm upbeat bed carries the whole video; every real interaction (PIN
taps, button tap, the two grocery-list clicks, the wordmark landing) gets its own small, distinct
sound rather than blending into the music, so the sync moment in Scene 4 reads as two clearly
separate, sequential clicks — that gap is the entire joke.
