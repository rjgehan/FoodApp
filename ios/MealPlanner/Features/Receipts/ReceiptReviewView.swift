import SwiftUI

/**
 The receipt as the server read it, to be checked before anything is kept: the shop (named as on
 the receipt, and editable), the day, the totals, and every line with what was paid, a Sale pill
 where a discount came off, whether it is food, and the ingredient it counts as — the server's
 guess, which a tap puts right.

 Two things it says out loud: lines that do not add up to the receipt's subtotal (usually a price
 misread), and a receipt already scanned (its barcode was saved before), with Open and Save
 anyway. The words it could not read wait folded at the bottom, never silently dropped.

 Save keeps the receipt and gives every food line with a name a price for that day. Cancel throws
 it all away.
 */
struct ReceiptReviewView: View {
    var session: Session
    let draft: ReceiptDraft
    let scan: ReceiptScanText
    var choices: [IngredientChoice]
    /// Previews and the Gallery: draw it, send nothing.
    var sample = false
    var onCancel: () -> Void
    var onSaved: (ReceiptResponse) -> Void

    @State private var storeName: String
    @State private var date: Date
    @State private var lines: [ReceiptLine]
    @State private var duplicateOf: UUID?
    /// "Oct 18" — when the receipt was scanned before, once it has been looked up.
    @State private var duplicateDay: String?
    @State private var shops: [Shop] = []
    @State private var picking: LinePick?
    /// The earlier copy of this receipt, pushed by Open.
    @State private var opened: UUID?
    @State private var showUnread = false
    @State private var busy = false
    @State private var error: String?

    /// The line whose sheet is open, by its place on the receipt.
    struct LinePick: Identifiable {
        let id: Int
    }

    init(session: Session, draft: ReceiptDraft, scan: ReceiptScanText, choices: [IngredientChoice],
         sample: Bool = false, onCancel: @escaping () -> Void, onSaved: @escaping (ReceiptResponse) -> Void) {
        self.session = session
        self.draft = draft
        self.scan = scan
        self.choices = choices
        self.sample = sample
        self.onCancel = onCancel
        self.onSaved = onSaved
        _storeName = State(initialValue: draft.storeName ?? "")
        _date = State(initialValue: draft.purchasedOn.flatMap { Day.date(String($0.prefix(10))) } ?? .now)
        _lines = State(initialValue: draft.lines)
        _duplicateOf = State(initialValue: draft.duplicateOf)
    }

    private var shopName: String { storeName.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Every line, not-food ones included — that is how the receipt's subtotal was reached.
    private var lineSum: Double { lines.reduce(0) { $0 + $1.price } }

    /// What the lines should add up to: the subtotal, or the total when no subtotal was read.
    private var expected: Double? { draft.subtotal ?? draft.total }

    /// Worked out again as prices are corrected, so the warning goes once they add up. With no
    /// subtotal read there is nothing to compare, and only the server's word counts.
    private var mismatch: Bool {
        guard let subtotal = draft.subtotal else { return draft.sumMatches == false }
        return abs(lineSum - subtotal) > 0.02
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
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let duplicateOf {
                    duplicateBanner(duplicateOf)
                }
                if mismatch, let expected {
                    NoteBox("Lines add up to \(Money.text(lineSum)) but the receipt says \(Money.text(expected)) — check the prices",
                            tone: .mustard, systemImage: "exclamationmark.triangle")
                }

                details

                SectionLabel("What you bought", trailing: "\(pricedCount) of \(foodCount) priced")
                    .padding(.top, 4)
                if lines.isEmpty {
                    Text("No lines with prices were found on it.")
                        .font(.system(size: 15)).foregroundStyle(Palette.muted)
                } else {
                    ListGroup {
                        ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                            ReceiptLineRow(line: line,
                                           onOpen: { picking = LinePick(id: index) },
                                           onKind: { toggleKind(index) })
                        }
                    }
                }
                // Said before Save, not after: what is saved here is seen by everybody on the server.
                Text("Tap a line to say what it is or fix its price. Only food with a name keeps a price, and it goes on Explore's store map for everyone on this server — the shop and the price, never who paid it.")
                    .font(.system(size: 12)).foregroundStyle(Palette.muted)
                    .padding(.horizontal, 4)

                unread

                if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                }

