import SwiftUI

/*
 Meal plans' own pieces (the mockup's 5.1 door and 5.7–5.11): a plan's colour and mark, the ring
 for how much comes from the cupboard, a meal's picture and row, the day tiles, the four-way
 choice and the quiet "could not load" card. Built on the design system's tokens, so every theme
 and both modes come for free — the same pieces the web draws in MealPlanParts.tsx.
 */

/// Where Meal plans' screens lead, pushed on Explore's stack.
enum MealPlansRoute: Hashable {
    case home
    case cupboard
    case plan(UUID)
    case preset(String)
    case newPlan
    case editPlan(UUID)
}

enum MealPlanLook {
    /// The card's picture colour: the herb plans take the mockup's deeper green, as on the web.
    static func hue(_ name: String) -> Hue {
        name == "herb" ? .green : Hue(rawValue: name) ?? .tomato
    }

    /// The pill tone that goes with a plan's colour (5.7's "2,900 kcal" on the tomato card).
    static func tone(_ hue: String) -> Tone {
        switch hue {
        case "tomato": return .accent
        case "herb", "green": return .herb
        case "sky": return .sky
        case "plum": return .plum
        default: return .mustard
        }
    }

    /// The server names its marks for both apps; these are the phone's drawings of them.
    static func symbol(_ icon: String) -> String {
        switch icon {
        case "flame": return "flame"
        case "heart": return "heart"
        case "leaf": return "leaf"
        case "cup": return "cup.and.saucer"
        case "bolt": return "scalemass"
        default: return "fork.knife"
        }
    }
}

/// A share as a ring of a tone with its number in the middle (5.9's "87%").
struct PercentRing: View {
    let percent: Int
    var size: CGFloat = 76
    var stroke: CGFloat = 9
    var tone: Color = Palette.herb

    var body: some View {
        let part = max(0, min(Double(percent) / 100, 1))
        ZStack {
            Circle().stroke(Palette.surface2, lineWidth: stroke)
            if part > 0 {
                Circle()
                    .trim(from: 0, to: part)
                    .stroke(tone, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Text("\(percent)%").font(.system(size: 17, weight: .bold)).monospacedDigit().foregroundStyle(Palette.text)
        }
        .padding(stroke / 2)
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(percent) percent")
    }
}

/// A meal's picture: the recipe's cover, or its colour with a mark for the kind of dish.
struct PlanMealPicture: View {
    let recipeId: UUID
    let name: String
    let section: RecipeSection?
    let coverImageId: UUID?
    let meal: MealType
    var size: CGFloat = 44

    var body: some View {
        Group {
            if let cover = coverImageId, let url = APIClient.shared.imageURL(cover) {
                Color.clear.overlay {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image { image.resizable().scaledToFill() } else { placeholder }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        RecipePhotoPlaceholder(hue: .of(recipeId.uuidString.lowercased()),
                               systemImage: PlanText.dishIcon(name: name, section: section, groups: [], meal: meal),
                               size: size, radius: 10)
    }
}

/// "100%" with the cupboard mark: a meal's share already in, herb when it is all there.
struct CupboardPill: View {
    let percent: Int

    var body: some View {
        let tone: Tone = percent >= 100 ? .herb : .mustard
        HStack(spacing: 4) {
            Image(systemName: "cabinet").font(.system(size: 11, weight: .semibold))
            Text("\(percent)%").monospacedDigit()
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(tone.ink)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(tone.soft, in: Capsule())
        .fixedSize()
        .accessibilityLabel("\(percent) percent in the cupboard")
    }
}

/// The round swap at the end of a meal's row (5.9).
struct SwapButton: View {
    let label: String
    var busy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if busy {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "arrow.left.arrow.right").font(.system(size: 16, weight: .medium))
                }
            }
            .foregroundStyle(Palette.faint)
            .frame(width: 36, height: 36)
            .contentShape(Circle())
        }
        .buttonStyle(PressFade())
        .disabled(busy)
        .accessibilityLabel(label)
    }
}

/// The small sparkles at the end of a row the phone's model chose.
struct ModelChoseMark: View {
    var body: some View {
        Image(systemName: "sparkles").font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Palette.plum)
            .accessibilityLabel("Chosen by Apple Intelligence")
    }
}

/// "✨ Apple Intelligence chose 6 of 8 meals", under a plan the model chose.
struct ModelChoseNote: View {
    let chosen: Int
    let total: Int

    var body: some View {
        HStack(spacing: 8) {
            AppleIntelligenceMark()
            Text(chosen == total ? "chose \(total == 1 ? "the meal" : "every meal") from your recipes"
                 : "chose \(chosen) of \(total) meals from your recipes")
                .font(.system(size: 12)).foregroundStyle(Palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .combine)
    }
}

/// "Apple Intelligence is choosing… day 3 of 7".
struct ModelWorkingNote: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small)
            Text(text).font(.system(size: 12)).foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 4)
    }
}

