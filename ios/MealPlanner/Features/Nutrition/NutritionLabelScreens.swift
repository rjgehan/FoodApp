import SwiftUI

/*
 A label (the mockup's 5.5): a packet from its barcode, or an ingredient from the USDA's table,
 drawn the same way — per 100 g or per serving, where the calories come from, the details people
 check, and the claims it can make — with the cupboard and the grocery list one tap away.
*/

/// A packet, from a scan, a search or a recent lookup.
struct NutritionProductScreen: View {
    var session: Session
    let barcode: String
    var scanned = false
    /// Previews and the Gallery: this instead of the server (nil with `sampleMissing` for 404).
    var sample: ProductLabel?
    var sampleMissing = false
    /// Previews: a label as Apple Intelligence read it off a photo.
    var sampleReading: LabelReading?

    private enum Problem { case missing, busy, failed }

    @State private var product: ProductLabel?
    @State private var problem: Problem?
    @State private var reading: LabelReading?
    /// Why the last photo gave nothing, to say under the button.
    @State private var readingFailed: NutritionLabelReader.Outcome?
    @State private var reads = false
    @State private var photographing = false
    @State private var toast: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let product {
                    loaded(product)
                } else if let reading {
                    read(reading)
                } else if let problem {
                    trouble(problem)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 2)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .centeredTitle("")
        .textBackButton("Nutrition")
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if let product {
                BareToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: URL(string: product.attribution?.url ?? "https://world.openfoodfacts.org/product/\(product.barcode)")!,
                              message: Text("\(product.name): \(NutritionText.kcal(product.per100g.kcal)) kcal per 100\(product.liquid ? "ml" : "g")")) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 18, weight: .medium))
                            .foregroundStyle(Palette.accentInk)
                    }
                    .accessibilityLabel("Share")
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let name = product?.name ?? reading.map({ $0.name.isEmpty ? "Packet \(barcode)" : $0.name }) {
                KeepItBar(session: session, name: name) { say($0) }
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                RecipeToast(text: toast).padding(.horizontal, 16).padding(.bottom, 92)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
        .sheet(isPresented: $photographing) {
            CameraPicker { image in Task { await readLabel(image) } }.ignoresSafeArea()
        }
        .task { await load() }
    }

    // MARK: The label

    @ViewBuilder private func loaded(_ product: ProductLabel) -> some View {
        let unit = product.liquid ? "ml" : "g"
        let brandSays = product.brand.flatMap { b in product.name.lowercased().contains(b.lowercased()) ? nil : b }
        let about = [product.size, brandSays, scanned ? "scanned" : nil].compactMap { $0 }.filter { !$0.isEmpty }
            .joined(separator: " · ")
        LabelHeader(hue: .sky, symbol: "shippingbox", title: product.name,
                    subtitle: about.isEmpty ? "Barcode \(product.barcode)" : about)
        if product.hasNutrition {
            LabelBody(per100g: product.per100g, split: product.split, details: product.details, badges: product.badges,
                      liquid: product.liquid,
                      serving: product.servingGrams.map {
                          LabelServing(label: "Per serving (\(NutritionText.grams($0, unit: unit)))", grams: $0,
                                       values: product.perServing)
                      }) {
                if let score = product.nutriScore, !score.isEmpty {
                    Pill("Nutri-Score \(score.uppercased())", tone: ["a", "b"].contains(score) ? .herb : score == "c" ? .mustard : .accent)
                }
                SourcePill(attribution: product.attribution ?? .openFoodFacts, label: "Open Food Facts")
            }
        } else {
            NoteBox("This packet is in Open Food Facts, but nobody has added its nutrition facts yet.", tone: .mustard)
            SourcePill(attribution: product.attribution ?? .openFoodFacts, label: "Open Food Facts")
        }
        SourceNote(attribution: product.attribution ?? .openFoodFacts)
    }

    /// A label Apple Intelligence read off a photo, for a barcode nobody has added.
    @ViewBuilder private func read(_ r: LabelReading) -> some View {
        HStack(alignment: .top) {
            LabelHeader(hue: .sky, symbol: "shippingbox", title: r.name.isEmpty ? "Your packet" : r.name,
                        subtitle: "Barcode \(barcode) · read from your photo")
        }
        AppleIntelligenceMark(text: "Read by Apple Intelligence")
        LabelBody(per100g: r.per100g, split: Self.split(r.per100g), details: Self.details(r.per100g), badges: [],
                  serving: r.servingGrams.map { LabelServing(label: "Per serving (\(NutritionText.grams($0)))", grams: $0) },
                  startOnServing: false) { EmptyView() }
        NoteBox("Copied from your photo on this phone and checked to add up, but not saved anywhere. Check it against the packet.",
                tone: .sky)
    }

    @ViewBuilder private func trouble(_ problem: Problem) -> some View {
        VStack(spacing: 12) {
            RecipePhotoPlaceholder(hue: .sky, systemImage: "shippingbox", size: 64, radius: 16)
            Text(problem == .missing ? "Not in Open Food Facts" : problem == .busy ? "One moment" : "Couldn't look it up")
                .titleFont(26).foregroundStyle(Palette.text).multilineTextAlignment(.center)
            Text(problem == .missing
                 ? "Nobody has added \(barcode) to Open Food Facts yet. Search for the ingredient instead."
                 : problem == .busy ? "Open Food Facts has had a lot of questions from us this minute. Try again in a moment."
                 : "Can't reach Open Food Facts just now.")
                .font(.system(size: 15)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            if problem == .missing && reads {
                // iOS 27 with a model that can see: the label itself, read on the phone.
                Button { photographing = true } label: { Label("Read the label instead", systemImage: "camera.viewfinder") }
                    .buttonStyle(.kitchen(.primary, size: .small, fill: false))
                Text("Apple Intelligence copies the figures from a photo of the nutrition label, on this phone.")
                    .font(.system(size: 12)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
                if let readingFailed {
                    Text(readingFailed == .misread
                         ? "That photo didn't give figures that add up. Try again closer, flat and in good light."
                         : "Apple Intelligence couldn't read it just now. Try again in a moment.")
                        .font(.system(size: 13)).foregroundStyle(Palette.accentInk).multilineTextAlignment(.center)
                }
            }
            if problem != .missing {
                Button { Task { await load() } } label: { Label("Try again", systemImage: "arrow.clockwise") }
                    .buttonStyle(.kitchen(.secondary, size: .small, fill: false))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.top, 28)
        .padding(.bottom, 24)
        .cardSurface()
    }

    // MARK: Doing

    private func load() async {
        reads = NutritionAI.canReadLabels
        if sample != nil || sampleMissing || sampleReading != nil {
            product = sample
            problem = sampleMissing ? .missing : nil
            reading = sampleReading
            return
        }
        problem = nil
        do {
            let p = try await APIClient.shared.nutritionProduct(barcode: barcode)
            product = p
            if p.hasNutrition {
                try? await APIClient.shared.rememberLookup(kind: "PRODUCT", ref: p.barcode, label: p.name,
                                                           kcal: p.per100g.kcal, protein: p.per100g.protein)
            }
        } catch let error as APIError {
            problem = error.status == 404 || error.status == 400 ? .missing : error.status == 429 ? .busy : .failed
        } catch {
            problem = .failed
        }
        #if DEBUG
        // -mp_debug_label_photo <path>: read that picture as though it had just been taken, since a
        // screenshot run cannot work the camera.
        if problem == .missing, reads, let path = UserDefaults.standard.string(forKey: "mp_debug_label_photo"),
           let image = UIImage(contentsOfFile: path) {
            await readLabel(image)
        }
        #endif
    }

    private func readLabel(_ image: UIImage) async {
        readingFailed = nil
        switch await NutritionLabelReader.read(image) {
        case .read(let r): reading = r
        case let other: readingFailed = other
        }
    }

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(for: .seconds(3))
            if toast == text { toast = nil }
        }
    }

    /// The donut's shares for a reading: each macro's calories (4/4/9) of their total.
    static func split(_ v: NutrientValues) -> MacroSplit {
        let p = 4 * (v.protein ?? 0), c = 4 * (v.carbs ?? 0), f = 9 * (v.fat ?? 0)
        let total = p + c + f
        guard total > 0 else { return .empty }
        let pp = Int((100 * p / total).rounded()), cc = Int((100 * c / total).rounded())
        return MacroSplit(protein: pp, carbs: cc, fat: max(0, 100 - pp - cc))
    }

    static func details(_ v: NutrientValues) -> [LabelDetail] {
        [("sugars", "Sugars", v.sugars), ("fibre", "Fibre", v.fibre), ("salt", "Salt", v.saltG), ("satFat", "Saturates", v.satFat)]
            .compactMap { key, label, value in value.map { LabelDetail(key: key, label: label, amount: $0, unit: "g", percentDaily: nil) } }
    }
}

