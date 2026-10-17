package com.gehan.mealplanner.service;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import static com.gehan.mealplanner.service.KitchenMachines.AIR_FRYER;
import static com.gehan.mealplanner.service.KitchenMachines.BLENDER;
import static com.gehan.mealplanner.service.KitchenMachines.FOOD_PROCESSOR;
import static com.gehan.mealplanner.service.KitchenMachines.GRILL;
import static com.gehan.mealplanner.service.KitchenMachines.MICROWAVE;
import static com.gehan.mealplanner.service.KitchenMachines.MIXER;
import static com.gehan.mealplanner.service.KitchenMachines.OVEN;
import static com.gehan.mealplanner.service.KitchenMachines.PRESSURE_COOKER;
import static com.gehan.mealplanner.service.KitchenMachines.RICE_COOKER;
import static com.gehan.mealplanner.service.KitchenMachines.SLOW_COOKER;

/**
 * Which kitchen machines a recipe needs, read from its own words — so a drawer can be filtered
 * to "air fryer" without anybody tagging a thing. Free and instant, unlike asking Gemini (twenty
 * requests a day would not cover one evening of saving recipes, let alone the backfill).
 *
 * It reads the name, the description and the method. Never the ingredients: "baked beans" are not
 * an oven and "roasted peppers" come from a jar. The name only counts where it names a machine
 * outright ("Air fryer wings", "Slow cooker chili"), since a name's "baked" or "BBQ" is as often a
 * flavour as a method; the description and the method count in full.
 *
 * Every machine but the stovetop. Nearly every recipe uses one, so as a filter it would match
 * everything and say nothing.
 *
 * In order, as Preferences does it — take out what only looks like a machine, then what is
 * plainly said not to be needed, then look:
 * <ul>
 *   <li>Not machines: a Dutch oven is a pot; a grill pan sits on the hob; "under the grill" is the
 *   oven's top element (the British grill, the American broiler), not a barbecue.</li>
 *   <li>Negations: "no-bake", "no oven needed", "without a blender". A no-bake recipe that lines a
 *   baking tin still never goes in the oven.</li>
 *   <li>Alternatives count: "or in the air fryer", "how to air fry too" — somebody with only the
 *   air fryer can still make it, and that is what filtering by machine is for.</li>
 *   <li>Verbs belong to the machine they are said with. "Bake" means the oven unless the same
 *   clause puts it in the air fryer ("bake in the air fryer at 180C"), and "preheat" means the
 *   oven unless it is a pan, the grill or another machine being heated.</li>
 * </ul>
 *
 * A wrong guess is one tap to fix on the recipe, and a fixed recipe is never guessed at again.
 */
public final class ApplianceDetector {

    /**
     * Bumped whenever these rules change, so StartupBackfills reads every recipe nobody has
     * corrected by hand again with the new ones.
     */
    public static final int VERSION = 2;

    private ApplianceDetector() {
    }

    // --- What only looks like a machine ------------------------------------------------------

    /**
     * A pot that goes on the hob as often as in the oven; "in the oven" says when it does. Left as
     * a pot rather than taken out, so "preheat a Dutch oven" is still heating a pot.
     */
    private static final Pattern A_POT = Pattern.compile("\\bdutch[- ]ovens?\\b");

    /** On the hob. Left as a pan, so "preheat a grill pan" is still heating a pan. */
    private static final Pattern A_PAN = Pattern.compile(String.join("|", List.of(
            "\\bgrill(?:ed)?[- ]?pans?\\b",
            "\\bgriddle[- ]?pans?\\b",
            "\\bstove[- ]?top grill\\w*\\b",
            "\\bcast[- ]iron grill\\w*\\b")));

    private static final Pattern NOT_MACHINES = Pattern.compile(String.join("|", List.of(
            "\\boven[- ]dried\\b",
            "\\bbaked beans?\\b",
            "\\bbaking (?:soda|powders?|paper|parchment|spices?)\\b",
            "\\bbake sales?\\b",
            "\\bbaker'?s\\b",
            "\\bbakery\\b",
            "\\b(?:bbq|barbecue|barbeque)[- ](?:sauces?|seasoning|rubs?|spices?|flavou?r\\w*|chips|crisps)\\b",
            "\\bactivated charcoal\\b",
            // On the hob.
            "\\bgrilled cheese\\w*\\b",
            // From a jar or a packet, or done in a dry pan.
            "\\broasted (?:red )?peppers?\\b",
            "\\bfire[- ]roasted\\b",
            "\\bdry[- ](?:roast|toast)\\w*\\b",
            "\\bpan[- ]roast\\w*\\b",
            "\\broast(?:ed)? (?:salted )?(?:peanuts|cashews|almonds|nuts|seaweed|sesame\\w*)\\b",
            "\\b(?:leftover|cooked|sliced|shredded|deli|cold) roast(?:ed)? (?:beef|chicken|turkey|pork|lamb|ham)\\b",
            // The tonic, not the stand mixer.
            "\\b(?:drinks?|cocktail|soft|soda|favou?rite) mixers?\\b",
            "\\bmixers? of (?:your )?choice\\b")));

