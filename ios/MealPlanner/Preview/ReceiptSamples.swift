import Foundation

/// A Saturday shop at Kings, for previews, the Gallery and the receipt debug screens: the words a
/// scan reads off it, the draft the server makes of them, and the list of saved receipts.
extension SampleData {
    private static let kings = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000201")!
    private static let lemonsId = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000104")!
    private static let thighsId = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000102")!
    private static let bananasId = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000202")!
    private static let spinachId = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000203")!
    private static let beefId = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000204")!
    private static let oatMilkId = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000205")!

    /// The receipt's words as the scanner hands them to the server, a visual row per line.
    static let receiptText: [String] = [
        "KINGS FOOD MARKETS",
        "Hoboken NJ 07030",
        "(201) 555-0142",
        "10/18/26 5:42 PM",
        "BANANAS",
        "1.32 lb @ 0.69 /lb 0.91 F",
        // A count, like a weight, is printed on its own line under the item.
        "ORGANIC LEMONS",
        "2 @ 0.99 1.98 F",
        "KNGS BABY SPINACH 5OZ 3.99 F",
        "BELL&EVANS THIGHS",
        "1.84 lb @ 6.99 /lb 12.86 F",
        "GROUND BEEF 85% 7.99 F",
        "CARD SAVINGS 0.50-",
        "OATLY OAT MILK 5.49 F",
        "SOURDOUGH BOULE 6.99 F",
        // A smudged price the reader cannot make out: the check screen's + puts it on.
        "KNGS ARTSN BRD 4.Z9 F",
        "BAG FEE 0.10 T",
        "SUBTOTAL 44.10",
        "TAX 0.01",
        "TOTAL 44.11",
        "VISA ****4417 44.11",
        "THANK YOU FOR SHOPPING KINGS",
    ]

    static let receiptLines: [ReceiptLine] = [
        ReceiptLine(text: "BANANAS", quantity: 1.32, unit: "lb", unitPrice: 0.69, price: 0.91,
                    ingredientId: bananasId, ingredientName: "bananas"),
        ReceiptLine(text: "ORGANIC LEMONS", quantity: 2, unitPrice: 0.99, price: 1.98,
                    ingredientId: lemonsId, ingredientName: "lemons"),
        // The size off its name, as the server reads it.
        ReceiptLine(text: "KNGS BABY SPINACH 5OZ", quantity: 5, unit: "oz", price: 3.99, ingredientId: spinachId,
                    ingredientName: "baby spinach"),
        ReceiptLine(text: "BELL&EVANS THIGHS", quantity: 1.84, unit: "lb", unitPrice: 6.99, price: 12.86,
                    ingredientId: thighsId, ingredientName: "chicken thighs"),
        ReceiptLine(text: "GROUND BEEF 85%", price: 7.49, onSale: true, ingredientId: beefId, ingredientName: "ground beef"),
        // Its brand remembered from the last receipt that said OATLY OAT MILK.
        ReceiptLine(text: "OATLY OAT MILK", price: 5.49, ingredientId: oatMilkId, ingredientName: "oat milk",
                    brand: "Oatly"),
        ReceiptLine(text: "SOURDOUGH BOULE", price: 6.99),
        ReceiptLine(text: "BAG FEE", kind: .notFood, price: 0.10),
    ]

    /// What the server makes of `receiptText`: everything but the smudged bread, which is why it
    /// does not add up until that is put on by hand. Each guess says where it came from — the
    /// household's own words, a line put right before, or (the beef) other households' receipts.
    static let receiptDraft = ReceiptDraft(
        storeName: "Kings Food Markets", storeId: kings, purchasedOn: "2026-10-18",
        subtotal: 44.10, tax: 0.01, total: 44.11, sumMatches: false, duplicateOf: nil,
        lines: receiptDraftLines,
        unreadLines: ["KNGS ARTSN BRD 4.Z9 F"]
    )

    /// `receiptLines` as a draft has them, each guess with where it came from.
    private static let receiptDraftLines: [ReceiptLine] = {
        // bananas, lemons, spinach, thighs, beef, oat milk; nothing for the boule or the bag.
        let sources: [String] = ["MATCHED", "MATCHED", "REMEMBERED", "REMEMBERED", "OTHERS", "REMEMBERED"]
        var out: [ReceiptLine] = []
        for (index, line) in receiptLines.enumerated() {
            var drafted = line
            drafted.ingredientSource = index < sources.count ? sources[index] : nil
            out.append(drafted)
        }
        return out
    }()

