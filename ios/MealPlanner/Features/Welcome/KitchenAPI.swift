import Foundation

/// The kitchen's own call, beside the screens that make it (KitchenSetup.swift, and Household →
/// Kitchen & features) rather than in APIClient.swift.
extension APIClient {
    /**
     The household's kitchen: its machines (the whole list, `KitchenMachine` keys), whether it
     uses the cupboard and the Plan, and `setUp` to mark the kitchen questions answered. Anything
     left nil stays as it is, so each screen sends only what it changed — and Skip sends only
     `setUp`. Any member may; the household comes back as it now stands.
     */
    @discardableResult
    func updateKitchen(household: UUID, cupboardEnabled: Bool? = nil, planEnabled: Bool? = nil,
                       machines: [String]? = nil, setUp: Bool? = nil) async throws -> HouseholdSummary {
        var body: [String: Any] = [:]
        if let cupboardEnabled { body["cupboardEnabled"] = cupboardEnabled }
        if let planEnabled { body["planEnabled"] = planEnabled }
        if let machines { body["machines"] = machines }
        if let setUp { body["setUp"] = setUp }
        return try await send("PATCH", "/api/households/\(household.uuidString)/kitchen", body: body)
    }
}
