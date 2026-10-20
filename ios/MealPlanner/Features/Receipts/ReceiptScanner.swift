import AVFoundation
import SwiftUI
import UIKit
import VisionKit

/**
 Scanning a receipt, start to finish, over the whole screen: Apple's document camera (it finds the
 paper's edges, flattens it, and takes as many pages as a long receipt needs), then the words read
 off it on the phone, then the server's draft to check (`ReceiptReviewView`), then saved.

 One cover for all of it, each step replacing the last — never a sheet on a sheet. Cancel at any
 point throws the scan away; nothing is saved until Save.
 */
struct ReceiptScanFlow: View {
    var session: Session
    /// What a line can count as: the grocery list's names, ticked rows and the shop just finished
    /// included.
    var choices: [IngredientChoice]
    /// Previews, the Gallery and `-mp_debug_screen receipt-review`: open on this draft, send nothing.
    var sample: ReceiptDraft?
    var onSaved: (ReceiptResponse) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var stage: Stage
    /// The words from the last scan, so a server that could not be reached can be asked again
    /// without photographing the receipt again.
    @State private var lastScan: ReceiptScanText?
    /// The pages photographed, kept with the receipt when it is saved.
    @State private var pages: [UIImage] = []

    enum Stage {
        case camera
        case reading(String)
        case review(ReceiptDraft, ReceiptScanText, [UIImage])
        case failed(String, settings: Bool)
    }

    init(session: Session, choices: [IngredientChoice] = [], sample: ReceiptDraft? = nil,
         onSaved: @escaping (ReceiptResponse) -> Void) {
        self.session = session
        self.choices = choices
        self.sample = sample
        self.onSaved = onSaved
        let start: Stage
        if let sample {
            start = .review(sample, ReceiptScanText(lines: SampleData.receiptText, barcode: nil), [])
        } else {
            start = .camera
        }
        _stage = State(initialValue: start)
    }

    var body: some View {
        switch stage {
        case .camera:
            camera
        case .reading(let message):
            reading(message)
        case .review(let draft, let scan, let photos):
            NavigationStack {
                ReceiptReviewView(session: session, draft: draft, scan: scan, photos: photos, choices: choices,
                                  sample: sample != nil,
                                  onCancel: { dismiss() },
                                  onSaved: { saved in
                                      onSaved(saved)
                                      dismiss()
                                  })
            }
        case .failed(let message, let settings):
            failed(message, settings: settings)
        }
    }

    // MARK: - Steps

    /// Camera access refused in Settings: the document camera would only show black.
    private var cameraRefused: Bool {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        return status == .denied || status == .restricted
    }

    @ViewBuilder private var camera: some View {
        if cameraRefused {
            failed("Waxwing isn't allowed to use the camera. Turn it on in Settings → Waxwing → Camera, then scan again.",
                   settings: true)
        } else if ReceiptCamera.isSupported {
            ReceiptCamera(
                onScan: { pages in Task { await read(pages) } },
                onCancel: { dismiss() },
                onFail: { problem in
                    stage = .failed("The camera stopped: \(problem.localizedDescription)", settings: false)
                }
            )
            .ignoresSafeArea()
        } else {
            noCamera
        }
    }

    /// The Simulator, or a phone without the document camera.
    private var noCamera: some View {
        VStack(spacing: 16) {
            Spacer()
            Tile("doc.text.viewfinder", tone: .sky, size: 56)
            Text("No camera to scan with").titleFont(26).foregroundStyle(Palette.text)
            Text("On an iPhone the receipt scanner opens here. The Simulator has no camera.")
                .font(.system(size: 15)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            Spacer()
            #if DEBUG
            // The sample receipt drawn as a page and read like a photographed one — the phone's
            // own reading, then the real server: the whole flow, minus the camera.
            Button {
                Task { await read([SampleReceiptPage.draw(SampleData.receiptText)]) }
            } label: {
                Label("Read a sample receipt", systemImage: "doc.text")
            }
            .buttonStyle(.primary)
            #endif
            Button("Close") { dismiss() }.buttonStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .pageBackground()
    }

    private func reading(_ message: String) -> some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large).tint(Palette.muted)
            Text(message).font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.text)
            Text("The words are read on this phone; your kitchen server works out the prices.")
                .font(.system(size: 13)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .pageBackground()
    }

    private func failed(_ message: String, settings: Bool) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Tile(settings ? "camera" : "doc.text.magnifyingglass", tone: .mustard, size: 56)
            Text(settings ? "Camera is off" : "That didn't work").titleFont(26).foregroundStyle(Palette.text)
            Text(message).font(.system(size: 15)).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            Spacer()
            if settings {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .buttonStyle(.primary)
            } else {
                if let lastScan {
                    Button("Try again") { Task { await readText(lastScan) } }.buttonStyle(.primary)
                }
                Button("Scan again") { stage = .camera }
                    .buttonStyle(KitchenButtonStyle.kitchen(lastScan == nil ? .primary : .secondary))
            }
            Button("Close") { dismiss() }.buttonStyle(.secondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .pageBackground()
    }

