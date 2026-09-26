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
        assertThat(check(" Ocean ", null, null, "dark"))
                .isEqualTo(new ThemeResponse("ocean", null, null, ThemeMode.DARK));
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
    void customNeedsBothColours() {
        refused("custom", "#EA580C", null, null, "both of its colours");
        refused("custom", null, null, null, "both of its colours");
    }

    @Test
    void aPresetKeepsTheCustomPairForLater() {
        assertThat(check("plum", "#112233", "#445566", "LIGHT"))
                .isEqualTo(new ThemeResponse("plum", "#112233", "#445566", ThemeMode.LIGHT));
    }

    @Test
    void modeIsOneOfThree() {
        assertThat(check(null, null, null, "system").mode()).isEqualTo(ThemeMode.SYSTEM);
        assertThat(check(null, null, null, "Light").mode()).isEqualTo(ThemeMode.LIGHT);
        refused(null, null, null, "sepia", "SYSTEM, LIGHT or DARK");
    }
}
