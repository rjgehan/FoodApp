package com.gehan.mealplanner.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Splits "1/3 cup parmesan cheese" into an amount, a unit and a name.
 *
 * This is the same job as {@code web/src/utils/amount.ts} and the app's {@code Amount}, and the
 * three have to agree because they all end up in the same catalog. It exists here so importing
 * a recipe from a link does not need a language model to do arithmetic — a small model reads
 * "1/3" as 1 and will put "parmesan cheese" in the unit, while this is exact and free.
 */
public record IngredientLine(BigDecimal quantity, String unit, String name, String notes, boolean optional) {

    private static final Map<String, String> UNITS = Map.ofEntries(
            Map.entry("cup", "cup"), Map.entry("cups", "cup"),
            Map.entry("tbsp", "tbsp"), Map.entry("tbsps", "tbsp"), Map.entry("tbs", "tbsp"),
            Map.entry("tablespoon", "tbsp"), Map.entry("tablespoons", "tbsp"),
            Map.entry("tsp", "tsp"), Map.entry("tsps", "tsp"),
            Map.entry("teaspoon", "tsp"), Map.entry("teaspoons", "tsp"),
            Map.entry("oz", "oz"), Map.entry("ounce", "oz"), Map.entry("ounces", "oz"),
            Map.entry("lb", "lb"), Map.entry("lbs", "lb"), Map.entry("pound", "lb"), Map.entry("pounds", "lb"),
            Map.entry("g", "g"), Map.entry("gram", "g"), Map.entry("grams", "g"),
            Map.entry("kg", "kg"), Map.entry("kilo", "kg"), Map.entry("kilogram", "kg"), Map.entry("kilograms", "kg"),
            Map.entry("ml", "ml"), Map.entry("l", "l"), Map.entry("liter", "l"), Map.entry("liters", "l"),
            Map.entry("litre", "l"), Map.entry("litres", "l"),
            Map.entry("pint", "pint"), Map.entry("pints", "pint"),
            Map.entry("quart", "quart"), Map.entry("quarts", "quart"),
            Map.entry("can", "can"), Map.entry("cans", "can"), Map.entry("tin", "can"), Map.entry("tins", "can"),
            Map.entry("clove", "clove"), Map.entry("cloves", "clove"),
            Map.entry("stick", "stick"), Map.entry("sticks", "stick"),
            Map.entry("bunch", "bunch"), Map.entry("bunches", "bunch"),
            Map.entry("head", "head"), Map.entry("heads", "head"),
            Map.entry("slice", "slice"), Map.entry("slices", "slice"),
            Map.entry("package", "package"), Map.entry("packages", "package"), Map.entry("pkg", "package"),
            Map.entry("pinch", "pinch"), Map.entry("pinches", "pinch"), Map.entry("dash", "dash"),
            Map.entry("sprig", "sprig"), Map.entry("sprigs", "sprig"), Map.entry("handful", "handful"),
            // How a cook measures out loud, for the recipes read off a transcript.
            Map.entry("handfuls", "handful"), Map.entry("knob", "knob"), Map.entry("knobs", "knob"),
            Map.entry("wedge", "wedge"), Map.entry("wedges", "wedge"),
            Map.entry("block", "block"), Map.entry("blocks", "block"),
            Map.entry("packet", "packet"), Map.entry("packets", "packet"),
            Map.entry("jar", "jar"), Map.entry("jars", "jar"),
            Map.entry("bottle", "bottle"), Map.entry("bottles", "bottle"),
            Map.entry("shot", "shot"), Map.entry("shots", "shot"),
            Map.entry("glug", "glug"), Map.entry("glugs", "glug"),
            Map.entry("spoonful", "spoonful"), Map.entry("spoonfuls", "spoonful"),
            Map.entry("sprinkling", "sprinkling"), Map.entry("drizzle", "drizzle"),
            Map.entry("splash", "splash"));

