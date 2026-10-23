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

/// An invite waiting on a sign-in: the link, and the house's name for the sign-in screen to show.
struct PendingInvite: Hashable {
    let token: String
    let householdName: String
}

/// Who is signed in and which household they are looking at — the two things every screen needs.
@Observable
final class Session {
    var token: String?
    var displayName: String?
    var household: HouseholdSummary?
    /// Every household this person is in — the switcher in the header needs them all.
    var households: [HouseholdSummary] = []
    /// Who is signed in, so a list of people can tell which one is you. In memory only — the
    /// Keychain token is all that is kept — so after a relaunch it is asked for again.
    var userId: UUID?
    /// "Not now" on the add-an-email prompt. Kept in memory only, so it lasts until the app
    /// is next launched — and a fresh sign-in asks again.
    var credentialsPromptDismissed = false
    /// An invite link somebody chose "I already have an account" on. The next sign-in, by email
    /// or PIN, says yes to it as it lands — they already said so on the invite screen.
    var pendingInvite: PendingInvite?
    /// Something the sign-in screen should say when it next appears: that you were taken out of
    /// your last household, or that an invite you signed in for did not work any more.
    var notice: String?
    /// Taken out of the household you were in and moved on to another of yours: the two names,
    /// for the notice that says so once (7.4). Nil once it has been read.
    var removedFrom: (from: String, to: String)?
    /// Whether the server has the beta's ideas board open — the lightbulb in the header — and
    /// whether you are its admin there. Both from /api/users/me, on every launch and sign-in;
    /// an older server says neither, which hides the lightbulb.
    var ideasBoard = false
    var isAdmin = false
    /**
     The household whose kitchen questions (Welcome/KitchenSetup.swift) are waiting to be asked:
     set by whoever just made a house or joined one nobody has answered them for, and cleared once
     they are answered or skipped. RootView asks them as soon as nothing else is on screen, ahead
     of the add-an-email and restock prompts. In memory only: a house left unanswered still has
     the card on Recipes.
     */
    var kitchenSetupFor: UUID?

    var isSignedIn: Bool { token != nil && household != nil }

    /// Whether the open house plans meals — the Plan tab and every way onto it.
    var planOn: Bool { household?.plansMeals ?? true }
    /// Whether the open house keeps a cupboard — the Cupboard tab and everything that reads it.
    var cupboardOn: Bool { household?.tracksCupboard ?? true }
    /// The machines in the open house's kitchen, or nil while it has not said which.
    var kitchen: [String]? { household?.kitchen }

    /// A house this person just made: its kitchen questions come next, always.
    func askKitchenSetup(for household: UUID) {
        kitchenSetupFor = household
    }

    /// A house this person just joined: asked only if nobody there has answered yet — whoever
    /// made it usually has, and their answers are the household's, not each person's.
    func askKitchenSetupIfNeeded(for household: UUID?) {
        guard let household, households.first(where: { $0.id == household })?.kitchenSetUp == false else { return }
        kitchenSetupFor = household
    }

    /**
     A household as the server has just sent it back (its kitchen saved, say): into the list, and
     on screen if it is the open one — which is what turns a tab on or off at once. It may be a
     house other than the open one: Start another household does not move you into the new one.
    */
    func adopt(_ updated: HouseholdSummary) {
        if let index = households.firstIndex(where: { $0.id == updated.id }) {
            households[index] = updated
        } else {
            households.append(updated)
        }
        if household?.id == updated.id { switchTo(updated) }
    }

    /// What /api/users/me says about you beyond your name.
    func learn(_ me: Me) {
        if userId == nil { userId = me.userId }
        ideasBoard = me.ideasBoard == true
        isAdmin = me.admin == true
    }

    /// Sends what a share sheet handed over to the server's import log, where it can be
    /// read later. Best effort: a note that does not arrive costs nothing.
    func noteShare(_ report: String) async {
        guard let household = household?.id else { return }
        try? await APIClient.shared.noteShare(household: household, report: report)
    }

