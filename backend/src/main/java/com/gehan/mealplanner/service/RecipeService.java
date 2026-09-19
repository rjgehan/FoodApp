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

import java.util.ArrayList;
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
        recipe.setSourceUrl(request.sourceUrl());
        recipe.setVideoUrl(normalizeLink(request.videoUrl()));

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

    /** See {@link WebLinks}. */
    private static String normalizeLink(String raw) {
        return WebLinks.normalize(raw);
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

        // Everything that points at this recipe has to go first, or the delete fails on a
        // foreign key. Planned meals included: a slot naming a recipe that no longer exists
        // would be a row with nothing in it — invisible in the app, still in the database.
        shareRepository.deleteByRecipeId(recipeId);
        filingRepository.deleteByRecipeId(recipeId);
        linkRepository.deleteByRecipeId(recipeId);
        mealPlanEntryRepository.deleteByRecipeId(recipeId);
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
        return toCategoryResponse(categoryRepository.save(
                RecipeCategory.builder().household(household).name(name).section(section).parent(parent).build()), 0);
    }

    /** Rename a group, or move it inside another — never inside itself. */
    @Transactional
    public RecipeCategoryResponse updateCategory(UUID householdId, UUID categoryId, UUID requesterId,
                                                 UpdateCategoryRequest request) {
        householdService.assertMember(householdId, requesterId);
        RecipeCategory category = requireCategory(householdId, categoryId);

        if (request.name() != null) {
            category.setName(requireFreeName(householdId, request.name(), categoryId, category.getSection()));
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
                category.getParent() == null ? null : category.getParent().getId(), category.getSection());
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

    /** Gives a new household the starting groups so no drawer opens onto nothing. */
    @Transactional
    public void seedDefaultCategories(Household household) {
        seedDefaultGroups(household, categoryRepository);
    }

    /** Also called from HouseholdService, which makes households without going through here. */
    public static void seedDefaultGroups(Household household, RecipeCategoryRepository categories) {
        DEFAULT_GROUPS.forEach((section, groups) -> {
            for (DefaultGroup group : groups) {
                RecipeCategory parent = categories.save(
                        RecipeCategory.builder().household(household).name(group.name()).section(section).build());
                for (String child : group.children()) {
                    categories.save(RecipeCategory.builder()
                            .household(household).name(child).section(section).parent(parent).build());
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
