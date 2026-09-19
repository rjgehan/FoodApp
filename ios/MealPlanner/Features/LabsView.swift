import SwiftUI
import ImagePlayground
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 A scratch tab for trying Apple Intelligence against real data. Delete the file and its tab in
 `MealPlannerApp` and nothing else changes — nothing in the app depends on it.

 What it answers:
 - Does this device actually have image generation, and if not, exactly why.
 - What "olive oil" looks like in each style, and how long it took.
 - Whether a generated image can be uploaded and kept, the way a recipe photo is.
 */
struct LabsView: View {
    var session: Session

    @State private var prompt = "olive oil"
    @State private var style: Style = .illustration
    @State private var image: CGImage?
    @State private var elapsed: TimeInterval?
    @State private var status: String = "Not checked"
    @State private var headless: String = "Not checked"
    @State private var modelStatus: String = "Not checked"
    @State private var busy = false
    @State private var error: String?
    @State private var uploaded: String?
    @State private var items: [GroceryItem] = []
    @State private var sheetUp = false

    /// Mirrors `ImagePlaygroundStyle`, which cannot be used in a Picker below iOS 18.4.
    enum Style: String, CaseIterable, Identifiable {
        case illustration, animation, sketch
        var id: String { rawValue }
        var title: String { rawValue.capitalized }
    }

