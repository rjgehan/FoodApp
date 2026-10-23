package com.gehan.mealplanner.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The kitchen machines a household can say it has, and a recipe can need. One list, in the
 * order every screen shows it: the server stores only the key — on a household (what is in its
 * kitchen) and on a recipe (what the method calls for) — so this is what it checks a key
 * against, and what the apps' own copies (web/src/utils/machines.ts, and KitchenMachine.all in
 * the iPhone app) have to agree with. The e2e suite reads all three and fails if they drift.
 *
 * Plain string keys rather than an enum column: Hibernate writes an enum's values into a CHECK
 * constraint once and never updates it (see SchemaTouchUps.dropStoreSectionValueChecks), so a
 * machine added later would be refused by the database itself.
 *
 * Adding a machine means adding it here and in both apps, with a drawing in each.
 */
public final class KitchenMachines {

    /** A machine as the apps list it. `label` is what a person reads; `key` is what is stored. */
    public record Machine(String key, String label) {
    }

    public static final String OVEN = "oven";
    public static final String STOVETOP = "stovetop";
    public static final String MICROWAVE = "microwave";
    public static final String AIR_FRYER = "air-fryer";
    public static final String SLOW_COOKER = "slow-cooker";
    public static final String PRESSURE_COOKER = "pressure-cooker";
    public static final String GRILL = "grill";
    public static final String BLENDER = "blender";
    public static final String FOOD_PROCESSOR = "food-processor";
    public static final String MIXER = "mixer";
    public static final String RICE_COOKER = "rice-cooker";

    public static final List<Machine> ALL = List.of(
            new Machine(OVEN, "Oven"),
            new Machine(STOVETOP, "Stovetop"),
            new Machine(MICROWAVE, "Microwave"),
            new Machine(AIR_FRYER, "Air fryer"),
            new Machine(SLOW_COOKER, "Slow cooker"),
            new Machine(PRESSURE_COOKER, "Instant Pot / pressure cooker"),
            new Machine(GRILL, "Grill / BBQ"),
            new Machine(BLENDER, "Blender"),
            new Machine(FOOD_PROCESSOR, "Food processor"),
            new Machine(MIXER, "Stand or hand mixer"),
            new Machine(RICE_COOKER, "Rice cooker"));

    public static final List<String> KEYS = ALL.stream().map(Machine::key).toList();

    /**
     * Machines that do the same job, so a recipe naming two of one family is asking for either:
     * "bake, or air fry at 180C", "in the slow cooker or the Instant Pot", "a blender or food
     * processor". ApplianceDetector tags a recipe with every machine its method offers, which is
     * right for the drawer's filter (the air fryer's owner finds it) but would ask a kitchen to
     * have both. Named alone, a machine is still needed: a smoothie is the blender's.
     *
     * The apps carry the same families (STAND_INS in machines.ts, KitchenMachine.standIns), and the
     * e2e suite fails if the three drift apart.
     */
    public static final List<List<String>> STAND_INS = List.of(
            List.of(OVEN, AIR_FRYER),
            List.of(SLOW_COOKER, PRESSURE_COOKER),
            List.of(BLENDER, FOOD_PROCESSOR));

    private static final Set<String> KNOWN = Set.copyOf(KEYS);

    private KitchenMachines() {
    }

    public static boolean isKnown(String key) {
        return key != null && KNOWN.contains(key);
    }

    /**
     * The keys to store: trimmed, each once, blanks dropped — and a 400 naming the first one that
     * is not ours, since it would draw as nothing on every phone. Null is an empty set.
     */
    public static Set<String> requireKnown(Collection<String> keys) {
        Set<String> known = new LinkedHashSet<>();
        if (keys == null) {
            return known;
        }
        for (String key : keys) {
            if (key == null || key.isBlank()) {
                continue;
            }
            String trimmed = key.trim();
            if (!KNOWN.contains(trimmed)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "There's no machine called " + trimmed + ".");
            }
            known.add(trimmed);
        }
        return known;
    }

    /**
     * These keys in the catalogue's order — oven before blender, wherever they are listed — as a
     * plain list, safe to hand to Jackson after the transaction has closed. A key no longer in the
     * catalogue is left out rather than shown as a blank.
     */
    public static List<String> inOrder(Collection<String> keys) {
        if (keys == null || keys.isEmpty()) {
            return List.of();
        }
        Set<String> wanted = new HashSet<>(keys);
        return KEYS.stream().filter(wanted::contains).toList();
    }

    /**
     * What a kitchen lacks to make a recipe that needs these machines, in the catalogue's order:
     * empty when it can make it. What every suggestion is checked against — generated meal plans,
     * Meal ideas — and what the apps' "Can make" chips check too, with their own copy of the rule.
     *
     * <ul>
     *   <li>A kitchen with no machines saved has never said what is in it, so it lacks nothing:
     *   skipping the question never hides a recipe.</li>
     *   <li>The stovetop is taken to be in every kitchen, ticked or not. Never spotted on a
     *   recipe, it can only be picked by hand, and never stands in the way.</li>
     *   <li>Two or more of one {@link #STAND_INS} family are either-or: one of them will do. A
     *   kitchen with none of them lacks all those named.</li>
     * </ul>
     */
    public static List<String> missing(Collection<String> needs, Collection<String> kitchen) {
        if (needs == null || needs.isEmpty() || kitchen == null || kitchen.isEmpty()) {
            return List.of();
        }
        Set<String> wanted = new HashSet<>(needs);
        wanted.remove(STOVETOP);
        for (List<String> family : STAND_INS) {
            List<String> named = family.stream().filter(wanted::contains).toList();
            if (named.size() > 1 && named.stream().anyMatch(kitchen::contains)) {
                named.forEach(wanted::remove);
            }
        }
        wanted.removeAll(new HashSet<>(kitchen));
        return inOrder(wanted);
    }

    /** Whether a kitchen with these machines can make a recipe that needs those; see {@link #missing}. */
    public static boolean canMake(Collection<String> needs, Collection<String> kitchen) {
        return missing(needs, kitchen).isEmpty();
    }
}
