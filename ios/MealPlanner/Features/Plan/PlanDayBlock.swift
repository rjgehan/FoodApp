import SwiftUI

/**
 A planned dish's picture: the mockup's food-coloured plate with an icon for the kind of meal, a
 plum shop front for eating out, the cupboard for a single food. A saved link is its picture —
 the video's cover is how you know which one — so it shows its own, as the plan always has. The
 phone downloads no recipe covers for the plan, the same as the web on a phone.
*/
struct MealPicture: View {
    let entry: MealPlanEntry
    var recipe: Recipe?
    var size: CGFloat = 52
    var radius: CGFloat = 12

    var body: some View {
        Group {
            if entry.placeId != nil {
                Tile("storefront", tone: .plum, size: size, radius: radius)
            } else if entry.itemName != nil {
                Tile("cabinet", tone: .sky, size: size, radius: radius)
            } else if entry.savedLinkId != nil, let id = entry.savedLinkImageId, let url = APIClient.shared.imageURL(id) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    plate
                }
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            } else {
                plate
            }
        }
        .accessibilityHidden(true)
    }

    private var plate: some View {
        let key = (entry.recipeId ?? entry.savedLinkId ?? entry.id).uuidString.lowercased()
        let icon = entry.savedLinkId != nil
            ? (entry.savedLinkSource == .web ? "globe" : "play")
            : PlanText.icon(section: recipe?.section, meal: entry.mealType)
        return RecipePhotoPlaceholder(hue: .of(key), systemImage: icon, size: size, radius: radius)
    }
}

/**
 One planned day in a list (the mockup's dayBlock): the day on the left — "TODAY 29", "WED 30" —
 and its meals in one card on the right, each with its picture, its sides and what it means for
 the shopping. Tap a meal for the day sheet; hold it for its options.
*/
struct PlanDayBlock: View {
    let day: Date
    let entries: [MealPlanEntry]
    let recipes: [UUID: Recipe]
    let places: [UUID: Place]
    let shopping: ShoppingMap?
    var onOpen: (PlanSlot) -> Void
    var onOptions: (PlanSlot) -> Void
    var onAdd: (PlanSlot) -> Void

    var body: some View {
        let slots = PlanText.slots(entries)
        HStack(alignment: .top, spacing: 8) {
            VStack(spacing: 0) {
                Text(Calendar.current.isDateInToday(day) ? "Today" : day.formatted(.dateTime.weekday(.abbreviated)))
                    .font(.system(size: 11, weight: .semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.muted)
                Text(day.formatted(.dateTime.day())).titleFont(22).foregroundStyle(Palette.text)
            }
            .frame(width: 44)
            .padding(.top, 10)
            .accessibilityElement(children: .combine)

            VStack(spacing: 0) {
                ForEach(Array(slots.enumerated()), id: \.element.id) { index, slot in
                    if index > 0 {
                        Rectangle().fill(Palette.border).frame(height: 1).padding(.leading, 76)
                    }
                    row(slot)
                }
            }
            .cardSurface()
        }
    }

    private func row(_ slot: PlanSlot) -> some View {
        let main = slot.main
        let mark = SlotMark.of(slot.dishes, shopping: shopping)
        let place = main.placeId.flatMap { places[$0] }
        let second = main.placeId != nil ? place?.notes : PlanText.sides(slot.dishes)
        return HStack(alignment: .center, spacing: 12) {
            MealPicture(entry: main, recipe: main.recipeId.flatMap { recipes[$0] })
            VStack(alignment: .leading, spacing: 2) {
                Text(slot.meal.title + (PlanText.clock(PlanText.time(slot.dishes)).map { " · \($0)" } ?? ""))
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.55)
                    .textCase(.uppercase)
                    .foregroundStyle(Palette.muted)
                Text(main.label)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                if let second, !second.isEmpty {
                    Text(second).font(.system(size: 13)).foregroundStyle(Palette.muted).lineLimit(1)
                }
                if let mark {
                    HStack(spacing: 6) {
                        Pill(mark.label, tone: mark.tone, systemImage: mark.icon)
                        if mark.canAdd {
                            Button {
                                onAdd(slot)
                            } label: {
                                Text("+ Add").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.accentInk)
                                    .padding(.vertical, 4).padding(.horizontal, 4).contentShape(Rectangle())
                            }
                            .buttonStyle(PressFade())
                            .accessibilityLabel("Add \(slot.meal.title.lowercased()) to groceries")
                        }
                    }
                    .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture { onOpen(slot) }
        .onLongPressGesture(minimumDuration: 0.45) {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            onOptions(slot)
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(slot.meal.title): \(main.label)")
        .accessibilityAction(named: "Options") { onOptions(slot) }
    }
}
