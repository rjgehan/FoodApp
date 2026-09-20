import PhotosUI
import SwiftUI
#if canImport(ImagePlayground)
import ImagePlayground
#endif

/**
 The picture at the top of a recipe, and the three ways to get one.

 Generating it is the interesting one: type what the dish is called and Image Playground
 makes a picture of it, on the phone, free and with no quota. It is offered first because it
 is the one that costs nothing to try — but it is an ornament, not the recipe, so skipping it
 has to be as easy as taking it, and a photo of the actual dinner beats a generated one.

 Nothing here blocks saving. A recipe with no picture is a perfectly good recipe.
*/
/**
 Everything the cover-photo rows need that has to outlive them.

 It lives on the screen, not in the Section, and that is the whole point. A Section is a row in
 a Form, and a Form is free to tear its rows down and build them again — while you type the
 dish name, every keystroke rebuilds them. A `.sheet` attached there goes with them, which is
 why Image Playground opened and vanished: the thing presenting it had stopped existing. The
 camera got away with it because it opens in a single frame; the generator takes longer.

 The dish name is copied in at the moment you tap Generate, too. Reading it live meant the
 concept changed under an open sheet.
*/
@Observable
final class CoverPhotoFlow {
    enum Ask: Identifiable, Equatable {
        case generate(String)
        case camera
        var id: String {
            switch self {
            case .generate(let concept): "generate:\(concept)"
            case .camera: "camera"
            }
        }
    }

    var ask: Ask?
    var uploading = false
    var error: String?
}

struct CoverPhotoSection: View {
    /// What the dish is called. The generator has nothing to work from until this is typed.
    let dishName: String
    var session: Session?
    @Binding var coverImageId: UUID?
    var flow: CoverPhotoFlow

    @State private var picked: PhotosPickerItem?

    private var named: String { dishName.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        Section {
            if let coverImageId, let url = APIClient.shared.imageURL(coverImageId) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color(.secondarySystemGroupedBackground)
                }
                .frame(height: 170)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .overlay(alignment: .topTrailing) {
                    Button {
                        self.coverImageId = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, .black.opacity(0.45))
                            .padding(10)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove the photo")
                }
            }

            if flow.uploading {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Saving the photo…").foregroundStyle(.secondary)
                }
            }

            if canGenerate {
                Button {
                    flow.ask = .generate(named)
                } label: {
                    Label(coverImageId == nil ? "Generate a photo" : "Generate a different one",
                          systemImage: "apple.intelligence")
                }
                .disabled(named.isEmpty || flow.uploading)
            }

            Button {
                flow.ask = .camera
            } label: {
                Label("Take my own photo", systemImage: "camera")
            }
            .disabled(flow.uploading)

            PhotosPicker(selection: $picked, matching: .images, photoLibrary: .shared()) {
                Label("Choose from my photos", systemImage: "photo.on.rectangle")
            }
            .disabled(flow.uploading)

            if let error = flow.error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
        } header: {
            Text("Photo")
        } footer: {
            if canGenerate && named.isEmpty {
                Text("Name the dish and it can make a picture of it, here on your phone.")
            } else if canGenerate {
                Text("Made on your phone from the name. Nothing is sent anywhere, and there is no daily limit.")
            }
        }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task {
                defer { picked = nil }
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let image = UIImage(data: data) else {
                    flow.error = "Could not read that photo."
                    return
                }
                await upload(image, into: $coverImageId, session: session, flow: flow)
            }
        }
    }

    /// Hidden rather than disabled when the device cannot do it: an option that can never
    /// work is worse than no option.
    private var canGenerate: Bool {
        #if canImport(ImagePlayground)
        if #available(iOS 18.1, *) { return ImagePlaygroundViewController.isAvailable }
        #endif
        return false
    }

}

/// Shared by the rows and by the screen that presents the camera and the generator, because
/// both end with the same picture going to the same place.
@MainActor
func upload(_ image: UIImage, into coverImageId: Binding<UUID?>, session: Session?, flow: CoverPhotoFlow) async {
    guard let household = session?.household?.id else {
        flow.error = "No household to save it to."
        return
    }
    // Full-bleed at the top of a recipe, so a 12-megapixel camera photo is many times more
    // than is ever shown, and all of it would cross the network twice.
    guard let png = image.scaled(toFit: 1400).pngData() else {
        flow.error = "Could not prepare that photo."
        return
    }
    flow.uploading = true
    flow.error = nil
    defer { flow.uploading = false }
    do {
        coverImageId.wrappedValue = try await APIClient.shared.uploadImage(household: household, png: png)
    } catch {
        flow.error = error.localizedDescription
    }
}

