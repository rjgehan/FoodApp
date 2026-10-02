package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.StoreSection;

import java.time.LocalDate;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Whether something in the cupboard wants using soon — the server's own rule, so the web and
 * every phone get an answer, with or without Apple Intelligence.
 *
 * A use-by date somebody typed in is a fact: within {@link #SOON_DAYS} days (or past) is soon,
 * shown as "by Thu". Without one it is a guess from what the thing is and when it came into the
 * house: fresh herbs and fish keep a couple of days, milk a week, onions weeks, tins and dried
 * things forever. The guess is labelled as one ("soon"), never dressed up as a date.
 *
 * Shelf lives are round, cautious fridge/larder figures in the spirit of the UK Food Standards
 * Agency and USDA FSIS "FoodKeeper" storage guidance (foodsafety.gov/keep-food-safe/foodkeeper-app):
 * raw fish and mince 1–2 days, other raw meat 3, soft fruit and leaves ~3, milk ~7, hard cheese
 * weeks, roots and onions weeks. They only decide what to suggest cooking first — never safety.
 */
public final class UseSoon {

    /** "Use soon" means within this many days, today counted as 0. */
    public static final int SOON_DAYS = 3;

    /**
     * A guess that ran out this long ago is probably about something already eaten, thrown
     * away or frozen — the cupboard just never heard. Nagging about it forever helps nobody.
     */
    static final int STALE_AFTER_DAYS = 14;

    public enum Reason { DATE, GUESS }

    /**
     * @param by     the date it should be used by: typed in (DATE) or worked out (GUESS)
     * @param label  short words for a chip — "by Thu", "today", "soon"
     */
    public record Verdict(boolean soon, Reason reason, LocalDate by, String label) {
        static final Verdict NOT_SOON = new Verdict(false, null, null, null);
    }

    private UseSoon() {
    }

    /**
     * @param name      the cupboard item's name, as shown
     * @param section   its aisle's underlying section (null when unsorted)
     * @param useBy     the date on the packet, if somebody entered one
     * @param arrivedOn the day it came into the house
     * @param staple    always kept — salt, oil — so never "use soon"
     */
    public static Verdict of(String name, StoreSection section, LocalDate useBy, LocalDate arrivedOn,
                             boolean staple, LocalDate today) {
        if (useBy != null) {
            long days = ChronoUnit.DAYS.between(today, useBy);
            return new Verdict(days <= SOON_DAYS, Reason.DATE, useBy, dateLabel(useBy, today));
        }
        if (staple || arrivedOn == null) {
            return Verdict.NOT_SOON;
        }
        Optional<Integer> shelf = shelfDays(name, section);
        if (shelf.isEmpty()) {
            return Verdict.NOT_SOON;
        }
        LocalDate by = arrivedOn.plusDays(shelf.get());
        long days = ChronoUnit.DAYS.between(today, by);
        boolean soon = days <= SOON_DAYS && days >= -STALE_AFTER_DAYS;
        return new Verdict(soon, Reason.GUESS, by, soon ? "soon" : null);
    }

    /** "today", "tomorrow", "by Thu" within the week, "by 14 Oct" further out, "past its date". */
    public static String dateLabel(LocalDate useBy, LocalDate today) {
        long days = ChronoUnit.DAYS.between(today, useBy);
        if (days < 0) return "past its date";
        if (days == 0) return "today";
        if (days == 1) return "tomorrow";
        if (days < 7) return "by " + useBy.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.UK);
        return "by " + useBy.getDayOfMonth() + " " + useBy.getMonth().getDisplayName(TextStyle.SHORT, Locale.UK);
    }

    /** Words that say it keeps: whatever else the name says, a tin of fish is not fresh fish. */
    private static final Pattern KEEPS = Pattern.compile(
            "\\b(tin|tins|tinned|canned|can|cans|jar|jarred|dried|dry|frozen|powder|powdered|uht|long[- ]life"
                    + "|stock|stock cubes?|cubes|flakes|paste|purée|puree|passata|concentrate|sauce|ketchup|pickled|smoked salmon"
                    + "|pasta|noodles?|rice|flour|oats|honey|jam|vinegar|oil|sugar|peanut butter|nut butter"
                    + "|coconut milk|ice cream)\\b");

    /** Sections that are larder or freezer through and through. */
    private static final List<StoreSection> KEEPING_SECTIONS = List.of(
            StoreSection.DRY_GOODS, StoreSection.BAKING, StoreSection.SPICES, StoreSection.FROZEN,
            StoreSection.DRINKS, StoreSection.HOUSEHOLD);

    private record Rule(Pattern words, int days) {
        static Rule of(int days, String words) {
            return new Rule(Pattern.compile("\\b(" + words + ")"), days);
        }
    }

    /** First match wins, so the most specific (and shortest-lived) come first. */
    private static final List<Rule> RULES = List.of(
            Rule.of(2, "fish|salmon|cod|haddock|hake|mackerel|sea bass|trout|prawn|shrimp|mussel|scallop|squid|crab"
                    + "|mince|minced|ground beef|ground turkey|ground pork"),
            Rule.of(3, "chicken|turkey|beef|steak|pork|lamb|duck|sausage|chorizo|liver"),
            Rule.of(3, "spinach|salad|lettuce|rocket|arugula|watercress|kale|chard|pak choi|bok choy|bean ?sprout"
                    + "|coriander|cilantro|basil|parsley|mint|dill|chives|tarragon"
                    + "|strawberr|raspberr|blueberr|blackberr|mushroom|asparagus"),
            Rule.of(4, "avocado|bread|loaf|baguette|bagel|roll|bun|croissant|pastr"),
            Rule.of(5, "cream|crème fraîche|creme fraiche|soured cream|mozzarella|ricotta|burrata|hummus|houmous"
                    + "|tofu|tomato|courgette|zucchini|aubergine|eggplant|broccoli|cauliflower|green bean|pea pod"
                    + "|sugar snap|mangetout|cucumber|spring onion|scallion|leek|banana|grape|peach|nectarine|plum"
                    + "|pear|mango|ham|cooked|gnocchi"),
            Rule.of(7, "milk|bacon|pancetta|pepper|chilli|chili|celery|fennel|feta|halloumi|cottage cheese|cream cheese"
                    + "|tortilla|wrap|pitta|pita|naan"),
            Rule.of(10, "yogurt|yoghurt|kefir"),
            Rule.of(14, "carrot|cabbage|beetroot|beet|radish|apple|orange|lemon|lime|grapefruit|clementine|satsuma"
                    + "|parsnip|swede|turnip|sweetcorn|corn on the cob"),
            Rule.of(21, "egg|onion|shallot|garlic|ginger|potato|squash|pumpkin|butternut"),
            Rule.of(28, "cheddar|parmesan|parmigiano|pecorino|gruyère|gruyere|manchego|cheese"),
            Rule.of(30, "butter"));

    /** What a section keeps for when nothing in the name says. */
    private static Optional<Integer> sectionDays(StoreSection section) {
        if (section == null) return Optional.empty();
        return switch (section) {
            case PRODUCE, DELI -> Optional.of(5);
            case DAIRY -> Optional.of(7);
            case MEAT -> Optional.of(3);
            case BAKERY -> Optional.of(4);
            default -> Optional.empty();
        };
    }

    /**
     * Roughly how many days something keeps from when it was bought, or empty for larder and
     * freezer things that keep for weeks or more (tins, rice, spices, frozen peas). "Pepper" in
     * the spice aisle is the spice; in produce it is the vegetable — the section decides first.
     */
    public static Optional<Integer> shelfDays(String name, StoreSection section) {
        if (section != null && KEEPING_SECTIONS.contains(section)) return Optional.empty();
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (KEEPS.matcher(n).find()) return Optional.empty();
        if (section == null && n.matches(".*\\b(black pepper|peppercorns?|white pepper|cayenne|chilli flakes)\\b.*")) {
            return Optional.empty();
        }
        for (Rule rule : RULES) {
            if (rule.words().matcher(n).find()) return Optional.of(rule.days());
        }
        return sectionDays(section);
    }
}
