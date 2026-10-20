import Foundation

/*
 What things cost at each chain of shops, for Explore's map of grocery stores — from every
 household's receipts and typed prices on this server, since no shop here publishes its own. Whose
 a price was is never sent, only how many households have priced there and whether one was yours.
 Field names match the backend's `StorePrices` and `StoreItemPrice` exactly.
 */

/**
 A chain of shops ("Kings", however each receipt spelled it): the newest price anybody paid there
 for each thing (A to Z), the day it was last priced, how many households have, and what this
 household's grocery list as it stands comes to there — `listTotal` for the `listPriced` of its
 `listCount` rows still to buy that the chain has a price for. `yours` when this household shops
 there too.
 */
struct StorePrices: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
    var lastPricedOn: String?
    var prices: [StoreItemPrice] = []
    var listTotal: Double = 0
    var listPriced: Int = 0
    var listCount: Int = 0
    var households: Int = 0
    var yours: Bool = false
    /// Branches receipts were linked to: pinned even where Apple's search does not find them.
    var places: [ShopBranch] = []

    init(id: UUID, name: String, lastPricedOn: String? = nil, prices: [StoreItemPrice] = [],
         listTotal: Double = 0, listPriced: Int = 0, listCount: Int = 0, households: Int = 1, yours: Bool = true,
         places: [ShopBranch] = []) {
        self.id = id
        self.name = name
        self.lastPricedOn = lastPricedOn
        self.prices = prices
        self.listTotal = listTotal
        self.listPriced = listPriced
        self.listCount = listCount
        self.households = households
        self.yours = yours
        self.places = places
    }

    /// Forgiving, as the receipts are: a shop missing its counts still shows, with what it has.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        lastPricedOn = try c.decodeIfPresent(String.self, forKey: .lastPricedOn)
        prices = try c.decodeIfPresent([StoreItemPrice].self, forKey: .prices) ?? []
        listTotal = try c.decodeIfPresent(Double.self, forKey: .listTotal) ?? 0
        listPriced = try c.decodeIfPresent(Int.self, forKey: .listPriced) ?? 0
        listCount = try c.decodeIfPresent(Int.self, forKey: .listCount) ?? 0
        households = try c.decodeIfPresent(Int.self, forKey: .households) ?? 0
        yours = try c.decodeIfPresent(Bool.self, forKey: .yours) ?? false
        places = try c.decodeIfPresent([ShopBranch].self, forKey: .places) ?? []
    }
}

/// What one thing last cost at one chain: `price` for `quantity` `unit` of it (one, when nil), and
/// whether that newest price was this household's own.
struct StoreItemPrice: Codable, Identifiable, Hashable {
    let ingredientId: UUID
    let ingredientName: String
    let price: Double
    var quantity: Double?
    var unit: String?
    /// `YYYY-MM-DD`, as the server sends it.
    var observedOn: String?
    var onSale: Bool = false
    var source: String?
    /// Who made it ("Twinings"), when whoever paid said.
    var brand: String?
    var yours: Bool = false

    var id: UUID { ingredientId }

    init(ingredientId: UUID, ingredientName: String, price: Double, quantity: Double? = nil, unit: String? = nil,
         observedOn: String? = nil, onSale: Bool = false, source: String? = nil, brand: String? = nil,
         yours: Bool = false) {
        self.ingredientId = ingredientId
        self.ingredientName = ingredientName
        self.price = price
        self.quantity = quantity
        self.unit = unit
        self.observedOn = observedOn
        self.onSale = onSale
        self.source = source
        self.brand = brand
        self.yours = yours
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ingredientId = try c.decode(UUID.self, forKey: .ingredientId)
        ingredientName = try c.decodeIfPresent(String.self, forKey: .ingredientName) ?? ""
        price = try c.decode(Double.self, forKey: .price)
        quantity = try c.decodeIfPresent(Double.self, forKey: .quantity)
        unit = try c.decodeIfPresent(String.self, forKey: .unit)
        observedOn = try c.decodeIfPresent(String.self, forKey: .observedOn)
        onSale = try c.decodeIfPresent(Bool.self, forKey: .onSale) ?? false
        source = try c.decodeIfPresent(String.self, forKey: .source)
        brand = try c.decodeIfPresent(String.self, forKey: .brand)
        yours = try c.decodeIfPresent(Bool.self, forKey: .yours) ?? false
    }
}