                Button {
                    Task { await save(anyway: duplicateOf != nil) }
                } label: {
                    Text(saveTitle)
                }
                .buttonStyle(.primary)
                .disabled(!canSave)
                .padding(.top, 4)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
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
            if lines.indices.contains(pick.id) {
                ReceiptLineSheet(line: lines[pick.id], choices: allChoices) { edited in
                    if lines.indices.contains(pick.id) { lines[pick.id] = edited }
                }
            }
        }
        .navigationDestination(item: $opened) { id in
            ReceiptDetailView(session: session, id: id, sample: sample ? SampleData.receiptDetail : nil, backLabel: "Check")
        }
        .task { await loadExtras() }
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

    /// The words the server could not make sense of, folded away.
    @ViewBuilder private var unread: some View {
        let words = draft.unreadLines ?? []
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
                            Text(text).font(.system(size: 13, design: .monospaced)).foregroundStyle(Palette.muted)
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
        return out
    }

    private func save(anyway: Bool) async {
        guard canSave else { return }
        error = nil
        if sample {
            onSaved(ReceiptResponse(id: UUID(), storeName: shopName.isEmpty ? nil : shopName, purchasedOn: Day.iso(date), total: draft.total,
                                    itemCount: lines.count, pricedCount: pricedCount, lines: lines, createdAt: nil))
            return
        }
        guard let household = session.household?.id else { return }
        let wanted = request(withBarcode: !anyway)
        busy = true
        defer { busy = false }
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
            if let weighed = line.weighed {
                Text(weighed).font(.system(size: 12).monospacedDigit()).foregroundStyle(Palette.muted)
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
 grocery list's names — the price paid, and whether it was on sale. Nothing is sent from here;
 Done hands the line back to the review screen.
 */
struct ReceiptLineSheet: View {
    let line: ReceiptLine
    let choices: [IngredientChoice]
    var onDone: (ReceiptLine) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var priceText: String
    @State private var kind: ReceiptLineKind
    @State private var onSale: Bool

    init(line: ReceiptLine, choices: [IngredientChoice], onDone: @escaping (ReceiptLine) -> Void) {
        self.line = line
        self.choices = choices
        self.onDone = onDone
        _name = State(initialValue: line.ingredientName ?? "")
        _priceText = State(initialValue: Money.field(line.price))
        _kind = State(initialValue: line.kind)
        _onSale = State(initialValue: line.onSale)
    }

    private var typed: String { name.trimmingCharacters(in: .whitespaces) }
    private var price: Double? { Money.parse(priceText) }

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
                SheetHeader(line.text, subtitle: line.weighed, onClose: { dismiss() })

                SegmentedControl(selection: $kind.animation(.snappy(duration: 0.2)),
                                 options: [(ReceiptLineKind.item, "Food"), (ReceiptLineKind.notFood, "Not food")])

                if kind == .item {
                    VStack(alignment: .leading, spacing: 10) {
                        FieldBox("Counts as", text: $name, prompt: "lemons", systemImage: "leaf",
                                 hint: "Its price is kept under this name, for the grocery list.")
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
                } else {
                    Text("Bags, deposits and gift cards keep no price.")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                }

                FieldBox("Price paid", text: $priceText, prompt: "0.00", systemImage: "dollarsign",
                         hint: "What the line cost after any discount under it.")
                    .keyboardType(.decimalPad)

                Toggle("On sale", isOn: $onSale)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Palette.text)
                    .padding(.horizontal, 4)

                Button("Done", action: apply)
                    .buttonStyle(.primary)
                    .disabled(price == nil)
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
        edited.kind = kind
        edited.onSale = onSale
        if let price { edited.price = price }
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
