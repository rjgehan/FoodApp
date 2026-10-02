package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.ApplyMeal;
import com.gehan.mealplanner.mealplans.CupboardPlanDtos.ApplyResponse;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.ActivityOption;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.ApplyTargetPlanRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.Average;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.CalculateRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.CreateTargetPlanRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.CupboardTeaser;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.Filter;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.FormOptions;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.GoalOption;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.Macro;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.MealPlansHome;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.PlanDay;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.PlanMeal;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.PlanMealChoice;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.PreviewRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.PreviewSwapRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.StoredMeal;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.SwapRequest;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.TargetDetails;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.TargetPlanCard;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.TargetPlanResponse;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.TargetsResponse;
import com.gehan.mealplanner.mealplans.TargetPlanDtos.UpdateTargetPlanRequest;
import com.gehan.mealplanner.mealplans.TargetPlanner.Meal;
import com.gehan.mealplanner.mealplans.TargetPlanner.Option;
import com.gehan.mealplanner.mealplans.TargetPlanner.Slot;
import com.gehan.mealplanner.domain.Household;
import com.gehan.mealplanner.nutrition.Nutrients;
import com.gehan.mealplanner.repository.HouseholdRepository;
import com.gehan.mealplanner.nutrition.RecipeNutrition;
import com.gehan.mealplanner.service.HouseholdService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Plans for health targets: the ready-made ones, previews from the create form, and each
 * person's own saved plans — which are theirs alone. Anybody else asking for one, in the
 * household or not, is told there is no such plan (404), not that it is private.
 *
 * Every meal is an existing recipe the household can use; every number is that recipe's own
 * nutrition from {@link RecipeNutrition}; the choosing is {@link TargetPlanner}.
 */
@Service
public class TargetPlans {

    static final int DEFAULT_DAYS = 7;
    static final List<MealType> DEFAULT_MEALS = List.of(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER, MealType.SNACK);

    static final List<Filter> FILTERS = List.of(new Filter("all", "All"), new Filter("build-muscle", "Build muscle"),
            new Filter("lose-fat", "Lose fat"), new Filter("healthy", "Healthy"), new Filter("budget", "Budget"));

    private final HouseholdService householdService;
    private final TargetPlanRepository plans;
    private final RecipePool pool;
    private final RecipeNutrition nutrition;
    private final CupboardPlans cupboardPlans;
    private final PlanApply planApply;
    private final HouseholdRepository households;
    private final ObjectMapper json = JsonMapper.builder().build();

    public TargetPlans(HouseholdService householdService, TargetPlanRepository plans, RecipePool pool,
                       RecipeNutrition nutrition, CupboardPlans cupboardPlans, PlanApply planApply,
                       HouseholdRepository households) {
        this.households = households;
        this.householdService = householdService;
        this.plans = plans;
        this.pool = pool;
        this.nutrition = nutrition;
        this.cupboardPlans = cupboardPlans;
        this.planApply = planApply;
    }

    // ---- Targets

    static Targets.Body body(Integer age, String sex, Double heightCm, Double weightKg, String activity, String goal) {
        Targets.Activity a = Targets.Activity.parse(activity);
        if (a == null) throw bad("activity is one of sedentary, light, moderate, active, very-active.");
        Targets.Goal g = Targets.Goal.parse(goal);
        if (g == null) throw bad("goal is one of lose-fat, maintain, build-muscle.");
        return new Targets.Body(age, Targets.Sex.parse(sex), heightCm, weightKg, a, g);
    }

    static Targets.Body body(TargetDetails d) {
        return body(d.age(), d.sex(), d.heightCm(), d.weightKg(), d.activity(), d.goal());
    }

    static Targets.Overrides overrides(TargetPlanDtos.TargetOverrides o) {
        return o == null ? Targets.Overrides.NONE : new Targets.Overrides(o.kcal(), o.protein(), o.carbs(), o.fat());
    }

    static TargetsResponse targets(TargetDetails d) {
        return response(Targets.of(body(d), overrides(d.overrides())));
    }

