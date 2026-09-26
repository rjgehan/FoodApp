package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.StoredImage;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.dto.RecipeDtos.ShareTargetResponse;
import com.gehan.mealplanner.dto.RecipeDtos.SourceLink;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateSharesRequest;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.StoredImageRepository;
import com.gehan.mealplanner.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Sharing against the real database: a recipe only goes between houses the sharer is in, a share
 * somebody else made is never undone by accident, and a copy saved from a public link stands on
 * its own. Rolled back after each test.
 */
@SpringBootTest
@Transactional
class SharingDatabaseTest {

    @Autowired RecipeService recipeService;
    @Autowired RecipeLinkService linkService;
    @Autowired HouseholdService householdService;
    @Autowired UserRepository userRepository;
    @Autowired HouseholdRepository householdRepository;
    @Autowired HouseholdMemberRepository memberRepository;
    @Autowired StoredImageRepository imageRepository;

    private User me;
    private User partner;
    private UUID home;
    private UUID cabin;
    private UUID partnersOther;
    private UUID strangers;

    /**
     * Me: in Home and Cabin. My partner: in Home and their own Other house. A stranger's house
     * has neither of us in it.
     */
    @BeforeEach
    void houses() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        me = userRepository.save(User.builder().username("share-me-" + tag).displayName("Me").build());
        partner = userRepository.save(User.builder().username("share-partner-" + tag).displayName("Partner").build());
        User stranger = userRepository.save(User.builder().username("share-stranger-" + tag).displayName("Stranger").build());
        home = householdService.create(me.getId(), new CreateHouseholdRequest("Home")).id();
        cabin = householdService.create(me.getId(), new CreateHouseholdRequest("Cabin")).id();
        partnersOther = householdService.create(partner.getId(), new CreateHouseholdRequest("Partner's other")).id();
        strangers = householdService.create(stranger.getId(), new CreateHouseholdRequest("Strangers")).id();
        memberRepository.save(HouseholdMember.builder()
                .household(householdRepository.findById(home).orElseThrow())
                .user(partner).role(HouseholdRole.MEMBER).build());
    }

    private RecipeResponse recipe(UUID householdId, RecipeRequest request) {
        return recipeService.create(householdId, me.getId(), request);
    }

    private static RecipeRequest soup(UUID coverImageId, List<UUID> photoIds) {
        return new RecipeRequest("Leek soup", "Thick and green", "Sweat the leeks.\nBlend.", 10, 30, 4,
                null, null, List.of(new SourceLink("https://example.com/leek-soup", "Where it's from")),
                RecipeSection.LUNCH, List.of("Soups"), coverImageId, photoIds,
                List.of(new RecipeIngredientRequest("leek", new BigDecimal("3"), null, "sliced", false),
                        new RecipeIngredientRequest("cream", new BigDecimal("100"), "ml", null, true)));
    }

    private static int status(Throwable e) {
        return ((ResponseStatusException) e).getStatusCode().value();
    }

    @Test
    void theTargetsAreOnlyMyOtherHouses() {
        UUID id = recipe(home, soup(null, null)).id();
        assertThat(recipeService.shareTargets(id, me.getId()))
                .extracting(ShareTargetResponse::householdId)
                .containsExactly(cabin);
        // The same recipe, asked about by somebody else in Home: their other house, not mine.
        assertThat(recipeService.shareTargets(id, partner.getId()))
                .extracting(ShareTargetResponse::householdId)
                .containsExactly(partnersOther);
    }

    @Test
    void sharingIntoAHouseYouAreNotInIsRefusedAndChangesNothing() {
        UUID id = recipe(home, soup(null, null)).id();
        recipeService.updateShares(id, me.getId(), new UpdateSharesRequest(List.of(cabin)));

        assertThatThrownBy(() -> recipeService.updateShares(id, me.getId(),
                new UpdateSharesRequest(List.of(cabin, strangers))))
                .satisfies(e -> assertThat(status(e)).isEqualTo(403));
        assertThat(recipeService.get(id, home, me.getId()).sharedWith()).containsExactly(cabin);
    }

    @Test
    void aShareSomebodyElseMadeIsLeftAlone() {
        UUID id = recipe(home, soup(null, null)).id();
        recipeService.updateShares(id, partner.getId(), new UpdateSharesRequest(List.of(partnersOther)));

        // I share it with Cabin, and send nothing about the partner's house: theirs stays.
        recipeService.updateShares(id, me.getId(), new UpdateSharesRequest(List.of(cabin)));
        assertThat(recipeService.get(id, home, me.getId()).sharedWith())
                .containsExactlyInAnyOrder(cabin, partnersOther);

        // Unsharing everything of mine still leaves theirs.
        recipeService.updateShares(id, me.getId(), new UpdateSharesRequest(List.of()));
        assertThat(recipeService.get(id, home, me.getId()).sharedWith()).containsExactly(partnersOther);

        // An older app sends the whole list back, theirs included. That is no reason to refuse.
        recipeService.updateShares(id, me.getId(), new UpdateSharesRequest(List.of(partnersOther, cabin)));
        assertThat(recipeService.get(id, home, me.getId()).sharedWith())
                .containsExactlyInAnyOrder(cabin, partnersOther);
    }

    @Test
    void aSavedCopyStandsOnItsOwn() {
        StoredImage cover = imageRepository.save(StoredImage.builder()
                .household(householdRepository.findById(home).orElseThrow())
                .contentType("image/jpeg").byteSize(3).data(new byte[] {1, 2, 3}).build());
        RecipeResponse original = recipe(home, soup(cover.getId(), List.of(cover.getId())));
        String token = linkService.createOrGet(original.id(), me.getId());

        RecipeResponse copy = recipeService.saveFromLink(token, partnersOther, partner.getId());

        assertThat(copy.id()).isNotEqualTo(original.id());
        assertThat(copy.householdId()).isEqualTo(partnersOther);
        assertThat(copy.shared()).isFalse();
        assertThat(copy.name()).isEqualTo("Leek soup");
        assertThat(copy.description()).isEqualTo("Thick and green · " + RecipeService.SAVED_FROM_LINK);
        assertThat(copy.instructions()).isEqualTo("Sweat the leeks.\nBlend.");
        assertThat(copy.servings()).isEqualTo(4);
        assertThat(copy.links()).containsExactly(new SourceLink("https://example.com/leek-soup", "Where it's from"));
        assertThat(copy.ingredients()).extracting(i -> i.ingredientName() + "|" + i.optional())
                .containsExactly("leek|false", "cream|true");
        // In the same drawer, but none of the sender's groups.
        assertThat(copy.section()).isEqualTo(RecipeSection.LUNCH);
        assertThat(copy.categories()).isEmpty();

        // Its own pictures, in its own house — the cover and the same photo copied once.
        assertThat(copy.coverImageId()).isNotNull().isNotEqualTo(cover.getId());
        assertThat(copy.photoIds()).containsExactly(copy.coverImageId());
        StoredImage copied = imageRepository.findById(copy.coverImageId()).orElseThrow();
        assertThat(copied.getHousehold().getId()).isEqualTo(partnersOther);
        assertThat(copied.getData()).containsExactly(1, 2, 3);

        // Saving again is a second copy; the original is untouched.
        assertThat(recipeService.saveFromLink(token, partnersOther, partner.getId()).id()).isNotEqualTo(copy.id());
        assertThat(recipeService.get(original.id(), home, me.getId()).description()).isEqualTo("Thick and green");
    }

    @Test
    void publishingAnswersWithTheRecipeStillFiled() {
        UUID id = recipe(home, soup(null, null)).id();
        // The apps put this answer straight back on screen, and edit from it.
        RecipeResponse published = recipeService.setPublished(id, me.getId(), true);
        assertThat(published.published()).isTrue();
        assertThat(published.section()).isEqualTo(RecipeSection.LUNCH);
        assertThat(published.categories()).containsExactly("Soups");
    }

    @Test
    void theAttributionReadsOnceAndAfterNoFullStop() {
        assertThat(RecipeService.savedFromLink(null)).isEqualTo(RecipeService.SAVED_FROM_LINK + ".");
        assertThat(RecipeService.savedFromLink("Mum's Sunday lasagna."))
                .isEqualTo("Mum's Sunday lasagna · " + RecipeService.SAVED_FROM_LINK);
        String once = RecipeService.savedFromLink("Mum's Sunday lasagna");
        assertThat(RecipeService.savedFromLink(once)).isEqualTo(once);
        assertThat(RecipeService.savedFromLink(RecipeService.savedFromLink(" ")))
                .isEqualTo(RecipeService.SAVED_FROM_LINK + ".");
    }

    @Test
    void aCopyOnlyGoesIntoYourOwnHouseAndOnlyFromALiveLink() {
        UUID id = recipe(home, soup(null, null)).id();
        String token = linkService.createOrGet(id, me.getId());

        assertThatThrownBy(() -> recipeService.saveFromLink(token, strangers, me.getId()))
                .satisfies(e -> assertThat(status(e)).isEqualTo(403));
        assertThatThrownBy(() -> recipeService.saveFromLink("not-a-link", cabin, me.getId()))
                .satisfies(e -> assertThat(status(e)).isEqualTo(404));

        linkService.revoke(id, me.getId());
        assertThatThrownBy(() -> recipeService.saveFromLink(token, cabin, me.getId()))
                .satisfies(e -> assertThat(status(e)).isEqualTo(404));
    }
}
