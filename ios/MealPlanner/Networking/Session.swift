import Foundation
import Observation
import Security

/// The bearer token, in the Keychain rather than UserDefaults: it is the whole of someone's
/// access to the household, and a four-digit PIN is not much of a second line.
enum TokenStore {
    private static let service = "cloud.gehan.mealplanner"
    private static let account = "session-token"

    static func save(_ token: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var insert = query
        insert[kSecValueData as String] = Data(token.utf8)
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(insert as CFDictionary, nil)
    }

    static func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ] as CFDictionary)
    }
}

/// Who is signed in and which household they are looking at — the two things every screen needs.
@Observable
final class Session {
    var token: String?
    var displayName: String?
    var household: HouseholdSummary?

    var isSignedIn: Bool { token != nil && household != nil }

    private static let householdKey = "mp_household"
    private static let nameKey = "mp_display_name"

    /// Restores the last session so the app opens on the plan, not on a PIN pad.
    func restore() async {
        #if DEBUG
        // Launch straight into a household, for screenshots and UI automation:
        //   xcrun simctl launch <udid> cloud.gehan.mealplanner \
        //     -mp_debug_token "<token>" -mp_debug_household "<uuid>" -mp_debug_household_name "Gehan House"
        // Command-line arguments land in UserDefaults, so nothing else has to know about this.
        let defaults = UserDefaults.standard
        if let token = defaults.string(forKey: "mp_debug_token"),
           let id = defaults.string(forKey: "mp_debug_household").flatMap(UUID.init(uuidString:)) {
            self.token = token
            self.displayName = defaults.string(forKey: "mp_debug_name") ?? "Debug"
            self.household = HouseholdSummary(
                id: id,
                name: defaults.string(forKey: "mp_debug_household_name") ?? "Household",
                memberCount: 0
            )
            await APIClient.shared.use(token: token)
            return
        }
        #endif

        guard let token = TokenStore.read() else { return }
        self.token = token
        self.displayName = UserDefaults.standard.string(forKey: Self.nameKey)
        await APIClient.shared.use(token: token)
        if let data = UserDefaults.standard.data(forKey: Self.householdKey),
           let saved = try? JSONDecoder().decode(HouseholdSummary.self, from: data) {
            self.household = saved
        }
    }

    func signIn(_ auth: AuthResponse, household: HouseholdSummary) async {
        token = auth.token
        displayName = auth.displayName
        self.household = household
        TokenStore.save(auth.token)
        UserDefaults.standard.set(auth.displayName, forKey: Self.nameKey)
        if let data = try? JSONEncoder().encode(household) {
            UserDefaults.standard.set(data, forKey: Self.householdKey)
        }
        await APIClient.shared.use(token: auth.token)
    }

    func signOut() async {
        token = nil
        displayName = nil
        household = nil
        TokenStore.clear()
        UserDefaults.standard.removeObject(forKey: Self.householdKey)
        UserDefaults.standard.removeObject(forKey: Self.nameKey)
        await APIClient.shared.use(token: nil)
    }
}

/// `YYYY-MM-DD` in the phone's own timezone — the same day boundary the backend uses.
enum Day {
    static let format: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func iso(_ date: Date) -> String { format.string(from: date) }
    static func date(_ iso: String) -> Date? { format.date(from: iso) }

    static func adding(_ days: Int, to date: Date = Date()) -> Date {
        Calendar.current.date(byAdding: .day, value: days, to: date) ?? date
    }
}
