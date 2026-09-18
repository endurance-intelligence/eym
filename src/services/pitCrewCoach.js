const round1 = (value, digits = 1) => Number(Number(value || 0).toFixed(digits));

export const PIT_CARB_TARGET = { min: 60, max: 90, center: 70 };

export const PIT_CREW_DEFAULT_GEL_PRIORITY = [
  "226ers-high",
  "226ers-high-strawberry",
  "sis-beta",
  "maurten100",
];

export function normalizeGelPriority(value = []) {
  const known = new Set(PIT_CREW_DEFAULT_GEL_PRIORITY);
  const incoming = (Array.isArray(value) ? value : []).map(String).filter((id) => known.has(id));
  return [...new Set([...incoming, ...PIT_CREW_DEFAULT_GEL_PRIORITY])];
}

const ISOSTAR_LONG_ENERGY_PER_500 = Object.freeze({
  powderG: 38,
  energyKcal: 131.9,
  carbs: 30.8,
  sugarG: 18.6,
  proteinG: 0.7,
  saltG: 1.44,
  sodiumMg: 578,
  potassiumMg: 334,
  magnesiumMg: 87,
  calciumMg: 190,
  bcaaG: 0.99,
});

function longEnergyPortion(ml) {
  const scale = Number(ml || 0) / 500;
  return {
    id: `${ml}`,
    label: `${ml} ml`,
    carbs: round1(ISOSTAR_LONG_ENERGY_PER_500.carbs * scale),
    sugarG: round1(ISOSTAR_LONG_ENERGY_PER_500.sugarG * scale),
    proteinG: round1(ISOSTAR_LONG_ENERGY_PER_500.proteinG * scale),
    saltG: round1(ISOSTAR_LONG_ENERGY_PER_500.saltG * scale, 2),
    sodiumMg: Math.round(ISOSTAR_LONG_ENERGY_PER_500.sodiumMg * scale),
    potassiumMg: Math.round(ISOSTAR_LONG_ENERGY_PER_500.potassiumMg * scale),
    magnesiumMg: Math.round(ISOSTAR_LONG_ENERGY_PER_500.magnesiumMg * scale),
    calciumMg: Math.round(ISOSTAR_LONG_ENERGY_PER_500.calciumMg * scale),
    bcaaG: round1(ISOSTAR_LONG_ENERGY_PER_500.bcaaG * scale, 2),
    energyKcal: round1(ISOSTAR_LONG_ENERGY_PER_500.energyKcal * scale),
    fluidMl: Number(ml || 0),
    caffeineMg: 0,
  };
}

