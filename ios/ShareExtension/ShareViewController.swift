import UIKit
import UniformTypeIdentifiers

/*
 Share a recipe from anywhere — Safari, Messages, Notes — into Meal Planner.

 The extension itself stays deliberately thin: it pulls the text (or the URL) out of whatever
 was shared and hands it to the app through a custom URL. The parsing and the saving happen in
 the app, which already has the signed-in session.

 It works that way for a reason. Reaching the app's Keychain token from here needs an App Group
 or a shared keychain, and a free personal team cannot have either — so instead of authenticating
 twice, the extension passes the text along and lets the app do what it already knows how to do.
 */
final class ShareViewController: UIViewController {
    private let label = UILabel()
    private var finished = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        label.text = "Reading…"
        label.textAlignment = .center
        label.font = .preferredFont(forTextStyle: .body)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
        ])

        Task {
            await handle()
        }
        // Never sit there forever: a share extension that hangs is killed, and iOS quietly
        // stops offering it afterwards.
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            guard let self, !self.finished else { return }
            self.finish(with: "That took too long.")
        }
    }

    private func handle() async {
        /*
         Only in a debug build. It carries a preview of whatever the share sheet handed over,
         which is the user's content, and a released app that quietly uploaded that would be
         doing something the screen it lands on promises it does not.
        */
        #if DEBUG
        let report = await describeWhatArrived()
        #else
        let report = ""
        #endif
        let found = await shared()

        // The page's own recipe data beats anything read off the screen, so it goes first
        // and the app can use it without a model at all.
        let note = report.isEmpty ? "" : "&diag=\(encode(report))"
        if let recipe = found.recipe, !recipe.isEmpty,
           let url = URL(string: "mealplanner://paste?recipe=\(encode(recipe))\(note)"),
           url.absoluteString.count < 120_000 {
            label.text = "Found the recipe."
            open(url)
            return
        }
        guard let text = found.text,
              let url = URL(string: "mealplanner://paste?text=\(encode(text))\(note)") else {
            // Even with nothing to read, the note is worth sending: a share that produced
            // nothing is exactly the one worth knowing the shape of.
            if !report.isEmpty, let url = URL(string: "mealplanner://paste?diag=\(encode(report))") {
                open(url)
            } else {
                finish(with: "Nothing to read in that.")
            }
            return
        }
        open(url)
    }

    /// What was shared: the page's own recipe data if it publishes any, and its words either way.
    ///
    /// Order matters for the text. The page's text is what a reader sees; a selection is what
    /// they chose; a URL is neither, and passing one to a language model produces an invented
    /// recipe built out of the slug. A URL is only ever sent as a last resort, marked so the
    /// app knows to fetch it rather than read it.
    private func shared() async -> (recipe: String?, text: String?) {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        var recipe: String?
        var pageText: String?
        var selection: String?
        var link: String?

        for item in items {
            for provider in item.attachments ?? [] {
                // The JavaScript preprocessor's results arrive as a property list.
                if provider.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier),
                   let loaded = try? await provider.loadItem(forTypeIdentifier: UTType.propertyList.identifier),
                   let wrapper = loaded as? [String: Any],
                   let results = wrapper[NSExtensionJavaScriptPreprocessingResultsKey] as? [String: Any] {
                    if let found = results["recipe"] as? String, !found.isEmpty { recipe = found }
                    let title = results["title"] as? String ?? ""
                    let text = results["text"] as? String ?? ""
                    if !text.isEmpty { pageText = [title, text].filter { !$0.isEmpty }.joined(separator: "\n\n") }
                    if let pageURL = results["url"] as? String, !pageURL.isEmpty { link = pageURL }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                          let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String,
                          !text.isEmpty {
                    selection = text
                } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                          let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                    link = url.absoluteString
                }
            }
            if selection == nil, let text = item.attributedContentText?.string, !text.isEmpty {
                selection = text
            }
        }

        /*
         A recipe is never a hundred characters. Anything shorter is a page title or a stray
         line, and sending it on is what produced a recipe invented from three words — so a
         short capture loses to the link, which the app can go and fetch.
         */
        let enough = 200
        let text: String?
        if let selection, selection.count >= enough {
            text = selection
        } else if let pageText, pageText.count >= enough {
            text = pageText
        } else if let link {
            text = "\u{1F517}\(link)"
        } else {
            text = selection ?? pageText
        }
        return (recipe, text)
    }

    /**
     Everything the share sheet handed over, written down.

     The three type identifiers below are the ones this extension knows how to use, and an
     app that offers none of them looks from in here exactly like an app that offered
     nothing. So before any of that, every attachment is described as it arrived: what types
     it claims, and what each one loads as. One share from an unfamiliar app then says
     precisely what there was to work with, instead of leaving it to guesswork.

     It never fails and never blocks the share: the worst case is a shorter note.
    */
    private func describeWhatArrived() async -> String {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        var lines: [String] = ["items=\(items.count)"]

        for (index, item) in items.enumerated() {
            if let text = item.attributedContentText?.string, !text.isEmpty {
                lines.append("item[\(index)].attributedContentText = \(preview(text))")
            }
            if let title = item.attributedTitle?.string, !title.isEmpty {
                lines.append("item[\(index)].attributedTitle = \(preview(title))")
            }
            if let info = item.userInfo, !info.isEmpty {
                let keys = info.keys.compactMap { $0 as? String }.sorted()
                lines.append("item[\(index)].userInfo keys = \(keys.joined(separator: ", "))")
            }

            let providers = item.attachments ?? []
            lines.append("item[\(index)] attachments=\(providers.count)")
            for (slot, provider) in providers.enumerated() {
                let types = provider.registeredTypeIdentifiers
                lines.append("  [\(slot)] types = \(types.joined(separator: ", "))")
                for type in types {
                    lines.append("    \(type) -> \(await describe(provider, type))")
                }
            }
        }
        return lines.joined(separator: "\n")
    }

    /// What one type identifier actually loads as. Anything that throws or hangs is reported
    /// as such rather than losing the whole note.
    private func describe(_ provider: NSItemProvider, _ type: String) async -> String {
        do {
            let loaded = try await provider.loadItem(forTypeIdentifier: type)
            switch loaded {
            case let url as URL:
                return "URL \(url.absoluteString)"
            case let text as String:
                return "String(\(text.count)) \(preview(text))"
            case let data as Data:
                let asText = String(data: data, encoding: .utf8)
                return "Data(\(data.count))" + (asText.map { " utf8 " + preview($0) } ?? " not utf8")
            case let dictionary as [String: Any]:
                return "Dictionary keys = \(dictionary.keys.sorted().joined(separator: ", "))"
            case let attributed as NSAttributedString:
                return "AttributedString \(preview(attributed.string))"
            case let image as UIImage:
                return "UIImage \(Int(image.size.width))x\(Int(image.size.height))"
            default:
                return "\(Swift.type(of: loaded))"
            }
        } catch {
            return "failed: \(error.localizedDescription)"
        }
    }

    /// Enough to recognise the shape, not so much that the URL will not carry it.
    private func preview(_ text: String) -> String {
        let flat = text.replacingOccurrences(of: "\n", with: "⏎")
        return flat.count <= 700 ? flat : String(flat.prefix(700)) + "…"
    }

    private func encode(_ text: String) -> String {
        // A recipe is long and full of newlines and slashes; everything but the unreserved set
        // has to go.
        text.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
    }

    /**
     `extensionContext.open` is the documented way, and now the only way.

     There used to be a fallback that walked the responder chain looking for a UIApplication
     and called `open` on it. That method is unavailable to app extensions — Swift does not
     catch it here because the object arrives through a dynamic cast, but the appex is
     scanned for exactly that at upload, and finding it is a rejection.
    */
    private func open(_ url: URL) {
        extensionContext?.open(url) { [weak self] opened in
            if opened {
                self?.done()
            } else {
                self?.finish(with: "Could not open Meal Planner.")
            }
        }
    }

    private func done() {
        guard !finished else { return }
        finished = true
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func finish(with message: String) {
        guard !finished else { return }
        finished = true
        label.text = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }
}
