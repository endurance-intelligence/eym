const round1 = (value, digits = 1) => Number(Number(value || 0).toFixed(digits));
const formatLiters = (value) => Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

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
    packageMl: 330,
    stockNote: "330-ml-Dose · Vorrat und Einkauf in Dosen führen",
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
    id: "226ers-high-cherry-caf",
    label: "226ERS High Energy Cherry + 2× Caffeine",
    brand: "226ERS",
    flavor: "Kirsche (Cherry)",
    icon: "⚡",
    category: "gel",
    traits: ["sweet", "quick", "portable", "caffeine", "high-caffeine"],
    nutritionSource: "label",
    packageG: 76,
    manualOnly: true,
    stockNote: "76-g-Beutel · 50 g KH · 160 mg Koffein · 0,1 g Salz · gezielter Joker, keine Auto-Rotation",
    portions: [{ id: "1", label: "1 Gel · 76 g", carbs: 50, fluidMl: 0, caffeineMg: 160, saltG: 0.1 }],
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
    label: "Ibis Milchbrötchen",
    icon: "🥛",
    category: "food",
    traits: ["real-food", "soft", "sweet"],
    nutritionSource: "label",
    packageG: 480,
    piecesPerPackage: 12,
    pieceG: 40,
    stockNote: "480-g-Packung = 12 Stück à 40 g",
    portions: [{ id: "1", label: "1 Stück · 40 g", carbs: 21.4, fluidMl: 0, caffeineMg: 0 }],
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
    traits: ["sweet", "quick", "portable"],
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
    label: "Hengstenberg KNAX Gewürzgurken",
    icon: "🥒",
    category: "refresh",
    traits: ["savory", "salty", "refresh"],
    nutritionSource: "label",
    stockNote: "670-ml-Glas · 360 g Abtropfgewicht",
    portions: [
      { id: "50", label: "50 g Gewürzgurken", carbs: 2, fluidMl: 0, caffeineMg: 0 },
      { id: "100", label: "100 g Gewürzgurken", carbs: 4, fluidMl: 0, caffeineMg: 0 },
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
    ...safe(record.plannedSelection),
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

function firstLoopSuggestion() {
  return {
    selection: [choice("isostar", "500", "carry")],
    why: "Start-Loop: Frühstück ist die Energiebasis. Vor Loop 1 keine feste Nahrung erzwingen; Hydrate & Perform liefert Flüssigkeit und einen kleinen KH-Puffer für die Runde.",
  };
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
    key: "banana-orange",
    selection: [choice("banana", "whole", "now"), choice("haribo", "10g", "carry"), choice("isostar", "500", "carry")],
    why: "Banane im Pit, den kleinen Haribo-Baustein bewusst erst auf der Runde. So bleiben Geschmack und Textur getrennt, Hydrate & Perform deckt die Flüssigkeit.",
  },
  {
    key: "milk-roll-long",
    selection: [choice("milk-roll", "1", "now"), choice("haribo", "10g", "carry"), choice("isostar-long", "500", "carry")],
    why: "Milchbrötchen im Pit; Haribo erst auf der Runde. Long Energy Zitrone rotiert den Getränkegeschmack, ohne mehrere süße feste Sachen gleichzeitig zu stapeln.",
  },
  {
    key: "fusilli-orange",
    selection: [choice("fusilli", "100", "now"), choice("salt-sticks", "10g", "now"), choice("isostar", "500", "carry")],
    why: "Herzhafter Pit mit Fusilli und kleiner Salzkomponente; Hydrate & Perform kommt getrennt auf die Runde.",
  },
  {
    key: "neutral-gel",
    selection: [choice("milk-roll", "1", "now"), choice("226ers-high", "1", "carry"), choice("water", "500", "carry")],
    why: "Im Pit eine einfache feste Basis, auf der Runde 226ERS Neutral plus Wasser. Geschmack und Konsistenz werden bewusst getrennt.",
  },
  {
    key: "banana-long",
    selection: [choice("banana", "whole", "now"), choice("haribo", "10g", "carry"), choice("isostar-long", "500", "carry")],
    why: "Banane im Pit und Long Energy für die Runde; der kleine Haribo-Baustein bleibt unterwegs statt gleichzeitig mit der Banane gegessen zu werden.",
  },
  {
    key: "milk-roll-orange",
    selection: [choice("milk-roll", "1", "now"), choice("haribo", "10g", "carry"), choice("isostar", "500", "carry")],
    why: "Milchbrötchen im Pit, Hydrate & Perform auf der Runde. Haribo dient nur als getrennte portable Ergänzung und nicht als zweites süßes Pit-Food.",
  },
  {
    key: "salty-strawberry",
    selection: [choice("banana", "half", "now"), choice("226ers-high-strawberry", "1", "carry"), choice("water", "500", "carry")],
    why: "Kleine Banane im Pit; Salty Strawberry und Wasser kommen auf die Runde. Das hält feste Nahrung und Gel geschmacklich auseinander.",
  },
  {
    key: "fusilli-long",
    selection: [choice("fusilli", "100", "now"), choice("salt-sticks", "10g", "now"), choice("isostar-long", "500", "carry")],
    why: "Herzhafte Pit-Rotation mit Fusilli und Salzstangen; Long Energy Zitrone liefert die Runde separat.",
  },
];