/// An ingredient from the USDA's FoodData Central.
struct NutritionFoodScreen: View {
    var session: Session
    let fdcId: Int
    var sample: FoodLabel?

    @State private var food: FoodLabel?
    @State private var failed: String?
    @State private var toast: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let food {
                    let named = NutritionText.foodTitle(food.name)
                    LabelHeader(hue: .herb, symbol: "leaf", title: named.title,
                                subtitle: named.detail.isEmpty ? (food.category ?? "") : NutritionText.capitalised(named.detail))
                    LabelBody(per100g: food.per100g, split: food.split, details: food.details, badges: food.badges,
                              serving: food.portions.first.map {
                                  LabelServing(label: "\(NutritionText.capitalised($0.label)) (\(NutritionText.grams($0.grams)))", grams: $0.grams)
                              },
                              startOnServing: false) {
                        SourcePill(attribution: food.attribution ?? .usda, label: "USDA FoodData Central")
                    }
                    SourceNote(attribution: food.attribution ?? .usda)
                } else if let failed {
                    Text(failed).font(.system(size: 14)).foregroundStyle(Palette.muted)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(16).cardSurface()
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 2)
            .padding(.bottom, 24)
        }
        .pageBackground()
        .centeredTitle("")
        .textBackButton("Nutrition")
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if let food {
                BareToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: URL(string: "https://fdc.nal.usda.gov/food-details/\(food.fdcId)/nutrients")!,
                              message: Text("\(NutritionText.foodTitle(food.name).title): \(NutritionText.kcal(food.per100g.kcal)) kcal per 100g")) {
                        Image(systemName: "square.and.arrow.up").font(.system(size: 18, weight: .medium))
                            .foregroundStyle(Palette.accentInk)
                    }
                    .accessibilityLabel("Share")
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let food {
                KeepItBar(session: session, name: NutritionText.foodTitle(food.name).title) { say($0) }
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                RecipeToast(text: toast).padding(.horizontal, 16).padding(.bottom, 92)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: toast)
        .task { await load() }
    }

    private func load() async {
        if let sample { food = sample; return }
        do {
            let f = try await APIClient.shared.food(fdcId)
            food = f
            try? await APIClient.shared.rememberLookup(kind: "FOOD", ref: String(f.fdcId))
        } catch let error as APIError where error.status == 404 {
            failed = "That ingredient is not in the food data."
        } catch {
            failed = "Could not look that up."
        }
    }

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(for: .seconds(3))
            if toast == text { toast = nil }
        }
    }
}

