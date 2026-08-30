package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Recipe;
import com.gehan.mealplanner.domain.RecipeCategory;
import com.gehan.mealplanner.domain.RecipeFiling;
import com.gehan.mealplanner.domain.RecipeIngredient;
import com.gehan.mealplanner.domain.RecipeSection;
import com.gehan.mealplanner.domain.SectionIcon;
import com.gehan.mealplanner.domain.RecipeShare;
import com.gehan.mealplanner.domain.StoredImage;
import com.gehan.mealplanner.dto.RecipeDtos.FilingRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeCategoryResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeIngredientResponse;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeRequest;
import com.gehan.mealplanner.dto.RecipeDtos.RecipeResponse;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateImagesRequest;
import com.gehan.mealplanner.dto.RecipeDtos.ShareTargetResponse;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateSharesRequest;
import com.gehan.mealplanner.dto.RecipeDtos.UpdateVideoRequest;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.RecipeCategoryRepository;
import com.gehan.mealplanner.repository.RecipeFilingRepository;
import com.gehan.mealplanner.repository.SectionIconRepository;
import com.gehan.mealplanner.repository.RecipeRepository;
import com.gehan.mealplanner.repository.RecipeShareRepository;
import com.gehan.mealplanner.repository.StoredImageRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.EnumMap;
import java.util.Comparator;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class RecipeService {

    /** What a brand new household starts with, so the sub-category level is never empty. */
    public static final List<String> DEFAULT_CATEGORIES = List.of("Main dish", "Side", "Veggie", "Full meal");

    private final RecipeRepository recipeRepository;
    private final RecipeCategoryRepository categoryRepository;
    private final RecipeFilingRepository filingRepository;
    private final StoredImageRepository imageRepository;
    private final RecipeShareRepository shareRepository;
    private final SectionIconRepository sectionIconRepository;
    private final HouseholdRepository householdRepository;
    private final HouseholdService householdService;
    private final IngredientService ingredientService;

    public RecipeService(RecipeRepository recipeRepository,
                          RecipeCategoryRepository categoryRepository,
                          RecipeFilingRepository filingRepository,
                          StoredImageRepository imageRepository,
                          RecipeShareRepository shareRepository,
                          SectionIconRepository sectionIconRepository,
                          HouseholdRepository householdRepository,
                          HouseholdService householdService,
                          IngredientService ingredientService) {
        this.recipeRepository = recipeRepository;
        this.categoryRepository = categoryRepository;
        this.filingRepository = filingRepository;
        this.imageRepository = imageRepository;
        this.shareRepository = shareRepository;
        this.sectionIconRepository = sectionIconRepository;
        this.householdRepository = householdRepository;
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
                .sourceUrl(request.sourceUrl())
                .videoUrl(normalizeLink(request.videoUrl()))
                .build();

        applyImages(recipe, householdId, request.coverImageId(), request.photoIds());

        request.ingredients().forEach(i -> recipe.getIngredients().add(
                RecipeIngredient.builder()
                        .recipe(recipe)
                        .ingredient(ingredientService.findOrCreate(i.ingredientName(), i.unit()))
                        .quantity(i.quantity())
                        .unit(i.unit())
                        .notes(i.notes())
                        .build()));

        Recipe saved = recipeRepository.save(recipe);
        // Your own recipe is filed straight away — only other people's start out unfiled.
        RecipeFiling filing = upsertFiling(household, saved, request.section(), request.categories());
        return toResponse(saved, filing, householdId);
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

    /** Sets or clears the video link. Owner household only, same as the pictures. */
    @Transactional
    public RecipeResponse updateVideo(UUID recipeId, UUID requesterId, UpdateVideoRequest request) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        UUID ownerId = recipe.getHousehold().getId();
        householdService.assertMember(ownerId, requesterId);

        recipe.setVideoUrl(normalizeLink(request.videoUrl()));
        Recipe saved = recipeRepository.save(recipe);
        return toResponse(saved, filingRepository.findByHouseholdIdAndRecipeId(ownerId, recipeId).orElse(null), ownerId);
    }

    /**
     * Only http(s) survives. This link is rendered as an anchor, so letting through something like
     * a javascript: url would hand whoever saved it a script injection on everyone who opens the
     * recipe — including the households it was shared with.
     */
    private static String normalizeLink(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String trimmed = raw.trim();
        URI uri;
        try {
            uri = new URI(trimmed);
        } catch (URISyntaxException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That doesn't look like a link.");
        }
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Links must start with http:// or https://");
        }
        return trimmed;
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

    /** Which households this recipe could go to, and where it already is. Owner only. */
    @Transactional(readOnly = true)
    public List<ShareTargetResponse> shareTargets(UUID recipeId, UUID requesterId) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        UUID ownerId = recipe.getHousehold().getId();
        householdService.assertMember(ownerId, requesterId);

        Set<UUID> already = shareRepository.findByRecipeId(recipeId).stream()
                .map(sh -> sh.getHousehold().getId())
                .collect(Collectors.toSet());

        return householdRepository.findAll().stream()
                .filter(h -> !h.getId().equals(ownerId))
                .sorted(Comparator.comparing(Household::getName, String.CASE_INSENSITIVE_ORDER))
                .map(h -> new ShareTargetResponse(h.getId(), h.getName(), already.contains(h.getId())))
                .toList();
    }

    /** Only the owning household decides who a recipe goes to. */
    @Transactional
    public RecipeResponse updateShares(UUID recipeId, UUID requesterId, UpdateSharesRequest request) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        UUID ownerId = recipe.getHousehold().getId();
        householdService.assertMember(ownerId, requesterId);

        shareRepository.deleteAll(shareRepository.findByRecipeId(recipeId));
        if (request.householdIds() != null) {
            for (UUID targetId : request.householdIds()) {
                if (targetId == null || targetId.equals(ownerId)) {
                    continue;
                }
                Household target = householdRepository.findById(targetId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
                shareRepository.save(RecipeShare.builder().recipe(recipe).household(target).build());
            }
        }
        return toResponse(recipe, filingRepository.findByHouseholdIdAndRecipeId(ownerId, recipeId).orElse(null), ownerId);
    }

    private boolean isVisibleTo(Recipe recipe, UUID householdId) {
        if (householdId == null) {
            return false;
        }
        return recipe.getHousehold().getId().equals(householdId)
                || shareRepository.findByRecipeId(recipe.getId()).stream()
                        .anyMatch(sh -> sh.getHousehold().getId().equals(householdId));
    }

    @Transactional
    public void delete(UUID recipeId, UUID requesterId) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        householdService.assertMember(recipe.getHousehold().getId(), requesterId);
        shareRepository.deleteByRecipeId(recipeId);
        filingRepository.deleteByRecipeId(recipeId);
        recipeRepository.delete(recipe);
    }

    @Transactional(readOnly = true)
    public List<RecipeCategoryResponse> listCategories(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        List<RecipeFiling> filings = filingRepository.findByHouseholdId(householdId);
        return categoryRepository.findByHouseholdIdOrderByNameAsc(householdId).stream()
                .map(c -> new RecipeCategoryResponse(c.getId(), c.getName(),
                        (int) filings.stream().filter(f -> f.getCategories().contains(c)).count()))
                .toList();
    }

    /** Unlinks the category from every filing first, so the row can actually go. */
    @Transactional
    public void deleteCategory(UUID householdId, UUID categoryId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        RecipeCategory category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
        if (!category.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found");
        }
        filingRepository.findByHouseholdId(householdId).forEach(f -> f.getCategories().remove(category));
        categoryRepository.delete(category);
    }

    @Transactional(readOnly = true)
    public Map<RecipeSection, String> sectionIcons(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Map<RecipeSection, String> icons = new EnumMap<>(RecipeSection.class);
        sectionIconRepository.findByHouseholdId(householdId)
                .forEach(i -> icons.put(i.getSection(), i.getIconKey()));
        return icons;
    }

    /** A blank key clears the choice and the drawer falls back to its built-in default. */
    @Transactional
    public Map<RecipeSection, String> setSectionIcon(UUID householdId, UUID requesterId,
                                                      RecipeSection section, String iconKey) {
        householdService.assertMember(householdId, requesterId);
        Household household = householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));

        sectionIconRepository.findByHouseholdIdAndSection(householdId, section).ifPresentOrElse(
                existing -> {
                    if (iconKey == null || iconKey.isBlank()) {
                        sectionIconRepository.delete(existing);
                    } else {
                        existing.setIconKey(iconKey);
                        sectionIconRepository.save(existing);
                    }
                },
                () -> {
                    if (iconKey != null && !iconKey.isBlank()) {
                        sectionIconRepository.save(SectionIcon.builder()
                                .household(household).section(section).iconKey(iconKey).build());
                    }
                });

        return sectionIcons(householdId, requesterId);
    }

    /** Gives a new household the starting sub-categories so the second level is never blank. */
    @Transactional
    public void seedDefaultCategories(Household household) {
        DEFAULT_CATEGORIES.forEach(name -> findOrCreateCategory(household, name));
    }

    private RecipeFiling upsertFiling(Household household, Recipe recipe,
                                       RecipeSection section, List<String> categoryNames) {
        RecipeFiling filing = filingRepository
                .findByHouseholdIdAndRecipeId(household.getId(), recipe.getId())
                .orElseGet(() -> RecipeFiling.builder().household(household).recipe(recipe).build());

        filing.setSection(section == null ? RecipeSection.OTHER : section);

        Set<RecipeCategory> resolved = new LinkedHashSet<>();
        if (categoryNames != null) {
            for (String raw : categoryNames) {
                String name = normalizeCategoryName(raw);
                if (!name.isEmpty()) {
                    resolved.add(findOrCreateCategory(household, name));
                }
            }
        }
        filing.setCategories(resolved);
        return filingRepository.save(filing);
    }

    /** Case-insensitive match, so "Freezer" and "freezer" never become two categories. */
    private RecipeCategory findOrCreateCategory(Household household, String name) {
        return categoryRepository.findByHouseholdIdAndNameIgnoreCase(household.getId(), name)
                .orElseGet(() -> categoryRepository.save(
                        RecipeCategory.builder().household(household).name(name).build()));
    }

    private static String normalizeCategoryName(String raw) {
        return raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
    }

    private RecipeResponse toResponse(Recipe recipe, RecipeFiling filing, UUID viewingHouseholdId) {
        List<RecipeIngredientResponse> ingredients = recipe.getIngredients().stream()
                .map(i -> new RecipeIngredientResponse(
                        i.getId(), i.getIngredient().getName(), i.getQuantity(), i.getUnit(), i.getNotes()))
                .toList();

        // Materialized here, not handed over live: Jackson serializes after the transaction closes.
        List<String> categories = filing == null ? List.of()
                : filing.getCategories().stream()
                        .map(RecipeCategory::getName)
                        .sorted(String.CASE_INSENSITIVE_ORDER)
                        .toList();

        return new RecipeResponse(
                recipe.getId(), recipe.getHousehold().getId(), recipe.getName(), recipe.getDescription(),
                recipe.getInstructions(), recipe.getPrepTimeMinutes(), recipe.getCookTimeMinutes(),
                recipe.getServings(), recipe.getSourceUrl(), recipe.getVideoUrl(),
                filing == null ? null : filing.getSection(), categories,
                !recipe.getHousehold().getId().equals(viewingHouseholdId),
                shareRepository.findByRecipeId(recipe.getId()).stream()
                        .map(sh -> sh.getHousehold().getId()).toList(),
                recipe.getCoverImage() == null ? null : recipe.getCoverImage().getId(),
                recipe.getPhotos().stream().map(StoredImage::getId).toList(),
                ingredients);
    }
}
