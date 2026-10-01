import SwiftUI

/**
 The mockup's servings stepper: a pill on the well with round − and + either side of the number,
 "4 servings" where there is room to say so.
*/
struct ServingsStepper: View {
    @Binding var value: Int
    var label = false
    var disabled = false

    var body: some View {
        HStack(spacing: 8) {
            round("minus", "Fewer servings", enabled: value > 1) { value -= 1 }
            Text(label ? "\(value) \(value == 1 ? "serving" : "servings")" : "\(value)")
                .font(.system(size: 13, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Palette.text)
                .frame(minWidth: 14)
            round("plus", "More servings", enabled: value < 50) { value += 1 }
        }
        .padding(3)
        .background(Palette.surface2, in: Capsule())
        .disabled(disabled)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Servings")
        .accessibilityValue("\(value)")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: if value < 50 { value += 1 }
            case .decrement: if value > 1 { value -= 1 }
            @unknown default: break
            }
        }
    }

    private func round(_ symbol: String, _ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Palette.text)
                .frame(width: 26, height: 26)
                .background(Palette.surface, in: Circle())
                .shadow(color: .black.opacity(0.08), radius: 1, y: 1)
                .contentShape(Circle().inset(by: -8))
        }
        .buttonStyle(PressFade())
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
        .accessibilityLabel(label)
    }
}

/**
 Servings as they are being stepped, saved once the tapping stops. Going from 4 to 10 is six
 taps, and six requests racing each other can land out of order and leave it at 7.
*/
@MainActor
@Observable
final class ServingsDraft {
    var value: Int?
    private var saving: Task<Void, Never>?

    func binding(saved: Int, save: @escaping (Int) async -> Void) -> Binding<Int> {
        Binding(
            get: { self.value ?? saved },
            set: { new in
                self.value = new
                self.saving?.cancel()
                self.saving = Task {
                    try? await Task.sleep(for: .milliseconds(600))
                    guard !Task.isCancelled else { return }
                    await save(new)
                    if self.value == new { self.value = nil }
                }
            }
        )
    }
}

/// "½ cup", "2 tbsp", or the note when there is no amount ("to garnish").
func optionalAmount(_ ingredient: RecipeIngredient) -> String? {
    let fractions: [(Double, String)] = [(0.25, "¼"), (0.333, "⅓"), (0.5, "½"), (0.667, "⅔"), (0.75, "¾")]
    var number: String?
    if let q = ingredient.quantity {
        let whole = Int(q), rest = q - Double(whole)
        if rest < 0.02 { number = "\(whole)" }
        else if let f = fractions.first(where: { abs($0.0 - rest) < 0.02 }) { number = (whole > 0 ? "\(whole)" : "") + f.1 }
        else { number = String(format: "%g", q) }
    }
    let amount = [number, ingredient.unit].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
    return amount.isEmpty ? ingredient.notes : amount
}

/**
 "Include the extras?" (the mockup's 2.8). Asked once, when a recipe with optional ingredients is
 planned — not every time something later puts the meal on the list. Unticked ones are skipped
 for this meal only. Opened again from the meal's options to change it.
*/
struct ExtrasSheet: View {
    let recipe: Recipe
    @State var selected: Set<UUID>
    var editing = false
    var onDone: ([UUID]) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var busy = false

    var body: some View {
        let optional = recipe.ingredients.filter(\.optional)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader("Include the extras?",
                            subtitle: "\(recipe.name) has \(optional.count) optional \(optional.count == 1 ? "ingredient" : "ingredients").",
                            onClose: { dismiss() })
                ListGroup {
                    ForEach(optional) { ingredient in
                        let on = selected.contains(ingredient.id)
                        Button {
                            if on { selected.remove(ingredient.id) } else { selected.insert(ingredient.id) }
                        } label: {
                            ListRow(ingredient.ingredientName.prefix(1).uppercased() + ingredient.ingredientName.dropFirst(),
                                    subtitle: optionalAmount(ingredient),
                                    leading: { CheckBox(isOn: on) }, trailing: { EmptyView() })
                        }
                        .buttonStyle(PressFade())
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
                if !editing {
                    NoteBox("You can change this later from the meal’s options.", tone: .sky, systemImage: "info.circle")
                }
                Button {
                    busy = true
                    Task {
                        await onDone(Array(selected))
                        busy = false
                    }
                } label: {
                    Text(editing ? "Save" : selected.isEmpty ? "Plan without extras"
                         : "Plan with \(selected.count) \(selected.count == 1 ? "extra" : "extras")")
                }
                .buttonStyle(.primary)
                .disabled(busy)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
        }
        .kitchenSheet([.medium, .large])
    }
}

/// A meal's time — a booking, a pickup, or just when you sit down. "No time" takes it off.
struct TimeSheet: View {
    let title: String
    let initial: String?
    var onSave: (String?) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var time: Date
    @State private var busy = false

    init(title: String, initial: String?, onSave: @escaping (String?) async -> Void) {
        self.title = title
        self.initial = initial
        self.onSave = onSave
        let parts = (initial ?? "18:30").split(separator: ":").compactMap { Int($0) }
        _time = State(initialValue: Calendar.current.date(bySettingHour: parts.first ?? 18, minute: parts.dropFirst().first ?? 30,
                                                         second: 0, of: Date()) ?? Date())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SheetHeader(title, subtitle: "For a booking, a pickup, or when you sit down.", onClose: { dismiss() })
            DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
                .datePickerStyle(.wheel)
                .labelsHidden()
                .frame(maxWidth: .infinity)
            Button("Save") { save(Self.hhmm(time)) }
                .buttonStyle(.primary)
                .disabled(busy)
            if initial != nil {
                Button("No time") { save(nil) }.buttonStyle(.ghost).disabled(busy)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .kitchenSheet([.medium])
    }

    private func save(_ value: String?) {
        busy = true
        Task {
            await onSave(value)
            busy = false
            dismiss()
        }
    }

    static func hhmm(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
}
