import SwiftUI

/**
 The front door of Explore (the mockup's 5.1): three doors.

 The other four tabs each hold one thing this household owns — its plan, its recipes, its list,
 its cupboard. Explore is the opposite: everything here is bigger than the house, and there is
 more than one kind of it. So the tab opens on a choice rather than a list, and a new kind can
 arrive later without anything having to move.

 Global recipes is the open one, so it is first and biggest, with how many there are on it.
 Nutrition facts shows what the coming week's plan adds up to, a day on average — and is only
 there once the server has said it has Nutrition facts, so a phone ahead of its server shows no
 door that leads nowhere. Meal plans shows what the cupboard holds and a couple of plans, once
 the server has said it has meal plans; a server from before them keeps the old "coming soon"
 door instead. The same three doors as the web, in the same order and colours.
*/
struct ExploreView: View {
    var session: Session
    /// Published recipes to show without a server — previews and the Gallery.
    var sample: [Recipe]?
    /// The week Nutrition's door adds up, without a server (previews and the Gallery).
    var sampleWeek: PlanNutrition?
    /// Meal plans' door without a server (previews and the Gallery).
    var sampleMealPlans: MealPlansHome?

    @State private var path = NavigationPath()
    @State private var count: Int?
    @State private var week: PlanNutrition?
    @State private var nutrition = NutritionAvailability.shared
    @State private var mealPlans = MealPlansAvailability.shared
    @State private var plansHome: MealPlansHome?
    @State private var switchingHousehold = false
    @State private var showingAccount = false
    @State private var showingIdeas = false
    #if DEBUG
    @State private var debugOpened = false
    #endif

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TopBar(session: session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
                    LargeTitle("Explore")
                    VStack(spacing: 14) {
                        NavigationLink(value: ExploreRoute.globalRecipes) {
                            GlobalRecipesDoor(count: count)
                        }
                        .buttonStyle(PressFade())
                        if sampleWeek != nil || nutrition.available == true {
                            NavigationLink(value: ExploreRoute.nutrition) {
                                NutritionDoor(week: week)
                            }
                            .buttonStyle(PressFade())
                        }
                        if sampleMealPlans != nil || mealPlans.available == true {
                            MealPlansDoor(home: plansHome) { route in openMealPlans(route) }
                        } else {
                            ForEach(SoonDestination.all) { destination in
                                NavigationLink(value: ExploreRoute.soon(destination.kind)) {
                                    SoonDoor(destination: destination)
                                }
                                .buttonStyle(PressFade())
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
            }
            .pageBackground()
            .hidesNavigationBar()
            // The bar is hidden here, but its title is what the next screen's back button says.
            .navigationTitle("Explore")
            .refreshable {
                await loadCount()
                await loadWeek()
                await loadMealPlans()
            }
            .householdSheets(session, switching: $switchingHousehold, account: $showingAccount, ideas: $showingIdeas)
            .navigationDestination(for: ExploreRoute.self) { route in
                switch route {
                case .globalRecipes:
                    GlobalRecipesScreen(session: session, sample: sample)
                case .nutrition:
                    if let sampleWeek {
                        NutritionScreen(session: session, sample: .init(week: sampleWeek, recent: NutritionSamples.recent))
                    } else {
                        NutritionScreen(session: session)
                    }
                case .soon(let kind):
                    if let destination = SoonDestination.all.first(where: { $0.kind == kind }) {
                        SoonScreen(destination: destination)
                    }
                }
            }
            .navigationDestination(for: MealPlansRoute.self) { route in
                switch route {
                case .home: MealPlansScreen(session: session, path: $path, sample: sampleMealPlans)
                case .cupboard: CupboardSetupScreen(session: session, path: $path)
                case .plan(let id): TargetPlanScreen(session: session, path: $path, planId: id)
                case .preset(let key): TargetPlanScreen(session: session, path: $path, preset: key)
                case .newPlan: TargetPlanForm(session: session, path: $path)
                case .editPlan(let id): TargetPlanForm(session: session, path: $path, planId: id)
                }
            }
        }
        .task {
            await loadCount()
            #if DEBUG
            await mealPlans.check()
            debugOpen()
            #endif
        }
        .task(id: session.household?.id) {
            await loadWeek()
            await loadMealPlans()
        }
        // Back from Nutrition facts or Meal plans: the week or the cupboard may have changed meanwhile.
        .onChange(of: path.count) { _, depth in
            if depth == 0 {
                Task {
                    await loadWeek()
                    await loadMealPlans()
                }
            }
        }
    }

    /// The door's chips go through Meal plans, so Back from a plan lands there, as on the web.
    private func openMealPlans(_ route: MealPlansRoute) {
        path.append(MealPlansRoute.home)
        if route != .home { path.append(route) }
    }

    /// The same answer the Meal plans page opens with, so the door and the page agree.
    private func loadMealPlans() async {
        if let sampleMealPlans { plansHome = sampleMealPlans; return }
        await mealPlans.check()
        guard mealPlans.available == true, let household = session.household?.id else { return }
        if let home = try? await APIClient.shared.mealPlansHome(household: household) { plansHome = home }
    }

    /// The same seven days Nutrition's chart adds up, so the door and the page agree.
    private func loadWeek() async {
        if let sampleWeek { week = sampleWeek; return }
        await nutrition.check()
        guard nutrition.available == true, let household = session.household?.id else { return }
        week = try? await APIClient.shared.planNutrition(household: household, start: NutritionText.day(0),
                                                         end: NutritionText.day(6))
    }

    private func loadCount() async {
        if let sample { count = sample.count; return }
        guard let household = session.household?.id else { return }
        if let all = try? await APIClient.shared.explore(household: household) { count = all.count }
    }

    #if DEBUG
    /// Screenshot runs: -mp_debug_screen explore-recipes | explore-recipe | explore-move opens Global
    /// recipes (then its first published recipe from another house, then Move into my recipes on
    /// it); explore-meal-plans opens Meal plans (meal-plans-cupboard its setup, meal-plans-result the
    /// plan generated from it, meal-plans-new the create form, meal-plans-preset a ready-made plan
    /// by -mp_debug_ref <key>, meal-plans-plan one of yours by -mp_debug_ref <uuid>). explore-nutrition opens Nutrition facts
    /// (nutrition-search and nutrition-scan with it); nutrition-food | nutrition-product |
    /// nutrition-recipe go on to an ingredient's label (-mp_debug_ref <fdcId>), a packet's
    /// (-mp_debug_ref <barcode>) or a recipe's nutrition (-mp_debug_recipe <uuid>).
    private func debugOpen() {
        guard !debugOpened else { return }
        debugOpened = true
        let ref = UserDefaults.standard.string(forKey: "mp_debug_ref") ?? ""
        switch UserDefaults.standard.string(forKey: "mp_debug_screen") {
        case "explore-recipes", "explore-recipe", "explore-move": path.append(ExploreRoute.globalRecipes)
        case "explore-nutrition", "nutrition-search", "nutrition-scan": path.append(ExploreRoute.nutrition)
        case "nutrition-food":
            path.append(ExploreRoute.nutrition)
            path.append(NutritionRoute.food(Int(ref) ?? 171477))
        case "nutrition-product":
            path.append(ExploreRoute.nutrition)
            // Opened, not scanned: the label says "scanned" only after the camera read it.
            path.append(NutritionRoute.product(ref.isEmpty ? "5000112637922" : ref, scanned: false))
        case "nutrition-recipe":
            if let id = UserDefaults.standard.string(forKey: "mp_debug_recipe").flatMap(UUID.init(uuidString:)) {
                path.append(ExploreRoute.nutrition)
                path.append(NutritionRoute.recipe(id))
            }
        case "explore-meal-plans":
            if mealPlans.available == true { path.append(MealPlansRoute.home) } else { path.append(ExploreRoute.soon(.mealPlans)) }
        case "meal-plans-cupboard", "meal-plans-result": openMealPlans(.cupboard)
        case "meal-plans-new": openMealPlans(.newPlan)
        case "meal-plans-preset": openMealPlans(.preset(ref.isEmpty ? "build-muscle" : ref))
        case "meal-plans-plan":
            if let id = UUID(uuidString: ref) { openMealPlans(.plan(id)) }
        default: break
        }
    }
    #endif
}

/// Where Explore's doors lead.
enum ExploreRoute: Hashable {
    case globalRecipes
    case nutrition
    case soon(SoonDestination.Kind)
}

// MARK: - The doors

/**
 Meal plans: the mockup's 5.7–5.11, still to be built. Its door is on Explore now and opens on a
 page that says what is coming, so the place the work lands already exists. The words come from
 the designer's notes for those screens, as on the web.
 */
struct SoonDestination: Identifiable, Hashable {
    enum Kind: Hashable { case mealPlans }

