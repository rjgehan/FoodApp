import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 Apple Intelligence for receipts: which thinker this phone has, and the on-device one.

 The rules for which lines are asked about and which answers are kept are in ReceiptAssist.swift;
 this file only talks to the model. On a phone without Apple Intelligence `thinker` is nil and
 the review screen shows the server's draft as it is. (A Simulator lends the Mac's own model
 when the Mac has Apple Intelligence on; `-mp_debug_ai off` shows a phone without it,
 `-mp_debug_ai fake` a stand-in that answers the same way every time.)
 */
enum ReceiptAI {
    /// The model to ask on this phone right now, or nil for none.
    static var thinker: ReceiptThinker? {
        #if DEBUG
        switch UserDefaults.standard.string(forKey: "mp_debug_ai") {
        case "fake": return StandInReceiptThinker()
        case "off": return nil
        default: break
        }
        #endif
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), SystemLanguageModel.default.availability == .available {
            return OnDeviceReceiptThinker()
        }
        #endif
        return nil
    }
}

#if canImport(FoundationModels)
/**
 The on-device model. Each line is its own short session with greedy sampling: one line, one
 answer, nothing carried over — the shape a 3B model gets right (see SortIntoAisles.swift), and
 the same line gets the same answer every time.
 */
@available(iOS 26.0, *)
struct OnDeviceReceiptThinker: ReceiptThinker {
    private var steady: GenerationOptions { GenerationOptions(samplingMode: .greedy) }

    private static let reading = """
        You read lines from a supermarket receipt. Tills print short capital-letter \
        abbreviations: KNGS GRK YGRT PLN is the shop's own plain Greek yogurt, BELL&EVANS THIGHS \
        is chicken thighs, ORG BNNS is organic bananas. A shop's name or a brand at the start of \
        a line is not the food.
        """

    /// The household's names as a guided choice: the answer can only be one of `options`, word for word.
    func pickName(line: String, options: [String]) async throws -> String {
        let choice = DynamicGenerationSchema(
            name: "GroceryChoice",
            properties: [
                DynamicGenerationSchema.Property(
                    name: "grocery",
                    description: "The grocery this receipt line is, copied from the list.",
                    schema: DynamicGenerationSchema(type: String.self, guides: [.anyOf(options)])),
            ])
        let schema = try GenerationSchema(root: choice, dependencies: [])
        let session = LanguageModelSession(instructions: """
            \(Self.reading) Say which grocery from the household's list the line is, copied \
            exactly. Only choose one that is the same food. If none of them is, answer \
            "\(ReceiptAssist.somethingElse)".
            """)
        let reply = try await session.respond(to: "Receipt line: \(line)", schema: schema, options: steady)
        return try reply.content.value(String.self, forProperty: "grocery")
    }

    /// A plain grocery name, as a shopping list would say it, or "not food".
    func nameIt(line: String) async throws -> String {
        let session = LanguageModelSession(instructions: """
            \(Self.reading) Say what the item is as a plain, generic grocery name of one to four \
            lowercase words, the way a shopping list would write it: "greek yogurt", "chicken \
            thighs", "bananas". Leave out the shop, the brand and the size. If the line is not \
            food or drink — a bag, a deposit, a battery, a magazine — answer \
            "\(ReceiptAssist.notFood)".
            """)
        let reply = try await session.respond(to: "Receipt line: \(line)", generating: ReceiptItemName.self,
                                              options: steady)
        return reply.content.name
    }
}

@available(iOS 26.0, *)
@Generable
struct ReceiptItemName {
    @Guide(description: "A plain grocery name in one to four lowercase words, such as \"greek yogurt\", or \"not food\".")
    var name: String
}
#endif
