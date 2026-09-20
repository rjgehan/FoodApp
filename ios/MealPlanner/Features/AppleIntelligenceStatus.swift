import SwiftUI
#if canImport(ImagePlayground)
import ImagePlayground
#endif
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 What this phone will actually do, in its own words.

 "Generate a photo" is hidden when the system says image generation is unavailable, and a
 hidden button explains nothing — you are left wondering whether the feature exists, whether
 the app is broken, or whether the phone is too old. Worse, the system can say available and
 then fail anyway, and there was no way to tell those apart from the outside.

 This is the one thing the old Labs tab was genuinely for, kept and put somewhere a person
 would look. It reads status only; nothing here turns anything on.
*/
struct AppleIntelligenceStatus: View {
    var body: some View {
        LabeledContent("Image generation", value: imageGeneration)
        LabeledContent("On-device model", value: languageModel)
    }

    private var imageGeneration: String {
        #if canImport(ImagePlayground)
        if #available(iOS 18.1, *) {
            return ImagePlaygroundViewController.isAvailable ? "Ready" : "Not available"
        }
        return "Needs iOS 18.1"
        #else
        return "Not built in"
        #endif
    }

    /**
     The precise reason, where the system gives one. "Not available" on a phone that supports
     Apple Intelligence almost always means it is switched off in Settings, or the models are
     still downloading — two very different waits, and neither is a bug in this app.
    */
    private var languageModel: String {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                return "Ready"
            case .unavailable(.deviceNotEligible):
                return "This phone cannot run it"
            case .unavailable(.appleIntelligenceNotEnabled):
                return "Turn on Apple Intelligence in Settings"
            case .unavailable(.modelNotReady):
                return "Still downloading"
            case .unavailable(let other):
                return "Unavailable (\(other))"
            @unknown default:
                return "Unavailable"
            }
        }
        return "Needs iOS 26"
        #else
        return "Not built in"
        #endif
    }
}