@MainActor
func upload(pngFrom url: URL, into coverImageId: Binding<UUID?>, session: Session?, flow: CoverPhotoFlow) async {
    guard let data = try? Data(contentsOf: url), let image = UIImage(data: data) else {
        flow.error = "Could not read the picture that was made."
        return
    }
    await upload(image, into: coverImageId, session: session, flow: flow)
}

/**
 The camera and the generator, presented by the screen rather than by a row inside it.

 Both hang off the Form, which stays alive for as long as the screen does. That is the fix for
 a generator sheet that opened and immediately closed again.
*/
extension View {
    func coverPhotoFlow(_ flow: CoverPhotoFlow, session: Session?, coverImageId: Binding<UUID?>) -> some View {
        self
            .sheet(isPresented: Binding(
                get: { flow.ask == .camera },
                set: { if !$0 { flow.ask = nil } }
            )) {
                CameraPicker { image in
                    Task { await upload(image, into: coverImageId, session: session, flow: flow) }
                }
            }
            .coverPlaygroundSheet(
                isPresented: Binding(
                    get: { if case .generate = flow.ask { true } else { false } },
                    set: { if !$0 { flow.ask = nil } }
                ),
                concept: { if case .generate(let concept) = flow.ask { concept } else { "" } }()
            ) { url in
                Task { await upload(pngFrom: url, into: coverImageId, session: session, flow: flow) }
            }
    }
}

private extension UIImage {
    /// Down to a sensible size, keeping the shape. Never scales up.
    func scaled(toFit longest: CGFloat) -> UIImage {
        let side = max(size.width, size.height)
        guard side > longest else { return self }
        let factor = longest / side
        let target = CGSize(width: size.width * factor, height: size.height * factor)
        return UIGraphicsImageRenderer(size: target).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
    }
}

/// The camera, which SwiftUI still has no control for.
struct CameraPicker: UIViewControllerRepresentable {
    var onTaken: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onTaken(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

/*
 The sheet only exists from iOS 18.1, and this app still runs on 17.

 AnyView rather than `some View` on purpose: a @ViewBuilder returning an opaque type whose
 branches differ by availability segfaults inside swift_getOpaqueTypeMetadataImpl when the
 modifier is applied. Erasing the type sidesteps it.
*/
extension View {
    func coverPlaygroundSheet(
        isPresented: Binding<Bool>,
        concept: String,
        onDone: @escaping (URL) -> Void
    ) -> AnyView {
        #if canImport(ImagePlayground)
        guard #available(iOS 18.1, *) else { return AnyView(self) }
        return AnyView(imagePlaygroundSheet(
            isPresented: isPresented,
            concepts: [.text(concept)],
            onCompletion: onDone
        ))
        #else
        return AnyView(self)
        #endif
    }
}

/**
 Adding a picture to a recipe that already exists, without opening the whole edit form.

 The case this is for: a recipe written down months ago with no photo. Going Edit, scrolling,
 generating, then Save is four steps too many for something the recipe screen can just offer
 where the missing picture would be.
*/
struct CoverPhotoSheet: View {
    let recipe: Recipe
    var session: Session?
    var onSaved: (Recipe) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var coverImageId: UUID?
    @State private var cover = CoverPhotoFlow()
    @State private var busy = false
    @State private var error: String?

    init(recipe: Recipe, session: Session?, onSaved: @escaping (Recipe) -> Void) {
        self.recipe = recipe
        self.session = session
        self.onSaved = onSaved
        _coverImageId = State(initialValue: recipe.coverImageId)
    }

    var body: some View {
        NavigationStack {
            Form {
                CoverPhotoSection(dishName: recipe.name, session: session, coverImageId: $coverImageId, flow: cover)
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .coverPhotoFlow(cover, session: session, coverImageId: $coverImageId)
            .navigationTitle(recipe.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { Task { await save() } }
                        .disabled(busy || coverImageId == recipe.coverImageId)
                }
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            // Only the pictures. The rest of the recipe is not this screen's business.
            let saved = try await APIClient.shared.setImages(
                recipeId: recipe.id,
                coverImageId: coverImageId,
                photoIds: recipe.photoIds ?? []
            )
            onSaved(saved)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
