package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.CupboardDtos.AddCupboardItemRequest;
import com.gehan.mealplanner.dto.CupboardDtos.CupboardItemResponse;
import com.gehan.mealplanner.dto.CupboardDtos.UpdateCupboardItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.AddItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;
import com.gehan.mealplanner.dto.GroceryListDtos.PutAwayRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.MealPlanDtos.AddMealPlanEntryRequest;
import com.gehan.mealplanner.dto.MealPlanDtos.UpdateMealPlanEntryRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;

/**
 * The grocery list against the real database: pressing "Add this week" again only brings the
 * list up to what the plan needs now, the same thing typed twice is one row, and buying
 * something the cupboard counts adds to the count. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class GroceryListDatabaseTest {

    private static final LocalDate MONDAY = LocalDate.of(2031, 3, 3);
    private static final LocalDate SUNDAY = MONDAY.plusDays(6);

    @Autowired GroceryListService groceryListService;
    @Autowired CupboardService cupboardService;
    @Autowired MealPlanService mealPlanService;
    @Autowired RecipeService recipeService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;

    private User me;
    private UUID home;
    private String tag;

    @BeforeEach
    void household() {
        tag = UUID.randomUUID().toString().substring(0, 8);
        me = userRepository.save(User.builder().username("groceries-" + tag).displayName("Me").build());
        home = householdService.create(me.getId(), new CreateHouseholdRequest("Groceries")).id();
    }

    // --- Adding the week ---

    @Test
    void addingTheSameWeekTwiceAddsNothingTheSecondTime() {
        RecipeResponse chili = recipe("Chili", 4, need("beans", "2", "can"), need("onion", "1", null));
        plan(chili, MONDAY, 4);

        addWeek();
        addWeek();

        assertThat(amountOf("beans")).isEqualByComparingTo("2");
        assertThat(amountOf("onion")).isEqualByComparingTo("1");
        assertThat(list()).hasSize(2);
    }

    @Test
    void moreServingsAddOnlyTheExtraAndFewerTakeItBackOff() {
        RecipeResponse chili = recipe("Chili", 4, need("beans", "2", "can"));
        UUID entry = plan(chili, MONDAY, 4);
        addWeek();

        servings(entry, 8);
        addWeek();
        assertThat(amountOf("beans")).isEqualByComparingTo("4");

        servings(entry, 2);
        addWeek();
        assertThat(amountOf("beans")).isEqualByComparingTo("1");
        assertThat(list()).hasSize(1);
    }

    @Test
    void twoMealsSharingARowEachCountTheirOwnShare() {
        RecipeResponse tacos = recipe("Tacos", 4, need("steak", "2", "lb"));
        RecipeResponse frites = recipe("Frites", 2, need("steak", "1", "lb"));
        plan(tacos, MONDAY, 4);
        UUID second = plan(frites, MONDAY.plusDays(1), 4);

        addWeek();
        assertThat(amountOf("steak")).isEqualByComparingTo("4");

        servings(second, 2);
        addWeek();
        addWeek();
        assertThat(amountOf("steak")).isEqualByComparingTo("3");
    }

    @Test
    void whatWasTypedByHandStaysWhenAMealChanges() {
        add("steak", "1", "lb");
        RecipeResponse tacos = recipe("Tacos", 4, need("steak", "2", "lb"));
        UUID entry = plan(tacos, MONDAY, 4);

        addWeek();
        assertThat(amountOf("steak")).isEqualByComparingTo("3");

        servings(entry, 2);
        addWeek();
        assertThat(amountOf("steak")).isEqualByComparingTo("2");
    }

    @Test
    void aMealWhoseThingsAreInTheCartIsNotAddedAgainButMoreServingsAre() {
        RecipeResponse chili = recipe("Chili", 4, need("beans", "2", "can"));
        UUID entry = plan(chili, MONDAY, 4);
        addWeek();
        GroceryListItemResponse beans = find("beans");
        groceryListService.setChecked(home, beans.id(), me.getId(), true);

        addWeek();
        assertThat(list()).hasSize(1);

        servings(entry, 6);
        addWeek();
        assertThat(list()).extracting(GroceryListItemResponse::checked, i -> i.quantity().stripTrailingZeros())
                .containsExactlyInAnyOrder(
                        tuple(true, new BigDecimal("2")),
                        tuple(false, new BigDecimal("1")));
    }

    @Test
    void anOptionalIngredientDroppedFromTheMealComesBackOff() {
        RecipeResponse steak = recipe("Steak", 4, need("ribeye", "1", "lb"), optional("parsley", "1", "bunch"));
        UUID parsley = steak.ingredients().stream()
                .filter(i -> i.ingredientName().equals("parsley-" + tag)).findFirst().orElseThrow().id();
        UUID entry = mealPlanService.add(home, me.getId(), new AddMealPlanEntryRequest(MONDAY, MealType.DINNER,
                steak.id(), null, null, null, 4, null, List.of(parsley))).id();
        addWeek();
        assertThat(find("parsley")).isNotNull();

        mealPlanService.update(entry, me.getId(),
                new UpdateMealPlanEntryRequest(null, null, null, null, null, null, null, List.of()));
        addWeek();

        assertThat(find("parsley")).isNull();
        assertThat(amountOf("ribeye")).isEqualByComparingTo("1");
    }

    @Test
    void anotherRecipeInTheSlotSwapsItsThingsButLeavesWhatIsInTheCart() {
        RecipeResponse chili = recipe("Chili", 4, need("beans", "2", "can"), need("cumin", "0", "tsp"),
                need("onion", "1", null));
        RecipeResponse soup = recipe("Soup", 4, need("leek", "3", null), need("onion", "2", null));
        UUID entry = plan(chili, MONDAY, 4);
        addWeek();
        groceryListService.setChecked(home, find("beans").id(), me.getId(), true);

        mealPlanService.update(entry, me.getId(),
                new UpdateMealPlanEntryRequest(soup.id(), null, null, null, null, null, null, null));
        addWeek();

        assertThat(find("cumin")).isNull();
        assertThat(find("beans").checked()).isTrue();
        assertThat(amountOf("leek")).isEqualByComparingTo("3");
        assertThat(amountOf("onion")).isEqualByComparingTo("2");
    }

    @Test
    void fewerServingsAfterSomeIsInTheCartLeavesNoEmptyRowToBuy() {
        RecipeResponse chili = recipe("Chili", 4, need("beans", "2", "can"));
        UUID entry = plan(chili, MONDAY, 4);
        addWeek();
        groceryListService.setChecked(home, find("beans").id(), me.getId(), true);

        servings(entry, 8);
        addWeek();
        assertThat(list()).extracting(GroceryListItemResponse::checked, i -> i.quantity().stripTrailingZeros())
                .containsExactlyInAnyOrder(tuple(true, new BigDecimal("2")), tuple(false, new BigDecimal("2")));

        // Back to 4: the 2 cans in the cart are all it needs, so the row of 2 goes — it does
        // not stay behind as "0 can" to buy.
        servings(entry, 4);
        addWeek();
        assertThat(list()).extracting(GroceryListItemResponse::checked).containsExactly(true);

        // And up again to 8 asks for the 2 extra once more, not 4.
        servings(entry, 8);
        addWeek();
        assertThat(list()).extracting(GroceryListItemResponse::checked, i -> i.quantity().stripTrailingZeros())
                .containsExactlyInAnyOrder(tuple(true, new BigDecimal("2")), tuple(false, new BigDecimal("2")));
    }

    @Test
    void theWeekAddedAgainAfterShoppingBringsOnlyTheNewMeal() {
        RecipeResponse chili = recipe("Chili", 4, need("beans", "2", "can"), need("onion", "1", null));
        RecipeResponse pasta = recipe("Pasta", 4, need("penne", "1", "box"));
        plan(chili, MONDAY, 4);
        addWeek();
        List<UUID> bought = list().stream().map(GroceryListItemResponse::id).toList();
        bought.forEach(id -> groceryListService.setChecked(home, id, me.getId(), true));
        groceryListService.putAway(home, me.getId(), new PutAwayRequest(bought, List.of()));

        plan(pasta, MONDAY.plusDays(2), 4);
        addWeek();

        assertThat(list()).extracting(GroceryListItemResponse::name).containsExactly("penne-" + tag);
    }

    @Test
    void somethingSwipedOffStaysOffTheWeekButOneMealAskedForBringsItBack() {
        RecipeResponse tacos = recipe("Tacos", 4, need("beef", "1", "lb"), need("cilantro", "1", "bunch"));
        UUID entry = plan(tacos, MONDAY, 4);
        addWeek();
        groceryListService.removeItem(home, find("cilantro").id());

        addWeek();
        assertThat(find("cilantro")).isNull();
        assertThat(amountOf("beef")).isEqualByComparingTo("1");

        groceryListService.addMealToList(home, entry, me.getId());
        assertThat(amountOf("cilantro")).isEqualByComparingTo("1");
        assertThat(amountOf("beef")).isEqualByComparingTo("1");
    }

    @Test
    void eatingOutInsteadTakesTheRecipesThingsOff() {
        RecipeResponse chili = recipe("Chili", 4, need("beans", "2", "can"), need("onion", "1", null));
        UUID entry = plan(chili, MONDAY, 4);
        addWeek();
        groceryListService.setChecked(home, find("onion").id(), me.getId(), true);

        mealPlanService.update(entry, me.getId(),
                new UpdateMealPlanEntryRequest(null, null, "eggs-" + tag, null, null, null, null, null));
        addWeek();

        assertThat(find("beans")).isNull();
        assertThat(find("onion").checked()).isTrue();
        assertThat(find("eggs")).isNull();
    }

    @Test
    void addingOneMealTwiceIsTheSameAsOnce() {
        RecipeResponse chili = recipe("Chili", 4, need("beans", "2", "can"));
        UUID entry = plan(chili, MONDAY, 4);

        groceryListService.addMealToList(home, entry, me.getId());
        groceryListService.addMealToList(home, entry, me.getId());
        addWeek();

        assertThat(amountOf("beans")).isEqualByComparingTo("2");
    }

    // --- No amount ---

    @Test
    void anIngredientWithNoAmountIsSavedWithNone() {
        RecipeResponse eggs = recipe("Seasoned eggs", 2, some("salt and pepper"), need("eggs", "4", null));

        assertThat(eggs.ingredients()).extracting(i -> i.quantity() == null ? null : i.quantity().stripTrailingZeros())
                .containsExactly(null, new BigDecimal("4"));
    }

    @Test
    void noAmountGoesOnAsSomeWhateverTheServingsAndComesOffWithTheMeal() {
        RecipeResponse eggs = recipe("Seasoned eggs", 2, some("salt and pepper"), need("eggs", "4", null));
        UUID entry = plan(eggs, MONDAY, 8);

        addWeek();
        assertThat(amountOf("salt and pepper")).isNull();
        assertThat(amountOf("eggs")).isEqualByComparingTo("16");

        addWeek();
        servings(entry, 2);
        addWeek();
        assertThat(amountOf("salt and pepper")).isNull();
        assertThat(amountOf("eggs")).isEqualByComparingTo("4");
        assertThat(list()).hasSize(2);

        mealPlanService.update(entry, me.getId(),
                new UpdateMealPlanEntryRequest(null, null, "toast-" + tag, null, null, null, null, null));
        addWeek();
        assertThat(find("salt and pepper")).isNull();
    }

    @Test
    void noAmountFromAMealLeavesTheAmountTypedByHand() {
        add("pepper", "2", null);
        RecipeResponse soup = recipe("Soup", 4, some("pepper"));
        plan(soup, MONDAY, 8);

        addWeek();

        assertThat(list()).hasSize(1);
        assertThat(amountOf("pepper")).isEqualByComparingTo("2");
    }

    @Test
    void noAmountFromAMealLeavesWhatWasTypedByHandWhenItGoes() {
        add("salt", "1", null);
        RecipeResponse eggs = recipe("Seasoned eggs", 2, some("salt"));
        UUID entry = plan(eggs, MONDAY, 2);
        addWeek();
        assertThat(amountOf("salt")).isEqualByComparingTo("1");

        mealPlanService.update(entry, me.getId(),
                new UpdateMealPlanEntryRequest(null, null, "toast-" + tag, null, null, null, null, null));
        addWeek();
        assertThat(amountOf("salt")).isEqualByComparingTo("1");
    }

    @Test
    void someTypedByHandStaysWhenAMealWithSomeJoinsItAndGoes() {
        add("salt", null, null);
        RecipeResponse eggs = recipe("Seasoned eggs", 2, some("salt"));
        UUID entry = plan(eggs, MONDAY, 2);
        addWeek();
        assertThat(list()).hasSize(1);

        mealPlanService.update(entry, me.getId(),
                new UpdateMealPlanEntryRequest(null, null, "toast-" + tag, null, null, null, null, null));
        addWeek();

        assertThat(find("salt")).isNotNull();
        assertThat(amountOf("salt")).isNull();
    }

    @Test
    void someTypedByHandAfterAMealWithSomeStaysWhenTheMealGoes() {
        RecipeResponse eggs = recipe("Seasoned eggs", 2, some("salt"));
        UUID entry = plan(eggs, MONDAY, 2);
        addWeek();
        add("salt", null, null);
        assertThat(list()).hasSize(1);

        mealPlanService.update(entry, me.getId(),
                new UpdateMealPlanEntryRequest(null, null, "toast-" + tag, null, null, null, null, null));
        addWeek();

        assertThat(find("salt")).isNotNull();
        assertThat(amountOf("salt")).isNull();
    }

    @Test
    void someTypedByHandAfterAMealWithAnAmountIsSomeWhenTheMealGoes() {
        RecipeResponse soup = recipe("Soup", 2, need("salt", "2", null));
        UUID entry = plan(soup, MONDAY, 2);
        addWeek();
        add("salt", null, null);

        mealPlanService.update(entry, me.getId(),
                new UpdateMealPlanEntryRequest(null, null, "toast-" + tag, null, null, null, null, null));
        addWeek();

        assertThat(find("salt")).isNotNull();
        assertThat(amountOf("salt")).isNull();
    }

    @Test
    void theAmountGoingWithItsMealLeavesSomeNotZero() {
        RecipeResponse eggs = recipe("Seasoned eggs", 2, some("salt"));
        RecipeResponse soup = recipe("Soup", 2, need("salt", "2", null));
        UUID eggsEntry = plan(eggs, MONDAY, 2);
        UUID soupEntry = plan(soup, MONDAY.plusDays(1), 2);
        addWeek();
        assertThat(amountOf("salt")).isEqualByComparingTo("2");

        mealPlanService.update(soupEntry, me.getId(),
                new UpdateMealPlanEntryRequest(null, null, "toast-" + tag, null, null, null, null, null));
        addWeek();
        assertThat(find("salt")).isNotNull();
        assertThat(amountOf("salt")).isNull();

        mealPlanService.update(eggsEntry, me.getId(),
                new UpdateMealPlanEntryRequest(null, null, "toast-" + tag, null, null, null, null, null));
        addWeek();
        assertThat(find("salt")).isNull();
    }

    // --- Typing things in ---

    @Test
    void theSameThingTypedTwiceInAnyCaseIsOneRow() {
        add("milk", null, null);
        add("Milk", null, null);

        assertThat(list()).hasSize(1);
    }

    @Test
    void amountsInTheSameUnitAddUpWhateverTheSpelling() {
        add("flour", "2", "cups");
        add("Flour", "1", "cup");

        assertThat(list()).hasSize(1);
        assertThat(amountOf("flour")).isEqualByComparingTo("3");
    }

    @Test
    void anAmountFillsInARowThatHadNoneAndNoAmountAddsNothing() {
        add("milk", null, null);
        add("milk", "2", "l");
        add("milk", null, null);

        assertThat(list()).hasSize(1);
        assertThat(amountOf("milk")).isEqualByComparingTo("2");
        assertThat(find("milk").unit()).isEqualTo("l");
    }

    @Test
    void amountsThatDoNotAddUpStayTwoRows() {
        add("milk", "2", "l");
        add("milk", "1", "gallon");

        assertThat(list()).hasSize(2);
    }

    @Test
    void somethingAlreadyInTheCartIsNotAddedTo() {
        GroceryListItemResponse first = add("milk", null, null);
        groceryListService.setChecked(home, first.id(), me.getId(), true);
        add("milk", null, null);

        assertThat(list()).hasSize(2);
    }

    // --- Done shopping ---

    @Test
    void buyingSomethingCountedAddsToTheCountInTheSameUnit() {
        CupboardItemResponse chicken = counted("chicken", "1", "lb");
        GroceryListItemResponse bought = add("chicken", "2", "lbs");
        groceryListService.setChecked(home, bought.id(), me.getId(), true);

        groceryListService.putAway(home, me.getId(), new PutAwayRequest(List.of(bought.id()), List.of()));

        assertThat(cupboardItem(chicken.id()).quantity()).isEqualByComparingTo("3");
    }

    @Test
    void buyingSomethingCountedInAnotherUnitLeavesTheCountAlone() {
        CupboardItemResponse beans = counted("beans", "2", "can");
        GroceryListItemResponse bought = add("beans", "500", "g");
        GroceryListItemResponse some = add("beans", null, null);
        assertThat(some.id()).isEqualTo(bought.id());

        groceryListService.putAway(home, me.getId(), new PutAwayRequest(List.of(bought.id()), List.of()));

        assertThat(cupboardItem(beans.id()).quantity()).isEqualByComparingTo("2");
    }

    // --- Helpers ---

    private RecipeIngredientRequest need(String name, String quantity, String unit) {
        return new RecipeIngredientRequest(name + "-" + tag, new BigDecimal(quantity), unit, null, false);
    }

    private RecipeIngredientRequest some(String name) {
        return new RecipeIngredientRequest(name + "-" + tag, null, null, null, false);
    }

    private RecipeIngredientRequest optional(String name, String quantity, String unit) {
        return new RecipeIngredientRequest(name + "-" + tag, new BigDecimal(quantity), unit, null, true);
    }

    private RecipeResponse recipe(String name, int servings, RecipeIngredientRequest... ingredients) {
        return recipeService.create(home, me.getId(), new RecipeRequest(name, null, null, null, null, servings,
                null, null, null, null, null, null, null, List.of(ingredients)));
    }

    private UUID plan(RecipeResponse recipe, LocalDate date, int servings) {
        return mealPlanService.add(home, me.getId(), new AddMealPlanEntryRequest(date, MealType.DINNER,
                recipe.id(), null, null, null, servings, null, null)).id();
    }

    private void servings(UUID entry, int servings) {
        mealPlanService.update(entry, me.getId(),
                new UpdateMealPlanEntryRequest(null, null, null, null, null, servings, null, null));
    }

    private void addWeek() {
        groceryListService.addAllPlannedToList(home, me.getId(), MONDAY, SUNDAY);
    }

    private GroceryListItemResponse add(String name, String quantity, String unit) {
        return groceryListService.addManualItem(home, me.getId(), new AddItemRequest(name + "-" + tag,
                quantity == null ? null : new BigDecimal(quantity), unit));
    }

    private CupboardItemResponse counted(String name, String quantity, String unit) {
        CupboardItemResponse item = cupboardService.add(home, me.getId(), new AddCupboardItemRequest(name + "-" + tag, null));
        return cupboardService.update(home, item.id(), me.getId(),
                new UpdateCupboardItemRequest(null, null, null, true, new BigDecimal(quantity), unit));
    }

    private CupboardItemResponse cupboardItem(UUID id) {
        return cupboardService.list(home, me.getId()).stream().filter(c -> c.id().equals(id)).findFirst().orElseThrow();
    }

    private List<GroceryListItemResponse> list() {
        return groceryListService.listItems(home, me.getId());
    }

    private GroceryListItemResponse find(String name) {
        return list().stream().filter(i -> i.name().equalsIgnoreCase(name + "-" + tag)).findFirst().orElse(null);
    }

    private BigDecimal amountOf(String name) {
        List<GroceryListItemResponse> rows = list().stream()
                .filter(i -> i.name().equalsIgnoreCase(name + "-" + tag)).toList();
        assertThat(rows).as("rows of " + name).hasSize(1);
        return rows.get(0).quantity();
    }
}
