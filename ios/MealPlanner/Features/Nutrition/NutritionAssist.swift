import Foundation

/*
 What Apple Intelligence does for Nutrition facts on an iPhone that has it, and the rules every
 answer has to pass before it is used.

 The server works everything out on its own, for every phone and the web: which USDA food an
 ingredient is, what "a knob of butter" weighs, what a serving adds up to. Where the server is
 unsure, a phone with Apple Intelligence can do better, and because ingredients are shared by
 everyone on the server, one phone's better answer improves the numbers for every household:

 - Which food. Where the server's matcher only guessed ("guess", or not counted at all), the
   model is shown the line ("2 chicken thighs, skin on") and the server's own shortlist, and may
   only answer with one of them (a guided `.anyOf`) or "none of these". A small model picks
   something even for a line that is no food at all ("grandma's secret mix" → trail mix), so a
   pick the server itself thought little of (under `pickFloor`) is not sent. The pick is sent
   back as source "ai"; the server again takes only a shortlisted food it thinks close enough,
   counts it as a guess, and never lets a model overrule a person.
 - What one weighs. For the amounts the server can only estimate (a knob, a handful, two chicken
   breasts) or cannot weigh at all, the model gives grams for ONE of the unit inside a sane
   range (a guided `.range`): half to twice the server's own figure where it has one — the
   server refuses anything else, since a small model tends to say "10 g" for everything — or
   the unit's own range where it has none. Checked again here, and sent back as source "ai".
 - A few friendly words about a serving, from words only. It is never given a number and an
   answer with a digit in it is thrown away, so it cannot put a figure on the screen.

 The model never produces a number that is shown: the server does the arithmetic with the
 food and the weight the model chose. Anything that fails — no model, a refusal, an answer off
 the list, a server that says no — leaves the server's own answer standing, which is exactly
 what a phone without Apple Intelligence shows.

 Foundation only, so ios/checks can test the rules on a Mac without the app or a model.
*/

/// What the model is asked. An implementation answers or throws; nothing here trusts it.
protocol NutritionThinker: Sendable {
    /// Which of `options` the recipe line is. Must answer with one of them, exactly.
    func pickFood(line: String, options: [String]) async throws -> String
    /// Grams in one `unit` of `ingredient` ("" is one of the thing itself), inside `range`,
    /// weighed as `food` — the food data entry it is counted as — describes it ("drained solids").
    func gramsEach(ingredient: String, unit: String, food: String?, range: ClosedRange<Int>) async throws -> Int
    /// A sentence or two about a serving, from these words alone.
    func summary(of facts: ServingFacts) async throws -> String
}

/// The server calls the assistant makes; APIClient in the app, a stand-in in the checks.
protocol NutritionAssistServer: Sendable {
    func match(_ ingredient: UUID) async throws -> IngredientMatch
    func chooseFood(_ ingredient: UUID, fdcId: Int) async throws
    func setGrams(_ ingredient: UUID, unit: String, grams: Double) async throws
}

/// What has been asked on this phone already, so a recipe opened twice is not asked about twice.
protocol AskedMemory: AnyObject {
    func asked(_ key: String) -> Bool
    func remember(_ key: String)
}

/// A serving described in words, for the model's few words. No numbers on purpose.
struct ServingFacts: Equatable, Sendable {
    let dish: String
    /// "High protein", "Low carb"…: the server's own highlights.
    let highlights: [String]
    /// "a light bite", "a light meal", "a filling meal", "a big meal"
    let size: String
}

enum NutritionAssist {
    /// The server's own threshold for a sure match (FoodMatcher.CONFIDENT).
    static let confident = 0.65
    /// At most this many questions each time a recipe is opened: the model is quick, but not free.
    static let perVisit = 6
    /// The last choice offered with every shortlist.
    static let noneOfThese = "None of these"
    /// The least the server's own confidence in a food may be for the model's pick of it to be
    /// sent (IngredientMatches.AI_FLOOR on the server, which refuses lower ones too).
    static let pickFloor = 0.4

    // MARK: What to ask

    struct MatchJob: Equatable {
        let ingredientId: UUID
        /// "2 chicken thighs, skin on": what the recipe says.
        let line: String
        var memoryKey: String { "match:\(ingredientId.uuidString)" }
    }

