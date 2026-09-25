import SwiftUI

/**
 The shelves at one level of a drawer: add one, rename one, take one away.

 Reached from the drawer, or the group, whose groups it edits, because "edit groups" with no
 drawer in mind is a question nobody asks — you are always looking at Dinner and deciding that
 Dinner needs a Chicken shelf, or inside Main and deciding Chicken needs a picture.

 Each group can wear one of the food drawings on its tile — tap the square at the start of its
 row. A new group can be given one as it is made.

 Taking a group away never takes its recipes with it. They move up a level, which is what the
 server does and what anybody would expect: a shelf is a way of arranging the drawer, not a
 thing the food lives inside.
*/
struct EditGroupsView: View {
    let section: RecipeSection
    /// The group whose groups these are; nil for the top of the drawer.
    var parent: RecipeCategory?
    let groups: [RecipeCategory]
    var session: Session?
    /// Reload the catalog, because renaming a group renames it on every recipe filed there.
    var onChanged: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var drafts: [UUID: String] = [:]
    @State private var adding = ""
    @State private var addingIcon: String?
    /// Icons picked here, shown straight away rather than after the catalog reloads.
    @State private var pickedIcons: [UUID: String?] = [:]
    @State private var choosingIconFor: IconTarget?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        iconButton(addingIcon, label: "Icon for the new group") { choosingIconFor = .new }
                        TextField("New group", text: $adding)
                        Button("Add") { Task { await add() } }
                            .disabled(busy || adding.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } footer: {
                    Text(parent == nil ? "A new group belongs to \(section.title)." : "A new group goes inside \(place).")
                }

                if groups.isEmpty {
                    Section {
                        Text("No groups in \(place) yet.").foregroundStyle(.secondary)
                    }
                } else {
                    Section {
                        ForEach(groups) { group in
                            HStack {
                                iconButton(icon(of: group), label: "Icon for \(group.name)") {
                                    choosingIconFor = .group(group)
                                }
                                TextField(group.name, text: draft(for: group))
                                    .submitLabel(.done)
                                    .onSubmit { Task { await rename(group) } }
                                Spacer(minLength: 8)
                                Text("\(group.recipeCount)")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .monospacedDigit()
                            }
                            .swipeActions(edge: .trailing) {
                                Button("Delete", systemImage: "trash", role: .destructive) {
                                    Task { await remove(group) }
                                }
                            }
                        }
                    } header: {
                        Text("Groups in \(place)")
                    } footer: {
                        Text("Tap a square to give a group a picture. Edit a name and press return. "
                             + "Swipe to delete — the recipes in it move up into \(place) "
                             + "rather than going with it.")
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Groups")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
            .sheet(item: $choosingIconFor) { target in
                IconChooser(
                    title: target.title,
                    selected: target == .new ? addingIcon : groups.first { IconTarget.group($0) == target }.flatMap(icon(of:))
                ) { key in
                    choosingIconFor = nil
                    switch target {
                    case .new: addingIcon = key
                    case .group(let group): Task { await setIcon(key, on: group) }
                    }
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    /// What the picker was opened for: the group being added, or one already there.
    enum IconTarget: Identifiable, Hashable {
        case new
        case group(RecipeCategory)

        var id: String {
            switch self {
            case .new: "new"
            case .group(let group): group.id.uuidString
            }
        }

        var title: String {
            switch self {
            case .new: "New group"
            case .group(let group): group.name
            }
        }
    }

    /// Where these groups sit: the drawer, or the group they are inside.
    private var place: String { parent?.name ?? section.title }

    private func icon(of group: RecipeCategory) -> String? {
        pickedIcons[group.id] ?? group.iconKey
    }

    /// The group's picture as a small tile, or an empty dashed square when it has none.
    private func iconButton(_ key: String?, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if let icon = FoodIcon.named(key) {
                    icon.image.resizable().scaledToFit().padding(5)
                        .foregroundStyle(Palette.accent)
                        .background(Palette.accentSoft, in: RoundedRectangle(cornerRadius: 8))
                } else {
                    Image(systemName: "photo.badge.plus")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .overlay(RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(Color(.separator), style: StrokeStyle(lineWidth: 1, dash: [3])))
                }
            }
            .frame(width: 36, height: 36)
        }
        .buttonStyle(.borderless)
        .disabled(busy)
        .accessibilityLabel(label)
        .accessibilityValue(FoodIcon.named(key)?.label ?? "None")
    }

    private func setIcon(_ key: String?, on group: RecipeCategory) async {
        guard let household = session?.household?.id, !busy else { return }
        let before = pickedIcons[group.id]
        pickedIcons[group.id] = .some(key)
        busy = true
        do {
            try await APIClient.shared.setRecipeCategoryIcon(household: household, category: group.id, iconKey: key)
        } catch {
            busy = false
            pickedIcons[group.id] = before
            self.error = error.localizedDescription
            return
        }
        busy = false
        // Saved by now: a reload that fails only leaves the catalog behind until the next one.
        await onChanged()
    }

    /// The text being typed for one group, defaulting to the name it already has.
    private func draft(for group: RecipeCategory) -> Binding<String> {
        Binding(
            get: { drafts[group.id] ?? group.name },
            set: { drafts[group.id] = $0 }
        )
    }

    private func add() async {
        let wanted = adding.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, let household = session?.household?.id, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.createRecipeCategory(
                household: household, name: wanted, section: section, parent: parent?.id, iconKey: addingIcon)
            adding = ""
            addingIcon = nil
            await onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func rename(_ group: RecipeCategory) async {
        let wanted = (drafts[group.id] ?? group.name).trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, wanted != group.name, let household = session?.household?.id else { return }
        do {
            try await APIClient.shared.renameRecipeCategory(household: household, category: group.id, name: wanted)
            drafts[group.id] = nil
            await onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remove(_ group: RecipeCategory) async {
        guard let household = session?.household?.id else { return }
        do {
            try await APIClient.shared.deleteRecipeCategory(household: household, category: group.id)
            await onChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The picker in a sheet of its own, so a Form row is not asked to hold two dozen buttons.
struct IconChooser: View {
    let title: String
    let selected: String?
    var allowNone = true
    let onPick: (String?) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                FoodIconPicker(selected: selected, allowNone: allowNone, onPick: onPick)
                    .padding(16)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}

#Preview("Groups") {
    EditGroupsView(
        section: .dinner,
        groups: SampleData.recipeCategories.filter { $0.parentId == nil },
        session: .preview,
        onChanged: {}
    )
}

#Preview("Groups inside Main") {
    let main = SampleData.recipeCategories.first { $0.name == "Main" }
    EditGroupsView(
        section: .dinner,
        parent: main,
        groups: SampleData.recipeCategories.filter { $0.parentId == main?.id },
        session: .preview,
        onChanged: {}
    )
}
