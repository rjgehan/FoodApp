/*
 Safari runs this inside the page before the extension opens.

 Two things come back. First, and much better, the page's own machine-readable recipe: nearly
 every recipe site embeds a schema.org Recipe in a <script type="application/ld+json">, with
 the exact ingredient list and the exact steps. Using it means nothing has to be guessed —
 no model, no scraping a blog's prose.

 That matters because the prose is a trap. Food blogs run an "ingredient notes" section that
 looks exactly like an ingredient list to a reader and to a language model — "Butter – use
 unsalted butter to sautee onions" — and it is not the recipe.

 Second, the visible text, as a fallback for pages with no structured data.
*/
var ExtensionPreprocessingJS = new (function () {
  // "PT1H30M" -> 90
  function minutes(iso) {
    if (typeof iso !== "string") return 0;
    var match = iso.match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return 0;
    return (parseInt(match[1] || 0, 10) * 60) + parseInt(match[2] || 0, 10);
  }

  function serves(value) {
    if (Array.isArray(value)) value = value[0];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      var digits = value.match(/\d+/);
      if (digits) return parseInt(digits[0], 10);
    }
    return 0;
  }

  // Instructions come as strings, as HowToStep objects, or as HowToSections holding steps.
  function steps(value, out) {
    out = out || [];
    if (!value) return out;
    if (typeof value === "string") {
      value.split(/\n+/).forEach(function (line) {
        var text = line.replace(/<[^>]+>/g, "").trim();
        if (text) out.push(text);
      });
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach(function (entry) { steps(entry, out); });
      return out;
    }
    if (value.itemListElement) return steps(value.itemListElement, out);
    if (value.text) {
      var text = String(value.text).replace(/<[^>]+>/g, "").trim();
      if (text) out.push(text);
    }
    return out;
  }

  function isRecipe(node) {
    if (!node || typeof node !== "object") return false;
    var type = node["@type"];
    if (Array.isArray(type)) return type.indexOf("Recipe") !== -1;
    return type === "Recipe";
  }

  // The Recipe can sit at the top, in an array, or inside an @graph.
  function findRecipe(node) {
    if (!node || typeof node !== "object") return null;
    if (isRecipe(node)) return node;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var found = findRecipe(node[i]);
        if (found) return found;
      }
      return null;
    }
    if (node["@graph"]) return findRecipe(node["@graph"]);
    return null;
  }

  function structured() {
    var blocks = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < blocks.length; i++) {
      var parsed;
      try {
        parsed = JSON.parse(blocks[i].textContent);
      } catch (e) {
        continue;
      }
      var recipe = findRecipe(parsed);
      if (!recipe) continue;

      var ingredients = (recipe.recipeIngredient || recipe.ingredients || [])
        .map(function (line) { return String(line).replace(/\s+/g, " ").trim(); })
        .filter(function (line) { return line.length > 0; });
      if (!ingredients.length) continue;

      return {
        name: String(recipe.name || document.title || "").trim(),
        servings: serves(recipe.recipeYield),
        prep: minutes(recipe.prepTime),
        cook: minutes(recipe.cookTime) || minutes(recipe.totalTime),
        ingredients: ingredients,
        steps: steps(recipe.recipeInstructions),
      };
    }
    return null;
  }

  /*
   Instagram keeps the recipe in the caption, and the page around it is mostly not the
   recipe: a navigation bar, a comment thread, a sidebar of other posts. Handing all of
   that over as "the page text" buries the caption in it.

   The og:description tag is the caption, complete and with its line breaks, and it is in
   the DOM of the logged-in page too. The heading is the fallback for when a single-page
   navigation has left that tag describing the previous post.
  */
  function instagramCaption() {
    if (!/(^|\.)instagram\.com$/.test(location.hostname)) return "";

    var meta = document.querySelector('meta[property="og:description"]');
    var described = meta ? meta.getAttribute("content") || "" : "";
    // 643 likes, 6 comments - someone on July 18, 2026: "<the caption>".
    var quoted = described.match(/:\s*"([\s\S]*)"\s*\.?\s*$/);
    var caption = quoted ? quoted[1] : "";

    // A heading on a post page is the caption itself, newlines and all.
    var heading = document.querySelector("article h1, main h1, h1");
    var written = heading ? (heading.innerText || "").trim() : "";

    // Whichever is fuller: after an in-app navigation the meta tag can be a post behind.
    return written.length > caption.length ? written : caption;
  }

  this.run = function (args) {
    var found = null;
    try {
      found = structured();
    } catch (e) {
      found = null;
    }
    var article = document.querySelector("article, main, [itemtype*='Recipe']");
    var body = article || document.body;
    var caption = "";
    try {
      caption = instagramCaption();
    } catch (e) {
      caption = "";
    }
    args.completionFunction({
      title: document.title || "",
      text: caption || (body.innerText || "").trim(),
      url: document.URL || "",
      recipe: found ? JSON.stringify(found) : "",
    });
  };
})();