    let kind: Kind
    let title: String
    let blurb: String
    let symbol: String
    let tone: Tone
    /// The door's one line about what is coming, where the finished one shows a teaser of your data.
    let teaser: String
    /// What it is for, in a sentence, on the page behind the door.
    let plan: String
    /// What it will do, a row each.
    let will: [Promise]

    struct Promise: Hashable {
        let symbol: String
        let title: String
        let detail: String
    }

    var id: Kind { kind }

    static let all: [SoonDestination] = [
        SoonDestination(
            kind: .mealPlans,
            title: "Meal plans",
            blurb: "From your cupboard, or built for a goal",
            symbol: "target",
            tone: .plum,
            teaser: "A week made for you",
            plan: "A week of meals made for you, from your own recipes first, ready to put on the Plan in one go.",
            will: [
                Promise(symbol: "cabinet", title: "Cook from cupboard",
                        detail: "Meals that use what you already have, and the few things to buy for them."),
                Promise(symbol: "heart", title: "Plans for a health target",
                        detail: "Ready-made or your own, with daily targets worked out for you."),
                Promise(symbol: "calendar", title: "Apply it to your Plan",
                        detail: "Every meal goes on the Plan; swap any you do not fancy first."),
            ]
        ),
    ]
}

/// Global recipes' door: a big green picture with how many there are on it.
struct GlobalRecipesDoor: View {
    let count: Int?

