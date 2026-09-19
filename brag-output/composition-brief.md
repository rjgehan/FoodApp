# Hyperframes Composition Brief: Meal Planner

## Objective
Create a short, App Store-style feature spot for Meal Planner — a self-hosted meal planner one
person built for their own family and friends.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: ~19.5 seconds

## Source Material
- Project root: `/Users/ryangehan/Documents/GitHub/FoodApp`
- Primary files read: `README.md`, `web/index.html`, `web/tailwind.config.js`, `web/src/index.css`
- Product name: Meal Planner
- Tagline / strongest claim: "Sign in with a username and a 4-digit PIN, tapped out on a
  keypad. No emails, no passwords." / "Groceries... sync in real time."
- Key UI or visual moment to recreate:
  1. The "Who's cooking?" household/profile picker → PIN keypad login (numeral grid + 4 dots,
     matching an iPhone lock screen's visual language).
  2. The Dashboard's hero card: a big recipe cover photo, meal name, "+ Add to grocery list."
  3. Two phones side by side, one item checked off on the left, the same item flipping to
     checked on the right a beat later, unattended — the live-sync payoff.
  4. A quick beat on the nested recipe-group tree (Main dish / Sides / Freezer, some empty).
- Copy that must appear verbatim:
  - "No emails. No passwords."
  - "Check it off here."
  - "It disappears everywhere."
  - "Meal Planner"
  - "Self-hosted. Family and friends only."
  - "Currently serving four people."

## Creative Direction
- Tone preset: app-store
- Creative direction: Shoot a genuine hobby project like a real App Store feature video, played
  completely straight — the app is polished enough to earn it.
- Interpretation: Clean feature-card pacing (title case, medium weight, no aggression), one idea
  held per scene, restrained slide/wipe transitions (0.35-0.45s), real UI as the visual every
  time. The only wink is the outro line — everything before it is played with total sincerity.
- Angle: This isn't a startup pitch — it's a real, self-hosted app for four people, shot like it's
  a "real" product because it's polished enough to pass. The PIN-keypad login (no signup form, no
  password rules — just tap your name and punch in 4 digits, like unlocking a phone) is the
  disarming hook precisely because it's unexpected for something this clean-looking.
- Hook: Cold open on the real "Who's cooking?" screen — household avatars, a name gets tapped —
  before any text appears.
- Outro / punchline: "Meal Planner." → "Self-hosted. Family and friends only." → "Currently
  serving four people." Hold, then out.
- Avoid:
  - Generic SaaS language ("streamline," "workflow," etc.)
  - Abstract filler visuals — every scene must show a real screen from this app
  - Inventing UI that doesn't exist in the actual product (don't redesign the app for the video)

## Visual Identity
- Background: `rgb(255 255 255)` light / `rgb(0 0 0)` dark — pick one mode and hold it for
  consistency across the whole video; light mode is the safer default for readability
- Text: `rgb(29 29 31)` (light mode ink)
- Accent: `rgb(234 88 12)` (light mode accent-orange) — the app's one "you can act" color
- Display font: system-ui / SF Pro stack — `system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- Body font: same system stack (the app itself uses one family throughout)
- Visual references from the project: Apple-HIG-flavored neutrals (stark black/white, a soft
  grey "elevated" fill `rgb(242 242 247)`, hairline `rgb(216 216 220)` separators), rounded
  cards, the numeral-grid PIN keypad, colored-initial avatars on the household picker

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract — full scene-by-scene
detail, sequential/interaction notes, and audio-coupled ideas live there. Summary:

1. Who's cooking — 3.0s — household avatar row, one name tapped, "No emails. No passwords." settles in.
2. The keypad — 3.0s — 4 sequential PIN taps fill 4 dots, unlock bounce, slides into the Dashboard hero underneath.
3. Tonight's dinner — 3.5s — Dashboard hero card (cover photo, meal name, servings), "+ Add to grocery list" tapped, flips to "Added."
4. It syncs, actually — 4.0s — two phones side by side; check one item on the left, the same item flips checked on the right, unattended, a beat later. "Check it off here." → "It disappears everywhere."
5. Real depth underneath — 3.0s — nested recipe group tree (Main dish, Sides, Freezer, some empty). "Recipes, organized your way."
6. Outro — 3.0s — wordmark "Meal Planner," then "Self-hosted. Family and friends only.," then "Currently serving four people."

## Audio
- Audio role: warm, clean, feature-showcase bed with tasteful UI-motion accents
- Audio arc: fades in under Scene 1, steady through the highlights, lifts slightly around the
  Scene 4 sync payoff, fades out under the final outro line
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3`
- Music treatment: fade in 0-0.4s, bed at 0.3-0.35 volume through the highlights, fade over the
  final ~1s of the outro
