import SwiftUI

/**
 One grocery item (mockup 4.2): which aisle it goes in, a restock reminder, what the cupboard
 says, and taking it off the list. Each takes effect as it is tapped — there is no Save — because
 each is one decision about one thing.

 The aisle belongs to the ingredient, not this row, so picking one moves it for good: next week's
 chicken thighs land in Meat & fish too.
 */
struct GroceryItemSheet: View {
    let item: GroceryItem
    let categories: [GroceryCategory]
    var reminder: RestockReminder?
    var stock: CupboardItem?
    var session: Session
    /// Previews and the gallery: draw it, send nothing.
    var sample = false
    var onMove: (UUID) -> Void
    var onReminder: (RestockReminder?) -> Void
    var onRemove: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var aisle: UUID?
    @State private var current: RestockReminder?
    @State private var error: String?
    /// The content's own height: the sheet hugs "Remove from list", edge to edge, as the mockup's does.
    @State private var height: CGFloat = 540

    init(item: GroceryItem, categories: [GroceryCategory], reminder: RestockReminder?, stock: CupboardItem?,
         session: Session, sample: Bool = false, onMove: @escaping (UUID) -> Void,
         onReminder: @escaping (RestockReminder?) -> Void, onRemove: @escaping () -> Void) {
        self.item = item
        self.categories = categories
        self.reminder = reminder
        self.stock = stock
        self.session = session
        self.sample = sample
        self.onMove = onMove
        self.onReminder = onReminder
        self.onRemove = onRemove
        _aisle = State(initialValue: item.categoryId)
        _current = State(initialValue: reminder)
    }

    private var name: String { GroceryWords.titled(item.name) }

    private var subtitle: String? {
        let recipes = item.fromRecipes ?? []
        let from = !recipes.isEmpty ? "from \(recipes.joined(separator: ", "))"
            : item.addedByName.map { "added by \($0)" }
        let parts = [item.amount, from].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(name, subtitle: subtitle, onClose: { dismiss() })

                if item.ingredientId != nil {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionLabel("Aisle").padding(.horizontal, -4)
                        ChipFlow(spacing: 8) {
                            ForEach(categories) { category in
                                AisleChip(title: category.name, isOn: aisle == category.id) {
                                    guard aisle != category.id else { return }
                                    withAnimation(.snappy(duration: 0.2)) { aisle = category.id }
                                    onMove(category.id)
                                }
                            }
                        }
                        Text(aisleNote).font(.system(size: 12)).foregroundStyle(Palette.muted)
                    }
                }

                ListGroup {
                    if let ingredient = item.ingredientId {
                        Button {
                            Task { await remind(ingredient, current == nil ? 14 : nil) }
                        } label: {
                            ListRow("Remind me to buy it",
                                    subtitle: current.map(GroceryWords.reminderLine) ?? "Off",
                                    leading: { Tile("bell", tone: .mustard, size: 34) }) {
                                Toggle("", isOn: .constant(current != nil)).labelsHidden().allowsHitTesting(false)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(current != nil ? .isSelected : [])
                        if let current {
                            HStack {
                                Text("How often").font(.system(size: 15)).foregroundStyle(Palette.muted)
                                Spacer()
                                Menu {
                                    ForEach(Restock.presets, id: \.self) { days in
                                        Button(Restock.everyTitle(days)) { Task { await remind(ingredient, days) } }
                                    }
                                } label: {
                                    HStack(spacing: 4) {
                                        Text(Restock.everyTitle(current.everyDays))
                                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold))
                                    }
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(Palette.accentInk)
                                }
                            }
                            .padding(.leading, 62)
                            .padding(.trailing, 16)
                            .frame(minHeight: 46)
                        }
                    }
                    ListRow("Cupboard", subtitle: GroceryWords.cupboardState(stock),
                            leading: { Tile("cabinet", tone: .sky, size: 34) }) { EmptyView() }
                    Button {
                        onRemove()
                        dismiss()
                    } label: {
                        ListRow("Remove from list", titleColor: Palette.accentInk, tile: ("trash", .accent))
                    }
                    .buttonStyle(.plain)
                }

                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            // The sheet adds the home indicator's inset below this on its own.
            .padding(.bottom, 12)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .tint(Palette.herb)
        .kitchenSheet([.height(height)])
    }

    private var aisleNote: String {
        if let name = categories.first(where: { $0.id == aisle })?.name {
            return "\(self.name) will always go in \(name)."
        }
        return "Pick an aisle and \(item.name) will always go there."
    }

    private func remind(_ ingredient: UUID, _ everyDays: Int?) async {
        error = nil
        if sample {
            current = everyDays.map {
                RestockReminder(ingredientId: ingredient, name: item.name, everyDays: $0, lastBoughtAt: "",
                                dueAt: nil, snoozedUntil: nil, due: false)
            }
            return
        }
        guard let household = session.household?.id else { return }
        do {
            let saved = try await APIClient.shared.setRestock(household: household, ingredient: ingredient, everyDays: everyDays)
            withAnimation(.snappy(duration: 0.2)) { current = saved }
            onReminder(saved)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// An aisle choice in the item sheet: the mockup's chip at the sheet's larger size.
private struct AisleChip: View {
    let title: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 15, weight: isOn ? .semibold : .medium))
                .foregroundStyle(isOn ? Palette.bg : Palette.text)
                .padding(.horizontal, 13)
                .padding(.vertical, 8)
                .background(isOn ? Palette.text : Palette.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(isOn ? Palette.text : Palette.border, lineWidth: 1))
                .fixedSize()
                .contentShape(Capsule())
        }
        .buttonStyle(PressFade())
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/**
 "Done shopping?" (mockup 4.4). Everything ticked comes off the list, and what is for the house
 goes in the cupboard. All of it starts ticked because most of a shop is for the house — you
 untick the birthday card, rather than ticking everything else. The switch is for a shop that
 was not for the house at all.
 */
