import SwiftUI

/**
 A plan for a health target (the mockup's 5.11): who it is for, the goal, the daily targets
 worked out from those (any number can be set by hand), preferences, and how long. "Build the
 plan" saves it as yours — private to you — with its meals chosen from your recipes first, and
 opens it. The same form changes a plan you have already, choosing again.

 Nothing here works a number out itself: the tiles are the server's answer for what is typed.
 With Apple Intelligence the model chooses the meals from the server's candidates and the server
 portions and checks them; without it the server chooses, as on the web.
 */
struct TargetPlanForm: View {
    var session: Session
    @Binding var path: NavigationPath
    /// The plan being changed, or nil for a new one.
    var planId: UUID?
    /// Previews: the form's options without a server.
    var sampleOptions: FormOptions?
    var sampleTargets: Targets?

    private enum Field: Hashable { case age, ft, inches, cm, lb, kg }
    private enum MacroKey: String, Identifiable { case kcal, protein, fat; var id: String { rawValue } }

    @State private var options: FormOptions?
    @State private var existing: TargetPlan?
    @State private var failed = false
    @State private var metric = false
    @State private var age = ""
    @State private var sex = "male"
    @State private var ft = ""
    @State private var inches = ""
    @State private var cm = ""
    @State private var lb = ""
    @State private var kg = ""
    @State private var activity = "moderate"
    @State private var goal: Goal = .maintain
    @State private var overrides = TargetOverrides()
    @State private var preferences: [String] = []
    @State private var avoid: [String] = []
    @State private var useMine = true
    @State private var days = 7
    @State private var targets: Targets?
    @State private var setting: MacroKey?
    @State private var adding = false
    @State private var choosingLength = false
    @State private var busy = false
    @State private var working: String?
    @State private var error: String?
    @FocusState private var focus: Field?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let options, planId == nil || existing != nil {
                    form(options)
                } else if failed {
                    MealPlansLoadFailed(message: "Could not open the form.") { Task { await load() } }
                } else {
                    MealPlansLoading(text: "Loading…")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .pageBackground()
        .centeredTitle(planId == nil ? "New meal plan" : "Change meal plan")
        .navigationBarBackButtonHidden(true)
        .toolbar {
            BarTextButton("Cancel", placement: .topBarLeading) { dismiss() }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focus = nil }.foregroundStyle(Palette.accentInk)
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .task { await load() }
        .task(id: calculationKey) { await calculate() }
        .sheet(item: $setting) { macro in
            if let targets { OverrideSheet(macro: macro.rawValue, targets: targets) { value in set(macro, value) } }
        }
        .sheet(isPresented: $adding) {
            if let options {
                AddPreferenceSheet(options: options.preferences.filter { !$0.shown }, chosen: $preferences, avoid: $avoid)
            }
        }
        .sheet(isPresented: $choosingLength) {
            if let options { LengthSheet(lengths: options.lengths, days: $days) }
        }
    }

    // MARK: The form

