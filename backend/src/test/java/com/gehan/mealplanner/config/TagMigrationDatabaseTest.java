package com.gehan.mealplanner.config;

import com.gehan.mealplanner.config.TagMigration.Outcome;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeCategoryResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.integration.IntegrationDtos.RecipeSummary;
import com.gehan.mealplanner.integration.IntegrationService;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.service.HouseholdService;
import com.gehan.mealplanner.service.RecipeService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Turning groups into tags against the real database, from the shapes older databases really
 * hold — built with raw SQL, since the app can no longer make any of them: groups nested three
 * deep, two groups inside each other, a drawer-less group worn in three drawers, a drawer-less
 * group whose name its drawer already has, recipes wearing another drawer's group. Each test
 * first loosens the table back to how it was (no drawer needed, a parent_id column), inside the
 * test's own transaction, so all of it rolls back afterwards.
 */
@SpringBootTest
@Transactional
class TagMigrationDatabaseTest {

    @Autowired HouseholdService householdService;
    @Autowired RecipeService recipeService;
    @Autowired IntegrationService integrationService;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager entityManager;

    private UUID userId;
    private UUID householdId;
    private Instant clock = Instant.parse("2026-01-01T00:00:00Z");

    @BeforeEach
    void household() {
        User user = userRepository.save(User.builder()
                .username("tag-move-it-" + UUID.randomUUID()).displayName("Tags").build());
        userId = user.getId();
        householdId = householdService.create(userId, new CreateHouseholdRequest("Tag move IT")).id();
        entityManager.flush();
        jdbc.execute("ALTER TABLE recipe_categories ALTER COLUMN section DROP NOT NULL");
    }

