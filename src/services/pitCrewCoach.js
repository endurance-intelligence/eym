const round1 = (value, digits = 1) => Number(Number(value || 0).toFixed(digits));

export const PIT_CARB_TARGET = { min: 50, max: 60, center: 55 };

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
    label: "Isostar",
    icon: "🧃",
    category: "drink",
    traits: ["carb-drink", "electrolyte", "quick"],
    portions: [150, 200, 250, 300, 400, 500].map((ml) => ({ id: `${ml}`, label: `${ml} ml`, carbs: round1(ml * 0.07), fluidMl: ml, caffeineMg: 0 })),
  },
  {
    id: "dryll",
    label: "DRYLL Salty Peach",
    icon: "🍑",
    category: "drink",
    traits: ["electrolyte", "salty", "refresh", "quick"],
    portions: [100, 150, 200].map((ml) => ({ id: `${ml}`, label: `${ml} ml`, carbs: 0, fluidMl: ml, caffeineMg: 0, sodiumMg: Math.round(ml * 1.53) })),
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
    label: "226ERS High Energy",
    icon: "🟥",
    category: "gel",
    traits: ["sweet", "quick", "portable"],
    portions: [{ id: "1", label: "1 Gel", carbs: 50, fluidMl: 0, caffeineMg: 0 }],
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
    estimated: true,
    portions: [
      { id: "10g", label: "10 g", carbs: 7.7, fluidMl: 0, caffeineMg: 0 },
      { id: "20g", label: "20 g", carbs: 15.4, fluidMl: 0, caffeineMg: 0 },
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
      { id: "10g", label: "10 g", carbs: 7.5, fluidMl: 0, caffeineMg: 0 },
      { id: "20g", label: "20 g", carbs: 15, fluidMl: 0, caffeineMg: 0 },
      { id: "30g", label: "30 g", carbs: 22.5, fluidMl: 0, caffeineMg: 0 },
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
    portions: [
      { id: "100", label: "100 ml", carbs: 0, fluidMl: 100, caffeineMg: 0 },
      { id: "150", label: "150 ml", carbs: 0, fluidMl: 150, caffeineMg: 0 },
    ],
  },
];

const productMap = new Map(PIT_CREW_PRODUCTS.map((product) => [product.id, product]));

export function pitProduct(productId) {
  return productMap.get(String(productId || "")) || null;
}

export function pitPortion(productId, portionId) {
  const product = pitProduct(productId);
  if (!product) return null;
  return product.portions.find((portion) => String(portion.id) === String(portionId)) || product.portions[0] || null;
}

export function pitSelectionItem(productId, portionId) {
  const product = pitProduct(productId);
  const portion = pitPortion(productId, portionId);
  if (!product || !portion) return null;
  return {
    productId: product.id,
    portionId: portion.id,
    label: product.label,
    icon: product.icon,
    category: product.category,
    estimated: Boolean(product.estimated),
    traits: product.traits || [],
    carbs: Number(portion.carbs || 0),
    fluidMl: Number(portion.fluidMl || 0),
    caffeineMg: Number(portion.caffeineMg || 0),
    sodiumMg: Number(portion.sodiumMg || 0),
    portionLabel: portion.label,
  };
}

export function summarizePitSelection(selection = []) {
  const items = (Array.isArray(selection) ? selection : [])
    .map((entry) => pitSelectionItem(entry.productId, entry.portionId))
    .filter(Boolean);
  return {
    items,
    carbs: round1(items.reduce((sum, item) => sum + item.carbs, 0)),
    fluidMl: Math.round(items.reduce((sum, item) => sum + item.fluidMl, 0)),
    caffeineMg: round1(items.reduce((sum, item) => sum + item.caffeineMg, 0)),
    sodiumMg: Math.round(items.reduce((sum, item) => sum + item.sodiumMg, 0)),
    estimated: items.some((item) => item.estimated),
  };
}

