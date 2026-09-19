import Foundation

/// Splits "2 lb chicken" into an amount, a unit and a name, so adding something is one box
/// rather than three. Only a leading number is taken, and only a word that really is a unit —
/// "2 large eggs" keeps "large eggs" as the name. This mirrors `web/src/utils/amount.ts`; the
/// two have to agree, because they add to the same list.
///
/// It also does the arithmetic for the recipe parser. A small language model asked for "1/3"
/// as a number answers 1, and asked for a unit will cheerfully answer "parmesan cheese" —
/// both of which this does correctly and for free, so the model is only asked to split a
/// recipe into lines, which it is good at.
struct Amount {
    let quantity: Double?
    let unit: String?
    let name: String
    /// What came after a comma, or a parenthesis: "minced", "or to taste", "optional".
    let notes: String?
    /// "to taste", "optional", "if you like" — a cook can skip it.
    let optional: Bool

    private static let units: [String: String] = [
        "cup": "cup", "cups": "cup",
        "tbsp": "tbsp", "tbsps": "tbsp", "tbs": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp",
        "tsp": "tsp", "tsps": "tsp", "teaspoon": "tsp", "teaspoons": "tsp",
        "oz": "oz", "ounce": "oz", "ounces": "oz",
        "lb": "lb", "lbs": "lb", "pound": "lb", "pounds": "lb",
        "g": "g", "gram": "g", "grams": "g",
        "kg": "kg", "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg",
        "ml": "ml", "l": "l", "liter": "l", "liters": "l", "litre": "l", "litres": "l",
        "pint": "pint", "pints": "pint", "quart": "quart", "quarts": "quart",
        "can": "can", "cans": "can", "tin": "can", "tins": "can",
        "clove": "clove", "cloves": "clove",
        "stick": "stick", "sticks": "stick", "bunch": "bunch", "bunches": "bunch",
        "head": "head", "heads": "head", "slice": "slice", "slices": "slice",
        "package": "package", "packages": "package", "pkg": "package",
        "pinch": "pinch", "pinches": "pinch", "dash": "dash",
        "sprig": "sprig", "sprigs": "sprig", "handful": "handful",
    ]

    /// "½ cup" and "1½ cups" both turn up in recipes written for people.
    private static let glyphs: [Character: Double] = [
        "½": 0.5, "⅓": 1.0 / 3, "⅔": 2.0 / 3, "¼": 0.25, "¾": 0.75,
        "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875, "⅕": 0.2, "⅖": 0.4,
    ]

    private static let skippable = ["to taste", "optional", "if you like", "as needed", "for serving", "to serve"]

    init(_ text: String) {
        // Bullets and dashes are how ingredient lists are written; they are not the ingredient.
        var line = text.trimmingCharacters(in: .whitespacesAndNewlines)
        while let first = line.first, "-•*–—◦".contains(first) {
            line = String(line.dropFirst()).trimmingCharacters(in: .whitespaces)
        }

        let lowered = line.lowercased()
        optional = Self.skippable.contains { lowered.contains($0) }

        // Anything after a comma or inside brackets is a note about the ingredient, not part
        // of its name: "garlic, minced" and "sugar (or to taste)".
        var head = line
        var tail: String?
        if let comma = head.firstIndex(of: ",") {
            tail = String(head[head.index(after: comma)...]).trimmingCharacters(in: .whitespaces)
            head = String(head[..<comma])
        }
        if let open = head.firstIndex(of: "("), let close = head.lastIndex(of: ")"), open < close {
            let inside = String(head[head.index(after: open)..<close])
            tail = [tail, inside].compactMap { $0 }.joined(separator: " · ")
            head = String(head[..<open]).trimmingCharacters(in: .whitespaces)
        }

        var words = head.split(separator: " ").map(String.init)
        guard let amount = Self.leadingNumber(&words) else {
            quantity = nil
            unit = nil
            name = Self.clean(head)
            notes = tail
            return
        }

        // A unit only counts when it is one; otherwise the word belongs to the name. This is
        // what stops "1/3 cup parmesan cheese" turning into a unit of "parmesan cheese".
        var found: String?
        if let candidate = words.first {
            let key = candidate.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ".")).replacingOccurrences(of: ".", with: "")
            if let known = Self.units[key], words.count > 1 {
                found = known
                words.removeFirst()
            }
        }

        quantity = amount
        unit = found
        name = Self.clean(words.joined(separator: " "))
        notes = tail
    }

    /// Takes the amount off the front of the words, handling "2", "1.5", "1/3", "1 1/2", "½"
    /// and "1½". Returns nil and leaves the words alone when there is no number.
    private static func leadingNumber(_ words: inout [String]) -> Double? {
        guard var first = words.first else { return nil }

        // "400g" and "2tbsp": a number welded to its unit, which is how half of Britain
        // writes a recipe. Split it so the unit can be recognised normally.
        if let split = first.firstIndex(where: { $0.isLetter }), split != first.startIndex {
            let number = String(first[first.startIndex..<split])
            let rest = String(first[split...])
            if Double(number) != nil, units[rest.lowercased()] != nil {
                words.replaceSubrange(0...0, with: [number, rest])
                first = number
            }
        }

        // "1 1/2 cups" — a whole number followed by a fraction.
        if words.count > 1, let whole = Double(first), let fraction = simpleFraction(words[1]) {
            words.removeFirst(2)
            return whole + fraction
        }
        if let value = value(of: first) {
            words.removeFirst()
            return value
        }
        return nil
    }

    private static func value(of raw: String) -> Double? {
        if let fraction = simpleFraction(raw) { return fraction }
        // "1½"
        if let last = raw.last, let glyph = glyphs[last], let whole = Double(raw.dropLast()) {
            return whole + glyph
        }
        if raw.count == 1, let only = raw.first, let glyph = glyphs[only] { return glyph }
        return Double(raw.replacingOccurrences(of: ",", with: "."))
    }

    private static func simpleFraction(_ raw: String) -> Double? {
        guard raw.contains("/") else { return nil }
        let parts = raw.split(separator: "/").map(String.init)
        guard parts.count == 2, let top = Double(parts[0]), let bottom = Double(parts[1]), bottom != 0 else { return nil }
        return top / bottom
    }

    private static func clean(_ raw: String) -> String {
        var out = raw.trimmingCharacters(in: .whitespaces)
        if out.lowercased().hasPrefix("of ") { out = String(out.dropFirst(3)) }
        for phrase in skippable {
            out = out.replacingOccurrences(of: " or \(phrase)", with: "", options: .caseInsensitive)
            out = out.replacingOccurrences(of: " \(phrase)", with: "", options: .caseInsensitive)
        }
        return out.trimmingCharacters(in: .whitespaces)
    }
}
