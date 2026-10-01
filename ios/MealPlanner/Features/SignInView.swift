import SwiftUI

/// Email and password first, as on the web. The older three steps — pick the house, tap your
/// name, tap out four digits — are behind a link while everyone moves over, and disappear when
/// the server switches them off. A server with nobody on it yet opens on first-time setup.
struct SignInView: View {
    var session: Session

    @State private var usingPin = false
    @State private var legacyPinLogin = true
    /// A brand-new server with no accounts: the first one is made here, with its household.
    @State private var needsSetup = false
    @State private var email = ""
    @State private var password = ""

    @State private var households: [HouseholdSummary] = []
    @State private var household: HouseholdSummary?
    @State private var people: [UserSummary] = []
    @State private var person: UserSummary?
    @State private var pin = ""
    @State private var error: String?
    @State private var busy = false
    @State private var editingServer = false
    @State private var serverDraft = Config.baseURL
    /// When the server's lockout on this address ends, after too many wrong passwords.
    @State private var lockedUntil: Date? = {
        #if DEBUG
        // -mp_debug_locked 292: the locked state with that many seconds left, for screenshot runs.
        let seconds = UserDefaults.standard.integer(forKey: "mp_debug_locked")
        return seconds > 0 ? Date().addingTimeInterval(TimeInterval(seconds)) : nil
        #else
        return nil
        #endif
    }()
    @State private var now = Date()
    @State private var scanning: Bool = {
        #if DEBUG
        // -mp_debug_screen scan opens the Scan screen from here, for screenshot runs.
        return UserDefaults.standard.string(forKey: "mp_debug_screen") == "scan"
        #else
        return false
        #endif
    }()

