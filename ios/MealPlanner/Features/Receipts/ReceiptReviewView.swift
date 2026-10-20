import CoreLocation
import SwiftUI

/**
 The receipt as the server read it, to be checked before anything is kept: the shop (named as on
 the receipt, and editable), the day, the totals, and every line with what was paid, a Sale pill
 where a discount came off, whether it is food, and the ingredient it counts as — the server's
 guess, which a tap puts right.

 Two things it says out loud: lines that do not add up to the receipt's subtotal (usually a price
 misread), and a receipt already scanned (its barcode was saved before), with Open and Save
 anyway. The words it could not read wait folded at the bottom, never silently dropped, each with
 a + that makes it a line. A line it missed altogether is added by hand (Add a line), one it got
 wrong is swiped away (or removed from its sheet, or by holding it), and the photo is a tap away
 to check against.

 The receipt is linked to the branch it came from (Which store?): the household's own branch of
 that shop when it has linked one before, else the nearest of the chain when Location is on —
 said as a guess, and changed with a tap — so its prices are pinned on the map at that shop.

 Save keeps the receipt and gives every food line with a name a price for that day. Cancel throws
 it all away.
 */
struct ReceiptReviewView: View {
    var session: Session
    let draft: ReceiptDraft
    let scan: ReceiptScanText
    /// The pages photographed: shown to check against, and kept with the receipt when it is saved.
    var photos: [UIImage] = []
    var choices: [IngredientChoice]
    /// Previews and the Gallery: draw it, send nothing.
    var sample = false
    var onCancel: () -> Void
    var onSaved: (ReceiptResponse) -> Void

    @State private var storeName: String
    @State private var date: Date
    @State private var lines: [ReceiptLine]
    /// Who each line is to the list, so a swiped-away line goes and the rest stay put.
    @State private var lineKeys: [UUID]
    /// The branch it is from, and why when the app chose it rather than the person.
    @State private var place: ShopBranch?
    @State private var placeNote: String?
    /// Picked or unlinked by hand: no more guessing.
    @State private var placeChosen = false
    @State private var choosingStore = false
    @State private var locator = StoreLocator()
    @State private var duplicateOf: UUID?
    /// "Oct 18" — when the receipt was scanned before, once it has been looked up.
    @State private var duplicateDay: String?
    @State private var shops: [Shop] = []
    @State private var picking: LinePick?
    /// The earlier copy of this receipt, pushed by Open.
    @State private var opened: UUID?
    @State private var showUnread = false
    /// The words it could not read, less those made into lines.
    @State private var unreadLeft: [String]
    @State private var busy = false
    @State private var error: String?
    /// The pages once uploaded, so a second Save (Save anyway) does not send them again.
    @State private var photoIds: [UUID]?

    /// The line whose sheet is open: one on the receipt by its place, or a new one to add (from
    /// nothing, or from words it could not read).
    struct LinePick: Identifiable {
        var index: Int?
        var new: ReceiptLine?
        var fromUnread: String?
        var id: String { index.map { "line-\($0)" } ?? "new-\(fromUnread ?? "")" }
    }

    init(session: Session, draft: ReceiptDraft, scan: ReceiptScanText, photos: [UIImage] = [],
         choices: [IngredientChoice], sample: Bool = false, onCancel: @escaping () -> Void,
         onSaved: @escaping (ReceiptResponse) -> Void) {
        self.session = session
        self.draft = draft
        self.scan = scan
        self.photos = photos
        self.choices = choices
        self.sample = sample
        self.onCancel = onCancel
        self.onSaved = onSaved
        _storeName = State(initialValue: draft.storeName ?? "")
        _date = State(initialValue: draft.purchasedOn.flatMap { Day.date(String($0.prefix(10))) } ?? .now)
        _lines = State(initialValue: draft.lines)
        _lineKeys = State(initialValue: draft.lines.map { _ in UUID() })
        _duplicateOf = State(initialValue: draft.duplicateOf)
        _unreadLeft = State(initialValue: draft.unreadLines ?? [])
    }

