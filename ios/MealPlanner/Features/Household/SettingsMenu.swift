import SwiftUI

/**
 Settings (mockup 6.1), opened from your initial on any screen: who you are, your household and
 the way to another, the ideas board, your theme and sign-in, and signing out. Below the
 mockup's rows, the two things only a phone has — what Apple Intelligence can do here, and
 which server it talks to.
 */
struct SettingsView: View {
    var session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var me: Me?
    @State private var switching = false
    @State private var ideas = false
    @State private var editingServer = false
    @State private var serverDraft = Config.baseURL
    @State private var serverProblem: String?
    @State private var household: Bool = false

    private var subtitle: String {
        let role = session.household.map { $0.isOwner ? "Owner" : "Member" }
        return [me?.email, role].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    HStack(spacing: 12) {
                        Avatar(session.displayName ?? "", tone: .accent, size: 56)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.displayName ?? "You").titleFont(22).foregroundStyle(Palette.text)
                                .accessibilityAddTraits(.isHeader)
                            if !subtitle.isEmpty {
                                Text(subtitle).font(.system(size: 13)).foregroundStyle(Palette.muted).lineLimit(2)
                            }
                        }
                        Spacer(minLength: 8)
                        // It arrives as a sheet, and a sheet needs a way out that is not a swipe.
                        IconButton("xmark", style: .plain, size: 32, label: "Close") { dismiss() }
                    }
                    .padding(.bottom, 4)

                    ListGroup {
                        // A page of its own over the whole screen, as the mockup draws it, rather than
                        // pushed inside this sheet with the Plan peeking above it. Its "‹ Settings"
                        // closes it, back onto this menu.
                        Button {
                            household = true
                        } label: {
                            ListRow("Household settings", subtitle: session.household?.name, chevron: true,
                                    tile: ("house", .herb))
                        }
                        if session.households.count > 1 {
                            Button {
                                switching = true
                            } label: {
                                ListRow("Switch household", subtitle: "\(session.households.count) households",
                                        chevron: true, tile: ("arrow.left.arrow.right", .sky))
                            }
                        }
                        if session.ideasBoard {
                            Button {
                                ideas = true
                            } label: {
                                ListRow("Ideas board", chevron: true, tile: ("lightbulb", .mustard)) {
                                    Pill("Beta", tone: .mustard)
                                }
                            }
                        }
                    }

                    ListGroup {
                        NavigationLink {
                            ThemeScreen()
                        } label: {
                            ListRow("Theme", detail: ThemeStore.shared.theme.summary, chevron: true,
                                    tile: ("paintpalette", .plum))
                        }
                        NavigationLink {
                            CredentialsScreen()
                        } label: {
                            ListRow("Password & sign-in", chevron: true, tile: ("key", .accent))
                        }
                    }

                    phoneOnly

                    ListGroup {
                        Button {
                            Task { await session.signOut() }
                        } label: {
                            ListRow("Sign out", titleColor: Palette.accentInk,
                                    tile: ("rectangle.portrait.and.arrow.right", .accent))
                        }
                    }
                }
                .buttonStyle(PressFade())
                .padding(.horizontal, 20)
                .padding(.top, 22)
                .padding(.bottom, 28)
            }
            .pageBackground()
            // The rows push their screens, whose back button says where they came from.
            .navigationTitle("Settings")
            .toolbar(.hidden, for: .navigationBar)
            .alert("Kitchen server", isPresented: $editingServer) {
                TextField(Config.fallback, text: $serverDraft)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                Button("Cancel", role: .cancel) { serverDraft = Config.baseURL }
                Button("Switch") { switchServer() }
            } message: {
                // The session belongs to the server that issued it, so this signs out. Said
                // up front rather than leaving somebody wondering why they are back at the PIN.
                Text("""
                Just the address is enough — meals.gehan.cloud. Moving to another server signs \
                you out, because your session belongs to this one.
                """)
            }
        }
        .kitchenSheet([.large])
        .fullScreenCover(isPresented: $household) {
            NavigationStack { HouseholdScreen(session: session) }
        }
        .task { me = try? await APIClient.shared.me() }
        .sheet(isPresented: $switching) { HouseholdPicker(session: session) }
        .sheet(isPresented: $ideas) { IdeasView(session: session) }
        // On the stack rather than on the scroll view: two .alert modifiers on one view fight over
        // which gets shown, and the one that loses simply never appears.
        .alert("That is not an address", isPresented: Binding(
            get: { serverProblem != nil },
            set: { shown in if !shown { serverProblem = nil } }
        )) {
            Button("OK") { serverProblem = nil }
        } message: {
            Text(serverProblem ?? "")
        }
        #if DEBUG
        .task {
            // -mp_debug_screen settings -mp_debug_scroll household|people|places|… opens Household
            // (and HouseholdScreen opens the page named), for screenshot runs.
            if let page = UserDefaults.standard.string(forKey: "mp_debug_scroll"), !page.isEmpty { household = true }
        }
        #endif
    }

    /**
     What only this phone has. The server address is changeable from here, not only from the
     sign-in screen: it used to be a button there, which meant the one moment you could point
     the app somewhere else was the one moment you were signed out.
     */
    private var phoneOnly: some View {
        ListGroup {
            Button {
                serverDraft = Config.baseURL
                editingServer = true
            } label: {
                ListRow("Server", subtitle: Config.baseURL, chevron: true, tile: ("server.rack", .sky))
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 12) {
                    // The same 40pt tile as Server and Gallery, so the column of tiles and titles
                    // runs straight down the group.
                    Tile("sparkles", tone: .plum)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Apple Intelligence").font(.rowTitle).foregroundStyle(Palette.text)
                        Text("Generating a cover photo needs the first one.")
                            .font(.rowSubtitle).foregroundStyle(Palette.muted)
                    }
                }
                AppleIntelligenceStatus()
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.text)
                    .padding(.leading, 52)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            #if DEBUG
            // The whole interface on sample data. A debug tool, so it lives here rather than
            // spending one of the five tabs.
            NavigationLink {
                GalleryView()
            } label: {
                ListRow("Gallery — every screen", chevron: true, tile: ("square.grid.2x2", .mustard))
            }
            #endif
        }
    }

    private func switchServer() {
        // "meals.gehan.cloud" is what anybody would type, and what used to be stored verbatim
        // and then fail every call. Config fills in the scheme and says no to the rest.
        guard let address = Config.address(from: serverDraft) else {
            serverProblem = "\(serverDraft.trimmingCharacters(in: .whitespaces)) is not a server address. "
                + "Try something like meals.gehan.cloud, or 192.168.1.10:8080."
            return
        }
        guard address != Config.baseURL else { return }
        Config.baseURL = address
        Task { await session.signOut() }
    }
}

#Preview("Settings") {
    Color.clear.sheet(isPresented: .constant(true)) {
        SettingsView(session: {
            let session = Session.preview
            session.households = [SampleData.household, SampleData.otherHousehold]
            return session
        }())
    }
}

#Preview("Settings — dark") {
    Color.clear.sheet(isPresented: .constant(true)) { SettingsView(session: .preview) }
        .preferredColorScheme(.dark)
}
