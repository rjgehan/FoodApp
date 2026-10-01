package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.CupboardDtos.AddCupboardItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.AddItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.PlannedShoppingResponse;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.MealPlanDtos.AddMealPlanEntryRequest;
import com.gehan.mealplanner.dto.MealPlanDtos.UpdateMealPlanEntryRequest;
import com.gehan.mealplanner.dto.PlaceDtos.PlaceRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The Plan's shopping marks against the real database: a meal reads "Not on list" until the
 * week's button has added it, then "On grocery list" — and asking never changes the list.
 * Rolled back after each test.
 */
@SpringBootTest
@Transactional
class PlanShoppingStatusDatabaseTest {

    private static final LocalDate MONDAY = LocalDate.of(2031, 3, 3);
    private static final LocalDate SUNDAY = MONDAY.plusDays(6);

    @Autowired GroceryListService groceryListService;
    @Autowired CupboardService cupboardService;
    @Autowired MealPlanService mealPlanService;
    @Autowired RecipeService recipeService;
    @Autowired PlaceService placeService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;

    private User me;
    private UUID home;
    private String tag;

    @BeforeEach
    void household() {
        tag = UUID.randomUUID().toString().substring(0, 8);
        me = userRepository.save(User.builder().username("status-" + tag).displayName("Me").build());
        home = householdService.create(me.getId(), new CreateHouseholdRequest("Status")).id();
    }

    @Test
    void aMealIsNotOnTheListUntilTheWeekIsAddedThenItIs() {
        RecipeResponse chili = recipe("Chili", 4, need("beans", "2", "can"), need("onion", "1", null));
        UUID entry = plan(chili, MONDAY, 4);

        PlannedShoppingResponse before = status(entry);
        assertThat(before.status()).isEqualTo("NOT_ON_LIST");
        assertThat(before.toAdd()).hasSize(2);
        assertThat(before.needs()).isEqualTo(2);
        // Only looking: nothing went on the list.
        assertThat(groceryListService.listItems(home, me.getId())).isEmpty();

        groceryListService.addAllPlannedToList(home, me.getId(), MONDAY, SUNDAY);

        PlannedShoppingResponse after = status(entry);
        assertThat(after.status()).isEqualTo("ON_LIST");
        assertThat(after.toAdd()).isEmpty();
    }

    @Test
    void moreServingsAfterAddingMakeItNotOnTheListAgain() {
        RecipeResponse chili = recipe("Chili", 4, need("beans", "2", "can"));
        UUID entry = plan(chili, MONDAY, 4);
        groceryListService.addAllPlannedToList(home, me.getId(), MONDAY, SUNDAY);

        mealPlanService.update(entry, me.getId(), new UpdateMealPlanEntryRequest(null, null, null, null, null, 8, null, null));

        assertThat(status(entry).status()).isEqualTo("NOT_ON_LIST");
        assertThat(status(entry).toAdd()).hasSize(1);
    }

    @Test
    void everythingInTheCupboardSaysSo() {
        RecipeResponse oats = recipe("Oats", 2, need("oats", "1", "cup"), need("milk", "1", "cup"));
        UUID entry = plan(oats, MONDAY, 2);
        cupboardService.add(home, me.getId(), new AddCupboardItemRequest("oats-" + tag, null));
        cupboardService.add(home, me.getId(), new AddCupboardItemRequest("milk-" + tag, null));

        PlannedShoppingResponse shopping = status(entry);
        assertThat(shopping.status()).isEqualTo("IN_CUPBOARD");
        assertThat(shopping.needs()).isEqualTo(2);
        assertThat(shopping.inCupboard()).isEqualTo(2);
    }

    @Test
    void placesNamesAndSingleItems() {
        UUID place = placeService.createOrGet(home, me.getId(), new PlaceRequest("Sushi " + tag, null, null, null, null)).id();
        UUID out = mealPlanService.add(home, me.getId(), new AddMealPlanEntryRequest(MONDAY, MealType.DINNER,
                null, place, null, null, null, null, null)).id();
        RecipeResponse nameOnly = recipe("Pot pie", 4);
        UUID pie = plan(nameOnly, MONDAY.plusDays(1), 4);
        UUID eggs = mealPlanService.add(home, me.getId(), new AddMealPlanEntryRequest(MONDAY, MealType.BREAKFAST,
                null, null, "eggs-" + tag, null, null, null, null)).id();

        assertThat(status(out).status()).isEqualTo("EAT_OUT");
        assertThat(status(pie).status()).isEqualTo("NO_INGREDIENTS");
        assertThat(status(eggs).status()).isEqualTo("NOT_ON_LIST");

        groceryListService.addManualItem(home, me.getId(), new AddItemRequest("eggs-" + tag, null, null));
        assertThat(status(eggs).status()).isEqualTo("ON_LIST");
    }

    @Test
    void moreThanAYearIsRefused() {
        assertThatThrownBy(() -> groceryListService.planStatus(home, me.getId(), MONDAY, MONDAY.plusDays(400)))
                .isInstanceOf(ResponseStatusException.class);
    }

    // --- Helpers ---

    private PlannedShoppingResponse status(UUID entry) {
        List<PlannedShoppingResponse> all = groceryListService.planStatus(home, me.getId(), MONDAY, SUNDAY);
        return all.stream().filter(s -> s.entryId().equals(entry)).findFirst().orElseThrow();
    }

    private RecipeIngredientRequest need(String name, String quantity, String unit) {
        return new RecipeIngredientRequest(name + "-" + tag, new BigDecimal(quantity), unit, null, false);
    }

    private RecipeResponse recipe(String name, int servings, RecipeIngredientRequest... ingredients) {
        return recipeService.create(home, me.getId(), new RecipeRequest(name + " " + tag, null, null, null, null, servings,
                null, null, null, null, null, null, null, List.of(ingredients)));
    }

    private UUID plan(RecipeResponse recipe, LocalDate date, int servings) {
        return mealPlanService.add(home, me.getId(), new AddMealPlanEntryRequest(date, MealType.DINNER,
                recipe.id(), null, null, null, servings, null, null)).id();
    }
}
