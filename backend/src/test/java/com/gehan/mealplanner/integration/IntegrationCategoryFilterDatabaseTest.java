package com.gehan.mealplanner.integration;

import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RecipeDtos.CreateCategoryRequest;
import com.gehan.mealplanner.dto.RecipeDtos.MoveRecipesRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeCategoryResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
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
 * The dashboard's `?category=` filter against the real database, after a household has split a
 * group up: asking for the group it used to be still finds everything that was in it, however
 * deep it has gone, and asking for the new group finds only its own. Rolled back after each test.
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
    void aParentGroupFindsRecipesMovedIntoItsSubGroups() {
        UUID brisket = recipe("Brisket", "Main dish");
        UUID chili = recipe("Chili", "Main dish");
        recipe("Pasta", "Main dish");
        recipe("Salad", "Side");

        UUID main = group("Main dish");
        RecipeCategoryResponse braised = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Braised", main, null, null));
        RecipeCategoryResponse smoked = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Smoked", braised.id(), null, null));
        recipeService.moveRecipes(householdId, braised.id(), userId, new MoveRecipesRequest(List.of(chili), main));
        recipeService.moveRecipes(householdId, smoked.id(), userId, new MoveRecipesRequest(List.of(brisket), main));

        assertThat(names("Main dish")).containsExactly("Brisket", "Chili", "Pasta");
        assertThat(names("main DISH")).containsExactly("Brisket", "Chili", "Pasta");
        assertThat(names("Braised")).containsExactly("Brisket", "Chili");
        assertThat(names("Smoked")).containsExactly("Brisket");
        assertThat(names("Side")).containsExactly("Salad");
        assertThat(names("Nothing like it")).isEmpty();

        // What a recipe says it is filed in has not changed: the group it sits in directly.
        RecipeSummary moved = integrationService.recipes(householdId, null, null, "Main dish").stream()
                .filter(s -> s.id().equals(brisket)).findFirst().orElseThrow();
        assertThat(moved.categories()).containsExactly("Smoked");
    }

    @Test
    void theFilterStillNarrowsByDrawer() {
        UUID brisket = recipe("Brisket", "Main dish");
        UUID main = group("Main dish");
        UUID braised = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Braised", main, null, null)).id();
        recipeService.moveRecipes(householdId, braised, userId, new MoveRecipesRequest(List.of(brisket), main));

        assertThat(integrationService.recipes(householdId, null, RecipeSection.DINNER, "Main dish"))
                .extracting(RecipeSummary::name).containsExactly("Brisket");
        assertThat(integrationService.recipes(householdId, null, RecipeSection.LUNCH, "Main dish")).isEmpty();
    }

    private List<String> names(String category) {
        return integrationService.recipes(householdId, null, null, category).stream()
                .map(RecipeSummary::name).toList();
    }

    private UUID group(String name) {
        return recipeService.listCategories(householdId, userId).stream()
                .filter(c -> c.name().equals(name)).findFirst().orElseThrow().id();
    }

    private UUID recipe(String name, String category) {
        return recipeService.create(householdId, userId, new RecipeRequest(name, null, null, null, null, 4,
                null, null, null, RecipeSection.DINNER, List.of(category), null, null,
                List.of(new RecipeIngredientRequest("salt", BigDecimal.ONE, null, null, false)))).id();
    }
}
