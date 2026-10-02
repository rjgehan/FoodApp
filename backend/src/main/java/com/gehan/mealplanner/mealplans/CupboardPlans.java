package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.CupboardItem;
import com.gehan.mealplanner.domain.GroceryCategory;
import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.domain.MealPlanEntry;
import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CandidateRecipe;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardCandidatesRequest;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardCandidatesResponse;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardPlanRequest;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardPlanResponse;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardSetupResponse;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.CupboardSwapRequest;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.DraftMeal;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.MealChoice;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.OpenSlot;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.SetupDay;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.SlotRef;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.ToBuy;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.UnsureItem;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.UseFirstItem;
import com.gehan.mealplanner.mealplans.CupboardPlanner.Slot;
import com.gehan.mealplanner.mealplans.CupboardPlanner.Stocked;
import com.gehan.mealplanner.repository.CupboardItemRepository;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.repository.MealPlanEntryRepository;
import com.gehan.mealplanner.service.CupboardService;
import com.gehan.mealplanner.service.HouseholdService;
import com.gehan.mealplanner.service.IngredientSections;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Cook from your cupboard, around the database: what is in the cupboard and wants using, which
 * recipes may be chosen, and what is already on the Plan. The choosing is {@link CupboardPlanner}.
 * Nothing is saved — the draft goes back to the app, which can swap meals in it and then apply it
 * (see {@link PlanApply}).
 */
@Service
public class CupboardPlans {

    /** Extra things to buy when nobody says: the mockup's "Up to 5". */
    static final int DEFAULT_BUY_LIMIT = 5;
    static final int DEFAULT_DAYS = 4;
    static final List<MealType> DEFAULT_MEALS = List.of(MealType.LUNCH, MealType.DINNER);
    /** How many "use these up first" suggestions to make. */
    static final int SUGGESTIONS = 8;
    /** At most this many things the rule cannot judge are offered to a phone to guess about. */
    static final int UNSURE = 20;
    /** Recipes offered to a phone's model for a whole plan, and for one slot. */
    static final int CANDIDATES = 30;
    static final int SWAP_CANDIDATES = 12;

    private final HouseholdService householdService;
    private final HouseholdRepository households;
    private final CupboardItemRepository cupboard;
    private final IngredientSections sections;
    private final MealPlanEntryRepository entries;
    private final RecipePool pool;
    private Clock clock = Clock.systemDefaultZone();

    public CupboardPlans(HouseholdService householdService, HouseholdRepository households,
                         CupboardItemRepository cupboard, IngredientSections sections,
                         MealPlanEntryRepository entries, RecipePool pool) {
        this.householdService = householdService;
        this.households = households;
        this.cupboard = cupboard;
        this.sections = sections;
        this.entries = entries;
        this.pool = pool;
    }

    /** For tests. */
    void use(Clock clock) {
        this.clock = clock;
    }

    private record Item(CupboardItem item, UseSoon.Verdict soon) {
        String name() {
            return item.getIngredient().getName();
        }
    }

