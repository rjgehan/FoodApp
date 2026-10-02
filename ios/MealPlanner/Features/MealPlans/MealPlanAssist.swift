import Foundation

/*
 What Apple Intelligence does for Meal plans on an iPhone that has it, and the rules every answer
 has to pass before it is used.

 The server plans on its own for every phone and the web: a greedy pick, slot by slot, of the
 recipe that scores best. That is sensible but blinkered — it never looks at the week as a whole.
 On a phone with Apple Intelligence the model is shown the server's own candidates, a day at a
 time, and chooses a varied, sensible set from them:

 - Cook from your cupboard: for each day, a recipe per meal from the server's candidates for that
   meal (a guided `.anyOf`, so it can only answer with one of them), told what still wants using
   up and what earlier days already have. Every pick is checked here — offered for that meal, not
   twice, inside the buy limit — and the plan goes back to the server as "chosen", which checks
   each one again by its own rules and fills anything refused with its own best.
 - Plans for health targets: the same, with each meal's share of the day's energy and protein
   to aim at; the server works out every portion and every number.
 - Swaps: one meal again, from the server's candidates for that one slot.
 - "Use soon" for cupboard things the server's rule has no view on and nobody dated: how many
   days the thing keeps (a guided `.range`), counted from when it came in, shown as "soon".
 - A few friendly words about a plan, from words only: an answer with a digit in it is thrown
   away, so the model never puts a number on the screen.

 Anything that fails — no model, a refusal, a throw, an answer off the list — leaves the server's
 own plan standing, which is exactly what a phone without Apple Intelligence shows.

 Foundation only, so ios/checks can test the rules on a Mac without the app or a model.
*/

/// One day's question: a recipe for each of `meals`, each from its own `options`.
struct DayQuestion: Equatable, Sendable {
    /// "Monday 5", "Day 2".
    let day: String
    let meals: [MealType]
    /// The labels each meal may be answered with, word for word.
    let options: [MealType: [String]]
    /// One line per recipe on offer today, in words the model can choose on.
    let menu: [String]
    /// Recipes earlier days already have, for variety.
    let earlier: [String]
    /// Anything else worth knowing: what wants using up, what the day aims at.
    let notes: [String]
    /// "cupboard" or "target": which instructions the model gets.
    let kind: String
}

/// One meal again (a swap).
struct SwapQuestion: Equatable, Sendable {
    let slot: String
    let options: [String]
    let menu: [String]
    /// The rest of the plan as it stands.
    let rest: [String]
    let notes: [String]
    let kind: String
}

/// A plan in words, for the model's few words. No numbers on purpose.
struct PlanFacts: Equatable, Sendable {
    /// "a few days cooked from the cupboard", "a week for building muscle".
    let what: String
    let traits: [String]
    let dishes: [String]
}

/// What the model is asked. An implementation answers or throws; nothing here trusts it.
protocol MealPlanThinker: Sendable {
    func chooseDay(_ question: DayQuestion) async throws -> [MealType: String]
    func chooseOne(_ question: SwapQuestion) async throws -> String
    /// Roughly how many days `name` keeps from when it was bought, stored as usual.
    func keepsFor(_ name: String) async throws -> Int
    func planWords(_ facts: PlanFacts) async throws -> String
}

/// Shelf lives this phone's model has guessed already, by name, so each is asked once.
protocol ShelfMemory: AnyObject {
    func days(_ name: String) -> Int?
    func remember(_ name: String, days: Int)
}

enum MealPlanAssist {
    /// Recipes offered for one meal of one day: enough to choose from, few enough for the context.
    static let perMeal = 10
    /// Shelf lives the model may answer with: a day to a year.
    static let shelfRange = 1...365
    /// "Use soon" is within this many days, as the server's rule says (UseSoon.SOON_DAYS).
    static let soonDays = 3
    /// A guess run out longer ago than this is about something already gone (UseSoon.STALE_AFTER_DAYS).
    static let staleAfter = 14
    /// At most this many cupboard things asked about each time the setup opens.
    static let shelfQuestions = 8

