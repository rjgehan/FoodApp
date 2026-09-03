package com.gehan.mealplanner.integration;

import com.gehan.mealplanner.domain.*;
import com.gehan.mealplanner.integration.IntegrationDtos.*;
import com.gehan.mealplanner.dto.GroceryListDtos.AddItemRequest;
import com.gehan.mealplanner.repository.*;
import com.gehan.mealplanner.service.GroceryListService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class IntegrationService {

    private final HouseholdRepository householdRepository;
    private final MealPlanEntryRepository mealPlanEntryRepository;
    private final RecipeRepository recipeRepository;
    private final RecipeFilingRepository filingRepository;
    private final GroceryListItemRepository groceryRepository;
    private final PlaceRepository placeRepository;
    private final GroceryListService groceryListService;

    public IntegrationService(HouseholdRepository householdRepository,
                              MealPlanEntryRepository mealPlanEntryRepository,
                              RecipeRepository recipeRepository,
                              RecipeFilingRepository filingRepository,
                              GroceryListItemRepository groceryRepository,
                              PlaceRepository placeRepository,
                              GroceryListService groceryListService) {
        this.householdRepository = householdRepository;
        this.mealPlanEntryRepository = mealPlanEntryRepository;
        this.recipeRepository = recipeRepository;
        this.filingRepository = filingRepository;
        this.groceryRepository = groceryRepository;
        this.placeRepository = placeRepository;
        this.groceryListService = groceryListService;
    }

    @Transactional(readOnly = true)
    public List<HouseholdSummary> households() {
        return householdRepository.findAll().stream()
                .sorted(Comparator.comparing(Household::getName, String.CASE_INSENSITIVE_ORDER))
                .map(h -> new HouseholdSummary(h.getId(), h.getName(), h.getDefaultServings()))
                .toList();
    }

    /** Days with nothing planned still appear, with an empty meal list — a calendar has gaps. */
    @Transactional(readOnly = true)
    public List<DayResponse> plan(UUID householdId, LocalDate start, LocalDate end) {
        requireHousehold(householdId);
        Map<LocalDate, List<MealPlanEntry>> byDate = new LinkedHashMap<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            byDate.put(d, new ArrayList<>());
        }
        mealPlanEntryRepository
                .findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(householdId, start, end)
                .forEach(e -> byDate.computeIfAbsent(e.getDate(), k -> new ArrayList<>()).add(e));

        return byDate.entrySet().stream().map(e -> new DayResponse(e.getKey(), meals(e.getValue()))).toList();
    }

    private List<MealResponse> meals(List<MealPlanEntry> entries) {
        Map<MealType, List<PlannedItem>> grouped = new LinkedHashMap<>();
        for (MealType type : MealType.values()) {
            List<PlannedItem> items = entries.stream()
                    .filter(e -> e.getMealType() == type)
                    .map(this::plannedItem)
                    .filter(i -> i.name() != null)
                    .toList();
            if (!items.isEmpty()) {
                grouped.put(type, items);
            }
        }
        return grouped.entrySet().stream().map(e -> new MealResponse(e.getKey(), e.getValue())).toList();
    }

    private PlannedItem plannedItem(MealPlanEntry entry) {
        Recipe recipe = entry.getRecipe();
        Place place = entry.getPlace();
        if (recipe != null) {
            return new PlannedItem("RECIPE", recipe.getName(), entry.getTime(), entry.getServings(), entry.getNotes(),
                    recipe.getId(), imageUrl(recipe.getCoverImage()), totalMinutes(recipe),
                    null, null, null);
        }
        if (place != null) {
            return new PlannedItem("PLACE", place.getName(), entry.getTime(), null, entry.getNotes(),
                    null, imageUrl(place.getImage()), null,
                    place.getId(), place.getMenuUrl(), place.getPhone());
        }
        return new PlannedItem(null, null, null, null, null, null, null, null, null, null, null);
    }

    @Transactional(readOnly = true)
    public List<RecipeSummary> recipes(UUID householdId, String query, RecipeSection section, String category) {
        requireHousehold(householdId);
        Map<UUID, RecipeFiling> filings = new LinkedHashMap<>();
        filingRepository.findByHouseholdId(householdId).forEach(f -> filings.put(f.getRecipe().getId(), f));

        String q = query == null ? null : query.trim().toLowerCase();

        return recipeRepository.findVisibleTo(householdId).stream()
                .map(r -> summary(r, filings.get(r.getId())))
                .filter(s -> section == null || s.section() == section)
                .filter(s -> category == null || s.categories().stream().anyMatch(c -> c.equalsIgnoreCase(category)))
                .filter(s -> q == null || q.isEmpty()
                        || s.name().toLowerCase().contains(q)
                        || (s.description() != null && s.description().toLowerCase().contains(q)))
                .sorted(Comparator.comparing(RecipeSummary::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    @Transactional(readOnly = true)
    public RecipeDetail recipe(UUID recipeId, UUID householdId) {
        Recipe recipe = recipeRepository.findById(recipeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Recipe not found"));
        RecipeFiling filing = householdId == null ? null
                : filingRepository.findByHouseholdIdAndRecipeId(householdId, recipeId).orElse(null);

        List<IngredientLine> ingredients = recipe.getIngredients().stream().map(i -> {
            String quantity = formatQuantity(i.getQuantity());
            String unit = i.getUnit() == null ? "" : i.getUnit();
            String name = i.getIngredient().getName();
            String text = (quantity + " " + unit).trim();
            text = (text.isEmpty() ? name : text + " " + name) + (i.getNotes() == null ? "" : ", " + i.getNotes());
            return new IngredientLine(name, quantity, i.getUnit(), i.getNotes(), text);
        }).toList();

        return new RecipeDetail(
                recipe.getId(), recipe.getName(), recipe.getDescription(),
                filing == null ? null : filing.getSection(), categories(filing),
                recipe.getServings(), recipe.getPrepTimeMinutes(), recipe.getCookTimeMinutes(),
                totalMinutes(recipe), imageUrl(recipe.getCoverImage()),
                recipe.getPhotos().stream().map(this::imageUrl).toList(),
                recipe.getSourceUrl(), recipe.getVideoUrl(), ingredients, steps(recipe.getInstructions()));
    }

    @Transactional(readOnly = true)
    public List<GroceryItem> groceries(UUID householdId) {
        requireHousehold(householdId);
        return groceryRepository.findByHouseholdId(householdId).stream()
                .map(i -> new GroceryItem(
                        i.getId(),
                        i.getIngredient() != null ? i.getIngredient().getName() : i.getCustomName(),
                        formatQuantity(i.getQuantity()), i.getUnit(), i.isChecked()))
                .sorted(Comparator.comparing(GroceryItem::checked)
                        .thenComparing(GroceryItem::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /**
     * Goes through GroceryListService rather than the repository so the websocket broadcast
     * fires: something added from a dashboard has to appear on the phone in the kitchen
     * straight away, not on the next refresh.
     */
    @Transactional
    public GroceryItem addGroceryItem(UUID householdId, AddGroceryItemRequest request) {
        requireHousehold(householdId);
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An item needs a name.");
        }
        var added = groceryListService.addItem(householdId,
                new AddItemRequest(request.name().trim(), request.quantity(), blankToNull(request.unit())));
        return new GroceryItem(added.id(), added.name(), formatQuantity(added.quantity()),
                added.unit(), added.checked());
    }

    /** No user is recorded as having ticked it — nobody in particular did. */
    @Transactional
    public GroceryItem setGroceryItemChecked(UUID householdId, UUID itemId, boolean checked) {
        requireHousehold(householdId);
        var updated = groceryListService.setChecked(householdId, itemId, checked, null);
        return new GroceryItem(updated.id(), updated.name(), formatQuantity(updated.quantity()),
                updated.unit(), updated.checked());
    }

    @Transactional
    public void removeGroceryItem(UUID householdId, UUID itemId) {
        requireHousehold(householdId);
        groceryListService.removeItem(householdId, itemId);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    @Transactional(readOnly = true)
    public List<PlaceSummary> places(UUID householdId) {
        requireHousehold(householdId);
        return placeRepository.findByHouseholdIdOrderByNameAsc(householdId).stream()
                .map(p -> new PlaceSummary(p.getId(), p.getName(), p.getMenuUrl(), p.getPhone(), p.getNotes(),
                        imageUrl(p.getImage())))
                .toList();
    }

    private RecipeSummary summary(Recipe recipe, RecipeFiling filing) {
        return new RecipeSummary(
                recipe.getId(), recipe.getName(), recipe.getDescription(),
                filing == null ? null : filing.getSection(), categories(filing),
                recipe.getServings(), recipe.getPrepTimeMinutes(), recipe.getCookTimeMinutes(),
                totalMinutes(recipe), imageUrl(recipe.getCoverImage()));
    }

    private List<String> categories(RecipeFiling filing) {
        return filing == null ? List.of()
                : filing.getCategories().stream().map(RecipeCategory::getName)
                        .sorted(String.CASE_INSENSITIVE_ORDER).toList();
    }

    private void requireHousehold(UUID householdId) {
        if (!householdRepository.existsById(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found");
        }
    }

    private static Integer totalMinutes(Recipe recipe) {
        int total = (recipe.getPrepTimeMinutes() == null ? 0 : recipe.getPrepTimeMinutes())
                + (recipe.getCookTimeMinutes() == null ? 0 : recipe.getCookTimeMinutes());
        return total > 0 ? total : null;
    }

    /** Relative on purpose: the caller knows which host it asked, and may be on a tailnet. */
    private String imageUrl(StoredImage image) {
        return image == null ? null : "/api/images/" + image.getId();
    }

    /** Same split the app itself uses: one step per line, any numbering the writer added removed. */
    private static List<String> steps(String instructions) {
        if (instructions == null || instructions.isBlank()) {
            return List.of();
        }
        return instructions.lines()
                .map(line -> line.trim().replaceFirst("^(\\d+[.)]|[-*•])\\s*", ""))
                .filter(line -> !line.isEmpty())
                .toList();
    }

    /** "0.50" reads like a spreadsheet; "½" reads like a recipe. Mirrors the web app. */
    private static final BigDecimal[] FRACTION_VALUES = {
            new BigDecimal("0.125"), new BigDecimal("0.25"), new BigDecimal("0.333"), new BigDecimal("0.375"),
            new BigDecimal("0.5"), new BigDecimal("0.625"), new BigDecimal("0.667"), new BigDecimal("0.75"),
            new BigDecimal("0.875")};
    private static final String[] FRACTION_GLYPHS = {"⅛", "¼", "⅓", "⅜", "½",
            "⅝", "⅔", "¾", "⅞"};

    static String formatQuantity(BigDecimal value) {
        if (value == null) {
            return null;
        }
        BigDecimal whole = new BigDecimal(value.toBigInteger());
        BigDecimal rest = value.subtract(whole);
        if (rest.compareTo(new BigDecimal("0.02")) < 0) {
            return whole.toBigInteger().toString();
        }
        for (int i = 0; i < FRACTION_VALUES.length; i++) {
            if (rest.subtract(FRACTION_VALUES[i]).abs().compareTo(new BigDecimal("0.02")) < 0) {
                String glyph = FRACTION_GLYPHS[i];
                return whole.signum() == 0 ? glyph : whole.toBigInteger() + glyph;
            }
        }
        return value.setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
    }
}
