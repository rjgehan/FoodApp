package com.gehan.mealplanner.service;

import java.util.List;

/**
 * The things most kitchens already have, offered when a household is new so its cupboard does
 * not start empty — tick what is in the house and it is all there in one go. Kept here, on the
 * server, so the web and the phone offer exactly the same list and a change is made once.
 *
 * Named the way recipes name them, lower case and plain, so ticking "garlic powder" lands on the
 * same ingredient a recipe's "garlic powder" does. Every name is one the keyword list can place
 * in an aisle (StarterCupboardTest checks), the way a thing typed into the cupboard by hand is.
 */
public final class StarterCupboard {

    private StarterCupboard() {
    }

    public record Group(String name, List<String> items) {
    }

    public static final List<Group> GROUPS = List.of(
            new Group("Baking", List.of(
                    "all-purpose flour", "sugar", "brown sugar", "powdered sugar", "baking soda", "baking powder",
                    "vanilla extract", "cornstarch", "cocoa powder", "chocolate chips", "yeast")),
            new Group("Spices", List.of(
                    "salt", "black pepper", "garlic powder", "onion powder", "paprika", "cumin", "chili powder",
                    "dried oregano", "cinnamon", "red pepper flakes", "italian seasoning", "bay leaves")),
            new Group("Oils & vinegars", List.of(
                    "olive oil", "vegetable oil", "cooking spray", "sesame oil", "white vinegar",
                    "apple cider vinegar", "balsamic vinegar")),
            new Group("Condiments & sauces", List.of(
                    "ketchup", "mustard", "mayonnaise", "soy sauce", "hot sauce", "worcestershire sauce",
                    "bbq sauce", "honey", "maple syrup", "salsa")),
            new Group("Grains & pasta", List.of(
                    "rice", "pasta", "spaghetti", "oats", "bread crumbs", "quinoa", "crackers")),
            new Group("Cans & jars", List.of(
                    "canned tomatoes", "tomato paste", "tomato sauce", "chicken broth", "black beans", "chickpeas",
                    "tuna", "peanut butter", "coconut milk")),
            new Group("Fridge", List.of(
                    "butter", "eggs", "milk", "cheddar cheese", "parmesan", "sour cream", "plain yogurt")),
            new Group("Fresh", List.of(
                    "onions", "garlic", "potatoes", "lemons")));
}
