import Foundation

/*
 Receipts and prices, on the wire. The phone only reads the words off a receipt; the server turns
 them into a draft (shop, date, lines, prices, the ingredient each line probably is), the phone
 shows it to be checked, and the checked receipt goes back to be saved. Field names match the
 backend's DTOs exactly, as everywhere else in Models.swift.
 */

/// Whether a line on a receipt is something to eat — and so worth a price — or a bag fee.
enum ReceiptLineKind: String, Codable, CaseIterable, Hashable {
    case item = "ITEM"
    case notFood = "NOT_FOOD"

    /// A kind this build has never heard of reads as a thing bought, rather than the whole
    /// receipt failing to load on a phone that has not been updated.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ReceiptLineKind(rawValue: raw) ?? .item
    }
}

/**
 One line of a receipt: what it said, what was paid for it after its discounts, and — when it was
 weighed or counted — how much at what each ("1.32 lb @ $2.99"). The same shape comes back in a
 draft and in a saved receipt; on a draft the ingredient is the server's guess.
 */
struct ReceiptLine: Codable, Hashable {
    var text: String
    var kind: ReceiptLineKind
    var quantity: Double?
    var unit: String?
    var unitPrice: Double?
    var price: Double
    var onSale: Bool
    var ingredientId: UUID?
    var ingredientName: String?
    /// Who made it ("Twinings"). What it counts as stays the thing itself: english breakfast tea.
    var brand: String?

    init(text: String, kind: ReceiptLineKind = .item, quantity: Double? = nil, unit: String? = nil,
         unitPrice: Double? = nil, price: Double, onSale: Bool = false, ingredientId: UUID? = nil,
         ingredientName: String? = nil, brand: String? = nil) {
        self.text = text
        self.kind = kind
        self.quantity = quantity
        self.unit = unit
        self.unitPrice = unitPrice
        self.price = price
        self.onSale = onSale
        self.ingredientId = ingredientId
        self.ingredientName = ingredientName
        self.brand = brand
    }

