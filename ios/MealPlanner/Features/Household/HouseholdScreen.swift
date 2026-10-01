import SwiftUI

/**
 The household (mockup 6.2): the way to invite somebody, who is here and how each of them signs
 in, and the house's own setup — places, name and servings, aisles, recipe icons — then the two
 ways to another house and the way out of this one.

 Reached from Settings, behind your own face. The owner can tap anybody else for what they can
 do for them: a password-reset link, or taking them out.

 The `sample…` values draw it from sample data (the Gallery, #Previews) without a server.
 */
struct HouseholdScreen: View {
    var session: Session
    var samplePeople: [HouseholdMember]?
    var sampleInvite: InviteLink?
    var samplePlaces: [Place]?
    var sampleAisles: [GroceryCategory]?

    @State private var people: [HouseholdMember] = []
    @State private var loaded = false
    @State private var invite: InviteLink?
    @State private var inviteError: String?
    @State private var places: [Place]?
    @State private var aisles: [GroceryCategory]?
    @State private var showingQR = false
    @State private var actionsFor: HouseholdMember?
    @State private var leaving = false
    @State private var typedName = ""
    @State private var busy = false
    @State private var error: String?
    @State private var scanning = false
    @State private var pushed: Pushed?

    /// The pages this one opens, so a debug launch can open one straight away.
    enum Pushed: String, Hashable { case places, setup, aisles, icons, new }

    private var alone: Bool { people.count <= 1 }
    private var name: String { session.household?.name ?? "this household" }
    private var isOwner: Bool { session.household?.isOwner == true }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HouseholdInviteCard(name: name, link: invite.flatMap { HouseholdLinks.invite($0.token) }, error: inviteError) {
                    showingQR = true
                }

                SectionLabel(loaded ? "Who's here · \(people.count)" : "Who's here")
                    .padding(.top, 4)
                    .padding(.bottom, -6)
                ListGroup {
                    if !loaded {
                        ListRow("Loading…").redacted(reason: .placeholder)
                    }
                    ForEach(Array(people.enumerated()), id: \.element.id) { index, person in
                        personRow(person, tone: PersonTone.at(index))
                    }
                }

                SectionLabel("Household setup")
                    .padding(.top, 4)
                    .padding(.bottom, -6)
                ListGroup {
                    setupRow(.places, "Places we eat", detail: places.map { "\($0.count)" }, tile: ("storefront", .plum))
                    setupRow(.setup, "Name, servings & planning", detail: basicsDetail, tile: ("house", .herb))
                    setupRow(.aisles, "Store aisles", detail: aisles.map { "\($0.count)" }, tile: ("list.bullet", .sky))
                    setupRow(.icons, "Recipe icons", detail: nil, tile: ("photo", .mustard))
                }

