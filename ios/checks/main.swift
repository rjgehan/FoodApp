import Foundation

/*
 Checks for what Apple Intelligence may do in Nutrition facts (NutritionAssist.swift) and Meal
 plans (MealPlanAssist.swift, in MealPlanChecks.swift), run on a
 Mac with no app, no simulator and no model: ./checks/run.sh from ios/.

 A Simulator only has the on-device model when its Mac does, so the paths a real iPhone takes are tested here
 with a scripted stand-in: which lines are asked about, that only shortlisted foods and in-range
 weights reach the server, that a refusal or a made-up answer leaves the server's answer alone,
 that words with a number in them are thrown away, and that a misread label is never shown.
*/

var failures = 0
var passed = 0

func check(_ condition: @autoclosure () -> Bool, _ what: String, line: Int = #line) {
    if condition() {
        passed += 1
    } else {
        failures += 1
        print("FAIL (line \(line)): \(what)")
    }
}

// MARK: - Stand-ins

final class MemoryOnly: AskedMemory {
    var keys = Set<String>()
    func asked(_ key: String) -> Bool { keys.contains(key) }
    func remember(_ key: String) { keys.insert(key) }
}

struct Refused: Error {}

/// Answers from a script; anything unscripted is refused, as a guardrail would.
final class ScriptedThinker: NutritionThinker, @unchecked Sendable {
    var picks: [String: String] = [:]
    var grams: [String: Int] = [:]
    var words: String?
    var askedLines: [String] = []
    var offered: [[String]] = []
    var askedRanges: [ClosedRange<Int>] = []

    func pickFood(line: String, options: [String]) async throws -> String {
        askedLines.append(line)
        offered.append(options)
        guard let pick = picks[line] else { throw Refused() }
        return pick
    }

    var askedFoods: [String?] = []

    func gramsEach(ingredient: String, unit: String, food: String?, range: ClosedRange<Int>) async throws -> Int {
        askedRanges.append(range)
        askedFoods.append(food)
        guard let g = grams["\(unit)|\(ingredient)"] else { throw Refused() }
        return g
    }

    func summary(of facts: ServingFacts) async throws -> String {
        guard let words else { throw Refused() }
        return words
    }
}

final class FakeServer: NutritionAssistServer, @unchecked Sendable {
    var matches: [UUID: IngredientMatch] = [:]
    var chosen: [(UUID, Int)] = []
    var weighed: [(UUID, String, Double)] = []
    var refuseChoices = false

    func match(_ ingredient: UUID) async throws -> IngredientMatch {
        guard let m = matches[ingredient] else { throw Refused() }
        return m
    }

    func chooseFood(_ ingredient: UUID, fdcId: Int) async throws {
        // The server's own rule: only a shortlisted food.
        guard !refuseChoices, matches[ingredient]?.shortlist.contains(where: { $0.fdcId == fdcId }) == true else { throw Refused() }
        chosen.append((ingredient, fdcId))
    }

    func setGrams(_ ingredient: UUID, unit: String, grams: Double) async throws {
        weighed.append((ingredient, unit, grams))
    }
}

// MARK: - A recipe as the server describes it

let thighs = UUID(), oil = UUID(), butter = UUID(), spinach = UUID(), sumac = UUID(), salt = UUID(), breast = UUID()

/// grams: for the one serving shown of four, as the server sends them.
func contributor(_ id: UUID, _ name: String, amount: String, how: String, source: String = "auto",
                 guess: Bool = false, basis: String? = nil, grams: Double = 100) -> NutritionContributor {
    NutritionContributor(recipeIngredientId: UUID(), ingredientId: id, name: name, fdcId: 1, foodName: name,
                         amount: amount, grams: grams, gramsHow: how, gramsBasis: basis, estimated: how != "WEIGHT",
                         kcal: 100, protein: 5, carbs: 5, fat: 5, share: 0.2, confidence: guess ? 0.5 : 0.9,
                         matchSource: source, guess: guess)
}

let values = NutrientValues(kcal: 512, protein: 41, carbs: 9, fat: 34)
let reference = NutritionReference(kcal: 2000, protein: 50, carbs: 260, fat: 70, sugars: 90, satFat: 20,
                                   saltG: 6, fibre: 30, label: "a 2,000 kcal day", source: "reference")

