import SwiftUI

/**
 "Delete Lemon herb chicken?" (the mockup's 3.20), from the recipe's ••• and from the foot of the
 edit form. It names the other households it is shared into — the ones you are in — whose plans
 keep the meal under its name, as text. The server does not say whose plans it is on, so it
 says "if".
 */
struct DeleteRecipeCard: View {
    let recipe: Recipe
    var session: Session?
    /// True once it is gone; false for "Keep it".
    var onDone: (Bool) -> Void

    @State private var deleting = false
    @State private var error: String?

    var body: some View {
        KitchenAlertCard(systemImage: "trash", title: "Delete \(recipe.name)?", message: message) {
            VStack(spacing: 8) {
                if let error {
                    Text(error).font(.system(size: 13)).foregroundStyle(Palette.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Button {
                    Task { await delete() }
                } label: {
                    if deleting { ProgressView().tint(Palette.onAccent) } else { Text("Delete recipe") }
                }
                .buttonStyle(.primary)
                .disabled(deleting)
                Button("Keep it") { onDone(false) }
                    .buttonStyle(.secondary)
                    .disabled(deleting)
            }
        }
    }

    private var message: Text {
        let named = (session?.households ?? [])
            .filter { recipe.sharedWith?.contains($0.id) == true && $0.id != session?.household?.id }
            .map(\.name)
        let elsewhere = (recipe.sharedWith?.count ?? 0) > named.count || recipe.published == true
        // One short paragraph, as the mockup's 3.20 — the web's words.
        if !named.isEmpty {
            let list = named.count > 1 ? named.dropLast().joined(separator: ", ") + " and " + named.last! : named[0]
            return Text("It's shared with ") + Text(list).bold().foregroundColor(Palette.text)
                + Text(": if it's on their plan, it stays there as text. This can't be undone.")
        }
        if elsewhere {
            return Text("Anyone who planned it keeps the name on their plan as text. This can't be undone.")
        }
        return Text("It comes off your plan and any share link stops working. This can't be undone.")
    }

    private func delete() async {
        deleting = true
        defer { deleting = false }
        do {
            try await APIClient.shared.deleteRecipe(recipe.id)
            NotificationCenter.default.post(name: .recipesChanged, object: nil)
            onDone(true)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Delete") {
    Color.clear.pageBackground()
        .kitchenAlert(isPresented: .constant(true)) {
            DeleteRecipeCard(recipe: SampleData.recipes[0], session: .preview) { _ in }
        }
}