    // --- What is said not to be needed ---------------------------------------------------------

    private static final String MACHINE_WORDS = "(?:(?:stand|hand|electric|outdoor|gas|charcoal|stick|immersion)[\\s-]+)?"
            + "(?:ovens?|microwaves?|air[- ]?fryers?|slow[- ]?cookers?|crock[- ]?pots?|instant[- ]?pots?"
            + "|pressure[- ]?cookers?|blenders?|food[- ]?processors?|processors?|mixers?|rice[- ]?cookers?"
            + "|grills?|barbecues?|bbqs?)";

    private static final Pattern NEGATED = Pattern.compile(
            "\\b(?:no|without(?:\\s+(?:a|an|the|your|any))?"
                    + "|(?:don'?t|do not)\\s+(?:need|have|use)(?:\\s+(?:a|an|the|your|any))?"
                    + "|no need (?:for|to use)(?:\\s+(?:a|an|the|your))?)[\\s-]+" + MACHINE_WORDS + "\\b"
                    + "|\\b" + MACHINE_WORDS + "[- ]free\\b");

    /** Never goes in the oven, whatever tin it is pressed into. */
    private static final Pattern NO_BAKE = Pattern.compile(
            "\\bno[\\s-]+bak(?:e|ing)\\b|\\bwithout baking\\b|\\bno[\\s-]+cook\\b");

    // --- Machines named outright: anywhere, the name included --------------------------------

    private static final Pattern OVEN_NAMED = Pattern.compile("\\bovens?\\b|\\btray[- ]?bakes?\\b");
    private static final Pattern MICROWAVE_NAMED = Pattern.compile("\\bmicrowav(?:e|es|ed|ing|able)\\b");
    private static final Pattern AIR_FRYER_NAMED = Pattern.compile(
            "\\bair[- ]?fr(?:y|ies|ied|ying|yer|yers|ier|iers)\\b");
    private static final Pattern SLOW_COOKER_NAMED = Pattern.compile(
            "\\bslow[- ]?cook(?:er|ers|ing|s)?\\b|\\bcrock[- ]?pots?\\b");
    private static final Pattern PRESSURE_COOKER_NAMED = Pattern.compile(
            "\\binstant[- ]?pots?\\b|\\binsta[- ]?pots?\\b|\\bpressure[- ]?cook\\w*");
    private static final Pattern BLENDER_NAMED = Pattern.compile(
            "\\bblenders?\\b|\\bliquidi[sz](?:e|ed|ing)\\b|\\bnutri[- ]?bullet\\b|\\bvitamix\\b"
                    + "|\\bsmoothies?\\b|\\bmilkshakes?\\b");
    private static final Pattern FOOD_PROCESSOR_NAMED = Pattern.compile(
            "\\b(?:food[- ]?)?processors?\\b|\\bmagimix\\b|\\bmini[- ]?choppers?\\b");
    private static final Pattern MIXER_NAMED = Pattern.compile(
            "\\bmixers?\\b|\\belectric (?:whisk|beaters?)\\b|\\bkitchen ?aid\\b|\\bdough hook\\b"
                    + "|\\b(?:paddle|whisk) attachment\\b");
    private static final Pattern RICE_COOKER_NAMED = Pattern.compile("\\brice[- ]?cookers?\\b");

    // --- What the method says it does: the description and the method only -------------------

    /** The British grill and the American broiler are the top of the oven. */
    private static final Pattern UNDER_THE_GRILL = Pattern.compile(
            "\\bunder (?:the|a) (?:hot |preheated |medium |high |medium-high )?(?:grill|broiler)\\b");
    /**
     * "180C fan" has its spaces taken possessively (`*+`): four runs of them side by side would
     * otherwise try every way of sharing out a long run of blanks after a number before giving up,
     * which on a few thousand of them is hours.
     */
    private static final Pattern OVEN_SAID = Pattern.compile(
            "\\bbroil(?:s|ed|ing|er)?\\b|\\bgas mark\\s*\\d|\\d+\\s*+°?\\s*+c?\\s*+\\(?\\s*+fan\\b"
                    + "|\\bfan[- ](?:forced|assisted)\\b|\\broasting (?:pan|tin|tray|dish)s?\\b");
    private static final Pattern BAKE = Pattern.compile("\\bbak(?:e|es|ed|ing)\\b");
    /** Roasting, not a roast: "sear the roast" before it goes in the slow cooker is not the oven. */
    private static final Pattern ROAST = Pattern.compile(
            "\\broast(?:ed|ing)\\b|(?<!\\b(?:the|a|your|this|pot|sunday|beef|pork|lamb|chuck|rib) )\\broasts?\\b");
    private static final Pattern PREHEAT = Pattern.compile("\\bpre-?heat(?:s|ed|ing)?\\b");