let recipe = RecipeNutrition(
    recipeId: UUID(), name: "Lemon herb chicken", recipeServings: 4, servings: 1,
    perServing: values, forServings: values, perRecipe: values.scaled(4),
    split: MacroSplit(protein: 32, carbs: 7, fat: 61), reference: reference,
    percentOfReference: ReferencePercentages(kcal: 26), highlights: ["High protein", "Low carb"],
    summary: "High protein, low carb. A filling meal.",
    contributors: [
        contributor(thighs, "chicken thighs, skin on", amount: "800 g", how: "WEIGHT", guess: true),
        contributor(oil, "olive oil", amount: "2 tbsp", how: "VOLUME"),
        // The server's own figures: a knob 12 g, a handful 30 g, a pinch 0.4 g, a breast 175 g — a quarter shown.
        contributor(butter, "butter", amount: "1 knob", how: "ROUGH", grams: 3),
        contributor(spinach, "spinach", amount: "2 handfuls", how: "ROUGH", source: "ai", grams: 15),
        contributor(salt, "salt", amount: "1 pinch", how: "ROUGH", grams: 0.1),
        contributor(breast, "chicken breasts", amount: "2", how: "TYPICAL", grams: 87.5),
    ],
    notCounted: [
        NutritionNotCounted(recipeIngredientId: UUID(), ingredientId: sumac, name: "sumac", reason: "NO_MATCH",
                            quantity: 1, unit: "tsp", optional: false, fdcId: nil, foodName: nil),
        NutritionNotCounted(recipeIngredientId: UUID(), ingredientId: UUID(), name: "parsley", reason: "OPTIONAL",
                            quantity: 1, unit: "bunch", optional: true, fdcId: nil, foodName: nil),
    ],
    linesCounted: 6, linesTotal: 8, complete: false, note: "Figures are estimates from ingredient data.",
    attribution: nil)

func candidate(_ id: Int, _ name: String, _ confidence: Double) -> MatchCandidate {
    MatchCandidate(fdcId: id, name: name, category: nil, confidence: confidence, kcal: 200, protein: 20)
}

func match(_ id: UUID, _ name: String, source: String = "auto", guess: Bool = true, counted: Bool = true,
           shortlist: [MatchCandidate]) -> IngredientMatch {
    IngredientMatch(ingredientId: id, ingredientName: name, fdcId: shortlist.first?.fdcId, foodName: shortlist.first?.name,
                    confidence: 0.5, source: source, counted: counted, guess: guess, shortlist: shortlist)
}

// MARK: - Which lines are asked about

do {
    let memory = MemoryOnly()
    let work = NutritionAssist.work(for: recipe, memory: memory)
    check(work.matches.map(\.ingredientId) == [thighs, sumac], "asks about the guessed food and the one not found, nothing sure")
    check(work.matches.first?.line == "800 g chicken thighs, skin on", "the line is the recipe's own words")
    check(work.matches.last?.line == "1 tsp sumac", "an unmatched line keeps its amount")
    check(Set(work.grams.map(\.ingredientId)) == [butter, spinach, breast], "asks the weight of a knob, a handful and a count, not a pinch")
    check(work.grams.first { $0.ingredientId == butter }?.range == 7...23, "a knob is half to twice the server's own 12 g")
    check(work.grams.first { $0.ingredientId == spinach }?.range == 16...58, "a handful of spinach is half to twice its 30 g")
    check(work.grams.first { $0.ingredientId == breast }?.range == 90...343, "a chicken breast is half to twice its 175 g")
    check(work.grams.first { $0.ingredientId == breast }?.unit == "", "a count is one of the thing itself")
    check(!work.grams.contains { $0.ingredientId == oil }, "spoons are the server's own arithmetic")

    // Asked once, never again on this phone.
    for job in work.matches { memory.remember(job.memoryKey) }
    for job in work.grams { memory.remember(job.memoryKey) }
    check(NutritionAssist.work(for: recipe, memory: memory).isEmpty, "nothing is asked twice")

    let few = NutritionAssist.work(for: recipe, memory: MemoryOnly(), limit: 3)
    check(few.matches.count + few.grams.count == 3, "no more than the limit each visit")
}

// MARK: - Answers that reach the server

func run(_ body: @escaping () async -> Void) {
    let done = DispatchSemaphore(value: 0)
    Task { await body(); done.signal() }
    done.wait()
}

