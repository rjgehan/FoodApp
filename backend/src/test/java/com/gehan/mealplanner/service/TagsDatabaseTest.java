package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.RecipeCategory;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RecipeDtos.CreateCategoryRequest;
import com.gehan.mealplanner.dto.RecipeDtos.FilingRequest;
import com.gehan.mealplanner.dto.RecipeDtos.MoveRecipesRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeCategoryResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.TagRecipesRequest;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateCategoryRequest;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.RecipeCategoryRepository;
import com.gehan.mealplanner.repository.UserRepository;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tags against the real database: flat, one drawer each, unique by name within that drawer only;
 * made with or without recipes, put on and taken off a whole selection at once, and found by name
 * in the recipe's own drawer when a recipe is filed. Plus the bodies a phone from before tags
 * still sends. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class TagsDatabaseTest {

    @Autowired RecipeService recipeService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @Autowired HouseholdRepository householdRepository;
    @Autowired RecipeCategoryRepository categoryRepository;
    @Autowired JsonMapper jsonMapper;

    private UUID userId;
    private UUID householdId;

    @BeforeEach
    void household() {
        User user = userRepository.save(User.builder()
                .username("tags-it-" + UUID.randomUUID()).displayName("Tags").build());
        userId = user.getId();
        householdId = householdService.create(userId, new CreateHouseholdRequest("Tags IT")).id();
    }

    @Test
    void aNewHouseholdStartsWithFlatTagsInEveryDrawer() {
        List<RecipeCategoryResponse> all = recipeService.listCategories(householdId, userId);

        assertThat(all).allSatisfy(tag -> {
            assertThat(tag.parentId()).isNull();
            assertThat(tag.section()).isNotNull();
            assertThat(tag.recipeCount()).isZero();
        });
        // Dinner's meats used to sit inside its Main; now they are tags beside it.
        assertThat(namesIn(all, RecipeSection.DINNER)).containsExactlyInAnyOrder(
                "Main", "Beef", "Chicken", "Pork", "Seafood", "Full meal", "Side", "Veggie");
        assertThat(namesIn(all, RecipeSection.BREAKFAST)).containsExactlyInAnyOrder("Main", "Morning drinks", "Fruit");
        assertThat(namesIn(all, RecipeSection.OTHER)).containsExactlyInAnyOrder("Sauces & dips", "Baking");
        // Each drawer's Main is its own row.
        assertThat(idOf("Main", RecipeSection.BREAKFAST)).isNotEqualTo(idOf("Main", RecipeSection.DINNER));
    }

    @Test
    void aTagGoesInTheDrawerItIsMadeIn() {
        assertThatThrownBy(() -> recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Anywhere", null, null, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(400);
                    assertThat(e.getReason()).isEqualTo("Pick a drawer for this tag.");
                });

        RecipeCategoryResponse picnic = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Picnic", null, RecipeSection.LUNCH, "sandwich"));
        assertThat(picnic).extracting(RecipeCategoryResponse::name, RecipeCategoryResponse::section,
                        RecipeCategoryResponse::iconKey, RecipeCategoryResponse::recipeCount,
                        RecipeCategoryResponse::parentId)
                .containsExactly("Picnic", RecipeSection.LUNCH, "sandwich", 0, null);

        // A phone from before tags "splits" Lunch's Main by naming only the group it came out of:
        // the new tag goes in that drawer, beside Main rather than inside it.
        RecipeCategoryResponse split = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Soups", idOf("Main", RecipeSection.LUNCH), null, null));
        assertThat(split.section()).isEqualTo(RecipeSection.LUNCH);
        assertThat(split.parentId()).isNull();

        // A drawer it names wins over the group it names.
        RecipeCategoryResponse both = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Stews", idOf("Main", RecipeSection.LUNCH), RecipeSection.DINNER, null));
        assertThat(both.section()).isEqualTo(RecipeSection.DINNER);
    }

    @Test
    void aNameIsTakenOnlyWithinItsOwnDrawer() {
        assertThatThrownBy(() -> recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("  chicken ", null, RecipeSection.DINNER, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(409);
                    assertThat(e.getReason()).isEqualTo("There's already a tag called Chicken in Dinner.");
                });
        assertThatThrownBy(() -> recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("   ", null, RecipeSection.DINNER, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getReason()).isEqualTo("A tag needs a name."));

        // Lunch has no Chicken, so it can have one of its own.
        RecipeCategoryResponse lunchChicken = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Chicken", null, RecipeSection.LUNCH, null));
        assertThat(lunchChicken.section()).isEqualTo(RecipeSection.LUNCH);

        // Renamed to a name Lunch already has: refused, saying which drawer.
        assertThatThrownBy(() -> recipeService.updateCategory(householdId, lunchChicken.id(), userId,
                new UpdateCategoryRequest("main", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(409);
                    assertThat(e.getReason()).isEqualTo("There's already a tag called Main in Lunch.");
                });
        // A name only another drawer has is fine, and so is changing the case of its own.
        assertThat(recipeService.updateCategory(householdId, lunchChicken.id(), userId,
                new UpdateCategoryRequest("Beef", null)).name()).isEqualTo("Beef");
        assertThat(recipeService.updateCategory(householdId, lunchChicken.id(), userId,
                new UpdateCategoryRequest("BEEF", null)).name()).isEqualTo("BEEF");
        // Renaming one drawer's tag never renames another's.
        assertThat(idOf("Beef", RecipeSection.DINNER)).isNotEqualTo(lunchChicken.id());
    }

    @Test
    void aNewNameTooLongToSaveIsRefusedButAnOldOneStands() {
        String tooLong = "x".repeat(RecipeCategory.MAX_NAME + 1);
        UUID soup = recipe("Soup", RecipeSection.LUNCH);
        // Made, renamed to, typed into a recipe or filed under: a sentence saying so, not a 500
        // from the column.
        for (ThrowingCallable call : List.<ThrowingCallable>of(
                () -> recipeService.createCategory(householdId, userId,
                        new CreateCategoryRequest(tooLong, null, RecipeSection.DINNER, null)),
                () -> recipeService.updateCategory(householdId, idOf("Main", RecipeSection.DINNER), userId,
                        new UpdateCategoryRequest(tooLong, null)),
                () -> recipe("Toast", RecipeSection.BREAKFAST, tooLong),
                () -> recipeService.file(householdId, soup, userId,
                        new FilingRequest(RecipeSection.LUNCH, List.of("z".repeat(300)))))) {
            assertThatThrownBy(call).isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                assertThat(e.getStatusCode().value()).isEqualTo(400);
                assertThat(e.getReason()).isEqualTo("Keep a tag's name to 100 characters.");
            });
        }
        assertThat(recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("y".repeat(RecipeCategory.MAX_NAME), null, RecipeSection.DINNER, null))
                .name()).hasSize(RecipeCategory.MAX_NAME);

        // A group from before the limit keeps its name: recipes filed under it still save, and so
        // does a new icon sent with the name it already has.
        String old = "Grandma's " + "very ".repeat(30) + "best";
        categoryRepository.save(RecipeCategory.builder()
                .household(householdRepository.findById(householdId).orElseThrow())
                .name(old).section(RecipeSection.DINNER).build());
        UUID pie = recipe("Pie", RecipeSection.DINNER, old);
        assertThat(tagsOf(pie)).containsExactly(old);
        assertThat(recipeService.updateCategory(householdId, idOf(old, RecipeSection.DINNER), userId,
                new UpdateCategoryRequest(old, "drumstick")).iconKey()).isEqualTo("drumstick");
    }

    @Test
    void makingATagCanTagRecipesInTheSameGo() {
        UUID tacos = recipe("Tacos", RecipeSection.DINNER);
        UUID fajitas = recipe("Fajitas", RecipeSection.DINNER);
        UUID wrap = recipe("Wrap", RecipeSection.LUNCH);
        UUID elsewhere = recipeIn(otherHousehold(), "Their tacos", RecipeSection.DINNER);

        RecipeCategoryResponse texMex = recipeService.createCategory(householdId, userId,
                new CreateCategoryRequest("Tex-Mex", null, RecipeSection.DINNER, null,
                        List.of(tacos, fajitas, wrap, elsewhere, UUID.randomUUID())));

        // Only this household's recipes in Dinner: the Lunch one and the stranger's are skipped.
        assertThat(texMex.recipeCount()).isEqualTo(2);
        assertThat(tagsOf(tacos)).containsExactly("Tex-Mex");
        assertThat(tagsOf(fajitas)).containsExactly("Tex-Mex");
        assertThat(tagsOf(wrap)).isEmpty();
    }

    @Test
    void aSelectionIsTaggedAndUntaggedInOneRequest() {
        UUID chicken = idOf("Chicken", RecipeSection.DINNER);
        UUID curry = recipe("Curry", RecipeSection.DINNER, "Quick");
        UUID roast = recipe("Roast", RecipeSection.DINNER);
        UUID pie = recipe("Pie", RecipeSection.DINNER);
        UUID salad = recipe("Salad", RecipeSection.LUNCH);

        RecipeCategoryResponse tagged = recipeService.tagRecipes(householdId, chicken, userId,
                new TagRecipesRequest(List.of(curry, roast, salad), null));
        assertThat(tagged.recipeCount()).isEqualTo(2);
        assertThat(tagsOf(curry)).containsExactly("Chicken", "Quick");
        assertThat(tagsOf(salad)).isEmpty();

        RecipeCategoryResponse changed = recipeService.tagRecipes(householdId, chicken, userId,
                new TagRecipesRequest(List.of(pie), List.of(curry, UUID.randomUUID())));
        assertThat(changed.recipeCount()).isEqualTo(2);
        assertThat(tagsOf(curry)).containsExactly("Quick");
        assertThat(tagsOf(roast)).containsExactly("Chicken");
        assertThat(tagsOf(pie)).containsExactly("Chicken");

        // Nothing either way is nothing, not an error.
        assertThat(recipeService.tagRecipes(householdId, chicken, userId, new TagRecipesRequest(null, null))
                .recipeCount()).isEqualTo(2);

        // Counted for every tag at once.
        List<RecipeCategoryResponse> all = recipeService.listCategories(householdId, userId);
        assertThat(countOf(all, "Chicken", RecipeSection.DINNER)).isEqualTo(2);
        assertThat(countOf(all, "Quick", RecipeSection.DINNER)).isEqualTo(1);
        assertThat(countOf(all, "Main", RecipeSection.DINNER)).isZero();

        // Another household's tag is not there to change.
        UUID theirs = recipeService.listCategories(otherHousehold(), userId).get(0).id();
        assertThatThrownBy(() -> recipeService.tagRecipes(householdId, theirs, userId,
                new TagRecipesRequest(List.of(roast), null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(404);
                    assertThat(e.getReason()).isEqualTo("Tag not found");
                });
    }

    @Test
    void anOldPhoneMovingRecipesIntoAGroupOnlyAddsTheTag() {
        UUID stirFry = recipe("Stir fry", RecipeSection.DINNER, "Main");

        recipeService.moveRecipes(householdId, idOf("Chicken", RecipeSection.DINNER), userId,
                new MoveRecipesRequest(List.of(stirFry)));

        // Main stays: the group an old phone "moved" it out of is not read any more.
        assertThat(tagsOf(stirFry)).containsExactly("Chicken", "Main");
    }

    @Test
    void deletingATagLeavesItsRecipesWhereTheyAre() {
        UUID stirFry = recipe("Stir fry", RecipeSection.DINNER, "Chicken", "Quick");

        recipeService.deleteCategory(householdId, idOf("Chicken", RecipeSection.DINNER), userId);

        assertThat(recipeService.get(stirFry, householdId, userId).section()).isEqualTo(RecipeSection.DINNER);
        assertThat(tagsOf(stirFry)).containsExactly("Quick");
        assertThat(namesIn(recipeService.listCategories(householdId, userId), RecipeSection.DINNER))
                .doesNotContain("Chicken");
    }

    @Test
    void aRecipeFindsItsTagsByNameInItsOwnDrawerOnly() {
        UUID sandwich = recipe("Club sandwich", RecipeSection.LUNCH, "main", "Picnic");
        List<RecipeCategoryResponse> all = recipeService.listCategories(householdId, userId);
        // Lunch's own Main, whatever the case typed, and a new Picnic made in Lunch.
        assertThat(countOf(all, "Main", RecipeSection.LUNCH)).isEqualTo(1);
        assertThat(countOf(all, "Main", RecipeSection.DINNER)).isZero();
        assertThat(countOf(all, "Picnic", RecipeSection.LUNCH)).isEqualTo(1);
        assertThat(namesIn(all, RecipeSection.DINNER)).doesNotContain("Picnic");

        // Moved to Dinner with the same names: found again in Dinner — Main there, and a Picnic
        // made there — while Lunch's Picnic stays, with nothing in it.
        recipeService.file(householdId, sandwich, userId,
                new FilingRequest(RecipeSection.DINNER, List.of("Main", "Picnic")));
        all = recipeService.listCategories(householdId, userId);
        assertThat(countOf(all, "Main", RecipeSection.DINNER)).isEqualTo(1);
        assertThat(countOf(all, "Picnic", RecipeSection.DINNER)).isEqualTo(1);
        assertThat(countOf(all, "Main", RecipeSection.LUNCH)).isZero();
        assertThat(countOf(all, "Picnic", RecipeSection.LUNCH)).isZero();
        assertThat(tagsOf(sandwich)).containsExactly("Main", "Picnic");
    }

    @Test
    void whatAPhoneFromBeforeTagsSendsStillReads() throws Exception {
        UUID group = UUID.randomUUID();
        // Moving a group inside another, or out to the top: not read, rather than refused.
        UpdateCategoryRequest edit = jsonMapper.readValue("""
                {"name": "Chicken", "parentId": "%s", "toTop": true, "iconKey": "drumstick"}
                """.formatted(group), UpdateCategoryRequest.class);
        assertThat(edit).isEqualTo(new UpdateCategoryRequest("Chicken", "drumstick"));

        MoveRecipesRequest split = jsonMapper.readValue("""
                {"recipeIds": ["%s"], "fromCategoryId": "%s"}
                """.formatted(group, group), MoveRecipesRequest.class);
        assertThat(split.recipeIds()).containsExactly(group);

        CreateCategoryRequest made = jsonMapper.readValue("""
                {"name": "Chicken", "parentId": "%s"}
                """.formatted(group), CreateCategoryRequest.class);
        assertThat(made).isEqualTo(new CreateCategoryRequest("Chicken", group, null, null));
    }

    private UUID idOf(String name, RecipeSection section) {
        return recipeService.listCategories(householdId, userId).stream()
                .filter(c -> c.name().equals(name) && c.section() == section)
                .findFirst().orElseThrow().id();
    }

    private static List<String> namesIn(List<RecipeCategoryResponse> all, RecipeSection section) {
        return all.stream().filter(c -> c.section() == section).map(RecipeCategoryResponse::name).toList();
    }

    private static int countOf(List<RecipeCategoryResponse> all, String name, RecipeSection section) {
        return all.stream().filter(c -> c.name().equals(name) && c.section() == section)
                .findFirst().orElseThrow().recipeCount();
    }

    private List<String> tagsOf(UUID recipeId) {
        return recipeService.get(recipeId, householdId, userId).categories();
    }

    private UUID otherHousehold() {
        return householdService.create(userId, new CreateHouseholdRequest("Somebody else's")).id();
    }

    private UUID recipe(String name, RecipeSection section, String... tags) {
        return recipeIn(householdId, name, section, tags);
    }

    private UUID recipeIn(UUID household, String name, RecipeSection section, String... tags) {
        return recipeService.create(household, userId, new RecipeRequest(name, null, null, null, null, 4,
                null, null, null, section, List.of(tags), null, null,
                List.of(new RecipeIngredientRequest("salt", BigDecimal.ONE, null, null, false)))).id();
    }
}
