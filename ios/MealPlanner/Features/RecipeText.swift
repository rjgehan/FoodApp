import Foundation

/*
 The web's paste reader (web/src/utils/recipeParser.ts), for a phone without Apple Intelligence.

 Rules, not a model: it needs the layout the question asks for — a name, an "Ingredients" line,
 then an "Instructions" line — and the Paste screen says so before anybody pastes. The question
 and the reader are kept the same as the web's, so an answer copied on one works on the other.
*/
enum RecipeText {
    /// Why a paste could not be read, in a sentence for the screen.
    struct ParseError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /**
     The question to paste into an AI chat. It asks for a fixed layout because that is the easiest
     thing to read back. Amounts are asked for at the serving count you want, so whole things stay
     whole: "1 egg" for two people rather than a quarter of an egg scaled from a recipe for eight.
    */
    static func question(dish: String, servings: Int) -> String {
        let dish = dish.trimmingCharacters(in: .whitespacesAndNewlines)
        return """
        Write a recipe for \(dish.isEmpty ? "the dish I name at the end" : dish) that serves exactly \(servings), in this format:

        Name: <recipe name>
        Servings: \(servings)
        Prep Time: <minutes, number only>
        Cook Time: <minutes, number only>
        Description: <one sentence>
        Ingredients:
        - <quantity> | <unit> | <ingredient name>
        Instructions:
        1. <step>

        Amounts are for \(servings) people, written the way a person would — "1 | | egg", never "0.125 | | egg". \
        Leave the unit empty for things you count, but keep both "|".
        """ + (dish.isEmpty ? "\n\nRecipe: " : "")
    }

    private enum Header { case name, description, prep, cook, servings }

    private static let headers: [String: Header] = [
        "name": .name, "title": .name, "recipe": .name,
        "description": .description,
        "prep time": .prep, "prep": .prep,
        "cook time": .cook, "cook": .cook,
        "servings": .servings, "serves": .servings, "yield": .servings,
    ]

    private static let ingredientsHeading = try! Regex("^(ingredients?)\\s*:?$").ignoresCase()
    private static let stepsHeading = try! Regex("^(instructions?|method|directions|steps|preparation)\\s*:?$").ignoresCase()
    private static let field = try! Regex("^([A-Za-z ]+):\\s*(.+)$")
    private static let marker = try! Regex("^([-*•–]|\\d+[.)]|step \\d+:?)\\s*").ignoresCase()
    private static let fence = try! Regex("```[^\\n]*\\n([\\s\\S]*?)```")

    /// Markdown and chat decoration, gone: **bold**, _italics_, `code`, "## headings", "> quotes".
    private static func clean(_ line: String) -> String {
        line.replacing("**", with: "").replacing("__", with: "").replacing("`", with: "")
            .replacing(try! Regex("^\\s*#{1,6}\\s*"), with: "")
            .replacing(try! Regex("^\\s*>\\s?"), with: "")
            .trimmingCharacters(in: .whitespaces)
    }

    /// A bullet or a step number at the start of a line: "-", "*", "•", "1.", "2)", "Step 3:".
    private static func stripMarker(_ line: String) -> String {
        line.replacing(marker, with: "", maxReplacements: 1).trimmingCharacters(in: .whitespaces)
    }

    /**
     Reads a recipe laid out the way the question asks into a draft for the editor. It takes what
     it can find and ignores the rest — code fences, bold, bullets of any kind, numbered steps, a
     chatty line before or after — and the editor is where anything it gets wrong is fixed.
    */
    static func parse(_ raw: String) throws -> RecipeDraft {
        try read(raw).draft
    }

