package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.SavedLinkSource;
import com.gehan.mealplanner.service.RecipeImportService.Peek;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Naming a saved link from its page, on pages written out here rather than fetched: what a
 * recipe site, a blog with no recipe data, an Instagram post and a TikTok each say about
 * themselves. Nothing in this touches the internet.
 */
class SavedLinkPeekTest {

    private final RecipeImportService service = new RecipeImportService();

    @Test
    void aRecipeSiteIsNamedByItsRecipeAndPicturedByItsPhoto() {
        String html = """
                <html><head>
                <title>Ultimate Lasagne Recipe | BBC Good Food</title>
                <meta property="og:image" content="https://cdn.test/og.jpg">
                <script type="application/ld+json">{"@type":"Recipe","name":"Ultimate lasagne",
                  "image":{"@type":"ImageObject","url":"https://cdn.test/lasagne.jpg"},
                  "recipeIngredient":["500 g beef mince"]}</script>
                </head></html>
                """;
        Peek peek = service.peekPage(html, URI.create("https://www.bbcgoodfood.com/recipes/lasagne"));
        assertThat(peek.title()).isEqualTo("Ultimate lasagne");
        // The same picture an import would have used: the recipe's own before the preview's.
        assertThat(peek.pictureUrl()).isEqualTo("https://cdn.test/lasagne.jpg");
    }

    @Test
    void aPageWithNoRecipeDataIsNamedByItsTitleWithoutTheSiteName() {
        String html = """
                <html><head>
                <meta content="Crispy smashed potatoes &amp; garlic aioli - Half Baked Harvest" property="og:title">
                <meta property="og:site_name" content="Half Baked Harvest">
                <meta property="og:image" content="https://cdn.test/potatoes.jpg">
                </head></html>
                """;
        Peek peek = service.peekPage(html, URI.create("https://www.halfbakedharvest.com/smashed-potatoes/"));
        assertThat(peek.title()).isEqualTo("Crispy smashed potatoes & garlic aioli");
        assertThat(peek.pictureUrl()).isEqualTo("https://cdn.test/potatoes.jpg");

        // No og:title: the <title> tag, and after a bar it is always the site.
        Peek plain = service.peekPage("<html><head><title>\n  One-pot orzo | Cooking Blog\n</title></head></html>",
                URI.create("https://cooking.example.com/orzo"));
        assertThat(plain.title()).isEqualTo("One-pot orzo");
        assertThat(plain.pictureUrl()).isNull();
    }

    @Test
    void aDashIsOnlyTheSiteWhenItNamesTheSite() {
        assertThat(RecipeImportService.withoutSiteName("Chicken - the easy way", null, "www.example.com"))
                .isEqualTo("Chicken - the easy way");
        assertThat(RecipeImportService.withoutSiteName("Best brownies - Allrecipes", null, "www.allrecipes.com"))
                .isEqualTo("Best brownies");
        assertThat(RecipeImportService.withoutSiteName("Soup – Serious Eats", "Serious Eats", "www.seriouseats.com"))
                .isEqualTo("Soup");
    }

    @Test
    void anInstagramPostIsNamedByItsCaptionNotTheWrapperAroundIt() {
        String html = """
                <meta property="og:title" content="Nurtured Nutrition on Instagram: &quot;High protein pasta bake&quot;">
                <meta property="og:description" content="643 likes, 6 comments - nurturednutrition_ on July 18, 2026: &quot;High protein pasta bake 🍝&#10;&#10;Ingredients:&#10;200g pasta&#10;#pasta #dinner&quot;">
                <meta property="og:image" content="https://cdn.test/reel.jpg">
                """;
        Peek peek = service.peekPage(html, URI.create("https://www.instagram.com/reel/abc/"));
        assertThat(peek.title()).isEqualTo("High protein pasta bake 🍝");
        assertThat(peek.pictureUrl()).isEqualTo("https://cdn.test/reel.jpg");
    }