/// The model's few words about a plan, under its numbers.
struct ModelWords: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(text).font(.system(size: 13)).foregroundStyle(Palette.text).lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            AppleIntelligenceMark()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Palette.plumSoft.opacity(0.55), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// A meal row in a grouped list (5.9, 5.10): picture, name, a line under it, and whatever ends it.
struct MealRowView<Trailing: View>: View {
    let title: String
    let subtitle: String
    var muted = false
    let picture: AnyView
    @ViewBuilder var trailing: Trailing

    init(title: String, subtitle: String, muted: Bool = false, picture: some View, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.subtitle = subtitle
        self.muted = muted
        self.picture = AnyView(picture)
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 10) {
            picture
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(muted ? Palette.muted : Palette.text).lineLimit(1)
                Text(subtitle).font(.system(size: 12)).foregroundStyle(Palette.muted).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(minHeight: 64)
        .contentShape(Rectangle())
    }
}

/// A day tile for choosing days (5.8): weekday over date, tomato when chosen, a dot when planned.
struct DayTile: View {
    let weekday: String
    let date: Int
    let on: Bool
    var planned = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(weekday).font(.system(size: 11, weight: .semibold))
                Text("\(date)").font(.system(size: 15, weight: .semibold)).monospacedDigit()
                Circle().fill(planned ? (on ? Palette.onAccent : Palette.faint) : .clear).frame(width: 4, height: 4)
            }
            .foregroundStyle(on ? Palette.onAccent : Palette.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(on ? Palette.accent : Palette.surface2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressFade())
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// The mockup's four-way choice in quiet tiles, the chosen one in the text colour (5.8).
struct ChoiceTiles<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(Value, String)]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(options, id: \.0) { value, title in
                let on = value == selection
                Button {
                    withAnimation(.snappy(duration: 0.18)) { selection = value }
                } label: {
                    Text(title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(on ? Palette.bg : Palette.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(on ? Palette.text : Palette.surface2, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressFade())
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

/// The quiet note when a page could not load, with a way to try again.
struct MealPlansLoadFailed: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Tile("icloud.slash", tone: .mustard, size: 48)
            Text(message).font(.system(size: 15)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            Button("Try again", action: retry).buttonStyle(.kitchen(.secondary, size: .small))
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.vertical, 32)
        .cardSurface()
    }
}

/// A centred "Loading…" line for a page that is on its way.
struct MealPlansLoading: View {
    let text: String

    var body: some View {
        VStack(spacing: 10) {
            ProgressView()
            Text(text).font(.system(size: 14)).foregroundStyle(Palette.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }
}

/// The bar along the bottom of a plan with its one big action (5.9, 5.10).
struct MealPlanBottomBar<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        HStack(spacing: 8) { content }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 8)
            .background(Palette.bg)
            .overlay(alignment: .top) { Rectangle().fill(Palette.border).frame(height: 1) }
    }
}

extension View {
    /// The mockup's toast at the foot of a screen, for a few seconds.
    func mealPlanToast(_ text: String?, bottom: CGFloat = 92) -> some View {
        overlay(alignment: .bottom) {
            if let text {
                RecipeToast(text: text).padding(.horizontal, 16).padding(.bottom, bottom)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: text)
    }
}

#Preview("Pieces") {
    ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 16) {
                PercentRing(percent: 87)
                PercentRing(percent: 40, tone: Palette.mustard)
                CupboardPill(percent: 100)
                CupboardPill(percent: 75)
            }
            ListGroup(dividerInset: 68) {
                MealRowView(title: "Chickpea & spinach curry", subtitle: "Dinner",
                            picture: PlanMealPicture(recipeId: UUID(), name: "Chickpea curry", section: .dinner, coverImageId: nil, meal: .dinner)) {
                    CupboardPill(percent: 100)
                    SwapButton(label: "Swap") {}
                }
                MealRowView(title: "Egg fried rice", subtitle: "Dinner",
                            picture: PlanMealPicture(recipeId: UUID(), name: "Egg fried rice", section: .dinner, coverImageId: nil, meal: .dinner)) {
                    ModelChoseMark()
                    CupboardPill(percent: 75)
                    SwapButton(label: "Swap", busy: true) {}
                }
            }
            HStack(spacing: 6) {
                DayTile(weekday: "Mon", date: 5, on: true, planned: true) {}
                DayTile(weekday: "Tue", date: 6, on: true) {}
                DayTile(weekday: "Wed", date: 7, on: false, planned: true) {}
                DayTile(weekday: "Thu", date: 8, on: false) {}
            }
            ChoiceTiles(selection: .constant(Optional(5)), options: [(0, "None"), (5, "5"), (10, "10"), (nil, "Any")])
            ModelChoseNote(chosen: 6, total: 8)
            ModelWords(text: "A cupboard-first few days with the spinach used up early. Comforting, simple dinners.")
            MealPlansLoadFailed(message: "Could not load meal plans.") {}
        }
        .padding(20)
    }
    .pageBackground()
}

#Preview("Pieces — dark") {
    VStack(spacing: 16) {
        PercentRing(percent: 87)
        ModelChoseNote(chosen: 8, total: 8)
        ChoiceTiles(selection: .constant(Optional(5)), options: [(0, "None"), (5, "5"), (10, "10"), (nil, "Any")])
    }
    .padding(20)
    .pageBackground()
    .preferredColorScheme(.dark)
}