    /// Forgiving: a line missing its kind, its sale flag or even its price still shows, to be
    /// put right on the review screen, rather than losing the whole receipt.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        kind = try c.decodeIfPresent(ReceiptLineKind.self, forKey: .kind) ?? .item
        quantity = try c.decodeIfPresent(Double.self, forKey: .quantity)
        unit = try c.decodeIfPresent(String.self, forKey: .unit)
        unitPrice = try c.decodeIfPresent(Double.self, forKey: .unitPrice)
        price = try c.decodeIfPresent(Double.self, forKey: .price) ?? 0
        onSale = try c.decodeIfPresent(Bool.self, forKey: .onSale) ?? false
        ingredientId = try c.decodeIfPresent(UUID.self, forKey: .ingredientId)
        ingredientName = try c.decodeIfPresent(String.self, forKey: .ingredientName)
        brand = try c.decodeIfPresent(String.self, forKey: .brand)
    }

    /// The name the price will be kept under, if it will be kept: a food line with an ingredient.
    var countsAs: String? {
        guard kind == .item, let name = ingredientName?.trimmingCharacters(in: .whitespaces), !name.isEmpty
        else { return nil }
        return name
    }

    /// "1.32 lb @ $2.99/lb", "2 @ $1.99" — or nil for one of something at its price.
    var weighed: String? {
        guard let amount = ReceiptWords.amount(quantity: quantity, unit: unit) else { return nil }
        guard let unitPrice else { return amount }
        let per = unit.map { "/\($0)" } ?? ""
        return "\(amount) @ \(Money.text(unitPrice))\(per)"
    }

    /**
     A line from words the server could not read — "KNGS ARTSN BRD 4.Z9 F" — to be put right by
     hand: its last amount, if one can be made out, as the price, and the words before it.
     */
    static func fromUnread(_ words: String) -> ReceiptLine {
        let pattern = #"\s*-?\$?(\d{1,4}[.,]\s?\d{2})-?(\s+[A-Z*$]{1,2})*\s*$"#
        guard let range = words.range(of: pattern, options: .regularExpression) else {
            return ReceiptLine(text: words.trimmingCharacters(in: .whitespaces), price: 0)
        }
        let amount = words[range].filter { $0.isNumber || $0 == "." || $0 == "," }.replacingOccurrences(of: ",", with: ".")
        let text = words[..<range.lowerBound].trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: #"^\d{4,14}\s+"#, with: "", options: .regularExpression)
        return ReceiptLine(text: text.isEmpty ? words : text, price: Double(amount) ?? 0)
    }

    /// "Twinings · 20 bags", "1.32 lb @ $0.69/lb" — under the line's words, or nil.
    var detail: String? {
        let brand = brand?.trimmingCharacters(in: .whitespaces)
        let parts = [brand?.isEmpty == false ? brand : nil, weighed].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /**
     As `POST /receipts` wants it. Held to the server's limits (text and name 200, unit 20, brand
     60, a quantity above zero, nothing below zero), since none of those can be put right on the review
     screen and one bad line would refuse the whole receipt. The unit price keeps its third place
     ("3 for $1" is 0.333 each); the price itself is to the cent.
     */
    var body: [String: Any] {
        var out: [String: Any] = [
            "text": String(text.prefix(200)),
            "kind": kind.rawValue,
            "price": Money.json(max(price, 0)),
            "onSale": onSale,
        ]
        if let quantity, quantity > 0 { out["quantity"] = Money.decimal(quantity) }
        if let unit = unit?.trimmingCharacters(in: .whitespaces), !unit.isEmpty { out["unit"] = String(unit.prefix(20)) }
        if let unitPrice, unitPrice >= 0 { out["unitPrice"] = Money.decimal(unitPrice) }
        if kind == .item {
            if let ingredientId { out["ingredientId"] = ingredientId.uuidString }
            if let name = countsAs { out["ingredientName"] = String(name.prefix(200)) }
            if let brand = brand?.trimmingCharacters(in: .whitespaces), !brand.isEmpty {
                out["brand"] = String(brand.prefix(60))
            }
        }
        return out
    }
}

/**
 What the server read off a receipt's words, before anything is saved: the shop (and the
 household's own record of it, if it has one), the day, the totals, the lines, and the words it
 could not make sense of. `sumMatches` is whether the lines add up to the subtotal (nil with no
 subtotal), and `duplicateOf` a receipt already saved with the same barcode.
 */
struct ReceiptDraft: Codable, Hashable {
    var storeName: String?
    var storeId: UUID?
    /// `YYYY-MM-DD`.
    var purchasedOn: String?
    var subtotal: Double?
    var tax: Double?
    var total: Double?
    var sumMatches: Bool?
    var duplicateOf: UUID?
    var lines: [ReceiptLine]
    var unreadLines: [String]?
}

/// A saved receipt in the list: "Kings Food Markets · Oct 18 · $86.40 · 23 priced".
struct ReceiptSummary: Codable, Identifiable, Hashable {
    let id: UUID
    let storeName: String?
    /// `YYYY-MM-DD`.
    let purchasedOn: String?
    let total: Double?
    let itemCount: Int?
    let pricedCount: Int?
    /// An ISO instant.
    let createdAt: String?

    /// "Oct 18 · $86.40 · 23 priced".
    var line: String {
        let parts: [String?] = [
            ReceiptWords.day(purchasedOn ?? createdAt),
            total.map(Money.text),
            pricedCount.map { "\($0) priced" },
        ]
        return parts.compactMap { $0 }.joined(separator: " · ")
    }
}

/// A saved receipt with its lines, as `POST /receipts` answers and `GET /receipts/{id}` reads it.
struct ReceiptResponse: Codable, Identifiable, Hashable {
    let id: UUID
    let storeName: String?
    let purchasedOn: String?
    let total: Double?
    let itemCount: Int?
    let pricedCount: Int?
    let lines: [ReceiptLine]
    let createdAt: String?
    /// Not promised by every server; shown when they come.
    var subtotal: Double? = nil
    var tax: Double? = nil
    /// The scanned pages, kept with it (none on a receipt from before they were).
    var photoIds: [UUID]? = nil
}

