package com.gehan.mealplanner.nutrition;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.nio.file.Files;
import java.nio.file.Path;

/** Not a test: prints matches for a list of names. -Dexplore=/path/names.txt */
class MatchExplorer {
    @Test
    @EnabledIfSystemProperty(named = "explore", matches = ".+")
    void explore() throws Exception {
        FoodMatcher matcher = new FoodMatcher(new FoodTable(UsdaTableLoader.bundled()));
        StringBuilder out = new StringBuilder();
        for (String name : Files.readAllLines(Path.of(System.getProperty("explore")))) {
            if (name.isBlank()) continue;
            var list = matcher.shortlist(name, 3);
            out.append(String.format("%-28s", name));
            for (int i = 0; i < list.size(); i++) {
                var c = list.get(i);
                String n = c.food().name();
                out.append(String.format(i == 0 ? " %.2f %s" : "   || %.2f %s", c.confidence(), n.length() > 60 ? n.substring(0, 60) : n));
                if (i == 0) out.append("\n").append(" ".repeat(28));
            }
            out.append("\n");
        }
        Files.writeString(Path.of(System.getProperty("explore") + ".out"), out);
    }
}