    // MARK: Labels

    /**
     The names the model chooses between, made unique: two recipes both called "Chilli" become
     "Chilli" and "Chilli (2)". The label is all the model ever answers with; the id stays here.
     */
    static func labels(_ names: [String]) -> [String] {
        var seen: [String: Int] = [:]
        return names.map { raw in
            let name = raw.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\n", with: " ")
            let key = name.lowercased()
            let n = (seen[key] ?? 0) + 1
            seen[key] = n
            return n == 1 ? name : "\(name) (\(n))"
        }
    }

    private static func mealWord(_ meal: MealType) -> String { meal.title.lowercased() }

    private static func list(_ words: [String]) -> String {
        switch words.count {
        case 0: return ""
        case 1: return words[0]
        default: return words.dropLast().joined(separator: ", ") + " and " + words.last!
        }
    }

    // MARK: Cook from your cupboard

    /// A candidate as the model reads it: "Chickpea curry — dinner or lunch; all in the cupboard; uses up spinach".
    static func menuLine(_ r: CandidateRecipe, label: String) -> String {
        var parts = [r.fits.map(mealWord).joined(separator: " or ")]
        parts.append(r.percentFromCupboard >= 100 ? "all in the cupboard"
                     : r.percentFromCupboard >= 75 ? "mostly in the cupboard"
                     : r.percentFromCupboard >= 40 ? "partly in the cupboard" : "mostly to buy")
        if !r.usesSoon.isEmpty { parts.append("uses up " + list(r.usesSoon.map { $0.lowercased() })) }
        parts.append(r.toBuy.isEmpty ? "nothing to buy" : "buy " + list(r.toBuy.prefix(4).map { $0.lowercased() }))
        if !r.yours { parts.append("a global recipe") }
        return "\(label) — " + parts.joined(separator: "; ")
    }

    /**
     A whole cupboard plan from the server's candidates, a day at a time. Nil when there is
     nothing to ask, when the model fails at any point (the server's own plan stands), or when
     none of its picks pass. Picks that fail the checks are dropped one by one: the server fills
     those slots with its own best.
     */
    static func cupboardPlan(_ c: CupboardCandidates, setup: CupboardPlanRequest, thinker: MealPlanThinker,
                             progress: @Sendable (Int, Int) async -> Void = { _, _ in }) async -> [MealChoice]? {
        guard !c.slots.isEmpty, !c.recipes.isEmpty else { return nil }
        let labels = labels(c.recipes.map(\.name))
        let byLabel = Dictionary(uniqueKeysWithValues: zip(labels, c.recipes))
        let dates = Array(Set(c.slots.map(\.date))).sorted()
        var used = Set<UUID>()
        var shopping = Set<String>()
        var soonLeft = Set(c.recipes.flatMap(\.usesSoon))
        var picks: [MealChoice] = []
        var earlier: [String] = []

        for (index, date) in dates.enumerated() {
            await progress(index + 1, dates.count)
            let meals = MealPlanText.order.filter { m in c.slots.contains { $0.date == date && $0.mealType == m } }
            var options: [MealType: [String]] = [:]
            for meal in meals {
                options[meal] = zip(labels, c.recipes)
                    .filter { $0.1.fits.contains(meal) && !used.contains($0.1.recipeId) }
                    .prefix(perMeal).map(\.0)
            }
            let offered = meals.filter { !(options[$0] ?? []).isEmpty }
            guard !offered.isEmpty else { continue }
            let onMenu = labels.filter { label in offered.contains { options[$0]?.contains(label) == true } }
            var notes: [String] = []
            if !soonLeft.isEmpty { notes.append("Still to use up soon: " + list(soonLeft.sorted().map { $0.lowercased() }) + ".") }
            if let limit = setup.buyLimit {
                notes.append(limit == 0 ? "Nothing may be bought." : "At most \(max(0, limit - shopping.count)) more things may be bought.")
            }
            let question = DayQuestion(day: "\(NutritionText.weekday(date, short: false)) \(MealPlanText.dayOfMonth(date))",
                                       meals: offered, options: options,
                                       menu: onMenu.compactMap { l in byLabel[l].map { menuLine($0, label: l) } },
                                       earlier: earlier, notes: notes, kind: "cupboard")
            let answer: [MealType: String]
            do {
                answer = try await thinker.chooseDay(question)
            } catch {
                return nil
            }
            for meal in offered {
                guard let said = answer[meal]?.trimmingCharacters(in: .whitespacesAndNewlines),
                      options[meal]?.contains(said) == true, let r = byLabel[said],
                      !used.contains(r.recipeId) else { continue }
                let newBuys = Set(r.toBuy.map { $0.lowercased() }).subtracting(shopping)
                if let limit = setup.buyLimit, shopping.count + newBuys.count > limit { continue }
                used.insert(r.recipeId)
                shopping.formUnion(newBuys)
                soonLeft.subtract(r.usesSoon)
                earlier.append(r.name)
                picks.append(MealChoice(date: date, mealType: meal, recipeId: r.recipeId))
            }
        }
        return picks.isEmpty ? nil : picks
    }

