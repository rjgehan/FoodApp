import SwiftUI

/*
 The pieces Groceries and Cupboard (mockup section 04) share: a row's card drawn inside a system
 List — so the rows keep the system's swipe actions and still look like the mockup's 18pt cards —
 the aisle label with its count, the Have / Low pill, the − / + stepper, and the words both
 screens use for what the cupboard and a reminder say.
 */

// MARK: - A card, one row at a time

/**
 One row's share of a card, for a `List` row's background: the surface, the border down both
 sides, the top corners on the first row and the bottom ones on the last, and the hairline
 between rows starting `inset` in (past a check circle). Rows drawn this way stack into one card
 with the mockup's corners, while each stays a real list row that can be swiped.
 */
struct CardRowBackground: View {
    var first: Bool
    var last: Bool
    var inset: CGFloat = 0
    var radius: CGFloat = 18

    var body: some View {
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: first ? radius : 0, bottomLeadingRadius: last ? radius : 0,
            bottomTrailingRadius: last ? radius : 0, topTrailingRadius: first ? radius : 0,
            style: .continuous)
        shape.fill(Palette.surface)
            // The whole outline, stretched past whichever ends of the row continue the card and
            // clipped there, so only the sides — and the card's own ends — are drawn.
            .overlay {
                shape.strokeBorder(Palette.border, lineWidth: 1)
                    .padding(.top, first ? 0 : -2)
                    .padding(.bottom, last ? 0 : -2)
                    .clipped()
            }
            .overlay(alignment: .top) {
                if !first {
                    Rectangle().fill(Palette.border).frame(height: 1).padding(.leading, inset)
                }
            }
            .padding(.horizontal, 20)
    }
}

extension View {
    /// A List row drawn as part of a card: no system separator, the page's 20pt plus the card's
    /// own `padding` in from each side, and `CardRowBackground` behind it.
    func cardRow(first: Bool, last: Bool, inset: CGFloat = 0, padding: CGFloat = 16) -> some View {
        listRowInsets(EdgeInsets(top: 0, leading: 20 + padding, bottom: 0, trailing: 20 + padding))
            .listRowSeparator(.hidden)
            .listRowBackground(CardRowBackground(first: first, last: last, inset: inset))
    }

    /// A List row that is part of the page, not a card: a title, a label, a button.
    func pageRow(top: CGFloat = 0, bottom: CGFloat = 0, horizontal: CGFloat = 20) -> some View {
        listRowInsets(EdgeInsets(top: top, leading: horizontal, bottom: bottom, trailing: horizontal))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}

/// An aisle's label over its card (`.aisle`): 12pt bold capitals, the count on the right.
struct AisleLabel: View {
    let name: String
    var count: Int?

