package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.dto.RecipeDtos.SourceLink;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateVideoRequest;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.RecipeRepository;
import com.gehan.mealplanner.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Links against the real database: the startup backfill, and the rule that a save which says
 * nothing about links leaves them alone. Each test runs in a transaction that is rolled back,
 * so nothing it makes is left in the dev database.
 */
@SpringBootTest
@Transactional
class RecipeSourceLinksDatabaseTest {

    private static final String BLOG = "https://www.bbcgoodfood.com/recipes/ragu";
    private static final String TIKTOK = "https://www.tiktok.com/@cook/video/1";

    @Autowired RecipeService recipeService;
    @Autowired HouseholdService householdService;
    @Autowired RecipeRepository recipeRepository;
    @Autowired HouseholdRepository householdRepository;
    @Autowired UserRepository userRepository;
    @Autowired EntityManager entityManager;

    private UUID userId;
    private UUID householdId;

    @BeforeEach
    void household() {
        User user = userRepository.save(User.builder()
                .username("links-it-" + UUID.randomUUID()).displayName("Links").build());
        userId = user.getId();
        householdId = householdService.create(userId, new CreateHouseholdRequest("Links IT")).id();
    }

    @Test
    void theBackfillMovesTheOldPairIntoTheListOnce() {
        Household household = householdRepository.findById(householdId).orElseThrow();
        Recipe old = recipeRepository.save(Recipe.builder()
                .household(household).name("From before").servings(2)
                .sourceUrl("bbcgoodfood.com/recipes/ragu").videoUrl(TIKTOK).build());
        Recipe sameTwice = recipeRepository.save(Recipe.builder()
                .household(household).name("Same link twice").servings(2)
                .sourceUrl(TIKTOK).videoUrl(TIKTOK).build());
        entityManager.flush();

        assertThat(recipeService.backfillSourceLinks()).isGreaterThanOrEqualTo(2);
        entityManager.flush();
        entityManager.clear();

        RecipeResponse moved = recipeService.get(old.getId(), householdId, userId);
        assertThat(moved.links()).containsExactly(
                new SourceLink("https://bbcgoodfood.com/recipes/ragu", null), new SourceLink(TIKTOK, null));
        assertThat(moved.sourceUrl()).isEqualTo("https://bbcgoodfood.com/recipes/ragu");
        assertThat(moved.videoUrl()).isEqualTo(TIKTOK);
        assertThat(recipeService.get(sameTwice.getId(), householdId, userId).links())
                .containsExactly(new SourceLink(TIKTOK, null));

        // A second start finds nothing left to move, and doubles nothing up.
        assertThat(recipeService.backfillSourceLinks()).isZero();
        entityManager.flush();
        entityManager.clear();
        assertThat(recipeService.get(old.getId(), householdId, userId).links()).hasSize(2);
    }

    @Test
    void theBackfillKeepsTextThatWasNeverALinkAndTurnsABareAddressDescriptionIntoALink() {
        Household household = householdRepository.findById(householdId).orElseThrow();
        Recipe pasted = recipeRepository.save(Recipe.builder()
                .household(household).name("Pasted").servings(2).description("Rich and slow")
                .sourceUrl("Adapted from Serious Eats").videoUrl("https://www.facebook.com/watch/?v=1").build());
        Recipe imported = recipeRepository.save(Recipe.builder()
                .household(household).name("Imported").servings(2).description(" " + BLOG + " ").build());
        Recipe described = recipeRepository.save(Recipe.builder()
                .household(household).name("Described").servings(2).description("https://a.com is where I found it").build());
        entityManager.flush();

        recipeService.backfillSourceLinks();
        entityManager.flush();
        entityManager.clear();

        RecipeResponse p = recipeService.get(pasted.getId(), householdId, userId);
        assertThat(p.description()).isEqualTo("Rich and slow · Source: Adapted from Serious Eats");
        assertThat(p.links()).containsExactly(new SourceLink("https://www.facebook.com/watch/?v=1", "Video"));
        // The old text is out of its column, which now mirrors the list like any other.
        assertThat(recipeRepository.findById(pasted.getId()).orElseThrow().getSourceUrl())
                .isEqualTo("https://www.facebook.com/watch/?v=1");

        RecipeResponse i = recipeService.get(imported.getId(), householdId, userId);
        assertThat(i.description()).isNull();
        assertThat(i.links()).containsExactly(new SourceLink(BLOG, null));
        assertThat(i.sourceUrl()).isEqualTo(BLOG);

        // A sentence that starts with an address is somebody's words, and stays.
        assertThat(recipeService.get(described.getId(), householdId, userId).description())
                .isEqualTo("https://a.com is where I found it");

        // Nothing left to do on the next start, so nothing is added twice.
        recipeService.backfillSourceLinks();
        entityManager.flush();
        entityManager.clear();
        assertThat(recipeService.get(pasted.getId(), householdId, userId).description())
                .isEqualTo("Rich and slow · Source: Adapted from Serious Eats");
    }