/// The picture, name and one line about it: "500g tub · scanned".
struct LabelHeader: View {
    let hue: Hue
    let symbol: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            RecipePhotoPlaceholder(hue: hue, systemImage: symbol, size: 64, radius: 16)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).titleFont(24).foregroundStyle(Palette.text).fixedSize(horizontal: false, vertical: true)
                if !subtitle.isEmpty {
                    Text(subtitle).font(.system(size: 13)).foregroundStyle(Palette.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// The source as a pill among the claims (5.5's "Open Food Facts"), opening where it came from.
struct SourcePill: View {
    let attribution: NutritionAttribution
    let label: String

    var body: some View {
        if let link = attribution.link {
            Link(destination: link) { Pill(label, tone: .mustard, systemImage: "info.circle") }
                .accessibilityLabel("\(attribution.text) — open the source")
        } else {
            Pill(label, tone: .mustard, systemImage: "info.circle")
        }
    }
}

/**
 The cupboard and the grocery list (5.5's bottom bar): the two places a thing you have just
 looked up can go. Both take the name as the list would say it.
 */
struct KeepItBar: View {
    var session: Session
    let name: String
    var onDone: (String) -> Void

    @State private var busy = false

    var body: some View {
        NutritionBottomBar {
            Button { Task { await add(toCupboard: true) } } label: {
                Label("Cupboard", systemImage: "cabinet").frame(maxWidth: .infinity)
            }
            .buttonStyle(.kitchen(.secondary))
            .accessibilityLabel("Add to the cupboard")
            Button { Task { await add(toCupboard: false) } } label: {
                Label("Add to list", systemImage: "cart").frame(maxWidth: .infinity)
            }
            .buttonStyle(.kitchen(.primary))
            .accessibilityLabel("Add to the grocery list")
        }
        .disabled(busy || session.household == nil)
    }

    private func add(toCupboard: Bool) async {
        guard let household = session.household?.id, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            if toCupboard {
                try await APIClient.shared.addToCupboard(household: household, name: name)
                onDone("Added \(name) to the cupboard")
            } else {
                _ = try await APIClient.shared.addGroceryItem(household: household, name: name, quantity: nil, unit: nil)
                onDone("Added \(name) to the list")
            }
        } catch {
            onDone(toCupboard ? "Could not add that to the cupboard" : "Could not add that to the list")
        }
    }
}

#Preview("A packet") {
    NavigationStack {
        NutritionProductScreen(session: .preview, barcode: NutritionSamples.yogurt.barcode, scanned: true,
                               sample: NutritionSamples.yogurt)
    }
}

#Preview("A packet — dark") {
    NavigationStack {
        NutritionProductScreen(session: .preview, barcode: NutritionSamples.yogurt.barcode, scanned: true,
                               sample: NutritionSamples.yogurt)
    }
    .preferredColorScheme(.dark)
}

#Preview("A packet nobody has added") {
    NavigationStack { NutritionProductScreen(session: .preview, barcode: "4006381333931", sampleMissing: true) }
}

#Preview("A label read by Apple Intelligence") {
    NavigationStack {
        NutritionProductScreen(session: .preview, barcode: "4006381333931", sampleReading: NutritionSamples.readLabel)
    }
}

#Preview("An ingredient") {
    NavigationStack { NutritionFoodScreen(session: .preview, fdcId: 173757, sample: NutritionSamples.chickpeas) }
}

#Preview("An ingredient — dark") {
    NavigationStack { NutritionFoodScreen(session: .preview, fdcId: 173757, sample: NutritionSamples.chickpeas) }
        .preferredColorScheme(.dark)
}