run {
    let memory = MemoryOnly()
    let thinker = ScriptedThinker()
    let server = FakeServer()
    server.matches[thighs] = match(thighs, "chicken thighs, skin on", shortlist: [
        candidate(11, "Chicken, broilers or fryers, thigh, meat only, raw", 0.6),
        candidate(12, "Chicken, broilers or fryers, thigh, meat and skin, raw", 0.58),
    ])
    server.matches[sumac] = match(sumac, "sumac", counted: false, shortlist: [candidate(21, "Spices, sage, ground", 0.3)])
    thinker.picks["800 g chicken thighs, skin on"] = "Chicken, broilers or fryers, thigh, meat and skin, raw"
    thinker.picks["1 tsp sumac"] = NutritionAssist.noneOfThese
    thinker.grams["knob|butter"] = 12
    thinker.grams["handfuls|spinach"] = 100       // out of a handful's range: thrown away
    thinker.grams["|chicken breasts"] = 175

    let work = NutritionAssist.work(for: recipe, memory: memory)
    let outcome = await NutritionAssist.improve(work, thinker: thinker, server: server, memory: memory)

    check(server.chosen.count == 1 && server.chosen[0] == (thighs, 12), "the model's shortlisted pick is sent as the food")
    check(thinker.offered.first?.last == NutritionAssist.noneOfThese, "every shortlist offers none of these")
    check(!server.chosen.contains { $0.0 == sumac }, "none of these sends nothing")
    check(server.weighed.contains { $0.0 == butter && $0.1 == "knob" && $0.2 == 12 }, "a knob of butter's grams go back for the unit")
    check(server.weighed.contains { $0.0 == breast && $0.1 == "" && $0.2 == 175 }, "one chicken breast's grams go back as a count")
    check(!server.weighed.contains { $0.0 == spinach }, "an answer outside the range is not sent")
    check(thinker.askedFoods.contains("butter"), "the weight is asked of the food it is counted as")
    check(outcome.matched == ["chicken thighs, skin on"] && Set(outcome.weighed) == ["butter", "chicken breasts"],
          "the outcome names what the model changed")
    check(memory.asked("match:\(sumac.uuidString)"), "a none-of-these is remembered, not asked again")
}

run {
    // A made-up answer, a refusal, a person's choice, and a server that says no.
    let memory = MemoryOnly()
    let thinker = ScriptedThinker()
    let server = FakeServer()
    server.matches[thighs] = match(thighs, "chicken thighs", shortlist: [candidate(11, "Chicken thigh, raw", 0.6)])
    server.matches[sumac] = match(sumac, "sumac", source: "user", shortlist: [candidate(21, "Spices, sumac", 0.3)])
    thinker.picks["800 g chicken thighs, skin on"] = "Chicken thigh, roasted with lemon"   // not on the list
    let work = NutritionAssist.Work(matches: NutritionAssist.work(for: recipe, memory: memory).matches, grams: [])
    let outcome = await NutritionAssist.improve(work, thinker: thinker, server: server, memory: memory)
    check(server.chosen.isEmpty, "an answer that is not on the shortlist is never sent")
    check(thinker.askedLines == ["800 g chicken thighs, skin on"], "a line a person settled is not asked about")
    check(!outcome.changed, "nothing changed")

    let refusing = FakeServer()
    refusing.refuseChoices = true
    refusing.matches[thighs] = server.matches[thighs]
    thinker.picks["800 g chicken thighs, skin on"] = "Chicken thigh, raw"
    let again = await NutritionAssist.improve(NutritionAssist.Work(matches: [work.matches[0]], grams: []),
                                              thinker: thinker, server: refusing, memory: MemoryOnly())
    check(!again.changed, "a server that says no (a person chose first) leaves it alone")

    // No model answer at all: the thinker refuses everything.
    let silent = await NutritionAssist.improve(NutritionAssist.work(for: recipe, memory: MemoryOnly()),
                                               thinker: ScriptedThinker(), server: FakeServer(), memory: MemoryOnly())
    check(!silent.changed, "a model that refuses changes nothing")
}