extension APIClient {
    /**
     Every chain anybody on the server has priced something at, with the newest prices there and
     this household's list priced there. A server from before the store map answers 404, which the
     map takes as "no prices yet".
     */
    func storePrices(household: UUID) async throws -> [StorePrices] {
        try await get("/api/households/\(household.uuidString)/stores/prices")
    }

    /// The places the household took off its map, lately hidden first.
    func hiddenPlaces(household: UUID) async throws -> [HiddenPlace] {
        try await get("/api/households/\(household.uuidString)/stores/hidden")
    }

    /// "Not a grocery store": off the map on every phone in the household.
    func hidePlace(household: UUID, _ place: StorePlace) async throws -> HiddenPlace {
        var body: [String: Any] = [
            "name": String(place.name.prefix(120)),
            "latitude": place.latitude,
            "longitude": place.longitude,
        ]
        if let address = place.address, !address.isEmpty { body["address"] = String(address.prefix(200)) }
        return try await send("POST", "/api/households/\(household.uuidString)/stores/hidden", body: body)
    }

    /// Back on the map.
    func showPlace(household: UUID, id: UUID) async throws {
        _ = try await sendNoContent("DELETE", "/api/households/\(household.uuidString)/stores/hidden/\(id.uuidString)")
    }
}

/**
 A place the household said is not a grocery store — the soup kitchen Apple files as a food
 market — kept off the map and the stores a receipt can be linked to, until it is shown again.
 Known again by its name and where it stands, as each search finds Apple's places afresh.
 */
struct HiddenPlace: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
    var address: String?
    let latitude: Double
    let longitude: Double
    var hiddenAt: String?

    func hides(_ place: StorePlace) -> Bool {
        guard place.name.caseInsensitiveCompare(name) == .orderedSame else { return false }
        let here = StorePlace(name: name, latitude: latitude, longitude: longitude)
        return here.metres(to: place) < 40
    }
}

extension Array where Element == HiddenPlace {
    /// Whether any of these is that place.
    func hide(_ place: StorePlace) -> Bool { contains { $0.hides(place) } }
}

/**
 Which of the household's shops a place on Apple Maps is. Receipts are headed with the chain's
 name and its prices are the chain's, so a shop is matched by name, not by where it is: "ShopRite
 of Hoboken" off a receipt is every ShopRite on the map, and Apple's "Kings Food Markets" is the
 receipt's "KINGS FOOD MARKETS". The words every grocer uses ("market", "foods", "the") and a
 trailing "of <town>" are set aside first, so "Whole Foods Market" is "whole" on both sides.
 */
enum StoreMatch {
    private static let generic: Set<String> = [
        "the", "food", "foods", "market", "markets", "supermarket", "supermarkets", "grocery",
        "groceries", "store", "stores", "inc", "co", "llc",
    ]

    /// The words a shop's name is known by: "shoprite", "whole", "trader joes".
    static func key(_ name: String) -> String {
        let folded = name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
            .replacingOccurrences(of: "'", with: "")
            .replacingOccurrences(of: "’", with: "")
            .replacingOccurrences(of: "&", with: " and ")
        var words = folded.split { !$0.isLetter && !$0.isNumber }.map(String.init)
        // "ShopRite of Hoboken": the town is which branch, not which shop.
        if let of = words.firstIndex(of: "of"), of > 0 { words = Array(words[..<of]) }
        let kept = words.filter { !generic.contains($0) }
        // A name that is nothing but grocer's words ("The Food Market") is matched as it stands.
        return (kept.isEmpty ? words : kept).joined(separator: " ")
    }

