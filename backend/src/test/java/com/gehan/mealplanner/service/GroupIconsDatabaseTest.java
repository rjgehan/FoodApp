package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RecipeDtos.CreateCategoryRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeCategoryResponse;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateCategoryRequest;
import com.gehan.mealplanner.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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

    private static String iconOf(List<RecipeCategoryResponse> all, String name, RecipeSection section) {
        return all.stream().filter(c -> c.name().equals(name) && c.section() == section)
                .findFirst().orElseThrow().iconKey();
    }
}