    public TargetsResponse calculate(CalculateRequest r) {
        Targets.Body body = body(r.age(), r.sex(), r.heightCm(), r.weightKg(), r.activity(), r.goal());
        return response(Targets.of(body, overrides(r.overrides())));
    }

    private static TargetsResponse response(Targets.Result r) {
        Targets.Macros t = r.target(), c = r.computed();
        return new TargetsResponse(t.kcal(), t.protein(), t.carbs(), t.fat(),
                new Macro(c.kcal(), c.protein(), c.carbs(), c.fat()), r.overridden(), r.bmr(), r.tdee(), r.notes());
    }

    public static FormOptions formOptions() {
        return new FormOptions(
                Arrays.stream(Targets.Activity.values())
                        .map(a -> new ActivityOption(a.name().toLowerCase().replace('_', '-'), a.label, a.factor)).toList(),
                Arrays.stream(Targets.Goal.values()).map(g -> new GoalOption(g.key(), g.label)).toList(),
                Preferences.OPTIONS, List.of(3, 5, 7, 14), DEFAULT_MEALS);
    }

    /**
     * The targets of the plan this person changed last in this household, as the thing their
     * recipe nutrition is compared with — "24% of a 3,170 kcal day". Their own: nobody else's plan
     * is ever used, and the answer goes only to them. No household, no plan: the reference day.
     */
    @Transactional(readOnly = true)
    public java.util.Optional<com.gehan.mealplanner.nutrition.NutritionDtos.Reference> ownReference(UUID ownerId,
                                                                                                    UUID householdId) {
        if (householdId == null) return java.util.Optional.empty();
        return plans.findByOwnerIdAndHouseholdIdOrderByUpdatedAtDesc(ownerId, householdId).stream().findFirst().map(p -> {
            TargetsResponse t = targets(details(p));
            return com.gehan.mealplanner.nutrition.NutritionLabels.target(p.getName(), t.kcal(), t.protein(), t.carbs(),
                    t.fat());
        });
    }

    // ---- The Meal plans page

    @Transactional(readOnly = true)
    public MealPlansHome home(UUID householdId, UUID requesterId) {
        CupboardPlanDtos.CupboardSetupResponse setup = cupboardPlans.setup(householdId, requesterId);
        List<TargetPlanCard> cards = new ArrayList<>(mine(householdId, requesterId));
        Presets.ALL.forEach(p -> cards.add(card(p)));
        return new MealPlansHome(new CupboardTeaser(setup.items(), setup.useSoon(), setup.highlights()), FILTERS,
                cards, formOptions());
    }

    @Transactional(readOnly = true)
    public List<TargetPlanCard> mine(UUID householdId, UUID requesterId) {
        householdService.assertMember(householdId, requesterId);
        return plans.findByOwnerIdAndHouseholdIdOrderByUpdatedAtDesc(requesterId, householdId).stream()
                .map(p -> {
                    TargetDetails d = details(p);
                    TargetsResponse t = targets(d);
                    Targets.Goal goal = body(d).goal();
                    return new TargetPlanCard(p.getId(), null, true, p.getName(),
                            goal.label + " · " + length(d) + " days", goal.key(), tags(d), icon(goal), hue(goal),
                            t.kcal(), t.protein(), length(d), p.getUpdatedAt());
                })
                .toList();
    }

    static TargetPlanCard card(Presets.Preset p) {
        TargetsResponse t = targets(p.details());
        return new TargetPlanCard(null, p.key(), false, p.name(), p.subtitle() + " · " + length(p.details()) + " days",
                body(p.details()).goal().key(), p.tags(), p.icon(), p.hue(), t.kcal(), t.protein(),
                length(p.details()), null);
    }

    // ---- Ready-made plans and previews: worked out each time, never stored

    @Transactional
    public TargetPlanResponse preset(UUID householdId, UUID requesterId, String key) {
        householdService.assertMember(householdId, requesterId);
        Presets.Preset p = Presets.find(key)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such ready-made plan."));
        Generated g = generate(householdId, p.details(), Map.of(), Map.of(), Map.of());
        return response(null, p.key(), false, p.name(), p.details(), g, p.tags(), p.icon(), p.hue(), null);
    }

