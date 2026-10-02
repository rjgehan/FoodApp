import Foundation

/*
 The two enums of the app's Networking/Models.swift that the checked files use, as they are there.
 Models.swift itself needs the whole app (themes, colours) to compile, so the checks carry these.
*/

enum MealType: String, Codable, CaseIterable, Hashable {
    case breakfast = "BREAKFAST"
    case lunch = "LUNCH"
    case dinner = "DINNER"
    case snack = "SNACK"

    var title: String {
        switch self {
        case .breakfast: "Breakfast"
        case .lunch: "Lunch"
        case .dinner: "Dinner"
        case .snack: "Snack"
        }
    }
}

enum RecipeSection: String, Codable, CaseIterable, Hashable {
    case breakfast = "BREAKFAST"
    case lunch = "LUNCH"
    case dinner = "DINNER"
    case snacks = "SNACKS"
    case drinks = "DRINKS"
    case other = "OTHER"
}
