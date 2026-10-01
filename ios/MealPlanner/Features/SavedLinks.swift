import SwiftUI

/**
 The recipes that are still only links — the TikToks, Reels and pages you mean to make — as a
 wall of their pictures, the way you remember them. The web's Saved links page.

 Tapping one opens it where it lives: a TikTok link opens the TikTok app when the phone has it.
 Everything else is behind its •••: plan it, make it a recipe, tidy it, or delete it.
*/
struct SavedLinksView: View {
    var session: Session
    /// Shown instead of asking the server, for previews.
    var sample: [SavedLink]?
    /// Something changed — the count on the Recipes tile is out of date.
    var onChanged: () async -> Void = {}

    @Environment(\.openURL) private var openURL
    @State private var links: [SavedLink]?
    @State private var error: String?
    @State private var query = ""
    @State private var source: SavedLinkSource?
    @State private var drawer: RecipeSection?
    @State private var adding = false
    @State private var planning: SavedLink?
    @State private var importing: SavedLink?
    @State private var making: LinkDraft?
    @State private var renaming: SavedLink?
    @State private var newName = ""
    @State private var deleting: SavedLink?
    @State private var notice: String?

    /// A recipe being started from a link, for `sheet(item:)`.
    struct LinkDraft: Identifiable {
        let id = UUID()
        let draft: RecipeDraft
        let section: RecipeSection?
    }

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    private var all: [SavedLink] { links ?? [] }

    /// Filters only for what there is: one kind of link, or none filed, is nothing to choose between.
    private var sources: [SavedLinkSource] {
        [.tiktok, .instagram, .web].filter { kind in all.contains { $0.source == kind } }
    }
    private var drawers: [RecipeSection] {
        RecipeSection.allCases.filter { section in all.contains { $0.section == section } }
    }

