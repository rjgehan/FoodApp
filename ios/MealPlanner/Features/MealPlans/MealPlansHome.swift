import SwiftUI

/**
 Meal plans (the mockup's 5.7). On top, the tomato card that builds the next few days from what
 is already in the cupboard. Below, plans for health targets: the ready-made ones as picture
 cards, and your own under "Made by you" — those are private, so only you ever see them here.

 The whole page is one request, so the cupboard's count and the cards always agree. The same
 page as the web's, on the same answer.
 */
struct MealPlansScreen: View {
    var session: Session
    @Binding var path: NavigationPath
    /// Previews and the Gallery: this instead of the server.
    var sample: MealPlansHome?

    @State private var home: MealPlansHome?
    @State private var failed = false
    @State private var filter = "all"

    private var shown: [TargetPlanCard] {
        (home?.plans ?? []).filter { filter == "all" || $0.tags.contains(filter) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if failed && home == nil {
                    MealPlansLoadFailed(message: "Could not load meal plans.") { Task { await load() } }
                } else {
                    NavigationLink(value: MealPlansRoute.cupboard) {
                        CupboardCard(cupboard: home?.cupboard)
                    }
                    .buttonStyle(PressFade())

                    SectionHead("Plans for health targets") {
                        NavigationLink(value: MealPlansRoute.newPlan) {
                            Text("Create").font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.accentInk)
                        }
                    }
                    .padding(.top, 4)
                    if let home {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(home.filters, id: \.key) { f in
                                    Chip(f.label, isOn: f.key == filter) { filter = f.key }
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                        .padding(.horizontal, -20)
                        plans
                    } else {
                        MealPlansLoading(text: "Loading plans…").padding(.top, -40)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .centeredTitle("Meal plans")
        .textBackButton("Explore")
        .toolbar {
            BareToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: MealPlansRoute.newPlan) {
                    Image(systemName: "plus").font(.system(size: 20, weight: .medium)).foregroundStyle(Palette.accentInk)
                }
                .accessibilityLabel("New meal plan")
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .task { await load() }
        .refreshable { await load() }
        // Back from a plan or the cupboard: a plan may have been kept, renamed or deleted.
        .onChange(of: path.count) { old, new in
            if new < old { Task { await load() } }
        }
    }

    @ViewBuilder private var plans: some View {
        let readyMade = shown.filter { !$0.mine }
        let mine = shown.filter(\.mine)
        if !readyMade.isEmpty {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                      alignment: .leading, spacing: 12) {
                ForEach(readyMade, id: \.key) { card in
                    NavigationLink(value: route(card)) { PlanCardView(card: card) }
                        .buttonStyle(PressFade())
                }
            }
        }
        if !mine.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Made by you")
                ListGroup(dividerInset: 68) {
                    ForEach(mine, id: \.key) { card in
                        NavigationLink(value: route(card)) {
                            ListRow(card.name,
                                    subtitle: "\(NutritionText.kcal(Double(card.kcal))) kcal · \(card.protein)g protein · \(card.length) \(card.length == 1 ? "day" : "days")",
                                    chevron: true,
                                    leading: { Avatar(session.displayName ?? card.name, tone: .accent, size: 40) },
                                    trailing: { EmptyView() })
                        }
                        .buttonStyle(PressFade())
                    }
                }
            }
            .padding(.top, 4)
        }
        if shown.isEmpty {
            Text("No plans for that yet.").font(.system(size: 14)).foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity).padding(.vertical, 24).cardSurface()
        }
    }

    private func route(_ card: TargetPlanCard) -> MealPlansRoute {
        if let id = card.id { return .plan(id) }
        return .preset(card.preset ?? "")
    }

    private func load() async {
        if let sample { home = sample; return }
        guard let household = session.household?.id else { return }
        do {
            home = try await APIClient.shared.mealPlansHome(household: household)
            failed = false
        } catch is CancellationError {
        } catch {
            failed = true
        }
    }
}

/**
 Cook from your cupboard (5.7): the tomato card at the top of Meal plans, with how much is in
 the cupboard, a few of the things (those wanting using first), and the way in.
 */
struct CupboardCard: View {
    let cupboard: CupboardTeaser?

