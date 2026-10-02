import SwiftUI

/**
 A plan for a health target (the mockup's 5.10): its picture and goal on top, the day's targets
 as four numbers, a day at a time of meals chosen from existing recipes — your own marked Yours —
 and Apply to my Plan.

 Two kinds open here. A ready-made plan is a filled-in create form whose meals are chosen from
 your recipes as it opens; the bookmark keeps it, exactly as shown, as a plan of your own. A plan
 of your own is private: nobody else in the house can open it, and only its meals go on the
 shared Plan when you apply it.

 With Apple Intelligence, a ready-made plan opens with the server's choice and the model then
 chooses the week again from the server's candidates; swaps and "choose every meal again" go
 through the model too. Whatever it chose wears ✨, and the server portions and checks it all.
 */
struct TargetPlanScreen: View {
    var session: Session
    @Binding var path: NavigationPath
    /// A plan of your own, or nil for a ready-made one.
    var planId: UUID?
    var preset: String?
    /// Previews: this instead of the server.
    var sample: TargetPlan?
    var sampleMarked: Set<String> = []

    @State private var plan: TargetPlan?
    @State private var failed: String?
    @State private var day = 0
    @State private var swapping = false
    @State private var seen: [String: [UUID]] = [:]
    @State private var busy: String?
    @State private var marked: Set<String> = []
    @State private var words: String?
    @State private var working: String?
    @State private var choosing: Task<Void, Never>?
    @State private var candidates: TargetCandidates?
    @State private var toast: String?
    @State private var applying = false
    @State private var options = false
    @State private var renaming = false
    @State private var deleting = false
    @State private var opened: OpenedRecipe?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        GeometryReader { outer in
            let top = outer.safeAreaInsets.top
            Group {
                if let plan {
                    content(plan, top: top)
                } else {
                    VStack(spacing: 0) {
                        HStack { heroButton("chevron.left", "Back") { dismiss() }; Spacer() }
                            .padding(.horizontal, 16).padding(.top, 4)
                        if let failed {
                            MealPlansLoadFailed(message: failed) { Task { await load() } }.padding(20)
                        } else {
                            MealPlansLoading(text: "Choosing meals from your recipes…")
                        }
                        Spacer()
                    }
                }
            }
        }
        .pageBackground()
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .mealPlanToast(toast)
        .task { await load() }
        .onDisappear { choosing?.cancel() }
        .sheet(isPresented: $applying) {
            if let plan { ApplyPlanSheet(session: session, plan: plan) { done in finishApply(done) } }
        }
        .sheet(isPresented: $options) {
            PlanOptionsSheet { choice in
                options = false
                switch choice {
                case .rename: renaming = true
                case .edit: if let id = plan?.id { path.append(MealPlansRoute.editPlan(id)) }
                case .again: Task { await chooseAgain() }
                case .delete: deleting = true
                }
            }
        }
        .sheet(isPresented: $renaming) {
            if let plan { RenamePlanSheet(session: session, plan: plan) { renamed in self.plan = renamed } }
        }
        .kitchenAlert(isPresented: $deleting) {
            KitchenAlertCard(systemImage: "trash", title: "Delete \(plan?.name ?? "this plan")?",
                             message: Text("Meals already on the Plan stay there.")) {
                VStack(spacing: 8) {
                    Button(busy == "delete" ? "Deleting…" : "Delete") { Task { await remove() } }.buttonStyle(.primary)
                    Button("Keep it") { deleting = false }.buttonStyle(.secondary)
                }
            }
        }
        .navigationDestination(item: $opened) { o in MealRecipeScreen(session: session, recipeId: o.id, yours: o.yours) }
    }

    // MARK: The page

    @ViewBuilder private func content(_ plan: TargetPlan, top: CGFloat) -> some View {
        let today = plan.days.first { $0.day == day } ?? plan.days.first
        let meals = (today?.meals ?? []).sorted {
            (MealPlanText.order.firstIndex(of: $0.mealType) ?? 0) < (MealPlanText.order.firstIndex(of: $1.mealType) ?? 0)
        }
        let total = plan.days.reduce(0) { $0 + $1.meals.filter { !$0.missing }.count }
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                hero(plan, top: top).padding(.top, -top)
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 8) {
                        NutritionStat(value: NutritionText.kcal(Double(plan.targets.kcal)), label: "kcal", tone: .accent)
                        NutritionStat(value: "\(plan.targets.protein)g", label: "Protein", tone: .herb)
                        NutritionStat(value: "\(plan.targets.carbs)g", label: "Carbs", tone: .sky)
                        NutritionStat(value: "\(plan.targets.fat)g", label: "Fat", tone: .mustard)
                    }
                    dayPicker(plan)
                    if meals.isEmpty {
                        Text(plan.summary).font(.system(size: 15)).foregroundStyle(Palette.muted)
                            .multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(.vertical, 24).cardSurface()
                    } else {
                        ListGroup {
                            ForEach(meals, id: \.slot) { m in mealRow(m) }
                        }
                    }
                    if let today, !today.meals.isEmpty {
                        Text("This day: \(NutritionText.kcal(Double(today.kcal))) kcal · \(today.protein)g protein · \(today.carbs)g carbs · \(today.fat)g fat")
                            .font(.system(size: 12)).foregroundStyle(Palette.muted).padding(.horizontal, 4)
                    }
                    if let working {
                        ModelWorkingNote(text: working)
                    } else if !marked.isEmpty {
                        ModelChoseNote(chosen: marked.count, total: total)
                    }
                    if let words { ModelWords(text: words) }
                    Text(plan.summary).font(.system(size: 13)).foregroundStyle(Palette.muted).lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
                }
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .padding(.bottom, 24)
            }
        }
        .safeAreaInset(edge: .bottom) {
            MealPlanBottomBar {
                Button { swapping.toggle() } label: {
                    Image(systemName: swapping ? "checkmark" : "arrow.left.arrow.right")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(swapping ? Palette.bg : Palette.text)
                        .frame(width: 52, height: 52)
                        .background(swapping ? Palette.text : Palette.surface, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous)
                            .strokeBorder(swapping ? Palette.text : Palette.border, lineWidth: 1))
                }
                .buttonStyle(PressFade())
                .accessibilityLabel(swapping ? "Done swapping" : "Swap meals")
                Button { applying = true } label: { Label("Apply to my Plan", systemImage: "calendar") }
                    .buttonStyle(.primary)
                    .disabled(total == 0 || busy != nil)
            }
        }
    }

    private func hero(_ plan: TargetPlan, top: CGFloat) -> some View {
        ZStack(alignment: .bottomLeading) {
            RecipePhotoPlaceholder(hue: MealPlanLook.hue(plan.hue), systemImage: MealPlanLook.symbol(plan.icon), radius: 0)
            LinearGradient(colors: [.clear, .clear, .black.opacity(0.3)], startPoint: .top, endPoint: .bottom)
                .allowsHitTesting(false)
            VStack(alignment: .leading, spacing: 4) {
                Pill("\(plan.goalLabel) · \(plan.length) \(plan.length == 1 ? "day" : "days")",
                     tone: MealPlanLook.tone(plan.hue), systemImage: MealPlanLook.symbol(plan.icon))
                Text(plan.name).titleFont(28).foregroundStyle(.white).lineLimit(3).minimumScaleFactor(0.8)
                    .accessibilityAddTraits(.isHeader)
                if let description = plan.description, !description.isEmpty {
                    Text(description).font(.system(size: 13)).foregroundStyle(.white.opacity(0.92))
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
        }
        .frame(height: 202 + top)
        .frame(maxWidth: .infinity)
        .clipped()
        .overlay(alignment: .top) {
            HStack {
                heroButton("chevron.left", "Back") { dismiss() }
                Spacer()
                if plan.mine {
                    heroButton("ellipsis", "Plan options") { options = true }
                } else {
                    heroButton("bookmark", "Keep as my plan") { Task { await keep() } }
                        .disabled(busy != nil)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, top + 4)
        }
    }

    private func heroButton(_ symbol: String, _ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color(rgb: 0x2B211A))
                .frame(width: 36, height: 36)
                .background(.white.opacity(0.92), in: Circle())
                .shadow(color: .black.opacity(0.12), radius: 2, y: 1)
                .contentShape(Circle().inset(by: -4))
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(label)
    }

    private func dayPicker(_ plan: TargetPlan) -> some View {
        let start = NutritionText.day(0)
        let tiles = HStack(spacing: 6) {
            ForEach(plan.days, id: \.day) { d in
                let date = MealPlanText.addDays(start, d.day)
                let on = d.day == day
                Button { day = d.day } label: {
                    Text(String(NutritionText.weekday(date).prefix(1)))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(on ? Palette.bg : Palette.muted)
                        .frame(minWidth: 34, maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(on ? Palette.text : Palette.surface2, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressFade())
                .accessibilityLabel("Day \(d.day + 1), \(NutritionText.weekday(date, short: false))")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        return Group {
            if plan.days.count > 8 {
                ScrollView(.horizontal, showsIndicators: false) { tiles.padding(.horizontal, 20) }.padding(.horizontal, -20)
            } else {
                tiles
            }
        }
    }

    private func mealRow(_ m: PlanMeal) -> some View {
        let subtitle = m.missing ? "\(m.mealType.title) · swap it for another"
            : "\(m.mealType.title) · \(NutritionText.kcal(Double(m.kcal))) kcal · \(m.protein)g P"
        return MealRowView(title: m.name, subtitle: subtitle, muted: m.missing,
                           picture: PlanMealPicture(recipeId: m.recipeId, name: m.name, section: m.section,
                                                coverImageId: m.coverImageId, meal: m.mealType)) {
            if marked.contains(m.slot) && !swapping { ModelChoseMark() }
            if m.yours && !m.missing && !swapping { Pill("Yours", tone: .herb, systemImage: "checkmark") }
            if swapping {
                SwapButton(label: "Swap \(m.name)", busy: busy == m.slot) { Task { await swap(m) } }
                    .disabled(busy != nil && busy != m.slot)
            }
        }
        .padding(.horizontal, 4)
        .onTapGesture { if !m.missing { opened = OpenedRecipe(id: m.recipeId, yours: m.yours) } }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(m.mealType.title): \(m.name)")
    }

    // MARK: Loading

    private func load() async {
        if let sample {
            plan = sample
            marked = sampleMarked
            return
        }
        guard let household = session.household?.id, plan == nil else { return }
        do {
            let loaded: TargetPlan
            if let planId {
                loaded = try await APIClient.shared.targetPlan(household: household, id: planId)
                marked = ModelPicks.marked(loaded)
            } else {
                loaded = try await APIClient.shared.presetPlan(household: household, key: preset ?? "")
            }
            plan = loaded
            failed = nil
            if planId == nil {
                choosing = Task { await chooseReadyMade(loaded) }
            } else {
                await describe(loaded)
            }
        } catch let error as APIError where error.status == 404 {
            failed = "There is no such plan."
        } catch is CancellationError {
        } catch {
            failed = "Could not load this plan."
        }
    }

    /// A ready-made plan, chosen again by the model from the server's candidates. Anything the
    /// person does first (a swap, keeping it) wins: this one is then dropped.
    private func chooseReadyMade(_ server: TargetPlan) async {
        guard let household = session.household?.id else { return }
        let made = await TargetPlanMaker.choose(household: household, name: server.name, details: server.details) { text in
            working = text
        }
        working = nil
        guard !Task.isCancelled, plan == server else {
            await describe(plan ?? server)
            return
        }
        if let made {
            plan = made.plan.keeping(server)
            marked = MealPlanAssist.chosenByModel(made.plan, picks: made.picks)
        }
        await describe(plan ?? server)
    }

    private func describe(_ plan: TargetPlan) async {
        guard let thinker = MealPlanAI.thinker else { return }
        words = await MealPlanAssist.words(MealPlanAssist.facts(plan), thinker: thinker)
    }

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(for: .seconds(2.4))
            if toast == text { toast = nil }
        }
    }

    // MARK: Doing things

    private func swap(_ meal: PlanMeal) async {
        guard let household = session.household?.id, let current = plan else { return }
        choosing?.cancel()
        working = nil
        let key = meal.slot
        let shown = Array(Set((seen[key] ?? []) + [meal.recipeId]))
        busy = key
        defer { busy = nil }
        var wanted: UUID?
        await MealPlansAvailability.shared.check()
        if let thinker = MealPlanAI.thinker, MealPlansAvailability.shared.takesChoices {
            if candidates == nil {
                candidates = try? await APIClient.shared.targetCandidates(household: household, details: current.details)
            }
            if let c = candidates {
                let pool = TargetCandidates(targets: c.targets, length: c.length, mealTypes: c.mealTypes, aims: c.aims,
                                        recipes: c.recipes.filter { !shown.contains($0.recipeId) })
                wanted = await MealPlanAssist.targetSwap(pool, plan: current, meal: meal, thinker: thinker)
            }
        }
        do {
            var next: TargetPlan
            if let id = current.id {
                next = try await APIClient.shared.swapPlanMeal(household: household, id: id, meal: meal, exclude: shown, recipeId: wanted)
            } else {
                next = try await APIClient.shared.previewSwap(household: household, plan: current, meal: meal,
                                                              exclude: shown, recipeId: wanted)
                // A ready-made plan keeps its name and picture: the preview answer is the same plan, swapped.
                next = next.keeping(current)
            }
            let now = next.days.first { $0.day == meal.day }?.meals.first { $0.mealType == meal.mealType }
            if now == nil || now?.recipeId == meal.recipeId {
                say("Nothing else fits \(meal.mealType.title.lowercased()) here.")
            }
            marked.remove(key)
            if let wanted, now?.recipeId == wanted { marked.insert(key) }
            if let id = next.id { ModelPicks.set(id, slot: key, recipe: marked.contains(key) ? now?.recipeId : nil) }
            plan = next
            seen[key] = shown
        } catch {
            say((error as? APIError)?.errorDescription ?? "Could not swap that meal.")
        }
    }

    private func keep() async {
        guard let household = session.household?.id, let current = plan else { return }
        choosing?.cancel()
        working = nil
        busy = "keep"
        defer { busy = nil }
        do {
            let kept = try await APIClient.shared.createPlan(household: household, name: current.name,
                                                             details: current.details, keep: current)
            if let id = kept.id { ModelPicks.remember(id, plan: kept, slots: marked) }
            say("Kept in Made by you. Only you can see it.")
            try? await Task.sleep(for: .seconds(0.8))
            if let id = kept.id, !path.isEmpty {
                path.removeLast()
                path.append(MealPlansRoute.plan(id))
            }
        } catch {
            say((error as? APIError)?.errorDescription ?? "Could not keep this plan.")
        }
    }

    /// Every meal chosen again: by the model from the server's candidates where it can, else the server.
    private func chooseAgain() async {
        guard let household = session.household?.id, let current = plan, let id = current.id else { return }
        busy = "all"
        defer {
            busy = nil
            working = nil
        }
        do {
            if let made = await TargetPlanMaker.choose(household: household, name: current.name, details: current.details,
                                                       working: { working = $0 }) {
                let saved = try await APIClient.shared.updatePlan(household: household, id: id, keep: made.plan)
                marked = MealPlanAssist.chosenByModel(saved, picks: made.picks)
                ModelPicks.remember(id, plan: saved, slots: marked)
                plan = saved
            } else {
                plan = try await APIClient.shared.regeneratePlan(household: household, id: id)
                marked = []
                ModelPicks.forget(id)
            }
            seen = [:]
            words = nil
            say("Every meal chosen again")
            if let plan { await describe(plan) }
        } catch {
            say((error as? APIError)?.errorDescription ?? "Could not choose again.")
        }
    }

    private func remove() async {
        guard let household = session.household?.id, let id = plan?.id else { return }
        busy = "delete"
        do {
            try await APIClient.shared.deletePlan(household: household, id: id)
            ModelPicks.forget(id)
            deleting = false
            busy = nil
            dismiss()
        } catch {
            busy = nil
            deleting = false
            say((error as? APIError)?.errorDescription ?? "Could not delete it.")
        }
    }

    private func finishApply(_ result: ApplyResult?) {
        applying = false
        guard let result else { return }
        let skipped = result.skipped.isEmpty ? "" : " (\(result.skipped.count) already planned)"
        say(result.added > 0 ? "Planned \(result.added) \(result.added == 1 ? "meal" : "meals")\(skipped)" : "Those meals were planned already")
        Task {
            try? await Task.sleep(for: .seconds(1.1))
            MealPlansNavigation.showPlan(path: $path)
        }
    }
}

/**
 Asks for a plan for these details the Apple Intelligence way: the model chooses from the
 server's candidates, and a preview with its picks has the server check and portion them. Nil
 when the phone has no model, the server takes no picks, or anything fails — the caller then
 asks the server to choose, as every other phone does.
 */
enum TargetPlanMaker {
    struct Made {
        let plan: TargetPlan
        let picks: [SlotChoice]
    }

    @MainActor
    static func choose(household: UUID, name: String?, details: TargetDetails,
                       working: @escaping @MainActor (String?) -> Void) async -> Made? {
        await MealPlansAvailability.shared.check()
        guard let thinker = MealPlanAI.thinker, MealPlansAvailability.shared.takesChoices,
              let candidates = try? await APIClient.shared.targetCandidates(household: household, details: details) else { return nil }
        working("Apple Intelligence is choosing from your recipes…")
        defer { working(nil) }
        guard let picks = await MealPlanAssist.targetPlan(candidates, thinker: thinker, progress: { day, of in
            await working("Apple Intelligence is choosing… day \(day) of \(of)")
        }), !Task.isCancelled,
            let preview = try? await APIClient.shared.previewPlan(household: household, name: name, details: details, chosen: picks)
        else { return nil }
        return Made(plan: preview, picks: picks)
    }
}

/**
 Which meals of your own plans this phone's model chose, kept on the phone (UserDefaults) by
 plan, slot and recipe — so the ✨ is still there next time, and goes once the meal is swapped
 for something else. The server never needs to know who chose a meal.
 */
enum ModelPicks {
    private static func key(_ id: UUID) -> String { "mp_model_picks_\(id.uuidString.lowercased())" }

    static func remember(_ id: UUID, plan: TargetPlan, slots: Set<String>) {
        var picks: [String: String] = [:]
        for m in plan.days.flatMap(\.meals) where slots.contains(m.slot) { picks[m.slot] = m.recipeId.uuidString }
        UserDefaults.standard.set(picks, forKey: key(id))
    }

    static func set(_ id: UUID, slot: String, recipe: UUID?) {
        var picks = (UserDefaults.standard.dictionary(forKey: key(id)) as? [String: String]) ?? [:]
        picks[slot] = recipe?.uuidString
        UserDefaults.standard.set(picks, forKey: key(id))
    }

    static func marked(_ plan: TargetPlan) -> Set<String> {
        guard let id = plan.id, let picks = UserDefaults.standard.dictionary(forKey: key(id)) as? [String: String] else { return [] }
        return Set(plan.days.flatMap(\.meals).filter { picks[$0.slot] == $0.recipeId.uuidString }.map(\.slot))
    }

    static func forget(_ id: UUID) { UserDefaults.standard.removeObject(forKey: key(id)) }
}

// MARK: - Sheets

/**
 Apply to my Plan: which day the plan starts on, and how many each meal is cooked for. Only the
 meals go on the shared Plan — never over a meal that is there already.
 */
private struct ApplyPlanSheet: View {
    var session: Session
    let plan: TargetPlan
    let done: (ApplyResult?) -> Void

    @State private var start = NutritionText.day(0)
    @State private var servings = 2
    @State private var busy = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    private var meals: [PlanMeal] { plan.days.flatMap(\.meals).filter { !$0.missing } }

    var body: some View {
        let dates = meals.map { MealPlanText.addDays(start, $0.day) }
        VStack(alignment: .leading, spacing: 16) {
            SheetHeader("Apply to my Plan", subtitle: "Its meals go on the household's Plan. Anything planned already stays.",
                        onClose: { dismiss() })
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Start on").padding(.horizontal, -4)
                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { i in
                        let d = NutritionText.day(i)
                        DayTile(weekday: NutritionText.weekday(d), date: MealPlanText.dayOfMonth(d), on: d == start) { start = d }
                            .accessibilityLabel("Start on \(NutritionText.weekday(d, short: false)) \(MealPlanText.dayOfMonth(d))")
                    }
                }
            }
            HStack {
                Text("Servings for each meal").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                Spacer()
                ServingsStepper(value: $servings)
            }
            if let error { NoteBox(error, tone: .accent, systemImage: "exclamationmark.circle") }
            Button { Task { await apply() } } label: {
                Label(busy ? "Planning…" : "Apply \(meals.count) \(meals.count == 1 ? "meal" : "meals") · \(MealPlanText.dateRange(dates))",
                      systemImage: "calendar")
            }
            .buttonStyle(.primary)
            .disabled(busy || meals.isEmpty)
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 12)
        .fittedSheet()
        .onAppear { servings = session.household?.defaultServings ?? 2 }
    }

    private func apply() async {
        guard let household = session.household?.id else { return }
        busy = true
        error = nil
        do {
            let result: ApplyResult
            if let id = plan.id {
                result = try await APIClient.shared.applyPlan(household: household, id: id, start: start, servings: servings)
            } else {
                result = try await APIClient.shared.applyMeals(
                    household: household,
                    meals: meals.map { (MealPlanText.addDays(start, $0.day), $0.mealType, $0.recipeId, servings) })
            }
            done(result)
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? "Could not put it on the Plan."
            busy = false
        }
    }
}

private enum PlanOption { case rename, edit, again, delete }

private struct PlanOptionsSheet: View {
    let pick: (PlanOption) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SheetHeader("Plan options", onClose: { dismiss() })
            ListGroup(dividerInset: 68) {
                row("Rename", "pencil", .neutral, .rename)
                row("Change who it is for", "slider.horizontal.3", .neutral, .edit)
                row("Choose every meal again", "arrow.triangle.2.circlepath", .neutral, .again)
                row("Delete plan", "trash", .accent, .delete)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 12)
        .fittedSheet()
    }

    private func row(_ title: String, _ symbol: String, _ tone: Tone, _ option: PlanOption) -> some View {
        Button { pick(option) } label: {
            ListRow(title, titleColor: option == .delete ? Palette.accentInk : nil, tile: (symbol, tone))
        }
        .buttonStyle(PressFade())
    }
}