    /// One cupboard meal again, from the server's candidates for that slot. Nil leaves it to the server.
    static func cupboardSwap(_ c: CupboardCandidates, plan: CupboardPlan, slot: SlotRef,
                             thinker: MealPlanThinker) async -> UUID? {
        let offered = Array(c.recipes.filter { $0.fits.contains(slot.mealType) }.prefix(perMeal))
        guard offered.count > 1 else { return nil }
        let labels = labels(offered.map(\.name))
        let rest = plan.meals.filter { $0.slot != MealPlanText.slotKey(slot.date, slot.mealType) }
            .map { "\(NutritionText.weekday($0.date)) \(mealWord($0.mealType)): \($0.name)" }
        var notes: [String] = []
        if !plan.useSoonLeft.isEmpty { notes.append("Still to use up soon: " + list(plan.useSoonLeft.map { $0.lowercased() }) + ".") }
        let question = SwapQuestion(slot: "\(NutritionText.weekday(slot.date, short: false)) \(mealWord(slot.mealType))",
                                    options: labels, menu: zip(labels, offered).map { menuLine($0.1, label: $0.0) },
                                    rest: rest, notes: notes, kind: "cupboard")
        guard let said = try? await thinker.chooseOne(question),
              let i = labels.firstIndex(of: said.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
        return offered[i].recipeId
    }

    /// Which of the server's meals are the model's own picks, by slot: the ones to mark ✨.
    static func chosenByModel(_ meals: [DraftMeal], picks: [MealChoice]) -> Set<String> {
        let wanted = Dictionary(picks.map { (MealPlanText.slotKey($0.date, $0.mealType), $0.recipeId) },
                                uniquingKeysWith: { a, _ in a })
        return Set(meals.filter { wanted[$0.slot] == $0.recipeId }.map(\.slot))
    }

    // MARK: Plans for health targets

    /// "Protein oats — breakfast; about 520 kcal and 32 g protein a serving; your own recipe".
    static func menuLine(_ r: TargetCandidate, label: String) -> String {
        var parts = [r.fits.map(mealWord).joined(separator: " or "),
                     "about \(r.kcal) kcal and \(r.protein) g protein a serving"]
        if let minutes = r.minutes, minutes > 0 { parts.append("\(minutes) minutes") }
        parts.append(r.yours ? "your own recipe" : "a global recipe")
        return "\(label) — " + parts.joined(separator: "; ")
    }

    /**
     A whole plan for a health target from the server's candidates, a day at a time. The same
     rules as the server's planner are checked here — offered for that meal, never twice in a
     day, no lunch or dinner the day after it was lunch or dinner — and again on the server,
     which also works out every portion. Nil leaves the server's own plan standing.
     */
    static func targetPlan(_ c: TargetCandidates, thinker: MealPlanThinker,
                           progress: @Sendable (Int, Int) async -> Void = { _, _ in }) async -> [SlotChoice]? {
        guard c.length > 0, !c.recipes.isEmpty else { return nil }
        let labels = labels(c.recipes.map(\.name))
        let byLabel = Dictionary(uniqueKeysWithValues: zip(labels, c.recipes))
        let meals = MealPlanText.order.filter { c.mealTypes.contains($0) }
        var picks: [SlotChoice] = []
        var times: [UUID: Int] = [:]
        var earlier: [String] = []
        var yesterdayMains = Set<UUID>()
        let aims = c.aims.map { "\(mealWord($0.mealType)) about \($0.kcal) kcal" }

        for day in 0..<c.length {
            await progress(day + 1, c.length)
            var options: [MealType: [String]] = [:]
            for meal in meals {
                let main = meal == .lunch || meal == .dinner
                // Least used first, so the week varies; then the server's own order.
                let allowed = zip(labels, c.recipes).enumerated()
                    .filter { $0.element.1.fits.contains(meal) && !(main && yesterdayMains.contains($0.element.1.recipeId)) }
                    .sorted { (times[$0.element.1.recipeId] ?? 0, $0.offset) < (times[$1.element.1.recipeId] ?? 0, $1.offset) }
                options[meal] = allowed.prefix(perMeal).map(\.element.0)
            }
            let offered = meals.filter { !(options[$0] ?? []).isEmpty }
            guard !offered.isEmpty else { continue }
            let onMenu = labels.filter { label in offered.contains { options[$0]?.contains(label) == true } }
            let notes = ["The day aims at about \(c.targets.kcal) kcal and \(c.targets.protein) g protein: "
                         + aims.joined(separator: ", ") + ". Portions are scaled to fit, so choose what suits each meal."]
            let question = DayQuestion(day: "Day \(day + 1)", meals: offered, options: options,
                                       menu: onMenu.compactMap { l in byLabel[l].map { menuLine($0, label: l) } },
                                       earlier: Array(earlier.suffix(12)), notes: notes, kind: "target")
            let answer: [MealType: String]
            do {
                answer = try await thinker.chooseDay(question)
            } catch {
                return nil
            }
            var today = Set<UUID>()
            var mains = Set<UUID>()
            for meal in offered {
                guard let said = answer[meal]?.trimmingCharacters(in: .whitespacesAndNewlines),
                      options[meal]?.contains(said) == true, let r = byLabel[said],
                      !today.contains(r.recipeId) else { continue }
                today.insert(r.recipeId)
                if meal == .lunch || meal == .dinner { mains.insert(r.recipeId) }
                times[r.recipeId, default: 0] += 1
                earlier.append(r.name)
                picks.append(SlotChoice(day: day, mealType: meal, recipeId: r.recipeId))
            }
            yesterdayMains = mains
        }
        return picks.isEmpty ? nil : picks
    }

    /// One meal of a target plan again, from the candidates that suit it and the day. Nil leaves it to the server.
    static func targetSwap(_ c: TargetCandidates, plan: TargetPlan, meal: PlanMeal, thinker: MealPlanThinker) async -> UUID? {
        let main = meal.mealType == .lunch || meal.mealType == .dinner
        let sameDay = Set((plan.days.first { $0.day == meal.day }?.meals ?? []).map(\.recipeId))
        let nextDoor = Set(plan.days.filter { abs($0.day - meal.day) == 1 }
            .flatMap { $0.meals.filter { $0.mealType == .lunch || $0.mealType == .dinner }.map(\.recipeId) })
        let offered = Array(c.recipes.filter {
            $0.fits.contains(meal.mealType) && !sameDay.contains($0.recipeId) && !(main && nextDoor.contains($0.recipeId))
        }.prefix(perMeal))
        guard !offered.isEmpty else { return nil }
        let labels = labels(offered.map(\.name))
        let aim = c.aims.first { $0.mealType == meal.mealType }
        let rest = (plan.days.first { $0.day == meal.day }?.meals ?? [])
            .filter { $0.mealType != meal.mealType }.map { "\(mealWord($0.mealType)): \($0.name)" }
        let question = SwapQuestion(slot: "Day \(meal.day + 1) \(mealWord(meal.mealType)), instead of \(meal.name)",
                                    options: labels, menu: zip(labels, offered).map { menuLine($0.1, label: $0.0) },
                                    rest: rest,
                                    notes: aim.map { ["This meal aims at about \($0.kcal) kcal and \($0.protein) g protein; portions are scaled to fit."] } ?? [],
                                    kind: "target")
        guard let said = try? await thinker.chooseOne(question),
              let i = labels.firstIndex(of: said.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
        return offered[i].recipeId
    }

    /// Which of a target plan's meals are the model's own picks, by "day|MEAL": the ones to mark ✨.
    static func chosenByModel(_ plan: TargetPlan, picks: [SlotChoice]) -> Set<String> {
        let wanted = Dictionary(picks.map { ("\($0.day)|\($0.mealType.rawValue)", $0.recipeId) }, uniquingKeysWith: { a, _ in a })
        return Set(plan.days.flatMap(\.meals).filter { wanted[$0.slot] == $0.recipeId }.map(\.slot))
    }

    // MARK: Use soon, for things nobody dated

    struct ShelfGuess: Equatable {
        let item: UnsureItem
        let days: Int
        /// yyyy-MM-dd it should be used by, counted from when it came in.
        let by: String
    }

    /**
     The cupboard things the server could not judge, guessed by the model from the name: how
     long it keeps, counted from the day it came in. Only the ones that want using within the
     next few days come back, as "use these up first" suggestions marked as the model's. A
     guess is asked once per name on this phone; an answer outside a day to a year is ignored.
     */
    static func useSoonGuesses(_ unsure: [UnsureItem], today: String, thinker: MealPlanThinker,
                               memory: ShelfMemory, limit: Int = shelfQuestions) async -> [ShelfGuess] {
        var out: [ShelfGuess] = []
        for item in unsure.prefix(limit) {
            let key = item.name.lowercased().trimmingCharacters(in: .whitespaces)
            var days = memory.days(key)
            if days == nil, let said = try? await thinker.keepsFor(item.name), shelfRange.contains(said) {
                memory.remember(key, days: said)
                days = said
            }
            guard let days, shelfRange.contains(days) else { continue }
            let by = MealPlanText.addDays(item.arrivedOn, days)
            guard let left = MealPlanText.daysBetween(today, by), left <= soonDays, left >= -staleAfter else { continue }
            out.append(ShelfGuess(item: item, days: days, by: by))
        }
        return out
    }

    /// A guess as a "use these up first" chip: selected, labelled "soon" as the server's guesses are.
    static func suggestion(_ guess: ShelfGuess) -> UseFirstItem {
        UseFirstItem(itemId: guess.item.itemId, ingredientId: guess.item.ingredientId, name: guess.item.name,
                     reason: "ai", label: "soon", useBy: nil, selected: true)
    }

    // MARK: A few words about a plan

    static func facts(_ plan: CupboardPlan) -> PlanFacts? {
        guard !plan.meals.isEmpty else { return nil }
        var traits: [String] = []
        traits.append(plan.percentFromCupboard >= 90 ? "almost everything comes from the cupboard"
                      : plan.percentFromCupboard >= 60 ? "most of it comes from the cupboard"
                      : "it needs a bit of shopping")
        if plan.toBuy.isEmpty { traits.append("nothing to buy") }
        if !plan.useSoonUsed.isEmpty {
            traits.append("uses up " + list(plan.useSoonUsed.prefix(3).map { $0.lowercased() }) + " before they go off")
        }
        let days = Set(plan.meals.map(\.date)).count
        return PlanFacts(what: days == 1 ? "a day of meals cooked from the cupboard" : "a few days of meals cooked from the cupboard",
                         traits: traits, dishes: Array(plan.meals.map(\.name).prefix(4)))
    }

    static func facts(_ plan: TargetPlan) -> PlanFacts? {
        let meals = plan.days.flatMap(\.meals).filter { !$0.missing }
        guard !meals.isEmpty else { return nil }
        var traits: [String] = []
        let k = plan.average.kcalPercent, p = plan.average.proteinPercent
        traits.append(k >= 90 && k <= 110 ? "lands close to the day's calories"
                      : k < 90 ? "comes in a little under the day's calories" : "comes in a little over the day's calories")
        traits.append(p >= 95 ? "plenty of protein" : p >= 80 ? "a good amount of protein" : "lighter on protein than the target")
        let yours = meals.filter(\.yours).count
        traits.append(yours == meals.count ? "every meal is one of your own recipes"
                      : yours * 2 >= meals.count ? "mostly your own recipes" : "plenty of global recipes")
        let goal: String
        switch plan.goal {
        case Goal.buildMuscle.rawValue: goal = "for building muscle"
        case Goal.loseFat.rawValue: goal = "for losing fat"
        default: goal = "for eating well"
        }
        let span = plan.length == 7 ? "a week" : plan.length == 1 ? "a day" : "a few days"
        var seen = Set<String>()
        let dishes = meals.map(\.name).filter { seen.insert($0).inserted }.prefix(4)
        return PlanFacts(what: "\(span) of meals \(goal)", traits: traits, dishes: Array(dishes))
    }

    /// The model's words for a plan, if it has any that pass (NutritionAssist's rule: no digits).
    static func words(_ facts: PlanFacts?, thinker: MealPlanThinker) async -> String? {
        guard let facts, let said = try? await thinker.planWords(facts) else { return nil }
        return NutritionAssist.acceptedSummary(said)
    }
}

/// Guessed shelf lives kept in UserDefaults (the newest 200 names).
final class DefaultsShelfMemory: ShelfMemory {
    private let key = "mp_shelf_days"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func days(_ name: String) -> Int? {
        (defaults.dictionary(forKey: key) as? [String: Int])?[name]
    }

    func remember(_ name: String, days: Int) {
        var all = (defaults.dictionary(forKey: key) as? [String: Int]) ?? [:]
        all[name] = days
        if all.count > 200 { all.removeValue(forKey: all.keys.sorted().first!) }
        defaults.set(all, forKey: key)
    }
}

#if DEBUG
/**
 A stand-in for the model (`-mp_debug_ai fake`), for a Simulator on a Mac without Apple
 Intelligence: it answers the way a sensible model would — the first option that is new this
 week, three days for anything it is asked to shelf, words from the facts — so the whole path
 (asking, checking, sending picks, the ✨ marks) can be seen and tested without the model.
 */
struct StandInMealPlanThinker: MealPlanThinker {
    func chooseDay(_ question: DayQuestion) async throws -> [MealType: String] {
        var out: [MealType: String] = [:]
        var taken = Set(question.earlier)
        for meal in question.meals {
            let options = question.options[meal] ?? []
            if let pick = options.first(where: { !taken.contains($0) }) ?? options.first {
                out[meal] = pick
                taken.insert(pick)
            }
        }
        return out
    }

    func chooseOne(_ question: SwapQuestion) async throws -> String {
        question.options.first { !question.rest.joined().contains($0) } ?? question.options[0]
    }

    func keepsFor(_ name: String) async throws -> Int { 3 }

    func planWords(_ facts: PlanFacts) async throws -> String {
        "\(NutritionText.capitalised(facts.what)): \(facts.traits.prefix(2).joined(separator: ", "))."
    }
}
#endif
