package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.ThemeMode;
import com.gehan.mealplanner.dto.HouseholdDtos.ThemeRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.ThemeResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** What a theme request is allowed to say, and how it is tidied before it is kept. */
class ThemeSettingsTest {

    private static ThemeResponse check(String preset, String primary, String secondary, String mode) {
        return ThemeSettings.checked(new ThemeRequest(preset, primary, secondary, mode));
    }

    private static void refused(String preset, String primary, String secondary, String mode, String says) {
        assertThatThrownBy(() -> check(preset, primary, secondary, mode))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getReason()).contains(says);
                });
    }

    @Test
    void nothingAtAllIsTheDefault() {
        assertThat(check(null, null, null, null)).isEqualTo(new ThemeResponse(null, null, null, null));
        assertThat(check(" ", "", "  ", "")).isEqualTo(new ThemeResponse(null, null, null, null));
    }

    @Test
    void everyPresetIsKnownWhateverItsCase() {
        for (String key : ThemeSettings.PRESETS) {
            assertThat(check(key, null, null, null).preset()).isEqualTo(key);
        }
        assertThat(check(" Matcha ", null, null, "dark"))
                .isEqualTo(new ThemeResponse("matcha", null, null, ThemeMode.DARK));
        refused("neon", null, null, null, "no theme called \"neon\"");
    }

    @Test
    void coloursAreSixHexDigitsKeptUppercaseWithTheHash() {
        assertThat(check("custom", "#ea580c", "fdba74", null))
                .isEqualTo(new ThemeResponse("custom", "#EA580C", "#FDBA74", null));
        refused("custom", "#fff", "#FDBA74", null, "main colour");
        refused("custom", "#EA580C", "orange", null, "second colour");
        refused("custom", "#EA580CFF", "#FDBA74", null, "main colour");
        refused(null, "rgb(1,2,3)", null, null, "main colour");
    }

    @Test
    void theFivePresetsAreTheMockupsThemes() {
        assertThat(ThemeSettings.PRESETS).containsExactly("tomato", "matcha", "blueberry", "brunch", "nordic");
        assertThat(ThemeSettings.DEFAULT_PRESET).isEqualTo("tomato");
    }

    @Test
    void anOldPairIsAcceptedAndStoredAsTheThemeItBecame() {
        // What old iPhone builds still send.
        assertThat(check("classic", null, null, null).preset()).isEqualTo("tomato");
        assertThat(check("mocha", null, null, null).preset()).isEqualTo("tomato");
        assertThat(check("basil", null, null, null).preset()).isEqualTo("matcha");
        assertThat(check("lagoon", null, null, null).preset()).isEqualTo("matcha");
        assertThat(check("ocean", null, null, null).preset()).isEqualTo("blueberry");
        assertThat(check("blueberry", null, null, null).preset()).isEqualTo("blueberry");
        assertThat(check("Plum", null, null, "LIGHT"))
                .isEqualTo(new ThemeResponse("blueberry", null, null, ThemeMode.LIGHT));
        assertThat(check("graphite", null, null, null).preset()).isEqualTo("nordic");
        // Every old key lands on one of today's.
        assertThat(ThemeSettings.PRESETS).containsAll(ThemeSettings.LEGACY_PRESETS.values());
    }

    @Test
    void customNeedsItsColourAndAnOldAppStillGetsAPair() {
        refused("custom", null, null, null, "needs its colour");
        refused("custom", null, "#EA580C", null, "needs its colour");
        // Today's apps send one colour; the second is filled in so an old app can draw it.
        assertThat(check("custom", "#2f6f9f", null, null))
                .isEqualTo(new ThemeResponse("custom", "#2F6F9F", "#2F6F9F", null));
        // An old app's pair is kept as it was.
        assertThat(check("custom", "#2F6F9F", "#FDBA74", null))
                .isEqualTo(new ThemeResponse("custom", "#2F6F9F", "#FDBA74", null));
    }

    @Test
    void aPresetKeepsTheCustomColoursForLater() {
        assertThat(check("brunch", "#112233", "#445566", "LIGHT"))
                .isEqualTo(new ThemeResponse("brunch", "#112233", "#445566", ThemeMode.LIGHT));
    }

    @Test
    void modeIsOneOfThree() {
        assertThat(check(null, null, null, "system").mode()).isEqualTo(ThemeMode.SYSTEM);
        assertThat(check(null, null, null, "Light").mode()).isEqualTo(ThemeMode.LIGHT);
        refused(null, null, null, "sepia", "SYSTEM, LIGHT or DARK");
    }
}
