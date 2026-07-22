import test from "node:test";
import assert from "node:assert/strict";
import { consumedInventoryUnits, nutritionForConsumption } from "../src/services/fuelNutrition.js";

test("prepared drink volume is converted into servings and nutrients", () => {
  const fuel = { preparedVolumeMl: 500, carbs: 40, sodium: 600, caffeine: 0 };
  const result = nutritionForConsumption({ quantity: 750, unit: "ml" }, fuel);
  assert.equal(result.servingFactor, 1.5);
  assert.equal(result.inventoryUnits, 1.5);
  assert.equal(result.carbs, 60);
  assert.equal(result.sodium, 900);
});

test("inventory is untouched when a review item is not linked to stock", () => {
  const fuel = { preparedVolumeMl: 500, carbs: 40 };
  assert.equal(consumedInventoryUnits({ quantity: 500, unit: "ml", fuelItemId: "fuel-1", affectsInventory: false }, fuel), 0);
});
