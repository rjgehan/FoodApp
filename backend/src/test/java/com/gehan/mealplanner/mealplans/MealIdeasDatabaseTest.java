package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.GroceryListDtos.AddRecipeRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.UpdateKitchenRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.mealplans.MealIdeasDtos.MealIdeasRequest;
import com.gehan.mealplanner.mealplans.MealIdeasDtos.MealIdeasResponse;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.service.GroceryListService;
import com.gehan.mealplanner.service.HouseholdService;
import com.gehan.mealplanner.service.RecipeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Suggestions that respect the kitchen, against the real database: Meal ideas, and the pool every
 * generated meal plan chooses from. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class MealIdeasDatabaseTest {

    @Autowired MealIdeas mealIdeas;
    @Autowired RecipePool pool;
    @Autowired RecipeService recipeService;
    @Autowired HouseholdService householdService;
    @Autowired GroceryListService groceryListService;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbc;

    private UUID me;
    private UUID home;

    @BeforeEach
    void household() {
        me = user("ideas-it-");
        home = householdService.create(me, new CreateHouseholdRequest("Ideas IT")).id();
        // Whatever else this database has published is out of Explore until the test rolls back,
        // so the ideas are only the ones each test makes.
        jdbc.update("UPDATE recipes SET published = false WHERE published");
    }

    @Test
    void ideasAreOnlyWhatTheKitchenCanMake() {
        kitchen("oven", "stovetop");
        UUID roast = recipe("Roast chicken", RecipeSection.DINNER, "oven");
        UUID chili = recipe("Slow cooker chili", RecipeSection.DINNER, "slow-cooker");
        UUID wings = recipe("Wings, oven or air fryer", RecipeSection.DINNER, "oven", "air-fryer");
        UUID pasta = recipe("Pan pasta", RecipeSection.DINNER, "stovetop");
        UUID salad = recipe("Salad", RecipeSection.DINNER);

        MealIdeasResponse ideas = ideas(MealType.DINNER, 10, List.of());

        assertThat(ids(ideas)).containsExactlyInAnyOrder(roast, wings, pasta, salad).doesNotContain(chili);
        assertThat(ideas.canMake()).isEqualTo(4);
        assertThat(ideas.leftOut()).isEqualTo(1);
        assertThat(ideas.meal()).isEqualTo(MealType.DINNER);
    }

    @Test
    void eitherOfTwoMachinesThatDoTheSameJobWillDo() {
        kitchen("air-fryer", "pressure-cooker", "food-processor");
        UUID wings = recipe("Wings", RecipeSection.DINNER, "oven", "air-fryer");
        UUID stew = recipe("Stew", RecipeSection.DINNER, "slow-cooker", "pressure-cooker");
        UUID pesto = recipe("Pesto pasta", RecipeSection.DINNER, "blender", "food-processor");
        UUID cake = recipe("Oven pie", RecipeSection.DINNER, "oven");

        assertThat(ids(ideas(MealType.DINNER, 10, List.of()))).containsExactlyInAnyOrder(wings, stew, pesto)
                .doesNotContain(cake);
    }

    @Test
    void theStovetopNeverStandsInTheWay() {
        kitchen("microwave");
        UUID pasta = recipe("Pan pasta", RecipeSection.DINNER, "stovetop");

        assertThat(ids(ideas(MealType.DINNER, 10, List.of()))).containsExactly(pasta);
    }

    @Test
    void aKitchenNobodyHasDescribedLeavesNothingOut() {
        UUID chili = recipe("Slow cooker chili", RecipeSection.DINNER, "slow-cooker");

        MealIdeasResponse ideas = ideas(MealType.DINNER, 10, List.of());
        assertThat(ids(ideas)).containsExactly(chili);
        assertThat(ideas.leftOut()).isZero();
    }

    @Test
    void theDrawerHasToSuitTheMeal() {
        UUID dinner = recipe("Curry", RecipeSection.DINNER);
        UUID lunch = recipe("Soup", RecipeSection.LUNCH);
        UUID breakfast = recipe("Porridge", RecipeSection.BREAKFAST);
        recipe("Brownies", RecipeSection.SNACKS);
        recipe("Lemonade", RecipeSection.DRINKS);
        recipe("Gravy", RecipeSection.OTHER);

        assertThat(ids(ideas(MealType.DINNER, 10, List.of()))).containsExactlyInAnyOrder(dinner, lunch);
        assertThat(ids(ideas(MealType.LUNCH, 10, List.of()))).containsExactlyInAnyOrder(lunch, dinner);
        assertThat(ids(ideas(MealType.BREAKFAST, 10, List.of()))).containsExactly(breakfast);
        // Dinner when nothing says.
        assertThat(mealIdeas.ideas(home, me, new MealIdeasRequest(null, null, null)).meal()).isEqualTo(MealType.DINNER);
    }

    @Test
    void nothingAlreadyOnScreenOrWaitingOnTheListIsSuggested() {
        UUID curry = recipe("Curry", RecipeSection.DINNER);
        UUID soup = recipe("Soup", RecipeSection.DINNER);
        UUID stew = recipe("Stew", RecipeSection.DINNER);
        groceryListService.addRecipeToList(home, stew, me, new AddRecipeRequest(null, null, null));

        MealIdeasResponse ideas = ideas(MealType.DINNER, 10, List.of(curry));
        assertThat(ids(ideas)).containsExactly(soup);
        // Still counted among what the kitchen can make.
        assertThat(ideas.canMake()).isEqualTo(3);
        // Once nothing is left, nothing comes back, and nothing is said to be missing.
        assertThat(ids(ideas(MealType.DINNER, 10, List.of(curry, soup)))).isEmpty();
    }

    @Test
    void theHouseholdsOwnComeFirstThenWhatOthersHavePublishedAndNoMoreThanAskedFor() {
        UUID mine1 = recipe("Curry", RecipeSection.DINNER);
        UUID mine2 = recipe("Soup", RecipeSection.DINNER);
        UUID them = user("ideas-other-");
        UUID elsewhere = householdService.create(them, new CreateHouseholdRequest("Elsewhere")).id();
        UUID theirs = recipeService.create(elsewhere, them, request("Their lasagne", RecipeSection.DINNER, null)).id();
        recipeService.setPublished(theirs, them, true);
        UUID unpublished = recipeService.create(elsewhere, them, request("Their secret", RecipeSection.DINNER, null)).id();

        MealIdeasResponse all = ideas(MealType.DINNER, 10, List.of());
        assertThat(ids(all)).hasSize(3).doesNotContain(unpublished);
        assertThat(ids(all).subList(0, 2)).containsExactlyInAnyOrder(mine1, mine2);
        assertThat(ids(all).get(2)).isEqualTo(theirs);
        // As this household sees it: somebody else's, not filed here.
        RecipeResponse published = all.ideas().get(2);
        assertThat(published.shared()).isTrue();
        assertThat(published.section()).isNull();

        assertThat(ids(ideas(MealType.DINNER, 1, List.of()))).hasSize(1).isSubsetOf(mine1, mine2);
    }

    @Test
    void onlyAMemberGetsIdeas() {
        UUID stranger = user("ideas-stranger-");
        assertThatThrownBy(() -> mealIdeas.ideas(home, stranger, new MealIdeasRequest(null, null, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
    }

    @Test
    void generatedPlansChooseOnlyWhatTheKitchenCanMakeButSavedOnesKeepTheirMeals() {
        kitchen("oven", "stovetop");
        UUID roast = recipe("Roast chicken", RecipeSection.DINNER, "oven");
        UUID chili = recipe("Slow cooker chili", RecipeSection.DINNER, "slow-cooker");

        assertThat(pool.forHousehold(home, false)).extracting(RecipePool.PoolRecipe::id).containsExactly(roast);
        assertThat(pool.everything(home, false)).extracting(RecipePool.PoolRecipe::id)
                .containsExactlyInAnyOrder(roast, chili);
        // A plan saved before the slow cooker went still reads back with its chili.
        assertThat(pool.forIds(home, List.of(roast, chili))).containsOnlyKeys(roast, chili);

        kitchen("oven", "stovetop", "slow-cooker");
        assertThat(pool.forHousehold(home, false)).extracting(RecipePool.PoolRecipe::id)
                .containsExactlyInAnyOrder(roast, chili);
    }

    private MealIdeasResponse ideas(MealType meal, int count, List<UUID> exclude) {
        return mealIdeas.ideas(home, me, new MealIdeasRequest(meal, count, exclude));
    }

    private static List<UUID> ids(MealIdeasResponse ideas) {
        return ideas.ideas().stream().map(RecipeResponse::id).toList();
    }

    private void kitchen(String... machines) {
        householdService.updateKitchen(home, me, new UpdateKitchenRequest(null, null, List.of(machines), null));
    }

    private UUID user(String prefix) {
        return userRepository.save(User.builder().username(prefix + UUID.randomUUID()).displayName("Ideas").build()).getId();
    }

    /** A recipe with exactly these machines, picked by hand, and a method that names none. */
    private UUID recipe(String name, RecipeSection section, String... machines) {
        return recipeService.create(home, me, request(name, section, List.of(machines))).id();
    }

    private static RecipeRequest request(String name, RecipeSection section, List<String> machines) {
        return new RecipeRequest(name, null, "Put it together and serve.", null, null, 4, null, null, null, section,
                List.of(), null, null, List.of(new RecipeIngredientRequest("rice", BigDecimal.ONE, "cup", null, false)),
                null, machines);
    }
}