    var body: some View {
        HStack {
            Text(name.uppercased())
            Spacer(minLength: 8)
            if let count { Text("\(count)").tracking(0) }
        }
        .font(.system(size: 12, weight: .bold))
        .tracking(0.7)
        .foregroundStyle(Palette.muted)
        .padding(.horizontal, 4)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - Stock

/**
 Have or Low (mockup 4.5's stock pill): Have lifts onto the surface, Low fills with mustard — the
 colour of "worth a look" — so it reads from across the kitchen.
 */
struct HaveOrLow: View {
    let low: Bool
    var onChange: (Bool) -> Void

    var body: some View {
        HStack(spacing: 0) {
            half(isLow: false, title: "Have")
            half(isLow: true, title: "Low")
        }
        .padding(2)
        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("How much is left")
    }

    private func half(isLow: Bool, title: String) -> some View {
        let chosen = low == isLow
        return Button {
            if !chosen { onChange(isLow) }
        } label: {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(chosen ? (isLow ? Color.white : Palette.text) : Palette.muted)
                .padding(.horizontal, 9)
                .frame(height: 26)
                .background {
                    if chosen {
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(isLow ? Palette.mustard : Palette.surface)
                            .shadow(color: .black.opacity(isLow ? 0 : 0.12), radius: 1, y: 1)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(chosen ? [.isSelected] : [])
    }
}

/// The mockup's stepper: round − and + on a quiet pill, with what they change between them.
struct CountStepper: View {
    var shown: String?
    var canLower = true
    var onStep: (Double) -> Void

    var body: some View {
        HStack(spacing: 8) {
            step("minus", label: "One less", delta: -1).disabled(!canLower)
            if let shown {
                Text(shown).font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Palette.text)
            }
            step("plus", label: "One more", delta: 1)
        }
        .padding(3)
        .background(Palette.surface2, in: Capsule())
    }

    private func step(_ symbol: String, label: String, delta: Double) -> some View {
        Button {
            onStep(delta)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Palette.text)
                .frame(width: 22, height: 22)
                .background(Palette.surface, in: Circle())
                .shadow(color: .black.opacity(0.08), radius: 1, y: 1)
                .padding(6)
                .contentShape(Rectangle())
                .padding(-6)
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(label)
    }
}

// MARK: - Words

enum GroceryWords {
    /// "3", "2.5" — a number as a person would write it.
    static func number(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%g", value)
    }

    /// The line under a row: the recipes that put it on the list, or who typed it in — and who
    /// ticked it off, since two people can shop one list at once.
    static func detail(_ item: GroceryItem) -> String? {
        let recipes = item.fromRecipes ?? []
        var parts: [String] = []
        if !recipes.isEmpty {
            parts.append(recipes.joined(separator: ", "))
        } else if let who = item.addedByName {
            parts.append("Added by \(who)")
        }
        if item.checked, let who = item.checkedByName, who != item.addedByName {
            parts.append("got by \(who)")
        }
        guard let line = parts.first.map({ _ in parts.joined(separator: " · ") }) else { return nil }
        return line.prefix(1).uppercased() + line.dropFirst()
    }

    /// "Cupboard says you have 1".
    static func cupboardSays(_ stock: CupboardItem?) -> String {
        if let quantity = stock?.quantity {
            return "Cupboard says you have \(number(quantity))" + (stock?.unit.map { " \($0)" } ?? "")
        }
        return "Cupboard says you have some"
    }

    /// The Cupboard row in an item's sheet.
    static func cupboardState(_ stock: CupboardItem?) -> String {
        guard let stock else { return "None recorded" }
        if stock.staple { return "Always have" }
        if let quantity = stock.quantity {
            return quantity > 0 ? number(quantity) + (stock.unit.map { " \($0)" } ?? "") : "None left"
        }
        return stock.runningLow ? "Running low" : "Have some"
    }

    /// "Every 2 weeks · next Tue 13 Oct".
    static func reminderLine(_ reminder: RestockReminder) -> String {
        let title = Restock.everyTitle(reminder.everyDays)
        guard let due = reminder.dueAt.flatMap(date) else { return title }
        return "\(title) · next \(due.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))"
    }

    private static func date(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    /// "Chicken thighs", for a title.
    static func titled(_ name: String) -> String {
        name.prefix(1).uppercased() + name.dropFirst()
    }
}

/// The grocery list's one box (`addBox`): a tomato plus, the field, and Add once something is typed.
struct AddItemBox: View {
    @Binding var text: String
    var prompt = "Add an item, e.g. \"2 lb chicken\""
    var onSubmit: () -> Void

    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "plus").font(.system(size: 18, weight: .medium)).foregroundStyle(Palette.accentInk)
            TextField("", text: $text, prompt: Text(prompt).foregroundStyle(Palette.faint))
                .font(.system(size: 16))
                .foregroundStyle(Palette.text)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit(onSubmit)
            if !text.trimmingCharacters(in: .whitespaces).isEmpty {
                Button("Add", action: onSubmit).buttonStyle(.kitchen(.primary, size: .small))
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 6)
        .frame(height: 48)
        .fieldSurface(focused: focused)
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
    }
}