    @Transactional
    public TargetPlanResponse preview(UUID householdId, UUID requesterId, PreviewRequest r) {
        householdService.assertMember(householdId, requesterId);
        Map<Slot, UUID> wanted = new HashMap<>();
        if (r.chosen() != null) {
            for (TargetPlanDtos.SlotChoice c : r.chosen()) wanted.putIfAbsent(new Slot(c.day(), c.mealType()), c.recipeId());
        }
        Generated g = generate(householdId, r.details(), Map.of(), Map.of(), wanted);
        return response(null, null, false, nameOr(r.name(), r.details()), r.details(), g, null, null, null, null);
    }

    /** Recipes offered to a phone's model for a whole plan; it may choose only from these. */
    static final int CANDIDATES = 40;

    /**
     * What a phone's Apple Intelligence chooses a plan from: the targets, each meal's share of
     * them, and the recipes the details allow with their nutrition per serving. The model picks;
     * a preview with its picks puts them through the same rules and works out the portions.
     */
    // Not read-only: working out a recipe's nutrition may learn a weight on the way, as previews do.
    @Transactional
    public TargetPlanDtos.TargetCandidatesResponse candidates(UUID householdId, UUID requesterId, TargetDetails d) {
        householdService.assertMember(householdId, requesterId);
        TargetsResponse t = targets(d);
        boolean onlyMine = Boolean.TRUE.equals(d.onlyMyRecipes());
        List<RecipePool.PoolRecipe> recipes = pool.forHousehold(householdId, !onlyMine);
        TargetPlanner planner = new TargetPlanner(options(recipes), new Preferences(d.preferences(), d.avoid()),
                d.useMyRecipesFirst() == null || d.useMyRecipesFirst(), t.kcal(), t.protein());
        List<MealType> meals = mealTypes(d);
        Map<MealType, Double> shares = TargetPlanner.shares(meals);
        List<TargetPlanDtos.MealAim> aims = meals.stream()
                .map(m -> new TargetPlanDtos.MealAim(m, (int) Math.round(t.kcal() * shares.get(m)),
                        (int) Math.round(t.protein() * shares.get(m)))).toList();
        List<TargetPlanDtos.TargetCandidate> out = planner.candidates(meals, CANDIDATES).stream()
                .map(o -> new TargetPlanDtos.TargetCandidate(o.id(), o.name(), o.section(), o.yours(),
                        meals.stream().filter(m -> CupboardPlanner.fit(o.section(), m) > 0).toList(),
                        (int) Math.round(o.kcal()), (int) Math.round(o.protein()), (int) Math.round(o.carbs()),
                        (int) Math.round(o.fat()), o.minutes()))
                .toList();
        return new TargetPlanDtos.TargetCandidatesResponse(t, length(d), meals, aims, out);
    }

    /** Swap a meal in a preview or a ready-made plan; the client sends the meals it has. */
    @Transactional
    public TargetPlanResponse previewSwap(UUID householdId, UUID requesterId, PreviewSwapRequest r) {
        householdService.assertMember(householdId, requesterId);
        List<StoredMeal> meals = r.meals().stream().map(m -> new StoredMeal(m.day(), m.mealType(), m.recipeId(), m.portion())).toList();
        Generated g = swapped(householdId, r.details(), meals, new Slot(r.day(), r.mealType()), r.exclude(), r.recipeId());
        return response(null, null, false, nameOr(r.name(), r.details()), r.details(), g, null, null, null, null);
    }

    // ---- Your own plans

    @Transactional
    public TargetPlanResponse create(UUID householdId, UUID requesterId, CreateTargetPlanRequest r) {
        householdService.assertMember(householdId, requesterId);
        TargetDetails details = r.details();
        targets(details);  // turns away an unknown goal or activity before anything is saved
        Generated g;
        if (r.meals() != null && !r.meals().isEmpty()) {
            g = kept(householdId, details, r.meals());
        } else {
            g = generate(householdId, details, Map.of(), Map.of(), Map.of());
        }
        TargetPlan plan = new TargetPlan();
        plan.setOwnerId(requesterId);
        plan.setHouseholdId(householdId);
        plan.setName(r.name().trim());
        plan.setDetails(write(details));
        plan.setMeals(write(stored(g)));
        plans.save(plan);
        return response(plan, g);
    }

