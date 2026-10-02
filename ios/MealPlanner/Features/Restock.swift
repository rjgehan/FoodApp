import SwiftUI

/**
 "Remind me to buy it": off, the four lengths most things run to, or a number of days for the
 rest. For a Form section — the cupboard item sheet has it, and so does the grocery list's
 sheet for one item. A number that is not one of the four opens as "Every … days" with it
 filled in.
*/
struct RestockPicker: View {
    @Binding var everyDays: Int?

    /// -1 is "Every … days"; 0 is off. Picker tags have to be one type.
    @State private var choice: Int
    @State private var custom: Int

    init(everyDays: Binding<Int?>) {
        _everyDays = everyDays
        let days = everyDays.wrappedValue
        if let days, !Restock.presets.contains(days) {
            _choice = State(initialValue: -1)
        } else {
            _choice = State(initialValue: days ?? 0)
        }
        _custom = State(initialValue: days ?? 10)
    }

    var body: some View {
        Picker("Remind me to buy it", selection: $choice) {
            Text("Off").tag(0)
            ForEach(Restock.presets, id: \.self) { days in
                Text(Restock.everyTitle(days)).tag(days)
            }
            Text("Every … days").tag(-1)
        }
        .onChange(of: choice) { _, picked in
            switch picked {
            case 0: everyDays = nil
            case -1: everyDays = custom
            default: everyDays = picked
            }
        }
        if choice == -1 {
            Stepper(value: $custom, in: 1...365) {
                Text("Every \(custom) \(custom == 1 ? "day" : "days")")
            }
            .onChange(of: custom) { _, days in everyDays = days }
        }
    }
}

/// The grocery list's way to set a reminder on one item — a swipe away on its row.
struct RestockSheet: View {
    let name: String
    let ingredientId: UUID
    var current: RestockReminder?
    var session: Session
    var onSaved: (RestockReminder?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var everyDays: Int?
    @State private var busy = false
    @State private var error: String?

    init(name: String, ingredientId: UUID, current: RestockReminder?, session: Session,
         onSaved: @escaping (RestockReminder?) -> Void) {
        self.name = name
        self.ingredientId = ingredientId
        self.current = current
        self.session = session
        self.onSaved = onSaved
        _everyDays = State(initialValue: current?.everyDays)
    }

    var body: some View {
        NavigationStack {
            Form {
                KitchenSection {
                    RestockPicker(everyDays: $everyDays)
                } footer: {
                    Text("Counted from the last time it was put away. When it's time, the app asks whether to add it to the list.")
                }
                if let error {
                    KitchenSection { Text(error).foregroundStyle(Palette.danger) }
                }
            }
            .kitchenList()
            .navigationTitle(name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { Task { await save() } }
                        .disabled(busy || everyDays == current?.everyDays)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() async {
        guard let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            let saved = try await APIClient.shared.setRestock(household: household, ingredient: ingredientId, everyDays: everyDays)
            onSaved(saved)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/**
 "Time to restock?" — asked when the app opens or comes back, once per household each time,
 and only when something's time has come. Everything starts ticked, since the answer is
 usually yes; untick what you still have. Anything not added — unticked, Not now, or the sheet
 swiped away — is not asked about again for three days, the same as on the web.
*/
struct RestockPrompt: View {
    let household: UUID
    let items: [RestockReminder]
    /// Previews: draw it, but send nothing.
    var sample = false

    @Environment(\.dismiss) private var dismiss
    @State private var selected: Set<UUID>
    @State private var answered = false
    @State private var busy = false
    @State private var error: String?

    init(household: UUID, items: [RestockReminder], sample: Bool = false) {
        self.household = household
        self.items = items
        self.sample = sample
        _selected = State(initialValue: Set(items.map(\.ingredientId)))
    }

    // The mockup's 7.2: the bell on mustard beside the question and how many are due, the due
    // things as a ticked list on a card, then "Add 3 to groceries" and the way to put it all off.
    // An unticked row says what will happen to it, so leaving one out is not a guess.
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            PromptHeader(systemImage: "bell", tone: .mustard, title: "Time to restock?",
                         line: items.count == 1 ? "1 reminder is due" : "\(items.count) reminders are due")
            ListGroup {
                ForEach(items) { item in
                    let on = selected.contains(item.ingredientId)
                    Button {
                        if on { selected.remove(item.ingredientId) } else { selected.insert(item.ingredientId) }
                    } label: {
                        ListRow(capitalised(item.name),
                                subtitle: on ? "\(Restock.everyTitle(item.everyDays)) · \(item.lastBought)"
                                    : "Skip · ask again in 3 days",
                                titleColor: on ? Palette.text : Palette.muted,
                                leading: { CheckBox(isOn: on) }, trailing: { EmptyView() })
                    }
                    .buttonStyle(PressFade())
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                }
            }
            if let error {
                Text(error).font(.system(size: 14)).foregroundStyle(Palette.danger)
            }
            VStack(spacing: 0) {
                Button {
                    Task { await add() }
                } label: {
                    Label(addTitle, systemImage: "cart")
                }
                .buttonStyle(.primary)
                .disabled(busy || selected.isEmpty)
                PromptWayOut("Skip all for 3 days") { notNow() }
                    .disabled(busy)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 26)
        // The sheet adds the home indicator's inset below this on its own.
        .padding(.bottom, 4)
        .fittedSheet()
        // Swiped away without an answer is "Skip all" too.
        .onDisappear { snoozeIfUnanswered() }
    }

    private var addTitle: String {
        if busy { return "Adding…" }
        return selected.isEmpty ? "Add to groceries" : "Add \(selected.count) to groceries"
    }

    /// Named the way recipes name them, lower case; shown the way the mockup writes them.
    private func capitalised(_ name: String) -> String {
        name.prefix(1).uppercased() + name.dropFirst()
    }

    private func add() async {
        busy = true
        defer { busy = false }
        let add = items.map(\.ingredientId).filter { selected.contains($0) }
        let rest = items.map(\.ingredientId).filter { !selected.contains($0) }
        do {
            if !sample {
                try await APIClient.shared.addDueRestock(household: household, add: add, snooze: rest)
            }
            answered = true
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func notNow() {
        snoozeIfUnanswered()
        dismiss()
    }

    private func snoozeIfUnanswered() {
        guard !answered else { return }
        answered = true
        guard !sample else { return }
        let household = household
        let ids = items.map(\.ingredientId)
        Task { try? await APIClient.shared.snoozeRestock(household: household, ingredients: ids) }
    }
}

#Preview("Time to restock?") {
    Text("Groceries")
        .sheet(isPresented: .constant(true)) {
            RestockPrompt(household: SampleData.household.id,
                          items: SampleData.restock.filter { $0.due == true },
                          sample: true)
        }
}

#Preview("Remind me to buy it") {
    Text("Groceries")
        .sheet(isPresented: .constant(true)) {
            RestockSheet(name: "paper towels", ingredientId: SampleData.restock[0].ingredientId,
                         current: SampleData.restock[0], session: .preview) { _ in }
        }
}
