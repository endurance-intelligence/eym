function decimal(value) {
  const parsed = Number(String(value || "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function measurements(line) {
  const result = [];
  const pattern = /(\d+(?:[.,]\d+)?)\s*(kcal|kj|mg|g)\b/gi;
  let match;
  while ((match = pattern.exec(line))) result.push({ value: decimal(match[1]), unit: match[2].toLowerCase() });
  return result.filter((item) => item.value != null);
}

function matchingLine(lines, aliases) {
  return lines.find((line) => aliases.some((alias) => line.toLowerCase().includes(alias)) && measurements(line).length > 0) || "";
}

function pairFor(lines, aliases, preferredUnit = null) {
  const line = lines.find((candidate) => aliases.some((alias) => candidate.toLowerCase().includes(alias)) && measurements(candidate).some((item) => !preferredUnit || item.unit === preferredUnit)) || matchingLine(lines, aliases);
  const values = measurements(line).filter((item) => !preferredUnit || item.unit === preferredUnit);
  if (!values.length) return { per100: null, perServing: null, line };
  return { per100: values[0]?.value ?? null, perServing: values[1]?.value ?? null, unit: values[0]?.unit || preferredUnit, line };
}

function toMg(value, unit) {
  if (value == null) return null;
  return unit === "g" ? value * 1000 : value;
}


function imageElement(source) {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") return resolve(source);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Das Nährwertfoto konnte nicht vorbereitet werden."));
    image.src = source;
  });
}

