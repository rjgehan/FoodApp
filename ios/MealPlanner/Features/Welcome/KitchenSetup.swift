import SwiftUI

/*
 The kitchen questions (the web's components/kitchen/KitchenSetup.tsx): which machines the house
 has, whether it plans meals ahead, and whether it keeps track of its cupboard. Recipes and the
 grocery list are the app; the Plan and the Cupboard are the two parts a household can do
 without, and this is where it first says so.

 Asked by whoever made the house (first-time setup, Start another household) and by somebody
 joining a house nobody has answered them for, from RootView's one prompt slot; any time after,
 from the card at the top of Recipes. Household → Kitchen & features changes the answers later.
 */

/**
 Three short steps in a full-height sheet, each with Back and Skip: the machines as tiles to
 tick, then Plan as two choices, then the cupboard as two. Every step starts on what the house
 already says — its saved machines (Oven and Stovetop for a house with none), its Plan, its
 cupboard — so the questions never quietly change an answer somebody gave before. Done saves the
 three; Skip saves only what was actually answered, and marks the questions done either way.

 Turning the cupboard on, with nothing in it yet, goes on to the starter list (StartCupboard.swift).
 */
struct KitchenSetupSheet: View {
    var session: Session
    /// The house being set up — given, not read from the session: Start another household makes
    /// a house without moving into it.
    let household: UUID
    /// Draw it from this house and send nothing (previews and the Gallery).
    var sample: HouseholdSummary?
    /// Answered or skipped, and the sheet has gone.
    var onFinished: () -> Void = {}

    private enum Step: Int, CaseIterable { case machines, plan, cupboard }

    @Environment(\.dismiss) private var dismiss
    @State private var step: Step
    @State private var machines: Set<String>
    @State private var plan: Bool
    @State private var cupboard: Bool
    /// The steps somebody answered — moved on from, or changed — which are all Skip sends.
    @State private var answered: Set<Step> = []
    /// What the cupboard holds now, when it is on: step 3 says so, and an empty one is offered the
    /// starter list once it is turned on.
    @State private var cupboardCount: Int?
    @State private var busy = false
    @State private var error: String?
    @State private var startingCupboard = false
    /// How the house stood before, to tell "turned the cupboard on" from "left it on".
    private let cupboardWasOn: Bool

    init(session: Session, household: UUID, sample: HouseholdSummary? = nil, onFinished: @escaping () -> Void = {}) {
        self.session = session
        self.household = household
        self.sample = sample
        self.onFinished = onFinished
        let current = sample
            ?? session.households.first { $0.id == household }
            ?? (session.household?.id == household ? session.household : nil)
        let saved = Set(current?.machines ?? [])
        _machines = State(initialValue: saved.isEmpty ? ["oven", "stovetop"] : saved)
        _plan = State(initialValue: current?.plansMeals ?? true)
        // A new house starts without one; a house that already keeps one keeps it unless somebody says otherwise.
        let cupboardOn = current?.cupboardEnabled ?? false
        _cupboard = State(initialValue: cupboardOn)
        cupboardWasOn = cupboardOn
        #if DEBUG
        // -mp_debug_kitchen_step 2 opens on the cupboard question, for screenshot runs.
        let first = UserDefaults.standard.integer(forKey: "mp_debug_kitchen_step")
        #else
        let first = 0
        #endif
        _step = State(initialValue: Step(rawValue: first) ?? .machines)
    }

