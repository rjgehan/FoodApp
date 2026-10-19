import CoreGraphics
import Foundation
import ImageIO
import UIKit
import Vision

/// The words read off a scanned receipt, one visual row per line, top to bottom across its
/// pages — and the first barcode found on it, which only tells a receipt scanned twice.
struct ReceiptScanText: Hashable {
    var lines: [String]
    var barcode: String?

    /// Kept with the saved receipt, for when the reader gets better.
    var rawText: String { lines.joined(separator: "\n") }
}

/**
 Reading a receipt's pages on the phone, with Apple's own text recognition (Vision) — nothing
 leaves the phone but the words. The rules that make sense of them live on the server.

 Vision hands back pieces of text, not lines: on a receipt the item's name and its price, far
 apart on the same row, usually come back as two. So the pieces are put back into rows — two
 pieces share a row when they overlap by more than half the height of the smaller — and each
 row is read left to right with a space between, which is the shape the server's reader expects.
 */
enum ReceiptText {
    /// A piece of text and where it was, in Vision's terms: 0…1 across the page, from the bottom.
    struct Word {
        let text: String
        let box: CGRect
    }

    /**
     Every page, in order, off the main thread. Throws only when Vision itself fails; a page
     with no writing on it just adds no lines.
     */
    static func read(_ pages: [UIImage]) async throws -> ReceiptScanText {
        let prepared: [(CGImage, CGImagePropertyOrientation)] = pages.compactMap { page -> (CGImage, CGImagePropertyOrientation)? in
            if let image = page.cgImage { return (image, orientation(page.imageOrientation)) }
            // A page held as something other than a bitmap: drawn once into one, upright.
            let drawn = UIGraphicsImageRenderer(size: page.size).image { _ in page.draw(at: .zero) }
            return drawn.cgImage.map { ($0, CGImagePropertyOrientation.up) }
        }
        return try await Task.detached(priority: .userInitiated) { () async throws -> ReceiptScanText in
            var lines: [String] = []
            var barcode: String?
            for (image, orientation) in prepared {
                let page = try ReceiptText.readPage(image, orientation: orientation)
                lines.append(contentsOf: page.lines)
                if barcode == nil { barcode = page.barcode }
            }
            return ReceiptScanText(lines: lines, barcode: barcode)
        }.value
    }

    /// One page: its rows of text, and its barcode if it has one. Blocks; call it off the main thread.
    static func readPage(_ image: CGImage, orientation: CGImagePropertyOrientation) throws -> (lines: [String], barcode: String?) {
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])

        let text = VNRecognizeTextRequest()
        text.recognitionLevel = .accurate
        // Till abbreviations ("KNGS BBY SPNCH") are not English, and "correcting" them loses them.
        text.usesLanguageCorrection = false
        text.recognitionLanguages = ["en-US"]
        try handler.perform([text])
        let words: [Word] = (text.results ?? []).compactMap { observation -> Word? in
            guard let best = observation.topCandidates(1).first else { return nil }
            let string = best.string.trimmingCharacters(in: .whitespaces)
            return string.isEmpty ? nil : Word(text: string, box: observation.boundingBox)
        }

        // Apart, and allowed to fail: a missing barcode costs nothing but the duplicate check.
        let barcodes = VNDetectBarcodesRequest()
        try? handler.perform([barcodes])
        return (ReceiptText.rows(words), ReceiptText.barcode(barcodes.results ?? []))
    }

    /// The server keeps at most this much of a barcode, and refuses a longer one outright.
    static let barcodeLimit = 120

    /// Square codes: on a receipt usually the same survey or app link on every one from that shop.
    private static let squareCodes: Set<VNBarcodeSymbology> = [.qr, .microQR, .aztec, .dataMatrix]

    /**
     The receipt's own barcode, if it has one: a till's 1D code (the transaction number) before any
     square code, which is usually the same link printed on every receipt from the shop and would
     make each new one look like a copy. Nothing longer than the server keeps — a long survey link
     would otherwise get the whole scan refused.
     */
    static func barcode(_ observations: [VNBarcodeObservation]) -> String? {
        let usable = observations.compactMap { observation -> (code: String, square: Bool)? in
            guard let code = observation.payloadStringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !code.isEmpty, code.count <= barcodeLimit else { return nil }
            return (code, squareCodes.contains(observation.symbology))
        }
        return (usable.first { !$0.square } ?? usable.first)?.code
    }

    /**
     Pieces of text back into lines: grouped into rows by how much they overlap up and down,
     each row left to right, the rows top to bottom. Pure, so it can be checked without a camera.
     */
    static func rows(_ words: [Word]) -> [String] {
        struct Row {
            var minY: CGFloat
            var maxY: CGFloat
            var words: [Word]
            var midY: CGFloat { (minY + maxY) / 2 }
            var height: CGFloat { maxY - minY }
        }

        var rows: [Row] = []
        // Top first: Vision measures from the bottom of the page.
        for word in words.sorted(by: { $0.box.midY > $1.box.midY }) {
            let box = word.box
            var best: Int?
            var bestShare: CGFloat = 0.5
            for (index, row) in rows.enumerated() {
                let overlap = min(box.maxY, row.maxY) - max(box.minY, row.minY)
                let share = overlap / max(min(box.height, row.height), 0.0001)
                if share > bestShare {
                    bestShare = share
                    best = index
                }
            }
            if let best {
                // The row's band is the average of its pieces, not their union, so a receipt
                // photographed a little crooked does not let one row swallow the next.
                let count = CGFloat(rows[best].words.count)
                rows[best].minY = (rows[best].minY * count + box.minY) / (count + 1)
                rows[best].maxY = (rows[best].maxY * count + box.maxY) / (count + 1)
                rows[best].words.append(word)
            } else {
                rows.append(Row(minY: box.minY, maxY: box.maxY, words: [word]))
            }
        }

        return rows
            .sorted { $0.midY > $1.midY }
            .map { row in
                row.words.sorted { $0.box.minX < $1.box.minX }.map(\.text).joined(separator: " ")
            }
            .filter { !$0.isEmpty }
    }

    /// UIKit's way of saying which way up a picture is, in Vision's terms.
    static func orientation(_ orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch orientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
