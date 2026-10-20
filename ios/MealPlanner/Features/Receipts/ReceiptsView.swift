import SwiftUI

/**
 Receipts (Groceries ••• → Receipts): every receipt the household has scanned, newest first —
 "Kings Food Markets · Oct 18 · $86.40 · 23 priced". Tap one to see it as it was saved; swipe
 left to delete it, which takes the prices it saved with it (after asking, since those prices are
 what the grocery list shows).
 */
struct ReceiptsView: View {
    var session: Session
    /// Previews, the Gallery and `-mp_debug_screen receipts`: these, and nothing from the server.
    var sample: [ReceiptSummary]?
    /// The receipt a sample row opens.
    var sampleDetail: ReceiptResponse?
    /// Scan a receipt from here, which replaces this screen with the scanner.
    var onScan: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var receipts: [ReceiptSummary] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var deleting: ReceiptSummary?

    var body: some View {
        List {
            if let error {
                NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle").pageRow(top: 8, bottom: 12)
            }
            if !loaded {
                ProgressView().frame(maxWidth: .infinity).pageRow(top: 32)
            } else if receipts.isEmpty {
                empty.pageRow(top: 32)
            } else {
                ForEach(Array(receipts.enumerated()), id: \.element.id) { index, receipt in
                    NavigationLink(value: receipt.id) {
                        ReceiptSummaryRow(receipt: receipt)
                    }
                    .cardRow(first: index == 0, last: index == receipts.count - 1, padding: 14)
                    .swipeActions(edge: .trailing) {
                        Button("Delete", systemImage: "trash", role: .destructive) { deleting = receipt }
                            .tint(Palette.accent)
                    }
                }
                Text("Swipe left to delete a receipt. The prices it saved go with it.")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.faint)
                    .pageRow(top: 14, bottom: 24, horizontal: 24)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 0)
        .pageBackground()
        .refreshable { await load() }
        .navigationTitle("Receipts")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            BarTextButton("Done", placement: .topBarLeading) { dismiss() }
            BarTextButton("Scan", placement: .topBarTrailing, bold: true, action: onScan)
        }
        .navigationDestination(for: UUID.self) { id in
            ReceiptDetailView(session: session, id: id, sample: sampleDetail)
        }
        .confirmationDialog("Delete this receipt?",
                            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible,
                            presenting: deleting) { receipt in
            Button("Delete receipt", role: .destructive) {
                Task { await delete(receipt) }
            }
        } message: { receipt in
            Text(deleteMessage(receipt))
        }
        .task { await load() }
    }

    private var empty: some View {
        VStack(spacing: 12) {
            Tile("receipt", tone: .herb, size: 52)
            Text("No receipts yet").titleFont(20).foregroundStyle(Palette.text)
            Text("After a shop, scan the receipt and Waxwing keeps what you paid for each thing — the grocery list shows it next time.")
                .font(.system(size: 14))
                .foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center)
            Button(action: onScan) {
                Label("Scan a receipt", systemImage: "doc.text.viewfinder")
            }
            .buttonStyle(.kitchen(.primary, size: .small))
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
    }

    private func deleteMessage(_ receipt: ReceiptSummary) -> String {
        let shop = receipt.storeName ?? "this shop"
        guard let priced = receipt.pricedCount, priced > 0 else { return "The receipt from \(shop) goes." }
        return "The \(priced) \(priced == 1 ? "price" : "prices") it saved from \(shop) go too."
    }

    // MARK: - Behaviour

    private func load() async {
        if let sample {
            receipts = sample
            loaded = true
            return
        }
        guard let household = session.household?.id else { loaded = true; return }
        do {
            receipts = try await APIClient.shared.receipts(household: household)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    /// Gone from the list at once; back again if the server says no.
    private func delete(_ receipt: ReceiptSummary) async {
        withAnimation { receipts.removeAll { $0.id == receipt.id } }
        guard sample == nil, let household = session.household?.id else { return }
        do {
            try await APIClient.shared.deleteReceipt(household: household, id: receipt.id)
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }
}

/// A receipt in the list: the shop over "Oct 18 · $86.40 · 23 priced".
struct ReceiptSummaryRow: View {
    let receipt: ReceiptSummary

    var body: some View {
        HStack(spacing: 12) {
            Tile("receipt", tone: .herb, size: 38)
            VStack(alignment: .leading, spacing: 2) {
                Text(receipt.storeName ?? "A shop")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Palette.text)
                    .lineLimit(1)
                Text(receipt.line)
                    .font(.system(size: 13).monospacedDigit())
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/**
 A saved receipt, read-only: the shop, the day, the total and how many lines kept a price, then
 every line as it was saved — what it counts as, the price, Sale, Not food.
 */
struct ReceiptDetailView: View {
    var session: Session
    let id: UUID
    /// Previews and the Gallery: this, and nothing from the server.
    var sample: ReceiptResponse?
    /// Where back goes: the list, or the review screen that opened an earlier copy.
    var backLabel = "Receipts"

    @State private var receipt: ReceiptResponse?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let receipt {
                    header(receipt)
                    if let photos = receipt.photoIds, !photos.isEmpty {
                        ReceiptPhotoStrip(pages: .kept(photos),
                                          name: [receipt.storeName ?? "Receipt",
                                                 ReceiptWords.day(receipt.purchasedOn ?? receipt.createdAt)]
                                              .compactMap { $0 }.joined(separator: " "))
                    }
                    SectionLabel("Lines", trailing: "\(receipt.lines.count)")
                        .padding(.top, 4)
                    if !receipt.lines.isEmpty {
                        ListGroup {
                            ForEach(Array(receipt.lines.enumerated()), id: \.offset) { _, line in
                                ReceiptLineRow(line: line)
                            }
                        }
                    }
                } else if let error {
                    NoteBox(error, tone: .accent, systemImage: "exclamationmark.triangle")
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 32)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .pageBackground()
        .navigationTitle(receipt?.storeName ?? "Receipt")
        .navigationBarTitleDisplayMode(.inline)
        .textBackButton(backLabel)
        .task { await load() }
    }

    private func header(_ receipt: ReceiptResponse) -> some View {
        Card(spacing: 6) {
            Text(receipt.storeName ?? "A shop").titleFont(24).foregroundStyle(Palette.text)
            if let day = ReceiptWords.day(receipt.purchasedOn ?? receipt.createdAt) {
                Text(day).font(.system(size: 14)).foregroundStyle(Palette.muted)
            }
            HStack(spacing: 8) {
                if let total = receipt.total {
                    Text(Money.text(total))
                        .font(.system(size: 22, weight: .semibold).monospacedDigit())
                        .foregroundStyle(Palette.text)
                }
                Spacer(minLength: 8)
                Pill("\(receipt.pricedCount ?? 0) priced", tone: .herb, systemImage: "tag")
            }
            .padding(.top, 4)
            if let line = sumsLine(receipt) {
                Text(line)
                    .font(.system(size: 13).monospacedDigit())
                    .foregroundStyle(Palette.muted)
            }
        }
    }

    /// "Subtotal $39.81 · Tax $0.01", whichever of them the server sent.
    private func sumsLine(_ receipt: ReceiptResponse) -> String? {
        var parts: [String] = []
        if let subtotal = receipt.subtotal { parts.append("Subtotal \(Money.text(subtotal))") }
        if let tax = receipt.tax { parts.append("Tax \(Money.text(tax))") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func load() async {
        if let sample {
            receipt = sample
            return
        }
        guard let household = session.household?.id else { return }
        do {
            receipt = try await APIClient.shared.receipt(household: household, id: id)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

#Preview("Receipts") {
    NavigationStack {
        ReceiptsView(session: .preview, sample: SampleData.receipts, sampleDetail: SampleData.receiptDetail, onScan: {})
    }
}

#Preview("Receipts — none yet, dark") {
    NavigationStack {
        ReceiptsView(session: .preview, sample: [], onScan: {})
    }
    .preferredColorScheme(.dark)
}

#Preview("A saved receipt") {
    NavigationStack {
        ReceiptDetailView(session: .preview, id: SampleData.receiptDetail.id, sample: SampleData.receiptDetail)
    }
}
