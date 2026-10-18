import Foundation

/// The household pages' sample data: the mockup's people, places and aisles.
extension SampleData {
    /// Who's here, as the mockup has them: you (the owner, by email), Jo (email), Sam and Nana
    /// (a PIN each).
    static let people: [HouseholdMember] = [
        HouseholdMember(userId: me.userId, username: "ryan", displayName: "Ryan", role: "OWNER", pinSet: true, hasEmail: true, hasPassword: true),
        HouseholdMember(userId: UUID(), username: "jo", displayName: "Jo", role: "MEMBER", pinSet: false, hasEmail: true, hasPassword: true),
        HouseholdMember(userId: UUID(), username: "sam", displayName: "Sam", role: "MEMBER", pinSet: true, hasEmail: false, hasPassword: false),
        HouseholdMember(userId: UUID(), username: "nana", displayName: "Nana", role: "MEMBER", pinSet: true, hasEmail: false, hasPassword: false),
    ]

    static let places: [Place] = [
        Place(id: UUID(), name: "Sakura Sushi", menuUrl: "https://example.com/sakura", phone: "555 0101",
              notes: "Salmon set for Jo, gyoza x2, no wasabi for Nana", imageId: nil),
        Place(id: UUID(), name: "Luigi's Pizza", menuUrl: "https://example.com/luigi", phone: "555 0102",
              notes: "Large margherita + garlic knots. Call, don't use app.", imageId: nil),
        Place(id: UUID(), name: "Taco truck (Tuesdays)", menuUrl: nil, phone: "555 0103", notes: "Cash only", imageId: nil),
        Place(id: UUID(), name: "Golden Wok", menuUrl: "https://example.com/wok", phone: nil, notes: nil, imageId: nil),
    ]

    /// A house just made: no machines yet, the Plan on, no cupboard, the kitchen questions still
    /// to answer — what the kitchen setup and its card on Recipes start from.
    static let newHousehold = HouseholdSummary(id: UUID(), name: "Beach crew", memberCount: 1, role: "OWNER",
                                               cupboardEnabled: false, planEnabled: true, machines: [],
                                               kitchenSetUp: false)

    /// A house that has answered: four machines, the Plan off, the cupboard on — Kitchen & features.
    static let kitchenHousehold = HouseholdSummary(id: UUID(), name: "Gehan House", memberCount: 3,
                                                   defaultServings: 4, planningHorizonDays: 7, role: "OWNER",
                                                   cupboardEnabled: true, planEnabled: false,
                                                   machines: ["oven", "stovetop", "air-fryer", "blender"],
                                                   kitchenSetUp: true)

    /// The mockup's eleven, in the order it walks the shop.
    static let storeAisles: [GroceryCategory] = [
        "Produce", "Bakery", "Meat & fish", "Dairy & eggs", "Tins & jars", "Pasta & rice", "Spices", "Frozen",
        "Snacks", "Drinks", "Household",
    ].map { GroceryCategory(id: UUID(), name: $0) }
}