    private var shown: [SavedLink] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return all.filter {
            (source == nil || $0.source == source)
                && (drawer == nil || $0.section == drawer)
                && (q.isEmpty || $0.name.lowercased().contains(q) || $0.sourceLabel.lowercased().contains(q))
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let error {
                    Text(error).foregroundStyle(Palette.danger).font(.callout)
                }
                if let notice {
                    Label(notice, systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Palette.herb)
                        .transition(.opacity)
                }
                if sources.count > 1 || !drawers.isEmpty {
                    filters
                }

                if links == nil && error == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 48)
                } else if all.isEmpty {
                    ContentUnavailableView {
                        Label("Nothing saved yet", image: "SavedLinks")
                    } description: {
                        Text("Keep the TikToks, Reels and recipe pages you mean to make. When a link won’t come through as a recipe, save it here instead — and make it a recipe later.")
                    } actions: {
                        Button("Save a link") { adding = true }
                            .buttonStyle(.borderedProminent)
                    }
                    .padding(.top, 32)
                } else if shown.isEmpty {
                    ContentUnavailableView.search(text: query)
                } else {
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(shown) { link in
                            ZStack(alignment: .topTrailing) {
                                Button {
                                    if let url = URL(string: link.url) { openURL(url) }
                                } label: {
                                    SavedLinkTile(link: link)
                                }
                                .buttonStyle(.plain)
                                .accessibilityHint("Opens it")
                                menu(for: link)
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .pageBackground()
        .navigationTitle("Saved links")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $query, prompt: "Search saved links")
        .refreshable { await load() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save a link", systemImage: "plus") { adding = true }
            }
        }
        .task { await load() }
        .sheet(isPresented: $adding) {
            SaveLinkSheet(session: session) { saved in
                links = [saved] + all.filter { $0.id != saved.id }
                say(saved.alreadySaved == true ? "“\(saved.name)” was already saved." : "Saved “\(saved.name)”.")
                Task { await onChanged() }
            }
        }
        .sheet(item: $planning) { link in
            AddToPlanSheet(savedLink: link, session: session) { when in
                say("On the plan for \(when).")
            }
        }
        .sheet(item: $importing) { link in
            SavedLinkImportSheet(link: link, session: session) { _ in
                Task { await madeARecipe() }
            }
        }
        .sheet(item: $making) { made in
            EditRecipeView(recipe: nil, session: session, draft: made.draft, initialSection: made.section) { _ in
                Task { await madeARecipe() }
            }
        }
        .alert("Rename", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $newName)
            Button("Save") {
                if let link = renaming { Task { await update(link, name: newName) } }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Delete “\(deleting?.name ?? "")”?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let link = deleting { Task { await delete(link) } }
            }
        } message: {
            Text((deleting?.personal == true
                  ? "It’s only yours, so nobody else will notice."
                  : "It comes off Saved links for everyone in the household.")
                 + " If it’s on the plan, the meal stays there by name.")
        }
    }

    /// Where it is from, then which drawer: one row, the way the web has it.
    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip("All", on: source == nil && drawer == nil) {
                    source = nil
                    drawer = nil
                }
                if sources.count > 1 {
                    ForEach(sources, id: \.self) { kind in
                        chip(SavedLink.label(source: kind, url: nil) == "Website" ? "Websites" : SavedLink.label(source: kind, url: nil),
                             on: source == kind) {
                            source = source == kind ? nil : kind
                        }
                    }
                }
                if sources.count > 1 && !drawers.isEmpty {
                    Divider().frame(height: 22)
                }
                ForEach(drawers, id: \.self) { section in
                    chip(section.title, on: drawer == section) {
                        drawer = drawer == section ? nil : section
                    }
                }
            }
        }
        .scrollClipDisabled()
    }

    private func chip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(on ? .semibold : .regular))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(on ? Palette.accent : Palette.surface2, in: Capsule())
                .foregroundStyle(on ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// The ways on first, then tidying, then the one that cannot be undone.
    private func menu(for link: SavedLink) -> some View {
        Menu {
            Button("Plan it", systemImage: "calendar.badge.plus") { planning = link }
            Button("Make it a recipe", systemImage: "square.and.pencil") { making = draft(from: link) }
            Button("Try importing again", systemImage: "arrow.down.doc") { importing = link }
            Divider()
            Button("Rename", systemImage: "pencil") {
                newName = link.name
                renaming = link
            }
            Picker("Move to a drawer", systemImage: "tray", selection: Binding(
                get: { link.section },
                set: { section in Task { await move(link, to: section) } }
            )) {
                Text("No drawer").tag(RecipeSection?.none)
                ForEach(RecipeSection.allCases, id: \.self) { Text($0.title).tag(Optional($0)) }
            }
            .pickerStyle(.menu)
            // Only whoever saved it: hiding somebody else's link would hide it from you too.
            if link.mine {
                Toggle("Just me", systemImage: "lock", isOn: Binding(
                    get: { link.personal },
                    set: { on in Task { await update(link, personal: on) } }
                ))
            }
            Divider()
            Button("Delete", systemImage: "trash", role: .destructive) { deleting = link }
        } label: {
            Image(systemName: "ellipsis")
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(.black.opacity(0.45), in: Circle())
                .padding(6)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("More for \(link.name)")
    }

    /// The name, the link and its picture, for typing out the rest.
    private func draft(from link: SavedLink) -> LinkDraft {
        LinkDraft(draft: RecipeDraft(
            name: link.name,
            description: nil,
            servings: session.defaultServings ?? 4,
            prep: 0,
            cook: 0,
            instructions: "",
            ingredients: [],
            links: [SourceLink(url: link.url, label: nil)],
            note: "Made from your saved link. Fill in what it needs, then save — it comes off Saved links once it’s a recipe.",
            coverImageId: link.coverImageId,
            savedLinkId: link.id
        ), section: link.section)
    }

    private func say(_ text: String) {
        withAnimation { notice = text }
        Task {
            try? await Task.sleep(for: .seconds(4))
            withAnimation { if notice == text { notice = nil } }
        }
    }

    private func load() async {
        if let sample {
            links = sample
            return
        }
        guard let household = session.household?.id else { return }
        do {
            error = nil
            links = try await APIClient.shared.savedLinks(household: household)
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Saving the recipe took the link off the server's list; the list and the tile catch up.
    private func madeARecipe() async {
        await load()
        await onChanged()
        say("It’s a recipe now.")
    }

    private func replace(_ link: SavedLink) {
        links = all.map { $0.id == link.id ? link : $0 }
    }

    private func update(_ link: SavedLink, name: String? = nil, personal: Bool? = nil) async {
        guard let household = session.household?.id else { return }
        do {
            error = nil
            let updated = try await APIClient.shared.updateSavedLink(
                household: household, link: link.id,
                name: name?.trimmingCharacters(in: .whitespacesAndNewlines), personal: personal)
            replace(updated)
            if let personal {
                say(personal ? "Only you can see it now." : "Everyone in the household can see it now.")
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func move(_ link: SavedLink, to section: RecipeSection?) async {
        guard let household = session.household?.id else { return }
        do {
            error = nil
            replace(try await APIClient.shared.updateSavedLink(
                household: household, link: link.id, section: section, clearSection: section == nil))
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ link: SavedLink) async {
        guard let household = session.household?.id else { return }
        do {
            error = nil
            try await APIClient.shared.deleteSavedLink(household: household, link: link.id)
            links = all.filter { $0.id != link.id }
            await onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One link as its picture — the video's cover or the page's photo — with where it is from on
/// it, and what it is called underneath.
struct SavedLinkTile: View {
    let link: SavedLink

    private var detail: String? {
        let parts = [link.section?.title, link.mine ? nil : link.savedByName.map { "from \($0)" }].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Palette.cover(for: link.id.uuidString.lowercased())
                .aspectRatio(4 / 5, contentMode: .fit)
                .overlay {
                    if let id = link.coverImageId, let url = APIClient.shared.imageURL(id) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            ProgressView()
                        }
                    } else {
                        // No picture: what kind of link it is, drawn big. The badge says where.
                        Image(systemName: link.source == .web ? "globe" : "play.circle")
                            .font(.system(size: 40, weight: .light))
                            .foregroundStyle(.primary.opacity(0.4))
                    }
                }
                .overlay(alignment: .bottomLeading) {
                    // On the picture, so they read over any cover: dark glass, white type.
                    HStack(spacing: 4) {
                        SavedLinkBadge(text: link.sourceLabel)
                        if link.personal {
                            Text("Just me")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.black)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(.white.opacity(0.9), in: Capsule())
                        }
                    }
                    .padding(8)
                }
                .clipShape(RoundedRectangle(cornerRadius: 16))

            Text(link.name).font(.subheadline.weight(.medium)).lineLimit(2)
                .multilineTextAlignment(.leading)
            if let detail {
                Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// "TikTok", "Instagram", or the site, in white on dark glass so it reads over any picture.
struct SavedLinkBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .lineLimit(1)
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(.black.opacity(0.55), in: Capsule())
    }
}

/// A link typed or pasted in, kept. The server fills in its name and picture.
struct SaveLinkSheet: View {
    var session: Session
    var onSaved: (SavedLink) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var url = ""
    @State private var personal = false
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                KitchenSection {
                    TextField("Paste a TikTok, Reel or recipe link", text: $url)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focused)
                        .submitLabel(.done)
                        .onSubmit { Task { await save() } }
                } footer: {
                    Text("Its name and picture are filled in from the page.")
                }
                KitchenSection {
                    Toggle("Just me", isOn: $personal)
                } footer: {
                    Text("Only you will see it. Otherwise everyone in the household can.")
                }
                if let error {
                    KitchenSection { Text(error).foregroundStyle(Palette.danger) }
                }
            }
            .kitchenList()
            .navigationTitle("Save a link")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    if busy {
                        ProgressView()
                    } else {
                        Button("Save") { Task { await save() } }
                            .disabled(url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium])
    }

    private func save() async {
        guard let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            error = nil
            onSaved(try await APIClient.shared.saveLink(
                household: household, url: url.trimmingCharacters(in: .whitespacesAndNewlines), personal: personal))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/**
 Another go at reading a saved link — a caption may have been edited since, or the reader got
 better. What comes through opens in the editor; what does not says why, with the other way to
 make it a recipe right there. Either way, saving the recipe takes the link off the shelf.
*/
struct SavedLinkImportSheet: View {
    let link: SavedLink
    var session: Session
    var onSaved: (Recipe) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draft: RecipeDraft?
    @State private var error: String?
    @State private var since = Date()

    var body: some View {
        NavigationStack {
            List {
                KitchenSection {
                    Text(link.name).font(.headline)
                    if let error {
                        Text(error).foregroundStyle(Palette.danger)
                    } else {
                        TimelineView(.periodic(from: since, by: 1)) { context in
                            HStack(spacing: 10) {
                                ProgressView()
                                Text("Reading the link…")
                                Spacer()
                                Text("\(Int(context.date.timeIntervalSince(since)))s")
                                    .monospacedDigit()
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if error != nil {
                    KitchenSection {
                        Button("Make it a recipe", systemImage: "square.and.pencil") { draft = typedOut }
                        Button("Keep the link", systemImage: "link") { dismiss() }
                    } footer: {
                        Text("You can still make it a recipe yourself — the name, the link and its picture go in for you.")
                    }
                }
            }
            .kitchenList()
            .navigationTitle("Try importing again")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
            }
            .navigationDestination(item: $draft) { draft in
                EditRecipeView(recipe: nil, session: session, draft: draft, embedded: true,
                               initialSection: link.section) { saved in
                    onSaved(saved)
                    dismiss()
                }
            }
        }
        .task { await read() }
    }

    private var typedOut: RecipeDraft {
        RecipeDraft(name: link.name, description: nil, servings: session.defaultServings ?? 4, prep: 0, cook: 0,
                    instructions: "", ingredients: [], links: [SourceLink(url: link.url, label: nil)],
                    note: "Made from your saved link. It comes off Saved links once it’s a recipe.",
                    coverImageId: link.coverImageId, savedLinkId: link.id)
    }

    private func read() async {
        guard draft == nil, error == nil, let household = session.household?.id else { return }
        since = Date()
        do {
            let imported = try await APIClient.shared.importRecipe(household: household, url: link.url)
            var read = RecipeDraft(imported: imported, link: link.url)
            read.savedLinkId = link.id
            read.coverImageId = read.coverImageId ?? link.coverImageId
            draft = read
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Saved links") {
    NavigationStack { SavedLinksView(session: .preview, sample: SampleData.savedLinks) }
}

#Preview("Nothing saved") {
    NavigationStack { SavedLinksView(session: .preview, sample: []) }
}

#Preview("Tile") {
    SavedLinkTile(link: SampleData.savedLinks[0]).frame(width: 180).padding()
}

#Preview("Save a link") {
    SaveLinkSheet(session: .preview) { _ in }
}

#Preview("Try importing again") {
    // No server behind a preview, so this shows the way on when a link cannot be read.
    SavedLinkImportSheet(link: SampleData.savedLinks[1], session: .preview) { _ in }
}
