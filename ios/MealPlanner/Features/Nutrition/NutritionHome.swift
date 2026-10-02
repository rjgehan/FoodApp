import SwiftUI

/// Where Nutrition facts' rows lead: an ingredient's label, a packet's, or a recipe's nutrition.
enum NutritionRoute: Hashable {
    case food(Int)
    case product(String, scanned: Bool)
    case recipe(UUID)

    init?(lookup: RecentLookup) {
        switch lookup.kind {
        case "FOOD": guard let id = Int(lookup.ref) else { return nil }; self = .food(id)
        case "PRODUCT": self = .product(lookup.ref, scanned: false)
        case "RECIPE": guard let id = UUID(uuidString: lookup.ref) else { return nil }; self = .recipe(id)
        default: return nil
        }
    }
}

/**
 Nutrition facts (the mockup's 5.4): look up any ingredient, packet or recipe of yours, or scan a
 packet's barcode; and see how the coming week's plan adds up, a day at a time, for one person.
 Underneath, what you looked at last.

 Ingredients and recipes are found as you type — they are the server's own data. Packets come
 from Open Food Facts, a charity that turns away addresses that ask too often, so they are only
 asked for when you press search, and the server keeps its own count as well. The same page as
 the web's, on the same answers.
 */
struct NutritionScreen: View {
    var session: Session
    /// Previews and the Gallery: these instead of the server.
    var sample: Sample?

    struct Sample {
        var week: PlanNutrition?
        var recent: [RecentLookup]
        var query = ""
        var found: NutritionSearchAnswer?
    }

    private enum Packets: Equatable {
        case notAsked, asking
        case answered(NutritionSearchAnswer)
    }

    @State private var week: PlanNutrition?
    @State private var weekFailed = false
    @State private var recent: [RecentLookup]?
    @State private var query = ""
    @State private var found: NutritionSearchAnswer?
    @State private var packets: Packets = .notAsked
    @State private var scanning = false
    @State private var opened: NutritionRoute?
    @FocusState private var typing: Bool

