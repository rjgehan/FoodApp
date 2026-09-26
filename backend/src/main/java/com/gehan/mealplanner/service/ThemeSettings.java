package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.ThemeMode;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.ThemeRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.ThemeResponse;
import com.gehan.mealplanner.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
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
     * The presets, by the key the apps know them by. The same list is in web/src/theme/theme.ts
     * and ios/MealPlanner/Theme.swift. A key that has shipped is never renamed or dropped: it is
     * in people's rows, and an old app would not know the new name.
     */
    public static final List<String> PRESETS =
            List.of("classic", "basil", "lagoon", "ocean", "blueberry", "plum", "mocha", "graphite");

    /** Your own pair rather than a preset — `primary` and `secondary` say which. */
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
     * The request tidied into what is stored: a known preset key, colours as uppercase #RRGGBB,
     * and a mode — or null for any of them. Custom needs both colours, since there is nothing
     * else to draw it with.
     */
    public static ThemeResponse checked(ThemeRequest request) {
        String preset = blankToNull(request.preset());
        if (preset != null) {
            preset = preset.toLowerCase(Locale.ROOT);
            if (!preset.equals(CUSTOM) && !PRESETS.contains(preset)) {
                throw badRequest("There's no theme called \"" + request.preset().trim() + "\".");
            }
        }
        String primary = hex(request.primary(), "main");
        String secondary = hex(request.secondary(), "second");
        if (CUSTOM.equals(preset) && (primary == null || secondary == null)) {
            throw badRequest("A custom theme needs both of its colours.");
        }
        return new ThemeResponse(preset, primary, secondary, mode(request.mode()));
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
