package com.gehan.mealplanner.service;

import com.gehan.mealplanner.ai.StoreSectionAi;
import com.gehan.mealplanner.domain.*;
import com.gehan.mealplanner.dto.GroceryListDtos.AddItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;
import com.gehan.mealplanner.dto.GroceryListDtos.PutAwayRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.SortResponse;
import com.gehan.mealplanner.realtime.GroceryListEventPublisher;
import com.gehan.mealplanner.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class GroceryListService {

    private final GroceryListItemRepository groceryListItemRepository;
    private final MealPlanEntryRepository mealPlanEntryRepository;
    private final HouseholdRepository householdRepository;
    private final UserRepository userRepository;
    private final IngredientRepository ingredientRepository;
    private final CupboardItemRepository cupboardRepository;
    private final HouseholdService householdService;
    private final IngredientService ingredientService;
    private final IngredientSections ingredientSections;
    private final StoreSectionAi sectionAi;
    private final GroceryListEventPublisher eventPublisher;

    public GroceryListService(GroceryListItemRepository groceryListItemRepository,
                               MealPlanEntryRepository mealPlanEntryRepository,
                               HouseholdRepository householdRepository,
                               UserRepository userRepository,
                               IngredientRepository ingredientRepository,
                               CupboardItemRepository cupboardRepository,
                               HouseholdService householdService,
                               IngredientService ingredientService,
                               IngredientSections ingredientSections,
                               StoreSectionAi sectionAi,
                               GroceryListEventPublisher eventPublisher) {
        this.groceryListItemRepository = groceryListItemRepository;
        this.mealPlanEntryRepository = mealPlanEntryRepository;
        this.householdRepository = householdRepository;
        this.userRepository = userRepository;
        this.ingredientRepository = ingredientRepository;
        this.cupboardRepository = cupboardRepository;
        this.householdService = householdService;
        this.ingredientService = ingredientService;
        this.ingredientSections = ingredientSections;
        this.sectionAi = sectionAi;
        this.eventPublisher = eventPublisher;
    }

    /**
     * What an item's response needs beyond the item: this household's category corrections, its
     * live category list (for resolving a keyword/Gemini guess into one of them), and its
     * cupboard. Loaded once per request instead of once per item.
     */
    private record Context(Map<UUID, GroceryCategory> sections, List<GroceryCategory> categories,
                            Map<UUID, CupboardItem> cupboard) {

        boolean isStaple(Ingredient ingredient) {
            CupboardItem item = cupboard.get(ingredient.getId());
            return item != null && item.isStaple();
        }

        /** Enough to count on: in the cupboard, not running low, and not counted down to zero. */
        boolean has(Ingredient ingredient) {
            CupboardItem item = cupboard.get(ingredient.getId());
            return item != null && !item.isShort();
        }
    }

    private Context context(UUID householdId) {
        Map<UUID, CupboardItem> cupboard = new HashMap<>();
        cupboardRepository.findByHouseholdId(householdId).forEach(c -> cupboard.put(c.getIngredient().getId(), c));
        return new Context(ingredientSections.overrides(householdId), ingredientSections.categories(householdId), cupboard);
    }

    @Transactional(readOnly = true)
    public List<GroceryListItemResponse> listItems(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Context ctx = context(householdId);
        return groceryListItemRepository.findByHouseholdId(householdId).stream()
                .map(item -> toItemResponse(item, ctx))
                .toList();
    }

    @Transactional
    public GroceryListItemResponse addManualItem(UUID householdId, UUID requesterId, AddItemRequest request) {
        householdService.assertMember(householdId, requesterId);
        return addItem(householdId, request);
    }

    /**
     * The same add with no user behind it, for the integration API. Kept here rather than
     * reimplemented by the caller so the websocket broadcast still fires — a dashboard adding
     * milk has to show up on the phone in the kitchen without a refresh.
     */
    @Transactional
    public GroceryListItemResponse addItem(UUID householdId, AddItemRequest request) {
        Household household = locked(householdId);
        String unit = blankToNull(request.unit());
        Ingredient ingredient = request.ingredientName() != null
                ? ingredientService.findOrCreate(request.ingredientName(), unit)
                : null;

        GroceryListItem item = ingredient != null
                ? addTo(household, ingredient, request.quantity(), unit, request.ingredientName())
                : groceryListItemRepository.save(GroceryListItem.builder()
                        .household(household)
                        .quantity(request.quantity())
                        .unit(unit)
                        .askedFor(true)
                        .build());

        GroceryListItemResponse response = toItemResponse(item, context(householdId));
        eventPublisher.itemChanged(householdId, response);
        return response;
    }

    /**
     * Something asked for by name goes onto the row already waiting for it, if there is one —
     * "milk" typed twice, or typed once as "Milk", is one row of milk. Amounts in the same unit
     * add up. No amount says only "we need some", which a row that is already there says too;
     * an amount can fill in a row that had none. Two amounts in units that do not add up —
     * "2 l" and "1 gallon" — stay two rows, as a planned meal's would, rather than one number
     * that is wrong. Unticked rows only: adding to something already in the cart would hide the
     * new need behind a tick.
     *
     * Whichever row it lands on is marked as asked for, so a meal leaving the plan later does
     * not take it off — see {@link #takeShare}.
     */
    private GroceryListItem addTo(Household household, Ingredient ingredient, BigDecimal quantity, String unit,
                                  String typedName) {
        List<GroceryListItem> waiting = groceryListItemRepository
                .findByHouseholdIdAndIngredientIdAndCheckedFalse(household.getId(), ingredient.getId()).stream()
                .sorted(Comparator.comparing(GroceryListItem::getCreatedAt))
                .toList();
        Optional<GroceryListItem> sameUnit = waiting.stream()
                .filter(row -> IngredientLine.sameUnit(row.getUnit(), unit))
                .findFirst();

        if (quantity == null) {
            if (!waiting.isEmpty()) {
                return askedFor(sameUnit.orElse(waiting.get(0)));
            }
        } else if (sameUnit.isPresent()) {
            GroceryListItem row = sameUnit.get();
            row.setQuantity(row.getQuantity() == null ? quantity : row.getQuantity().add(quantity));
            return askedFor(row);
        } else {
            Optional<GroceryListItem> noAmount = waiting.stream()
                    .filter(row -> row.getQuantity() == null && row.getUnit() == null)
                    .findFirst();
            if (noAmount.isPresent()) {
                noAmount.get().setQuantity(quantity);
                noAmount.get().setUnit(unit);
                return askedFor(noAmount.get());
            }
        }
        return groceryListItemRepository.save(GroceryListItem.builder()
                .household(household)
                .ingredient(ingredient)
                .customName(typedName)
                .quantity(quantity)
                .unit(unit)
                .askedFor(true)
                .build());
    }

    private GroceryListItem askedFor(GroceryListItem row) {
        row.setAskedFor(true);
        return groceryListItemRepository.save(row);
    }

    /**
     * The cupboard's Buy again: on the list, unless it is already there waiting — so two phones
     * doing it at once still means one row. No amount: you know how many you buy.
     */
    @Transactional
    public void ensureOnList(UUID householdId, UUID ingredientId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Household household = locked(householdId);
        Ingredient ingredient = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ingredient not found"));
        ensureOnList(household, ingredient);
    }

    private void ensureOnList(Household household, Ingredient ingredient) {
        List<GroceryListItem> waiting = groceryListItemRepository
                .findByHouseholdIdAndIngredientIdAndCheckedFalse(household.getId(), ingredient.getId());
        if (!waiting.isEmpty()) {
            // Already there for a meal, maybe — now it is wanted whatever the meal does.
            askedFor(waiting.get(0));
            return;
        }
        GroceryListItem item = groceryListItemRepository.save(GroceryListItem.builder()
                .household(household)
                .ingredient(ingredient)
                .askedFor(true)
                .build());
        eventPublisher.itemChanged(household.getId(), toItemResponse(item, context(household.getId())));
    }

    /** Toggles an item's checked state and broadcasts the change to everyone watching this list in real time. */
    @Transactional
    public GroceryListItemResponse setChecked(UUID householdId, UUID itemId, UUID requesterId, boolean checked) {
        householdService.assertMember(householdId, requesterId);
        return setChecked(householdId, itemId, checked, userRepository.findById(requesterId).orElse(null));
    }

    /** `by` is null when nobody in particular did it — a dashboard, say. */
    @Transactional
    public GroceryListItemResponse setChecked(UUID householdId, UUID itemId, boolean checked, User by) {
        locked(householdId);
        GroceryListItem item = findItem(householdId, itemId);

        item.setChecked(checked);
        if (checked) {
            item.setCheckedBy(by);
            item.setCheckedAt(Instant.now());
        } else {
            item.setCheckedBy(null);
            item.setCheckedAt(null);
        }

        item = groceryListItemRepository.save(item);
        GroceryListItemResponse response = toItemResponse(item, context(householdId));
        eventPublisher.itemChanged(householdId, response);
        return response;
    }

    @Transactional
    public void removeItem(UUID householdId, UUID itemId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        removeItem(householdId, itemId);
    }

    @Transactional
    public void removeItem(UUID householdId, UUID itemId) {
        locked(householdId);
        GroceryListItem item = findItem(householdId, itemId);
        groceryListItemRepository.delete(item);
        eventPublisher.itemRemoved(householdId, itemId);
    }

    /**
     * "Done shopping": everything named comes off the list, and the `putAway` ones are marked as
     * in the cupboard. Deciding what was for someone else here, at the moment you know, beats
     * deleting it from the cupboard days later. Ids already gone — someone else pressed it on
     * their phone a second earlier — are skipped rather than failing the whole thing. The lock
     * is what makes that true when both presses land together: the second waits for the first
     * to finish, then finds nothing left to take off, instead of both taking the same row.
     */
    @Transactional
    public void putAway(UUID householdId, UUID requesterId, PutAwayRequest request) {
        householdService.assertMember(householdId, requesterId);
        Household household = locked(householdId);
        if (request.leaveOut() != null) {
            request.leaveOut().forEach(id -> takeOff(householdId, id, null));
        }
        if (request.putAway() != null) {
            request.putAway().forEach(id -> takeOff(householdId, id, household));
        }
    }

    private void takeOff(UUID householdId, UUID itemId, Household stockInto) {
        groceryListItemRepository.findById(itemId)
                .filter(item -> item.getHousehold().getId().equals(householdId))
                .ifPresent(item -> {
                    if (stockInto != null && item.getIngredient() != null) {
                        stock(stockInto, item);
                    }
                    groceryListItemRepository.delete(item);
                    eventPublisher.itemRemoved(householdId, itemId);
                });
    }

    /**
     * Just bought: in the cupboard, and no longer running low if it was. Something the cupboard
     * counts goes up by what was bought, when the list said how much in the same unit — 1 lb of
     * chicken and 2 lb bought is 3 lb. Bought without an amount, or in a unit the count is not
     * kept in, the count stays as it was: a guess would be a number nobody can trust, and the
     * cupboard's − and + are there to put it right.
     */
    private void stock(Household household, GroceryListItem bought) {
        Ingredient ingredient = bought.getIngredient();
        CupboardItem item = cupboardRepository.findByHouseholdIdAndIngredientId(household.getId(), ingredient.getId())
                .orElseGet(() -> CupboardItem.builder().household(household).ingredient(ingredient).build());
        item.setRunningLow(false);
        if (item.getQuantity() != null && bought.getQuantity() != null
                && IngredientLine.sameUnit(item.getUnit(), bought.getUnit())) {
            item.setQuantity(item.getQuantity().add(bought.getQuantity()));
        }
        cupboardRepository.save(item);
    }

    /**
     * One planned entry, on purpose. For a single item this is the only way onto the list —
     * planning eggs for breakfast says nothing about needing to buy eggs, so the week and day
     * buttons leave items alone. Asked for by hand, it goes on even if the cupboard has some.
     *
     * Asked for by hand, what counts as already added is what is on the list for the meal right
     * now, ticked or not. Anything of it bought and put away, or swiped off, since goes back on:
     * pressing this on one meal says "I want its things", where the week's button only means
     * "catch the list up with the plan". Pressed twice, the second finds everything there.
     */
    @Transactional
    public List<GroceryListItemResponse> addMealToList(UUID householdId, UUID mealPlanEntryId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Household household = locked(householdId);

        MealPlanEntry entry = mealPlanEntryRepository.findById(mealPlanEntryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Meal plan entry not found"));
        if (!entry.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Meal plan entry not found");
        }
        Context ctx = context(householdId);
        ListChanges changes = new ListChanges(groceryListItemRepository.findByHouseholdId(householdId));
        addRecipe(household, entry, ctx, changes, onList(entry, changes));
        if (entry.getItem() != null) {
            // No amount, so asking twice is still one row of eggs.
            changes.save(addTo(household, entry.getItem(), null, null, null));
        }
        return changes.publish(householdId, ctx);
    }

    /**
     * Adds the meals planned in the date range. Meals only: single items have their own button.
     * Safe to press again, even after shopping: each meal only adds what it needs beyond what it
     * has added before. See {@link #addRecipe}.
     */
    @Transactional
    public List<GroceryListItemResponse> addAllPlannedToList(UUID householdId, UUID requesterId,
                                                               LocalDate start, LocalDate end) {
        householdService.assertMember(householdId, requesterId);
        Household household = locked(householdId);
        Context ctx = context(householdId);

        ListChanges changes = new ListChanges(groceryListItemRepository.findByHouseholdId(householdId));
        mealPlanEntryRepository.findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(householdId, start, end)
                .forEach(e -> addRecipe(household, e, ctx, changes, remembered(e)));
        return changes.publish(householdId, ctx);
    }

    /** One ingredient in one unit — "cloves of garlic" — which is what a planned meal's share is counted in. */
    private record Need(Ingredient ingredient, String unit, BigDecimal quantity) {
        UnitKey key() {
            return UnitKey.of(ingredient, unit);
        }
    }

    private record UnitKey(UUID ingredientId, String unit) {
        static UnitKey of(Ingredient ingredient, String unit) {
            return new UnitKey(ingredient.getId(), IngredientLine.canonicalUnit(unit));
        }

        boolean matches(GroceryListItem row) {
            return row.getIngredient() != null && row.getIngredient().getId().equals(ingredientId)
                    && IngredientLine.sameUnit(row.getUnit(), unit);
        }
    }

    /**
     * The household's list as one request changes it: every row loaded once, and every row
     * touched sent to the other phones once at the end, however many meals touched it.
     */
    private final class ListChanges {
        final List<GroceryListItem> rows;
        final Set<GroceryListItem> changed = new LinkedHashSet<>();
        final List<UUID> removed = new ArrayList<>();

        ListChanges(List<GroceryListItem> rows) {
            this.rows = rows.stream().sorted(Comparator.comparing(GroceryListItem::getCreatedAt))
                    .collect(Collectors.toCollection(ArrayList::new));
        }

        void save(GroceryListItem row) {
            changed.add(groceryListItemRepository.save(row));
        }

        void delete(GroceryListItem row) {
            rows.remove(row);
            changed.remove(row);
            groceryListItemRepository.delete(row);
            removed.add(row.getId());
        }

        List<GroceryListItemResponse> publish(UUID householdId, Context ctx) {
            removed.forEach(id -> eventPublisher.itemRemoved(householdId, id));
            List<GroceryListItemResponse> responses = changed.stream().map(row -> toItemResponse(row, ctx)).toList();
            responses.forEach(response -> eventPublisher.itemChanged(householdId, response));
            return responses;
        }
    }

    /** What the week's button has put on the list for this meal before, whatever became of it since. */
    private static Map<UnitKey, BigDecimal> remembered(MealPlanEntry entry) {
        Map<UnitKey, BigDecimal> added = new HashMap<>();
        entry.getAddedToGroceries().forEach(share ->
                added.merge(new UnitKey(share.getIngredientId(), share.getUnit()), share.getQuantity(), BigDecimal::add));
        return added;
    }

    /** What is on the list for this meal right now, ticked rows included. */
    private static Map<UnitKey, BigDecimal> onList(MealPlanEntry entry, ListChanges changes) {
        Map<UnitKey, BigDecimal> added = new HashMap<>();
        for (GroceryListItem row : changes.rows) {
            BigDecimal share = row.getFromMeals().get(entry.getId());
            if (share != null && row.getIngredient() != null) {
                added.merge(UnitKey.of(row.getIngredient(), row.getUnit()), share, BigDecimal::add);
            }
        }
        return added;
    }

    /**
     * A planned recipe's ingredients. Anything else — a night out, a single item — adds nothing
     * here, but does take back what the recipe once in its slot put on the list.
     *
     * The list is brought up to what the meal needs now, not added to blindly. {@code already}
     * is what the meal counts as having added: a meal already added adds nothing again, one
     * whose servings went up adds only the extra, and one whose servings went down takes the
     * difference back off. An ingredient the meal no longer uses — an optional one dropped, a
     * staple now always kept, a different recipe in the slot — comes back off entirely, and its
     * row goes if nothing else wanted it. Only unticked rows are taken from: what is in the cart
     * has been bought, so it still counts as added, and turning servings back up later does not
     * ask for it twice. What the meal ends up counting as added is remembered on the entry.
     */
    private void addRecipe(Household household, MealPlanEntry entry, Context ctx, ListChanges changes,
                           Map<UnitKey, BigDecimal> already) {
        // A shared recipe its owners deleted: the meal is still planned and may well still be
        // cooked from memory, so what it put on the list stays. Nothing is known to add, and
        // taking the leeks back off because somebody else tidied their recipes would be a
        // surprise at the shop. Changing the slot to something else settles up as usual.
        if (entry.getRecipe() == null && entry.getDeletedRecipeName() != null) {
            return;
        }
        Map<UnitKey, Need> needs = entry.getRecipe() == null ? Map.of() : needs(entry.getRecipe(),
                entry.getServings() != null ? entry.getServings() : household.getDefaultServings(),
                entry.getIncludedOptionalIngredientIds(), ctx);

        Map<UnitKey, BigDecimal> before = new HashMap<>(already);
        Map<UnitKey, BigDecimal> added = new HashMap<>();
        for (Need need : needs.values()) {
            BigDecimal was = already.remove(need.key());
            if (was == null) {
                // Even an amount of nothing — "salt, to taste", saved with no amount or as 0 —
                // goes on the list.
                addShare(household, entry.getId(), need, need.quantity(), changes);
                added.put(need.key(), need.quantity());
            } else if (need.quantity().compareTo(was) > 0) {
                addShare(household, entry.getId(), need, need.quantity().subtract(was), changes);
                added.put(need.key(), need.quantity());
            } else if (need.quantity().compareTo(was) < 0) {
                BigDecimal taken = takeShare(entry.getId(), need.key(), was.subtract(need.quantity()), false, changes);
                added.put(need.key(), was.subtract(taken));
            } else {
                added.put(need.key(), was);
            }
        }
        // Whatever is left is on the list for this meal but no longer part of it. What of it is
        // already bought stays counted, in case it becomes part of the meal again.
        already.forEach((key, share) -> {
            BigDecimal rest = share.subtract(takeShare(entry.getId(), key, share, true, changes));
            if (rest.signum() > 0) {
                added.put(key, rest);
            }
        });

        if (!sameAmounts(before, added)) {
            entry.getAddedToGroceries().clear();
            added.forEach((key, quantity) ->
                    entry.getAddedToGroceries().add(new GroceryShare(key.ingredientId(), key.unit(), quantity)));
        }
    }

    /** Equal amounts, however many decimal places each was written with. */
    private static boolean sameAmounts(Map<UnitKey, BigDecimal> a, Map<UnitKey, BigDecimal> b) {
        return a.keySet().equals(b.keySet())
                && a.entrySet().stream().allMatch(e -> e.getValue().compareTo(b.get(e.getKey())) == 0);
    }

    /**
     * A recipe's ingredient quantities are written for {@code recipe.getServings()} people, so scale each
     * by (wantedServings / recipe.servings) to get the amount actually needed for this meal. The
     * same ingredient twice in one unit — garlic for the sauce and for the marinade — is one need.
     * Rounded to the hundredths the list keeps, so what is remembered is exactly what was added.
     *
     * No amount — "salt and pepper" — is "some" whatever the servings, and is counted as a
     * share of nothing: it still goes on the list, with no number beside it, and an amount of
     * the same thing in the same unit from elsewhere in the recipe is what the list shows.
     *
     * Things the cupboard says you have still go on — flagged, not skipped, because having some
     * paprika does not mean having enough. Staples you always have are left off entirely. An
     * optional ingredient only goes on if this occurrence's plan asked for it — see
     * {@link MealPlanEntry#getIncludedOptionalIngredientIds()}, decided once when the meal was
     * planned rather than asked again here.
     */
    private Map<UnitKey, Need> needs(Recipe recipe, int wantedServings, Set<UUID> includedOptionalIngredientIds,
                                     Context ctx) {
        BigDecimal factor = BigDecimal.valueOf(wantedServings)
                .divide(BigDecimal.valueOf(recipe.getServings()), 4, RoundingMode.HALF_UP);

        Map<UnitKey, Need> needs = new LinkedHashMap<>();
        recipe.getIngredients().stream()
                .filter(ri -> !ctx.isStaple(ri.getIngredient()))
                .filter(ri -> !ri.isOptional() || includedOptionalIngredientIds.contains(ri.getId()))
                .forEach(ri -> {
                    BigDecimal quantity = ri.getQuantity() == null ? BigDecimal.ZERO : ri.getQuantity().multiply(factor);
                    Need need = new Need(ri.getIngredient(), blankToNull(ri.getUnit()), quantity);
                    needs.merge(need.key(), need,
                            (a, b) -> new Need(a.ingredient(), a.unit(), a.quantity().add(b.quantity())));
                });
        needs.replaceAll((key, need) ->
                new Need(need.ingredient(), need.unit(), need.quantity().setScale(2, RoundingMode.HALF_UP)));
        return needs;
    }

    /** Puts more of something on the list for this meal, on the row already waiting for it if there is one. */
    private void addShare(Household household, UUID entryId, Need need, BigDecimal amount, ListChanges changes) {
        UnitKey key = need.key();
        GroceryListItem row = changes.rows.stream()
                .filter(r -> !r.isChecked() && key.matches(r))
                .findFirst()
                .orElseGet(() -> {
                    GroceryListItem fresh = GroceryListItem.builder()
                            .household(household)
                            .ingredient(need.ingredient())
                            .unit(need.unit())
                            .build();
                    changes.rows.add(fresh);
                    return fresh;
                });
        // "Some salt" adds no number: a row with none keeps none, rather than asking for "0".
        if (amount.signum() > 0) {
            row.setQuantity(row.getQuantity() == null ? amount : row.getQuantity().add(amount));
        }
        row.getFromMeals().merge(entryId, amount, BigDecimal::add);
        changes.save(row);
    }

    /**
     * Takes up to {@code amount} of this meal's share back off the unticked rows, and says how
     * much it could take: less, when some of it is in the cart. With {@code gone} the meal no
     * longer wants the thing at all, so even a share of nothing is let go.
     *
     * A row's share that comes down to nothing is let go too, rather than kept at 0: the meal's
     * record of what it added is on the entry, not here. A row left with nothing on it — no
     * meal's share, no amount, and nobody who asked for it by hand — goes, instead of staying on
     * the list as something to buy that nobody needs. One that is still wanted but has no number
     * left — the rest is "some salt" from another meal, or a "salt" somebody typed — says "some"
     * rather than "0 salt".
     */
    private BigDecimal takeShare(UUID entryId, UnitKey key, BigDecimal amount, boolean gone, ListChanges changes) {
        BigDecimal left = amount;
        for (GroceryListItem row : List.copyOf(changes.rows)) {
            BigDecimal share = row.getFromMeals().get(entryId);
            if ((!gone && left.signum() <= 0) || row.isChecked() || share == null || !key.matches(row)) {
                continue;
            }
            BigDecimal take = share.min(left);
            left = left.subtract(take);
            // A share of "some" takes nothing off, so a row with no number keeps having none.
            if (take.signum() > 0) {
                BigDecimal quantity = row.getQuantity() == null ? BigDecimal.ZERO : row.getQuantity();
                BigDecimal rest = quantity.subtract(take);
                row.setQuantity(rest.signum() > 0 ? rest : null);
            }
            if (share.subtract(take).signum() <= 0) {
                row.getFromMeals().remove(entryId);
            } else {
                row.getFromMeals().put(entryId, share.subtract(take));
            }
            if (row.getFromMeals().isEmpty() && !row.isAskedFor()
                    && (row.getQuantity() == null || row.getQuantity().signum() <= 0)) {
                changes.delete(row);
            } else {
                changes.save(row);
            }
        }
        return amount.subtract(left);
    }

    // --- Categories ---

    /** "Tortillas are with the bread at our store." Sticks for this household only. */
    @Transactional
    public void moveToCategory(UUID householdId, UUID ingredientId, UUID requesterId, UUID categoryId) {
        Household household = requireMember(householdId, requesterId);
        Ingredient ingredient = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ingredient not found"));
        GroceryCategory category = requireCategory(householdId, categoryId);
        ingredientSections.move(household, ingredient, category);
        broadcast(householdId, List.of(ingredientId));
    }

    /**
     * Places everything nobody has placed yet, in ONE Gemini request into this household's own
     * categories. One, because the key allows twenty a day across the whole app — so this is a
     * button someone presses once the list is finished, and never something that runs by itself.
     * The cupboard's unplaced items ride along in the same request. With nothing unplaced, no
     * request is made at all.
     */
    @Transactional
    public SortResponse sort(UUID householdId, UUID requesterId) {
        Household household = requireMember(householdId, requesterId);
        Map<UUID, GroceryCategory> overrides = ingredientSections.overrides(householdId);
        List<GroceryCategory> categories = ingredientSections.categories(householdId);

        Map<UUID, Ingredient> unsorted = new LinkedHashMap<>();
        groceryListItemRepository.findByHouseholdId(householdId).stream()
                .map(GroceryListItem::getIngredient)
                .filter(i -> i != null && !IngredientSections.isSorted(i, overrides, categories))
                .forEach(i -> unsorted.putIfAbsent(i.getId(), i));
        cupboardRepository.findByHouseholdId(householdId).stream()
                .map(CupboardItem::getIngredient)
                .filter(i -> !IngredientSections.isSorted(i, overrides, categories))
                .forEach(i -> unsorted.putIfAbsent(i.getId(), i));

        if (unsorted.isEmpty()) {
            return new SortResponse(0, 0);
        }

        Map<String, UUID> answers = sectionAi.classify(
                unsorted.values().stream().map(Ingredient::getName).toList(), categories);
        Map<UUID, GroceryCategory> categoriesById = categories.stream()
                .collect(Collectors.toMap(GroceryCategory::getId, c -> c));

        int sorted = 0;
        for (Ingredient ingredient : unsorted.values()) {
            UUID categoryId = answers.get(ingredient.getName().trim().toLowerCase());
            GroceryCategory category = categoryId != null ? categoriesById.get(categoryId) : null;
            if (category != null) {
                ingredientSections.move(household, ingredient, category);
                sorted++;
            }
        }
        broadcast(householdId, unsorted.keySet());
        return new SortResponse(sorted, unsorted.size() - sorted);
    }

    private GroceryCategory requireCategory(UUID householdId, UUID categoryId) {
        return ingredientSections.categories(householdId).stream()
                .filter(c -> c.getId().equals(categoryId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
    }

    /** Re-sends the items for these ingredients, so every open phone moves them to the new aisle. */
    private void broadcast(UUID householdId, Collection<UUID> ingredientIds) {
        Context ctx = context(householdId);
        groceryListItemRepository.findByHouseholdId(householdId).stream()
                .filter(item -> item.getIngredient() != null && ingredientIds.contains(item.getIngredient().getId()))
                .forEach(item -> eventPublisher.itemChanged(householdId, toItemResponse(item, ctx)));
    }

    private Household requireMember(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
    }

    /**
     * The household, locked until this request is done, so changes to its list and cupboard
     * happen one after another. Two phones in one shop press things at the same moment — both
     * Done shopping, a double-tapped add — and each of those reads the list, then writes what
     * it decided. Side by side, both read the same list: both take the same row off (and the
     * second delete fails), or both find no milk and add a row each. One after the other, the
     * second sees what the first did. A family's list is small, so the wait is nothing.
     * Taken before reading any row, or the row read could already be out of date.
     */
    private Household locked(UUID householdId) {
        return householdRepository.lockById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
    }

    private GroceryListItem findItem(UUID householdId, UUID itemId) {
        GroceryListItem item = groceryListItemRepository.findById(itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found"));
        if (!item.getHousehold().getId().equals(householdId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found");
        }
        return item;
    }

    /** The unit box sends "" when left empty; stored as null so "eggs" and "eggs" are one row. */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private GroceryListItemResponse toItemResponse(GroceryListItem item, Context ctx) {
        Ingredient ingredient = item.getIngredient();
        String name = ingredient != null ? ingredient.getName() : item.getCustomName();
        GroceryCategory category = ingredient != null
                ? IngredientSections.resolve(ingredient, ctx.sections(), ctx.categories())
                : null;
        return new GroceryListItemResponse(
                item.getId(),
                item.getHousehold().getId(),
                ingredient != null ? ingredient.getId() : null,
                name,
                item.getQuantity(),
                item.getUnit(),
                item.isChecked(),
                item.getCheckedBy() != null ? item.getCheckedBy().getId() : null,
                item.getCheckedBy() != null ? item.getCheckedBy().getDisplayName() : null,
                item.getCheckedAt(),
                category != null ? category.getId() : null,
                ingredient == null || category != null,
                ingredient != null && ctx.has(ingredient));
    }
}