                ListGroup {
                    Button {
                        scanning = true
                    } label: {
                        ListRow("Join a household", chevron: true, tile: ("link", .sky))
                    }
                    .buttonStyle(PressFade())
                    setupRow(.new, "Start another household", detail: nil, tile: ("plus", .herb))
                }
                .padding(.top, 14)

                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }

                // Alone in a household, leaving is not a thing you can do — there would be
                // nobody left to let you back in — so the row offers the only exit that exists.
                ListGroup {
                    Button {
                        typedName = ""
                        leaving = true
                    } label: {
                        ListRow(alone ? "Delete “\(name)”" : "Leave “\(name)”",
                                subtitle: alone ? "You're the only one here" : "Everything stays here for everyone else",
                                titleColor: Palette.accentInk,
                                tile: (alone ? "trash" : "door.left.hand.open", .accent))
                    }
                    .buttonStyle(PressFade())
                    .disabled(!loaded)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 28)
        }
        .pageBackground()
        // "Household" is what the pages under this one say to come back; the bar shows the name.
        .navigationTitle("Household")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(name).font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(1)
            }
        }
        .navigationDestination(item: $pushed) { page in
            switch page {
            case .places: PlacesScreen(session: session, sample: samplePlaces)
            case .setup: HouseholdBasicsScreen(session: session)
            case .aisles: AislesScreen(session: session, sample: sampleAisles)
            case .icons: RecipeIconsScreen(session: session)
            case .new: NewHouseholdScreen(session: session)
            }
        }
        .task { await load() }
        .onChange(of: pushed) { if pushed == nil { Task { await loadCounts() } } }
        .fullScreenCover(isPresented: $scanning) { ScanInviteScreen(session: session) }
        .sheet(isPresented: $showingQR) {
            if let invite {
                InviteQRSheet(session: session, people: people.count, link: invite) { fresh in
                    self.invite = fresh
                }
            }
        }
        .sheet(item: $actionsFor) { member in
            MemberSheet(session: session, member: member,
                        tone: PersonTone.at(people.firstIndex(of: member) ?? 0)) {
                people.removeAll { $0.userId == member.userId }
                // Taking somebody out replaces the invite link; fetch the new one.
                Task {
                    await loadInvite()
                    // The count on the house decides between Leave and Delete.
                    await session.loadHouseholds()
                }
            }
        }
        .alert(alone ? "Delete this household" : "Leave this household", isPresented: $leaving) {
            if alone {
                // Irreversible, and it takes years of recipes with it. Typing the name is the
                // difference between this and walking out of a house somebody else lives in.
                TextField(name, text: $typedName)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            Button("Cancel", role: .cancel) {}
            Button(alone ? "Delete for good" : "Leave", role: .destructive) {
                Task { await leave() }
            }
            .disabled(busy || (alone && !nameMatches))
        } message: {
            Text(warning)
        }
    }

    private var basicsDetail: String? {
        guard let household = session.household else { return nil }
        let servings = household.defaultServings ?? 4
        let days = household.planningHorizonDays ?? 7
        return "\(servings) · \(days) \(days == 1 ? "day" : "days")"
    }

    @ViewBuilder
    private func personRow(_ person: HouseholdMember, tone: Tone) -> some View {
        let you = person.userId == session.userId
        let canAct = isOwner && !you
        let row = ListRow(you ? "\(person.shown) (you)" : person.shown,
                          subtitle: person.role == "OWNER" ? "Owner" : person.username,
                          chevron: canAct,
                          leading: { Avatar(person.shown, tone: tone, size: 38) },
                          trailing: { SignInPill(member: person) })
        if canAct {
            Button { actionsFor = person } label: { row }
                .buttonStyle(PressFade())
                .accessibilityHint("What you can do for them")
        } else {
            row
        }
    }

    private func setupRow(_ page: Pushed, _ title: String, detail: String?, tile: (String, Tone)) -> some View {
        Button {
            pushed = page
        } label: {
            ListRow(title, detail: detail, chevron: true, tile: tile)
        }
        .buttonStyle(PressFade())
    }

    private var warning: String {
        if alone {
            return "You are the only one in “\(name)”, so there is nobody to leave it to. "
                + "Deleting it takes its recipes, plan, grocery list, cupboard and photos "
                + "with it, for good. Type the name to confirm."
        }
        return "You'll lose access to “\(name)”. Its recipes, plan and grocery list stay "
            + "with everyone else, and you can be invited back with a new link."
    }

    private var nameMatches: Bool {
        typedName.trimmingCharacters(in: .whitespaces).caseInsensitiveCompare(name) == .orderedSame
    }

    private func load() async {
        if let samplePeople {
            people = samplePeople
            invite = sampleInvite
            places = samplePlaces
            aisles = sampleAisles
            loaded = true
            return
        }
        guard let household = session.household?.id else { loaded = true; return }
        // The members endpoint rather than the sign-in screen's roster, which goes away when the
        // PIN screens are switched off — and which knows nothing of emails or roles.
        if let all = try? await APIClient.shared.members(household: household) {
            // You first, then whoever owns the place, then everyone else as the server lists them.
            let rank: (HouseholdMember) -> Int = { $0.userId == session.userId ? 0 : $0.role == "OWNER" ? 1 : 2 }
            people = all.enumerated().sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }.map(\.element)
        }
        loaded = true
        await loadInvite()
        await loadCounts()
        #if DEBUG
        debugOpen()
        #endif
    }

    private func loadInvite() async {
        guard sampleInvite == nil, let household = session.household?.id else { return }
        do {
            invite = try await APIClient.shared.invite(household: household)
            inviteError = nil
        } catch {
            inviteError = error.localizedDescription
        }
    }

    private func loadCounts() async {
        guard samplePeople == nil, let household = session.household?.id else { return }
        async let p = try? APIClient.shared.places(household: household)
        async let a = try? APIClient.shared.categories(household: household)
        let (fetchedPlaces, fetchedAisles) = await (p, a)
        if let fetchedPlaces { places = fetchedPlaces }
        if let fetchedAisles { aisles = fetchedAisles }
    }

    #if DEBUG
    @MainActor private static var debugOpened = false

    /// -mp_debug_screen household with -mp_debug_scroll places|setup|aisles|icons opens that
    /// page, `qr` the invite's code, and `member` the first other person's sheet (add
    /// -mp_debug_expand 1 for a reset link on it), for screenshot runs.
    private func debugOpen() {
        // Launch arguments cannot be removed from the defaults, so this remembers it has run.
        guard !Self.debugOpened, let wanted = UserDefaults.standard.string(forKey: "mp_debug_scroll") else { return }
        Self.debugOpened = true
        if let page = Pushed(rawValue: wanted) { pushed = page }
        if wanted == "qr" { showingQR = true }
        if wanted == "member" { actionsFor = people.first { $0.userId != session.userId } }
    }
    #endif

    private func leave() async {
        guard let household = session.household?.id, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            if alone {
                try await APIClient.shared.deleteHousehold(household)
            } else {
                try await APIClient.shared.leaveHousehold(household)
            }
            // Whichever it was, this session no longer belongs anywhere: start again.
            await session.signOut()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Invite someone

/**
 The tomato card at the top (mockup 6.2): who can join, and the two ways to hand the link over —
 the share sheet, or the code on screen for somebody across the kitchen.
 */
struct HouseholdInviteCard: View {
    let name: String
    let link: URL?
    var error: String?
    let showQR: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "person.2").font(.system(size: 18, weight: .medium))
                Text("Invite someone").font(.system(size: 17, weight: .semibold))
                    .accessibilityAddTraits(.isHeader)
            }
            Text("Anyone with the link can join \(name).")
                .font(.system(size: 13))
                .opacity(0.9)
            if let error {
                Text(error).font(.system(size: 13)).padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.white.opacity(0.2), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            } else {
                HStack(spacing: 8) {
                    Group {
                        if let link {
                            ShareLink(item: link, subject: Text("Join \(name) on Meal Planner")) {
                                face("Share link", "square.and.arrow.up", fill: .white, ink: Palette.accentInk)
                            }
                        } else {
                            face("Share link", "square.and.arrow.up", fill: .white, ink: Palette.accentInk)
                                .opacity(0.6)
                        }
                    }
                    Button(action: showQR) {
                        face("Show QR", "qrcode", fill: .white.opacity(0.2), ink: Palette.onAccent)
                    }
                    .disabled(link == nil)
                }
                .buttonStyle(PressFade())
            }
        }
        .foregroundStyle(Palette.onAccent)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.accent, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: Palette.shadow, radius: 4, y: 2)
    }

    /// The mockup's small button (`btn sm`): 36pt, 11pt corners, 14pt semibold.
    private func face(_ title: String, _ symbol: String, fill: Color, ink: Color) -> some View {
        Label(title, systemImage: symbol)
            .font(.system(size: 14, weight: .semibold))
            .labelStyle(HouseholdButtonLabel())
            .foregroundStyle(ink)
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(fill, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }
}