run {
    // What a small model really did on a Simulator: picked a food for a line that is no food, and
    // said 10 g for a handful of spinach (the server's own figure is 30 g).
    let mix = UUID(), xyzzy = UUID()
    let nonsense = RecipeNutrition(
        recipeId: recipe.recipeId, name: "Grandma's mystery stew", recipeServings: 4, servings: 1,
        perServing: values, forServings: values, perRecipe: values, split: recipe.split, reference: reference,
        percentOfReference: recipe.percentOfReference, highlights: [], summary: nil,
        contributors: [contributor(spinach, "spinach", amount: "2 handfuls", how: "ROUGH", grams: 15)],
        notCounted: [
            NutritionNotCounted(recipeIngredientId: UUID(), ingredientId: mix, name: "grandma's secret mix",
                                reason: "NO_MATCH", quantity: 1, unit: nil, optional: false, fdcId: nil, foodName: nil),
            NutritionNotCounted(recipeIngredientId: UUID(), ingredientId: xyzzy, name: "xyzzy sauce",
                                reason: "NO_MATCH", quantity: 1, unit: "tbsp", optional: false, fdcId: nil, foodName: nil),
        ],
        linesCounted: 1, linesTotal: 3, complete: false, note: "", attribution: nil)
    let thinker = ScriptedThinker()
    let server = FakeServer()
    server.matches[mix] = match(mix, "grandma's secret mix", counted: false, shortlist: [
        candidate(31, "Shortening cake mix, soybean (hydrogenated) and cottonseed (hydrogenated)", 0.35),
        candidate(32, "Snacks, trail mix, regular", 0.36),
    ])
    server.matches[xyzzy] = match(xyzzy, "xyzzy sauce", counted: false, shortlist: [candidate(41, "Sauce, barbecue", 0.23)])
    thinker.picks["1 grandma's secret mix"] = "Snacks, trail mix, regular"
    thinker.picks["1 tbsp xyzzy sauce"] = "Sauce, barbecue"
    thinker.grams["handfuls|spinach"] = 10
    let memory = MemoryOnly()
    let outcome = await NutritionAssist.improve(NutritionAssist.work(for: nonsense, memory: memory), thinker: thinker,
                                                server: server, memory: memory)
    check(thinker.askedLines.count == 2, "both unmatched lines are asked about")
    check(server.chosen.isEmpty, "a nonsense line answered with a real food is not sent")
    check(thinker.askedRanges.first == 16...58, "the model is only offered half to twice the server's handful")
    check(server.weighed.isEmpty, "10 g for a handful of spinach (the server says 30) is not sent")
    check(!outcome.changed, "nothing changed")
    check(memory.asked("match:\(mix.uuidString)"), "and it is not asked again")
}

check(NutritionAssist.band(around: 30, within: 5...60) == 16...58, "a band is half to twice, a hair inside")
check(NutritionAssist.band(around: nil, within: 5...60) == 5...60, "with nothing to go by, the unit's own range")
check(NutritionAssist.band(around: 1000, within: 3...40) == nil, "no overlap, nothing to ask")
check(NutritionAssist.pickWorthSending(32, from: [candidate(32, "Snacks, trail mix, regular", 0.36)]) == false,
      "a pick the server thought little of is not worth sending")
check(NutritionAssist.pickWorthSending(11, from: [candidate(11, "Chicken thigh, raw", 0.6)]), "a pick the server half-believed is")

// MARK: - The shortlist as offered

do {
    let options = NutritionAssist.options(for: [candidate(1, "Onions, raw", 0.5), candidate(2, "Onions, raw", 0.4),
                                                candidate(3, " ", 0.3)])
    check(options.map(\.label) == ["Onions, raw", "Onions, raw (2)", NutritionAssist.noneOfThese], "labels are unique and blank ones dropped")
    check(NutritionAssist.pickedFood("Onions, raw (2)", from: options) == 2, "a pick maps back to its food")
    check(NutritionAssist.pickedFood("onions", from: options) == nil, "a near miss is not a pick")
}

// MARK: - Words

run {
    let thinker = ScriptedThinker()
    thinker.words = "High protein and low carb, a filling dinner for a busy night"
    let said = await NutritionAssist.summary(for: recipe, thinker: thinker)
    check(said == "High protein and low carb, a filling dinner for a busy night.", "the model's words, with a full stop")

    thinker.words = "About 512 kcal and 41g protein per serving."
    let withNumbers = await NutritionAssist.summary(for: recipe, thinker: thinker)
    check(withNumbers == nil, "words with a number in them are thrown away")

    thinker.words = nil
    let refused = await NutritionAssist.summary(for: recipe, thinker: thinker)
    check(refused == nil, "no words when the model says nothing")
}

