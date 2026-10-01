import SwiftUI

/**
 Edit groups (the mockup's 3.6): every group at one level of a drawer in one list, so standing in
 Dinner and wanting Main, Soups, Sides and Batch cook drawn is one list to go down rather than
 four groups to open. Tap a row's tile to choose its icon from the grid under the list; rename it
 where it stands; the bin takes it away.

 Reached from the drawer, or the group, whose groups it edits, because "edit groups" with no
 drawer in mind is a question nobody asks.

 Taking a group away never takes its recipes with it. They move up a level, which is what the
 server does and what anybody would expect: a shelf is a way of arranging the drawer, not a
 thing the food lives inside. Nothing is sent until Done, so Cancel really is cancel.
*/
struct EditGroupsView: View {
    var store: CatalogueStore
    let section: RecipeSection
    /// The group whose groups these are; nil for the top of the drawer.
    var parent: RecipeCategory?
    let groups: [RecipeCategory]

    @Environment(\.dismiss) private var dismiss
    @State private var names: [UUID: String] = [:]
    @State private var icons: [UUID: String?] = [:]
    @State private var removed: [UUID] = []
    @State private var selected: UUID?
    @State private var busy = false
    @State private var error: String?

    init(store: CatalogueStore, section: RecipeSection, parent: RecipeCategory?, groups: [RecipeCategory],
         selected: UUID? = nil) {
        self.store = store
        self.section = section
        self.parent = parent
        self.groups = groups
        _selected = State(initialValue: selected ?? groups.first?.id)
    }

    /// Where these groups sit: the drawer, or the group they are inside.
    private var place: String { parent?.name ?? section.title }
    private var kept: [RecipeCategory] { groups.filter { !removed.contains($0.id) } }
    private var current: RecipeCategory? { kept.first { $0.id == selected } }

    private func icon(of group: RecipeCategory) -> String? {
        if let picked = icons[group.id] { return picked }
        return group.iconKey
    }

    private func name(of group: RecipeCategory) -> Binding<String> {
        Binding(get: { names[group.id] ?? group.name }, set: { names[group.id] = $0 })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if kept.isEmpty {
                        Text(groups.isEmpty ? "No groups in \(place) yet." : "Done takes every group out of \(place).")
                            .font(.system(size: 15)).foregroundStyle(Palette.muted)
                            .frame(maxWidth: .infinity).padding(.vertical, 24)
                    } else {
                        ListGroup {
                            ForEach(kept) { group in row(group) }
                        }
                    }
                    if let current {
                        iconGrid(for: current)
                    }
                    if !removed.isEmpty {
                        Button(removed.count == 1 ? "Undo the delete" : "Undo \(removed.count) deletes") { removed = [] }
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Palette.accentInk)
                    }
                    NoteBox("Deleting a group moves its recipes up a level. Nothing is lost.", tone: .sky)
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
            .centeredTitle("Edit groups")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.foregroundStyle(Palette.accentInk)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Saving…" : "Done") { Task { await save() } }
                        .fontWeight(.semibold)
                        .foregroundStyle(Palette.accentInk)
                        .disabled(busy)
                }
            }
        }
        .presentationBackground(Palette.bg)
    }

    private func row(_ group: RecipeCategory) -> some View {
        let on = group.id == selected
        return HStack(spacing: 12) {
            Button { selected = group.id } label: {
                FoodTile(iconKey: icon(of: group), tone: group.tone, size: 36)
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Icon for \(group.name)")
            .accessibilityValue(FoodIcon.named(icon(of: group))?.label ?? "None")
            TextField(group.name, text: name(of: group))
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Palette.text)
                .submitLabel(.done)
                .simultaneousGesture(TapGesture().onEnded { selected = group.id })
            if on {
                Pill("Editing", tone: .accent)
            } else {
                Button { withAnimation { removed.append(group.id) } } label: {
                    Image(systemName: "trash").font(.system(size: 16)).foregroundStyle(Palette.faint)
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(PressFade())
                .accessibilityLabel("Delete \(group.name)")
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 12)
        .padding(.vertical, 12)
        .frame(minHeight: 60)
        .background(on ? Palette.surface2.opacity(0.5) : .clear)
    }

    /// The icon for the group being edited: "No icon" and every drawing, the chosen one filled.
    private func iconGrid(for group: RecipeCategory) -> some View {
        let chosen = icon(of: group)
        return VStack(alignment: .leading, spacing: 12) {
            SectionLabel("Icon for \(names[group.id] ?? group.name)").padding(.horizontal, -4)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 7), spacing: 8) {
                iconOption(nil, label: "No icon", on: chosen == nil) {
                    Image(systemName: "circle.slash").font(.system(size: 17, weight: .medium))
                } pick: { icons[group.id] = .some(nil) }
                ForEach(FoodIcon.all) { food in
                    iconOption(food.key, label: food.label, on: chosen == food.key) {
                        food.image.resizable().scaledToFit().frame(width: 26, height: 26)
                    } pick: { icons[group.id] = .some(food.key) }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
    }

    private func iconOption<Content: View>(_ key: String?, label: String, on: Bool,
                                           @ViewBuilder content: () -> Content, pick: @escaping () -> Void) -> some View {
        Button(action: pick) {
            content()
                .foregroundStyle(on ? Palette.onAccent : Palette.muted)
                .frame(maxWidth: .infinity, minHeight: 40)
                .background(on ? Palette.accent : Palette.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func save() async {
        guard let household = store.household else {
            dismiss()
            return
        }
        busy = true
        error = nil
        do {
            // Deleting first, so a rename cannot collide with a name that is on its way out.
            for id in removed {
                try await APIClient.shared.deleteRecipeCategory(household: household, category: id)
            }
            for group in kept {
                let wanted = (names[group.id] ?? group.name).trimmingCharacters(in: .whitespaces)
                if !wanted.isEmpty && wanted != group.name {
                    try await APIClient.shared.renameRecipeCategory(household: household, category: group.id, name: wanted)
                }
                if let picked = icons[group.id], picked != group.iconKey {
                    try await APIClient.shared.setRecipeCategoryIcon(household: household, category: group.id, iconKey: picked)
                }
            }
            await store.load()
            dismiss()
        } catch {
            self.error = error.localizedDescription
            busy = false
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
            .pageBackground()
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }
}

#Preview("Edit groups") {
    let store = CatalogueStore(session: nil, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories)
    return EditGroupsView(store: store, section: .dinner, parent: nil,
                          groups: store.children(of: nil, in: .dinner))
}

#Preview("Edit groups — dark") {
    let store = CatalogueStore(session: nil, sample: SampleData.recipes, sampleCategories: SampleData.recipeCategories)
    return EditGroupsView(store: store, section: .dinner, parent: nil,
                          groups: store.children(of: nil, in: .dinner))
        .preferredColorScheme(.dark)
}
