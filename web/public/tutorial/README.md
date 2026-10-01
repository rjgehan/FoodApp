# First-run tutorial pictures

The two slides of the first-run tutorial (`src/tutorial/Tutorial.tsx`) each show a phone-framed
picture of the app, in light and dark to match the page:

| Slide | Light | Dark |
| --- | --- | --- |
| 1 · Plan the week together | `placeholder-plan-light.png` | `placeholder-plan-dark.png` |
| 2 · One list for the shop | `placeholder-groceries-light.png` | `placeholder-groceries-dark.png` |

These are **placeholders**: the designer's mockup renders of screens 2.1 (Plan · Calendar) and
4.1 (Groceries), 786×1706 with the phone's rounded corners already in them. Replace them with real
screenshots of the redesigned app at the same aspect (an iPhone screen, portrait), then change the
file names in `SLIDES` in `Tutorial.tsx` (and drop "placeholder" from them). The frame clips the
corners itself, so a plain rectangular screenshot works as it is.

The iPhone app has the same pictures in its asset catalog: `TutorialPlanPlaceholder` and
`TutorialGroceriesPlaceholder` (each with a dark appearance).
