import SwiftUI

/**
 A recipe's public link — /r/<token> on this server — picked out of whatever was shared or pasted.

 Such a link is a page of the web app, not a recipe website: the importer would fetch an empty
 shell and find nothing in it. Recognised here, it is saved as a copy instead, the same as the
 web page's "Save to my recipes". Only the path matters, as with invite links: the same server
 answers at meals.gehan.cloud and at its LAN address. A token is 43 characters, which keeps
 somebody's Reddit link (reddit.com/r/<a name of at most 21>) from ever looking like one.
*/
enum SharedRecipeLink {
    static func token(in text: String?) -> String? {
        guard let text else { return nil }
        // A pasted sentence, or the share extension's "🔗" and a link: any word that is a link.
        for word in text.split(whereSeparator: { $0.isWhitespace || $0 == "\u{1F517}" }) {
            guard let url = URL(string: String(word)), url.scheme == "https" || url.scheme == "http" else { continue }
            let parts = url.path.split(separator: "/").map(String.init)
            guard parts.count == 2, parts[0] == "r" else { continue }
            let token = parts[1]
            if token.count >= 40, token.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }) {
                return token
            }
        }
        return nil
    }

    /// Saves it into the household the app is on. A 404 means the sender turned the link off.
    static func save(token: String, household: UUID) async throws -> Recipe {
        do {
            return try await APIClient.shared.saveSharedRecipe(token: token, household: household)
        } catch let failure as APIError where failure.status == 404 {
            throw TurnedOff()
        }
    }

    struct TurnedOff: LocalizedError {
        var errorDescription: String? { "This link has been turned off, so it can't be saved any more." }
    }
}

/**
 Handing a recipe on (the mockup's 3.12), pushed from the recipe as "Share": from the widest to
 the narrowest, a public link anybody can open without an account (and anybody with one can save
 a copy from), your other households, and Explore. Every switch takes effect when it is flipped;
 the two that break links already sent — turning the link off, making a new one — ask first.

 Only the household that owns a recipe sees this. The household list is only ever the other
 houses you are in: sharing is moving a recipe between your own houses, and somebody outside
 them gets the link instead. Somebody in just the one house sees no list at all.
*/
struct RecipeShareSheet: View {
    @Binding var recipe: Recipe
    /// For previews and the Gallery: what the server would have said, so nothing is fetched.
    var sample: (targets: [ShareTarget], token: String?)?

    @State private var targets: [ShareTarget] = []
    @State private var token: String?
    @State private var loaded = false
    @State private var busy = false
    @State private var copied = false
    @State private var showQR = false
    @State private var asking: Ask?
    @State private var error: String?

    enum Ask { case turnOff, newLink }

    private static let houseTones: [Tone] = [.sky, .plum, .herb, .mustard, .accent]

