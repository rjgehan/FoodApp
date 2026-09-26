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
 Handing a recipe on — the web's Share sheet. Three ways, from the widest to the narrowest:
 a public link anybody can open without an account (and anybody with one can save a copy from),
 your other households, and Explore.

 Only the household that owns a recipe sees this. The household list is only ever the other
 houses you are in: sharing is moving a recipe between your own houses, and somebody outside
 them gets the link instead. Somebody in just the one house sees no list at all.
*/
struct RecipeShareSheet: View {
    @Binding var recipe: Recipe
    /// For previews and the Gallery: what the server would have said, so nothing is fetched.
    var sample: (targets: [ShareTarget], token: String?)?

    @Environment(\.dismiss) private var dismiss
    @State private var targets: [ShareTarget] = []
    @State private var token: String?
    @State private var loaded = false
    @State private var busy = false
    @State private var copied = false
    @State private var showQR = false
    @State private var turningOff = false
    @State private var error: String?

    private var url: URL? {
        // The web serves /r/<token>, from the same origin as the API in production.
        token.flatMap { URL(string: "\(Config.baseURL)/r/\($0)") }
    }

    var body: some View {
        NavigationStack {
            Form {
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    linkSection
                    if !targets.isEmpty { householdsSection }
                    exploreSection
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Share")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task { await load() }
            .confirmationDialog("Turn off the link?", isPresented: $turningOff, titleVisibility: .visible) {
                Button("Turn off the link", role: .destructive) { Task { await revoke() } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Anyone you sent it to won't be able to open it any more. Copies people already saved stay theirs.")
            }
        }
    }

    private var linkSection: some View {
        Section {
            if let url {
                Text(url.absoluteString)
                    .font(.footnote.monospaced())
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
                Button(copied ? "Copied" : "Copy link", systemImage: "doc.on.doc") {
                    UIPasteboard.general.string = url.absoluteString
                    copied = true
                    // Back to "Copy link" after a moment, as on the web, so a second copy
                    // later still gets its answer.
                    Task {
                        try? await Task.sleep(for: .seconds(2))
                        copied = false
                    }
                }
                ShareLink(item: url, subject: Text(recipe.name)) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                Button(showQR ? "Hide QR code" : "Show QR code", systemImage: "qrcode") {
                    withAnimation { showQR.toggle() }
                }
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
                Button("Turn off the link", systemImage: "xmark.circle", role: .destructive) {
                    turningOff = true
                }
                // The icon too: a destructive row otherwise draws it in the app's orange.
                .tint(.red)
                .disabled(busy)
            } else {
                Button("Create a link", systemImage: "link") {
                    Task { await createLink() }
                }
                .disabled(busy)
            }
        } header: {
            Text("Anyone with the link")
        } footer: {
            Text("Opens the recipe on its own — no account needed. Anyone with an account can save a copy to their own recipes.")
        }
    }

    private var householdsSection: some View {
        Section {
            ForEach($targets) { $target in
                Toggle(target.name, isOn: Binding(
                    get: { target.shared },
                    set: { on in Task { await setShared(target.householdId, on) } }
                ))
                .disabled(busy)
            }
        } header: {
            Text("Your other households")
        } footer: {
            Text("It shows up in their recipes too. Only this household can change it.")
        }
    }

    private var exploreSection: some View {
        Section {
            Toggle("In Explore", isOn: Binding(
                get: { recipe.published ?? false },
                set: { on in Task { await setPublished(on) } }
            ))
            .disabled(busy)
        } header: {
            Text("Explore")
        } footer: {
            Text((recipe.published ?? false)
                 ? "Anyone signed in here can read this and keep it in their own recipes."
                 : "Put it where every household on this server can find it.")
        }
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
            error = nil
        } catch {
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
    RecipeShareSheet(
        recipe: .constant(SampleData.recipes[0]),
        sample: ([ShareTarget(householdId: UUID(), name: "The Cabin", shared: true),
                  ShareTarget(householdId: UUID(), name: "Mum & Dad's", shared: false)],
                 "k3J9x_pQ2v8LmZr4TtYw0aBcDeFgHiJkLmNoPqRsTuV"))
}

#Preview("Share · one house, no link") {
    RecipeShareSheet(recipe: .constant(SampleData.recipes[0]), sample: ([], nil))
}
