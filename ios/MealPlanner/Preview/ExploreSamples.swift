import Foundation

/// Global recipes as the mockup's 5.2 shows them: three from other households, one kept already,
/// and one this house published itself.
extension SampleData {
    static let published: [Recipe] = [
        Recipe(
            id: UUID(), name: "Weeknight ramen", description: nil,
            instructions: "Boil the eggs for 6 minutes.\nWhisk the miso into hot stock.\nCook the noodles in it and top with the eggs and spring onions.",
            prepTimeMinutes: 10, cookTimeMinutes: 15, servings: 2, section: nil, categories: [],
            shared: true, ownerName: "Uni flat", coverImageId: nil, photoIds: nil,
            ingredients: [
                RecipeIngredient(id: UUID(), ingredientName: "ramen noodles", quantity: 2, unit: "packs", notes: nil, optional: false),
                RecipeIngredient(id: UUID(), ingredientName: "miso paste", quantity: 1, unit: "tbsp", notes: nil, optional: false),
                RecipeIngredient(id: UUID(), ingredientName: "soft boiled eggs", quantity: 2, unit: nil, notes: nil, optional: false),
                RecipeIngredient(id: UUID(), ingredientName: "spring onions", quantity: 2, unit: nil, notes: nil, optional: true),
            ],
            published: true
        ),
        Recipe(
            id: UUID(), name: "Lemon herb chicken", description: nil, instructions: "Marinate.\nRoast at 200°C.",
            prepTimeMinutes: 10, cookTimeMinutes: 35, servings: 4, section: .dinner, categories: [],
            shared: false, ownerName: nil, coverImageId: nil, photoIds: nil, ingredients: [], published: true
        ),
        Recipe(
            id: UUID(), name: "Raspberry muffins", description: nil, instructions: nil,
            prepTimeMinutes: 15, cookTimeMinutes: 25, servings: 12, section: .snacks, categories: [],
            shared: true, ownerName: "Beach crew", coverImageId: nil, photoIds: nil, ingredients: [], published: true
        ),
        Recipe(
            id: UUID(), name: "Green goddess bowl", description: nil, instructions: nil,
            prepTimeMinutes: 15, cookTimeMinutes: 10, servings: 2, section: nil, categories: [],
            shared: true, ownerName: "The Parks", coverImageId: nil, photoIds: nil, ingredients: [], published: true
        ),
    ]
}