    /** "½ cup" and "1½ cups" are both how recipes are written for people. */
    private static final Map<Character, Double> GLYPHS = Map.of(
            '½', 0.5, '⅓', 1.0 / 3, '⅔', 2.0 / 3, '¼', 0.25, '¾', 0.75,
            '⅛', 0.125, '⅜', 0.375, '⅝', 0.625, '⅞', 0.875, '⅕', 0.2);

    private static final List<String> SKIPPABLE =
            List.of("to taste", "optional", "if you like", "as needed", "for serving", "to serve");

    private static final Set<Character> BULLETS = Set.of('-', '•', '*', '–', '—', '◦');

    public static IngredientLine of(String text) {
        String line = text == null ? "" : text.replace(' ', ' ').trim();
        while (!line.isEmpty() && BULLETS.contains(line.charAt(0))) {
            line = line.substring(1).trim();
        }

        String lowered = line.toLowerCase();
        boolean optional = SKIPPABLE.stream().anyMatch(lowered::contains);

        /*
         * Brackets first, and they nest: "56 oz crushed tomatoes ((2, 28 oz cans))" holds a
         * comma inside them, and splitting on that comma first leaves the name as
         * "crushed tomatoes ((2". Only a comma outside brackets separates the notes.
         */
        StringBuilder head = new StringBuilder();
        StringBuilder inside = new StringBuilder();
        StringBuilder notes = new StringBuilder();
        int depth = 0;
        for (char c : line.toCharArray()) {
            if (c == '(' || c == '[') {
                depth++;
                if (depth == 1) continue;
            } else if (c == ')' || c == ']') {
                depth--;
                if (depth == 0) {
                    append(notes, inside.toString().trim());
                    inside.setLength(0);
                    continue;
                }
                if (depth < 0) {
                    depth = 0;
                    continue;
                }
            }
            if (depth > 0) inside.append(c);
            else head.append(c);
        }
        append(notes, inside.toString().trim());

        /*
         * A comma usually separates the thing from what was done to it — "2 eggs, beaten",
         * "1 cup Parmesan cheese, freshly grated". Sometimes it separates two adjectives
         * describing the same thing: "4 boneless, skinless chicken breast cutlets", where
         * splitting leaves you shopping for boneless.
         *
         * What tells them apart is which side names food. Before the comma in the first two
         * there is an egg and a cheese; in the third there is only "boneless".
         */
        String rest = head.toString();
        int comma = rest.indexOf(',');
        if (comma >= 0 && namesSomething(rest.substring(0, comma))) {
            append(notes, rest.substring(comma + 1).trim());
            rest = rest.substring(0, comma);
        }

        String[] words = rest.trim().split("\\s+");
        int index = 0;
        BigDecimal quantity = null;
        String unit = null;

        if (words.length > 0 && !words[0].isEmpty()) {
            // "400g" and "2tbsp": a number welded to its unit.
            String[] split = splitWelded(words[0]);
            String first = split == null ? words[0] : split[0];
            String welded = split == null ? null : split[1];

            Double whole = null;
            if (welded == null && words.length > 1) {
                Double a = plain(first);
                Double b = fraction(words[1]);
                if (a != null && b != null) {
                    whole = a + b;
                    index = 2;
                }
            }
            if (whole == null) {
                Double value = value(first);
                if (value != null) {
                    whole = value;
                    index = 1;
                }
            }
            // "1 to 2 garlic cloves": the same range, written out. Drop the upper bound so
            // it does not end up in the name.
            if (whole != null && index + 1 < words.length
                    && words[index].equalsIgnoreCase("to") && plain(words[index + 1]) != null) {
                index += 2;
            }
            if (whole != null) {
                BigDecimal value = BigDecimal.valueOf(whole).setScale(3, RoundingMode.HALF_UP).stripTrailingZeros();
                // stripTrailingZeros turns 400 into 4E+2, which is not what anyone wants to
                // see in a grocery list or to send as JSON.
                quantity = value.scale() < 0 ? value.setScale(0, RoundingMode.UNNECESSARY) : value;
                if (welded != null) {
                    unit = UNITS.get(welded.toLowerCase());
                } else if (index < words.length && words.length - index > 1) {
                    String candidate = words[index].toLowerCase().replace(".", "");
                    String known = UNITS.get(candidate);
                    if (known != null) {
                        unit = known;
                        index++;
                    }
                }
            }
        }

        String name = String.join(" ", List.of(words).subList(Math.min(index, words.length), words.length));
        return new IngredientLine(quantity, unit, clean(name), notes.isEmpty() ? null : notes.toString(), optional);
    }

