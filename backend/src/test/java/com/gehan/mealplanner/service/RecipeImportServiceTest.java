package com.gehan.mealplanner.service;

import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Reading the recipe a page publishes about itself. The shapes here are the ones sites really
 * use: a bare object, a @graph, an array, HowToStep objects, HowToSections, and instructions
 * as one lump of HTML.
 */
class RecipeImportServiceTest {

    private final RecipeImportService service = new RecipeImportService();

    private static String page(String json) {
        return "<html><head><script type=\"application/ld+json\">" + json + "</script></head><body>x</body></html>";
    }

    @Test
    void readsAPlainRecipe() {
        JsonNode found = service.findRecipe(page("""
            {"@context":"https://schema.org","@type":"Recipe","name":"Tomato Soup",
             "recipeYield":"8 servings","prepTime":"PT5M","cookTime":"PT25M",
             "recipeIngredient":["4 tbsp unsalted butter","1/3 cup parmesan cheese"],
             "recipeInstructions":[{"@type":"HowToStep","text":"Melt the butter."},
                                   {"@type":"HowToStep","text":"Add the cheese."}]}
            """));
        assertThat(found).isNotNull();

        GeneratedRecipe draft = service.toDraft(found, "https://example.com/soup");
        assertThat(draft.name()).isEqualTo("Tomato Soup");
        assertThat(draft.servings()).isEqualTo(8);
        assertThat(draft.prepTimeMinutes()).isEqualTo(5);
        assertThat(draft.cookTimeMinutes()).isEqualTo(25);
        assertThat(draft.instructions()).isEqualTo("Melt the butter.\nAdd the cheese.");
        assertThat(draft.ingredients()).hasSize(2);
        assertThat(draft.ingredients().get(0).ingredientName()).isEqualTo("unsalted butter");
        assertThat(draft.ingredients().get(0).unit()).isEqualTo("tbsp");
        assertThat(draft.ingredients().get(1).ingredientName()).isEqualTo("parmesan cheese");
    }

    @Test
    void findsTheRecipeInsideAGraph() {
        JsonNode found = service.findRecipe(page("""
            {"@context":"https://schema.org","@graph":[
              {"@type":"WebSite","name":"A food blog"},
              {"@type":["Recipe","NewsArticle"],"name":"Lasagne","recipeIngredient":["500 g beef mince"]}]}
            """));
        assertThat(found).isNotNull();
        assertThat(service.toDraft(found, "u").name()).isEqualTo("Lasagne");
    }

    @Test
    void findsTheRecipeInsideAnArray() {
        JsonNode found = service.findRecipe(page("""
            [{"@type":"Organization","name":"A blog"},
             {"@type":"Recipe","name":"Pancakes","recipeIngredient":["2 eggs"]}]
            """));
        assertThat(found).isNotNull();
        assertThat(service.toDraft(found, "u").name()).isEqualTo("Pancakes");
    }

    @Test
    void flattensSectionsAndStripsHtmlFromSteps() {
        JsonNode found = service.findRecipe(page("""
            {"@type":"Recipe","name":"Pie","recipeIngredient":["1 pie crust"],
             "recipeInstructions":[
               {"@type":"HowToSection","itemListElement":[
                  {"@type":"HowToStep","text":"<p>Roll the pastry.</p>"},
                  {"@type":"HowToStep","text":"Fill it."}]}]}
            """));
        GeneratedRecipe draft = service.toDraft(found, "u");
        assertThat(draft.instructions()).isEqualTo("Roll the pastry.\nFill it.");
    }

    @Test
    void acceptsInstructionsAsOneBlockOfText() {
        JsonNode found = service.findRecipe(page("""
            {"@type":"Recipe","name":"Toast","recipeIngredient":["2 slices bread"],
             "recipeInstructions":"Toast the bread.\\nButter it."}
            """));
        assertThat(service.toDraft(found, "u").instructions()).isEqualTo("Toast the bread.\nButter it.");
    }

    @Test
    void ignoresAPageWithoutARecipe() {
        assertThat(service.findRecipe(page("""
            {"@type":"WebPage","name":"Just an article"}
            """))).isNull();
        assertThat(service.findRecipe("<html><body>no structured data at all</body></html>")).isNull();
    }

    @Test
    void skipsMalformedJsonAndKeepsLooking() {
        String html = "<html><script type=\"application/ld+json\">{not json,,}</script>"
                + "<script type=\"application/ld+json\">"
                + "{\"@type\":\"Recipe\",\"name\":\"Found me\",\"recipeIngredient\":[\"1 egg\"]}"
                + "</script></html>";
        JsonNode found = service.findRecipe(html);
        assertThat(found).isNotNull();
        assertThat(service.toDraft(found, "u").name()).isEqualTo("Found me");
    }

    @Test
    void readsARecipeOutOfATikTokCaptionWithHeadings() {
        GeneratedRecipe draft = service.fromCaption("""
            Creamy Tomato Soup 🍅
            Ingredients:
            4 tbsp butter
            2 yellow onions
            1/3 cup parmesan cheese
            Method:
            Melt the butter and soften the onions.
            Add the tomatoes and simmer.
            #soup #recipe #fyp
            """, "https://www.tiktok.com/@a/video/1");

        assertThat(draft.name()).isEqualTo("Creamy Tomato Soup 🍅");
        assertThat(draft.ingredients()).hasSize(3);
        assertThat(draft.ingredients().get(0).ingredientName()).isEqualTo("butter");
        assertThat(draft.ingredients().get(2).unit()).isEqualTo("cup");
        assertThat(draft.instructions()).contains("Melt the butter").contains("simmer");
    }

    @Test
    void readsACaptionWithNoHeadingsByFindingTheAmounts() {
        GeneratedRecipe draft = service.fromCaption("""
            garlic butter pasta
            200g spaghetti
            4 tbsp butter
            3 cloves garlic
            Cook the pasta, then toss it through the garlic butter.
            """, "u");

        assertThat(draft.ingredients()).hasSize(3);
        assertThat(draft.ingredients().get(0).ingredientName()).isEqualTo("spaghetti");
        assertThat(draft.instructions()).isEqualTo("Cook the pasta, then toss it through the garlic butter.");
    }

    @Test
    void stripsHashtagsRatherThanTreatingThemAsIngredients() {
        GeneratedRecipe draft = service.fromCaption("""
            Lemon pasta #pasta #easyrecipe
            2 lemons
            500 g pasta
            """, "u");
        assertThat(draft.name()).isEqualTo("Lemon pasta");
        assertThat(draft.ingredients()).hasSize(2);
    }

    @Test
    void saysSoWhenTheCaptionIsOnlyAHook() {
        // The common case: the recipe is spoken in the video and the caption sells it.
        assertThatThrownBy(() -> service.fromCaption(
                "the BEST lasagna you will ever make 🍝 #fyp #cooking", "u"));
    }

    @Test
    void refusesToFetchInsideTheHomeNetwork() {
        // The server sits on a home LAN; a link is not automatically safe to follow.
        assertThatThrownBy(() -> service.fromUrl("http://localhost:8080/actuator"));
        assertThatThrownBy(() -> service.fromUrl("http://192.168.1.1/"));
        assertThatThrownBy(() -> service.fromUrl("file:///etc/passwd"));
    }

    private static void assertThatThrownBy(Runnable action) {
        try {
            action.run();
            throw new AssertionError("expected that to be refused");
        } catch (org.springframework.web.server.ResponseStatusException expected) {
            // good
        }
    }
}
