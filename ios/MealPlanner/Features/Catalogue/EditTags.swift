import SwiftUI

/**
 Manage tags (the mockup's 3.6, for tags): every tag in a drawer in one list — its drawing, its
 name to rename where it stands, how many recipes wear it, and a bin on every row, so deleting
 the first tag is as easy as deleting the last. "+ New tag" adds one at the foot.

 Each change is saved as it is made and shows at once; if the server says no, it goes back, with
 why. Nothing waits for a Done, so there is no Done to forget.

 Deleting a tag only takes it off its recipes — a tag is a sticker, not a shelf — so the recipes
 stay exactly where they are. It asks first, saying how many recipes lose it.
*/
struct EditTagsView: View {
    var store: CatalogueStore
    let section: RecipeSection

    /// Names being typed, saved when the field is left or Return is pressed.
    @State private var drafts: [UUID: String] = [:]
    @FocusState private var focus: Field?
    @State private var choosingIcon: RecipeCategory?
    @State private var deleting: RecipeCategory?
    @State private var adding = false
    @State private var newName = ""
    @State private var busy = false
    @State private var error: String?

    private enum Field: Hashable {
        case name(UUID)
        case new
    }

    private var tags: [RecipeCategory] { store.tags(in: section) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if tags.isEmpty && !adding {
                    Text("No tags in \(section.title) yet. A tag is a word a recipe wears — \"Chicken\", \"Quick\" — and a recipe can wear several.")
                        .font(.system(size: 15)).foregroundStyle(Palette.muted)
                        .padding(.vertical, 12)
                } else {
                    ListGroup {
                        ForEach(tags) { tag in row(tag) }
                        if adding { newRow }
                    }
                }
                if !adding {
                    DashedAddButton(title: "New tag") { adding = true }
                }
                NoteBox("Deleting a tag only takes it off its recipes. The recipes stay.", tone: .sky)
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .pageBackground()
        .centeredTitle("Tags in \(section.title)")
        .textBackButton(section.title)
        // Leaving a name's field saves it, as Return does.
        .onChange(of: focus) { old, _ in
            if case .name(let id)? = old { commit(id) }
        }
        .sheet(item: $choosingIcon) { tag in
            IconChooser(title: tag.name, selected: tag.iconKey, allowNone: true) { key in
                choosingIcon = nil
                Task { await setIcon(tag, key) }
            }
            .presentationDetents([.medium, .large])
        }
        .confirmationDialog(
            "Delete \(deleting?.name ?? "")?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible
        ) {
            if let tag = deleting {
                Button("Delete \(tag.name)", role: .destructive) { Task { await delete(tag) } }
            }
            Button("Cancel", role: .cancel) { deleting = nil }
        } message: {
            if let tag = deleting { Text(untagsLine(tag)) }
        }
        #if DEBUG
        // -mp_debug_expand 1 (with -mp_debug_screen tags) opens the first tag's icon picker.
        .task {
            if UserDefaults.standard.bool(forKey: "mp_debug_expand") { choosingIcon = tags.first }
        }
        #endif
    }

    /// "Untags 4 recipes. The recipes stay." — what the bin will do, said before it does it.
    private func untagsLine(_ tag: RecipeCategory) -> String {
        let n = store.count(tag)
        if n == 0 { return "No recipe wears it." }
        return n == 1 ? "Untags 1 recipe. The recipe stays." : "Untags \(n) recipes. The recipes stay."
    }

