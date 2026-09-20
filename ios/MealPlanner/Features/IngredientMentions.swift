import Foundation
import SwiftUI

/*
 Marking the ingredients where they appear inside a step.

 Reading "add the garlic and the stock" while cooking, the useful thing is seeing at a glance
 which words are things you had to buy. It is a matching problem, not a language one: the
 ingredient list is already parsed exactly, so a step only has to be searched for the names
 that are known to be in this recipe. No model, nothing invented, and a name that is not in
 the list is never marked.

 Deliberately cautious. A bare "oil" is not marked when the recipe's ingredient is "olive
 oil", because half the steps in a transcript say "oil" about the pan — the whole phrase has
 to be there, or a word specific enough to only mean the one thing.
*/
enum IngredientMentions {

    /// Words too common to mean an ingredient on their own, however they were listed.
    private static let tooGeneral: Set<String> = [
        "oil", "salt", "pepper", "water", "stock", "sugar", "flour", "sauce", "cheese",
        "butter", "milk", "cream", "juice", "seasoning", "herbs", "spices", "greens",
    ]

    /// The parts of a step, in order: the ones that name an ingredient are marked.
    struct Run: Identifiable {
        let id = UUID()
        let text: String
        let isIngredient: Bool
    }

    /// `names` are ingredient names, already parsed — "cannellini beans", not "1 can of them".
    static func runs(in step: String, names: [String]) -> [Run] {
        let needles = phrases(from: names)
        guard !needles.isEmpty else { return [Run(text: step, isIngredient: false)] }

        let lowered = step.lowercased()
        // Longest first, so "baby spinach" wins over "spinach" and nothing overlaps.
        var marked = Array(repeating: false, count: Array(step).count)
        for needle in needles.sorted(by: { $0.count > $1.count }) {
            var from = lowered.startIndex
            while let found = lowered.range(of: needle, range: from ..< lowered.endIndex) {
                if isWholeWord(found, in: lowered) {
                    let start = lowered.distance(from: lowered.startIndex, to: found.lowerBound)
                    let end = lowered.distance(from: lowered.startIndex, to: found.upperBound)
                    if !marked[start ..< end].contains(true) {
                        for at in start ..< end { marked[at] = true }
                    }
                }
                from = found.upperBound
            }
        }

        var runs: [Run] = []
        var current = ""
        var currentMarked = false
        for (at, character) in Array(step).enumerated() {
            if marked[at] != currentMarked, !current.isEmpty {
                runs.append(Run(text: current, isIngredient: currentMarked))
                current = ""
            }
            currentMarked = marked[at]
            current.append(character)
        }
        if !current.isEmpty { runs.append(Run(text: current, isIngredient: currentMarked)) }
        return runs
    }

    /// Says which one it is, but never on its own: a recipe full of "baby spinach" and
    /// "kosher salt" should not light up every "baby" and every "fresh".
    private static let descriptors: Set<String> = [
        "baby", "fresh", "dried", "ground", "whole", "large", "small", "extra", "virgin",
        "light", "dark", "sweet", "kosher", "brown", "plain", "free", "range", "organic",
        "spanish", "italian", "french", "greek", "chopped", "sliced", "minced", "your",
    ]

    /**
     The names worth looking for: the whole name, and the words inside it specific enough to
     mean only that ingredient.

     "Spanish onion" has to match a step that says "the onions", and "garlic cloves" one that
     says "the garlic" — a cook names a thing in full once and refers to it loosely after.
     But "kosher salt" must never light up a bare "salt", and "olive oil" must never light up
     the oil you greased the pan with, so the generic half of a name is not a name.
    */
    private static func phrases(from names: [String]) -> Set<String> {
        var out: Set<String> = []
        for raw in names {
            let name = raw.lowercased().trimmingCharacters(in: .whitespaces)
            guard name.count > 2 else { continue }
            out.insert(name)
            if name.contains(" ") {
                for word in name.split(separator: " ") {
                    let part = String(word)
                    if part.count > 3, !tooGeneral.contains(part), !descriptors.contains(part) {
                        out.insert(part)
                    }
                }
            }
        }
        // "onions" in the step, "onion" in the list, and the other way round.
        for phrase in out {
            out.insert(phrase.hasSuffix("s") ? String(phrase.dropLast()) : phrase + "s")
        }
        return out.filter { $0.count > 2 }
    }

    private static func isWholeWord(_ range: Range<String.Index>, in text: String) -> Bool {
        let before = range.lowerBound == text.startIndex
            ? nil : text[text.index(before: range.lowerBound)]
        let after = range.upperBound == text.endIndex ? nil : text[range.upperBound]
        let boundary = { (character: Character?) in
            character == nil || !(character!.isLetter || character!.isNumber)
        }
        return boundary(before) && boundary(after)
    }
}

extension IngredientMentions {
    /// The step as one piece of styled text, so it can be concatenated with a step number
    /// and still wrap as a single paragraph.
    static func text(_ step: String, names: [String]) -> Text {
        runs(in: step, names: names).reduce(Text("")) { text, run in
            text + Text(run.text).fontWeight(run.isIngredient ? .semibold : .regular)
        }
    }
}

/// A step with the things you had to buy picked out of it.
struct StepText: View {
    let step: String
    let names: [String]

    var body: some View { IngredientMentions.text(step, names: names) }
}
