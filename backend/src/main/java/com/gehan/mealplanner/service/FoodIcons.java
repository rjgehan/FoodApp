package com.gehan.mealplanner.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The keys of the hand-drawn food icons a drawer or a group can wear. The drawings themselves
 * live in the apps (web/src/components/FoodIcons.tsx, and the same art in the iPhone app's asset
 * catalog); the server only stores which one was picked, so this is the one list it checks a
 * pick against. A key it has never heard of would draw as nothing on every phone.
 *
 * Adding an icon means drawing it in both apps and adding its key here — the e2e suite checks
 * the three agree.
 */
public final class FoodIcons {

    public static final List<String> KEYS = List.of(
            "pancakes", "egg", "sandwich", "salad", "pot", "fish", "pizza", "bread",
            "cookie", "cake", "apple", "cup",
            "full-meal", "meat", "drumstick", "veggie", "carrot", "side",
            "rice-bowl", "noodles", "taco", "burger", "ice-cream", "glass");

    private static final Set<String> KNOWN = Set.copyOf(KEYS);

    /**
     * What the groups a new household starts with wear, so the catalog opens onto pictures
     * rather than blank tiles. Matched by name; anything not listed starts with no icon.
     */
    static final Map<String, String> DEFAULT_GROUP_ICONS = Map.ofEntries(
            Map.entry("Full meal", "full-meal"),
            Map.entry("Side", "side"),
            Map.entry("Veggie", "veggie"),
            Map.entry("Beef", "meat"),
            Map.entry("Pork", "meat"),
            Map.entry("Chicken", "drumstick"),
            Map.entry("Seafood", "fish"),
            Map.entry("Sandwiches", "sandwich"),
            Map.entry("Fruit", "apple"),
            Map.entry("Morning drinks", "cup"),
            Map.entry("Hot", "cup"),
            Map.entry("Cold", "glass"),
            Map.entry("Sweet", "cookie"),
            Map.entry("Baking", "bread"));

    private FoodIcons() {
    }

    public static boolean isKnown(String key) {
        return key != null && KNOWN.contains(key);
    }

    /**
     * A key to store: null for "no icon" (null or blank), the key itself when it is one of ours,
     * and a 400 otherwise.
     */
    public static String requireKnownOrBlank(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        String trimmed = key.trim();
        if (!KNOWN.contains(trimmed)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "There's no icon called " + trimmed + ".");
        }
        return trimmed;
    }
}