    struct GramsJob: Equatable {
        let ingredientId: UUID
        let ingredient: String
        /// As the recipe writes it ("handfuls"); "" for a count ("2 chicken breasts").
        let unit: String
        /// The food data entry it is counted as, so a tin of chickpeas is weighed drained when the
        /// entry is the drained solids.
        var food: String?
        /// Half to twice the server's own figure for one, inside the unit's sane range; the
        /// unit's range alone when the server could not weigh it.
        let range: ClosedRange<Int>
        var memoryKey: String { "grams:\(ingredientId.uuidString):\(unitKey(unit))" }
    }

    struct Work: Equatable {
        var matches: [MatchJob] = []
        var grams: [GramsJob] = []
        var isEmpty: Bool { matches.isEmpty && grams.isEmpty }
    }

    /**
     The lines worth asking about: foods the server only guessed or could not find, and weights
     it could only estimate or not work out. Lines a model or a person has settled already are
     left alone, as is anything asked about on this phone before.
     */
    static func work(for n: RecipeNutrition, memory: AskedMemory, limit: Int = perVisit) -> Work {
        var work = Work()
        var seen = Set<UUID>()
        var budget = limit

        for c in n.contributors where budget > 0 {
            guard let id = c.ingredientId, c.matchSource == "auto", c.guess == true, !seen.contains(id) else { continue }
            let job = MatchJob(ingredientId: id, line: line(amount: c.amount, name: c.name))
            guard !memory.asked(job.memoryKey) else { continue }
            seen.insert(id)
            work.matches.append(job)
            budget -= 1
        }
        for x in n.notCounted where budget > 0 && x.reason == "NO_MATCH" {
            guard let id = x.ingredientId, !seen.contains(id) else { continue }
            let job = MatchJob(ingredientId: id, line: line(quantity: x.quantity, unit: x.unit, name: x.name))
            guard !memory.asked(job.memoryKey) else { continue }
            seen.insert(id)
            work.matches.append(job)
            budget -= 1
        }

        var seenUnits = Set<String>()
        let scale = n.recipeServings > 0 ? n.servings / Double(n.recipeServings) : 0
        for c in n.contributors where budget > 0 {
            guard let id = c.ingredientId, c.gramsHow == "ROUGH" || c.gramsHow == "TYPICAL" else { continue }
            let unit = unitText(fromAmount: c.amount)
            guard let sane = gramsRange(for: unit),
                  let range = band(around: serverEach(c, scale: scale), within: sane) else { continue }
            let job = GramsJob(ingredientId: id, ingredient: c.name, unit: unit, food: c.foodName, range: range)
            guard !memory.asked(job.memoryKey), seenUnits.insert(job.memoryKey).inserted else { continue }
            work.grams.append(job)
            budget -= 1
        }
        for x in n.notCounted where budget > 0 && x.reason == "NO_WEIGHT" {
            guard let id = x.ingredientId, x.quantity != nil else { continue }
            let unit = (x.unit ?? "").trimmingCharacters(in: .whitespaces)
            guard let range = gramsRange(for: unit) else { continue }
            let job = GramsJob(ingredientId: id, ingredient: x.name, unit: unit, food: x.foodName, range: range)
            guard !memory.asked(job.memoryKey), seenUnits.insert(job.memoryKey).inserted else { continue }
            work.grams.append(job)
            budget -= 1
        }
        return work
    }

    // MARK: Checking the answers

    /// The shortlist as the model sees it: names, made unique, best first, and "None of these".
    static func options(for shortlist: [MatchCandidate], max: Int = 6) -> [(label: String, fdcId: Int?)] {
        var out: [(String, Int?)] = []
        var used = Set<String>()
        for c in shortlist.prefix(max) {
            var label = c.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if label.isEmpty { continue }
            if used.contains(label.lowercased()) { label += " (\(c.fdcId))" }
            used.insert(label.lowercased())
            out.append((label, c.fdcId))
        }
        out.append((noneOfThese, nil))
        return out
    }