    @Test
    void aTikTokIsNamedByTheFirstLineOfItsCaption() {
        String html = "<html><script id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\" type=\"application/json\">"
                + """
                {"__DEFAULT_SCOPE__":{"webapp.video-detail":{"itemInfo":{"itemStruct":{
                  "desc":"is it time? Butternut squash and white beans: #fall #soup",
                  "contents":[{"desc":"is it time? Butternut squash and white beans: #fall #soup"},
                              {"desc":"1 butternut squash"},{"desc":"1 can white beans"}],
                  "video":{"cover":"https://cdn.test/cover.jpg"}}}}}}
                """
                + "</script></html>";
        assertThat(service.tikTokTitle(service.tikTokItem(html))).isEqualTo("Butternut squash and white beans");
    }

    @Test
    void aCaptionThatIsOnlyHashtagsHasNoName() {
        assertThat(service.captionTitle("#fyp #foodtok #dinner")).isNull();
        assertThat(service.captionTitle(null)).isNull();
    }

    @Test
    void aLongNameIsCutAtAWord() {
        String name = SavedLinks.tidyName("The creamiest, dreamiest one-pan garlic butter chicken with sun-dried tomatoes"
                + " and spinach you will ever make on a weeknight");
        assertThat(name).hasSizeLessThanOrEqualTo(SavedLinks.NAME_LENGTH).endsWith("…");
        assertThat(name).doesNotContain("  ").startsWith("The creamiest, dreamiest");
        assertThat(SavedLinks.tidyName("   ")).isNull();
    }

    @Test
    void aPageThatCannotBeReachedGivesNothingRatherThanAnError() {
        // .invalid is reserved and never resolves, so this fails fast and offline.
        assertThat(service.peek("https://nothing.invalid/recipe")).isEqualTo(new Peek(null, null));
        assertThat(service.peek("http://localhost/recipe")).isEqualTo(new Peek(null, null));
    }

    @Test
    void theNameFallsBackToWhereTheLinkGoes() {
        assertThat(SavedLinks.fallbackName("https://www.tiktok.com/@cookwithme/video/123")).isEqualTo("TikTok from @cookwithme");
        assertThat(SavedLinks.fallbackName("https://vm.tiktok.com/ZMabc/")).isEqualTo("TikTok video");
        assertThat(SavedLinks.fallbackName("https://www.instagram.com/reel/abc/")).isEqualTo("Instagram post");
        assertThat(SavedLinks.fallbackName("https://www.seriouseats.com/soup")).isEqualTo("seriouseats.com");
    }

    @Test
    void linksAreCleanedAndSorted() {
        assertThat(SavedLinks.clean("Look at this! https://www.instagram.com/reel/abc/?igsh=xyz"))
                .isEqualTo("https://www.instagram.com/reel/abc/");
        assertThat(SavedLinks.clean("tiktok.com/@cook/video/1?_t=8&_r=1")).isEqualTo("https://tiktok.com/@cook/video/1");
        assertThat(SavedLinks.clean("Try this! instagram.com/reel/abc?igsh=x.")).isEqualTo("https://instagram.com/reel/abc");
        // A website's query can be the page itself.
        assertThat(SavedLinks.clean("https://example.com/recipe?id=42")).isEqualTo("https://example.com/recipe?id=42");
        assertThat(SavedLinks.sourceOf("https://vm.tiktok.com/x")).isEqualTo(SavedLinkSource.TIKTOK);
        assertThat(SavedLinks.sourceOf("https://www.instagram.com/p/x")).isEqualTo(SavedLinkSource.INSTAGRAM);
        assertThat(SavedLinks.sourceOf("https://example.com")).isEqualTo(SavedLinkSource.WEB);
        assertThat(SavedLinks.same("https://a.com/x/", "https://a.com/x")).isTrue();
        assertThatThrownBy(() -> SavedLinks.clean("javascript:alert(1)")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> SavedLinks.clean("not a link at all")).isInstanceOf(ResponseStatusException.class);
    }
}
