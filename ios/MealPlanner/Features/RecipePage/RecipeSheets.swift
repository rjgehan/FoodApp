import PhotosUI
import SwiftUI

/*
 What the recipe page's ••• opens (the mockup's 3.11), and the sheets behind its rows: the
 drawer and tags (Organise, and Move into my recipes), and the photos and links.
 */

enum RecipeOption: Hashable {
    case groceries, organise, media, share, edit, delete, move
}

/**
 The recipe's options as grouped rows. Changing a recipe — editing, deleting, its photos,
 sharing it on — is for the household that owns it; one shared with you can be filed in your own
 drawers ("Move into my recipes"), and organised once it is. Add to groceries heads the list for
 every recipe, in full: beside Add to plan the bottom bar only has room for a cart and one word.
 */
struct RecipeOptionsSheet: View {
    let recipe: Recipe
    /// How many of your other households it is shared into, for the Share row.
    var sharedCount: Int = 0
    var onPick: (RecipeOption) -> Void

    @Environment(\.dismiss) private var dismiss
    /// As tall as its rows: two for a recipe shared with you, six for your own (the mockup's 3.11,
    /// with Add to groceries on top).
    @State private var height: CGFloat = 420

    private var mine: Bool { !recipe.shared }
    private var moving: Bool { recipe.shared && recipe.section == nil }

    private var mediaLine: String {
        // The cover is named on its own, so the count is the other photos (the mockup's "Cover
        // photo, 4 photos"), not the cover twice.
        let photos = Set(recipe.photoIds ?? []).subtracting([recipe.coverImageId].compactMap { $0 }).count
        let links = recipe.allLinks.count
        let parts = [recipe.coverImageId != nil ? "Cover photo" : nil,
                     photos > 0 ? "\(photos) \(photos == 1 ? "photo" : "photos")" : nil,
                     links > 0 ? "\(links) \(links == 1 ? "link" : "links")" : nil].compactMap { $0 }
        return parts.isEmpty ? "No photos or links yet" : parts.joined(separator: ", ")
    }