    /// The food the model picked, if its answer is one of the options exactly; nil for "none of
    /// these" or anything it made up.
    static func pickedFood(_ answer: String, from options: [(label: String, fdcId: Int?)]) -> Int? {
        let said = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        return options.first { $0.label == said }?.fdcId
    }

    /// Grams for one of a unit only when they are inside the job's range.
    static func acceptedGrams(_ grams: Int, for job: GramsJob) -> Double? {
        job.range.contains(grams) ? Double(grams) : nil
    }

    /// What the server weighed ONE of the line's unit as: its grams are for the servings shown.
    static func serverEach(_ c: NutritionContributor, scale: Double) -> Double? {
        guard scale > 0, let amount = c.amount?.trimmingCharacters(in: .whitespaces),
              let quantity = Double(amount.split(separator: " ").first ?? ""), quantity > 0 else { return nil }
        return c.grams / scale / quantity
    }

    /**
     Half to twice `each` (a hair inside, so rounding never puts an answer outside the server's own
     band), kept inside the unit's `sane` range; `sane` alone with no figure to go by. Nil when the
     two do not overlap — nothing worth asking.
     */
    static func band(around each: Double?, within sane: ClosedRange<Int>) -> ClosedRange<Int>? {
        guard let each, each > 0 else { return sane }
        let low = max(sane.lowerBound, Int((each / 2 * 1.02).rounded(.up)))
        let high = min(sane.upperBound, Int((each * 2 * 0.98).rounded(.down)))
        return low <= high ? low...high : nil
    }

    /// A pick is only worth sending when the server itself thought the food might be it.
    static func pickWorthSending(_ fdcId: Int, from shortlist: [MatchCandidate]) -> Bool {
        guard let candidate = shortlist.first(where: { $0.fdcId == fdcId }) else { return false }
        return candidate.confidence >= pickFloor
    }

    /**
     What one of a unit can sensibly weigh, or nil when it is not worth asking: a pinch or a dash
     is a gram either way, and the arithmetic cannot tell. Kitchen words get tight ranges; a
     count ("2 chicken breasts", "1 tin") anything from a gram to a kilo.
     */
    static func gramsRange(for unit: String) -> ClosedRange<Int>? {
        let key = unitKey(unit)
        switch key {
        case "pinch", "dash", "sprinkle", "drop", "smidgen": return nil
        case "g", "kg", "mg", "oz", "lb", "ml", "l", "tsp", "tbsp", "cup", "fl oz", "pint": return nil
        // A tin or a pack is what its label says, and the model weighs the tin, not the drained
        // food the entry counts (measured: 400 g for a tin of chickpeas, against 240 g drained).
        // The server's own sizes for packaging are better than its guess.
        case "tin", "can", "jar", "pack", "packet", "bag", "box", "carton", "bottle", "pot", "tub": return nil
        case "knob", "thumb": return 3...40
        // A handful of leaves is a few grams, of nuts or pasta a good deal more.
        case "handful": return 5...60
        case "dollop", "spoonful", "glug", "shot": return 5...60
        case "splash", "drizzle", "squeeze": return 2...40
        case "bunch": return 10...400
        case "clove": return 2...12
        case "slice", "rasher": return 5...80
        default: return 1...1000
        }
    }

    /// The unit as one word to compare: lower case, no full stop, singular.
    static func unitKey(_ unit: String) -> String {
        var key = unit.lowercased().replacingOccurrences(of: ".", with: "").trimmingCharacters(in: .whitespaces)
        let plurals = ["tins": "tin", "cans": "can", "jars": "jar", "packs": "pack", "packets": "packet", "bags": "bag",
                       "boxes": "box", "cartons": "carton", "bottles": "bottle", "pots": "pot", "tubs": "tub",
                       "pinches": "pinch", "dashes": "dash", "bunches": "bunch", "handfuls": "handful",
                       "knobs": "knob", "cloves": "clove", "slices": "slice", "dollops": "dollop", "splashes": "splash"]
        if let one = plurals[key] { key = one }
        return key
    }