    @ViewBuilder private func form(_ options: FormOptions) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SectionLabel("Who is it for").padding(.horizontal, -4)
                Spacer()
                Button(metric ? "Use ft and lb" : "Use cm and kg") { switchUnits() }
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.accentInk).buttonStyle(PressFade())
            }
            HStack(spacing: 8) {
                unitField(prefix: "Age", text: $age, field: .age, label: "Age")
                Menu {
                    Picker("Sex", selection: $sex) {
                        Text("Male").tag("male")
                        Text("Female").tag("female")
                        Text("Rather not say").tag("")
                    }
                } label: {
                    HStack {
                        Text(sex == "male" ? "Male" : sex == "female" ? "Female" : "Rather not say")
                            .font(.system(size: 16)).foregroundStyle(Palette.text).lineLimit(1)
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.down").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.muted)
                    }
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .fieldSurface()
                }
                .accessibilityLabel("Sex")
            }
            HStack(spacing: 8) {
                if metric {
                    unitField(suffix: "cm", text: $cm, field: .cm, label: "Height in cm")
                    unitField(suffix: "kg", text: $kg, field: .kg, label: "Weight in kg", decimal: true)
                } else {
                    HStack(spacing: 6) {
                        bare($ft, .ft, "Feet").frame(width: 22).multilineTextAlignment(.trailing)
                        Text("ft").foregroundStyle(Palette.muted)
                        bare($inches, .inches, "Inches")
                    }
                    .font(.system(size: 16))
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .fieldSurface(focused: focus == .ft || focus == .inches)
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Height")
                    unitField(suffix: "lb", text: $lb, field: .lb, label: "Weight in lb")
                }
            }
            HStack {
                Text("Activity").font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.text)
                Spacer()
                Menu {
                    Picker("Activity", selection: $activity) {
                        ForEach(options.activities, id: \.key) { Text($0.label).tag($0.key) }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(options.activities.first { $0.key == activity }?.label ?? activity)
                            .font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.text)
                        Image(systemName: "chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.muted)
                    }
                }
                .accessibilityLabel("Activity")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()

        VStack(alignment: .leading, spacing: 12) {
            SectionLabel("Goal").padding(.horizontal, -4)
            SegmentedControl(selection: $goal, options: options.goals.map { ($0.key, $0.label) })
            HStack(spacing: 8) {
                tile(.kcal, label: "kcal", tone: .accent)
                tile(.protein, label: "Protein", tone: .herb)
                tile(.fat, label: "Fat", tone: .mustard)
            }
            Text(missing ?? "Worked out from the details above. Tap a number to set your own.")
                .font(.system(size: 12)).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()

        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Preferences").padding(.horizontal, -4)
            ChipFlow(spacing: 6) {
                ForEach(options.preferences.filter { $0.shown || preferences.contains($0.key) }, id: \.key) { p in
                    Chip(p.label, isOn: preferences.contains(p.key)) { toggle(p.key) }
                }
                ForEach(avoid, id: \.self) { word in
                    Chip("No \(word)", isOn: true) { avoid.removeAll { $0 == word } }
                        .accessibilityLabel("No \(word), tap to remove")
                }
                Chip("+ Add", isOn: false) { adding = true }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()

        ListGroup {
            Toggle(isOn: $useMine) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Use my recipes first").font(.rowTitle).foregroundStyle(Palette.text)
                    Text("Fills gaps from global recipes").font(.rowSubtitle).foregroundStyle(Palette.muted)
                }
            }
            .toggleStyle(.herb)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 52)
            Button { choosingLength = true } label: {
                ListRow("Plan length", detail: "\(days) \(days == 1 ? "day" : "days")", chevron: true)
            }
            .buttonStyle(PressFade())
        }

        if let error { NoteBox(error, tone: .accent, systemImage: "exclamationmark.circle") }
        if let working { ModelWorkingNote(text: working) }
        Button { Task { await build(options) } } label: {
            Label(busy ? "Choosing meals…" : planId == nil ? "Build the plan" : "Save and choose again", systemImage: "sparkles")
        }
        .buttonStyle(.primary)
        .disabled(busy || !bodyReady)
    }

    private func unitField(prefix: String? = nil, suffix: String? = nil, text: Binding<String>, field: Field, label: String,
                           decimal: Bool = false) -> some View {
        HStack(spacing: 6) {
            if let prefix { Text(prefix).foregroundStyle(Palette.muted) }
            bare(text, field, label, decimal: decimal)
            if let suffix { Text(suffix).foregroundStyle(Palette.muted) }
        }
        .font(.system(size: 16))
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, minHeight: 44)
        .fieldSurface(focused: focus == field)
        .contentShape(Rectangle())
        .onTapGesture { focus = field }
    }

    private func bare(_ text: Binding<String>, _ field: Field, _ label: String, decimal: Bool = false) -> some View {
        TextField("", text: text, prompt: Text("–").foregroundStyle(Palette.faint))
            .keyboardType(decimal ? .decimalPad : .numberPad)
            .foregroundStyle(Palette.text)
            .focused($focus, equals: field)
            .accessibilityLabel(label)
    }

    private func tile(_ macro: MacroKey, label: String, tone: Tone) -> some View {
        let value: String = {
            guard let targets else { return "–" }
            switch macro {
            case .kcal: return NutritionText.kcal(Double(targets.kcal))
            case .protein: return "\(targets.protein)g"
            case .fat: return "\(targets.fat)g"
            }
        }()
        let set = targets?.overridden.contains(macro.rawValue) ?? false
        return Button { if targets != nil { setting = macro } } label: {
            VStack(spacing: 2) {
                Text(value).titleFont(22).monospacedDigit().foregroundStyle(tone.ink).lineLimit(1).minimumScaleFactor(0.7)
                HStack(spacing: 3) {
                    Text(label.uppercased())
                    if set { Image(systemName: "pencil").font(.system(size: 9, weight: .bold)) }
                }
                .font(.system(size: 11, weight: .semibold)).tracking(0.55).foregroundStyle(Palette.muted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        }
        .buttonStyle(PressFade())
        .accessibilityLabel("\(label): \(value)\(set ? ", set by you" : ""). Set your own")
    }

    // MARK: What has been typed

    private var heightCm: Double? {
        if metric { return Double(cm) }
        guard let f = Int(ft) else { return nil }
        return MealPlanText.cm(ft: f, inches: Int(inches) ?? 0)
    }

    private var weightKg: Double? {
        metric ? Double(kg.replacingOccurrences(of: ",", with: ".")) : Int(lb).map { MealPlanText.kg(lb: $0) }
    }

    /// The person, if the server will take them: the same bounds as TargetDetails on the server.
    private var body_: (age: Int, heightCm: Double, weightKg: Double)? {
        guard let a = Int(age), (16...100).contains(a), let h = heightCm, (120...230).contains(h),
              let w = weightKg, (35...250).contains(w) else { return nil }
        return (a, h, w)
    }

    // `body` is taken by the View; this reads better at the call sites.
    private var bodyReady: Bool { body_ != nil }

    /// Which of the details is still missing or out of range, for the line under the tiles.
    private var missing: String? {
        guard let a = Int(age) else { return "Add an age to work out the targets." }
        if !(16...100).contains(a) { return "Plans are for ages 16 to 100." }
        guard let h = heightCm else { return "Add a height to work out the targets." }
        if !(120...230).contains(h) { return "That height looks wrong." }
        guard let w = weightKg else { return "Add a weight to work out the targets." }
        if !(35...250).contains(w) { return "That weight looks wrong." }
        return nil
    }

    private var calculationKey: String {
        guard let b = body_ else { return "none" }
        return "\(b.age)|\(b.heightCm)|\(b.weightKg)|\(sex)|\(activity)|\(goal.rawValue)|\(overrides.kcal ?? -1)|\(overrides.protein ?? -1)|\(overrides.fat ?? -1)"
    }

    private func toggle(_ key: String) {
        if let i = preferences.firstIndex(of: key) { preferences.remove(at: i) } else { preferences.append(key) }
    }

    private func set(_ macro: MacroKey, _ value: Int?) {
        switch macro {
        case .kcal: overrides.kcal = value
        case .protein: overrides.protein = value
        case .fat: overrides.fat = value
        }
        setting = nil
    }

    /// The same person in the other units, so nothing typed is lost.
    private func switchUnits() {
        let h = heightCm, w = weightKg
        if metric {
            let fi = h.map(MealPlanText.feetInches)
            ft = fi.map { String($0.ft) } ?? ""
            inches = fi.map { String($0.inches) } ?? ""
            lb = w.map { String(MealPlanText.lb(kg: $0)) } ?? ""
        } else {
            cm = h.map { String(Int($0.rounded())) } ?? ""
            kg = w.map { String(format: "%g", ($0 * 10).rounded() / 10) } ?? ""
        }
        metric.toggle()
    }

    // MARK: Loading

    private func load() async {
        if let sampleOptions {
            options = sampleOptions
            targets = sampleTargets
            if age.isEmpty { age = "20"; ft = "5"; inches = "11"; lb = "165"; goal = .buildMuscle; preferences = ["no-pork", "dairy-ok", "under-30"] }
            return
        }
        do {
            options = try await APIClient.shared.mealPlanOptions()
            if let planId, existing == nil, let household = session.household?.id {
                let plan = try await APIClient.shared.targetPlan(household: household, id: planId)
                existing = plan
                fill(plan.details)
            }
            failed = false
            #if DEBUG
            // Screenshot runs: -mp_debug_fill 1 fills the form in as the mockup has it.
            if planId == nil, age.isEmpty, UserDefaults.standard.bool(forKey: "mp_debug_fill") {
                age = "20"; ft = "5"; inches = "11"; lb = "165"; goal = .buildMuscle
                preferences = ["no-pork", "dairy-ok", "under-30"]
            }
            #endif
        } catch is CancellationError {
        } catch {
            failed = true
        }
    }

    /// A saved plan's details as the form holds them, in the units it was made in.
    private func fill(_ d: TargetDetails) {
        metric = d.units == "metric"
        age = String(d.age)
        sex = d.sex == "male" || d.sex == "female" ? d.sex! : ""
        let fi = MealPlanText.feetInches(d.heightCm)
        ft = String(fi.ft)
        inches = String(fi.inches)
        cm = String(Int(d.heightCm.rounded()))
        lb = String(MealPlanText.lb(kg: d.weightKg))
        kg = String(format: "%g", (d.weightKg * 10).rounded() / 10)
        activity = d.activity
        goal = d.goal
        overrides = d.overrides ?? TargetOverrides()
        preferences = d.preferences
        avoid = d.avoid
        useMine = d.useMyRecipesFirst
        days = d.days
    }

    /// The tiles follow the form, a moment after typing stops.
    private func calculate() async {
        guard sampleOptions == nil else { return }
        guard let b = body_ else {
            targets = nil
            return
        }
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        targets = try? await APIClient.shared.calculateTargets(age: b.age, sex: sex, heightCm: b.heightCm, weightKg: b.weightKg,
                                                               activity: activity, goal: goal,
                                                               overrides: TargetOverrides(kcal: overrides.kcal,
                                                                                          protein: overrides.protein,
                                                                                          fat: overrides.fat))
    }

    private func build(_ options: FormOptions) async {
        guard let household = session.household?.id, let b = body_ else { return }
        focus = nil
        var details = TargetDetails(
            age: b.age, sex: sex.isEmpty ? nil : sex, heightCm: b.heightCm, weightKg: b.weightKg, activity: activity,
            goal: goal, preferences: preferences, avoid: avoid, useMyRecipesFirst: useMine,
            onlyMyRecipes: existing?.details.onlyMyRecipes ?? false, days: days, meals: existing?.details.meals,
            overrides: TargetOverrides(kcal: overrides.kcal, protein: overrides.protein, fat: overrides.fat).isEmpty
                ? nil : TargetOverrides(kcal: overrides.kcal, protein: overrides.protein, fat: overrides.fat),
            description: nil, units: metric ? "metric" : "imperial")
        details.description = MealPlanText.whoLine(details, activity: options.activities.first { $0.key == activity }?.label)
        let first = (session.displayName ?? "").split(separator: " ").first.map(String.init) ?? ""
        let goalWords = options.goals.first { $0.key == goal }?.label.lowercased() ?? "my plan"
        let name = existing?.name ?? (first.isEmpty ? "My plan · \(goalWords)" : "\(first) · \(goalWords)")
        busy = true
        error = nil
        defer {
            busy = false
            working = nil
        }
        do {
            let made = await TargetPlanMaker.choose(household: household, name: name, details: details) { working = $0 }
            let saved: TargetPlan
            if let existing, let id = existing.id {
                saved = try await APIClient.shared.updatePlan(household: household, id: id, details: details, keep: made?.plan)
            } else {
                saved = try await APIClient.shared.createPlan(household: household, name: name, details: details, keep: made?.plan)
            }
            if let id = saved.id {
                if let made {
                    ModelPicks.remember(id, plan: saved, slots: MealPlanAssist.chosenByModel(saved, picks: made.picks))
                } else {
                    ModelPicks.forget(id)
                }
                // In place of this form: the plan itself (fresh, when it was the one being changed).
                let replace = existing != nil ? min(2, path.count) : min(1, path.count)
                path.removeLast(replace)
                path.append(MealPlansRoute.plan(id))
            }
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? "Could not build the plan."
        }
    }
}

// MARK: - Sheets

/// Set one of the targets by hand, or go back to the worked-out one.
private struct OverrideSheet: View {
    let macro: String
    let targets: Targets
    let set: (Int?) -> Void

    @State private var text = ""
    @Environment(\.dismiss) private var dismiss

    private var name: String { macro == "kcal" ? "Calories" : macro == "protein" ? "Protein" : "Fat" }
    private var unit: String { macro == "kcal" ? "kcal a day" : "g a day" }
    private var computed: Int { macro == "kcal" ? targets.computed.kcal : macro == "protein" ? targets.computed.protein : targets.computed.fat }
    private var bounds: ClosedRange<Int> { macro == "kcal" ? 800...6000 : macro == "protein" ? 0...500 : 0...400 }
    private var value: Int? { Int(text).flatMap { bounds.contains($0) ? $0 : nil } }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader("\(name) target", subtitle: "Worked out: \(NutritionText.kcal(Double(computed))) \(unit).", onClose: { dismiss() })
            FieldBox(nil, text: $text, prompt: String(computed)) {
                Text(unit).foregroundStyle(Palette.muted)
            }
            .autofocused()
            .keyboardType(.numberPad)
            Button("Use this") { set(value); dismiss() }.buttonStyle(.primary).disabled(value == nil)
            if targets.overridden.contains(macro) {
                Button("Back to \(NutritionText.kcal(Double(computed))) worked out") { set(nil); dismiss() }.buttonStyle(.ghost)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 12)
        .fittedSheet()
        .onAppear {
            let now = macro == "kcal" ? targets.kcal : macro == "protein" ? targets.protein : targets.fat
            text = String(now)
        }
    }
}

