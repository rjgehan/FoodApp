import Foundation

/*
 Checks for what Apple Intelligence may do in Meal plans (MealPlanAssist.swift), with a scripted
 stand-in for the model: that it is only offered the server's candidates that fit each meal, that
 a pick off the list, a repeat or one past the buy limit is dropped, that a throw anywhere falls
 back to the server's plan (nil), that guessed shelf lives make "soon" only when they should, and
 that words with a number in them are thrown away.
*/

/// Answers from a script; anything unscripted is refused, as a guardrail would.
final class ScriptedPlanner: MealPlanThinker, @unchecked Sendable {
    var days: [String: [MealType: String]] = [:]
    var one: String?
    var shelf: [String: Int] = [:]
    var words: String?
    var asked: [DayQuestion] = []
    var askedSwaps: [SwapQuestion] = []
    var shelfAsked: [String] = []
    var failOn: String?

    func chooseDay(_ question: DayQuestion) async throws -> [MealType: String] {
        asked.append(question)
        if question.day == failOn { throw Refused() }
        guard let answer = days[question.day] else { throw Refused() }
        return answer
    }

    func chooseOne(_ question: SwapQuestion) async throws -> String {
        askedSwaps.append(question)
        guard let one else { throw Refused() }
        return one
    }

    func keepsFor(_ name: String) async throws -> Int {
        shelfAsked.append(name)
        guard let d = shelf[name] else { throw Refused() }
        return d
    }

    func planWords(_ facts: PlanFacts) async throws -> String {
        guard let words else { throw Refused() }
        return words
    }
}

final class ShelfOnly: ShelfMemory {
    var known: [String: Int] = [:]
    func days(_ name: String) -> Int? { known[name] }
    func remember(_ name: String, days: Int) { known[name] = days }
}

func cand(_ name: String, fits: [MealType], pct: Int = 100, soon: [String] = [], buy: [String] = [], yours: Bool = true) -> CandidateRecipe {
    CandidateRecipe(recipeId: UUID(), name: name, section: fits.contains(.breakfast) ? .breakfast : .dinner, yours: yours,
                    fits: fits, percentFromCupboard: pct, uses: 3, usesSoon: soon, toBuy: buy, score: 10)
}

func targetCand(_ name: String, fits: [MealType], kcal: Int = 600, protein: Int = 40) -> TargetCandidate {
    TargetCandidate(recipeId: UUID(), name: name, section: .dinner, yours: true, fits: fits, kcal: kcal, protein: protein,
                    carbs: 50, fat: 20, minutes: 30)
}

