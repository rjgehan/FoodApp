import SwiftUI

/**
 The shelves inside one drawer: add one, rename one, take one away.

 Reached from the drawer whose groups it edits, because "edit groups" with no drawer in mind
 is a question nobody asks — you are always looking at Dinner and deciding that Dinner needs a
 Chicken shelf.

 Taking a group away never takes its recipes with it. They move up a level, which is what the
 server does and what anybody would expect: a shelf is a way of arranging the drawer, not a
 thing the food lives inside.
*/
struct EditGroupsView: View {
    let section: RecipeSection
    let groups: [RecipeCategory]
    var session: Session?
    /// Reload the catalog, because renaming a group renames it on every recipe filed there.
    var onChanged: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var drafts: [UUID: String] = [:]
    @State private var adding = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        TextField("New group", text: $adding)
                        Button("Add") { Task { await add() } }
                            .disabled(busy || adding.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } footer: {
                    Text("A new group belongs to \(section.title).")
                }

                if groups.isEmpty {
                    Section {
                        Text("No groups in \(section.title) yet.").foregroundStyle(.secondary)
                    }
                } else {
                    Section {
                        ForEach(groups) { group in
                            HStack {
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
                        Text("Groups in \(section.title)")
                    } footer: {
                        Text("Edit a name and press return. Swipe to delete — the recipes in it "
                             + "move up into \(section.title) rather than going with it.")
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
        }
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
            try await APIClient.shared.createRecipeCategory(household: household, name: wanted, section: section)
            adding = ""
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
