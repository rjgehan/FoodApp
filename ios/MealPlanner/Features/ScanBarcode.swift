import AVFoundation
import SwiftUI

/**
 The barcode scanner (mockup 4.8): the whole screen is the camera, with a window to aim through
 and the torch for a dim kitchen, and what it read rises in a card at the bottom with the two
 places it can go — the cupboard, or the grocery list.

 Both halves matter. In the kitchen you are putting shopping away; in a shop you are asking
 "do we already have this", which is the question a written list answers worst. So a scan that
 matches something you own is a result, not a dead end — it says where it already is and
 declines to offer you a second one.

 The camera is AVFoundation's own barcode reader rather than anything shipped with the app.
 It is the same hardware path the Camera app uses, it costs nothing, and on a phone it is far
 better than decoding frames in software — which is what the web has to do, because Safari
 will not lend it this.
*/
struct ScanBarcodeScreen: View {
    var session: Session
    /// What is already in the cupboard, so a scan can recognise it.
    let items: [CupboardItem]
    /// What happened, to say on the cupboard once this has closed.
    var onDone: (String) -> Void
    /// Previews and the gallery: start on a result rather than the camera.
    var sample: Stage?

    @Environment(\.dismiss) private var dismiss
    @State private var stage: Stage = .scanning
    @State private var name = ""
    @State private var problem: String?
    @State private var busy = false
    @State private var torch = false

    enum Stage {
        case scanning
        case asking(String)
        case found(Product, CupboardItem?)
        case unknown(String)
    }