async function preprocessNutritionImage(source) {
  if (typeof document === "undefined" || typeof Image === "undefined") return source;
  const image = await imageElement(source);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const scale = Math.max(1, Math.min(3, 2200 / Math.max(1, naturalWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(naturalWidth * scale);
  canvas.height = Math.round(naturalHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
    const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
    pixels.data[index] = contrast;
    pixels.data[index + 1] = contrast;
    pixels.data[index + 2] = contrast;
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.94);
}

export function parseNutritionLabelText(rawText) {
  const sourceText = String(rawText || "").replace(/\u00a0/g, " ");
  const text = sourceText
    .replace(/(\d)m8\b/gi, "$1mg")
    .replace(/(\d),(\d{1,2})8\b/g, "$1,$2 g")
    .replace(/\b08\b/g, "0 g")
    .replace(/(?<![.,])\b(\d)08\b/g, "$1,0 g");
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const lower = text.toLowerCase();
  const portionMatch = lower.match(/(?:pro|per)\s*(?:portion|serving)?[^\d]{0,16}\(?\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\s*\)?/i);
  const servingQuantity = portionMatch ? decimal(portionMatch[1]) : null;
  const servingUnit = portionMatch?.[2] || null;
  const portionArea = lower.match(/pro\s*portion[\s\S]{0,90}/i)?.[0] || "";
  const volumeMatches = [...portionArea.matchAll(/(\d+(?:[.,]\d+)?)\s*ml\b/gi)]
    .map((match) => decimal(match[1]))
    .filter((value) => value != null && value > 100 && value <= 3000);
  const preparedVolumeMl = volumeMatches[0] || null;

  const energy = pairFor(lines, ["brennwert", "energie"], "kcal");
  const carbs = pairFor(lines, ["kohlenhydrate", "carbohydrate"], "g");
  const sugar = pairFor(lines, ["davon zucker", "zucker", "sugars"], "g");
  const fat = pairFor(lines, ["fett", "fat"], "g");
  const protein = pairFor(lines, ["eiweiß", "eiweiss", "protein"], "g");
  const salt = pairFor(lines, ["salz", "salt"], "g");
  const sodium = pairFor(lines, ["natrium", "sodium"]);
  const magnesium = pairFor(lines, ["magnesium"]);
  const calcium = pairFor(lines, ["calcium", "kalzium"]);
  const vitaminB1 = pairFor(lines, ["vitamin b1", "vitamin bi", "thiamin"]);
  const caffeine = pairFor(lines, ["koffein", "caffeine"]);
  if (caffeine.per100 == null) {
    const caffeineMatch = lower.match(/(?:koffein|caffeine)[^\d]{0,25}(\d+(?:[.,]\d+)?)\s*mg\s*\/?\s*100\s*g/i);
    if (caffeineMatch) { caffeine.per100 = decimal(caffeineMatch[1]); caffeine.unit = "mg"; }
  }

  const factor = servingQuantity != null && servingQuantity > 0 ? servingQuantity / 100 : null;
  const completePair = (pair, convert = (value) => value) => {
    let per100 = pair.per100 == null ? null : convert(pair.per100, pair.unit);
    let perServing = pair.perServing == null ? null : convert(pair.perServing, pair.unit);
    if (perServing == null && per100 != null && factor != null) perServing = per100 * factor;
    if (per100 == null && perServing != null && factor) per100 = perServing / factor;
    return { per100, perServing };
  };
  const macro = (pair) => completePair(pair);
  const milligram = (pair) => completePair(pair, toMg);
  const valuesByType = {
    energy: completePair(energy),
    carbs: macro(carbs),
    sugar: macro(sugar),
    fat: macro(fat),
    protein: macro(protein),
    salt: macro(salt),
    sodium: milligram(sodium),
    magnesium: milligram(magnesium),
    calcium: milligram(calcium),
    vitaminB1: milligram(vitaminB1),
    caffeine: milligram(caffeine),
  };

  function within(value, max) {
    return value == null || (Number.isFinite(value) && value >= 0 && value <= max) ? value : null;
  }
  function validatedPair(pair, maxPer100, maxPerServing) {
    let per100 = within(pair.per100, maxPer100);
    let perServing = within(pair.perServing, maxPerServing);
    if (factor && per100 != null && perServing != null) {
      const expected = per100 * factor;
      const tolerance = Math.max(0.05, Math.abs(expected) * 0.35);
      if (Math.abs(perServing - expected) > tolerance) perServing = expected;
    }
    if (perServing == null && per100 != null && factor) perServing = per100 * factor;
    if (per100 == null && perServing != null && factor) per100 = perServing / factor;
    return { per100, perServing };
  }
  const energySafe = validatedPair(valuesByType.energy, 1200, 2000);
  const carbsSafe = validatedPair(valuesByType.carbs, 100, 500);
  const sugarSafe = validatedPair(valuesByType.sugar, 100, 500);
  const fatSafe = validatedPair(valuesByType.fat, 100, 500);
  const proteinSafe = validatedPair(valuesByType.protein, 100, 500);
  const saltSafe = validatedPair(valuesByType.salt, 30, 100);
  const sodiumSafe = validatedPair(valuesByType.sodium, 10000, 20000);
  const magnesiumSafe = validatedPair(valuesByType.magnesium, 5000, 5000);
  const calciumSafe = validatedPair(valuesByType.calcium, 5000, 5000);
  const vitaminB1Safe = validatedPair(valuesByType.vitaminB1, 100, 100);
  const caffeineSafe = validatedPair(valuesByType.caffeine, 5000, 2000);
  const values = {
    servingQuantity,
    servingUnit,
    preparedVolumeMl,
    energyKcalPer100: energySafe.per100,
    energyKcal: energySafe.perServing,
    carbsPer100: carbsSafe.per100,
    carbs: carbsSafe.perServing,
    sugarPer100: sugarSafe.per100,
    sugar: sugarSafe.perServing,
    fatPer100: fatSafe.per100,
    fat: fatSafe.perServing,
    proteinPer100: proteinSafe.per100,
    protein: proteinSafe.perServing,
    saltPer100: saltSafe.per100,
    salt: saltSafe.perServing,
    sodiumPer100: sodiumSafe.per100,
    sodium: sodiumSafe.perServing,
    magnesiumPer100: magnesiumSafe.per100,
    magnesium: magnesiumSafe.perServing,
    calciumPer100: calciumSafe.per100,
    calcium: calciumSafe.perServing,
    vitaminB1Per100: vitaminB1Safe.per100,
    vitaminB1: vitaminB1Safe.perServing,
    caffeinePer100: caffeineSafe.per100,
    caffeine: caffeineSafe.perServing,
  };
  const recognized = Object.entries(values).filter(([, value]) => value != null && value !== "").map(([key]) => key);
  return { values, recognized, rawText: sourceText };
}

export async function extractNutritionLabel(image, onProgress = () => {}) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("deu", 1, {
    logger: (message) => {
      if (message.status === "recognizing text") onProgress(Math.round(Number(message.progress || 0) * 100));
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    const preparedImage = await preprocessNutritionImage(image);
    const result = await worker.recognize(preparedImage, { rotateAuto: true });
    return parseNutritionLabelText(result.data.text);
  } finally {
    await worker.terminate();
  }
}
