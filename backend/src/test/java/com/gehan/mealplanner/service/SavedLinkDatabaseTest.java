package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.HouseholdMember;
import com.gehan.mealplanner.domain.HouseholdRole;
import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.SavedLinkSource;
import com.gehan.mealplanner.domain.User;
import com.gehan.mealplanner.dto.HouseholdDtos.CreateHouseholdRequest;
import com.gehan.mealplanner.dto.MealPlanDtos.AddMealPlanEntryRequest;
import com.gehan.mealplanner.dto.MealPlanDtos.MealPlanEntryResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.dto.SavedLinkDtos.CreateSavedLinkRequest;
import com.gehan.mealplanner.dto.SavedLinkDtos.SavedLinkResponse;
import com.gehan.mealplanner.dto.SavedLinkDtos.UpdateSavedLinkRequest;
import com.gehan.mealplanner.repository.HouseholdMemberRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.SavedLinkRepository;
import com.gehan.mealplanner.repository.StoredImageRepository;
import com.gehan.mealplanner.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Saved links against the real database: who sees which, saving the same link twice, the name
 * when the page will not say, and what happens to a planned one when it goes — deleted, made
 * into a recipe, or its owner's account deleted. Every link here either comes with its name and
 * picture or points at a reserved address that never resolves, so nothing reaches the internet.
 * Rolled back after each test.
 */
@SpringBootTest
@Transactional
class SavedLinkDatabaseTest {

    private static final String REEL = "https://www.instagram.com/reel/abc/";
    private static final LocalDate TUESDAY = LocalDate.of(2031, 3, 4);

    @Autowired SavedLinkService savedLinkService;
    @Autowired MealPlanService mealPlanService;
    @Autowired RecipeService recipeService;
    @Autowired HouseholdService householdService;
    @Autowired ImageService imageService;
    @Autowired UserRepository userRepository;
    @Autowired HouseholdRepository householdRepository;
    @Autowired HouseholdMemberRepository memberRepository;
    @Autowired SavedLinkRepository linkRepository;
    @Autowired StoredImageRepository imageRepository;
    @Autowired EntityManager entityManager;

    private User me;
    private User partner;
    private User stranger;
    private UUID home;

