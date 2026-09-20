import Foundation

/**
 Where the backend lives.

 A debug build defaults to the dev server on this Mac, which the simulator reaches at
 localhost. Anything built for distribution defaults to the house server, because a phone
 that is not this Mac cannot reach localhost and the first screen would be an error — which
 is exactly what a family member installing from TestFlight would see.

 Either way it stays editable from the sign-in screen and is remembered, so a phone on the
 house wifi can still be pointed at the LAN address.
*/
enum Config {
    private static let key = "mp_base_url"

    #if DEBUG
    static let fallback = "http://localhost:8080"
    #else
    static let fallback = "https://meals.gehan.cloud"
    #endif

    /// Normalised on the way out as well as in, so an address stored by an older build — or
    /// typed before this existed — heals itself instead of failing every call until somebody
    /// reinstalls the app.
    static var baseURL: String {
        get { UserDefaults.standard.string(forKey: key).flatMap(address(from:)) ?? fallback }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }

    /**
     What somebody typed, turned into an address URLSession will accept. Nil if it cannot be.

     Typing "meals.gehan.cloud" is the obvious thing to do and it used to fail: Foundation
     happily builds a URL out of it, with no scheme, and the request then dies as "unsupported
     URL" — which reads like the server is wrong rather than the address.

     The scheme is guessed the way it actually works out. A name is a site on the internet and
     gets https; a bare IP address or localhost is a machine on somebody's own network, which
     will not have a certificate, so it gets http.
    */
    static func address(from typed: String) -> String? {
        var text = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        // A trailing slash would double up against every path, giving //api/…
        while text.hasSuffix("/") { text.removeLast() }
        guard !text.isEmpty, !text.contains(" ") else { return nil }
        if !text.contains("://") { text = (isAMachineNotASite(text) ? "http://" : "https://") + text }
        guard let url = URL(string: text), let host = url.host, !host.isEmpty,
              url.scheme == "http" || url.scheme == "https" else { return nil }
        return text
    }

    private static func isAMachineNotASite(_ text: String) -> Bool {
        let host = text.split(separator: "/").first.map(String.init) ?? text
        let name = host.split(separator: ":").first.map(String.init) ?? host
        if name == "localhost" || name.hasSuffix(".local") { return true }
        let parts = name.split(separator: ".")
        return parts.count == 4 && parts.allSatisfy { UInt8($0) != nil }
    }
}

struct APIError: LocalizedError {
    let status: Int
    let body: String

    /// Every error from the API arrives as {"status":…,"message":…}, and that message is
    /// written for a person to act on. The old guard here rejected any body starting with
    /// "{" — which is all of them — so every explanation the server wrote was thrown away
    /// and replaced with "The server said 422."
    private var serverMessage: String? {
        struct Envelope: Decodable { let message: String? }
        guard let data = body.data(using: .utf8),
              let message = (try? JSONDecoder().decode(Envelope.self, from: data))?.message?
                  .trimmingCharacters(in: .whitespacesAndNewlines),
              !message.isEmpty,
              // A ResponseStatusException thrown with no reason is filled in with the bare
              // HTTP reason phrase — "Unauthorized" — which is worse than the app's own words.
              message.caseInsensitiveCompare(HTTPURLResponse.localizedString(forStatusCode: status)) != .orderedSame
        else { return nil }
        return message
    }

    var errorDescription: String? {
        if let serverMessage { return serverMessage }
        // Anything not JSON at this point is a string this client wrote itself, with status 0
        // — including the local-network explanation, which is longer than any cap worth having.
        if status == 0, !body.isEmpty { return body }
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

    /// Reads a recipe off a link: the page's own structured data, or TikTok's caption.
    func importRecipe(household: UUID, url: String) async throws -> ImportedRecipe {
        try await send("POST", "/api/households/\(household.uuidString)/recipes/import", body: ["url": url])
    }

    /// Writes what a share sheet handed over into the server's import log. Plain text
    /// rather than JSON, because the report is a transcript and not a structure.
    func noteShare(household: UUID, report: String) async throws {
        var req = request(method: "POST", path: "/api/households/\(household.uuidString)/shares/diagnostic",
                          authorized: true)
        req.setValue("text/plain; charset=utf-8", forHTTPHeaderField: "Content-Type")
        req.httpBody = report.data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError(status: status, body: String(data: data, encoding: .utf8) ?? "")
        }
    }

    @discardableResult
    func createRecipe(household: UUID, body: [String: Any]) async throws -> Recipe {
        try await send("POST", "/api/households/\(household.uuidString)/recipes", body: body)
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
    func addToCupboard(household: UUID, name: String) async throws -> CupboardItem {
        try await send("POST", "/api/households/\(household.uuidString)/cupboard", body: ["name": name])
    }

    /// What a barcode names. The server asks Open Food Facts and caches the answer for a month,
    /// so the phone never talks to the catalogue itself. Throws a 404 for one nobody has
    /// published — which is an answer, not a failure.
    func product(barcode: String) async throws -> Product {
        let escaped = barcode.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? barcode
        return try await get("/api/barcodes/\(escaped)")
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

    /// Sets a recipe's pictures without touching anything else about it. The whole-recipe
    /// PUT would work, but it means sending every field back to change one — and the photo
    /// list is replaced by whatever arrives, so a mistake there is silent data loss.
    func setImages(recipeId: UUID, coverImageId: UUID?, photoIds: [UUID]) async throws -> Recipe {
        var body: [String: Any] = ["photoIds": photoIds.map(\.uuidString)]
        body["coverImageId"] = coverImageId.map { $0.uuidString as Any } ?? NSNull()
        return try await send("PUT", "/api/recipes/\(recipeId.uuidString)/images", body: body)
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