/// One of the household's own shops, named as its receipts head them.
struct Shop: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
}

/**
 Something a receipt line can count as: a name, and the household's ingredient behind it when
 there is one. Offered on the review screen from the grocery list (ticked rows included) and from
 the server's own guesses; a name typed fresh has no id, and the server makes the ingredient.
 */
struct IngredientChoice: Hashable {
    let name: String
    var ingredientId: UUID?
}

extension APIClient {
    /// The words off a receipt, top to bottom, read into a draft. Saves nothing.
    func readReceipt(household: UUID, lines: [String], barcode: String?) async throws -> ReceiptDraft {
        var body: [String: Any] = ["lines": lines]
        if let barcode, !barcode.isEmpty { body["barcode"] = barcode }
        return try await send("POST", "/api/households/\(household.uuidString)/receipts/read", body: body)
    }

    /**
     Saves a checked receipt (`ReceiptReviewView.request(withBarcode:)` builds the body). Every
     food line with an ingredient becomes that ingredient's price for the day. 409 with
     `duplicateOf` when its barcode was saved before — `APIError.duplicateReceipt`.
     */
    func saveReceipt(household: UUID, body: [String: Any]) async throws -> ReceiptResponse {
        try await send("POST", "/api/households/\(household.uuidString)/receipts", body: body)
    }

    /// Newest first.
    func receipts(household: UUID) async throws -> [ReceiptSummary] {
        try await get("/api/households/\(household.uuidString)/receipts")
    }

    func receipt(household: UUID, id: UUID) async throws -> ReceiptResponse {
        try await get("/api/households/\(household.uuidString)/receipts/\(id.uuidString)")
    }

    /// The receipt goes, and every price it saved goes with it.
    func deleteReceipt(household: UUID, id: UUID) async throws {
        _ = try await sendNoContent("DELETE", "/api/households/\(household.uuidString)/receipts/\(id.uuidString)")
    }

    /// The household's shops, for the review screen's shop name.
    func shops(household: UUID) async throws -> [Shop] {
        try await get("/api/households/\(household.uuidString)/stores")
    }

    /// What one thing last cost at each shop the household has bought it from, newest first. A price
    /// typed in without a shop comes back as one more entry, with no `storeName`.
    func pricesByShop(household: UUID, ingredient: UUID) async throws -> [LastPrice] {
        try await get("/api/households/\(household.uuidString)/ingredients/\(ingredient.uuidString)/prices")
    }

    /**
     A price typed in by hand for a grocery row's ingredient, as of today: for how much of it and
     whose make, when somebody said. The row comes back with its new `lastPrice`. A row with no
     ingredient behind it cannot have one (400).
     */
    @discardableResult
    func setPrice(household: UUID, item: UUID, price: Double, quantity: Double? = nil, unit: String? = nil,
                  storeName: String? = nil, brand: String? = nil) async throws -> GroceryItem {
        var body: [String: Any] = ["price": Money.json(price)]
        if let quantity, quantity > 0 { body["quantity"] = Money.decimal(quantity) }
        if let unit, !unit.isEmpty { body["unit"] = String(unit.prefix(20)) }
        if let storeName, !storeName.isEmpty { body["storeName"] = storeName }
        if let brand, !brand.isEmpty { body["brand"] = String(brand.prefix(60)) }
        return try await send("PUT", "/api/households/\(household.uuidString)/grocery-list/items/\(item.uuidString)/price",
                              body: body)
    }
}

extension APIError {
    /// Saving was refused because a receipt with this barcode is saved already: that one's id.
    var duplicateReceipt: UUID? {
        struct Body: Decodable { let duplicateOf: UUID? }
        guard status == 409, let data = body.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(Body.self, from: data) else { return nil }
        return decoded.duplicateOf
    }
}
