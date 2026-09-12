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
    DELI,
    MEAT,
    DAIRY,
    FROZEN,
    DRINKS,
    HOUSEHOLD,
    OTHER;

    /**
     * Reads a stored order, always returning every section exactly once. Anything missing —
     * a section added after the order was saved — goes on the end in default order, and anything
     * unrecognised is dropped, so a stale value can never hide a section.
     */
    public static List<StoreSection> orderFrom(String stored) {
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
        Arrays.stream(values()).filter(s -> !order.contains(s)).forEach(order::add);
        return order;
    }

    public static String toStored(List<StoreSection> order) {
        return orderFrom(order.stream().map(Enum::name).collect(Collectors.joining(","))).stream()
                .map(Enum::name)
                .collect(Collectors.joining(","));
    }
}