    /**
     A receipt in the till's own shorthand, the way most of them really read: two lines the
     server has never seen (for Apple Intelligence to read on the phone), one it only guessed from
     other households, and the rest it knew.
     */
    static let receiptDraftShorthand = ReceiptDraft(
        storeName: "Kings Food Markets", storeId: kings, purchasedOn: "2026-10-18",
        subtotal: 33.83, tax: 0, total: 33.83, sumMatches: true, duplicateOf: nil,
        lines: [
            ReceiptLine(text: "KNGS GRK YGRT PLN", price: 5.99),
            ReceiptLine(text: "BELL&EVANS THIGHS", quantity: 1.84, unit: "lb", unitPrice: 6.99, price: 12.86,
                        ingredientId: thighsId, ingredientName: "chicken thighs", ingredientSource: "REMEMBERED"),
            ReceiptLine(text: "ORG BNNS", quantity: 1.32, unit: "lb", unitPrice: 0.69, price: 0.91,
                        ingredientId: bananasId, ingredientName: "bananas", ingredientSource: "OTHERS"),
            ReceiptLine(text: "STNYFLD WHL MLK", price: 4.49),
            ReceiptLine(text: "KNGS BBY SPNCH 5OZ", quantity: 5, unit: "oz", price: 3.99, ingredientId: spinachId,
                        ingredientName: "baby spinach", ingredientSource: "MATCHED"),
            ReceiptLine(text: "OATLY OAT MILK", price: 5.49, ingredientId: oatMilkId, ingredientName: "oat milk",
                        brand: "Oatly", ingredientSource: "REMEMBERED"),
            ReceiptLine(text: "BAG FEE", kind: .notFood, price: 0.10),
        ],
        unreadLines: []
    )

    /// The same shop with the thighs misread as $18.86, so the lines no longer add up.
    static let receiptDraftMismatch: ReceiptDraft = {
        var draft = receiptDraft
        draft.lines[3].price = 18.86
        draft.sumMatches = false
        return draft
    }()

    /// What a line can count as: the mockup's grocery list.
    static let receiptChoices: [IngredientChoice] = groceriesMockup.map {
        IngredientChoice(name: $0.name, ingredientId: $0.ingredientId)
    }

    /// Kings' Hoboken branch, where the household shops.
    static let kingsHoboken = ShopBranch(name: "Kings Food Markets", address: "1212 Shipyard Ln",
                                         latitude: 40.7448, longitude: -74.0284)

    static let shops: [Shop] = [
        Shop(id: kings, name: "Kings Food Markets", place: kingsHoboken),
        Shop(id: UUID(), name: "ShopRite of Hoboken"),
    ]

    /// What oat milk last cost at each shop, newest first: the item sheet's "Last paid at each shop".
    static let pricesByShop: [LastPrice] = [
        LastPrice(price: 4.49, quantity: 1, unit: "carton", storeName: "Kings Food Markets",
                  observedOn: "2026-10-18", onSale: false, source: "RECEIPT", brand: "Oatly"),
        LastPrice(price: 4.19, storeName: nil, observedOn: "2026-10-12", onSale: false, source: "MANUAL"),
        LastPrice(price: 3.79, quantity: 1, unit: "carton", storeName: "ShopRite of Hoboken",
                  observedOn: "2026-10-04", onSale: true, source: "RECEIPT", brand: "Califia"),
    ]

    static let receipts: [ReceiptSummary] = [
        ReceiptSummary(id: UUID(uuidString: "0D5A0000-0000-4000-8000-000000000301")!, storeName: "Kings Food Markets",
                       purchasedOn: "2026-10-18", total: 39.82, itemCount: 8, pricedCount: 6,
                       createdAt: "2026-10-18T21:50:00Z"),
        ReceiptSummary(id: UUID(), storeName: "Kings Food Markets", purchasedOn: "2026-10-11", total: 86.40,
                       itemCount: 27, pricedCount: 23, createdAt: "2026-10-11T19:02:00Z"),
        ReceiptSummary(id: UUID(), storeName: "ShopRite of Hoboken", purchasedOn: "2026-10-04", total: 52.17,
                       itemCount: 14, pricedCount: 11, createdAt: "2026-10-04T16:30:00Z"),
    ]

    static let receiptDetail = ReceiptResponse(
        id: UUID(uuidString: "0D5A0000-0000-4000-8000-000000000301")!, storeName: "Kings Food Markets",
        purchasedOn: "2026-10-18", total: 39.82, itemCount: 8, pricedCount: 6, lines: receiptLines,
        createdAt: "2026-10-18T21:50:00Z", subtotal: 39.81, tax: 0.01, place: kingsHoboken
    )

    /// The mockup's list as it reads once a receipt has priced most of it.
    static let groceriesPriced: [GroceryItem] = groceriesMockup.enumerated().map { index, item in
        var priced = item
        // lemons, spinach, onions, bananas, thighs, beef, beans, oat milk
        let prices: [Double?] = [1.98, 3.99, nil, 0.91, 12.86, 7.49, nil, 5.49]
        if index < prices.count, let price = prices[index] {
            priced.lastPrice = LastPrice(price: price, storeName: "Kings Food Markets", observedOn: "2026-10-18",
                                         onSale: index == 5, source: "RECEIPT")
        }
        return priced
    }
}
