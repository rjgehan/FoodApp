import SwiftUI

/**
 The app's colours, and the same ones the web uses.

 Every value here has a twin in `web/src/index.css`. They are written out rather than derived
 because there is no way to share a stylesheet between SwiftUI and Tailwind — so the rule is
 that neither side invents a colour, and a change happens in both files or not at all.

 The greys are deliberately absent. UIKit's semantic colours already say "page", "card" and
 "separator", they adapt to dark mode and Increase Contrast on their own, and they are what
 the rest of the system is drawn with:

   Color(.systemGroupedBackground)           the page, the well a card sits on
   Color(.secondarySystemGroupedBackground)  the card
   Color(.separator)                         a hairline between rows

 What is here is what UIKit cannot know: the orange that means "you can act", and the six
 tints that make a recipe recognisable when you flip past it.
 */
enum Palette {

    /// The one colour that means "you can act". Without it every button is Apple's blue,
    /// which is the single clearest sign that nobody chose anything.
    static let accent = dynamic(light: 0xEA580C, dark: 0xFF9F40)

    /// The accent at a whisper — behind an avatar, or under a selected day. The web's
    /// --accent-soft, which is a warm tint in light and a dark ember in dark, not the accent
    /// at low opacity.
    static let accentSoft = dynamic(light: 0xFFEDD5, dark: 0x402008)

    /**
     Recipe tints, in the web's order so the same recipe is the same colour in both places.

     Pastel in light and deep in dark, rather than one colour at low opacity: a tint that is
     only a faded accent reads as a disabled state, and six faded accents read as one mistake
     repeated six times.
    */
    private static let covers: [Color] = [
        dynamic(light: 0xFBE3CE, dark: 0x5A3620),
        dynamic(light: 0xF8EAD0, dark: 0x53431D),
        dynamic(light: 0xE2ECDB, dark: 0x2D4A2B),
        dynamic(light: 0xF2DEE6, dark: 0x4C2C3C),
        dynamic(light: 0xDDE8F1, dark: 0x27404F),
        dynamic(light: 0xEEE4D9, dark: 0x473A2F),
    ]

    /// One of the six by position, for the handful of places that choose a tint deliberately
    /// rather than deriving it from a name.
    static func cover(index: Int) -> Color { covers[index % covers.count] }

    /// The same hash the web's `coverClass` uses, over the same six colours, so a group keeps
    /// its colour across both — and keeps it between launches, which is what makes it useful.
    static func cover(for id: String) -> Color {
        var hash: UInt32 = 0
        for scalar in id.unicodeScalars { hash = hash &* 31 &+ scalar.value }
        return covers[Int(hash % UInt32(covers.count))]
    }

    private static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light) })
    }
}

private extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}