    /** Outdoors only. A bare "grill" is the oven's in Britain and the barbecue in America, so it says nothing. */
    private static final Pattern GRILL_SAID = Pattern.compile(String.join("|", List.of(
            "\\b(?:barbecue|barbeque|bbq)(?:s|d|ed|ing)?\\b",
            "\\bon (?:the|a|your) (?:hot |preheated |outdoor |gas |charcoal )?(?:grill|barbecue|bbq)\\b",
            "\\bgrill grates?\\b",
            "\\bcharcoal\\b",
            "\\b(?:outdoor|pellet|kettle|charcoal|gas) grills?\\b",
            "\\b(?:pre-?heat|light|fire up) (?:the|a|your) (?:grill|barbecue|bbq)\\b",
            "\\bgrill\\w* over (?:medium|high|low|direct|indirect|hot)\\b",
            "\\bover (?:direct|indirect) heat\\b",
            "\\b(?:hot|glowing) coals\\b")));

    private static final Pattern PRESSURE_COOKER_SAID = Pattern.compile(
            "\\b(?:high|low) pressure\\b|\\b(?:natural|quick)(?:ly)? (?:pressure )?release\\b"
                    + "|\\bpressure release\\b|\\bsealing position\\b");
    /** "Cook on low for 8 hours" — the hob's low is minutes, not hours. */
    private static final Pattern SLOW_COOKER_SAID = Pattern.compile(
            "\\bcook(?:\\s+\\w+)?\\s+on\\s+(?:low|high)\\s+(?:for\\s+)?(?:about\\s+|around\\s+)?"
                    + "\\d+(?:\\s*(?:-|–|to)\\s*\\d+)?\\s*(?:hours?|hrs?)\\b");
    private static final Pattern BLENDER_SAID = Pattern.compile(
            "\\b(?:blend|blitz)\\w*\\s+(?:\\w+\\s+){0,4}?until\\s+(?:\\w+\\s+)?smooth\\b");

    // --- Which machine a verb belongs to -------------------------------------------------------

    /**
     * A clause ends at a full stop, a new line, or an "or" — "air fry at 200C, or bake at 220C" is
     * two. Not the "or" of "microwave for 2 minutes, or until baked through", which is still the
     * microwave.
     */
    private static final Pattern CLAUSE_BREAK = Pattern.compile(
            "[.!?;:\\n]+|\\bor\\b(?!\\s+(?:until|till|so|more|less|longer|two|when)\\b)|\\balternatively\\b");

    /** Another machine doing the baking or roasting in the same clause. */
    private static final Pattern OTHER_HEAT = Pattern.compile(
            "\\bair[- ]?fr\\w*|\\bmicrowav\\w*|\\bslow[- ]?cook\\w*|\\bcrock[- ]?pots?\\b|\\binstant[- ]?pots?\\b"
                    + "|\\bpressure\\b|\\brice[- ]?cooker|\\bgrill\\w*|\\bbarbec\\w*|\\bbbq\\b|\\bsmoker\\b"
                    + "|\\bbread (?:machine|maker)\\b|\\bwaffle\\b|\\bdehydrator\\b|\\btoaster\\b(?! ?oven)");
    /**
     * Roasting on the hob: spices in a dry pan, a pepper over the flame. "A pan" on its own is the
     * hob's too; a sheet pan or a roasting pan never says just "a pan".
     */
    private static final Pattern ON_THE_HOB = Pattern.compile(
            "\\b(?:dry|frying) pan\\b|\\b(?:a|the) pan\\b|\\bskillet\\b|\\bwok\\b|\\bsaucepan\\b|\\bhob\\b|\\bstove\\w*"
                    + "|\\bflames?\\b|\\bover (?:a |the )?(?:low|medium|high|medium-high|medium-low)\\b");
    /** Heating something that is not the oven. */
    private static final Pattern NOT_THE_OVEN_HEATING = Pattern.compile(
            "\\bpans?\\b|\\bpots?\\b|\\bskillet\\b|\\bgriddle\\b|\\bwok\\b|\\boil\\b|\\bwater\\b|\\bwaffle\\b|\\bplate\\b"
                    + "|\\bsandwich\\b|\\bpanini\\b|\\bfryer\\b");

