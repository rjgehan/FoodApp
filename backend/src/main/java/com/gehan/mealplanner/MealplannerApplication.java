package com.gehan.mealplanner;

import org.springframework.boot.SpringApplication;
import com.gehan.mealplanner.ai.RecipeAiProperties;
import com.gehan.mealplanner.integration.IntegrationProperties;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@EnableConfigurationProperties({IntegrationProperties.class, RecipeAiProperties.class})
@SpringBootApplication
public class MealplannerApplication {

	public static void main(String[] args) {
		SpringApplication.run(MealplannerApplication.class, args);
	}

}