const PIT_PAIRING_AVOID_SAME_PIT = new Set([
  "banana|cucumber",
  "banana|haribo",
  "cucumber|haribo",
  "cucumber|milk-roll",
  "haribo|milk-roll",
]);

function pairingKey(leftId, rightId) {
  return [String(leftId || ""), String(rightId || "")].sort().join("|");
}

export function pitCrewPairingAssessment(selection = []) {
  const now = (Array.isArray(selection) ? selection : []).filter((entry) => (entry?.timing || "now") === "now");
  const conflicts = [];
  for (let left = 0; left < now.length; left += 1) {
    for (let right = left + 1; right < now.length; right += 1) {
      if (PIT_PAIRING_AVOID_SAME_PIT.has(pairingKey(now[left]?.productId, now[right]?.productId))) {
        conflicts.push([String(now[left]?.productId || ""), String(now[right]?.productId || "")]);
      }
    }
  }
  return { good: conflicts.length === 0, conflicts };
}

function rotationScore(candidate, history = []) {
  const ids = [...new Set((candidate.selection || []).map((entry) => String(entry.productId || "")).filter(Boolean))];
  const repeatPenalty = ids.reduce((sum, id) => sum + recentProductCount(history, id, 2) * (id === "haribo" ? 6 : 3), 0);
  const pairingPenalty = pitCrewPairingAssessment(candidate.selection).conflicts.length * 20;
  return repeatPenalty + pairingPenalty;
}

