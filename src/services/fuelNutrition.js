function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function fuelDisplayName(item) {
  return [item?.brand, item?.name].filter(Boolean).join(" ").trim() || "Fuel-Produkt";
}

export function defaultConsumptionUnit(item) {
  if (numeric(item?.preparedVolumeMl)) return "ml";
  if (item?.stockUnit === "Tabletten") return "Tabletten";
  if (item?.stockUnit === "Beutel") return "Beutel";
  if (item?.stockUnit === "Portionen") return "Portionen";
  return "Stück";
}

export function consumptionUnitsForFuel(item) {
  const values = [];
  if (numeric(item?.preparedVolumeMl)) values.push("ml");
  else if (item?.servingUnit === "ml" && numeric(item?.servingQuantity)) values.push("ml");
  else if (item?.servingUnit === "g" && numeric(item?.servingQuantity) && ["Drink Mix", "Elektrolyte", "Recovery"].includes(item?.category)) values.push("g", "Portionen");
  else values.push(defaultConsumptionUnit(item));
  return [...new Set(values)];
}

function per100Total(quantity, per100) {
  const q = numeric(quantity) || 0;
  const value = numeric(per100);
  return value == null ? 0 : q / 100 * value;
}

function servingFactor(item, fuel) {
  const quantity = numeric(item?.quantity) || 0;
  if (item?.unit === "ml") {
    const prepared = numeric(fuel?.preparedVolumeMl) || (fuel?.servingUnit === "ml" ? numeric(fuel?.servingQuantity) : null);
    return prepared ? quantity / prepared : null;
  }
  if (item?.unit === "g") {
    const serving = fuel?.servingUnit === "g" ? numeric(fuel?.servingQuantity) : null;
    return serving ? quantity / serving : null;
  }
  return quantity;
}

export function nutritionForConsumption(item, fuel = null) {
  const quantity = numeric(item?.quantity) || 0;
  if (fuel) {
    const factor = servingFactor(item, fuel);
    const usePer100 = factor == null && (item.unit === "ml" || item.unit === "g");
    const carbs = usePer100 ? per100Total(quantity, fuel.carbsPer100) : (numeric(fuel.carbs) || 0) * (factor || 0);
    const sodium = usePer100 ? per100Total(quantity, fuel.sodiumPer100) : (numeric(fuel.sodium) || 0) * (factor || 0);
    const caffeine = usePer100 ? per100Total(quantity, fuel.caffeinePer100) : (numeric(fuel.caffeine) || 0) * (factor || 0);
    return {
      carbs,
      sodium,
      caffeine,
      inventoryUnits: factor == null ? quantity : factor,
      servingFactor: factor,
    };
  }

  const rateFactor = item?.unit === "ml" || item?.unit === "g" ? quantity / 100 : quantity;
  return {
    carbs: (numeric(item?.carbohydratesPerUnit) || 0) * rateFactor,
    sodium: (numeric(item?.sodiumPerUnit) || 0) * rateFactor,
    caffeine: (numeric(item?.caffeinePerUnit) || 0) * rateFactor,
    inventoryUnits: 0,
    servingFactor: null,
  };
}

export function consumedInventoryUnits(item, fuel) {
  if (!item?.fuelItemId || item?.affectsInventory === false || !fuel) return 0;
  return nutritionForConsumption(item, fuel).inventoryUnits;
}

export function consumptionSummary(item, fuel) {
  const values = nutritionForConsumption(item, fuel);
  const parts = [];
  if (item?.unit === "ml" && values.servingFactor != null) parts.push(`${item.quantity} ml · entspricht ${values.servingFactor.toFixed(1).replace(".0", "")} Mischungen`);
  if (values.carbs > 0) parts.push(`${values.carbs.toFixed(1).replace(".0", "")} g Kohlenhydrate`);
  if (values.sodium > 0) parts.push(`${Math.round(values.sodium)} mg Natrium`);
  if (values.caffeine > 0) parts.push(`${Math.round(values.caffeine)} mg Koffein`);
  return parts;
}