    /// The reader behind `parse`, which also counts the ingredients that came in the question's
    /// "qty | unit | name" layout, so `answer` can tell an answer from a page that has a "|" in it.
    private static func read(_ raw: String) throws -> (draft: RecipeDraft, piped: Int) {
        var text = raw.replacingOccurrences(of: "\r", with: "")
        // If the reply came in a code block, what matters is inside it.
        if let fenced = text.firstMatch(of: fence), let inside = fenced.output[1].substring {
            text = String(inside)
        }

        var name = ""
        var description: String?
        var prep: Int?
        var cook: Int?
        var servings: Int?
        var firstLine = ""
        var ingredients: [RecipeDraft.Ingredient] = []
        var steps: [String] = []
        var piped = 0
        var part: Part = .header

        for rawLine in text.components(separatedBy: "\n") {
            let line = clean(rawLine)
            if line.isEmpty { continue }

            if line.wholeMatch(of: ingredientsHeading) != nil { part = .ingredients; continue }
            if line.wholeMatch(of: stepsHeading) != nil { part = .steps; continue }

            switch part {
            case .header:
                guard let match = line.wholeMatch(of: field),
                      let key = match.output[1].substring,
                      let header = headers[key.trimmingCharacters(in: .whitespaces).lowercased()],
                      let rawValue = match.output[2].substring else {
                    // A pasted recipe often opens with its title on a line of its own.
                    if firstLine.isEmpty { firstLine = line }
                    continue
                }
                let value = rawValue.trimmingCharacters(in: .whitespaces)
                // parseInt: the number at the front, so "25 minutes" is 25.
                let number = Int(value.prefix { $0.isNumber })
                switch header {
                case .name: name = value
                case .description: description = value
                case .prep: if let number { prep = number }
                case .cook: if let number { cook = number }
                case .servings: if let number { servings = number }
                }
            case .ingredients:
                let item = stripMarker(line)
                // "For the sauce:" — a heading inside the list, not an ingredient.
                if item.isEmpty || item.hasSuffix(":") { continue }
                if let split = pipedIngredient(item) {
                    piped += 1
                    ingredients.append(split)
                } else {
                    ingredients.append(RecipeDraft.Ingredient(line: item))
                }
            case .steps:
                let step = stripMarker(line)
                if !step.isEmpty { steps.append(step) }
            }
        }

        if name.isEmpty { name = firstLine }
        if name.isEmpty {
            throw ParseError(message: "Couldn’t find the recipe’s name — is there a “Name:” line?")
        }
        if ingredients.isEmpty {
            throw ParseError(message: "Couldn’t find any ingredients — they should be under an “Ingredients:” line.")
        }

        let draft = RecipeDraft(
            name: name,
            description: description,
            servings: servings ?? 4,
            prep: prep ?? 0,
            cook: cook ?? 0,
            instructions: steps.joined(separator: "\n"),
            ingredients: ingredients
        )
        return (draft, piped)
    }

    private enum Part { case header, ingredients, steps }

    /**
     A paste that is an answer to the question — most of its ingredients in the "2 | cup | flour"
     layout under an Ingredients line — read by rule. Nil for anything else. The rules read that
     layout exactly, so the phone's model is not asked to guess at what is already plain.

     A "|" somewhere in the paste is not enough: a copied recipe page has them in its breadcrumbs,
     its "Title | Site" line and its "US Customary | Metric" switch, and the rules would take the
     page's menu for the name and its buttons for ingredients. Those pages are the model's job.
    */
    static func answer(_ raw: String) -> RecipeDraft? {
        guard raw.contains("|"), let (draft, piped) = try? read(raw),
              piped * 2 > draft.ingredients.count else { return nil }
        return draft
    }

    /// "2 | cup | flour", "3 | | eggs", or plain "2 cups flour" — whichever came back. Also used
    /// for the on-device model's lines, which it copies as written, pipes and all.
    static func ingredient(_ item: String) -> RecipeDraft.Ingredient {
        pipedIngredient(item) ?? RecipeDraft.Ingredient(line: item)
    }

    /// "qty | unit | name", or "qty | name" with the unit left out altogether. Nil when the line
    /// is not in that layout, or its pipes leave no name.
    private static func pipedIngredient(_ item: String) -> RecipeDraft.Ingredient? {
        guard item.contains("|") else { return nil }
        let parts = item.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
        let unit = parts.count >= 3 ? parts[1] : ""
        let name = parts.count >= 3 ? parts[2...].joined(separator: " ") : (parts.count > 1 ? parts[1] : "")
        guard !name.isEmpty else { return nil }
        return RecipeDraft.Ingredient(quantity: Amount.quantity(parts[0]), unit: unit, name: name)
    }
}
