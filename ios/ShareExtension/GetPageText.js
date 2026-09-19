/*
 Safari runs this in the page before the extension opens, so what gets shared is the recipe
 as rendered, not just its address. Without it a shared page arrives as a bare URL, and a
 language model handed a URL will happily invent a recipe out of the words in the slug.
*/
var ExtensionPreprocessingJS = new (function () {
  this.run = function (args) {
    var article = document.querySelector("article, main, [itemtype*='Recipe']");
    var body = (article || document.body);
    args.completionFunction({
      title: document.title || "",
      text: (body.innerText || "").trim(),
      url: document.URL || "",
    });
  };
})();
