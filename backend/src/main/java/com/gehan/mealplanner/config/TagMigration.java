package com.gehan.mealplanner.config;

import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.service.RecipeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Turns recipe groups into tags, once, on a database from before tags.
 *
 * Groups used to nest (Chicken inside Main) and could have no drawer at all, which made one row
 * show in every drawer: renaming "Main" in Dinner renamed it in Lunch, because it was the same
 * row. Tags are flat and each belongs to exactly one drawer. Getting there:
 *
 * 1. A recipe filed in a nested group is given every group above it as a tag of its own, so
 *    tapping Main still finds every main once nothing sits inside anything.
 * 2. Nothing sits inside anything.
 * 3. Each drawer-less group goes to the one drawer most of its recipes are in (a tie goes to the
 *    earlier drawer, none to Other) — or folds into the tag of the same name already there. Its
 *    recipes in other drawers move onto their own drawer's tag of that name if there is one, and
 *    otherwise lose it: the owner's call, since one group in two drawers is the bug itself.
 * 4. A recipe wearing another drawer's tag — the old "move into group" never checked — gets its
 *    own drawer's tag of that name instead, or loses it.
 *
 * Only the links between recipes and tags change. Filings themselves are never touched: whether
 * one exists is what keeps a shared or Explore recipe on somebody's shelf.
 *
 * All in one transaction with both tables locked (they are tiny), so a phone saving a recipe
 * mid-move waits a moment rather than writing into a half-moved drawer. Before the first change
 * it copies both tables to *_before_tags, once, so a mistake can be put right by hand — see
 * DEPLOY.md. A database already in the new shape costs a couple of small queries per start, and
 * takes no lock.
 *
 * After @Order(0), which builds the index that keeps tag names unique within a drawer and folds
 * case duplicates: a merge here relies on that index being there to catch anything it missed.
 */
@Configuration
public class TagMigration {

    private static final Logger log = LoggerFactory.getLogger(TagMigration.class);

    /** One row per link, with what it takes to find the link a new home. */
    private static final String LINKS = """
            SELECT l.filing_id, l.category_id, f.household_id, f.section, c.name
            FROM recipe_filing_categories l
            JOIN recipe_filings f ON f.id = l.filing_id
            JOIN recipe_categories c ON c.id = l.category_id
            WHERE\s""";

    /** What one run changed, for its line in the log. */
    public record Outcome(int ancestorLinks, int moved, int merged, int relinked, int dropped) {
        @Override
        public String toString() {
            return ancestorLinks + " parent group(s) put on the recipes that were inside them, "
                    + moved + " drawer-less group(s) given a drawer, "
                    + merged + " folded into a same-named tag, "
                    + relinked + " link(s) moved onto their own drawer's tag, "
                    + dropped + " dropped";
        }
    }

    /** Links found a new tag, and links that had nowhere to go. */
    private static final class Tally {
        int relinked;
        int dropped;
    }

    @Bean
    @Order(1)
    public ApplicationRunner flattenRecipeGroupsIntoTags(JdbcTemplate jdbc, TransactionTemplate tx) {
        return args -> {
            try {
                Outcome outcome = tx.execute(status -> migrate(jdbc));
                if (outcome != null) {
                    log.info("Turned recipe groups into tags: {}.", outcome);
                }
            } catch (Exception e) {
                // Most likely somebody held a lock past the timeout. The transaction rolled back,
                // so nothing is half done, and the next start tries again.
                log.warn("Could not turn recipe groups into tags, will try again at the next start: {}",
                        e.getMessage());
            }
            try {
                if (Boolean.TRUE.equals(tx.execute(status -> requireDrawer(jdbc)))) {
                    log.info("Every recipe tag has a drawer, so recipe_categories.section is now NOT NULL.");
                }
            } catch (Exception e) {
                log.warn("Could not make recipe tags need a drawer: {}", e.getMessage());
            }
        };
    }

