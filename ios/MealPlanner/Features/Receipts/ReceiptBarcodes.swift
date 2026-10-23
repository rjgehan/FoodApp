import AVFoundation
import SwiftUI

/**
 Barcodes on the receipt's check screen: a packet's own barcode says what a line is.

 Scan its barcode, on a line's sheet, reads one packet and fills that line in — what it counts
 as, whose make it is (when the line does not say, or the person agrees to change it) and how much
 (when the line does not say). Scan items, on the check screen, keeps the camera going: each packet
 is looked up, the line it most looks like is offered ("Looks like: CHOB GRK YGRT · $5.99"), and
 That's it — or another line picked from the list — fills that line the same way before the camera
 looks for the next one.

 What a packet counts as: the household's own name for it when every word of one is on the packet
 (the longest that fits), else Apple Intelligence's answer on a phone that has it — one of the
 household's names, or a plain one — else the packet's name without the brand or the size. The
 rules are in ProductMatch.swift, checked by ios/checks. A line filled in from a packet is the
 person's own doing, so it wears no Guess pill.

 The catalogue is the one the cupboard's scanner asks (`GET /api/barcodes/{code}`). A packet it
 has never heard of, or a look-up that fails, is said on the scanner and leaves the line alone.
 */
enum ProductLookup: Equatable {
    case found(Product)
    /// The catalogue has never heard of this barcode.
    case notInCatalogue(String)
    /// The look-up itself failed — no connection, a server error — said as a sentence.
    case failed(String)

    /// The product behind a barcode. With `sample`, one of the sample packets, and nothing sent.
    static func look(_ barcode: String, sample: Bool) async -> ProductLookup {
        if sample {
            try? await Task.sleep(for: .milliseconds(250))
            if let product = SampleData.receiptProducts.first(where: { $0.barcode == barcode }) {
                return .found(product)
            }
            return .notInCatalogue(barcode)
        }
        do {
            let product = try await APIClient.shared.product(barcode: barcode)
            return .found(product)
        } catch let error as APIError where error.status == 404 {
            return .notInCatalogue(barcode)
        } catch {
            return .failed("Couldn't look that barcode up. \(error.localizedDescription)")
        }
    }
}

extension Product {
    /// "Chobani · 32 oz": whose and how much, the brand left out when the name already says it.
    var makeAndSize: String {
        let made = brand.trimmingCharacters(in: .whitespaces)
        let saysBrand = !made.isEmpty && !name.lowercased().contains(made.lowercased())
        return [saysBrand ? made : "", size.trimmingCharacters(in: .whitespaces)]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }
}

// MARK: - What a packet says about a line

/**
 What a packet says about a receipt line: what it counts as (with the household's ingredient when
 it is one of theirs), whose make, and how much — the size only when it reads as a plain amount.
 */
struct ProductFill: Equatable {
    /// How "Counts as" was reached.
    enum How: Equatable {
        /// One of the household's own names, every word of it on the packet.
        case list
        /// Apple Intelligence's answer.
        case model
        /// The packet's own name, less the brand and the size.
        case packet
    }

    var countsAs: String
    var ingredientId: UUID?
    var how: How
    /// Whose make, nil when the catalogue does not say.
    var brand: String?
    /// The packet's size as an amount, when it says one that reads as one.
    var quantity: Double?
    var unit: String?
    var hasAmount = false

    /// "32 oz", for the size box; nil when the packet gave no amount (or one of something).
    var amountText: String? {
        hasAmount ? ReceiptWords.amount(quantity: quantity, unit: unit) : nil
    }

    /// Said under the packet's name on a line's sheet.
    var howWords: String {
        switch how {
        case .list: return "Counts as \(countsAs), from your list."
        case .model: return "Apple Intelligence says it counts as \(countsAs) — check it."
        case .packet: return "Counts as \(countsAs), from the packet's name."
        }
    }

