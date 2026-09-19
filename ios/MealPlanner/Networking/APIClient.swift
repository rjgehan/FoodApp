import Foundation

/// Where the backend lives. The default is the dev server on this Mac, which the simulator
/// reaches at localhost; a phone on the house wifi needs the LAN address or the public host,
/// so it is editable from the sign-in screen and remembered.
enum Config {
    private static let key = "mp_base_url"
    static let fallback = "http://localhost:8080"

    static var baseURL: String {
        get { UserDefaults.standard.string(forKey: key) ?? fallback }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}

struct APIError: LocalizedError {
    let status: Int
    let body: String

    var errorDescription: String? {
        // The backend sends a plain message for the cases a person can act on.
        if !body.isEmpty, body.count < 200, !body.hasPrefix("{") { return body }
        switch status {
        case 401: return "That PIN did not work."
        case 403: return "Not allowed."
        case 404: return "Not found."
        case 0: return "Could not reach the kitchen server."
        default: return "The server said \(status)."
        }
    }
}

/// One place that knows how to talk to the backend. Every call is async and throws; the views
/// decide what to do about a failure.
actor APIClient {
    static let shared = APIClient()

    private var token: String?
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    func use(token: String?) { self.token = token }

    // MARK: - Signing in

    func landing() async throws -> LandingResponse {
        try await get("/api/auth/landing", authorized: false)
    }

    func users(inHousehold id: UUID) async throws -> [UserSummary] {
        try await get("/api/auth/households/\(id.uuidString)/users", authorized: false)
    }

    func logIn(username: String, pin: String) async throws -> AuthResponse {
        try await send("POST", "/api/auth/login", body: ["username": username, "pin": pin], authorized: false)
    }

    // MARK: - The app

    /// The households this person belongs to, for the switcher in the header.
    func myHouseholds() async throws -> [HouseholdSummary] {
        try await get("/api/households")
    }

    func plan(household: UUID, from: String, to: String) async throws -> [MealPlanEntry] {
        try await get("/api/households/\(household.uuidString)/meal-plan?start=\(from)&end=\(to)")
    }

    func groceries(household: UUID) async throws -> [GroceryItem] {
        try await get("/api/households/\(household.uuidString)/grocery-list")
    }

    func categories(household: UUID) async throws -> [GroceryCategory] {
        try await get("/api/households/\(household.uuidString)/categories")
    }

    @discardableResult
    func setChecked(household: UUID, item: UUID, checked: Bool) async throws -> GroceryItem {
        try await send(
            "PATCH",
            "/api/households/\(household.uuidString)/grocery-list/items/\(item.uuidString)",
            body: ["checked": checked]
        )
    }

    func recipes(household: UUID) async throws -> [Recipe] {
        try await get("/api/households/\(household.uuidString)/recipes")
    }

    func recipeCategories(household: UUID) async throws -> [RecipeCategory] {
        try await get("/api/households/\(household.uuidString)/recipe-categories")
    }

    /// Everything every household on this server has published.
    func explore(household: UUID) async throws -> [Recipe] {
        try await get("/api/households/\(household.uuidString)/explore")
    }

    func cupboard(household: UUID) async throws -> [CupboardItem] {
        try await get("/api/households/\(household.uuidString)/cupboard")
    }

    @discardableResult
    func updateCupboard(
        household: UUID,
        item: UUID,
        runningLow: Bool? = nil,
        quantity: Double? = nil
    ) async throws -> CupboardItem {
        var body: [String: Any] = [:]
        if let runningLow { body["runningLow"] = runningLow }
        if let quantity { body["quantity"] = quantity }
        return try await send("PATCH", "/api/households/\(household.uuidString)/cupboard/\(item.uuidString)", body: body)
    }

    @discardableResult
    func editCupboard(
        household: UUID,
        item: UUID,
        name: String? = nil,
        staple: Bool? = nil,
        trackQuantity: Bool? = nil,
        quantity: Double? = nil,
        unit: String? = nil
    ) async throws -> CupboardItem {
        var body: [String: Any] = [:]
        if let name { body["name"] = name }
        if let staple { body["staple"] = staple }
        if let trackQuantity { body["trackQuantity"] = trackQuantity }
        if let quantity { body["quantity"] = quantity }
        if let unit { body["unit"] = unit }
        return try await send("PATCH", "/api/households/\(household.uuidString)/cupboard/\(item.uuidString)", body: body)
    }

    func removeFromCupboard(household: UUID, item: UUID) async throws {
        _ = try await sendNoContent("DELETE", "/api/households/\(household.uuidString)/cupboard/\(item.uuidString)")
    }

    /// The whole recipe, as the edit screen sends it back.
    @discardableResult
    func updateRecipe(_ recipe: Recipe, body: [String: Any]) async throws -> Recipe {
        try await send("PUT", "/api/recipes/\(recipe.id.uuidString)", body: body)
    }

    /// Puts a cupboard item back on the grocery list.
    func buyAgain(household: UUID, item: UUID) async throws {
        _ = try await sendNoContent("POST", "/api/households/\(household.uuidString)/cupboard/\(item.uuidString)/buy-again")
    }

    // MARK: - Writing to the plan and the list

    @discardableResult
    func addToPlan(
        household: UUID,
        date: String,
        meal: MealType,
        recipeId: UUID? = nil,
        itemName: String? = nil
    ) async throws -> MealPlanEntry {
        var body: [String: Any] = ["date": date, "mealType": meal.rawValue]
        if let recipeId { body["recipeId"] = recipeId.uuidString }
        if let itemName { body["itemName"] = itemName }
        return try await send("POST", "/api/households/\(household.uuidString)/meal-plan/entries", body: body)
    }

    func removeFromPlan(household: UUID, entry: UUID) async throws {
        _ = try await sendNoContent("DELETE", "/api/households/\(household.uuidString)/meal-plan/\(entry.uuidString)")
    }

    /// Everything planned between two dates, onto the grocery list.
    func addRangeToGroceries(household: UUID, from: String, to: String) async throws {
        _ = try await sendNoContent(
            "POST",
            "/api/households/\(household.uuidString)/grocery-list/add-all?start=\(from)&end=\(to)"
        )
    }

    @discardableResult
    func addGroceryItem(household: UUID, name: String, quantity: Double?, unit: String?) async throws -> GroceryItem {
        var body: [String: Any] = ["ingredientName": name]
        if let quantity { body["quantity"] = quantity }
        if let unit, !unit.isEmpty { body["unit"] = unit }
        return try await send("POST", "/api/households/\(household.uuidString)/grocery-list/items", body: body)
    }

    func removeGroceryItem(household: UUID, item: UUID) async throws {
        _ = try await sendNoContent("DELETE", "/api/households/\(household.uuidString)/grocery-list/items/\(item.uuidString)")
    }

    /// "Done shopping": everything ticked comes off the list, and `putAway` goes to the cupboard.
    func putAway(household: UUID, putAway: [UUID], leaveOut: [UUID]) async throws {
        _ = try await sendNoContent(
            "POST",
            "/api/households/\(household.uuidString)/grocery-list/put-away",
            body: ["putAway": putAway.map(\.uuidString), "leaveOut": leaveOut.map(\.uuidString)]
        )
    }

    /// Uploads a PNG and returns its id. Multipart by hand: one field, no dependencies.
    func uploadImage(household: UUID, png: Data) async throws -> UUID {
        let boundary = "mp-\(UUID().uuidString)"
        var req = request(method: "POST", path: "/api/households/\(household.uuidString)/images", authorized: true)
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"generated.png\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(png)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        req.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError(status: status, body: String(data: data, encoding: .utf8) ?? "")
        }
        struct Uploaded: Decodable { let id: UUID }
        return try decoder.decode(Uploaded.self, from: data).id
    }

