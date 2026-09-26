import AVFoundation
import SwiftUI

/**
 Scan a barcode, then either put it in the cupboard or find out it is already there.

 Both halves matter. In the kitchen you are putting shopping away; in a shop you are asking
 "do we already have this", which is the question a written list answers worst. So a scan that
 matches something you own is a result, not a dead end — it says where it already is and
 declines to offer you a second one.

 The camera is AVFoundation's own barcode reader rather than anything shipped with the app.
 It is the same hardware path the Camera app uses, it costs nothing, and on a phone it is far
 better than decoding frames in software — which is what the web has to do, because Safari
 will not lend it this.
*/
struct ScanBarcodeSheet: View {
    var session: Session
    /// What is already in the cupboard, so a scan can recognise it.
    let items: [CupboardItem]
    var onAdded: (CupboardItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var stage: Stage = .scanning
    @State private var name = ""
    @State private var problem: String?
    @State private var busy = false

    private enum Stage {
        case scanning
        case asking(String)
        case found(Product, CupboardItem?)
        case unknown(String)
    }

    var body: some View {
        NavigationStack {
            Group {
                switch stage {
                case .scanning:
                    VStack(spacing: 12) {
                        BarcodeCamera { code in Task { await lookUp(code) } }
                            .aspectRatio(3.0 / 4.0, contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        if let problem {
                            Text(problem).font(.footnote).foregroundStyle(.red)
                                .multilineTextAlignment(.center)
                        } else {
                            Text("Point at the barcode").font(.subheadline).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding(16)

                case .asking(let code):
                    VStack(spacing: 10) {
                        ProgressView()
                        Text("Looking up \(code)").font(.subheadline).foregroundStyle(.secondary)
                    }

                case .found(let product, let already):
                    Form {
                        Section {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(product.name).font(.title3.weight(.semibold))
                                if !describe(product).isEmpty {
                                    Text(describe(product)).font(.subheadline).foregroundStyle(.secondary)
                                }
                                Text(product.barcode).font(.caption).foregroundStyle(.tertiary)
                            }
                            .padding(.vertical, 4)
                        }
                        if let already {
                            Section {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("You already have this.")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(Palette.accent)
                                    Text("It is in the cupboard as “\(already.name)”"
                                         + (already.runningLow ? ", and it is marked running low." : "."))
                                        .font(.subheadline)
                                }
                                .padding(.vertical, 2)
                            }
                            .listRowBackground(Palette.accentSoft)
                        } else {
                            Section {
                                TextField("Name", text: $name)
                            } header: {
                                Text("Call it")
                            } footer: {
                                Text("What you want to see on the list.")
                            }
                            Section {
                                Button("Add to the cupboard") { Task { await add() } }
                                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                            }
                        }
                        againSection

                    }

                case .unknown(let code):
                    Form {
                        Section {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Not in the catalogue.").font(.headline)
                                Text("Nothing is published under \(code). Give it a name and it still goes in the cupboard.")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                        Section("Call it") {
                            TextField("Baked beans", text: $name)
                        }
                        Section {
                            Button("Add to the cupboard") { Task { await add() } }
                                .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        againSection
                    }
                }
            }
            .navigationTitle("Scan a barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private var againSection: some View {
        Section {
            Button("Scan another") {
                name = ""
                problem = nil
                stage = .scanning
            }
            if let problem {
                Text(problem).foregroundStyle(.red)
            }
        }
    }

    /// The brand is usually already inside the name — the server puts it there when it is
    /// missing — so repeating it would give "Nutella · Nutella".
    private func describe(_ product: Product) -> String {
        let saysBrand = !product.brand.isEmpty
            && !plain(product.name).contains(plain(product.brand))
        return [saysBrand ? product.brand : "", product.size]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private func lookUp(_ barcode: String) async {
        stage = .asking(barcode)
        problem = nil
        do {
            let product = try await APIClient.shared.product(barcode: barcode)
            name = product.name
            stage = .found(product, alreadyHave(product.name))
        } catch let error as APIError where error.status == 404 {
            name = ""
            stage = .unknown(barcode)
        } catch {
            problem = "Could not look that barcode up."
            stage = .scanning
        }
    }

    private func add() async {
        let wanted = name.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty, !busy, let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            onAdded(try await APIClient.shared.addToCupboard(household: household, name: wanted))
            dismiss()
        } catch {
            problem = error.localizedDescription
        }
    }

    /// Loose on purpose — the cupboard says "Nutella" and the catalogue might say "Ferrero
    /// Nutella Hazelnut Spread". A false "you already have it" is cheaper than a duplicate row.
    private func alreadyHave(_ productName: String) -> CupboardItem? {
        let product = plain(productName)
        guard !product.isEmpty else { return nil }
        return items.first { item in
            let mine = plain(item.name)
            return mine.count > 2 && (mine == product || product.contains(mine))
        }
    }

    private func plain(_ text: String) -> String {
        text.lowercased()
            .map { $0.isLetter || $0.isNumber ? $0 : " " }
            .reduce(into: "") { $0.append($1) }
            .split(separator: " ")
            .joined(separator: " ")
    }
}

// MARK: - The camera

/**
 A live camera that calls back once, with the first grocery barcode it sees.

 Only the formats groceries use. Letting it look for QR codes as well finds nothing on a tin and
 makes every frame slower. The invite scanner uses the same controller, looking for QR codes only.
*/
struct BarcodeCamera: UIViewControllerRepresentable {
    var onFound: (String) -> Void

    func makeUIViewController(context: Context) -> BarcodeCameraController {
        let controller = BarcodeCameraController()
        controller.onFound = onFound
        return controller
    }

    func updateUIViewController(_ controller: BarcodeCameraController, context: Context) {
        controller.onFound = onFound
    }
}

final class BarcodeCameraController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onFound: ((String) -> Void)?
    /// Called on the main queue when the camera is not allowed, so the screen can say how to fix it.
    var onDenied: (() -> Void)?
    /// What to look for. Groceries by default; the invite scanner asks for QR codes only.
    var types: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce]
    /// Raw values, untouched — a QR code's text is not a product number to tidy up.
    var raw = false

    private let session = AVCaptureSession()
    private var preview: AVCaptureVideoPreviewLayer?
    private var camera: AVCaptureDevice?
    private var done = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in
            DispatchQueue.main.async {
                if allowed { self?.start() } else { self?.onDenied?() }
            }
        }
    }

    /// Looks again after a scan that was not what we wanted — a QR code that is not an invite.
    func resume() {
        done = false
        if !session.isRunning {
            Task.detached(priority: .userInitiated) { [session] in session.startRunning() }
        }
    }

    /// The torch, for a code on a screen in a dim kitchen. Quietly nothing on a device without one.
    func setTorch(_ on: Bool) {
        guard let camera, camera.hasTorch, (try? camera.lockForConfiguration()) != nil else { return }
        camera.torchMode = on ? .on : .off
        camera.unlockForConfiguration()
    }

    private func start() {
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: camera),
              session.canAddInput(input) else { return }
        self.camera = camera
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        // Set after adding the output: the available types are empty until then.
        output.metadataObjectTypes = types.filter {
            output.availableMetadataObjectTypes.contains($0)
        }

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.addSublayer(layer)
        preview = layer

        // Starting the session blocks for long enough to drop a frame of the interface.
        Task.detached(priority: .userInitiated) { [session] in session.startRunning() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // Otherwise the camera light stays on after the sheet closes, which looks like spying.
        if session.isRunning { session.stopRunning() }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput objects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard !done,
              let code = objects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first,
              let value = code.stringValue else { return }
        done = true
        session.stopRunning()
        onFound?(raw ? value : normalised(value, type: code.type))
    }

    /**
     UPC-A arrives as twelve digits; the rest of the world writes the same product as thirteen
     with a leading zero. Open Food Facts answers to either — checked against a real tin — so
     this is not about being understood. It is about asking for one product under one name: the
     server caches by exactly what it was sent, and two spellings would cache the same jar twice.
    */
    private func normalised(_ value: String, type: AVMetadataObject.ObjectType) -> String {
        let digits = value.filter(\.isNumber)
        if type == .ean13 || digits.count == 13 { return digits }
        if digits.count == 12 { return "0" + digits }
        return digits
    }
}
