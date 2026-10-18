import Foundation

/**
 The kinds of dish a recipe can be, and which one it looks like — the web's `tags.ts`, word for
 word, so both apps offer the same tag for the same recipes.

 Mains are sorted by what the protein is, so those are checked first — in the name, then in the
 ingredients — before any kind of dish: a spaghetti bolognese is Beef, not Pasta, and chicken
 noodle soup is Chicken. The `nameOnly` kinds only count when the recipe's own name says so,
 since plenty of dishes have broth, an egg or a bread roll somewhere in them. `also` lists the
 names a household is likely to have given the kind already ("Veggie" for Vegetarian), so a
 suggestion lands on the tag that is there rather than making a near-copy of it.
*/
enum CategoryKinds {
    struct Kind {
        let name: String
        let words: [String]
        var nameOnly = false
        var also: [String] = []
    }

    static let proteins: [Kind] = [
        Kind(name: "Chicken", words: ["chicken"]),
        Kind(name: "Beef", words: ["beef", "steak", "brisket", "meatball"]),
        Kind(name: "Pork", words: ["pork", "bacon", "ham", "sausage", "chorizo", "prosciutto", "pancetta"]),
        Kind(name: "Seafood", words: ["seafood", "shrimp", "prawn", "salmon", "fish", "cod", "tuna", "tilapia", "halibut",
                                      "crab", "lobster", "scallop", "clam", "mussel"],
             also: ["Fish"]),
        Kind(name: "Turkey", words: ["turkey"]),
        Kind(name: "Lamb", words: ["lamb"]),
        Kind(name: "Vegetarian", words: ["tofu", "tempeh", "lentil", "chickpea", "black bean"], also: ["Veggie", "Veg", "Vegan"]),
    ]

    static let dishes: [Kind] = [
        Kind(name: "Pasta", words: ["pasta", "spaghetti", "penne", "macaroni", "noodle", "lasagna", "linguine",
                                    "fettuccine", "rigatoni", "ravioli"]),
        Kind(name: "Rice & grains", words: ["rice", "quinoa", "couscous", "farro", "risotto"], also: ["Rice", "Grains"]),
        Kind(name: "Potatoes", words: ["potato"]),
        Kind(name: "Soup", words: ["soup", "stew", "chili", "chowder"], nameOnly: true),
        Kind(name: "Salad", words: ["salad", "slaw"], nameOnly: true),
        Kind(name: "Bread", words: ["bread", "biscuit", "roll", "focaccia", "cornbread"], nameOnly: true),
        Kind(name: "Eggs", words: ["egg", "omelet", "omelette", "frittata", "scramble", "quiche", "shakshuka"], nameOnly: true),
        Kind(name: "Pancakes & waffles", words: ["pancake", "waffle", "crepe", "french toast"], nameOnly: true,
             also: ["Pancakes"]),
        Kind(name: "Oats & granola", words: ["oat", "oatmeal", "overnight oat", "granola", "porridge"], nameOnly: true,
             also: ["Oats"]),
        Kind(name: "Baking & desserts", words: ["cookie", "bar", "brownie", "cake", "crisp", "crumble", "pie", "muffin",
                                                "cobbler", "tart", "pudding"], nameOnly: true,
             also: ["Baking", "Desserts", "Sweet"]),
        Kind(name: "Smoothies", words: ["smoothie", "shake"], nameOnly: true),
        Kind(name: "Lemonade & juice", words: ["lemonade", "juice", "punch", "iced tea"], nameOnly: true, also: ["Juice"]),
    ]

    static var all: [Kind] { proteins + dishes }

    /// The word on its own (or with an s or es), not inside another word.
    static func hasWord(_ text: String, _ word: String) -> Bool {
        let escaped = NSRegularExpression.escapedPattern(for: word)
        return text.range(of: "\\b\(escaped)(e?s)?\\b", options: .regularExpression) != nil
    }

    /// The kind of dish a recipe looks like, or nil. First match wins: a protein in the name, a
    /// protein in the ingredients, a dish in the name, a dish in the ingredients.
    static func kind(of recipe: Recipe, skip: Set<String> = []) -> String? {
        let name = recipe.name.lowercased()
        let ingredients = recipe.ingredients.map { $0.ingredientName.lowercased() }
        func usable(_ kinds: [Kind]) -> [Kind] { kinds.filter { !skip.contains($0.name.lowercased()) } }
        func inName(_ k: Kind) -> Bool { k.words.contains { hasWord(name, $0) } }
        func inIngredients(_ k: Kind) -> Bool {
            !k.nameOnly && ingredients.contains { i in k.words.contains { hasWord(i, $0) } }
        }
        for kinds in [usable(proteins), usable(dishes)] {
            if let match = kinds.first(where: inName) ?? kinds.first(where: inIngredients) { return match.name }
        }
        return nil
    }

    /// A tag the quick-tag card offers, and for which recipes.
    struct TagSuggestion {
        /// The tag's name: the drawer's own spelling when it has one already.
        let name: String
        let recipeIds: [UUID]
        /// The drawer has this tag already (a seeded "Veggie"): tagging them is all there is to do.
        let existing: Bool
    }

    /**
     Tags worth offering for a drawer's untagged recipes: each kind that two or more of them look
     like, with which ones, biggest first — the quick-tag card's "4 untagged recipes look like
     Chicken". A kind the drawer already has a tag for, under its own name or one of its `also`
     names (and give or take an s), is offered as that tag. The web's suggestTags, so both apps
     offer the same tag for the same recipes.
    */
    static func suggestTags(_ untagged: [Recipe], existing names: [String]) -> [TagSuggestion] {
        func singular(_ name: String) -> String {
            name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                .replacingOccurrences(of: "e?s$", with: "", options: .regularExpression)
        }
        var buckets: [String: [UUID]] = [:]
        for recipe in untagged {
            if let kind = kind(of: recipe) { buckets[kind, default: []].append(recipe.id) }
        }
        let found = all.compactMap { k -> TagSuggestion? in
            guard let ids = buckets[k.name], ids.count >= 2 else { return nil }
            let forms = ([k.name] + k.also).map(singular)
            let there = names.first { forms.contains(singular($0)) }
            return TagSuggestion(name: there ?? k.name, recipeIds: ids, existing: there != nil)
        }
        // Biggest first; a tie keeps the kinds' order, as the web's stable sort does.
        return found.indices
            .sorted { a, b in
                let (x, y) = (found[a].recipeIds.count, found[b].recipeIds.count)
                return x != y ? x > y : a < b
            }
            .map { found[$0] }
    }

    /**
     Whether a tag makes a recipe a main, for the plan's Mains chip: one called "Main…", or one
     named after a protein — Chicken, Beef, Vegetarian — since that is what mains are sorted by.
     The web's FillSlot has the same rule.
    */
    static func isMainTag(_ name: String) -> Bool {
        name.range(of: #"\bmain"#, options: [.regularExpression, .caseInsensitive]) != nil
            || proteins.contains { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    /// A "Side…" tag, for the plan's Sides chip.
    static func isSideTag(_ name: String) -> Bool {
        name.range(of: #"\bside"#, options: [.regularExpression, .caseInsensitive]) != nil
    }
}
