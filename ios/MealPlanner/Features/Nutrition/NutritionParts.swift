import SwiftUI

/*
 The Nutrition screens' own pieces (the mockup's 5.4–5.6, and the numbers on Explore's door):
 the number tiles, the kcal ring and macro donut, the bars against a day's worth, the week chart,
 a label's body, the source line and the Apple Intelligence mark. Built on the design system's
 tokens, so every theme and both modes come for free — the same pieces the web draws in
 NutritionParts.tsx.
 */

extension Macro {
    /// Protein herb, carbs sky, fat mustard: the same three colours everywhere a macro is drawn.
    var tone: Tone {
        switch self {
        case .protein: return .herb
        case .carbs: return .sky
        case .fat: return .mustard
        }
    }
}

/// One number in a bordered tile (the mockup's `stat`): "118g" over "PROTEIN".
struct NutritionStat: View {
    let value: String
    let label: String
    /// Nil for the text colour.
    var tone: Tone?

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .titleFont(22)
                .monospacedDigit()
                .foregroundStyle(tone?.ink ?? Palette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.55)
                .foregroundStyle(Palette.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/// The kcal in the middle of a ring or donut: a serif number over small capitals.
private struct KcalCentre: View {
    let kcal: Double?
    var size: CGFloat = 26

    var body: some View {
        VStack(spacing: 2) {
            Text(NutritionText.kcal(kcal)).titleFont(size).monospacedDigit().foregroundStyle(Palette.text)
                .lineLimit(1).minimumScaleFactor(0.6)
            Text("KCAL").font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 8)
    }
}

/// How much of a day one thing is (5.6): an arc of the accent on a quiet track, the kcal inside.
struct KcalRing: View {
    let share: Double
    let kcal: Double?
    var size: CGFloat = 108
    var stroke: CGFloat = 11

    var body: some View {
        let part = max(0, min(share, 1))
        ZStack {
            Circle().stroke(Palette.surface2, lineWidth: stroke)
            if part > 0 {
                Circle()
                    .trim(from: 0, to: part)
                    .stroke(Palette.accent, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            KcalCentre(kcal: kcal, size: 24)
        }
        .padding(stroke / 2)
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(NutritionText.kcal(kcal)) kcal, \(Int((part * 100).rounded())) percent of a day")
    }
}

/// Where the calories come from (5.5): protein, carbs and fat as three arcs round the kcal.
struct MacroDonut: View {
    let split: MacroSplit
    let kcal: Double?
    var size: CGFloat = 124
    var stroke: CGFloat = 14

    var body: some View {
        let circumference = Double.pi * Double(size - stroke)
        // A 3pt gap between the arcs, as the mockup draws them.
        let gap = 3 / circumference
        ZStack {
            if split.isEmpty {
                Circle().stroke(Palette.surface2, lineWidth: stroke)
            } else {
                ForEach(Array(arcs.enumerated()), id: \.offset) { _, arc in
                    Circle()
                        .trim(from: arc.from, to: max(arc.from, arc.to - gap))
                        .stroke(arc.tone.ink, lineWidth: stroke)
                        .rotationEffect(.degrees(-90))
                }
            }
            KcalCentre(kcal: kcal)
        }
        .padding(stroke / 2)
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var arcs: [(from: Double, to: Double, tone: Tone)] {
        var start = 0.0
        return Macro.allCases.map { macro in
            let part = Double(split[macro]) / 100
            defer { start += part }
            return (start, min(1, start + part), macro.tone)
        }
    }
}

/// The donut's key: each macro's dot, name, grams and share.
struct MacroLegend: View {
    let values: NutrientValues
    let split: MacroSplit

    var body: some View {
        VStack(spacing: 10) {
            ForEach(Macro.allCases) { macro in
                HStack(spacing: 8) {
                    Circle().fill(macro.tone.ink).frame(width: 10, height: 10)
                    Text(macro.label).font(.system(size: 14)).foregroundStyle(Palette.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(NutritionText.grams(values[macro])).font(.system(size: 14, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(Palette.text)
                    Text("\(split[macro])%").font(.system(size: 12)).monospacedDigit().foregroundStyle(Palette.muted)
                        .frame(width: 34, alignment: .trailing)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// "Protein 41g / 160g" with a bar of how far along the day's worth that is (5.6).
struct MacroBar: View {
    let macro: Macro
    let value: Double?
    let goal: Double

    var body: some View {
        let part = value.map { goal > 0 ? min($0 / goal, 1) : 0 } ?? 0
        VStack(spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(macro.label).font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.text)
                Spacer(minLength: 8)
                (Text(NutritionText.grams(value)).fontWeight(.semibold).foregroundColor(Palette.text)
                    + Text(" / \(NutritionText.grams(goal))").foregroundColor(Palette.muted))
                    .font(.system(size: 14))
                    .monospacedDigit()
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(Palette.surface2)
                    RoundedRectangle(cornerRadius: 3).fill(macro.tone.ink)
                        .frame(width: max(part > 0 ? 8 : 0, geo.size.width * part))
                }
            }
            .frame(height: 8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(macro.label), \(NutritionText.grams(value)) of a day's \(NutritionText.grams(goal))")
    }
}

/**
 The week as bars, a day each (5.4): today in the accent, the rest herb, a day with nothing
 counted as a flat stub. Tall enough to compare days, not to read numbers off — those are in
 each bar's spoken label.
 */
struct WeekChart: View {
    let days: [PlanNutritionDay]
    let today: String

    var body: some View {
        let top = max(2600, days.map { $0.totals.kcal ?? 0 }.max() ?? 0)
        HStack(alignment: .bottom, spacing: 0) {
            ForEach(days) { day in
                let kcal = day.totals.kcal ?? 0
                VStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(!day.counted ? Palette.border : day.date == today ? Palette.accent : Palette.herb)
                        .frame(width: 22, height: day.counted ? max(6, kcal / top * 88) : 4)
                    Text(String(NutritionText.weekday(day.date).prefix(1)))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Palette.muted)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken(day))
            }
        }
        .frame(height: 110, alignment: .bottom)
        .padding(.horizontal, 4)
    }

    private func spoken(_ day: PlanNutritionDay) -> String {
        let name = NutritionText.weekday(day.date, short: false)
        let meals = day.mealsPlanned == 0 ? "nothing planned"
            : "\(day.mealsCounted) of \(day.mealsPlanned) \(day.mealsPlanned == 1 ? "meal" : "meals") counted"
        return "\(name): \(day.counted ? "\(NutritionText.kcal(day.totals.kcal)) kcal" : "no calories counted"), \(meals)"
    }
}

/**
 The line that says where the numbers come from, small at the foot of a page: the USDA's citation
 for ingredient data, Open Food Facts' ODbL notice for a packet's. Each links to its source, as
 both ask.
 */
struct SourceNote: View {
    let attribution: NutritionAttribution

    var body: some View {
        let licence = attribution.text.contains(attribution.licence.split(separator: " ").first.map(String.init) ?? "")
            ? "" : " \(attribution.licence)."
        Group {
            if let link = attribution.link {
                Link(destination: link) {
                    (Text(attribution.text).underline() + Text(licence))
                        .multilineTextAlignment(.leading)
                }
            } else {
                Text(attribution.text + licence)
            }
        }
        .font(.system(size: 12))
        .foregroundStyle(Palette.faint)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
    }
}

/// A lookup's mark: a packet (sky box), an ingredient (herb leaf), or the recipe's own colour.
struct LookupMark: View {
    /// FOOD, PRODUCT or RECIPE.
    let kind: String
    let seed: String
    var size: CGFloat = 40

    var body: some View {
        switch kind {
        case "RECIPE": RecipePhotoPlaceholder(hue: .of(seed), systemImage: "frying.pan", size: size, radius: 12)
        case "PRODUCT": Tile("shippingbox", tone: .sky, size: size, radius: 12)
        default: Tile("leaf", tone: .herb, size: size, radius: 12)
        }
    }
}

/**
 "✨ Apple Intelligence": wherever the phone's model chose something — a food, a weight, the
 words about a serving, a label it read — so it can always be told apart from the server's own.
 */
struct AppleIntelligenceMark: View {
    var text = "Apple Intelligence"

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "sparkles").font(.system(size: 10, weight: .bold))
            Text(text)
        }
        .font(.system(size: 11, weight: .semibold))
        .lineLimit(1)
        .foregroundStyle(Palette.plum)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Palette.plumSoft, in: Capsule())
        .fixedSize()
        .accessibilityLabel("Chosen by Apple Intelligence")
    }
}

/// A claim's pill on a label: good herb, info sky, a warning mustard.
struct BadgePill: View {
    let badge: LabelBadge

    var body: some View {
        switch badge.tone {
        case "warn": Pill(badge.label, tone: .mustard, systemImage: "exclamationmark.triangle")
        case "info": Pill(badge.label, tone: .sky, systemImage: "checkmark")
        default: Pill(badge.label, tone: .herb, systemImage: "checkmark")
        }
    }
}

/// The other side of a label's switch: a packet's serving, or a food's household measure.
struct LabelServing: Hashable {
    let label: String
    let grams: Double
    /// The packet's own per-serving figures, where it prints them; else per 100 g scaled.
    var values: NutrientValues?
}

/**
 The body of a label (5.5), for a packet or an ingredient alike: per 100 g or per serving, the
 macro donut with its key, the details people check, and the claims it can make.
 */
struct LabelBody<Extra: View>: View {
    let per100g: NutrientValues
    let split: MacroSplit
    let details: [LabelDetail]
    let badges: [LabelBadge]
    var liquid = false
    var serving: LabelServing?
    @ViewBuilder var extra: Extra

    @State private var perServing: Bool

    init(per100g: NutrientValues, split: MacroSplit, details: [LabelDetail], badges: [LabelBadge],
         liquid: Bool = false, serving: LabelServing?, startOnServing: Bool = true,
         @ViewBuilder extra: () -> Extra) {
        self.per100g = per100g
        self.split = split
        self.details = details
        self.badges = badges
        self.liquid = liquid
        self.serving = serving
        self.extra = extra()
        _perServing = State(initialValue: serving != nil && startOnServing)
    }

    var body: some View {
        let scale = perServing ? (serving?.grams ?? 100) / 100 : 1
        let values = perServing ? (serving?.values ?? per100g.scaled(scale)) : per100g
        VStack(alignment: .leading, spacing: 14) {
            if let serving {
                SegmentedControl(selection: $perServing,
                                 options: [(false, "Per 100\(liquid ? "ml" : "g")"), (true, serving.label)])
            }
            HStack(spacing: 16) {
                MacroDonut(split: split, kcal: values.kcal)
                MacroLegend(values: values, split: split)
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .cardSurface()
            if !details.isEmpty {
                ListGroup {
                    ForEach(details, id: \.key) { d in
                        HStack {
                            Text(d.label).font(.system(size: 16)).foregroundStyle(Palette.text)
                            Spacer(minLength: 8)
                            Text(NutritionText.detail(d, scale: scale)).font(.system(size: 15)).monospacedDigit()
                                .foregroundStyle(Palette.muted)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .frame(minHeight: 44)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            ChipFlow(spacing: 8) {
                ForEach(badges, id: \.key) { BadgePill(badge: $0) }
                extra
            }
        }
    }
}

/// The two places a thing you have just looked up can go (5.5's bottom bar).
struct NutritionBottomBar<Content: View>: View {
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

#Preview("Pieces") {
    ScrollView {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 8) {
                NutritionStat(value: "2,140", label: "kcal / day")
                NutritionStat(value: "118g", label: "Protein", tone: .herb)
                NutritionStat(value: "24g", label: "Fibre", tone: .mustard)
            }
            HStack(spacing: 16) {
                KcalRing(share: 0.24, kcal: 512)
                MacroDonut(split: MacroSplit(protein: 68, carbs: 26, fat: 6), kcal: 97)
            }
            MacroBar(macro: .protein, value: 41, goal: 160)
            WeekChart(days: NutritionSamples.week.days, today: NutritionSamples.week.days[0].date)
            HStack { AppleIntelligenceMark(); BadgePill(badge: LabelBadge(key: "p", label: "High protein", tone: "good")) }
            SourceNote(attribution: .usda)
        }
        .padding(20)
    }
    .pageBackground()
}

#Preview("Pieces — dark") {
    VStack(alignment: .leading, spacing: 18) {
        KcalRing(share: 0.24, kcal: 512)
        MacroLegend(values: NutrientValues(kcal: 97, protein: 17, carbs: 6, fat: 0.7),
                    split: MacroSplit(protein: 68, carbs: 26, fat: 6))
        AppleIntelligenceMark()
    }
    .padding(20)
    .pageBackground()
    .preferredColorScheme(.dark)
}
