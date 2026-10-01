import SwiftUI

/**
 What the Plan screens share: the meals on screen, where each stands with the shopping, and the
 household's recipes, places, saved links and cupboard for filling a slot — plus every change a
 Plan screen makes, each followed by a reload so every open sheet shows the same thing.

 The Plan tab owns one. The day sheet, a slot's fill screen and a dish's options all read it, so
 a dinner swapped from its options is already swapped in the day sheet underneath.
*/
@MainActor
@Observable
final class PlanStore {
    let session: Session
    /// Sample data and no network, for the gallery and previews.
    let sample: Bool

    var entries: [MealPlanEntry] = []
    var shopping: ShoppingMap?
    var recipes: [Recipe] = []
    var places: [Place] = []
    var links: [SavedLink] = []
    var cupboard: [CupboardItem] = []
    var loaded = false
    var error: String?
    /// The range last loaded, so a change reloads what is on screen.
    private var range: (from: String, to: String)?

    init(session: Session, sample: [MealPlanEntry]? = nil) {
        self.session = session
        self.sample = sample != nil
        if let sample {
            entries = sample
            recipes = SampleData.recipes
            links = SampleData.savedLinks
            loaded = true
        }
    }

    var household: UUID? { session.household?.id }
    var horizonDays: Int { max(1, session.household?.planningHorizonDays ?? 7) }
    var defaultServings: Int { session.defaultServings ?? 4 }

    var byDate: [String: [MealPlanEntry]] { Dictionary(grouping: entries, by: \.date) }
    var recipeById: [UUID: Recipe] { Dictionary(recipes.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }) }
    var placeById: [UUID: Place] { Dictionary(places.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }) }

    func entries(on date: String) -> [MealPlanEntry] {
        entries.filter { $0.date == date && $0.isPlanned }
    }

    // MARK: - Loading

    /// The month on screen and the planning window, whichever reaches further either way.
    func load(month: Date) async {
        guard !sample else { return }
        let today = Date().startOfDay
        let windowEnd = Day.adding(horizonDays - 1, to: today)
        let monthStart = month.startOfMonth
        let monthEnd = Day.adding(6, to: max(month.endOfMonth, windowEnd))
        range = (Day.iso(min(monthStart, today)), Day.iso(max(monthEnd, windowEnd)))
        await reload()
    }

    func reload() async {
        guard !sample, let household, let range else { return }
        do {
            async let list = APIClient.shared.plan(household: household, from: range.from, to: range.to)
            async let marks = APIClient.shared.planShopping(household: household, from: range.from, to: range.to)
            entries = try await list
            shopping = await marks
            error = nil
        } catch {
            if (error as? CancellationError) == nil && (error as? URLError)?.code != .cancelled {
                self.error = error.localizedDescription
            }
        }
        loaded = true
    }

    /// What filling a slot needs. Each is fine to be missing: an older server has no saved links.
    func loadPickings() async {
        guard !sample, let household else { return }
        async let r = try? APIClient.shared.recipes(household: household)
        async let p = try? APIClient.shared.places(household: household)
        async let l = try? APIClient.shared.savedLinks(household: household)
        async let c = try? APIClient.shared.cupboard(household: household)
        if let found = await r { recipes = found }
        if let found = await p { places = found }
        if let found = await l { links = found }
        if let found = await c { cupboard = found }
    }

    // MARK: - Changes

    func fill(date: String, meal: MealType, with filling: Filling, replacing: MealPlanEntry?) async throws {
        guard let household else { return }
        try await APIClient.shared.fillSlot(household: household, date: date, meal: meal, with: filling,
                                            replacing: replacing, servings: defaultServings)
        await reload()
    }

    /// Typing a name that is not saved yet makes the place, the way a new group works.
    func place(named name: String) async throws -> Place {
        guard let household else { throw CancellationError() }
        if let existing = places.first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) { return existing }
        let made = try await APIClient.shared.addPlace(household: household, name: name)
        places = (places + [made]).sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        return made
    }

    func patch(_ entries: [MealPlanEntry], _ body: [String: Any]) async throws {
        guard let household else { return }
        for entry in entries { try await APIClient.shared.patchPlanned(household: household, entry: entry.id, body) }
        await reload()
    }

    func remove(_ entries: [MealPlanEntry]) async throws {
        guard let household else { return }
        for entry in entries { try await APIClient.shared.removeFromPlan(household: household, entry: entry.id) }
        await reload()
    }

    /// Each dish's own Add to groceries — "I want its things", whatever happened to them since.
    func addToGroceries(_ entries: [MealPlanEntry]) async throws {
        guard let household else { return }
        for entry in entries { try await APIClient.shared.addMealToGroceries(household: household, entry: entry.id) }
        await reload()
    }

    /// The week's button, a day at a time so a day left unticked is left out.
    func addDaysToGroceries(_ dates: [String]) async throws {
        guard let household else { return }
        for date in dates { try await APIClient.shared.addRangeToGroceries(household: household, from: date, to: date) }
        await reload()
    }

    /// The window's meals and their marks, fresh, for the add sheet.
    func window() async -> ([MealPlanEntry], ShoppingMap?) {
        let today = Date().startOfDay
        let from = Day.iso(today), to = Day.iso(Day.adding(horizonDays - 1, to: today))
        guard !sample, let household else {
            return (entries.filter { $0.date >= from && $0.date <= to }, shopping)
        }
        let list = (try? await APIClient.shared.plan(household: household, from: from, to: to)) ?? []
        return (list, await APIClient.shared.planShopping(household: household, from: from, to: to))
    }

    func recipeMade(_ recipe: Recipe) {
        if !recipes.contains(where: { $0.id == recipe.id }) { recipes.append(recipe) }
    }
}