/// "+ Add": the preferences the form doesn't show at first, and your own things to leave out.
private struct AddPreferenceSheet: View {
    let options: [PreferenceOption]
    @Binding var chosen: [String]
    @Binding var avoid: [String]

    @State private var word = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SheetHeader("Add a preference", onClose: { dismiss() })
            ChipFlow(spacing: 6) {
                ForEach(options, id: \.key) { p in
                    Chip(p.label, isOn: chosen.contains(p.key)) {
                        if let i = chosen.firstIndex(of: p.key) { chosen.remove(at: i) } else { chosen.append(p.key) }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 7) {
                Text("Something to leave out").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.muted)
                HStack(spacing: 8) {
                    FieldBox(nil, text: $word, prompt: "mushrooms")
                        .onSubmit(addWord)
                        .submitLabel(.done)
                    Button("Add", action: addWord)
                        .buttonStyle(.kitchen(.secondary, fill: false))
                        .disabled(word.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            Button("Done") { dismiss() }.buttonStyle(.primary)
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 12)
        .fittedSheet()
    }

    private func addWord() {
        let w = String(word.trimmingCharacters(in: .whitespaces).lowercased().prefix(40))
        guard !w.isEmpty else { return }
        if !avoid.contains(w) { avoid.append(w) }
        word = ""
    }
}

private struct LengthSheet: View {
    let lengths: [Int]
    @Binding var days: Int
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SheetHeader("Plan length", onClose: { dismiss() })
            ListGroup {
                ForEach(lengths, id: \.self) { n in
                    Button {
                        days = n
                        dismiss()
                    } label: {
                        ListRow("\(n) days") { CheckCircle(isOn: n == days) }
                    }
                    .buttonStyle(PressFade())
                    .accessibilityAddTraits(n == days ? .isSelected : [])
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 12)
        .fittedSheet()
    }
}

#Preview("New meal plan") {
    @Previewable @State var path = NavigationPath()
    NavigationStack {
        TargetPlanForm(session: .preview, path: $path, sampleOptions: MealPlanSamples.options, sampleTargets: MealPlanSamples.plan.targets)
    }
}

#Preview("New meal plan — dark") {
    @Previewable @State var path = NavigationPath()
    NavigationStack {
        TargetPlanForm(session: .preview, path: $path, sampleOptions: MealPlanSamples.options, sampleTargets: MealPlanSamples.plan.targets)
    }
    .preferredColorScheme(.dark)
}
