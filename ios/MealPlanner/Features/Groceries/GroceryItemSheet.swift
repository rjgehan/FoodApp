import SwiftUI

/**
 One grocery item (mockup 4.2): which aisle it goes in, a restock reminder, what it last cost,
 what the cupboard says (in a house that keeps one), and taking it off the list. Each takes effect
 as it is tapped — there is no Save — because each is one decision about one thing. A price typed
 in by hand is the one exception: it opens under its row with its own Save.

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
    /// A price typed in: the row as the server now has it, with its new `lastPrice`.
    var onPriced: (GroceryItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var aisle: UUID?
    @State private var current: RestockReminder?
    @State private var error: String?
    /// The content's own height: the sheet hugs "Remove from list", edge to edge, as the mockup's does.
    @State private var height: CGFloat = 540
    /// The Price row is open for a price to be typed in.
    @State private var pricing = false
    @State private var priceText = ""
    @State private var shopText = ""
    @State private var brandText = ""
    @State private var sizeText = ""
    @State private var savingPrice = false
    @FocusState private var priceFocused: Bool
    /// What it last cost at each shop it has been bought from, newest first. Fetched when the
    /// sheet opens: the list itself only carries the newest price of all.
    @State private var byShop: [LastPrice] = []

    init(item: GroceryItem, categories: [GroceryCategory], reminder: RestockReminder?, stock: CupboardItem?,
         session: Session, sample: Bool = false, onMove: @escaping (UUID) -> Void,
         onReminder: @escaping (RestockReminder?) -> Void, onRemove: @escaping () -> Void,
         onPriced: @escaping (GroceryItem) -> Void = { _ in }) {
        self.item = item
        self.categories = categories
        self.reminder = reminder
        self.stock = stock
        self.session = session
        self.sample = sample
        self.onMove = onMove
        self.onReminder = onReminder
        self.onRemove = onRemove
        self.onPriced = onPriced
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
                    if item.ingredientId != nil {
                        Button(action: togglePricing) {
                            ListRow("Price", subtitle: item.lastPrice?.line ?? "No price yet", wrapSubtitle: true,
                                    leading: { Tile("dollarsign", tone: .herb, size: 34) }) {
                                Text(priceAction)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(Palette.accentInk)
                            }
                        }
                        .buttonStyle(.plain)
                        if pricing {
                            priceEditor
                        }
                        if !byShop.isEmpty {
                            shopPrices
                        }
                    }
                    if session.cupboardOn {
                        ListRow("Cupboard", subtitle: GroceryWords.cupboardState(stock),
                                leading: { Tile("cabinet", tone: .sky, size: 34) }) { EmptyView() }
                    }
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
        // A drag puts the keyboard away: the price's decimal pad has no key that does.
        .scrollDismissesKeyboard(.interactively)
        .tint(Palette.herb)
        .kitchenSheet([.height(height)])
        .task { await loadByShop() }
    }

    /**
     "Last paid at each shop": one line per shop, the newest price there, what size it was and what
     that comes to per egg, lb or fl oz, the day and whether it was on sale. The cheapest is marked
     by that per-one price, never the total — 12 eggs for less is not cheaper than 18 for a little
     more — so only when every shop's price has a size that compares with the others; otherwise a
     line says what is missing.
     */
    private var shopPrices: some View {
        let priced = byShop.map(\.priced)
        let cheapest = UnitPrice.cheapest(priced)
        let rates = UnitPrice.rates(priced)
        return VStack(alignment: .leading, spacing: 8) {
            Text("Last paid at each shop").font(.label).foregroundStyle(Palette.muted)
            ForEach(Array(byShop.enumerated()), id: \.offset) { index, price in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(shopName(price))
                        .font(.system(size: 15))
                        .foregroundStyle(Palette.text)
                        .lineLimit(1)
                    if index == cheapest {
                        Pill("Cheapest", tone: .herb)
                    }
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(Money.text(price.price))
                            .font(.system(size: 15, weight: .semibold).monospacedDigit())
                            .foregroundStyle(Palette.text)
                        Text(shopDetail(price, rate: rates[index]))
                            .font(.system(size: 12))
                            .foregroundStyle(price.onSale == true ? Palette.herb : Palette.muted)
                    }
                }
                .accessibilityElement(children: .combine)
            }
            if let why = noCheapestWords(priced, cheapest: cheapest) {
                Text(why)
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.leading, 62)
        .padding(.trailing, 16)
        .padding(.vertical, 12)
    }

    private func shopName(_ price: LastPrice) -> String {
        let name = price.storeName?.trimmingCharacters(in: .whitespaces) ?? ""
        return name.isEmpty ? "No shop given" : name
    }

    /// "Twinings, 20 bags · $0.21 each · Oct 18 · on sale", or "no size" in place of the size when
    /// there are shops to compare and this one's price says nothing about how much it was for.
    private func shopDetail(_ price: LastPrice, rate: UnitPrice.Rate?) -> String {
        var parts: [String] = []
        if let what = ReceiptWords.what(brand: price.brand, quantity: price.quantity, unit: price.unit) {
            parts.append(what)
        }
        if let rate {
            parts.append(rateWords(rate))
        } else if byShop.count > 1 {
            parts.append("no size")
        }
        if let day = ReceiptWords.day(price.observedOn) { parts.append(day) }
        if price.onSale == true { parts.append("on sale") }
        return parts.joined(separator: " · ")
    }

    /// "$0.36 each", "$3.99/lb".
    private func rateWords(_ rate: UnitPrice.Rate) -> String {
        if rate.per == "each" { return "\(Money.rate(rate.price)) each" }
        return "\(Money.rate(rate.price))/\(rate.per)"
    }

    /// Why no shop is marked cheapest, when there are shops to compare and none is.
    private func noCheapestWords(_ priced: [UnitPrice.Priced], cheapest: Int?) -> String? {
        guard priced.count > 1, cheapest == nil else { return nil }
        if priced.contains(where: { UnitPrice.measure($0) == nil }) {
            return "To see which shop is cheapest, each price needs its size — 12 eggs, 16 oz. Add it on the receipt it came from, or Change the price with its size."
        }
        if UnitPrice.sharedKind(priced) == nil {
            return "These sizes don't compare (a weight and a count), so no shop is marked cheapest."
        }
        return nil
    }

    private func loadByShop() async {
        guard let ingredient = item.ingredientId else { return }
        if sample {
            byShop = SampleData.pricesByShop
            return
        }
        guard let household = session.household?.id else { return }
        if let prices = try? await APIClient.shared.pricesByShop(household: household, ingredient: ingredient) {
            withAnimation(.snappy(duration: 0.2)) { byShop = prices }
        }
    }

    /// The Price row's own button. Spelled out as a String, so Text is not left to choose an
    /// initializer for two ternaries.
    private var priceAction: String {
        if pricing { return "Cancel" }
        return item.lastPrice == nil ? "Add" : "Change"
    }

    /**
     A price typed in by hand: what it cost, and where (the last shop, to start with). Saved as
     today's price for the ingredient, the same as a receipt line would be.
     */
    private var priceEditor: some View {
        // The price and its Save go last, side by side: the price's decimal pad has no return key,
        // and the sheet scrolls the box being typed in to just above the keyboard — so everything
        // to fill in sits above it, where the keyboard never covers it.
        let sizeIsAmount = ReceiptWords.amount(from: sizeText) != nil
        return VStack(alignment: .leading, spacing: 10) {
            Text(sizeIsAmount ? "Kept as today's price" : "Start the size with a number — 20 bags, 5 oz.")
                .font(.system(size: 12))
                .foregroundStyle(sizeIsAmount ? Palette.muted : Palette.danger)
            HStack(spacing: 8) {
                TextField("", text: $sizeText, prompt: Text("Size — 20 bags").foregroundStyle(Palette.faint))
                    .font(.system(size: 15))
                    .foregroundStyle(Palette.text)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding(.horizontal, 12)
                    .frame(height: 44)
                    .fieldSurface(radius: 12)
                    .accessibilityLabel("How much it was for")
                TextField("", text: $brandText, prompt: Text("Brand").foregroundStyle(Palette.faint))
                    .font(.system(size: 15))
                    .foregroundStyle(Palette.text)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 12)
                    .frame(height: 44)
                    .fieldSurface(radius: 12)
                    .accessibilityLabel("Brand")
            }
            TextField("", text: $shopText, prompt: Text("Shop (optional)").foregroundStyle(Palette.faint))
                .font(.system(size: 15))
                .foregroundStyle(Palette.text)
                .padding(.horizontal, 12)
                .frame(height: 44)
                .fieldSurface(radius: 12)
                .accessibilityLabel("Shop")
            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    Text(Money.symbol).foregroundStyle(Palette.muted)
                    TextField("", text: $priceText, prompt: Text("0.00").foregroundStyle(Palette.faint))
                        .keyboardType(.decimalPad)
                        .focused($priceFocused)
                        .foregroundStyle(Palette.text)
                        .accessibilityLabel("Price")
                }
                .font(.system(size: 16).monospacedDigit())
                .padding(.horizontal, 12)
                .frame(width: 112, height: 44)
                .fieldSurface(focused: priceFocused, radius: 12)
                Spacer(minLength: 8)
                let saveTitle: String = savingPrice ? "Saving…" : "Save"
                Button(saveTitle) {
                    Task { await savePrice() }
                }
                .buttonStyle(.kitchen(.primary, size: .small, fill: false))
                .disabled(Money.parse(priceText) == nil || !sizeIsAmount || savingPrice)
            }
        }
        .padding(.leading, 62)
        .padding(.trailing, 16)
        .padding(.vertical, 12)
    }

    private func togglePricing() {
        withAnimation(.snappy(duration: 0.2)) {
            pricing.toggle()
        }
        guard pricing else {
            priceFocused = false
            return
        }
        error = nil
        priceText = item.lastPrice.map { Money.field($0.price) } ?? ""
        shopText = item.lastPrice?.storeName ?? ""
        brandText = item.lastPrice?.brand ?? ""
        sizeText = item.lastPrice.flatMap { ReceiptWords.amount(quantity: $0.quantity, unit: $0.unit) } ?? ""
        // A beat after the field appears, or the focus is dropped on the way in.
        Task {
            try? await Task.sleep(for: .milliseconds(250))
            if pricing { priceFocused = true }
        }
    }

    private func savePrice() async {
        guard let price = Money.parse(priceText), let size = ReceiptWords.amount(from: sizeText) else { return }
        let shop = shopText.trimmingCharacters(in: .whitespacesAndNewlines)
        let brand = brandText.trimmingCharacters(in: .whitespacesAndNewlines)
        error = nil
        if sample {
            var priced = item
            priced.lastPrice = LastPrice(price: price, quantity: size.quantity, unit: size.unit,
                                         storeName: shop.isEmpty ? nil : shop, observedOn: Day.iso(.now), onSale: false,
                                         source: "MANUAL", brand: brand.isEmpty ? nil : brand)
            onPriced(priced)
            withAnimation(.snappy(duration: 0.2)) { pricing = false }
            return
        }
        guard let household = session.household?.id else { return }
        savingPrice = true
        defer { savingPrice = false }
        do {
            let saved = try await APIClient.shared.setPrice(household: household, item: item.id, price: price,
                                                            quantity: size.quantity, unit: size.unit,
                                                            storeName: shop.isEmpty ? nil : shop,
                                                            brand: brand.isEmpty ? nil : brand)
            onPriced(saved)
            priceFocused = false
            withAnimation(.snappy(duration: 0.2)) { pricing = false }
            await loadByShop()
        } catch {
            self.error = error.localizedDescription
        }
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

 A house without a cupboard has nothing to put away: the sheet just says what leaves the list,
 and everything goes as put away, which is what restarts each thing's restock reminder.
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

    private var tracksCupboard: Bool { session.cupboardOn }
    private var stocking: [GroceryItem] { tracksCupboard && toCupboard ? items.filter { selected.contains($0.id) } : [] }

    /// The button: "Clear 6 ticked" with no cupboard, "Finish · 5 to cupboard" with one. Spelled
    /// out as a String here, so Text is not left to choose an initializer for three ternaries.
    private var finishTitle: String {
        if busy { return "Finishing…" }
        if !tracksCupboard { return "Clear \(items.count) ticked" }
        return stocking.isEmpty ? "Finish" : "Finish · \(stocking.count) to cupboard"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader("Done shopping?",
                            subtitle: "\(items.count) ticked \(items.count == 1 ? "item leaves" : "items leave") the list.",
                            onClose: { dismiss() })
                .padding(.bottom, 4)

                if tracksCupboard {
                    cupboardSwitch
                    stockList
                } else {
                    ListGroup {
                        ForEach(items) { item in
                            HStack(spacing: 12) {
                                CheckCircle(isOn: true, size: 22)
                                (item.amount.map { Text($0 + " ").font(.system(size: 16, weight: .bold)) } ?? Text(""))
                                    + Text(item.name).font(.system(size: 16, weight: .medium))
                                Spacer(minLength: 8)
                            }
                            .foregroundStyle(Palette.text)
                            .lineLimit(1)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .frame(minHeight: 46)
                        }
                    }
                }

                if let error {
                    Text(error).font(.footnote).foregroundStyle(Palette.danger)
                }

                Button {
                    Task { await finish() }
                } label: {
                    Text(finishTitle)
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

    /// "Put them in the cupboard", on or off for the whole shop.
    private var cupboardSwitch: some View {
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
    }

    /// What is for the house, ticked; the birthday card, unticked.
    private var stockList: some View {
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
    }

    private func finish() async {
        // No cupboard: all of it is "bought for the house" — the server stocks nothing, but each
        // thing's restock reminder starts counting again.
        let putAway = tracksCupboard ? stocking.map(\.id) : items.map(\.id)
        let leaveOut = items.map(\.id).filter { !putAway.contains($0) }
        let stocked = tracksCupboard ? putAway.count : 0
        if sample {
            onDone(putAway + leaveOut, stocked)
            dismiss()
            return
        }
        guard let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.putAway(household: household, putAway: putAway, leaveOut: leaveOut)
            onDone(putAway + leaveOut, stocked)
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

#Preview("Grocery item — last paid") {
    Color.clear.sheet(isPresented: .constant(true)) {
        GroceryItemSheet(item: SampleData.groceriesPriced[4], categories: SampleData.aisles,
                         reminder: nil, stock: nil, session: .preview, sample: true,
                         onMove: { _ in }, onReminder: { _ in }, onRemove: {}, onPriced: { _ in })
    }
}

#Preview("Done shopping — dark") {
    Color.clear.sheet(isPresented: .constant(true)) {
        DoneShoppingSheet(items: SampleData.groceriesMockup.filter(\.checked), session: .preview, sample: true) { _, _ in }
    }
    .preferredColorScheme(.dark)
}