    @BeforeEach
    void house() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        me = userRepository.save(User.builder().username("links-me-" + tag).displayName("Me").build());
        partner = userRepository.save(User.builder().username("links-partner-" + tag).displayName("Partner").build());
        stranger = userRepository.save(User.builder().username("links-stranger-" + tag).displayName("Stranger").build());
        home = householdService.create(me.getId(), new CreateHouseholdRequest("Home")).id();
        householdService.create(stranger.getId(), new CreateHouseholdRequest("Theirs"));
        memberRepository.save(HouseholdMember.builder()
                .household(householdRepository.findById(home).orElseThrow())
                .user(partner).role(HouseholdRole.MEMBER).build());
    }

    private UUID picture() {
        return imageService.store(home, "image/png", new byte[] {1, 2, 3}).getId();
    }

    private SavedLinkResponse save(User who, String url, String name, boolean personal) {
        return savedLinkService.create(home, who.getId(),
                new CreateSavedLinkRequest(url, name, null, personal, picture()));
    }

    private static int status(Throwable e) {
        return ((ResponseStatusException) e).getStatusCode().value();
    }

    @Test
    void justMeIsOnlyForWhoeverSavedIt() {
        SavedLinkResponse shared = save(me, REEL, "Pasta bake", false);
        SavedLinkResponse mine = save(me, "https://www.tiktok.com/@cook/video/1", "Secret cake", true);

        assertThat(savedLinkService.list(home, me.getId())).extracting(SavedLinkResponse::id)
                .containsExactlyInAnyOrder(shared.id(), mine.id());
        assertThat(savedLinkService.list(home, partner.getId())).extracting(SavedLinkResponse::id)
                .containsExactly(shared.id());
        assertThat(shared.source()).isEqualTo(SavedLinkSource.INSTAGRAM);
        assertThat(mine.source()).isEqualTo(SavedLinkSource.TIKTOK);

        // To anybody else it is not there at all — not "forbidden", which would say it exists.
        assertThatThrownBy(() -> savedLinkService.update(home, mine.id(), partner.getId(),
                new UpdateSavedLinkRequest("Mine now", null, null, null)))
                .satisfies(e -> assertThat(status(e)).isEqualTo(404));
        assertThatThrownBy(() -> savedLinkService.delete(home, mine.id(), partner.getId()))
                .satisfies(e -> assertThat(status(e)).isEqualTo(404));
        // And outside the house, nothing at all.
        assertThatThrownBy(() -> savedLinkService.list(home, stranger.getId()))
                .satisfies(e -> assertThat(status(e)).isEqualTo(403));

        // Only whoever saved a link can hide it from everyone else.
        assertThatThrownBy(() -> savedLinkService.update(home, shared.id(), partner.getId(),
                new UpdateSavedLinkRequest(null, null, null, true)))
                .satisfies(e -> assertThat(status(e)).isEqualTo(403));
        SavedLinkResponse renamed = savedLinkService.update(home, shared.id(), partner.getId(),
                new UpdateSavedLinkRequest("Pasta bake (the good one)", RecipeSection.DINNER, null, null));
        assertThat(renamed.name()).isEqualTo("Pasta bake (the good one)");
        assertThat(renamed.section()).isEqualTo(RecipeSection.DINNER);
        assertThat(renamed.mine()).isFalse();
        assertThat(savedLinkService.update(home, shared.id(), me.getId(),
                new UpdateSavedLinkRequest(null, null, true, null)).section()).isNull();
    }

    @Test
    void savingTheSameLinkAgainUpdatesTheOneAlreadyThere() {
        SavedLinkResponse first = save(me, REEL + "?igsh=one", "Pasta bake", false);
        SavedLinkResponse again = savedLinkService.create(home, partner.getId(),
                new CreateSavedLinkRequest("instagram.com/reel/abc?igsh=two", null, RecipeSection.DINNER, null, null));

        assertThat(again.id()).isEqualTo(first.id());
        assertThat(again.alreadySaved()).isTrue();
        assertThat(again.name()).isEqualTo("Pasta bake");
        assertThat(again.section()).isEqualTo(RecipeSection.DINNER);
        assertThat(savedLinkService.list(home, me.getId())).hasSize(1);

        // Somebody who cannot see a "just me" link saving the same thing gets their own.
        SavedLinkResponse hidden = save(me, "https://example.com/soup", "Soup", true);
        SavedLinkResponse theirs = save(partner, "https://example.com/soup/", "Soup", false);
        assertThat(theirs.id()).isNotEqualTo(hidden.id());
        assertThat(theirs.alreadySaved()).isFalse();
    }

    @Test
    void aPageThatSaysNothingIsStillSavedUnderItsSitesName() {
        SavedLinkResponse saved = savedLinkService.create(home, me.getId(),
                new CreateSavedLinkRequest("https://www.nothing.invalid/pasta", null, null, null, null));
        assertThat(saved.name()).isEqualTo("nothing.invalid");
        assertThat(saved.coverImageId()).isNull();
        assertThat(saved.source()).isEqualTo(SavedLinkSource.WEB);
        assertThat(saved.mine()).isTrue();
        assertThat(saved.savedByName()).isEqualTo("Me");
    }

    @Test
    void aPlannedLinkThatIsDeletedStaysOnThePlanByName() {
        SavedLinkResponse link = save(me, REEL, "Pasta bake", false);
        MealPlanEntryResponse planned = mealPlanService.add(home, partner.getId(), new AddMealPlanEntryRequest(
                TUESDAY, MealType.DINNER, null, null, null, null, null, null, null, link.id()));
        assertThat(planned.savedLinkId()).isEqualTo(link.id());
        assertThat(planned.savedLinkUrl()).isEqualTo(REEL);
        assertThat(planned.savedLinkImageId()).isEqualTo(link.coverImageId());
        // Named as a recipe too, for an app from before saved links.
        assertThat(planned.recipeName()).isEqualTo("Pasta bake");
        assertThat(planned.servings()).isNull();

        UUID picture = link.coverImageId();
        savedLinkService.delete(home, link.id(), me.getId());
        entityManager.flush();
        entityManager.clear();

        MealPlanEntryResponse after = mealPlanService.listRange(home, me.getId(), TUESDAY, TUESDAY).get(0);
        assertThat(after.savedLinkId()).isNull();
        assertThat(after.recipeDeleted()).isTrue();
        assertThat(after.recipeName()).isEqualTo("Pasta bake");
        assertThat(imageRepository.findById(picture)).isEmpty();
    }

    @Test
    void makingItARecipeMovesThePlanOverAndKeepsThePicture() {
        SavedLinkResponse link = save(me, REEL, "Pasta bake", false);
        mealPlanService.add(home, me.getId(), new AddMealPlanEntryRequest(
                TUESDAY, MealType.DINNER, null, null, null, null, null, null, null, link.id()));

        RecipeResponse recipe = recipeService.create(home, me.getId(), new RecipeRequest("Pasta bake", null, null,
                null, null, 4, null, null, null, RecipeSection.DINNER, List.of(), link.coverImageId(), null,
                List.of(new RecipeIngredientRequest("pasta", new BigDecimal("200"), "g", null, false)), link.id()));
        entityManager.flush();
        entityManager.clear();

        assertThat(linkRepository.findById(link.id())).isEmpty();
        assertThat(imageRepository.findById(link.coverImageId())).isPresent();
        MealPlanEntryResponse entry = mealPlanService.listRange(home, me.getId(), TUESDAY, TUESDAY).get(0);
        assertThat(entry.recipeId()).isEqualTo(recipe.id());
        assertThat(entry.savedLinkId()).isNull();
        assertThat(entry.recipeDeleted()).isFalse();
        assertThat(entry.servings()).isNotNull();
    }

    @Test
    void someoneElsesJustMeLinkCannotBePlanned() {
        SavedLinkResponse mine = save(me, REEL, "Pasta bake", true);
        assertThatThrownBy(() -> mealPlanService.add(home, partner.getId(), new AddMealPlanEntryRequest(
                TUESDAY, MealType.DINNER, null, null, null, null, null, null, null, mine.id())))
                .satisfies(e -> assertThat(status(e)).isEqualTo(404));
    }

    @Test
    void deletingAnAccountTakesItsJustMeLinksAndLeavesItsSharedOnes() {
        SavedLinkResponse shared = save(partner, REEL, "Pasta bake", false);
        SavedLinkResponse hidden = save(partner, "https://example.com/cake", "Cake", true);
        mealPlanService.add(home, partner.getId(), new AddMealPlanEntryRequest(
                TUESDAY, MealType.DINNER, null, null, null, null, null, null, null, hidden.id()));
        entityManager.flush();

        householdService.deleteAccount(partner.getId());
        entityManager.flush();
        entityManager.clear();

        List<SavedLinkResponse> left = savedLinkService.list(home, me.getId());
        assertThat(left).extracting(SavedLinkResponse::id).containsExactly(shared.id());
        assertThat(left.get(0).savedByName()).isNull();
        assertThat(linkRepository.findById(hidden.id())).isEmpty();
        assertThat(imageRepository.findById(hidden.coverImageId())).isEmpty();
        MealPlanEntryResponse entry = mealPlanService.listRange(home, me.getId(), TUESDAY, TUESDAY).get(0);
        assertThat(entry.recipeDeleted()).isTrue();
        assertThat(entry.recipeName()).isEqualTo("Cake");
    }

    @Test
    void deletingTheHouseholdTakesItsLinksAndTheirPictures() {
        SavedLinkResponse link = save(me, REEL, "Pasta bake", false);
        mealPlanService.add(home, me.getId(), new AddMealPlanEntryRequest(
                TUESDAY, MealType.DINNER, null, null, null, null, null, null, null, link.id()));
        entityManager.flush();

        householdService.delete(home, me.getId());
        entityManager.flush();
        entityManager.clear();

        assertThat(linkRepository.findById(link.id())).isEmpty();
        assertThat(imageRepository.findById(link.coverImageId())).isEmpty();
    }
}