    /**
     A model's few words, or nil if they will not do: empty, too long, or with any digit in them
     — the numbers on the screen are the server's, and words must not carry others in with them.
     */
    static func acceptedSummary(_ text: String) -> String? {
        var said = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"“”'"))
            .replacingOccurrences(of: "\n", with: " ")
        guard said.count >= 12, said.count <= 160,
              said.rangeOfCharacter(from: .decimalDigits) == nil,
              !said.contains("%") else { return nil }
        if let last = said.last, !".!".contains(last) { said += "." }
        return said
    }

    /// A serving as words: the server's highlights and how big it is, no figures.
    static func facts(for n: RecipeNutrition) -> ServingFacts? {
        guard let kcal = n.perServing.kcal, kcal > 0 else { return nil }
        return ServingFacts(dish: n.name, highlights: Array(n.highlights.prefix(3)), size: sizeWord(kcal))
    }

    static func sizeWord(_ kcal: Double) -> String {
        kcal < 250 ? "a light bite" : kcal < 500 ? "a light meal" : kcal < 850 ? "a filling meal" : "a big meal"
    }

    /// The rule-made words, for a phone without the model: the server's, or the same rule here.
    static func ruleSummary(_ n: RecipeNutrition) -> String? {
        if let s = n.summary, !s.isEmpty { return s }
        guard let kcal = n.perServing.kcal, kcal > 0 else { return nil }
        let words = n.highlights.prefix(2).enumerated().map { $0.offset == 0 ? $0.element : $0.element.lowercased() }
        let lead = words.isEmpty ? "" : words.joined(separator: ", ") + ". "
        return lead + NutritionText.capitalised(sizeWord(kcal)) + "."
    }

    // MARK: Doing it

    struct Outcome: Equatable {
        /// Lines whose food the model chose, by name.
        var matched: [String] = []
        /// Lines whose weight the model estimated, by name.
        var weighed: [String] = []
        var changed: Bool { !matched.isEmpty || !weighed.isEmpty }
    }

    /**
     Asks about each line in `work`, checks every answer, and sends the ones that pass to the
     server. Returns what changed, so the screen can ask the server for the recipe again.
     Never throws: a failed question is a line left as the server had it.
     */
    static func improve(_ work: Work, thinker: NutritionThinker, server: NutritionAssistServer,
                        memory: AskedMemory) async -> Outcome {
        var outcome = Outcome()
        for job in work.matches {
            guard let match = try? await server.match(job.ingredientId) else { continue }
            // Somebody settled it since, or the server is sure now: nothing to ask.
            guard match.source == "auto", match.guess || !match.counted, !match.shortlist.isEmpty else {
                memory.remember(job.memoryKey)
                continue
            }
            let options = options(for: match.shortlist)
            guard let answer = try? await thinker.pickFood(line: job.line, options: options.map(\.label)) else {
                memory.remember(job.memoryKey)
                continue
            }
            memory.remember(job.memoryKey)
            // "None of these", something made up, or a food the server thought nothing like the line.
            guard let fdcId = pickedFood(answer, from: options), pickWorthSending(fdcId, from: match.shortlist) else { continue }
            do {
                try await server.chooseFood(job.ingredientId, fdcId: fdcId)
                outcome.matched.append(match.ingredientName)
            } catch {
                // 409: a person chose already. 400: off the shortlist after all. 422: too far from the
                // line, or too far from the server's own weight. Either way, the server's stands.
            }
        }
        for job in work.grams {
            guard let answer = try? await thinker.gramsEach(ingredient: job.ingredient, unit: job.unit, food: job.food, range: job.range) else {
                memory.remember(job.memoryKey)
                continue
            }
            memory.remember(job.memoryKey)
            guard let grams = acceptedGrams(answer, for: job) else { continue }
            do {
                try await server.setGrams(job.ingredientId, unit: job.unit, grams: grams)
                outcome.weighed.append(job.ingredient)
            } catch {
                // A person said what it weighs already, or the server thought it absurd.
            }
        }
        return outcome
    }

    /// The model's words for a serving, if it has any that pass; nil means use the rule's.
    static func summary(for n: RecipeNutrition, thinker: NutritionThinker) async -> String? {
        guard let facts = facts(for: n), let said = try? await thinker.summary(of: facts) else { return nil }
        return acceptedSummary(said)
    }


    // MARK: A label read off a photo (iOS 27)

    /// The reading per 100 g, or nil when its figures do not hang together.
    static func checkedLabel(name: String, column: String, servingGrams: Double, kcal: Double, protein: Double,
                        carbs: Double, sugars: Double, fat: Double, saturates: Double, fibre: Double,
                        salt: Double) -> LabelReading? {
        let perServing = column != "per 100 g"
        if perServing && !(servingGrams > 0) { return nil }
        let to100 = perServing ? 100 / servingGrams : 1
        let p = protein * to100, c = carbs * to100, f = fat * to100, e = kcal * to100
        guard e > 0, p + c + f <= 101, sugars <= carbs + 0.5, saturates <= fat + 0.5 else { return nil }
        // Energy from the macros (4/4/9, fibre 2) should be within a fifth of the label's own.
        let fromMacros = 4 * p + 4 * c + 9 * f + 2 * fibre * to100
        guard abs(fromMacros - e) <= max(20, e * 0.2) else { return nil }
        let values = NutrientValues(kcal: e.rounded(), protein: p, carbs: c, fat: f, fibre: fibre * to100,
                                    sugars: sugars * to100, satFat: saturates * to100, saltG: salt * to100)
        return LabelReading(name: name.trimmingCharacters(in: .whitespacesAndNewlines), per100g: values,
                            servingGrams: servingGrams > 0 ? servingGrams : nil)
    }

    // MARK: Lines in words

    /// "2 knob" → "knob"; "2" → "" (a count).
    static func unitText(fromAmount amount: String?) -> String {
        guard let amount = amount?.trimmingCharacters(in: .whitespaces), let space = amount.firstIndex(of: " ") else { return "" }
        return String(amount[amount.index(after: space)...]).trimmingCharacters(in: .whitespaces)
    }

    static func line(amount: String?, name: String) -> String {
        let a = (amount ?? "").trimmingCharacters(in: .whitespaces)
        return a.isEmpty ? name : "\(a) \(name)"
    }

    static func line(quantity: Double?, unit: String?, name: String) -> String {
        let q = quantity.map { $0 == $0.rounded() ? String(Int($0)) : String($0) }
        return [q, unit, name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
    }
}