    @Transactional
    public TargetPlanResponse get(UUID householdId, UUID requesterId, UUID planId) {
        TargetPlan plan = owned(householdId, requesterId, planId);
        return response(plan, resolve(householdId, details(plan), storedMeals(plan)));
    }

    /**
     * Keeping a preview exactly as it was shown (portions and all): every recipe must still be
     * one the household can use.
     */
    private Generated kept(UUID householdId, TargetDetails details, List<PlanMealChoice> choices) {
        List<StoredMeal> meals = choices.stream()
                .map(m -> new StoredMeal(m.day(), m.mealType(), m.recipeId(), m.portion())).toList();
        Generated g = resolve(householdId, details, meals);
        if (g.meals().stream().anyMatch(TargetPlans::gone)) {
            throw bad("One of those recipes isn't one this household can use.");
        }
        return g;
    }

    /**
     * New details work the meals out again; meals sent with them (a preview a phone's Apple
     * Intelligence chose) are kept exactly instead. A new name alone keeps the meals there are.
     */
    @Transactional
    public TargetPlanResponse update(UUID householdId, UUID requesterId, UUID planId, UpdateTargetPlanRequest r) {
        TargetPlan plan = owned(householdId, requesterId, planId);
        if (r.name() != null && !r.name().isBlank()) plan.setName(r.name().trim());
        Generated g;
        boolean keepMeals = r.meals() != null && !r.meals().isEmpty();
        if (r.details() != null || keepMeals) {
            TargetDetails details = r.details() != null ? r.details() : details(plan);
            targets(details);
            g = keepMeals ? kept(householdId, details, r.meals()) : generate(householdId, details, Map.of(), Map.of(), Map.of());
            plan.setDetails(write(details));
            plan.setMeals(write(stored(g)));
        } else {
            g = resolve(householdId, details(plan), storedMeals(plan));
        }
        plan.setUpdatedAt(Instant.now());
        plans.save(plan);
        return response(plan, g);
    }

    @Transactional
    public TargetPlanResponse regenerate(UUID householdId, UUID requesterId, UUID planId) {
        TargetPlan plan = owned(householdId, requesterId, planId);
        Generated g = generate(householdId, details(plan), Map.of(), Map.of(), Map.of());
        plan.setMeals(write(stored(g)));
        plan.setUpdatedAt(Instant.now());
        plans.save(plan);
        return response(plan, g);
    }

    @Transactional
    public void delete(UUID householdId, UUID requesterId, UUID planId) {
        plans.delete(owned(householdId, requesterId, planId));
    }

    @Transactional
    public TargetPlanResponse swap(UUID householdId, UUID requesterId, UUID planId, SwapRequest r) {
        TargetPlan plan = owned(householdId, requesterId, planId);
        TargetDetails details = details(plan);
        if (r.day() >= length(details)) throw bad("That day isn't in the plan.");
        Generated g = swapped(householdId, details, storedMeals(plan), new Slot(r.day(), r.mealType()), r.exclude(),
                r.recipeId());
        plan.setMeals(write(stored(g)));
        plan.setUpdatedAt(Instant.now());
        plans.save(plan);
        return response(plan, g);
    }

    /**
     * Your plan's meals onto the household's Plan, day 0 on the start date. Only the meals go
     * across — the plan, its name and the details behind it stay yours.
     */
    @Transactional
    public ApplyResponse apply(UUID householdId, UUID requesterId, UUID planId, ApplyTargetPlanRequest r) {
        TargetPlan plan = owned(householdId, requesterId, planId);
        Set<Integer> days = r.days() == null || r.days().isEmpty() ? null : new HashSet<>(r.days());
        Generated g = resolve(householdId, details(plan), storedMeals(plan));
        int people = r.servings() != null ? r.servings()
                : households.findById(householdId).map(Household::getDefaultServings).orElse(1);
        List<ApplyMeal> meals = new ArrayList<>();
        for (Meal m : g.meals()) {
            if (gone(m) || (days != null && !days.contains(m.slot().day()))) continue;
            meals.add(new ApplyMeal(r.start().plusDays(m.slot().day()), m.slot().meal(), m.option().id(),
                    servingsToCook(m.portion(), people)));
        }
        if (meals.isEmpty()) throw bad("There are no meals in those days to apply.");
        return planApply.apply(householdId, requesterId, meals, null);
    }