    private var q: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 8) {
                    SearchBox(text: $query, prompt: "Search an ingredient or product") { submit() }
                        .focused($typing)
                    Button { scanning = true } label: {
                        Image(systemName: "barcode.viewfinder")
                            .font(.system(size: 19, weight: .medium))
                            .foregroundStyle(Palette.onAccent)
                            .frame(width: 42, height: 42)
                            .background(Palette.accent, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(PressFade())
                    .accessibilityLabel("Scan a barcode")
                }

                if q.isEmpty {
                    WeekCard(week: week, failed: weekFailed, today: NutritionText.day(0))
                    recentSection
                } else {
                    results
                }

                SourceNote(attribution: .usda).padding(.top, 4)
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .pageBackground()
        .centeredTitle("Nutrition facts")
        .textBackButton("Explore")
        .navigationDestination(for: NutritionRoute.self) { destination($0) }
        .navigationDestination(item: $opened) { destination($0) }
        .fullScreenCover(isPresented: $scanning) {
            NutritionScannerScreen { barcode in
                scanning = false
                opened = .product(barcode, scanned: true)
            }
        }
        .task { await load() }
        .task(id: q) { await search() }
        .refreshable { await load() }
        #if DEBUG
        .task {
            switch UserDefaults.standard.string(forKey: "mp_debug_screen") {
            case "nutrition-scan": scanning = true
            case "nutrition-search": query = UserDefaults.standard.string(forKey: "mp_debug_query") ?? "chicken"
            default: break
            }
        }
        #endif
    }

    @ViewBuilder private func destination(_ route: NutritionRoute) -> some View {
        switch route {
        case .food(let id): NutritionFoodScreen(session: session, fdcId: id)
        case .product(let barcode, let scanned): NutritionProductScreen(session: session, barcode: barcode, scanned: scanned)
        case .recipe(let id): RecipeNutritionScreen(session: session, recipeId: id, backLabel: "Nutrition")
        }
    }

    // MARK: Recent lookups

    @ViewBuilder private var recentSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Recent lookups")
            if let recent {
                if recent.isEmpty {
                    Text("Things you look up or scan show here.")
                        .font(.system(size: 14)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .cardSurface()
                } else {
                    ListGroup(dividerInset: 68) {
                        ForEach(recent.prefix(6)) { r in
                            if let route = NutritionRoute(lookup: r) {
                                NavigationLink(value: route) {
                                    ListRow(r.kind == "FOOD" ? NutritionText.plainFoodName(r.label) : r.label,
                                            subtitle: "\(kindWord(r.kind)) · \(NutritionText.kcal(r.kcal)) kcal per \(r.per)",
                                            chevron: true,
                                            leading: { LookupMark(kind: r.kind, seed: r.ref) }, trailing: { EmptyView() })
                                }
                                .buttonStyle(PressFade())
                            }
                        }
                    }
                }
            }
        }
    }

    private func kindWord(_ kind: String) -> String {
        switch kind {
        case "PRODUCT": return "Product"
        case "RECIPE": return "Recipe"
        default: return "Ingredient"
        }
    }

    // MARK: Search

    @ViewBuilder private var results: some View {
        let current = found?.query == q ? found : nil
        let barcode = NutritionText.isBarcode(q)
        VStack(alignment: .leading, spacing: 16) {
            if barcode {
                ListGroup {
                    NavigationLink(value: NutritionRoute.product(q, scanned: false)) {
                        ListRow("Look up barcode \(q)", subtitle: "A packet, from Open Food Facts", chevron: true,
                                tile: ("barcode", .sky))
                    }
                    .buttonStyle(PressFade())
                }
            }
            if let current, !current.recipes.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Your recipes")
                    ListGroup(dividerInset: 68) {
                        ForEach(current.recipes) { r in
                            NavigationLink(value: NutritionRoute.recipe(r.id)) {
                                ListRow(r.name,
                                        subtitle: r.kcalPerServing.map { "Recipe · \(NutritionText.kcal($0)) kcal per serving" } ?? "Recipe",
                                        chevron: true,
                                        leading: { LookupMark(kind: "RECIPE", seed: r.id.uuidString) }, trailing: { EmptyView() })
                            }
                            .buttonStyle(PressFade())
                        }
                    }
                }
            }
            if !barcode {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Ingredients")
                    if let current {
                        if current.ingredients.isEmpty {
                            quiet("No ingredient called “\(q)” in the food data.")
                        } else {
                            ListGroup(dividerInset: 68) {
                                ForEach(current.ingredients) { f in
                                    NavigationLink(value: NutritionRoute.food(f.fdcId)) {
                                        ListRow(NutritionText.plainFoodName(f.name),
                                                subtitle: "\(NutritionText.kcal(f.kcal)) kcal · \(NutritionText.grams(f.protein)) protein per 100g",
                                                chevron: true,
                                                leading: { LookupMark(kind: "FOOD", seed: String(f.fdcId)) }, trailing: { EmptyView() })
                                    }
                                    .buttonStyle(PressFade())
                                }
                            }
                        }
                    } else {
                        Text("Looking…").font(.system(size: 14)).foregroundStyle(Palette.muted).padding(.horizontal, 4)
                    }
                }
                packetSection
            }
        }
    }

    @ViewBuilder private var packetSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Products")
            switch packets {
            case .notAsked:
                ListGroup {
                    Button { Task { await searchPackets() } } label: {
                        ListRow(q.count < 3 ? "Type a little more to search packets" : "Search packets for “\(q)”",
                                subtitle: "From Open Food Facts", chevron: q.count >= 3, tile: ("shippingbox", .sky))
                    }
                    .buttonStyle(PressFade())
                    .disabled(q.count < 3)
                }
            case .asking:
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Asking Open Food Facts…").font(.system(size: 14)).foregroundStyle(Palette.muted)
                }
                .padding(.horizontal, 4)
            case .answered(let answer):
                if answer.products.isEmpty {
                    quiet(packetProblem(answer.productsStatus))
                } else {
                    ListGroup(dividerInset: 68) {
                        ForEach(answer.products) { p in
                            NavigationLink(value: NutritionRoute.product(p.barcode, scanned: false)) {
                                ListRow(p.name,
                                        subtitle: [p.brand, p.size, p.kcal.map { "\(NutritionText.kcal($0)) kcal per 100g" }]
                                            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
                                        chevron: true,
                                        leading: { LookupMark(kind: "PRODUCT", seed: p.barcode) }, trailing: { EmptyView() })
                            }
                            .buttonStyle(PressFade())
                        }
                    }
                    SourceNote(attribution: .openFoodFacts)
                }
            }
        }
    }

    private func quiet(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14)).foregroundStyle(Palette.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .cardSurface()
    }

    private func packetProblem(_ status: String) -> String {
        switch status {
        case "busy": return "Open Food Facts has had a lot of questions from us this minute. Try again in a moment."
        case "unavailable": return "Can't reach Open Food Facts just now."
        case "debounced": return "One moment — try again."
        default: return "No packets found. Scanning the barcode finds more."
        }
    }

    // MARK: Loading

    private func load() async {
        if let sample {
            week = sample.week
            recent = sample.recent
            if !sample.query.isEmpty {
                query = sample.query
                found = sample.found
            }
            return
        }
        async let recentAnswer = try? APIClient.shared.recentLookups(household: session.household?.id)
        if let household = session.household?.id {
            do {
                // The next seven days from today, so the chart is always a week, whatever the
                // planning window — the same seven days as the web and Explore's door.
                week = try await APIClient.shared.planNutrition(household: household, start: NutritionText.day(0),
                                                                end: NutritionText.day(6))
                weekFailed = false
            } catch {
                weekFailed = week == nil
            }
        }
        recent = await recentAnswer ?? recent ?? []
    }

    private func search() async {
        packets = .notAsked
        guard !q.isEmpty else { found = nil; return }
        if sample != nil { return }
        // Typing settles first: it is a lookup, not a race.
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        let asked = q
        let answer = try? await APIClient.shared.nutritionSearch(asked, household: session.household?.id, products: false)
        guard !Task.isCancelled, asked == q else { return }
        found = answer ?? NutritionSearchAnswer(query: asked, ingredients: [], products: [], productsStatus: "skipped", recipes: [])
    }

    private func submit() {
        if NutritionText.isBarcode(q) {
            opened = .product(q, scanned: false)
        } else {
            Task { await searchPackets() }
        }
    }

    private func searchPackets() async {
        guard q.count >= 3, !NutritionText.isBarcode(q), sample == nil else { return }
        let asked = q
        packets = .asking
        do {
            var answer = try await APIClient.shared.nutritionSearch(asked, household: session.household?.id, products: true)
            // Too soon after the last one: the server says so rather than asking. Once more, a moment later.
            if answer.productsStatus == "debounced" {
                try? await Task.sleep(for: .milliseconds(1300))
                answer = try await APIClient.shared.nutritionSearch(asked, household: session.household?.id, products: true)
            }
            if asked == q { packets = .answered(answer) }
        } catch {
            if asked == q {
                packets = .answered(NutritionSearchAnswer(query: asked, ingredients: [], products: [],
                                                          productsStatus: "unavailable", recipes: []))
            }
        }
    }
}