function summaryFromRecord(record = {}) {
  if (record.summary) return record.summary;
  return summarizePitSelection(record.selection || []);
}

export function rollingPitAverage(history = [], currentSelection = null, lookback = 3) {
  const records = (Array.isArray(history) ? history : []).slice(-Math.max(0, lookback - (currentSelection ? 1 : 0)));
  const summaries = records.map(summaryFromRecord);
  if (currentSelection) summaries.push(summarizePitSelection(currentSelection));
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

function recentProductIds(history = [], count = 2) {
  return new Set((Array.isArray(history) ? history : []).slice(-count).flatMap((record) =>
    (record.selection || []).map((entry) => entry.productId),
  ));
}

function recentCaffeine(history = [], count = 3) {
  return round1((Array.isArray(history) ? history : []).slice(-count)
    .reduce((sum, record) => sum + Number(summaryFromRecord(record).caffeineMg || 0), 0));
}

function choice(productId, portionId) {
  return { productId, portionId: String(portionId) };
}

function quickSuggestion(history, mode) {
  const rolling = rollingPitAverage(history, null, 3);
  const gel = rolling.hours >= 2 && rolling.carbsPerHour > 60
    ? choice("maurten100", "1")
    : choice("sis-beta", "1");
  return {
    selection: [choice("isostar", "300"), gel],
    why: mode === "go"
      ? "Start sichern: keine feste Nahrung erzwingen. Isostar + Gel mit auf die Runde."
      : "Wenig Pit-Zeit: kompakte, portable Kohlenhydrate statt großer Portion.",
  };
}

function normalSuggestion({ round = 1, history = [], flags = [], weather = [] } = {}) {
  const active = new Set([...(flags || []), ...(weather || [])]);
  const recent = recentProductIds(history);
  const caffeineLast3 = recentCaffeine(history, 3);

  if (active.has("stomach")) {
    return {
      selection: [choice("water", "200"), choice("isostar", "200"), choice("maurten100", "1")],
      why: "Magen gemeldet: klein, einfach und ohne Nachstopfen. Verlauf danach neu bewerten.",
    };
  }

  if (active.has("sweet-fatigue") || active.has("wants-salty")) {
    return {
      selection: [choice("dryll", "150"), choice("water", "200"), choice("fusilli", "100"), choice("salt-sticks", "30g"), choice("cucumber", "50")],
      why: "Süß rausnehmen: herzhaft + Refresh. Gurke zählt dabei nicht als eigentliche KH-Quelle.",
    };
  }

  if (active.has("cold") || active.has("too-cold")) {
    return {
      selection: [choice("isostar", "300"), choice("fusilli", "100"), choice("salt-sticks", "10g"), choice("broth", "100")],
      why: "Kühl/nass: warme, herzhafte Nahrung priorisieren; KH-Budget bleibt trotzdem im Blick.",
    };
  }

  if (active.has("thirsty")) {
    return {
      selection: [choice("isostar", "400"), choice("water", "200"), choice("banana", "whole")],
      why: "Durst gemeldet: Flüssigkeit zuerst absichern, KH dabei nicht aus Versehen verlieren.",
    };
  }

  if (active.has("hungry")) {
    return {
      selection: [choice("isostar", "400"), choice("fusilli", "100")],
      why: "Hunger gemeldet: echte Nahrung statt noch eines Gels.",
    };
  }

  if (active.has("tired") && caffeineLast3 < 45) {
    return {
      selection: [choice("cola", "150"), choice("water", "200"), choice("fusilli", "100"), choice("salt-sticks", "20g")],
      why: "Müdigkeit gemeldet und zuletzt wenig Koffein: kleine Cola-Portion dynamisch eingebaut.",
    };
  }

  if (active.has("hot") || active.has("too-warm")) {
    return {
      selection: [choice("isostar", "300"), choice("water", "200"), choice("banana", "whole"), choice("cucumber", "50")],
      why: "Warm: Flüssigkeit höher priorisieren; Gurke als Refresh, KH weiter normal decken.",
    };
  }

  const cycle = Math.max(1, Number(round || 1)) % 4;
  if (cycle === 0) {
    return {
      selection: [choice("isostar", "400"), choice("fusilli", "100")],
      why: "Herzhafte Gel-Pause, ohne die Kohlenhydrate aus dem Blick zu verlieren.",
    };
  }
  if (cycle === 1 && !recent.has("banana")) {
    return {
      selection: [choice("isostar", "400"), choice("banana", "whole")],
      why: "Alles stabil: früh/normal echte Nahrung nutzen und den funktionierenden Plan nicht überoptimieren.",
    };
  }
  if (cycle === 2 && !recent.has("milk-roll")) {
    return {
      selection: [choice("isostar", "400"), choice("milk-roll", "1")],
      why: "Alles stabil: einfache feste KH und Basisgetränk, ohne Joker zu verbrennen.",
    };
  }
  return {
    selection: [choice("isostar", "200"), choice("sis-beta", "1")],
    why: "Kompakte Gel-Stunde als Abwechslung zu fester Nahrung.",
  };
}

export function recommendPitCrew({ round = 1, minutesToStart = 10, history = [], flags = [], weather = [] } = {}) {
  const mode = pitTimeMode(minutesToStart);
  const recommendation = mode === "go" || mode === "quick"
    ? quickSuggestion(history, mode)
    : normalSuggestion({ round, history, flags, weather });
  const summary = summarizePitSelection(recommendation.selection);
  return {
    mode,
    ...recommendation,
    summary,
  };
}

export function assessPitSelection(selection = [], history = [], { weather = [] } = {}) {
  const summary = summarizePitSelection(selection);
  const rolling = rollingPitAverage(history, selection, 3);
  const weatherSet = new Set(weather || []);
  const fluidFloor = weatherSet.has("hot") ? 450 : weatherSet.has("cold") ? 250 : 300;

  let tone = "good";
  let headline = "Versorgung passt";
  let detail = `${summary.carbs} g KH in dieser Stunde · ${rolling.hours > 1 ? `${rolling.hours}-h-Schnitt ${rolling.carbsPerHour} g/h` : "erste erfasste Stunde"}.`;

  if (rolling.hours >= 2 && rolling.carbsPerHour < 45) {
    tone = "warn";
    headline = "KH-Trend ist niedrig";
    detail = `${rolling.hours}-h-Schnitt ${rolling.carbsPerHour} g/h. Nicht jetzt stopfen – nächste Versorgung gezielt etwas höher planen.`;
  } else if (summary.carbs < 40 && rolling.hours >= 2 && rolling.carbsPerHour >= 48) {
    tone = "good";
    headline = "Leichte Stunde ist okay";
    detail = `${summary.carbs} g jetzt, aber ${rolling.hours}-h-Schnitt ${rolling.carbsPerHour} g/h. Kein Zwangs-Nachfüllen.`;
  } else if (summary.carbs > 75) {
    tone = "warn";
    headline = "Für diese Stunde schon reichlich KH";
    detail = `${summary.carbs} g gewählt. Nichts zusätzlich erzwingen; Magen und Verlauf beobachten.`;
  } else if (summary.carbs >= PIT_CARB_TARGET.min && summary.carbs <= 70) {
    headline = "KH im Zielbereich";
  }

  const fluidNote = summary.fluidMl < fluidFloor
    ? ` Flüssigkeit aktuell ${summary.fluidMl} ml – für die Bedingungen eher wenig.`
    : "";

  return { tone, headline, detail: `${detail}${fluidNote}`, summary, rolling };
}

export function pitCrewRaceEligible(profile = {}) {
  const mode = String(profile.loopMode || "").toLowerCase();
  const name = String(profile.name || "").toLowerCase();
  return profile.format === "loop" && (mode === "fixed_interval" || /backyard/.test(name));
}
