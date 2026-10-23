import SwiftUI
import UIKit

/**
 The kitchen machines a household can have and a recipe can need — the same keys, labels and
 order as the backend's `KitchenMachines` and the web's `utils/machines.ts`. The server stores
 only the key and refuses one it does not know, so the three lists move together; the e2e suite
 reads all three and fails if they disagree.

 The drawings are the web's (`MachineIcons.tsx`), exported into Assets.xcassets/MachineIcons as
 template vectors, so they tint like an SF Symbol. Until a drawing is in the asset catalog the
 machine wears a plain SF Symbol instead, so nothing ever shows as a missing-image hole.
*/
struct KitchenMachine: Identifiable, Hashable {
    let key: String
    /// The whole name, for the kitchen's tiles and for VoiceOver.
    let label: String
    /// What fits on a chip or a pill — "Instant Pot" beside a count reads, the full label wraps.
    /// The web's `short`, word for word, so a recipe wears the same words on both.
    let short: String
    /// Only until the drawing is exported: the nearest symbol iOS 17 has.
    let fallbackSymbol: String

    var id: String { key }

    /// Its drawing, tinted by whatever `foregroundStyle` it is given. One place to change how a
    /// machine is drawn, everywhere.
    var image: Image {
        let asset = "MachineIcons/\(key)"
        if UIImage(named: asset) != nil {
            return Image(asset).renderingMode(.template)
        }
        return Image(systemName: fallbackSymbol)
    }

    /// In the catalogue's order, which is the order every list of machines is shown in.
    static let all: [KitchenMachine] = [
        KitchenMachine(key: "oven", label: "Oven", short: "Oven", fallbackSymbol: "oven"),
        KitchenMachine(key: "stovetop", label: "Stovetop", short: "Stovetop", fallbackSymbol: "cooktop"),
        KitchenMachine(key: "microwave", label: "Microwave", short: "Microwave", fallbackSymbol: "microwave"),
        KitchenMachine(key: "air-fryer", label: "Air fryer", short: "Air fryer", fallbackSymbol: "wind"),
        KitchenMachine(key: "slow-cooker", label: "Slow cooker", short: "Slow cooker", fallbackSymbol: "timer"),
        KitchenMachine(key: "pressure-cooker", label: "Instant Pot / pressure cooker", short: "Instant Pot",
                       fallbackSymbol: "bolt.circle"),
        KitchenMachine(key: "grill", label: "Grill / BBQ", short: "Grill", fallbackSymbol: "flame"),
        KitchenMachine(key: "blender", label: "Blender", short: "Blender", fallbackSymbol: "tornado"),
        KitchenMachine(key: "food-processor", label: "Food processor", short: "Processor", fallbackSymbol: "scissors"),
        KitchenMachine(key: "mixer", label: "Stand or hand mixer", short: "Mixer", fallbackSymbol: "hurricane"),
        KitchenMachine(key: "rice-cooker", label: "Rice cooker", short: "Rice cooker", fallbackSymbol: "cup.and.saucer"),
    ]

    /// Nil for a key this build does not know — a newer server's — which is then left out.
    static func named(_ key: String) -> KitchenMachine? {
        all.first { $0.key == key }
    }

    /// The machines among `keys`, in the catalogue's order, unknown ones dropped.
    static func ordered<Keys: Sequence>(_ keys: Keys) -> [KitchenMachine] where Keys.Element == String {
        let wanted = Set(keys)
        return all.filter { wanted.contains($0.key) }
    }

    /// Machines that do the same job, so a recipe naming two of one family is asking for either:
    /// "bake, or air fry at 180C". The server's `KitchenMachines.STAND_INS` and the web's
    /// `STAND_INS` say the same, and the e2e suite fails if the three drift apart.
    static let standIns: [[String]] = [
        ["oven", "air-fryer"],
        ["slow-cooker", "pressure-cooker"],
        ["blender", "food-processor"],
    ]