    @Transactional(readOnly = true)
    public CupboardSetupResponse setup(UUID householdId, UUID requesterId) {
        Household household = household(householdId, requesterId);
        LocalDate today = LocalDate.now(clock);
        List<Item> items = items(householdId, today);

        // Past the date on the packet: not "use first" but "check it" — never pushed to be eaten.
        List<Item> past = items.stream().filter(i -> i.soon().soon() && i.soon().past(today)).toList();
        List<Item> soon = items.stream().filter(i -> i.soon().soon() && !i.soon().past(today))
                .sorted(Comparator.comparing((Item i) -> i.soon().reason() == UseSoon.Reason.DATE ? 0 : 1)
                        .thenComparing(i -> i.soon().by(), Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(Item::name, String.CASE_INSENSITIVE_ORDER))
                .toList();

        List<UseFirstItem> useFirst = new ArrayList<>();
        Set<UUID> suggested = new HashSet<>();
        for (Item i : soon) {
            if (useFirst.size() >= SUGGESTIONS) break;
            suggested.add(i.item().getId());
            useFirst.add(new UseFirstItem(i.item().getId(), i.item().getIngredient().getId(), display(i.name()),
                    i.soon().reason() == UseSoon.Reason.DATE ? "date" : "guess", i.soon().label(),
                    i.item().getUseBy(), true));
        }
        // Then the open packet running low of something that goes off, and big counts to get through.
        for (Item i : items) {
            if (useFirst.size() >= SUGGESTIONS) break;
            if (suggested.contains(i.item().getId()) || i.item().isStaple() || i.soon().past(today)) continue;
            CupboardItem c = i.item();
            if (c.isRunningLow() && UseSoon.shelfDays(i.name(), sectionOf(c, householdId)).isPresent()) {
                suggested.add(c.getId());
                useFirst.add(new UseFirstItem(c.getId(), c.getIngredient().getId(), display(i.name()), "low", "low",
                        null, false));
            }
        }
        for (Item i : items) {
            if (useFirst.size() >= SUGGESTIONS) break;
            CupboardItem c = i.item();
            if (suggested.contains(c.getId()) || c.isStaple() || i.soon().past(today) || c.getQuantity() == null
                    || c.getQuantity().compareTo(BigDecimal.valueOf(3)) < 0) continue;
            suggested.add(c.getId());
            useFirst.add(new UseFirstItem(c.getId(), c.getIngredient().getId(), display(i.name()), "plenty",
                    CupboardPlanDtos.countLabel(c.getQuantity(), c.getUnit()), null, false));
        }

        // Use-soon first, then whatever came in most recently — fresh shopping is what people cook.
        List<String> highlights = new ArrayList<>();
        soon.forEach(i -> highlights.add(display(i.name())));
        items.stream().filter(i -> !i.soon().soon() && !i.item().isStaple() && !i.soon().past(today))
                .sorted(Comparator.comparing((Item i) -> i.item().arrivedAt(), Comparator.nullsLast(Comparator.reverseOrder())))
                .forEach(i -> highlights.add(display(i.name())));

        List<SetupDay> days = new ArrayList<>();
        Map<LocalDate, Set<MealType>> planned = planned(householdId, today, today.plusDays(6));
        for (int d = 0; d < 7; d++) {
            LocalDate date = today.plusDays(d);
            days.add(new SetupDay(date, List.copyOf(new TreeSet<>(planned.getOrDefault(date, Set.of())))));
        }
        // What the rule cannot judge, for a phone's Apple Intelligence to have a go at.
        List<UnsureItem> unsure = new ArrayList<>();
        for (Item i : items) {
            if (unsure.size() >= UNSURE) break;
            CupboardItem c = i.item();
            if (c.isStaple() || c.getUseBy() != null || c.arrivedAt() == null || i.soon().soon()) continue;
            if (UseSoon.judges(i.name(), sectionOf(c, householdId))) continue;
            unsure.add(new UnsureItem(c.getId(), c.getIngredient().getId(), display(i.name()),
                    LocalDate.ofInstant(c.arrivedAt(), clock.getZone())));
        }
        List<UseFirstItem> check = past.stream()
                .map(i -> new UseFirstItem(i.item().getId(), i.item().getIngredient().getId(), display(i.name()), "past",
                        i.soon().label(), i.item().getUseBy(), false))
                .toList();
        return new CupboardSetupResponse(items.size(), soon.size(), highlights.stream().limit(6).toList(), useFirst,
                days, DEFAULT_MEALS, DEFAULT_DAYS, DEFAULT_BUY_LIMIT, true, household.getDefaultServings(), unsure, check);
    }

    /**
     * A draft. A phone's Apple Intelligence may say which recipe it wants in each slot
     * ({@code chosen}); each is taken where the rules allow it, and any that is not (or any slot
     * it left out) gets the server's own best, so the answer is always a whole, valid plan.
     */
    @Transactional(readOnly = true)
    public CupboardPlanResponse generate(UUID householdId, UUID requesterId, CupboardPlanRequest request) {
        household(householdId, requesterId);
        Map<Slot, UUID> wanted = new HashMap<>();
        if (request.chosen() != null) {
            for (MealChoice m : request.chosen()) wanted.putIfAbsent(new Slot(m.date(), m.mealType()), m.recipeId());
        }
        return draft(householdId, request, Map.of(), Map.of(), null, null, wanted);
    }

    /** The recipes a phone's model may choose from, for a whole plan or for one slot (see the request). */
    @Transactional(readOnly = true)
    public CupboardCandidatesResponse candidates(UUID householdId, UUID requesterId, CupboardCandidatesRequest request) {
        household(householdId, requesterId);
        if ((request.date() == null) != (request.mealType() == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Send both date and mealType for one slot, or neither.");
        }
        Slot target = request.date() == null ? null : new Slot(request.date(), request.mealType());
        CupboardPlanRequest setup = request.setup();
        if (target != null) setup = widened(setup, target);
        Context ctx = context(householdId, setup, null);
        Map<Slot, UUID> fixed = new HashMap<>();
        if (request.meals() != null) {
            for (MealChoice m : request.meals()) fixed.put(new Slot(m.date(), m.mealType()), m.recipeId());
        }
        Set<UUID> exclude = new HashSet<>(request.exclude() == null ? List.of() : request.exclude());
        if (target != null && fixed.containsKey(target)) exclude.add(fixed.get(target));
        List<CupboardPlanner.Candidate> found = ctx.planner().candidates(ctx.slots(), fixed, ctx.alreadyPlanned(), target,
                exclude, target == null ? CANDIDATES : SWAP_CANDIDATES);
        List<CandidateRecipe> recipes = found.stream().map(c -> new CandidateRecipe(
                c.dish().id(), c.dish().name(), c.dish().section(), c.dish().yours(), c.fits(), c.pick().percent(),
                c.pick().uses().size(),
                c.pick().uses().stream().filter(st -> (st.useSoon() || st.priority()) && st.goodOn(c.pick().slot().date()))
                        .map(st -> display(st.name())).toList(),
                c.pick().missing().stream().map(n -> display(n.name())).toList(),
                Math.round(c.score() * 100) / 100.0)).toList();
        List<SlotRef> slots = target != null ? List.of(new SlotRef(target.date(), target.meal()))
                : ctx.slots().stream().map(sl -> new SlotRef(sl.date(), sl.meal())).toList();
        return new CupboardCandidatesResponse(slots, recipes, ctx.recipes().size());
    }

    /** The setup with the slot being swapped in it, even if its days or meals were edited since. */
    private static CupboardPlanRequest widened(CupboardPlanRequest setup, Slot target) {
        List<LocalDate> dates = new ArrayList<>(setup.dates());
        if (!dates.contains(target.date())) dates.add(target.date());
        List<MealType> meals = new ArrayList<>(setup.meals());
        if (!meals.contains(target.meal())) meals.add(target.meal());
        return new CupboardPlanRequest(dates, meals, setup.useFirst(), setup.buyLimit(), setup.onlyMine(), setup.servings());
    }

    /**
     * The next best recipe for one slot, everything else kept. The one in the slot now and any
     * listed in exclude are passed over; if nothing else is allowed there, the meal stays and
     * {@code swapped} says so.
     */
    @Transactional(readOnly = true)
    public CupboardPlanResponse swap(UUID householdId, UUID requesterId, CupboardSwapRequest request) {
        household(householdId, requesterId);
        Slot target = new Slot(request.date(), request.mealType());
        Map<Slot, UUID> fixed = new HashMap<>();
        UUID current = null;
        for (MealChoice m : request.meals()) {
            Slot slot = new Slot(m.date(), m.mealType());
            if (slot.equals(target)) current = m.recipeId();
            else fixed.put(slot, m.recipeId());
        }
        Set<UUID> exclude = new HashSet<>(request.exclude() == null ? List.of() : request.exclude());
        if (current != null) exclude.add(current);
        // The slot being swapped is part of the plan even if the setup's days were edited since.
        CupboardPlanRequest widened = widened(request.setup(), target);
        // Slots the client has no meal for stay empty: a swap changes one meal, not the rest.
        Set<Slot> onlyThese = new HashSet<>(fixed.keySet());
        onlyThese.add(target);
        // A phone's model may name the one it wants; it is taken only if the rules allow it there.
        Map<Slot, UUID> wanted = request.recipeId() == null ? Map.of() : Map.of(target, request.recipeId());
        CupboardPlanResponse swapped = draft(householdId, widened, fixed, Map.of(target, exclude), onlyThese, true, wanted);
        boolean filled = swapped.meals().stream().anyMatch(m -> m.date().equals(target.date()) && m.mealType() == target.meal());
        if (filled || current == null) {
            return swapped;
        }
        // Nothing else is allowed there: the meal that was there stays.
        Map<Slot, UUID> keep = new HashMap<>(fixed);
        keep.put(target, current);
        return draft(householdId, widened, keep, Map.of(), onlyThese, false, Map.of());
    }

    /** Everything a draft or a candidate list is worked out from. */
    private record Context(List<Item> items, List<Stocked> stock, List<RecipePool.PoolRecipe> recipes,
                           Map<UUID, RecipePool.PoolRecipe> byId, List<LocalDate> dates, List<MealType> meals,
                           Set<UUID> alreadyPlanned, List<Slot> slots, List<OpenSlot> open, CupboardPlanner planner,
                           boolean onlyMine, int servings, Integer buyLimit) {
    }

    private Context context(UUID householdId, CupboardPlanRequest request, Set<Slot> onlyThese) {
        Household household = households.findById(householdId).orElseThrow();
        LocalDate today = LocalDate.now(clock);
        boolean onlyMine = request.onlyMine() == null || request.onlyMine();
        int servings = request.servings() != null ? request.servings() : household.getDefaultServings();
        Integer buyLimit = request.buyLimit() == null ? null : request.buyLimit();
        Set<UUID> useFirst = new HashSet<>(request.useFirst() == null ? List.of() : request.useFirst());

        List<Item> items = items(householdId, today);
        // Something past its date is never "use soon" or "use first", whatever an older app sends.
        List<Stocked> stock = items.stream()
                .filter(i -> !i.item().isUsedUp())
                .map(i -> {
                    boolean past = i.soon().past(today);
                    return new Stocked(i.item().getIngredient().getId(), i.name(), IngredientKeys.key(i.name()),
                            i.soon().soon() && !past, !past && useFirst.contains(i.item().getIngredient().getId()),
                            i.soon().by(), i.soon().reason() == UseSoon.Reason.DATE);
                })
                .toList();
        List<RecipePool.PoolRecipe> recipes = pool.forHousehold(householdId, !onlyMine);
        Map<UUID, RecipePool.PoolRecipe> byId = new HashMap<>();
        recipes.forEach(r -> byId.put(r.id(), r));

        List<LocalDate> dates = request.dates().stream().distinct().sorted().toList();
        if (dates.get(0).isBefore(today)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Plan from today on: those days have been.");
        }
        List<MealType> meals = request.meals().stream().distinct().sorted().toList();
        Map<LocalDate, Set<MealType>> planned = planned(householdId, dates.get(0), dates.get(dates.size() - 1));
        Set<UUID> alreadyPlanned = plannedRecipes(householdId, dates.get(0), dates.get(dates.size() - 1));

        List<Slot> slots = new ArrayList<>();
        List<OpenSlot> open = new ArrayList<>();
        for (LocalDate date : dates) {
            for (MealType meal : meals) {
                Slot slot = new Slot(date, meal);
                if (onlyThese != null && !onlyThese.contains(slot)) continue;
                if (planned.getOrDefault(date, Set.of()).contains(meal)) {
                    open.add(new OpenSlot(date, meal, "PLANNED"));
                    continue;
                }
                slots.add(slot);
            }
        }
        CupboardPlanner planner = new CupboardPlanner(stock,
                recipes.stream().map(RecipePool.PoolRecipe::dish).toList(),
                buyLimit == null ? CupboardPlanner.ANY : buyLimit);
        return new Context(items, stock, recipes, byId, dates, meals, alreadyPlanned, slots, open, planner, onlyMine,
                servings, buyLimit);
    }

    private CupboardPlanResponse draft(UUID householdId, CupboardPlanRequest request, Map<Slot, UUID> fixed,
                                       Map<Slot, Set<UUID>> excluded, Set<Slot> onlyThese, Boolean swapped,
                                       Map<Slot, UUID> wanted) {
        Context ctx = context(householdId, request, onlyThese);
        List<Stocked> stock = ctx.stock();
        Map<UUID, RecipePool.PoolRecipe> byId = ctx.byId();
        List<OpenSlot> open = new ArrayList<>(ctx.open());
        int servings = ctx.servings();
        CupboardPlanner.Draft draft = ctx.planner().plan(ctx.slots(), fixed, excluded, ctx.alreadyPlanned(), wanted);
        draft.unfilled().forEach(s -> open.add(new OpenSlot(s.date(), s.meal(), "NOTHING_FITS")));
        open.sort(Comparator.comparing(OpenSlot::date).thenComparing(OpenSlot::mealType));

        List<DraftMeal> mealsOut = new ArrayList<>();
        for (CupboardPlanner.Pick p : draft.picks()) {
            RecipePool.PoolRecipe r = byId.get(p.dish().id());
            mealsOut.add(new DraftMeal(p.slot().date(), p.slot().meal(), r.id(), r.name(), r.section(), r.yours(),
                    r.coverImageId(), p.percent(),
                    p.uses().stream().map(s -> display(s.name())).toList(),
                    p.uses().stream().filter(s -> (s.useSoon() || s.priority()) && s.goodOn(p.slot().date()))
                            .map(s -> display(s.name())).toList(),
                    p.missing().stream().map(n -> display(n.name())).toList(), servings));
        }

        Map<String, Integer> neededBy = new LinkedHashMap<>();
        for (CupboardPlanner.Pick p : draft.picks()) for (CupboardPlanner.Need n : p.missing()) neededBy.merge(n.key(), 1, Integer::sum);
        List<ToBuy> toBuy = draft.toBuy().stream()
                .map(n -> new ToBuy(n.ingredientId(), display(n.name()), neededBy.getOrDefault(n.key(), 1))).toList();

        // Only what a meal uses on or before its day counts as used in time; a meal the day after
        // the spinach's date does not save the spinach.
        Set<String> inTime = draft.usedInTime();
        List<String> soonUsed = new ArrayList<>(), soonLeft = new ArrayList<>();
        for (Stocked s : stock) {
            if (!s.useSoon() && !s.priority()) continue;
            (inTime.contains(s.key()) ? soonUsed : soonLeft).add(display(s.name()));
        }

        return new CupboardPlanResponse(ctx.dates(), ctx.meals(), ctx.buyLimit(), ctx.onlyMine(), servings, draft.percent(),
                draft.used().size(), summary(draft, soonUsed), mealsOut, open, toBuy, soonUsed, soonLeft,
                ctx.recipes().size(), swapped);
    }

    /** "Uses 31 items, 5 to buy. Spinach and chicken thighs get used before they go off." */
    static String summary(CupboardPlanner.Draft draft, List<String> soonUsed) {
        if (draft.picks().isEmpty()) {
            return "Nothing fits yet. Try more extra things to buy, or let it use global recipes.";
        }
        int used = draft.used().size(), buy = draft.toBuy().size();
        StringBuilder s = new StringBuilder("Uses ").append(used).append(used == 1 ? " item" : " items");
        s.append(buy == 0 ? ", nothing to buy." : ", " + buy + " to buy.");
        if (!soonUsed.isEmpty()) {
            List<String> names = soonUsed.stream().map(n -> n.toLowerCase(Locale.ROOT)).toList();
            String list = names.size() == 1 ? names.get(0)
                    : names.size() == 2 ? names.get(0) + " and " + names.get(1)
                    : names.get(0) + ", " + names.get(1) + " and " + (names.size() - 2) + " more";
            s.append(' ').append(Character.toUpperCase(list.charAt(0))).append(list.substring(1))
                    .append(names.size() == 1 ? " gets" : " get").append(" used before ")
                    .append(names.size() == 1 ? "it goes" : "they go").append(" off.");
        }
        return s.toString();
    }

    /** Everything in the cupboard that is not used up, with whether it wants using soon. */
    private List<Item> items(UUID householdId, LocalDate today) {
        Map<UUID, GroceryCategory> overrides = sections.overrides(householdId);
        List<GroceryCategory> categories = sections.categories(householdId);
        return cupboard.findByHouseholdId(householdId).stream()
                .filter(c -> !c.isUsedUp())
                .map(c -> new Item(c, CupboardService.useSoon(c,
                        IngredientSections.resolve(c.getIngredient(), overrides, categories), today)))
                .sorted(Comparator.comparing(Item::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private com.gehan.mealplanner.domain.StoreSection sectionOf(CupboardItem c, UUID householdId) {
        GroceryCategory category = IngredientSections.resolve(c.getIngredient(), sections.overrides(householdId),
                sections.categories(householdId));
        return category != null && category.getSeededFrom() != null ? category.getSeededFrom() : c.getIngredient().getSection();
    }

    private Map<LocalDate, Set<MealType>> planned(UUID householdId, LocalDate from, LocalDate to) {
        Map<LocalDate, Set<MealType>> planned = new HashMap<>();
        for (MealPlanEntry e : entries.findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(householdId, from, to)) {
            planned.computeIfAbsent(e.getDate(), d -> new HashSet<>()).add(e.getMealType());
        }
        return planned;
    }

    private Set<UUID> plannedRecipes(UUID householdId, LocalDate from, LocalDate to) {
        Set<UUID> ids = new HashSet<>();
        for (MealPlanEntry e : entries.findByHouseholdIdAndDateBetweenOrderByDateAscMealTypeAsc(householdId, from, to)) {
            if (e.getRecipe() != null) ids.add(e.getRecipe().getId());
        }
        return ids;
    }

    private Household household(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return households.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
    }

    /** "chicken thighs" → "Chicken thighs", as the cupboard shows it. */
    static String display(String name) {
        if (name == null || name.isBlank()) return "";
        String n = name.trim();
        return Character.toUpperCase(n.charAt(0)) + n.substring(1);
    }
}
