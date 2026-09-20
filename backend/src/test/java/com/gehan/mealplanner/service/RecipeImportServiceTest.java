package com.gehan.mealplanner.service;

import com.gehan.mealplanner.ai.RecipeAiDtos.GeneratedRecipe;
import com.gehan.mealplanner.ai.RecipeAiDtos.MethodSource;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import java.util.List;

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
    void skipsTheHeadingsThatDivideAnIngredientList() {
        // Real caption shape: "For the Salmon:" is a divider, not something to buy.
        GeneratedRecipe draft = service.fromCaption("""
            Hot Honey Garlic Salmon 🍯
            For the Salmon:
            0.8 lb fresh salmon
            2 tbsp soy sauce
            For the Sauce:
            2 tbsp honey
            """, "u");

        assertThat(draft.ingredients()).hasSize(3);
        assertThat(draft.ingredients()).noneMatch(i -> i.ingredientName().toLowerCase().contains("for the"));
        // Under a heading, a line with no amount is still an ingredient.
        assertThat(service.fromCaption("Soup\nIngredients:\n2 onions\nsalt and pepper\n", "u").ingredients())
                .anyMatch(i -> i.ingredientName().equals("salt and pepper"));
    }

    @Test
    void keepsTheUnquantifiedIngredientsInsideTheBlock() {
        // Measured on a real caption: picking only the lines with amounts dropped the
        // chicken, the lemon and the salt, and pushed the salt into the method.
        GeneratedRecipe draft = service.fromCaption("""
            A winner every. single. time.
            40g butter
            6-8 garlic cloves, roughly chopped
            1kg-1.2kg chicken thighs
            Juice and zest of one lemon
            Sea salt to taste
            Melt the butter and brown the chicken on both sides.
            Add the garlic and cook it through.
            """, "u");

        assertThat(draft.ingredients()).hasSize(5);
        assertThat(draft.ingredients()).anyMatch(i -> i.ingredientName().contains("chicken thighs"));
        assertThat(draft.ingredients()).anyMatch(i -> i.ingredientName().contains("lemon"));
        assertThat(draft.instructions()).startsWith("Melt the butter");
        assertThat(draft.instructions()).doesNotContain("Sea salt");
    }

    @Test
    void withoutHeadingsAnAmountlessLineIsTreatedAsMethod() {
        // Nothing distinguishes "salt and pepper" from "Cook the pasta" except an amount, so
        // in an unlabelled caption the amount-less lines are the method. Erring the other way
        // would turn every step into an ingredient.
        GeneratedRecipe draft = service.fromCaption("""
            Garlic pasta
            200 g spaghetti
            Cook the pasta and toss it through the butter.
            """, "u");
        // The step ends in a full stop, so it stays out of the shopping list.
        assertThat(draft.ingredients()).hasSize(1);
        assertThat(draft.instructions()).isEqualTo("Cook the pasta and toss it through the butter.");
    }

    @Test
    void saysSoWhenTheCaptionIsOnlyAHook() {
        // The common case: the recipe is spoken in the video and the caption sells it.
        assertThatThrownBy(() -> service.fromCaption(
                "the BEST lasagna you will ever make 🍝 #fyp #cooking", "u"));
    }

    @Test
    void turnsAWebVttTrackIntoSentences() {
        // The cues are deliberately out of order, because that is how TikTok sends them: in a
        // real track the opening line arrived eleventh. Read in file order this says "bake it,
        // then dust it", which is wrong and reads perfectly well.
        String vtt = """
            WEBVTT

            2
            00:00:07.900 --> 00:00:11.000
            <v Narrator>Bake it for forty five minutes until golden.</v>

            1
            00:00:00.120 --> 00:00:03.400
            Dust the chicken thighs with smoky paprika and a little salt.

            3
            00:00:03.400 --> 00:00:07.900
            Dust the chicken thighs with smoky paprika and a little salt.
            Roll them back up and pour over the sauce.
            """;

        String text = service.fromWebVtt(vtt);

        assertThat(text).isEqualTo(
                "Dust the chicken thighs with smoky paprika and a little salt. "
                        + "Roll them back up and pour over the sauce. "
                        + "Bake it for forty five minutes until golden.");
        // No timings, no cue numbers, and the rolling repeat appears once.
        assertThat(text).doesNotContain("-->").doesNotContain("WEBVTT");
    }

    @Test
    void readsATrackWithNoHourAndNoCueNumbers() {
        // Both are legal WebVTT and both turn up.
        assertThat(service.fromWebVtt("""
            WEBVTT

            00:12.906 --> 00:19.113
            Second.

            00:01.092 --> 00:04.033
            First.
            """)).isEqualTo("First. Second.");
    }

    @Test
    void picksTheEnglishSubtitleTrackOutOfTheVideosOwnData() {
        // The shape a real TikTok page ships: the blob its client rehydrates from, with the
        // tracks in a deliberately unhelpful order.
        String html = "<html><script id=\"__UNIVERSAL_DATA_FOR_REHYDRATION__\" type=\"application/json\">"
                + """
                {"__DEFAULT_SCOPE__":{"webapp.video-detail":{"itemInfo":{"itemStruct":{
                  "video":{"subtitleInfos":[
                    {"Format":"creator_caption","Source":"LC","LanguageCodeName":"eng-US","Url":"https://x/a"},
                    {"Format":"webvtt","Source":"ASR","LanguageCodeName":"por-PT","Url":"https://x/b"},
                    {"Format":"webvtt","Source":"MT","LanguageCodeName":"eng-US","Url":"https://x/c"}]}}}}}}
                """
                + "</script></html>";

        JsonNode item = service.tikTokItem(html);
        // creator_caption is JSON of another shape, and Portuguese is no use to the importer,
        // so the machine-translated English WebVTT is the one left standing.
        assertThat(service.bestSubtitle(item).path("Url").asText()).isEqualTo("https://x/c");

        // A video with no captions at all, and a page that is not TikTok's.
        assertThat(service.bestSubtitle(service.tikTokItem("<html>nothing</html>")).isMissingNode()).isTrue();
    }

    @Test
    void pullsTheMethodOutOfTheNarration() {
        // The real cues from a narrated video, in the order they were spoken. Most of it is
        // not the recipe: it opens on a hook and a pitch and closes asking you to follow.
        List<String> cues = List.of(
                "stop scrolling",
                "I've got the most amazing dinner recipe for you tonight",
                "it is my Creamy Lemon and Garlic Chicken Bake",
                "it combines just a handful of ingredients on the stove to create a beautiful",
                "glorious golden silky sauce that is heavily dotted with lots of garlic",
                "if you're anything like me more is more when it comes to garlic",
                "I also like to add some spinach for a little bit of veg",
                "and I just use the frozen blocks because they are so economical",
                "all you have to do with the chicken is dust it with smoky paprika",
                "and a little bit of salt to your taste",
                "and then roll those thighs back up and pour over that sauce",
                "that is literally it",
                "after that all you're going to let it do is bake away in the oven for forty five",
                "fifty minutes until it's beautiful and golden",
                "and then you gonna serve it with your favourite sides",
                "the recipe is below",
                "I hope you enjoy");

        String method = service.methodFrom(cues);

        assertThat(method.lines()).containsExactly(
                "Dust it with smoky paprika and a little bit of salt to your taste.",
                "Roll those thighs back up and pour over that sauce that is literally it.",
                "After that bake away in the oven for forty five fifty minutes until it's beautiful and golden.",
                "Serve it with your favourite sides.");
        // The sell before and the ask after are gone, and so is the title.
        assertThat(method).doesNotContain("stop scrolling").doesNotContain("Chicken Bake")
                .doesNotContain("recipe is below").doesNotContain("hope you enjoy");
        // A cue between two instructions is usually the rest of the sentence, so it is kept:
        // dropping it would leave "bake for forty five" with no end to it.
        assertThat(method).contains("forty five fifty minutes");
    }

    @Test
    void cutsAPunctuatedTranscriptIntoOneStepPerSentence() {
        // A real one, and it arrived as a single unbroken cue — so without splitting on the
        // sentences it already has, the whole video comes out as "step 1".
        //
        // The two mentions of "squash season" are why SOMETIMES_ACTIONS exists: reading that
        // noun as the verb made the first and last sentences look like instructions, which
        // kept the hook and the sign-off and defeated the trimming at both ends at once.
        String spoken = "Hey, apparently it is Butternut squash season. So let's make a beautiful side dish. "
                + "And I'll show you how to keep the band aids in the pantry. Take off the top and the bottom. "
                + "I don't know if you can see it, but Butternut squash has this sort of sap that comes out of it. "
                + "We're gonna cut it directly in half. Then we can remove the seeds. "
                + "This will give us two clean halves of Butternut squash. "
                + "While those are in the oven, I can small dice, 1/2 a Spanish onion, mince 4 garlic cloves. "
                + "Then serve it on a plate or in a bowl. Another plating tip. "
                + "And follow me, because please keep all your fingers intact this squash season.";

        String method = service.methodFrom(List.of(spoken));

        assertThat(method.lines()).containsExactly(
                "Take off the top and the bottom.",
                "Cut it directly in half.",
                "Remove the seeds.",
                "While those are in the oven, small dice, 1/2 a Spanish onion, mince 4 garlic cloves.",
                "Serve it on a plate or in a bowl.");
        // The sell before, the sign-off after, and the asides in between are all gone.
        assertThat(method).doesNotContain("squash season").doesNotContain("band aids")
                .doesNotContain("sap").doesNotContain("two clean halves").doesNotContain("plating tip");
    }

    @Test
    void keepsTheMethodOfSomebodyTalkingAboutThemselves() {
        // "I'm going to..." is a method told as a story. Skipping every first-person line
        // would leave nothing at all, so they count when there is nothing else.
        assertThat(service.methodFrom(List.of(
                "hey guys welcome back",
                "I'm going to melt the butter in a pan",
                "and then I add the garlic and stir it for two minutes",
                "thanks for watching"))).isEqualTo(
                "Melt the butter in a pan.\nAdd the garlic and stir it for two minutes.");
    }

    @Test
    void doesNotNameARecipeAfterTheHookThatOpensTheCaption() {
        // A real caption opened "is it time?", and the recipe went into the app under that
        // name. A title is not a question, not a heading and not something you buy.
        assertThat(service.fromCaption("""
                is it time?
                Roasted Butternut Squash
                1 butternut squash
                2 tbsp olive oil
                """, "u").name()).isEqualTo("Roasted Butternut Squash");

        assertThat(service.fromCaption("""
                🍂🍂🍂
                Ingredients:
                Hot Honey Garlic Salmon
                0.8 lb salmon
                """, "u").name()).isEqualTo("Hot Honey Garlic Salmon");

        // The shape that actually turned up: a hook, then the name with a colon announcing
        // the shopping list. A trailing colon is only a heading when the word before it is
        // one, and "Butternut squash and white beans" is not.
        assertThat(service.fromCaption("""
                is it time?
                Butternut squash and white beans:
                1 butternut squash
                2 tbsp olive oil
                """, "u").name()).isEqualTo("Butternut squash and white beans");

        // And the same caption written on one line, which is just as common.
        assertThat(service.fromCaption("""
                is it time? Butternut squash and white beans:
                1 butternut squash
                2 tbsp olive oil
                """, "u").name()).isEqualTo("Butternut squash and white beans");

        // When the hook runs straight into the shopping list there is no better line to
        // take, and a name you can edit beats no name at all.
        assertThat(service.fromCaption("is it time?\n1 butternut squash\n2 tbsp olive oil\n", "u").name())
                .isEqualTo("is it time?");
    }

    @Test
    void handsBackEveryStepBesideTheSentenceItCameFrom() {
        // The phone rewrites the raw sentence and falls back to the written step when the
        // rewrite cannot be trusted. That pairing is by position, so if these two ever came
        // back different lengths or in a different order, a rewrite of one step would be
        // swapped for the text of another and nothing would look wrong.
        RecipeImportService.Method method = service.methodOf(List.of(
                "Hey, apparently it is Butternut squash season. Take off the top and the bottom. "
                        + "Then we can remove the seeds. And I'll add a cup of chicken stock. "
                        + "So you're gonna turn the heat off. And follow me for more."));

        assertThat(method.spoken()).hasSameSizeAs(method.written().lines().toList());
        assertThat(method.written().lines()).containsExactly(
                "Take off the top and the bottom.",
                "Remove the seeds.",
                "Add a cup of chicken stock.",
                "Turn the heat off.");
        // The raw side is what was actually said, speaker and all — that is the point of it.
        assertThat(method.spoken()).containsExactly(
                "Take off the top and the bottom.",
                "Then we can remove the seeds.",
                "And I'll add a cup of chicken stock.",
                "So you're gonna turn the heat off.");
    }

    @Test
    void saysWhetherTheMethodWasWrittenDownOrSpoken() {
        // The app rewrites spoken steps on device and leaves published ones exactly alone,
        // so getting this label wrong would put a language model through a publisher's
        // own instructions.
        JsonNode published = service.findRecipe(page("""
            {"@type":"Recipe","name":"Soup","recipeIngredient":["1 onion"],
             "recipeInstructions":[{"@type":"HowToStep","text":"Chop the onion."}]}
            """));
        assertThat(service.toDraft(published, "u").methodSource()).isEqualTo(MethodSource.PUBLISHED);

        assertThat(service.fromCaption("Soup\nIngredients:\n1 onion\nMethod:\nChop it.\n", "u").methodSource())
                .isEqualTo(MethodSource.PUBLISHED);
    }

    @Test
    void rewritesWhatWasSaidAsAnInstruction() {
        // A step tells the reader what to do. Out loud nobody talks that way — it is always
        // "then we can", "I'll", "you're gonna" — and taking the speaker out of the sentence
        // is most of the distance between a transcript and a method.
        assertThat(service.methodFrom(List.of(
                "Then we can remove the seeds.",
                "And I'll add a cup of chicken stock.",
                "So you're gonna turn the heat off.",
                "Now we're gonna sweat our onions in a little oil.",
                "All you have to do with the chicken is dust it with paprika.",
                "All you're going to let it do is bake for forty minutes."))).isEqualTo("""
                Remove the seeds.
                Add a cup of chicken stock.
                Turn the heat off.
                Sweat the onions in a little oil.
                Dust it with paprika.
                Bake for forty minutes.""");

        // Not every "I" is a step waiting to be ordered about: only drop the speaker when
        // what follows is something to do.
        assertThat(service.methodFrom(List.of("I like it spicy, so I add chilli to the pan.")))
                .isEqualTo("I like it spicy, so I add chilli to the pan.");
    }

    @Test
    void keepsAFinishingStepThatOpensWithBecause() {
        // Two ingredients and the whole finishing move were being dropped: the sentence
        // starts "Because then", and its only verb is "hit". A competitor's paid app loses
        // this step too, so it is worth a test rather than a word.
        String method = service.methodFrom(List.of(
                "Turn the heat off and add one can of drained and rinsed cannellini beans. "
                        + "Then this can hang out just like this. "
                        + "Because then all you have to do when your squash comes out of the oven is "
                        + "maybe hit this with a shot of vinegar if you like, a couple handfuls of baby spinach. "
                        + "Then serve it on a plate."));

        assertThat(method).contains("vinegar").contains("baby spinach");
    }

    @Test
    void doesNotMistakeTheSignOffForCooking() {
        // "hit" earns its place in the verb list, and immediately invites "hit that follow
        // button" into the method.
        String method = service.methodFrom(List.of(
                "Melt the butter in the pan. Add the garlic and stir it through. "
                        + "Pour in the stock and let it reduce. Serve it up while it is hot. "
                        + "Hit that like button and hit follow for more."));

        assertThat(method).doesNotContain("like button").doesNotContain("follow");
        assertThat(method.lines()).hasSize(4);
    }

    @Test
    void findsNoMethodWhenNobodyDoesAnything() {
        // Better to leave the steps empty than to save the chatter as if it were a recipe.
        assertThat(service.methodFrom(List.of(
                "stop scrolling", "this is the best thing I have ever eaten", "link in bio"))).isNull();
        assertThat(service.methodFrom(List.of())).isNull();
    }

    @Test
    void keepsATranscriptOnlyWhenSomebodyIsCooking() {
        // Half the sampled recipe videos play a licensed song instead of a voiceover, and the
        // transcript comes back as fluent, confident prose with nothing to mark it as wrong.
        // Anything that is not cooking is dropped rather than saved as a method.
        assertThat(service.soundsLikeCooking(
                "Heat the oil in a pan, add the onion and garlic, and stir for two minutes "
                        + "before you pour in the stock.")).isTrue();

        assertThat(service.soundsLikeCooking(
                "I wrote this one on a long drive home and it still makes me think of that "
                        + "summer, so I hope you like it as much as I do.")).isFalse();

        // Too short to judge, so not trusted.
        assertThat(service.soundsLikeCooking("Stir it.")).isFalse();
        assertThat(service.soundsLikeCooking(null)).isFalse();
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