    private var isLast: Bool { step == Step.allCases.last }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if step != .machines {
                    Button {
                        withAnimation(.snappy) { step = Step(rawValue: step.rawValue - 1) ?? .machines }
                    } label: {
                        HStack(spacing: 2) {
                            Image(systemName: "chevron.left").font(.system(size: 20, weight: .medium))
                            Text("Back")
                        }
                    }
                    .disabled(busy)
                }
                Spacer()
                Button("Skip") { Task { await save(skipping: true) } }
                    .fontWeight(.medium)
                    .disabled(busy)
            }
            .font(.system(size: 17))
            .foregroundStyle(Palette.accentInk)
            .padding(.horizontal, 16)
            .frame(height: 44)
            .padding(.top, 8)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch step {
                    case .machines: machinesStep
                    case .plan: planStep
                    case .cupboard: cupboardStep
                    }
                    if let error {
                        Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 16)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize)

            VStack(spacing: 18) {
                dots
                Button {
                    if isLast {
                        Task { await save(skipping: false) }
                    } else {
                        answered.insert(step)
                        withAnimation(.snappy) { step = Step(rawValue: step.rawValue + 1) ?? .cupboard }
                    }
                } label: {
                    if busy { ProgressView().tint(Palette.onAccent) } else { Text(isLast ? "Done" : "Next") }
                }
                .buttonStyle(.primary)
                .disabled(busy)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 12)
            .frame(maxWidth: 520)
        }
        .pageBackground()
        .kitchenSheet([.large])
        // Skip is the way out, and it says what happened; a stray swipe should not lose the answers.
        .interactiveDismissDisabled()
        .onChange(of: machines) { _ = answered.insert(.machines) }
        .onChange(of: plan) { _ = answered.insert(.plan) }
        .onChange(of: cupboard) { _ = answered.insert(.cupboard) }
        .task { await countCupboard() }
        .sheet(isPresented: $startingCupboard, onDismiss: finish) {
            StartCupboardSheet(household: household, first: true, sample: sample == nil ? nil : SampleData.starters)
        }
    }

    // MARK: The steps

    private var machinesStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            heading("What's in your kitchen?", "Tap everything you have. Recipes show which machines they need.")
            MachineGrid(selected: $machines)
            Text("You can change this any time in Household settings.")
                .font(.system(size: 13)).foregroundStyle(Palette.muted)
                .padding(.horizontal, 4)
        }
    }

    private var planStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            heading("Plan meals ahead?",
                    "Plan the week together and add the whole week to Groceries in one tap. "
                    + "You can always add a single recipe straight to the list.")
            KitchenChoiceCard(title: "Yes, show Plan", line: "A Plan tab for the days ahead, shared by everyone in the house",
                              systemImage: "calendar", tone: .accent, isOn: plan) { plan = true }
            KitchenChoiceCard(title: "Not now", line: "Just recipes and the list. Turn Plan on any time.",
                              systemImage: "book", tone: .herb, isOn: !plan) { plan = false }
        }
    }

    private var cupboardStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            heading("Keep track of your cupboard?",
                    "The cupboard remembers what's at home so the list can skip it. "
                    + "It only works if someone updates it after shopping and cooking.")
            if cupboardWasOn, let count = cupboardCount, count > 0 {
                NoteBox("Your cupboard has \(count) \(count == 1 ? "thing" : "things") in it.", tone: .sky, systemImage: "cabinet")
            }
            KitchenChoiceCard(title: "No thanks — just the list", line: nil, badge: "Most people start here",
                              systemImage: "cart", tone: .herb, isOn: !cupboard) { cupboard = false }
            KitchenChoiceCard(title: "Yes, track my cupboard", line: "Put the shopping away with a tap after each shop",
                              systemImage: "cabinet", tone: .sky, isOn: cupboard) { cupboard = true }
        }
    }

    private func heading(_ title: String, _ line: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).titleFont(28).foregroundStyle(Palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(line)
                .font(.system(size: 16))
                .lineSpacing(3)
                .foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var dots: some View {
        HStack(spacing: 6) {
            ForEach(Step.allCases, id: \.self) { s in
                Capsule()
                    .fill(s == step ? Palette.accent : Palette.faint)
                    .frame(width: s == step ? 18 : 6, height: 6)
            }
        }
        .animation(.snappy, value: step)
        .accessibilityElement()
        .accessibilityLabel("Question \(step.rawValue + 1) of \(Step.allCases.count)")
    }

    // MARK: Behaviour

    private func countCupboard() async {
        guard sample == nil, cupboardWasOn else { return }
        cupboardCount = (try? await APIClient.shared.cupboard(household: household))?.count
    }

    /**
     Done sends all three answers; Skip only those given (and the one on screen, if it was
     changed). Both mark the questions answered, so they are not asked again and the card on
     Recipes goes. An empty cupboard just turned on goes on to the starter list first.
     */
    private func save(skipping: Bool) async {
        guard !busy else { return }
        let sending: Set<Step> = skipping ? answered : Set(Step.allCases)
        let machineKeys = KitchenMachine.ordered(machines).map(\.key)
        error = nil
        if sample != nil {
            wrapUp(cupboardOn: sending.contains(.cupboard) ? cupboard : cupboardWasOn)
            return
        }
        busy = true
        defer { busy = false }
        do {
            let saved = try await APIClient.shared.updateKitchen(
                household: household,
                cupboardEnabled: sending.contains(.cupboard) ? cupboard : nil,
                planEnabled: sending.contains(.plan) ? plan : nil,
                machines: sending.contains(.machines) ? machineKeys : nil,
                setUp: true)
            session.adopt(saved)
            wrapUp(cupboardOn: saved.tracksCupboard)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func wrapUp(cupboardOn: Bool) {
        if session.kitchenSetupFor == household { session.kitchenSetupFor = nil }
        if cupboardOn && !cupboardWasOn && (cupboardCount ?? 0) == 0 {
            startingCupboard = true
        } else {
            finish()
        }
    }

    private func finish() {
        onFinished()
        dismiss()
    }
}

// MARK: - Pieces

/// Every machine as a tile to tick, two to a row, in the catalogue's order — the kitchen
/// questions' first step and Household → Kitchen & features.
struct MachineGrid: View {
    @Binding var selected: Set<String>

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(KitchenMachine.all) { machine in
                MachineTile(machine: machine, isOn: selected.contains(machine.key)) {
                    if selected.contains(machine.key) { selected.remove(machine.key) } else { selected.insert(machine.key) }
                }
            }
        }
    }
}

