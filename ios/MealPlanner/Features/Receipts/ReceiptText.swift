import CoreGraphics
import CoreImage
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
 apart on the same row, usually come back as two. So the pieces are put back into rows, each row
 read left to right with a space between, which is the shape the server's reader expects.

 A receipt is never photographed quite straight, and a long one curls. Each piece's own slant is
 measured from its corners, the page is turned straight by the slant most pieces share, and a
 piece joins the row whose line — followed along its own slant to where the piece is — passes
 through the piece's middle. Grouping by upright boxes instead, a tilt of two or three degrees
 put each price on the row above or below its item.
 */
enum ReceiptText {
    /// A piece of text and where it was, in Vision's terms: 0…1 across the page, from the bottom,
    /// with its four corners when Vision gave them (it does), for its slant.
    struct Word {
        let text: String
        let box: CGRect
        var topLeft: CGPoint?
        var topRight: CGPoint?
        var bottomLeft: CGPoint?
        var bottomRight: CGPoint?
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
        // Upright, for its shape: Vision's points are 0…1 each way, so a tall page squashes slants.
        let upright = orientation == .left || orientation == .right || orientation == .leftMirrored
            || orientation == .rightMirrored
        let aspect = upright ? CGFloat(image.height) / CGFloat(max(image.width, 1))
            : CGFloat(image.width) / CGFloat(max(image.height, 1))

        /*
         Read once as Vision reads best; a page where that finds hardly a price is read again in the
         ways that rescue it, and the read with the most prices in it is kept. A faded thermal print
         (ShopRite's) is the case: the newest text reading took it for upside down and returned
         nonsense, where the one before it, or the same page with more contrast, read it fine.
         */
        var best = try words(in: image, orientation: orientation, revision: nil)
        if prices(in: best) < 5 {
            let others: [(CGImage, Int?)] = [(image, VNRecognizeTextRequestRevision2), (contrasted(image) ?? image, nil)]
            for (page, revision) in others {
                guard let tried = try? words(in: page, orientation: orientation, revision: revision) else { continue }
                if prices(in: tried) > prices(in: best) { best = tried }
            }
        }

        // Apart, and allowed to fail: a missing barcode costs nothing but the duplicate check.
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
        let barcodes = VNDetectBarcodesRequest()
        try? handler.perform([barcodes])
        return (ReceiptText.rows(best, aspect: aspect), ReceiptText.barcode(barcodes.results ?? []))
    }

    /// Vision's pieces of text on a page, with their corners. `revision` nil is Vision's newest.
    private static func words(in image: CGImage, orientation: CGImagePropertyOrientation, revision: Int?) throws -> [Word] {
        let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
        let text = VNRecognizeTextRequest()
        if let revision { text.revision = revision }
        text.recognitionLevel = .accurate
        // Till abbreviations ("KNGS BBY SPNCH") are not English, and "correcting" them loses them.
        text.usesLanguageCorrection = false
        text.recognitionLanguages = ["en-US"]
        // A long receipt is one tall page: its print is a small share of the page's height, under
        // the size Vision would otherwise skip as too small to be text.
        text.minimumTextHeight = 0
        try handler.perform([text])
        return (text.results ?? []).compactMap { observation -> Word? in
            guard let best = observation.topCandidates(1).first else { return nil }
            let string = best.string.trimmingCharacters(in: .whitespaces)
            return string.isEmpty ? nil : Word(text: string, box: observation.boundingBox,
                                               topLeft: observation.topLeft, topRight: observation.topRight,
                                               bottomLeft: observation.bottomLeft, bottomRight: observation.bottomRight)
        }
    }

