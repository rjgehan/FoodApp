import Foundation

/// The Meal plans screens' calls, beside them rather than in APIClient.swift — the same ones the
/// web's Meal plans pages make, plus the candidates and choices Apple Intelligence uses.
extension APIClient {
    /// Answers on a server that has meal plans; an older one says 404.
    func mealPlansStatus() async throws -> MealPlansStatus {
        try await get("/api/meal-plans")
    }

    private nonisolated func base(_ household: UUID) -> String {
        "/api/households/\(household.uuidString)/meal-plans"
    }

    /// A Codable value as the dictionary `send` takes.
    private nonisolated func json<B: Encodable>(_ value: B) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        return (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    private nonisolated func jsonList<B: Encodable>(_ value: [B]) throws -> [Any] {
        let data = try JSONEncoder().encode(value)
        return (try JSONSerialization.jsonObject(with: data) as? [Any]) ?? []
    }

    // MARK: The page

    /// The Meal plans page in one go: the cupboard teaser, filters, and plan cards (yours first).
    func mealPlansHome(household: UUID) async throws -> MealPlansHome {
        try await get(base(household))
    }

    // MARK: Cook from your cupboard

    func cupboardSetup(household: UUID) async throws -> CupboardSetup {
        try await get("\(base(household))/cupboard")
    }

    /// A draft, never saved. With `request.chosen`, the server takes each pick its rules allow.
    func cupboardPlan(household: UUID, request: CupboardPlanRequest) async throws -> CupboardPlan {
        try await send("POST", "\(base(household))/cupboard", body: json(request))
    }

    /// The next best for one slot, the rest kept; `recipeId` is the one a phone's model wants there.
    func cupboardSwap(household: UUID, setup: CupboardPlanRequest, plan: CupboardPlan, slot: SlotRef,
                      exclude: [UUID], recipeId: UUID? = nil) async throws -> CupboardPlan {
        var body: [String: Any] = [
            "setup": try json(setup.plain),
            "meals": try jsonList(plan.meals.map(\.choice)),
            "date": slot.date,
            "mealType": slot.mealType.rawValue,
            "exclude": exclude.map(\.uuidString),
        ]
        if let recipeId { body["recipeId"] = recipeId.uuidString }
        return try await send("POST", "\(base(household))/cupboard/swap", body: body)
    }

    /// What this phone's model may choose from: for the whole setup, or (with `slot`) one swap.
    func cupboardCandidates(household: UUID, setup: CupboardPlanRequest, plan: CupboardPlan? = nil,
                            slot: SlotRef? = nil, exclude: [UUID] = []) async throws -> CupboardCandidates {
        var body: [String: Any] = ["setup": try json(setup.plain), "exclude": exclude.map(\.uuidString)]
        if let plan { body["meals"] = try jsonList(plan.meals.map(\.choice)) }
        if let slot {
            body["date"] = slot.date
            body["mealType"] = slot.mealType.rawValue
        }
        return try await send("POST", "\(base(household))/cupboard/candidates", body: body)
    }

    /// Puts meals on the Plan (never over one already there) and, optionally, things on the list.
    func applyMeals(household: UUID, meals: [(date: String, meal: MealType, recipeId: UUID, servings: Int?)],
                    addToGroceries: [UUID] = []) async throws -> ApplyResult {
        let list: [[String: Any]] = meals.map { m in
            var one: [String: Any] = ["date": m.date, "mealType": m.meal.rawValue, "recipeId": m.recipeId.uuidString]
            if let servings = m.servings { one["servings"] = servings }
            return one
        }
        return try await send("POST", "\(base(household))/apply",
                              body: ["meals": list, "addToGroceries": addToGroceries.map(\.uuidString)])
    }

    // MARK: Plans for health targets

    func mealPlanOptions() async throws -> FormOptions {
        try await get("/api/meal-plans/options")
    }

    /// Daily targets for the create form's tiles. Nothing is stored.
    func calculateTargets(age: Int, sex: String?, heightCm: Double, weightKg: Double, activity: String, goal: Goal,
                          overrides: TargetOverrides?) async throws -> Targets {
        var body: [String: Any] = ["age": age, "heightCm": heightCm, "weightKg": weightKg, "activity": activity,
                                   "goal": goal.rawValue]
        if let sex, !sex.isEmpty { body["sex"] = sex }
        if let overrides, !overrides.isEmpty { body["overrides"] = try json(overrides) }
        return try await send("POST", "/api/meal-plans/targets/calculate", body: body)
    }

    func presetPlan(household: UUID, key: String) async throws -> TargetPlan {
        let escaped = key.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? key
        return try await get("\(base(household))/presets/\(escaped)")
    }

    func targetPlan(household: UUID, id: UUID) async throws -> TargetPlan {
        try await get("\(base(household))/targets/\(id.uuidString)")
    }

    /// A plan from these details, never saved; `chosen` are a phone's model's picks.
    func previewPlan(household: UUID, name: String?, details: TargetDetails, chosen: [SlotChoice]? = nil) async throws -> TargetPlan {
        var body: [String: Any] = ["details": try json(details)]
        if let name { body["name"] = name }
        if let chosen { body["chosen"] = try jsonList(chosen) }
        return try await send("POST", "\(base(household))/targets/preview", body: body)
    }

    func previewSwap(household: UUID, plan: TargetPlan, meal: PlanMeal, exclude: [UUID],
                     recipeId: UUID? = nil) async throws -> TargetPlan {
        var body: [String: Any] = [
            "name": plan.name, "details": try json(plan.details), "meals": plan.choices,
            "day": meal.day, "mealType": meal.mealType.rawValue, "exclude": exclude.map(\.uuidString),
        ]
        if let recipeId { body["recipeId"] = recipeId.uuidString }
        return try await send("POST", "\(base(household))/targets/preview/swap", body: body)
    }

    /// What this phone's model may choose a plan for these details from.
    func targetCandidates(household: UUID, details: TargetDetails) async throws -> TargetCandidates {
        try await send("POST", "\(base(household))/targets/candidates", body: ["details": try json(details)])
    }

    /// A new plan of your own; with `keep` (a preview's meals) kept exactly.
    func createPlan(household: UUID, name: String, details: TargetDetails, keep: TargetPlan? = nil) async throws -> TargetPlan {
        var body: [String: Any] = ["name": name, "details": try json(details)]
        if let keep { body["meals"] = keep.choices }
        return try await send("POST", "\(base(household))/targets", body: body)
    }

    /// New details choose again; `keep` (a preview's meals) are kept exactly; a name alone keeps the meals.
    func updatePlan(household: UUID, id: UUID, name: String? = nil, details: TargetDetails? = nil,
                    keep: TargetPlan? = nil) async throws -> TargetPlan {
        var body: [String: Any] = [:]
        if let name { body["name"] = name }
        if let details { body["details"] = try json(details) }
        if let keep { body["meals"] = keep.choices }
        return try await send("PUT", "\(base(household))/targets/\(id.uuidString)", body: body)
    }

    func deletePlan(household: UUID, id: UUID) async throws {
        _ = try await sendNoContent("DELETE", "\(base(household))/targets/\(id.uuidString)")
    }

    func regeneratePlan(household: UUID, id: UUID) async throws -> TargetPlan {
        try await send("POST", "\(base(household))/targets/\(id.uuidString)/regenerate", body: [:])
    }

    func swapPlanMeal(household: UUID, id: UUID, meal: PlanMeal, exclude: [UUID], recipeId: UUID? = nil) async throws -> TargetPlan {
        var body: [String: Any] = ["day": meal.day, "mealType": meal.mealType.rawValue, "exclude": exclude.map(\.uuidString)]
        if let recipeId { body["recipeId"] = recipeId.uuidString }
        return try await send("POST", "\(base(household))/targets/\(id.uuidString)/swap", body: body)
    }

    /// Your plan's meals onto the household's Plan, day 0 on `start`.
    func applyPlan(household: UUID, id: UUID, start: String, servings: Int) async throws -> ApplyResult {
        try await send("POST", "\(base(household))/targets/\(id.uuidString)/apply",
                       body: ["start": start, "servings": servings])
    }
}

/**
 Whether the server this phone talks to has Meal plans, and which parts.

 As with Nutrition facts, a phone can reach a server older than itself: until the server says it
 has meal plans, Explore keeps its "coming soon" door and nothing leads to a screen that would
 only fail. A 404 is remembered (for that address) until the app is next opened; anything else is
 asked again next time. `features` says whether the server takes this phone's Apple Intelligence
 picks ("candidates"); without it the screens simply show the server's plans.
 */
@MainActor
@Observable
final class MealPlansAvailability {
    static let shared = MealPlansAvailability()

