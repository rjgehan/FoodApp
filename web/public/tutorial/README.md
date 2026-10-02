# First-run tutorial pictures

The two slides of the first-run tutorial (`src/tutorial/Tutorial.tsx`) each show a phone-framed
picture of the app, in light and dark to match the page. "Light or dark?" crops its two cards
from the Plan pair.

| Slide | Light | Dark |
| --- | --- | --- |
| 1 · Plan the week together | `plan-light.jpg` | `plan-dark.jpg` |
| 2 · One list for the shop | `groceries-light.jpg` | `groceries-dark.jpg` |

They are screenshots of the iPhone app (Plan · Calendar and Groceries) on an iPhone 18 Pro
simulator with the status bar at 9:41, signed in as Ryan in the showcase household
(`cd e2e && npm run reset -- --yes && npm run seed:showcase`), launched with
`-mp_debug_token … -mp_debug_tab plan|groceries` in light and dark appearance. Each is scaled to
660 px wide (enough for the frame's 470 pt height at 3×) and saved as a JPEG at quality 80, about
70 KB. The frame clips the corners itself, so a plain rectangular screenshot works as it is; keep
the iPhone's portrait aspect and its status bar at the top ("Light or dark?" crops just below it).

The iPhone app has the same pictures in its asset catalog: `TutorialPlan` and `TutorialGroceries`
(each with a dark appearance).
