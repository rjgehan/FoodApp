Fonts for the "Tomato Kitchen" redesign, taken from the designer's mockup (its embedded
@font-face rules) so the app draws exactly what the mockup shows. All three are variable fonts
under the SIL Open Font License 1.1; each licence sits next to its font.

- Fraunces: the titles in Tomato, Matcha and Brunch (axes opsz 9-144, wght 100-900, SOFT 0-100,
  WONK 0-1; the file's default instance is 9pt Black, so set the weight and SOFT/WONK explicitly).
- Nunito: the titles in Blueberry (wght 200-1000).
- Inter: UI text on the web, and the titles in Nordic (wght 100-900).

They are Latin subsets (about 230 characters: ASCII, Latin-1 accents, curly quotes, dashes,
the ellipsis, the middle dot, degrees, fractions and the common currency signs). Anything else
falls back to the next font in the stack.

On iOS the UI text stays SF Pro (the system font), as the mockup says; these files are here for
the titles. They are not wired into the app yet (Info.plist UIAppFonts), on purpose: that is part
of the iOS work.
