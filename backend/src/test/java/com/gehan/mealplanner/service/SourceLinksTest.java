package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.dto.RecipeDtos.SourceLink;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SourceLinksTest {

    private static final String BLOG = "https://www.bbcgoodfood.com/recipes/ragu";
    private static final String TIKTOK = "https://www.tiktok.com/@cook/video/1";

    @Test
    void tellsAVideoFromAPage() {
        assertThat(SourceLinks.isVideo(TIKTOK)).isTrue();
        assertThat(SourceLinks.isVideo("https://vm.tiktok.com/ZM123/")).isTrue();
        assertThat(SourceLinks.isVideo("https://youtu.be/abc")).isTrue();
        assertThat(SourceLinks.isVideo("https://m.youtube.com/watch?v=abc")).isTrue();
        assertThat(SourceLinks.isVideo("https://www.instagram.com/reel/abc/")).isTrue();
        assertThat(SourceLinks.isVideo(BLOG)).isFalse();
        // Only the host counts, not a lookalike ending.
        assertThat(SourceLinks.isVideo("https://nottiktok.com/x")).isFalse();
        assertThat(SourceLinks.isVideo("https://example.com/tiktok.com")).isFalse();
    }

    @Test
    void theOldSingleLinksComeFromTheList() {
        List<SourceLink> links = List.of(
                new SourceLink(TIKTOK, null), new SourceLink(BLOG, "Where it came from"),
                new SourceLink("https://youtu.be/abc", null));
        assertThat(SourceLinks.firstVideo(links)).isEqualTo(TIKTOK);
        assertThat(SourceLinks.firstSource(links)).isEqualTo(BLOG);
        assertThat(SourceLinks.firstVideo(List.of(new SourceLink(BLOG, null)))).isNull();
        assertThat(SourceLinks.firstSource(List.of())).isNull();
    }

    @Test
    void cleaningNormalizesTrimsAndDropsRepeatsAndEmptyRows() {
        List<SourceLink> cleaned = SourceLinks.clean(List.of(
                new SourceLink(" tiktok.com/@cook/video/1 ", "  My   TikTok "),
                new SourceLink("", "left blank"),
                new SourceLink(BLOG, " "),
                new SourceLink(BLOG + "/", "the same page again"),
                new SourceLink("https://tiktok.com/@cook/video/1", null)));
        assertThat(cleaned).containsExactly(
                new SourceLink("https://tiktok.com/@cook/video/1", "My TikTok"),
                new SourceLink(BLOG, null));
        assertThat(SourceLinks.clean(null)).isEmpty();
    }

    @Test
    void cleaningRefusesWhatIsNotALink() {
        for (String bad : new String[] {"javascript:alert(1)", "not a link", "mailto:a@b.co"}) {
            assertThatThrownBy(() -> SourceLinks.clean(List.of(new SourceLink(bad, null))))
                    .as(bad).isInstanceOf(ResponseStatusException.class);
        }
        assertThatThrownBy(() -> SourceLinks.clean(List.of(new SourceLink(BLOG, "x".repeat(61)))))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> SourceLinks.clean(List.of(new SourceLink("https://a.com/" + "x".repeat(2048), null))))
                .isInstanceOf(ResponseStatusException.class);
        List<SourceLink> tooMany = IntStream.range(0, SourceLinks.MAX_LINKS + 1)
                .mapToObj(i -> new SourceLink("https://example.com/" + i, null)).toList();
        assertThatThrownBy(() -> SourceLinks.clean(tooMany)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void aRefusedLinkIsNamedAndTheLimitsCountWhatIsLeftAfterCleaning() {
        // With several links on the form, the message has to say which one.
        assertThatThrownBy(() -> SourceLinks.clean(List.of(
                new SourceLink(BLOG, null), new SourceLink("ftp://files.example.com/recipe", null))))
                .hasMessageContaining("\"ftp://files.example.com/recipe\" isn't a web address");
        // A name that is only long because of its spaces fits once they are trimmed.
        assertThat(SourceLinks.clean(List.of(new SourceLink(BLOG, "  " + "x".repeat(58) + "  "))))
                .containsExactly(new SourceLink(BLOG, "x".repeat(58)));
        // Twenty links and the empty row the form always has is twenty links.
        List<SourceLink> full = new ArrayList<>(IntStream.range(0, SourceLinks.MAX_LINKS)
                .mapToObj(i -> new SourceLink("https://example.com/" + i, null)).toList());
        full.add(new SourceLink(" ", null));
        assertThat(SourceLinks.clean(full)).hasSize(SourceLinks.MAX_LINKS);
    }

    @Test
    void theBackfillTakesSourceThenVideoAndSkipsWhatWouldNotPassToday() {
        assertThat(SourceLinks.fromLegacy("bbcgoodfood.com/recipes/ragu", TIKTOK)).containsExactly(
                new SourceLink("https://bbcgoodfood.com/recipes/ragu", null), new SourceLink(TIKTOK, null));
        assertThat(SourceLinks.fromLegacy(TIKTOK, TIKTOK)).containsExactly(new SourceLink(TIKTOK, null));
        assertThat(SourceLinks.fromLegacy("javascript:alert(1)", TIKTOK)).containsExactly(new SourceLink(TIKTOK, null));
        assertThat(SourceLinks.fromLegacy(null, "  ")).isEmpty();
        assertThat(SourceLinks.fromLegacy("Adapted from Serious Eats", null)).isEmpty();
        // An old video on a site not known for videos is still marked as the video it was.
        assertThat(SourceLinks.fromLegacy(BLOG, "https://www.facebook.com/watch/?v=1")).containsExactly(
                new SourceLink(BLOG, null), new SourceLink("https://www.facebook.com/watch/?v=1", "Video"));
    }

    @Test
    void aRecipeNotYetBackfilledIsReadFromItsOldColumns() {
        Recipe recipe = Recipe.builder().name("Ragu").servings(4).links(new ArrayList<>())
                .sourceUrl(BLOG).videoUrl(TIKTOK).build();
        assertThat(SourceLinks.of(recipe)).containsExactly(new SourceLink(BLOG, null), new SourceLink(TIKTOK, null));

        // Saving the same list writes it into the rows for good.
        SourceLinks.replace(recipe, SourceLinks.of(recipe));
        assertThat(recipe.getLinks()).extracting(l -> l.getUrl()).containsExactly(BLOG, TIKTOK);
    }

    @Test
    void textThatWasNeverALinkIsNotWrittenOver() {
        Recipe recipe = Recipe.builder().name("Ragu").servings(4).links(new ArrayList<>())
                .sourceUrl("Adapted from Serious Eats").build();
        SourceLinks.replace(recipe, List.of(new SourceLink(TIKTOK, null)));
        // Left for the startup backfill to move into the description.
        assertThat(recipe.getSourceUrl()).isEqualTo("Adapted from Serious Eats");
        assertThat(recipe.getVideoUrl()).isEqualTo(TIKTOK);
    }

    @Test
    void anOldClientsSingleLinksOnlyEverAdd() {
        List<SourceLink> current = List.of(new SourceLink(BLOG, "Blog"), new SourceLink(TIKTOK, null));
        // A phone that has never heard of links sends neither: nothing changes.
        assertThat(SourceLinks.withLegacy(current, null, null)).isEqualTo(current);
        assertThat(SourceLinks.withLegacy(current, "", " ")).isEqualTo(current);
        // The old web form sends back the videoUrl it was given: no second copy.
        assertThat(SourceLinks.withLegacy(current, null, TIKTOK)).isEqualTo(current);
        // A new one is added at the end.
        assertThat(SourceLinks.withLegacy(current, null, "https://youtu.be/abc"))
                .extracting(SourceLink::url).containsExactly(BLOG, TIKTOK, "https://youtu.be/abc");
        // An old client knows nothing of the limit or of checking sourceUrl, so neither fails its save.
        List<SourceLink> full = IntStream.range(0, SourceLinks.MAX_LINKS)
                .mapToObj(i -> new SourceLink("https://example.com/" + i, null)).toList();
        assertThat(SourceLinks.withLegacy(full, null, "https://youtu.be/abc")).isEqualTo(full);
        assertThat(SourceLinks.withLegacy(current, "Adapted from Serious Eats", null)).isEqualTo(current);
    }

    @Test
    void replacingKeepsTheOldColumnsInStep() {
        Recipe recipe = Recipe.builder().name("Ragu").servings(4).links(new ArrayList<>()).build();
        SourceLinks.replace(recipe, List.of(new SourceLink(TIKTOK, null), new SourceLink(BLOG, "Blog")));
        assertThat(recipe.getLinks()).extracting(l -> l.getUrl() + "@" + l.getPosition())
                .containsExactly(TIKTOK + "@0", BLOG + "@1");
        assertThat(recipe.getLinks().get(1).getLabel()).isEqualTo("Blog");
        assertThat(recipe.getVideoUrl()).isEqualTo(TIKTOK);
        assertThat(recipe.getSourceUrl()).isEqualTo(BLOG);

        // Every link removed leaves nothing in the old columns for the backfill to bring back.
        SourceLinks.replace(recipe, List.of());
        assertThat(recipe.getLinks()).isEmpty();
        assertThat(recipe.getSourceUrl()).isNull();
        assertThat(recipe.getVideoUrl()).isNull();
    }
}