    @Test
    void aRecipeTheBackfillHasNotReachedStillShowsAndKeepsItsLinks() {
        Household household = householdRepository.findById(householdId).orElseThrow();
        Recipe old = recipeRepository.save(Recipe.builder()
                .household(household).name("From before").servings(2)
                .sourceUrl(BLOG).videoUrl(TIKTOK).build());
        entityManager.flush();
        entityManager.clear();

        assertThat(recipeService.get(old.getId(), householdId, userId).links())
                .containsExactly(new SourceLink(BLOG, null), new SourceLink(TIKTOK, null));
        // An old phone's save in that window keeps them, and puts them in the list for good.
        RecipeResponse saved = recipeService.update(old.getId(), userId, request(null, null, null));
        assertThat(saved.links()).containsExactly(new SourceLink(BLOG, null), new SourceLink(TIKTOK, null));
        entityManager.flush();
        entityManager.clear();
        assertThat(recipeRepository.findById(old.getId()).orElseThrow().getLinks()).hasSize(2);
    }

    @Test
    void aSaveThatSaysNothingAboutLinksLeavesThemAlone() {
        RecipeResponse made = recipeService.create(householdId, userId, request(null, null,
                List.of(new SourceLink(BLOG, "Blog"), new SourceLink(TIKTOK, null))));
        assertThat(made.links()).containsExactly(new SourceLink(BLOG, "Blog"), new SourceLink(TIKTOK, null));

        // What every phone from before this sends: no links, no sourceUrl, no videoUrl.
        RecipeResponse phone = recipeService.update(made.id(), userId, request(null, null, null));
        assertThat(phone.links()).isEqualTo(made.links());

        // The old web form sends the videoUrl back as it got it: still one copy.
        RecipeResponse oldWeb = recipeService.update(made.id(), userId, request(null, TIKTOK, null));
        assertThat(oldWeb.links()).isEqualTo(made.links());

        // An old client with a new single link has it added, not swapped in.
        RecipeResponse added = recipeService.update(made.id(), userId, request("seriouseats.com/ragu", null, null));
        assertThat(added.links()).extracting(SourceLink::url)
                .containsExactly(BLOG, TIKTOK, "https://seriouseats.com/ragu");

        // A new client's list is the whole list; an empty one clears them, old columns too.
        RecipeResponse cleared = recipeService.update(made.id(), userId, request(null, null, List.of()));
        assertThat(cleared.links()).isEmpty();
        assertThat(cleared.sourceUrl()).isNull();
        assertThat(cleared.videoUrl()).isNull();
        entityManager.flush();
        Recipe row = recipeRepository.findById(made.id()).orElseThrow();
        assertThat(row.getSourceUrl()).isNull();
        assertThat(row.getVideoUrl()).isNull();
    }

    @Test
    void theVideoEndpointSwapsOnlyTheVideo() {
        RecipeResponse made = recipeService.create(householdId, userId, request(null, null,
                List.of(new SourceLink(BLOG, null), new SourceLink(TIKTOK, "Watch"))));

        RecipeResponse swapped = recipeService.updateVideo(made.id(), userId, new UpdateVideoRequest("youtu.be/abc"));
        assertThat(swapped.links()).containsExactly(
                new SourceLink(BLOG, null), new SourceLink("https://youtu.be/abc", null));
        assertThat(swapped.videoUrl()).isEqualTo("https://youtu.be/abc");

        RecipeResponse removed = recipeService.updateVideo(made.id(), userId, new UpdateVideoRequest(""));
        assertThat(removed.links()).containsExactly(new SourceLink(BLOG, null));
        assertThat(removed.videoUrl()).isNull();

        RecipeResponse added = recipeService.updateVideo(made.id(), userId, new UpdateVideoRequest(TIKTOK));
        assertThat(added.links()).extracting(SourceLink::url).containsExactly(BLOG, TIKTOK);

        // A link on a site not known for videos goes beside the video, never over it.
        RecipeResponse beside = recipeService.updateVideo(made.id(), userId,
                new UpdateVideoRequest("https://www.facebook.com/watch/?v=1"));
        assertThat(beside.links()).containsExactly(new SourceLink(BLOG, null), new SourceLink(TIKTOK, null),
                new SourceLink("https://www.facebook.com/watch/?v=1", "Video"));
        assertThat(beside.videoUrl()).isEqualTo(TIKTOK);
    }

    private static RecipeRequest request(String sourceUrl, String videoUrl, List<SourceLink> links) {
        return new RecipeRequest("Ragu", null, null, null, null, 4, sourceUrl, videoUrl, links,
                RecipeSection.DINNER, List.of(), null, null,
                List.of(new RecipeIngredientRequest("mince", BigDecimal.ONE, "kg", null, false)));
    }
}
