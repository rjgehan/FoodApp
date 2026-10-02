import SwiftUI

/**
 A planned dish's picture: the recipe's cover, the restaurant's photo or the saved link's, when
 there is one — the same recipe wears its photo on the plan as in Fill a slot and on the web.
 Otherwise the mockup's food-coloured plate with an icon for the kind of dish, a plum shop front
 for eating out, and a herb leaf for a single food (the sky cupboard tile is for cupboard rows).
*/
struct MealPicture: View {
    let entry: MealPlanEntry
    var recipe: Recipe?
    var place: Place?
    var size: CGFloat = 52
    var radius: CGFloat = 12

    private var photo: UUID? {
        if entry.placeId != nil { return place?.imageId }
        if entry.savedLinkId != nil { return entry.savedLinkImageId }
        return recipe?.coverImageId
    }

    var body: some View {
        Group {
            if let id = photo, let url = APIClient.shared.imageURL(id) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        drawn
                    }
                }
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            } else {
                drawn
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder private var drawn: some View {
        if entry.placeId != nil {
            Tile("storefront", tone: .plum, size: size, radius: radius)
        } else if entry.itemName != nil {
            RecipePhotoPlaceholder(hue: .green, systemImage: "leaf", size: size, radius: radius)
        } else {
            plate
        }
    }

    private var plate: some View {
        let key = (entry.recipeId ?? entry.savedLinkId ?? entry.id).uuidString.lowercased()
        let icon = entry.savedLinkId != nil
            ? (entry.savedLinkSource == .web ? "globe" : "play")
            : PlanText.dishIcon(name: recipe?.name ?? entry.recipeName, section: recipe?.section,
                                groups: recipe?.categories ?? [], meal: entry.mealType)
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
        // A day gone by is history: what it meant for the shopping no longer matters, and "Not on
        // list" with a "+ Add" beside last week's dinner would only invite buying it again.
        let past = day < Date().startOfDay
        let mark = SlotMark.of(slot.dishes, shopping: past ? nil : shopping)
        let place = main.placeId.flatMap { places[$0] }
        let second = main.placeId != nil ? place?.notes : PlanText.sides(slot.dishes)
        return HStack(alignment: .center, spacing: 12) {
            MealPicture(entry: main, recipe: main.recipeId.flatMap { recipes[$0] }, place: main.placeId.flatMap { places[$0] })
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