    /// How many pieces look like a price — the measure of a read that worked.
    static func prices(in words: [Word]) -> Int {
        words.filter { $0.text.range(of: #"\d[.,]\d\d\b"#, options: .regularExpression) != nil }.count
    }

    /// The page in grey with its contrast raised, for faded print.
    private static func contrasted(_ image: CGImage) -> CGImage? {
        let input = CIImage(cgImage: image)
            .applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0, kCIInputContrastKey: 1.8,
                                                            kCIInputBrightnessKey: -0.1])
            .applyingFilter("CISharpenLuminance", parameters: [kCIInputSharpnessKey: 0.6])
        return CIContext().createCGImage(input, from: input.extent)
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
     Pieces of text back into lines, each row left to right, the rows top to bottom. `aspect` is
     the page's width over its height, so a slant is measured in the page's own proportions. Pure,
     so it can be checked without a camera.
     */
    static func rows(_ words: [Word], aspect: CGFloat = 1) -> [String] {
        // Each piece in page units (the height is 1): its middle, length, height and slant.
        struct Piece {
            let text: String
            let x: CGFloat
            let y: CGFloat
            let length: CGFloat
            let height: CGFloat
            let angle: CGFloat
        }
        let pieces: [Piece] = words.compactMap { word in
            let scale = { (p: CGPoint) in CGPoint(x: p.x * aspect, y: p.y) }
            if let tl = word.topLeft, let tr = word.topRight, let bl = word.bottomLeft, let br = word.bottomRight {
                let left = scale(CGPoint(x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2))
                let right = scale(CGPoint(x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2))
                let length = hypot(right.x - left.x, right.y - left.y)
                let height = (hypot((tl.x - bl.x) * aspect, tl.y - bl.y) + hypot((tr.x - br.x) * aspect, tr.y - br.y)) / 2
                guard length > 0, height > 0 else { return nil }
                return Piece(text: word.text, x: (left.x + right.x) / 2, y: (left.y + right.y) / 2,
                             length: length, height: height, angle: atan2(right.y - left.y, right.x - left.x))
            }
            guard word.box.height > 0 else { return nil }
            return Piece(text: word.text, x: word.box.midX * aspect, y: word.box.midY,
                         length: word.box.width * aspect, height: word.box.height, angle: 0)
        }
        guard !pieces.isEmpty else { return [] }

        // The page's slant: the one most long pieces share (a short piece's is mostly noise).
        let long = pieces.filter { $0.length > $0.height * 3 }.map(\.angle).sorted()
        let tilt = long.isEmpty ? 0 : max(-0.3, min(0.3, long[long.count / 2]))
        let (c, s) = (cos(tilt), sin(tilt))

        // Turned straight: x along the rows, y up the page. A piece keeps what is left of its slant
        // once the page's is taken off, for where a curled row goes.
        struct Straight {
            let text: String
            let x: CGFloat
            let y: CGFloat
            let length: CGFloat
            let height: CGFloat
            let slant: CGFloat
        }
        let turned = pieces.map { p in
            (piece: p, x: p.x * c + p.y * s, y: -p.x * s + p.y * c)
        }
        // A short piece's own slant is too rough to follow across the page (a degree or two out
        // puts "2 @ 0.99" off its own price), so a row follows the long pieces around it: where a
        // receipt curls, those near the curl lean the same way.
        let guides = turned.filter { $0.piece.length > $0.piece.height * 4 }
        func slant(near y: CGFloat, height: CGFloat) -> CGFloat {
            let near = guides.filter { abs($0.y - y) < height * 8 }.map { $0.piece.angle - tilt }.sorted()
            return near.isEmpty ? 0 : max(-0.2, min(0.2, near[near.count / 2]))
        }
        let straight = turned.map { t in
            Straight(text: t.piece.text, x: t.x, y: t.y, length: t.piece.length, height: t.piece.height,
                     slant: slant(near: t.y, height: t.piece.height))
        }

        struct Row {
            var words: [Straight]
            /// The longest piece in the row: its line is the row's.
            var anchor: Straight

            /// Where the row's line is, at `x` along it.
            func y(at x: CGFloat) -> CGFloat {
                anchor.y + tan(anchor.slant) * (x - anchor.x)
            }
            var height: CGFloat { words.map(\.height).reduce(0, +) / CGFloat(words.count) }
        }

        var rows: [Row] = []
        // Longest first, so each row is anchored by its most telling piece; then down the page.
        for piece in straight.sorted(by: { ($0.length, $0.y) > ($1.length, $1.y) }) {
            var best: Int?
            var bestDistance = CGFloat.greatestFiniteMagnitude
            for (index, row) in rows.enumerated() {
                let distance = abs(piece.y - row.y(at: piece.x))
                // Within two thirds of the smaller height of the row's line: the same row. Rows on a
                // receipt are further apart than that, line spacing and all.
                if distance < min(piece.height, row.height) * 0.65, distance < bestDistance {
                    bestDistance = distance
                    best = index
                }
            }
            if let best {
                rows[best].words.append(piece)
            } else {
                rows.append(Row(words: [piece], anchor: piece))
            }
        }

        // Top to bottom by where the row's pieces are — not its line run out to the edge, where a
        // short anchor's slant would carry it past its neighbours.
        return rows
            .sorted { $0.words.map(\.y).reduce(0, +) / CGFloat($0.words.count) > $1.words.map(\.y).reduce(0, +) / CGFloat($1.words.count) }
            .map { row in row.words.sorted { $0.x < $1.x }.map(\.text).joined(separator: " ") }
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