    private var shopName: String { storeName.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Every line, not-food ones included — that is how the receipt's subtotal was reached.
    private var lineSum: Double { lines.reduce(0) { $0 + $1.price } }

    /// What the lines should add up to: the subtotal, or — on a receipt that prints none, as
    /// Kings' does — the total less the tax.
    private var expected: Double? {
        draft.subtotal ?? draft.total.map { $0 - (draft.tax ?? 0) }
    }

    /// Worked out again as lines are corrected, added and removed, so the warning goes once they
    /// add up. With nothing read to compare against, there is no warning.
    private var mismatch: Bool {
        guard let expected, !lines.isEmpty else { return false }
        return abs(lineSum - expected) > 0.02
    }

    private var foodCount: Int { lines.filter { $0.kind == .item }.count }
    private var pricedCount: Int { lines.filter { $0.countsAs != nil }.count }
    /// A shop left blank is allowed: the receipt is then from nowhere in particular.
    private var canSave: Bool { !lines.isEmpty && !busy }

    /// The grocery list's names, then the server's own guesses, each name once.
    private var allChoices: [IngredientChoice] {
        let guesses = lines.compactMap { line in
            line.ingredientName.map { IngredientChoice(name: $0, ingredientId: line.ingredientId) }
        }
        var seen = Set<String>()
        return (choices + guesses).filter { seen.insert($0.name.lowercased()).inserted }
    }

    var body: some View {
        List {
            Group {
                if let duplicateOf {
                    duplicateBanner(duplicateOf).pageRow(top: 8, bottom: 14)
                }
                if mismatch, let expected {
                    NoteBox("Lines add up to \(Money.text(lineSum)) but the receipt says \(Money.text(expected)) — check the prices",
                            tone: .mustard, systemImage: "exclamationmark.triangle")
                        .pageRow(top: duplicateOf == nil ? 8 : 0, bottom: 14)
                }

                details.pageRow(top: duplicateOf == nil && !mismatch ? 8 : 0, bottom: 14)

                LinkedStoreRow(place: place, note: placeNote, distance: placeDistance) { choosingStore = true }
                    .pageRow(bottom: 14)

                if !photos.isEmpty {
                    ReceiptPhotoStrip(pages: .scanned(photos), name: photoName).pageRow(bottom: 14)
                }

                SectionLabel("What you bought", trailing: "\(pricedCount) of \(foodCount) priced")
                    .pageRow(top: 4, bottom: 8)
            }
            if lines.isEmpty {
                Text("No lines with prices were found on it.")
                    .font(.system(size: 15)).foregroundStyle(Palette.muted)
                    .pageRow(bottom: 14)
            } else {
                ForEach(Array(zip(lineKeys, lines).enumerated()), id: \.element.0) { index, pair in
                    ReceiptLineRow(line: pair.1,
                                   onOpen: { picking = LinePick(index: index) },
                                   onKind: { toggleKind(index) })
                        .contextMenu {
                            Button(role: .destructive) { remove(index) } label: {
                                Label("Remove line", systemImage: "trash")
                            }
                        }
                        .cardRow(first: index == 0, last: index == lines.count - 1, inset: 16, padding: 0)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button("Remove", systemImage: "trash", role: .destructive) { remove(index) }
                                // The theme's tomato, as Groceries draws Remove.
                                .tint(Palette.accent)
                        }
                }
                Color.clear.frame(height: 14).pageRow()
            }
            Group {
                DashedAddButton(title: "Add a line it missed") {
                    picking = LinePick(new: ReceiptLine(text: "", price: 0))
                }
                .pageRow(bottom: 14)
                // Said before Save, not after: what is saved here is seen by everybody on the server.
                Text("Tap a line to say what it is or fix its price, and swipe left to remove one. Only food with a name keeps a price, and it goes on Explore's store map for everyone on this server — the shop and the price, never who paid it.")
                    .font(.system(size: 12)).foregroundStyle(Palette.muted)
                    .pageRow(bottom: 14, horizontal: 24)

                unread.pageRow(bottom: 14)

                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle").pageRow(bottom: 14)
                }

                Button {
                    Task { await save(anyway: duplicateOf != nil) }
                } label: {
                    Text(saveTitle)
                }
                .buttonStyle(.primary)
                .disabled(!canSave)
                .pageRow(top: 4, bottom: 28)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 0)
        .scrollDismissesKeyboard(.interactively)
        .pageBackground()
        .navigationTitle("Check the receipt")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            BarTextButton("Cancel", placement: .topBarLeading, action: onCancel)
            BarTextButton("Save", placement: .topBarTrailing, bold: true, disabled: !canSave) {
                Task { await save(anyway: duplicateOf != nil) }
            }
        }
        .sheet(item: $picking) { pick in
            if let index = pick.index, lines.indices.contains(index) {
                ReceiptLineSheet(line: lines[index], choices: allChoices, onRemove: { remove(index) }) { edited in
                    if lines.indices.contains(index) { lines[index] = edited }
                }
            } else if let new = pick.new {
                ReceiptLineSheet(line: new, choices: allChoices, isNew: true) { added in
                    withAnimation(.snappy(duration: 0.2)) {
                        lines.append(added)
                        lineKeys.append(UUID())
                        if let words = pick.fromUnread, let at = unreadLeft.firstIndex(of: words) {
                            unreadLeft.remove(at: at)
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $choosingStore) {
            StorePicker(session: session, suggest: shopName.isEmpty ? nil : shopName, current: place,
                        onPick: { picked in link(picked) },
                        onUnlink: place == nil ? nil : { link(nil) },
                        sample: sample ? StoreMapSamples.places : nil)
        }
        .navigationDestination(item: $opened) { id in
            ReceiptDetailView(session: session, id: id, sample: sample ? SampleData.receiptDetail : nil, backLabel: "Check")
        }
        .task { await loadExtras() }
        // The shop's name settles (read, typed, picked), the household's shops arrive, the phone
        // finds itself: each time, the best guess at the branch, until somebody picks one.
        .task(id: guessKey) { await guessPlace() }
    }

    private var saveTitle: String {
        if busy { return "Saving…" }
        if pricedCount == 0 { return "Save receipt" }
        return "Save \(pricedCount) \(pricedCount == 1 ? "price" : "prices")"
    }

    // MARK: - Pieces

    /// The shop, the day and the totals.
    private var details: some View {
        Card(spacing: 12) {
            FieldBox("Shop", text: $storeName, prompt: "Kings Food Markets", systemImage: "storefront") {
                if !shops.isEmpty {
                    Menu {
                        ForEach(shops) { shop in
                            Button(shop.name) { storeName = shop.name }
                        }
                    } label: {
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Palette.muted)
                            .frame(width: 28, height: 28)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel("Your shops")
                }
            }
            HStack {
                Text("Date").font(.system(size: 15)).foregroundStyle(Palette.muted)
                Spacer(minLength: 8)
                DatePicker("Date", selection: $date, in: ...Date.now, displayedComponents: .date)
                    .labelsHidden()
                    .tint(Palette.accent)
            }
            if let totals {
                Text(totals)
                    .font(.system(size: 14, weight: .medium).monospacedDigit())
                    .foregroundStyle(Palette.text)
            }
        }
    }

    /// "Subtotal $41.60 · Tax $0.00 · Total $41.60", whichever of them were read.
    private var totals: String? {
        let parts: [String?] = [
            draft.subtotal.map { "Subtotal \(Money.text($0))" },
            draft.tax.map { "Tax \(Money.text($0))" },
            draft.total.map { "Total \(Money.text($0))" },
        ]
        let shown = parts.compactMap { $0 }
        return shown.isEmpty ? nil : shown.joined(separator: " · ")
    }

    private func duplicateBanner(_ id: UUID) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            NoteBox(duplicateDay.map { "You scanned this receipt on \($0)." } ?? "You've scanned this receipt before.",
                    tone: .sky, systemImage: "doc.on.doc")
            HStack(spacing: 8) {
                Button("Open") { opened = id }
                    .buttonStyle(.kitchen(.secondary, size: .small))
                Button("Save anyway") { Task { await save(anyway: true) } }
                    .buttonStyle(.kitchen(.soft, size: .small))
                    .disabled(!canSave)
            }
        }
    }

    /// The words the server could not make sense of, folded away; + makes one a line.
    @ViewBuilder private var unread: some View {
        let words = unreadLeft
        if !words.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Button {
                    withAnimation(.snappy(duration: 0.2)) { showUnread.toggle() }
                } label: {
                    HStack {
                        Text("\(words.count) \(words.count == 1 ? "line" : "lines") it couldn't read")
                        Spacer(minLength: 8)
                        Image(systemName: showUnread ? "chevron.up" : "chevron.down")
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Palette.muted)
                    .padding(.horizontal, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if showUnread {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(words.enumerated()), id: \.offset) { _, text in
                            HStack(spacing: 8) {
                                Text(text).font(.system(size: 13, design: .monospaced)).foregroundStyle(Palette.muted)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Button {
                                    picking = LinePick(new: ReceiptLine.fromUnread(text), fromUnread: text)
                                } label: {
                                    Image(systemName: "plus.circle.fill").font(.system(size: 20))
                                        .foregroundStyle(Palette.accentInk)
                                }
                                .buttonStyle(PressFade())
                                .accessibilityLabel("Add \(text) as a line")
                            }
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
    }

    // MARK: - Behaviour

    /// "Kings Food Markets Oct 18", for the pictures when they are shared.
    private var photoName: String {
        [shopName.isEmpty ? "Receipt" : shopName, ReceiptWords.day(Day.iso(date))].compactMap { $0 }.joined(separator: " ")
    }

    private func remove(_ index: Int) {
        guard lines.indices.contains(index) else { return }
        withAnimation(.snappy(duration: 0.2)) {
            lines.remove(at: index)
            lineKeys.remove(at: index)
        }
    }

    // MARK: - The store

    private var placeDistance: String? {
        guard let here = locator.location, let lat = place?.latitude, let lon = place?.longitude else { return nil }
        return StoreWords.distance(here.distance(from: CLLocation(latitude: lat, longitude: lon)))
    }

    private var guessKey: String {
        "\(StoreMatch.key(shopName))|\(shops.count)|\(locator.location != nil)"
    }

    /**
     Picked (or unlinked) in Which store?. A branch of another chain renames the shop: as the
     household already calls that chain ("ShopRite of Hoboken"), else as the branch calls itself.
     */
    private func link(_ picked: ShopBranch?) {
        placeChosen = true
        placeNote = nil
        place = picked
        if let name = picked?.name, !StoreMatch.same(shopName, name) {
            storeName = shops.first { StoreMatch.same($0.name, name) }?.name ?? name
        }
    }

    /**
     The household's own branch of the shop when it has linked one before — it is where they shop —
     else the nearest of the chain within a few kilometres, when the phone knows where it is (and
     only if Location is already allowed: a receipt is no time to be asked).
     */
    private func guessPlace() async {
        guard !placeChosen else { return }
        let name = shopName
        // Typing: wait for the name to settle.
        try? await Task.sleep(for: .milliseconds(400))
        if Task.isCancelled || placeChosen { return }
        guard !name.isEmpty else {
            place = nil
            placeNote = nil
            return
        }
        if let own = shops.first(where: { StoreMatch.same($0.name, name) && $0.place?.located == true })?.place {
            place = own
            placeNote = "Where you shopped last time"
            return
        }
        if let place, let placed = place.name, StoreMatch.same(placed, name), placeNote != nil { return }
        place = nil
        placeNote = nil
        if sample { return }
        locator.start(asking: false)
        guard let here = locator.location,
              let nearest = await StorePicker.nearest(named: name, near: here),
              !Task.isCancelled, !placeChosen else { return }
        place = nearest
        placeNote = "Nearest one to you"
    }

    private func toggleKind(_ index: Int) {
        guard lines.indices.contains(index) else { return }
        withAnimation(.snappy(duration: 0.2)) {
            lines[index].kind = lines[index].kind == .item ? .notFood : .item
        }
    }

    /**
     `POST /receipts`'s body. `withBarcode` false is Save anyway: the barcode is what makes the
     server refuse a second copy, so it stays behind.
     */
    private func request(withBarcode: Bool) -> [String: Any] {
        var out: [String: Any] = [
            "purchasedOn": Day.iso(date),
            "lines": lines.map(\.body),
        ]
        if !shopName.isEmpty { out["storeName"] = shopName }
        if let subtotal = draft.subtotal { out["subtotal"] = Money.json(subtotal) }
        if let tax = draft.tax { out["tax"] = Money.json(tax) }
        if let total = draft.total { out["total"] = Money.json(total) }
        if withBarcode, let barcode = scan.barcode, !barcode.isEmpty { out["barcode"] = barcode }
        if !scan.rawText.isEmpty { out["rawText"] = scan.rawText }
        if let photoIds, !photoIds.isEmpty { out["photoIds"] = photoIds.map(\.uuidString) }
        if let place, !place.body.isEmpty { out["place"] = place.body }
        return out
    }

    private func save(anyway: Bool) async {
        guard canSave else { return }
        error = nil
        if sample {
            onSaved(ReceiptResponse(id: UUID(), storeName: shopName.isEmpty ? nil : shopName, purchasedOn: Day.iso(date), total: draft.total,
                                    itemCount: lines.count, pricedCount: pricedCount, lines: lines, createdAt: nil, place: place))
            return
        }
        guard let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        // The pages first, best effort: a page that will not go up leaves the receipt without it.
        if photoIds == nil, !photos.isEmpty {
            photoIds = await ReceiptPhotos.upload(photos, household: household)
        }
        let wanted = request(withBarcode: !anyway)
        do {
            let saved = try await APIClient.shared.saveReceipt(household: household, body: wanted)
            onSaved(saved)
        } catch let failure as APIError where failure.duplicateReceipt != nil {
            // Scanned before after all (another phone got there first): say so, and offer the two ways on.
            withAnimation(.snappy(duration: 0.2)) { duplicateOf = failure.duplicateReceipt }
            await loadDuplicateDay()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The household's shops, and when a duplicate was first scanned. Both quiet on failure.
    private func loadExtras() async {
        if sample {
            shops = SampleData.shops
            return
        }
        guard let household = session.household?.id else { return }
        if let found = try? await APIClient.shared.shops(household: household) { shops = found }
        await loadDuplicateDay()
    }

    private func loadDuplicateDay() async {
        guard !sample, let id = duplicateOf, let household = session.household?.id,
              let earlier = try? await APIClient.shared.receipt(household: household, id: id) else { return }
        duplicateDay = ReceiptWords.day(earlier.purchasedOn ?? earlier.createdAt)
    }
}

// MARK: - A line

/**
 One receipt line: what it said, the ingredient it counts as (or why it keeps no price), a Sale
 pill, how it was weighed, and the price on the right. On the review screen the words open the
 line's sheet and the Food / Not food pill flips it; on a saved receipt it only shows.
 */
struct ReceiptLineRow: View {
    let line: ReceiptLine
    var onOpen: (() -> Void)? = nil
    var onKind: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if let onOpen {
                Button(action: onOpen) {
                    words.contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Say what it is, or fix its price")
            } else {
                words
            }
            VStack(alignment: .trailing, spacing: 6) {
                Text(Money.text(line.price))
                    .font(.system(size: 15, weight: .semibold).monospacedDigit())
                    .foregroundStyle(line.kind == .item ? Palette.text : Palette.muted)
                if let onKind {
                    KindButton(kind: line.kind, action: onKind)
                } else if line.kind == .notFood {
                    Pill("Not food", tone: .neutral)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(line.text)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(line.kind == .item ? Palette.text : Palette.muted)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            HStack(spacing: 6) {
                match
                if line.onSale { Pill("Sale", tone: .herb) }
            }
            if let detail = line.detail {
                Text(detail).font(.system(size: 12).monospacedDigit()).foregroundStyle(Palette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var match: some View {
        if line.kind == .notFood {
            Text("Not food · no price kept").font(.system(size: 12)).foregroundStyle(Palette.faint)
        } else if let name = line.countsAs {
            Label(name, systemImage: "arrow.turn.down.right")
                .labelStyle(WarningLabel())
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Palette.accentInk)
                .lineLimit(1)
        } else {
            Text(onOpen == nil ? "No price kept" : "Tap to say what it is")
                .font(.system(size: 13))
                .foregroundStyle(Palette.faint)
        }
    }
}

/// Food or Not food, as a small pill that flips with a tap.
private struct KindButton: View {
    let kind: ReceiptLineKind
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(kind == .item ? "Food" : "Not food")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(kind == .item ? Palette.herb : Palette.muted)
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(kind == .item ? Palette.herbSoft : Palette.surface2, in: Capsule())
                .fixedSize()
                .contentShape(Capsule())
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(kind == .item ? "Food" : "Not food")
        .accessibilityHint(kind == .item ? "Marks it not food" : "Marks it food")
    }
}

// MARK: - A line's sheet

/**
 What a receipt line is: food or not, the ingredient it counts as — typed, or picked from the
 grocery list's names — whose make it is and how much it was for, the price paid, and whether it
 was on sale. Nothing is sent from here; Done hands the line back to the review screen.

 The brand and the size have boxes of their own so "Counts as" can be the thing itself — english
 breakfast tea, not "TWININGS english breakfast tea 20 bags" — and the list's tea finds its price.
 */
struct ReceiptLineSheet: View {
    let line: ReceiptLine
    let choices: [IngredientChoice]
    /// A line the reading missed, being added: what it is names it.
    var isNew = false
    /// Takes the line off the receipt; nil for one being added.
    var onRemove: (() -> Void)? = nil
    var onDone: (ReceiptLine) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var priceText: String
    @State private var kind: ReceiptLineKind
    @State private var onSale: Bool
    @State private var brand: String
    @State private var amountText: String
    /// What the size box said when the sheet opened, so a weight the till printed is kept unless changed.
    private let originalAmount: String

    init(line: ReceiptLine, choices: [IngredientChoice], isNew: Bool = false, onRemove: (() -> Void)? = nil,
         onDone: @escaping (ReceiptLine) -> Void) {
        self.line = line
        self.choices = choices
        self.isNew = isNew
        self.onRemove = onRemove
        self.onDone = onDone
        _name = State(initialValue: line.ingredientName ?? "")
        _priceText = State(initialValue: isNew && line.price == 0 ? "" : Money.field(line.price))
        _kind = State(initialValue: line.kind)
        _onSale = State(initialValue: line.onSale)
        _brand = State(initialValue: line.brand ?? "")
        let amount = ReceiptWords.amount(quantity: line.quantity, unit: line.unit) ?? ""
        _amountText = State(initialValue: amount)
        originalAmount = amount
    }

    private var typed: String { name.trimmingCharacters(in: .whitespaces) }
    private var price: Double? { Money.parse(priceText) }
    /// The size box read as an amount; nil while it says something that is not one.
    private var amount: (quantity: Double?, unit: String?)? { ReceiptWords.amount(from: amountText) }

    /// Names that fit what is typed (all of them before anything is), a dozen at most.
    private var suggestions: [IngredientChoice] {
        let query = typed.lowercased()
        let pool = query.isEmpty ? choices : choices.filter {
            let candidate = $0.name.lowercased()
            return candidate.contains(query) && candidate != query
        }
        return Array(pool.prefix(12))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(isNew ? "Add a line" : line.text,
                            subtitle: isNew ? (line.text.isEmpty ? "Something the reading missed" : "From \"\(line.text)\"")
                                : line.weighed,
                            onClose: { dismiss() })

                SegmentedControl(selection: $kind.animation(.snappy(duration: 0.2)),
                                 options: [(ReceiptLineKind.item, "Food"), (ReceiptLineKind.notFood, "Not food")])

                if kind == .item {
                    VStack(alignment: .leading, spacing: 10) {
                        FieldBox("Counts as", text: $name, prompt: "english breakfast tea", systemImage: "leaf",
                                 hint: "The thing itself, as the grocery list says it. Its price is kept under this name.")
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                        if !suggestions.isEmpty {
                            ChipFlow(spacing: 8) {
                                ForEach(suggestions, id: \.name) { choice in
                                    Chip(choice.name, isOn: false) { name = choice.name }
                                }
                            }
                        }
                    }
                    FieldBox("Brand", text: $brand, prompt: "Twinings", systemImage: "tag",
                             hint: "Who made it, if it matters. Optional.")
                        .autocorrectionDisabled()
                    FieldBox("How much", text: $amountText, prompt: "20 bags, 5 oz, 1.32 lb", systemImage: "scalemass",
                             hint: amount == nil ? "Start with a number — 20 bags, 5 oz, 1/2 lb."
                                 : line.unitPrice != nil && amountText == originalAmount
                                     ? "Weighed or counted at the till."
                                     : "What the price was for. Empty is one of it.")
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } else {
                    if isNew && line.text.isEmpty {
                        FieldBox("What it is", text: $name, prompt: "Bag fee", systemImage: "bag")
                    }
                    Text("Bags, deposits and gift cards keep no price.")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                }

                // Numbers with a return key: the decimal pad has none, and covered the button under it.
                FieldBox("Price paid", text: $priceText, prompt: "0.00", systemImage: "dollarsign",
                         hint: "What the line cost after any discount under it.")
                    .keyboardType(.numbersAndPunctuation)
                    .submitLabel(.done)

                Toggle("On sale", isOn: $onSale)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Palette.text)
                    .padding(.horizontal, 4)

                Button(isNew ? "Add line" : "Done", action: apply)
                    .buttonStyle(.primary)
                    .disabled(price == nil || (kind == .item && amount == nil) || (isNew && typed.isEmpty && line.text.isEmpty))

                if let onRemove {
                    Button(role: .destructive) {
                        onRemove()
                        dismiss()
                    } label: {
                        Label("Remove from receipt", systemImage: "trash")
                    }
                    .buttonStyle(.kitchen(.danger, size: .small))
                    .frame(maxWidth: .infinity)
                    .accessibilityHint("For a line the reading got wrong: it keeps no price")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 12)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .tint(Palette.herb)
        .kitchenSheet([.medium, .large])
    }

    /**
     A name that is one of the choices takes that ingredient; the server's own guess, unchanged,
     keeps its id; anything else goes as a name, for the server to find or make.
     */
    private func apply() {
        var edited = line
        // A line added by hand is called what it is.
        if edited.text.trimmingCharacters(in: .whitespaces).isEmpty { edited.text = typed }
        edited.kind = kind
        edited.onSale = onSale
        if let price { edited.price = price }
        let made = brand.trimmingCharacters(in: .whitespaces)
        edited.brand = made.isEmpty ? nil : made
        // A changed size is the person's, not the till's: its price each no longer applies.
        if amountText.trimmingCharacters(in: .whitespaces) != originalAmount, let amount {
            edited.quantity = amount.quantity
            edited.unit = amount.unit
            edited.unitPrice = nil
        }
        if typed.isEmpty {
            edited.ingredientName = nil
            edited.ingredientId = nil
        } else if let match = choices.first(where: { $0.name.caseInsensitiveCompare(typed) == .orderedSame }) {
            edited.ingredientName = match.name
            edited.ingredientId = match.ingredientId
        } else if typed.caseInsensitiveCompare(line.ingredientName ?? "") == .orderedSame {
            edited.ingredientName = typed
        } else {
            edited.ingredientName = typed
            edited.ingredientId = nil
        }
        // Its name was what it is, not something it counts as: not food keeps no price.
        if kind == .notFood {
            edited.ingredientName = nil
            edited.ingredientId = nil
        }
        onDone(edited)
        dismiss()
    }
}

#Preview("Check the receipt") {
    NavigationStack {
        ReceiptReviewView(session: .preview, draft: SampleData.receiptDraft,
                          scan: ReceiptScanText(lines: SampleData.receiptText, barcode: nil),
                          choices: SampleData.receiptChoices, sample: true, onCancel: {}, onSaved: { _ in })
    }
}

#Preview("Check the receipt — doesn't add up, dark") {
    NavigationStack {
        ReceiptReviewView(session: .preview, draft: SampleData.receiptDraftMismatch,
                          scan: ReceiptScanText(lines: SampleData.receiptText, barcode: "0412 0003 5521"),
                          choices: SampleData.receiptChoices, sample: true, onCancel: {}, onSaved: { _ in })
    }
    .preferredColorScheme(.dark)
}

#Preview("A line") {
    Color.clear.sheet(isPresented: .constant(true)) {
        ReceiptLineSheet(line: SampleData.receiptDraft.lines[3], choices: SampleData.receiptChoices) { _ in }
    }
}
