package com.gehan.mealplanner.domain;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Where in the supermarket something is. A fixed list rather than one each household invents:
 * the sorting — by keyword or by Gemini — needs a known set of answers to choose from.
 *
 * Declared in the default walking order (produce, bread, dry goods, deli, …). Each household can
 * reorder them to match its own store; see {@link Household#storeSections()}.
 */
public enum StoreSection {
    PRODUCE,
    BAKERY,
    DRY_GOODS,
    BAKING,
    SPICES,
    DELI,
    MEAT,
    DAIRY,
    FROZEN,
    DRINKS,
    HOUSEHOLD,
    OTHER;

    /**
     * Reads a stored order, always returning every section exactly once; anything unrecognised is
     * dropped, so a stale value can never hide a section. A section added since the order was
     * saved — Baking and Spices, say — goes in right after the one it follows by default, so a
     * household that walks produce, bread, dry goods finds baking next to dry goods, not at the
     * far end of the list.
     */
    public static List<StoreSection> orderFrom(String stored) {
        List<StoreSection> order = parse(stored);
        for (StoreSection section : values()) {
            if (order.contains(section)) {
                continue;
            }
            int at = 0;
            for (int i = section.ordinal() - 1; i >= 0; i--) {
                int found = order.indexOf(values()[i]);
                if (found >= 0) {
                    at = found + 1;
                    break;
                }
            }
            order.add(at, section);
        }
        return order;
    }

    /** Someone saving an order: the sections they sent, and any they left out on the end. */
    public static String toStored(List<StoreSection> order) {
        List<StoreSection> complete = parse(order.stream().map(Enum::name).collect(Collectors.joining(",")));
        Arrays.stream(values()).filter(s -> !complete.contains(s)).forEach(complete::add);
        return complete.stream().map(Enum::name).collect(Collectors.joining(","));
    }

    private static List<StoreSection> parse(String stored) {
        List<StoreSection> order = new ArrayList<>();
        if (stored != null) {
            for (String part : stored.split(",")) {
                try {
                    StoreSection section = valueOf(part.trim());
                    if (!order.contains(section)) {
                        order.add(section);
                    }
                } catch (IllegalArgumentException ignored) {
                    // Renamed or removed since it was saved.
                }
            }
        }
        return order;
    }
}