    /**
     * The whole move, in the caller's transaction — the runner's, or a test's. Returns null when
     * nothing is in the old shape, or when it is not safe to start.
     */
    public static Outcome migrate(JdbcTemplate jdbc) {
        boolean nested = SchemaTouchUps.hasColumn(jdbc, "recipe_categories", "parent_id");
        if (!inOldShape(jdbc, nested)) {
            return null;
        }
        if (!hasNameIndex(jdbc)) {
            log.warn("Not turning recipe groups into tags yet: without the {} index nothing stops a merge "
                    + "leaving two tags of one name in a drawer.", RecipeService.TAG_NAME_INDEX);
            return null;
        }
        // Five seconds at most behind somebody's save; past that it gives up until the next start.
        jdbc.execute("SET LOCAL lock_timeout = '5s'");
        jdbc.execute("LOCK TABLE recipe_categories, recipe_filing_categories IN ACCESS EXCLUSIVE MODE");
        // Looked at again under the lock: another server starting at the same moment may have
        // done it already.
        if (!inOldShape(jdbc, nested)) {
            return null;
        }

        jdbc.execute("CREATE TABLE IF NOT EXISTS recipe_categories_before_tags AS SELECT * FROM recipe_categories");
        jdbc.execute("CREATE TABLE IF NOT EXISTS recipe_filing_categories_before_tags AS"
                + " SELECT * FROM recipe_filing_categories");
        log.info("The recipe groups as they were before tags are kept in recipe_categories_before_tags and "
                + "recipe_filing_categories_before_tags (see DEPLOY.md).");

        int ancestorLinks = 0;
        if (nested) {
            // UNION, not UNION ALL: old data can hold a loop (A inside B inside A), and UNION
            // stops once a pass finds nothing new rather than going round for ever. NOT EXISTS
            // rather than ON CONFLICT, so it does not lean on the join table having a key.
            ancestorLinks = jdbc.update("""
                    WITH RECURSIVE up (filing_id, category_id) AS (
                        SELECT l.filing_id, c.parent_id
                        FROM recipe_filing_categories l
                        JOIN recipe_categories c ON c.id = l.category_id
                        WHERE c.parent_id IS NOT NULL
                      UNION
                        SELECT up.filing_id, c.parent_id
                        FROM up
                        JOIN recipe_categories c ON c.id = up.category_id
                        WHERE c.parent_id IS NOT NULL
                    )
                    INSERT INTO recipe_filing_categories (filing_id, category_id)
                    SELECT up.filing_id, up.category_id FROM up
                    WHERE NOT EXISTS (SELECT 1 FROM recipe_filing_categories l
                                      WHERE l.filing_id = up.filing_id AND l.category_id = up.category_id)
                    """);
            jdbc.update("UPDATE recipe_categories SET parent_id = NULL WHERE parent_id IS NOT NULL");
        }

        Tally tally = new Tally();
        int moved = 0;
        int merged = 0;
        for (Map<String, Object> group : jdbc.queryForList(
                "SELECT id, household_id, name, icon_key FROM recipe_categories WHERE section IS NULL"
                        + " ORDER BY created_at, id")) {
            UUID id = (UUID) group.get("id");
            UUID householdId = (UUID) group.get("household_id");
            String name = (String) group.get("name");
            RecipeSection drawer = busiestDrawer(jdbc, id, householdId);
            UUID keeper = sameNamed(jdbc, householdId, drawer, name);

            // Its recipes in the other drawers first, while the row is still there to point at.
            rehome(jdbc, jdbc.queryForList(LINKS + "l.category_id = ? AND (f.household_id <> ? OR f.section <> ?)",
                    id, householdId, drawer.name()), tally);

            if (keeper == null) {
                jdbc.update("UPDATE recipe_categories SET section = ? WHERE id = ?", drawer.name(), id);
                moved++;
                continue;
            }
            // A recipe wearing both would collide on the join table's key, so its link to this
            // one simply goes; everybody else's moves across.
            jdbc.update("""
                    DELETE FROM recipe_filing_categories l
                    WHERE l.category_id = ?
                      AND EXISTS (SELECT 1 FROM recipe_filing_categories k
                                  WHERE k.filing_id = l.filing_id AND k.category_id = ?)
                    """, id, keeper);
            jdbc.update("UPDATE recipe_filing_categories SET category_id = ? WHERE category_id = ?", keeper, id);
            if (group.get("icon_key") != null) {
                jdbc.update("UPDATE recipe_categories SET icon_key = ? WHERE id = ? AND icon_key IS NULL",
                        group.get("icon_key"), keeper);
            }
            jdbc.update("DELETE FROM recipe_categories WHERE id = ?", id);
            merged++;
        }

        // Every tag has a drawer by now, so this is just the links that cross one.
        rehome(jdbc, jdbc.queryForList(LINKS + "c.section <> f.section OR c.household_id <> f.household_id"), tally);

        return new Outcome(ancestorLinks, moved, merged, tally.relinked, tally.dropped);
    }

