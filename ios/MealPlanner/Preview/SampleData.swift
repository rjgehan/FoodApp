import Foundation

/// Sample state, so every screen can be looked at — in an Xcode canvas or in the Gallery tab —
/// without a backend, a household, or a signed-in person. These are shapes, not fixtures: the
/// e2e suite in `e2e/` is what checks the real thing.
enum SampleData {
    static let household = HouseholdSummary(id: UUID(), name: "Gehan House", memberCount: 3)

    static var plan: [MealPlanEntry] {
        let today = Date()
        func on(_ offset: Int, _ meal: MealType, _ name: String) -> MealPlanEntry {
            MealPlanEntry(
                id: UUID(),
                date: Day.iso(Day.adding(offset, to: today)),
                mealType: meal,
                recipeId: UUID(),
                recipeName: name,
                placeName: nil,
                itemName: nil,
                time: nil,
                servings: 4
            )
        }
        return [
            on(0, .breakfast, "Full English Breakfast"),
            on(0, .dinner, "Tuna Nicoise"),
            on(1, .dinner, "Lasagne"),
            on(2, .lunch, "Grilled Mac and Cheese Sandwich"),
            on(2, .dinner, "Chicken Parmentier"),
            on(4, .dinner, "Beef Wellington"),
            on(5, .dinner, "Honey Teriyaki Salmon"),
        ]
    }

    static let categories: [GroceryCategory] = [
        GroceryCategory(id: produce, name: "Produce"),
        GroceryCategory(id: dairy, name: "Dairy & eggs"),
        GroceryCategory(id: dryGoods, name: "Dry goods"),
    ]

    private static let produce = UUID()
    private static let dairy = UUID()
    private static let dryGoods = UUID()

    static let groceries: [GroceryItem] = [
        GroceryItem(id: UUID(), name: "carrots", quantity: 4, unit: nil, checked: false, checkedByName: nil, categoryId: produce, inCupboard: false),
        GroceryItem(id: UUID(), name: "celery", quantity: 3, unit: nil, checked: false, checkedByName: nil, categoryId: produce, inCupboard: false),
        GroceryItem(id: UUID(), name: "shallots", quantity: 7, unit: nil, checked: false, checkedByName: nil, categoryId: produce, inCupboard: false),
        GroceryItem(id: UUID(), name: "butter", quantity: 30, unit: "g", checked: false, checkedByName: nil, categoryId: dairy, inCupboard: true),
        GroceryItem(id: UUID(), name: "gruyere cheese", quantity: 50, unit: "g", checked: false, checkedByName: nil, categoryId: dairy, inCupboard: false),
        GroceryItem(id: UUID(), name: "tinned tomatoes", quantity: 400, unit: "g", checked: false, checkedByName: nil, categoryId: dryGoods, inCupboard: false),
        GroceryItem(id: UUID(), name: "paper towels", quantity: nil, unit: nil, checked: false, checkedByName: nil, categoryId: nil, inCupboard: false),
        GroceryItem(id: UUID(), name: "chicken stock", quantity: 350, unit: "ml", checked: true, checkedByName: "Maya", categoryId: dryGoods, inCupboard: false),
    ]

    static let recipes: [Recipe] = [
        Recipe(
            id: UUID(),
            name: "Chicken Parmentier",
            description: "France · Chicken",
            prepTimeMinutes: 29,
            cookTimeMinutes: 26,
            servings: 4,
            section: .dinner,
            categories: ["Chicken"],
            shared: false,
            ownerName: nil,
            coverImageId: nil,
            ingredients: [
                RecipeIngredient(id: UUID(), ingredientName: "potatoes", quantity: 1.5, unit: "kg", notes: nil, optional: false),
                RecipeIngredient(id: UUID(), ingredientName: "butter", quantity: 30, unit: "g", notes: nil, optional: false),
                RecipeIngredient(id: UUID(), ingredientName: "double cream", quantity: 5, unit: "tbsp", notes: nil, optional: false),
                RecipeIngredient(id: UUID(), ingredientName: "chicken", quantity: 600, unit: "g", notes: nil, optional: false),
                RecipeIngredient(id: UUID(), ingredientName: "parsley", quantity: 2, unit: "tbsp", notes: nil, optional: true),
            ]
        ),
        Recipe(
            id: UUID(),
            name: "Lasagne",
            description: "Italian · Pasta",
            prepTimeMinutes: 20,
            cookTimeMinutes: 45,
            servings: 6,
            section: .dinner,
            categories: ["Full meal"],
            shared: false,
            ownerName: nil,
            coverImageId: nil,
            ingredients: [
                RecipeIngredient(id: UUID(), ingredientName: "lasagne sheets", quantity: 250, unit: "g", notes: nil, optional: false),
                RecipeIngredient(id: UUID(), ingredientName: "beef mince", quantity: 500, unit: "g", notes: nil, optional: false),
            ]
        ),
        Recipe(
            id: UUID(),
            name: "Katsu Chicken curry",
            description: "Japanese · Chicken",
            prepTimeMinutes: 15,
            cookTimeMinutes: 30,
            servings: 4,
            section: .dinner,
            categories: [],
            shared: true,
            ownerName: "The Wilsons",
            coverImageId: nil,
            ingredients: []
        ),
    ]
}

extension Session {
    /// A signed-in session that never talks to a server, for previews and the Gallery.
    static var preview: Session {
        let session = Session()
        session.token = "preview"
        session.displayName = "Ryan"
        session.household = SampleData.household
        return session
    }
}