    private var url: URL? {
        // The web serves /r/<token>, from the same origin as the API in production.
        token.flatMap { URL(string: "\(Config.baseURL)/r/\($0)") }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    linkCard
                    if !targets.isEmpty { households }
                    ListGroup {
                        switchRow("Publish to Explore", subtitle: "Any household on this server can find it",
                                  isOn: recipe.published ?? false) { Tile("globe", tone: .herb, size: 36) } set: { on in
                            Task { await setPublished(on) }
                        }
                    }
                }
                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .centeredTitle("Share")
        .toolbar(.visible, for: .navigationBar)
        .task { await load() }
        .kitchenAlert(isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } })) {
            if asking == .newLink {
                KitchenAlertCard(title: "Make a new link?",
                                 message: Text("The old link will stop working for anyone you've sent it to."), centered: true) {
                    HStack(spacing: 8) {
                        Button("Cancel") { asking = nil }.buttonStyle(.secondary)
                        Button("New link") { Task { await renew() } }.buttonStyle(.primary).disabled(busy)
                    }
                }
            } else {
                KitchenAlertCard(title: "Turn off the link?",
                                 message: Text("Anyone you sent it to won't be able to open it any more. Copies people already saved stay theirs."),
                                 centered: true) {
                    HStack(spacing: 8) {
                        Button("Cancel") { asking = nil }.buttonStyle(.secondary)
                        Button("Turn off") { Task { await revoke() } }.buttonStyle(.primary).disabled(busy)
                    }
                }
            }
        }
    }

    private var linkCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            switchRow("Public link", subtitle: "Anyone with it can view", isOn: token != nil, padded: false) {
                Tile("link", tone: .accent, size: 36)
            } set: { on in
                if on { Task { await createLink() } } else { asking = .turnOff }
            }
            if let url {
                HStack(spacing: 8) {
                    Text(url.absoluteString.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: ""))
                        .font(.system(size: 14))
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button {
                        UIPasteboard.general.string = url.absoluteString
                        copied = true
                        // Back to the copy mark after a moment, so a second copy gets its answer.
                        Task {
                            try? await Task.sleep(for: .seconds(2))
                            copied = false
                        }
                    } label: {
                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(copied ? Palette.herb : Palette.accentInk)
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(PressFade())
                    .accessibilityLabel(copied ? "Copied" : "Copy link")
                }
                .padding(.leading, 12)
                .padding(.trailing, 4)
                .padding(.vertical, 4)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                HStack(spacing: 8) {
                    ShareLink(item: url, subject: Text(recipe.name)) {
                        Label("Share link", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.kitchen(.primary, size: .small))
                    Button { asking = .newLink } label: { Label("New link", systemImage: "arrow.clockwise") }
                        .buttonStyle(.kitchen(.secondary, size: .small))
                        .disabled(busy)
                }

                Button {
                    withAnimation { showQR.toggle() }
                } label: {
                    Label(showQR ? "Hide QR code" : "Show QR code", systemImage: "qrcode")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Palette.accentInk)
                }
                .buttonStyle(PressFade())
                if showQR, let qr = QRCode.image(for: url.absoluteString) {
                    Image(uiImage: qr)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 220)
                        .padding(8)
                        .background(.white, in: RoundedRectangle(cornerRadius: 12))
                        .frame(maxWidth: .infinity)
                        .accessibilityLabel("QR code of the link")
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private var households: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Share into your other households")
            ListGroup {
                ForEach(Array(targets.enumerated()), id: \.element.id) { i, target in
                    switchRow(target.name, subtitle: target.shared ? "Shows in their Shared with you" : nil, isOn: target.shared) {
                        Avatar(target.name, tone: Self.houseTones[i % Self.houseTones.count], size: 36)
                    } set: { on in
                        Task { await setShared(target.householdId, on) }
                    }
                }
            }
        }
    }

    /// A row that is its own switch, with what leads it, a title and a line under it.
    private func switchRow<Lead: View>(_ title: String, subtitle: String?, isOn: Bool, padded: Bool = true,
                                       @ViewBuilder lead: () -> Lead, set: @escaping (Bool) -> Void) -> some View {
        Toggle(isOn: Binding(get: { isOn }, set: set)) {
            HStack(spacing: 12) {
                lead()
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(1)
                    if let subtitle {
                        Text(subtitle).font(.system(size: 13)).foregroundStyle(Palette.muted).lineLimit(1)
                    }
                }
            }
        }
        .toggleStyle(.herb)
        .disabled(busy)
        .padding(.horizontal, padded ? 16 : 0)
        .padding(.vertical, padded ? 12 : 0)
    }

    private func load() async {
        if let sample {
            targets = sample.targets
            token = sample.token
            loaded = true
            return
        }
        do {
            async let houses = APIClient.shared.shareTargets(recipe: recipe.id)
            async let link = APIClient.shared.publicLink(recipe: recipe.id)
            targets = try await houses
            token = try await link.token
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    private func createLink() async {
        busy = true
        defer { busy = false }
        do {
            token = try await APIClient.shared.createPublicLink(recipe: recipe.id).token
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func revoke() async {
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.revokePublicLink(recipe: recipe.id)
            token = nil
            copied = false
            showQR = false
            asking = nil
            error = nil
        } catch {
            asking = nil
            self.error = error.localizedDescription
        }
    }

    /// A different address: the old one turned off, a fresh one made.
    private func renew() async {
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.revokePublicLink(recipe: recipe.id)
            token = nil
            token = try await APIClient.shared.createPublicLink(recipe: recipe.id).token
            asking = nil
            error = nil
        } catch {
            asking = nil
            self.error = error.localizedDescription
        }
    }

    /// Only your own houses are sent; a share somebody else made, into a house you are not in,
    /// is left where it is by the server.
    private func setShared(_ household: UUID, _ on: Bool) async {
        let before = targets
        if let i = targets.firstIndex(where: { $0.householdId == household }) { targets[i].shared = on }
        busy = true
        defer { busy = false }
        do {
            let saved = try await APIClient.shared.setShares(
                recipe: recipe.id, households: targets.filter(\.shared).map(\.householdId))
            recipe.sharedWith = saved.sharedWith
            error = nil
        } catch {
            targets = before
            self.error = error.localizedDescription
        }
    }

    private func setPublished(_ on: Bool) async {
        busy = true
        defer { busy = false }
        do {
            // Only the switch is taken from the answer. The recipe on screen already has its
            // drawer and groups, and Edit starts from it: an answer without them (an older
            // server sent none) would otherwise be saved as Dinner with no groups.
            recipe.published = try await APIClient.shared.setPublished(recipe: recipe.id, published: on).published
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Share · link and houses") {
    NavigationStack {
        RecipeShareSheet(
            recipe: .constant(SampleData.recipes[0]),
            sample: ([ShareTarget(householdId: UUID(), name: "Beach crew", shared: true),
                      ShareTarget(householdId: UUID(), name: "Uni flat", shared: false)],
                     "k3J9x_pQ2v8LmZr4TtYw0aBcDeFgHiJkLmNoPqRsTuV"))
    }
}

#Preview("Share · one house, no link — dark") {
    NavigationStack {
        RecipeShareSheet(recipe: .constant(SampleData.recipes[0]), sample: ([], nil))
    }
    .preferredColorScheme(.dark)
}
