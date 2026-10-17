package com.gehan.mealplanner.service;

import com.gehan.mealplanner.config.StartupBackfills;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.integration.IntegrationService;
import com.gehan.mealplanner.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * A recipe's kitchen machines against the real database: read from the method on every save,
 * picked by hand and then left alone, carried into a copy, shown wherever the recipe is, and
 * filled in for old recipes by the backfill. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class RecipeAppliancesDatabaseTest {

    private static final String BAKE = "Mix it all up. Bake for 25 minutes.";
    private static final String AIR_FRY = "Mix it all up. Air fry for 12 minutes.";

    @Autowired RecipeService recipeService;
    @Autowired RecipeLinkService linkService;
    @Autowired IntegrationService integrationService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate tx;
    @Autowired EntityManager entityManager;
    @Autowired JsonMapper jsonMapper;

    private UUID me;
    private UUID home;

    @BeforeEach
    void household() {
        me = userRepository.save(User.builder()
                .username("appliances-it-" + UUID.randomUUID()).displayName("Appliances").build()).getId();
        home = householdService.create(me, new CreateHouseholdRequest("Appliances IT")).id();
    }

    @Test
    void aNewRecipeHasItsMachinesReadFromTheMethod() {
        RecipeResponse made = create("Soup", "Roast the squash. Blend until smooth.", null);

        assertThat(made.appliances()).containsExactly("oven", "blender");
        assertThat(recipeService.get(made.id(), home, me).appliances()).containsExactly("oven", "blender");
        assertThat(recipeService.list(home, me)).filteredOn(r -> r.id().equals(made.id()))
                .singleElement().extracting(RecipeResponse::appliances).isEqualTo(List.of("oven", "blender"));
    }

    @Test
    void machinesPickedForANewRecipeAreAddedToWhatTheMethodSaysAndThenKept() {
        RecipeResponse made = create("Cake", BAKE, List.of("mixer"));
        assertThat(made.appliances()).containsExactly("oven", "mixer");

        // Somebody picked, so an edit that says nothing about machines leaves them be.
        RecipeResponse edited = update(made.id(), "Cake", AIR_FRY, null);
        assertThat(edited.appliances()).containsExactly("oven", "mixer");
    }

    @Test
    void pickingNothingForANewRecipeLeavesItToTheMethod() {
        RecipeResponse made = create("Wings", BAKE, List.of());
        assertThat(made.appliances()).containsExactly("oven");

        assertThat(update(made.id(), "Wings", AIR_FRY, null).appliances()).containsExactly("air-fryer");
    }

    @Test
    void anEditThatSaysNothingAboutMachinesReadsTheMethodAgain() {
        RecipeResponse made = create("Wings", BAKE, null);
        assertThat(made.appliances()).containsExactly("oven");

        assertThat(update(made.id(), "Wings", AIR_FRY, null).appliances()).containsExactly("air-fryer");
        assertThat(update(made.id(), "Wings", "Toss in sauce.", null).appliances()).isEmpty();
    }

    @Test
    void machinesPickedOnAnEditAreExactlyThoseFromThenOn() {
        RecipeResponse made = create("Stew", BAKE, null);

        assertThat(update(made.id(), "Stew", BAKE, List.of("slow-cooker")).appliances()).containsExactly("slow-cooker");
        assertThat(update(made.id(), "Stew", AIR_FRY + " Then bake.", null).appliances()).containsExactly("slow-cooker");
        // Taking them all off is an answer too.
        assertThat(update(made.id(), "Stew", BAKE, List.of()).appliances()).isEmpty();
        assertThat(update(made.id(), "Stew", BAKE, null).appliances()).isEmpty();
    }

    @Test
    void aMachineTheServerHasNeverHeardOfIsRefused() {
        assertThatThrownBy(() -> create("Toast", "Toast it.", List.of("toaster")))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(400);
                    assertThat(e.getReason()).isEqualTo("There's no machine called toaster.");
                });
    }

    @Test
    void aCopySavedFromALinkKeepsTheMachinesHowEverTheyWereFound() {
        RecipeResponse picked = create("Ribs", "Cook them low and slow.", List.of());
        picked = update(picked.id(), "Ribs", "Cook them low and slow.", List.of("grill"));
        RecipeResponse read = create("Bread", "Knead with the dough hook, then bake.", null);
        UUID cabin = householdService.create(me, new CreateHouseholdRequest("Cabin")).id();

        RecipeResponse ribs = recipeService.saveFromLink(linkService.createOrGet(picked.id(), me), cabin, me);
        RecipeResponse bread = recipeService.saveFromLink(linkService.createOrGet(read.id(), me), cabin, me);

        assertThat(ribs.appliances()).containsExactly("grill");
        assertThat(bread.appliances()).containsExactly("oven", "mixer");
        // The hand-picked one stays picked in the copy: its next edit does not re-read it.
        assertThat(update(ribs.id(), "Ribs", BAKE, null).appliances()).containsExactly("grill");
        assertThat(update(bread.id(), "Bread", AIR_FRY, null).appliances()).containsExactly("air-fryer");
    }

    @Test
    void theMachinesGoWhereverTheRecipeGoes() throws Exception {
        RecipeResponse made = create("Pie", "Blitz the pastry in the food processor, then bake.", null);

        assertThat(linkService.view(linkService.createOrGet(made.id(), me)).appliances())
                .containsExactly("oven", "food-processor");
        assertThat(integrationService.recipe(made.id(), home).appliances()).containsExactly("oven", "food-processor");
        assertThat(integrationService.recipes(home, "Pie", null, null)).singleElement()
                .satisfies(s -> assertThat(s.appliances()).containsExactly("oven", "food-processor"));
        assertThat(jsonMapper.writeValueAsString(made)).contains("\"appliances\":[\"oven\",\"food-processor\"]");
    }

    @Test
    void anAppFromBeforeMachinesSendsNoneAndTheyAreStillRead() throws Exception {
        RecipeRequest old = jsonMapper.readValue("""
                {"name":"Chili","instructions":"Cook on low for 8 hours.","servings":4,"section":"DINNER",
                 "categories":[],"ingredients":[{"ingredientName":"beans","quantity":2}]}
                """, RecipeRequest.class);
        assertThat(old.appliances()).isNull();

        assertThat(recipeService.create(home, me, old).appliances()).containsExactly("slow-cooker");
    }

    @Test
    void theBackfillReadsOldRecipesAndLeavesHandPickedOnesAlone() {
        UUID old = create("Gratin", BAKE + " Finish under the grill.", null).id();
        UUID picked = create("Smoothie", "Blend until smooth.", null).id();
        update(picked, "Smoothie", "Blend until smooth.", List.of("mixer"));
        entityManager.flush();
        // As they would be from before machines: never read. The hand-picked one keeps its pick.
        jdbc.update("UPDATE recipes SET appliances_version = NULL WHERE id IN (?, ?)", old, picked);
        jdbc.update("DELETE FROM recipe_appliances WHERE recipe_id = ?", old);
        entityManager.clear();
        assertThat(recipeService.get(old, home, me).appliances()).isEmpty();
        entityManager.clear();

        assertThat(StartupBackfills.detectAppliances(jdbc, tx)).isGreaterThanOrEqualTo(1);

        assertThat(appliancesOf(old)).containsExactly("oven");
        assertThat(versionOf(old)).isEqualTo(ApplianceDetector.VERSION);
        assertThat(appliancesOf(picked)).containsExactly("mixer");
        assertThat(versionOf(picked)).isNull();
        // Once read, a second start finds nothing of these to do.
        StartupBackfills.detectAppliances(jdbc, tx);
        assertThat(appliancesOf(old)).containsExactly("oven");
        assertThat(recipeService.get(old, home, me).appliances()).containsExactly("oven");
    }

    @Test
    void aRecipeLastReadByOlderRulesIsReadAgain() {
        UUID stale = create("Wings", AIR_FRY, null).id();
        entityManager.flush();
        jdbc.update("UPDATE recipes SET appliances_version = ? WHERE id = ?", ApplianceDetector.VERSION - 1, stale);
        jdbc.update("UPDATE recipes SET instructions = ? WHERE id = ?", BAKE, stale);
        entityManager.clear();

        StartupBackfills.detectAppliances(jdbc, tx);

        assertThat(appliancesOf(stale)).containsExactly("oven");
    }

    private List<String> appliancesOf(UUID recipe) {
        return jdbc.queryForList("SELECT appliance FROM recipe_appliances WHERE recipe_id = ? ORDER BY appliance",
                String.class, recipe);
    }

    private Integer versionOf(UUID recipe) {
        return jdbc.queryForObject("SELECT appliances_version FROM recipes WHERE id = ?", Integer.class, recipe);
    }

    private RecipeResponse create(String name, String instructions, List<String> appliances) {
        return recipeService.create(home, me, request(name, instructions, appliances));
    }

    private RecipeResponse update(UUID recipe, String name, String instructions, List<String> appliances) {
        return recipeService.update(recipe, me, request(name, instructions, appliances));
    }

    private static RecipeRequest request(String name, String instructions, List<String> appliances) {
        return new RecipeRequest(name, null, instructions, null, null, 4, null, null, null, RecipeSection.DINNER,
                List.of(), null, null, List.of(new RecipeIngredientRequest("salt", BigDecimal.ONE, null, null, false)),
                null, appliances);
    }
}
