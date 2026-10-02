import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 Apple Intelligence for Meal plans: which thinker this phone has, and the on-device one.

 The rules for what may be asked and which answers are kept are in MealPlanAssist.swift; this
 file only talks to the model. On a phone without Apple Intelligence `thinker` is nil and the
 screens show the server's plans as they are. (A Simulator lends the Mac's own model when the
 Mac has Apple Intelligence on; `-mp_debug_ai off` shows a phone without it, `-mp_debug_ai fake`
 a stand-in that answers the same way every time.)
 */
enum MealPlanAI {
    static var thinker: MealPlanThinker? {
        #if DEBUG
        switch UserDefaults.standard.string(forKey: "mp_debug_ai") {
        case "fake": return StandInMealPlanThinker()
        case "off": return nil
        default: break
        }
        #endif
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), SystemLanguageModel.default.availability == .available {
            return OnDeviceMealPlanThinker()
        }
        #endif
        return nil
    }
}

#if canImport(FoundationModels)
/**
 The on-device model. Each question is its own short session with greedy sampling — a day's
 meals, one swap, one food's shelf life — so the prompt stays a few hundred tokens, well inside
 the context window, and the same question gets the same answer. Choices are guided with
 `.anyOf` over the server's own candidates, so the model cannot name a recipe it was not offered.
 */
@available(iOS 26.0, *)
struct OnDeviceMealPlanThinker: MealPlanThinker {
    private var steady: GenerationOptions { GenerationOptions(samplingMode: .greedy) }

    private func instructions(_ kind: String) -> String {
        if kind == "target" {
            return """
                You plan meals for someone with a health goal, from recipes they already have. \
                For each meal, choose one recipe from the list given for that meal, copied exactly. \
                Choose what suits the meal, adds up sensibly across the day, and differs from \
                earlier days. Prefer their own recipes when they fit as well.
                """
        }
        return """
            You plan a family's home meals from their own recipes, around what is already in \
            their cupboard. For each meal, choose one recipe from the list given for that meal, \
            copied exactly. Prefer recipes that use up things that need using soon, that are \
            mostly in the cupboard, and that need little shopping. Keep the days varied: not the \
            same kind of dish two days running, and nothing already chosen on an earlier day.
            """
    }

    func chooseDay(_ question: DayQuestion) async throws -> [MealType: String] {
        let properties = question.meals.compactMap { meal -> DynamicGenerationSchema.Property? in
            guard let options = question.options[meal], !options.isEmpty else { return nil }
            return DynamicGenerationSchema.Property(
                name: meal.rawValue.lowercased(),
                description: "The recipe for \(meal.title.lowercased()), copied from its list.",
                schema: DynamicGenerationSchema(type: String.self, guides: [.anyOf(options)]))
        }
        let schema = try GenerationSchema(root: DynamicGenerationSchema(name: "DayOfMeals", properties: properties),
                                          dependencies: [])
        var prompt = "\(question.day). Choose: \(question.meals.map { $0.title.lowercased() }.joined(separator: ", ")).\n"
        for meal in question.meals {
            prompt += "\(meal.title) may be: \((question.options[meal] ?? []).joined(separator: " | "))\n"
        }
        prompt += "About the recipes:\n" + question.menu.map { "- \($0)" }.joined(separator: "\n") + "\n"
        if !question.earlier.isEmpty { prompt += "Earlier days already have: \(question.earlier.joined(separator: ", ")).\n" }
        prompt += question.notes.joined(separator: "\n")
        let session = LanguageModelSession(instructions: instructions(question.kind))
        let reply = try await session.respond(to: prompt, schema: schema, options: steady)
        var out: [MealType: String] = [:]
        for meal in question.meals where question.options[meal]?.isEmpty == false {
            if let said = try? reply.content.value(String.self, forProperty: meal.rawValue.lowercased()) {
                out[meal] = said
            }
        }
        return out
    }

    func chooseOne(_ question: SwapQuestion) async throws -> String {
        let schema = try GenerationSchema(root: DynamicGenerationSchema(
            name: "Swap",
            properties: [DynamicGenerationSchema.Property(
                name: "recipe", description: "The recipe to have instead, copied from the list.",
                schema: DynamicGenerationSchema(type: String.self, guides: [.anyOf(question.options)]))]),
            dependencies: [])
        var prompt = "Choose something else for \(question.slot).\n"
        prompt += "About the recipes:\n" + question.menu.map { "- \($0)" }.joined(separator: "\n") + "\n"
        if !question.rest.isEmpty { prompt += "The rest of the plan: \(question.rest.joined(separator: "; ")).\n" }
        prompt += question.notes.joined(separator: "\n")
        let session = LanguageModelSession(instructions: instructions(question.kind))
        let reply = try await session.respond(to: prompt, schema: schema, options: steady)
        return try reply.content.value(String.self, forProperty: "recipe")
    }

    func keepsFor(_ name: String) async throws -> Int {
        let schema = try GenerationSchema(root: DynamicGenerationSchema(
            name: "ShelfLife",
            properties: [DynamicGenerationSchema.Property(
                name: "days", description: "Days it keeps from when it was bought.",
                schema: DynamicGenerationSchema(type: Int.self, guides: [.range(MealPlanAssist.shelfRange)]))]),
            dependencies: [])
        let session = LanguageModelSession(instructions: """
            You know how long food keeps at home. Give a typical, cautious number of days a food \
            keeps from the day it was bought, stored the usual way: fresh food in the fridge, dry \
            and tinned food in the cupboard. Not a safety rule, just when it is best used.
            """)
        let reply = try await session.respond(to: "How many days does \(name) keep?", schema: schema, options: steady)
        return try reply.content.value(Int.self, forProperty: "days")
    }

    func planWords(_ facts: PlanFacts) async throws -> String {
        let session = LanguageModelSession(instructions: """
            You write one or two short, warm sentences (under thirty words) about a family's meal \
            plan. Use only the facts given. Never write a number, a percentage or an amount. No \
            health claims or advice.
            """)
        let prompt = "The plan: \(facts.what). What stands out: \(facts.traits.joined(separator: "; ")). "
            + "Some of the dishes: \(facts.dishes.joined(separator: ", "))."
        let reply = try await session.respond(to: prompt, generating: PlanWords.self, options: steady)
        return reply.content.text
    }
}

@available(iOS 26.0, *)
@Generable
struct PlanWords {
    @Guide(description: "One or two short friendly sentences with no numbers in them.")
    var text: String
}
#endif
