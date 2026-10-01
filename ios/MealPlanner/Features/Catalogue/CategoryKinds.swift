import Foundation

/**
 The kinds of dish a group usually splits into, and which one a recipe looks like — the web's
 `categoryTree.ts`, word for word, so both apps suggest the same groups for the same recipes.

 Mains split by what the protein is, so those are checked first — in the name, then in the
 ingredients — before any kind of dish: a spaghetti bolognese is Beef, not Pasta, and chicken
 noodle soup is Chicken. The `nameOnly` kinds only count when the recipe's own name says so,
 since plenty of dishes have broth, an egg or a bread roll somewhere in them.
*/
enum CategoryKinds {
    struct Kind {
        let name: String
        let words: [String]
        var nameOnly = false
    }

    static let proteins: [Kind] = [
        Kind(name: "Chicken", words: ["chicken"]),
        Kind(name: "Beef", words: ["beef", "steak", "brisket", "meatball"]),
        Kind(name: "Pork", words: ["pork", "bacon", "ham", "sausage", "chorizo", "prosciutto", "pancetta"]),
        Kind(name: "Seafood", words: ["seafood", "shrimp", "prawn", "salmon", "fish", "cod", "tuna", "tilapia", "halibut",
                                      "crab", "lobster", "scallop", "clam", "mussel"]),
        Kind(name: "Turkey", words: ["turkey"]),
        Kind(name: "Lamb", words: ["lamb"]),
        Kind(name: "Vegetarian", words: ["tofu", "tempeh", "lentil", "chickpea", "black bean"]),
    ]

    static let dishes: [Kind] = [
        Kind(name: "Pasta", words: ["pasta", "spaghetti", "penne", "macaroni", "noodle", "lasagna", "linguine",
                                    "fettuccine", "rigatoni", "ravioli"]),
        Kind(name: "Rice & grains", words: ["rice", "quinoa", "couscous", "farro", "risotto"]),
        Kind(name: "Potatoes", words: ["potato"]),
        Kind(name: "Soup", words: ["soup", "stew", "chili", "chowder"], nameOnly: true),
        Kind(name: "Salad", words: ["salad", "slaw"], nameOnly: true),
        Kind(name: "Bread", words: ["bread", "biscuit", "roll", "focaccia", "cornbread"], nameOnly: true),
        Kind(name: "Eggs", words: ["egg", "omelet", "omelette", "frittata", "scramble", "quiche", "shakshuka"], nameOnly: true),
        Kind(name: "Pancakes & waffles", words: ["pancake", "waffle", "crepe", "french toast"], nameOnly: true),
        Kind(name: "Oats & granola", words: ["oat", "oatmeal", "overnight oat", "granola", "porridge"], nameOnly: true),
        Kind(name: "Baking & desserts", words: ["cookie", "bar", "brownie", "cake", "crisp", "crumble", "pie", "muffin",
                                                "cobbler", "tart", "pudding"], nameOnly: true),
        Kind(name: "Smoothies", words: ["smoothie", "shake"], nameOnly: true),
        Kind(name: "Lemonade & juice", words: ["lemonade", "juice", "punch", "iced tea"], nameOnly: true),
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

    /// For a group with no smaller groups yet: the kinds of dish in it and which recipes are
    /// which. `skip` holds names that cannot be used — the group itself and those above it.
    static func suggestSplit(_ recipes: [Recipe], skip: Set<String>) -> [(name: String, recipeIds: [UUID])] {
        var buckets: [String: [UUID]] = [:]
        for recipe in recipes {
            if let kind = kind(of: recipe, skip: skip) { buckets[kind, default: []].append(recipe.id) }
        }
        return all.compactMap { k in buckets[k.name].map { (k.name, $0) } }
    }

    /// Which of these groups a recipe most likely belongs in, for filing by hand.
    static func suggestGroup(_ recipe: Recipe, among groups: [RecipeCategory]) -> RecipeCategory? {
        if let kind = kind(of: recipe), let byKind = groups.first(where: { $0.name.lowercased() == kind.lowercased() }) {
            return byKind
        }
        // A group of their own making — "Tacos" — still matches on its name.
        let text = ([recipe.name] + recipe.ingredients.map(\.ingredientName)).joined(separator: " | ").lowercased()
        return groups.first { group in
            var word = group.name.lowercased()
            if word.hasSuffix("s") { word.removeLast() }
            return hasWord(text, word)
        }
    }
}