    @Test
    void everyOldShapeEndsUpAsFlatTagsInTheirRecipesOwnDrawer() {
        jdbc.execute("ALTER TABLE recipe_categories ADD COLUMN IF NOT EXISTS parent_id uuid");
        // A household from before tags made its own: none of the seeded ones.
        jdbc.update("DELETE FROM recipe_categories WHERE household_id = ?", householdId);
        jdbc.execute("DROP TABLE IF EXISTS recipe_categories_before_tags, recipe_filing_categories_before_tags");

        UUID dinnerMain = group("Main", RecipeSection.DINNER, null, null);
        UUID lunchMain = group("Main", RecipeSection.LUNCH, null, null);
        UUID lunchQuick = group("QUICK", RecipeSection.LUNCH, null, null);
        UUID lunchSandwiches = group("Sandwiches", RecipeSection.LUNCH, null, null);
        // Three deep.
        UUID mainDish = group("Main dish", RecipeSection.DINNER, null, null);
        UUID beef = group("Beef", RecipeSection.DINNER, mainDish, null);
        UUID brisketCuts = group("Brisket cuts", RecipeSection.DINNER, beef, null);
        // Each inside the other, which old data can hold.
        UUID loopA = group("Loop A", RecipeSection.DINNER, null, null);
        UUID loopB = group("Loop B", RecipeSection.DINNER, loopA, null);
        jdbc.update("UPDATE recipe_categories SET parent_id = ? WHERE id = ?", loopB, loopA);
        // Drawer-less: worn in three drawers; named like Dinner's Main; a tie; nobody's; and
        // one whose only recipe is inside a Dinner group nested in it.
        UUID quick = group("Quick", null, null, null);
        UUID drawerlessMain = group(" main", null, null, "pot");
        UUID leftovers = group("Leftovers", null, null, null);
        UUID grandmas = group("Grandma's", null, null, null);
        UUID favourites = group("Family favourites", null, null, null);
        UUID pastaBakes = group("Pasta bakes", RecipeSection.DINNER, favourites, null);

        UUID brisket = recipe("Brisket", RecipeSection.DINNER);
        UUID loopy = recipe("Loopy", RecipeSection.DINNER);
        UUID tacos = recipe("Tacos", RecipeSection.DINNER);
        UUID stirFry = recipe("Stir fry", RecipeSection.DINNER);
        UUID wrap = recipe("Wrap", RecipeSection.LUNCH);
        UUID porridge = recipe("Porridge", RecipeSection.BREAKFAST);
        UUID roast = recipe("Roast", RecipeSection.DINNER);
        UUID stew = recipe("Stew", RecipeSection.DINNER);
        UUID soup = recipe("Soup", RecipeSection.LUNCH);
        UUID hash = recipe("Hash", RecipeSection.DINNER);
        UUID blt = recipe("BLT", RecipeSection.DINNER);
        UUID pie = recipe("Pie", RecipeSection.DINNER);
        UUID bake = recipe("Bake", RecipeSection.DINNER);
        entityManager.flush();

        link(brisket, brisketCuts);
        link(loopy, loopA);
        link(tacos, quick);
        link(stirFry, quick);
        link(wrap, quick);
        link(porridge, quick);
        link(roast, drawerlessMain);
        link(stew, drawerlessMain);
        link(stew, dinnerMain);
        link(soup, leftovers);
        link(hash, leftovers);
        link(blt, lunchSandwiches);
        link(pie, lunchMain);
        link(bake, pastaBakes);
        int filings = filingCount();

        Outcome outcome = TagMigration.migrate(jdbc);

        // Brisket gains Beef and Main dish, Loopy gains Loop B, Bake gains Family favourites.
        // Quick, Leftovers, Grandma's and Family favourites get a drawer; " main" folds into
        // Dinner's Main. The Wrap and the Pie move onto their own drawer's tag of that name; the
        // Porridge, the Hash and the BLT have none in their drawer and lose it.
        assertThat(outcome).isEqualTo(new Outcome(4, 4, 1, 2, 3));

        assertThat(tagsOf(brisket)).containsExactly("Beef (DINNER)", "Brisket cuts (DINNER)", "Main dish (DINNER)");
        assertThat(tagsOf(loopy)).containsExactly("Loop A (DINNER)", "Loop B (DINNER)");
        assertThat(tagsOf(bake)).containsExactly("Family favourites (DINNER)", "Pasta bakes (DINNER)");

        // The group worn in three drawers belongs to Dinner, where most of it was. Lunch already
        // had one (spelt QUICK), so the Wrap wears that; Breakfast had none.
        assertThat(sectionOf(quick)).isEqualTo("DINNER");
        assertThat(tagsOf(tacos)).containsExactly("Quick (DINNER)");
        assertThat(tagsOf(stirFry)).containsExactly("Quick (DINNER)");
        assertThat(tagsOf(wrap)).containsExactly("QUICK (LUNCH)");
        assertThat(tagsOf(porridge)).isEmpty();

        // " main" folded into Dinner's Main, bringing its icon, and the Stew wears Main once.
        assertThat(exists(drawerlessMain)).isFalse();
        assertThat(tagsOf(roast)).containsExactly("Main (DINNER)");
        assertThat(tagsOf(stew)).containsExactly("Main (DINNER)");
        assertThat(jdbc.queryForObject("SELECT icon_key FROM recipe_categories WHERE id = ?", String.class, dinnerMain))
                .isEqualTo("pot");

        // One Lunch recipe and one Dinner: a tie goes to the earlier drawer.
        assertThat(sectionOf(leftovers)).isEqualTo("LUNCH");
        assertThat(tagsOf(soup)).containsExactly("Leftovers (LUNCH)");
        assertThat(tagsOf(hash)).isEmpty();
        assertThat(sectionOf(grandmas)).isEqualTo("OTHER");
        assertThat(sectionOf(favourites)).isEqualTo("DINNER");

        // Another drawer's group: Dinner has a Main, but no Sandwiches.
        assertThat(tagsOf(pie)).containsExactly("Main (DINNER)");
        assertThat(tagsOf(blt)).isEmpty();
        assertThat(exists(lunchMain)).isTrue();
        assertThat(exists(lunchQuick)).isTrue();

        // Nothing nested, nothing drawer-less, nothing crossing a drawer — and every recipe still
        // on the shelf, since only the links ever change.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM recipe_categories WHERE parent_id IS NOT NULL OR section IS NULL",
                Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM recipe_filing_categories l
                JOIN recipe_filings f ON f.id = l.filing_id
                JOIN recipe_categories c ON c.id = l.category_id
                WHERE c.section <> f.section OR c.household_id <> f.household_id
                """, Integer.class)).isZero();
        assertThat(filingCount()).isEqualTo(filings);

        // The tables as they were are kept, parents and all.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM recipe_categories_before_tags WHERE household_id = ?",
                Integer.class, householdId)).isEqualTo(15);
        assertThat(jdbc.queryForObject("SELECT parent_id FROM recipe_categories_before_tags WHERE id = ?",
                UUID.class, beef)).isEqualTo(mainDish);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM recipe_filing_categories_before_tags l
                JOIN recipe_filings f ON f.id = l.filing_id WHERE f.household_id = ?
                """, Integer.class, householdId)).isEqualTo(14);

        // Now a drawer is required, and a second start finds nothing to do.
        assertThat(TagMigration.requireDrawer(jdbc)).isTrue();
        assertThat(jdbc.queryForObject("""
                SELECT is_nullable FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'recipe_categories' AND column_name = 'section'
                """, String.class)).isEqualTo("NO");
        assertThat(TagMigration.migrate(jdbc)).isNull();
        assertThat(TagMigration.requireDrawer(jdbc)).isFalse();

        // What the apps and a dashboard see: flat tags, counted, and Main dish still finding the
        // recipe that was filed three levels below it.
        entityManager.clear();
        List<RecipeCategoryResponse> tags = recipeService.listCategories(householdId, userId);
        assertThat(tags).allSatisfy(tag -> assertThat(tag.parentId()).isNull());
        assertThat(tags.stream().filter(t -> t.id().equals(dinnerMain)).findFirst().orElseThrow().recipeCount())
                .isEqualTo(3);
        assertThat(recipeService.get(brisket, householdId, userId).categories())
                .containsExactly("Beef", "Brisket cuts", "Main dish");
        assertThat(integrationService.recipes(householdId, null, null, "main dish"))
                .extracting(RecipeSummary::name).containsExactly("Brisket");
    }

    /** A database Hibernate made after groups stopped nesting has no parent_id column at all. */
    @Test
    void aDatabaseThatNeverHadNestingIsMovedToo() {
        jdbc.execute("ALTER TABLE recipe_categories DROP COLUMN IF EXISTS parent_id");
        UUID dinnerChicken = seeded("Chicken", RecipeSection.DINNER);
        UUID lunchSandwiches = seeded("Sandwiches", RecipeSection.LUNCH);
        UUID chicken = group("chicken", null, null, null);
        UUID curry = recipe("Curry", RecipeSection.DINNER);
        UUID club = recipe("Club", RecipeSection.DINNER);
        entityManager.flush();
        link(curry, chicken);
        link(club, lunchSandwiches);

        assertThat(TagMigration.migrate(jdbc)).isEqualTo(new Outcome(0, 0, 1, 0, 1));

        assertThat(exists(chicken)).isFalse();
        assertThat(tagsOf(curry)).containsExactly("Chicken (DINNER)");
        assertThat(tagsOf(club)).isEmpty();
        // Dinner's Chicken already had its drawing; the folded one had none to give.
        assertThat(jdbc.queryForObject("SELECT icon_key FROM recipe_categories WHERE id = ?", String.class,
                dinnerChicken)).isEqualTo("drumstick");
    }

    /** Without the index nothing would catch a merge gone wrong, so it leaves everything be. */
    @Test
    void itWillNotStartWithoutTheIndexThatKeepsNamesUnique() {
        jdbc.execute("DROP INDEX " + RecipeService.TAG_NAME_INDEX);
        UUID loose = group("Loose", null, null, null);

        assertThat(TagMigration.migrate(jdbc)).isNull();

        assertThat(sectionOf(loose)).isNull();
        assertThat(TagMigration.requireDrawer(jdbc)).isFalse();
    }

    @Test
    void aDatabaseAlreadyInTagsIsLeftAlone() {
        UUID curry = recipe("Curry", RecipeSection.DINNER, "Chicken", "Quick");
        entityManager.flush();

        assertThat(TagMigration.migrate(jdbc)).isNull();
        assertThat(tagsOf(curry)).containsExactly("Chicken (DINNER)", "Quick (DINNER)");
    }

    /** A group as an older database holds it, a second after the one before. */
    private UUID group(String name, RecipeSection section, UUID parent, String icon) {
        UUID id = UUID.randomUUID();
        clock = clock.plusSeconds(1);
        if (parent == null) {
            jdbc.update("""
                    INSERT INTO recipe_categories (id, household_id, name, section, icon_key, created_at, default_icon_offered_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, id, householdId, name, section == null ? null : section.name(), icon,
                    Timestamp.from(clock), Timestamp.from(clock));
        } else {
            jdbc.update("""
                    INSERT INTO recipe_categories (id, household_id, name, section, parent_id, icon_key, created_at,
                                                   default_icon_offered_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, id, householdId, name, section == null ? null : section.name(), parent, icon,
                    Timestamp.from(clock), Timestamp.from(clock));
        }
        return id;
    }

    private UUID seeded(String name, RecipeSection section) {
        return jdbc.queryForObject("SELECT id FROM recipe_categories WHERE household_id = ? AND section = ? AND name = ?",
                UUID.class, householdId, section.name(), name);
    }

    private void link(UUID recipeId, UUID groupId) {
        jdbc.update("""
                INSERT INTO recipe_filing_categories (filing_id, category_id)
                SELECT id, ? FROM recipe_filings WHERE household_id = ? AND recipe_id = ?
                """, groupId, householdId, recipeId);
    }

    /** "Name (DRAWER)" for each tag the recipe wears here, by name. */
    private List<String> tagsOf(UUID recipeId) {
        return jdbc.queryForList("""
                SELECT c.name || ' (' || c.section || ')' FROM recipe_filing_categories l
                JOIN recipe_filings f ON f.id = l.filing_id
                JOIN recipe_categories c ON c.id = l.category_id
                WHERE f.household_id = ? AND f.recipe_id = ?
                ORDER BY lower(c.name)
                """, String.class, householdId, recipeId);
    }

    private String sectionOf(UUID groupId) {
        return jdbc.queryForObject("SELECT section FROM recipe_categories WHERE id = ?", String.class, groupId);
    }

    private boolean exists(UUID groupId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM recipe_categories WHERE id = ?)", Boolean.class, groupId));
    }

    private int filingCount() {
        return jdbc.queryForObject("SELECT count(*) FROM recipe_filings WHERE household_id = ?",
                Integer.class, householdId);
    }

    private UUID recipe(String name, RecipeSection section, String... tags) {
        return recipeService.create(householdId, userId, new RecipeRequest(name, null, null, null, null, 4,
                null, null, null, section, List.of(tags), null, null,
                List.of(new RecipeIngredientRequest("salt", BigDecimal.ONE, null, null, false)))).id();
    }
}