    /**
     * How many servings to cook so the plan's portion is really there: the plan's numbers are for
     * its portion (two servings of porridge, say), so the pot is that much plus one serving for
     * each of the others it is cooked for — not the household's usual four with the plan's two
     * quietly shared out. Half portions round up: nobody cooks half a serving.
     */
    static int servingsToCook(double portion, int people) {
        int mine = (int) Math.ceil(portion - 1e-9);
        return Math.max(1, Math.min(50, Math.max(0, people - 1) + Math.max(1, mine)));
    }

    /**
     * The owner's plan, in a household they are still in. For anybody else — another member of
     * the house included — there is no such plan, which is also what a wrong id gets.
     */
    private TargetPlan owned(UUID householdId, UUID requesterId, UUID planId) {
        TargetPlan plan = plans.findById(planId)
                .filter(p -> p.getOwnerId().equals(requesterId) && p.getHouseholdId().equals(householdId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such plan."));
        householdService.assertMember(householdId, requesterId);
        return plan;
    }

    // ---- Choosing and reading back

    /** The meals, with each one's option (null when the recipe can no longer be used). */
    record Generated(List<Meal> meals, int allowed, int kcal, int protein) {
    }

    private Generated generate(UUID householdId, TargetDetails d, Map<Slot, Meal> fixed, Map<Slot, Set<UUID>> excluded,
                               Map<Slot, UUID> wanted) {
        TargetsResponse t = targets(d);
        boolean onlyMine = Boolean.TRUE.equals(d.onlyMyRecipes());
        List<RecipePool.PoolRecipe> recipes = pool.forHousehold(householdId, !onlyMine);
        TargetPlanner planner = new TargetPlanner(options(recipes), new Preferences(d.preferences(), d.avoid()),
                d.useMyRecipesFirst() == null || d.useMyRecipesFirst(), t.kcal(), t.protein());
        List<Meal> meals = planner.plan(length(d), mealTypes(d), fixed, excluded, wanted);
        return new Generated(meals, planner.allowed(), t.kcal(), t.protein());
    }

    private Generated swapped(UUID householdId, TargetDetails d, List<StoredMeal> meals, Slot slot, List<UUID> exclude,
                              UUID recipeId) {
        Generated current = resolve(householdId, d, meals);
        Map<Slot, Meal> fixed = new HashMap<>();
        Set<UUID> excluded = new HashSet<>(exclude == null ? List.of() : exclude);
        for (Meal m : current.meals()) {
            if (gone(m)) continue;
            if (m.slot().equals(slot)) excluded.add(m.option().id());
            else fixed.put(m.slot(), m);
        }
        // A phone's model may name the one it wants; it is taken only if the rules allow it there.
        Map<Slot, UUID> wanted = recipeId == null ? Map.of() : Map.of(slot, recipeId);
        Generated next = generate(householdId, d, fixed, Map.of(slot, excluded), wanted);
        boolean filled = next.meals().stream().anyMatch(m -> m.slot().equals(slot));
        if (filled) return next;
        // Nothing else is allowed there: the meal that was there stays.
        current.meals().stream().filter(m -> m.slot().equals(slot) && !gone(m)).findFirst()
                .ifPresent(m -> fixed.put(slot, m));
        return generate(householdId, d, fixed, Map.of(slot, excluded), Map.of());
    }

    /** Stored meals with today's recipes and nutrition; a recipe gone or out of reach is marked missing. */
    private Generated resolve(UUID householdId, TargetDetails d, List<StoredMeal> stored) {
        TargetsResponse t = targets(d);
        Map<UUID, RecipePool.PoolRecipe> found = pool.forIds(householdId,
                stored.stream().map(StoredMeal::recipeId).collect(java.util.stream.Collectors.toSet()));
        Map<UUID, Option> options = new HashMap<>();
        for (Option o : options(found.values())) options.put(o.id(), o);
        List<Meal> meals = new ArrayList<>();
        int length = length(d);
        for (StoredMeal s : stored) {
            if (s.day() < 0 || s.day() >= length) continue;
            Option o = options.get(s.recipeId());
            if (o == null && found.containsKey(s.recipeId())) {
                RecipePool.PoolRecipe r = found.get(s.recipeId());
                // Still usable, but nothing in it can be counted any more: shown with no numbers.
                o = new Option(r.id(), r.name(), r.section(), r.yours(), 0, 0, 0, 0, null, null, r.minutes(), r.words(),
                        r.coverImageId());
            }
            meals.add(new Meal(new Slot(s.day(), s.mealType()), o == null ? missing(s.recipeId()) : o, s.portion()));
        }
        meals.sort(Comparator.comparingInt((Meal m) -> m.slot().day()).thenComparing(m -> m.slot().meal()));
        return new Generated(meals, options.size(), t.kcal(), t.protein());
    }

    /** The meal's recipe was deleted, or taken out of Explore without being kept. */
    static boolean gone(Meal m) {
        return m.option().name() == null;
    }

    /** A recipe that was deleted, or taken out of Explore without being kept. */
    private static Option missing(UUID id) {
        return new Option(id, null, null, false, 0, 0, 0, 0, null, null, null, "", null);
    }

    private List<Option> options(Collection<RecipePool.PoolRecipe> recipes) {
        Map<UUID, RecipeNutrition.Serving> perServing =
                nutrition.servings(recipes.stream().map(RecipePool.PoolRecipe::recipe).toList(), Map.of());
        List<Option> options = new ArrayList<>();
        for (RecipePool.PoolRecipe r : recipes) {
            RecipeNutrition.Serving serving = perServing.get(r.id());
            Nutrients n = serving == null ? null : serving.nutrients();
            if (n == null || n.kcal() == null) continue;
            options.add(new Option(r.id(), r.name(), r.section(), r.yours(), n.kcalOrZero(), orZero(n.protein()),
                    orZero(n.carbs()), orZero(n.fat()), n.satFat(), n.sodiumMg(), r.minutes(), r.words(), r.coverImageId(),
                    serving.partial()));
        }
        return options;
    }

    // ---- Responses

    private TargetPlanResponse response(TargetPlan plan, Generated g) {
        TargetDetails d = details(plan);
        Targets.Goal goal = body(d).goal();
        return response(plan.getId(), null, true, plan.getName(), d, g, tags(d), icon(goal), hue(goal), plan.getUpdatedAt());
    }

    private TargetPlanResponse response(UUID id, String preset, boolean mine, String name, TargetDetails d, Generated g,
                                        List<String> tags, String icon, String hue, Instant updatedAt) {
        TargetsResponse t = targets(d);
        Targets.Goal goal = body(d).goal();
        int length = length(d);
        List<PlanDay> days = new ArrayList<>();
        double sumK = 0, sumP = 0, sumC = 0, sumF = 0;
        int counted = 0, yours = 0, total = 0;
        for (int day = 0; day < length; day++) {
            final int dd = day;
            List<PlanMeal> meals = new ArrayList<>();
            double k = 0, p = 0, c = 0, f = 0;
            for (Meal m : g.meals()) {
                if (m.slot().day() != dd) continue;
                Option o = m.option();
                boolean gone = o.name() == null;
                meals.add(new PlanMeal(dd, m.slot().meal(), o.id(), gone ? "No longer available" : o.name(), o.section(),
                        o.yours(), o.coverImageId(), m.portion(), (int) Math.round(m.kcal()), (int) Math.round(m.protein()),
                        (int) Math.round(m.carbs()), (int) Math.round(m.fat()), gone, !gone && o.partial(),
                        (int) Math.round(o.kcal())));
                k += m.kcal(); p += m.protein(); c += m.carbs(); f += m.fat();
                total++;
                if (o.yours() && !gone) yours++;
            }
            if (!meals.isEmpty()) {
                counted++;
                sumK += k; sumP += p; sumC += c; sumF += f;
            }
            days.add(new PlanDay(dd, (int) Math.round(k), (int) Math.round(p), (int) Math.round(c), (int) Math.round(f), meals));
        }
        Average avg = counted == 0 ? new Average(0, 0, 0, 0, 0, 0) : new Average(
                (int) Math.round(sumK / counted), (int) Math.round(sumP / counted), (int) Math.round(sumC / counted),
                (int) Math.round(sumF / counted), percent(sumK / counted, t.kcal()), percent(sumP / counted, t.protein()));
        String description = d.description() != null && !d.description().isBlank() ? d.description().trim() : null;
        return new TargetPlanResponse(id, preset, mine, name, description, goal.key(), goal.label, length, mealTypes(d),
                tags != null ? tags : tags(d), icon != null ? icon : icon(goal), hue != null ? hue : hue(goal), t,
                d, days, avg, g.allowed(), summary(avg, total, yours, g.allowed()), updatedAt);
    }

    /** "About 2,880 kcal and 152 g protein a day: 99% and 95% of the targets. 18 of 28 meals are your own recipes." */
    static String summary(Average avg, int meals, int yours, int allowed) {
        if (meals == 0) {
            return allowed == 0
                    ? "No recipes fit yet: none have nutrition to plan with, or the preferences rule them all out."
                    : "Nothing fits these meals yet.";
        }
        String s = String.format(java.util.Locale.UK, "About %,d kcal and %d g protein a day: %d%% and %d%% of the targets.",
                avg.kcal(), avg.protein(), avg.kcalPercent(), avg.proteinPercent());
        if (yours == meals) return s + " Every meal is one of your recipes.";
        if (yours == 0) return s + " Every meal is from global recipes.";
        return s + " " + yours + " of " + meals + " meals are your own recipes.";
    }

    private static int percent(double value, int target) {
        return target <= 0 ? 0 : (int) Math.round(100 * value / target);
    }

    static List<String> tags(TargetDetails d) {
        Set<String> tags = new LinkedHashSet<>();
        Targets.Goal goal = Targets.Goal.parse(d.goal());
        if (goal == Targets.Goal.BUILD_MUSCLE) tags.add("build-muscle");
        if (goal == Targets.Goal.LOSE_FAT) tags.add("lose-fat");
        List<String> prefs = d.preferences() == null ? List.of() : d.preferences();
        if (goal == Targets.Goal.MAINTAIN || prefs.contains("heart-healthy") || prefs.contains("vegetarian")
                || prefs.contains("vegan")) tags.add("healthy");
        if (prefs.contains("budget")) tags.add("budget");
        return List.copyOf(tags);
    }

    static String icon(Targets.Goal goal) {
        return switch (goal) {
            case BUILD_MUSCLE -> "flame";
            case LOSE_FAT -> "bolt";
            case MAINTAIN -> "heart";
        };
    }

    static String hue(Targets.Goal goal) {
        return switch (goal) {
            case BUILD_MUSCLE -> "tomato";
            case LOSE_FAT -> "mustard";
            case MAINTAIN -> "herb";
        };
    }

    static int length(TargetDetails d) {
        return d.days() == null ? DEFAULT_DAYS : d.days();
    }

    static List<MealType> mealTypes(TargetDetails d) {
        return d.meals() == null || d.meals().isEmpty() ? DEFAULT_MEALS : d.meals().stream().distinct().sorted().toList();
    }

    private static String nameOr(String name, TargetDetails d) {
        if (name != null && !name.isBlank()) return name.trim();
        return body(d).goal().label + " plan";
    }

    private static List<StoredMeal> stored(Generated g) {
        return g.meals().stream().filter(m -> m.option() != null)
                .map(m -> new StoredMeal(m.slot().day(), m.slot().meal(), m.option().id(), m.portion())).toList();
    }

    private TargetDetails details(TargetPlan plan) {
        return json.readValue(plan.getDetails(), TargetDetails.class);
    }

    private List<StoredMeal> storedMeals(TargetPlan plan) {
        return json.readValue(plan.getMeals(), new TypeReference<List<StoredMeal>>() {
        });
    }

    private String write(Object value) {
        return json.writeValueAsString(value);
    }

    private static double orZero(Double v) {
        return v == null ? 0 : v;
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