/// One machine to tick: its drawing, its name, and the square tick for picking several.
struct MachineTile: View {
    let machine: KitchenMachine
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        Button(action: action) {
            HStack(spacing: 10) {
                machine.image
                    .resizable()
                    .scaledToFit()
                    .frame(width: 24, height: 24)
                    .foregroundStyle(isOn ? Palette.accentInk : Palette.muted)
                Text(machine.label)
                    .font(.system(size: 14, weight: isOn ? .semibold : .medium))
                    .foregroundStyle(Palette.text)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .frame(maxWidth: .infinity, alignment: .leading)
                CheckBox(isOn: isOn, size: 20)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: 58)
            .background(isOn ? Palette.accentSoft : Palette.surface, in: shape)
            .overlay(shape.strokeBorder(isOn ? Palette.accent : Palette.border, lineWidth: isOn ? 1.5 : 1))
            .contentShape(shape)
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(machine.label)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// A big answer to tap (the kitchen questions' Plan and cupboard steps): a tile, what it means,
/// and the accent ring with a tick on the chosen one, as Light or dark? draws its cards.
struct KitchenChoiceCard: View {
    let title: String
    var line: String?
    var badge: String?
    let systemImage: String
    var tone: Tone = .accent
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Tile(systemImage, tone: tone, size: 44)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                    if let line {
                        Text(line).font(.system(size: 13)).foregroundStyle(Palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let badge {
                        Pill(badge, tone: .herb).padding(.top, 3)
                    }
                }
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                ZStack {
                    Circle().strokeBorder(isOn ? Palette.accent : Palette.faint, lineWidth: 1.6)
                    if isOn {
                        Circle().fill(Palette.accent)
                        Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Palette.onAccent)
                    }
                }
                .frame(width: 24, height: 24)
                .accessibilityHidden(true)
            }
            .padding(16)
            .cardSurface()
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(isOn ? Palette.accent : .clear, lineWidth: 2.5))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(PressFade())
        .accessibilityAddTraits(isOn ? [.isSelected] : [])
    }
}

/**
 The quiet way in, at the top of Recipes, for a house nobody has answered the kitchen questions
 for — the web's card, word for word. Start asks them; the cross puts the card away on this phone
 for this house (UserDefaults `mp_kitchenCardClosed_<household>`), and Household → Kitchen &
 features still has every answer.
 */
struct KitchenSetupCard: View {
    let onStart: () -> Void
    let onClose: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Tile("frying.pan", tone: .herb, size: 44)
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Set up your kitchen").font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                    Text("3 quick questions").font(.system(size: 13)).foregroundStyle(Palette.muted)
                }
                Button("Start", action: onStart)
                    .buttonStyle(.kitchen(.primary, size: .small, fill: false))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            IconButton("xmark", style: .plain, size: 28, label: "Not now", action: onClose)
        }
        .padding(14)
        .cardSurface()
    }

    private static func key(_ household: UUID) -> String { "mp_kitchenCardClosed_\(household.uuidString)" }

    /// Put away on this phone, for this house.
    static func isClosed(for household: UUID) -> Bool { UserDefaults.standard.bool(forKey: key(household)) }

    static func close(for household: UUID) { UserDefaults.standard.set(true, forKey: key(household)) }
}

#Preview("Kitchen setup") {
    Color.clear.sheet(isPresented: .constant(true)) {
        KitchenSetupSheet(session: .preview, household: SampleData.household.id, sample: SampleData.newHousehold)
    }
}

#Preview("Kitchen setup — dark") {
    Color.clear.sheet(isPresented: .constant(true)) {
        KitchenSetupSheet(session: .preview, household: SampleData.household.id, sample: SampleData.newHousehold)
    }
    .preferredColorScheme(.dark)
}

#Preview("Kitchen card") {
    VStack(spacing: 16) {
        KitchenSetupCard(onStart: {}, onClose: {})
        KitchenChoiceCard(title: "No thanks — just the list", badge: "Most people start here",
                          systemImage: "cart", tone: .herb, isOn: true) {}
        KitchenChoiceCard(title: "Yes, track my cupboard", line: "Put the shopping away with a tap after each shop",
                          systemImage: "cabinet", tone: .sky, isOn: false) {}
    }
    .padding(20)
    .frame(maxHeight: .infinity, alignment: .top)
    .pageBackground()
}
