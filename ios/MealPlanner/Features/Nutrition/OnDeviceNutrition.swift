import Foundation
import UIKit
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 Apple Intelligence for Nutrition facts: which thinker this phone has, the on-device one, the
 server the assistant writes back to, and reading a packet's label from a photo (iOS 27).

 The rules for what may be asked and which answers are kept are in NutritionAssist.swift; this
 file only talks to the model. Every entry point answers nil on a phone without Apple
 Intelligence, and the screens then show the server's answer as it is. (A Simulator lends the
 Mac's own model when the Mac has Apple Intelligence on; `-mp_debug_ai off` shows a phone
 without it, `-mp_debug_ai fake` a stand-in that answers the same way every time.)
 */
enum NutritionAI {
    /// The model to ask on this phone right now, or nil for none.
    static var thinker: NutritionThinker? {
        #if DEBUG
        switch UserDefaults.standard.string(forKey: "mp_debug_ai") {
        case "fake": return StandInThinker()
        case "off": return nil
        default: break
        }
        #endif
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), SystemLanguageModel.default.availability == .available {
            return OnDeviceNutritionThinker()
        }
        #endif
        return nil
    }

    /// Whether this phone's model can read a photo: iOS 27, Apple Intelligence on, and a model with vision.
    static var canReadLabels: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 27.0, *) {
            let model = SystemLanguageModel.default
            return model.availability == .available && model.capabilities.contains(.vision)
        }
        #endif
        return false
    }
}

/// The assistant's calls, on the real server. Its choices go in as source "ai".
struct LiveNutritionAssistServer: NutritionAssistServer {
    func match(_ ingredient: UUID) async throws -> IngredientMatch {
        try await APIClient.shared.ingredientMatch(ingredient)
    }

    func chooseFood(_ ingredient: UUID, fdcId: Int) async throws {
        _ = try await APIClient.shared.setIngredientMatch(ingredient, fdcId: fdcId, source: "ai")
    }

    func setGrams(_ ingredient: UUID, unit: String, grams: Double) async throws {
        _ = try await APIClient.shared.setIngredientGrams(ingredient, unit: unit, grams: grams, source: "ai")
    }
}

#if canImport(FoundationModels)
/**
 The on-device model. Each question is its own short session with greedy sampling: one line, one
 answer, nothing carried over — the shape a 3B model gets right (see SortIntoAisles.swift), and
 small enough for the context window many times over.
 */
@available(iOS 26.0, *)
struct OnDeviceNutritionThinker: NutritionThinker {
    private var steady: GenerationOptions { GenerationOptions(samplingMode: .greedy) }

    /// The shortlist as a guided choice: the answer can only be one of `options`, word for word.
    func pickFood(line: String, options: [String]) async throws -> String {
        let choice = DynamicGenerationSchema(
            name: "FoodChoice",
            properties: [
                DynamicGenerationSchema.Property(
                    name: "food",
                    description: "The food database entry this recipe line means, copied from the list.",
                    schema: DynamicGenerationSchema(type: String.self, guides: [.anyOf(options)])),
            ])
        let schema = try GenerationSchema(root: choice, dependencies: [])
        let session = LanguageModelSession(instructions: """
            You match a line from a recipe to the food database entry it means, for counting \
            calories. Prefer the plain, raw or basic form of the food unless the line says it is \
            cooked, tinned, dried or similar. If none of the entries is the same food, answer \
            "\(NutritionAssist.noneOfThese)".
            """)
        let reply = try await session.respond(to: "Recipe line: \(line)", schema: schema, options: steady)
        return try reply.content.value(String.self, forProperty: "food")
    }

    /// Grams for one of the unit, guided into the unit's own sane range.
    func gramsEach(ingredient: String, unit: String, food: String?, range: ClosedRange<Int>) async throws -> Int {
        let weight = DynamicGenerationSchema(
            name: "Weight",
            properties: [
                DynamicGenerationSchema.Property(
                    name: "grams",
                    description: "Grams in one, as a typical home cook would use.",
                    schema: DynamicGenerationSchema(type: Int.self, guides: [.range(range)])),
            ])
        let schema = try GenerationSchema(root: weight, dependencies: [])
        let session = LanguageModelSession(instructions: """
            You estimate how much food weighs in grams, as used in home cooking. Give a typical \
            figure, not an extreme one. Weigh it the way the food database entry describes it: \
            drained if it says drained, cooked if it says cooked, without skin or stone if it says so.
            """)
        let what = unit.isEmpty ? "one \(ingredient)" : "one \(unit) of \(ingredient)"
        let entry = food.map { " The database entry is: \($0)." } ?? ""
        let reply = try await session.respond(to: "How many grams is \(what)?\(entry)", schema: schema, options: steady)
        return try reply.content.value(Int.self, forProperty: "grams")
    }