private struct RenamePlanSheet: View {
    var session: Session
    let plan: TargetPlan
    let renamed: (TargetPlan) -> Void

    @State private var name = ""
    @State private var busy = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader("Rename plan", onClose: { dismiss() })
            FieldBox(nil, text: $name, prompt: "Plan name").autofocused()
            if let error { NoteBox(error, tone: .accent, systemImage: "exclamationmark.circle") }
            Button("Save") { Task { await save() } }
                .buttonStyle(.primary)
                .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 12)
        .fittedSheet()
        .onAppear { name = plan.name }
    }

    private func save() async {
        guard let household = session.household?.id, let id = plan.id else { return }
        busy = true
        do {
            renamed(try await APIClient.shared.updatePlan(household: household, id: id,
                                                          name: String(name.trimmingCharacters(in: .whitespaces).prefix(80))))
            dismiss()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? "Could not rename it."
            busy = false
        }
    }
}

#Preview("A ready-made plan") {
    @Previewable @State var path = NavigationPath()
    NavigationStack {
        TargetPlanScreen(session: .preview, path: $path, preset: "build-muscle", sample: MealPlanSamples.plan,
                         sampleMarked: ["0|BREAKFAST", "0|DINNER"])
    }
}

#Preview("A ready-made plan — dark") {
    @Previewable @State var path = NavigationPath()
    NavigationStack {
        TargetPlanScreen(session: .preview, path: $path, preset: "build-muscle", sample: MealPlanSamples.plan)
    }
    .preferredColorScheme(.dark)
}
