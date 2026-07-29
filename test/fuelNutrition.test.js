import test from "node:test";
import assert from "node:assert/strict";
import {
  consumedInventoryUnits,
  normalizeMixedDrinkConsumption,
  nutritionForConsumption,
} from "../src/services/fuelNutrition.js";

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

test("one powder portion keeps its nutrients independent of the bottle volume", () => {
  const fuel = { preparedVolumeMl: 500, carbs: 35, sodium: 450 };
  const in650 = nutritionForConsumption({
    quantity: 1,
    unit: "Portionen",
    mixedVolumeMl: 650,
    consumedVolumeMl: 650,
  }, fuel);
  const in500 = nutritionForConsumption({
    quantity: 1,
    unit: "Portionen",
    mixedVolumeMl: 500,
    consumedVolumeMl: 500,
  }, fuel);

  assert.equal(in650.carbs, 35);
  assert.equal(in500.carbs, 35);
  assert.equal(in650.fluidConsumedMl, 650);
  assert.equal(in500.fluidConsumedMl, 500);
  assert.equal(in650.inventoryUnits, 1);
});

test("unfinished mixed drink scales intake but still consumes the powder portion from stock", () => {
  const fuel = { preparedVolumeMl: 500, carbs: 35, sodium: 450 };
  const result = nutritionForConsumption({
    quantity: 1,
    unit: "Portionen",
    mixedVolumeMl: 650,
    consumedVolumeMl: 500,
    fuelItemId: "fuel-1",
    affectsInventory: true,
  }, fuel);

  assert.equal(Number(result.carbs.toFixed(2)), 26.92);
  assert.equal(result.fluidConsumedMl, 500);
  assert.equal(result.inventoryUnits, 1);
  assert.equal(consumedInventoryUnits({
    quantity: 1,
    unit: "Portionen",
    mixedVolumeMl: 650,
    consumedVolumeMl: 500,
    fuelItemId: "fuel-1",
    affectsInventory: true,
  }, fuel), 1);
});

test("legacy millilitre entries migrate without changing their nutrient total", () => {
  const fuel = { preparedVolumeMl: 500, carbs: 35 };
  const migrated = normalizeMixedDrinkConsumption({ quantity: 750, unit: "ml" }, fuel, 650);
  const result = nutritionForConsumption(migrated, fuel);

  assert.equal(migrated.unit, "Portionen");
  assert.equal(Number(migrated.quantity), 1.5);
  assert.equal(migrated.mixedVolumeMl, "750");
  assert.equal(result.carbs, 52.5);
});