    private func row(_ tag: RecipeCategory) -> some View {
        let count = store.count(tag)
        return HStack(spacing: 12) {
            Button { choosingIcon = tag } label: {
                FoodTile(iconKey: tag.iconKey, tone: tag.tone, size: 36)
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Icon for \(tag.name)")
            .accessibilityValue(FoodIcon.named(tag.iconKey)?.label ?? "None")
            VStack(alignment: .leading, spacing: 1) {
                TextField(tag.name, text: name(of: tag))
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Palette.text)
                    .submitLabel(.done)
                    .focused($focus, equals: .name(tag.id))
                    .onSubmit { commit(tag.id) }
                    // Escape on a keyboard is "never mind": the typing goes before the field is
                    // left, so leaving it has nothing to save.
                    .onKeyPress(.escape) {
                        drafts[tag.id] = nil
                        focus = nil
                        return .handled
                    }
                    .accessibilityLabel("Name of \(tag.name)")
                Text("\(count) \(count == 1 ? "recipe" : "recipes")")
                    .font(.system(size: 12)).foregroundStyle(Palette.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { deleting = tag } label: {
                Image(systemName: "trash").font(.system(size: 16)).foregroundStyle(Palette.faint)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Delete \(tag.name)")
        }
        .padding(.leading, 16)
        .padding(.trailing, 10)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
    }

    private var newRow: some View {
        HStack(spacing: 12) {
            FoodTile(iconKey: nil, tone: .herb, size: 36)
            TextField("New tag in \(section.title)", text: $newName)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Palette.text)
                .focused($focus, equals: .new)
                .submitLabel(.done)
                .onSubmit { Task { await add() } }
                // A field that has only just appeared can miss focus set on the same pass.
                .task {
                    try? await Task.sleep(for: .milliseconds(150))
                    focus = .new
                }
            Button(busy ? "Adding…" : "Add") { Task { await add() } }
                .buttonStyle(.kitchen(.secondary, size: .small, fill: false))
                .disabled(busy || newName.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.leading, 16)
        .padding(.trailing, 10)
        .padding(.vertical, 10)
        .frame(minHeight: 60)
    }

    private func name(of tag: RecipeCategory) -> Binding<String> {
        Binding(get: { drafts[tag.id] ?? tag.name }, set: { drafts[tag.id] = $0 })
    }

    // MARK: - Saving, a change at a time

    private func commit(_ id: UUID) {
        guard let draft = drafts[id], let tag = store.categories.first(where: { $0.id == id }) else { return }
        drafts[id] = nil
        let wanted = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        // An emptied name goes back to what it was, rather than leaving a tag with no name.
        guard !wanted.isEmpty, wanted != tag.name else { return }
        if let other = store.tag(named: wanted, in: section), other.id != id {
            error = "There's already a tag called \(other.name) in \(section.title)."
            return
        }
        Task {
            do {
                error = nil
                try await store.renameTag(tag, to: wanted)
            } catch {
                self.error = "Could not rename \(tag.name). \(error.localizedDescription)"
            }
        }
    }

    private func add() async {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            adding = false
            return
        }
        if let existing = store.tag(named: name, in: section) {
            error = "There's already a tag called \(existing.name) in \(section.title)."
            return
        }
        busy = true
        defer { busy = false }
        do {
            error = nil
            try await store.createTag(name, in: section)
            newName = ""
            adding = false
        } catch {
            // Made on another phone a moment ago: the store has fetched the tags again, so it is
            // in the list now, and that is all the box was for.
            if let there = store.tag(named: name, in: section) {
                newName = ""
                adding = false
                self.error = "There's already a tag called \(there.name) in \(section.title)."
                return
            }
            self.error = "Could not make \(name). \(error.localizedDescription)"
        }
    }

    private func setIcon(_ tag: RecipeCategory, _ key: String?) async {
        guard key != tag.iconKey else { return }
        do {
            error = nil
            try await store.setTagIcon(tag, to: key)
        } catch {
            self.error = "Could not change \(tag.name)'s icon. \(error.localizedDescription)"
        }
    }

    private func delete(_ tag: RecipeCategory) async {
        deleting = nil
        do {
            error = nil
            try await store.deleteTag(tag)
        } catch {
            self.error = "Could not delete \(tag.name). \(error.localizedDescription)"
        }
    }
}

#Preview("Manage tags") {
    NavigationStack {
        EditTagsView(store: CatalogueStore(session: nil, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories),
                     section: .dinner)
    }
}

#Preview("Manage tags — dark") {
    NavigationStack {
        EditTagsView(store: CatalogueStore(session: nil, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories),
                     section: .dinner)
    }
    .preferredColorScheme(.dark)
}