/// What the model read off a label, per 100 g, once it has passed the checks.
struct LabelReading: Equatable {
    var name: String
    var per100g: NutrientValues
    var servingGrams: Double?
}

/// What this phone has asked already, kept in UserDefaults (the newest 400).
final class DefaultsAskedMemory: AskedMemory {
    private let key = "mp_nutrition_asked"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func asked(_ k: String) -> Bool { (defaults.stringArray(forKey: key) ?? []).contains(k) }

    func remember(_ k: String) {
        var all = defaults.stringArray(forKey: key) ?? []
        guard !all.contains(k) else { return }
        all.append(k)
        defaults.set(Array(all.suffix(400)), forKey: key)
    }
}

#if DEBUG
/**
 A stand-in for the model, for a Simulator on a Mac without Apple Intelligence: `-mp_debug_ai fake`. It
 answers the way a sensible model would — the shortlisted food whose name starts like the line,
 the middle of the range — so the whole path (asking, checking, sending to the server, the ✨
 marks) can be seen and tested without Apple Intelligence.
 */
struct StandInThinker: NutritionThinker {
    func pickFood(line: String, options: [String]) async throws -> String {
        let words = line.lowercased().split(separator: " ").filter { $0.rangeOfCharacter(from: .decimalDigits) == nil }
        let head = words.first.map(String.init) ?? ""
        return options.first { !head.isEmpty && $0.lowercased().hasPrefix(head) } ?? options.first ?? NutritionAssist.noneOfThese
    }

    func gramsEach(ingredient: String, unit: String, food: String?, range: ClosedRange<Int>) async throws -> Int {
        (range.lowerBound + min(range.upperBound, 400)) / 2
    }

    func summary(of facts: ServingFacts) async throws -> String {
        let lead = facts.highlights.isEmpty ? "Nicely balanced" : facts.highlights.prefix(2).joined(separator: " and ").lowercased()
        return "\(NutritionText.capitalised(lead)), \(facts.size). Good for a weeknight dinner."
    }
}
#endif
