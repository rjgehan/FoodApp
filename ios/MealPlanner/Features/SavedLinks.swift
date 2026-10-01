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
    /// A search to start with — the catalogue's, when a search there matched links.
    var initialQuery: String? = nil
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
    /// The link whose actions are open.
    @State private var acting: SavedLink?
    @State private var moving: SavedLink?
    /// Whatever Paste found that was not a link it could save, to start the box with.
    @State private var pastedURL: String?

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
            VStack(alignment: .leading, spacing: 12) {
                SearchBox(text: $query, prompt: "Search saved links")
                if sources.count > 1 || !drawers.isEmpty {
                    filters
                }
                pasteRow
                if let error {
                    Text(error).foregroundStyle(Palette.danger).font(.callout)
                }
                if let notice {
                    NoteBox(notice, tone: .herb, systemImage: "checkmark.circle")
                        .transition(.opacity)
                }

                if links == nil && error == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 48)
                } else if all.isEmpty {
                    VStack(spacing: 10) {
                        Tile("link", tone: .plum, size: 64)
                        Text("Nothing saved yet").titleFont(20).foregroundStyle(Palette.text).padding(.top, 6)
                        Text("Keep the TikToks, Reels and recipe pages you mean to make. When a link won’t come through as a recipe, save it here instead — and make it a recipe later.")
                            .font(.system(size: 15)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                        Button { adding = true } label: { Label("Save a link", systemImage: "plus") }
                            .buttonStyle(.kitchen(.primary, size: .large, fill: false))
                            .padding(.top, 8)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 12)
                    .padding(.top, 32)
                } else if shown.isEmpty {
                    Text("Nothing matches that.").font(.system(size: 15)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity).padding(.vertical, 24)
                } else {
                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(shown) { link in
                            ZStack(alignment: .topTrailing) {
                                Button {
                                    if let url = URL(string: link.url) { openURL(url) }
                                } label: {
                                    SavedLinkTile(link: link)
                                }
                                .buttonStyle(PressFade())
                                .accessibilityHint("Opens it")
                                // Holding a tile is the other way to its actions, as on a photo.
                                .contextMenu {
                                    Button("Actions…", systemImage: "ellipsis.circle") { acting = link }
                                }
                                Button { acting = link } label: {
                                    Image(systemName: "ellipsis")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(.white)
                                        .frame(width: 28, height: 28)
                                        .background(.black.opacity(0.4), in: Circle())
                                        .frame(width: 44, height: 44)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(PressFade())
                                .accessibilityLabel("More for \(link.name)")
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.immediately)
        .pageBackground()
        .centeredTitle("Saved links")
        .refreshable { await load() }
        .toolbar {
            BareToolbarItem(placement: .topBarTrailing) {
                Button { adding = true } label: {
                    Image(systemName: "plus").font(.system(size: 20, weight: .medium)).foregroundStyle(Palette.accentInk)
                }
                .accessibilityLabel("Save a link")
            }
        }
        .task {
            if query.isEmpty, let initialQuery, !initialQuery.isEmpty { query = initialQuery }
            await load()
            #if DEBUG
            if UserDefaults.standard.string(forKey: "mp_debug_screen") == "linkactions" { acting = all.first }
            #endif
        }
        .sheet(isPresented: $adding) {
            SaveLinkSheet(session: session, initialURL: pastedURL) { saved in
                links = [saved] + all.filter { $0.id != saved.id }
                say(saved.alreadySaved == true ? "“\(saved.name)” was already saved." : "Saved “\(saved.name)”.")
                Task { await onChanged() }
            }
        }
        .sheet(item: $acting) { link in
            SavedLinkActions(
                link: link,
                plan: { after { planning = link } },
                makeRecipe: { after { making = draft(from: link) } },
                importAgain: { after { importing = link } },
                move: { after { moving = link } },
                rename: { after { newName = link.name; renaming = link } },
                justMe: { acting = nil; Task { await update(link, personal: !link.personal) } },
                delete: { after { deleting = link } }
            )
            .kitchenSheet([.large])
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
        .confirmationDialog("Move to a drawer", isPresented: Binding(get: { moving != nil }, set: { if !$0 { moving = nil } }),
                            titleVisibility: .visible) {
            Button("No drawer") { if let link = moving { Task { await move(link, to: nil) } } }
            ForEach(RecipeSection.allCases, id: \.self) { section in
                Button(section.title) { if let link = moving { Task { await move(link, to: section) } } }
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

    /// Closes the actions sheet, then opens what was picked once it has gone — one sheet at a time.
    private func after(_ open: @escaping () -> Void) {
        acting = nil
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            open()
        }
    }

    /// Where it is from, then the drawer as a menu, and All to clear both: one row.
    private var filters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Chip("All", isOn: source == nil && drawer == nil) {
                    source = nil
                    drawer = nil
                }
                if sources.count > 1 {
                    ForEach(sources, id: \.self) { kind in
                        let label = SavedLink.label(source: kind, url: nil)
                        Chip(label == "Website" ? "Websites" : label, isOn: source == kind) {
                            source = source == kind ? nil : kind
                        }
                    }
                }
                if !drawers.isEmpty {
                    Menu {
                        Button("Every drawer") { drawer = nil }
                        ForEach(drawers, id: \.self) { section in
                            Button(section.title) { drawer = section }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
                            Text(drawer?.title ?? "Drawer")
                        }
                        .font(.system(size: 13, weight: drawer != nil ? .semibold : .medium))
                        .foregroundStyle(drawer != nil ? Palette.bg : Palette.text)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(drawer != nil ? Palette.text : Palette.surface, in: Capsule())
                        .overlay(Capsule().strokeBorder(drawer != nil ? Palette.text : Palette.border, lineWidth: 1))
                    }
                    .accessibilityLabel("Drawer")
                }
            }
            .padding(.horizontal, 20)
        }
        .padding(.horizontal, -20)
    }

    /**
     Paste: whatever link is on the clipboard is saved straight away. Nothing on it that looks
     like a link opens the box to paste one into instead.
    */
    private var pasteRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "doc.on.clipboard").font(.system(size: 16)).foregroundStyle(Palette.accentInk)
            Button { pastedURL = nil; adding = true } label: {
                Text("Paste a link to save it").font(.system(size: 14)).foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(PressFade())
            Button("Paste") { Task { await paste() } }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.accentInk)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(Palette.faint, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
    }

    private func paste() async {
        let text = (UIPasteboard.general.url?.absoluteString ?? UIPasteboard.general.string ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.range(of: "^https?://\\S+$", options: [.regularExpression, .caseInsensitive]) != nil,
              let household = session.household?.id, sample == nil else {
            pastedURL = text.isEmpty ? nil : text
            adding = true
            return
        }
        do {
            let saved = try await APIClient.shared.saveLink(household: household, url: text)
            links = [saved] + all.filter { $0.id != saved.id }
            say(saved.alreadySaved == true ? "“\(saved.name)” was already saved." : "Saved “\(saved.name)”.")
            await onChanged()
        } catch {
            pastedURL = text
            adding = true
        }
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

/// A saved link's picture: the video's cover or the page's photo, or a gradient with what kind
/// it is drawn on it.
struct SavedLinkPicture: View {
    let link: SavedLink
    var radius: CGFloat = 14

    var body: some View {
        let placeholder = RecipePhotoPlaceholder(hue: .of(link.id.uuidString.lowercased()),
                                                 systemImage: link.source == .web ? "globe" : "play",
                                                 radius: radius)
        if let id = link.coverImageId, let url = APIClient.shared.imageURL(id) {
            Color.clear
                .overlay {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image { image.resizable().scaledToFill() } else { placeholder }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                .accessibilityHidden(true)
        } else {
            placeholder
        }
    }
}

/// One link as its picture (3.17), what it is called under it, and where it is from and which
/// drawer.
struct SavedLinkTile: View {
    let link: SavedLink

    private var detail: String {
        [link.sourceLabel, link.section?.title, link.mine ? nil : link.savedByName.map { "from \($0)" }]
            .compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SavedLinkPicture(link: link)
                .aspectRatio(171 / 110, contentMode: .fit)
                .overlay(alignment: .bottomLeading) {
                    if link.personal {
                        Text("Just me")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(.white.opacity(0.9), in: Capsule())
                            .padding(8)
                    }
                }
            Text(link.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(1)
            Text(detail).font(.system(size: 12)).foregroundStyle(Palette.muted).lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}

/**
 Everything a saved link can do (3.18): the ways on first — plan it, make it a recipe, read it
 again — then tidying it, then the one that cannot be undone. Just me is only for whoever saved
 it: hiding somebody else's link would hide it from you too.
*/
struct SavedLinkActions: View {
    let link: SavedLink
    let plan: () -> Void
    let makeRecipe: () -> Void
    let importAgain: () -> Void
    let move: () -> Void
    let rename: () -> Void
    let justMe: () -> Void
    let delete: () -> Void

    private var meta: String {
        let by = link.mine ? "saved by you" : link.savedByName.map { "saved by \($0)" }
        return [link.sourceLabel, by, link.savedAgo].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    SavedLinkPicture(link: link).frame(width: 60, height: 60)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(link.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(2)
                        Text(meta).font(.system(size: 13)).foregroundStyle(Palette.muted).lineLimit(1)
                    }
                }
                ListGroup {
                    action(plan) { ListRow("Add to plan", tile: ("calendar", .accent)) }
                    action(makeRecipe) {
                        ListRow("Turn into a recipe", subtitle: "Moves any planned meals over to the new recipe",
                                tile: ("book", .herb))
                    }
                    action(importAgain) { ListRow("Try importing again", tile: ("arrow.triangle.2.circlepath", .sky)) }
                    action(move) {
                        ListRow("Move to a drawer", detail: link.section?.title ?? "None", chevron: true, tile: ("folder", .mustard))
                    }
                    action(rename) { ListRow("Rename", tile: ("pencil", .plum)) }
                    if link.mine {
                        action(justMe) {
                            ListRow("Just me", subtitle: link.personal ? "Only you can see it" : "Everyone in the household can see it",
                                    tile: ("lock", .sky)) {
                                Toggle("", isOn: .constant(link.personal)).labelsHidden().allowsHitTesting(false)
                            }
                        }
                        .accessibilityValue(link.personal ? "On" : "Off")
                    }
                    action(delete) { ListRow("Delete", titleColor: Palette.accentInk, tile: ("trash", .accent)) }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 24)
        }
    }

    private func action<Row: View>(_ run: @escaping () -> Void, @ViewBuilder row: () -> Row) -> some View {
        Button(action: run, label: row).buttonStyle(PressFade())
    }
}

extension SavedLink {
    /// "today", "3 days ago" — when it was kept, from a server new enough to say.
    var savedAgo: String? {
        guard let createdAt, let date = ISO8601DateFormatter.flexible(createdAt) else { return nil }
        let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: date),
                                                   to: Calendar.current.startOfDay(for: Date())).day ?? 0
        switch days {
        case ..<1: return "today"
        case 1: return "yesterday"
        case 2..<7: return "\(days) days ago"
        case 7..<14: return "last week"
        default: return date.formatted(.dateTime.day().month(.abbreviated))
        }
    }
}

private extension ISO8601DateFormatter {
    /// The server's timestamps, with or without fractions of a second.
    static func flexible(_ text: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: text) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: text.replacingOccurrences(of: "\\.\\d+", with: "", options: .regularExpression))
    }
}

/// A link typed or pasted in, kept. The server fills in its name and picture.
struct SaveLinkSheet: View {
    var session: Session
    /// Something already pasted, to start the box with.
    var initialURL: String? = nil
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
            .onAppear {
                if url.isEmpty, let initialURL { url = initialURL }
                focused = true
            }
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