/**
 This week's plan (5.4): the average day for one person, a bar a day, and the day's protein,
 carbs and fat on average. The average is of the days with two or more meals counted, when there
 are any (a day with only its dinner planned is a third of a day, and is drawn faint); the pill
 and the line under it say which days and how many meals the numbers stand on.
 */
struct WeekCard: View {
    let week: PlanNutrition?
    var failed = false
    let today: String

    var body: some View {
        let counted = week?.daysCounted ?? 0
        let over = week?.averageDays ?? counted
        let partly = week?.averageOver == "partial"
        VStack(alignment: .leading, spacing: 14) {
            if failed {
                Text("Could not add up this week's plan.").font(.system(size: 14)).foregroundStyle(Palette.muted)
            } else {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("THIS WEEK'S PLAN").font(.label).tracking(0.6).foregroundStyle(Palette.muted)
                        Text(week == nil ? " " : counted > 0 ? "\(NutritionText.kcal(week?.average.kcal)) kcal a day on average"
                             : "Nothing counted yet")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Palette.text)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if counted > 0 {
                        Pill(partly ? "\(over) partly planned" : "\(over) \(over == 1 ? "day" : "days")",
                             tone: partly ? .mustard : .sky, systemImage: "calendar")
                            .padding(.top, 2)
                    }
                }
                if let week {
                    WeekChart(days: week.days, today: today)
                } else {
                    Color.clear.frame(height: 110)
                }
                HStack(spacing: 8) {
                    ForEach(Macro.allCases) { macro in
                        NutritionStat(value: counted > 0 ? NutritionText.grams(week?.average[macro]) : "–",
                                      label: macro.label, tone: macro.tone)
                    }
                }
                if let week {
                    Text(footnote(week))
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .accessibilityElement(children: .contain)
    }

    private func footnote(_ week: PlanNutrition) -> String {
        if week.mealsPlanned == 0 { return "Nothing planned for the next seven days. Plan some meals and see what they add up to." }
        let all = week.mealsCounted == week.mealsPlanned
        let average = week.daysCounted > 0 ? week.averageWords() : ""
        return "One person's share: a serving of each meal. " + (all
            ? "All \(week.mealsPlanned) planned \(week.mealsPlanned == 1 ? "meal" : "meals") counted."
            : "\(week.mealsCounted) of \(week.mealsPlanned) planned meals counted — places, links and foods without data aren't.")
            + (average.isEmpty ? "" : " " + average)
    }
}

#Preview("Nutrition facts") {
    NavigationStack {
        NutritionScreen(session: .preview, sample: .init(week: NutritionSamples.week, recent: NutritionSamples.recent))
    }
}

#Preview("Nutrition facts — dark") {
    NavigationStack {
        NutritionScreen(session: .preview, sample: .init(week: NutritionSamples.week, recent: NutritionSamples.recent))
    }
    .preferredColorScheme(.dark)
}

#Preview("Nutrition facts — searching") {
    NavigationStack {
        NutritionScreen(session: .preview, sample: .init(week: NutritionSamples.week, recent: [],
                                                         query: "chick", found: NutritionSamples.search))
    }
}

#Preview("Nutrition facts — nothing planned") {
    NavigationStack {
        NutritionScreen(session: .preview, sample: .init(week: NutritionSamples.emptyWeek, recent: []))
    }
}
