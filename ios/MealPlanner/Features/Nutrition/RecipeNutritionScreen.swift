import SwiftUI

/**
 A recipe's nutrition (the mockup's 5.6), worked out on the server from the ingredients: how much
 of a day one serving is, protein, carbs and fat against a day's worth, which ingredients the
 calories come from, and what was left out — an optional side can be counted in with a tap, and
 the note says which figures are estimates.

 On a phone with Apple Intelligence, once the server has answered, the model looks at the lines
 the server was unsure of (NutritionAssist.swift): it picks the food from the server's shortlist
 and estimates what a knob or a handful weighs, the server takes those for everyone, and the
 numbers are asked for again. It also writes the few words under the ring. Whatever it chose is
 marked ✨; without it — some phones, the web — this is the server's answer alone.

 Opened from the recipe page (back says "Recipe") or from Nutrition's search and recent lookups
 (back says "Nutrition").
 */
struct RecipeNutritionScreen: View {
    var session: Session
    let recipeId: UUID
    var backLabel = "Recipe"
    /// Previews and the Gallery: this instead of the server.
    var sample: RecipeNutrition?
    /// Previews: as a phone with Apple Intelligence would show it, these words under the ring.
    var sampleWords: String?

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
    @State private var assisted = false
    /// How many lines the model is looking at now; 0 when it is not.
    @State private var checking = 0
    /// The model's own words for a serving, once they have passed the checks.
    @State private var words: String?

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
        // With nothing counted there is nothing to scale or rank: the list is only what was left out.
        let nothingCounted = n.contributors.isEmpty
        let pct = nothingCounted ? nil : n.percentOfReference.kcal
        HStack {
            Text("\(n.recipeServings) \(n.recipeServings == 1 ? "serving" : "servings") in the recipe")
                .font(.system(size: 14)).foregroundStyle(Palette.muted)
            Spacer(minLength: 8)
            ServingsStepper(value: $servings, label: true)
                .disabled(nothingCounted)
                .opacity(nothingCounted ? 0.45 : 1)
        }

        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                KcalRing(share: Double(pct ?? 0) / 100, kcal: shown.kcal)
                VStack(alignment: .leading, spacing: 4) {
                    Text(pct.map { "\($0)% of \(n.reference.label)" } ?? "No calories counted")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                    if let said = words ?? sampleWords ?? NutritionAssist.ruleSummary(n) {
                        Text(said).font(.system(size: 13)).foregroundStyle(Palette.muted).lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if words != nil || sampleWords != nil {
                        AppleIntelligenceMark().padding(.top, 2)
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
            SectionLabel(nothingCounted ? "Not counted" : "Biggest contributors")
            contributors(n)
            if checking > 0 {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Apple Intelligence is checking \(checking) \(checking == 1 ? "ingredient" : "ingredients")…")
                        .font(.system(size: 12)).foregroundStyle(Palette.muted)
                }
                .padding(.horizontal, 4)
                .padding(.top, 2)
            } else if n.contributors.contains(where: { $0.foodChosenByModel || $0.weightEstimatedByModel }) {
                HStack(spacing: 8) {
                    AppleIntelligenceMark()
                    (Text("chose the food or the weight on lines marked ") + Text(Image(systemName: "sparkles")).foregroundColor(Palette.plum))
                        .font(.system(size: 12)).foregroundStyle(Palette.muted)
                }
                .padding(.horizontal, 4)
                .padding(.top, 2)
            }
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
                        ListRow(NutritionText.capitalised(c.name), subtitle: subtitle(c, countedIn: counted, in: n),
                                wrapSubtitle: true,
                                leading: { lead("\(Int((c.share * 100).rounded()))%") },
                                trailing: {
                                    if c.foodChosenByModel || c.weightEstimatedByModel {
                                        Image(systemName: "sparkles").font(.system(size: 13, weight: .semibold))
                                            .foregroundStyle(Palette.plum)
                                            .accessibilityLabel("Chosen by Apple Intelligence")
                                    }
                                })
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

    /// "318 kcal · 38g protein": its calories, and the macro that brings the most of them; then
    /// the amount and what it was weighed as ("4 fillets · ≈130g each"), so a wrong weight shows.
    private func subtitle(_ c: NutritionContributor, countedIn: Bool, in n: RecipeNutrition) -> String {
        let main = [(4 * c.protein, "\(NutritionText.grams(c.protein)) protein"),
                    (4 * c.carbs, "\(NutritionText.grams(c.carbs)) carbs"),
                    (9 * c.fat, "\(NutritionText.grams(c.fat)) fat")].max { $0.0 < $1.0 }!.1
        let first = "\(NutritionText.kcal(c.kcal)) kcal · \(main)" + (countedIn ? " · optional, tap to leave out" : "")
        let scale = n.recipeServings > 0 ? n.servings / Double(n.recipeServings) : 0
        let each = NutritionText.eachText(c, scale: scale)
        return each.isEmpty ? first : first + "\n" + each
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
            if !assisted {
                assisted = true
                Task { await assist(answer) }
            }
        } catch let error as APIError where error.status == 404 || error.status == 403 {
            failed = "That recipe is gone."
        } catch is CancellationError {
        } catch {
            if n == nil { failed = "Could not work out its nutrition." }
        }
    }

    /// Apple Intelligence's turn, once, after the server's first answer. Nothing happens without it.
    private func assist(_ first: RecipeNutrition) async {
        guard let thinker = NutritionAI.thinker else { return }
        let memory = DefaultsAskedMemory()
        let work = NutritionAssist.work(for: first, memory: memory)
        var latest = first
        if !work.isEmpty {
            checking = work.matches.count + work.grams.count
            let outcome = await NutritionAssist.improve(work, thinker: thinker, server: LiveNutritionAssistServer(), memory: memory)
            checking = 0
            if outcome.changed, let again = try? await APIClient.shared.recipeNutrition(
                recipeId, household: session.household?.id, servings: servings, include: include) {
                n = again
                latest = again
            }
        }
        words = await NutritionAssist.summary(for: latest, thinker: thinker)
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

#Preview("With Apple Intelligence") {
    NavigationStack {
        RecipeNutritionScreen(session: .preview, recipeId: NutritionSamples.recipeId,
                              sample: NutritionSamples.lemonChicken(aiMarks: true),
                              sampleWords: "High protein and low carb, a filling dinner for a busy weeknight.")
    }
}