check(NutritionAssist.acceptedSummary("Lovely.") == nil, "too short to say anything")
check(NutritionAssist.acceptedSummary("Half the day's fat in one bowl!") == "Half the day's fat in one bowl!", "keeps its own ending")
check(NutritionAssist.acceptedSummary("Just 50% of your day") == nil, "no percentages")
check(NutritionAssist.ruleSummary(recipe) == "High protein, low carb. A filling meal.", "without the model, the server's own words")
let noServerWords = RecipeNutrition(recipeId: recipe.recipeId, name: recipe.name, recipeServings: 4, servings: 1,
                                    perServing: NutrientValues(kcal: 180), forServings: values, perRecipe: values, split: .empty,
                                    reference: reference, percentOfReference: ReferencePercentages(kcal: 9),
                                    highlights: ["Low fat"], summary: nil, contributors: [], notCounted: [],
                                    linesCounted: 0, linesTotal: 0, complete: true, note: "", attribution: nil)
check(NutritionAssist.ruleSummary(noServerWords) == "Low fat. A light bite.", "the same rule on the phone when the server has none")
check(NutritionAssist.facts(for: recipe) == ServingFacts(dish: "Lemon herb chicken", highlights: ["High protein", "Low carb"],
                                                         size: "a filling meal"), "the model is given words, not figures")

// MARK: - Weights

check(NutritionAssist.gramsRange(for: "pinch") == nil, "a pinch is not worth asking")
check(NutritionAssist.gramsRange(for: "Handfuls") == 5...60, "plurals and capitals read as the unit")
check(NutritionAssist.gramsRange(for: "g") == nil, "a weight needs no estimate")
check(NutritionAssist.gramsRange(for: "tins") == nil, "a tin is the server's packaging size, not the model's guess")
check(NutritionAssist.unitText(fromAmount: "2 knob") == "knob" && NutritionAssist.unitText(fromAmount: "2") == "",
      "the unit is what follows the number")

// MARK: - A label read off a photo

let yogurt = NutritionAssist.checkedLabel(name: "Greek yogurt 0%", column: "per 100 g", servingGrams: 170, kcal: 57,
                                          protein: 10, carbs: 3.6, sugars: 3.6, fat: 0.2, saturates: 0.1, fibre: 0, salt: 0.1)
check(yogurt?.per100g.kcal == 57 && yogurt?.servingGrams == 170, "a label that adds up is read as printed")
let perServing = NutritionAssist.checkedLabel(name: "", column: "per serving", servingGrams: 30, kcal: 120, protein: 3,
                                              carbs: 20, sugars: 8, fat: 3, saturates: 1, fibre: 2, salt: 0.2)
check(perServing.map { abs(($0.per100g.kcal ?? 0) - 400) < 0.5 } == true, "per serving becomes per 100 g by arithmetic, not by the model")
check(NutritionAssist.checkedLabel(name: "", column: "per 100 g", servingGrams: 0, kcal: 500, protein: 10, carbs: 10,
                                   sugars: 5, fat: 2, saturates: 1, fibre: 0, salt: 0) == nil, "energy that the macros do not make is a misread")
check(NutritionAssist.checkedLabel(name: "", column: "per 100 g", servingGrams: 0, kcal: 100, protein: 2, carbs: 20,
                                   sugars: 30, fat: 1, saturates: 0, fibre: 0, salt: 0) == nil, "more sugar than carbs is a misread")
check(NutritionAssist.checkedLabel(name: "", column: "per serving", servingGrams: 0, kcal: 100, protein: 2, carbs: 20,
                                   sugars: 3, fat: 1, saturates: 0, fibre: 0, salt: 0) == nil, "per serving with no serving size cannot be used")

// MARK: - Writing numbers down

check(NutritionText.kcal(2140) == "2,140" && NutritionText.kcal(nil) == "–", "kcal with a thousands comma")
check(NutritionText.grams(0.7) == "0.7g" && NutritionText.grams(6.0) == "6g" && NutritionText.grams(17.4) == "17g", "grams as the label prints them")
check(NutritionText.foodTitle("Chickpeas (garbanzo beans, bengal gram), mature seeds, canned").title == "Chickpeas", "USDA names made readable")
check(NutritionText.isBarcode("5000112637922") && !NutritionText.isBarcode("egg"), "barcodes are 8 to 14 digits")

// MARK: - Meal plans (MealPlanChecks.swift)

run { await mealPlanChecks() }

print("\(passed) passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