    /** Is there something you could buy in here, or only words describing one? */
    private static boolean namesSomething(String text) {
        for (String word : text.toLowerCase().split("[^a-zà-ÿ]+")) {
            if (StoreSectionKeywords.namesFood(word)) return true;
        }
        return false;
    }

    private static void append(StringBuilder notes, String piece) {
        if (piece == null || piece.isBlank()) return;
        if (!notes.isEmpty()) notes.append(" · ");
        notes.append(piece);
    }

    /** "400g" to {"400", "g"}; null when the word is not a number welded to a known unit. */
    private static String[] splitWelded(String word) {
        int dash = indexOfRangeDash(word);
        if (dash > 0) word = word.substring(0, dash);
        int at = -1;
        for (int i = 0; i < word.length(); i++) {
            if (Character.isLetter(word.charAt(i))) {
                at = i;
                break;
            }
        }
        if (at <= 0) return null;
        String number = word.substring(0, at);
        String rest = word.substring(at);
        if (plain(number) == null || !UNITS.containsKey(rest.toLowerCase())) return null;
        return new String[] {number, rest};
    }

    private static Double value(String raw) {
        // "6-8 cloves" and "1kg-1.2kg chicken": a range is how a cook writes "about". Take
        // the lower bound — under-buying is recoverable, and dropping the line is not.
        int dash = indexOfRangeDash(raw);
        if (dash > 0) return value(raw.substring(0, dash));
        Double fraction = fraction(raw);
        if (fraction != null) return fraction;
        if (raw.length() > 1) {
            char last = raw.charAt(raw.length() - 1);
            Double glyph = GLYPHS.get(last);
            Double whole = plain(raw.substring(0, raw.length() - 1));
            if (glyph != null && whole != null) return whole + glyph;
        }
        if (raw.length() == 1 && GLYPHS.containsKey(raw.charAt(0))) return GLYPHS.get(raw.charAt(0));
        return plain(raw);
    }

    /**
     * The dash in "6-8" or "1kg-1.2kg", and not the one in "extra-virgin".
     *
     * What marks a range is a digit after the dash and a number before it — before it, not
     * immediately before it, because "1kg-1.2kg" has the unit in between.
     */
    private static int indexOfRangeDash(String raw) {
        for (int i = 1; i < raw.length() - 1; i++) {
            char c = raw.charAt(i);
            if (c != '-' && c != '–' && c != '—') continue;
            if (Character.isDigit(raw.charAt(i + 1)) && Character.isDigit(raw.charAt(0))) return i;
        }
        return -1;
    }

    private static Double fraction(String raw) {
        if (!raw.contains("/")) return null;
        String[] parts = raw.split("/");
        if (parts.length != 2) return null;
        Double top = plain(parts[0]);
        Double bottom = plain(parts[1]);
        if (top == null || bottom == null || bottom == 0) return null;
        return top / bottom;
    }

    private static Double plain(String raw) {
        try {
            return Double.parseDouble(raw.replace(',', '.'));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String clean(String raw) {
        String out = raw.replaceAll("[()\\[\\]]", "").trim();
        if (out.toLowerCase().startsWith("of ")) out = out.substring(3);
        for (String phrase : SKIPPABLE) {
            out = out.replaceAll("(?i)\\s+or\\s+" + phrase, "");
            out = out.replaceAll("(?i)\\s+" + phrase, "");
        }
        return out.trim();
    }
}