export const PIT_CREW_PRODUCTS = [
  {
    id: "water",
    label: "Wasser",
    icon: "💧",
    category: "drink",
    traits: ["neutral", "quick"],
    portions: [100, 150, 200, 250, 300, 400, 500].map((ml) => ({ id: `${ml}`, label: `${ml} ml`, carbs: 0, fluidMl: ml, caffeineMg: 0 })),
  },
  {
    id: "isostar",
    label: "Isostar Hydrate & Perform Orange",
    icon: "🧃",
    category: "drink",
    traits: ["carb-drink", "electrolyte", "orange", "quick"],
    nutritionSource: "label",
    referencePortionId: "500",
    mixing: { powderG: 40, drinkMl: 500 },
    packages: [
      { label: "400-g-Dose", powderG: 400, portions: 10 },
      { label: "1,5-kg-Packung", powderG: 1500, portions: 37.5 },
    ],
    stockNote: "40 g Pulver / 500 ml · 400 g = 10 Portionen",
    portions: [150, 200, 250, 300, 400, 500].map((ml) => ({ id: `${ml}`, label: `${ml} ml`, carbs: round1(ml * 0.07), fluidMl: ml, caffeineMg: 0 })),
  },
  {
    id: "isostar-long",
    label: "Isostar Long Energy Plus Zitrone",
    brand: "Isostar",
    flavor: "Zitrone",
    icon: "🍋",
    category: "drink",
    traits: ["carb-drink", "electrolyte", "long-energy", "lemon", "quick"],
    nutritionSource: "label",
    referencePortionId: "500",
    mixing: { powderG: 38, drinkMl: 500 },
    manufacturerUse: { duringMl: 150, everyMinutes: 15 },
    carbSources: ["Saccharose", "Maltodextrin", "Fruktose", "Dextrose"],
    aminoAcids: ["L-Leucin", "L-Valin", "L-Isoleucin"],
    packages: [{ label: "570-g-Dose", powderG: 570, portions: 15 }],
    stockNote: "38 g Pulver / 500 ml · 570 g = 15 Portionen · 578 mg Na · 334 mg K · 87 mg Mg",
    labelNutritionPer500: ISOSTAR_LONG_ENERGY_PER_500,
    portions: [150, 200, 250, 300, 400, 500].map(longEnergyPortion),
  },
  {
    id: "waldmeister",
    label: "REWE Waldmeister Getränkesirup",
    brand: "REWE Beste Wahl",
    flavor: "Waldmeister",
    icon: "🌿",
    category: "drink",
    traits: ["carb-drink", "sweet", "waldmeister", "refresh", "quick"],
    estimated: true,
    nutritionSource: "estimated-mix",
    packageMl: 500,
    syrupCarbsPer100Ml: 72.9,
    manufacturerMixRatio: "1:5",
    stockNote: "0,5-l-Flasche · 72,9 g KH / 100 ml Sirup · Hersteller 1:5 · Race-Mix ≈ 45 g KH / 500 ml",
    portions: [250, 300, 400, 500].map((ml) => ({
      id: `${ml}`,
      label: `${ml} ml`,
      carbs: round1(ml * 0.09),
      fluidMl: ml,
      caffeineMg: 0,
      sodiumMg: 0,
      estimated: true,
    })),
  },
  {
    id: "dryll",
    label: "DRYLL Salty Peach",
    icon: "🍑",
    category: "drink",
    traits: ["electrolyte", "salty", "refresh", "quick"],
    packageMl: 330,
    stockNote: "330-ml-Dose · 500 mg Natrium pro Dose",
    portions: [100, 150, 200].map((ml) => ({ id: `${ml}`, label: `${ml} ml`, carbs: 0, fluidMl: ml, caffeineMg: 0, sodiumMg: Math.round(ml * (500 / 330)) })),
  },
  {
    id: "cola",
    label: "Cola",
    icon: "🥤",
    category: "drink",
    traits: ["sweet", "caffeine", "quick"],
    estimated: true,
    portions: [100, 150, 200].map((ml) => ({ id: `${ml}`, label: `${ml} ml`, carbs: round1(ml * 0.106), fluidMl: ml, caffeineMg: round1(ml * 0.096) })),
  },
  {
    id: "redbull",
    label: "Red Bull",
    icon: "⚡",
    category: "drink",
    traits: ["sweet", "caffeine", "quick"],
    estimated: true,
    packageMl: 250,
    stockNote: "250-ml-Dose · 80 mg Koffein pro Dose",
    portions: [75, 100, 150].map((ml) => ({ id: `${ml}`, label: `${ml} ml`, carbs: round1(ml * 0.11), fluidMl: ml, caffeineMg: round1(ml * 0.32) })),
  },
  {
    id: "maurten100",
    label: "Maurten Gel 100",
    icon: "◻️",
    category: "gel",
    traits: ["sweet", "quick", "portable"],
    portions: [{ id: "1", label: "1 Gel", carbs: 25, fluidMl: 0, caffeineMg: 0 }],
  },
  {
    id: "sis-beta",
    label: "SiS Beta Fuel",
    icon: "🟦",
    category: "gel",
    traits: ["sweet", "quick", "portable"],
    portions: [{ id: "1", label: "1 Gel", carbs: 40, fluidMl: 0, caffeineMg: 0 }],
  },
  {
    id: "226ers-high",
    label: "226ERS High Energy Neutral",
    icon: "🟥",
    category: "gel",
    traits: ["neutral", "quick", "portable"],
    portions: [{ id: "1", label: "1 Gel · 76 g", carbs: 50, fluidMl: 0, caffeineMg: 0 }],
  },
  {
    id: "226ers-high-strawberry",
    label: "226ERS High Energy Salty Strawberry",
    icon: "🍓",
    category: "gel",
    traits: ["salty", "sweet", "quick", "portable"],
    portions: [{ id: "1", label: "1 Gel · 76 g", carbs: 50, fluidMl: 0, caffeineMg: 0, sodiumMg: 250 }],
  },
  {
    id: "banana",
    label: "Banane",
    icon: "🍌",
    category: "food",
    traits: ["real-food", "soft", "sweet"],
    estimated: true,
    portions: [
      { id: "half", label: "½ Banane", carbs: 12, fluidMl: 0, caffeineMg: 0 },
      { id: "whole", label: "1 Banane", carbs: 24, fluidMl: 0, caffeineMg: 0 },
    ],
  },
  {
    id: "milk-roll",
    label: "Milchbrötchen",
    icon: "🥛",
    category: "food",
    traits: ["real-food", "soft", "sweet"],
    estimated: true,
    portions: [{ id: "1", label: "1 Stück", carbs: 28, fluidMl: 0, caffeineMg: 0 }],
  },
  {
    id: "fusilli",
    label: "Fusilli + Brühe",
    icon: "🍝",
    category: "food",
    traits: ["real-food", "savory", "soft", "warm"],
    estimated: true,
    portions: [
      { id: "75", label: "75 g gekocht", carbs: 20, fluidMl: 0, caffeineMg: 0 },
      { id: "100", label: "100 g gekocht", carbs: 27, fluidMl: 0, caffeineMg: 0 },
    ],
  },
  {
    id: "haribo",
    label: "Haribo Roulette",
    icon: "🍬",
    category: "food",
    traits: ["sweet", "quick"],
    nutritionSource: "label",
    packageG: 150,
    rollsPerPackage: 6,
    rollG: 25,
    stockNote: "150-g-Packung = 6 Rollen à 25 g",
    portions: [
      { id: "10g", label: "½ Rolle", carbs: 9.6, fluidMl: 0, caffeineMg: 0 },
      { id: "20g", label: "1 Rolle", carbs: 19.3, fluidMl: 0, caffeineMg: 0 },
    ],
  },
  {
    id: "salt-sticks",
    label: "Salzstangen",
    icon: "🥨",
    category: "food",
    traits: ["savory", "salty", "crunchy"],
    estimated: true,
    portions: [
      { id: "10g", label: "½ Handvoll", carbs: 7.5, fluidMl: 0, caffeineMg: 0 },
      { id: "20g", label: "20 g (alt)", carbs: 15, fluidMl: 0, caffeineMg: 0, hidden: true },
      { id: "30g", label: "1 Handvoll", carbs: 22.5, fluidMl: 0, caffeineMg: 0 },
    ],
  },
  {
    id: "cucumber",
    label: "Gurke",
    icon: "🥒",
    category: "refresh",
    traits: ["savory", "refresh", "neutral"],
    estimated: true,
    portions: [
      { id: "50", label: "50 g", carbs: 1, fluidMl: 0, caffeineMg: 0 },
      { id: "100", label: "100 g", carbs: 2, fluidMl: 0, caffeineMg: 0 },
    ],
  },
  {
    id: "broth",
    label: "Brühe",
    icon: "☕",
    category: "refresh",
    traits: ["savory", "salty", "warm", "refresh"],
    digestion: "light",
    portions: [
      { id: "100", label: "100 ml", carbs: 0, fluidMl: 100, caffeineMg: 0 },
      { id: "150", label: "150 ml", carbs: 0, fluidMl: 150, caffeineMg: 0 },
    ],
  },
  {
    id: "potatoes",
    label: "Kartoffeln gekocht",
    icon: "🥔",
    category: "food",
    traits: ["real-food", "savory", "salty", "soft"],
    digestion: "normal",
    estimated: true,
    starterExtra: true,
    portions: [{ id: "100", label: "100 g", carbs: 17, fluidMl: 0, caffeineMg: 0 }],
  },
  {
    id: "toast",
    label: "Toast / Weißbrot",
    icon: "🍞",
    category: "food",
    traits: ["real-food", "neutral", "soft"],
    digestion: "light",
    estimated: true,
    starterExtra: true,
    portions: [{ id: "slice", label: "1 Scheibe", carbs: 14, fluidMl: 0, caffeineMg: 0 }],
  },
  {
    id: "pretzel",
    label: "Laugenbrezel",
    icon: "🥨",
    category: "food",
    traits: ["real-food", "savory", "salty"],
    digestion: "normal",
    estimated: true,
    starterExtra: true,
    portions: [{ id: "1", label: "1 Stück", carbs: 45, fluidMl: 0, caffeineMg: 0 }],
  },
  {
    id: "rice-pudding",
    label: "Milchreis / Reis",
    icon: "🍚",
    category: "food",
    traits: ["real-food", "soft", "neutral"],
    digestion: "normal",
    estimated: true,
    starterExtra: true,
    portions: [{ id: "150", label: "150 g", carbs: 30, fluidMl: 0, caffeineMg: 0 }],
  },
  {
    id: "pizza",
    label: "Pizza Margherita",
    icon: "🍕",
    category: "food",
    traits: ["real-food", "savory", "salty"],
    digestion: "heavy",
    estimated: true,
    starterExtra: true,
    portions: [{ id: "slice", label: "1 Stück", carbs: 30, fluidMl: 0, caffeineMg: 0 }],
  },
];