    /// Images are served unauthenticated by design — an `<img>` cannot send a bearer token —
    /// so AsyncImage can load this URL directly.
    nonisolated func imageURL(_ id: UUID) -> URL? {
        URL(string: "\(Config.baseURL)/api/images/\(id.uuidString)")
    }

    // MARK: - Plumbing

    private func get<T: Decodable>(_ path: String, authorized: Bool = true) async throws -> T {
        try await perform(request(method: "GET", path: path, authorized: authorized))
    }

    private func send<T: Decodable>(
        _ method: String,
        _ path: String,
        body: [String: Any],
        authorized: Bool = true
    ) async throws -> T {
        var req = request(method: method, path: path, authorized: authorized)
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await perform(req)
    }

    /// iOS reports a blocked local-network connection as "the Internet connection appears to be
    /// offline", which sends you looking at your wifi instead of at the permission that is
    /// actually missing. Say what it really is.
    nonisolated static func explain(_ failure: URLError) -> String {
        let host = URL(string: Config.baseURL)?.host ?? ""
        let isLoopback = host == "localhost" || host == "127.0.0.1"
        let isLocalNetwork = host.hasPrefix("192.168.") || host.hasPrefix("10.")
            || host.hasPrefix("172.") || host.hasSuffix(".local")

        if isLoopback {
            return """
            Cannot reach \(Config.baseURL). On a phone, localhost is the phone itself — \
            set Server to this Mac's address on the network, like http://192.168.1.10:8080.
            """
        }
        switch failure.code {
        case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost:
            if isLocalNetwork {
                return """
                Cannot reach \(Config.baseURL). If the phone is on the same wifi, iOS is \
                probably blocking local network access: Settings → Privacy & Security → \
                Local Network → Meal Planner.
                """
            }
            return "Cannot reach \(Config.baseURL)."
        case .timedOut:
            return "\(Config.baseURL) did not answer in time."
        default:
            return failure.localizedDescription
        }
    }

    /// For the endpoints that answer 204, or a body nothing here reads.
    private func sendNoContent(_ method: String, _ path: String, body: [String: Any]? = nil) async throws -> Bool {
        var req = request(method: method, path: path, authorized: true)
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw APIError(status: 0, body: error.localizedDescription)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError(status: status, body: String(data: data, encoding: .utf8) ?? "")
        }
        return true
    }

    private func request(method: String, path: String, authorized: Bool) -> URLRequest {
        var req = URLRequest(url: URL(string: Config.baseURL + path)!)
        req.httpMethod = method
        req.timeoutInterval = 15
        if authorized, let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return req
    }

    private func perform<T: Decodable>(_ req: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch let failure as URLError {
            throw APIError(status: 0, body: Self.explain(failure))
        } catch {
            throw APIError(status: 0, body: error.localizedDescription)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError(status: status, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try decoder.decode(T.self, from: data)
    }
}
