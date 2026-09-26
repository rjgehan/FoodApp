package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.GroceryCategory;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.CupboardDtos.AddCupboardItemRequest;
import com.gehan.mealplanner.dto.CupboardDtos.AddStartersResponse;
import com.gehan.mealplanner.dto.CupboardDtos.CopyCupboardResponse;
import com.gehan.mealplanner.dto.CupboardDtos.CupboardItemResponse;
import com.gehan.mealplanner.dto.CupboardDtos.StarterGroup;
import com.gehan.mealplanner.dto.CupboardDtos.StarterItem;
import com.gehan.mealplanner.dto.CupboardDtos.UpdateCupboardItemRequest;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Filling a new cupboard against the real database: from the starter list, and from another of
 * your own houses. Neither touches what is in the cupboard already, and the copy only goes
 * between houses you are in. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class CupboardSetupDatabaseTest {

    @Autowired CupboardService cupboardService;
    @Autowired HouseholdService householdService;
    @Autowired IngredientSections ingredientSections;
    @Autowired IngredientService ingredientService;
    @Autowired HouseholdRepository householdRepository;
    @Autowired UserRepository userRepository;

    private UUID me;
    private UUID stranger;
    private UUID home;
    private UUID cabin;
    private UUID strangers;

    @BeforeEach
    void houses() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        me = userRepository.save(User.builder().username("cupboard-me-" + tag).displayName("Me").build()).getId();
        stranger = userRepository.save(User.builder().username("cupboard-them-" + tag).displayName("Them").build()).getId();
        home = householdService.create(me, new CreateHouseholdRequest("Home")).id();
        cabin = householdService.create(me, new CreateHouseholdRequest("Cabin")).id();
        strangers = householdService.create(stranger, new CreateHouseholdRequest("Theirs")).id();
    }

    @Test
    void theStarterListMarksWhatIsHereAndAddsTheRestInTheirAisles() {
        CupboardItemResponse rice = add(cabin, "rice");
        cupboardService.update(cabin, rice.id(), me, new UpdateCupboardItemRequest(true, null, null, null, null, null));

        assertThat(starter(cabin, "rice").have()).isTrue();
        assertThat(starter(cabin, "salt").have()).isFalse();
        assertThat(cupboardService.starters(cabin, me)).extracting(StarterGroup::name)
                .startsWith("Baking", "Spices");

        AddStartersResponse result = cupboardService.addStarters(cabin, me,
                List.of("salt", " Salt", "rice", "black pepper", "  "));
        assertThat(result.added()).isEqualTo(2);
        assertThat(result.skipped()).isEqualTo(2);

        List<CupboardItemResponse> after = cupboardService.list(cabin, me);
        assertThat(after).extracting(i -> i.name().toLowerCase()).containsExactlyInAnyOrder("rice", "salt", "black pepper");
        // Ticking it again did not say the rice is fine now.
        assertThat(item(after, "rice").runningLow()).isTrue();
        assertThat(item(after, "salt").categoryId()).isEqualTo(category(cabin, "Spices").getId());
        assertThat(starter(cabin, "salt").have()).isTrue();
    }

    @Test
    void theStarterListIsOnlyForTheHouse() {
        assertThatThrownBy(() -> cupboardService.starters(strangers, me)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> cupboardService.addStarters(strangers, me, List.of("salt")))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
    }

    @Test
    void aCopyBringsWhatIsMissingWithItsAmountsAndAislesAndLeavesTheRestAlone() {
        CupboardItemResponse rice = add(home, "rice");
        cupboardService.update(home, rice.id(), me,
                new UpdateCupboardItemRequest(null, null, null, true, new BigDecimal("3"), "kg"));
        add(home, "olive oil", true);
        CupboardItemResponse butter = add(home, "butter");
        cupboardService.update(home, butter.id(), me, new UpdateCupboardItemRequest(true, null, null, null, null, null));
        // Home keeps tortillas with the dry goods, and tofu in an aisle the cabin has no such thing as.
        add(home, "tortillas");
        ingredientSections.move(householdRepository.findById(home).orElseThrow(),
                ingredientService.findOrCreate("tortillas", null), category(home, "Dry goods"));
        add(home, "tofu");
        GroceryCategory asian = category(home, "Produce");
        asian.setName("Asian aisle");
        ingredientSections.move(householdRepository.findById(home).orElseThrow(),
                ingredientService.findOrCreate("tofu", null), asian);

        // The cabin already has rice, and has it its own way.
        add(cabin, "rice");

        CopyCupboardResponse result = cupboardService.copyFrom(cabin, home, me);
        assertThat(result.copied()).isEqualTo(4);
        assertThat(result.skipped()).isEqualTo(1);

        List<CupboardItemResponse> cabinItems = cupboardService.list(cabin, me);
        assertThat(cabinItems).extracting(i -> i.name().toLowerCase())
                .containsExactlyInAnyOrder("rice", "olive oil", "butter", "tortillas", "tofu");
        assertThat(item(cabinItems, "rice").quantity()).isNull();
        assertThat(item(cabinItems, "olive oil").staple()).isTrue();
        assertThat(item(cabinItems, "butter").runningLow()).isTrue();
        assertThat(item(cabinItems, "tortillas").categoryId()).isEqualTo(category(cabin, "Dry goods").getId());
        // No "Asian aisle" here: it goes where the cabin would put tofu anyway.
        assertThat(item(cabinItems, "tofu").categoryId()).isEqualTo(category(cabin, "Produce").getId());

        // Home is untouched, and a second copy has nothing left to bring.
        assertThat(cupboardService.list(home, me)).hasSize(5);
        assertThat(cupboardService.copyFrom(cabin, home, me)).isEqualTo(new CopyCupboardResponse(0, 5));

        CupboardItemResponse counted = item(cupboardService.list(home, me), "rice");
        assertThat(counted.quantity()).isEqualByComparingTo("3");
        assertThat(counted.unit()).isEqualTo("kg");
    }

    @Test
    void aCopyOnlyGoesBetweenHousesYouAreIn() {
        add(strangers, stranger, "saffron");
        assertThatThrownBy(() -> cupboardService.copyFrom(cabin, strangers, me))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        assertThatThrownBy(() -> cupboardService.copyFrom(strangers, cabin, me))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        assertThatThrownBy(() -> cupboardService.copyFrom(cabin, cabin, me))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(400));
        assertThat(cupboardService.list(cabin, me)).isEmpty();
    }

    private CupboardItemResponse add(UUID household, String name) {
        return add(household, me, name);
    }

    private CupboardItemResponse add(UUID household, String name, boolean staple) {
        return cupboardService.add(household, me, new AddCupboardItemRequest(name, staple));
    }

    private CupboardItemResponse add(UUID household, UUID who, String name) {
        return cupboardService.add(household, who, new AddCupboardItemRequest(name, null));
    }

    private StarterItem starter(UUID household, String name) {
        return cupboardService.starters(household, me).stream()
                .flatMap(g -> g.items().stream())
                .filter(i -> i.name().equals(name))
                .findFirst()
                .orElseThrow();
    }

    private GroceryCategory category(UUID household, String name) {
        return ingredientSections.categories(household).stream()
                .filter(c -> c.getName().equals(name))
                .findFirst()
                .orElseThrow();
    }

    private static CupboardItemResponse item(List<CupboardItemResponse> items, String name) {
        // Case aside: an ingredient keeps the spelling it was first seen with, anywhere.
        return items.stream().filter(i -> i.name().equalsIgnoreCase(name)).findFirst().orElseThrow();
    }
}