struct DoneShoppingSheet: View {
    let items: [GroceryItem]
    var session: Session
    var sample = false
    var onDone: (_ cleared: [UUID], _ stocked: Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var toCupboard = true
    @State private var selected: Set<UUID>
    @State private var busy = false
    @State private var error: String?
    /// Sized to what it lists, with the list dimmed above (mockup 4.4); a long shop grows it to
    /// full height, and then it scrolls.
    @State private var height: CGFloat = 560

    init(items: [GroceryItem], session: Session, sample: Bool = false,
         onDone: @escaping (_ cleared: [UUID], _ stocked: Int) -> Void) {
        self.items = items
        self.session = session
        self.sample = sample
        self.onDone = onDone
        _selected = State(initialValue: Set(items.map(\.id)))
    }

    private var stocking: [GroceryItem] { toCupboard ? items.filter { selected.contains($0.id) } : [] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader("Done shopping?",
                            subtitle: "\(items.count) ticked \(items.count == 1 ? "item leaves" : "items leave") the list.",
                            onClose: { dismiss() })
                .padding(.bottom, 4)

                HStack(spacing: 12) {
                    Tile("cabinet", tone: .sky, size: 36)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Put them in the cupboard").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                        Text("Untick anything that isn't for the house").font(.system(size: 12)).foregroundStyle(Palette.muted)
                    }
                    Spacer(minLength: 8)
                    Toggle("Put them in the cupboard", isOn: $toCupboard.animation(.snappy(duration: 0.2)))
                        .labelsHidden()
                        .tint(Palette.herb)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .cardSurface()

                ListGroup {
                    ForEach(items) { item in
                        let on = selected.contains(item.id)
                        Button {
                            if on { selected.remove(item.id) } else { selected.insert(item.id) }
                        } label: {
                            HStack(spacing: 12) {
                                CheckBox(isOn: on && toCupboard)
                                // The amount in bold, then the name (`<b>2 lb</b> chicken thighs`).
                                (item.amount.map { Text($0 + " ").font(.system(size: 16, weight: .bold)) } ?? Text(""))
                                    + Text(item.name).font(.system(size: 16, weight: .medium))
                                Spacer(minLength: 8)
                                if !on && toCupboard {
                                    Text("Not for the house").font(.system(size: 12)).foregroundStyle(Palette.muted)
                                }
                            }
                            .foregroundStyle(on ? Palette.text : Palette.muted)
                            .lineLimit(1)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .frame(minHeight: 46)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(!toCupboard)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
                .opacity(toCupboard ? 1 : 0.5)

                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }

                Button {
                    Task { await finish() }
                } label: {
                    Text(busy ? "Finishing…" : stocking.isEmpty ? "Finish" : "Finish · \(stocking.count) to cupboard")
                }
                .buttonStyle(.primary)
                .disabled(busy)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 12)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .kitchenSheet([.height(height)])
    }

    private func finish() async {
        let putAway = stocking.map(\.id)
        let leaveOut = items.map(\.id).filter { !putAway.contains($0) }
        if sample {
            onDone(putAway + leaveOut, putAway.count)
            dismiss()
            return
        }
        guard let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.putAway(household: household, putAway: putAway, leaveOut: leaveOut)
            onDone(putAway + leaveOut, putAway.count)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Grocery item") {
    Color.clear.sheet(isPresented: .constant(true)) {
        GroceryItemSheet(item: SampleData.groceriesMockup[4], categories: SampleData.aisles,
                         reminder: SampleData.groceryReminders.first, stock: nil, session: .preview, sample: true,
                         onMove: { _ in }, onReminder: { _ in }, onRemove: {})
    }
}

#Preview("Done shopping — dark") {
    Color.clear.sheet(isPresented: .constant(true)) {
        DoneShoppingSheet(items: SampleData.groceriesMockup.filter(\.checked), session: .preview, sample: true) { _, _ in }
    }
    .preferredColorScheme(.dark)
}