    /**
     What a packet says: the household's name for it when one fits, else Apple Intelligence's
     answer (when `thinker` is there) to "which of these is it, or what is it", else its own name
     without the brand. Never throws: a model that fails is the packet's own name.
     */
    static func make(for product: Product, choices: [IngredientChoice], thinker: ReceiptThinker?) async -> ProductFill {
        let brand = product.brand.trimmingCharacters(in: .whitespacesAndNewlines)
        let name = product.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let names = choices.map(\.name)
        var countsAs = ""
        var how = How.packet
        if let mine = ProductMatch.choice(among: names, name: name, brand: brand) {
            countsAs = mine
            how = .list
        } else if let thinker, !name.isEmpty {
            let madeBy: String? = brand.isEmpty ? nil : brand
            let question = ReceiptQuestion(key: UUID(), text: name, brand: madeBy)
            let offered = ReceiptAssist.options(from: names)
            let guess: ReceiptGuess? = await ReceiptAssist.guess(for: question, options: offered, thinker: thinker)
            switch guess {
            case .some(.named(let said)):
                countsAs = said
                how = .model
            case .some(.notFood), .none:
                break
            }
        }
        if countsAs.isEmpty, !name.isEmpty {
            countsAs = ProductMatch.plainName(name, brand: brand)
            how = .packet
        }
        let known = choices.first { $0.name.caseInsensitiveCompare(countsAs) == .orderedSame }
        let size = amount(product.size)
        return ProductFill(countsAs: known?.name ?? countsAs, ingredientId: known?.ingredientId, how: how,
                           brand: brand.isEmpty ? nil : brand,
                           quantity: size?.quantity, unit: size?.unit, hasAmount: size != nil)
    }

    /**
     A packet's size as an amount — "32 oz", "1.5 l", and "16 oz (453 g)" as 16 oz — by the size
     box's own reading (`ReceiptWords.amount(from:)`). Nil for none, or for one that is not a plain
     amount ("6 x 330 ml").
     */
    static func amount(_ size: String) -> (quantity: Double?, unit: String?)? {
        let said = size.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !said.isEmpty, let read = ReceiptWords.amount(from: said), read.quantity != nil else { return nil }
        var unit = read.unit ?? ""
        if let bracket = unit.firstIndex(of: "(") { unit = String(unit[..<bracket]) }
        unit = unit.trimmingCharacters(in: .whitespaces)
        guard !unit.contains(where: { $0.isNumber }), unit != "x", unit != "×" else { return nil }
        return (read.quantity, unit.isEmpty ? nil : unit)
    }

    /// "Brand Fage → Chobani", when filling the line would change the make it already has.
    func brandChange(on line: ReceiptLine) -> String? {
        guard let brand, let mine = line.brand?.trimmingCharacters(in: .whitespaces), !mine.isEmpty,
              mine.caseInsensitiveCompare(brand) != .orderedSame else { return nil }
        return "Brand \(mine) → \(brand)"
    }

    /**
     Onto a line the person has said is this packet (Scan items): food, what it counts as, the
     packet's make (said on the card before That's it, when it changes one) and its size when the
     line has none — a weight or count the till printed is never overwritten.
     */
    func apply(to line: inout ReceiptLine) {
        line.kind = .item
        if !countsAs.isEmpty {
            line.ingredientName = countsAs
            line.ingredientId = ingredientId
        }
        if let brand { line.brand = brand }
        if line.quantity == nil, line.unit == nil, hasAmount {
            line.quantity = quantity
            line.unit = unit
        }
    }
}

// MARK: - No camera

/// Whether there is a camera to scan with: none in the Simulator, nor when it is not allowed.
enum ScannerCamera {
    static var unavailable: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        return status == .denied || status == .restricted || AVCaptureDevice.default(for: .video) == nil
        #endif
    }
}

/// The number under the stripes, typed instead of scanned — the Simulator, or no camera allowed.
struct BarcodeTypeField: View {
    var onLookUp: (String) -> Void

    @State private var typed = ""
    @FocusState private var typing: Bool

    private var digits: String { typed.filter(\.isNumber) }

