import SwiftUI

/**
 A recipe's nutrition (the mockup's 5.6), worked out on the server from the ingredients: how much
 of a day one serving is, protein, carbs and fat against a day's worth, which ingredients the
 calories come from, and what was left out — an optional side can be counted in with a tap, and
 the note says which figures are estimates.

 Opened from the recipe page (back says "Recipe") or from Nutrition's search and recent lookups
 (back says "Nutrition").
 */
struct RecipeNutritionScreen: View {
    var session: Session
    let recipeId: UUID
    var backLabel = "Recipe"
    /// Previews and the Gallery: this instead of the server.
    var sample: RecipeNutrition?

    /// Rows of contributors shown before "All N ingredients".
    private static let first = 5

    private struct Ask: Hashable {
        var servings: Int
        var include: [UUID]
    }

    @State private var n: RecipeNutrition?
    @State private var failed: String?
    @State private var servings = 1
    @State private var include: [UUID] = []
    @State private var all = false
    @State private var remembered = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let n {
                    content(n)
                } else if let failed {
                    Text(failed).font(.system(size: 14)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(16).cardSurface()
                } else {
                    VStack(spacing: 10) {
                        ProgressView()
                        Text("Working it out…").font(.system(size: 14)).foregroundStyle(Palette.muted)
                    }
                    .frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 2)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .centeredTitle(n?.name ?? "")
        .textBackButton(backLabel)
        .toolbar(.hidden, for: .tabBar)
        .task(id: Ask(servings: servings, include: include)) { await load() }
    }

    @ViewBuilder private func content(_ n: RecipeNutrition) -> some View {
        let shown = n.forServings
        let pct = n.percentOfReference.kcal
        HStack {
            Text("\(n.recipeServings) \(n.recipeServings == 1 ? "serving" : "servings") in the recipe")
                .font(.system(size: 14)).foregroundStyle(Palette.muted)
            Spacer(minLength: 8)
            ServingsStepper(value: $servings, label: true)
        }

        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                KcalRing(share: Double(pct ?? 0) / 100, kcal: shown.kcal)
                VStack(alignment: .leading, spacing: 4) {
                    Text(pct.map { "\($0)% of \(n.reference.label)" } ?? "No calories counted")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                    if let said = n.summary {
                        Text(said).font(.system(size: 13)).foregroundStyle(Palette.muted).lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            ForEach(Macro.allCases) { macro in
                MacroBar(macro: macro, value: shown[macro], goal: n.reference[macro])
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()

        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Biggest contributors")
            contributors(n)
        }

        NoteBox(n.note, tone: .sky)
        SourceNote(attribution: n.attribution ?? .usda)
    }

    @ViewBuilder private func contributors(_ n: RecipeNutrition) -> some View {
        let shown = all ? n.contributors : Array(n.contributors.prefix(Self.first))
        let hidden = n.contributors.count - shown.count
        let optionalOut = n.notCounted.filter { $0.reason == "OPTIONAL" }
        let otherOut = n.notCounted.filter { $0.reason != "OPTIONAL" }
        if n.contributors.isEmpty && n.notCounted.isEmpty {
            Text("No ingredients to count yet.").font(.system(size: 14)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity, alignment: .leading).padding(16).cardSurface()
        } else {
            ListGroup {
                ForEach(shown) { c in
                    let counted = include.contains(c.recipeIngredientId)
                    Button { if counted { toggle(c.recipeIngredientId) } } label: {
                        ListRow(NutritionText.capitalised(c.name), subtitle: subtitle(c, countedIn: counted),
                                leading: { lead("\(Int((c.share * 100).rounded()))%") }, trailing: { EmptyView() })
                    }
                    .buttonStyle(PressFade())
                    .disabled(!counted)
                    .accessibilityHint(counted ? "Leaves it out" : "")
                }
                if hidden > 0 {
                    Button { all = true } label: {
                        ListRow("All \(n.contributors.count) ingredients", titleColor: Palette.accentInk,
                                leading: { lead("…") }, trailing: { EmptyView() })
                    }
                    .buttonStyle(PressFade())
                }
                ForEach(optionalOut) { x in
                    Button { toggle(x.recipeIngredientId) } label: {
                        ListRow(NutritionText.capitalised(x.name) + (x.name.lowercased().contains("(") ? "" : " (optional)"),
                                subtitle: "Not included · tap to add", titleColor: Palette.muted,
                                leading: { lead("+") }, trailing: { EmptyView() })
                    }
                    .buttonStyle(PressFade())
                    .accessibilityLabel("Count \(x.name) in")
                }
                ForEach(otherOut) { x in
                    ListRow(NutritionText.capitalised(x.name), subtitle: why(x.reason), titleColor: Palette.muted,
                            leading: { lead("–") }, trailing: { EmptyView() })
                }
            }
        }
    }

    private func lead(_ text: String) -> some View {
        Text(text).font(.system(size: 14, weight: .bold)).monospacedDigit().foregroundStyle(Palette.text)
            .frame(width: 38, alignment: .leading)
    }

    /// "318 kcal · 38g protein": its calories, and the macro that brings the most of them.
    private func subtitle(_ c: NutritionContributor, countedIn: Bool) -> String {
        let main = [(4 * c.protein, "\(NutritionText.grams(c.protein)) protein"),
                    (4 * c.carbs, "\(NutritionText.grams(c.carbs)) carbs"),
                    (9 * c.fat, "\(NutritionText.grams(c.fat)) fat")].max { $0.0 < $1.0 }!.1
        return "\(NutritionText.kcal(c.kcal)) kcal · \(main)" + (countedIn ? " · optional, tap to leave out" : "")
    }

    private func why(_ reason: String) -> String {
        switch reason {
        case "NO_AMOUNT": return "Not counted · no amount"
        case "NO_MATCH": return "Not counted · not in the food data yet"
        case "NO_WEIGHT": return "Not counted · couldn't weigh the amount"
        default: return "Not included · tap to add"
        }
    }

    private func toggle(_ id: UUID) {
        if let i = include.firstIndex(of: id) { include.remove(at: i) } else { include.append(id) }
    }

    // MARK: Loading

    private func load() async {
        if let sample {
            n = sample
            return
        }
        do {
            // The last answer stays up while the next one comes, so stepping servings does not flash.
            let answer = try await APIClient.shared.recipeNutrition(recipeId, household: session.household?.id,
                                                                     servings: servings, include: include)
            n = answer
            failed = nil
            if !remembered {
                remembered = true
                // Lower case, as the web and the server write a UUID, so the same recipe is one lookup.
                try? await APIClient.shared.rememberLookup(kind: "RECIPE", ref: recipeId.uuidString.lowercased(),
                                                           household: session.household?.id)
            }
        } catch let error as APIError where error.status == 404 || error.status == 403 {
            failed = "That recipe is gone."
        } catch is CancellationError {
        } catch {
            if n == nil { failed = "Could not work out its nutrition." }
        }
    }
}

#Preview("A recipe's nutrition") {
    NavigationStack {
        RecipeNutritionScreen(session: .preview, recipeId: NutritionSamples.recipeId,
                              sample: NutritionSamples.lemonChicken())
    }
}

#Preview("A recipe's nutrition — dark") {
    NavigationStack {
        RecipeNutritionScreen(session: .preview, recipeId: NutritionSamples.recipeId,
                              sample: NutritionSamples.lemonChicken())
    }
    .preferredColorScheme(.dark)
}
