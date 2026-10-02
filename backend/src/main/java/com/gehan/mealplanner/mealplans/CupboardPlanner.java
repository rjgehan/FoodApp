package com.gehan.mealplanner.mealplans;

import com.gehan.mealplanner.domain.MealType;
import com.gehan.mealplanner.domain.RecipeSection;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * "Cook from your cupboard": a few days of meals chosen from recipes the household could already
 * cook (its own, and published ones if allowed), favouring what is in the cupboard and above all
 * what needs using soon. Arithmetic only — no database — so the scoring can be tested by hand.
 *
 * Greedy, one slot at a time in date order, which is also what gets the spinach that goes off
 * on Thursday into Monday's dinner rather than Friday's. Each candidate scores:
 * <ul>
 *   <li>10 × the share of its ingredients already in the cupboard (the point of the exercise)</li>
 *   <li>+4 for each "use these up first" item it uses that no earlier meal has used yet, if this
 *       meal is on or before the item's use-by day</li>
 *   <li>+2.5 for each other use-soon item it uses that no earlier meal has used yet, likewise</li>
 *   <li>+0.3 for each cupboard item it uses, up to 8 (a fuller dish over a bare one)</li>
 *   <li>+3 × how well it fits the meal (a dinner recipe at dinner; see {@link #fit})</li>
 *   <li>−1 for each thing it adds to the shopping list that is not on it already</li>
 *   <li>+0.75 when it is one of the household's own</li>
 * </ul>
 * A recipe is never used twice in the window, never where it does not fit at all (a drink for
 * dinner, a snack for lunch), never when its shopping would take the list past the buy limit,
 * and never when less than a fifth of it is in the cupboard: this is cooking from the cupboard,
 * not a shopping list with a recipe attached.
 *
 * A typed use-by date is a fact: after it, the thing is not in the cupboard as far as that meal is
 * concerned (it goes on the shopping list like anything else missing). A guessed date only
 * decides the bonus — the guess may be wrong, and the person can see the label says "soon".
 */
public final class CupboardPlanner {

    /** No limit on extra things to buy. */
    public static final int ANY = -1;

    /** Below this share in the cupboard a recipe is not "from the cupboard" at all. */
    static final double MIN_COVERAGE = 0.2;

    public record Need(UUID ingredientId, String name, String key) {
    }

    public record Dish(UUID id, String name, RecipeSection section, boolean yours, List<Need> needs) {
    }

    /**
     * Something in the cupboard. {@code priority}: ticked under "use these up first".
     *
     * @param by    the day to use it by, typed in or guessed; null when it keeps
     * @param dated {@code by} is the date on the packet, not a guess
     */
    public record Stocked(UUID ingredientId, String name, String key, boolean useSoon, boolean priority,
                          LocalDate by, boolean dated) {
        public Stocked(UUID ingredientId, String name, String key, boolean useSoon, boolean priority) {
            this(ingredientId, name, key, useSoon, priority, null, false);
        }

        /** Still good on that day: no date, or the day is on or before it. */
        public boolean goodOn(LocalDate day) {
            return by == null || day == null || !day.isAfter(by);
        }

        /** Usable at all on that day: a guess never rules it out, a typed date gone by does. */
        boolean usableOn(LocalDate day) {
            return !dated || goodOn(day);
        }
    }

    public record Slot(LocalDate date, MealType meal) {
    }

    public record Pick(Slot slot, Dish dish, List<Stocked> uses, List<Need> missing, boolean fixed) {
        /** Of the ingredients that count, how many are in the cupboard, as a whole percentage. */
        public int percent() {
            int all = uses.size() + missing.size();
            return all == 0 ? 0 : (int) Math.round(100.0 * uses.size() / all);
        }
    }

    /**
     * @param toBuy   what the plan needs that the cupboard does not have, each once, in the order
     *                the meals need them
     * @param unfilled slots nothing could go in under the rules
     */
    public record Draft(List<Pick> picks, List<Slot> unfilled, List<Need> toBuy) {
        /** Of every counted ingredient across the meals, how many come from the cupboard. */
        public int percent() {
            int have = 0, all = 0;
            for (Pick p : picks) {
                have += p.uses().size();
                all += p.uses().size() + p.missing().size();
            }
            return all == 0 ? 0 : (int) Math.round(100.0 * have / all);
        }

        /**
         * The use-soon and use-first things that a meal uses on or before the day they are good
         * to — what "gets used before it goes off" may honestly say.
         */
        public Set<String> usedInTime() {
            Set<String> keys = new HashSet<>();
            for (Pick p : picks) {
                for (Stocked s : p.uses()) {
                    if ((s.useSoon() || s.priority()) && s.goodOn(p.slot().date())) keys.add(s.key());
                }
            }
            return keys;
        }

        /** Different cupboard things the meals use. */
        public List<Stocked> used() {
            Map<String, Stocked> used = new LinkedHashMap<>();
            for (Pick p : picks) for (Stocked s : p.uses()) used.putIfAbsent(s.key(), s);
            return List.copyOf(used.values());
        }
    }

    private final Map<UUID, Stocked> byId = new HashMap<>();
    private final Map<String, Stocked> byKey = new HashMap<>();
    private final List<Dish> dishes;
    private final int buyLimit;

    public CupboardPlanner(Collection<Stocked> stock, List<Dish> dishes, int buyLimit) {
        for (Stocked s : stock) {
            if (s.ingredientId() != null) byId.putIfAbsent(s.ingredientId(), s);
            if (!s.key().isEmpty()) byKey.putIfAbsent(s.key(), s);
        }
        // Sorted by name, so equal scores always come out the same way round.
        this.dishes = dishes.stream().sorted(Comparator.comparing(Dish::name, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(d -> d.id().toString())).toList();
        this.buyLimit = buyLimit;
    }

    /** How well a recipe filed in this drawer suits this meal: 1 is made for it, 0 is never. */
    public static double fit(RecipeSection section, MealType meal) {
        RecipeSection s = section == null ? RecipeSection.OTHER : section;
        if (s == RecipeSection.DRINKS) return 0;
        return switch (meal) {
            case BREAKFAST -> switch (s) {
                case BREAKFAST -> 1;
                case OTHER -> 0.3;
                case SNACKS -> 0.2;
                default -> 0;
            };
            // A snack is not a lunch: a bowl of yogurt for four, or a cream pudding, is no meal.
            case LUNCH -> switch (s) {
                case LUNCH -> 1;
                case DINNER -> 0.7;
                case OTHER -> 0.4;
                case BREAKFAST -> 0.2;
                default -> 0;
            };
            case DINNER -> switch (s) {
                case DINNER -> 1;
                case LUNCH -> 0.6;
                case OTHER -> 0.4;
                default -> 0;
            };
            case SNACK -> switch (s) {
                case SNACKS -> 1;
                case BREAKFAST, OTHER -> 0.3;
                default -> 0;
            };
        };
    }

    /**
     * @param slots     every slot to fill, in any order
     * @param fixed     slots whose recipe is already decided (kept through a swap)
     * @param excluded  recipes not to put in a slot (the one being swapped out, and any shown before)
     * @param alreadyPlanned recipes on the household's plan in the window, which count as repeats
     */
    public Draft plan(List<Slot> slots, Map<Slot, UUID> fixed, Map<Slot, Set<UUID>> excluded, Set<UUID> alreadyPlanned) {
        return plan(slots, fixed, excluded, alreadyPlanned, Map.of());
    }

    /**
     * @param wanted a recipe somebody else chose for a slot — a phone's Apple Intelligence —
     *               taken in that slot's turn if the rules allow it there (it fits the meal, is
     *               not a repeat or excluded, and its shopping stays inside the buy limit), and
     *               otherwise passed over for the slot's own best, exactly as if never asked
     */
    public Draft plan(List<Slot> slots, Map<Slot, UUID> fixed, Map<Slot, Set<UUID>> excluded, Set<UUID> alreadyPlanned,
                      Map<Slot, UUID> wanted) {
        List<Slot> ordered = slots.stream().distinct()
                .sorted(Comparator.comparing(Slot::date).thenComparing(Slot::meal)).toList();
        Map<UUID, Dish> dishById = new HashMap<>();
        dishes.forEach(d -> dishById.put(d.id(), d));
        Map<Slot, Pick> chosen = new HashMap<>();
        State state = kept(ordered, fixed, alreadyPlanned, dishById, chosen);
        List<Slot> unfilled = new ArrayList<>();
        for (Slot slot : ordered) {
            if (chosen.containsKey(slot)) continue;
            Set<UUID> notHere = excluded.getOrDefault(slot, Set.of());
            Pick best = allowed(slot, dishById.get(wanted.get(slot)), state, notHere);
            if (best == null) best = best(slot, state, notHere);
            if (best == null) {
                unfilled.add(slot);
                continue;
            }
            state.take(best);
            chosen.put(slot, best);
        }

        List<Pick> picks = ordered.stream().filter(chosen::containsKey).map(chosen::get).toList();
        Map<String, Need> toBuy = new LinkedHashMap<>();
        for (Pick p : picks) for (Need n : p.missing()) toBuy.putIfAbsent(n.key(), n);
        return new Draft(picks, unfilled, List.copyOf(toBuy.values()));
    }

    /** What is kept counts first — its shopping and its use-soon things are spoken for. */
    private State kept(List<Slot> ordered, Map<Slot, UUID> fixed, Set<UUID> alreadyPlanned, Map<UUID, Dish> dishById,
                       Map<Slot, Pick> chosen) {
        State state = new State();
        state.usedRecipes.addAll(alreadyPlanned);
        for (Slot slot : ordered) {
            UUID keep = fixed.get(slot);
            Dish dish = keep == null ? null : dishById.get(keep);
            if (dish == null) continue;
            Pick pick = pick(slot, dish, true);
            state.take(pick);
            chosen.put(slot, pick);
        }
        return state;
    }

    /** This dish in this slot if the rules allow it there, else null. */
    Pick allowed(Slot slot, Dish dish, State state, Set<UUID> excluded) {
        if (dish == null || excluded.contains(dish.id()) || state.usedRecipes.contains(dish.id())) return null;
        return score(slot, dish, state) == null ? null : pick(slot, dish, false);
    }

    /**
     * A recipe a phone's model may choose, with what the server knows about it: the meals it may
     * go in, how much of it is in the cupboard, and its score (the same one the greedy plan uses).
     */
    public record Candidate(Dish dish, Pick pick, double score, List<MealType> fits) {
    }

    /**
     * What a phone's Apple Intelligence chooses from, best first: for one slot (a swap), every
     * recipe the rules allow there with the other meals as they are; for a whole plan, every
     * recipe allowed in at least one of the slots' meals on its own, scored at the meal it suits
     * best. The model only ever picks from this list, and the plan it sends back is checked by
     * the same rules again.
     *
     * @param target the slot being swapped, or null for a whole plan
     */
    public List<Candidate> candidates(List<Slot> slots, Map<Slot, UUID> fixed, Set<UUID> alreadyPlanned, Slot target,
                                      Set<UUID> excluded, int limit) {
        List<Slot> ordered = slots.stream().distinct()
                .sorted(Comparator.comparing(Slot::date).thenComparing(Slot::meal)).toList();
        Map<UUID, Dish> dishById = new HashMap<>();
        dishes.forEach(d -> dishById.put(d.id(), d));
        Map<Slot, UUID> others = new HashMap<>(fixed);
        if (target != null) others.remove(target);
        State state = kept(ordered, others, alreadyPlanned, dishById, new HashMap<>());
        List<MealType> meals = target != null ? List.of(target.meal())
                : ordered.stream().map(Slot::meal).distinct().sorted().toList();
        LocalDate day = target != null ? target.date() : ordered.isEmpty() ? null : ordered.get(0).date();
        List<Candidate> out = new ArrayList<>();
        for (Dish dish : dishes) {
            if (excluded.contains(dish.id()) || state.usedRecipes.contains(dish.id())) continue;
            List<MealType> fits = new ArrayList<>();
            double top = Double.NEGATIVE_INFINITY;
            for (MealType meal : meals) {
                Double score = score(new Slot(day, meal), dish, state);
                if (score == null) continue;
                fits.add(meal);
                top = Math.max(top, score);
            }
            if (fits.isEmpty()) continue;
            out.add(new Candidate(dish, pick(new Slot(day, fits.get(0)), dish, false), top, List.copyOf(fits)));
        }
        out.sort(Comparator.comparingDouble(Candidate::score).reversed());
        return out.size() > limit ? List.copyOf(out.subList(0, limit)) : out;
    }

    /** The best candidate for one slot, or null when nothing is allowed there. */
    Pick best(Slot slot, State state, Set<UUID> excluded) {
        Pick best = null;
        double bestScore = Double.NEGATIVE_INFINITY;
        for (Dish dish : dishes) {
            if (excluded.contains(dish.id()) || state.usedRecipes.contains(dish.id())) continue;
            Double score = score(slot, dish, state);
            if (score == null) continue;
            if (score > bestScore) {
                bestScore = score;
                best = pick(slot, dish, false);
            }
        }
        return best;
    }

    /** The score above, or null when the rules say no. */
    Double score(Slot slot, Dish dish, State state) {
        double fit = fit(dish.section(), slot.meal());
        if (fit == 0) return null;
        Pick pick = pick(slot, dish, false);
        int all = pick.uses().size() + pick.missing().size();
        if (all == 0 || pick.uses().isEmpty()) return null;
        double coverage = (double) pick.uses().size() / all;
        if (coverage < MIN_COVERAGE) return null;
        Set<String> newBuys = new HashSet<>();
        for (Need n : pick.missing()) if (!state.shopping.contains(n.key())) newBuys.add(n.key());
        if (buyLimit != ANY && state.shopping.size() + newBuys.size() > buyLimit) return null;

        int priority = 0, soon = 0;
        for (Stocked s : pick.uses()) {
            if (state.usedStock.contains(s.key()) || !s.goodOn(slot.date())) continue;
            if (s.priority()) priority++;
            else if (s.useSoon()) soon++;
        }
        return 10 * coverage + 4 * priority + 2.5 * soon + 0.3 * Math.min(8, pick.uses().size())
                + 3 * fit - newBuys.size() + (dish.yours() ? 0.75 : 0);
    }

    /** What a dish takes from the cupboard and what it would need buying, each ingredient once. */
    Pick pick(Slot slot, Dish dish, boolean fixed) {
        List<Stocked> uses = new ArrayList<>();
        List<Need> missing = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Need need : dish.needs()) {
            if (!seen.add(need.key())) continue;
            Stocked have = need.ingredientId() != null ? byId.get(need.ingredientId()) : null;
            if (have == null) have = byKey.get(need.key());
            // Past the date on its packet by this meal: as good as not there.
            if (have != null && !have.usableOn(slot.date())) have = null;
            if (have != null) uses.add(have);
            else missing.add(need);
        }
        return new Pick(slot, dish, uses, missing, fixed);
    }

    /** What the meals chosen so far have used, bought and taken. */
    static final class State {
        final Set<UUID> usedRecipes = new HashSet<>();
        final Set<String> shopping = new HashSet<>();
        final Set<String> usedStock = new HashSet<>();

        void take(Pick pick) {
            usedRecipes.add(pick.dish().id());
            pick.missing().forEach(n -> shopping.add(n.key()));
            pick.uses().forEach(s -> usedStock.add(s.key()));
        }
    }
}
