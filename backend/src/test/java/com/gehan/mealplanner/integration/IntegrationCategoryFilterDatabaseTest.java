package com.gehan.mealplanner.integration;

import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.TagRecipesRequest;
import com.gehan.mealplanner.integration.IntegrationDtos.RecipeSummary;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.service.HouseholdService;
import com.gehan.mealplanner.service.RecipeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The dashboard's `?category=` filter against the real database, now that tags are flat: a
 * recipe is found by any tag it wears, ignoring case, and `categories` lists every one of them.
 * (Recipes filed inside nested groups before tags wear their old parents as tags of their own —
 * see TagMigrationDatabaseTest.) Rolled back after each test.
 */
@SpringBootTest
@Transactional
class IntegrationCategoryFilterDatabaseTest {

    @Autowired IntegrationService integrationService;
    @Autowired RecipeService recipeService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;

    private UUID userId;
    private UUID householdId;

    @BeforeEach
    void household() {
        User user = userRepository.save(User.builder()
                .username("filter-it-" + UUID.randomUUID()).displayName("Filter").build());
        userId = user.getId();
        householdId = householdService.create(userId, new CreateHouseholdRequest("Filter IT")).id();
    }

    @Test
    void aCategoryFindsEveryRecipeWearingThatTag() {
        UUID brisket = recipe("Brisket", RecipeSection.DINNER, "Main dish", "Smoked");
        recipe("Chili", RecipeSection.DINNER, "Main dish");
        recipe("Pasta", RecipeSection.DINNER, "Main dish");
        recipe("Salad", RecipeSection.DINNER, "Side");

        assertThat(names("Main dish")).containsExactly("Brisket", "Chili", "Pasta");
        assertThat(names("main DISH ")).containsExactly("Brisket", "Chili", "Pasta");
        assertThat(names("Smoked")).containsExactly("Brisket");
        assertThat(names("Side")).containsExactly("Salad");
        assertThat(names("Nothing like it")).isEmpty();

        // Every tag it wears, by name.
        RecipeSummary found = integrationService.recipes(householdId, null, null, "Smoked").get(0);
        assertThat(found.id()).isEqualTo(brisket);
        assertThat(found.categories()).containsExactly("Main dish", "Smoked");
    }

    @Test
    void aTagPutOnFromADrawerIsFoundStraightAway() {
        UUID chili = recipe("Chili", RecipeSection.DINNER);
        UUID beef = recipeService.listCategories(householdId, userId).stream()
                .filter(c -> c.name().equals("Beef") && c.section() == RecipeSection.DINNER)
                .findFirst().orElseThrow().id();

        recipeService.tagRecipes(householdId, beef, userId, new TagRecipesRequest(List.of(chili), null));

        assertThat(names("Beef")).containsExactly("Chili");
    }

    @Test
    void theFilterStillNarrowsByDrawer() {
        recipe("Brisket", RecipeSection.DINNER, "Main dish");
        recipe("Club sandwich", RecipeSection.LUNCH, "Main dish");

        // Each drawer has its own Main dish; by name, both are found.
        assertThat(names("Main dish")).containsExactly("Brisket", "Club sandwich");
        assertThat(integrationService.recipes(householdId, null, RecipeSection.DINNER, "Main dish"))
                .extracting(RecipeSummary::name).containsExactly("Brisket");
        assertThat(integrationService.recipes(householdId, null, RecipeSection.LUNCH, "Main dish"))
                .extracting(RecipeSummary::name).containsExactly("Club sandwich");
        assertThat(integrationService.recipes(householdId, null, RecipeSection.SNACKS, "Main dish")).isEmpty();
    }

    private List<String> names(String category) {
        return integrationService.recipes(householdId, null, null, category).stream()
                .map(RecipeSummary::name).toList();
    }

    private UUID recipe(String name, RecipeSection section, String... tags) {
        return recipeService.create(householdId, userId, new RecipeRequest(name, null, null, null, null, 4,
                null, null, null, section, List.of(tags), null, null,
                List.of(new RecipeIngredientRequest("salt", BigDecimal.ONE, null, null, false)))).id();
    }
}