- Music cue guidance: bundled preset at
  `assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`
  (120.19 BPM). Strong cues at 16.02s/17.02s/18.02s/20.02s fall near the Scene 4 sync-flip and
  the Scene 6 wordmark — good candidates for the 1-3 beat-locks this video should use. Early
  beat grid (~3.02s, 3.52s, 4.02s, 4.53s…) is available for the Scene 2 PIN-tap ticks if it reads
  naturally; do not let it outrun the 4-digit reading pace.
- Audio-reactive treatment: none — real UI screens plus the accent orange already carry enough
  visual energy; reactive glow on top of authentic app chrome would read as a gimmick
- Audio-coupled moments:
  - Scene 1 — single soft UI-tap on the avatar selection
  - Scene 2 — 4 individual keypress ticks (one per PIN digit), then a distinct "unlock" hit on
    the bounce, not swallowed by the last keypress
  - Scene 3 — one UI-click on the button tap, paired with a soft rising confirmation tone as it
    flips to "Added"
  - Scene 4 — two audibly distinct, sequential clicks: the manual tap on phone 1, then a
    slightly softer/higher click on phone 2's automatic flip a beat later — the gap between them
    IS the payoff, they must not land simultaneously
  - Scene 6 — wordmark lands near the 20.02s strong cue; music fade begins under the final line
- SFX selection guidance: keyboard/keypress sounds for the PIN digits, a soft positive UI/unlock
  sound for the login success, ui/click sounds for the button tap and the two grocery-check
  clicks (pick two that are clearly distinguishable from each other for the sync moment)
- SFX analysis guidance: use `skills/brag/assets/sfx/sfx-analysis.md` if present; prefer lower
  high-frequency-risk sounds since several moments repeat similar UI-click sounds back to back
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based
  on the implemented animation.
- Audio files: copy the chosen music into `brag-output/composition/assets/music/`; Hyperframes
  copies any SFX it selects into the same `assets/` tree.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition
contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design
spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli`
(lint/check/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent
interview and do not route into its generic promo / launch-video workflow. Prefer native
Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project — ideally all four
  named moments above (login/PIN, dashboard hero, grocery sync, recipe tree).
- Keep all text readable in the final render.
- Keep the video within 15-25 seconds.
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual
  animation exists.
- Treat music cue metadata as optional timing hints; ignore cues that hurt readability, pacing,
  or story. Use only 1-3 strong-cue locks in this 19.5s video.
- Use SFX to support motion and interaction: card sounds for card-like reveals, a positive
  confirmation cue for the login unlock and the "Added" state, click sounds for taps, restraint
  where the edit is already busy (Scene 2's four rapid keypresses should stay light-touch).
- Honor the planned music fade-in/fade-out and the lift around the sync payoff, using the best
  Hyperframes-supported implementation.
- Skip audio-reactive treatment per this brief's direction (none) — the real UI screens carry
  enough visual interest on their own.
- Use local assets for audio and any required runtime/media dependencies when possible.
- Run `hyperframes check` before render — it is brag's single gate.