    // MARK: - Behaviour

    private func read(_ pages: [UIImage]) async {
        stage = .reading("Reading the receipt…")
        lastScan = nil
        self.pages = pages
        do {
            let scan = try await ReceiptText.read(pages)
            await readText(scan)
        } catch {
            stage = .failed("Couldn't read the words off it: \(error.localizedDescription)", settings: false)
        }
    }

    /// The words to the server, which answers with the draft to check.
    private func readText(_ scan: ReceiptScanText) async {
        guard !scan.lines.isEmpty else {
            stage = .failed("No writing found on that. Try again with the whole receipt flat, in good light.",
                            settings: false)
            return
        }
        guard let household = session.household?.id else { return }
        lastScan = scan
        stage = .reading("Working out the prices…")
        do {
            let draft = try await APIClient.shared.readReceipt(household: household, lines: scan.lines,
                                                               barcode: scan.barcode)
            stage = .review(draft, scan, pages)
        } catch {
            stage = .failed(error.localizedDescription, settings: false)
        }
    }
}

#if DEBUG
/// The sample receipt as a page of print, for the Simulator, which has no camera: a till's
/// monospaced lines, the price on the right, a little crooked, as a real photograph would be.
enum SampleReceiptPage {
    static func draw(_ lines: [String]) -> UIImage {
        let width: CGFloat = 760, rowHeight: CGFloat = 52
        let size = CGSize(width: width, height: 120 + rowHeight * CGFloat(lines.count))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let font = UIFont.monospacedSystemFont(ofSize: 28, weight: .regular)
        let ink: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor(white: 0.1, alpha: 1)]
        let flat = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor(white: 0.98, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            for (row, line) in lines.enumerated() {
                let y = 60 + rowHeight * CGFloat(row)
                if let price = line.range(of: #"\s(\d+\.\d\d-?(\s[A-Z])?)$"#, options: .regularExpression), row > 2 {
                    let words = String(line[..<price.lowerBound]), amount = String(line[price]).trimmingCharacters(in: .whitespaces)
                    (words as NSString).draw(at: CGPoint(x: 40, y: y), withAttributes: ink)
                    let measured = (amount as NSString).size(withAttributes: ink)
                    (amount as NSString).draw(at: CGPoint(x: width - 40 - measured.width, y: y), withAttributes: ink)
                } else {
                    (line as NSString).draw(at: CGPoint(x: 40, y: y), withAttributes: ink)
                }
            }
        }
        // Two degrees off straight.
        let angle: CGFloat = 2 * .pi / 180
        let turned = CGSize(width: size.width * cos(angle) + size.height * sin(angle),
                            height: size.height * cos(angle) + size.width * sin(angle))
        return UIGraphicsImageRenderer(size: turned, format: format).image { context in
            UIColor(white: 0.92, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: turned))
            context.cgContext.translateBy(x: turned.width / 2, y: turned.height / 2)
            context.cgContext.rotate(by: -angle)
            flat.draw(at: CGPoint(x: -size.width / 2, y: -size.height / 2))
        }
    }
}
#endif

// MARK: - The document camera

/**
 VisionKit's document camera: edge finding, flattening and several pages, all Apple's. It calls
 back once with every page in order, or when it is cancelled or fails. It is not available in
 the Simulator (`isSupported` is false there).
 */
struct ReceiptCamera: UIViewControllerRepresentable {
    var onScan: ([UIImage]) -> Void
    var onCancel: () -> Void
    var onFail: (Error) -> Void

    /// VisionKit's own answer, except in the Simulator: from iOS 27 it says yes there too, then
    /// opens on a black screen that says "Unable to capture media".
    static var isSupported: Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        return VNDocumentCameraViewController.isSupported
        #endif
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: VNDocumentCameraViewController, context: Context) {
        context.coordinator.parent = self
    }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        var parent: ReceiptCamera

        init(_ parent: ReceiptCamera) {
            self.parent = parent
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                          didFinishWith scan: VNDocumentCameraScan) {
            let pages = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
            parent.onScan(pages)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            parent.onCancel()
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                          didFailWithError error: Error) {
            parent.onFail(error)
        }
    }
}

#Preview("Receipt — check it") {
    ReceiptScanFlow(session: .preview, choices: SampleData.receiptChoices, sample: SampleData.receiptDraft) { _ in }
}

#Preview("Receipt — no camera, dark") {
    ReceiptScanFlow(session: .preview) { _ in }
        .preferredColorScheme(.dark)
}
