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

    enum Stage {
        case camera
        case reading(String)
        case review(ReceiptDraft, ReceiptScanText)
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
            start = .review(sample, ReceiptScanText(lines: SampleData.receiptText, barcode: nil))
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
        case .review(let draft, let scan):
            NavigationStack {
                ReceiptReviewView(session: session, draft: draft, scan: scan, choices: choices,
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
            // The sample receipt's words, read by the real server: the whole flow, minus the camera.
            Button {
                Task { await readText(ReceiptScanText(lines: SampleData.receiptText, barcode: nil)) }
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
            stage = .review(draft, scan)
        } catch {
            stage = .failed(error.localizedDescription, settings: false)
        }
    }
}

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