/// An icon beside its title with the mockup's 8pt gap.
struct HouseholdButtonLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { configuration.icon; configuration.title }
    }
}

/**
 Scan to join (mockup 6.3): the code, the link under it with its copy button, Share link, and —
 for the owner only — Replace link, which asks first because it stops the old one working for
 everyone it was sent to.
 */
struct InviteQRSheet: View {
    var session: Session
    let people: Int
    let link: InviteLink
    /// The new link, once the owner has replaced it.
    let replaced: (InviteLink) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var current: InviteLink?
    @State private var confirming = false
    @State private var error: String?

    private var shown: InviteLink { current ?? link }
    private var name: String { session.household?.name ?? "this household" }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                SheetHeader("Scan to join", subtitle: "\(name) · \(people) \(people == 1 ? "person" : "people")",
                            onClose: { dismiss() })
                if let url = HouseholdLinks.invite(shown.token) {
                    VStack(spacing: 12) {
                        QRTile(url: url)
                        LinkWell(url: url).frame(maxWidth: 300)
                        if let expires = shown.expires {
                            Text("Works until \(expires.formatted(.dateTime.weekday(.wide).month(.wide).day())).")
                                .font(.system(size: 12)).foregroundStyle(Palette.muted)
                        }
                    }
                    .padding(.vertical, 6)
                    ShareLink(item: url, subject: Text("Join \(name) on Meal Planner")) {
                        Label("Share link", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.primary)
                }
                if session.household?.isOwner == true {
                    Button {
                        confirming = true
                    } label: {
                        Label("Replace link", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(.danger)
                    Text("Replacing stops the old link and QR working.")
                        .font(.system(size: 12)).foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center)
                        .padding(.top, -6)
                }
                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .kitchenSheet([.large])
        .alert("Replace the invite link?", isPresented: $confirming) {
            Button("Cancel", role: .cancel) {}
            Button("Replace link", role: .destructive) { Task { await replace() } }
        } message: {
            Text("The link you have now stops working, for everyone it was sent to. Nobody already in the house is affected.")
        }
    }

    private func replace() async {
        guard let household = session.household?.id else { return }
        do {
            try await APIClient.shared.revokeInvite(household: household)
            let fresh = try await APIClient.shared.invite(household: household)
            current = fresh
            replaced(fresh)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Somebody else in the house

/**
 What the owner can do for somebody else (mockup 6.4): make them a password-reset link, or take
 them out.

 A forgotten password, without email: the owner makes a one-time link and hands it over — a
 message, or the code held up in the kitchen. Each new link cancels the one before, so it is made
 when asked for rather than when the sheet opens. Taking somebody out asks first, and replaces
 the invite link too — they have seen it, as everyone in the house has.
 */
struct MemberSheet: View {
    var session: Session
    let member: HouseholdMember
    let tone: Tone
    /// They are out; the screen behind takes them off its list.
    let removed: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var resetLink: URL?
    @State private var making = false
    @State private var showQR = false
    @State private var removing = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Avatar(member.shown, tone: tone, size: 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(member.shown).titleFont(22).foregroundStyle(Palette.text)
                            .accessibilityAddTraits(.isHeader)
                        Text("\(member.signInSentence) · \(member.username)")
                            .font(.system(size: 13)).foregroundStyle(Palette.muted)
                    }
                    Spacer(minLength: 8)
                    IconButton("xmark", style: .plain, size: 32, label: "Close") { dismiss() }
                }

                ListGroup {
                    Button {
                        Task { await makeResetLink() }
                    } label: {
                        ListRow(making ? "Making a link…" : "Create password-reset link",
                                subtitle: "Cancels any earlier link", chevron: true, tile: ("key", .accent))
                    }
                    .buttonStyle(PressFade())
                    .disabled(making)
                }

                if let resetLink {
                    Card(spacing: 10) {
                        HStack {
                            Text("Reset link ready").font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Palette.text)
                            Spacer()
                            Pill("Works once", tone: .herb)
                        }
                        LinkWell(url: resetLink)
                        Text("It lets \(member.shown) choose a new password"
                             + (member.hasEmail == false ? " and add their email" : "")
                             + ", then signs them in. It works once, for 24 hours.")
                            .font(.system(size: 12)).foregroundStyle(Palette.muted)
                        ShareLink(item: resetLink, subject: Text("Reset your Meal Planner password")) {
                            Label("Send to \(member.shown)", systemImage: "paperplane")
                        }
                        .buttonStyle(.kitchen(.soft, size: .small, fill: true))
                        if showQR {
                            QRTile(url: resetLink, size: 200).frame(maxWidth: .infinity)
                        } else {
                            Button {
                                showQR = true
                            } label: {
                                Label("Show QR code", systemImage: "qrcode")
                            }
                            .buttonStyle(.kitchen(.ghost, size: .small, fill: true))
                        }
                    }
                }

                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }

                ListGroup {
                    Button {
                        removing = true
                    } label: {
                        ListRow("Remove from household", subtitle: "Also replaces the invite link",
                                titleColor: Palette.accentInk, tile: ("trash", .accent))
                    }
                    .buttonStyle(PressFade())
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .kitchenSheet([.large])
        .confirmationDialog("Remove \(member.shown)?", isPresented: $removing, titleVisibility: .visible) {
            Button("Remove \(member.shown)", role: .destructive) { Task { await remove() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("\(member.shown) loses access to “\(session.household?.name ?? "this household")” straight away. "
                 + "Everything they added stays. The invite link is replaced too, so the one they have stops working — "
                 + "they can only come back if somebody sends them the new one.")
        }
        #if DEBUG
        .task {
            if !Self.debugExpanded, UserDefaults.standard.string(forKey: "mp_debug_expand") == "1" {
                Self.debugExpanded = true
                await makeResetLink()
            }
        }
        #endif
    }

    #if DEBUG
    @MainActor private static var debugExpanded = false
    #endif

    private func makeResetLink() async {
        guard !making, let household = session.household?.id else { return }
        making = true
        defer { making = false }
        do {
            let made = try await APIClient.shared.makePasswordReset(household: household, user: member.userId)
            resetLink = HouseholdLinks.reset(made.token)
            showQR = false
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove() async {
        guard let household = session.household?.id else { return }
        do {
            try await APIClient.shared.removeMember(household: household, user: member.userId)
            removed()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Household") {
    NavigationStack {
        HouseholdScreen(session: .preview, samplePeople: SampleData.people, sampleInvite: SampleData.invite,
                        samplePlaces: SampleData.places, sampleAisles: SampleData.storeAisles)
    }
}

#Preview("Household — dark") {
    NavigationStack {
        HouseholdScreen(session: .preview, samplePeople: SampleData.people, sampleInvite: SampleData.invite,
                        samplePlaces: SampleData.places, sampleAisles: SampleData.storeAisles)
    }
    .preferredColorScheme(.dark)
}

#Preview("Scan to join") {
    Color.clear.sheet(isPresented: .constant(true)) {
        InviteQRSheet(session: .preview, people: 4, link: SampleData.invite) { _ in }
    }
}

#Preview("Member") {
    Color.clear.sheet(isPresented: .constant(true)) {
        MemberSheet(session: .preview, member: SampleData.people[2], tone: .sky) {}
    }
}