    var body: some View {
        HStack(spacing: 8) {
            TextField("", text: $typed, prompt: Text("0818290014269").foregroundStyle(Palette.faint))
                .keyboardType(.numberPad)
                .font(.system(size: 16).monospacedDigit())
                .foregroundStyle(Palette.text)
                .focused($typing)
                .padding(.horizontal, 14)
                .frame(height: 44)
                .fieldSurface(focused: typing, radius: 12)
                .accessibilityLabel("Barcode")
            Button("Look up") {
                typing = false
                let code = digits
                typed = ""
                onLookUp(code)
            }
            .buttonStyle(.kitchen(.primary, size: .small, fill: false))
            .frame(height: 44)
            .disabled(!NutritionText.isBarcode(digits))
        }
    }
}

// MARK: - Scan its barcode (a line's sheet)

/**
 Scan its barcode, inside a line's own sheet — a sheet cannot put another over itself, so the
 sheet turns into the scanner and back: a small camera with the cupboard scanner's window, the
 packet looked up, and the product handed back. A packet the catalogue does not know, or a
 look-up that failed, is said here, with Scan again and Back to the line.
 */
struct LineBarcodeScanner: View {
    /// The line as printed, to say what is being scanned for.
    var lineText: String
    /// Previews and the Gallery: sample packets to tap instead of the camera, nothing sent.
    var sample = false
    var onFound: (Product) -> Void
    var onClose: () -> Void

    @State private var stage: Stage = .scanning
    @State private var torch = false

    enum Stage: Equatable {
        case scanning
        case asking(String)
        case missing(String)
        case failed(String)
    }