export const PIT_CREW_DEFAULT_STOCK_IDS = PIT_CREW_PRODUCTS.filter((product) => !product.starterExtra).map((product) => product.id);

const CUSTOM_ICONS = { drink: "🥤", gel: "⚡", food: "🍽️", refresh: "🥒" };

export function buildPitCrewCustomProduct(input = {}, id = "") {
  const category = ["drink", "gel", "food", "refresh"].includes(String(input.category || "")) ? String(input.category) : "food";
  const label = String(input.label || "").trim().slice(0, 80);
  const portionLabel = String(input.portionLabel || "1 Portion").trim().slice(0, 40) || "1 Portion";
  const carbs = Math.max(0, round1(input.carbs));
  const fluidMl = Math.max(0, Math.round(Number(input.fluidMl || 0)));
  const sodiumMg = Math.max(0, Math.round(Number(input.sodiumMg || 0)));
  const caffeineMg = Math.max(0, round1(input.caffeineMg));
  const taste = ["sweet", "savory", "neutral"].includes(String(input.taste || "")) ? String(input.taste) : "neutral";
  const digestion = ["light", "normal", "heavy"].includes(String(input.digestion || "")) ? String(input.digestion) : "normal";
  if (!label) return null;
  return {
    id: String(id || input.id || `custom-${Date.now()}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
    label,
    icon: String(input.icon || CUSTOM_ICONS[category] || "🍽️").slice(0, 4),
    category,
    traits: [...new Set(["custom", taste, ...(category === "food" ? ["real-food"] : [])])],
    digestion,
    estimated: true,
    custom: true,
    nutritionSource: "manual",
    portions: [{ id: "1", label: portionLabel, carbs, fluidMl, sodiumMg, caffeineMg }],
  };
}

function productMap(products = PIT_CREW_PRODUCTS) {
  return new Map((Array.isArray(products) ? products : PIT_CREW_PRODUCTS).map((product) => [String(product.id), product]));
}

export function pitProduct(productId, products = PIT_CREW_PRODUCTS) {
  return productMap(products).get(String(productId || "")) || null;
}

export function pitPortion(productId, portionId, products = PIT_CREW_PRODUCTS) {
  const product = pitProduct(productId, products);
  if (!product) return null;
  return (product.portions || []).find((portion) => String(portion.id) === String(portionId)) || product.portions?.[0] || null;
}

export function pitSelectionItem(productId, portionId, quantity = 1, intakeFactor = 1, products = PIT_CREW_PRODUCTS) {
  const product = pitProduct(productId, products);
  const portion = pitPortion(productId, portionId, products);
  if (!product || !portion) return null;
  const count = Math.max(1, Math.min(20, Math.round(Number(quantity || 1))));
  const factorNumber = Number(intakeFactor);
  const factor = Number.isFinite(factorNumber) ? Math.max(0, Math.min(1, factorNumber)) : 1;
  return {
    productId: product.id,
    portionId: portion.id,
    label: product.label,
    icon: product.icon,
    category: product.category,
    estimated: Boolean(product.estimated),
    custom: Boolean(product.custom),
    nutritionSource: product.nutritionSource || (product.estimated ? "estimate" : "catalog"),
    digestion: product.digestion || "normal",
    traits: product.traits || [],
    quantity: count,
    intakeFactor: factor,
    carbs: round1(Number(portion.carbs || 0) * count * factor),
    fluidMl: Math.round(Number(portion.fluidMl || 0) * count * factor),
    caffeineMg: round1(Number(portion.caffeineMg || 0) * count * factor),
    sodiumMg: Math.round(Number(portion.sodiumMg || 0) * count * factor),
    sugarG: round1(Number(portion.sugarG || 0) * count * factor),
    proteinG: round1(Number(portion.proteinG || 0) * count * factor),
    saltG: round1(Number(portion.saltG || 0) * count * factor, 2),
    potassiumMg: Math.round(Number(portion.potassiumMg || 0) * count * factor),
    magnesiumMg: Math.round(Number(portion.magnesiumMg || 0) * count * factor),
    calciumMg: Math.round(Number(portion.calciumMg || 0) * count * factor),
    bcaaG: round1(Number(portion.bcaaG || 0) * count * factor, 2),
    energyKcal: round1(Number(portion.energyKcal || 0) * count * factor),
    portionLabel: portion.label,
  };
}

export function summarizePitSelection(selection = [], products = PIT_CREW_PRODUCTS) {
  const items = (Array.isArray(selection) ? selection : [])
    .filter((entry) => entry && typeof entry === "object" && entry.productId != null && entry.portionId != null)
    .map((entry) => pitSelectionItem(entry.productId, entry.portionId, entry.quantity, entry.intakeFactor, products))
    .filter(Boolean);
  return {
    items,
    carbs: round1(items.reduce((sum, item) => sum + item.carbs, 0)),
    fluidMl: Math.round(items.reduce((sum, item) => sum + item.fluidMl, 0)),
    caffeineMg: round1(items.reduce((sum, item) => sum + item.caffeineMg, 0)),
    sodiumMg: Math.round(items.reduce((sum, item) => sum + item.sodiumMg, 0)),
    sugarG: round1(items.reduce((sum, item) => sum + Number(item.sugarG || 0), 0)),
    proteinG: round1(items.reduce((sum, item) => sum + Number(item.proteinG || 0), 0)),
    saltG: round1(items.reduce((sum, item) => sum + Number(item.saltG || 0), 0), 2),
    potassiumMg: Math.round(items.reduce((sum, item) => sum + Number(item.potassiumMg || 0), 0)),
    magnesiumMg: Math.round(items.reduce((sum, item) => sum + Number(item.magnesiumMg || 0), 0)),
    calciumMg: Math.round(items.reduce((sum, item) => sum + Number(item.calciumMg || 0), 0)),
    bcaaG: round1(items.reduce((sum, item) => sum + Number(item.bcaaG || 0), 0), 2),
    energyKcal: round1(items.reduce((sum, item) => sum + Number(item.energyKcal || 0), 0)),
    estimated: items.some((item) => item.estimated),
  };
}

function summaryFromRecord(record = {}, products = PIT_CREW_PRODUCTS) {
  if (record.summary) return record.summary;
  return summarizePitSelection(record.selection || [], products);
}

export function rollingPitAverage(history = [], currentSelection = null, lookback = 3, products = PIT_CREW_PRODUCTS) {
  const records = (Array.isArray(history) ? history : []).slice(-Math.max(0, lookback - (currentSelection ? 1 : 0)));
  const summaries = records.map((record) => summaryFromRecord(record, products));
  if (currentSelection) summaries.push(summarizePitSelection(currentSelection, products));
  if (!summaries.length) return { hours: 0, carbsPerHour: 0, fluidPerHour: 0, caffeineMg: 0 };
  return {
    hours: summaries.length,
    carbsPerHour: round1(summaries.reduce((sum, item) => sum + Number(item.carbs || 0), 0) / summaries.length),
    fluidPerHour: Math.round(summaries.reduce((sum, item) => sum + Number(item.fluidMl || 0), 0) / summaries.length),
    caffeineMg: round1(summaries.reduce((sum, item) => sum + Number(item.caffeineMg || 0), 0)),
  };
}

export function pitTimeMode(minutesToStart) {
  const minutes = Number(minutesToStart);
  if (!Number.isFinite(minutes)) return "normal";
  if (minutes < 3) return "go";
  if (minutes < 5) return "quick";
  if (minutes < 8) return "compact";
  return "normal";
}

function recordProductIds(record = {}) {
  const safe = (value) => Array.isArray(value) ? value : [];
  return [
    ...safe(record.selection),
    ...safe(record.carrySelection),
    ...safe(record.carriedSelection),
  ].filter((entry) => entry && typeof entry === "object")
    .map((entry) => String(entry.productId || ""))
    .filter(Boolean);
}

function recentProductCount(history = [], productId, count = 4) {
  return (Array.isArray(history) ? history : []).slice(-count)
    .flatMap(recordProductIds)
    .filter((id) => id === String(productId || ""))
    .length;
}

function recentCaffeine(history = [], count = 3) {
  return round1((Array.isArray(history) ? history : []).slice(-count)
    .reduce((sum, record) => sum + Number(summaryFromRecord(record).caffeineMg || 0), 0));
}

function choice(productId, portionId, timing = "") {
  return { productId, portionId: String(portionId), ...(timing ? { timing } : {}) };
}

function quickSuggestion(history, mode, gelPriority = PIT_CREW_DEFAULT_GEL_PRIORITY) {
  const gel = choice(preferredGel(history, gelPriority), "1");
  return {
    selection: [choice("isostar", "300"), gel],
    why: mode === "go"
      ? "Start sichern: keine feste Nahrung erzwingen. Isostar + Gel mit auf die Runde."
      : "Wenig Pit-Zeit: kompakte, portable Kohlenhydrate statt großer Portion.",
  };
}

const STABLE_FUEL_OPTIONS = [
  {
    key: "banana",
    selection: [choice("banana", "whole", "now"), choice("haribo", "10g", "now"), choice("isostar", "500", "carry")],
    why: "Alles stabil: echte Nahrung plus kleiner KH-Baustein und Hydrate & Perform Orange für die Runde.",
  },
  {
    key: "milk-roll",
    selection: [choice("milk-roll", "1", "now"), choice("haribo", "10g", "now"), choice("isostar-long", "500", "carry")],
    why: "Alles stabil: feste Kohlenhydrate plus kleiner KH-Baustein und Long Energy Zitrone als Getränke-Rotation.",
  },
  {
    key: "fusilli",
    selection: [choice("fusilli", "100", "now"), choice("salt-sticks", "10g", "now"), choice("isostar", "500", "carry")],
    why: "Herzhafte Abwechslung im Pit plus ausreichend Kohlenhydrate und Hydrate & Perform Orange.",
  },
  {
    key: "226ers-high",
    selection: [choice("haribo", "20g", "now"), choice("226ers-high", "1", "carry"), choice("water", "500", "carry")],
    why: "Gezielte Gel-Rotation: 226ERS Neutral liefert 50 g KH, Wasser hält Geschmack und Flüssigkeit getrennt steuerbar.",
  },
  {
    key: "banana-long",
    selection: [choice("banana", "whole", "now"), choice("haribo", "10g", "now"), choice("isostar-long", "500", "carry")],
    why: "Echte Nahrung plus Long Energy Zitrone: Getränkegeschmack bewusst rotieren, ohne die KH-Zufuhr zu verlieren.",
  },
  {
    key: "milk-roll-orange",
    selection: [choice("milk-roll", "1", "now"), choice("haribo", "10g", "now"), choice("isostar", "500", "carry")],
    why: "Feste Kohlenhydrate plus Hydrate & Perform Orange: bewährte Kombination nach der Getränke-Rotation.",
  },
  {
    key: "226ers-high-strawberry",
    selection: [choice("banana", "half", "now"), choice("226ers-high-strawberry", "1", "carry"), choice("water", "500", "carry")],
    why: "Gel-Rotation mit Salty Strawberry: 50 g KH plus 250 mg Natrium; Wasser separat dazu, damit die Runde nicht nur süß bleibt.",
  },
  {
    key: "fusilli-long",
    selection: [choice("fusilli", "100", "now"), choice("salt-sticks", "10g", "now"), choice("isostar-long", "500", "carry")],
    why: "Herzhafte Abwechslung plus Long Energy Zitrone als zweite Getränkeoption.",
  },
];

function stableSuggestion(round = 1, history = []) {
  const startIndex = Math.max(0, (Math.max(1, Number(round || 1)) - 1) % STABLE_FUEL_OPTIONS.length);
  for (let offset = 0; offset < STABLE_FUEL_OPTIONS.length; offset += 1) {
    const candidate = STABLE_FUEL_OPTIONS[(startIndex + offset) % STABLE_FUEL_OPTIONS.length];
    const recentKey = candidate.key.startsWith("banana") ? "banana"
      : candidate.key.startsWith("milk-roll") ? "milk-roll"
        : candidate.key.startsWith("fusilli") ? "fusilli"
          : candidate.key;
    if (recentProductCount(history, recentKey, 2) === 0) return candidate;
  }
  return STABLE_FUEL_OPTIONS[startIndex];
}

function hasSelection(selection = [], productId, timing = null) {
  return selection.some((entry) => entry.productId === productId && (timing == null || (entry.timing || "now") === timing));
}

function addUnique(selection = [], entry) {
  if (!entry || hasSelection(selection, entry.productId, entry.timing || "now")) return selection;
  return [...selection, entry];
}

function isIsostarDrink(productId = "") {
  return ["isostar", "isostar-long"].includes(String(productId));
}

function preferredGel(history = [], gelPriority = PIT_CREW_DEFAULT_GEL_PRIORITY) {
  const priorities = normalizeGelPriority(gelPriority);
  const ranked = priorities.map((productId, index) => ({
    productId,
    index,
    recent: recentProductCount(history, productId, 4),
  })).sort((left, right) => {
    const leftScore = left.index * 3 + left.recent * 2;
    const rightScore = right.index * 3 + right.recent * 2;
    return leftScore - rightScore;
  });
  return ranked[0]?.productId || "226ers-high";
}

function secondPreferredGel(history = [], gelPriority = PIT_CREW_DEFAULT_GEL_PRIORITY, firstId = "", currentCarbs = 0) {
  const priorities = normalizeGelPriority(gelPriority).filter((id) => id !== firstId);
  const fitting = priorities.find((id) => {
    const product = pitProduct(id);
    const carbs = Number(product?.portions?.[0]?.carbs || 0);
    return carbs > 0 && Number(currentCarbs || 0) + carbs <= PIT_CARB_TARGET.max;
  });
  return fitting || preferredGel(history, priorities);
}

function normalSuggestion({ round = 1, history = [], flags = [], weather = [], gelPriority = PIT_CREW_DEFAULT_GEL_PRIORITY } = {}) {
  const athlete = new Set(flags || []);
  const conditions = new Set(weather || []);
  const caffeineLast3 = recentCaffeine(history, 3);
  let recommendation = stableSuggestion(round, history);

  // Athlete feedback changes only the dimension it actually describes. Food/appetite
  // signals may replace the solid fuel; thirst/temperature must not randomly reshuffle it.
  if (athlete.has("stomach")) {
    recommendation = {
      selection: [choice("water", "200", "now"), choice("isostar", "400", "carry"), choice(preferredGel(history, gelPriority), "1", "carry")],
      why: "Magen gemeldet: im Pit erst neutral trinken, für die Runde nur bewährte, einfache Versorgung mitgeben.",
    };
  } else if (athlete.has("no-salty")) {
    recommendation = {
      selection: [choice("banana", "whole", "now"), choice("isostar", "500", "carry")],
      why: "Aktuell kein Appetit auf Salziges: herzhafte Snacks rausnehmen, KH und Flüssigkeit neutral weiterdecken.",
    };
  } else if (athlete.has("sweet-fatigue")) {
    const savoryRefresh = recentProductCount(history, "cucumber", 2) > 0
      ? choice("salt-sticks", "10g", "now")
      : choice("cucumber", "50", "now");
    recommendation = {
      selection: [savoryRefresh, choice("broth", "150", "now"), choice("dryll", "150", "carry")],
      why: "Süß satt: im Pit neutral/herzhaft rotieren und für die Runde eine weniger süße Elektrolyt-Option mitgeben.",
    };
  } else if (athlete.has("wants-salty")) {
    recommendation = {
      selection: [choice("broth", "150", "now"), choice("salt-sticks", "10g", "now"), choice("dryll", "150", "carry")],
      why: "Salzig gewünscht: im Pit herzhaft anbieten und für die Runde eine passende Elektrolyt-Option mitgeben.",
    };
  } else if (athlete.has("hungry")) {
    recommendation = {
      selection: [choice("fusilli", "100", "now"), choice("isostar", "500", "carry")],
      why: "Hunger gemeldet: echte, substanzielle Nahrung im Pit; Refresh allein zählt nicht als Hunger-Lösung.",
    };
  }

  let selection = [...recommendation.selection];
  const reasons = [recommendation.why];

  if (athlete.has("tired") && caffeineLast3 < 45 && !hasSelection(selection, "cola", "now")) {
    selection = addUnique(selection, choice("cola", "150", "now"));
    reasons.push("Müdigkeit gemeldet: kleine Cola-Portion ergänzen, ohne die restliche Fuel-Auswahl neu zu würfeln.");
  }

  if (athlete.has("thirsty")) {
    selection = addUnique(selection, choice("water", "200", "now"));
    if (!hasSelection(selection, "dryll", "carry") && !hasSelection(selection, "isostar", "carry")) selection = addUnique(selection, choice("isostar", "500", "carry"));
    reasons.push("Durst gemeldet: sofort Flüssigkeit anbieten; die feste Nahrung bleibt nach der normalen Rotation bestehen.");
  }

  if ((athlete.has("too-warm") || conditions.has("hot")) && !athlete.has("stomach")) {
    selection = addUnique(selection, choice("water", "200", "now"));
    if (!hasSelection(selection, "dryll", "carry") && !hasSelection(selection, "isostar", "carry")) selection = addUnique(selection, choice("isostar", "500", "carry"));
    const cucumberRecently = recentProductCount(history, "cucumber", 2) > 0;
    const allowRefresh = Math.max(1, Number(round || 1)) % 3 === 0 && !cucumberRecently;
    if (allowRefresh) selection = addUnique(selection, choice("cucumber", "50", "now"));
    reasons.push(allowRefresh
      ? "Warm: Flüssigkeit priorisieren; Gurke nur als gelegentlicher Refresh, nicht als wiederkehrende Fuel-Hauptkomponente."
      : "Warm: Flüssigkeit priorisieren; die feste Nahrung rotiert unabhängig vom Wetter weiter.");
  }

  if ((athlete.has("too-cold") || conditions.has("cold")) && !athlete.has("stomach")) {
    selection = addUnique(selection, choice("broth", "150", "now"));
    reasons.push("Kühl: warmes Getränk ergänzen, ohne die übrige Fuel-Rotation unnötig zu verändern.");
  }

  if (athlete.has("iso-fatigue") && !athlete.has("stomach")) {
    selection = selection.filter((entry) => !isIsostarDrink(entry.productId));
    if (!hasSelection(selection, "waldmeister", "carry")) selection = addUnique(selection, choice("waldmeister", athlete.has("liquid-only") ? "400" : "500", "carry"));
    const hasGel = selection.some((entry) => ["maurten100", "sis-beta", "226ers-high", "226ers-high-strawberry"].includes(entry.productId));
    const currentCarbs = summarizePitSelection(selection).carbs;
    if (!hasGel && currentCarbs < PIT_CARB_TARGET.min) selection = addUnique(selection, choice(preferredGel(history, gelPriority), "1", "carry"));
    reasons.push("Iso satt: Isostar pausieren. Waldmeister ist als grob geschätzte Carb-Drink-Alternative hinterlegt; fehlende KH kommen bei Bedarf über ein bevorzugtes Gel.");
  }

  if (athlete.has("liquid-only")) {
    const liquidIds = new Set(["water", "isostar", "isostar-long", "waldmeister", "dryll", "cola", "redbull", "broth", "maurten100", "sis-beta", "226ers-high", "226ers-high-strawberry"]);
    selection = selection.filter((entry) => liquidIds.has(String(entry.productId)));
    if (athlete.has("iso-fatigue")) {
      selection = selection.filter((entry) => !isIsostarDrink(entry.productId));
      if (!hasSelection(selection, "waldmeister", "carry")) selection = addUnique(selection, choice("waldmeister", "400", "carry"));
    }
    const gelIds = new Set(["maurten100", "sis-beta", "226ers-high", "226ers-high-strawberry"]);
    let gels = selection.filter((entry) => gelIds.has(String(entry.productId)));
    if (!gels.length) {
      const firstGel = preferredGel(history, gelPriority);
      selection = addUnique(selection, choice(firstGel, "1", "carry"));
      gels = selection.filter((entry) => gelIds.has(String(entry.productId)));
    }
    const currentCarbs = summarizePitSelection(selection).carbs;
    if (currentCarbs < PIT_CARB_TARGET.min) {
      const firstGel = gels[0]?.productId || preferredGel(history, gelPriority);
      const secondGel = secondPreferredGel(history, gelPriority, firstGel, currentCarbs);
      selection = addUnique(selection, choice(secondGel, "1", "carry"));
    }
    reasons.push(athlete.has("iso-fatigue")
      ? "Nur flüssig + Iso satt: feste Nahrung und Isostar bleiben draußen; Waldmeister liefert grob geschätzte flüssige KH, bevorzugte Gels ergänzen bis in den Zielkorridor."
      : "Nur flüssig: feste Nahrung pausieren. Kohlenhydrate kommen gezielt aus bevorzugten Gels und verträglichen Getränken.");
  }

  return { selection, why: reasons.filter(Boolean).join(" ") };
}

function closestPortion(product, targetCarbs = 0) {
  const portions = (product?.portions || []).filter((portion) => !portion.hidden);
  if (!portions.length) return null;
  return [...portions].sort((left, right) => Math.abs(Number(left.carbs || 0) - targetCarbs) - Math.abs(Number(right.carbs || 0) - targetCarbs))[0];
}

function fallbackProduct(missing, products, availableIds, usedIds) {
  const desired = pitProduct(missing.productId, products) || pitProduct(missing.productId);
  const candidates = products.filter((product) => availableIds.has(String(product.id)) && !usedIds.has(String(product.id)));
  if (!candidates.length) return null;
  const sameCategory = candidates.filter((product) => product.category === desired?.category);
  const desiredTraits = new Set(desired?.traits || []);
  const ranked = (sameCategory.length ? sameCategory : candidates).map((product) => ({
    product,
    score: (product.traits || []).reduce((sum, trait) => sum + (desiredTraits.has(trait) ? 2 : 0), 0)
      + (product.category === desired?.category ? 5 : 0),
  })).sort((left, right) => right.score - left.score);
  return ranked[0]?.product || null;
}

function fitRecommendationToStock(selection, products, availableProductIds) {
  if (!Array.isArray(availableProductIds)) return { selection, adjusted: false };
  const availableIds = new Set(availableProductIds.map(String));
  const usedIds = new Set();
  let adjusted = false;
  const fitted = [];
  for (const entry of selection || []) {
    const current = pitProduct(entry.productId, products);
    if (current && availableIds.has(String(current.id)) && !usedIds.has(String(current.id))) {
      fitted.push(entry);
      usedIds.add(String(current.id));
      continue;
    }
    adjusted = true;
    const fallback = fallbackProduct(entry, products, availableIds, usedIds);
    if (!fallback) continue;
    const sourcePortion = pitPortion(entry.productId, entry.portionId, products) || pitPortion(entry.productId, entry.portionId);
    const portion = closestPortion(fallback, Number(sourcePortion?.carbs || 0));
    if (!portion) continue;
    fitted.push(choice(fallback.id, portion.id, entry.timing));
    usedIds.add(String(fallback.id));
  }
  return { selection: fitted, adjusted };
}

export function recommendPitCrew({ round = 1, minutesToStart = 10, history = [], flags = [], weather = [], products = PIT_CREW_PRODUCTS, availableProductIds = null, gelPriority = PIT_CREW_DEFAULT_GEL_PRIORITY } = {}) {
  const mode = pitTimeMode(minutesToStart);
  const recommendation = mode === "go" || mode === "quick"
    ? quickSuggestion(history, mode, gelPriority)
    : normalSuggestion({ round, history, flags, weather, gelPriority });
  const fitted = fitRecommendationToStock(recommendation.selection, products, availableProductIds);
  const summary = summarizePitSelection(fitted.selection, products);
  const why = fitted.selection.length
    ? `${recommendation.why}${fitted.adjusted ? " · An deinen Vorrat angepasst." : ""}`
    : "Im Vorrat ist aktuell keine passende Versorgung aktiviert. Vorrat öffnen und verfügbare Sachen auswählen.";
  return {
    mode,
    ...recommendation,
    selection: fitted.selection,
    why,
    summary,
  };
}

export function assessPitSelection(selection = [], history = [], { weather = [], products = PIT_CREW_PRODUCTS } = {}) {
  const summary = summarizePitSelection(selection, products);
  const rolling = rollingPitAverage(history, selection, 3, products);
  const weatherSet = new Set(weather || []);
  const fluidFloor = weatherSet.has("hot") ? 450 : weatherSet.has("cold") ? 250 : 300;

  let tone = "good";
  let headline = "Versorgung passt";
  let detail = `${summary.carbs} g KH in dieser Stunde · ${rolling.hours > 1 ? `${rolling.hours}-h-Schnitt ${rolling.carbsPerHour} g/h` : "erste erfasste Stunde"}.`;

  if (rolling.hours >= 2 && rolling.carbsPerHour < PIT_CARB_TARGET.min) {
    tone = "warn";
    headline = "KH-Trend ist unter dem Backyard-Korridor";
    detail = `${rolling.hours}-h-Schnitt ${rolling.carbsPerHour} g/h. Nicht stopfen – die nächsten Pits moderat Richtung ${PIT_CARB_TARGET.center} g/h ausrichten.`;
  } else if (summary.carbs < PIT_CARB_TARGET.min && rolling.hours >= 2 && rolling.carbsPerHour >= PIT_CARB_TARGET.min) {
    tone = "good";
    headline = "Leichtere Stunde ist im Verlauf okay";
    detail = `${summary.carbs} g jetzt, aber ${rolling.hours}-h-Schnitt ${rolling.carbsPerHour} g/h. Kein Zwangs-Nachfüllen.`;
  } else if (summary.carbs > PIT_CARB_TARGET.max) {
    tone = "warn";
    headline = "Für diese Stunde schon reichlich KH";
    detail = `${summary.carbs} g gewählt. Nichts zusätzlich erzwingen; Magen und Verlauf beobachten.`;
  } else if (summary.carbs >= PIT_CARB_TARGET.min && summary.carbs <= PIT_CARB_TARGET.max) {
    headline = "KH im Backyard-Zielkorridor";
  }

  const fluidNote = summary.fluidMl < fluidFloor
    ? ` Flüssigkeit aktuell ${summary.fluidMl} ml – für die Bedingungen eher wenig.`
    : "";

  return { tone, headline, detail: `${detail}${fluidNote}`, summary, rolling };
}


export function pitMetricStatus(summary = {}, rolling = {}, { weather = [] } = {}) {
  const weatherSet = new Set(weather || []);
  const carbs = Number(summary.carbs || 0);
  const fluidMl = Number(summary.fluidMl || 0);
  const rollingCarbs = Number(rolling.carbsPerHour || 0);
  const rollingHours = Number(rolling.hours || 0);
  const fluidFloor = weatherSet.has("hot") ? 450 : weatherSet.has("cold") ? 250 : 300;
  const fluidCeiling = weatherSet.has("hot") ? 950 : weatherSet.has("cold") ? 700 : 800;

  let carbsTone = "good";
  if (carbs < PIT_CARB_TARGET.min && (!rollingHours || rollingCarbs < PIT_CARB_TARGET.min)) carbsTone = "low";
  if (carbs > PIT_CARB_TARGET.max && (!rollingHours || rollingCarbs > PIT_CARB_TARGET.max)) carbsTone = "high";

  let rollingTone = rollingHours ? "good" : "neutral";
  if (rollingHours && rollingCarbs < PIT_CARB_TARGET.min) rollingTone = "low";
  if (rollingHours && rollingCarbs > PIT_CARB_TARGET.max) rollingTone = "high";

  let fluidTone = fluidMl ? "good" : "neutral";
  if (fluidMl > 0 && fluidMl < fluidFloor) fluidTone = "low";
  if (fluidMl > fluidCeiling) fluidTone = "high";

  return {
    carbs: carbsTone,
    fluid: fluidTone,
    rolling: rollingTone,
    fluidFloor,
    fluidCeiling,
  };
}

export function pitCrewArrivalState({ started = false, currentRound = 0, arrivalRound = 0, loopMustClose = false } = {}) {
  const round = Math.max(0, Number(currentRound || 0));
  const arrived = Boolean(started && round > 0 && Number(arrivalRound || 0) === round);
  return {
    arrived,
    awaitingArrival: Boolean(started && round > 0 && !arrived),
    loopReadyToClose: Boolean(loopMustClose && arrived),
  };
}

export function pitCountdownLabel(minutesToStart) {
  const totalSeconds = Math.max(0, Math.floor(Number(minutesToStart || 0) * 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function pitCrewRaceEligible(profile = {}) {
  const mode = String(profile.loopMode || "").toLowerCase();
  const name = String(profile.name || "").toLowerCase();
  return profile.format === "loop" && (mode === "fixed_interval" || /backyard/.test(name));
}


export function pitCrewPlanningHours(race = {}) {
  const explicit = Number(race?.planningHorizonHours || 0);
  if (String(race?.eventLimitMode || "") === "open" && explicit > 0) return Math.max(1, explicit);
  const limitMinutes = Number(race?.eventTimeLimitMinutes || 0);
  if (limitMinutes > 0) return Math.max(1, Math.ceil(limitMinutes / 60));
  return explicit > 0 ? Math.max(1, explicit) : 24;
}

export function buildPitCrewStartStock(race = {}, gelPriority = PIT_CREW_DEFAULT_GEL_PRIORITY) {
  const hours = pitCrewPlanningHours(race);
  const reserveFactor = 1.15;
  const targetCarbs = Math.round(PIT_CARB_TARGET.center * hours * reserveFactor);
  const gels = normalizeGelPriority(gelPriority);
  const gelQuantities = [0.22, 0.18, 0.13, 0.08].map((rate) => Math.max(2, Math.ceil(hours * rate)));
  const gelItems = gels.map((id, index) => {
    const product = pitProduct(id);
    return { id, label: product?.label || id, icon: product?.icon || "⚡", quantity: gelQuantities[index] || 2, unit: "Gels", priority: index + 1 };
  });
  const isostarPortions = Math.max(6, Math.ceil(hours * 0.28));
  const isostarPowderG = isostarPortions * 40;
  const isostarPackage = isostarPowderG <= 800
    ? { quantity: Math.ceil(isostarPowderG / 400), unit: isostarPowderG <= 400 ? "400-g-Dose" : "400-g-Dosen", label: "400 g Dose" }
    : { quantity: Math.ceil(isostarPowderG / 1500), unit: "1,5-kg-Packung", label: "1,5 kg Packung" };
  const longEnergyPortions = Math.max(5, Math.ceil(hours * 0.25));
  const longEnergyPowderG = longEnergyPortions * 38;
  const longEnergyPackages = Math.max(1, Math.ceil(longEnergyPowderG / 570));
  const waldmeisterMixes = Math.max(4, Math.ceil(hours * 0.18));
  const waldmeisterSyrupMlPer500 = (45 / 72.9) * 100;
  const waldmeisterSyrupMl = Math.ceil(waldmeisterMixes * waldmeisterSyrupMlPer500);
  const waldmeisterBottles = Math.max(1, Math.ceil(waldmeisterSyrupMl / 500));
  const dryllCans = Math.max(4, Math.ceil(hours / 4));
  const redBullCans = Math.max(3, Math.ceil(hours / 8));
  const items = [
    { id: "water", label: "Wasser gesamt", icon: "💧", quantity: Math.max(12, Math.ceil(hours * 0.65)), unit: "l", category: "drink" },
    { id: "isostar", label: "Hydrate & Perform Orange", icon: "🧃", quantity: isostarPackage.quantity, unit: isostarPackage.unit, category: "drink", note: `${isostarPackage.quantity === 1 ? isostarPackage.label : isostarPackage.label.replace("Dose", "Dosen").replace("Packung", "Packungen")} = ${isostarPackage.quantity} ausreichend · ${isostarPortions} × 500 ml = ${isostarPowderG} g Pulver` },
    { id: "isostar-long", label: "Long Energy Plus Zitrone", icon: "🍋", quantity: longEnergyPackages, unit: longEnergyPackages === 1 ? "570-g-Dose" : "570-g-Dosen", category: "drink", note: `570 g ${longEnergyPackages === 1 ? "Dose" : "Dosen"} = ${longEnergyPackages} ausreichend · ${longEnergyPortions} × 500 ml = ${longEnergyPowderG} g Pulver` },
    { id: "waldmeister", label: "Waldmeister · nach Gefühl", icon: "🌿", quantity: waldmeisterBottles, unit: waldmeisterBottles === 1 ? "0,5-l-Flasche" : "0,5-l-Flaschen", category: "drink", note: `0,5 l ${waldmeisterBottles === 1 ? "Flasche" : "Flaschen"} = ${waldmeisterBottles} ausreichend · ${waldmeisterMixes} × 500 ml Race-Mix ≈ ${waldmeisterSyrupMl} ml Sirup` },
    { id: "dryll", label: "DRYLL Salty Peach", icon: "🍑", quantity: dryllCans, unit: "Dosen à 330 ml", category: "drink", note: `${round1(dryllCans * 0.33, 2)} l Gesamtmenge · Elektrolyt-/Salz-Reserve` },
    { id: "redbull", label: "Red Bull", icon: "⚡", quantity: redBullCans, unit: "Dosen à 250 ml", category: "drink", note: `${redBullCans * 80} mg Koffein gesamt, falls alle genutzt · Reserve, kein Trinkziel` },
    ...gelItems.map((item) => ({ ...item, category: "gel" })),
    { id: "banana", label: "Bananen", icon: "🍌", quantity: Math.max(4, Math.ceil(hours * 0.2)), unit: "Stück", category: "food" },
    { id: "milk-roll", label: "Milchbrötchen", icon: "🥛", quantity: Math.max(5, Math.ceil(hours * 0.25)), unit: "Stück", category: "food" },
    { id: "fusilli", label: "Fusilli / Nudeln", icon: "🍝", quantity: Math.max(4, Math.ceil(hours * 0.18)), unit: "kleine Portionen", category: "food" },
    { id: "salt-sticks", label: "Salzstangen / Brezeln", icon: "🥨", quantity: Math.max(2, Math.ceil(hours / 18)), unit: "Packungen", category: "food" },
    { id: "broth", label: "Brühe", icon: "☕", quantity: Math.max(6, Math.ceil(hours * 0.25)), unit: "Tassen", category: "food" },
    { id: "cucumber", label: "Gurke", icon: "🥒", quantity: Math.max(2, Math.ceil(hours / 24)), unit: "Stück", category: "food" },
    { id: "cola", label: "Cola", icon: "🥤", quantity: Math.max(2, Math.ceil(hours * 0.07)), unit: "l", category: "drink" },
    { id: "haribo", label: "Haribo Roulette", icon: "🍬", quantity: Math.max(2, Math.ceil(hours / 15)), unit: "Packungen à 6 Rollen", category: "food", note: `${Math.max(2, Math.ceil(hours / 15)) * 6} Rollen gesamt · 150 g / Packung · 1 Rolle = 25 g ≈ 19,3 g KH` },
  ];
  return { hours, reservePercent: 15, targetCarbs, items };
}
