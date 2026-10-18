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
}
