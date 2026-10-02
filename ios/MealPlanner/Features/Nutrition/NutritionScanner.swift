import AVFoundation
import SwiftUI

/**
 The scan button's camera (5.4): the whole screen is the viewfinder until it reads a barcode, then
 hands it on to the packet's label. The same AVFoundation reader as the cupboard's scanner. The
 barcode can always be typed instead — the Simulator has no camera, and a crumpled packet
 sometimes will not scan.
 */
struct NutritionScannerScreen: View {
    var onFound: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""
    @State private var torch = false
    @State private var found = false
    @FocusState private var typing: Bool

    private var digits: String { typed.filter(\.isNumber) }
    /// Nothing to point at: the Simulator, or a phone that will not lend the camera.
    private var noCamera: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return AVCaptureDevice.authorizationStatus(for: .video) == .denied
            || AVCaptureDevice.default(for: .video) == nil
        #endif
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(rgb: 0x3B3029), Color(rgb: 0x15100D)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
                .ignoresSafeArea()
            if !noCamera {
                BarcodeCamera(torch: torch) { code in
                    guard !found else { return }
                    found = true
                    onFound(code)
                }
                .ignoresSafeArea()
            }
            VStack(spacing: 0) {
                HStack {
                    round("xmark", label: "Close") { dismiss() }
                    Spacer()
                    if !noCamera {
                        round(torch ? "flashlight.on.fill" : "flashlight.off.fill", label: torch ? "Torch off" : "Torch on") {
                            torch.toggle()
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 6)
                Spacer()
                if !noCamera {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .strokeBorder(.white.opacity(0.95), lineWidth: 3)
                        .frame(width: 270, height: 170)
                        .overlay(Rectangle().fill(Palette.accent).frame(height: 2).padding(.horizontal, 18)
                            .shadow(color: Palette.accent, radius: 6))
                        .allowsHitTesting(false)
                }
                Spacer()
                card.padding(.horizontal, 10).padding(.bottom, 12)
            }
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(noCamera ? "Type the barcode instead" : "Point it at the barcode on the packet")
                .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
            if noCamera {
                Text("There's no camera to scan with here. The number is under the stripes.")
                    .font(.system(size: 13)).foregroundStyle(Palette.muted)
            }
            HStack(spacing: 8) {
                TextField("", text: $typed, prompt: Text("5000112637922").foregroundStyle(Palette.faint))
                    .keyboardType(.numberPad)
                    .font(.system(size: 16).monospacedDigit())
                    .foregroundStyle(Palette.text)
                    .focused($typing)
                    .padding(.horizontal, 14)
                    .frame(height: 44)
                    .fieldSurface(focused: typing, radius: 12)
                    .accessibilityLabel("Barcode")
                Button("Look up") { onFound(digits) }
                    .buttonStyle(.kitchen(.primary, size: .small, fill: false))
                    .frame(height: 44)
                    .disabled(!NutritionText.isBarcode(digits))
            }
        }
        .padding(20)
        .background(Palette.bg, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
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
}

#Preview("Scan a packet") {
    NutritionScannerScreen { _ in }
}

#Preview("Scan a packet — dark") {
    NutritionScannerScreen { _ in }.preferredColorScheme(.dark)
}