    var body: some View {
        let chips = Array((cupboard?.highlights ?? []).prefix(4))
        let more = (cupboard?.items ?? 0) - chips.count
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "cabinet").font(.system(size: 21, weight: .regular))
                Text("Cook from your cupboard").titleFont(22).lineLimit(1).minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Text(cupboard.map { MealPlanText.cupboardLine(items: $0.items, useSoon: $0.useSoon) } ?? " ")
                .font(.system(size: 14)).lineSpacing(2).opacity(0.92)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if !chips.isEmpty {
                ChipFlow(spacing: 6) {
                    ForEach(chips, id: \.self) { chip($0) }
                    if more > 0 { chip("+ \(more)") }
                }
            }
            Label("Generate a plan", systemImage: "sparkles")
                .font(.system(size: 17, weight: .semibold))
                .labelStyle(.titleAndIcon)
                .foregroundStyle(Palette.accentInk)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .foregroundStyle(Palette.onAccent)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.accent, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: Palette.shadow, radius: 4, y: 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Cook from your cupboard. " + (cupboard.map { MealPlanText.cupboardLine(items: $0.items, useSoon: $0.useSoon) } ?? ""))
        .accessibilityHint("Generate a plan")
    }

    private func chip(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .semibold))
            .padding(.horizontal, 10).padding(.vertical, 3)
            .background(.white.opacity(0.2), in: Capsule())
    }
}

/// A plan for a health target as a card (5.7): its colour and mark, name, goal and length, its numbers.
struct PlanCardView: View {
    let card: TargetPlanCard

    var body: some View {
        let tone = MealPlanLook.tone(card.hue)
        VStack(alignment: .leading, spacing: 10) {
            RecipePhotoPlaceholder(hue: MealPlanLook.hue(card.hue), systemImage: MealPlanLook.symbol(card.icon), radius: 0)
                .frame(height: 90)
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(card.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text)
                        .lineLimit(2).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    Text(card.subtitle).font(.system(size: 12)).foregroundStyle(Palette.muted).lineLimit(1)
                }
                HStack(spacing: 6) {
                    Pill("\(NutritionText.kcal(Double(card.kcal))) kcal", tone: tone)
                    if card.showsProtein { Pill("\(card.protein)g P", tone: tone) }
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 14)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .cardSurface()
        .accessibilityElement(children: .combine)
    }
}

/**
 Meal plans' door on Explore (5.1): its tile, name and line, chips straight into cooking from the
 cupboard and into a couple of plans (your own first), and a line on what the cupboard holds.
 */
struct MealPlansDoor: View {
    let home: MealPlansHome?
    /// Opens one of the chips; the door itself opens Meal plans.
    var open: (MealPlansRoute) -> Void = { _ in }

    var body: some View {
        let plans = Array((home?.plans ?? []).prefix(2))
        Card(padding: 16, spacing: 12) {
            Button { open(.home) } label: {
                HStack(spacing: 12) {
                    Tile("target", tone: .plum, size: 44)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Meal plans").titleFont(20).foregroundStyle(Palette.text)
                        Text("From your cupboard, or built for a goal").font(.system(size: 13))
                            .foregroundStyle(Palette.muted).multilineTextAlignment(.leading)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.faint)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressFade())
            .accessibilityLabel("Meal plans")
            ChipFlow(spacing: 8) {
                doorChip("Cook from cupboard", "cabinet") { open(.cupboard) }
                ForEach(plans, id: \.key) { p in
                    doorChip(p.name, MealPlanLook.symbol(p.icon)) {
                        if let id = p.id { open(.plan(id)) } else if let key = p.preset { open(.preset(key)) }
                    }
                }
            }
            Text(home.map { MealPlanText.doorLine($0.cupboard) } ?? " ")
                .font(.system(size: 12)).foregroundStyle(Palette.muted)
        }
    }

    private func doorChip(_ title: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 13, weight: .medium))
                Text(title).lineLimit(1)
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Palette.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Palette.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(Palette.border, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(PressFade())
    }
}

#Preview("Meal plans") {
    @Previewable @State var path = NavigationPath()
    NavigationStack { MealPlansScreen(session: .preview, path: $path, sample: MealPlanSamples.home) }
}

#Preview("Meal plans — dark") {
    @Previewable @State var path = NavigationPath()
    NavigationStack { MealPlansScreen(session: .preview, path: $path, sample: MealPlanSamples.home) }
        .preferredColorScheme(.dark)
}

#Preview("Door") {
    MealPlansDoor(home: MealPlanSamples.home).padding(20).pageBackground()
}
