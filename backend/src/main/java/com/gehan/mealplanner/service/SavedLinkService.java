package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.SavedLink;
import com.gehan.mealplanner.domain.StoredImage;
import com.gehan.mealplanner.dto.SavedLinkDtos.CreateSavedLinkRequest;
import com.gehan.mealplanner.dto.SavedLinkDtos.SavedLinkResponse;
import com.gehan.mealplanner.dto.SavedLinkDtos.UpdateSavedLinkRequest;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.MealPlanEntryRepository;
import com.gehan.mealplanner.repository.SavedLinkRepository;
import com.gehan.mealplanner.repository.StoredImageRepository;
import com.gehan.mealplanner.repository.UserRepository;
import com.gehan.mealplanner.service.RecipeImportService.Peek;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The household's list of links to try: a TikTok, a Reel, a recipe site — kept as a name, the
 * address and a picture, for the ones that are not (or not yet) a recipe.
 *
 * Everyone in the household sees a link unless whoever saved it marked it "just me". To anyone
 * else a "just me" link does not exist: asking for it by id is a 404, the same as a link that
 * never was, so its existence says nothing either.
 */
@Service
public class SavedLinkService {

    private final SavedLinkRepository linkRepository;
    private final HouseholdRepository householdRepository;
    private final UserRepository userRepository;
    private final StoredImageRepository imageRepository;
    private final MealPlanEntryRepository mealPlanEntryRepository;
    private final HouseholdService householdService;
    private final ImageService imageService;
    private final RecipeImportService importService;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public SavedLinkService(SavedLinkRepository linkRepository,
                            HouseholdRepository householdRepository,
                            UserRepository userRepository,
                            StoredImageRepository imageRepository,
                            MealPlanEntryRepository mealPlanEntryRepository,
                            HouseholdService householdService,
                            ImageService imageService,
                            RecipeImportService importService,
                            JdbcTemplate jdbc,
                            PlatformTransactionManager transactionManager) {
        this.linkRepository = linkRepository;
        this.householdRepository = householdRepository;
        this.userRepository = userRepository;
        this.imageRepository = imageRepository;
        this.mealPlanEntryRepository = mealPlanEntryRepository;
        this.householdService = householdService;
        this.imageService = imageService;
        this.importService = importService;
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    @Transactional(readOnly = true)
    public List<SavedLinkResponse> list(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return linkRepository.findVisible(householdId, requesterId).stream()
                .map(l -> toResponse(l, requesterId, false))
                .toList();
    }

    /**
     * Keeps a link. Only the address is needed: its page is read for a name and a picture, the
     * way an import reads it, and when that fails — the page will not load, or says nothing —
     * the link is kept anyway under the site's name. Saving is never refused over the extras.
     *
     * The same link saved again by somebody who can already see it updates that one rather
     * than making a second: sharing the same Reel twice from Instagram should not leave two.
     *
     * Not one transaction: reading the page can take seconds, and a database connection should
     * not be held open waiting on TikTok. The reading happens first, then the writing.
     */
    public SavedLinkResponse create(UUID householdId, UUID requesterId, CreateSavedLinkRequest request) {
        householdService.assertMember(householdId, requesterId);
        String url = SavedLinks.clean(request.url());
        String givenName = SavedLinks.tidyName(request.name());

        Optional<SavedLink> already = transaction.execute(status -> findSame(householdId, requesterId, url)
                .map(l -> {
                    // Loaded here, so the check below can look at it outside the transaction.
                    l.getCoverImage();
                    return l;
                }));
        boolean hasPicture = already.map(l -> l.getCoverImage() != null).orElse(false);

        boolean needName = givenName == null && already.isEmpty();
        boolean needPicture = request.coverImageId() == null && !hasPicture;
        Peek peek = needName || needPicture ? importService.peek(url) : Peek.NOTHING;
        UUID fetchedPicture = needPicture ? importService.fetchPicture(peek.pictureUrl())
                .map(p -> imageService.store(householdId, p.contentType(), p.bytes()).getId())
                .orElse(null) : null;

        return transaction.execute(status -> {
            UUID pictureId = request.coverImageId() != null ? request.coverImageId() : fetchedPicture;
            Optional<SavedLink> existing = findSame(householdId, requesterId, url);
            if (existing.isPresent()) {
                SavedLink link = existing.get();
                if (givenName != null) {
                    link.setName(givenName);
                }
                if (request.section() != null) {
                    link.setSection(request.section());
                }
                if (request.personal() != null && isMine(link, requesterId)) {
                    link.setPersonal(request.personal());
                }
                if (link.getCoverImage() == null && pictureId != null) {
                    link.setCoverImage(ownImage(pictureId, householdId));
                }
                link.setUpdatedAt(Instant.now());
                return toResponse(linkRepository.save(link), requesterId, true);
            }

            Household household = householdRepository.findById(householdId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
            String name = givenName != null ? givenName
                    : peek.title() != null ? peek.title()
                    : SavedLinks.fallbackName(url);
            SavedLink saved = linkRepository.save(SavedLink.builder()
                    .household(household)
                    .createdBy(userRepository.getReferenceById(requesterId))
                    .personal(Boolean.TRUE.equals(request.personal()))
                    .url(url)
                    .name(name)
                    .source(SavedLinks.sourceOf(url))
                    .coverImage(pictureId == null ? null : ownImage(pictureId, householdId))
                    .section(request.section())
                    .build());
            return toResponse(saved, requesterId, false);
        });
    }

    /** Rename it, move it to a drawer, or make it just yours — or everyone's again. */
    @Transactional
    public SavedLinkResponse update(UUID householdId, UUID linkId, UUID requesterId, UpdateSavedLinkRequest request) {
        SavedLink link = visible(householdId, linkId, requesterId);
        if (request.name() != null) {
            String name = SavedLinks.tidyName(request.name());
            if (name == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give it a name.");
            }
            link.setName(name);
        }
        if (Boolean.TRUE.equals(request.clearSection())) {
            link.setSection(null);
        } else if (request.section() != null) {
            link.setSection(request.section());
        }
        if (request.personal() != null && request.personal() != link.isPersonal()) {
            // Hiding somebody else's link from everyone but them — including from you, who
            // just asked — is not something anyone would mean to do.
            if (!isMine(link, requesterId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Only whoever saved it can make it just theirs.");
            }
            link.setPersonal(request.personal());
        }
        link.setUpdatedAt(Instant.now());
        return toResponse(linkRepository.save(link), requesterId, false);
    }

    /**
     * Deletes it, and its picture unless something else shows that too. A meal planned with it
     * stays on the plan under its name, marked as deleted — the same as a shared recipe whose
     * owners deleted it — rather than leaving a gap in the week nobody explained.
     */
    @Transactional
    public void delete(UUID householdId, UUID linkId, UUID requesterId) {
        SavedLink link = visible(householdId, linkId, requesterId);
        for (MealPlanEntry entry : mealPlanEntryRepository.findBySavedLinkId(linkId)) {
            entry.setSavedLink(null);
            entry.setDeletedRecipeName(link.getName());
            entry.setDeletedWasSavedLink(true);
        }
        remove(link);
    }

    /**
     * A recipe has been made from this link — imported after all, or typed out — so the link
     * has done its job and goes. Meals planned with it now have the recipe instead, so the
     * Tuesday you planned it for gets its ingredients. Its picture usually became the recipe's
     * cover, and stays for that.
     *
     * A link that is no longer there, or one this person cannot see, is let go of quietly: the
     * recipe is what they came to save.
     */
    @Transactional
    public void madeInto(Recipe recipe, UUID linkId, UUID requesterId) {
        UUID householdId = recipe.getHousehold().getId();
        Optional<SavedLink> found = linkRepository.findById(linkId).filter(l -> canSee(l, householdId, requesterId));
        if (found.isEmpty()) {
            return;
        }
        SavedLink link = found.get();
        for (MealPlanEntry entry : mealPlanEntryRepository.findBySavedLinkId(linkId)) {
            entry.setSavedLink(null);
            entry.setRecipe(recipe);
            if (entry.getServings() == null) {
                entry.setServings(recipe.getHousehold().getDefaultServings());
            }
        }
        remove(link);
    }

    /** One of the household's links, as this person sees it: someone else's "just me" is a 404. */
    @Transactional(readOnly = true)
    public SavedLink visible(UUID householdId, UUID linkId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return linkRepository.findById(linkId)
                .filter(l -> canSee(l, householdId, requesterId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Saved link not found"));
    }

    private void remove(SavedLink link) {
        StoredImage picture = link.getCoverImage();
        mealPlanEntryRepository.flush();
        linkRepository.delete(link);
        linkRepository.flush();
        if (picture != null) {
            SavedLinks.deleteUnusedImages(jdbc, List.of(picture.getId()));
        }
    }

    private Optional<SavedLink> findSame(UUID householdId, UUID requesterId, String url) {
        return linkRepository.findVisible(householdId, requesterId).stream()
                .filter(l -> SavedLinks.same(l.getUrl(), url))
                .findFirst();
    }

    private static boolean canSee(SavedLink link, UUID householdId, UUID userId) {
        return link.getHousehold().getId().equals(householdId) && (!link.isPersonal() || isMine(link, userId));
    }

    private static boolean isMine(SavedLink link, UUID userId) {
        return link.getCreatedBy() != null && link.getCreatedBy().getId().equals(userId);
    }

    private StoredImage ownImage(UUID imageId, UUID householdId) {
        StoredImage image = imageRepository.findById(imageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Image not found"));
        if (!image.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "That image belongs to another household");
        }
        return image;
    }

    private SavedLinkResponse toResponse(SavedLink link, UUID requesterId, boolean alreadySaved) {
        return new SavedLinkResponse(
                link.getId(),
                link.getUrl(),
                link.getName(),
                link.getSource(),
                link.getCoverImage() == null ? null : link.getCoverImage().getId(),
                link.getSection(),
                link.isPersonal(),
                isMine(link, requesterId),
                link.getCreatedBy() == null ? null : link.getCreatedBy().getDisplayName(),
                link.getCreatedAt(),
                alreadySaved);
    }
}
