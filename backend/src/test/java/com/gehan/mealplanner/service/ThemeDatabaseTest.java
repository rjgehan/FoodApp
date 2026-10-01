package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.ThemeMode;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.AdminDtos.CustomPair;
import com.gehan.mealplanner.dto.AdminDtos.ModeCount;
import com.gehan.mealplanner.dto.AdminDtos.PresetCount;
import com.gehan.mealplanner.dto.AdminDtos.ThemeUsage;
import com.gehan.mealplanner.dto.HouseholdDtos.ThemeRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.ThemeResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateProfileRequest;
import com.gehan.mealplanner.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Colours against the real database: kept per person, returned from /me, untouched by the
 * profile edits older apps send, and counted for the admin page. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class ThemeDatabaseTest {

    @Autowired ThemeSettings themeSettings;
    @Autowired AccountService accountService;
    @Autowired HouseholdService householdService;
    @Autowired AdminService adminService;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager entityManager;

    private String tag;

    @BeforeEach
    void tag() {
        tag = UUID.randomUUID().toString().substring(0, 8);
    }

    private User account(String name) {
        return userRepository.save(User.builder().username(name + "-" + tag).displayName(name).build());
    }

    @Test
    void keptPerPersonAndShownOnMe() {
        User ryan = account("theme-ryan");
        User mum = account("theme-mum");
        assertThat(accountService.me(ryan.getId()).theme()).isEqualTo(new ThemeResponse(null, null, null, null));

        themeSettings.update(ryan.getId(), new ThemeRequest("custom", "#0f766e", "#f97316", "DARK"));

        assertThat(accountService.me(ryan.getId()).theme())
                .isEqualTo(new ThemeResponse("custom", "#0F766E", "#F97316", ThemeMode.DARK));
        assertThat(accountService.me(mum.getId()).theme()).isEqualTo(new ThemeResponse(null, null, null, null));
    }

    @Test
    void anOlderAppRenamingYouLeavesYourColoursAlone() {
        User ryan = account("theme-rename");
        themeSettings.update(ryan.getId(), new ThemeRequest("matcha", null, null, "LIGHT"));

        householdService.updateProfile(ryan.getId(), new UpdateProfileRequest(null, "Ryan G"));

        assertThat(accountService.me(ryan.getId()).theme())
                .isEqualTo(new ThemeResponse("matcha", null, null, ThemeMode.LIGHT));
    }

    @Test
    void theAdminCountsWhatPeoplePick() {
        ThemeUsage before = adminService.themes();
        themeSettings.update(account("theme-a").getId(), new ThemeRequest("nordic", null, null, "DARK"));
        themeSettings.update(account("theme-b").getId(), new ThemeRequest("graphite", null, null, null));
        themeSettings.update(account("theme-c").getId(), new ThemeRequest("custom", "#123456", "#ABCDEF", "LIGHT"));
        themeSettings.update(account("theme-d").getId(), new ThemeRequest("custom", "#123456", "#abcdef", null));
        account("theme-e");

        ThemeUsage after = adminService.themes();

        assertThat(after.people() - before.people()).isEqualTo(5);
        assertThat(after.untouched() - before.untouched()).isEqualTo(1);
        // An old key sent by an old app is counted as the theme it became.
        assertThat(count(after, "nordic") - count(before, "nordic")).isEqualTo(2);
        assertThat(count(after, "custom") - count(before, "custom")).isEqualTo(2);
        // Nobody picked it, and it is still listed: that is an answer too.
        assertThat(after.presets()).extracting(PresetCount::key).containsAll(ThemeSettings.PRESETS);
        assertThat(pair(after, "#123456", "#ABCDEF") - pair(before, "#123456", "#ABCDEF")).isEqualTo(2);
        assertThat(mode(after, ThemeMode.DARK) - mode(before, ThemeMode.DARK)).isEqualTo(1);
        assertThat(mode(after, ThemeMode.SYSTEM) - mode(before, ThemeMode.SYSTEM)).isEqualTo(3);
    }

    @Test
    void oldPairsSavedBeforeTheThemesAreMovedOnceAndCountedMeanwhile() {
        // Rows as an older server left them, written straight to the table.
        User basil = account("theme-basil");
        User graphite = account("theme-graphite");
        User mocha = account("theme-mocha");
        User custom = account("theme-own");
        User nobody = account("theme-none");
        userRepository.flush();
        jdbc.update("UPDATE users SET theme_preset = 'basil', theme_mode = 'DARK' WHERE id = ?", basil.getId());
        jdbc.update("UPDATE users SET theme_preset = 'graphite' WHERE id = ?", graphite.getId());
        jdbc.update("UPDATE users SET theme_preset = 'mocha' WHERE id = ?", mocha.getId());
        jdbc.update("UPDATE users SET theme_preset = 'custom', theme_primary = '#0F766E', theme_secondary = '#F97316'"
                + " WHERE id = ?", custom.getId());
        // What JPA already holds would hide the rows as they now are.
        entityManager.clear();

        // Before the move, /me and the admin already speak in today's keys.
        assertThat(accountService.me(basil.getId()).theme().preset()).isEqualTo("matcha");
        ThemeUsage counted = adminService.themes();
        assertThat(counted.presets()).extracting(PresetCount::key)
                .containsExactly("tomato", "matcha", "blueberry", "brunch", "nordic", "custom");

        assertThat(themeSettings.migrateStoredPresets(jdbc)).isGreaterThanOrEqualTo(3);
        assertThat(stored(basil)).isEqualTo("matcha");
        assertThat(stored(graphite)).isEqualTo("nordic");
        assertThat(stored(mocha)).isEqualTo("tomato");
        assertThat(stored(custom)).isEqualTo("custom");
        assertThat(stored(nobody)).isNull();
        assertThat(jdbc.queryForObject("SELECT theme_mode FROM users WHERE id = ?", String.class, basil.getId()))
                .isEqualTo("DARK");
        assertThat(jdbc.queryForObject("SELECT theme_primary FROM users WHERE id = ?", String.class, custom.getId()))
                .isEqualTo("#0F766E");

        // A second run has nothing left to move, and the counts do not change.
        assertThat(themeSettings.migrateStoredPresets(jdbc)).isZero();
        ThemeUsage after = adminService.themes();
        for (String key : ThemeSettings.PRESETS) {
            assertThat(count(after, key)).as(key).isEqualTo(count(counted, key));
        }
    }

    private String stored(User user) {
        return jdbc.queryForObject("SELECT theme_preset FROM users WHERE id = ?", String.class, user.getId());
    }

    private static long count(ThemeUsage usage, String key) {
        return usage.presets().stream().filter(p -> p.key().equals(key)).mapToLong(PresetCount::count).sum();
    }

    private static long pair(ThemeUsage usage, String primary, String secondary) {
        return usage.custom().stream()
                .filter(p -> p.primary().equals(primary) && p.secondary().equals(secondary))
                .mapToLong(CustomPair::count).sum();
    }

    private static long mode(ThemeUsage usage, ThemeMode mode) {
        return usage.modes().stream().filter(m -> m.mode() == mode).mapToLong(ModeCount::count).sum();
    }
}