    /// The same shop: the same key, or one key the start of the other ("kings" and "kings hoboken").
    static func same(_ a: String, _ b: String) -> Bool {
        let ka = key(a), kb = key(b)
        guard !ka.isEmpty, !kb.isEmpty else { return false }
        return ka == kb || ka.hasPrefix(kb + " ") || kb.hasPrefix(ka + " ")
    }

    /**
     Apple files a wine shop, a tobacconist and a soup kitchen as food markets too; nobody does a
     big shop there. What this misses, the household hides from the map by hand (`HiddenPlace`).
     */
    static func notGrocer(_ name: String) -> Bool {
        let lowered = name.lowercased()
        let words = Set(lowered.split { !$0.isLetter }.map(String.init))
        if !words.isDisjoint(with: ["liquor", "liquors", "wine", "wines", "spirits", "beer", "beers",
                                    "cigar", "cigars", "smoke", "smokes", "vape", "tobacco",
                                    "shelter", "ministry", "ministries", "church"]) {
            return true
        }
        return ["soup kitchen", "food bank", "community fridge", "food pantry"].contains { lowered.contains($0) }
    }

    /// The household's shop a place is, if it is one — the one priced most lately when two match.
    static func shop(named name: String, in shops: [StorePrices]) -> StorePrices? {
        shops.filter { same($0.name, name) }
            .max { ($0.lastPricedOn ?? "") < ($1.lastPricedOn ?? "") }
    }
}

/// The words the store map is written in.
enum StoreWords {
    /// "≈ $42 for 12 of 18 things on your list", or what is missing for there to be one.
    static func list(_ shop: StorePrices) -> String {
        if shop.listCount == 0 { return "Nothing on your list to price" }
        if shop.listPriced == 0 { return "No prices here for anything on your list" }
        let things = shop.listCount == 1 ? "thing" : "things"
        return "\(Money.about(shop.listTotal)) for \(shop.listPriced) of \(shop.listCount) \(things) on your list"
    }

    /// "23 prices from 3 households · last Oct 18", or that there are none yet.
    static func priced(_ shop: StorePrices) -> String {
        guard !shop.prices.isEmpty else { return "No prices yet" }
        var words = "\(shop.prices.count) \(shop.prices.count == 1 ? "price" : "prices")"
        if shop.households > 1 {
            words += " from \(shop.households) households"
        } else if !shop.yours {
            words += " from another household"
        }
        guard let day = ReceiptWords.day(shop.lastPricedOn) else { return words }
        return "\(words) · last \(day)"
    }

    /// "Twinings, 20 bags · Oct 18 · on sale · yours" — under a price in a shop's list. "yours" only
    /// where others have prices there too; at a shop only you have priced, every one would say it.
    static func detail(_ price: StoreItemPrice, sayYours: Bool = true) -> String? {
        let parts = [
            ReceiptWords.what(brand: price.brand, quantity: price.quantity, unit: price.unit),
            ReceiptWords.day(price.observedOn),
            price.onSale ? "on sale" : nil,
            sayYours && price.yours ? "yours" : nil,
        ].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// "0.4 mi", "650 ft", "1.2 km", "300 m" — in the phone's own units, as Maps says them.
    static func distance(_ metres: Double) -> String {
        let here = Measurement(value: metres, unit: UnitLength.meters)
        let (value, unit, places): (Double, UnitLength, Int)
        if Locale.current.measurementSystem == .us {
            let miles = here.converted(to: .miles).value
            // Under a tenth of a mile Maps counts feet, to the nearest ten.
            (value, unit, places) = miles < 0.1
                ? ((here.converted(to: .feet).value / 10).rounded() * 10, .feet, 0)
                : (miles, .miles, 1)
        } else {
            (value, unit, places) = metres < 1000 ? ((metres / 10).rounded() * 10, .meters, 0)
                : (here.converted(to: .kilometers).value, .kilometers, 1)
        }
        return Measurement(value: value, unit: unit).formatted(
            .measurement(width: .abbreviated, usage: .asProvided, numberFormatStyle: .number.precision(.fractionLength(places))))
    }
}