    /** Runs of spaces and tabs, as a method pasted from a web page or a PDF is full of. */
    private static final Pattern BLANKS = Pattern.compile("\\h++");
    /** Blank lines, and the spaces either side of a line break: one new line still ends a clause. */
    private static final Pattern LINE_BREAKS = Pattern.compile(" ?\\v[\\v ]*+");

    /**
     * The machines this recipe needs, as catalogue keys in the catalogue's order. Any of the three
     * may be null.
     */
    public static Set<String> detect(String name, String description, String instructions) {
        String title = tidy(name);
        String prose = tidy(join(description, instructions));

        title = NOT_MACHINES.matcher(potsAndPans(title)).replaceAll(" ");
        prose = NOT_MACHINES.matcher(potsAndPans(prose)).replaceAll(" ");
        boolean noBake = NO_BAKE.matcher(title).find() || NO_BAKE.matcher(prose).find();
        title = NEGATED.matcher(NO_BAKE.matcher(title).replaceAll(" ")).replaceAll(" ");
        prose = NEGATED.matcher(NO_BAKE.matcher(prose).replaceAll(" ")).replaceAll(" ");

        Set<String> found = new HashSet<>();
        String all = title + "\n" + prose;
        named(found, all, OVEN_NAMED, OVEN);
        named(found, all, MICROWAVE_NAMED, MICROWAVE);
        named(found, all, AIR_FRYER_NAMED, AIR_FRYER);
        named(found, all, SLOW_COOKER_NAMED, SLOW_COOKER);
        named(found, all, PRESSURE_COOKER_NAMED, PRESSURE_COOKER);
        named(found, all, BLENDER_NAMED, BLENDER);
        named(found, all, FOOD_PROCESSOR_NAMED, FOOD_PROCESSOR);
        named(found, all, MIXER_NAMED, MIXER);
        named(found, all, RICE_COOKER_NAMED, RICE_COOKER);

        if (UNDER_THE_GRILL.matcher(prose).find()) {
            found.add(OVEN);
            prose = UNDER_THE_GRILL.matcher(prose).replaceAll(" ");
        }
        named(found, prose, OVEN_SAID, OVEN);
        named(found, prose, GRILL_SAID, GRILL);
        named(found, prose, PRESSURE_COOKER_SAID, PRESSURE_COOKER);
        named(found, prose, SLOW_COOKER_SAID, SLOW_COOKER);
        named(found, prose, BLENDER_SAID, BLENDER);

        if (!found.contains(OVEN) && ovenVerb(prose, noBake)) {
            found.add(OVEN);
        }

        Set<String> ordered = new LinkedHashSet<>();
        KitchenMachines.KEYS.stream().filter(found::contains).forEach(ordered::add);
        return ordered;
    }

    /** Baked, roasted or preheated in some clause that hands the job to no other machine. */
    private static boolean ovenVerb(String prose, boolean noBake) {
        for (String clause : CLAUSE_BREAK.split(prose)) {
            if (OTHER_HEAT.matcher(clause).find()) {
                continue;
            }
            if (!noBake && BAKE.matcher(clause).find()) {
                return true;
            }
            if (ROAST.matcher(clause).find() && !ON_THE_HOB.matcher(clause).find()) {
                return true;
            }
            if (PREHEAT.matcher(clause).find() && !NOT_THE_OVEN_HEATING.matcher(clause).find()) {
                return true;
            }
        }
        return false;
    }

    private static void named(Set<String> found, String text, Pattern pattern, String machine) {
        if (pattern.matcher(text).find()) {
            found.add(machine);
        }
    }

    /** A Dutch oven called a pot and a grill pan a pan, which is all either of them is. */
    private static String potsAndPans(String text) {
        return A_PAN.matcher(A_POT.matcher(text).replaceAll("pot")).replaceAll("pan");
    }

    /**
     * Lower case, with the typographer's apostrophes and dashes made plain, and every run of blanks
     * one space or one new line.
     */
    private static String tidy(String text) {
        if (text == null) {
            return "";
        }
        String plain = text.toLowerCase(Locale.ROOT)
                .replace('’', '\'')
                .replace('‘', '\'')
                .replace('‐', '-')
                .replace('‑', '-');
        return LINE_BREAKS.matcher(BLANKS.matcher(plain).replaceAll(" ")).replaceAll("\n");
    }

    private static String join(String a, String b) {
        return (a == null ? "" : a) + "\n" + (b == null ? "" : b);
    }
}