    private var shareLine: String {
        var parts: [String] = []
        if recipe.published == true { parts.append("In Explore") }
        if sharedCount > 0 { parts.append("shared with \(sharedCount) \(sharedCount == 1 ? "household" : "households")") }
        guard let first = parts.first else { return "Link, other households, Explore" }
        return ([first.prefix(1).uppercased() + first.dropFirst()] + parts.dropFirst()).joined(separator: " · ")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                ListGroup {
                    row("Add to groceries", "Its ingredients, onto the list", "cart", .plum, chevron: true, .groceries)
                    if !moving {
                        row("Organise", "Drawer and tags", "tag", .mustard, chevron: true, .organise)
                    }
                    if mine {
                        row("Photos & links", mediaLine, "photo", .sky, chevron: true, .media)
                        row("Share", shareLine, "square.and.arrow.up", .herb, chevron: true, .share)
                    }
                }
                if mine {
                    ListGroup {
                        row("Edit recipe", nil, "pencil", .accent, chevron: false, .edit)
                        row("Delete", "Asks first", "trash", .accent, chevron: false, .delete, color: Palette.accentInk)
                    }
                }
                if moving {
                    ListGroup {
                        row("Move into my recipes", "Shared by \(recipe.ownerName ?? "another household"): pick a drawer for it",
                            "arrow.right", .plum, chevron: false, .move)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
            // The sheet adds the home indicator's inset below this on its own.
            .padding(.bottom, 8)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .pageBackground()
        .kitchenSheet([.height(height)])
    }

    private func row(_ title: String, _ subtitle: String?, _ symbol: String, _ tone: Tone, chevron: Bool,
                     _ option: RecipeOption, color: Color? = nil) -> some View {
        Button {
            dismiss()
            // After the sheet has gone, so whatever it opens is not stacked on a closing sheet.
            Task {
                try? await Task.sleep(for: .milliseconds(350))
                onPick(option)
            }
        } label: {
            ListRow(title, subtitle: subtitle, chevron: chevron, titleColor: color,
                    leading: { Tile(symbol, tone: tone, size: 34) }, trailing: { EmptyView() })
        }
        .buttonStyle(PressFade())
    }
}

// MARK: - Filing

/// The drawer chips, then that drawer's tags as chips, then a way to make a new tag: where a
/// recipe is kept, shared by Organise, Move into my recipes and the recipe form.
struct FilingPicker: View {
    @Binding var section: RecipeSection
    @Binding var tags: Set<String>
    var allTags: [RecipeCategory]
    /// Heads the drawers "Drawer" and the tags "Tags" in section labels, for a sheet whose other
    /// parts are headed that way (Move into my recipes' "Which household"); otherwise they run on.
    var labelled = false
    var onAddTag: (String) async -> Void

    @State private var adding = false
    @State private var newTag = ""
    @FocusState private var typing: Bool

    /// The chosen drawer's own tags, alphabetical: a tag belongs to one drawer.
    private var here: [RecipeCategory] {
        allTags
            .filter { $0.section == section }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func isOn(_ name: String) -> Bool {
        tags.contains { $0.caseInsensitiveCompare(name) == .orderedSame }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: labelled ? 16 : 10) {
            VStack(alignment: .leading, spacing: 8) {
                if labelled { SectionLabel("Drawer") }
                ChipFlow {
                    ForEach(RecipeSection.allCases, id: \.self) { drawer in
                        Chip(drawer.title, isOn: drawer == section) { section = drawer }
                    }
                }
            }
            .id("filing")
            VStack(alignment: .leading, spacing: 10) {
                if labelled { SectionLabel("Tags").padding(.bottom, -2) }
                tagChips
            }
        }
    }

    @ViewBuilder private var tagChips: some View {
        // One flat row of chips that wraps, as on the web: a recipe can wear any number of them.
        ChipFlow {
            ForEach(here) { tag in
                Chip(tag.name, isOn: isOn(tag.name)) {
                    if isOn(tag.name) {
                        tags = tags.filter { $0.caseInsensitiveCompare(tag.name) != .orderedSame }
                    } else {
                        tags.insert(tag.name)
                    }
                }
            }
            if !adding {
                Chip("+ New tag", isOn: false) {
                    adding = true
                    typing = true
                }
            }
        }
        if adding {
            HStack(spacing: 8) {
                TextField("A new tag in \(section.title)", text: $newTag)
                    .focused($typing)
                    .submitLabel(.done)
                    .onSubmit { Task { await add() } }
                    .padding(.horizontal, 14)
                    .frame(height: 44)
                    .fieldSurface(focused: typing)
                Button("Add") { Task { await add() } }
                    .buttonStyle(.kitchen(.secondary, size: .small, fill: false))
                    .disabled(newTag.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        if here.isEmpty && !adding {
            Text("Tags are words a recipe wears — \"Chicken\", \"Quick\" — and it can wear several. There are none in \(section.title) yet.")
                .font(.system(size: 13)).foregroundStyle(Palette.muted)
        }
    }

    private func add() async {
        let wanted = newTag.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty else { return }
        // A name the drawer has already is just ticked, rather than refused as a duplicate.
        if let existing = here.first(where: { $0.name.caseInsensitiveCompare(wanted) == .orderedSame }) {
            if !isOn(existing.name) { tags.insert(existing.name) }
        } else {
            await onAddTag(wanted)
        }
        newTag = ""
        adding = false
    }
}

/**
 Tags belong to a drawer, and the server files a recipe by tag name within its own drawer, making
 any it cannot find. So a tag ticked in the old drawer — Veggie, when the recipe was started in
 Dinner and then moved to Lunch — is set aside when the drawer changes, rather than coming back as
 a new, empty Veggie in Lunch, and ticked again if the recipe moves back to a drawer that has it:
 the same as the web's form. A name the household has no tag for in any drawer was typed in as
 new, and goes wherever the recipe goes.
*/
func moveTags(_ tags: inout Set<String>, parked: inout Set<String>, to next: RecipeSection, all: [RecipeCategory]) {
    func same(_ a: String, _ b: String) -> Bool { a.caseInsensitiveCompare(b) == .orderedSame }
    func inDrawer(_ name: String) -> Bool { all.contains { same($0.name, name) && $0.section == next } }
    func isKnown(_ name: String) -> Bool { all.contains { same($0.name, name) } }
    let setAside = tags.filter { isKnown($0) && !inDrawer($0) }
    let back = parked.filter { name in inDrawer(name) && !tags.contains { same($0, name) } }
    tags.subtract(setAside)
    tags.formUnion(back)
    parked.subtract(back)
    parked.formUnion(setAside)
}

/**
 Organise: the drawer and tags this household keeps the recipe in. For a recipe shared with you
 and not filed yet, it is "Move into my recipes": once it has a drawer it is one of yours to find,
 though still the other household's to change.
*/
struct OrganiseSheet: View {
    let recipe: Recipe
    var session: Session?
    var onSaved: (Recipe) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var section: RecipeSection
    @State private var tags: Set<String>
    @State private var parked: Set<String> = []
    @State private var allTags: [RecipeCategory] = []
    @State private var busy = false
    @State private var error: String?

    init(recipe: Recipe, session: Session?, onSaved: @escaping (Recipe) -> Void) {
        self.recipe = recipe
        self.session = session
        self.onSaved = onSaved
        // An unfiled shared recipe has no drawer yet; Dinner is the least surprising place to start.
        _section = State(initialValue: recipe.section ?? .dinner)
        _tags = State(initialValue: Set(recipe.categories))
    }

    private var moving: Bool { recipe.shared && recipe.section == nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(moving ? "Move into my recipes" : "Organise",
                            subtitle: moving ? "Shared by \(recipe.ownerName ?? "another household"). Only they can change it." : recipe.name,
                            onClose: { dismiss() })
                SectionLabel("Filing")
                FilingPicker(section: $section, tags: $tags, allTags: allTags) { name in await addTag(name) }
                if let error {
                    Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                }
                Button {
                    Task { await save() }
                } label: {
                    if busy { ProgressView().tint(Palette.onAccent) } else { Text(moving ? "Move into my recipes" : "Save") }
                }
                .buttonStyle(.primary)
                .disabled(busy)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 16)
        }
        .pageBackground()
        .kitchenSheet([.medium, .large])
        .task {
            guard let household = session?.household?.id else { return }
            // Previews and the Gallery show the sample tags rather than none.
            guard session?.token != "preview" else {
                allTags = SampleData.recipeCategories
                return
            }
            allTags = (try? await APIClient.shared.recipeCategories(household: household)) ?? []
        }
        .onChange(of: section) { _, next in moveTags(&tags, parked: &parked, to: next, all: allTags) }
    }

    /// Made in the drawer on screen straight away, and ticked.
    private func addTag(_ name: String) async {
        guard let household = session?.household?.id else { return }
        do {
            let made = try await APIClient.shared.createTag(household: household, name: name, section: section)
            allTags.append(made)
            tags.insert(made.name)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        guard let household = session?.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            let saved = try await APIClient.shared.fileRecipe(household: household, recipe: recipe.id,
                                                               section: section, categories: Array(tags))
            // With the recipe, so Recipes puts just this one right rather than fetching them all.
            NotificationCenter.default.post(name: .recipesChanged, object: saved)
            onSaved(saved)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Photos & links

/**
 The recipe's pictures — the cover (taken, chosen, or made on the phone from its name), the
 others, taking one away — and its links, saved together with one Save.
 */
struct PhotosLinksSheet: View {
    let recipe: Recipe
    var session: Session?
    var onSaved: (Recipe) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var coverImageId: UUID?
    @State private var photoIds: [UUID]
    @State private var links: [LinkDraft]
    @State private var cover = CoverPhotoFlow()
    @State private var picked: [PhotosPickerItem] = []
    @State private var adding = false
    @State private var busy = false
    @State private var error: String?

    init(recipe: Recipe, session: Session?, onSaved: @escaping (Recipe) -> Void) {
        self.recipe = recipe
        self.session = session
        self.onSaved = onSaved
        _coverImageId = State(initialValue: recipe.coverImageId)
        _photoIds = State(initialValue: recipe.photoIds ?? [])
        _links = State(initialValue: recipe.allLinks.map { LinkDraft($0) })
    }

    private var imagesChanged: Bool { coverImageId != recipe.coverImageId || photoIds != (recipe.photoIds ?? []) }
    private var linksChanged: Bool {
        LinkDraft.body(links).map { $0["url"] as? String } != recipe.allLinks.map { Optional($0.url) }
            || LinkDraft.body(links).map { $0["label"] as? String } != recipe.allLinks.map { $0.label }
    }

    var body: some View {
        NavigationStack {
            Form {
                CoverPhotoSection(dishName: recipe.name, session: session, coverImageId: $coverImageId, flow: cover)

                KitchenSection {
                    if !photoIds.isEmpty {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                            ForEach(photoIds, id: \.self) { id in
                                photo(id)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    PhotosPicker(selection: $picked, maxSelectionCount: 10, matching: .images, photoLibrary: .shared()) {
                        Label(adding ? "Adding…" : "Add photos", systemImage: "photo.badge.plus")
                    }
                    .disabled(adding)
                } header: {
                    Text("Photos")
                } footer: {
                    Text(photoIds.isEmpty ? "No photos yet." : "Tap one to make it the cover.")
                }

                LinksSection(links: $links)

                if let error {
                    KitchenSection { Text(error).foregroundStyle(Palette.danger) }
                }
            }
            .coverPhotoFlow(cover, session: session, coverImageId: $coverImageId)
            .kitchenList()
            .navigationTitle("Photos & links")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { Task { await save() } }
                        .fontWeight(.semibold)
                        .disabled(busy || adding || cover.uploading || (!imagesChanged && !linksChanged))
                }
            }
            .onChange(of: picked) { _, items in
                guard !items.isEmpty else { return }
                Task { await addPhotos(items) }
            }
        }
    }

    private func photo(_ id: UUID) -> some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                AsyncImage(url: APIClient.shared.imageURL(id)) { image in
                    image.resizable().scaledToFill()
                } placeholder: { Palette.surface2 }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(alignment: .topLeading) {
                if coverImageId == id {
                    Text("Cover").font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(.white.opacity(0.9), in: Capsule())
                        .foregroundStyle(Color(rgb: 0x2B211A))
                        .padding(6)
                }
            }
            .overlay(alignment: .topTrailing) {
                Button {
                    photoIds.removeAll { $0 == id }
                    if coverImageId == id { coverImageId = nil }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, .black.opacity(0.45))
                        .padding(4)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove photo")
            }
            .onTapGesture { coverImageId = id }
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(coverImageId == id ? "Cover photo" : "Make cover")
    }

    private func addPhotos(_ items: [PhotosPickerItem]) async {
        guard let household = session?.household?.id else { return }
        adding = true
        defer {
            adding = false
            picked = []
        }
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else { continue }
            let jpeg = await Task.detached(priority: .userInitiated) { image.jpegForUpload() }.value
            guard let jpeg else { continue }
            do {
                let id = try await APIClient.shared.uploadImage(household: household, jpeg: jpeg)
                photoIds.append(id)
                if coverImageId == nil { coverImageId = id }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            var saved = recipe
            if imagesChanged {
                saved = try await APIClient.shared.setImages(recipeId: recipe.id, coverImageId: coverImageId, photoIds: photoIds)
            }
            if linksChanged {
                saved = try await APIClient.shared.setLinks(recipe: recipe.id, links: links)
            }
            onSaved(saved)
            dismiss()
        } catch {
            // Said here, next to the links: the recipe behind the sheet is fine.
            self.error = error.localizedDescription
        }
    }
}

#Preview("Options") {
    Color.clear.sheet(isPresented: .constant(true)) {
        RecipeOptionsSheet(recipe: SampleData.recipes[0], sharedCount: 1) { _ in }
    }
}

#Preview("Options — dark") {
    Color.clear.sheet(isPresented: .constant(true)) {
        RecipeOptionsSheet(recipe: SampleData.recipes[0]) { _ in }
    }
    .preferredColorScheme(.dark)
}

#Preview("Organise") {
    Color.clear.sheet(isPresented: .constant(true)) {
        OrganiseSheet(recipe: SampleData.recipes[0], session: .preview) { _ in }
    }
}