    private var scanning: Bool { if case .scanning = stage { return true } else { return false } }

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0x3B / 255, green: 0x30 / 255, blue: 0x29 / 255),
                                    Color(red: 0x15 / 255, green: 0x10 / 255, blue: 0x0D / 255)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            if scanning && sample == nil {
                BarcodeCamera(torch: torch) { code in Task { await lookUp(code) } }
                    .ignoresSafeArea()
            }
            window
            VStack(spacing: 0) {
                HStack {
                    round("xmark", label: "Close") { dismiss() }
                    Spacer()
                    round(torch ? "flashlight.on.fill" : "flashlight.off.fill", label: torch ? "Torch off" : "Torch on") {
                        torch.toggle()
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 6)
                Spacer()
                if !scanning {
                    card
                        .padding(.horizontal, 10)
                        .padding(.bottom, 12)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .animation(.snappy(duration: 0.25), value: scanning)
        .onAppear {
            if let sample {
                stage = sample
                if case .found(let product, _) = sample { name = product.name }
            }
        }
    }

    /// The window to aim through: the screen dimmed round a rounded box, and the accent's scan line.
    private var window: some View {
        VStack(spacing: 18) {
            ZStack {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(.white.opacity(0.95), lineWidth: 3)
                Rectangle()
                    .fill(Palette.accent)
                    .frame(height: 2)
                    .shadow(color: Palette.accent, radius: 6)
                    .padding(.horizontal, 18)
            }
            .frame(width: 270, height: 170)
            .background {
                // Everything but the window darkens a little, so the eye goes to the window.
                Rectangle().fill(.black.opacity(0.25))
                    .frame(width: 4000, height: 4000)
                    .mask {
                        Rectangle().frame(width: 4000, height: 4000)
                            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .frame(width: 270, height: 170).blendMode(.destinationOut))
                            .compositingGroup()
                    }
                    .allowsHitTesting(false)
            }
            Text(problem ?? "Point at a barcode")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.white.opacity(0.9))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .offset(y: -40)
        .opacity(scanning ? 1 : 0.6)
    }

    private func round(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(.white.opacity(0.18), in: Circle())
        }
        .buttonStyle(PressFade())
        .accessibilityLabel(label)
    }

    /// What was read, and where it can go.
    private var card: some View {
        VStack(alignment: .leading, spacing: 14) {
            switch stage {
            case .scanning:
                EmptyView()
            case .asking(let code):
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Looking up \(code)…").font(.system(size: 14)).foregroundStyle(Palette.muted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            case .found(let product, let already):
                productLine(title: already == nil ? nil : product.name,
                            detail: [describe(product), product.barcode].filter { !$0.isEmpty }.joined(separator: " · "))
                if let already {
                    NoteBox(text: Text("**You already have this.** It is in the cupboard as “\(already.name)”"
                                       + (already.runningLow ? ", and it is marked running low." : ".")),
                            tone: .sky, systemImage: "cabinet")
                }
                actions(canStock: already == nil, listName: already?.name)
            case .unknown(let code):
                productLine(title: "Not in the catalogue.", detail: code)
                Text("Give it a name and it still goes in the cupboard.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
                FieldBox(nil, text: $name, prompt: "Baked beans")
                actions(canStock: true, listName: nil)
            }
        }
        .padding(16)
        .background(Palette.bg, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
    }

    private func productLine(title: String?, detail: String) -> some View {
        HStack(spacing: 12) {
            RecipePhotoPlaceholder(hue: .sky, systemImage: "shippingbox", size: 52, radius: 12)
            VStack(alignment: .leading, spacing: 2) {
                if let title {
                    Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.text).lineLimit(1)
                } else {
                    // The catalogue's name, editable: it sometimes answers in French, or with a
                    // marketing name nobody would write on a list.
                    HStack(spacing: 6) {
                        TextField("Call it", text: $name)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Palette.text)
                        Image(systemName: "pencil").font(.system(size: 13)).foregroundStyle(Palette.faint)
                    }
                }
                Text(detail).font(.system(size: 12)).foregroundStyle(Palette.muted).lineLimit(1)
            }
        }
    }

    private func actions(canStock: Bool, listName: String?) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                if canStock {
                    Button {
                        Task { await addToCupboard() }
                    } label: {
                        Label("Cupboard", systemImage: "cabinet").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.kitchen(.primary, size: .small))
                    .accessibilityLabel("Add to the cupboard")
                    .disabled(busy || named.isEmpty)
                }
                Button {
                    Task { await addToList(listName ?? named) }
                } label: {
                    Label("Add to list", systemImage: "cart").frame(maxWidth: .infinity)
                }
                .buttonStyle(.kitchen(.secondary, size: .small))
                .accessibilityLabel("Add to the list")
                .disabled(busy || (listName ?? named).isEmpty)
            }
            Button("Scan another") {
                name = ""
                problem = nil
                stage = .scanning
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Palette.accentInk)
        }
    }

    private var named: String { name.trimmingCharacters(in: .whitespaces) }

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
        torch = false
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

    private func addToCupboard() async {
        guard !named.isEmpty, !busy, let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.addToCupboard(household: household, name: named)
            onDone("Added \(named) to the cupboard")
            dismiss()
        } catch {
            problem = error.localizedDescription
            stage = .scanning
        }
    }

    private func addToList(_ wanted: String) async {
        guard !wanted.isEmpty, !busy, let household = session.household?.id else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await APIClient.shared.addGroceryItem(household: household, name: wanted, quantity: nil, unit: nil)
            onDone("Added \(wanted) to the list")
            dismiss()
        } catch {
            problem = error.localizedDescription
            stage = .scanning
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
    /// The torch, for a barcode in a dim cupboard.
    var torch = false
    var onFound: (String) -> Void

    func makeUIViewController(context: Context) -> BarcodeCameraController {
        let controller = BarcodeCameraController()
        controller.onFound = onFound
        return controller
    }

    func updateUIViewController(_ controller: BarcodeCameraController, context: Context) {
        controller.onFound = onFound
        controller.setTorch(torch)
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

#Preview("Barcode — found") {
    ScanBarcodeScreen(session: .preview, items: [], onDone: { _ in },
                      sample: .found(Product(barcode: "5012345678900", name: "Chickpeas 400g tin", brand: "", size: "400 g"), nil))
}

#Preview("Barcode — scanning") {
    ScanBarcodeScreen(session: .preview, items: [], onDone: { _ in }, sample: .scanning)
}