function stableSuggestion(round = 1, history = []) {
  const startIndex = Math.max(0, (Math.max(1, Number(round || 1)) - 1) % STABLE_FUEL_OPTIONS.length);
  const ranked = STABLE_FUEL_OPTIONS.map((candidate, index) => ({
    candidate,
    order: (index - startIndex + STABLE_FUEL_OPTIONS.length) % STABLE_FUEL_OPTIONS.length,
    score: rotationScore(candidate, history),
  })).sort((left, right) => left.score - right.score || left.order - right.order);
  return ranked[0]?.candidate || STABLE_FUEL_OPTIONS[startIndex];
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

  if (athlete.has("tired") && caffeineLast3 < 45) {
    reasons.push("Müdigkeit gemeldet: Koffein nicht automatisch einplanen. Die Crew entscheidet bewusst für diese Runde zwischen Gel oder Getränk.");
  } else if (athlete.has("tired")) {
    reasons.push(`Müdigkeit gemeldet: in den letzten 3 bestätigten Stunden wurden bereits ${caffeineLast3} mg Koffein erfasst. Kein weiteres Koffein automatisch ergänzen.`);
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
    const sweetPitFood = selection.some((entry) => (entry.timing || "now") === "now" && ["banana", "milk-roll", "haribo"].includes(String(entry.productId)));
    const allowRefresh = Math.max(1, Number(round || 1)) % 3 === 0 && !cucumberRecently && !sweetPitFood;
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
  const candidates = products.filter((product) => availableIds.has(String(product.id)) && !usedIds.has(String(product.id)) && !product.manualOnly);
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

function sanitizeRecommendationPairing(selection = []) {
  let adjusted = false;
  let next = (Array.isArray(selection) ? selection : []).map((entry) => ({ ...entry }));
  const nowIds = () => new Set(next.filter((entry) => (entry.timing || "now") === "now").map((entry) => String(entry.productId)));
  let ids = nowIds();

  if (ids.has("haribo") && (ids.has("banana") || ids.has("milk-roll"))) {
    next = next.map((entry) => String(entry.productId) === "haribo" && (entry.timing || "now") === "now" ? { ...entry, timing: "carry" } : entry);
    adjusted = true;
    ids = nowIds();
  }
  if (ids.has("cucumber") && (ids.has("banana") || ids.has("milk-roll") || ids.has("haribo"))) {
    next = next.filter((entry) => !(String(entry.productId) === "cucumber" && (entry.timing || "now") === "now"));
    adjusted = true;
  }
  return { selection: next, adjusted };
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
  const isFreshStartLoop = Math.max(1, Number(round || 1)) === 1 && !(Array.isArray(history) && history.length);
  const recommendation = isFreshStartLoop
    ? firstLoopSuggestion()
    : mode === "go" || mode === "quick"
      ? quickSuggestion(history, mode, gelPriority)
      : normalSuggestion({ round, history, flags, weather, gelPriority });
  const fitted = fitRecommendationToStock(recommendation.selection, products, availableProductIds);
  const paired = sanitizeRecommendationPairing(fitted.selection);
  const summary = summarizePitSelection(paired.selection, products);
  const why = paired.selection.length
    ? `${recommendation.why}${fitted.adjusted ? " · An deinen Vorrat angepasst." : ""}${paired.adjusted ? " · Geschmacklich ungünstige Pit-Kombination getrennt." : ""}`
    : "Im Vorrat ist aktuell keine passende Versorgung aktiviert. Vorrat öffnen und verfügbare Sachen auswählen.";
  return {
    mode,
    ...recommendation,
    selection: paired.selection,
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
  const colaLiters = Math.max(2, Math.ceil(hours * 0.07));
  const colaCans = Math.max(1, Math.ceil((colaLiters * 1000) / 330));
  const milkRollPieces = Math.max(5, Math.ceil(hours * 0.25));
  const milkRollPackages = Math.max(1, Math.ceil(milkRollPieces / 12));
  const items = [
    { id: "water", label: "Wasser gesamt", icon: "💧", quantity: Math.max(12, Math.ceil(hours * 0.65)), unit: "l", category: "drink" },
    { id: "isostar", label: "Hydrate & Perform Orange", icon: "🧃", quantity: isostarPackage.quantity, unit: isostarPackage.unit, category: "drink", note: `${isostarPackage.quantity === 1 ? isostarPackage.label : isostarPackage.label.replace("Dose", "Dosen").replace("Packung", "Packungen")} = ${isostarPackage.quantity} ausreichend · ${isostarPortions} × 500 ml = ${isostarPowderG} g Pulver` },
    { id: "isostar-long", label: "Long Energy Plus Zitrone", icon: "🍋", quantity: longEnergyPackages, unit: longEnergyPackages === 1 ? "570-g-Dose" : "570-g-Dosen", category: "drink", note: `570 g ${longEnergyPackages === 1 ? "Dose" : "Dosen"} = ${longEnergyPackages} ausreichend · ${longEnergyPortions} × 500 ml = ${longEnergyPowderG} g Pulver` },
    { id: "waldmeister", label: "Waldmeister · nach Gefühl", icon: "🌿", quantity: waldmeisterBottles, unit: waldmeisterBottles === 1 ? "0,5-l-Flasche" : "0,5-l-Flaschen", category: "drink", note: `0,5 l ${waldmeisterBottles === 1 ? "Flasche" : "Flaschen"} = ${waldmeisterBottles} ausreichend · ${waldmeisterMixes} × 500 ml Race-Mix ≈ ${waldmeisterSyrupMl} ml Sirup` },
    { id: "dryll", label: "DRYLL Salty Peach", icon: "🍑", quantity: dryllCans, unit: "Dosen à 330 ml", category: "drink", note: `${round1(dryllCans * 0.33, 2)} l Gesamtmenge · Elektrolyt-/Salz-Reserve` },
    { id: "redbull", label: "Red Bull", icon: "⚡", quantity: redBullCans, unit: "Dosen à 250 ml", category: "drink", note: `${redBullCans * 80} mg Koffein gesamt, falls alle genutzt · Reserve, kein Trinkziel` },
    ...gelItems.map((item) => ({ ...item, category: "gel" })),
    { id: "226ers-high-cherry-caf", label: "226ERS High Energy Cherry + 2× Caffeine", icon: "⚡", quantity: 2, unit: "Gels", category: "gel", note: "2 Stück · je 50 g KH + 160 mg Koffein · gezielter Joker, keine Auto-Rotation" },
    { id: "banana", label: "Bananen", icon: "🍌", quantity: Math.max(4, Math.ceil(hours * 0.2)), unit: "Stück", category: "food" },
    { id: "milk-roll", label: "Ibis Milchbrötchen", icon: "🥛", quantity: milkRollPieces, unit: "Stück", category: "food", note: `${milkRollPieces} Stück empfohlen · 480-g-Packung = 12 Stück à 40 g · ${milkRollPackages} ${milkRollPackages === 1 ? "Packung reicht" : "Packungen reichen"}` },
    { id: "fusilli", label: "Fusilli / Nudeln", icon: "🍝", quantity: Math.max(4, Math.ceil(hours * 0.18)), unit: "kleine Portionen", category: "food" },
    { id: "salt-sticks", label: "Salzstangen / Brezeln", icon: "🥨", quantity: Math.max(2, Math.ceil(hours / 18)), unit: "Packungen", category: "food" },
    { id: "broth", label: "Brühe", icon: "☕", quantity: Math.max(6, Math.ceil(hours * 0.25)), unit: "Tassen", category: "food" },
    { id: "cucumber", label: "Hengstenberg KNAX Gewürzgurken", icon: "🥒", quantity: Math.max(1, Math.ceil(hours / 24)), unit: "Glas à 360 g Abtropfgewicht", category: "food", note: "670 ml Nettofüllmenge · 360 g Abtropfgewicht · ca. 7 × 50-g-Portionen pro Glas" },
    { id: "cola", label: "Cola", icon: "🥤", quantity: colaCans, unit: "Dosen à 330 ml", category: "drink", note: `${formatLiters(colaCans * 0.33)} l Gesamtmenge · Einkauf und Vorrat direkt in Dosen` },
    { id: "haribo", label: "Haribo Roulette", icon: "🍬", quantity: Math.max(2, Math.ceil(hours / 15)), unit: "Packungen à 6 Rollen", category: "food", note: `${Math.max(2, Math.ceil(hours / 15)) * 6} Rollen gesamt · 150 g / Packung · 1 Rolle = 25 g ≈ 19,3 g KH` },
  ];
  return { hours, reservePercent: 15, targetCarbs, items };
}

export function buildPitCrewPackingList(race = {}) {
  const hours = pitCrewPlanningHours(race);
  const shirts = Math.max(4, Math.ceil(hours / 6));
  const shorts = Math.max(3, Math.ceil(hours / 12) + 1);
  const underwear = Math.max(4, Math.ceil(hours / 6));
  const socks = Math.max(8, Math.ceil(hours / 3));
  const footTowels = Math.max(3, Math.ceil(hours / 8));

  return [
    { id: "clothing", label: "Kleidung", items: [
      { id: "run-shirts", label: "Laufshirts", quantity: shirts, unit: "Stück" },
      { id: "run-shorts", label: "Laufhosen", quantity: shorts, unit: "Stück" },
      { id: "underwear", label: "Unterwäsche", quantity: underwear, unit: "Stück" },
      { id: "run-socks", label: "Laufsocken", quantity: socks, unit: "Paar" },
      { id: "longsleeves", label: "Longsleeves", quantity: 2, unit: "Stück" },
      { id: "warm-layers", label: "Warme Midlayer", quantity: 2, unit: "Stück" },
      { id: "rain-jacket", label: "Regenjacke", quantity: 1, unit: "Stück" },
      { id: "pit-jacket", label: "Warme Jacke für den Pit", quantity: 1, unit: "Stück" },
      { id: "cap", label: "Cap", quantity: 1, unit: "Stück" },
      { id: "beanie", label: "Mütze", quantity: 1, unit: "Stück" },
      { id: "buff", label: "Buff", quantity: 2, unit: "Stück" },
      { id: "gloves", label: "Handschuhe", quantity: 1, unit: "Paar" },
    ] },
    { id: "feet", label: "Schuhe & Füße", items: [
      { id: "running-shoes", label: "Eingelaufene Laufschuhe", quantity: 3, unit: "Paar" },
      { id: "wet-shoes", label: "Regen-/Nässe-Schuhoption", quantity: 1, unit: "Paar" },
      { id: "insoles", label: "Ersatz-Einlegesohlen", quantity: 1, unit: "Paar" },
      { id: "blister-kit", label: "Blasenpflaster", quantity: 1, unit: "Packung" },
      { id: "tape", label: "Tape", quantity: 2, unit: "Rollen" },
      { id: "anti-chafe", label: "Anti-Chafing / Vaseline", quantity: 1, unit: "Stück" },
      { id: "foot-towels", label: "Kleine Handtücher für Füße", quantity: footTowels, unit: "Stück" },
    ] },
    { id: "tech", label: "Technik", items: [
      { id: "garmin", label: "Garmin", quantity: 1, unit: "Stück" },
      { id: "garmin-cable", label: "Garmin-Ladekabel", quantity: 1, unit: "Stück" },
      { id: "phone", label: "Handy", quantity: 1, unit: "Stück" },
      { id: "phone-cable", label: "Handy-Ladekabel", quantity: 2, unit: "Stück" },
      { id: "powerbanks", label: "Powerbanks", quantity: 2, unit: "Stück" },
      { id: "headlamps", label: "Stirnlampen", quantity: 2, unit: "Stück" },
      { id: "lamp-spares", label: "Ersatzakkus / Lampen-Ladekabel", quantity: 1, unit: "Set" },
      { id: "extension", label: "Verlängerungskabel", quantity: 1, unit: "Stück" },
      { id: "power-strip", label: "Mehrfachsteckdose", quantity: 1, unit: "Stück" },
    ] },
    { id: "camp", label: "Camp & Pit", items: [
      { id: "pavilion", label: "Pavillon 3 × 3 m", quantity: 1, unit: "Stück" },
      { id: "sidewalls", label: "Pavillon-Seitenwände", quantity: 3, unit: "Stück" },
      { id: "groundsheet", label: "Bodenplane 3 × 3 m", quantity: 1, unit: "Stück" },
      { id: "pavilion-weights", label: "Pavillon-Gewichte / Befestigung", quantity: 4, unit: "Stück" },
      { id: "camp-bed", label: "Feldbett", quantity: 1, unit: "Stück" },
      { id: "chair", label: "Campingstuhl", quantity: 1, unit: "Stück" },
      { id: "table", label: "Tisch", quantity: 1, unit: "Stück" },
      { id: "sleeping-bag", label: "Schlafsack", quantity: 1, unit: "Stück" },
      { id: "blankets", label: "Decken", quantity: 2, unit: "Stück" },
      { id: "pillow", label: "Kissen", quantity: 1, unit: "Stück" },
      { id: "storage-boxes", label: "Boxen für Kleidung / Fuel", quantity: 4, unit: "Stück" },
      { id: "cooler", label: "Kühlbox", quantity: 1, unit: "Stück" },
    ] },
    { id: "orga", label: "Pflege & Organisation", items: [
      { id: "towels", label: "Große Handtücher", quantity: 2, unit: "Stück" },
      { id: "wet-wipes", label: "Feuchttücher", quantity: 2, unit: "Packungen" },
      { id: "paper-towels", label: "Küchenrolle", quantity: 2, unit: "Rollen" },
      { id: "toilet-paper", label: "Toilettenpapier", quantity: 2, unit: "Rollen" },
      { id: "trash-bags", label: "Müllbeutel", quantity: 10, unit: "Stück" },
      { id: "sunscreen", label: "Sonnencreme", quantity: 1, unit: "Stück" },
      { id: "lip-care", label: "Lippenpflege", quantity: 1, unit: "Stück" },
      { id: "race-bib", label: "Startnummer / Startnummernband", quantity: 1, unit: "Set" },
      { id: "wallet", label: "Ausweis / Karte / Bargeld", quantity: 1, unit: "Set" },
    ] },
  ];
}
