package com.gehan.mealplanner.nutrition;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The USDA food for the things nearly every recipe uses, chosen by hand.
 *
 * Word matching alone gets "egg" to one of a dozen egg rows and "milk" to one of forty, and the
 * difference between them is real (a whole egg against a dried yolk). For the few hundred names
 * that make up most recipe lines it is worth simply saying which row is meant — the basic, raw,
 * as-bought one — and leaving the scorer for everything else. British names sit next to American
 * ones because the recipes in this app use both.
 *
 * Ids are USDA FoodData Central fdc_ids; a test checks each one is in the bundled table.
 */
final class Staples {

    private Staples() {
    }

    private static final Map<Integer, List<String>> BY_FOOD = Map.ofEntries(
            // Eggs and dairy
            Map.entry(171287, List.of("egg", "eggs", "whole egg", "free range egg", "large egg", "medium egg")),
            Map.entry(172184, List.of("egg yolk", "egg yolks", "yolk")),
            Map.entry(172183, List.of("egg white", "egg whites")),
            Map.entry(173410, List.of("butter", "salted butter")),
            Map.entry(173430, List.of("unsalted butter")),
            Map.entry(171267, List.of("milk", "semi skimmed milk", "semi-skimmed milk", "2% milk")),
            Map.entry(171265, List.of("whole milk", "full fat milk", "full-fat milk")),
            Map.entry(171269, List.of("skimmed milk", "skim milk", "nonfat milk")),
            Map.entry(170859, List.of("double cream", "heavy cream", "whipping cream", "heavy whipping cream", "cream")),
            Map.entry(170857, List.of("single cream", "light cream")),
            Map.entry(171257, List.of("sour cream", "soured cream")),
            Map.entry(173414, List.of("cheddar", "cheddar cheese", "mature cheddar", "grated cheese", "cheese")),
            Map.entry(171247, List.of("parmesan", "parmesan cheese", "parmigiano reggiano", "grated parmesan")),
            Map.entry(170845, List.of("mozzarella", "mozzarella cheese")),
            Map.entry(173420, List.of("feta", "feta cheese")),
            Map.entry(173418, List.of("cream cheese", "soft cheese")),
            Map.entry(170851, List.of("ricotta", "ricotta cheese")),
            Map.entry(171251, List.of("swiss cheese", "emmental")),
            Map.entry(171242, List.of("gruyere", "gruyere cheese")),
            Map.entry(173435, List.of("goats cheese", "goat cheese")),
            Map.entry(171304, List.of("greek yogurt", "greek yoghurt", "greek style yogurt", "greek style yoghurt")),
            Map.entry(171284, List.of("yogurt", "yoghurt", "plain yogurt", "natural yogurt", "natural yoghurt")),
            // Fats and oils
            Map.entry(171413, List.of("olive oil", "extra virgin olive oil", "virgin olive oil", "light olive oil")),
            Map.entry(171411, List.of("vegetable oil", "oil", "cooking oil", "frying oil")),
            Map.entry(172336, List.of("rapeseed oil", "canola oil")),
            Map.entry(171017, List.of("sunflower oil")),
            Map.entry(171016, List.of("sesame oil", "toasted sesame oil")),
            Map.entry(171412, List.of("coconut oil")),
            Map.entry(171009, List.of("mayonnaise", "mayo")),
            // Vegetables
            Map.entry(170000, List.of("onion", "onions", "brown onion", "yellow onion", "white onion")),
            Map.entry(790577, List.of("red onion", "red onions")),
            Map.entry(170499, List.of("shallot", "shallots", "banana shallot")),
            Map.entry(170005, List.of("spring onion", "spring onions", "scallion", "scallions", "green onion")),
            Map.entry(169230, List.of("garlic", "garlic clove", "garlic cloves", "clove garlic", "cloves garlic")),
            Map.entry(170393, List.of("carrot", "carrots")),
            Map.entry(169988, List.of("celery", "celery stick", "celery sticks", "celery stalk")),
            Map.entry(170026, List.of("potato", "potatoes", "baking potato", "maris piper potato", "new potatoes",
                    "new potato", "white potato")),
            Map.entry(168482, List.of("sweet potato", "sweet potatoes")),
            Map.entry(170457, List.of("tomato", "tomatoes", "cherry tomatoes", "cherry tomato", "plum tomatoes")),
            Map.entry(170051, List.of("chopped tomatoes", "tinned tomatoes", "canned tomatoes", "tin chopped tomatoes",
                    "tinned chopped tomatoes", "crushed tomatoes", "diced tomatoes", "plum tomatoes tinned")),
            Map.entry(170460, List.of("passata", "tomato passata", "tomato sauce")),
            Map.entry(170459, List.of("tomato puree", "tomato paste")),
            Map.entry(169251, List.of("mushroom", "mushrooms", "button mushrooms", "white mushrooms")),
            Map.entry(168434, List.of("chestnut mushrooms", "chestnut mushroom", "cremini mushrooms", "crimini mushrooms")),
            Map.entry(168462, List.of("spinach", "baby spinach")),
            Map.entry(170108, List.of("red pepper", "red peppers", "bell pepper", "bell peppers",
                    "red bell pepper", "yellow pepper", "orange pepper")),
            Map.entry(170427, List.of("green pepper", "green peppers", "green bell pepper")),
            Map.entry(169291, List.of("courgette", "courgettes", "zucchini")),
            Map.entry(169228, List.of("aubergine", "aubergines", "eggplant", "egg plant", "egg plants")),
            Map.entry(170379, List.of("broccoli", "tenderstem broccoli", "broccoli florets")),
            Map.entry(169986, List.of("cauliflower")),
            Map.entry(169975, List.of("cabbage", "white cabbage", "savoy cabbage")),
            Map.entry(170016, List.of("peas", "frozen peas", "garden peas", "petit pois")),
            Map.entry(169214, List.of("sweetcorn", "sweet corn", "corn", "tinned sweetcorn")),
            Map.entry(170106, List.of("chilli", "chillies", "red chilli", "chili", "chilies", "green chilli",
                    "fresh chilli", "red chili")),
            Map.entry(169231, List.of("ginger", "fresh ginger", "root ginger", "ginger root")),
            Map.entry(169246, List.of("leek", "leeks")),
            Map.entry(168421, List.of("kale", "cavolo nero")),
            Map.entry(168389, List.of("asparagus", "asparagus spears")),
            Map.entry(169961, List.of("green beans", "fine beans", "french beans", "runner beans")),
            Map.entry(169295, List.of("butternut squash", "squash")),
            Map.entry(169145, List.of("beetroot", "beets", "beet")),
            Map.entry(170417, List.of("parsnip", "parsnips")),
            Map.entry(168409, List.of("cucumber")),
            Map.entry(171705, List.of("avocado", "avocados")),
            Map.entry(169247, List.of("lettuce", "romaine lettuce", "cos lettuce", "little gem")),
            Map.entry(169387, List.of("rocket", "arugula")),
            Map.entry(170390, List.of("pak choi", "bok choy", "pak choy")),
            Map.entry(170383, List.of("brussels sprouts", "sprouts")),
            Map.entry(169385, List.of("fennel", "fennel bulb")),
            Map.entry(169276, List.of("radish", "radishes")),
            // Fruit
            Map.entry(167746, List.of("lemon", "lemons")),
            Map.entry(167747, List.of("lemon juice")),
            Map.entry(167749, List.of("lemon zest", "lemon peel")),
            Map.entry(168155, List.of("lime", "limes")),
            Map.entry(168156, List.of("lime juice")),
            Map.entry(171688, List.of("apple", "apples")),
            Map.entry(173944, List.of("banana", "bananas")),
            Map.entry(169097, List.of("orange", "oranges")),
            Map.entry(167762, List.of("strawberries", "strawberry")),
            Map.entry(171711, List.of("blueberries", "blueberry")),
            Map.entry(167755, List.of("raspberries", "raspberry")),
            Map.entry(173946, List.of("blackberries", "blackberry")),
            Map.entry(174683, List.of("grapes", "grape")),
            Map.entry(169124, List.of("pineapple")),
            Map.entry(168165, List.of("raisins", "raisin")),
            Map.entry(168164, List.of("golden raisins")),
            // Herbs and spices
            Map.entry(169997, List.of("coriander", "fresh coriander", "coriander leaves", "cilantro")),
            Map.entry(172232, List.of("basil", "fresh basil", "basil leaves")),
            Map.entry(170416, List.of("parsley", "flat leaf parsley", "fresh parsley", "curly parsley")),
            Map.entry(173470, List.of("thyme", "fresh thyme", "thyme sprigs")),
            Map.entry(173473, List.of("rosemary", "fresh rosemary", "rosemary sprigs")),
            Map.entry(173475, List.of("mint", "fresh mint", "mint leaves")),
            Map.entry(172233, List.of("dill", "fresh dill")),
            Map.entry(169994, List.of("chives", "fresh chives")),
            Map.entry(170917, List.of("bay leaf", "bay leaves")),
            Map.entry(173468, List.of("salt", "sea salt", "table salt", "fine salt", "flaky sea salt", "kosher salt")),
            Map.entry(170931, List.of("pepper", "black pepper", "ground black pepper", "pepper ground", "cracked black pepper",
                    "freshly ground black pepper")),
            Map.entry(170923, List.of("cumin", "ground cumin", "cumin seeds")),
            Map.entry(171329, List.of("paprika", "smoked paprika", "sweet paprika")),
            Map.entry(171319, List.of("chilli powder", "chili powder")),
            Map.entry(170932, List.of("cayenne", "cayenne pepper", "chilli flakes", "red pepper flakes",
                    "chili flakes", "dried chilli flakes")),
            Map.entry(171320, List.of("cinnamon", "ground cinnamon")),
            Map.entry(171326, List.of("nutmeg", "ground nutmeg")),
            Map.entry(171328, List.of("oregano", "dried oregano")),
            Map.entry(171325, List.of("garlic powder")),
            Map.entry(171327, List.of("onion powder")),
            Map.entry(172231, List.of("turmeric", "ground turmeric")),
            Map.entry(170926, List.of("ground ginger")),
            Map.entry(170924, List.of("curry powder")),
            Map.entry(170922, List.of("ground coriander", "coriander seeds")),
            Map.entry(171321, List.of("cloves ground", "ground cloves")),
            // Baking and the store cupboard
            Map.entry(168894, List.of("flour", "plain flour", "all purpose flour", "all-purpose flour", "white flour")),
            Map.entry(168895, List.of("self raising flour", "self-raising flour", "self rising flour")),
            Map.entry(168896, List.of("bread flour", "strong white flour", "strong flour")),
            Map.entry(168893, List.of("wholemeal flour", "whole wheat flour", "wholewheat flour")),
            Map.entry(169655, List.of("sugar", "caster sugar", "granulated sugar", "white sugar")),
            Map.entry(168833, List.of("brown sugar", "light brown sugar", "dark brown sugar", "soft brown sugar",
                    "muscovado sugar", "demerara sugar")),
            Map.entry(169656, List.of("icing sugar", "powdered sugar")),
            Map.entry(169640, List.of("honey", "runny honey")),
            Map.entry(169661, List.of("maple syrup")),
            Map.entry(168820, List.of("treacle", "black treacle", "molasses")),
            // No golden syrup in USDA; light corn syrup is the usual stand-in for it.
            Map.entry(168837, List.of("golden syrup", "corn syrup", "light corn syrup", "glucose syrup")),
            Map.entry(172804, List.of("baking powder")),
            Map.entry(175040, List.of("baking soda", "bicarbonate of soda", "bicarb")),
            Map.entry(169698, List.of("cornflour", "cornstarch", "corn starch")),
            Map.entry(173471, List.of("vanilla extract", "vanilla", "vanilla essence")),
            Map.entry(169593, List.of("cocoa", "cocoa powder")),
            Map.entry(170272, List.of("dark chocolate", "plain chocolate")),
            Map.entry(175043, List.of("yeast", "dried yeast", "fast action yeast", "active dry yeast", "instant yeast")),
            Map.entry(169641, List.of("jam", "strawberry jam", "raspberry jam")),
            Map.entry(168877, List.of("rice", "white rice", "basmati rice", "long grain rice", "jasmine rice")),
            Map.entry(169703, List.of("brown rice")),
            Map.entry(169736, List.of("pasta", "spaghetti", "penne", "fusilli", "linguine", "tagliatelle", "rigatoni",
                    "macaroni", "lasagne sheets", "lasagna noodles", "dried pasta", "farfalle", "orzo")),
            Map.entry(169731, List.of("egg noodles", "noodles")),
            Map.entry(169699, List.of("couscous")),
            Map.entry(168874, List.of("quinoa")),
            Map.entry(169705, List.of("oats", "porridge oats", "rolled oats", "oat")),
            Map.entry(174924, List.of("bread", "white bread", "sliced bread", "sandwich bread")),
            Map.entry(172688, List.of("wholemeal bread", "brown bread", "whole wheat bread")),
            Map.entry(174928, List.of("breadcrumbs", "dried breadcrumbs", "bread crumbs", "panko",
                    "panko breadcrumbs")),
            Map.entry(167535, List.of("tortilla", "tortillas", "flour tortillas", "tortilla wraps", "wraps", "wrap")),
            // Beans, nuts, seeds
            Map.entry(173800, List.of("chickpeas", "chickpea", "tinned chickpeas", "canned chickpeas")),
            Map.entry(174285, List.of("kidney beans", "red kidney beans")),
            Map.entry(175238, List.of("black beans")),
            Map.entry(172420, List.of("lentils", "red lentils", "green lentils", "puy lentils", "brown lentils")),
            Map.entry(172475, List.of("tofu", "firm tofu", "extra firm tofu")),
            Map.entry(174294, List.of("peanut butter", "smooth peanut butter", "crunchy peanut butter")),
            Map.entry(170567, List.of("almonds", "flaked almonds", "ground almonds")),
            Map.entry(170187, List.of("walnuts", "walnut")),
            Map.entry(170591, List.of("pine nuts")),
            Map.entry(170162, List.of("cashews", "cashew nuts")),
            Map.entry(172430, List.of("peanuts")),
            Map.entry(170150, List.of("sesame seeds")),
            Map.entry(170554, List.of("chia seeds")),
            Map.entry(170189, List.of("tahini")),
            Map.entry(174289, List.of("hummus", "houmous")),
            Map.entry(170173, List.of("coconut milk", "tinned coconut milk", "light coconut milk")),
            // Meat and fish
            Map.entry(171077, List.of("chicken breast", "chicken breasts", "skinless chicken breast",
                    "boneless chicken breast", "chicken breast fillets", "chicken fillet", "chicken fillets",
                    "skinless chicken breasts", "boneless skinless chicken breasts")),
            Map.entry(173627, List.of("chicken thighs", "chicken thigh", "boneless chicken thighs",
                    "skinless chicken thighs", "chicken thigh fillets")),
            Map.entry(172385, List.of("chicken thighs skin on", "skin on chicken thighs", "bone in chicken thighs")),
            Map.entry(172373, List.of("chicken drumsticks", "chicken drumstick", "drumsticks")),
            Map.entry(171447, List.of("chicken", "whole chicken")),
            Map.entry(171796, List.of("beef mince", "minced beef", "mince", "ground beef")),
            Map.entry(174030, List.of("lean mince", "lean beef mince", "5% beef mince", "extra lean beef mince")),
            Map.entry(167902, List.of("pork mince", "minced pork", "ground pork")),
            Map.entry(174370, List.of("lamb mince", "minced lamb", "ground lamb")),
            Map.entry(171505, List.of("turkey mince", "minced turkey", "ground turkey")),
            Map.entry(168728, List.of("steak", "sirloin steak", "beef steak", "sirloin")),
            Map.entry(167843, List.of("pork shoulder", "pork")),
            Map.entry(168238, List.of("pork chops", "pork chop")),
            Map.entry(168277, List.of("bacon", "streaky bacon", "back bacon", "bacon rashers", "smoked bacon",
                    "pancetta", "lardons")),
            Map.entry(172934, List.of("sausages", "sausage", "pork sausages", "pork sausage")),
            Map.entry(173859, List.of("chorizo")),
            Map.entry(171618, List.of("black pudding", "blood sausage")),
            Map.entry(173864, List.of("ham", "sliced ham", "cooked ham")),
            Map.entry(175167, List.of("salmon", "salmon fillet", "salmon fillets")),
            Map.entry(171955, List.of("cod", "cod fillet", "cod fillets", "white fish", "white fish fillets",
                    "white fish fillet")),
            Map.entry(173709, List.of("tuna", "tinned tuna", "canned tuna", "tuna chunks")),
            Map.entry(175179, List.of("prawns", "king prawns", "raw prawns", "shrimp", "tiger prawns")),
            // Sauces, stocks, drinks
            Map.entry(174277, List.of("soy sauce", "light soy sauce", "dark soy sauce", "soya sauce")),
            Map.entry(171610, List.of("worcestershire sauce")),
            Map.entry(174531, List.of("fish sauce")),
            Map.entry(172237, List.of("vinegar", "white vinegar", "white wine vinegar", "malt vinegar")),
            Map.entry(172240, List.of("red wine vinegar")),
            Map.entry(172241, List.of("balsamic vinegar", "balsamic")),
            Map.entry(173469, List.of("apple cider vinegar", "cider vinegar")),
            Map.entry(172234, List.of("mustard", "english mustard", "dijon mustard", "wholegrain mustard",
                    "yellow mustard")),
            Map.entry(168556, List.of("ketchup", "tomato ketchup")),
            Map.entry(172884, List.of("chicken stock", "chicken broth")),
            Map.entry(172883, List.of("beef stock", "beef broth")),
            Map.entry(171583, List.of("vegetable stock", "veg stock", "vegetable broth", "stock")),
            Map.entry(171613, List.of("stock cube", "stock cubes", "chicken stock cube", "beef stock cube",
                    "vegetable stock cube", "bouillon", "bouillon cube")),
            Map.entry(173190, List.of("red wine")),
            Map.entry(173185, List.of("wine", "white wine", "dry white wine")),
            Map.entry(171410, List.of("peanut oil", "groundnut oil")),
            Map.entry(170929, List.of("mustard powder", "english mustard powder")),
            Map.entry(171323, List.of("fennel seeds", "fennel seed")),
            Map.entry(171890, List.of("coffee", "brewed coffee", "black coffee", "espresso")),
            Map.entry(173227, List.of("tea", "black tea")),
            Map.entry(172791, List.of("filo pastry", "phyllo pastry", "filo", "phyllo dough")),
            Map.entry(175024, List.of("shortcrust pastry", "pie crust", "pastry")),
            Map.entry(174915, List.of("pitta", "pitta bread", "pita bread", "pittas", "pita")),
            Map.entry(171845, List.of("naan", "naan bread")),
            Map.entry(172675, List.of("baguette", "french bread", "sourdough", "sourdough bread", "ciabatta")),
            Map.entry(171812, List.of("beef fillet", "fillet steak", "beef tenderloin")),
            Map.entry(168249, List.of("pork fillet", "pork tenderloin")),
            Map.entry(172346, List.of("margarine", "baking spread")),
            Map.entry(174957, List.of("digestive biscuits", "digestives", "graham crackers")),
            Map.entry(171908, List.of("rose wine")),
            Map.entry(168746, List.of("beer", "lager", "ale")),
            Map.entry(173647, List.of("water", "cold water", "warm water", "boiling water", "hot water")),
            Map.entry(172238, List.of("capers")),
            Map.entry(169094, List.of("olives", "black olives", "green olives", "kalamata olives")));

    private static final Map<String, Integer> BY_PHRASE = phrases();

    private static Map<String, Integer> phrases() {
        Map<String, Integer> byPhrase = new HashMap<>();
        BY_FOOD.forEach((fdcId, names) -> {
            for (String name : names) byPhrase.put(key(name), fdcId);
        });
        return Map.copyOf(byPhrase);
    }

    /** The same words a recipe line is reduced to, so "Finely chopped onions" finds "onion". */
    static String key(String name) {
        return String.join(" ", FoodWords.queryWords(name));
    }

    static Integer find(String name) {
        return BY_PHRASE.get(key(name));
    }

    static Map<Integer, List<String>> all() {
        return BY_FOOD;
    }
}