func mealPlanChecks() async {
    let mon = NutritionText.day(1), tue = NutritionText.day(2)
    let monName = "\(NutritionText.weekday(mon, short: false)) \(MealPlanText.dayOfMonth(mon))"
    let tueName = "\(NutritionText.weekday(tue, short: false)) \(MealPlanText.dayOfMonth(tue))"
    let curry = cand("Chickpea curry", fits: [.lunch, .dinner], soon: ["Spinach"])
    let stew = cand("Beef stew", fits: [.lunch, .dinner], pct: 20, buy: ["Beef", "Carrots", "Red wine"])
    let traybake = cand("Salmon traybake", fits: [.dinner], pct: 67, soon: ["Salmon"], buy: ["Lemon"])
    let porridge = cand("Porridge", fits: [.breakfast])
    let slots = [SlotRef(date: mon, mealType: .dinner), SlotRef(date: tue, mealType: .dinner)]
    let candidates = CupboardCandidates(slots: slots, recipes: [curry, traybake, stew, porridge], recipesConsidered: 4)
    var setup = CupboardPlanRequest(dates: [mon, tue], meals: [.dinner], useFirst: [], buyLimit: 5, onlyMine: true, servings: 2)

    // MARK: Cook from your cupboard

    do {
        let model = ScriptedPlanner()
        model.days = [monName: [.dinner: "Salmon traybake"], tueName: [.dinner: "Chickpea curry"]]
        let picks = await MealPlanAssist.cupboardPlan(candidates, setup: setup, thinker: model)
        check(picks?.map(\.recipeId) == [traybake.recipeId, curry.recipeId], "the model's week is taken as chosen")
        check(picks?.first?.date == mon && picks?.first?.mealType == .dinner, "each pick is for its own slot")
        check(model.asked.count == 2, "one question a day")
        check(model.asked[0].options[.dinner]?.contains("Porridge") == false, "breakfast recipes are never offered for dinner")
        check(model.asked[0].menu.contains { $0.hasPrefix("Chickpea curry — lunch or dinner; all in the cupboard; uses up spinach") },
              "the menu says what each recipe is in words the model can choose on")
        check(model.asked[1].options[.dinner]?.contains("Salmon traybake") == false, "a recipe chosen already is not offered again")
        check(model.asked[1].earlier == ["Salmon traybake"], "later days know what earlier days have")
        check(model.asked[0].notes.contains { $0.contains("spinach") && $0.contains("salmon") }, "what wants using up is said")
        check(model.asked[1].notes.contains { $0.contains("salmon") } == false, "and stops being said once it is used")
    }

    do {
        let model = ScriptedPlanner()
        model.days = [monName: [.dinner: "Fish pie"], tueName: [.dinner: "Porridge"]]
        let answer1 = await MealPlanAssist.cupboardPlan(candidates, setup: setup, thinker: model)

        check(answer1 == nil,
              "nothing it made up or put in the wrong meal survives, and with no picks the server's plan stands")
    }

    do {
        let model = ScriptedPlanner()
        model.days = [monName: [.dinner: "Chickpea curry"]]
        model.failOn = tueName
        let answer2 = await MealPlanAssist.cupboardPlan(candidates, setup: setup, thinker: model)

        check(answer2 == nil,
              "a failure on any day falls back to the server's whole plan")
    }

    do {
        setup.buyLimit = 3
        let model = ScriptedPlanner()
        model.days = [monName: [.dinner: "Beef stew"], tueName: [.dinner: "Salmon traybake"]]
        let picks = await MealPlanAssist.cupboardPlan(candidates, setup: setup, thinker: model)
        check(picks?.map(\.recipeId) == [stew.recipeId], "a pick that would take the shopping past the limit is dropped")
        check(model.asked[1].notes.contains("At most 0 more things may be bought."), "the model is told what is left to buy")
        setup.buyLimit = 5
    }

    do {
        let twins = MealPlanAssist.labels(["Chilli", "chilli", "Dal"])
        check(twins == ["Chilli", "chilli (2)", "Dal"], "two recipes with one name get labels the model can tell apart")
    }

    do {
        let plan = CupboardPlan(dates: [mon, tue], mealTypes: [.dinner], buyLimit: 5, onlyMine: true, servings: 2,
                                percentFromCupboard: 90, itemsUsed: 4, summary: "", meals: [
                                    DraftMeal(date: mon, mealType: .dinner, recipeId: curry.recipeId, name: "Chickpea curry",
                                              section: .dinner, yours: true, coverImageId: nil, percentFromCupboard: 100,
                                              uses: [], usesSoon: [], toBuy: [], servings: 2),
                                    DraftMeal(date: tue, mealType: .dinner, recipeId: stew.recipeId, name: "Beef stew",
                                              section: .dinner, yours: true, coverImageId: nil, percentFromCupboard: 20,
                                              uses: [], usesSoon: [], toBuy: [], servings: 2),
                                ], open: [], toBuy: [], useSoonUsed: ["Spinach"], useSoonLeft: [], recipesConsidered: 4, swapped: nil)
        let marked = MealPlanAssist.chosenByModel(plan.meals, picks: [
            MealChoice(date: mon, mealType: .dinner, recipeId: curry.recipeId),
            MealChoice(date: tue, mealType: .dinner, recipeId: traybake.recipeId),
        ])
        check(marked == [MealPlanText.slotKey(mon, .dinner)], "only meals that are the model's own pick wear the mark")

        let swaps = CupboardCandidates(slots: [SlotRef(date: tue, mealType: .dinner)], recipes: [traybake, cand("Dal", fits: [.dinner])],
                                       recipesConsidered: 4)
        let model = ScriptedPlanner()
        model.one = "Dal"
        let wanted = await MealPlanAssist.cupboardSwap(swaps, plan: plan, slot: SlotRef(date: tue, mealType: .dinner), thinker: model)
        check(wanted == swaps.recipes[1].recipeId, "a swap is one of the slot's candidates")
        check(model.askedSwaps.first?.rest.contains { $0.contains("Chickpea curry") } == true, "a swap knows the rest of the plan")
        model.one = "Toast"
        let answer3 = await MealPlanAssist.cupboardSwap(swaps, plan: plan, slot: SlotRef(date: tue, mealType: .dinner), thinker: model)

        check(answer3 == nil,
              "a swap off the list is left to the server")

        let facts = MealPlanAssist.facts(plan)
        check(facts?.traits.contains("almost everything comes from the cupboard") == true, "a plan in words, not numbers")
        let words = ScriptedPlanner()
        words.words = "Uses up 2 bags of spinach."
        let answer4 = await MealPlanAssist.words(facts, thinker: words)

        check(answer4 == nil, "words with a number in them are thrown away")
        words.words = "Cupboard cooking at its best, with the spinach used up early."
        let answer5 = await MealPlanAssist.words(facts, thinker: words)

        check(answer5 == "Cupboard cooking at its best, with the spinach used up early.",
              "words without numbers are kept")
    }

    // MARK: Use soon, guessed

    do {
        let today = NutritionText.day(0)
        let fresh = UnsureItem(itemId: UUID(), ingredientId: UUID(), name: "Kohlrabi", arrivedOn: NutritionText.day(-2))
        let keeps = UnsureItem(itemId: UUID(), ingredientId: UUID(), name: "Dried mulberries", arrivedOn: NutritionText.day(-2))
        let gone = UnsureItem(itemId: UUID(), ingredientId: UUID(), name: "Purslane", arrivedOn: NutritionText.day(-40))
        let silly = UnsureItem(itemId: UUID(), ingredientId: UUID(), name: "Yuzu", arrivedOn: today)
        let model = ScriptedPlanner()
        model.shelf = ["Kohlrabi": 4, "Dried mulberries": 180, "Purslane": 3, "Yuzu": 900]
        let memory = ShelfOnly()
        let guesses = await MealPlanAssist.useSoonGuesses([fresh, keeps, gone, silly], today: today, thinker: model, memory: memory)
        check(guesses.map(\.item.name) == ["Kohlrabi"], "only what wants using within a few days is soon")
        check(guesses.first?.by == NutritionText.day(2), "a guess counts from the day it came in")
        check(memory.known["purslane"] == 3 && memory.known["yuzu"] == nil, "answers are remembered by name; absurd ones are not")
        check(MealPlanAssist.suggestion(guesses[0]).reason == "ai" && MealPlanAssist.suggestion(guesses[0]).label == "soon",
              "a guess is marked as the model's and says soon, never a date")
        let again = ScriptedPlanner()
        _ = await MealPlanAssist.useSoonGuesses([fresh], today: today, thinker: again, memory: memory)
        check(again.shelfAsked.isEmpty, "a name asked about once is not asked again")
    }

    // MARK: Plans for health targets

    do {
        let oats = targetCand("Protein oats", fits: [.breakfast], kcal: 520, protein: 32)
        let eggs = targetCand("Eggs on toast", fits: [.breakfast], kcal: 450, protein: 28)
        let bowl = targetCand("Chicken rice bowl", fits: [.lunch, .dinner])
        let chilli = targetCand("Beef chilli", fits: [.lunch, .dinner])
        let salmon = targetCand("Salmon and potatoes", fits: [.lunch, .dinner])
        let targets = Targets(kcal: 3170, protein: 135, carbs: 489, fat: 75,
                              computed: MacroNumbers(kcal: 3170, protein: 135, carbs: 489, fat: 75), overridden: [], bmr: 1780, tdee: 2759)
        let c = TargetCandidates(targets: targets, length: 2, mealTypes: [.breakfast, .lunch, .dinner],
                                 aims: [MealAim(mealType: .breakfast, kcal: 880, protein: 38)],
                                 recipes: [oats, eggs, bowl, chilli, salmon])
        let model = ScriptedPlanner()
        model.days = ["Day 1": [.breakfast: "Protein oats", .lunch: "Chicken rice bowl", .dinner: "Chicken rice bowl"],
                      "Day 2": [.breakfast: "Protein oats", .lunch: "Beef chilli", .dinner: "Chicken rice bowl"]]
        let picks = await MealPlanAssist.targetPlan(c, thinker: model) ?? []
        check(picks.count == 4, "the same recipe twice in a day, or a main again the next day, is dropped")
        check(picks.contains { $0.day == 1 && $0.mealType == .breakfast && $0.recipeId == oats.recipeId },
              "the same breakfast every day is fine")
        check(!picks.contains { $0.day == 0 && $0.mealType == .dinner }, "the second bowl that day went")
        check(!picks.contains { $0.day == 1 && $0.mealType == .dinner }, "yesterday's lunch is not today's dinner")
        check(model.asked[1].options[.lunch]?.contains("Chicken rice bowl") == false, "and is not even offered")
        check(model.asked[1].options[.breakfast]?.first == "Eggs on toast", "the least used come first, for variety")
        check(model.asked[0].notes.first?.contains("3170 kcal") == true, "each day knows what it aims at")
        let failing = ScriptedPlanner()
        let answer6 = await MealPlanAssist.targetPlan(c, thinker: failing)

        check(answer6 == nil, "a refusal leaves the server's plan")
    }
}
