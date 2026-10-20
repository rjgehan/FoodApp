import SwiftUI
import UIKit

/**
 A receipt's scanned pages, kept with it: to look back at a line the reading got wrong, and to
 share them (AirDrop to a Mac) so the reader can be checked against what was really printed.

 Pages go up as the household's own images just before the receipt is saved, and the receipt
 keeps their ids. Going up is best effort: a page that will not upload leaves the receipt saved
 without it rather than not saved at all.
 */
enum ReceiptPhotos {
    /// What the server takes for one image, with room to spare.
    private static let limit = 2_800_000

    /**
     A page as a JPEG small enough to keep: no side longer than 4000 points' worth of pixels (a
     long receipt's print still reads), squeezed harder until it fits.
     */
    static func jpeg(_ page: UIImage) -> Data? {
        let longest = max(page.size.width, page.size.height) * page.scale
        let shrink = min(1, 4000 / max(longest, 1))
        let size = CGSize(width: page.size.width * page.scale * shrink, height: page.size.height * page.scale * shrink)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let drawn = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            page.draw(in: CGRect(origin: .zero, size: size))
        }
        for quality in [0.7, 0.5, 0.35, 0.2] {
            if let data = drawn.jpegData(compressionQuality: quality), data.count <= limit {
                return data
            }
        }
        return nil
    }

    /// Every page uploaded, in order; the ones that would not go are left out.
    static func upload(_ pages: [UIImage], household: UUID) async -> [UUID] {
        var ids: [UUID] = []
        for page in pages {
            guard let data = jpeg(page),
                  let id = try? await APIClient.shared.uploadImage(household: household, jpeg: data) else { continue }
            ids.append(id)
        }
        return ids
    }

    /// The pages as files to share, named for the shop and the day: "Kings Food Markets Oct 18 1.jpg".
    static func files(_ data: [Data], named name: String) -> [URL] {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("receipt-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let base = name.replacingOccurrences(of: "/", with: "-")
        return data.enumerated().compactMap { index, jpeg in
            let url = folder.appendingPathComponent(data.count == 1 ? "\(base).jpg" : "\(base) \(index + 1).jpg")
            return (try? jpeg.write(to: url)) != nil ? url : nil
        }
    }
}

/// Where a receipt's pages come from: just scanned, or kept on the server.
enum ReceiptPages: Hashable {
    case scanned([UIImage])
    case kept([UUID])

    var count: Int {
        switch self {
        case .scanned(let pages): return pages.count
        case .kept(let ids): return ids.count
        }
    }
}

/**
 The receipt's pages, full screen: swipe between them, pinch to zoom, and Share to send them on
 (AirDrop to a Mac, Files, Messages).
 */
struct ReceiptPhotoViewer: View {
    let pages: ReceiptPages
    /// What the shared files are called: the shop and the day.
    var name: String = "Receipt"

    @Environment(\.dismiss) private var dismiss
    @State private var images: [UIImage] = []
    @State private var shared: [URL] = []
    @State private var failed = false

    var body: some View {
        NavigationStack {
            Group {
                if images.isEmpty {
                    if failed {
                        Text("Couldn't load the pictures.").font(.system(size: 15)).foregroundStyle(.white.opacity(0.8))
                    } else {
                        ProgressView().tint(.white)
                    }
                } else {
                    TabView {
                        ForEach(Array(images.enumerated()), id: \.offset) { _, image in
                            ZoomablePage(image: image)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: images.count > 1 ? .always : .never))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black.ignoresSafeArea())
            .navigationTitle(images.count > 1 ? "\(images.count) pages" : "Receipt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if !shared.isEmpty {
                        ShareLink(items: shared) { Image(systemName: "square.and.arrow.up") }
                            .accessibilityLabel("Share the pictures")
                    }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        var data: [Data] = []
        switch pages {
        case .scanned(let scanned):
            images = scanned
            data = scanned.compactMap { ReceiptPhotos.jpeg($0) }
        case .kept(let ids):
            for id in ids {
                guard let url = APIClient.shared.imageURL(id),
                      let (bytes, _) = try? await URLSession.shared.data(from: url),
                      let image = UIImage(data: bytes) else { continue }
                images.append(image)
                data.append(bytes)
            }
            failed = images.isEmpty
        }
        shared = ReceiptPhotos.files(data, named: name)
    }
}

/// One page, fitted to the screen, that pinches and pans like Photos.
private struct ZoomablePage: View {
    let image: UIImage

    @State private var scale: CGFloat = 1
    @State private var settled: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var dragged: CGSize = .zero

    var body: some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                MagnifyGesture()
                    .onChanged { value in scale = max(1, min(6, settled * value.magnification)) }
                    .onEnded { _ in
                        settled = scale
                        if scale == 1 { withAnimation(.snappy) { offset = .zero; dragged = .zero } }
                    }
                    .simultaneously(with: DragGesture()
                        .onChanged { value in
                            guard scale > 1 else { return }
                            offset = CGSize(width: dragged.width + value.translation.width,
                                            height: dragged.height + value.translation.height)
                        }
                        .onEnded { _ in dragged = offset })
            )
            .onTapGesture(count: 2) {
                withAnimation(.snappy) {
                    scale = scale > 1 ? 1 : 3
                    settled = scale
                    offset = .zero
                    dragged = .zero
                }
            }
            .accessibilityLabel("Receipt page")
    }
}

/// The pages as a row of small pictures that open the viewer: a saved receipt's, or the scan's.
struct ReceiptPhotoStrip: View {
    let pages: ReceiptPages
    var name: String = "Receipt"

    @State private var viewing = false

    var body: some View {
        Button { viewing = true } label: {
            HStack(spacing: 12) {
                Tile("doc.text.image", tone: .sky, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(pages.count == 1 ? "See the receipt" : "See the receipt · \(pages.count) pages")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.text)
                    Text("Zoom in to check a line, or share the pictures")
                        .font(.system(size: 13)).foregroundStyle(Palette.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
            }
            .padding(14)
            .cardSurface()
        }
        .buttonStyle(PressFade())
        .fullScreenCover(isPresented: $viewing) {
            ReceiptPhotoViewer(pages: pages, name: name)
        }
    }
}
