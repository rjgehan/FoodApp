import Foundation

/*
 What a price comes to per egg, per lb or per fl oz, so two shops' prices for different sizes can
 be put side by side: 12 eggs for $4.99 against 18 for $6.49 is $0.42 an egg against $0.36.

 A size can be compared when it is a weight, a volume or a count of pieces ("18 ct", "12 eggs",
 "1 dozen", "24 pk"). A price with no size — Kings prints "OPN NAT EGGS BROWN 5.79", nothing about
 how many — can't, and nor can "1 carton" or a bare "2" (two of something, of a size nobody said):
 comparing those totals would call the smaller box the cheaper one.

 Foundation only, so ios/checks can test it on a Mac without the app.
*/
enum UnitPrice {
    /// A price and how much it was for, as the server sends them.
    struct Priced: Equatable {
        let price: Double
        var quantity: Double? = nil
        var unit: String? = nil
    }

    /// What a size measures.
    enum Kind: Equatable {
        case weight, volume, pieces
    }

    /// How much a price was for, in its kind's smallest unit: grams, millilitres or pieces.
    struct Measure: Equatable {
        let kind: Kind
        let amount: Double
    }

    /// What one of something costs: `price` for each `per` ("lb", "fl oz", "each").
    struct Rate: Equatable {
        let price: Double
        let per: String
    }

    // MARK: Sizes

    private static let grams: [String: Double] = [
        "g": 1, "gr": 1, "gram": 1, "grams": 1,
        "kg": 1000, "kilo": 1000, "kilos": 1000, "kilogram": 1000, "kilograms": 1000,
        "oz": 28.349523125, "ounce": 28.349523125, "ounces": 28.349523125,
        "lb": 453.59237, "lbs": 453.59237, "pound": 453.59237, "pounds": 453.59237,
    ]

    private static let millilitres: [String: Double] = [
        "ml": 1, "millilitre": 1, "millilitres": 1, "milliliter": 1, "milliliters": 1, "cl": 10,
        "l": 1000, "ltr": 1000, "litre": 1000, "litres": 1000, "liter": 1000, "liters": 1000,
        "fl oz": 29.5735295625, "floz": 29.5735295625, "fluid ounce": 29.5735295625, "fluid ounces": 29.5735295625,
        "pt": 473.176473, "pint": 473.176473, "pints": 473.176473,
        "qt": 946.352946, "quart": 946.352946, "quarts": 946.352946,
        "gal": 3785.411784, "gallon": 3785.411784, "gallons": 3785.411784,
    ]

    private static let pieces: [String: Double] = [
        "ct": 1, "count": 1, "pc": 1, "pcs": 1, "piece": 1, "pieces": 1, "egg": 1, "eggs": 1,
        "dozen": 12, "dz": 12, "doz": 12,
    ]

    /// A pack of 24 is 24 pieces; "1 pack" says nothing about how big the pack is.
    private static let packs: Set<String> = ["pk", "pack", "packs"]

    /// The size, if it is one that can be compared: nil for none, "1 carton" or a bare number.
    static func measure(quantity: Double?, unit: String?) -> Measure? {
        let word = plain(unit)
        let amount = quantity ?? 1
        guard !word.isEmpty, amount > 0 else { return nil }
        if let each = grams[word] { return Measure(kind: .weight, amount: amount * each) }
        if let each = millilitres[word] { return Measure(kind: .volume, amount: amount * each) }
        if let each = pieces[word] { return Measure(kind: .pieces, amount: amount * each) }
        if packs.contains(word), amount > 1 { return Measure(kind: .pieces, amount: amount) }
        return nil
    }

    static func measure(_ priced: Priced) -> Measure? {
        measure(quantity: priced.quantity, unit: priced.unit)
    }

    // MARK: Comparing

    /**
     The cheapest by what it costs per egg, lb or fl oz: its place in `prices`, or nil unless
     there are two or more, every one has a size of the same kind, and one costs less than the
     rest.
     */
    static func cheapest(_ prices: [Priced]) -> Int? {
        guard prices.count > 1, sharedKind(prices) != nil else { return nil }
        let each = prices.compactMap { priced in measure(priced).map { priced.price / $0.amount } }
        guard each.count == prices.count, let lowest = each.min() else { return nil }
        // Within a tenth of a percent is the same price, not a winner.
        guard each.filter({ $0 - lowest <= lowest * 0.001 }).count == 1 else { return nil }
        return each.firstIndex(of: lowest)
    }

    /// The kind every price's size is, or nil when one has none or they differ (a lb and a dozen).
    static func sharedKind(_ prices: [Priced]) -> Kind? {
        let kinds = prices.map { measure($0)?.kind }
        guard let first = kinds.first ?? nil, kinds.allSatisfy({ $0 == first }) else { return nil }
        return first
    }

    /**
     Each price per one of something, in the order given, nil where it has no size to go by. Prices
     of one kind are all told per the same unit, so they read side by side: per lb when any of them
     was weighed in pounds, else per oz; per gallon when any was a gallon, else per fl oz; per kg or
     per 100 g, per litre; and each for pieces.
     */
    static func rates(_ prices: [Priced]) -> [Rate?] {
        let units = prices.map { plain($0.unit) }
        func any(_ words: Set<String>) -> Bool { units.contains { words.contains($0) } }
        var weightPer = "100 g"
        var weightSize = 100.0
        if any(["lb", "lbs", "pound", "pounds"]) {
            weightPer = "lb"
            weightSize = 453.59237
        } else if any(["oz", "ounce", "ounces"]) {
            weightPer = "oz"
            weightSize = 28.349523125
        } else if any(["kg", "kilo", "kilos", "kilogram", "kilograms"]) {
            weightPer = "kg"
            weightSize = 1000
        }
        var volumePer = "l"
        var volumeSize = 1000.0
        if any(["gal", "gallon", "gallons"]) {
            volumePer = "gal"
            volumeSize = 3785.411784
        } else if any(["fl oz", "floz", "fluid ounce", "fluid ounces", "pt", "pint", "pints", "qt", "quart", "quarts"]) {
            volumePer = "fl oz"
            volumeSize = 29.5735295625
        }
        var out: [Rate?] = []
        for priced in prices {
            guard let size = measure(priced) else {
                out.append(nil)
                continue
            }
            switch size.kind {
            case .weight: out.append(Rate(price: priced.price / size.amount * weightSize, per: weightPer))
            case .volume: out.append(Rate(price: priced.price / size.amount * volumeSize, per: volumePer))
            case .pieces: out.append(Rate(price: priced.price / size.amount, per: "each"))
            }
        }
        return out
    }

    /// "Fl. Oz" → "fl oz": lower case, no full stops, one space between words.
    private static func plain(_ unit: String?) -> String {
        (unit ?? "").lowercased()
            .replacingOccurrences(of: ".", with: "")
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }
}
