package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.ThemeMode;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.ThemeRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.ThemeResponse;
import com.gehan.mealplanner.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Each person's choice of the app's colours. The server only keeps and checks the choice; what
 * the colours look like — the presets' pairs, and everything worked out from a pair — lives in
 * the apps (web/src/theme, ios/MealPlanner/Theme.swift). It is also what the admin page counts,
 * to see which colours people actually go for.
 */
@Service
public class ThemeSettings {

    /**
     * The presets, by the key the apps know them by: five whole themes, each with its own light
     * and dark palette and title font. The same list is in web/src/theme/themes.ts and
     * ios/MealPlanner/Theme.swift. Tomato is the default — what everyone who never picked
     * anything sees.
     */
    public static final List<String> PRESETS = List.of("tomato", "matcha", "blueberry", "brunch", "nordic");

    /** What everyone sees until they pick something else, and where an unknown key ends up. */
    public static final String DEFAULT_PRESET = "tomato";

    /**
     * The eight colour pairs that came before the five themes, and the theme each became. Old
     * iPhone builds still send these, so they are accepted and stored as the new key; rows saved
     * before the change are moved over once, on start (see {@link #migrateStoredPresets}).
     */
    public static final Map<String, String> LEGACY_PRESETS = Map.of(
            "classic", "tomato",
            "mocha", "tomato",
            "basil", "matcha",
            "lagoon", "matcha",
            "ocean", "blueberry",
            "plum", "blueberry",
            "graphite", "nordic");

    /** Your own accent rather than a preset — `primary` says which. */
    public static final String CUSTOM = "custom";

    private static final Pattern HEX = Pattern.compile("^#?([0-9A-Fa-f]{6})$");

    private final UserRepository userRepository;

    public ThemeSettings(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /** Replaces all four. Anything left out goes back to the default. */
    @Transactional
    public ThemeResponse update(UUID userId, ThemeRequest request) {
        ThemeResponse theme = checked(request);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        user.setThemePreset(theme.preset());
        user.setThemePrimary(theme.primary());
        user.setThemeSecondary(theme.secondary());
        user.setThemeMode(theme.mode());
        return ThemeResponse.of(userRepository.save(user));
    }

    /**
     * Rows saved before the five themes still name one of the old pairs: move each to the theme it
     * became. Runs on every start and only touches rows with an old key, so a second run finds
     * nothing to do. Returns how many rows it moved.
     */
    @Transactional
    public int migrateStoredPresets(JdbcTemplate jdbc) {
        StringBuilder cases = new StringBuilder();
        List<Object> args = new ArrayList<>();
        LEGACY_PRESETS.forEach((old, now) -> {
            cases.append(" WHEN ? THEN ?");
            args.add(old);
            args.add(now);
        });
        args.addAll(LEGACY_PRESETS.keySet());
        String in = String.join(",", LEGACY_PRESETS.keySet().stream().map(k -> "?").toList());
        return jdbc.update("UPDATE users SET theme_preset = CASE theme_preset" + cases + " END"
                + " WHERE theme_preset IN (" + in + ")", args.toArray());
    }

    /**
     * The request tidied into what is stored: a known preset key (an old one turned into the
     * theme it became), colours as uppercase #RRGGBB, and a mode — or null for any of them.
     *
     * Custom needs its main colour, since there is nothing else to draw it with. The second
     * colour is left over from when custom was a pair: today's apps pick one, so a missing second
     * is filled in with the main colour, which keeps the row drawable by an old iPhone build
     * that still expects both.
     */
    public static ThemeResponse checked(ThemeRequest request) {
        String preset = blankToNull(request.preset());
        if (preset != null) {
            preset = current(preset.toLowerCase(Locale.ROOT));
            if (!preset.equals(CUSTOM) && !PRESETS.contains(preset)) {
                throw badRequest("There's no theme called \"" + request.preset().trim() + "\".");
            }
        }
        String primary = hex(request.primary(), "main");
        String secondary = hex(request.secondary(), "second");
        if (CUSTOM.equals(preset)) {
            if (primary == null) {
                throw badRequest("A custom theme needs its colour.");
            }
            if (secondary == null) {
                secondary = primary;
            }
        }
        return new ThemeResponse(preset, primary, secondary, mode(request.mode()));
    }

    /** A preset key as it is today: an old one becomes the theme it was folded into. */
    public static String current(String key) {
        return key == null ? null : LEGACY_PRESETS.getOrDefault(key, key);
    }

    private static String hex(String value, String which) {
        String v = blankToNull(value);
        if (v == null) {
            return null;
        }
        var match = HEX.matcher(v);
        if (!match.matches()) {
            throw badRequest("The " + which + " colour has to look like #EA580C.");
        }
        return "#" + match.group(1).toUpperCase(Locale.ROOT);
    }

    private static ThemeMode mode(String value) {
        String v = blankToNull(value);
        if (v == null) {
            return null;
        }
        try {
            return ThemeMode.valueOf(v.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw badRequest("Light or dark is SYSTEM, LIGHT or DARK.");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