    func summary(of facts: ServingFacts) async throws -> String {
        let session = LanguageModelSession(instructions: """
            You write one or two short, warm sentences (under twenty-five words) about a serving \
            of a dish, for a family meal planner. Use only the facts given. Never write a number, \
            a percentage or an amount. No health claims or advice.
            """)
        let traits = facts.highlights.isEmpty ? "nothing stands out" : facts.highlights.joined(separator: ", ")
        let reply = try await session.respond(
            to: "Dish: \(facts.dish). What stands out: \(traits). Size: \(facts.size).",
            generating: ServingWords.self, options: steady)
        return reply.content.text
    }
}

@available(iOS 26.0, *)
@Generable
struct ServingWords {
    @Guide(description: "One or two short friendly sentences with no numbers in them.")
    var text: String
}

/**
 A nutrition label read off a photo, as it is printed. Every figure is per 100 g (or ml) where the
 label has that column; otherwise per serving with the serving's grams, and NutritionLabelReader
 does the division. The ranges are what a real label can say.
 */
@available(iOS 26.0, *)
@Generable
struct ReadNutritionLabel {
    @Guide(description: "The product's name if the photo shows it, otherwise an empty string.")
    var name: String
    @Guide(description: "Which column the figures below are from.", .anyOf(["per 100 g", "per serving"]))
    var column: String
    @Guide(description: "Grams (or ml) in one serving if printed, otherwise 0.", .range(0...2000))
    var servingGrams: Int
    @Guide(description: "Energy in kcal, not kJ.", .range(0...950))
    var kcal: Double
    @Guide(description: "Protein in grams.", .range(0...100))
    var protein: Double
    @Guide(description: "Carbohydrate in grams.", .range(0...100))
    var carbs: Double
    @Guide(description: "Of which sugars, in grams.", .range(0...100))
    var sugars: Double
    @Guide(description: "Fat in grams.", .range(0...100))
    var fat: Double
    @Guide(description: "Of which saturates, in grams.", .range(0...100))
    var saturates: Double
    @Guide(description: "Fibre in grams, 0 if not printed.", .range(0...100))
    var fibre: Double
    @Guide(description: "Salt in grams, 0 if not printed.", .range(0...100))
    var salt: Double
}
#endif

/**
 Reading a packet's nutrition label from a photo, for a barcode Open Food Facts does not know
 (iOS 27 with a vision-capable model only). The figures are the label's own, copied by the
 model; this checks they hang together — energy within a fifth of what the macros make, sugars
 no more than the carbs, saturates no more than the fat — and throws the reading away if not,
 so a misread label is never shown. Nothing is sent to the server: it is shown on this phone,
 marked as read by Apple Intelligence, for the person to check against the packet.
 */
enum NutritionLabelReader {
    enum Outcome: Equatable {
        case read(LabelReading)
        /// The model answered, but its figures did not hang together.
        case misread
        /// No answer at all: no model, or it failed.
        case couldNotRead
    }

    static func read(_ image: UIImage) async -> Outcome {
        #if canImport(FoundationModels)
        if #available(iOS 27.0, *), NutritionAI.canReadLabels, let cg = image.cgImage {
            let session = LanguageModelSession(instructions: """
                You copy the figures from a food packet's nutrition label exactly as printed. Use \
                the per 100 g (or 100 ml) column if there is one. Never guess a figure that is not \
                on the label: use 0 for one that is missing.
                """)
            let reply: LanguageModelSession.Response<ReadNutritionLabel>
            do {
                reply = try await session.respond(generating: ReadNutritionLabel.self,
                                                  options: GenerationOptions(samplingMode: .greedy), prompt: {
                    "Read this nutrition label."
                    Attachment(cg, orientation: orientation(image))
                })
            } catch {
                // Seen in a Simulator that says it has vision but has not got the model's assets.
                return .couldNotRead
            }
            let r = reply.content
            return NutritionAssist.checkedLabel(name: r.name, column: r.column, servingGrams: Double(r.servingGrams),
                           kcal: r.kcal, protein: r.protein, carbs: r.carbs, sugars: r.sugars, fat: r.fat,
                           saturates: r.saturates, fibre: r.fibre, salt: r.salt).map { .read($0) } ?? .misread
        }
        #endif
        return .couldNotRead
    }

    #if canImport(FoundationModels)
    private static func orientation(_ image: UIImage) -> CGImagePropertyOrientation {
        switch image.imageOrientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
    #endif
}