    private var scanning: Bool { stage == .scanning }
    private var asking: Bool { if case .asking = stage { return true } else { return false } }
    /// Nothing to point: the Simulator, or a phone that will not lend the camera.
    private var noCamera: Bool { ScannerCamera.unavailable }
    private var live: Bool { !sample && !noCamera }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader("Scan its barcode",
                        subtitle: lineText.isEmpty ? "The barcode on the packet" : "For \u{201C}\(lineText)\u{201D}",
                        onClose: onClose)
            viewfinder
            status
            if scanning {
                if sample {
                    samples
                } else if noCamera {
                    BarcodeTypeField { code in Task { await lookUp(code) } }
                }
            }
        }
        .animation(.snappy(duration: 0.2), value: stage)
    }

    /// The camera in a rounded box, the window over it, the torch in its corner.
    private var viewfinder: some View {
        ZStack {
            ScannerBackdrop()
            if scanning && live {
                BarcodeCamera(torch: torch) { code in Task { await lookUp(code) } }
            }
            BarcodeAimBox(width: 230, height: 116)
                .opacity(scanning ? 1 : 0.6)
            if asking {
                ProgressView().tint(.white)
            }
            if live {
                ScannerRoundButton(torch ? "flashlight.on.fill" : "flashlight.off.fill",
                                   label: torch ? "Torch off" : "Torch on") { torch.toggle() }
                    .padding(10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 200)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    /// What to do while it waits for a barcode.
    private var aimWords: String {
        if sample { return "No camera in a preview: try a sample packet." }
        if noCamera { return "There's no camera here. Type the number under the stripes." }
        return "Hold the packet's barcode in the window."
    }

    @ViewBuilder private var status: some View {
        switch stage {
        case .scanning:
            Text(aimWords)
                .font(.system(size: 14)).foregroundStyle(Palette.muted)
        case .asking(let code):
            Text("Looking up \(code)…")
                .font(.system(size: 14)).foregroundStyle(Palette.muted)
        case .missing(let code):
            VStack(alignment: .leading, spacing: 10) {
                NoteBox(text: Text("**Not in the catalogue.** \(code) isn't a packet it knows, so the line is as it was."),
                        tone: .mustard, systemImage: "questionmark.circle")
                again
            }
        case .failed(let message):
            VStack(alignment: .leading, spacing: 10) {
                NoteBox(message, tone: .accent, systemImage: "exclamationmark.triangle")
                again
            }
        }
    }

    private var again: some View {
        HStack(spacing: 8) {
            Button("Scan again") { stage = .scanning }
            .buttonStyle(.kitchen(.secondary, size: .small))
            Button("Back to the line", action: onClose)
                .buttonStyle(.kitchen(.ghost, size: .small))
        }
    }

    /// Previews: the sample packets, and one the catalogue does not know.
    private var samples: some View {
        ChipFlow(spacing: 8) {
            ForEach(SampleData.receiptProducts, id: \.barcode) { product in
                Chip(product.name, systemImage: "barcode", isOn: false) {
                    Task { await lookUp(product.barcode) }
                }
            }
            Chip("A packet it doesn't know", systemImage: "questionmark", isOn: false) {
                Task { await lookUp(SampleData.unknownBarcode) }
            }
        }
    }

    private func lookUp(_ code: String) async {
        guard scanning, !code.isEmpty else { return }
        stage = .asking(code)
        torch = false
        let result = await ProductLookup.look(code, sample: sample)
        switch result {
        case .found(let product):
            onFound(product)
        case .notInCatalogue(let barcode):
            stage = .missing(barcode)
        case .failed(let message):
            stage = .failed(message)
        }
    }
}

// MARK: - Scan items (the check screen)

/**
 Scan items: the whole screen is the camera, as the cupboard's scanner is, and it keeps going.
 Each packet read is looked up and worked out (what it counts as), and a card rises with the
 receipt line it most looks like — That's it fills that line in, Pick another line lists the
 other food lines (the likeliest first) to choose from, and Not on this receipt lets it go.
 Then the camera looks for the next packet. Done closes it.

 The line offered is ProductMatch's best: the till's shorthand against the packet's name and
 brand, lines with no name yet (or only a guess) first in a tie. A packet still in front of the
 camera just after its line was filled is not read again straight away.
 */
struct ReceiptItemScanner: View {
    /// A food line on the receipt, as the check screen has it.
    struct Item: Equatable, Identifiable {
        let key: UUID
        let line: ReceiptLine
        /// No name yet, or only a guess: what a packet is most likely for.
        var open: Bool
        var id: UUID { key }
    }

    /// A line with how well it fits the packet in front of the camera.
    private struct Ranked: Identifiable {
        let item: Item
        let score: Double
        var id: UUID { item.key }
    }

    let items: [Item]
    let choices: [IngredientChoice]
    /// Previews and the Gallery: sample packets to tap instead of the camera, nothing sent.
    var sample = false
    /// Previews and the Gallery: start on this packet's card.
    var startWith: Product? = nil
    /// The person said a packet is this line: fill it in from it.
    var onAssign: (UUID, ProductFill) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var stage: Stage = .scanning
    @State private var torch = false
    /// Pick another line: the list of lines instead of the one offered.
    @State private var choosing = false
    /// What just happened, under the window: "Put on CHOB GRK YGRT. Next one?"
    @State private var note: String?
    @State private var matched = 0
    /// A new camera, to look again after ignoring the packet just done.
    @State private var cameraRun = 0
    @State private var lastCode: String?
    @State private var resumedAt = Date.distantPast

    enum Stage: Equatable {
        case scanning
        case asking(String)
        case found(Product, ProductFill)
        /// What went wrong, and the barcode or the reason.
        case missing(String, String)
    }

    private var scanning: Bool { stage == .scanning }
    /// Nothing to point: the Simulator, or a phone that will not lend the camera.
    private var noCamera: Bool { ScannerCamera.unavailable }
    private var live: Bool { !sample && !noCamera }

    var body: some View {
        ZStack {
            ScannerBackdrop()
                .ignoresSafeArea()
            if scanning && live {
                BarcodeCamera(torch: torch) { code in read(code) }
                    .id(cameraRun)
                    .ignoresSafeArea()
            }
            VStack(spacing: 18) {
                BarcodeAimBox()
                Text(note ?? "Point at an item's barcode")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.white.opacity(0.9))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            .offset(y: -40)
            .opacity(scanning ? 1 : 0.6)
            VStack(spacing: 0) {
                HStack {
                    Button("Done") { dismiss() }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .background(.white.opacity(0.18), in: Capsule())
                        .buttonStyle(PressFade())
                    Spacer()
                    if live {
                        ScannerRoundButton(torch ? "flashlight.on.fill" : "flashlight.off.fill",
                                           label: torch ? "Torch off" : "Torch on") { torch.toggle() }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 6)
                Spacer()
                if !scanning || !live {
                    card
                        .padding(.horizontal, 10)
                        .padding(.bottom, 12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .animation(.snappy(duration: 0.25), value: stage)
        .animation(.snappy(duration: 0.2), value: choosing)
        .task { await start() }
    }

    // MARK: The card

    private var card: some View {
        VStack(alignment: .leading, spacing: 14) {
            switch stage {
            case .scanning:
                // Only with no camera: a preview's sample packets, or the number typed.
                if sample {
                    sampleChooser
                } else {
                    Text("There's no camera here. Type the number under the stripes.")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                    BarcodeTypeField { code in Task { await lookUp(code) } }
                }
            case .asking(let code):
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Looking up \(code)…").font(.system(size: 14)).foregroundStyle(Palette.muted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            case .found(let product, let fill):
                foundCard(product, fill)
            case .missing(let title, let detail):
                productLine(title: title, detail: detail)
                Text("Tap its line on the receipt to say what it is by hand.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
                Button("Scan another") { resume(saying: nil) }
                    .buttonStyle(.kitchen(.primary, size: .small))
            }
        }
        .padding(16)
        .background(Palette.bg, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
    }

    /// The line a packet most looks like: the first ranked, if it has a word of the packet at all.
    private func bestItem(in lines: [Ranked]) -> Item? {
        guard let top = lines.first, top.score > 0 else { return nil }
        return top.item
    }

    /// Pick another line: every food line but the one offered (all of them when none was).
    private func otherLines(_ lines: [Ranked], besides best: Item?) -> [Ranked] {
        guard choosing, let best else { return lines }
        return lines.filter { $0.item.key != best.key }
    }

    /// "Chobani · 32 oz · counts as greek yogurt", under the packet's name.
    private func foundDetail(_ product: Product, _ fill: ProductFill) -> String {
        var parts: [String] = []
        let made = product.makeAndSize
        if !made.isEmpty { parts.append(made) }
        if !fill.countsAs.isEmpty { parts.append("counts as \(fill.countsAs)") }
        return parts.joined(separator: " · ")
    }

    private func pickWords(_ best: Item?) -> String {
        if best == nil { return "No line on this receipt looks like it. Which one is it?" }
        return "Which line is it?"
    }

    @ViewBuilder private func foundCard(_ product: Product, _ fill: ProductFill) -> some View {
        let lines = ranked(for: product)
        let best = bestItem(in: lines)
        productLine(title: product.name, detail: foundDetail(product, fill))
        if let best, !choosing {
            VStack(alignment: .leading, spacing: 6) {
                Text("Looks like: **\(best.line.text) · \(Money.text(best.line.price))**")
                    .font(.system(size: 15))
                    .foregroundStyle(Palette.text)
                    .lineLimit(2)
                if let change = fill.brandChange(on: best.line) {
                    Text(change).font(.system(size: 12)).foregroundStyle(Palette.muted)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            HStack(spacing: 8) {
                Button("That's it") { assign(best, fill) }
                    .buttonStyle(.kitchen(.primary, size: .small))
                Button("Pick another line") { choosing = true }
                    .buttonStyle(.kitchen(.secondary, size: .small))
            }
        } else {
            let others = otherLines(lines, besides: best)
            Text(pickWords(best))
                .font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.text)
            if others.isEmpty {
                Text("There are no other food lines on it.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
            } else {
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(others) { other in
                            Button { assign(other.item, fill) } label: { lineFace(other.item, fill: fill) }
                                .buttonStyle(PressFade())
                        }
                    }
                }
                .scrollBounceBehavior(.basedOnSize)
                .frame(maxHeight: 230)
            }
        }
        Button("Not on this receipt") { resume(saying: "Not on the receipt. Next one?") }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Palette.accentInk)
            .frame(maxWidth: .infinity)
    }

    /// A line to pick: as printed, what it counts as so far, and its price.
    private func lineFace(_ item: Item, fill: ProductFill) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.line.text)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                Text(now(item))
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
                if let change = fill.brandChange(on: item.line) {
                    Text(change).font(.system(size: 12)).foregroundStyle(Palette.faint).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text(Money.text(item.line.price))
                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                .foregroundStyle(Palette.text)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(Rectangle())
    }

    /// "Counts as greek yogurt", "A guess: bananas", "Not named yet".
    private func now(_ item: Item) -> String {
        guard let name = item.line.countsAs else { return "Not named yet" }
        return item.open ? "A guess: \(name)" : "Counts as \(name)"
    }

    private func productLine(title: String, detail: String) -> some View {
        HStack(spacing: 12) {
            RecipePhotoPlaceholder(hue: .sky, systemImage: "shippingbox", size: 52, radius: 12)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(2)
                if !detail.isEmpty {
                    Text(detail).font(.system(size: 12)).foregroundStyle(Palette.muted).lineLimit(2)
                }
            }
        }
    }

    /// Previews: the sample packets, and one the catalogue does not know.
    private var sampleChooser: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("No camera in a preview: try a sample packet.")
                .font(.system(size: 13)).foregroundStyle(Palette.muted)
            ChipFlow(spacing: 8) {
                ForEach(SampleData.receiptProducts, id: \.barcode) { product in
                    Chip(product.name, systemImage: "barcode", isOn: false) {
                        Task { await lookUp(product.barcode) }
                    }
                }
                Chip("A packet it doesn't know", systemImage: "questionmark", isOn: false) {
                    Task { await lookUp(SampleData.unknownBarcode) }
                }
            }
        }
    }

    // MARK: Behaviour

    /// The food lines, the most like this packet first.
    private func ranked(for product: Product) -> [Ranked] {
        let candidates = items.map { ProductMatch.Candidate(key: $0.key, text: $0.line.text, open: $0.open) }
        var out: [Ranked] = []
        for scored in ProductMatch.ranked(candidates, name: product.name, brand: product.brand) {
            if let item = items.first(where: { $0.key == scored.key }) {
                out.append(Ranked(item: item, score: scored.score))
            }
        }
        return out
    }

    /// A barcode off the camera.
    private func read(_ code: String) {
        // Still pointed at the packet just done: look again in a moment, rather than at it again.
        if code == lastCode, Date.now.timeIntervalSince(resumedAt) < 2.5 {
            Task {
                try? await Task.sleep(for: .seconds(1))
                cameraRun += 1
            }
            return
        }
        lastCode = code
        Task { await lookUp(code) }
    }

    private func lookUp(_ code: String) async {
        stage = .asking(code)
        note = nil
        torch = false
        let result = await ProductLookup.look(code, sample: sample)
        switch result {
        case .found(let product):
            let fill = await ProductFill.make(for: product, choices: choices, thinker: ReceiptAI.thinker)
            stage = .found(product, fill)
        case .notInCatalogue(let barcode):
            stage = .missing("Not in the catalogue.", barcode)
        case .failed(let message):
            stage = .missing("Couldn't look it up.", message)
        }
    }

    private func assign(_ item: Item, _ fill: ProductFill) {
        onAssign(item.key, fill)
        matched += 1
        resume(saying: "Put on \(item.line.text) — \(matched) so far. Next one?")
    }

    /// Back to the camera for the next packet.
    private func resume(saying: String?) {
        choosing = false
        note = saying
        stage = .scanning
        resumedAt = .now
    }

    /// Previews and the Gallery: straight to a packet's card.
    private func start() async {
        guard let startWith, scanning else { return }
        let fill = await ProductFill.make(for: startWith, choices: choices, thinker: nil)
        stage = .found(startWith, fill)
    }
}

#Preview("Scan its barcode") {
    Color.clear.sheet(isPresented: .constant(true)) {
        ScrollView {
            LineBarcodeScanner(lineText: "CHOB GRK YGRT", sample: true, onFound: { _ in }, onClose: {})
                .padding(.horizontal, 20)
                .padding(.top, 24)
        }
        .kitchenSheet([.medium, .large])
    }
}

#Preview("Scan items — a match") {
    ReceiptItemScanner(items: SampleData.receiptScanItems, choices: SampleData.receiptChoices, sample: true,
                       startWith: SampleData.receiptProducts[0]) { _, _ in }
}

#Preview("Scan items — samples, dark") {
    ReceiptItemScanner(items: SampleData.receiptScanItems, choices: SampleData.receiptChoices, sample: true) { _, _ in }
        .preferredColorScheme(.dark)
}
