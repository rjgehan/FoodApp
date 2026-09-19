import Foundation

/// Splits "2 lb chicken" into an amount, a unit and a name, so adding something is one box
/// rather than three. Only a leading number is taken, and only a word that really is a unit —
/// "2 large eggs" keeps "large eggs" as the name. This mirrors `web/src/utils/amount.ts`; the
/// two have to agree, because they add to the same list.
struct Amount {
    let quantity: Double?
    let unit: String?
    let name: String

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
        "can": "can", "cans": "can", "clove": "clove", "cloves": "clove",
        "stick": "stick", "sticks": "stick", "bunch": "bunch", "head": "head",
        "slice": "slice", "slices": "slice", "package": "package", "pkg": "package",
        "pinch": "pinch", "dash": "dash", "sprig": "sprig", "sprigs": "sprig",
    ]

    init(_ text: String) {
        let typed = text.trimmingCharacters(in: .whitespaces)
        var words = typed.split(separator: " ").map(String.init)

        guard let first = words.first, let amount = Self.number(first), amount > 0, words.count > 1 else {
            self.quantity = nil
            self.unit = nil
            self.name = typed
            return
        }
        words.removeFirst()

        var unit: String?
        if let candidate = words.first,
           let known = Self.units[candidate.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))],
           words.count > 1 {
            unit = known
            words.removeFirst()
        }

        var name = words.joined(separator: " ")
        if name.lowercased().hasPrefix("of ") { name = String(name.dropFirst(3)) }

        self.quantity = amount
        self.unit = unit
        self.name = name
    }

    /// "1", "1.5", "1/2" — nil for anything else.
    private static func number(_ raw: String) -> Double? {
        if raw.contains("/") {
            let parts = raw.split(separator: "/").map(String.init)
            guard parts.count == 2, let top = Double(parts[0]), let bottom = Double(parts[1]), bottom != 0 else { return nil }
            return top / bottom
        }
        return Double(raw.replacingOccurrences(of: ",", with: "."))
    }
}