    /// What a kitchen lacks to make a recipe needing these machines, as the server's
    /// `KitchenMachines.missing` works it out — empty when it can make it. Each entry is one thing
    /// to get: a single machine, or two stand-ins either of which would do (the recipe said "oven
    /// or air fryer" and the kitchen has neither). A kitchen with no machines saved has never said
    /// what is in it and lacks nothing; the stovetop is taken to be in every kitchen, ticked or not.
    static func missing<Needs: Sequence>(_ needs: Needs, kitchen: [String]?) -> [[KitchenMachine]]
    where Needs.Element == String {
        let have = Set(kitchen ?? [])
        var wanted = Set(needs)
        guard !have.isEmpty, !wanted.isEmpty else { return [] }
        wanted.remove("stovetop")
        var missing: [[KitchenMachine]] = []
        for family in standIns {
            let named = family.filter { wanted.contains($0) }
            guard named.count > 1 else { continue }
            named.forEach { wanted.remove($0) }
            if !named.contains(where: { have.contains($0) }) { missing.append(ordered(named)) }
        }
        for machine in ordered(wanted) where !have.contains(machine.key) {
            missing.append([machine])
        }
        return missing.filter { !$0.isEmpty }.sorted {
            (all.firstIndex(of: $0[0]) ?? 0) < (all.firstIndex(of: $1[0]) ?? 0)
        }
    }

    /// Whether a kitchen with these machines can make a recipe that needs those; see `missing`.
    static func canMake<Needs: Sequence>(_ needs: Needs, kitchen: [String]?) -> Bool where Needs.Element == String {
        missing(needs, kitchen: kitchen).isEmpty
    }

    /// "slow cooker", "oven or air fryer", "slow cooker or blender": what a kitchen lacks, as "Your
    /// kitchen has no …" says it — the web's missingWords.
    static func missingWords(_ missing: [[KitchenMachine]]) -> String {
        let words = missing.flatMap { $0 }.map { $0.key == "pressure-cooker" ? $0.short : $0.short.lowercased() }
        guard let last = words.last else { return "" }
        return words.count > 1 ? "\(words.dropLast().joined(separator: ", ")) or \(last)" : last
    }

    /// "oven and air fryer": machines as a sentence says them — the web's machineWords. Instant
    /// Pot keeps its capitals, being a name.
    static func words(_ machines: [KitchenMachine]) -> String {
        let words = machines.map { $0.key == "pressure-cooker" ? $0.short : $0.short.lowercased() }
        guard let last = words.last else { return "" }
        return words.count > 1 ? "\(words.dropLast().joined(separator: ", ")) and \(last)" : last
    }
}

/// A machine as a small pill: its drawing and its short name — the drawer's machine filter (with a
/// count, and filled while it is on) and the recipe form's Machines chips.
struct MachinePill: View {
    let machine: KitchenMachine
    var count: Int?
    var isOn = false

    var body: some View {
        HStack(spacing: 5) {
            machine.image
                .resizable()
                .scaledToFit()
                .frame(width: 15, height: 15)
            Text(machine.short)
            if let count {
                Text("\(count)").foregroundStyle(isOn ? Palette.bg.opacity(0.75) : Palette.muted)
            }
        }
        .font(.system(size: 13, weight: isOn ? .semibold : .medium))
        .lineLimit(1)
        .foregroundStyle(isOn ? Palette.bg : Palette.text)
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(isOn ? Palette.text : Palette.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(isOn ? Palette.text : Palette.border, lineWidth: 1))
        .fixedSize()
        .contentShape(Capsule())
    }
}

/// "Can make": only the recipes this house's kitchen has the machines for, with how many there
/// are — first on a drawer's Machines row, and beside Global recipes' filters. The web's CanMakeChip.
struct CanMakePill: View {
    var count: Int?
    var isOn = false

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .bold))
            Text("Can make")
            if let count {
                Text("\(count)").foregroundStyle(isOn ? Palette.bg.opacity(0.75) : Palette.muted)
            }
        }
        .font(.system(size: 13, weight: isOn ? .semibold : .medium))
        .lineLimit(1)
        .foregroundStyle(isOn ? Palette.bg : Palette.text)
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(isOn ? Palette.text : Palette.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(isOn ? Palette.text : Palette.border, lineWidth: 1))
        .fixedSize()
        .contentShape(Capsule())
    }
}

#Preview("Machines") {
    ScrollView {
        ChipFlow {
            ForEach(KitchenMachine.all) { MachinePill(machine: $0, count: 3, isOn: $0.key == "air-fryer") }
        }
        .padding(20)
    }
    .pageBackground()
}