    /**
     * Makes a drawer required, once no tag is without one. Its own short transaction after the
     * move has committed, and on every start until it holds — including a database that never
     * had the old shape, whose column Hibernate made before tags needed a drawer, which it never
     * tightens afterwards. Returns whether it changed anything.
     */
    public static boolean requireDrawer(JdbcTemplate jdbc) {
        Boolean due = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_schema = current_schema() AND table_name = 'recipe_categories'
                                 AND column_name = 'section' AND is_nullable = 'YES')
                   AND NOT EXISTS (SELECT 1 FROM recipe_categories WHERE section IS NULL)
                """, Boolean.class);
        if (!Boolean.TRUE.equals(due)) {
            return false;
        }
        jdbc.execute("SET LOCAL lock_timeout = '5s'");
        jdbc.execute("ALTER TABLE recipe_categories ALTER COLUMN section SET NOT NULL");
        return true;
    }

    /** Anything still nested, drawer-less, or worn by a recipe in another drawer (or household). */
    private static boolean inOldShape(JdbcTemplate jdbc, boolean nested) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM recipe_categories WHERE section IS NULL%s)
                    OR EXISTS (SELECT 1 FROM recipe_filing_categories l
                               JOIN recipe_filings f ON f.id = l.filing_id
                               JOIN recipe_categories c ON c.id = l.category_id
                               WHERE c.section IS DISTINCT FROM f.section OR c.household_id <> f.household_id)
                """.formatted(nested ? " OR parent_id IS NOT NULL" : ""), Boolean.class));
    }

    private static boolean hasNameIndex(JdbcTemplate jdbc) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ?)",
                Boolean.class, RecipeService.TAG_NAME_INDEX));
    }

    /**
     * The drawer most of this household's recipes wearing the group are in. A tie goes to the
     * drawer that comes first (Breakfast, Lunch, Dinner, Snacks, Drinks, Other), and a group
     * nobody wears goes to Other.
     */
    private static RecipeSection busiestDrawer(JdbcTemplate jdbc, UUID groupId, UUID householdId) {
        Map<RecipeSection, Integer> worn = new EnumMap<>(RecipeSection.class);
        for (Map<String, Object> row : jdbc.queryForList("""
                SELECT f.section, COUNT(DISTINCT l.filing_id) AS recipes
                FROM recipe_filing_categories l
                JOIN recipe_filings f ON f.id = l.filing_id
                WHERE l.category_id = ? AND f.household_id = ?
                GROUP BY f.section
                """, groupId, householdId)) {
            worn.put(RecipeSection.valueOf((String) row.get("section")), ((Number) row.get("recipes")).intValue());
        }
        RecipeSection busiest = RecipeSection.OTHER;
        int most = 0;
        for (RecipeSection drawer : RecipeSection.values()) {
            int recipes = worn.getOrDefault(drawer, 0);
            if (recipes > most) {
                busiest = drawer;
                most = recipes;
            }
        }
        return busiest;
    }

    /**
     * The household's tag of that name in that drawer — trimmed, any case, the oldest if an old
     * database somehow has two — or null.
     */
    private static UUID sameNamed(JdbcTemplate jdbc, UUID householdId, RecipeSection drawer, String name) {
        List<UUID> found = jdbc.queryForList("""
                SELECT id FROM recipe_categories
                WHERE household_id = ? AND section = ? AND lower(trim(name)) = lower(trim(?))
                ORDER BY created_at, id
                LIMIT 1
                """, UUID.class, householdId, drawer.name(), name);
        return found.isEmpty() ? null : found.get(0);
    }

    /**
     * Moves each link onto the tag of the same name in its own recipe's household and drawer, or
     * drops it when there is no such tag. Never makes one: a drawer that never had the name is
     * not given it by the move.
     */
    private static void rehome(JdbcTemplate jdbc, List<Map<String, Object>> links, Tally tally) {
        for (Map<String, Object> link : links) {
            UUID filingId = (UUID) link.get("filing_id");
            UUID from = (UUID) link.get("category_id");
            UUID to = sameNamed(jdbc, (UUID) link.get("household_id"),
                    RecipeSection.valueOf((String) link.get("section")), (String) link.get("name"));
            boolean wearsItAlready = to != null && Boolean.TRUE.equals(jdbc.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM recipe_filing_categories WHERE filing_id = ? AND category_id = ?)",
                    Boolean.class, filingId, to));
            if (to == null || wearsItAlready) {
                jdbc.update("DELETE FROM recipe_filing_categories WHERE filing_id = ? AND category_id = ?",
                        filingId, from);
            } else {
                jdbc.update("UPDATE recipe_filing_categories SET category_id = ? WHERE filing_id = ? AND category_id = ?",
                        to, filingId, from);
            }
            if (to == null) {
                tally.dropped++;
            } else {
                tally.relinked++;
            }
        }
    }
}
