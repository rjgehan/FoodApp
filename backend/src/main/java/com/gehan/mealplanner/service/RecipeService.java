package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.RecipeCategory;
import com.gehan.mealplanner.domain.RecipeFiling;
import com.gehan.mealplanner.domain.RecipeIngredient;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.SectionIcon;
import com.gehan.mealplanner.domain.RecipeShare;
import com.gehan.mealplanner.domain.StoredImage;
import com.gehan.mealplanner.dto.HouseholdDtos.HouseholdResponse;
import com.gehan.mealplanner.dto.RecipeDtos.CreateCategoryRequest;
import com.gehan.mealplanner.dto.RecipeDtos.FilingRequest;
import com.gehan.mealplanner.dto.RecipeDtos.MoveRecipesRequest;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateCategoryRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeCategoryResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateImagesRequest;
import com.gehan.mealplanner.dto.RecipeDtos.ShareTargetResponse;
import com.gehan.mealplanner.dto.RecipeDtos.SourceLink;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateLinksRequest;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateSharesRequest;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateVideoRequest;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.RecipeCategoryRepository;
import com.gehan.mealplanner.repository.RecipeFilingRepository;
import com.gehan.mealplanner.repository.SectionIconRepository;
import com.gehan.mealplanner.repository.MealPlanEntryRepository;
import com.gehan.mealplanner.repository.RecipeLinkRepository;
import com.gehan.mealplanner.repository.RecipeRepository;
import com.gehan.mealplanner.repository.RecipeShareRepository;
import com.gehan.mealplanner.repository.StoredImageRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Comparator;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class RecipeService {

    /** A starting group, and the groups inside it. */
    public record DefaultGroup(String name, List<String> children) {
        DefaultGroup(String name) {
            this(name, List.of());
        }
    }

    /**
     * What a brand new household starts with, so no drawer opens onto nothing. Each drawer has its
     * own groups: Breakfast's "Main" is porridge, Dinner's is a roast, and they are separate rows.
     * A household renames, deletes and adds to these — they are a starting point, not a fixed list.
     */
    public static final Map<RecipeSection, List<DefaultGroup>> DEFAULT_GROUPS = Map.of(
            RecipeSection.BREAKFAST, List.of(new DefaultGroup("Main"), new DefaultGroup("Morning drinks"), new DefaultGroup("Fruit")),
            RecipeSection.LUNCH, List.of(new DefaultGroup("Main"), new DefaultGroup("Sandwiches"), new DefaultGroup("Side")),
            RecipeSection.DINNER, List.of(
                    new DefaultGroup("Main", List.of("Beef", "Chicken", "Pork", "Seafood")),
                    new DefaultGroup("Full meal"),
                    new DefaultGroup("Side"),
                    new DefaultGroup("Veggie")),
            RecipeSection.SNACKS, List.of(new DefaultGroup("Sweet"), new DefaultGroup("Savoury")),
            RecipeSection.DRINKS, List.of(new DefaultGroup("Cold"), new DefaultGroup("Hot")),
            RecipeSection.OTHER, List.of(new DefaultGroup("Sauces & dips"), new DefaultGroup("Baking")));

    private final RecipeRepository recipeRepository;
    private final RecipeCategoryRepository categoryRepository;
    private final RecipeFilingRepository filingRepository;
    private final StoredImageRepository imageRepository;
    private final RecipeShareRepository shareRepository;
    private final SectionIconRepository sectionIconRepository;
    private final HouseholdRepository householdRepository;
    private final RecipeLinkRepository linkRepository;
    private final MealPlanEntryRepository mealPlanEntryRepository;
    private final HouseholdService householdService;
    private final IngredientService ingredientService;

    public RecipeService(RecipeRepository recipeRepository,
                          RecipeCategoryRepository categoryRepository,
                          RecipeFilingRepository filingRepository,
                          StoredImageRepository imageRepository,
                          RecipeShareRepository shareRepository,
                          SectionIconRepository sectionIconRepository,
                          HouseholdRepository householdRepository,
                          RecipeLinkRepository linkRepository,
                          MealPlanEntryRepository mealPlanEntryRepository,
                          HouseholdService householdService,
                          IngredientService ingredientService) {
        this.recipeRepository = recipeRepository;
        this.categoryRepository = categoryRepository;
        this.filingRepository = filingRepository;
        this.imageRepository = imageRepository;
        this.shareRepository = shareRepository;
        this.sectionIconRepository = sectionIconRepository;
        this.householdRepository = householdRepository;
        this.linkRepository = linkRepository;
        this.mealPlanEntryRepository = mealPlanEntryRepository;
        this.householdService = householdService;
        this.ingredientService = ingredientService;
    }

    @Transactional
    public RecipeResponse create(UUID householdId, UUID requesterId, RecipeRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        Recipe recipe = Recipe.builder()
                .household(household)
                .name(request.name())
                .description(request.description())
                .instructions(request.instructions())
                .prepTimeMinutes(request.prepTimeMinutes())
                .cookTimeMinutes(request.cookTimeMinutes())
                .servings(request.servings())
                .build();

        applyLinks(recipe, request);
        applyImages(recipe, householdId, request.coverImageId(), request.photoIds());

        request.ingredients().forEach(i -> recipe.getIngredients().add(
                RecipeIngredient.builder()
                        .recipe(recipe)
                        .ingredient(ingredientService.findOrCreate(i.ingredientName(), i.unit()))
                        .quantity(i.quantity())
                        .unit(i.unit())
                        .notes(i.notes())
                        .optional(Boolean.TRUE.equals(i.optional()))
                        .build()));

        Recipe saved = recipeRepository.save(recipe);
        // Your own recipe is filed straight away — only other people's start out unfiled.
        RecipeFiling filing = upsertFiling(household, saved, request.section(), request.categories());
        return toResponse(saved, filing, householdId);
    }

    /**
     * Rewrites a recipe in place. Owner household only — a household you shared it with can file
     * it in their catalog but never change the recipe itself.
     *
     * Ingredients are replaced wholesale rather than diffed: they have no identity worth
     * preserving (no notes history, nothing references a row), and orphanRemoval cleans up the
     * old ones. Photos are left alone unless the caller sends a list, because the recipe form
     * does not manage the photo strip and would otherwise silently wipe it on every save.
     */
    @Transactional
    public RecipeResponse update(UUID recipeId, UUID requesterId, RecipeRequest request) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        UUID ownerId = recipe.getHousehold().getId();
        householdService.assertMember(ownerId, requesterId);

        recipe.setName(request.name());
        recipe.setDescription(request.description());
        recipe.setInstructions(request.instructions());
        recipe.setPrepTimeMinutes(request.prepTimeMinutes());
        recipe.setCookTimeMinutes(request.cookTimeMinutes());
        recipe.setServings(request.servings());
        applyLinks(recipe, request);

        recipe.setCoverImage(request.coverImageId() == null ? null
                : requireOwnImage(request.coverImageId(), ownerId));
        if (request.photoIds() != null) {
            List<StoredImage> photos = new ArrayList<>();
            for (UUID id : request.photoIds()) {
                if (id != null) {
                    photos.add(requireOwnImage(id, ownerId));
                }
            }
            recipe.getPhotos().clear();
            recipe.getPhotos().addAll(photos);
        }

        recipe.getIngredients().clear();
        request.ingredients().forEach(i -> recipe.getIngredients().add(
                RecipeIngredient.builder()
                        .recipe(recipe)
                        .ingredient(ingredientService.findOrCreate(i.ingredientName(), i.unit()))
                        .quantity(i.quantity())
                        .unit(i.unit())
                        .notes(i.notes())
                        .optional(Boolean.TRUE.equals(i.optional()))
                        .build()));

        Recipe saved = recipeRepository.save(recipe);
        RecipeFiling filing = upsertFiling(saved.getHousehold(), saved, request.section(), request.categories());
        return toResponse(saved, filing, ownerId);
    }

    /** A household's own recipes plus every recipe any household has published globally. */
    @Transactional(readOnly = true)
    public List<RecipeResponse> list(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Map<UUID, RecipeFiling> filings = filingRepository.findByHouseholdId(householdId).stream()
                .collect(Collectors.toMap(f -> f.getRecipe().getId(), Function.identity()));

        return recipeRepository.findVisibleTo(householdId).stream()
                .map(r -> toResponse(r, filings.get(r.getId()), householdId))
                .toList();
    }

    /**
     * householdId is optional: without it you get the recipe with no filing attached, which is
     * all an unscoped link can honestly say.
     */
    @Transactional(readOnly = true)
    public RecipeResponse get(UUID recipeId, UUID householdId, UUID requesterId) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        if (!isVisibleTo(recipe, householdId)) {
            householdService.assertMember(recipe.getHousehold().getId(), requesterId);
        }
        if (householdId == null) {
            return toResponse(recipe, null, recipe.getHousehold().getId());
        }
        householdService.assertMember(householdId, requesterId);
        return toResponse(recipe, filingRepository.findByHouseholdIdAndRecipeId(householdId, recipeId).orElse(null),
                householdId);
    }

    /**
     * The recipe as its own household sees it, filing and all, with no membership check — for
     * the admin pages only, which have already checked that the reader is the admin.
     */
    @Transactional(readOnly = true)
    public RecipeResponse asItsHouseholdSeesIt(Recipe recipe) {
        UUID ownerId = recipe.getHousehold().getId();
        return toResponse(recipe, filingRepository.findByHouseholdIdAndRecipeId(ownerId, recipe.getId()).orElse(null),
                ownerId);
    }

    /**
     * Moves a recipe into this household's catalog. The recipe itself is untouched, so filing
     * something another household shared with you neither needs nor grants edit rights over it.
     */
    @Transactional
    public RecipeResponse file(UUID householdId, UUID recipeId, UUID requesterId, FilingRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));

        if (!isVisibleTo(recipe, householdId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "That recipe isn't shared with you");
        }

        return toResponse(recipe, upsertFiling(household, recipe, request.section(), request.categories()), householdId);
    }

    /**
     * Sets or clears the video link — the first link that is a video, as the old single field
     * was. From before a recipe had many links; the other links are left where they are.
     */
    @Transactional
    public RecipeResponse updateVideo(UUID recipeId, UUID requesterId, UpdateVideoRequest request) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        UUID ownerId = recipe.getHousehold().getId();
        householdService.assertMember(ownerId, requesterId);

        String url = WebLinks.normalize(request.videoUrl());
        List<SourceLink> links = new ArrayList<>(SourceLinks.of(recipe));
        int video = -1;
        for (int i = 0; i < links.size() && video < 0; i++) {
            if (SourceLinks.isVideo(links.get(i).url())) video = i;
        }
        if (url == null) {
            if (video >= 0) links.remove(video);
        } else if (SourceLinks.isVideo(url) && video >= 0) {
            // A different video in the same place; the old one's name would be wrong for it.
            links.set(video, new SourceLink(url, null));
        } else {
            /*
             * The old box said "a TikTok (or any) video link". One on a site the app does not
             * know as a video site is added beside the video there is rather than swapped for
             * it — replacing a real TikTok with a page nobody can tell is a video lost both —
             * and named so it still reads as one.
             */
            links.add(new SourceLink(url, SourceLinks.isVideo(url) ? null : SourceLinks.VIDEO_LABEL));
        }
        SourceLinks.replace(recipe, SourceLinks.clean(links));
        Recipe saved = recipeRepository.save(recipe);
        return toResponse(saved, filingRepository.findByHouseholdIdAndRecipeId(ownerId, recipeId).orElse(null), ownerId);
    }

    /** Replaces every link on a recipe at once — the recipe page's own link editor. Owner only. */
    @Transactional
    public RecipeResponse updateLinks(UUID recipeId, UUID requesterId, UpdateLinksRequest request) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        UUID ownerId = recipe.getHousehold().getId();
        householdService.assertMember(ownerId, requesterId);

        SourceLinks.replace(recipe, SourceLinks.clean(request.links()));
        Recipe saved = recipeRepository.save(recipe);
        return toResponse(saved, filingRepository.findByHouseholdIdAndRecipeId(ownerId, recipeId).orElse(null), ownerId);
    }

    /**
     * A client that sends `links` is saying what the whole list is. One that does not — every
     * phone from before there were many — keeps what the recipe has, plus any single sourceUrl
     * or videoUrl it did send. Until this, a save from the phone quietly wiped both.
     */
    private static void applyLinks(Recipe recipe, RecipeRequest request) {
        List<SourceLink> links = request.links() != null
                ? SourceLinks.clean(request.links())
                : SourceLinks.withLegacy(SourceLinks.of(recipe), request.sourceUrl(), request.videoUrl());
        SourceLinks.replace(recipe, links);
    }

    /**
     * Recipes from before there were many links still have theirs in the old sourceUrl and
     * videoUrl columns. Each one with nothing in the new list gets them copied across, source
     * first. Text in those columns that was never a link — the paste flow once filled sourceUrl
     * with whatever followed "Source URL:", like "Adapted from Serious Eats" — cannot be a link,
     * so it goes on the end of the description, where the old page used to show it.
     *
     * And the importer used to put the page it read into the description, which left a bare
     * address where the line about the recipe goes. A description that is nothing but one
     * address becomes a link.
     *
     * Everything it moves is gone from where it was, so a second start finds nothing to do.
     * Returns how many recipes it changed.
     */
    @Transactional
    public int backfillSourceLinks() {
        int changed = 0;
        for (Recipe recipe : recipeRepository.findWithLinksToMove()) {
            boolean touched = false;
            String source = recipe.getSourceUrl();
            String video = recipe.getVideoUrl();
            if (source != null && !SourceLinks.isLink(source)) {
                recipe.setDescription(withNote(recipe.getDescription(), "Source", source));
                recipe.setSourceUrl(null);
                touched = true;
            }
            if (video != null && !SourceLinks.isLink(video)) {
                recipe.setDescription(withNote(recipe.getDescription(), "Video", video));
                recipe.setVideoUrl(null);
                touched = true;
            }
            if (recipe.getLinks().isEmpty()) {
                List<SourceLink> links = SourceLinks.fromLegacy(source, video);
                if (!links.isEmpty()) {
                    SourceLinks.replace(recipe, links);
                    touched = true;
                }
            }
            if (touched) {
                recipeRepository.save(recipe);
                changed++;
            }
        }
        for (Recipe recipe : recipeRepository.findWithDescriptionStartingHttp()) {
            String address = recipe.getDescription().trim();
            List<SourceLink> links = SourceLinks.of(recipe);
            if (address.chars().anyMatch(Character::isWhitespace) || !SourceLinks.isLink(address)
                    || links.size() >= SourceLinks.MAX_LINKS) {
                continue;
            }
            SourceLinks.replace(recipe, SourceLinks.withLegacy(links, address, null));
            recipe.setDescription(null);
            recipeRepository.save(recipe);
            changed++;
        }
        return changed;
    }

    /** "A line about it · Source: Adapted from Serious Eats". */
    private static String withNote(String description, String what, String note) {
        String line = what + ": " + note.trim();
        return description == null || description.isBlank() ? line : description.trim() + " · " + line;
    }

    /** Attaches a cover and photo strip. Only the owning household can change a recipe's pictures. */
    @Transactional
    public RecipeResponse updateImages(UUID recipeId, UUID requesterId, UpdateImagesRequest request) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        UUID ownerId = recipe.getHousehold().getId();
        householdService.assertMember(ownerId, requesterId);

        applyImages(recipe, ownerId, request.coverImageId(), request.photoIds());
        Recipe saved = recipeRepository.save(recipe);
        return toResponse(saved, filingRepository.findByHouseholdIdAndRecipeId(ownerId, recipeId).orElse(null), ownerId);
    }

    /** Images can only come from the household that owns the recipe, so one house cannot bind another's uploads. */
    private void applyImages(Recipe recipe, UUID householdId, UUID coverImageId, List<UUID> photoIds) {
        recipe.setCoverImage(coverImageId == null ? null : requireOwnImage(coverImageId, householdId));

        List<StoredImage> photos = new ArrayList<>();
        if (photoIds != null) {
            for (UUID id : photoIds) {
                if (id != null) {
                    photos.add(requireOwnImage(id, householdId));
                }
            }
        }
        recipe.getPhotos().clear();
        recipe.getPhotos().addAll(photos);
    }

    private StoredImage requireOwnImage(UUID imageId, UUID householdId) {
        StoredImage image = imageRepository.findById(imageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Image not found"));
        if (!image.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "That image belongs to another household");
        }
        return image;
    }

    /**
     * Which households this recipe could go to, and where it already is. Owner only.
     *
     * Only the houses the person asking is in, less the one that owns it. Sharing is handing a
     * recipe from one of your houses to another of yours; it used to list every household on
     * the server, which put the names of strangers' houses in front of anybody with a recipe.
     * Somebody outside all your houses gets the public link instead.
     */
    @Transactional(readOnly = true)
    public List<ShareTargetResponse> shareTargets(UUID recipeId, UUID requesterId) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        UUID ownerId = recipe.getHousehold().getId();
        householdService.assertMember(ownerId, requesterId);

        Set<UUID> already = sharedWith(recipeId);

        return householdService.listForUser(requesterId).stream()
                .filter(h -> !h.id().equals(ownerId))
                .sorted(Comparator.comparing(HouseholdResponse::name, String.CASE_INSENSITIVE_ORDER))
                .map(h -> new ShareTargetResponse(h.id(), h.name(), already.contains(h.id())))
                .toList();
    }

    /**
     * Sets which of your own houses this recipe is shared with. Only the owning household
     * decides who a recipe goes to.
     *
     * A share into a house you are not in was made by somebody else in the owning house — the
     * one who is in it — and is not yours to undo: you cannot see that house to know what taking
     * it away would do there. So shares are only added or removed among the asker's own houses,
     * and every other one is left exactly as it was, whether the request mentions it or not.
     * Mentioning one that is already there is allowed (an app from before this sends the whole
     * list back); asking to share into a house you are not in is refused.
     */
    @Transactional
    public RecipeResponse updateShares(UUID recipeId, UUID requesterId, UpdateSharesRequest request) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        UUID ownerId = recipe.getHousehold().getId();
        householdService.assertMember(ownerId, requesterId);

        Set<UUID> wanted = new LinkedHashSet<>();
        if (request.householdIds() != null) {
            request.householdIds().stream()
                    .filter(id -> id != null && !id.equals(ownerId))
                    .forEach(wanted::add);
        }
        List<RecipeShare> existing = shareRepository.findByRecipeId(recipeId);
        Set<UUID> already = existing.stream().map(sh -> sh.getHousehold().getId()).collect(Collectors.toSet());

        // Checked before anything changes, so a refused request leaves every share as it was.
        for (UUID targetId : wanted) {
            if (!already.contains(targetId) && !householdService.isMember(targetId, requesterId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "You can only share with a household you're in.");
            }
        }

        for (RecipeShare share : existing) {
            UUID target = share.getHousehold().getId();
            if (!wanted.contains(target) && householdService.isMember(target, requesterId)) {
                shareRepository.delete(share);
            }
        }
        for (UUID targetId : wanted) {
            if (!already.contains(targetId)) {
                Household target = householdRepository.findById(targetId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
                shareRepository.save(RecipeShare.builder().recipe(recipe).household(target).build());
            }
        }
        shareRepository.flush();
        return toResponse(recipe, filingRepository.findByHouseholdIdAndRecipeId(ownerId, recipeId).orElse(null), ownerId);
    }

    private Set<UUID> sharedWith(UUID recipeId) {
        return shareRepository.findByRecipeId(recipeId).stream()
                .map(sh -> sh.getHousehold().getId())
                .collect(Collectors.toSet());
    }

    /** What a copy kept from a public link says about where it came from. */
    static final String SAVED_FROM_LINK = "Saved from a shared link";

    /**
     * Keeps a copy of a recipe somebody sent as a public link, in one of your own houses.
     *
     * A copy rather than a share: the link is how a recipe reaches somebody outside every house
     * the sender is in, so there is no house-to-house share to make — and a copy stays theirs
     * when the sender edits the recipe, deletes it, or revokes the link. It carries what the link
     * shows — the name, method, ingredients, links and pictures — plus which drawer it goes in,
     * and never the house it came from, which the link has kept to itself all along. The description says it was
     * saved from a link, since that is all the saver was told.
     *
     * The pictures are copied too, not pointed at. A picture belongs to one house: the owning
     * house can delete it, deleting that house deletes all of them, and a recipe may only wear
     * its own house's pictures — so a copy leaning on the sender's would lose them the day the
     * sender tidied up.
     *
     * Saving the same link twice makes two copies, the same as typing it in twice would. The
     * app goes straight to the new one, so nobody is left wondering which is which.
     */
    @Transactional
    public RecipeResponse saveFromLink(String token, UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        Recipe source = linkRepository.findByToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That link isn't valid."))
                .getRecipe();

        Recipe copy = Recipe.builder()
                .household(household)
                .name(source.getName())
                .description(savedFromLink(source.getDescription()))
                .instructions(source.getInstructions())
                .prepTimeMinutes(source.getPrepTimeMinutes())
                .cookTimeMinutes(source.getCookTimeMinutes())
                .servings(source.getServings())
                .build();
        SourceLinks.replace(copy, SourceLinks.of(source));

        Map<UUID, StoredImage> copied = new HashMap<>();
        Function<StoredImage, StoredImage> copyImage = image -> copied.computeIfAbsent(image.getId(),
                id -> imageRepository.save(StoredImage.builder()
                        .household(household)
                        .contentType(image.getContentType())
                        .byteSize(image.getByteSize())
                        .data(image.getData())
                        .build()));
        if (source.getCoverImage() != null) {
            copy.setCoverImage(copyImage.apply(source.getCoverImage()));
        }
        source.getPhotos().forEach(photo -> copy.getPhotos().add(copyImage.apply(photo)));

        source.getIngredients().forEach(i -> copy.getIngredients().add(RecipeIngredient.builder()
                .recipe(copy)
                .ingredient(i.getIngredient())
                .quantity(i.getQuantity())
                .unit(i.getUnit())
                .notes(i.getNotes())
                .optional(i.isOptional())
                .build()));

        Recipe saved = recipeRepository.save(copy);
        // In the same drawer the sender keeps it in — Dinner stays Dinner — but in none of their
        // groups, which are named for a kitchen the saver has never seen. The drawer says what
        // kind of meal it is, not anything about the sender's house, so it is the one piece of
        // filing a copy carries (the public page itself still shows none of it).
        RecipeSection section = filingRepository
                .findByHouseholdIdAndRecipeId(source.getHousehold().getId(), source.getId())
                .map(RecipeFiling::getSection)
                .orElse(null);
        RecipeFiling filing = upsertFiling(household, saved, section, List.of());
        return toResponse(saved, filing, householdId);
    }

    /**
     * The description with where it came from on the end. A copy of a copy says it once: the
     * saver of a saved recipe was told no more than the first saver was.
     */
    static String savedFromLink(String description) {
        if (description == null || description.isBlank()) {
            return SAVED_FROM_LINK + ".";
        }
        String text = description.trim();
        if (text.endsWith(SAVED_FROM_LINK) || text.endsWith(SAVED_FROM_LINK + ".")) {
            return text;
        }
        // "Mum's Sunday lasagna." reads badly with " · Saved…" after its full stop.
        if (text.endsWith(".") && !text.endsWith("..")) {
            text = text.substring(0, text.length() - 1);
        }
        return text + " · " + SAVED_FROM_LINK;
    }

    private boolean isVisibleTo(Recipe recipe, UUID householdId) {
        if (householdId == null) {
            return false;
        }
        return recipe.isPublished()
                || recipe.getHousehold().getId().equals(householdId)
                || filingRepository.findByHouseholdIdAndRecipeId(householdId, recipe.getId()).isPresent()
                || shareRepository.findByRecipeId(recipe.getId()).stream()
                        .anyMatch(sh -> sh.getHousehold().getId().equals(householdId));
    }

    /**
     * Puts a recipe in Explore, or takes it back out. Only the household that owns it decides.
     * Taking it out is immediate for everyone who has not kept it; a household that filed it in
     * its own catalog keeps it there, and keeps reading it, until the owner deletes the recipe.
     */
    @Transactional
    public RecipeResponse setPublished(UUID recipeId, UUID requesterId, boolean published) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        householdService.assertMember(recipe.getHousehold().getId(), requesterId);

        recipe.setPublished(published);
        recipe.setPublishedAt(published ? Instant.now() : null);
        Recipe saved = recipeRepository.save(recipe);
        // With the owner's filing, as every other answer about its own recipe is: an app that
        // puts this straight back on screen would otherwise show it in no drawer and no group,
        // and the next edit would save it that way.
        UUID ownerId = recipe.getHousehold().getId();
        return toResponse(saved, filingRepository.findByHouseholdIdAndRecipeId(ownerId, recipeId).orElse(null), ownerId);
    }

    /**
     * Explore: what every household has published, newest first, with this household's own filing
     * attached so the page can say which ones you already keep.
     */
    @Transactional(readOnly = true)
    public List<RecipeResponse> listPublished(UUID householdId, UUID requesterId, String query) {
        householdService.assertMember(householdId, requesterId);
        String q = query == null ? "" : query.trim().toLowerCase();

        return recipeRepository.findByPublishedTrueOrderByPublishedAtDesc().stream()
                .filter(r -> q.isEmpty()
                        || r.getName().toLowerCase().contains(q)
                        || (r.getDescription() != null && r.getDescription().toLowerCase().contains(q))
                        || r.getIngredients().stream().anyMatch(i -> i.getIngredient().getName().toLowerCase().contains(q)))
                .map(r -> toResponse(r, filingRepository.findByHouseholdIdAndRecipeId(householdId, r.getId()).orElse(null),
                        householdId))
                .toList();
    }

    @Transactional
    public void delete(UUID recipeId, UUID requesterId) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        householdService.assertMember(recipe.getHousehold().getId(), requesterId);

        // Everything that points at this recipe has to go first, or the delete fails on a
        // foreign key. This household's own planned meals go with it: whoever is deleting it
        // was told so, and it is their plan. Another household that planned it — shared with
        // them, or kept from Explore — was told nothing, so their meal stays on the plan under
        // its name and marked as deleted, rather than silently leaving a gap in their week.
        UUID ownerId = recipe.getHousehold().getId();
        for (MealPlanEntry entry : mealPlanEntryRepository.findByRecipeId(recipeId)) {
            if (entry.getHousehold().getId().equals(ownerId)) {
                mealPlanEntryRepository.delete(entry);
            } else {
                entry.setRecipe(null);
                entry.setDeletedRecipeName(recipe.getName());
                // Chosen from this recipe's ingredients, which are about to go too.
                entry.getIncludedOptionalIngredientIds().clear();
            }
        }
        mealPlanEntryRepository.flush();
        shareRepository.deleteByRecipeId(recipeId);
        filingRepository.deleteByRecipeId(recipeId);
        linkRepository.deleteByRecipeId(recipeId);
        recipeRepository.delete(recipe);
    }

    @Transactional(readOnly = true)
    public List<RecipeCategoryResponse> listCategories(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        List<RecipeFiling> filings = filingRepository.findByHouseholdId(householdId);
        return categoryRepository.findByHouseholdIdOrderByNameAsc(householdId).stream()
                .map(c -> toCategoryResponse(c,
                        (int) filings.stream().filter(f -> f.getCategories().contains(c)).count()))
                .toList();
    }

    /** A new group from inside a drawer. Filing a recipe under a new name makes one too. */
    @Transactional
    public RecipeCategoryResponse createCategory(UUID householdId, UUID requesterId, CreateCategoryRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
        RecipeCategory parent = request.parentId() == null ? null : requireCategory(householdId, request.parentId());
        // A group inside another belongs to the same drawer as the one it sits in.
        RecipeSection section = parent != null ? parent.getSection() : request.section();
        String name = requireFreeName(householdId, request.name(), null, section);
        String iconKey = FoodIcons.requireKnownOrBlank(request.iconKey());
        return toCategoryResponse(categoryRepository.save(RecipeCategory.builder()
                .household(household).name(name).section(section).parent(parent).iconKey(iconKey).build()), 0);
    }

    /** Rename a group, change its icon, or move it inside another — never inside itself. */
    @Transactional
    public RecipeCategoryResponse updateCategory(UUID householdId, UUID categoryId, UUID requesterId,
                                                 UpdateCategoryRequest request) {
        householdService.assertMember(householdId, requesterId);
        RecipeCategory category = requireCategory(householdId, categoryId);

        if (request.name() != null) {
            category.setName(requireFreeName(householdId, request.name(), categoryId, category.getSection()));
        }
        // Null says nothing about the icon; "" is how the apps take one off.
        if (request.iconKey() != null) {
            category.setIconKey(FoodIcons.requireKnownOrBlank(request.iconKey()));
        }
        if (Boolean.TRUE.equals(request.toTop())) {
            category.setParent(null);
        } else if (request.parentId() != null) {
            RecipeCategory parent = requireCategory(householdId, request.parentId());
            // Inside itself, or inside one of its own groups, would make a loop with no top.
            for (RecipeCategory up = parent; up != null; up = up.getParent()) {
                if (up.getId().equals(categoryId)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A group can't go inside itself.");
                }
            }
            category.setParent(parent);
            // Moved into another drawer's group: it and everything inside it move with it.
            if (parent.getSection() != category.getSection()) {
                moveToSection(householdId, category, parent.getSection());
            }
        }

        RecipeCategory saved = categoryRepository.save(category);
        int count = (int) filingRepository.findByHouseholdId(householdId).stream()
                .filter(f -> f.getCategories().contains(saved)).count();
        return toCategoryResponse(saved, count);
    }

    /**
     * Files recipes into one group, in one go — how a drawer gets sorted: "these five are
     * Chicken". Taken out of `from` at the same time, so splitting Main dish up leaves them in
     * Chicken rather than in both. Recipes this household has not filed are skipped.
     */
    @Transactional
    public void moveRecipes(UUID householdId, UUID categoryId, UUID requesterId, MoveRecipesRequest request) {
        householdService.assertMember(householdId, requesterId);
        RecipeCategory target = requireCategory(householdId, categoryId);
        RecipeCategory from = request.fromCategoryId() == null ? null
                : requireCategory(householdId, request.fromCategoryId());

        for (UUID recipeId : request.recipeIds()) {
            filingRepository.findByHouseholdIdAndRecipeId(householdId, recipeId).ifPresent(filing -> {
                if (from != null) {
                    filing.getCategories().remove(from);
                }
                filing.getCategories().add(target);
                filingRepository.save(filing);
            });
        }
    }

    /**
     * Deletes a group without losing anything filed in it. Its own groups move up a level, and
     * its recipes move up to the group it was in — deleting Chicken leaves those recipes in Main
     * dish, not loose in the drawer.
     */
    @Transactional
    public void deleteCategory(UUID householdId, UUID categoryId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        RecipeCategory category = requireCategory(householdId, categoryId);
        RecipeCategory parent = category.getParent();

        categoryRepository.findByHouseholdIdOrderByNameAsc(householdId).stream()
                .filter(c -> c.getParent() != null && c.getParent().getId().equals(categoryId))
                .forEach(c -> c.setParent(parent));
        filingRepository.findByHouseholdId(householdId).forEach(f -> {
            if (f.getCategories().remove(category) && parent != null) {
                f.getCategories().add(parent);
            }
        });
        categoryRepository.delete(category);
    }

    private RecipeCategory requireCategory(UUID householdId, UUID categoryId) {
        RecipeCategory category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found"));
        if (!category.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found");
        }
        return category;
    }

    /**
     * Names stay unique in a household, because a recipe is filed by name — two groups called
     * Chicken would be one group as far as filing could tell. `self` is the group being renamed.
     */
    /** A drawer's own group and everything nested in it belong to that drawer. */
    private void moveToSection(UUID householdId, RecipeCategory category, RecipeSection section) {
        category.setSection(section);
        for (RecipeCategory child : categoryRepository.findByHouseholdIdOrderByNameAsc(householdId)) {
            if (child.getParent() != null && child.getParent().getId().equals(category.getId())) {
                moveToSection(householdId, child, section);
                categoryRepository.save(child);
            }
        }
    }

    private String requireFreeName(UUID householdId, String raw, UUID self, RecipeSection section) {
        String name = normalizeCategoryName(raw);
        if (name.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A group needs a name.");
        }
        // Only within the same drawer: Breakfast can have a Main even though Dinner has one.
        categoryRepository.findByHouseholdIdAndSectionAndNameIgnoreCase(householdId, section, name)
                .or(() -> categoryRepository.findByHouseholdIdAndSectionIsNullAndNameIgnoreCase(householdId, name))
                .filter(existing -> !existing.getId().equals(self))
                .ifPresent(existing -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "There's already a group called " + existing.getName() + ".");
                });
        return name;
    }

    private static RecipeCategoryResponse toCategoryResponse(RecipeCategory category, int recipeCount) {
        return new RecipeCategoryResponse(category.getId(), category.getName(), recipeCount,
                category.getParent() == null ? null : category.getParent().getId(), category.getSection(),
                category.getIconKey());
    }

    @Transactional(readOnly = true)
    public Map<RecipeSection, String> sectionIcons(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Map<RecipeSection, String> icons = new EnumMap<>(RecipeSection.class);
        sectionIconRepository.findByHouseholdId(householdId)
                .forEach(i -> icons.put(i.getSection(), i.getIconKey()));
        return icons;
    }

    /**
     * A blank key clears the choice and the drawer falls back to its built-in default. Checked
     * against the same list as a group's icon, so a drawer can never be given one no app can draw.
     */
    @Transactional
    public Map<RecipeSection, String> setSectionIcon(UUID householdId, UUID requesterId,
                                                      RecipeSection section, String requestedKey) {
        householdService.assertMember(householdId, requesterId);
        String iconKey = FoodIcons.requireKnownOrBlank(requestedKey);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        sectionIconRepository.findByHouseholdIdAndSection(householdId, section).ifPresentOrElse(
                existing -> {
                    if (iconKey == null) {
                        sectionIconRepository.delete(existing);
                    } else {
                        existing.setIconKey(iconKey);
                        sectionIconRepository.save(existing);
                    }
                },
                () -> {
                    if (iconKey != null) {
                        sectionIconRepository.save(SectionIcon.builder()
                                .household(household).section(section).iconKey(iconKey).build());
                    }
                });

        return sectionIcons(householdId, requesterId);
    }

    /** Gives a new household the starting groups so no drawer opens onto nothing. */
    @Transactional
    public void seedDefaultCategories(Household household) {
        seedDefaultGroups(household, categoryRepository);
    }

    /** Also called from HouseholdService, which makes households without going through here. */
    public static void seedDefaultGroups(Household household, RecipeCategoryRepository categories) {
        DEFAULT_GROUPS.forEach((section, groups) -> {
            for (DefaultGroup group : groups) {
                RecipeCategory parent = categories.save(RecipeCategory.builder()
                        .household(household).name(group.name()).section(section)
                        .iconKey(FoodIcons.DEFAULT_GROUP_ICONS.get(group.name())).build());
                for (String child : group.children()) {
                    categories.save(RecipeCategory.builder()
                            .household(household).name(child).section(section).parent(parent)
                            .iconKey(FoodIcons.DEFAULT_GROUP_ICONS.get(child)).build());
                }
            }
        });
    }

    private RecipeFiling upsertFiling(Household household, Recipe recipe,
                                       RecipeSection section, List<String> categoryNames) {
        RecipeFiling filing = filingRepository
                .findByHouseholdIdAndRecipeId(household.getId(), recipe.getId())
                .orElseGet(() -> RecipeFiling.builder().household(household).recipe(recipe).build());

        RecipeSection filed = section == null ? RecipeSection.OTHER : section;
        filing.setSection(filed);

        Set<RecipeCategory> resolved = new LinkedHashSet<>();
        if (categoryNames != null) {
            for (String raw : categoryNames) {
                String name = normalizeCategoryName(raw);
                if (!name.isEmpty()) {
                    resolved.add(findOrCreateCategory(household, name, filed));
                }
            }
        }
        filing.setCategories(resolved);
        return filingRepository.save(filing);
    }

    /**
     * The group of that name in this recipe's drawer, or the drawer-less one of that name, or a
     * new one in this drawer. Case-insensitive, so "Freezer" and "freezer" stay one group.
     */
    private RecipeCategory findOrCreateCategory(Household household, String name, RecipeSection section) {
        return categoryRepository.findByHouseholdIdAndSectionAndNameIgnoreCase(household.getId(), section, name)
                .or(() -> categoryRepository.findByHouseholdIdAndSectionIsNullAndNameIgnoreCase(household.getId(), name))
                .orElseGet(() -> categoryRepository.save(
                        RecipeCategory.builder().household(household).name(name).section(section).build()));
    }

    private static String normalizeCategoryName(String raw) {
        return raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
    }

    private RecipeResponse toResponse(Recipe recipe, RecipeFiling filing, UUID viewingHouseholdId) {
        List<RecipeIngredientResponse> ingredients = recipe.getIngredients().stream()
                .map(i -> new RecipeIngredientResponse(
                        i.getId(), i.getIngredient().getName(), i.getQuantity(), i.getUnit(), i.getNotes(), i.isOptional()))
                .toList();

        // Materialized here, not handed over live: Jackson serializes after the transaction closes.
        List<String> categories = filing == null ? List.of()
                : filing.getCategories().stream()
                        .map(RecipeCategory::getName)
                        .sorted(String.CASE_INSENSITIVE_ORDER)
                        .toList();

        List<SourceLink> links = SourceLinks.of(recipe);

        return new RecipeResponse(
                recipe.getId(), recipe.getHousehold().getId(), recipe.getName(), recipe.getDescription(),
                recipe.getInstructions(), recipe.getPrepTimeMinutes(), recipe.getCookTimeMinutes(),
                recipe.getServings(), SourceLinks.firstSource(links), SourceLinks.firstVideo(links), links,
                filing == null ? null : filing.getSection(), categories,
                !recipe.getHousehold().getId().equals(viewingHouseholdId),
                recipe.getHousehold().getName(),
                recipe.isPublished(),
                shareRepository.findByRecipeId(recipe.getId()).stream()
                        .map(sh -> sh.getHousehold().getId()).toList(),
                recipe.getCoverImage() == null ? null : recipe.getCoverImage().getId(),
                recipe.getPhotos().stream().map(StoredImage::getId).toList(),
                ingredients);
    }
}