    /// Loaded at launch and again after every sign-in: the list belongs to whoever is signed
    /// in, on whichever server they signed in to, and someone may have been added to a house.
    func loadHouseholds() async {
        // A failed fetch is not news that you are in no household: keep what we had.
        guard let mine = try? await APIClient.shared.myHouseholds() else { return }
        households = mine
        // After a relaunch only the token is known: ask who it belongs to.
        if userId == nil, token != nil, let me = try? await APIClient.shared.me() {
            userId = me.userId
        }
        guard let current = household else { return }
        if let fresh = mine.first(where: { $0.id == current.id }) {
            // The sign-in screen's copy of the household has no settings on it; the list's
            // does, and the plan needs the house's usual servings.
            if fresh != current { switchTo(fresh) }
        } else if let other = mine.first {
            // Taken out of this one (or it was deleted): carry on in another. A fallback, not
            // a choice, so it is not remembered as one — and said, so the switch does not look
            // like the app losing its place.
            switchTo(other)
            removedFrom = (current.name, other.name)
        } else if token != nil {
            // In no household at all any more. There is nothing for the tabs to show, so back to
            // the sign-in screen — which says why, and offers to scan an invite.
            await signOut()
            notice = "You're not in a household any more. Ask someone for an invite link to join one, "
                + "or start your own on the Waxwing website."
        }
    }

    /// How many this house usually cooks for, when the server has said. Nil lets the server
    /// fall back to the same number itself.
    var defaultServings: Int? {
        household?.defaultServings ?? households.first { $0.id == household?.id }?.defaultServings
    }

    func switchTo(_ household: HouseholdSummary) {
        self.household = household
        if let data = try? JSONEncoder().encode(household) {
            UserDefaults.standard.set(data, forKey: Self.householdKey)
        }
    }

    /// Someone picked this house, so the server remembers it and the next sign-in opens it —
    /// here or on the web. Best effort: failing to remember is not worth an error on screen.
    func choose(_ household: HouseholdSummary) {
        switchTo(household)
        Task { try? await APIClient.shared.rememberHousehold(household.id) }
    }

    static let householdKey = "mp_household"
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

    /**
     Signs in and opens a household: the one the server remembers them in, else the one they
     tapped on the name-and-PIN screens, else the first they are in. It used to be whatever the
     sign-in screen handed over — and email sign-in has no house to hand over at all.

     Returns false, signed out again, when the account is in no household: there is nothing
     for the tabs to show. Throws, also signed out again, when the list could not be fetched —
     a dropped connection is not the same news as having no household, and the sign-in screen
     has to say which it was.
    */
    @discardableResult
    func signIn(_ auth: AuthResponse, household picked: HouseholdSummary? = nil) async throws -> Bool {
        await APIClient.shared.use(token: auth.token)
        var auth = auth
        var joinedId: UUID?
        // Signed in to say yes to an invite: say it now, before looking for a house to open —
        // it may be the only one they are in — and open that one.
        if let invite = pendingInvite {
            pendingInvite = nil
            do {
                let joined = try await APIClient.shared.acceptInvite(token: invite.token)
                joinedId = joined.id
                auth = AuthResponse(token: auth.token, userId: auth.userId,
                                    displayName: auth.displayName, lastHouseholdId: joined.id)
            } catch {
                notice = "Signed in, but the invite didn't work: \(error.localizedDescription)"
            }
        }
        /*
         The switcher top left reads this list, and it used to be filled only at launch — so
         after signing in, or signing in again on another server, it held nothing (or the last
         person's houses) and stayed that way until the app was killed and reopened.
        */
        let mine: [HouseholdSummary]
        do {
            mine = try await APIClient.shared.myHouseholds()
        } catch {
            await APIClient.shared.use(token: token)
            throw error
        }
        let opening = mine.first { $0.id == auth.lastHouseholdId }
            ?? mine.first { $0.id == picked?.id }
            ?? picked
            ?? mine.first
        guard let opening else {
            await APIClient.shared.use(token: token)
            return false
        }

        households = mine
        token = auth.token
        displayName = auth.displayName
        userId = auth.userId
        credentialsPromptDismissed = false
        TokenStore.save(auth.token)
        UserDefaults.standard.set(auth.displayName, forKey: Self.nameKey)
        switchTo(opening)
        // Joined on the way in (by email or by PIN): a house nobody has set up gets its kitchen questions.
        askKitchenSetupIfNeeded(for: joinedId)
        return true
    }

    func signOut() async {
        notice = nil
        token = nil
        displayName = nil
        household = nil
        households = []
        userId = nil
        ideasBoard = false
        isAdmin = false
        kitchenSetupFor = nil
        TokenStore.clear()
        UserDefaults.standard.removeObject(forKey: Self.householdKey)
        UserDefaults.standard.removeObject(forKey: Self.nameKey)
        // Colours belong to the person: the next one to sign in here gets their own.
        ThemeStore.shared.reset()
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