    /// Nil until the server has answered.
    private(set) var available: Bool?
    private(set) var features: Set<String> = []
    private var askedOf: String?
    private var asking: Task<Void, Never>?

    /// The server takes a phone's model's picks and hands out candidates.
    var takesChoices: Bool { features.contains("candidates") }

    #if DEBUG
    static func preview(_ yes: Bool = true) -> MealPlansAvailability {
        let a = MealPlansAvailability()
        a.available = yes
        a.features = ["cupboard", "use-by", "targets", "candidates"]
        a.askedOf = Config.baseURL
        return a
    }
    #endif

    func check() async {
        let address = Config.baseURL
        if askedOf == address, available != nil { return }
        if askedOf != address { available = nil; asking = nil }
        askedOf = address
        if asking == nil {
            asking = Task {
                do {
                    let status = try await APIClient.shared.mealPlansStatus()
                    features = Set(status.features)
                    available = status.ready
                } catch let error as APIError where error.status == 404 {
                    available = false
                } catch {
                    available = nil
                    askedOf = nil
                }
                asking = nil
            }
        }
        await asking?.value
    }
}

extension Notification.Name {
    /// Posted when something outside the Plan tab put meals on the Plan (a meal plan applied).
    static let planChanged = Notification.Name("mp.planChanged")
    /// Posted to bring a tab to the front; the object is its tag ("plan").
    static let showTab = Notification.Name("mp.showTab")
}
