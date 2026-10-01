import Foundation

/// The mockup's own groceries and cupboard (section 04), for previews and the Gallery: the same
/// lemons, chicken thighs and chickpeas the designer drew, so a screenshot compares like for like.
extension SampleData {
    private static let produceAisle = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000001")!
    private static let meatAisle = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000002")!
    private static let dairyAisle = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000003")!
    private static let bakeryAisle = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000004")!
    private static let tinsAisle = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000005")!
    private static let frozenAisle = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000006")!
    private static let householdAisle = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000007")!
    private static let spicesAisle = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000008")!

    private static let onions = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000101")!
    private static let thighs = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000102")!
    private static let paprika = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000103")!
    private static let lemons = UUID(uuidString: "0D5A0000-0000-4000-8000-000000000104")!

    static let aisles: [GroceryCategory] = [
        GroceryCategory(id: produceAisle, name: "Produce"),
        GroceryCategory(id: meatAisle, name: "Meat & fish"),
        GroceryCategory(id: dairyAisle, name: "Dairy"),
        GroceryCategory(id: bakeryAisle, name: "Bakery"),
        GroceryCategory(id: tinsAisle, name: "Tins & jars"),
        GroceryCategory(id: frozenAisle, name: "Frozen"),
        GroceryCategory(id: householdAisle, name: "Household"),
        GroceryCategory(id: spicesAisle, name: "Spices"),
    ]

    static let groceriesMockup: [GroceryItem] = [
        GroceryItem(id: UUID(), ingredientId: lemons, name: "lemons", quantity: 3, unit: nil, checked: false, checkedByName: nil,
                    categoryId: produceAisle, inCupboard: false, fromRecipes: ["Lemon herb chicken", "Green salad"]),
        GroceryItem(id: UUID(), ingredientId: UUID(), name: "baby spinach", quantity: 1, unit: "bag", checked: false, checkedByName: nil,
                    categoryId: produceAisle, inCupboard: false, fromRecipes: ["Green salad"]),
        GroceryItem(id: UUID(), ingredientId: onions, name: "onions", quantity: 2, unit: nil, checked: false, checkedByName: nil,
                    categoryId: produceAisle, inCupboard: true, fromRecipes: ["Chili", "Cornbread"]),
        GroceryItem(id: UUID(), ingredientId: UUID(), name: "bananas", quantity: nil, unit: nil, checked: true, checkedByName: "Jo",
                    categoryId: produceAisle, inCupboard: false, addedByName: "Jo"),
        GroceryItem(id: UUID(), ingredientId: thighs, name: "chicken thighs", quantity: 2, unit: "lb", checked: false, checkedByName: nil,
                    categoryId: meatAisle, inCupboard: false, fromRecipes: ["Lemon herb chicken"]),
        GroceryItem(id: UUID(), ingredientId: UUID(), name: "ground beef", quantity: 1, unit: "lb", checked: false, checkedByName: nil,
                    categoryId: meatAisle, inCupboard: false, fromRecipes: ["Slow cooker chili"]),
        GroceryItem(id: UUID(), ingredientId: UUID(), name: "kidney beans (tin)", quantity: 2, unit: nil, checked: false, checkedByName: nil,
                    categoryId: tinsAisle, inCupboard: false, fromRecipes: ["Slow cooker chili"]),
        GroceryItem(id: UUID(), ingredientId: UUID(), name: "oat milk", quantity: 1, unit: nil, checked: true, checkedByName: "Ryan",
                    categoryId: dairyAisle, inCupboard: false, addedByName: "Ryan"),
    ]

    static let groceryReminders: [RestockReminder] = [
        RestockReminder(ingredientId: thighs, name: "chicken thighs", everyDays: 14,
                        lastBoughtAt: "2026-09-29T10:00:00Z", dueAt: "2026-10-13T10:00:00Z", snoozedUntil: nil, due: false),
        RestockReminder(ingredientId: paprika, name: "smoked paprika", everyDays: 28,
                        lastBoughtAt: "2026-09-15T10:00:00Z", dueAt: "2026-10-13T10:00:00Z", snoozedUntil: nil, due: false),
    ]

    static let cupboardMockup: [CupboardItem] = [
        CupboardItem(id: UUID(), name: "Chickpeas (tin)", runningLow: false, staple: false, categoryId: tinsAisle, onList: false,
                     quantity: 3, unit: "tins", ingredientId: UUID()),
        CupboardItem(id: UUID(), name: "Tomato passata", runningLow: true, staple: false, categoryId: tinsAisle, onList: false,
                     quantity: nil, unit: nil, ingredientId: UUID()),
        CupboardItem(id: UUID(), name: "Peanut butter", runningLow: false, staple: false, categoryId: tinsAisle, onList: false,
                     quantity: nil, unit: nil, ingredientId: UUID()),
        CupboardItem(id: UUID(), name: "Olive oil", runningLow: false, staple: true, categoryId: spicesAisle, onList: false,
                     quantity: nil, unit: nil, ingredientId: UUID()),
        CupboardItem(id: UUID(), name: "Smoked paprika", runningLow: false, staple: false, categoryId: spicesAisle, onList: false,
                     quantity: nil, unit: nil, ingredientId: paprika),
        CupboardItem(id: UUID(), name: "Cumin", runningLow: false, staple: false, categoryId: spicesAisle, onList: false,
                     quantity: nil, unit: nil, ingredientId: UUID()),
        CupboardItem(id: UUID(), name: "Tahini sauce (bottle)", runningLow: true, staple: false, categoryId: tinsAisle, onList: false,
                     quantity: nil, unit: nil, ingredientId: UUID()),
        CupboardItem(id: UUID(), name: "Onions", runningLow: false, staple: false, categoryId: produceAisle, onList: true,
                     quantity: 1, unit: nil, ingredientId: onions),
    ]
}
