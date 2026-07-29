function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function fuelDisplayName(item) {
  return [item?.brand, item?.name].filter(Boolean).join(" ").trim() || "Fuel-Produkt";
}

export function usesMixedDrinkTracking(item) {
  return Boolean(numeric(item?.preparedVolumeMl));
}

export function defaultConsumptionUnit(item) {
  if (usesMixedDrinkTracking(item)) return "Portionen";
  if (item?.stockUnit === "Tabletten") return "Tabletten";
  if (item?.stockUnit === "Beutel") return "Beutel";
  if (item?.stockUnit === "Portionen") return "Portionen";
  return "Stück";
}

export function consumptionUnitsForFuel(item) {
  const values = [];
  if (usesMixedDrinkTracking(item)) values.push("Portionen");
  else if (item?.servingUnit === "ml" && numeric(item?.servingQuantity)) values.push("ml");
  else if (item?.servingUnit === "g" && numeric(item?.servingQuantity) && ["Drink Mix", "Elektrolyte", "Recovery"].includes(item?.category)) values.push("g", "Portionen");
  else values.push(defaultConsumptionUnit(item));
  return [...new Set(values)];
}

export function normalizeMixedDrinkConsumption(item, fuel, defaultBottleVolumeMl = 650) {
  if (!usesMixedDrinkTracking(fuel)) return item;
  const referenceVolume = numeric(fuel?.preparedVolumeMl) || numeric(defaultBottleVolumeMl) || 650;
  const hasSeparatedVolumes = item?.mixedVolumeMl !== undefined || item?.consumedVolumeMl !== undefined;
  if (hasSeparatedVolumes) {
    const mixedVolume = numeric(item.mixedVolumeMl) || referenceVolume;
    const consumedVolume = item.consumedVolumeMl === ""
      ? mixedVolume
      : Math.min(mixedVolume, numeric(item.consumedVolumeMl) ?? mixedVolume);
    return {
      ...item,
      unit: "Portionen",
      quantity: String(numeric(item.quantity) ?? 1),
      mixedVolumeMl: String(Math.round(mixedVolume)),
      consumedVolumeMl: String(Math.round(consumedVolume)),
    };
  }

  if (item?.unit === "ml") {
    const consumedVolume = numeric(item.quantity) || referenceVolume;
    return {
      ...item,
      unit: "Portionen",
      quantity: String(consumedVolume / referenceVolume),
      mixedVolumeMl: String(Math.round(consumedVolume)),
      consumedVolumeMl: String(Math.round(consumedVolume)),
    };
  }

  const portions = numeric(item?.quantity) ?? 1;
  const mixedVolume = Math.round(portions * referenceVolume);
  return {
    ...item,
    unit: "Portionen",
    quantity: String(portions),
    mixedVolumeMl: String(mixedVolume),
    consumedVolumeMl: String(mixedVolume),
  };
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

function mixedDrinkConsumption(item, fuel) {
  if (!usesMixedDrinkTracking(fuel)) return null;
  if (item?.mixedVolumeMl === undefined && item?.consumedVolumeMl === undefined) return null;
  const portions = numeric(item?.quantity) || 0;
  const mixedVolumeMl = numeric(item?.mixedVolumeMl) || 0;
  const consumedVolumeMl = Math.min(
    mixedVolumeMl,
    item?.consumedVolumeMl === "" ? mixedVolumeMl : (numeric(item?.consumedVolumeMl) ?? mixedVolumeMl),
  );
  const consumedShare = mixedVolumeMl > 0 ? consumedVolumeMl / mixedVolumeMl : 0;
  return {
    portions,
    mixedVolumeMl,
    consumedVolumeMl,
    consumedShare,
    nutritionFactor: portions * consumedShare,
  };
}

export function nutritionForConsumption(item, fuel = null) {
  const quantity = numeric(item?.quantity) || 0;
  if (fuel) {
    const mixed = mixedDrinkConsumption(item, fuel);
    if (mixed) {
      return {
        carbs: (numeric(fuel.carbs) || 0) * mixed.nutritionFactor,
        sodium: (numeric(fuel.sodium) || 0) * mixed.nutritionFactor,
        caffeine: (numeric(fuel.caffeine) || 0) * mixed.nutritionFactor,
        inventoryUnits: mixed.portions,
        servingFactor: mixed.nutritionFactor,
        mixedPortions: mixed.portions,
        mixedVolumeMl: mixed.mixedVolumeMl,
        fluidConsumedMl: mixed.consumedVolumeMl,
        consumedShare: mixed.consumedShare,
      };
    }
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
      fluidConsumedMl: item?.unit === "ml" ? quantity : 0,
    };
  }

  const rateFactor = item?.unit === "ml" || item?.unit === "g" ? quantity / 100 : quantity;
  return {
    carbs: (numeric(item?.carbohydratesPerUnit) || 0) * rateFactor,
    sodium: (numeric(item?.sodiumPerUnit) || 0) * rateFactor,
    caffeine: (numeric(item?.caffeinePerUnit) || 0) * rateFactor,
    inventoryUnits: 0,
    servingFactor: null,
    fluidConsumedMl: item?.unit === "ml" ? quantity : 0,
  };
}

export function consumedInventoryUnits(item, fuel) {
  if (!item?.fuelItemId || item?.affectsInventory === false || !fuel) return 0;
  return nutritionForConsumption(item, fuel).inventoryUnits;
}

export function consumptionSummary(item, fuel) {
  const values = nutritionForConsumption(item, fuel);
  const parts = [];
  if (values.mixedPortions != null) {
    const portions = values.mixedPortions.toFixed(2).replace(/\.?0+$/, "");
    const carbsPerPortion = numeric(fuel?.carbs) || 0;
    if (carbsPerPortion > 0 && values.consumedShare >= 0.999) {
      parts.push(`${portions} × ${carbsPerPortion.toFixed(1).replace(".0", "")} g = ${values.carbs.toFixed(1).replace(".0", "")} g Kohlenhydrate gesamt`);
    } else if (values.carbs > 0) {
      parts.push(`${values.carbs.toFixed(1).replace(".0", "")} g Kohlenhydrate aufgenommen`);
    }
    parts.push(`${Math.round(values.fluidConsumedMl)} von ${Math.round(values.mixedVolumeMl)} ml getrunken`);
  } else {
    if (item?.unit === "ml" && values.servingFactor != null) parts.push(`${item.quantity} ml · entspricht ${values.servingFactor.toFixed(1).replace(".0", "")} Mischungen`);
    if (values.carbs > 0) parts.push(`${values.carbs.toFixed(1).replace(".0", "")} g Kohlenhydrate`);
  }
  if (values.sodium > 0) parts.push(`${Math.round(values.sodium)} mg Natrium`);
  if (values.caffeine > 0) parts.push(`${Math.round(values.caffeine)} mg Koffein`);
  return parts;
}
