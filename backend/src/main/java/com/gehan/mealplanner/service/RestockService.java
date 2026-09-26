package com.gehan.mealplanner.service;

import com.gehan.mealplanner.domain.GroceryListItem;
import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.Ingredient;
import com.gehan.mealplanner.domain.RestockReminder;
import com.gehan.mealplanner.dto.GroceryListDtos.AddItemRequest;
import com.gehan.mealplanner.dto.GroceryListDtos.GroceryListItemResponse;
import com.gehan.mealplanner.dto.RestockDtos.AddDueRequest;
import com.gehan.mealplanner.dto.RestockDtos.RestockReminderResponse;
import com.gehan.mealplanner.repository.GroceryListItemRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.IngredientRepository;
import com.gehan.mealplanner.repository.RestockReminderRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Restock reminders — see {@link RestockReminder}. Set from a grocery list item or a cupboard
 * item, and asked about when the app opens: "Time to restock?", with the things whose time has
 * come. What is already waiting on the list is not asked about; it is in hand.
 */
@Service
public class RestockService {

    /** How long "Not now" holds. Long enough not to nag, short enough not to be forgotten. */
    static final Duration SNOOZE = Duration.ofDays(3);

    private final RestockReminderRepository reminderRepository;
    private final HouseholdRepository householdRepository;
    private final IngredientRepository ingredientRepository;
    private final GroceryListItemRepository groceryRepository;
    private final HouseholdService householdService;
    private final GroceryListService groceryListService;
    private final RestockClock clock;

    public RestockService(RestockReminderRepository reminderRepository,
                          HouseholdRepository householdRepository,
                          IngredientRepository ingredientRepository,
                          GroceryListItemRepository groceryRepository,
                          HouseholdService householdService,
                          GroceryListService groceryListService,
                          RestockClock clock) {
        this.reminderRepository = reminderRepository;
        this.householdRepository = householdRepository;
        this.ingredientRepository = ingredientRepository;
        this.groceryRepository = groceryRepository;
        this.householdService = householdService;
        this.groceryListService = groceryListService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<RestockReminderResponse> list(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Set<UUID> onList = onList(householdId);
        return sorted(reminderRepository.findByHouseholdId(householdId)).stream()
                .map(r -> toResponse(r, onList))
                .toList();
    }

    /** What to ask about now, by name. Empty is the usual answer, and means say nothing. */
    @Transactional(readOnly = true)
    public List<RestockReminderResponse> due(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        Set<UUID> onList = onList(householdId);
        return sorted(reminderRepository.findByHouseholdId(householdId)).stream()
                .map(r -> toResponse(r, onList))
                .filter(RestockReminderResponse::due)
                .toList();
    }

    /**
     * Sets how often, or changes it. A new reminder starts its clock now: nothing records when
     * something was last bought until it has a reminder to record it on, and "now" at worst
     * asks a little late — never the moment it is set, for a thing that may well be in the
     * cupboard. A changed one keeps its clock, so going from 3 weeks to 2 can bring it due.
     */
    @Transactional
    public RestockReminderResponse set(UUID householdId, UUID ingredientId, UUID requesterId, int everyDays) {
        Household household = lockedMember(householdId, requesterId);
        Ingredient ingredient = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ingredient not found"));
        RestockReminder reminder = reminderRepository.findByHouseholdIdAndIngredientId(householdId, ingredientId)
                .orElseGet(() -> RestockReminder.builder()
                        .household(household)
                        .ingredient(ingredient)
                        .lastBoughtAt(clock.now())
                        .build());
        reminder.setEveryDays(everyDays);
        return toResponse(reminderRepository.save(reminder), onList(householdId));
    }

    /** Off. Gone already is fine too — two phones turning it off at once both get what they asked for. */
    @Transactional
    public void delete(UUID householdId, UUID ingredientId, UUID requesterId) {
        lockedMember(householdId, requesterId);
        reminderRepository.findByHouseholdIdAndIngredientId(householdId, ingredientId)
                .ifPresent(reminderRepository::delete);
    }

    /**
     * "Add to list" on the question. The ticked ones go on the grocery list the same way as
     * something typed in — into its aisle, onto the row already waiting for it if there is one
     * — and the unticked ones are let be for a few days, as "Not now" would. Only this
     * household's reminders count; anything else named is ignored.
     */
    @Transactional
    public List<GroceryListItemResponse> addDue(UUID householdId, UUID requesterId, AddDueRequest request) {
        lockedMember(householdId, requesterId);
        Map<UUID, RestockReminder> reminders = byIngredient(householdId);
        List<GroceryListItemResponse> added = new ArrayList<>();
        for (UUID ingredientId : new HashSet<>(orEmpty(request.add()))) {
            RestockReminder reminder = reminders.get(ingredientId);
            if (reminder != null) {
                added.add(groceryListService.addItem(householdId,
                        new AddItemRequest(reminder.getIngredient().getName(), null, null)));
            }
        }
        snooze(reminders, orEmpty(request.snooze()));
        return added;
    }

    /** "Not now": not asked about again for {@link #SNOOZE}, unless it is bought in between. */
    @Transactional
    public void snooze(UUID householdId, UUID requesterId, Collection<UUID> ingredientIds) {
        lockedMember(householdId, requesterId);
        snooze(byIngredient(householdId), orEmpty(ingredientIds));
    }

    private void snooze(Map<UUID, RestockReminder> reminders, Collection<UUID> ingredientIds) {
        Instant until = clock.now().plus(SNOOZE);
        ingredientIds.stream().map(reminders::get).filter(r -> r != null).forEach(r -> r.setSnoozedUntil(until));
    }

    private Map<UUID, RestockReminder> byIngredient(UUID householdId) {
        return reminderRepository.findByHouseholdId(householdId).stream()
                .collect(Collectors.toMap(r -> r.getIngredient().getId(), Function.identity()));
    }

    /** Ingredients waiting on the list, unticked. Ticked ones are in the cart, which is not the same as bought. */
    private Set<UUID> onList(UUID householdId) {
        return groceryRepository.findByHouseholdId(householdId).stream()
                .filter(g -> !g.isChecked() && g.getIngredient() != null)
                .map(GroceryListItem::getIngredient)
                .map(Ingredient::getId)
                .collect(Collectors.toSet());
    }

    private static List<RestockReminder> sorted(List<RestockReminder> reminders) {
        return reminders.stream()
                .sorted(Comparator.comparing(r -> r.getIngredient().getName(), String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private static <T> Collection<T> orEmpty(Collection<T> values) {
        return values == null ? List.of() : values;
    }

    /**
     * The household, locked until the change is saved — the lock the grocery list and cupboard
     * take too — so two phones setting the same reminder at once make one of it, not a clash on
     * the one-per-thing rule.
     */
    private Household lockedMember(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return householdRepository.lockById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
    }

    private RestockReminderResponse toResponse(RestockReminder reminder, Set<UUID> onList) {
        Instant now = clock.now();
        Ingredient ingredient = reminder.getIngredient();
        Instant snoozed = reminder.getSnoozedUntil();
        return new RestockReminderResponse(
                ingredient.getId(),
                ingredient.getName(),
                reminder.getEveryDays(),
                reminder.getLastBoughtAt(),
                reminder.dueAt(),
                snoozed != null && snoozed.isAfter(now) ? snoozed : null,
                reminder.isDue(now) && !onList.contains(ingredient.getId()));
    }
}
