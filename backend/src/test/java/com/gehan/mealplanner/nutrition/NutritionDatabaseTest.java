package com.gehan.mealplanner.nutrition;

import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.service.IngredientService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The USDA table in the real database, and the rules for who may change an ingredient's food or
 * weight. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class NutritionDatabaseTest {

    @Autowired UsdaTableLoader loader;
    @Autowired FoodTable table;
    @Autowired IngredientMatches matches;
    @Autowired IngredientService ingredients;
    @Autowired JdbcTemplate jdbc;

    @Test
    void theTableIsLoadedOnceAndNotAgainForTheSameFile() throws Exception {
        assertThat(loader.currentVersion()).startsWith("sha256:");
        assertThat(loader.load()).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM nutrition_foods", Integer.class)).isEqualTo(table.size());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM nutrition_food_portions WHERE fdc_id = 171287",
                Integer.class)).isGreaterThanOrEqualTo(5);
    }

    @Test
    void anIngredientIsMatchedOnceAndRemembered() {
        Ingredient lentils = fresh("red lentils");
        IngredientMatches.Match match = matches.matchFor(lentils);
        assertThat(match.food().name()).startsWith("Lentils");
        assertThat(match.source()).isEqualTo(IngredientFoodMatch.Source.AUTO);
        assertThat(jdbc.queryForObject("SELECT source FROM ingredient_food_matches WHERE ingredient_id = ?",
                String.class, lentils.getId())).isEqualTo("AUTO");
    }

    @Test
    void aModelMayOnlyChooseFromTheShortlistAndNeverOverAPerson() {
        Ingredient yogurt = fresh("greek yogurt");
        List<FoodMatcher.Candidate> shortlist = matches.shortlist(yogurt);
        int second = shortlist.get(1).food().fdcId();

        assertThatThrownBy(() -> matches.setMatch(yogurt.getId(), 171077, IngredientFoodMatch.Source.AI, null))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("400");
        assertThat(matches.setMatch(yogurt.getId(), second, IngredientFoodMatch.Source.AI, null).food().fdcId())
                .isEqualTo(second);
        assertThat(matches.matchFor(yogurt).source()).isEqualTo(IngredientFoodMatch.Source.AI);

        matches.setMatch(yogurt.getId(), shortlist.get(0).food().fdcId(), IngredientFoodMatch.Source.USER, null);
        assertThatThrownBy(() -> matches.setMatch(yogurt.getId(), second, IngredientFoodMatch.Source.AI, null))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
        // A person can say it is none of them.
        assertThat(matches.setMatch(yogurt.getId(), null, IngredientFoodMatch.Source.USER, null).food()).isNull();
        assertThat(matches.matchFor(yogurt).countable()).isFalse();
    }

    @Test
    void aLearnedWeightIsBoundedAndAPersonOutranksAModel() {
        Ingredient butter = fresh("butter");
        assertThatThrownBy(() -> matches.setGrams(butter.getId(), "knob", 9000, IngredientUnitGrams.Source.AI, null))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("400");
        assertThatThrownBy(() -> matches.setGrams(butter.getId(), "g", 1, IngredientUnitGrams.Source.AI, null))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("400");
        matches.setGrams(butter.getId(), "knobs", 14, IngredientUnitGrams.Source.AI, null);
        assertThat(matches.learnedFor(List.of(butter.getId())).get(butter.getId()).get("knob").gramsEach()).isEqualTo(14);
        matches.setGrams(butter.getId(), "knob", 10, IngredientUnitGrams.Source.USER, null);
        assertThatThrownBy(() -> matches.setGrams(butter.getId(), "knob", 20, IngredientUnitGrams.Source.AI, null))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
    }

    @Test
    void aModelsPickOfSomethingThatIsNoFoodIsRefused() {
        Ingredient mix = fresh("grandma's secret mix");
        for (FoodMatcher.Candidate c : matches.shortlist(mix)) {
            assertThatThrownBy(() -> matches.setMatch(mix.getId(), c.food().fdcId(), IngredientFoodMatch.Source.AI, null))
                    .isInstanceOf(ResponseStatusException.class).hasMessageContaining("422");
        }
        // A pick the matcher was unsure of is counted, but stays a guess at the matcher's own confidence.
        // Digits are not words to the matcher, so this one scores exactly as "curry paste" does.
        Ingredient paste = ingredients.findOrCreate("curry paste " + (System.nanoTime() % 1_000_000_000L), null);
        FoodMatcher.Candidate powder = matches.shortlist(paste).get(0);
        IngredientMatches.Match picked = matches.setMatch(paste.getId(), powder.food().fdcId(),
                IngredientFoodMatch.Source.AI, null);
        assertThat(picked.confidence()).isEqualTo(powder.confidence(), org.assertj.core.api.Assertions.within(0.001));
        assertThat(matches.matchFor(paste).countable()).isTrue();
        assertThat(matches.matchFor(paste).guess()).isTrue();
    }

    @Test
    void aModelsWeightFarFromTheRuleIsRefused() {
        Ingredient spinach = fresh("spinach");
        // A handful is 30 g by the rule: the model's 10 g is refused, 25 g taken.
        assertThatThrownBy(() -> matches.setGrams(spinach.getId(), "handful", 10, IngredientUnitGrams.Source.AI, null))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("422");
        matches.setGrams(spinach.getId(), "handful", 25, IngredientUnitGrams.Source.AI, null);
        // A person may say anything sensible.
        matches.setGrams(spinach.getId(), "handful", 10, IngredientUnitGrams.Source.USER, null);
        assertThat(matches.learnedFor(List.of(spinach.getId())).get(spinach.getId()).get("handful").gramsEach()).isEqualTo(10);
    }

    @Test
    void onlySomeoneWhoseHouseholdsUseAnIngredientMayChangeIt() {
        Ingredient nobodys = fresh("saffron");
        assertThatThrownBy(() -> matches.assertUsedBy(nobodys.getId(), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
    }

    /** A name of its own, so a shared ingredient's real match is never touched. */
    private Ingredient fresh(String name) {
        return ingredients.findOrCreate(name + " " + UUID.randomUUID().toString().substring(0, 6), null);
    }
}