    var body: some View {
        ZStack(alignment: .topLeading) {
            RecipePhotoPlaceholder(hue: .green, systemImage: "globe", radius: 24)
            VStack(alignment: .leading, spacing: 0) {
                if let count {
                    Pill("\(count) \(count == 1 ? "recipe" : "recipes")", tone: .herb, systemImage: "globe")
                }
                Spacer(minLength: 0)
                Text("Global recipes").titleFont(28).foregroundStyle(.white)
                Text("Published by households on this server")
                    .font(.system(size: 14)).foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1).minimumScaleFactor(0.85)
            }
            .padding(18)
        }
        .frame(height: 196)
        .frame(maxWidth: .infinity)
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Global recipes" + (count.map { ", \($0) published" } ?? ""))
    }
}

/**
 Nutrition facts' door (5.1): its tile, name and line, then the week's plan as three numbers — a
 day's calories, protein and fibre on average, for one person, and which days that is of (the ones
 with two or more meals planned, or "partly planned" ones), so a week of dinners is not read as a
 day's eating. Until something on the plan can be counted it says how to get some numbers, rather
 than showing noughts.
 */
struct NutritionDoor: View {
    let week: PlanNutrition?

    var body: some View {
        let average = (week?.daysCounted ?? 0) > 0 ? week?.average : nil
        Card(padding: 16, spacing: 12) {
            HStack(spacing: 12) {
                Tile("leaf", tone: .herb, size: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Nutrition facts").titleFont(20).foregroundStyle(Palette.text)
                    Text("Ingredients, scanned products and your recipes").font(.system(size: 13))
                        .foregroundStyle(Palette.muted).multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            HStack(spacing: 8) {
                NutritionStat(value: average.map { NutritionText.kcal($0.kcal) } ?? "–", label: "kcal / day")
                NutritionStat(value: average.map { NutritionText.grams($0.protein) } ?? "–", label: "Protein", tone: .herb)
                NutritionStat(value: average.map { NutritionText.grams($0.fibre) } ?? "–", label: "Fibre", tone: .mustard)
            }
            Text(week == nil ? " " : average != nil ? (week?.averageWords(short: true) ?? "")
                 : "Plan some meals and see what your week adds up to")
                .font(.system(size: 12)).foregroundStyle(Palette.muted)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Nutrition facts" + (average.map { ", \(NutritionText.kcal($0.kcal)) kcal a day on average this week" } ?? ""))
    }
}

/// A door that is not open yet: its tile, name and line, and a plain note that it is coming.
struct SoonDoor: View {
    let destination: SoonDestination

    var body: some View {
        Card(padding: 16, spacing: 12) {
            HStack(spacing: 12) {
                Tile(destination.symbol, tone: destination.tone, size: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text(destination.title).titleFont(20).foregroundStyle(Palette.text)
                    Text(destination.blurb).font(.system(size: 13)).foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            HStack(spacing: 10) {
                Pill("Coming soon", tone: destination.tone, systemImage: "clock")
                Text(destination.teaser).font(.system(size: 13)).foregroundStyle(Palette.muted)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .accessibilityElement(children: .combine)
    }
}

/// Behind a door that is not open yet: what the thing will do, and nothing else — no mocked-up
/// charts, which could not be told apart from broken ones.
struct SoonScreen: View {
    let destination: SoonDestination

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(spacing: 12) {
                    Tile(destination.symbol, tone: destination.tone, size: 64)
                    Pill("Coming soon", tone: destination.tone, systemImage: "clock")
                    Text(destination.title).titleFont(26).foregroundStyle(Palette.text)
                    Text(destination.plan).font(.system(size: 15)).foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.top, 28)
                .padding(.bottom, 24)
                .cardSurface()

                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("What it will do")
                    ListGroup(dividerInset: 64) {
                        ForEach(destination.will, id: \.self) { promise in
                            ListRow(promise.title, subtitle: promise.detail, wrapSubtitle: true,
                                    leading: { Tile(promise.symbol, tone: destination.tone, size: 36) },
                                    trailing: { EmptyView() })
                        }
                    }
                }

                Text("Not built yet. This is where it will go.")
                    .font(.system(size: 13)).foregroundStyle(Palette.faint)
                    .padding(.horizontal, 4)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .centeredTitle(destination.title)
        .textBackButton("Explore")
    }
}

#Preview("Explore") {
    ExploreView(session: .preview, sample: SampleData.published, sampleWeek: NutritionSamples.week,
                sampleMealPlans: MealPlanSamples.home)
}

#Preview("Explore — dark") {
    ExploreView(session: .preview, sample: SampleData.published, sampleWeek: NutritionSamples.week,
                sampleMealPlans: MealPlanSamples.home)
        .preferredColorScheme(.dark)
}

#Preview("Explore — nothing planned") {
    ExploreView(session: .preview, sample: SampleData.published, sampleWeek: NutritionSamples.emptyWeek)
}

#Preview("Coming soon") {
    NavigationStack { SoonScreen(destination: SoonDestination.all[0]) }
}