    var body: some View {
        NavigationStack {
            Group {
                if !usingPin {
                    if needsSetup {
                        FirstTimeSetup(session: session)
                    } else {
                        emailForm
                    }
                } else if let person, let household {
                    pinPad(for: person, in: household)
                } else if household != nil {
                    peopleList
                } else {
                    householdList
                }
            }
            .kitchenList()
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(usingPin ? .large : .inline)
            .toolbar {
                if usingPin {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Back", systemImage: "chevron.left") { stepBack() }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Server", systemImage: "network") { editingServer = true }
                }
            }
        }
        .task { await loadHouseholds() }
        .fullScreenCover(isPresented: $scanning) { ScanInviteScreen(session: session) }
        .alert("Kitchen server", isPresented: $editingServer) {
            TextField(Config.fallback, text: $serverDraft)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
            Button("Cancel", role: .cancel) { serverDraft = Config.baseURL }
            Button("Use it") { useTypedServer() }
        } message: {
            // Two audiences: whoever is developing this, and whoever in the house just
            // installed it. Only one of them knows what a simulator is.
            #if DEBUG
            Text("Where the app looks for your household. The simulator reaches this Mac at localhost.")
            #else
            Text("Where the app looks for your household. Leave this alone unless you have been given a different address.")
            #endif
        }
    }

    private var title: String {
        if !usingPin { return "" }
        if person != nil { return "Your PIN" }
        if household != nil { return "Who's this?" }
        return "Pick your household"
    }

    /// Seconds left on the lockout, ticking down; 0 once it is over (or there is none).
    private var lockSeconds: Int {
        guard let lockedUntil else { return 0 }
        return max(0, Int(lockedUntil.timeIntervalSince(now).rounded(.up)))
    }

    // MARK: - Steps

    /// The mockup's sign in (1.1), and its locked state (1.2).
    private var emailForm: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                WelcomeBrand()

                if let pending = session.pendingInvite {
                    VStack(alignment: .leading, spacing: 8) {
                        NoteBox("Sign in to join \(pending.householdName)", tone: .accent, systemImage: "house")
                        if let notice = session.notice {
                            Text(notice).font(.system(size: 13)).foregroundStyle(Palette.muted)
                        }
                        Button("Don't join after all") { session.pendingInvite = nil }
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Palette.accentInk)
                    }
                } else if let notice = session.notice {
                    NoteBox(notice, tone: .accent, systemImage: "info.circle")
                }

                if lockSeconds > 0 {
                    NoteBox(text: Text("Too many sign-in attempts.").bold()
                                + Text("\nFor safety, try again in \(countdown(lockSeconds))."),
                            tone: .accent, systemImage: "lock")
                }

                VStack(spacing: 14) {
                    FieldBox("Email", text: $email, systemImage: "envelope")
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                    FieldBox("Password", text: $password, systemImage: "lock", secure: true)
                        .textContentType(.password)
                        .submitLabel(.go)
                        .onSubmit { Task { await signInWithEmail() } }
                }
                .onChange(of: email) { lockedUntil = nil }

                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button {
                    Task { await signInWithEmail() }
                } label: {
                    if busy {
                        ProgressView().tint(Palette.onAccent)
                    } else if lockSeconds > 0 {
                        Text("Try again in \(countdown(lockSeconds))")
                    } else {
                        Text("Sign in")
                    }
                }
                .buttonStyle(.primary)
                .disabled(busy || lockSeconds > 0 || email.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { emailFooter }
        .pageBackground()
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { tick in
            if lockedUntil != nil { now = tick }
        }
    }

    /// The other ways in, and what to do without a password, along the bottom.
    private var emailFooter: some View {
        VStack(spacing: 10) {
            Button {
                scanning = true
            } label: {
                Label("Have an invite? Scan it", systemImage: "qrcode.viewfinder")
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundStyle(Palette.accentInk)
            if legacyPinLogin {
                Button("Sign in with your name and PIN") {
                    error = nil
                    usingPin = true
                }
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Palette.muted)
            }
            // No email is ever sent, so the way back in is a person rather than a link.
            Text("Forgot your password? Ask your household owner\nfor a reset link.")
                .font(.system(size: 13))
                .lineSpacing(3)
                .multilineTextAlignment(.center)
                .foregroundStyle(Palette.muted)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .background(Palette.bg)
    }

    private var householdList: some View {
        List {
            if let error {
                KitchenSection { Text(error).foregroundStyle(Palette.danger) }
            }
            KitchenSection("Pick your household") {
                ForEach(households) { h in
                    Button {
                        household = h
                        Task { await loadPeople(h) }
                    } label: {
                        let members = h.memberCount ?? 0
                        LabeledContent(h.name, value: "\(members) \(members == 1 ? "person" : "people")")
                    }
                }
            }
            KitchenSection {
                LabeledContent("Server", value: Config.baseURL)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .overlay { if households.isEmpty && error == nil { ProgressView() } }
    }

    private var peopleList: some View {
        List(people) { p in
            Button(p.shown) {
                person = p
                pin = ""
            }
        }
    }

    private func pinPad(for person: UserSummary, in household: HouseholdSummary) -> some View {
        VStack(spacing: 28) {
            Text(person.shown).titleFont(26).foregroundStyle(Palette.text)

            HStack(spacing: 18) {
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .fill(i < pin.count ? Palette.text : Color.clear)
                        .overlay(Circle().strokeBorder(i < pin.count ? Palette.text : Palette.muted, lineWidth: 1.6))
                        .frame(width: 14, height: 14)
                }
            }

            if let error {
                Text(error).foregroundStyle(Palette.danger).font(.callout)
            }

            // A real keypad, because a four-digit PIN on a phone should never open a keyboard.
            Grid(horizontalSpacing: 26, verticalSpacing: 16) {
                ForEach([["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["", "0", "⌫"]], id: \.self) { row in
                    GridRow {
                        ForEach(row, id: \.self) { key in
                            keypadKey(key, household: household, person: person)
                        }
                    }
                }
            }
            .disabled(busy)

            if busy { ProgressView() }
            Spacer()
        }
        .padding(.top, 24)
        .frame(maxWidth: .infinity)
        .pageBackground()
    }

    /// The mockup's keypad key (`.key`): 76pt, the surface with a hairline.
    private func keypadKey(_ key: String, household: HouseholdSummary, person: UserSummary) -> some View {
        Group {
            if key.isEmpty {
                Color.clear.frame(width: 76, height: 76)
            } else {
                Button {
                    tap(key, household: household, person: person)
                } label: {
                    Group {
                        if key == "⌫" {
                            Image(systemName: "delete.left").font(.system(size: 24))
                        } else {
                            Text(key).font(.system(size: 30))
                        }
                    }
                    .foregroundStyle(Palette.text)
                    .frame(width: 76, height: 76)
                    .background(key == "⌫" ? Color.clear : Palette.surface, in: Circle())
                    .overlay { if key != "⌫" { Circle().strokeBorder(Palette.border, lineWidth: 1) } }
                    .contentShape(Circle())
                }
                .buttonStyle(PressFade())
                .accessibilityLabel(key == "⌫" ? "Delete" : key)
            }
        }
    }

    // MARK: - Behaviour

    private func tap(_ key: String, household: HouseholdSummary, person: UserSummary) {
        error = nil
        if key == "⌫" {
            if !pin.isEmpty { pin.removeLast() }
            return
        }
        guard pin.count < 4 else { return }
        pin += key
        if pin.count == 4 {
            Task { await submit(household: household, person: person) }
        }
    }

    private func stepBack() {
        error = nil
        if person != nil {
            person = nil
            pin = ""
        } else if household != nil {
            household = nil
            people = []
        } else {
            usingPin = false
        }
    }

    /// Typing "meals.gehan.cloud" is the obvious thing to do, and storing it as typed left
    /// every call failing with "unsupported URL" — which reads as the server being broken
    /// rather than the address being half-written. Config fills in the scheme.
    private func useTypedServer() {
        guard let address = Config.address(from: serverDraft) else {
            error = "\(serverDraft.trimmingCharacters(in: .whitespaces)) is not a server address. "
                + "Try something like meals.gehan.cloud, or 192.168.1.10:8080."
            return
        }
        Config.baseURL = address
        serverDraft = address
        Task { await loadHouseholds() }
    }

    private func loadHouseholds() async {
        error = nil
        do {
            let landing = try await APIClient.shared.landing()
            households = landing.households
            legacyPinLogin = landing.legacyPinLogin ?? true
            needsSetup = landing.needsSetup
            #if DEBUG
            // -mp_debug_screen setup: first-time setup on a server that already has people.
            if UserDefaults.standard.string(forKey: "mp_debug_screen") == "setup" { needsSetup = true }
            #endif
            if !legacyPinLogin { usingPin = false }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func signInWithEmail() async {
        let typed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !typed.isEmpty, !password.isEmpty, !busy, lockSeconds == 0 else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let auth = try await APIClient.shared.logIn(email: typed, password: password)
            if try await session.signIn(auth) {
                password = ""
            } else {
                error = "You're not in a household yet. Ask someone for an invite link, then scan it below — "
                    + "or start your own on the Meal Planner website."
            }
        } catch let failure as APIError where failure.lockoutSeconds != nil {
            // Too many tries: the locked state says so and counts down instead of an error.
            now = Date()
            lockedUntil = now.addingTimeInterval(TimeInterval(failure.lockoutSeconds ?? 60))
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadPeople(_ h: HouseholdSummary) async {
        do {
            people = try await APIClient.shared.users(inHousehold: h.id)
        } catch {
            self.error = error.localizedDescription
            household = nil
        }
    }

    private func submit(household: HouseholdSummary, person: UserSummary) async {
        busy = true
        defer { busy = false }
        do {
            let auth = try await APIClient.shared.logIn(username: person.username, pin: pin, household: household.id)
            try await session.signIn(auth, household: household)
        } catch {
            self.error = error.localizedDescription
            pin = ""
        }
    }
}

/**
 First-time setup (1.3): only on a brand-new server with no accounts. Makes you, the owner, and
 your household in one go, and signs you in.
 */
struct FirstTimeSetup: View {
    var session: Session

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var household = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Let's set up\nyour kitchen").titleFont(28).foregroundStyle(Palette.text)
                        .lineSpacing(-2)
                        .accessibilityAddTraits(.isHeader)
                    Text("You'll be the owner. Invite everyone else after.")
                        .font(.system(size: 15)).foregroundStyle(Palette.muted)
                }
                Card(spacing: 14) {
                    SectionLabel("You").padding(.horizontal, -4)
                    FieldBox("Your name", text: $name, prompt: "Ryan", systemImage: "person")
                        .textContentType(.name)
                    FieldBox("Email", text: $email, prompt: "you@example.com", systemImage: "envelope")
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    FieldBox("Password", text: $password, systemImage: "lock", secure: true, hint: "At least 8 characters")
                        .textContentType(.newPassword)
                }
                Card(spacing: 14) {
                    SectionLabel("Household").padding(.horizontal, -4)
                    FieldBox("Household name", text: $household, prompt: "Gehan house", systemImage: "house")
                }
                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                }
                Button {
                    Task { await create() }
                } label: {
                    if busy { ProgressView().tint(Palette.onAccent) } else { Label("Create household", systemImage: "arrow.right") }
                }
                .buttonStyle(.primary)
                .disabled(busy)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .pageBackground()
    }

    private func create() async {
        let trimmed = (name: name.trimmingCharacters(in: .whitespaces),
                       email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                       household: household.trimmingCharacters(in: .whitespaces))
        guard !trimmed.name.isEmpty, !trimmed.email.isEmpty, !trimmed.household.isEmpty else {
            error = "Add your name, your email and the household's name."
            return
        }
        guard password.count >= 8 else { error = "Passwords need at least 8 characters."; return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let auth = try await APIClient.shared.setUp(householdName: trimmed.household, displayName: trimmed.name,
                                                        email: trimmed.email, password: password)
            try await session.signIn(auth)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Sign in") {
    SignInView(session: Session())
}

#Preview("First-time setup") {
    FirstTimeSetup(session: Session())
}
