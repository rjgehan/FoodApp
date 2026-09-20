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
struct CoverPhotoSection: View {
    /// What the dish is called. The generator has nothing to work from until this is typed.
    let dishName: String
    var session: Session?
    @Binding var coverImageId: UUID?

    @State private var generating = false
    @State private var uploading = false
    @State private var picked: PhotosPickerItem?
    @State private var takingPhoto = false
    @State private var error: String?

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

            if uploading {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Saving the photo…").foregroundStyle(.secondary)
                }
            }

            if canGenerate {
                Button {
                    generating = true
                } label: {
                    Label(coverImageId == nil ? "Generate a photo" : "Generate a different one",
                          systemImage: "apple.intelligence")
                }
                .disabled(named.isEmpty || uploading)
            }

            Button {
                takingPhoto = true
            } label: {
                Label("Take my own photo", systemImage: "camera")
            }
            .disabled(uploading)

            PhotosPicker(selection: $picked, matching: .images, photoLibrary: .shared()) {
                Label("Choose from my photos", systemImage: "photo.on.rectangle")
            }
            .disabled(uploading)

            if let error {
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
        .coverPlaygroundSheet(isPresented: $generating, concept: named) { url in
            Task { await upload(pngFrom: url) }
        }
        .sheet(isPresented: $takingPhoto) {
            CameraPicker { image in
                Task { await upload(image) }
            }
        }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task {
                defer { picked = nil }
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let image = UIImage(data: data) else {
                    error = "Could not read that photo."
                    return
                }
                await upload(image)
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

    private func upload(pngFrom url: URL) async {
        guard let data = try? Data(contentsOf: url), let image = UIImage(data: data) else {
            error = "Could not read the picture that was made."
            return
        }
        await upload(image)
    }

    private func upload(_ image: UIImage) async {
        guard let household = session?.household?.id else {
            error = "No household to save it to."
            return
        }
        // Full-bleed at the top of a recipe, so a 12-megapixel camera photo is many times
        // more than is ever shown, and all of it would cross the network twice.
        guard let png = image.scaled(toFit: 1400).pngData() else {
            error = "Could not prepare that photo."
            return
        }
        uploading = true
        error = nil
        defer { uploading = false }
        do {
            coverImageId = try await APIClient.shared.uploadImage(household: household, png: png)
        } catch {
            self.error = error.localizedDescription
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
