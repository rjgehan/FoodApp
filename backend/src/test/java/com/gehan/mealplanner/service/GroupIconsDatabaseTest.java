package com.gehan.mealplanner.service;

import com.gehan.mealplanner.config.StartupBackfills;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RecipeDtos.CreateCategoryRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeCategoryResponse;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateCategoryRequest;
import com.gehan.mealplanner.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * A group's icon against the real database: set when it is made, changed or taken off later,
 * and left alone by an edit that does not mention it — which is every edit an app from before
 * icons makes. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class GroupIconsDatabaseTest {

    @Autowired RecipeService recipeService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager entityManager;

    private UUID userId;
    private UUID householdId;

    @BeforeEach
    void household() {
        User user = userRepository.save(User.builder()
                .username("icons-it-" + UUID.randomUUID()).displayName("Icons").build());
        userId = user.getId();
        householdId = householdService.create(userId, new CreateHouseholdRequest("Icons IT")).id();
    }

    @Test
    void aNewHouseholdsStartingGroupsWearTheirIcons() {
        List<RecipeCategoryResponse> all = recipeService.listCategories(householdId, userId);
        assertThat(iconOf(all, "Full meal", RecipeSection.DINNER)).isEqualTo("full-meal");
        assertThat(iconOf(all, "Veggie", RecipeSection.DINNER)).isEqualTo("veggie");
        assertThat(iconOf(all, "Side", RecipeSection.DINNER)).isEqualTo("side");
        assertThat(iconOf(all, "Chicken", RecipeSection.DINNER)).isEqualTo("drumstick");
        // Nothing obvious to draw for "Main", so it stays a plain tile.
        assertThat(iconOf(all, "Main", RecipeSection.DINNER)).isNull();
        assertThat(FoodIcons.DEFAULT_GROUP_ICONS.values()).allMatch(FoodIcons::isKnown);
    }

    @Test
    void anIconIsKeptUntilSomethingSaysOtherwise() {
        RecipeCategoryResponse made = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Tacos", null, RecipeSection.DINNER, "taco"));
        assertThat(made.iconKey()).isEqualTo("taco");

        // A rename from an app that knows nothing of icons leaves it on.
        RecipeCategoryResponse renamed = recipeService.updateCategory(householdId, made.id(), userId,
                new UpdateCategoryRequest("Taco night", null, null, null));
        assertThat(renamed.iconKey()).isEqualTo("taco");

        RecipeCategoryResponse changed = recipeService.updateCategory(householdId, made.id(), userId,
                new UpdateCategoryRequest(null, null, null, "burger"));
        assertThat(changed).extracting(RecipeCategoryResponse::name, RecipeCategoryResponse::iconKey)
                .containsExactly("Taco night", "burger");

        RecipeCategoryResponse cleared = recipeService.updateCategory(householdId, made.id(), userId,
                new UpdateCategoryRequest(null, null, null, ""));
        assertThat(cleared.iconKey()).isNull();
    }

    @Test
    void onlyKnownIconsAreTaken() {
        assertThatThrownBy(() -> recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Mystery", null, RecipeSection.DINNER, "unicorn")))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(400));

        RecipeCategoryResponse plain = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Plain", null, RecipeSection.DINNER, null));
        assertThat(plain.iconKey()).isNull();
        assertThatThrownBy(() -> recipeService.updateCategory(householdId, plain.id(), userId,
                new UpdateCategoryRequest(null, null, null, "unicorn")))
                .isInstanceOf(ResponseStatusException.class);

        // Drawers are checked against the same list.
        assertThatThrownBy(() -> recipeService.setSectionIcon(householdId, userId, RecipeSection.DINNER, "unicorn"))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(recipeService.setSectionIcon(householdId, userId, RecipeSection.DINNER, "full-meal"))
                .containsEntry(RecipeSection.DINNER, "full-meal");
        assertThat(recipeService.setSectionIcon(householdId, userId, RecipeSection.DINNER, ""))
                .doesNotContainKey(RecipeSection.DINNER);
    }

    @Test
    void groupsFromBeforeIconsAreOfferedTheirsOnceAndARemovalLaterStays() {
        // A drawer as a household from before group icons has it: every group plain, and none
        // of them offered an icon yet. Plus a hand-made "  veggie " in Lunch, and a Side there
        // somebody already chose a different picture for.
        RecipeCategoryResponse lunchVeggie = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("veggie", null, RecipeSection.LUNCH, null));
        UUID lunchSide = idOf(recipeService.listCategories(householdId, userId), "Side", RecipeSection.LUNCH);
        recipeService.updateCategory(householdId, lunchSide, userId, new UpdateCategoryRequest(null, null, null, "rice-bowl"));
        entityManager.flush();
        jdbc.update("UPDATE recipe_categories SET name = '  ' || name || ' ' WHERE id = ?", lunchVeggie.id());
        jdbc.update("""
                UPDATE recipe_categories SET default_icon_offered_at = NULL,
                    icon_key = CASE WHEN id = ? THEN icon_key ELSE NULL END
                WHERE household_id = ?""", lunchSide, householdId);
        entityManager.clear();

        StartupBackfills.offerObviousGroupIcons(jdbc);
        entityManager.clear();

        List<RecipeCategoryResponse> after = recipeService.listCategories(householdId, userId);
        assertThat(iconOf(after, "Full meal", RecipeSection.DINNER)).isEqualTo("full-meal");
        assertThat(iconOf(after, "Side", RecipeSection.DINNER)).isEqualTo("side");
        assertThat(iconOf(after, "Veggie", RecipeSection.DINNER)).isEqualTo("veggie");
        assertThat(iconOf(after, "Chicken", RecipeSection.DINNER)).isEqualTo("drumstick");
        assertThat(iconOf(after, "Main", RecipeSection.DINNER)).isNull();
        assertThat(iconOf(after, "  veggie ", RecipeSection.LUNCH)).isEqualTo("veggie");
        // Chosen, so kept — even though Side's obvious icon is another one.
        assertThat(iconOf(after, "Side", RecipeSection.LUNCH)).isEqualTo("rice-bowl");

        // Taken off on purpose afterwards, and a Side made by hand with no picture: the next
        // start leaves both alone.
        UUID veggie = idOf(after, "Veggie", RecipeSection.DINNER);
        recipeService.updateCategory(householdId, veggie, userId, new UpdateCategoryRequest(null, null, null, ""));
        recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Side", null, RecipeSection.SNACKS, null));
        entityManager.flush();
        entityManager.clear();

        assertThat(StartupBackfills.offerObviousGroupIcons(jdbc)).isZero();
        entityManager.clear();

        List<RecipeCategoryResponse> again = recipeService.listCategories(householdId, userId);
        assertThat(iconOf(again, "Veggie", RecipeSection.DINNER)).isNull();
        assertThat(iconOf(again, "Side", RecipeSection.SNACKS)).isNull();
        assertThat(iconOf(again, "Full meal", RecipeSection.DINNER)).isEqualTo("full-meal");
    }

    private static UUID idOf(List<RecipeCategoryResponse> all, String name, RecipeSection section) {
        return all.stream().filter(c -> c.name().equals(name) && c.section() == section)
                .findFirst().orElseThrow().id();
    }

    private static String iconOf(List<RecipeCategoryResponse> all, String name, RecipeSection section) {
        return all.stream().filter(c -> c.name().equals(name) && c.section() == section)
                .findFirst().orElseThrow().iconKey();
    }
}