    var body: some View {
        NavigationStack {
            List {
                // A title and a footer together need the closure form of Section.
                Section {
                    LabeledContent("Image generation", value: status)
                    LabeledContent("Headless (deprecated in 27)", value: headless)
                    LabeledContent("On-device model", value: modelStatus)
                    Button("Check again") { Task { await check() } }
                        .buttonStyle(.borderless)
                } header: {
                    Text("Can this device do it?")
                } footer: {
                    Text("Both need Apple Intelligence hardware with the feature switched on, and the models downloaded. The Simulator usually reports unavailable.")
                }

                Section {
                    TextField("What to draw", text: $prompt)
                    Picker("Style", selection: $style) {
                        ForEach(Style.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Button("Open Image Playground", systemImage: "wand.and.stars") {
                        sheetUp = true
                    }
                    .buttonStyle(.borderless)
                    .disabled(prompt.trimmingCharacters(in: .whitespaces).isEmpty)

                    Button(busy ? "Trying…" : "Try headless (deprecated)", systemImage: "terminal") {
                        Task { await generate() }
                    }
                    .buttonStyle(.borderless)
                    .disabled(busy || prompt.trimmingCharacters(in: .whitespaces).isEmpty)
                } footer: {
                    Text("iOS 27 deprecated generating without UI. The sheet is the supported path, and it needs a person to confirm each image.")
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                if let image {
                    Section("Result") {
                        Image(decorative: image, scale: 1)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 280)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        if let elapsed {
                            LabeledContent("Took", value: String(format: "%.1f s", elapsed))
                        }
                        LabeledContent("Size", value: "\(image.width)×\(image.height)")
                        Button("Save to this household", systemImage: "square.and.arrow.up") {
                            Task { await upload(image) }
                        }
                        .buttonStyle(.borderless)
                        if let uploaded {
                            Text(uploaded).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }

                // Real names off the real list, so the test is not all "olive oil".
                if !items.isEmpty {
                    Section("Try a real grocery item") {
                        ForEach(items.prefix(12)) { item in
                            Button(item.name) {
                                prompt = item.name
                                sheetUp = true
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                }
            }
            .navigationTitle("Labs")
            .playgroundSheet(isPresented: $sheetUp, concept: prompt) { url in
                Task { await loadGenerated(from: url) }
            }
        }
        .task {
            await check()
            if let household = session.household?.id {
                items = (try? await APIClient.shared.groceries(household: household)) ?? []
            }
        }
    }

    // MARK: - Checks

    private func check() async {
        // The precise reason matters: "unavailable" on a supported phone usually means the
        // feature is off in Settings, not that the code is wrong.
        // Two different answers matter here. `isAvailable` is whether the system can generate
        // at all; ImageCreator is the headless path, which iOS 27 deprecated in favour of
        // Apple's own sheet — so it can report "not supported" on a phone that generates fine.
        if #available(iOS 18.1, *) {
            status = ImagePlaygroundViewController.isAvailable ? "Available (via Apple's sheet)" : "Not available"
        } else {
            status = "Needs iOS 18.1"
        }

        if #available(iOS 18.4, *) {
            do {
                let creator = try await ImageCreator()
                headless = "Works · \(creator.availableStyles.count) styles"
            } catch let failure as ImageCreator.Error {
                headless = describe(failure)
            } catch {
                headless = error.localizedDescription
            }
        } else {
            headless = "Needs iOS 18.4"
        }

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                modelStatus = "Ready"
            case .unavailable(.deviceNotEligible):
                modelStatus = "Device not eligible"
            case .unavailable(.appleIntelligenceNotEnabled):
                modelStatus = "Apple Intelligence off"
            case .unavailable(.modelNotReady):
                modelStatus = "Model still downloading"
            case .unavailable(let other):
                modelStatus = "Unavailable (\(other))"
            }
        } else {
            modelStatus = "Needs iOS 26"
        }
        #else
        modelStatus = "Framework not in this SDK"
        #endif
    }

    @available(iOS 18.4, *)
    private func describe(_ failure: ImageCreator.Error) -> String {
        switch failure {
        case .notSupported: "Not supported on this device"
        case .unavailable: "Unavailable — Apple Intelligence off, or still downloading"
        case .creationCancelled: "Cancelled"
        case .backgroundCreationForbidden: "Refused: app was in the background"
        case .unsupportedLanguage: "Unsupported language"
        case .creationFailed: "Generation failed"
        default: "\(failure)"
        }
    }

    // MARK: - Generating

    private func generate() async {
        guard #available(iOS 18.4, *) else {
            error = "Image generation needs iOS 18.4."
            return
        }
        busy = true
        error = nil
        uploaded = nil
        defer { busy = false }

        let started = Date()
        do {
            let creator = try await ImageCreator()
            let chosen: ImagePlaygroundStyle = switch style {
            case .illustration: .illustration
            case .animation: .animation
            case .sketch: .sketch
            }
            // One image; the sequence would keep producing variations otherwise.
            let stream = creator.images(for: [.text(prompt)], style: chosen, limit: 1)
            for try await created in stream {
                image = created.cgImage
                elapsed = Date().timeIntervalSince(started)
                break
            }
            if image == nil { error = "The model returned no image." }
        } catch let failure as ImageCreator.Error {
            error = describe(failure)
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// What the sheet hands back: a file on disk, not pixels in memory.
    private func loadGenerated(from url: URL) async {
        guard let data = try? Data(contentsOf: url), let loaded = UIImage(data: data)?.cgImage else {
            error = "Could not read the generated image."
            return
        }
        image = loaded
        elapsed = nil
    }

    /// Proves the other half: a generated image can live on the server like any recipe photo,
    /// so the household — and the web app — would see the same one.
    private func upload(_ cgImage: CGImage) async {
        guard let household = session.household?.id else { return }
        guard let data = UIImage(cgImage: cgImage).pngData() else {
            error = "Could not encode the image."
            return
        }
        do {
            let id = try await APIClient.shared.uploadImage(household: household, png: data)
            uploaded = "Saved as \(id.uuidString)"
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The sheet only exists from iOS 18.1, and this app still runs on 17.
extension View {
    @ViewBuilder
    func playgroundSheet(
        isPresented: Binding<Bool>,
        concept: String,
        onDone: @escaping (URL) -> Void
    ) -> some View {
        if #available(iOS 18.1, *) {
            self.imagePlaygroundSheet(isPresented: isPresented, concepts: [.text(concept)], onCompletion: onDone)
        } else {
            self
        }
    }
}

#Preview("Labs") {
    LabsView(session: .preview)
}
